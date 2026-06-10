import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31, qadd, qsub, qmul, qinv, qfromM31 } from "./qm31";
import { g, lagrangeEval, airCompose } from "./air";
import { G2, deepQuotient, deepP0, honestDeep } from "./deep";
import { Layer, foldDown } from "./fri";

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
const toQ = (cv: any): QM31 => {
  const o = cvToValue(cv) as any;
  return [num(o.c0), num(o.c1), num(o.c2), num(o.c3)];
};
const clLayer = (L: Layer) =>
  Cl.tuple({ sibling: clQ(L.sibling), x: Cl.uint(L.x), beta: clQ(L.beta), "v-is-right": Cl.bool(L.vIsRight) });
const clLayers = (ls: Layer[]) => Cl.list(ls.map(clLayer));
const deep = (fn: string, args: any[]) => simnet.callReadOnlyFn("deep", fn, args, deployer).result;

const cDeepQuotient = (pX: QM31, pZ: QM31, x: bigint, m: QM31): QM31 =>
  toQ(deep("deep-quotient", [clQ(pX), clQ(pZ), Cl.uint(x), clQ(m)]));
const cDeepP0 = (o: any, x: bigint, z: QM31, gamma: QM31): QM31 =>
  toQ(deep("deep-p0", [clQ(o.Tx), clQ(o.Cx), clQ(o.Tz), clQ(o.Tgz), clQ(o.Tg2z), clQ(o.Cz), Cl.uint(x), clQ(z), clQ(gamma)]));
const cDeepFriOk = (o: any, x: bigint, z: QM31, alpha: QM31, gamma: QM31, layers: Layer[], final: QM31): boolean =>
  cvToValue(deep("deep-fri-ok", [clQ(o.Tx), clQ(o.Cx), clQ(o.Tz), clQ(o.Tgz), clQ(o.Tg2z), clQ(o.Cz), Cl.uint(x), clQ(z), clQ(alpha), clQ(gamma), clLayers(layers), clQ(final)])) as boolean;
const fieldMul = (a: bigint, b: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("field", "m31-mul", [Cl.uint(a), Cl.uint(b)], deployer).result));
const cAirComposeCheck = (Tz: QM31, Tgz: QM31, Tg2z: QM31, z: QM31, alpha: QM31, claimed: QM31): boolean =>
  cvToValue(simnet.callReadOnlyFn("air", "air-compose-check",
    [clQ(Tz), clQ(Tgz), clQ(Tg2z), clQ(z), clQ(alpha), clQ(claimed)], deployer).result) as boolean;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xd33b);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randNonzero = (): bigint => { let x = 0n; while (x === 0n) x = randField(); return x; };
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];
const randOODz = (): QM31 => [randField(), randField(), randField() || 1n, randField()]; // nonzero u-part => not base-field
const H9 = Array.from({ length: 9 }, (_, k) => { let v = 1n; for (let i = 0; i < k; i++) v = (v * g) % P; return v; });
const safeBaseField = (): bigint => { let c = randNonzero(); while (H9.includes(c)) c = randNonzero(); return c; };
const tamper = (q: QM31): QM31 => [(q[0] + 1n) % P, q[1], q[2], q[3]];

// fixed honest instance for several tests (matches the Python KAT-3 vectors)
const Z = [123456789n, 2n, 7n, 11n] as QM31;
const ALPHA = [5n, 4n, 3n, 2n] as QM31;
const GAMMA = [3n, 1n, 4n, 1n] as QM31;

describe("deep -- domain constants (mask shifts)", () => {
  it("G2 = g^2 mod p (the second trace mask shift), checked via the field contract", () => {
    expect(G2).toBe(809695498n);
    expect(fieldMul(g, g)).toBe(G2);
  });
});

describe("deep-quotient -- oracle-independent KATs (Python-verified)", () => {
  it("KAT-1 (base field, hand-checkable): (10-3)/(5-2) = 7/3", () => {
    expect(cDeepQuotient([10n, 0n, 0n, 0n], [3n, 0n, 0n, 0n], 5n, [2n, 0n, 0n, 0n]))
      .toEqual([1431655767n, 0n, 0n, 0n]); // 7 * inv(3) in M31
  });
  it("KAT-2 (full QM31 mask, the real OOD case)", () => {
    expect(cDeepQuotient(
      [449009297n, 60691423n, 549094178n, 1712621488n],
      [1470109491n, 1639034775n, 48497133n, 679927794n],
      5n, [123456789n, 2n, 7n, 11n]
    )).toEqual([831506309n, 1813098163n, 733708242n, 849321165n]);
  });
  it("the x lift is non-reducing-safe: deep-quotient(..., P+5, ...) == deep-quotient(..., 5, ...)", () => {
    const pX = randQ(), pZ = randQ(), m = randOODz();
    expect(cDeepQuotient(pX, pZ, P + 5n, m)).toEqual(cDeepQuotient(pX, pZ, 5n, m));
  });
});

describe("deep-quotient / deep-p0 -- differential vs the independent oracle", () => {
  it("deep-quotient matches the oracle on 200 random (p_x, p_z, base-field x, QM31 mask)", () => {
    for (let k = 0; k < 200; k++) {
      const pX = randQ(), pZ = randQ(), x = safeBaseField(), m = randOODz();
      expect(cDeepQuotient(pX, pZ, x, m)).toEqual(deepQuotient(pX, pZ, x, m));
    }
  });
  it("deep-p0 matches the oracle on 120 random openings (base-field x, QM31 z/gamma)", () => {
    for (let k = 0; k < 120; k++) {
      const o = { Tx: randQ(), Cx: randQ(), Tz: randQ(), Tgz: randQ(), Tg2z: randQ(), Cz: randQ() };
      const x = safeBaseField(), z = randOODz(), gamma = randQ();
      expect(cDeepP0(o, x, z, gamma)).toEqual(deepP0(o.Tx, o.Cx, o.Tz, o.Tgz, o.Tg2z, o.Cz, x, z, gamma));
    }
  }, 30000);
  it("deep-p0 matches the oracle on HONEST interpolated openings (30 random)", () => {
    for (let k = 0; k < 30; k++) {
      const z = randOODz(), alpha = randQ(), gamma = randQ(), x = safeBaseField();
      const o = honestDeep(z, alpha, gamma, x);
      expect(cDeepP0(o, x, z, gamma)).toEqual(o.p0);
    }
  }, 30000);
  it("deep-p0 with an in-domain x (x in H9) still computes (no spurious abort; exclusion is a caller obligation)", () => {
    const o = { Tx: randQ(), Cx: randQ(), Tz: randQ(), Tgz: randQ(), Tg2z: randQ(), Cz: randQ() };
    const x = H9[2], z = randOODz(), gamma = randQ();
    expect(cDeepP0(o, x, z, gamma)).toEqual(deepP0(o.Tx, o.Cx, o.Tz, o.Tgz, o.Tg2z, o.Cz, x, z, gamma));
  });
});

describe("deep-p0 -- end-to-end KAT-3 (honest gear-6b openings; the AIR<->DEEP seam)", () => {
  it("p0 on honest openings at z=[123456789,2,7,11], alpha=[5,4,3,2], gamma=[3,1,4,1], x=5", () => {
    const o = honestDeep(Z, ALPHA, GAMMA, 5n);
    expect(o.Cz).toEqual([528859684n, 492501145n, 1125037513n, 1740680022n]); // == gear-6b QM31 KAT
    expect(cDeepP0(o, 5n, Z, GAMMA)).toEqual([1756999739n, 1611669005n, 1096724752n, 2091434388n]);
  });
});

describe("deep -- the binding: honest p0 is low-degree, a lie is not (ORACLE-INDEPENDENT)", () => {
  it("honest openings: a degree-7 fit through 8 query points predicts a 9th", () => {
    const z = randOODz(), alpha = randQ(), gamma = randQ();
    const xs = Array.from({ length: 9 }, () => safeBaseField());
    const ps = xs.map((x) => cDeepP0(honestDeep(z, alpha, gamma, x), x, z, gamma));
    const pred = lagrangeEval(xs.slice(0, 8).map((x) => [x, 0n, 0n, 0n] as QM31), ps.slice(0, 8), [xs[8], 0n, 0n, 0n]);
    expect(pred).toEqual(ps[8]);
  }, 30000);
  it("a tampered trace opening T(z) breaks low-degreeness (the 8-point fit fails)", () => {
    const z = randOODz(), alpha = randQ(), gamma = randQ();
    const xs = Array.from({ length: 9 }, () => safeBaseField());
    const ps = xs.map((x) => {
      const o = honestDeep(z, alpha, gamma, x);
      return cDeepP0({ ...o, Tz: tamper(o.Tz) }, x, z, gamma); // same wrong T(z) across all x
    });
    const pred = lagrangeEval(xs.slice(0, 8).map((x) => [x, 0n, 0n, 0n] as QM31), ps.slice(0, 8), [xs[8], 0n, 0n, 0n]);
    expect(pred).not.toEqual(ps[8]);
  }, 30000);
  it("a tampered composition opening C(z) breaks low-degreeness (binds the gear-6b check)", () => {
    const z = randOODz(), alpha = randQ(), gamma = randQ();
    const xs = Array.from({ length: 9 }, () => safeBaseField());
    const ps = xs.map((x) => {
      const o = honestDeep(z, alpha, gamma, x);
      return cDeepP0({ ...o, Cz: tamper(o.Cz) }, x, z, gamma);
    });
    const pred = lagrangeEval(xs.slice(0, 8).map((x) => [x, 0n, 0n, 0n] as QM31), ps.slice(0, 8), [xs[8], 0n, 0n, 0n]);
    expect(pred).not.toEqual(ps[8]);
  }, 30000);
});

describe("deep-fri-ok -- the seam into the real fri-fold-down", () => {
  it("feeds v0 = p0 into fri-fold-down: honest accepts, tampered final and tampered opening reject", () => {
    const o = honestDeep(Z, ALPHA, GAMMA, 5n);
    const layers: Layer[] = Array.from({ length: 8 }, () => ({
      sibling: randQ(), x: randNonzero(), beta: randQ(), vIsRight: rng() < 0.5,
    }));
    const final = foldDown(o.p0, layers); // oracle fold of v0 = p0
    expect(cDeepFriOk(o, 5n, Z, ALPHA, GAMMA, layers, final)).toBe(true);
    expect(cDeepFriOk(o, 5n, Z, ALPHA, GAMMA, layers, tamper(final))).toBe(false);
    expect(cDeepFriOk({ ...o, Tz: tamper(o.Tz) }, 5n, Z, ALPHA, GAMMA, layers, final)).toBe(false);
  }, 20000);
});

describe("deep -- reject / structural", () => {
  it("deep-quotient aborts when the query point lands on the mask (x == m, zero denominator)", () => {
    expect(() => cDeepQuotient(randQ(), randQ(), 7n, [7n, 0n, 0n, 0n])).toThrow();
  });
  it("gamma = 0 isolates the first trace quotient: p0 == (T(x)-T(z))/(x-z)", () => {
    const o = honestDeep(Z, ALPHA, GAMMA, 5n);
    expect(cDeepP0(o, 5n, Z, [0n, 0n, 0n, 0n])).toEqual(cDeepQuotient(o.Tx, o.Tz, 5n, Z));
  });
});

// Red-team finding #1: d0 and dC share the (x - z) denominator and enter p0 as d0 + gamma^3*dC, so a
// COORDINATED lie T(z)'=T(z)+e, C(z)'=C(z)+f with f = -e*gamma^-3 cancels the combined (x-z) pole residue.
// p0 is then IDENTICAL to honest at every x, so deep-p0 (the raw algebra) and an isolated low-degree test
// cannot see it. deep-fri-ok now ENFORCES air-compose-check, which binds C(z) = air-compose(the trace
// openings) and so REJECTS the lie. These tests pin the seam end to end.
describe("deep -- coordinated Tz<->Cz lie (deep-p0 blind; deep-fri-ok enforces air-compose-check)", () => {
  const E: QM31 = [123n, 45n, 6n, 7n];
  const gamma3 = qmul(qmul(GAMMA, GAMMA), GAMMA);
  const F = qmul(qsub([0n, 0n, 0n, 0n], E), qinv(gamma3)); // f = -e * gamma^-3

  it("f = -e*gamma^-3 makes the (x-z) pole residue cancel: e + gamma^3*f = 0", () => {
    expect(qadd(E, qmul(gamma3, F))).toEqual([0n, 0n, 0n, 0n]);
  });

  it("the coordinated lie yields a p0 IDENTICAL to honest at every query x (so FRI cannot see it)", () => {
    const xs = Array.from({ length: 9 }, () => safeBaseField());
    for (const x of xs) {
      const o = honestDeep(Z, ALPHA, GAMMA, x);
      const lied = { ...o, Tz: qadd(o.Tz, E), Cz: qadd(o.Cz, F) };
      expect(cDeepP0(lied, x, Z, GAMMA)).toEqual(cDeepP0(o, x, Z, GAMMA));
    }
  }, 30000);

  it("in 6c isolation the lie PASSES the load-bearing 8-point low-degree fit (the seam)", () => {
    const xs = Array.from({ length: 9 }, () => safeBaseField());
    const ps = xs.map((x) => {
      const o = honestDeep(Z, ALPHA, GAMMA, x);
      return cDeepP0({ ...o, Tz: qadd(o.Tz, E), Cz: qadd(o.Cz, F) }, x, Z, GAMMA);
    });
    const pred = lagrangeEval(xs.slice(0, 8).map((x) => [x, 0n, 0n, 0n] as QM31), ps.slice(0, 8), [xs[8], 0n, 0n, 0n]);
    expect(pred).toEqual(ps[8]); // accepted in 6c isolation -- the documented hole
  }, 30000);

  it("air-compose-check (gear 6b) is the defense: it REJECTS the lied C(z) the driver must compose in", () => {
    const o = honestDeep(Z, ALPHA, GAMMA, 5n);
    const TzLie = qadd(o.Tz, E), CzLie = qadd(o.Cz, F);
    // honest openings recompose correctly; the lied pair does not -> air-compose-check catches it.
    expect(cAirComposeCheck(o.Tz, o.Tgz, o.Tg2z, Z, ALPHA, o.Cz)).toBe(true);
    expect(cAirComposeCheck(TzLie, o.Tgz, o.Tg2z, Z, ALPHA, CzLie)).toBe(false);
    // cross-check the oracle: air-compose of the lied trace != lied Cz
    expect(airCompose(TzLie, o.Tgz, o.Tg2z, Z, ALPHA)).not.toEqual(CzLie);
  });

  it("deep-fri-ok ENFORCES air-compose-check, so it REJECTS the coordinated lie that deep-p0 accepts", () => {
    const o = honestDeep(Z, ALPHA, GAMMA, 5n);
    const layers: Layer[] = Array.from({ length: 8 }, () => ({ sibling: randQ(), x: randNonzero(), beta: randQ(), vIsRight: rng() < 0.5 }));
    const final = foldDown(o.p0, layers); // honest p0 folds to final
    const lied = { ...o, Tz: qadd(o.Tz, E), Cz: qadd(o.Cz, F) }; // lie p0 == honest p0, so fri-final-ok alone passes
    expect(cDeepFriOk(o, 5n, Z, ALPHA, GAMMA, layers, final)).toBe(true);
    expect(cDeepFriOk(lied, 5n, Z, ALPHA, GAMMA, layers, final)).toBe(false); // air-compose-check catches the bad C(z)
  }, 20000);
});
