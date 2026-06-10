// Independent BigInt reference for the gear-6b AIR composition core.
// Toy: a single-column Fibonacci trace over the order-9 multiplicative subgroup H of M31.
// The verifier never sees the trace; it gets OPENINGS T(z), T(g*z), T(g^2*z) at a point z, plus a
// challenge alpha, and evaluates: (a) the constraints from the openings, (b) divides each by its
// vanishing-polynomial value at z, (c) random-linear-combines the quotients with powers of alpha.
//
// This reference is INDEPENDENT of air.clar in three ways: it computes g/H from scratch; it derives
// honest openings by Lagrange-INTERPOLATING the trace (the contract is opening-based, never interpolates);
// and its qinv is Fermat a^(p^4-2) (a different algorithm than the contract conjugate/norm qm31-inv).
import { P, sub, mul, pow, inv } from "./m31";
import { QM31, qadd, qsub, qmul, qfromM31, qinv } from "./qm31";

export const g = pow(7n, (P - 1n) / 9n);                      // generator of the order-9 subgroup
export const H: bigint[] = Array.from({ length: 9 }, (_, k) => pow(g, BigInt(k)));
export const TRACE: bigint[] = [1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n]; // Fibonacci rows on H

const ONE = qfromM31(1n);

// The composition value computed from openings -- the function air.clar implements (Fermat qinv here).
export function airCompose(Tz: QM31, Tgz: QM31, Tg2z: QM31, z: QM31, alpha: QM31): QM31 {
  const Ctrans = qsub(qsub(Tg2z, Tgz), Tz);   // Fibonacci transition: T(g^2 z) - T(g z) - T(z)
  const Cb0 = qsub(Tz, ONE);                  // boundary row 0: T(z) - 1, pinned at z = 1   (Z_b0 = z - 1)
  const Cb1 = qsub(Tz, ONE);                  // boundary row 1: T(z) - 1, pinned at z = g   (Z_b1 = z - g)
  const z2 = qmul(z, z), z4 = qmul(z2, z2), z8 = qmul(z4, z4), z9 = qmul(z8, z);
  const Zfull = qsub(z9, ONE);                                       // x^9 - 1 on the full domain
  const Ztrans = qmul(Zfull, qinv(qmul(qsub(z, qfromM31(H[7])), qsub(z, qfromM31(H[8]))))); // exclude wrap rows
  const qt = qmul(Ctrans, qinv(Ztrans));
  const qb0 = qmul(Cb0, qinv(qsub(z, ONE)));            // Z_b0 = x - 1
  const qb1 = qmul(Cb1, qinv(qsub(z, qfromM31(g))));    // Z_b1 = x - g
  return qadd(qadd(qt, qmul(alpha, qb0)), qmul(qmul(alpha, alpha), qb1)); // qt + a*qb0 + a^2*qb1
}

// Lagrange interpolation of TRACE over H, evaluated at a QM31 point -- the honest trace polynomial.
function interpAt(z: QM31): QM31 {
  let acc = qfromM31(0n);
  for (let k = 0; k < 9; k++) {
    let num: QM31 = ONE;
    let den = 1n;
    for (let j = 0; j < 9; j++) {
      if (j === k) continue;
      num = qmul(num, qsub(z, qfromM31(H[j])));
      den = mul(den, sub(H[k], H[j]));
    }
    acc = qadd(acc, qmul(num, qmul(qfromM31(TRACE[k]), qfromM31(inv(den)))));
  }
  return acc;
}

// Just the transition quotient q_trans = C_trans(z) / Z_trans(z); air-compose with alpha=0 isolates it.
export function airQTrans(Tz: QM31, Tgz: QM31, Tg2z: QM31, z: QM31): QM31 {
  const Ctrans = qsub(qsub(Tg2z, Tgz), Tz);
  const z2 = qmul(z, z), z4 = qmul(z2, z2), z8 = qmul(z4, z4), z9 = qmul(z8, z);
  const Ztrans = qmul(qsub(z9, ONE), qinv(qmul(qsub(z, qfromM31(H[7])), qsub(z, qfromM31(H[8])))));
  return qmul(Ctrans, qinv(Ztrans));
}

// Lagrange interpolation through arbitrary (x_i, y_i) points, evaluated at `at`. Used by the
// oracle-INDEPENDENT low-degree test: an honest composition is a degree-7 polynomial in z, so an
// 8-point fit must predict a 9th -- a check that does NOT depend on this oracle's constraint formulas.
export function lagrangeEval(xs: QM31[], ys: QM31[], at: QM31): QM31 {
  let acc = qfromM31(0n);
  for (let i = 0; i < xs.length; i++) {
    let num: QM31 = ONE, den: QM31 = ONE;
    for (let j = 0; j < xs.length; j++) {
      if (j === i) continue;
      num = qmul(num, qsub(at, xs[j]));
      den = qmul(den, qsub(xs[i], xs[j]));
    }
    acc = qadd(acc, qmul(ys[i], qmul(num, qinv(den))));
  }
  return acc;
}

// Honest, mutually-consistent openings at an out-of-domain point z.
export function honestOpenings(z: QM31): { Tz: QM31; Tgz: QM31; Tg2z: QM31 } {
  const gz = qmul(z, qfromM31(g));
  const g2z = qmul(z, qfromM31(mul(g, g)));
  return { Tz: interpAt(z), Tgz: interpAt(gz), Tg2z: interpAt(g2z) };
}
