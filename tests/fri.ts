// Plain-BigInt reference for the FRI low-degree-test fold core, gear 5b.
// Convention: Stwo "no-1/2" line fold  folded = (a+b) + beta*(a-b)*x^{-1}  (pin identically to fri.clar).
// Values a,b,beta,folded are QM31 (~124-bit); the source point x and its inverse are base-field M31.
import { P, mul, sub, inv } from "./m31";
import { QM31, qadd, qsub, qmul, qmulM31 } from "./qm31";

// circle / Chebyshev next-layer source-point map: pi(x) = 2x^2 - 1
export const piX = (x: bigint): bigint => sub(mul(2n, mul(x, x)), 1n);

export const neg = (x: bigint): bigint => sub(0n, x); // -x mod p

// one 2-to-1 FRI butterfly: a = f(x), b = f(-x), x = source point, beta = layer challenge
export const foldStep = (a: QM31, b: QM31, x: bigint, beta: QM31): QM31 => {
  const f0 = qadd(a, b); // even part (sum)
  const f1 = qmulM31(qsub(a, b), inv(x)); // odd part scaled by the inverse source point
  return qadd(f0, qmul(beta, f1));
};

export type Layer = { sibling: QM31; x: bigint; beta: QM31; vIsRight: boolean };

// fold an opened value all the way down through every layer (mirrors merkle-root's fold idiom)
export const foldDown = (v0: QM31, layers: Layer[]): QM31 =>
  layers.reduce(
    (v, L) => (L.vIsRight ? foldStep(L.sibling, v, L.x, L.beta) : foldStep(v, L.sibling, L.x, L.beta)),
    v0
  );

// ---- "strong" oracle: tie the fold to an ACTUAL low-degree polynomial (catches twiddle /
// normalization errors a self-diff cannot). A poly is a list of QM31 coefficients, low index first. ----

// evaluate sum_k coeffs[k] * x^k at a base-field point x  (Horner; x is M31, coeffs are QM31)
export const evalPoly = (coeffs: QM31[], x: bigint): QM31 => {
  let acc: QM31 = [0n, 0n, 0n, 0n];
  for (let k = coeffs.length - 1; k >= 0; k--) acc = qadd(qmulM31(acc, x), coeffs[k]);
  return acc;
};

// f(x) = fe(x^2) + x*fo(x^2): split into even-index and odd-index coefficient lists
export const evenCoeffs = (c: QM31[]): QM31[] => c.filter((_, k) => k % 2 === 0);
export const oddCoeffs = (c: QM31[]): QM31[] => c.filter((_, k) => k % 2 === 1);

// the polynomial that f folds to:  foldPoly(w) = 2*(fe(w) + beta*fo(w)), a poly in w = x^2,
// of half the degree. Recurse this L times and a degree<2^L poly collapses to a single constant.
export const foldPoly = (coeffs: QM31[], beta: QM31): QM31[] => {
  const even = evenCoeffs(coeffs);
  const odd = oddCoeffs(coeffs);
  const out: QM31[] = [];
  for (let j = 0; j < even.length; j++) {
    const o: QM31 = j < odd.length ? odd[j] : [0n, 0n, 0n, 0n];
    out.push(qmulM31(qadd(even[j], qmul(beta, o)), 2n));
  }
  return out;
};

export { P };
