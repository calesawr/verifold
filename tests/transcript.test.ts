import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { createHash } from "node:crypto";
import {
  P,
  tInit, absorbRoot, absorbQm31, absorbNonce, squeezeM31, squeezeQm31, powOk,
} from "./transcript";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

// ---- tolerant extraction from clarinet-sdk ClarityValues ----
function num(x: any): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
}
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
const call = (fn: string, args: any[]) =>
  simnet.callReadOnlyFn("transcript", fn, args, deployer).result;

const cInit = (ctx: Buffer): Buffer => asBuf(cvToValue(call("transcript-init", [Cl.buffer(ctx)])));
const cAbsorbRoot = (state: Buffer, root: Buffer): Buffer =>
  asBuf(cvToValue(call("absorb-root", [Cl.buffer(state), Cl.buffer(root)])));
const cAbsorbQm31 = (state: Buffer, q: Buffer): Buffer =>
  asBuf(cvToValue(call("absorb-qm31", [Cl.buffer(state), Cl.buffer(q)])));
const cAbsorbNonce = (state: Buffer, nonce: Buffer): Buffer =>
  asBuf(cvToValue(call("absorb-nonce", [Cl.buffer(state), Cl.buffer(nonce)])));
const cAbsorbRoots = (state: Buffer, roots: Buffer[]): Buffer =>
  asBuf(cvToValue(call("absorb-roots", [Cl.buffer(state), Cl.list(roots.map((r) => Cl.buffer(r)))])));
function cSqueezeM31(state: Buffer): { v: bigint; state: Buffer } {
  const o = cvToValue(call("squeeze-m31", [Cl.buffer(state)])) as any;
  return { v: num(o.v), state: asBuf(o.state) };
}
function cSqueezeQm31(state: Buffer): { c: bigint[]; state: Buffer } {
  const o = cvToValue(call("squeeze-qm31", [Cl.buffer(state)])) as any;
  return { c: [num(o.c0), num(o.c1), num(o.c2), num(o.c3)], state: asBuf(o.state) };
}
const cPowOk = (state: Buffer, nonce: Buffer, threshold: bigint): boolean =>
  cvToValue(call("pow-ok", [Cl.buffer(state), Cl.buffer(nonce), Cl.uint(threshold)])) as boolean;

// ---- deterministic randomness so any failure reproduces ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5fa3);
const randBuf = (n: number): Buffer => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(rng() * 256);
  return b;
};
const hex = (b: Buffer) => "0x" + b.toString("hex");
const sha = (b: Buffer) => createHash("sha256").update(b).digest();

describe("transcript-init -- strong-FS seed", () => {
  it("matches the oracle for structured ctx (label||version||params||H(pubinputs))", () => {
    for (let i = 0; i < 50; i++) {
      const label = Buffer.from("verifold-fs-v1");
      const version = Buffer.from([1]);
      const params = randBuf(16);
      const ctx = Buffer.concat([label, version, params, sha(randBuf(40))]);
      expect(hex(cInit(ctx))).toBe(hex(tInit(ctx)));
    }
  });
});

describe("absorb -- tagged, fixed-width, chained", () => {
  it("matches the oracle over 200 random absorb sequences (roots + qm31)", () => {
    for (let i = 0; i < 200; i++) {
      let cs = randBuf(32);
      let js = Buffer.from(cs);
      const steps = 1 + Math.floor(rng() * 5);
      for (let s = 0; s < steps; s++) {
        if (rng() < 0.5) {
          const root = randBuf(32);
          cs = cAbsorbRoot(cs, root);
          js = absorbRoot(js, root);
        } else {
          const q = randBuf(16);
          cs = cAbsorbQm31(cs, q);
          js = absorbQm31(js, q);
        }
      }
      expect(hex(cs)).toBe(hex(js));
    }
  });

  it("absorb-roots folds a list identically to sequential absorb-root", () => {
    const s0 = randBuf(32);
    const roots = Array.from({ length: 5 }, () => randBuf(32));
    let js = Buffer.from(s0);
    for (const r of roots) js = absorbRoot(js, r);
    expect(hex(cAbsorbRoots(s0, roots))).toBe(hex(js));
  });

  it("is order-sensitive: swapping two absorbs changes the state", () => {
    const s0 = randBuf(32);
    const a = randBuf(32);
    const b = randBuf(32);
    expect(hex(cAbsorbRoot(cAbsorbRoot(s0, a), b))).not.toBe(
      hex(cAbsorbRoot(cAbsorbRoot(s0, b), a))
    );
  });

  it("field-type tag separates wrappers: identical bytes via absorb-root vs absorb-qm31 differ", () => {
    const s0 = randBuf(32);
    const msg = randBuf(16); // 16 bytes fits both absorb-root (buff 32 param) and absorb-qm31 (buff 16)
    const asRoot = cAbsorbRoot(s0, msg);
    const asQm31 = cAbsorbQm31(s0, msg);
    expect(hex(asRoot)).not.toBe(hex(asQm31));
    expect(hex(asRoot)).toBe(hex(absorbRoot(s0, msg)));
    expect(hex(asQm31)).toBe(hex(absorbQm31(s0, msg)));
  });
});

describe("squeeze-m31 -- field challenge derivation", () => {
  it("matches the oracle (value + advanced state) over 1000 random states", () => {
    for (let i = 0; i < 1000; i++) {
      const st = randBuf(32);
      const c = cSqueezeM31(st);
      const j = squeezeM31(st);
      expect(c.v).toBe(j.v);
      expect(hex(c.state)).toBe(hex(j.state));
      expect(c.v >= 0n && c.v < P).toBe(true);
    }
  });

  it("advances state: two consecutive squeezes differ in value and state", () => {
    const st = randBuf(32);
    const a = cSqueezeM31(st);
    const b = cSqueezeM31(a.state);
    expect(hex(a.state)).not.toBe(hex(b.state));
    expect(a.v === b.v).toBe(false);
  });
});

describe("squeeze-qm31 -- extension-field challenge", () => {
  it("matches the oracle (4 limbs + state) over 500 random states", () => {
    for (let i = 0; i < 500; i++) {
      const st = randBuf(32);
      const c = cSqueezeQm31(st);
      const j = squeezeQm31(st);
      expect(c.c).toEqual([j.c0, j.c1, j.c2, j.c3]);
      expect(hex(c.state)).toBe(hex(j.state));
    }
  });

  it("the 4 limbs come from 4 distinct advanced states (not a reused challenge)", () => {
    const st = randBuf(32);
    const s1 = squeezeM31(st).state;
    const s2 = squeezeM31(s1).state;
    const s3 = squeezeM31(s2).state;
    expect(new Set([st, s1, s2, s3].map(hex)).size).toBe(4); // distinct up to a sha256 collision
    const c = cSqueezeQm31(st);
    expect(c.c).toEqual([squeezeM31(st).v, squeezeM31(s1).v, squeezeM31(s2).v, squeezeM31(s3).v]);
  });
});

describe("absorb-before-squeeze -- Frozen-Heart regression guard", () => {
  it("a commitment absorbed before a squeeze changes the challenge", () => {
    const s0 = randBuf(32);
    const rootA = randBuf(32);
    const honest = cSqueezeM31(cAbsorbRoot(s0, rootA)).v; // absorb THEN squeeze
    const premature = cSqueezeM31(s0).v; // squeeze before absorbing
    expect(honest === premature).toBe(false);
  });

  it("a 2-round schedule matches the oracle and binds each round's commitment", () => {
    const s0 = randBuf(32);
    const rA = randBuf(32);
    const rB = randBuf(32);
    const c1 = cSqueezeM31(cAbsorbRoot(s0, rA));
    const c2 = cSqueezeM31(cAbsorbRoot(c1.state, rB));
    const jc1 = squeezeM31(absorbRoot(s0, rA));
    const jc2 = squeezeM31(absorbRoot(jc1.state, rB));
    expect(c1.v).toBe(jc1.v);
    expect(c2.v).toBe(jc2.v);
    // swapping the 2nd commitment changes c2 (it is genuinely bound)
    const c2b = cSqueezeM31(cAbsorbRoot(c1.state, randBuf(32)));
    expect(c2b.v === c2.v).toBe(false);
  });
});

describe("pow-ok -- grinding / proof-of-work check", () => {
  const powBits = 8n;
  const threshold = 1n << (128n - powBits); // 2^120

  it("accepts a nonce clearing the threshold and rejects one that doesn't (vs oracle)", () => {
    const st = randBuf(32);
    let good: Buffer | null = null;
    let bad: Buffer | null = null;
    for (let i = 0; i < 100000 && (!good || !bad); i++) {
      const nonce = Buffer.alloc(8);
      nonce.writeUInt32BE(i, 4);
      if (powOk(st, nonce, threshold)) {
        if (!good) good = nonce;
      } else if (!bad) {
        bad = nonce;
      }
    }
    expect(good).not.toBeNull();
    expect(bad).not.toBeNull();
    expect(cPowOk(st, good!, threshold)).toBe(true);
    expect(cPowOk(st, bad!, threshold)).toBe(false);
  });

  it("matches the oracle over 300 random (state, nonce) at a fixed threshold", () => {
    for (let i = 0; i < 300; i++) {
      const st = randBuf(32);
      const nonce = randBuf(8);
      expect(cPowOk(st, nonce, threshold)).toBe(powOk(st, nonce, threshold));
    }
  });

  it("threshold 0 always rejects (no unsigned value is < 0)", () => {
    for (let i = 0; i < 20; i++) {
      expect(cPowOk(randBuf(32), randBuf(8), 0n)).toBe(false);
    }
    // pow_bits=0 would mean threshold 2^128, which is unrepresentable as a Clarity uint;
    // the verifier config must enforce pow_bits >= 1 (noted for the human review).
  });
});

// Known-answer vectors pin the EXACT byte layout absolutely. The 13 differential tests above
// compare Clarity to a co-located JS oracle that shares the same hand-coded layout, so a spec-level
// error replicated in BOTH (wrong tag byte, op-byte position, field order, endianness, reduce width)
// would stay green. These hex literals were computed by an INDEPENDENT third implementation
// (Python hashlib) and verified against this contract; init('') is the canonical sha256("").
describe("known-answer vectors -- independent byte-layout anchor (Python hashlib)", () => {
  const Z32 = Buffer.alloc(32);
  it("transcript-init('') == sha256('')", () => {
    expect(hex(cInit(Buffer.alloc(0)))).toBe(
      "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
  it("transcript-init('verifold-fs-v1')", () => {
    expect(hex(cInit(Buffer.from("verifold-fs-v1")))).toBe(
      "0x3bcef153a54f6c9eeab786c9eb9db7d5c42239d3c37fcf1bbe5eb04d0ddc5213"
    );
  });
  it("absorb-root(0^32, 0^32) pins op-byte position, ROOT tag 0x01, and state||op||tag||msg order", () => {
    expect(hex(cAbsorbRoot(Z32, Z32))).toBe(
      "0xa722393cdbd2adae2ba3dced308a402b12e16da0d8c3ec67ab2d7fc72d7c2241"
    );
  });
  it("absorb-qm31(0^32, 0^16) pins QM31 tag 0x03", () => {
    expect(hex(cAbsorbQm31(Z32, Buffer.alloc(16)))).toBe(
      "0x55dafa96a7cc19dbeb8c6783a5d09525270eafe82762abb346d1e5ad3dd309db"
    );
  });
  it("squeeze-m31(0^32) pins squeeze op-tag 0x01, the 16-byte big-endian reduce, and state advance", () => {
    const r = cSqueezeM31(Z32);
    expect(hex(r.state)).toBe(
      "0x1fd4247443c9440cb3c48c28851937196bc156032d70a96c98e127ecb347e45f"
    );
    expect(r.v).toBe(2053669696n);
  });
  it("pow preimage is state||0x02||nonce read big-endian over 16 bytes (boundary)", () => {
    // sha256(0^32 || 0x02 || 0^8) read BE over the first 16 bytes == this exact value
    const v = 285473594518213351621655782822681393234n;
    expect(cPowOk(Z32, Buffer.alloc(8), v + 1n)).toBe(true); // v < v+1
    expect(cPowOk(Z32, Buffer.alloc(8), v)).toBe(false); // v not < v
  });
});

describe("16-byte reduce -- documented bias basis", () => {
  it("2^128 mod p == 16 (so the reduce skews only 16 residues, TV ~ 2^-124)", () => {
    expect((2n ** 128n) % P).toBe(16n);
  });
});

describe("strong Fiat-Shamir -- a downstream challenge binds the public statement", () => {
  const version = Buffer.from([1]);
  const root = randBuf(32);
  const challengeFor = (label: Buffer, pub: Buffer, params: Buffer): bigint => {
    const ctx = Buffer.concat([label, version, params, sha(pub)]);
    return cSqueezeM31(cAbsorbRoot(cInit(ctx), root)).v; // init -> absorb -> squeeze, all via Clarity
  };
  it("changing only the public-input hash changes the challenge", () => {
    const label = Buffer.from("verifold-fs-v1");
    const params = randBuf(16);
    const a = challengeFor(label, randBuf(40), params);
    const b = challengeFor(label, randBuf(40), params);
    expect(a === b).toBe(false);
  });
  it("changing only the DOMAIN_LABEL changes the challenge", () => {
    const params = randBuf(16);
    const pub = randBuf(40);
    const a = challengeFor(Buffer.from("verifold-fs-v1"), pub, params);
    const b = challengeFor(Buffer.from("verifold-fs-v2"), pub, params);
    expect(a === b).toBe(false);
  });
});

describe("absorb-nonce -- the grinding nonce in its own tag space (gear 6d-ii)", () => {
  it("KAT (independent Python hashlib): absorb-nonce(0^32, 0^8) == sha256(0^32 || 0x00 || 0x05 || 0^8)", () => {
    expect(hex(cAbsorbNonce(Buffer.alloc(32), Buffer.alloc(8)))).toBe(
      "0x7847689f17a91972592bcb7003ba833bae914784719ca5b0d34ee3b887828b3c"
    );
  });
  it("matches the oracle over 200 random (state, nonce)", () => {
    for (let i = 0; i < 200; i++) {
      const st = randBuf(32);
      const n = randBuf(8);
      expect(hex(cAbsorbNonce(st, n))).toBe(hex(absorbNonce(st, n)));
    }
  });
});

// ToB re-audit (#3): gear-4 precondition #2 says squeeze-m31(S).v == squeeze-qm31(S).c0 because both
// derive their first field element from sha256(S || 0x01) on the SAME state S. This is a real footgun
// (a query index and a QM31 challenge drawn from the same un-advanced state are correlated), so pin it
// with a regression test: the driver MUST thread the state between an M31 draw and a QM31 challenge.
describe("squeeze-m31 / squeeze-qm31 first-limb collision (documented driver precondition)", () => {
  it("squeeze-m31(S).v == squeeze-qm31(S).c0 on the same state (why the driver must advance between draws)", () => {
    for (let i = 0; i < 50; i++) {
      const S = randBuf(32);
      expect(cSqueezeM31(S).v).toBe(cSqueezeQm31(S).c[0]);
    }
  });
});
