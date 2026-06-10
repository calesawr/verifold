// Independent oracle for gear 6e's circle AIR (cair.clar). Deliberately a DIFFERENT algorithm
// from the Python replay's Gaussian-solve-in-FFT-basis: trace/composition evaluation uses the
// CONJUGATE-PAIR SPLIT f(x,y) = g(x) + y*h(x) with univariate Lagrange through the 4 distinct
// pair x's, and the pair-vanishing line constants are re-derived from the points. A shared
// basis-ordering or coset-indexing bug in replay+oracle cannot survive both routes.
import { P, add, sub, mul, inv } from "./m31";
import { QM31, qadd, qsub, qmul, qmulM31, qfromM31, qinv, qeq } from "./qm31";
import { CM31, cmul, cpow, G, queryPoint } from "./query";

export const T_INI = 1n << 27n;
export const T_STEP = 1n << 28n;
export const STEP: CM31 = cpow(G, T_STEP); // the trace coset step S (== query.clar's H point)
export const coset: CM31[] = Array.from({ length: 8 }, (_, k) => cpow(G, T_INI + BigInt(k) * T_STEP));
export const TRACE = [1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n];

export type QPoint = { x: QM31; y: QM31 };
const ONE = qfromM31(1n);

// the pair-vanishing line through two base points, as M31 constants (A, B, C):
// A = e0.y - e1.y, B = e1.x - e0.x, C = e0.x*e1.y - e0.y*e1.x  (constraints.rs pair_vanishing)
export const lineThrough = (e0: CM31, e1: CM31): [bigint, bigint, bigint] => [
  sub(e0[1], e1[1]), sub(e1[0], e0[0]), sub(mul(e0[0], e1[1]), mul(e0[1], e1[0])),
];
export const SEL = lineThrough(coset[6], coset[7]); // transition selector (excludes wrap rows 6,7)
export const B01 = lineThrough(coset[0], coset[1]); // boundary denominator (seed rows 0,1)
const lineAt = (L: [bigint, bigint, bigint], z: QPoint): QM31 =>
  qadd(qadd(qmulM31(z.x, L[0]), qmulM31(z.y, L[1])), qfromM31(L[2]));

export const feltToPoint = (t: QM31): QPoint => {
  const tsq = qmul(t, t);
  const dinv = qinv(qadd(ONE, tsq));
  return { x: qmul(qsub(ONE, tsq), dinv), y: qmul(qadd(t, t), dinv) };
};
export const pointAddBase = (z: QPoint, b: CM31): QPoint => ({
  x: qsub(qmulM31(z.x, b[0]), qmulM31(z.y, b[1])),
  y: qadd(qmulM31(z.x, b[1]), qmulM31(z.y, b[0])),
});
export const maskPoint = (z: QPoint, k: number): QPoint =>
  k === 0 ? z : maskPoint(pointAddBase(z, STEP), k - 1);
export const qpi = (v: QM31): QM31 => qsub(qadd(qmul(v, v), qmul(v, v)), ONE);
export const embP = (p: CM31): QPoint => ({ x: qfromM31(p[0]), y: qfromM31(p[1]) });

// ---- the conjugate-pair-split evaluator (the oracle's independent algorithm) ----
// Given 4 conjugate pairs (point P_k with values f(P_k), f(conj P_k)), evaluate the unique dim-8
// circle function at any QM31 point: f = g(x) + y*h(x), g/h univariate deg<=3 via Lagrange.
export function pairSplitEval(
  pairs: { pt: CM31; vPlus: QM31; vMinus: QM31 }[], at: QPoint
): QM31 {
  const xs = pairs.map((p) => p.pt[0]);
  const inv2 = inv(2n);
  const g = pairs.map((p) => qmulM31(qadd(p.vPlus, p.vMinus), inv2));
  const h = pairs.map((p) => qmulM31(qsub(p.vPlus, p.vMinus), mul(inv2, inv(p.pt[1]))));
  const lag = (vals: QM31[]): QM31 => {
    let acc: QM31 = [0n, 0n, 0n, 0n];
    for (let k = 0; k < 4; k++) {
      let num: QM31 = ONE;
      let den = 1n;
      for (let j = 0; j < 4; j++) {
        if (j === k) continue;
        num = qmul(num, qsub(at.x, qfromM31(xs[j])));
        den = mul(den, sub(xs[k], xs[j]));
      }
      acc = qadd(acc, qmul(vals[k], qmulM31(num, inv(den))));
    }
    return acc;
  };
  return qadd(lag(g), qmul(at.y, lag(h)));
}

// honest trace evaluation anywhere: rows pair as (k, 7-k) (conj within the coset)
const tracePairs = Array.from({ length: 4 }, (_, k) => ({
  pt: coset[k], vPlus: qfromM31(TRACE[k]), vMinus: qfromM31(TRACE[7 - k]),
}));
export const traceAt = (z: QPoint): QM31 => pairSplitEval(tracePairs, z);
export const open3 = (z: QPoint): [QM31, QM31, QM31] =>
  [traceAt(z), traceAt(maskPoint(z, 1)), traceAt(maskPoint(z, 2))];

// the composition formula (cair-compose); denominators via Fermat qinv
export function composeOracle(T0: QM31, T1: QM31, T2: QM31, z: QPoint, alpha: QM31): QM31 {
  const qt = qmul(qmul(qsub(qsub(T2, T1), T0), lineAt(SEL, z)), qinv(qpi(qpi(z.x))));
  const qb = qmul(qsub(T0, ONE), qinv(lineAt(B01, z)));
  return qadd(qt, qmul(alpha, qb));
}

// the 16 honest composition leaves (FS order) for a given alpha
export function compColumn(alpha: QM31): QM31[] {
  return Array.from({ length: 16 }, (_, q) => {
    const z = embP(queryPoint(BigInt(q)) as CM31);
    const [T0, T1, T2] = open3(z);
    return composeOracle(T0, T1, T2, z, alpha);
  });
}
// FS positions (2k, 2k+1) are conjugate pairs: pair-split from the first 4 distinct-x pairs
export function ldePairs(col: QM31[]): { pt: CM31; vPlus: QM31; vMinus: QM31 }[] {
  return Array.from({ length: 4 }, (_, k) => ({
    pt: queryPoint(BigInt(2 * k)) as CM31, vPlus: col[2 * k], vMinus: col[2 * k + 1],
  }));
}
// coordinate opening c_j(z): limb-j of the composition is itself a dim-8 base-coefficient
// function; pair-split its limb values from the LDE column (the seam-4 decomposition)
export function compCoordAt(Ccol: QM31[], j: number, z: QPoint): QM31 {
  const limbCol = Ccol.map((v) => qfromM31(v[j]));
  return pairSplitEval(ldePairs(limbCol), z);
}
export const recombOracle = (cz: QM31[]): QM31 =>
  qadd(qadd(cz[0], qmul([0n, 1n, 0n, 0n], cz[1])),
       qadd(qmul([0n, 0n, 1n, 0n], cz[2]), qmul([0n, 0n, 0n, 1n], cz[3])));
