import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P, sub, mul } from "./m31";
import { QM31, qeq, qadd, qmul } from "./qm31";
import { queryPoint } from "./query";
import {
  STEP, coset, SEL, B01, feltToPoint, maskPoint, embP, traceAt, open3,
  composeOracle, compColumn, compCoordAt, recombOracle, QPoint,
} from "./cair";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const num = (x: any): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
};
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("c0" in x) && !("x" in x) && !Array.isArray(x) ? x.value : x;
const clQ = (q: QM31) => Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
const limOf = (t: any): QM31 => { const v = deref(t); return [num(v.c0), num(v.c1), num(v.c2), num(v.c3)]; };
const ro = (fn: string, args: any[]) =>
  cvToValue(simnet.callReadOnlyFn("cair", fn, args, deployer).result);
const roQ = (fn: string, args: any[]): QM31 => limOf(ro(fn, args));
const roPt = (fn: string, args: any[]): QPoint => {
  const o = deref(ro(fn, args)) as any;
  return { x: limOf(o.x), y: limOf(o.y) };
};

// ---- the gear-6e worked KATs (panel section 5; reproduced by tools/gear6e_replay.py Phase A) ----
const ALPHA_W: QM31 = [123456789n, 987654321n, 555555n, 7777777n];
const T_W: QM31 = [1414213562n, 271828182n, 314159265n, 161803398n];
const ZX_W: QM31 = [656489050n, 630834971n, 1745520962n, 167974136n];
const ZY_W: QM31 = [1033765766n, 356365651n, 1455119681n, 1402501822n];
const TZ_W: QM31 = [1784839657n, 670412129n, 1426329849n, 162939661n];
const TGZ_W: QM31 = [1734327447n, 72807287n, 1988656840n, 1534497505n];
const TG2Z_W: QM31 = [2064487576n, 349961099n, 1788031226n, 209677812n];
const CZ_W: QM31 = [1723418631n, 869125183n, 1557714445n, 447691938n];
const CZS_W: QM31[] = [
  [429306789n, 313064095n, 1703822704n, 2037616835n],
  [1650667553n, 774468390n, 1926179156n, 992210334n],
  [1661014513n, 272001379n, 349846537n, 1790630116n],
  [506861862n, 814912438n, 2082275275n, 600329196n],
];

describe("cair -- worked KATs (Python-replay-pinned; the panel's section-5 numbers)", () => {
  it("the pinned line constants match the oracle's independent from-the-points derivation", () => {
    expect(SEL).toEqual([1569360727n, 1569360727n, 2147450879n]);
    expect(B01).toEqual([1569360727n, 578122920n, 2147450879n]);
    expect(STEP).toEqual([32768n, 2147450879n]); // == query.clar's H point, different role
    expect(coset[7]).toEqual([coset[0][0], P - coset[0][1]]); // P7 = conj(P0)
    expect(coset[6]).toEqual([coset[1][0], P - coset[1][1]]); // P6 = conj(P1)
  });
  it("felt-to-point(t_W) == the pinned z point (contract == oracle == replay)", () => {
    const pt = roPt("felt-to-point", [clQ(T_W)]);
    expect(pt.x).toEqual(ZX_W);
    expect(pt.y).toEqual(ZY_W);
    const o = feltToPoint(T_W);
    expect(o.x).toEqual(ZX_W);
    expect(o.y).toEqual(ZY_W);
  });
  it("the oracle's pair-split trace evaluation reproduces the pinned OOD openings", () => {
    const z: QPoint = { x: ZX_W, y: ZY_W };
    const [T0, T1, T2] = open3(z);
    expect(T0).toEqual(TZ_W);
    expect(T1).toEqual(TGZ_W);
    expect(T2).toEqual(TG2Z_W);
  });
  it("cair-compose at the pinned openings == C(z) KAT; recomb(c0..c3-z) == the same value", () => {
    expect(roQ("cair-compose", [clQ(TZ_W), clQ(TGZ_W), clQ(TG2Z_W), clQ(ZX_W), clQ(ZY_W), clQ(ALPHA_W)]))
      .toEqual(CZ_W);
    expect(roQ("recomb", [clQ(CZS_W[0]), clQ(CZS_W[1]), clQ(CZS_W[2]), clQ(CZS_W[3])])).toEqual(CZ_W);
    expect(cvToValue(simnet.callReadOnlyFn("cair", "cair-compose-check",
      [clQ(TZ_W), clQ(TGZ_W), clQ(TG2Z_W), clQ(ZX_W), clQ(ZY_W), clQ(ALPHA_W),
       clQ(CZS_W[0]), clQ(CZS_W[1]), clQ(CZS_W[2]), clQ(CZS_W[3])], deployer).result)).toBe(true);
  });
});

describe("cair -- differential vs the independent pair-split oracle", () => {
  it("compose == oracle, and formula-at-z == the COMMITTED polynomial at z (completeness), 12 felts", () => {
    for (let s = 0; s < 12; s++) {
      const t: QM31 = [BigInt(1000 + s), BigInt(2000 + 7 * s), BigInt(31 * s + 5), BigInt(s)];
      const z = roPt("felt-to-point", [clQ(t)]);
      const [T0, T1, T2] = open3(z);
      const got = roQ("cair-compose", [clQ(T0), clQ(T1), clQ(T2), clQ(z.x), clQ(z.y), clQ(ALPHA_W)]);
      expect(got).toEqual(composeOracle(T0, T1, T2, z, ALPHA_W));
      // the committed-poly route: pair-split the 16 LDE composition values to z -- equal iff the
      // formula's quotients are genuinely in the dim-8 space (the membership gate's TS twin)
      const Ccol = compColumn(ALPHA_W);
      const viaPoly = recombOracle([0, 1, 2, 3].map((j) => compCoordAt(Ccol, j, z)));
      expect(got).toEqual(viaPoly);
    }
  });
  it("compose-check accepts the oracle-derived coordinate openings at random felts", () => {
    const t: QM31 = [99991n, 88882n, 77773n, 66664n];
    const z = roPt("felt-to-point", [clQ(t)]);
    const [T0, T1, T2] = open3(z);
    const Ccol = compColumn(ALPHA_W);
    const czs = [0, 1, 2, 3].map((j) => compCoordAt(Ccol, j, z));
    expect(cvToValue(simnet.callReadOnlyFn("cair", "cair-compose-check",
      [clQ(T0), clQ(T1), clQ(T2), clQ(z.x), clQ(z.y), clQ(ALPHA_W),
       clQ(czs[0]), clQ(czs[1]), clQ(czs[2]), clQ(czs[3])], deployer).result)).toBe(true);
  });
});

describe("cair -- oracle-independent structurals", () => {
  it("felt-to-point lands ON THE CIRCLE (x^2 + y^2 == 1 via contract qm31 calls) for 20 felts", () => {
    const one: QM31 = [1n, 0n, 0n, 0n];
    for (let s = 0; s < 20; s++) {
      const t: QM31 = [BigInt(7 + s * s), BigInt(13 * s), BigInt(5 + s), BigInt(11 * s + 3)];
      const pt = roPt("felt-to-point", [clQ(t)]);
      const xx = limOf(cvToValue(simnet.callReadOnlyFn("qm31", "qm31-mul", [clQ(pt.x), clQ(pt.x)], deployer).result));
      const yy = limOf(cvToValue(simnet.callReadOnlyFn("qm31", "qm31-mul", [clQ(pt.y), clQ(pt.y)], deployer).result));
      expect(qadd(xx, yy)).toEqual(one);
    }
  });
  it("mask-point: k=0 is identity; outputs stay on-circle; the +S chain matches the oracle", () => {
    const z = roPt("felt-to-point", [clQ(T_W)]);
    const m0 = roPt("mask-point", [clQ(z.x), clQ(z.y), Cl.uint(0)]);
    expect(m0).toEqual(z);
    for (const k of [1, 2]) {
      const mk = roPt("mask-point", [clQ(z.x), clQ(z.y), Cl.uint(k)]);
      const ok = maskPoint(z, k);
      expect(mk.x).toEqual(ok.x);
      expect(mk.y).toEqual(ok.y);
      expect(qadd(qmul(mk.x, mk.x), qmul(mk.y, mk.y))).toEqual([1n, 0n, 0n, 0n]);
    }
  });
  it("coset-vanish: ZERO at all 8 embedded trace rows, NONZERO at all 16 embedded LDE points", () => {
    const zero: QM31 = [0n, 0n, 0n, 0n];
    for (const pt of coset) {
      expect(roQ("coset-vanish", [clQ([pt[0], 0n, 0n, 0n])])).toEqual(zero);
    }
    for (let q = 0; q < 16; q++) {
      const x = (queryPoint(BigInt(q)) as any)[0] as bigint;
      expect(roQ("coset-vanish", [clQ([x, 0n, 0n, 0n])])).not.toEqual(zero);
    }
  });
  it("line-sel vanishes exactly at rows {6,7}; line-b01 exactly at rows {0,1} (the 8 rows)", () => {
    const zero: QM31 = [0n, 0n, 0n, 0n];
    coset.forEach((pt, k) => {
      const zx: QM31 = [pt[0], 0n, 0n, 0n], zy: QM31 = [pt[1], 0n, 0n, 0n];
      if (k === 6 || k === 7) expect(roQ("line-sel", [clQ(zx), clQ(zy)])).toEqual(zero);
      else expect(roQ("line-sel", [clQ(zx), clQ(zy)])).not.toEqual(zero);
      if (k === 0 || k === 1) expect(roQ("line-b01", [clQ(zx), clQ(zy)])).toEqual(zero);
      else expect(roQ("line-b01", [clQ(zx), clQ(zy)])).not.toEqual(zero);
    });
  });
  it("point-add-base restricted to base inputs == .qm31 cm-mul (the one CM31 group law)", () => {
    for (let i = 0; i < 8; i++) {
      const a = coset[i];
      const got = roPt("point-add-base", [clQ([a[0], 0n, 0n, 0n]), clQ([a[1], 0n, 0n, 0n]),
        Cl.uint(STEP[0]), Cl.uint(STEP[1])]);
      const prod = deref(cvToValue(simnet.callReadOnlyFn("qm31", "cm-mul",
        [Cl.uint(a[0]), Cl.uint(a[1]), Cl.uint(STEP[0]), Cl.uint(STEP[1])], deployer).result)) as any;
      expect(got.x[0]).toBe(num(prod.re));
      expect(got.y[0]).toBe(num(prod.im));
      expect([got.x[1], got.x[2], got.x[3]]).toEqual([0n, 0n, 0n]);
    }
  });
  it("the transition residue is honest: compose's q-trans is ZERO at an OOD z for honest openings of rows 0..5 shape", () => {
    // structural twin of the replay's residue check, via the contract: with honest openings the
    // quotient stays finite and compose == committed-poly route (covered above); here pin that a
    // VIOLATED transition (T2 bumped) changes compose (the constraint is live)
    const z = roPt("felt-to-point", [clQ(T_W)]);
    const [T0, T1, T2] = open3(z);
    const honest = roQ("cair-compose", [clQ(T0), clQ(T1), clQ(T2), clQ(z.x), clQ(z.y), clQ(ALPHA_W)]);
    const lied = roQ("cair-compose", [clQ(T0), clQ(T1), clQ(qadd(T2, [7n, 0n, 0n, 0n])), clQ(z.x), clQ(z.y), clQ(ALPHA_W)]);
    expect(qeq(honest, lied)).toBe(false);
  });
});

describe("cair -- reject channels (abort = safe direction)", () => {
  it("felt-to-point aborts at t = i (1 + t^2 = 0, the stereographic pole)", () => {
    expect(() => ro("felt-to-point", [clQ([0n, 1n, 0n, 0n])])).toThrow();
  });
  it("mask-point aborts for k >= 3", () => {
    expect(() => ro("mask-point", [clQ(ZX_W), clQ(ZY_W), Cl.uint(3)])).toThrow();
  });
  it("cair-compose aborts when z is an embedded TRACE-COSET point (vanishing denominator)", () => {
    const ptc = coset[2];
    expect(() => ro("cair-compose", [clQ(TZ_W), clQ(TGZ_W), clQ(TG2Z_W),
      clQ([ptc[0], 0n, 0n, 0n]), clQ([ptc[1], 0n, 0n, 0n]), clQ(ALPHA_W)])).toThrow();
  });
});
