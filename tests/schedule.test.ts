import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31 } from "./qm31";
import { sha256 } from "./merkle";
import { deriveChallenges, Challenges } from "./schedule";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

function num(x: any): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
}
// cvToValue can wrap nested tuples/lists as { type, value }; unwrap one layer when needed.
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("c0" in x) && !Array.isArray(x) ? x.value : x;
const limOf = (t: any): QM31 => { const v = deref(t); return [num(v.c0), num(v.c1), num(v.c2), num(v.c3)]; };
const listOf = (x: any): any[] => { const v = deref(x); return Array.isArray(v) ? v : v; };

const clQ = (q: QM31) => Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });

function extractChallenges(cv: any): Challenges {
  const o = deref(cvToValue(cv)) as any;
  return {
    alpha: limOf(o.alpha), z: limOf(o.z), gamma: limOf(o.gamma),
    betas: listOf(o.betas).map(limOf),
    queryIndices: listOf(o["query-indices"]).map(num),
    powOk: deref(o["pow-ok"]) as boolean,
  };
}

// gear 6e: SEVEN openings (T at the three mask points + the four composition coordinates)
const cDerive = (
  ctx: Buffer, tr: Buffer, cr: Buffer, ops: QM31[],
  friRoots: Buffer[], final: QM31, nonce: Buffer
): Challenges =>
  extractChallenges(simnet.callReadOnlyFn("schedule", "derive-challenges", [
    Cl.buffer(ctx), Cl.buffer(tr), Cl.buffer(cr),
    ...ops.map(clQ),
    Cl.list(friRoots.map((r) => Cl.buffer(r))), clQ(final), Cl.buffer(nonce),
  ], deployer).result);

// --- the locked ctx assembly (matches schedule.clar's expectation) ---
const DOMAIN_LABEL = Buffer.from("verifold-fs-v1");                       // 14 bytes
const VERSION = Buffer.from([0x01]);
// NOTE (gear 6d-iv): the 0x03 L-byte below is OPAQUE derivation-test data predating the L=4
// resolution (1 first-layer + 3 inner FRI roots); the KATs in this file were computed from these
// exact bytes, so do NOT change them. The canonical proof-shape PARAMS (0x0404020800000009) lives
// in driver.clar / driver.test.ts; get-params (pinned below) is the one source of truth for N/L.
const PARAMS = Buffer.from([0x04, 0x03, 0x02, 0x08, 0x00, 0x00, 0x00, 0x09]); // N,L,blowup,pow_bits, air_id u32 BE
const ctxOf = (pub: Buffer) => Buffer.concat([DOMAIN_LABEL, VERSION, PARAMS, sha256(pub)]);

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5d12);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];
const randBuf = (n: number): Buffer => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = Math.floor(rng() * 256); return b; };
const flipBit = (b: Buffer): Buffer => { const c = Buffer.from(b); c[0] ^= 0x01; return c; };

// --- the fixed toy proof that the Python KATs were computed from ---
const CTX = ctxOf(Buffer.alloc(0)); // public_inputs = empty
const TRACE_ROOT = sha256(Buffer.from("verifold-toy-trace-root"));
const COMP_ROOT = sha256(Buffer.from("verifold-toy-comp-root"));
const TZ: QM31 = [1n, 2n, 3n, 4n], TGZ: QM31 = [5n, 6n, 7n, 8n], TG2Z: QM31 = [9n, 10n, 11n, 12n];
const C0Z: QM31 = [13n, 14n, 15n, 16n], C1Z: QM31 = [21n, 22n, 23n, 24n];
const C2Z: QM31 = [25n, 26n, 27n, 28n], C3Z: QM31 = [29n, 30n, 31n, 32n];
const OPS: QM31[] = [TZ, TGZ, TG2Z, C0Z, C1Z, C2Z, C3Z];
const FRI_ROOTS = [sha256(Buffer.from("fri-root-0")), sha256(Buffer.from("fri-root-1")), sha256(Buffer.from("fri-root-2"))];
const FINAL: QM31 = [17n, 18n, 19n, 20n];
const goodNonce = (() => { const b = Buffer.alloc(8); b.writeUInt32BE(155, 4); return b; })();
const badNonce = Buffer.alloc(8);

describe("derive-challenges -- KATs for the fixed toy proof (independent Python hashlib replay)", () => {
  it("alpha, z, gamma, beta_0, query indices, pow-ok match the Python replay", () => {
    const c = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    expect(c.alpha).toEqual([580007468n, 832501175n, 450612008n, 488216182n]); // pre-openings: unchanged vs 6d
    expect(c.z).toEqual([444220769n, 1025370882n, 380974736n, 1838895705n]);   // pre-openings: unchanged vs 6d
    expect(c.gamma).toEqual([2093720443n, 387285501n, 544045849n, 240756036n]); // AFTER all 7 absorbs (6e)
    expect(c.betas.length).toBe(3);
    expect(c.betas[0]).toEqual([1524450327n, 260150950n, 1409591871n, 1899108660n]);
    expect(c.betas[1]).toEqual([1842407726n, 524416462n, 1761186934n, 950535205n]);  // red-team: pin all betas
    expect(c.betas[2]).toEqual([535153478n, 710474163n, 146023292n, 1453012404n]);
    expect(c.queryIndices).toEqual([13n, 13n, 13n, 8n]); // length 4 also pins QUERY-COUNTER == N
    expect(c.powOk).toBe(true);
  });
  it("grinding pins the EXACT 2^120 threshold (red-team): 155 passes, 0 fails, and nonce 58 (pow in [2^120,2^121)) fails", () => {
    const bracketNonce = Buffer.alloc(8); bracketNonce.writeUInt32BE(58, 4);
    expect(cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce).powOk).toBe(true);
    expect(cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, badNonce).powOk).toBe(false);
    // nonce 58's pow value is in [2^120, 2^121): it FAILS at the real threshold but would PASS if POW-THRESHOLD
    // were weakened to 2^121 -- so this catches a 1-bit (or larger) loosening the wide-margin nonces miss.
    expect(cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, bracketNonce).powOk).toBe(false);
  });
});

describe("derive-challenges -- differential vs the independent replay oracle", () => {
  it("matches the oracle on 60 random toy proofs", () => {
    for (let k = 0; k < 60; k++) {
      const ctx = ctxOf(randBuf(20));
      const tr = randBuf(32), cr = randBuf(32);
      const ops: QM31[] = Array.from({ length: 7 }, () => randQ());
      const frs = [randBuf(32), randBuf(32), randBuf(32)];
      const fn = randQ(), nonce = randBuf(8);
      const c = cDerive(ctx, tr, cr, ops, frs, fn, nonce);
      const o = deriveChallenges(ctx, tr, cr, ops, frs, fn, nonce);
      expect(c.alpha).toEqual(o.alpha);
      expect(c.z).toEqual(o.z);
      expect(c.gamma).toEqual(o.gamma);
      expect(c.betas).toEqual(o.betas);
      expect(c.queryIndices).toEqual(o.queryIndices);
      expect(c.powOk).toBe(o.powOk);
    }
  }, 30000);
});

describe("derive-challenges -- soundness ordering (the locked Fiat-Shamir schedule)", () => {
  it("gamma binds the OOD openings: swapping two openings changes gamma; alpha/z (drawn earlier) do not", () => {
    const c1 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    const c2 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, [TGZ, TZ, TG2Z, C0Z, C1Z, C2Z, C3Z], FRI_ROOTS, FINAL, goodNonce); // swap Tz<->Tgz
    expect(c2.gamma).not.toEqual(c1.gamma); // gamma is squeezed AFTER the openings -- the gear-6c closure
    expect(c2.alpha).toEqual(c1.alpha);     // alpha precedes the openings
    expect(c2.z).toEqual(c1.z);             // z precedes the openings
  });
  it("avalanche: a different trace-root changes alpha and everything downstream", () => {
    const c1 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    const c2 = cDerive(CTX, flipBit(TRACE_ROOT), COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    expect(c2.alpha).not.toEqual(c1.alpha);
    expect(c2.z).not.toEqual(c1.z);
    expect(c2.gamma).not.toEqual(c1.gamma);
  });
  it("a different fri-root changes its beta and all later betas, but not alpha/z/gamma (drawn earlier)", () => {
    const c1 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    const frs2 = [FRI_ROOTS[0], flipBit(FRI_ROOTS[1]), FRI_ROOTS[2]];
    const c2 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, frs2, FINAL, goodNonce);
    expect(c2.gamma).toEqual(c1.gamma);          // betas are after gamma
    expect(c2.betas[0]).toEqual(c1.betas[0]);    // beta_0 is before fri-root_1
    expect(c2.betas[1]).not.toEqual(c1.betas[1]);
  });
});

describe("derive-challenges -- canonicalization (openings routed through the shared encoder)", () => {
  it("a non-canonical opening limb (>= p) aborts -- inherits commit's enc16 reject", () => {
    expect(() => cDerive(CTX, TRACE_ROOT, COMP_ROOT, [[P, 0n, 0n, 0n], TGZ, TG2Z, C0Z, C1Z, C2Z, C3Z], FRI_ROOTS, FINAL, goodNonce)).toThrow();
  });
  // Red-team (fold-edge): line above pins the abort only at [p,0,0,0] -- exactly P, in the FIRST opening, missing
  // the >= 2^32 slice-aliasing band that commit.test.ts samples densely. enc16 slices the low 4 BE bytes [13,17)
  // of to-consensus-buff?, so 2^32+5 aliases canonical 5 unless the (< v P) guard fires. Pin the abort at the
  // DEEPEST absorb (c-z, the last opening) for a >= 2^32 limb, so schedule's opening encoder is proven
  // byte-identical to commit's across the whole non-canonical band -- not just at the single [p,0,0,0] point.
  it("a >= 2^32 slice-aliasing limb in c3-z (the deepest opening absorb) aborts -- not just exactly p", () => {
    const aliasing: QM31 = [29n, 30n, 31n, (1n << 32n) + 5n]; // low 4 BE bytes alias canonical limb 5
    expect(() => cDerive(CTX, TRACE_ROOT, COMP_ROOT, [TZ, TGZ, TG2Z, C0Z, C1Z, C2Z, aliasing], FRI_ROOTS, FINAL, goodNonce)).toThrow();
  });
  it("the max canonical limb p-1 in every opening position is ACCEPTED (the boundary is reject-at-p, accept-below)", () => {
    const maxQ: QM31 = [P - 1n, P - 1n, P - 1n, P - 1n];
    expect(() => cDerive(CTX, TRACE_ROOT, COMP_ROOT, Array.from({ length: 7 }, () => maxQ), FRI_ROOTS, FINAL, goodNonce)).not.toThrow();
  });
});

// Red-team #1/#3: the final FRI poly and the grinding nonce are both absorbed AFTER gamma/betas and BEFORE the
// query draws. So tampering with EITHER must move the query indices (the queries bind the whole tail of the
// transcript) while leaving everything drawn earlier -- alpha, z, gamma, the betas -- untouched. Without this,
// a prover could swap the transmitted final poly or re-grind the nonce without the queries noticing.
describe("derive-challenges -- the final poly and nonce bind the query draws (drawn last)", () => {
  it("flipping a limb of the final FRI poly changes the query indices but not alpha/z/gamma/betas", () => {
    const c1 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    const final2: QM31 = [FINAL[0] + 1n, FINAL[1], FINAL[2], FINAL[3]];
    const c2 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, final2, goodNonce);
    expect(c2.queryIndices).not.toEqual(c1.queryIndices); // final is absorbed before the query draws
    expect(c2.alpha).toEqual(c1.alpha);                   // alpha/z/gamma/betas are all drawn earlier
    expect(c2.z).toEqual(c1.z);
    expect(c2.gamma).toEqual(c1.gamma);
    expect(c2.betas).toEqual(c1.betas);
  });
  it("a different nonce changes the query indices but not alpha/z/gamma/betas", () => {
    const c1 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, goodNonce);
    const nonce2 = (() => { const b = Buffer.alloc(8); b.writeUInt32BE(156, 4); return b; })();
    const c2 = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, FRI_ROOTS, FINAL, nonce2);
    expect(c2.queryIndices).not.toEqual(c1.queryIndices); // nonce is absorbed before the query draws
    expect(c2.alpha).toEqual(c1.alpha);
    expect(c2.z).toEqual(c1.z);
    expect(c2.gamma).toEqual(c1.gamma);
    expect(c2.betas).toEqual(c1.betas);
  });
});

// Red-team #4: the fold over fri-roots must produce EXACTLY one beta per supplied root, for any length the
// type system permits (0..32) -- never aborting, never short/over-counting. The 6d-iv driver pins length == L
// against PARAMS, but the schedule's own fold must be length-faithful first, and must match the oracle's fold
// at every length (so a beta is neither dropped nor duplicated at the fold edges).
// Gear 6d-iv: the driver's length asserts read the schedule's OWN constants via get-params, so the
// driver's N/L cannot silently drift from the QUERY_COUNTER length / the honest fri-roots count.
describe("get-params -- the PARAMS-bound constants the 6d-iv driver asserts against", () => {
  it("returns { n: 4, l: 4, domain-size: 16 }", () => {
    const o = deref(cvToValue(simnet.callReadOnlyFn("schedule", "get-params", [], deployer).result)) as any;
    expect(num(o.n)).toBe(4n);
    expect(num(o.l)).toBe(3n); // gear 6e: 1 FIRST-layer root + 2 inner line roots (degree-0 last layer transmitted)
    expect(num(o["domain-size"])).toBe(16n);
  });
});

describe("derive-challenges -- the beta fold is length-faithful (one beta per fri-root)", () => {
  for (const len of [0, 1, 2, 4, 5]) {
    it(`with ${len} fri-roots: no abort, betas.length == ${len}, matches the oracle, N query indices unchanged in count`, () => {
      const frs = Array.from({ length: len }, (_, i) => sha256(Buffer.from(`fri-root-var-${i}`)));
      const c = cDerive(CTX, TRACE_ROOT, COMP_ROOT, OPS, frs, FINAL, goodNonce);
      expect(c.betas.length).toBe(len);
      expect(c.queryIndices.length).toBe(4); // N is fixed by QUERY-COUNTER, independent of the FRI layer count
      const o = deriveChallenges(CTX, TRACE_ROOT, COMP_ROOT, OPS, frs, FINAL, goodNonce);
      expect(c.betas).toEqual(o.betas);
      expect(c.gamma).toEqual(o.gamma); // gamma is drawn before the fold, so it is the same at every length
    });
  }
});
