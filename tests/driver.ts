// Gear 6e driver oracle: the toy CIRCLE-STARK mini-prover (real circle AIR + live Stwo DEEP), an
// independent verifier replay, and the dishonest-fixture builders. Composed ONLY from the per-gear
// oracles (cair/cdeep/query/fri/merkle/commit/transcript/schedule) -- no driver.clar logic shared;
// the Python replay (tools/gear6e_replay.py) pins both sides.
//
// LAYER MAP (rate 1/2, L = 3): commit trace -> alpha -> commit comp (4 coordinate columns in one
// tree; the row leaf's 4 limbs ARE the coordinate values) -> z-felt -> z = stereographic point ->
// 7 OOD opening absorbs (T at {z, z+S, z+2S} + c0..c3 at z) -> gamma -> commit DEEP column
// (fri-roots[0]) -> beta0 -> circle fold (1/y) -> commit line 8 (fri-roots[1]) -> beta1 -> fold ->
// commit line 4 (fri-roots[2]) -> beta2 -> fold to the size-2 layer; the transmitted `final` is
// the degree-0 LinePoly (honest: V3[0] == V3[1]) -> absorb final -> grind -> draw 4 queries.
import { QM31, qadd, qsub, qmul, qeq, qfromM31, qinv } from "./qm31";
import { queryPoint, queryX, pix } from "./query";
import { foldStep } from "./fri";
import { buildTree, rootOf, makeProof, sha256, Step } from "./merkle";
import { qm31LeafOracle, encodeQm31 } from "./commit";
import { tInit, absorbRoot, absorbQm31, absorbNonce, squeezeM31, squeezeQm31, powOk } from "./transcript";
import { deriveChallenges, Challenges } from "./schedule";
import { QPoint, embP, feltToPoint, traceAt, open3, compColumn, compCoordAt, composeOracle, recombOracle, coset, pairSplitEval, maskPoint as cairMask } from "./cair";
import { CM31 } from "./query";
import { deepRowOracle } from "./cdeep";

export const N = 4;
export const DOMAIN_LABEL = Buffer.from("verifold-fs-v1");
export const VERSION = Buffer.from([0x01]);
// N=4, L=3 (1 first + 2 inner roots), blowup=2 (LOAD-BEARING: rate 1/2), pow_bits=8, air_id=10.
export const PARAMS = Buffer.from([0x04, 0x03, 0x02, 0x08, 0x00, 0x00, 0x00, 0x0a]);
export const POW_THRESHOLD = 2n ** 120n;
export const ctxOf = (pub: Buffer) => Buffer.concat([DOMAIN_LABEL, VERSION, PARAMS, sha256(pub)]);

// derived twiddle tables (unchanged from 6d-iv; X3 deleted with the l3 stage)
export const Y = (k: number): bigint => queryPoint(BigInt(2 * k))[1];
export const X1 = (k: number): bigint => queryX(BigInt(2 * k));
export const X2 = (m: number): bigint => pix(X1(2 * m));

export type Bundle = {
  tX: QM31; tSibs: Buffer[]; // T at FS position q (BASE-FIELD leaf: limbs 1..3 zero honestly)
  cX: QM31; cSibs: Buffer[]; // the comp leaf: its 4 limbs ARE the coordinate-column openings
  p0Sib: QM31; p0Sibs: Buffer[];
  l1Sib: QM31; l1Sibs: Buffer[];
  l2Sib: QM31; l2Sibs: Buffer[];
};

export type Proof = {
  pub: Buffer; traceRoot: Buffer; compRoot: Buffer;
  Tz: QM31; Tgz: QM31; Tg2z: QM31; Czs: QM31[];
  friRoots: Buffer[]; final: QM31; nonce: Buffer;
  queryIndices: bigint[]; bundles: Bundle[]; allBundles: Bundle[];
  challenges: { alpha: QM31; zfelt: QM31; zPoint: QPoint; gamma: QM31; betas: QM31[] };
  columns: { Tcol: bigint[]; Ccol: QM31[]; P0: QM31[]; V1: QM31[]; V2: QM31[]; V3: QM31[] };
  sFin: Buffer;
};

const lim = (r: { c0: bigint; c1: bigint; c2: bigint; c3: bigint }): QM31 => [r.c0, r.c1, r.c2, r.c3];
const sibsOnly = (steps: Step[]): Buffer[] => steps.map((s) => s.sibling);

// ---- phase 1: columns + commitments through gamma ----
// Overrides (for the adversarial builders): traceCol (committed trace values), compCol(alpha)
// (committed comp leaves), samples(alpha, z, Ccol) -> [Tz, Tgz, Tg2z, czs[4]].
export type Overrides = {
  traceCol?: bigint[];
  traceColQ?: QM31[]; // full-QM31 committed trace leaves (the N22 non-base fixture)
  compCol?: (alpha: QM31) => QM31[];
  samples?: (alpha: QM31, z: QPoint, Ccol: QM31[]) => [QM31, QM31, QM31, QM31[]];
};
function commitPhase(pub: Buffer, ov: Overrides = {}) {
  const Tcol = ov.traceCol ??
    Array.from({ length: 16 }, (_, q) => traceAt(embP(queryPoint(BigInt(q)) as any))[0]);
  const TcolQ = ov.traceColQ ?? Tcol.map(qfromM31);
  const traceLevels = buildTree(TcolQ.map(qm31LeafOracle));
  const traceRoot = rootOf(traceLevels);
  const a = squeezeQm31(absorbRoot(tInit(ctxOf(pub)), traceRoot));
  const alpha = lim(a);
  const Ccol = ov.compCol ? ov.compCol(alpha) : compColumn(alpha);
  const compLevels = buildTree(Ccol.map(qm31LeafOracle));
  const compRoot = rootOf(compLevels);
  const zr = squeezeQm31(absorbRoot(a.state, compRoot));
  const zfelt = lim(zr);
  const zPoint = feltToPoint(zfelt);
  let Tz: QM31, Tgz: QM31, Tg2z: QM31, Czs: QM31[];
  if (ov.samples) {
    [Tz, Tgz, Tg2z, Czs] = ov.samples(alpha, zPoint, Ccol);
  } else {
    [Tz, Tgz, Tg2z] = open3(zPoint);
    Czs = [0, 1, 2, 3].map((j) => compCoordAt(Ccol, j, zPoint));
  }
  let st = zr.state;
  for (const v of [Tz, Tgz, Tg2z, ...Czs]) st = absorbQm31(st, encodeQm31(v));
  const gr = squeezeQm31(st);
  return { pub, Tcol, TcolQ, Ccol, traceLevels, compLevels, traceRoot, compRoot, alpha, zfelt, zPoint,
           Tz, Tgz, Tg2z, Czs, gamma: lim(gr), stateAfterGamma: gr.state };
}
type Base = ReturnType<typeof commitPhase>;

const deepColumn = (b: Base): QM31[] =>
  Array.from({ length: 16 }, (_, q) => {
    const [px, py] = queryPoint(BigInt(q)) as unknown as [bigint, bigint];
    return deepRowOracle(b.TcolQ[q], b.Ccol[q], b.Tz, b.Tgz, b.Tg2z, b.Czs, px, py, b.zPoint, b.gamma);
  });

// ---- phase 2: first-layer commit + interleaved fold/commit chain (L = 3) ----
function foldPhase(b: Base, P0: QM31[]) {
  let st = b.stateAfterGamma;
  const sq = (root: Buffer): QM31 => { const r = squeezeQm31(absorbRoot(st, root)); st = r.state; return lim(r); };
  const p0Levels = buildTree(P0.map(qm31LeafOracle));
  const beta0 = sq(rootOf(p0Levels)); // the circle-fold challenge
  const V1 = Array.from({ length: 8 }, (_, k) => foldStep(P0[2 * k], P0[2 * k + 1], Y(k), beta0));
  const v1Levels = buildTree(V1.map(qm31LeafOracle));
  const beta1 = sq(rootOf(v1Levels));
  const V2 = Array.from({ length: 4 }, (_, m) => foldStep(V1[2 * m], V1[2 * m + 1], X1(2 * m), beta1));
  const v2Levels = buildTree(V2.map(qm31LeafOracle));
  const beta2 = sq(rootOf(v2Levels));
  // the size-2 layer is NEVER committed: the transmitted final is the degree-0 LinePoly
  const V3 = Array.from({ length: 2 }, (_, j) => foldStep(V2[2 * j], V2[2 * j + 1], X2(2 * j), beta2));
  return { P0, V1, V2, V3, final: V3[0], betas: [beta0, beta1, beta2],
           friRoots: [rootOf(p0Levels), rootOf(v1Levels), rootOf(v2Levels)],
           levels: { p0Levels, v1Levels, v2Levels }, stateAfterBetas: st };
}
type Fold = ReturnType<typeof foldPhase>;

// ---- phase 3: absorb the transmitted final, grind (powMiss isolates the gate), draw queries ----
function tailPhase(st: Buffer, finalQ: QM31, powMiss = false) {
  const sFin = absorbQm31(st, encodeQm31(finalQ));
  let nonce!: Buffer;
  for (let c = 0; ; c++) {
    const cand = Buffer.alloc(8); cand.writeUInt32BE(c, 4);
    if (powOk(sFin, cand, POW_THRESHOLD) === !powMiss) { nonce = cand; break; }
  }
  let s2 = absorbNonce(sFin, nonce);
  const queryIndices: bigint[] = [];
  for (let i = 0; i < N; i++) { const m = squeezeM31(s2); queryIndices.push(m.v % 16n); s2 = m.state; }
  return { sFin, nonce, queryIndices };
}

function bundleAt(q: number, b: Base, f: Fold): Bundle {
  const k1 = q >> 1, k2 = q >> 2;
  return {
    tX: b.TcolQ[q], tSibs: sibsOnly(makeProof(b.traceLevels, q)),
    cX: b.Ccol[q], cSibs: sibsOnly(makeProof(b.compLevels, q)),
    p0Sib: f.P0[q ^ 1], p0Sibs: sibsOnly(makeProof(f.levels.p0Levels, q).slice(1)),
    l1Sib: f.V1[k1 ^ 1], l1Sibs: sibsOnly(makeProof(f.levels.v1Levels, k1).slice(1)),
    l2Sib: f.V2[k2 ^ 1], l2Sibs: sibsOnly(makeProof(f.levels.v2Levels, k2).slice(1)),
  };
}

function assemble(b: Base, f: Fold, finalQ: QM31, powMiss = false): Proof {
  const t = tailPhase(f.stateAfterBetas, finalQ, powMiss);
  const allBundles = Array.from({ length: 16 }, (_, q) => bundleAt(q, b, f));
  return { pub: b.pub, traceRoot: b.traceRoot, compRoot: b.compRoot,
           Tz: b.Tz, Tgz: b.Tgz, Tg2z: b.Tg2z, Czs: b.Czs,
           friRoots: f.friRoots, final: finalQ, nonce: t.nonce,
           queryIndices: t.queryIndices, bundles: t.queryIndices.map((q) => allBundles[Number(q)]),
           allBundles,
           challenges: { alpha: b.alpha, zfelt: b.zfelt, zPoint: b.zPoint, gamma: b.gamma, betas: f.betas },
           columns: { Tcol: b.Tcol, Ccol: b.Ccol, P0: f.P0, V1: f.V1, V2: f.V2, V3: f.V3 }, sFin: t.sFin };
}

export function buildHonestProof(pub: Buffer, ov: Overrides = {}): Proof {
  const b = commitPhase(pub, ov);
  const f = foldPhase(b, deepColumn(b));
  return assemble(b, f, f.final);
}

// N6: self-consistent proof over the WRONG committed DEEP column (+1 everywhere) -- only the
// first-layer splice (verifier-computed row hashed into the tree) catches it.
export function buildWrongColumnProof(pub: Buffer): Proof {
  const b = commitPhase(pub);
  const f = foldPhase(b, deepColumn(b).map((v) => qadd(v, [1n, 0n, 0n, 0n])));
  return assemble(b, f, f.final);
}

// N10(b): transmit a tampered final, everything else self-consistent -- isolates the last-layer
// constant check.
export function buildTamperedFinalProof(pub: Buffer): Proof {
  const b = commitPhase(pub);
  const f = foldPhase(b, deepColumn(b));
  return assemble(b, f, qadd(f.final, [1n, 0n, 0n, 0n]));
}

// N11c: valid in EVERYTHING except the grinding gate (queries drawn from the failing nonce).
export function buildPowMissProof(pub: Buffer): Proof {
  const b = commitPhase(pub);
  const f = foldPhase(b, deepColumn(b));
  return assemble(b, f, f.final, true);
}

// ---- the independent verifier replay ----
const climbPos = (leaf: Buffer, sibs: Buffer[], pos: number): Buffer => {
  let acc = leaf, i = pos;
  for (const s of sibs) {
    acc = i % 2 === 1 ? sha256(Buffer.concat([s, acc])) : sha256(Buffer.concat([acc, s]));
    i >>= 1;
  }
  return acc;
};
const pairParent = (self: QM31, sib: QM31, pos: number): Buffer =>
  pos % 2 === 1
    ? sha256(Buffer.concat([qm31LeafOracle(sib), qm31LeafOracle(self)]))
    : sha256(Buffer.concat([qm31LeafOracle(self), qm31LeafOracle(sib)]));
const foldAt = (v: QM31, sib: QM31, t: bigint, beta: QM31, pos: number): QM31 =>
  pos % 2 === 1 ? foldStep(sib, v, t, beta) : foldStep(v, sib, t, beta);

function verifyQueryOracle(q: number, bdl: Bundle, p: Proof, ch: Challenges, zPoint: QPoint): boolean {
  if (bdl.tSibs.length !== 4 || bdl.cSibs.length !== 4 || bdl.p0Sibs.length !== 3 ||
      bdl.l1Sibs.length !== 2 || bdl.l2Sibs.length !== 1) return false;
  if (bdl.tX[1] !== 0n || bdl.tX[2] !== 0n || bdl.tX[3] !== 0n) return false; // base-field leaf
  const k1 = q >> 1, k2 = q >> 2;
  if (!climbPos(qm31LeafOracle(bdl.tX), bdl.tSibs, q).equals(p.traceRoot)) return false;
  if (!climbPos(qm31LeafOracle(bdl.cX), bdl.cSibs, q).equals(p.compRoot)) return false;
  const [px, py] = queryPoint(BigInt(q)) as unknown as [bigint, bigint];
  const p0 = deepRowOracle(bdl.tX[0], bdl.cX, p.Tz, p.Tgz, p.Tg2z, p.Czs, px, py, zPoint, ch.gamma);
  if (!climbPos(pairParent(p0, bdl.p0Sib, q), bdl.p0Sibs, k1).equals(p.friRoots[0])) return false;
  const v1 = foldAt(p0, bdl.p0Sib, Y(k1), ch.betas[0], q); // the circle fold: twiddle = y
  if (!climbPos(pairParent(v1, bdl.l1Sib, k1), bdl.l1Sibs, k2).equals(p.friRoots[1])) return false;
  const v2 = foldAt(v1, bdl.l1Sib, X1(2 * (k1 >> 1)), ch.betas[1], k1);
  if (!climbPos(pairParent(v2, bdl.l2Sib, k2), bdl.l2Sibs, k2 >> 1).equals(p.friRoots[2])) return false;
  const v3 = foldAt(v2, bdl.l2Sib, X2(2 * (k2 >> 1)), ch.betas[2], k2);
  return qeq(v3, p.final); // the degree-0 last layer, position-independent
}

export function verifyOracle(p: Proof): boolean {
  if (p.friRoots.length !== 3 || p.bundles.length !== N) return false;
  const ch = deriveChallenges(ctxOf(p.pub), p.traceRoot, p.compRoot,
    [p.Tz, p.Tgz, p.Tg2z, ...p.Czs], p.friRoots, p.final, p.nonce);
  if (!ch.powOk) return false;
  if (ch.betas.length !== 3 || ch.queryIndices.length !== N) return false;
  const zPoint = feltToPoint(ch.z);
  // the OOD-consistency closure (cair-compose-check's oracle twin)
  if (!qeq(composeOracle(p.Tz, p.Tgz, p.Tg2z, zPoint, ch.alpha), recombOracle(p.Czs))) return false;
  return p.bundles.every((b, j) => verifyQueryOracle(Number(ch.queryIndices[j]), b, p, ch, zPoint));
}

export const challengesOf = (p: Proof): Challenges =>
  deriveChallenges(ctxOf(p.pub), p.traceRoot, p.compRoot,
    [p.Tz, p.Tgz, p.Tg2z, ...p.Czs], p.friRoots, p.final, p.nonce);

// a nonce whose pow value lands in [2^120, 2^121): kills a 1-bit threshold loosening.
export function bracketNonce(p: Proof): Buffer {
  for (let c = 0; ; c++) {
    const cand = Buffer.alloc(8); cand.writeUInt32BE(1, 0); cand.writeUInt32BE(c, 4);
    const h = sha256(Buffer.concat([p.sFin, Buffer.from([0x02]), cand]));
    let v = 0n; for (const byte of h.subarray(0, 16)) v = (v << 8n) | BigInt(byte);
    if (v >= POW_THRESHOLD && v < 2n ** 121n) return cand;
  }
}

// ===== gear 6e-4: the searched adversarial fixtures (the FRI-load-bearing demos) =====

const Z4: QM31 = [0n, 0n, 0n, 0n];
const P_ = 2147483647n;
// a wrong-trace evaluator: interpolate arbitrary rows over the coset (pair-split, like the oracle)
const wrongTraceAt = (rows: bigint[], z: QPoint): QM31 =>
  pairSplitEval(Array.from({ length: 4 }, (_, k) => ({
    pt: coset[k] as CM31, vPlus: qfromM31(rows[k]), vMinus: qfromM31(rows[7 - k]),
  })), z);

// fully self-consistent wrong-trace prover: commits ITS trace and ITS pointwise composition,
// opens ITS samples, and derives the coordinate openings by the [C(z), 0, 0, 0] recombination
// trick so cair-compose-check PASSES BY CONSTRUCTION. The wrong trace's transition residue makes
// the composition column leave the dim-8 space, so the DEEP column is not low-degree: the size-2
// last layer is non-constant and the terminal rejects -- THE AIR-enforced-through-FRI demo.
// Probabilistic in the drawn-query shape: searched over pubs, shape-asserted by the caller.
export function buildWrongTraceProof(pub: Buffer, rows: bigint[]): Proof {
  return buildHonestProof(pub, {
    traceCol: Array.from({ length: 16 }, (_, q) =>
      wrongTraceAt(rows, embP(queryPoint(BigInt(q)) as CM31))[0]),
    compCol: (alpha) => Array.from({ length: 16 }, (_, q) => {
      const z = embP(queryPoint(BigInt(q)) as CM31);
      return composeOracle(wrongTraceAt(rows, z), wrongTraceAt(rows, cairMask(z, 1)),
                           wrongTraceAt(rows, cairMask(z, 2)), z, alpha);
    }),
    samples: (alpha, z) => {
      const T0 = wrongTraceAt(rows, z), T1 = wrongTraceAt(rows, cairMask(z, 1)), T2 = wrongTraceAt(rows, cairMask(z, 2));
      return [T0, T1, T2, [composeOracle(T0, T1, T2, z, alpha), Z4, Z4, Z4]];
    },
  });
}

// N-GARBAGE: conjugate-symmetric garbage trace AND comp columns, samples derived by the same
// trick (compose-check passes) -- passes every 6d-iv-style check, rejected ONLY at the FRI
// terminal. The wart's tombstone.
export function buildGarbageProof(pub: Buffer, seed = 7919n): Proof {
  const symBase: bigint[] = [];
  const symQ: QM31[] = [];
  for (let k = 0; k < 8; k++) {
    const v = (seed * BigInt(k + 1) * 104729n) % P_;
    symBase.push(v, v);
    const w: QM31 = [(seed + BigInt(k)) % P_, (seed * 31n + BigInt(k)) % P_,
                     (seed * 1299709n + BigInt(k)) % P_, BigInt(k + 4)];
    symQ.push(w, w);
  }
  return buildHonestProof(pub, {
    traceCol: symBase,
    compCol: () => symQ,
    samples: (alpha, z) => {
      const T0: QM31 = [(seed * 11n) % P_, (seed * 13n) % P_, (seed * 17n) % P_, (seed * 19n) % P_];
      const T1: QM31 = [(seed * 23n) % P_, (seed * 29n) % P_, (seed * 37n) % P_, (seed * 41n) % P_];
      const T2: QM31 = [(seed * 43n) % P_, (seed * 47n) % P_, (seed * 53n) % P_, (seed * 59n) % P_];
      return [T0, T1, T2, [composeOracle(T0, T1, T2, z, alpha), Z4, Z4, Z4]];
    },
  });
}

// N-OOD-FRI: lie ONE trace OOD opening, recompute the coordinate openings so compose-check
// passes; committed trees stay HONEST -> the verifier-recomputed DEEP column is not low-degree
// -> terminal abort. Proves FRI is load-bearing for OOD soundness (at rate 1 it could not be).
export function buildLiedOODProof(pub: Buffer): Proof {
  return buildHonestProof(pub, {
    samples: (alpha, z) => {
      const [T0, T1, T2] = open3(z);
      const T0lie = qadd(T0, [13n, 0n, 0n, 0n]);
      return [T0lie, T1, T2, [composeOracle(T0lie, T1, T2, z, alpha), Z4, Z4, Z4]];
    },
  });
}

// RECOMB-CANCEL: a coordinate-tuple lie preserving the recombination (c0 += d, c1 -= d*i^-1):
// compose-check passes while the DEEP quotient inputs change -> terminal abort (searched).
export function buildRecombCancelProof(pub: Buffer): Proof {
  return buildHonestProof(pub, {
    samples: (alpha, z, Ccol) => {
      const [T0, T1, T2] = open3(z);
      const czs = [0, 1, 2, 3].map((j) => compCoordAt(Ccol, j, z));
      const d: QM31 = [7n, 0n, 0n, 0n];
      const iinv = qinv([0n, 1n, 0n, 0n]);
      return [T0, T1, T2, [qadd(czs[0], d), qsub(czs[1], qmul(d, iinv)), czs[2], czs[3]]];
    },
  });
}

// the FRI-sampling-slack ACCEPT fixture (the retired asymmetric fixture's surviving role): the
// committed first layer lies at ONE position s in the HIGH half (k3 = 1); the transmitted final
// is the LOW half's terminal value. Accepted iff every drawn q lands in the low half (the lie
// and the disagreeing terminal both unqueried) -- standard FRI query-sampling slack.
export function buildUnqueriedLieProof(pub: Buffer, s: number, delta: bigint): Proof {
  const b = commitPhase(pub);
  const P0 = deepColumn(b).map((v, i) => (i === s ? qadd(v, [delta, 0n, 0n, 0n]) : v));
  const f = foldPhase(b, P0);
  return assemble(b, f, f.final); // final = V3[0], the low half's value
}
