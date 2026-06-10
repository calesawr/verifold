import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31 } from "./qm31";
import { Step, buildTree, rootOf, makeProof, clPath, sha256 } from "./merkle";
import { encodeQm31, qm31LeafOracle } from "./commit";
import { honestDeep } from "./deep";
import { absorbQm31 } from "./transcript";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

function asBuf(x: any): Buffer {
  if (typeof x === "string") return Buffer.from(x.replace(/^0x/, ""), "hex");
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (Buffer.isBuffer(x)) return x;
  if (x && typeof x === "object") {
    if ("buffer" in x) return asBuf(x.buffer);
    if ("value" in x) return asBuf(x.value);
  }
  throw new Error("not a buffer: " + JSON.stringify(x));
}
const clQ = (q: QM31) => Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
const commit = (fn: string, args: any[]) => simnet.callReadOnlyFn("commit", fn, args, deployer).result;
const cLeaf = (q: QM31): Buffer => asBuf(cvToValue(commit("qm31-leaf", [clQ(q)])));
const cOpeningBound = (q: QM31, path: Step[], root: Buffer): boolean =>
  cvToValue(commit("opening-bound", [clQ(q), clPath(path), Cl.buffer(root)])) as boolean;
const cAbsorbQm31 = (state: Buffer, q: Buffer): Buffer =>
  asBuf(cvToValue(simnet.callReadOnlyFn("transcript", "absorb-qm31", [Cl.buffer(state), Cl.buffer(q)], deployer).result));
const hex = (b: Buffer) => b.toString("hex");

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x6c1f);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];
const flipBit = (b: Buffer): Buffer => { const c = Buffer.from(b); c[0] ^= 0x01; return c; };

describe("qm31-leaf -- oracle-independent KATs (Python hashlib)", () => {
  it("leaf([1,2,3,4]) = sha256(c0||c1||c2||c3, each 4-byte big-endian)", () => {
    expect(hex(cLeaf([1n, 2n, 3n, 4n]))).toBe("bac02613b6f9456c3b486cbd9e93e575c8a054a7a6784af9e1669950bad5f6e2");
  });
  it("leaf([0,0,0,0]) = sha256(0^16) anchors the zero element", () => {
    expect(hex(cLeaf([0n, 0n, 0n, 0n]))).toBe("374708fff7719dd5979ec875d56cd2286f6d3cf7ec317a3b25632aab28ec37bb");
  });
  it("leaf([5,6,7,8])", () => {
    expect(hex(cLeaf([5n, 6n, 7n, 8n]))).toBe("8ce7e38f31f82c2411857808454b9b6325f41dcab7b95271d9721d568eed5f58");
  });
  it("byte order: leaf([1,0,0,0]) != leaf([0,0,0,1]) (c0-first, big-endian)", () => {
    expect(hex(cLeaf([1n, 0n, 0n, 0n]))).not.toBe(hex(cLeaf([0n, 0n, 0n, 1n])));
  });
});

describe("qm31-leaf -- differential vs the oracle (writeUInt32BE + sha256)", () => {
  it("matches the oracle over 300 random canonical QM31", () => {
    for (let k = 0; k < 300; k++) {
      const q = randQ();
      expect(hex(cLeaf(q))).toBe(hex(qm31LeafOracle(q)));
    }
  });
});

describe("qm31-leaf -- canonicalization (the soundness boundary; reject non-reduced limbs)", () => {
  it("aborts on a non-reduced low limb (v = p): leaf([p,0,0,0]) rejects", () => {
    expect(() => cLeaf([P, 0n, 0n, 0n])).toThrow();
  });
  it("aborts on a non-reduced high limb too: leaf([1,2,3,p+5])", () => {
    expect(() => cLeaf([1n, 2n, 3n, P + 5n])).toThrow();
  });
  it("p-1 (the max canonical limb) is accepted and matches the oracle", () => {
    expect(hex(cLeaf([P - 1n, 0n, 0n, 0n]))).toBe(hex(qm31LeafOracle([P - 1n, 0n, 0n, 0n])));
  });
  // Pins the EXACT slice-aliasing the guard exists to prevent: the encoder slices the low 4 big-endian
  // bytes [13,17) of to-consensus-buff?, so a value >= 2^32 whose low 4 bytes equal a canonical limb
  // (here 2^32+5 aliases 5) would collide with that canonical leaf if the guard were dropped or weakened
  // to (< v 2^32). The p / p+5 tests use values < 2^32, so their low bytes never alias a canonical limb;
  // this is the one boundary they miss. The abort must beat the alias.
  it("aborts on a >= 2^32 limb that aliases a canonical limb's low 4 bytes: leaf([1,2,3,2^32+5])", () => {
    const aliasing: QM31 = [1n, 2n, 3n, (1n << 32n) + 5n];
    let leaf: Buffer | null = null;
    expect(() => { leaf = cLeaf(aliasing); }).toThrow();
    // Defense in depth: if a future weakening let it through, it must still not collide with leaf([1,2,3,5]).
    if (leaf !== null) expect(hex(leaf)).not.toBe(hex(cLeaf([1n, 2n, 3n, 5n])));
  });
});

describe("opening-bound -- Merkle-bound QM31 opening", () => {
  it("2-leaf root KAT: opening-bound([1,2,3,4], path, sha(L0||L1)) is true", () => {
    const leaves = [qm31LeafOracle([1n, 2n, 3n, 4n]), qm31LeafOracle([5n, 6n, 7n, 8n])];
    const levels = buildTree(leaves);
    const root = rootOf(levels);
    expect(hex(root)).toBe("7493fc22fab0e6676dc2c752c523a9896fedd849f7a100f9f29db489646620dd");
    expect(cOpeningBound([1n, 2n, 3n, 4n], makeProof(levels, 0), root)).toBe(true);
    expect(cOpeningBound([5n, 6n, 7n, 8n], makeProof(levels, 1), root)).toBe(true);
  });
  it("binds the honest gear-6c openings to a committed root; each tamper rejects", () => {
    const o = honestDeep([123456789n, 2n, 7n, 11n], [5n, 4n, 3n, 2n], [3n, 1n, 4n, 1n], 5n);
    const vals: QM31[] = [o.Tz, o.Tgz, o.Tg2z, o.Cz];
    const leaves = vals.map(qm31LeafOracle);
    const levels = buildTree(leaves);
    const root = rootOf(levels);
    for (let k = 0; k < 4; k++) expect(cOpeningBound(vals[k], makeProof(levels, k), root)).toBe(true);
    const tz2: QM31 = [(o.Tz[0] + 1n) % P, o.Tz[1], o.Tz[2], o.Tz[3]];
    expect(cOpeningBound(tz2, makeProof(levels, 0), root)).toBe(false);           // tampered value
    expect(cOpeningBound(o.Tz, makeProof(levels, 3), root)).toBe(false);          // wrong index (Cz path)
    expect(cOpeningBound(o.Tz, makeProof(levels, 0), flipBit(root))).toBe(false); // flipped root
  });
  it("randomized fuzz: honest openings verify, single-bit path tampers reject (trees 2^1..2^5)", () => {
    for (let t = 0; t < 150; t++) {
      const size = 1 << (1 + Math.floor(rng() * 5));
      const vals = Array.from({ length: size }, () => randQ());
      const levels = buildTree(vals.map(qm31LeafOracle));
      const root = rootOf(levels);
      const idx = Math.floor(rng() * size);
      expect(cOpeningBound(vals[idx], makeProof(levels, idx), root)).toBe(true);
      const proof = makeProof(levels, idx);
      const lvl = Math.floor(rng() * proof.length);
      const bad = proof.map((p, i) => (i === lvl ? { ...p, sibling: flipBit(p.sibling) } : p));
      expect(cOpeningBound(vals[idx], bad, root)).toBe(false);
    }
  }, 30000);
});

// Red-team #1/#4: the "one encoder, no Frozen-Heart" claim was advertised but unguarded -- nothing tied
// qm31-leaf's 16-byte preimage to the bytes transcript.absorb-qm31 consumes. Pin it: the leaf hashes
// exactly enc16, and the transcript absorbs the SAME enc16 bytes.
describe("qm31-leaf -- single-encoder invariant (leaf preimage == transcript absorb-qm31 form)", () => {
  it("the leaf hashes exactly the c0-first 4B-BE 16-byte form, and transcript absorb-qm31 uses the same bytes", () => {
    const Z32 = Buffer.alloc(32);
    const qs: QM31[] = [[1n, 2n, 3n, 4n], [0n, 0n, 0n, 0n], [P - 1n, P - 1n, P - 1n, P - 1n], [123456789n, 2n, 7n, 11n]];
    for (const q of qs) {
      const enc16 = encodeQm31(q); // c0||c1||c2||c3, each 4-byte big-endian -- the shared encoding
      expect(hex(cLeaf(q))).toBe(hex(sha256(enc16)));                          // qm31-leaf hashes exactly enc16
      expect(hex(cAbsorbQm31(Z32, enc16))).toBe(hex(absorbQm31(Z32, enc16)));  // transcript consumes the same enc16
    }
  });
});

// Red-team #3: the canonicalization aborts were pinned only at point values (p, p+5). Make the abort spec
// a RANGE: a dense sample of v >= p -- including the >= 2^32 slice-aliasing band -- must all abort.
describe("qm31-leaf -- canonicalization covers the whole >= p band (sampled, not just points)", () => {
  it("a dense sample of non-reduced limbs (in [p, p+1e9) and >= 2^32) all abort", () => {
    for (let k = 0; k < 40; k++) {
      const justOver = P + BigInt(1 + Math.floor(rng() * 1_000_000_000));     // in (p, p+1e9]
      expect(() => cLeaf([justOver, 0n, 0n, 0n])).toThrow();
      const aliasBand = (1n << 32n) + BigInt(Math.floor(rng() * 1_000_000_000)); // >= 2^32 (slice-aliasing band)
      expect(() => cLeaf([1n, 2n, aliasBand, 4n])).toThrow();
    }
  });
});

// Red-team #5: merkle's empty path returns the leaf unchanged, so opening-bound(q,[],qm31-leaf(q)) is true.
// Harmless here, but a 6d-ii/iv caller MUST bind the path length (tree height) so a short/empty path cannot
// stand in for a real opening.
describe("opening-bound -- empty-path single-leaf (documented footgun; caller binds path length)", () => {
  it("opening-bound(q, [], qm31-leaf(q)) is true; a wrong root still rejects", () => {
    const q: QM31 = [123456789n, 2n, 7n, 11n];
    const leaf = cLeaf(q);
    expect(cOpeningBound(q, [], leaf)).toBe(true);
    expect(cOpeningBound(q, [], flipBit(leaf))).toBe(false);
  });
});
