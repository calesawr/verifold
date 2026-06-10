import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { P, add, sub, mul } from "./m31";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

// Call a field op and return the result as a bigint.
function call(fn: string, a: bigint, b: bigint): bigint {
  const { result } = simnet.callReadOnlyFn("field", fn, [Cl.uint(a), Cl.uint(b)], deployer);
  const v = (result as any).value;
  return typeof v === "bigint" ? v : BigInt(v);
}

// Adversarial / boundary cases: wrap-around, underflow, max*max, identities.
const edge: [bigint, bigint][] = [
  [2n, 3n], [0n, 0n], [0n, 1n], [1n, 0n], [5n, 3n], [3n, 5n],
  [P - 1n, 1n], [P - 1n, P - 1n], [P - 1n, 2n], [123456n, 654321n], [1n, P - 1n], [P - 1n, 0n],
];

describe("Mersenne-31 field arithmetic — differential vs JS reference", () => {
  it("m31-add matches the reference on edge cases (incl. wrap-around)", () => {
    for (const [a, b] of edge) expect(call("m31-add", a, b)).toBe(add(a, b));
  });
  it("m31-sub matches the reference on edge cases (incl. underflow)", () => {
    for (const [a, b] of edge) expect(call("m31-sub", a, b)).toBe(sub(a, b));
  });
  it("m31-mul matches the reference on edge cases (incl. (p-1)*(p-1))", () => {
    for (const [a, b] of edge) expect(call("m31-mul", a, b)).toBe(mul(a, b));
  });
});

// Deterministic PRNG (mulberry32) so any failure is reproducible from the seed.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5741);
function randField(): bigint {
  const r = rng();
  if (r < 0.08) return 0n; // bias toward boundaries
  if (r < 0.16) return P - 1n;
  return BigInt(Math.floor(rng() * Number(P))); // uniform in [0, p)
}

describe("Mersenne-31 field arithmetic — random differential fuzz", () => {
  it("matches the reference for add/sub/mul over 2000 random pairs (seed 0x5741)", () => {
    for (let i = 0; i < 2000; i++) {
      const a = randField();
      const b = randField();
      expect(call("m31-add", a, b)).toBe(add(a, b));
      expect(call("m31-sub", a, b)).toBe(sub(a, b));
      expect(call("m31-mul", a, b)).toBe(mul(a, b));
    }
  });
});

// ToB re-audit (#15 / #7): the differential tests above compare Clarity to the CO-LOCATED JS oracle
// in m31.ts, which shares the same one-line formulas -- a reduction bug replicated in both would stay
// green. These vectors were computed INDEPENDENTLY (by hand / Python) and anchor the base field to
// fixed decimals, the same independent-anchor discipline already used in transcript/qm31/fri tests.
describe("Mersenne-31 — oracle-independent known-answer vectors", () => {
  it("(p-1)*(p-1) == 1  (p-1 == -1, so its square is 1)", () => {
    expect(call("m31-mul", P - 1n, P - 1n)).toBe(1n);
  });
  it("(p-1) + 1 == 0  (wrap-around to zero)", () => {
    expect(call("m31-add", P - 1n, 1n)).toBe(0n);
  });
  it("0 - 1 == p-1  (underflow-safe subtraction wraps, never aborts on reduced inputs)", () => {
    expect(call("m31-sub", 0n, 1n)).toBe(P - 1n);
  });
  it("2 * 1073741824 == 1  (so 1073741824 == inv(2) == (p+1)/2)", () => {
    expect(call("m31-mul", 2n, 1073741824n)).toBe(1n);
  });
  it("123456 * 654321 == 1322958437  (fixed product, hand/Python-computed)", () => {
    expect(call("m31-mul", 123456n, 654321n)).toBe(1322958437n);
  });
  it("law through Clarity alone (no oracle): sub(add(a,b),b) == a  (200x)", () => {
    for (let i = 0; i < 200; i++) {
      const a = BigInt(Math.floor(rng() * Number(P)));
      const b = BigInt(Math.floor(rng() * Number(P)));
      expect(call("m31-sub", call("m31-add", a, b), b)).toBe(a);
    }
  });
});
