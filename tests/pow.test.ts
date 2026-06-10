import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { P, mul, pow, inv, div } from "./m31";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

function u(result: any): bigint {
  const v = result.value;
  return typeof v === "bigint" ? v : BigInt(v);
}
const cPow = (base: bigint, exp: bigint): bigint =>
  u(simnet.callReadOnlyFn("field", "m31-pow", [Cl.uint(base), Cl.uint(exp)], deployer).result);
const cInv = (a: bigint): bigint =>
  u(simnet.callReadOnlyFn("field", "m31-inv", [Cl.uint(a)], deployer).result);
const cDiv = (a: bigint, b: bigint): bigint =>
  u(simnet.callReadOnlyFn("field", "m31-div", [Cl.uint(a), Cl.uint(b)], deployer).result);

// Deterministic PRNG so any failure is reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x9e37);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randNonzero = (): bigint => {
  let x = 0n;
  while (x === 0n) x = randField();
  return x;
};

describe("m31-pow — differential vs JS reference", () => {
  it("matches the reference on edge cases (a^0=1, a^1=a, 0^e, (p-1)^2, ...)", () => {
    const cases: [bigint, bigint][] = [
      [2n, 0n], [2n, 1n], [2n, 30n], [0n, 0n], [0n, 5n],
      [1n, 1000n], [P - 1n, 2n], [3n, P - 1n], [123n, 456789n],
    ];
    for (const [a, e] of cases) expect(cPow(a, e)).toBe(pow(a, e));
  });
  it("matches the reference over 1000 random (base, exp) pairs (seed 0x9e37)", () => {
    for (let i = 0; i < 1000; i++) {
      const a = randField();
      const e = randField();
      expect(cPow(a, e)).toBe(pow(a, e));
    }
  });
});

describe("m31-inv — multiplicative inverse (Fermat)", () => {
  it("a * inv(a) == 1 for nonzero a (the defining property)", () => {
    for (let i = 0; i < 500; i++) {
      const a = randNonzero();
      expect(mul(a, cInv(a))).toBe(1n);
    }
  });
  it("matches the reference inverse", () => {
    for (let i = 0; i < 300; i++) {
      const a = randNonzero();
      expect(cInv(a)).toBe(inv(a));
    }
  });
});

describe("m31-div — division", () => {
  it("(a / b) * b == a for nonzero b", () => {
    for (let i = 0; i < 500; i++) {
      const a = randField();
      const b = randNonzero();
      expect(mul(cDiv(a, b), b)).toBe(a);
    }
  });
});

// ToB re-audit (property-based-testing / sharp-edges / variant-analysis / secure-contracts /
// mutation-testing all flagged this): m31-pow folds over a fixed 31-step list, so it processes
// exponent bits 0..30 only. An exponent >= 2^31 would be SILENTLY truncated to its low 31 bits
// and return a wrong-but-plausible value. The contract now ABORTS on such exponents (the safe
// reject direction, matching fri-fold-step's x=0 guard) instead of returning a truncated result.
describe("m31-pow — exponent domain guard (31-step unroll)", () => {
  it("aborts for exponents >= 2^31 instead of silently truncating to the low 31 bits", () => {
    for (const e of [2n ** 31n, 2n ** 31n + 1n, 2n ** 32n - 1n, 2n ** 40n]) {
      expect(() => cPow(2n, e)).toThrow();
    }
  });

  it("uses the full 31-step unroll: base^(2^30) is correct (bit 30 is the last step)", () => {
    const g = 7n; // 2^30 has only bit 30 set, so a short/over-truncated STEPS list would misfire
    expect(cPow(g, 2n ** 30n)).toBe(pow(g, 2n ** 30n));
  });

  it("the largest in-domain exponent (2^31 - 1) still computes (boundary, no abort)", () => {
    const g = 7n;
    expect(cPow(g, 2n ** 31n - 1n)).toBe(pow(g, 2n ** 31n - 1n));
  });

  it("m31-inv is unaffected: its exponent p-2 = 2^31-3 is inside the guarded domain", () => {
    expect(mul(5n, cInv(5n))).toBe(1n); // inv calls m31-pow(a, P-2)
  });
});

// ToB re-audit (#15): oracle-independent anchors for the inverse/power path (fixed decimals,
// hand/Python-computed, not derived from the co-located m31.ts oracle).
describe("m31-inv / m31-pow — oracle-independent known-answer vectors", () => {
  it("inv(2) == 1073741824 == (p+1)/2", () => {
    expect(cInv(2n)).toBe(1073741824n);
  });
  it("inv(p-1) == p-1  (p-1 == -1 is its own inverse)", () => {
    expect(cInv(P - 1n)).toBe(P - 1n);
  });
  it("pow(2, 30) == 1073741824 == 2^30  (in-domain, exercises bit 30)", () => {
    expect(cPow(2n, 30n)).toBe(1073741824n);
  });
});
