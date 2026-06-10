// Plain-BigInt reference for QM31, the degree-4 "secure field" extension of Mersenne-31.
// Tower (must match the Stwo prover): CM31 = M31[i]/(i^2 + 1), QM31 = CM31[u]/(u^2 - (2+i)).
// An element {c0,c1,c2,c3} means (c0 + c1*i) + (c2 + c3*i)*u  -- the same 4-limb shape that
// transcript.ts squeezeQm31 already emits. Used as the oracle to differential-test qm31.clar.
import { P, add, sub, mul } from "./m31";

export type QM31 = [bigint, bigint, bigint, bigint];

export const qadd = (a: QM31, b: QM31): QM31 => [
  add(a[0], b[0]), add(a[1], b[1]), add(a[2], b[2]), add(a[3], b[3]),
];
export const qsub = (a: QM31, b: QM31): QM31 => [
  sub(a[0], b[0]), sub(a[1], b[1]), sub(a[2], b[2]), sub(a[3], b[3]),
];
// scale a QM31 by a base-field M31 scalar (used for the FRI twiddle 1/x)
export const qmulM31 = (a: QM31, s: bigint): QM31 => [
  mul(a[0], s), mul(a[1], s), mul(a[2], s), mul(a[3], s),
];
export const qfromM31 = (s: bigint): QM31 => [s, 0n, 0n, 0n];

// CM31 multiply: (x0 + x1*i)(y0 + y1*i) = (x0*y0 - x1*y1) + (x0*y1 + x1*y0)*i  (since i^2 = -1)
const cmMul = (x0: bigint, x1: bigint, y0: bigint, y1: bigint): [bigint, bigint] => [
  sub(mul(x0, y0), mul(x1, y1)),
  add(mul(x0, y1), mul(x1, y0)),
];
// multiply a CM31 by R = 2 + i:  (e0 + e1*i)(2 + i) = (2*e0 - e1) + (e0 + 2*e1)*i
const cmMulR = (e0: bigint, e1: bigint): [bigint, bigint] => [
  sub(add(e0, e0), e1),
  add(e0, add(e1, e1)),
];

// QM31 multiply: (A + B*u)(C + D*u) = (A*C + R*B*D) + (A*D + B*C)*u, with A,B,C,D in CM31.
export const qmul = (a: QM31, b: QM31): QM31 => {
  const AC = cmMul(a[0], a[1], b[0], b[1]);
  const BD = cmMul(a[2], a[3], b[2], b[3]);
  const AD = cmMul(a[0], a[1], b[2], b[3]);
  const BC = cmMul(a[2], a[3], b[0], b[1]);
  const R = cmMulR(BD[0], BD[1]);
  return [
    add(AC[0], R[0]), add(AC[1], R[1]), // low  = A*C + R*B*D
    add(AD[0], BC[0]), add(AD[1], BC[1]), // high = A*D + B*C
  ];
};

export const qeq = (a: QM31, b: QM31): boolean => a.every((x, i) => x === b[i]);

// Independent inverse oracle via Fermat: QM31 = GF(p^4), so |QM31*| = p^4 - 1 and a^-1 = a^(p^4 - 2).
// Square-and-multiply over qmul -- a DIFFERENT algorithm from qm31.clar's conjugate/norm tower, so
// the differential test genuinely cross-checks the two methods (a bug in either one diverges).
export const qpow = (a: QM31, e: bigint): QM31 => {
  let result: QM31 = [1n, 0n, 0n, 0n];
  let base = a;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = qmul(result, base);
    base = qmul(base, base);
    exp >>= 1n;
  }
  return result;
};
export const qinv = (a: QM31): QM31 => qpow(a, P ** 4n - 2n);
