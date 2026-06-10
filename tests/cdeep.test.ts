import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31, qadd, qsub, qmul, qmulM31, qfromM31, qeq, qinv } from "./qm31";
import { queryPoint, queryX, pix } from "./query";
import { foldStep } from "./fri";
import { STEP, embP, traceAt, open3, compColumn, compCoordAt, feltToPoint, maskPoint, QPoint } from "./cair";
import {
  conjU, lineCoeffs, denomBracket, cembQ, quotTerm, liveBatch, classicBatch,
  pairVanishing, deepRowOracle,
} from "./cdeep";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const num = (x: any): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric");
};
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("c0" in x) && !Array.isArray(x) ? x.value : x;
const clQ = (q: QM31) => Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
const limOf = (t: any): QM31 => { const v = deref(t); return [num(v.c0), num(v.c1), num(v.c2), num(v.c3)]; };
const ro = (fn: string, args: any[]) =>
  cvToValue(simnet.callReadOnlyFn("cdeep", fn, args, deployer).result);
const roQ = (fn: string, args: any[]): QM31 => limOf(ro(fn, args));

// ---- gear-6e worked KATs (panel section 5; reproduced by tools/gear6e_replay.py) ----
const ALPHA_W: QM31 = [123456789n, 987654321n, 555555n, 7777777n];
const GAMMA_W: QM31 = [192837465n, 564738291n, 1029384756n, 1122334455n];
const ZX_W: QM31 = [656489050n, 630834971n, 1745520962n, 167974136n];
const ZY_W: QM31 = [1033765766n, 356365651n, 1455119681n, 1402501822n];
const Z_W: QPoint = { x: ZX_W, y: ZY_W };
const TZ_W: QM31 = [1784839657n, 670412129n, 1426329849n, 162939661n];
const TGZ_W: QM31 = [1734327447n, 72807287n, 1988656840n, 1534497505n];
const TG2Z_W: QM31 = [2064487576n, 349961099n, 1788031226n, 209677812n];
const CZS_W: QM31[] = [
  [429306789n, 313064095n, 1703822704n, 2037616835n],
  [1650667553n, 774468390n, 1926179156n, 992210334n],
  [1661014513n, 272001379n, 349846537n, 1790630116n],
  [506861862n, 814912438n, 2082275275n, 600329196n],
];
const TCOL5 = 235835508n; // Tcol[5] (replay-pinned)
const CCOL5: QM31 = [46161749n, 1469369323n, 489332675n, 285097314n]; // Ccol[5]
const PX5 = 1241207368n, PY5 = 1179735656n; // query_point(5)
const D0_W: [bigint, bigint] = [837613852n, 558741462n];
const D1_W: [bigint, bigint] = [997406053n, 1290671179n];
const D2_W: [bigint, bigint] = [744141278n, 1637303427n];
const P05_W: QM31 = [1135089284n, 87374727n, 1549275727n, 1247420975n];

const callDeepRow = (tX: bigint, cX: QM31, px: bigint, py: bigint, z: QPoint,
                     Tz = TZ_W, Tgz = TGZ_W, Tg2z = TG2Z_W, Czs = CZS_W, gamma = GAMMA_W): QM31 =>
  roQ("deep-row", [clQ(qfromM31(tX)), clQ(cX), clQ(Tz), clQ(Tgz), clQ(Tg2z),
    clQ(Czs[0]), clQ(Czs[1]), clQ(Czs[2]), clQ(Czs[3]),
    Cl.uint(px), Cl.uint(py), clQ(z.x), clQ(z.y), clQ(gamma)]);

describe("cdeep -- worked KATs at q=5 (panel section 5 / replay-pinned)", () => {
  it("denom-inv equals qinv(D) for the three pinned CM31 brackets", () => {
    expect(denomBracket(Z_W, PX5, PY5)).toEqual(D0_W);
    const z1 = { x: limOf(deref(ro2("cair", "mask-point", [clQ(ZX_W), clQ(ZY_W), Cl.uint(1)])).x),
                 y: limOf(deref(ro2("cair", "mask-point", [clQ(ZX_W), clQ(ZY_W), Cl.uint(1)])).y) };
    expect(denomBracket(z1, PX5, PY5)).toEqual(D1_W);
    const z2 = { x: limOf(deref(ro2("cair", "mask-point", [clQ(ZX_W), clQ(ZY_W), Cl.uint(2)])).x),
                 y: limOf(deref(ro2("cair", "mask-point", [clQ(ZX_W), clQ(ZY_W), Cl.uint(2)])).y) };
    expect(denomBracket(z2, PX5, PY5)).toEqual(D2_W);
    for (const [z, D] of [[Z_W, D0_W], [z1, D1_W], [z2, D2_W]] as [QPoint, [bigint, bigint]][]) {
      expect(roQ("denom-inv", [clQ(z.x), clQ(z.y), Cl.uint(PX5), Cl.uint(PY5)]))
        .toEqual(qinv(cembQ(D)));
    }
  });
  it("deep-row at q=5 == the pinned p0(5)", () => {
    expect(callDeepRow(TCOL5, CCOL5, PX5, PY5, Z_W)).toEqual(P05_W);
    expect(deepRowOracle(TCOL5, CCOL5, TZ_W, TGZ_W, TG2Z_W, CZS_W, PX5, PY5, Z_W, GAMMA_W))
      .toEqual(P05_W);
  });
});
const ro2 = (contract: string, fn: string, args: any[]) =>
  cvToValue(simnet.callReadOnlyFn(contract, fn, args, deployer).result);

describe("cdeep -- the two pinned cross-formula identities (sign-error class unrepresentable)", () => {
  it("pair_vanishing(Z, conj_u Z, p) == -2u * D over 20 random points", () => {
    const m2u: QM31 = [0n, 0n, P - 2n, 0n];
    for (let s = 0; s < 20; s++) {
      const t: QM31 = [BigInt(3 + 17 * s), BigInt(41 * s + 1), BigInt(7 * s * s + 2), BigInt(s + 9)];
      const Zr = feltToPoint(t);
      const [px, py] = queryPoint(BigInt(s % 16)) as unknown as [bigint, bigint];
      const pv = pairVanishing(Zr, { x: conjU(Zr.x), y: conjU(Zr.y) }, { x: qfromM31(px), y: qfromM31(py) });
      expect(pv).toEqual(qmul(m2u, cembQ(denomBracket(Zr, px, py))));
    }
  });
  it("per-batch live == 4R*Im_u(Z.y) * classic, for all 3 mask batches at q=5", () => {
    const fourR: QM31 = [8n, 4n, 0n, 0n]; // 4 * (2+i) embedded
    const batches: [QPoint, [QM31, QM31, QM31][]][] = [
      [Z_W, [[qfromM31(TCOL5), TZ_W, [1n, 0n, 0n, 0n]],
             ...[0, 1, 2, 3].map((j) => {
               let g: QM31 = [1n, 0n, 0n, 0n];
               for (let i = 0; i < 3 + j; i++) g = qmul(g, GAMMA_W);
               return [qfromM31(CCOL5[j]), CZS_W[j], g] as [QM31, QM31, QM31];
             })]],
      [maskPoint(Z_W, 1), [[qfromM31(TCOL5), TGZ_W, GAMMA_W]]],
      [maskPoint(Z_W, 2), [[qfromM31(TCOL5), TG2Z_W, qmul(GAMMA_W, GAMMA_W)]]],
    ];
    for (const [z, cols] of batches) {
      const factor = qmul(fourR, cembQ([z.y[2], z.y[3]]));
      expect(liveBatch(z, cols, PX5, PY5)).toEqual(qmul(factor, classicBatch(z, cols, PX5, PY5)));
    }
  });
  it("the z-batch trace term VIA THE CONTRACT (gamma=0 isolates it) matches the classic form", () => {
    // gamma=0 zeroes every comp/mask power, so deep-row degenerates to the z-batch trace quotient
    const zero: QM31 = [0n, 0n, 0n, 0n];
    const got = callDeepRow(TCOL5, CCOL5, PX5, PY5, Z_W, TZ_W, TGZ_W, TG2Z_W, CZS_W, zero);
    const fourR: QM31 = [8n, 4n, 0n, 0n];
    const factor = qmul(fourR, cembQ([ZY_W[2], ZY_W[3]]));
    const classic = classicBatch(Z_W, [[qfromM31(TCOL5), TZ_W, [1n, 0n, 0n, 0n]]], PX5, PY5);
    expect(got).toEqual(qmul(factor, classic));
  });
});

describe("cdeep -- differential + the load-bearing structural", () => {
  const Ccol = compColumn(ALPHA_W);
  const Tcol = Array.from({ length: 16 }, (_, q) => traceAt(embP(queryPoint(BigInt(q)) as any))[0]);
  it("deep-row == oracle for ALL 16 query positions", () => {
    for (let q = 0; q < 16; q++) {
      const [px, py] = queryPoint(BigInt(q)) as unknown as [bigint, bigint];
      expect(callDeepRow(Tcol[q], Ccol[q], px, py, Z_W))
        .toEqual(deepRowOracle(Tcol[q], Ccol[q], TZ_W, TGZ_W, TG2Z_W, CZS_W, px, py, Z_W, GAMMA_W));
    }
  });
  it("the CONTRACT-computed honest DEEP column folds to a CONSTANT size-2 layer (rate 1/2 live)", () => {
    // honest samples: openings + coordinate openings of the committed column at the worked z
    const [T0, T1, T2] = open3(Z_W);
    const czs = [0, 1, 2, 3].map((j) => compCoordAt(Ccol, j, Z_W));
    const col = Array.from({ length: 16 }, (_, q) => {
      const [px, py] = queryPoint(BigInt(q)) as unknown as [bigint, bigint];
      return callDeepRow(Tcol[q], Ccol[q], px, py, Z_W, T0, T1, T2, czs);
    });
    expect(col.every((v, i) => i % 2 === 0 || !qeq(v, col[i - 1]))).toBe(true); // pairs distinct: beta0 live
    const b0: QM31 = [111n, 222n, 333n, 444n], b1: QM31 = [555n, 666n, 777n, 888n], b2: QM31 = [999n, 1010n, 1111n, 1212n];
    const V1 = Array.from({ length: 8 }, (_, k) =>
      foldStep(col[2 * k], col[2 * k + 1], (queryPoint(BigInt(2 * k)) as any)[1], b0));
    const V2 = Array.from({ length: 4 }, (_, m) => foldStep(V1[2 * m], V1[2 * m + 1], queryX(BigInt(4 * m)), b1));
    const V3 = Array.from({ length: 2 }, (_, j) => foldStep(V2[2 * j], V2[2 * j + 1], pix(queryX(BigInt(8 * j))), b2));
    expect(qeq(V3[0], V3[1])).toBe(true);
    // and a conjugate-SYMMETRIC garbage column does NOT (the wart's tombstone, contract-fold level)
    const sym: QM31[] = [];
    for (let k = 0; k < 8; k++) {
      const v: QM31 = [BigInt(1 + k * 7919), BigInt(2 + k * 104729), BigInt(3 + k * 1299709), BigInt(4 + k)];
      sym.push(v, v);
    }
    const W1 = Array.from({ length: 8 }, (_, k) =>
      foldStep(sym[2 * k], sym[2 * k + 1], (queryPoint(BigInt(2 * k)) as any)[1], b0));
    const W2 = Array.from({ length: 4 }, (_, m) => foldStep(W1[2 * m], W1[2 * m + 1], queryX(BigInt(4 * m)), b1));
    const W3 = Array.from({ length: 2 }, (_, j) => foldStep(W2[2 * j], W2[2 * j + 1], pix(queryX(BigInt(8 * j))), b2));
    expect(qeq(W3[0], W3[1])).toBe(false);
  });
});

describe("cdeep -- structurals + reject channels", () => {
  it("conj-u is an involution and fixes the CM31 subfield (via the contract)", () => {
    const a: QM31 = [11n, 22n, 33n, 44n];
    expect(roQ("conj-u", [clQ(roQ("conj-u", [clQ(a)]))])).toEqual(a);
    expect(roQ("conj-u", [clQ([5n, 6n, 0n, 0n])])).toEqual([5n, 6n, 0n, 0n]);
  });
  it("the oracle STEP is the pinned (32768, 2147450879) -- cdeep's own SX/SY transitively pinned by the all-16-q differential", () => {
    expect(STEP).toEqual([32768n, 2147450879n]);
  });
  it("line-coeffs ABORTS when zy has no u-part (degenerate conjugate line)", () => {
    expect(() => ro("line-coeffs", [clQ([7n, 8n, 0n, 0n]), clQ(TZ_W), clQ([1n, 0n, 0n, 0n])])).toThrow();
  });
  it("denom-inv ABORTS on the zero bracket (CM31-valued z point: all u-parts zero)", () => {
    expect(() => ro("denom-inv", [clQ([3n, 4n, 0n, 0n]), clQ([5n, 6n, 0n, 0n]), Cl.uint(7), Cl.uint(9)])).toThrow();
  });
  it("deep-row ABORTS end-to-end when the z point is CM31-valued (degenerate-channel driver twin)", () => {
    expect(() => callDeepRow(TCOL5, CCOL5, PX5, PY5, { x: [3n, 4n, 0n, 0n], y: [5n, 6n, 0n, 0n] })).toThrow();
  });
});
