import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31, qadd, qsub, qmul, qmulM31, qfromM31, qeq, qinv } from "./qm31";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

function num(x: any): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
}
const clQ = (q: QM31) =>
  Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
function cQ(fn: string, args: any[]): QM31 {
  const o = cvToValue(simnet.callReadOnlyFn("qm31", fn, args, deployer).result) as any;
  return [num(o.c0), num(o.c1), num(o.c2), num(o.c3)];
}
const cAdd = (a: QM31, b: QM31) => cQ("qm31-add", [clQ(a), clQ(b)]);
const cSub = (a: QM31, b: QM31) => cQ("qm31-sub", [clQ(a), clQ(b)]);
const cMul = (a: QM31, b: QM31) => cQ("qm31-mul", [clQ(a), clQ(b)]);
const cMulM31 = (a: QM31, s: bigint) => cQ("qm31-mul-m31", [clQ(a), Cl.uint(s)]);
const cFromM31 = (s: bigint) => cQ("qm31-from-m31", [Cl.uint(s)]);
const cEq = (a: QM31, b: QM31): boolean =>
  cvToValue(simnet.callReadOnlyFn("qm31", "qm31-eq", [clQ(a), clQ(b)], deployer).result) as boolean;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x9c31);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];

describe("qm31 -- tower known-answer tests (mathematical facts, oracle-independent)", () => {
  it("i^2 == -1  (i is the limb [0,1,0,0])", () => {
    const i: QM31 = [0n, 1n, 0n, 0n];
    expect(cMul(i, i)).toEqual([P - 1n, 0n, 0n, 0n]); // -1 mod p
  });
  it("u^2 == 2 + i  (u is the limb [0,0,1,0]; R = 2 + i)", () => {
    const u: QM31 = [0n, 0n, 1n, 0n];
    expect(cMul(u, u)).toEqual([2n, 1n, 0n, 0n]);
  });
  it("(2+i) is R: u^2 limbs are exactly [2,1,0,0]", () => {
    // a direct hand product: (1 + i) * (1 + i) = 2i  =>  [0,2,0,0]
    expect(cMul([1n, 1n, 0n, 0n], [1n, 1n, 0n, 0n])).toEqual([0n, 2n, 0n, 0n]);
  });
  // These exercise R's IMAGINARY cross-term (cm-mulR's e1 != 0 path), which u*u alone does not.
  // ((1+i)u)^2 distinguishes R = 2+i from R = 2-i (the latter would give [2,4,0,0]).
  it("R = 2+i, not 2-i:  ((1+i)u)^2 == [p-2, 4, 0, 0]", () => {
    expect(cMul([0n, 0n, 1n, 1n], [0n, 0n, 1n, 1n])).toEqual([P - 2n, 4n, 0n, 0n]);
  });
  it("u^3 == [0,0,2,1]  and  R^2 == [3,4,0,0]  (hand-derived)", () => {
    const u: QM31 = [0n, 0n, 1n, 0n];
    expect(cMul(cMul(u, u), u)).toEqual([0n, 0n, 2n, 1n]);
    expect(cMul([2n, 1n, 0n, 0n], [2n, 1n, 0n, 0n])).toEqual([3n, 4n, 0n, 0n]);
  });
});

describe("qm31 -- ring laws (contract vs itself)", () => {
  it("addition commutes and subtraction inverts it (500x)", () => {
    for (let k = 0; k < 500; k++) {
      const a = randQ(), b = randQ();
      expect(cAdd(a, b)).toEqual(cAdd(b, a));
      expect(cSub(cAdd(a, b), b)).toEqual(a);
    }
  });
  it("multiplication commutes and distributes over addition (300x)", () => {
    for (let k = 0; k < 300; k++) {
      const a = randQ(), b = randQ(), c = randQ();
      expect(cMul(a, b)).toEqual(cMul(b, a));
      expect(cMul(a, cAdd(b, c))).toEqual(cAdd(cMul(a, b), cMul(a, c)));
    }
  });
  it("multiplicative identity, zero, and the m31-scalar shortcut (300x)", () => {
    const one = cFromM31(1n), zero = cFromM31(0n);
    for (let k = 0; k < 300; k++) {
      const a = randQ(), s = randField();
      expect(cMul(a, one)).toEqual(a);
      expect(cMul(a, zero)).toEqual([0n, 0n, 0n, 0n]);
      expect(cMulM31(a, s)).toEqual(cMul(a, cFromM31(s))); // scaling == multiply by embedded scalar
    }
  });
});

describe("qm31 -- differential vs the BigInt oracle", () => {
  it("qm31-add/sub/mul match the reference over 1000 random pairs (seed 0x9c31)", () => {
    for (let k = 0; k < 1000; k++) {
      const a = randQ(), b = randQ();
      expect(cAdd(a, b)).toEqual(qadd(a, b));
      expect(cSub(a, b)).toEqual(qsub(a, b));
      expect(cMul(a, b)).toEqual(qmul(a, b));
    }
  });
  it("qm31-mul-m31 and qm31-from-m31 match the reference (500x)", () => {
    for (let k = 0; k < 500; k++) {
      const a = randQ(), s = randField();
      expect(cMulM31(a, s)).toEqual(qmulM31(a, s));
      expect(cFromM31(s)).toEqual(qfromM31(s));
    }
  });
  it("qm31-eq agrees with the reference on equal and unequal pairs", () => {
    const a = randQ();
    expect(cEq(a, a)).toBe(qeq(a, a));
    expect(cEq(a, a)).toBe(true);
    const b: QM31 = [a[0], a[1], a[2], (a[3] + 1n) % P];
    expect(cEq(a, b)).toBe(qeq(a, b));
    expect(cEq(a, b)).toBe(false);
  });
});

// ToB re-audit (#16): qm31.clar re-implements the three CHEAP base-field ops (add/sub/mul) privately
// (gear-6a qm31-inv DOES cross-call .field for m31-inv, but add/sub/mul stay local), and fri.clar mixes
// both contracts in one fold. Nothing pinned that the
// two M31 implementations agree. Embedding a scalar via from-m31 keeps everything in the c0 limb,
// so qm31's internal m31 op surfaces there and can be compared to field.clar directly.
const cFieldOp = (fn: string, a: bigint, b: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("field", fn, [Cl.uint(a), Cl.uint(b)], deployer).result));
describe("qm31 — duplicated base-field ops stay in sync with field.clar", () => {
  it("qm31's internal m31 add/sub/mul agree with field.clar over 300 random pairs", () => {
    for (let k = 0; k < 300; k++) {
      const a = randField(), b = randField();
      expect(cAdd(cFromM31(a), cFromM31(b))[0]).toBe(cFieldOp("m31-add", a, b));
      expect(cSub(cFromM31(a), cFromM31(b))[0]).toBe(cFieldOp("m31-sub", a, b));
      expect(cMul(cFromM31(a), cFromM31(b))[0]).toBe(cFieldOp("m31-mul", a, b));
    }
  });
});

// gear 6a: extension-field inverse. The FRI fold needed only base-field inverse; AIR's DEEP quotient
// denominators need the full QM31 inverse. Implemented in qm31.clar via the conjugate/norm tower
// (QM31 -> CM31 -> M31). Cross-checked against an INDEPENDENT Fermat oracle (a^(p^4-2)) and KATs.
const cInv = (a: QM31): QM31 => cQ("qm31-inv", [clQ(a)]);
describe("qm31-inv — extension-field inverse (gear 6a)", () => {
  const randNonzeroQ = (): QM31 => {
    let a = randQ();
    while (a.every((x) => x === 0n)) a = randQ();
    return a;
  };
  // Red-team (gear 6a): the zero element has no inverse, and the norm N is 0 only for a=0. Returning a
  // silent 0 would be an accept-direction hole exactly like the one fri-fold-step ABORTS on (x=0). So
  // qm31-inv must REJECT zero by aborting, matching the locked "abort = reject" convention.
  it("aborts on the zero element (abort=reject, like fri-fold-step's x=0 guard; not a silent 0)", () => {
    expect(() => cInv([0n, 0n, 0n, 0n])).toThrow();
  });
  it("a * inv(a) == 1 for nonzero a, computed entirely on-chain (300x)", () => {
    for (let k = 0; k < 300; k++) {
      const a = randNonzeroQ();
      expect(cMul(a, cInv(a))).toEqual([1n, 0n, 0n, 0n]);
    }
  });
  it("matches the independent Fermat oracle a^(p^4-2) over 300 nonzero inputs", () => {
    for (let k = 0; k < 300; k++) {
      const a = randNonzeroQ();
      expect(cInv(a)).toEqual(qinv(a));
    }
  });
  it("oracle-independent KATs (Python, cross-checked Fermat == tower)", () => {
    expect(cInv([0n, 1n, 0n, 0n])).toEqual([0n, P - 1n, 0n, 0n]); // inv(i) = -i
    expect(cInv([0n, 0n, 1n, 0n])).toEqual([0n, 0n, 1717986918n, 1288490188n]); // inv(u)
    expect(cInv([1n, 2n, 3n, 4n])).toEqual([1855247052n, 856841008n, 1588674294n, 1863525709n]);
    expect(cInv([2n, 0n, 0n, 0n])).toEqual([1073741824n, 0n, 0n, 0n]); // inv of embedded 2
    expect(cInv([5n, 9n, 13n, 17n])).toEqual([230688663n, 910460867n, 1681822277n, 263631134n]);
    // pure-B element (A=0, both high limbs nonzero): isolates the high-limb negation + conjugate signs
    // that embedded scalars (B=0) never exercise -- closes a red-team mutation-coverage gap.
    expect(cInv([0n, 0n, 3n, 5n])).toEqual([0n, 0n, 1099006337n, 745303148n]);
  });
  it("inv(inv(a)) == a for nonzero a (oracle-independent involution, 200x)", () => {
    for (let k = 0; k < 200; k++) {
      const a = randNonzeroQ();
      expect(cInv(cInv(a))).toEqual(a);
    }
  });
  it("inverse of an embedded scalar == the embedded base-field inverse (contract-only, 200x)", () => {
    for (let k = 0; k < 200; k++) {
      let s = randField();
      while (s === 0n) s = randField();
      const si = num(cvToValue(simnet.callReadOnlyFn("field", "m31-inv", [Cl.uint(s)], deployer).result));
      expect(cInv(cFromM31(s))).toEqual([si, 0n, 0n, 0n]);
    }
  });
});
