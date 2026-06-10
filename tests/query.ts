// Independent reference for gear 6d-iii: the query-index -> evaluation-domain point map.
//
// The Mersenne-31 multiplicative group has 2-adicity 1 (p-1 = 2 * odd), so it has NO subgroup of size
// 4, 8, 16, ...  The CIRCLE GROUP -- the norm-1 elements of CM31 = M31[i]/(i^2+1), with
// norm(x + y*i) = x^2 + y^2 -- is cyclic of order p+1 = 2^31 and DOES have power-of-two subgroups.
// A circle point (x,y) with x^2+y^2=1 is exactly the norm-1 CM31 element x + y*i; circle-group point
// addition is CM31 multiplication; and the x-coordinate of DOUBLING is 2x^2-1 = gear-5's pi-x.
//
// This oracle reproduces Stwo's CircleDomain for the canonic coset, computed the DIRECT way:
// point at geometric index i = G^{index_at(i)} via full CM31 exponentiation (exponents up to 2^31).
// query.clar instead uses the FACTORED form OFF*H^i (+ conjugate); the two must agree, which
// cross-checks the factoring. All constants verified against Stwo's generator in Python (orders checked).
//
// DOCUMENTED DEFAULT (toy, N = 16, log_size L = 4): the canonic "odds" coset, with the Fiat-Shamir index
// q a BIT-REVERSED position into the evaluation array (Stwo's convention). The exact coset/ordering vs a
// real Stwo prover is a human-cryptographer question; a mismatch is a COMPLETENESS break, not soundness.
import { P, add, sub, mul } from "./m31";

export type CM31 = [bigint, bigint]; // x + y*i

export const cmul = (u: CM31, v: CM31): CM31 => [
  sub(mul(u[0], v[0]), mul(u[1], v[1])), // x0*y0 - x1*y1
  add(mul(u[0], v[1]), mul(u[1], v[0])), // x0*y1 + x1*y0
];
export const cconj = (u: CM31): CM31 => [u[0], sub(0n, u[1])]; // (x, -y) = circle inverse
export const cnorm = (u: CM31): bigint => add(mul(u[0], u[0]), mul(u[1], u[1]));
export const cpow = (base: CM31, exp: bigint): CM31 => {
  let r: CM31 = [1n, 0n], b = base, e = exp;
  while (e > 0n) { if (e & 1n) r = cmul(r, b); b = cmul(b, b); e >>= 1n; }
  return r;
};

export const DOMAIN_SIZE = 16n;
export const LOG_SIZE = 4n;
export const G: CM31 = [2n, 1268011823n];       // Stwo M31_CIRCLE_GEN, order 2^31
export const OFF: CM31 = [1179735656n, 1241207368n]; // G^(2^26), order 32 (canonic coset shift)
export const H: CM31 = [32768n, 2147450879n];        // G^(2^28), order 8 (half-coset step)

// Stwo CircleDomain index_at(i): first half = the half-coset, second half = its conjugate (negated index).
const indexAt = (i: bigint): bigint =>
  i < 8n ? (1n << 26n) + (1n << 28n) * i
         : (1n << 31n) - ((1n << 26n) + (1n << 28n) * (i - 8n));
// geometric point at index i, computed the DIRECT way (full exponentiation of G)
export const domainPoint = (i: bigint): CM31 => cpow(G, indexAt(i % DOMAIN_SIZE));
export const domainX = (i: bigint): bigint => domainPoint(i)[0];

// bit-reversal of the low LOG_SIZE bits
export const bitrev = (q: bigint): bigint => {
  let r = 0n;
  for (let b = 0n; b < LOG_SIZE; b++) if ((q >> b) & 1n) r |= 1n << (LOG_SIZE - 1n - b);
  return r;
};
// the Fiat-Shamir index q is a bit-reversed position; the geometric point is domain-point(bitrev(q))
export const queryPoint = (q: bigint): CM31 => domainPoint(bitrev(q % DOMAIN_SIZE));
export const queryX = (q: bigint): bigint => queryPoint(q)[0];

// the circle projection pi(x) = 2x^2 - 1 (gear-5 pi-x): x-coordinate of doubling. Property (verified):
// pix(domainX(i)) == Re(2 * domainPoint(i)).
export const pix = (x: bigint): bigint => sub(mul(2n, mul(x, x)), 1n);
