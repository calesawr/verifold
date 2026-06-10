// Independent replay oracle for the gear 6d-ii Fiat-Shamir schedule. Composed ONLY from the transcript
// leaf primitives + the commit encoder -- it reconstructs the locked absorb/squeeze order a separate way,
// so the differential test compares two genuinely independent orderings of the same steps.
import { QM31 } from "./qm31";
import { tInit, absorbRoot, absorbQm31, absorbNonce, squeezeM31, squeezeQm31, powOk } from "./transcript";
import { encodeQm31 } from "./commit";

export const N = 4;                  // query count
export const DOMAIN_SIZE = 16n;      // query-index modulus (documented default; real LDE coset = 6d-iii/human)
export const POW_THRESHOLD = 2n ** 120n; // pow_bits = 8

export type Challenges = {
  alpha: QM31; z: QM31; gamma: QM31; betas: QM31[]; queryIndices: bigint[]; powOk: boolean;
};

const lim = (r: { c0: bigint; c1: bigint; c2: bigint; c3: bigint }): QM31 => [r.c0, r.c1, r.c2, r.c3];

export function deriveChallenges(
  ctx: Buffer, traceRoot: Buffer, compRoot: Buffer,
  // gear 6e: SEVEN openings -- T(z), T(z+S), T(z+2S), then the four composition COORDINATE
  // openings c0-z..c3-z, each absorbed individually BEFORE gamma (the Frozen-Heart closure)
  openings: QM31[],
  friRoots: Buffer[], final: QM31, nonce: Buffer
): Challenges {
  const s0 = tInit(ctx);
  const a = squeezeQm31(absorbRoot(s0, traceRoot));            // alpha, AFTER the trace root
  const z = squeezeQm31(absorbRoot(a.state, compRoot));        // z, AFTER the comp root
  let s2 = z.state;
  for (const op of openings) s2 = absorbQm31(s2, encodeQm31(op)); // absorb the four OOD openings (same enc16)
  const g = squeezeQm31(s2);                                   // gamma, AFTER all four openings (6c closure)
  const betas: QM31[] = [];
  let st = g.state;
  for (const r of friRoots) {                                  // interleaved: absorb root_i, squeeze beta_i
    const b = squeezeQm31(absorbRoot(st, r));
    betas.push(lim(b));
    st = b.state;
  }
  const sFin = absorbQm31(st, encodeQm31(final));              // bind the transmitted final FRI poly
  const pass = powOk(sFin, nonce, POW_THRESHOLD);             // grinding gate (non-advancing)
  const sN = absorbNonce(sFin, nonce);                        // bind the nonce -> queries depend on it
  const queryIndices: bigint[] = [];
  let st2 = sN;
  for (let i = 0; i < N; i++) {                               // N bare M31 draws -> indices mod DOMAIN_SIZE
    const m = squeezeM31(st2);
    queryIndices.push(m.v % DOMAIN_SIZE);
    st2 = m.state;
  }
  return { alpha: lim(a), z: lim(z), gamma: lim(g), betas, queryIndices, powOk: pass };
}
