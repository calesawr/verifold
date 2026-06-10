import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31, qeq, qadd } from "./qm31";
import { buildTree, rootOf, makeProof, sha256 } from "./merkle";
import { qm31LeafOracle } from "./commit";
import {
  Bundle, Proof, buildHonestProof, buildWrongColumnProof, buildTamperedFinalProof,
  buildPowMissProof, buildGarbageProof, buildLiedOODProof, buildRecombCancelProof,
  buildWrongTraceProof, buildUnqueriedLieProof, verifyOracle, challengesOf, bracketNonce,
  ctxOf, Y, X1, X2, N,
} from "./driver";
import { feltToPoint, composeOracle, recombOracle, open3 } from "./cair";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const num = (x: any): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
};
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("c0" in x) && !Array.isArray(x) ? x.value : x;

const clQ = (q: QM31) => Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
const clBufs = (bs: Buffer[]) => Cl.list(bs.map((b) => Cl.buffer(b)));
const clBundle = (b: Bundle) =>
  Cl.tuple({
    "t-x": clQ(b.tX), "t-sibs": clBufs(b.tSibs),
    "c-x": clQ(b.cX), "c-sibs": clBufs(b.cSibs),
    "p0-sib": clQ(b.p0Sib), "p0-sibs": clBufs(b.p0Sibs),
    "l1-sib": clQ(b.l1Sib), "l1-sibs": clBufs(b.l1Sibs),
    "l2-sib": clQ(b.l2Sib), "l2-sibs": clBufs(b.l2Sibs),
  });

const callVerify = (p: Proof, bundles: Bundle[] = p.bundles) =>
  cvToValue(simnet.callReadOnlyFn("driver", "verify", [
    Cl.buffer(p.pub), Cl.buffer(p.traceRoot), Cl.buffer(p.compRoot),
    clQ(p.Tz), clQ(p.Tgz), clQ(p.Tg2z),
    clQ(p.Czs[0]), clQ(p.Czs[1]), clQ(p.Czs[2]), clQ(p.Czs[3]),
    clBufs(p.friRoots), clQ(p.final), Cl.buffer(p.nonce),
    Cl.list(bundles.map(clBundle)),
  ], deployer).result);

const clEnv = (p: Proof, zOverride?: { zx: QM31; zy: QM31 }) => {
  const ch = challengesOf(p);
  const zp = zOverride ?? (() => { const z = feltToPoint(ch.z); return { zx: z.x, zy: z.y }; })();
  return Cl.tuple({
    "t-z": clQ(p.Tz), "t-gz": clQ(p.Tgz), "t-g2z": clQ(p.Tg2z),
    "c0-z": clQ(p.Czs[0]), "c1-z": clQ(p.Czs[1]), "c2-z": clQ(p.Czs[2]), "c3-z": clQ(p.Czs[3]),
    zx: clQ(zp.zx), zy: clQ(zp.zy), gamma: clQ(ch.gamma),
    b0: clQ(ch.betas[0]), b1: clQ(ch.betas[1]), b2: clQ(ch.betas[2]),
    troot: Cl.buffer(p.traceRoot), croot: Cl.buffer(p.compRoot),
    fr0: Cl.buffer(p.friRoots[0]), fr1: Cl.buffer(p.friRoots[1]), fr2: Cl.buffer(p.friRoots[2]),
    final: clQ(p.final),
  });
};
const callVerifyQuery = (q: number, b: Bundle, p: Proof, zOverride?: { zx: QM31; zy: QM31 }) =>
  cvToValue(simnet.callReadOnlyFn("driver", "verify-query",
    [Cl.uint(q), clBundle(b), clEnv(p, zOverride)], deployer).result);

const ro = (fn: string, args: any[]) =>
  cvToValue(simnet.callReadOnlyFn("driver", fn, args, deployer).result);
const roNum = (fn: string, args: any[]) => num(ro(fn, args));

// ===== gear-6e production KATs (tools/gear6e_replay.py Phase C/D -- from-scratch Python) =====
const K = {
  traceRoot: "eca39e0d0abe745f6f9668e3d4f0b769d42765846ebecd187c214a4934a5d007",
  compRoot: "e821cbaed0e034de24481a6f46f8bbddac2cc400871c18d54e382821b8c4612e",
  alpha: [976437114n, 540963330n, 1950228944n, 1426095703n] as QM31,
  zfelt: [1855804402n, 1279339926n, 785511081n, 1204387820n] as QM31,
  zx: [1946863926n, 814758536n, 2002710776n, 1221223101n] as QM31,
  zy: [1463434508n, 58875128n, 1367301006n, 731190327n] as QM31,
  Tz: [1249131765n, 962824411n, 584016696n, 1268382873n] as QM31,
  Tgz: [2116394001n, 1485142252n, 1881740753n, 282574048n] as QM31,
  Tg2z: [658665903n, 740178082n, 371427577n, 72514719n] as QM31,
  Czs: [
    [761617438n, 1938983537n, 896099383n, 1852251465n],
    [1981338939n, 1006125394n, 1911540458n, 1335711717n],
    [942941990n, 968392833n, 797575289n, 810682276n],
    [466325488n, 1062906208n, 24117612n, 611283779n],
  ] as QM31[],
  gamma: [652251338n, 1064884009n, 1633435380n, 707887319n] as QM31,
  friRoots: [
    "86008d98ae407d5f1ae72b48b3f556ec86c2169992179be29cbc805fbaa45d07",
    "da1f3925443357f25d0bf2ee6b8f6a4691ee4c426e994517387bd7a9086f1c3c",
    "ea64bac389dc1823c28e25f316e3974a6134253731955bab8120a6a466a59a62",
  ],
  betas: [
    [1356251574n, 1770848763n, 48794477n, 1858843852n],
    [712785039n, 1095201317n, 1939912556n, 1035246333n],
    [1975566506n, 1250119226n, 930721263n, 1967639454n],
  ] as QM31[],
  final: [1728659462n, 733804801n, 1737113117n, 1783656706n] as QM31,
  nonce: "0000000000000047",
  queryIndices: [2n, 2n, 0n, 2n], // a DUPLICATE-heavy draw: the DRIVER-3 pin comes free
  ctx: "76657269666f6c642d66732d763101040302080000000ae3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  q2: { px: 967747991n, py: 906276279n,
    p0: [432542606n, 2131764415n, 365363625n, 1965933372n] as QM31,
    v1: [512759802n, 253731430n, 96487438n, 1689612506n] as QM31,
    v2: [671583015n, 1165652851n, 1857636540n, 1913237505n] as QM31 },
};

const HONEST = buildHonestProof(Buffer.alloc(0));
const bump = (q: QM31): QM31 => [(q[0] + 1n) % P, q[1], q[2], q[3]];
const flip = (b: Buffer): Buffer => { const c = Buffer.from(b); c[0] ^= 0x01; return c; };
const flipAt = (sibs: Buffer[], i: number): Buffer[] => sibs.map((s, j) => (j === i ? flip(s) : s));

describe("driver 6e -- the TS mini-prover matches the from-scratch Python replay (KATs)", () => {
  it("roots, challenges, betas, final, nonce, query indices all match", () => {
    expect(HONEST.traceRoot.toString("hex")).toBe(K.traceRoot);
    expect(HONEST.compRoot.toString("hex")).toBe(K.compRoot);
    expect(HONEST.challenges.alpha).toEqual(K.alpha);
    expect(HONEST.challenges.zfelt).toEqual(K.zfelt);
    expect(HONEST.challenges.zPoint.x).toEqual(K.zx);
    expect(HONEST.challenges.zPoint.y).toEqual(K.zy);
    expect(HONEST.Tz).toEqual(K.Tz);
    expect(HONEST.Tgz).toEqual(K.Tgz);
    expect(HONEST.Tg2z).toEqual(K.Tg2z);
    expect(HONEST.Czs).toEqual(K.Czs);
    expect(HONEST.challenges.gamma).toEqual(K.gamma);
    expect(HONEST.friRoots.map((r) => r.toString("hex"))).toEqual(K.friRoots);
    expect(HONEST.challenges.betas).toEqual(K.betas);
    expect(HONEST.final).toEqual(K.final);
    expect(HONEST.nonce.toString("hex")).toBe(K.nonce);
    expect(HONEST.queryIndices).toEqual(K.queryIndices);
  });
  it("first drawn query (q=2) intermediates: p0, v1, v2 (localizes a wrong layer)", () => {
    expect(HONEST.columns.P0[2]).toEqual(K.q2.p0);
    expect(HONEST.columns.V1[1]).toEqual(K.q2.v1);
    expect(HONEST.columns.V2[0]).toEqual(K.q2.v2);
    expect(HONEST.columns.V3[0]).toEqual(K.final); // the degree-0 last layer IS the final
    expect(HONEST.columns.V3[1]).toEqual(K.final); // ... at BOTH positions (honest constancy)
  });
});

describe("driver 6e -- GREEN: end-to-end circle-STARK accept (rate 1/2, FRI load-bearing)", () => {
  it("verify(honest proof) == true on the simnet", () => {
    expect(callVerify(HONEST)).toBe(true);
  });
  it("the independent TS replay agrees", () => {
    expect(verifyOracle(HONEST)).toBe(true);
  });
  it("DRIVER-3 pin: the drawn set [2,2,0,2] is duplicate-heavy and accepted (drawn, not deduped)", () => {
    expect(new Set(HONEST.queryIndices.map(Number)).size).toBeLessThan(4);
    // accepted = the GREEN above; this pin makes the dup-accept behavior named and load-bearing
  });
});

describe("driver 6e -- HONEST-LIVENESS pins (the rate-1 wart's death certificate)", () => {
  it("ALL 8 conjugate pairs of Tcol, Ccol AND the DEEP column differ (beta0/y/orientation LIVE)", () => {
    for (let k = 0; k < 8; k++) {
      expect(HONEST.columns.Tcol[2 * k]).not.toBe(HONEST.columns.Tcol[2 * k + 1]);
      expect(qeq(HONEST.columns.Ccol[2 * k], HONEST.columns.Ccol[2 * k + 1])).toBe(false);
      expect(qeq(HONEST.columns.P0[2 * k], HONEST.columns.P0[2 * k + 1])).toBe(false);
    }
  });
});

describe("driver 6e -- verify-query accepts ALL 16 forced positions (every parity/path branch)", () => {
  it("q = 0..15 with oracle-built env and bundles", () => {
    for (let q = 0; q < 16; q++) {
      expect(callVerifyQuery(q, HONEST.allBundles[q], HONEST)).toBe(true);
    }
  });
});

describe("driver 6e -- ctx + params coherence", () => {
  it("make-ctx matches the oracle and the Python ctx KAT (PARAMS air_id=10, L=3)", () => {
    const got = (cvToValue(simnet.callReadOnlyFn("driver", "make-ctx",
      [Cl.buffer(Buffer.alloc(0))], deployer).result) as string).replace(/^0x/, "");
    expect(got).toBe(K.ctx);
    expect(got).toBe(ctxOf(Buffer.alloc(0)).toString("hex"));
  });
  it("the PARAMS N/L bytes equal schedule's get-params (no constant drift)", () => {
    const params = deref(cvToValue(simnet.callReadOnlyFn("schedule", "get-params", [], deployer).result)) as any;
    const ctx = Buffer.from(K.ctx, "hex");
    expect(num(params.n)).toBe(BigInt(ctx[15]));
    expect(num(params.l)).toBe(BigInt(ctx[16])); // = 3 since gear 6e
    expect(num(params.l)).toBe(3n);
  });
});

describe("driver 6e -- derived twiddles (X3 deleted with the l3 stage)", () => {
  it("line-x1/x2 and y-twiddle match the (unchanged) pinned tables for all 16 q", () => {
    for (let q = 0; q < 16; q++) {
      expect(roNum("line-x1", [Cl.uint(q)])).toBe(X1(2 * ((q >> 1) >> 1)));
      expect(roNum("line-x2", [Cl.uint(q)])).toBe(X2(2 * ((q >> 2) >> 1)));
      expect(roNum("y-twiddle", [Cl.uint(q)])).toBe(Y(q >> 1));
      expect(roNum("y-twiddle", [Cl.uint(q)])).toBe(roNum("y-twiddle", [Cl.uint(q ^ 1)]));
    }
  });
  it("fold-one routes orientation exactly like fri-fold-step in BOTH parities", () => {
    const v: QM31 = [11n, 22n, 33n, 44n], s: QM31 = [55n, 66n, 77n, 88n], beta: QM31 = [3n, 1n, 4n, 1n];
    const t = 906276279n;
    const step = (a: QM31, b: QM31) =>
      deref(cvToValue(simnet.callReadOnlyFn("fri", "fri-fold-step",
        [clQ(a), clQ(b), Cl.uint(t), clQ(beta)], deployer).result));
    const one = (pos: number) =>
      deref(cvToValue(simnet.callReadOnlyFn("driver", "fold-one",
        [clQ(v), clQ(s), Cl.uint(t), clQ(beta), Cl.uint(pos)], deployer).result));
    expect(one(6)).toEqual(step(v, s));
    expect(one(7)).toEqual(step(s, v));
  });
  it("path-from-pos direction bits are the position bits LSB-first (== makeProof)", () => {
    const leaves = Array.from({ length: 16 }, (_, i) => sha256(Buffer.from([i])));
    const lv = buildTree(leaves);
    for (const pos of [0, 5, 10, 15]) {
      const want = makeProof(lv, pos).map((s) => s.nodeIsRight);
      const sibs = makeProof(lv, pos).map((s) => s.sibling);
      const got = (deref(cvToValue(simnet.callReadOnlyFn("driver", "path-from-pos",
        [clBufs(sibs), Cl.uint(pos)], deployer).result)) as any[])
        .map((step: any) => deref(deref(step)["node-is-right"]));
      expect(got).toEqual(want);
    }
  });
  it("pair-bound is order- and position-sensitive; bound-at-pos binds the POSITION", () => {
    const a: QM31 = [1n, 2n, 3n, 4n], b: QM31 = [5n, 6n, 7n, 8n];
    const root = sha256(Buffer.concat([qm31LeafOracle(a), qm31LeafOracle(b)]));
    const pb = (self: QM31, sib: QM31, pos: number) =>
      cvToValue(simnet.callReadOnlyFn("driver", "pair-bound",
        [clQ(self), clQ(sib), Cl.uint(pos), Cl.list([]), Cl.uint(0), Cl.buffer(root)], deployer).result);
    expect(pb(a, b, 0)).toBe(true);
    expect(pb(b, a, 0)).toBe(false);
    expect(pb(b, a, 1)).toBe(true);
    const vals: QM31[] = Array.from({ length: 16 }, (_, i) => [BigInt(i), 0n, 1n, 2n]);
    const lv = buildTree(vals.map(qm31LeafOracle));
    const sibs = makeProof(lv, 5).map((s) => s.sibling);
    const bap = (pos: number) =>
      cvToValue(simnet.callReadOnlyFn("driver", "bound-at-pos",
        [clQ(vals[5]), clBufs(sibs), Cl.uint(pos), Cl.uint(4), Cl.buffer(rootOf(lv))], deployer).result);
    expect(bap(5)).toBe(true);
    expect(bap(4)).toBe(false);
  });
});

describe("driver 6e -- differential across re-randomized fixtures (10 pubs)", () => {
  it("verify == true and the TS replay agrees on every fixture", () => {
    for (let i = 0; i < 10; i++) {
      const p = buildHonestProof(Buffer.from(`verifold-6e-pub-${i}`));
      expect(verifyOracle(p)).toBe(true);
      expect(callVerify(p)).toBe(true);
    }
  }, 180000);
});

// ===== the negative matrix: every lie ABORTS (the per-row toThrow is the meta-audit) =====
describe("driver 6e -- negative matrix: every lie aborts", () => {
  const cases: [string, () => any][] = [
    ["N1 tampered T(x) opening", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, tX: bump(b.tX) } : b)))],
    ["N3 cross-query splice (swap slots 1 and 2: positions 2 and 0)", () =>
      callVerify(HONEST, [HONEST.bundles[0], HONEST.bundles[2], HONEST.bundles[1], HONEST.bundles[3]])],
    ["N4 tampered C(x) opening (a coordinate-column leaf)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 1 ? { ...b, cX: bump(b.cX) } : b)))],
    ["N5 tampered first-layer conjugate witness", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, p0Sib: bump(b.p0Sib) } : b)))],
    ["N6 wrong committed DEEP column, fully rebuilt (RootMismatch class)", () =>
      callVerify(buildWrongColumnProof(Buffer.alloc(0)))],
    ["N7a tampered inner sibling, layer 1", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, l1Sib: bump(b.l1Sib) } : b)))],
    ["N7b tampered inner sibling, layer 2", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 2 ? { ...b, l2Sib: bump(b.l2Sib) } : b)))],
    ["N7d flipped t-sibs[1] (isolates the trace binding)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, tSibs: flipAt(b.tSibs, 1) } : b)))],
    ["N7e flipped c-sibs[1] (isolates the comp binding)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 1 ? { ...b, cSibs: flipAt(b.cSibs, 1) } : b)))],
    ["N7f flipped p0-sibs[1] (isolates the first-layer binding)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 2 ? { ...b, p0Sibs: flipAt(b.p0Sibs, 1) } : b)))],
    ["N7g flipped l1-sibs[0] (isolates the layer-1 binding)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 3 ? { ...b, l1Sibs: flipAt(b.l1Sibs, 0) } : b)))],
    ["N7h flipped l2-sibs[0] (isolates the layer-2 binding)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, l2Sibs: flipAt(b.l2Sibs, 0) } : b)))],
    ["N9 sibling-slot reuse: l1Sib := the carried slot's own value", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) =>
        (i === 0 ? { ...b, l1Sib: HONEST.columns.V1[Number(HONEST.queryIndices[0]) >> 1] } : b)))],
    ["N10a naive tampered final (indices shift / pow misses)", () =>
      callVerify({ ...HONEST, final: bump(HONEST.final) })],
    ["N10b rebuilt tampered final (isolates the degree-0 last-layer check)", () =>
      callVerify(buildTamperedFinalProof(Buffer.alloc(0)))],
    ["N11a grinding miss (zero nonce)", () =>
      callVerify({ ...HONEST, nonce: Buffer.alloc(8) })],
    ["N11b bracket nonce in [2^120, 2^121)", () =>
      callVerify({ ...HONEST, nonce: bracketNonce(HONEST) })],
    ["N11c pow-isolating miss (queries drawn from the failing nonce, bundles self-consistent)", () =>
      callVerify(buildPowMissProof(Buffer.alloc(0)))],
    ["N12 dropped FRI layer (2 roots)", () =>
      callVerify({ ...HONEST, friRoots: HONEST.friRoots.slice(0, 2) })],
    ["N13a short trace path (3 sibs)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, tSibs: b.tSibs.slice(0, 3) } : b)))],
    ["N13b short first-layer parent path (2 sibs)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, p0Sibs: b.p0Sibs.slice(0, 2) } : b)))],
    ["N13c short comp path (3 sibs)", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 2 ? { ...b, cSibs: b.cSibs.slice(0, 3) } : b)))],
    ["N14 queries list of length 3", () =>
      callVerify(HONEST, HONEST.bundles.slice(0, 3))],
    ["N15-iso naive c2-z tamper -- isolates cair-compose-check (aborts there, never reaching FRI)", () =>
      callVerify({ ...HONEST, Czs: [HONEST.Czs[0], HONEST.Czs[1], bump(HONEST.Czs[2]), HONEST.Czs[3]] })],
    ["N19-iso naive T(z+S) tamper -- isolates cair-compose-check", () =>
      callVerify({ ...HONEST, Tgz: bump(HONEST.Tgz) })],
    ["N19b naive T(z) tamper -- compose-check isolator", () =>
      callVerify({ ...HONEST, Tz: bump(HONEST.Tz) })],
    ["N16a non-canonical limb (= p) in t-x", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, tX: [P, 0n, 0n, 0n] as QM31 } : b)))],
    ["N16b slice-aliasing limb (2^32+5) in l2-sib", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) => (i === 0 ? { ...b, l2Sib: [(1n << 32n) + 5n, b.l2Sib[1], b.l2Sib[2], b.l2Sib[3]] as QM31 } : b)))],
    ["N16c non-canonical limb in the OOD coordinate opening c0-z (the schedule absorb path)", () =>
      callVerify({ ...HONEST, Czs: [[P, 0n, 0n, 0n] as QM31, HONEST.Czs[1], HONEST.Czs[2], HONEST.Czs[3]] })],
    ["N17a bit-flipped trace root", () => callVerify({ ...HONEST, traceRoot: flip(HONEST.traceRoot) })],
    ["N17b bit-flipped comp root", () => callVerify({ ...HONEST, compRoot: flip(HONEST.compRoot) })],
    ["N17c bit-flipped fri-roots[2]", () =>
      callVerify({ ...HONEST, friRoots: HONEST.friRoots.map((r, i) => (i === 2 ? flip(r) : r)) })],
    ["N17d swapped fri-roots[1] <-> fri-roots[2]", () =>
      callVerify({ ...HONEST, friRoots: [HONEST.friRoots[0], HONEST.friRoots[2], HONEST.friRoots[1]] })],
    ["N20a short (31-byte) trace root (buff covariance pin)", () =>
      callVerify({ ...HONEST, traceRoot: HONEST.traceRoot.subarray(0, 31) })],
    ["N20b short (16-byte) sibling hash entry", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) =>
        (i === 0 ? { ...b, tSibs: b.tSibs.map((s, j) => (j === 0 ? s.subarray(0, 16) : s)) } : b)))],
    ["N22 t-x with a nonzero u-limb (non-base trace leaf) -- the deterministic require", () =>
      callVerify(HONEST, HONEST.bundles.map((b, i) =>
        (i === 0 ? { ...b, tX: [b.tX[0], 0n, 7n, 0n] as QM31 } : b)))],
  ];
  for (const [name, run] of cases) {
    it(name, () => expect(run).toThrow());
  }
  it("N2-R RESURRECTED: the conjugate position's bundle at q now ABORTS (leaves genuinely differ)", () => {
    const q = Number(HONEST.queryIndices[0]); // 2
    // the 6d-iv vacuity is dead: conjugate bundles are no longer byte-identical...
    expect(HONEST.allBundles[q ^ 1]).not.toEqual(HONEST.allBundles[q]);
    // ...so presenting q^1's bundle at q is a REAL lie, caught by positional binding:
    expect(() => callVerifyQuery(q, HONEST.allBundles[q ^ 1], HONEST)).toThrow();
  });
  it("N2b position splice: a different-pair position's honest bundle at q aborts", () => {
    const q = Number(HONEST.queryIndices[0]);
    expect(() => callVerifyQuery(q, HONEST.allBundles[q ^ 2], HONEST)).toThrow();
  });
  it("verify-query reject channel: degenerate env z (CM31-valued -> zero DEEP denominators) aborts", () => {
    const q = Number(HONEST.queryIndices[0]);
    expect(() => callVerifyQuery(q, HONEST.allBundles[q], HONEST,
      { zx: [3n, 4n, 0n, 0n], zy: [5n, 6n, 0n, 0n] })).toThrow();
  });
  it("sanity: the tamper helpers do not mutate the shared honest fixture", () => {
    expect(callVerify(HONEST)).toBe(true);
  });
});

describe("driver 6e -- boundary accept + cost snapshot", () => {
  it("max-canonical p-1 limbs accepted by the leaf encoder (reject-at-p only)", () => {
    const maxQ: QM31 = [P - 1n, P - 1n, P - 1n, P - 1n];
    const lv = buildTree(Array.from({ length: 16 }, () => qm31LeafOracle(maxQ)));
    const sibs = makeProof(lv, 3).map((x) => x.sibling);
    expect(cvToValue(simnet.callReadOnlyFn("driver", "bound-at-pos",
      [clQ(maxQ), clBufs(sibs), Cl.uint(3), Cl.uint(4), Cl.buffer(rootOf(lv))], deployer).result)).toBe(true);
  });
  it("cost snapshot (informational): one full verify() wall time on simnet", () => {
    const t0 = performance.now();
    expect(callVerify(HONEST)).toBe(true);
    const ms = performance.now() - t0;
    console.log(`driver 6e verify() simnet wall time: ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(60000);
  });
});

// ===== gear 6e-4: the searched adversarial fixtures -- FRI is now LOAD-BEARING =====
describe("driver 6e-4 -- compose-consistent lies rejected ONLY by FRI (searched fixtures)", () => {
  // each fixture needs a drawn q in the HIGH half (k3=1), whose v3 = V3[1] != the transmitted
  // V3[0] -- the searched-shape obligation the spec documents (DRIVER-9's grindability, inverted)
  const hitsHighHalf = (p: Proof) => p.queryIndices.some((q) => Number(q) >= 8);
  const searchPub = (build: (pub: Buffer) => Proof, want: (p: Proof) => boolean, tag: string): Proof => {
    for (let i = 0; i < 64; i++) {
      const p = build(Buffer.from(`${tag}-${i}`));
      if (want(p)) return p;
    }
    throw new Error(`no fixture found for ${tag}`);
  };
  const composePasses = (p: Proof): boolean => {
    const ch = challengesOf(p);
    return qeq(composeOracle(p.Tz, p.Tgz, p.Tg2z, feltToPoint(ch.z), ch.alpha), recombOracle(p.Czs));
  };

  it("N-GARBAGE (the wart's tombstone): conjugate-symmetric garbage passes compose-check, FRI rejects", () => {
    const p = searchPub((pub) => buildGarbageProof(pub), hitsHighHalf, "garbage");
    expect(composePasses(p)).toBe(true);                       // passes every 6d-iv-style check...
    expect(qeq(p.columns.V3[0], p.columns.V3[1])).toBe(false); // ...but the size-2 layer is non-constant
    expect(() => callVerify(p)).toThrow();                     // -> rejected at the FRI terminal
  });
  it("N-OOD-FRI: a lied trace OOD opening with recomputed coordinates -- only FRI catches it", () => {
    const p = searchPub(buildLiedOODProof, hitsHighHalf, "oodlie");
    expect(composePasses(p)).toBe(true);
    expect(() => callVerify(p)).toThrow();
  });
  it("RECOMB-CANCEL: a coordinate-tuple lie preserving the recombination -- only FRI catches it", () => {
    const p = searchPub(buildRecombCancelProof, hitsHighHalf, "recomb");
    expect(composePasses(p)).toBe(true);
    expect(() => callVerify(p)).toThrow();
  });
  it("N23: a transition-violating trace, FULLY self-consistent end-to-end -- the AIR enforced through FRI", () => {
    const p = searchPub((pub) => buildWrongTraceProof(pub, [1n, 1n, 2n, 3n, 6n, 8n, 13n, 21n]),
      hitsHighHalf, "transviol");
    expect(composePasses(p)).toBe(true);
    expect(() => callVerify(p)).toThrow();
  });
  it("N24: a wrong-seed trace ([1,2,3,5,...]) -- the boundary constraint enforced through FRI", () => {
    const p = searchPub((pub) => buildWrongTraceProof(pub, [1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n]),
      hitsHighHalf, "wrongseed");
    expect(composePasses(p)).toBe(true);
    expect(() => callVerify(p)).toThrow();
  });
  it("N22-C committed non-base trace leaves: the step-0 require is LOAD-BEARING (mutant killer)", () => {
    // the prover COMMITS u-limb-tainted trace leaves self-consistently (own deep column, honest
    // samples -- compose passes). The u-shift makes the DEEP column non-low-degree, BUT its
    // poles only surface at the high-half terminal -- so the fixture is searched for a drawn set
    // ENTIRELY in the low half: every downstream check then passes, and the step-0 base-field
    // require is the ONLY rejecting line. Deleting it ACCEPTS this proof (toThrow fails) -- the
    // 6d-iv mutation lesson applied in the accept direction.
    const p = searchPub((pub) => buildHonestProof(pub, {
      traceColQ: HONEST.columns.Tcol.map((v) => [v, 0n, 7n, 0n] as QM31),
    } as any), (cand) => cand.queryIndices.every((q) => Number(q) < 8), "nonbase");
    expect(composePasses(p)).toBe(true);
    expect(qeq(p.columns.V3[0], p.columns.V3[1])).toBe(false); // the taint is real (halves differ)
    expect(() => callVerify(p)).toThrow();                     // ...but ONLY step-0 rejects it here
  });
  it("N15a zero-composition (deterministic): compose-check is the ONLY failing conjunct", () => {
    // C committed as all-zeros with zero coordinate openings: the comp terms vanish from the DEEP
    // row (v=0 -> a=b=0, c*0=0), so Merkle/DEEP/FRI/terminal all pass legitimately; only
    // cair-compose-check (formula != 0) fails -- the compose-check-deletion mutant killer.
    const Z4: any = [0n, 0n, 0n, 0n];
    const p = buildHonestProof(Buffer.from("zero-comp"), {
      compCol: () => Array.from({ length: 16 }, () => Z4),
      samples: (_alpha, z) => {
        const [T0, T1, T2] = open3(z);
        return [T0, T1, T2, [Z4, Z4, Z4, Z4]];
      },
    } as any);
    expect(composePasses(p)).toBe(false);          // the one failing conjunct
    expect(qeq(p.columns.V3[0], p.columns.V3[1])).toBe(true); // FRI side is genuinely clean
    expect(() => callVerify(p)).toThrow();
  });
});

describe("driver 6e-4 -- RATE-PIN + accept-direction pins", () => {
  it("RATE-PIN (deterministic, contract folds): no single final exists for a symmetric non-codeword", () => {
    const b0 = challengesOf(HONEST).betas[0], b1 = challengesOf(HONEST).betas[1], b2 = challengesOf(HONEST).betas[2];
    const cFold = (v: QM31, sib: QM31, t: bigint, beta: QM31, pos: number): QM31 => {
      const o = deref(cvToValue(simnet.callReadOnlyFn("driver", "fold-one",
        [clQ(v), clQ(sib), Cl.uint(t), clQ(beta), Cl.uint(pos)], deployer).result)) as any;
      return [num(o.c0), num(o.c1), num(o.c2), num(o.c3)];
    };
    const sweep = (col: QM31[]): [QM31, QM31] => {
      const V1 = Array.from({ length: 8 }, (_, k) => cFold(col[2 * k], col[2 * k + 1], Y(k), b0, 2 * k));
      const V2 = Array.from({ length: 4 }, (_, m) => cFold(V1[2 * m], V1[2 * m + 1], X1(2 * m), b1, 2 * m));
      return [cFold(V2[0], V2[1], X2(0), b2, 0), cFold(V2[2], V2[3], X2(2), b2, 2)];
    };
    const sym: QM31[] = [];
    for (let k = 0; k < 8; k++) {
      const v: QM31 = [BigInt(1 + k * 7919), BigInt(2 + k * 104729), BigInt(3 + k * 1299709), BigInt(4 + k)];
      sym.push(v, v);
    }
    const [g0, g1] = sweep(sym);
    expect(qeq(g0, g1)).toBe(false); // garbage: NO transmitted constant satisfies both halves
    const [h0, h1] = sweep(HONEST.columns.P0);
    expect(qeq(h0, h1)).toBe(true);  // honest: the same constant at both halves (completeness)
  });
  it("DRIVER-6 pin: a conjugate-overlapping drawn set (q and q^1 both drawn) is accepted", () => {
    const p = (() => {
      for (let i = 0; i < 64; i++) {
        const cand = buildHonestProof(Buffer.from(`conj-overlap-${i}`));
        const s = cand.queryIndices.map(Number);
        if (s.some((q) => s.includes(q ^ 1))) return cand;
      }
      throw new Error("no conjugate-overlapping draw found");
    })();
    expect(callVerify(p)).toBe(true); // each query carries its own conjugate witness independently
  });
  it("FRI sampling slack: a first-layer lie at an UNQUERIED high-half position is ACCEPTED", () => {
    // the retired asymmetric fixture's surviving role: sound behavior, correctly accepted --
    // the committed column lies only where no query (and no terminal disagreement) is sampled.
    let p: Proof | null = null;
    outer: for (let i = 0; i < 300; i++) {
      for (const s of [9, 12, 14]) {
        const cand = buildUnqueriedLieProof(Buffer.from(`slack-${i}-${s}`), s, 5n);
        if (cand.queryIndices.every((q) => Number(q) < 8)) { p = cand; break outer; }
      }
    }
    expect(p).not.toBeNull();
    expect(qeq(p!.columns.V3[0], p!.columns.V3[1])).toBe(false); // the lie is real (halves differ)
    expect(callVerify(p!)).toBe(true);                            // ...but unqueried: accepted
  }, 120000);
});
