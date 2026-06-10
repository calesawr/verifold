// Independent BigInt reference for the gear-6c DEEP / out-of-domain quotient binding.
// The step that ties the gear-6b AIR composition (checked at the OOD point z) to the gear-5 FRI test.
// For one FRI query point x, the verifier forms quotients (P(x) - P(m)) / (x - m) for the trace mask
// points and the composition, then gamma-combines them into the first FRI value p0(x). p0 is low-degree
// IFF every opening is the TRUE evaluation of the committed polynomial -- so FRI accepts honest openings
// and rejects any lie.
//
// Independent of deep.clar the same three ways air.ts is: from-scratch g; interpolation-derived honest
// openings (the contract never interpolates); Fermat qinv (a different inverse algorithm than the tower).
import { P } from "./m31";
import { QM31, qadd, qsub, qmul, qfromM31, qinv } from "./qm31";
import { g, airCompose, honestOpenings } from "./air";

export const G2 = (g * g) % P; // g^2 mod p, the second trace mask shift

// the ONE new primitive: (P(x) - P(m)) / (x - m), with x a base-field point lifted into QM31.
export function deepQuotient(pX: QM31, pZ: QM31, x: bigint, m: QM31): QM31 {
  return qmul(qsub(pX, pZ), qinv(qsub(qfromM31(x), m)));
}

// the gamma-powers combine into p0(x). Mask points: trace {z, g.z, g^2.z}, composition {z}.
// Each mask quotient divides by ITS OWN shifted point (z, g.z, g^2.z) -- not a shared (x-z).
export function deepP0(
  Tx: QM31, Cx: QM31, Tz: QM31, Tgz: QM31, Tg2z: QM31, Cz: QM31,
  x: bigint, z: QM31, gamma: QM31
): QM31 {
  const gz = qmul(z, qfromM31(g)), g2z = qmul(z, qfromM31(G2));
  const d0 = deepQuotient(Tx, Tz, x, z);     // (T(x)-T(z))/(x-z)
  const d1 = deepQuotient(Tx, Tgz, x, gz);   // (T(x)-T(g.z))/(x-g.z)
  const d2 = deepQuotient(Tx, Tg2z, x, g2z); // (T(x)-T(g^2.z))/(x-g^2.z)
  const dC = deepQuotient(Cx, Cz, x, z);     // (C(x)-C(z))/(x-z)
  const g2 = qmul(gamma, gamma);
  return qadd(qadd(qadd(d0, qmul(gamma, d1)), qmul(g2, d2)), qmul(qmul(g2, gamma), dC));
}

// Honest, mutually-consistent openings + p0 at a base-field query point x. C(z)/C(x) come from
// air-compose on the honest trace openings at z and x (the gear-6b seam); both are genuine deg-7 polys
// off-domain, so x must be a base-field point NOT in the order-9 domain H.
export function honestDeep(z: QM31, alpha: QM31, gamma: QM31, x: bigint) {
  const { Tz, Tgz, Tg2z } = honestOpenings(z);
  const Cz = airCompose(Tz, Tgz, Tg2z, z, alpha);
  const X = qfromM31(x);
  const ox = honestOpenings(X); // T(x), T(g.x), T(g^2.x)
  const Tx = ox.Tz, Tgx = ox.Tgz, Tg2x = ox.Tg2z;
  const Cx = airCompose(Tx, Tgx, Tg2x, X, alpha);
  const p0 = deepP0(Tx, Cx, Tz, Tgz, Tg2z, Cz, x, z, gamma);
  return { Tx, Cx, Tz, Tgz, Tg2z, Cz, p0 };
}
