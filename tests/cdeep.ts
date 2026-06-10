// Independent oracle for gear 6e's circle DEEP quotients (cdeep.clar): the LIVE Stwo formulas
// (complex_conjugate_line_coeffs + CM31 denominator_inverses + accumulate_row_quotients) with
// Fermat qinv, PLUS the test-only classic form (complex_conjugate_line / pair_vanishing) used by
// the pinned cross-formula identities -- two genuinely independent formulas computing one value,
// so the sign-error class (a real candidate-design bug) is unrepresentable in a green suite.
import { P, sub, mul } from "./m31";
import { QM31, qadd, qsub, qmul, qmulM31, qfromM31, qinv } from "./qm31";
import { QPoint, STEP, maskPoint } from "./cair";

export const conjU = (a: QM31): QM31 => [a[0], a[1], sub(0n, a[2]), sub(0n, a[3])];

export type LineCoeffs = { a: QM31; b: QM31; c: QM31 };
export function lineCoeffs(zy: QM31, v: QM31, w: QM31): LineCoeffs {
  if (zy[2] === 0n && zy[3] === 0n) throw new Error("degenerate line: zy has no u-part");
  const araw = qsub(conjU(v), v);
  const craw = qsub(conjU(zy), zy);
  const braw = qsub(qmul(v, craw), qmul(araw, zy));
  return { a: qmul(w, araw), b: qmul(w, braw), c: qmul(w, craw) };
}

// CM31 denominator bracket D = (Re_u(zx)-px)*Im_u(zy) - (Re_u(zy)-py)*Im_u(zx)
export function denomBracket(z: QPoint, px: bigint, py: bigint): [bigint, bigint] {
  const cm = (a: [bigint, bigint], b: [bigint, bigint]): [bigint, bigint] =>
    [sub(mul(a[0], b[0]), mul(a[1], b[1])), (mul(a[0], b[1]) + mul(a[1], b[0])) % P];
  const t1 = cm([sub(z.x[0], px), z.x[1]], [z.y[2], z.y[3]]);
  const t2 = cm([sub(z.y[0], py), z.y[1]], [z.x[2], z.x[3]]);
  return [sub(t1[0], t2[0]), sub(t1[1], t2[1])];
}
export const cembQ = (c: [bigint, bigint]): QM31 => [c[0], c[1], 0n, 0n];

export const quotTerm = (f: QM31, py: bigint, lc: LineCoeffs): QM31 =>
  qsub(qmul(lc.c, f), qadd(qmulM31(lc.a, py), lc.b));

export function liveBatch(z: QPoint, cols: [QM31, QM31, QM31][], px: bigint, py: bigint): QM31 {
  let num: QM31 = [0n, 0n, 0n, 0n];
  for (const [f, v, w] of cols) num = qadd(num, quotTerm(f, py, lineCoeffs(z.y, v, w)));
  return qmul(num, qinv(cembQ(denomBracket(z, px, py))));
}

// the classic (test-only Stwo) form, for the pinned identity: per column,
// w * (f - interpolant(z, conj z)(p)) / pair_vanishing(z, conj z, p)
export function pairVanishing(e0: QPoint, e1: QPoint, p: QPoint): QM31 {
  return qadd(qadd(qmul(qsub(e0.y, e1.y), p.x), qmul(qsub(e1.x, e0.x), p.y)),
              qsub(qmul(e0.x, e1.y), qmul(e0.y, e1.x)));
}
export function classicBatch(z: QPoint, cols: [QM31, QM31, QM31][], px: bigint, py: bigint): QM31 {
  const zc: QPoint = { x: conjU(z.x), y: conjU(z.y) };
  const pv = pairVanishing(z, zc, { x: qfromM31(px), y: qfromM31(py) });
  let acc: QM31 = [0n, 0n, 0n, 0n];
  for (const [f, v, w] of cols) {
    const interp = qadd(v, qmul(qmul(qsub(conjU(v), v), qsub(qfromM31(py), z.y)),
                                qinv(qsub(conjU(z.y), z.y))));
    acc = qadd(acc, qmul(w, qmul(qsub(f, interp), qinv(pv))));
  }
  return acc;
}

// the full row (deep-row's oracle): batches at {z, z+S, z+2S}, gamma powers in flatten order
export function deepRowOracle(
  tX: bigint | QM31, cX: QM31, Tz: QM31, Tgz: QM31, Tg2z: QM31, Czs: QM31[],
  px: bigint, py: bigint, z: QPoint, gamma: QM31
): QM31 {
  const g: QM31[] = [[1n, 0n, 0n, 0n]];
  for (let i = 0; i < 6; i++) g.push(qmul(g[g.length - 1], gamma));
  const z1 = maskPoint(z, 1), z2 = maskPoint(z, 2);
  const fT = typeof tX === "bigint" ? qfromM31(tX) : tX;
  const b0 = liveBatch(z, [
    [fT, Tz, g[0]],
    ...([0, 1, 2, 3] as const).map((j) => [qfromM31(cX[j]), Czs[j], g[3 + j]] as [QM31, QM31, QM31]),
  ], px, py);
  const b1 = liveBatch(z1, [[fT, Tgz, g[1]]], px, py);
  const b2 = liveBatch(z2, [[fT, Tg2z, g[2]]], px, py);
  return qadd(qadd(b0, b1), b2);
}
