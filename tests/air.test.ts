import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31 } from "./qm31";
import { g, H, TRACE, airCompose, airQTrans, honestOpenings, lagrangeEval } from "./air";

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
const air = (fn: string, args: any[]) => simnet.callReadOnlyFn("air", fn, args, deployer).result;

const qf = (s: bigint): QM31 => [s % P, 0n, 0n, 0n];
const cTransition = (a: QM31, b: QM31, c: QM31): QM31 => toQ(air("eval-transition", [clQ(a), clQ(b), clQ(c)]));
const cCompose = (Tz: QM31, Tgz: QM31, Tg2z: QM31, z: QM31, alpha: QM31): QM31 =>
  toQ(air("air-compose", [clQ(Tz), clQ(Tgz), clQ(Tg2z), clQ(z), clQ(alpha)]));
const cComposeCheck =(Tz: QM31, Tgz: QM31, Tg2z: QM31, z: QM31, alpha: QM31, claimed: QM31): boolean =>
  cvToValue(air("air-compose-check", [clQ(Tz), clQ(Tgz), clQ(Tg2z), clQ(z), clQ(alpha), clQ(claimed)])) as boolean;
const fieldPow = (base: bigint, exp: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("field", "m31-pow", [Cl.uint(base), Cl.uint(exp)], deployer).result));

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xa12b);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];
// a random out-of-domain z: force a nonzero u-component (c2) so z is never a base-field point in H.
const randOODz = (): QM31 => [randField(), randField(), randField() || 1n, randField()];

describe("air -- domain (order-9 subgroup of M31)", () => {
  it("g generates the order-9 subgroup: g^9 = 1, g^3 != 1 (via the field contract)", () => {
    expect(fieldPow(g, 9n)).toBe(1n);
    expect(fieldPow(g, 3n)).not.toBe(1n);
  });
  it("the reference domain constants are the locked values", () => {
    expect(g).toBe(309107220n);
    expect(H[7]).toBe(1072993205n);
    expect(H[8]).toBe(864490562n);
    for (const hk of H) expect(fieldPow(hk, 9n)).toBe(1n); // every domain point is a 9th root of unity
  });
});

describe("air -- oracle-independent KATs (Python-verified)", () => {
  it("base-field-z KAT: composition == 177926781", () => {
    expect(cCompose(qf(661898170n), qf(379625639n), qf(783232852n), qf(123456789n), qf(987654321n)))
      .toEqual([177926781n, 0n, 0n, 0n]);
  });
  it("QM31-z KAT: full secure-field vector", () => {
    expect(
      cCompose(
        [449009297n, 60691423n, 549094178n, 1712621488n],
        [1470109491n, 1639034775n, 48497133n, 679927794n],
        [1131884989n, 420393923n, 1550011465n, 1394798591n],
        [123456789n, 2n, 7n, 11n],
        [5n, 4n, 3n, 2n]
      )
    ).toEqual([528859684n, 492501145n, 1125037513n, 1740680022n]);
  });
});

describe("air -- differential vs the independent oracle (interpolation + Fermat inverse)", () => {
  it("matches on 120 random (openings, out-of-domain z, alpha)", () => {
    for (let k = 0; k < 120; k++) {
      const Tz = randQ(), Tgz = randQ(), Tg2z = randQ(), z = randOODz(), alpha = randQ();
      expect(cCompose(Tz, Tgz, Tg2z, z, alpha)).toEqual(airCompose(Tz, Tgz, Tg2z, z, alpha));
    }
  }, 30000);
  it("matches on HONEST interpolated openings (real-shaped, 30 random out-of-domain z)", () => {
    for (let k = 0; k < 30; k++) {
      const z = randOODz(), alpha = randQ();
      const { Tz, Tgz, Tg2z } = honestOpenings(z);
      expect(cCompose(Tz, Tgz, Tg2z, z, alpha)).toEqual(airCompose(Tz, Tgz, Tg2z, z, alpha));
    }
  }, 30000);
  it("matches for BASE-FIELD and CM31 out-of-domain z (limb-coverage the full-QM31 draw misses)", () => {
    const safeBaseField = (): bigint => { let c = randField(); while (H.includes(c)) c = randField(); return c; };
    for (let k = 0; k < 25; k++) {
      const zb: QM31 = [safeBaseField(), 0n, 0n, 0n], a = randQ();            // base-field z (c1=c2=c3=0)
      const ob = honestOpenings(zb);
      expect(cCompose(ob.Tz, ob.Tgz, ob.Tg2z, zb, a)).toEqual(airCompose(ob.Tz, ob.Tgz, ob.Tg2z, zb, a));
      const zc: QM31 = [randField(), randField() || 1n, 0n, 0n], a2 = randQ(); // CM31 z (c2=c3=0, c1!=0)
      const oc = honestOpenings(zc);
      expect(cCompose(oc.Tz, oc.Tgz, oc.Tg2z, zc, a2)).toEqual(airCompose(oc.Tz, oc.Tgz, oc.Tg2z, zc, a2));
    }
  }, 30000);
  it("eval-transition computes T(g^2 z) - T(g z) - T(z)", () => {
    for (let k = 0; k < 50; k++) {
      const a = randQ(), b = randQ(), c = randQ();
      // Ctrans(a=T(z), b=T(gz), c=T(g2z)) = c - b - a
      const exp: QM31 = [
        ((c[0] - b[0] - a[0]) % P + P) % P, ((c[1] - b[1] - a[1]) % P + P) % P,
        ((c[2] - b[2] - a[2]) % P + P) % P, ((c[3] - b[3] - a[3]) % P + P) % P,
      ];
      expect(cTransition(a, b, c)).toEqual(exp);
    }
  });
});

describe("air -- structural / honesty properties (oracle-independent, contract-only)", () => {
  it("the Fibonacci transition vanishes on rows 0..6 and NOT on wrap rows 7,8 (honest trace)", () => {
    const C = (i: number) => (((TRACE[(i + 2) % 9] - TRACE[(i + 1) % 9] - TRACE[i]) % P) + P) % P;
    for (let i = 0; i < 7; i++) expect(C(i)).toBe(0n);
    expect(C(7)).not.toBe(0n);
    expect(C(8)).not.toBe(0n);
  });
  it("alpha = 0 isolates the transition quotient: compose == q_trans (oracle)", () => {
    for (let k = 0; k < 10; k++) {
      const z = randOODz();
      const { Tz, Tgz, Tg2z } = honestOpenings(z);
      expect(cCompose(Tz, Tgz, Tg2z, z, qf(0n))).toEqual(airQTrans(Tz, Tgz, Tg2z, z));
    }
  });
  it("perturbing one opening limb changes the composition (no accidental cancellation, 25x)", () => {
    for (let k = 0; k < 25; k++) {
      const z = randOODz(), alpha = randQ();
      const { Tz, Tgz, Tg2z } = honestOpenings(z);
      const base = cCompose(Tz, Tgz, Tg2z, z, alpha);
      const Tz2: QM31 = [(Tz[0] + 1n) % P, Tz[1], Tz[2], Tz[3]];
      expect(cCompose(Tz2, Tgz, Tg2z, z, alpha)).not.toEqual(base);
    }
  }, 20000);
});

describe("air -- honest composition is low-degree in z (ORACLE-INDEPENDENT; catches the boundary-pairing bug class)", () => {
  it("a degree-7 fit through 8 honest out-of-domain points predicts a 9th", () => {
    const alpha = randQ();
    const zs = Array.from({ length: 9 }, () => randOODz());
    const comps = zs.map((z) => {
      const { Tz, Tgz, Tg2z } = honestOpenings(z);
      return cCompose(Tz, Tgz, Tg2z, z, alpha);
    });
    // each constraint quotient of an HONEST trace is a polynomial, so the composition is degree <= 7 in z
    const pred = lagrangeEval(zs.slice(0, 8), comps.slice(0, 8), zs[8]);
    expect(pred).toEqual(comps[8]);
  }, 20000);
});

describe("air-compose-check -- obligation wrapper (mirrors fri-final-ok)", () => {
  it("accepts the honest composition, rejects a tampered claimed value", () => {
    const z = randOODz(), alpha = randQ();
    const { Tz, Tgz, Tg2z } = honestOpenings(z);
    const c = cCompose(Tz, Tgz, Tg2z, z, alpha);
    expect(cComposeCheck(Tz, Tgz, Tg2z, z, alpha, c)).toBe(true);
    const bad: QM31 = [(c[0] + 1n) % P, c[1], c[2], c[3]];
    expect(cComposeCheck(Tz, Tgz, Tg2z, z, alpha, bad)).toBe(false);
  });
});

describe("air -- in-domain z ABORTS (reject direction, like fri x=0 / qm31-inv norm=0)", () => {
  it("z at every domain point H[k] aborts (a vanishing-poly denominator is zero)", () => {
    const alpha = randQ();
    for (const hk of H) {
      expect(() => cCompose(qf(1n), qf(1n), qf(1n), qf(hk), alpha)).toThrow();
    }
  });
});
