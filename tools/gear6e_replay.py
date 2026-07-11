#!/usr/bin/env python3
# Gear 6e from-scratch end-to-end replay (independent of BOTH the contracts and the TS oracles).
#
# Phase A: the circle-AIR algebra (coset/LDE disjointness, vanishing, trace interpolation,
#          conjugate-pair distinctness, stereographic map, live Stwo DEEP quotients, the two
#          cross-formula identities, the fold chain to a CONSTANT size-2 layer, negative directions).
# Phase B: the dim-16 membership gate (D3's method): q_t, q_b, C, p0 each INDIVIDUALLY in the
#          dim-8 circle-FFT space, over >= 10 random (alpha, t, gamma) draws. Re-run this gate on
#          ANY future constraint edit -- the point_vanishing (+1-dimension) failure mode is
#          invisible until FRI rejects honest proofs.
# Phase C: the full Fiat-Shamir transcript ping-pong (production-KAT source), byte-identical to
#          transcript.clar/schedule.clar with the 6e arity (7 opening absorbs, L=3).
# Phase D: KAT export for driver.test.ts (JSON).
# Phase E: honest-abort audit (no degenerate channel fires on the honest path).
# Phase F: adversarial pre-validation (N-GARBAGE, N-OOD-FRI, RECOMB-CANCEL, N23/N24) with the
#          real transcript, asserting each documented reject site.
import hashlib, json, random, sys
from params import P, G, cmul, cpow

# ---------- M31 / CM31 / QM31 ----------
def madd(a, b): return (a + b) % P
def msub(a, b): return (a - b) % P
def mmul(a, b): return (a * b) % P
def minv(a): return pow(a, P - 2, P)
def cadd(a, b): return (madd(a[0], b[0]), madd(a[1], b[1]))
def csub(a, b): return (msub(a[0], b[0]), msub(a[1], b[1]))
R = (2, 1)
def qadd(a, b): return tuple(madd(x, y) for x, y in zip(a, b))
def qsub(a, b): return tuple(msub(x, y) for x, y in zip(a, b))
def qmulm(a, s): return tuple(mmul(x, s) for x in a)
def qemb(s): return (s % P, 0, 0, 0)
def cemb(c): return (c[0], c[1], 0, 0)
def qmul(a, b):
    A, B = (a[0], a[1]), (a[2], a[3]); C, D = (b[0], b[1]), (b[2], b[3])
    AC, BD, AD, BC = cmul(A, C), cmul(B, D), cmul(A, D), cmul(B, C)
    RBD = cmul(R, BD)
    return (madd(AC[0], RBD[0]), madd(AC[1], RBD[1]), madd(AD[0], BC[0]), madd(AD[1], BC[1]))
def qpow(a, e):
    r = qemb(1)
    while e:
        if e & 1: r = qmul(r, a)
        a = qmul(a, a); e >>= 1
    return r
def qinv(a): return qpow(a, P**4 - 2)
def conj_u(a): return (a[0], a[1], msub(0, a[2]), msub(0, a[3]))
ONE = qemb(1); Z4 = (0, 0, 0, 0)

# ---------- circle ----------
def gp(idx): return cpow(G, idx % (2**31))
def conj_pt(p): return (p[0], msub(0, p[1]))
def padd(a, b): return (msub(mmul(a[0], b[0]), mmul(a[1], b[1])), madd(mmul(a[0], b[1]), mmul(a[1], b[0])))
def qpadd_base(Zp, b):
    X, Y = Zp; bx, by = b
    return (qsub(qmulm(X, bx), qmulm(Y, by)), qadd(qmulm(X, by), qmulm(Y, bx)))
def on_circle_q(Zp): return qadd(qmul(Zp[0], Zp[0]), qmul(Zp[1], Zp[1])) == ONE

T_INI, T_STEP = 2**27, 2**28
coset = [gp(T_INI + k * T_STEP) for k in range(8)]
STEP_PT = gp(T_STEP)
P0pt, P1pt, P6pt, P7pt = coset[0], coset[1], coset[6], coset[7]
assert P7pt == conj_pt(P0pt) and P6pt == conj_pt(P1pt)
assert STEP_PT == (32768, 2147450879)

OFF, Hq = gp(2**26), gp(2**28)
def domain_point(i):
    base = padd(OFF, cpow(Hq, i if i < 8 else i - 8))
    return base if i < 8 else conj_pt(base)
BITREV4 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]
def query_point(q): return domain_point(BITREV4[q])
lde = [domain_point(i) for i in range(16)]
assert len(set(lde) | set(coset)) == 24, "LDE and trace coset point-disjoint"

def pim(x): return msub(mmul(2, mmul(x, x)), 1)
def piq(X): return qsub(qadd(qmul(X, X), qmul(X, X)), ONE)
for pt in coset: assert pim(pim(pt[0])) == 0
for pt in lde: assert pim(pim(pt[0])) != 0

# ---------- FFT bases + solvers ----------
def basis_m(pt, log=3):
    x, y = pt
    h = [1]
    cur = x
    for _ in range(log - 1):
        nh = h + [mmul(v, cur) for v in h]  # wrong shape for log>2; use explicit chain below
        h = nh; cur = pim(cur)
    # explicit: for log 3 -> [1, x, pi, x*pi]; for log 4 -> ... handled by basis16_m
    return h + [mmul(y, v) for v in h]
def basis8_m(pt):
    x, y = pt; px = pim(x)
    h = [1, x, px, mmul(x, px)]
    return h + [mmul(y, v) for v in h]
def basis8_q(Zp):
    X, Y = Zp; PX = piq(X)
    h = [ONE, X, PX, qmul(X, PX)]
    return h + [qmul(Y, v) for v in h]
def basis16_q(Zp):
    X, Y = Zp; PX = piq(X); P2 = piq(PX)
    h = [ONE, X, PX, qmul(X, PX)]
    h = h + [qmul(P2, v) for v in h]  # [.., pi2, x*pi2, pi*pi2, x*pi*pi2]
    return h + [qmul(Y, v) for v in h]

def solve(rows, rhs, mul, sub, inv, zero):
    n = len(rows); M = [list(r) + [v] for r, v in zip(rows, rhs)]
    for c in range(n):
        piv = next(r for r in range(c, n) if M[r][c] != zero)
        M[c], M[piv] = M[piv], M[c]
        iv = inv(M[c][c]); M[c] = [mul(v, iv) for v in M[c]]
        for r in range(n):
            if r != c and M[r][c] != zero:
                f = M[r][c]; M[r] = [sub(v, mul(f, w)) for v, w in zip(M[r], M[c])]
    return [M[r][n] for r in range(n)]
def solve_m31(rows, rhs): return solve(rows, rhs, mmul, msub, minv, 0)
def solve_q(rows, rhs): return solve(rows, rhs, qmul, qsub, qinv, Z4)

# ---------- the trace ----------
TRACE = [1, 1, 2, 3, 5, 8, 13, 21]
tc = solve_m31([basis8_m(pt) for pt in coset], TRACE)
def T_m(pt): return sum(mmul(c, b) for c, b in zip(tc, basis8_m(pt))) % P
def T_q(Zp):
    acc = Z4
    for c, b in zip(tc, basis8_q(Zp)): acc = qadd(acc, qmulm(b, c))
    return acc
for k in range(8): assert T_m(coset[k]) == TRACE[k]
for k in range(8):
    r = msub(msub(T_m(padd(coset[k], cpow(STEP_PT, 2))), T_m(padd(coset[k], STEP_PT))), T_m(coset[k]))
    assert (r == 0) == (k < 6)
Tcol = [T_m(query_point(q)) for q in range(16)]
assert all(Tcol[2 * k] != Tcol[2 * k + 1] for k in range(8)), "trace conjugate pairs distinct"

# ---------- constraints / composition ----------
def pair_van(e0, e1, Zp):
    return qadd(qadd(qmul(qsub(e0[1], e1[1]), Zp[0]), qmul(qsub(e1[0], e0[0]), Zp[1])),
                qsub(qmul(e0[0], e1[1]), qmul(e0[1], e1[0])))
def embp(pt): return (qemb(pt[0]), qemb(pt[1]))
def q_trans(T0, T1, T2, Zp):
    Ct = qsub(qsub(T2, T1), T0)
    return qmul(qmul(Ct, pair_van(embp(P6pt), embp(P7pt), Zp)), qinv(piq(piq(Zp[0]))))
def q_bound(T0, Zp):
    return qmul(qsub(T0, ONE), qinv(pair_van(embp(P0pt), embp(P1pt), Zp)))
def compose(T0, T1, T2, Zp, alpha):
    return qadd(q_trans(T0, T1, T2, Zp), qmul(alpha, q_bound(T0, Zp)))
def open3(Zp):
    Z1 = qpadd_base(Zp, STEP_PT); Z2 = qpadd_base(Z1, STEP_PT)
    return T_q(Zp), T_q(Z1), T_q(Z2)

def felt_to_point(t):
    tsq = qmul(t, t); dinv = qinv(qadd(ONE, tsq))
    return (qmul(qsub(ONE, tsq), dinv), qmul(qadd(t, t), dinv))

# ---------- live Stwo DEEP quotients ----------
def line_coeffs(ZY, v, w):
    araw = qsub(conj_u(v), v); craw = qsub(conj_u(ZY), ZY)
    braw = qsub(qmul(v, craw), qmul(araw, ZY))
    return qmul(w, araw), qmul(w, braw), qmul(w, craw)
def denom_cm(Zp, px, py):
    zx, zy = Zp
    return csub(cmul(csub((zx[0], zx[1]), (px, 0)), (zy[2], zy[3])),
                cmul(csub((zy[0], zy[1]), (py, 0)), (zx[2], zx[3])))
def batch(Zp, cols, px, py):
    num = Z4
    for f, v, w in cols:
        a, b, c = line_coeffs(Zp[1], v, w)
        num = qadd(num, qsub(qmul(c, f), qadd(qmulm(a, py), b)))
    return qmul(num, qinv(cemb(denom_cm(Zp, px, py))))
def ref_batch(Zp, cols, px, py):  # the test-only classic form (cross-formula identity #2)
    Zc = (conj_u(Zp[0]), conj_u(Zp[1]))
    pv = pair_van(Zp, Zc, (qemb(px), qemb(py)))
    acc = Z4
    for f, v, w in cols:
        interp = qadd(v, qmul(qmul(qsub(conj_u(v), v), qsub(qemb(py), Zp[1])),
                              qinv(qsub(conj_u(Zp[1]), Zp[1]))))
        acc = qadd(acc, qmul(w, qmul(qsub(f, interp), qinv(pv))))
    return acc

def deep_column(Tc, Cc, samples, Zood, gamma):
    # samples = (T0z, T1z, T2z, [c0z..c3z]); columns committed as Tc (base) and Cc (4 coords)
    T0z, T1z, T2z, Czs = samples
    Z1, Z2 = qpadd_base(Zood, STEP_PT), qpadd_base(qpadd_base(Zood, STEP_PT), STEP_PT)
    g = [ONE]
    for _ in range(6): g.append(qmul(g[-1], gamma))
    col = []
    for q in range(16):
        px, py = query_point(q)
        zc = [(qemb(Tc[q]), T0z, g[0])] + [(qemb(Cc[q][j]), Czs[j], g[3 + j]) for j in range(4)]
        col.append(qadd(qadd(batch(Zood, zc, px, py),
                             batch(Z1, [(qemb(Tc[q]), T1z, g[1])], px, py)),
                        batch(Z2, [(qemb(Tc[q]), T2z, g[2])], px, py)))
    return col

def fold(a, b, x, beta): return qadd(qadd(a, b), qmul(beta, qmulm(qsub(a, b), minv(x))))
def chain(col, b0, b1, b2):
    V1 = [fold(col[2 * k], col[2 * k + 1], query_point(2 * k)[1], b0) for k in range(8)]
    V2 = [fold(V1[2 * m], V1[2 * m + 1], query_point(4 * m)[0], b1) for m in range(4)]
    V3 = [fold(V2[2 * j], V2[2 * j + 1], pim(query_point(8 * j)[0]), b2) for j in range(2)]
    return V1, V2, V3

# ============ PHASE A (worked-number checks at the panel's pinned values) ============
alphaW = (123456789, 987654321, 555555, 7777777)
tW = (1414213562, 271828182, 314159265, 161803398)
gammaW = (192837465, 564738291, 1029384756, 1122334455)
ZW = felt_to_point(tW)
assert on_circle_q(ZW)
assert ZW[0] == (656489050, 630834971, 1745520962, 167974136)
assert ZW[1] == (1033765766, 356365651, 1455119681, 1402501822)
T0W, T1W, T2W = open3(ZW)
CW = compose(T0W, T1W, T2W, ZW, alphaW)
assert CW == (1723418631, 869125183, 1557714445, 447691938)
CcolW = []
for q in range(16):
    Zq = embp(query_point(q))
    T0, T1, T2 = open3(Zq)
    CcolW.append(compose(T0, T1, T2, Zq, alphaW))
assert all(CcolW[2 * k] != CcolW[2 * k + 1] for k in range(8)), "comp conjugate pairs distinct"
# coordinate openings: fit the 8 QM31 coefficients, take limb-j coefficient polys at z
ccW = solve_q([basis8_q(embp(query_point(q))) for q in range(8)], CcolW[:8])
for q in range(8, 16):
    acc = Z4
    for c, b in zip(ccW, basis8_q(embp(query_point(q)))): acc = qadd(acc, qmul(c, b))
    assert acc == CcolW[q], "C in the dim-8 space"
def coord_at(cc, j, Zp):
    acc = Z4
    for c, b in zip(cc, basis8_q(Zp)): acc = qadd(acc, qmulm(b, c[j]))
    return acc
CzsW = [coord_at(ccW, j, ZW) for j in range(4)]
recombW = qadd(qadd(CzsW[0], qmul((0, 1, 0, 0), CzsW[1])),
               qadd(qmul((0, 0, 1, 0), CzsW[2]), qmul((0, 0, 0, 1), CzsW[3])))
assert recombW == CW, "from_partial_evals recombination"
# cross-formula identity #1: pair_vanishing(Z, conj_u Z, p) == -2u * D (20 random points)
rng = random.Random(1)
for _ in range(20):
    Zr = felt_to_point(tuple(rng.randrange(P) for _ in range(4)))
    px, py = query_point(rng.randrange(16))
    pv = pair_van(Zr, (conj_u(Zr[0]), conj_u(Zr[1])), (qemb(px), qemb(py)))
    D = denom_cm(Zr, px, py)
    m2u = (0, 0, P - 2, 0)  # -2u
    assert pv == qmul(m2u, cemb(D)), "pv == -2u*D"
# cross-formula identity #2 + worked p0
P0W = deep_column(Tcol, CcolW, (T0W, T1W, T2W, CzsW), ZW, gammaW)
assert P0W[5] == (1135089284, 87374727, 1549275727, 1247420975), "p0(5) worked KAT"
gW = [ONE]
for _ in range(6): gW.append(qmul(gW[-1], gammaW))
Z1W, Z2W = qpadd_base(ZW, STEP_PT), qpadd_base(qpadd_base(ZW, STEP_PT), STEP_PT)
px3, py3 = query_point(3)
for Zp, cols in [(ZW, [(qemb(Tcol[3]), T0W, gW[0])] + [(qemb(CcolW[3][j]), CzsW[j], gW[3 + j]) for j in range(4)]),
                 (Z1W, [(qemb(Tcol[3]), T1W, gW[1])]), (Z2W, [(qemb(Tcol[3]), T2W, gW[2])])]:
    factor = qmul(cemb(cmul((4, 0), R)), cemb((Zp[1][2], Zp[1][3])))
    assert batch(Zp, cols, px3, py3) == qmul(factor, ref_batch(Zp, cols, px3, py3)), "live == 4R*Im_u(y)*classic"
assert all(P0W[2 * k] != P0W[2 * k + 1] for k in range(8)), "p0 conjugate pairs distinct: beta0 LIVE"
b0W, b1W, b2W = (111, 222, 333, 444), (555, 666, 777, 888), (999, 1010, 1111, 1212)
V1W, V2W, V3W = chain(P0W, b0W, b1W, b2W)
assert V3W[0] == V3W[1] == (1184577395, 131963166, 2096653938, 1447119653), "constant terminal"
# negative directions
CzsLie = [CzsW[0], CzsW[1], qadd(CzsW[2], qemb(7)), CzsW[3]]
assert chain(deep_column(Tcol, CcolW, (T0W, T1W, T2W, CzsLie), ZW, gammaW), b0W, b1W, b2W)[2][0] != \
       chain(deep_column(Tcol, CcolW, (T0W, T1W, T2W, CzsLie), ZW, gammaW), b0W, b1W, b2W)[2][1]
assert chain(deep_column(Tcol, CcolW, (T0W, qadd(T1W, qemb(7)), T2W, CzsW), ZW, gammaW), b0W, b1W, b2W)[2][0] != \
       chain(deep_column(Tcol, CcolW, (T0W, qadd(T1W, qemb(7)), T2W, CzsW), ZW, gammaW), b0W, b1W, b2W)[2][1]
rng2 = random.Random(6)
sym = []
for k in range(8):
    v = tuple(rng2.randrange(P) for _ in range(4)); sym += [v, v]
V3g = chain(sym, b0W, b1W, b2W)[2]
assert V3g[0] != V3g[1], "conjugate-symmetric garbage rejected at the terminal"
print("PHASE A: worked-number + identity checks PASS")

# ============ PHASE B: dim-16 membership gate (>= 10 random draws) ============
rows16 = [basis16_q(embp(query_point(q))) for q in range(16)]
def high8_zero(col):
    cf = solve_q(rows16, col)
    # dim-8 subspace = no pi2 factor: x-basis indices 4..7 within each y-half
    return all(cf[i] == Z4 for i in (4, 5, 6, 7, 12, 13, 14, 15))
rngB = random.Random(42)
for trial in range(10):
    a_ = tuple(rngB.randrange(P) for _ in range(4))
    t_ = tuple(rngB.randrange(P) for _ in range(4))
    g_ = tuple(rngB.randrange(P) for _ in range(4))
    Z_ = felt_to_point(t_)
    qt_col, qb_col, c_col = [], [], []
    for q in range(16):
        Zq = embp(query_point(q))
        T0, T1, T2 = open3(Zq)
        qt_col.append(q_trans(T0, T1, T2, Zq))
        qb_col.append(q_bound(T0, Zq))
        c_col.append(compose(T0, T1, T2, Zq, a_))
    assert high8_zero(qt_col), f"q_t membership (trial {trial})"
    assert high8_zero(qb_col), f"q_b membership (trial {trial})"
    assert high8_zero(c_col), f"C membership (trial {trial})"
    cc_ = solve_q([basis8_q(embp(query_point(q))) for q in range(8)], c_col[:8])
    T0z_, T1z_, T2z_ = open3(Z_)
    Czs_ = [coord_at(cc_, j, Z_) for j in range(4)]
    p0_ = deep_column(Tcol, c_col, (T0z_, T1z_, T2z_, Czs_), Z_, g_)
    assert high8_zero(p0_), f"p0 membership (trial {trial})"
print("PHASE B: dim-16 membership gate PASS (10 random draws)")

# ============ PHASE C: full transcript ping-pong (production KATs) ============
sha = lambda b: hashlib.sha256(b).digest()
def enc16(qv):
    for v in qv: assert 0 <= v < P
    return b"".join(v.to_bytes(4, "big") for v in qv)
def absorb(st, tag, msg): return sha(st + bytes([0x00, tag]) + msg)
def absorb_root(st, r): return absorb(st, 0x01, r)
def absorb_qm31(st, qv): return absorb(st, 0x03, enc16(qv))
def absorb_nonce(st, n): return absorb(st, 0x05, n)
def squeeze_m31(st):
    blk = sha(st + bytes([0x01]))
    return int.from_bytes(blk[:16], "big") % P, blk
def squeeze_qm31(st):
    limbs = []
    for _ in range(4):
        v, st = squeeze_m31(st)
        limbs.append(v)
    return tuple(limbs), st
def pow_val(st, nonce): return int.from_bytes(sha(st + bytes([0x02]) + nonce)[:16], "big")
leaf = lambda qv: sha(enc16(qv))
def build_tree(leaves):
    lv = [leaves]
    while len(lv[-1]) > 1:
        cur = lv[-1]
        lv.append([sha(cur[i] + cur[i + 1]) for i in range(0, len(cur), 2)])
    return lv

DOMAIN_LABEL = b"verifold-fs-v1"
PARAMS = bytes([0x04, 0x03, 0x02, 0x08, 0x00, 0x00, 0x00, 0x0a])  # N=4 L=3 blowup=2 pow=8 air_id=10
POW_THRESHOLD = 2**120

def prove(pub, Tc=None, CcOverride=None, sampleOverride=None):
    """The honest mini-prover (or a dishonest one via overrides). Returns the full fixture."""
    Tc = Tc or Tcol
    s0 = sha(DOMAIN_LABEL + bytes([0x01]) + PARAMS + sha(pub))
    trace_lv = build_tree([leaf(qemb(v) if isinstance(v, int) else v) for v in Tc])
    trace_root = trace_lv[-1][0]
    alpha, st = squeeze_qm31(absorb_root(s0, trace_root))
    if CcOverride is not None:
        Cc = CcOverride(alpha)
    else:
        Cc = []
        for q in range(16):
            Zq = embp(query_point(q))
            T0, T1, T2 = open3(Zq)
            Cc.append(compose(T0, T1, T2, Zq, alpha))
    comp_lv = build_tree([leaf(v) for v in Cc])
    comp_root = comp_lv[-1][0]
    zfelt, st = squeeze_qm31(absorb_root(st, comp_root))
    Zood = felt_to_point(zfelt)
    if sampleOverride is not None:
        T0z, T1z, T2z, Czs = sampleOverride(alpha, Zood, Cc)
    else:
        T0z, T1z, T2z = open3(Zood)
        cc_ = solve_q([basis8_q(embp(query_point(q))) for q in range(8)], Cc[:8])
        Czs = [coord_at(cc_, j, Zood) for j in range(4)]
    for v in (T0z, T1z, T2z, *Czs): st = absorb_qm31(st, v)
    gamma, st = squeeze_qm31(st)
    P0c = deep_column(Tc if isinstance(Tc[0], int) else None or Tc, Cc, (T0z, T1z, T2z, Czs), Zood, gamma) \
        if isinstance(Tc[0], int) else None
    # (Tc is always a base-field int list in our fixtures)
    p0_lv = build_tree([leaf(v) for v in P0c]); fri_roots = [p0_lv[-1][0]]
    beta0, st = squeeze_qm31(absorb_root(st, fri_roots[0]))
    V1 = [fold(P0c[2 * k], P0c[2 * k + 1], query_point(2 * k)[1], beta0) for k in range(8)]
    v1_lv = build_tree([leaf(v) for v in V1]); fri_roots.append(v1_lv[-1][0])
    beta1, st = squeeze_qm31(absorb_root(st, fri_roots[1]))
    V2 = [fold(V1[2 * m], V1[2 * m + 1], query_point(4 * m)[0], beta1) for m in range(4)]
    v2_lv = build_tree([leaf(v) for v in V2]); fri_roots.append(v2_lv[-1][0])
    beta2, st = squeeze_qm31(absorb_root(st, fri_roots[2]))
    V3 = [fold(V2[2 * j], V2[2 * j + 1], pim(query_point(8 * j)[0]), beta2) for j in range(2)]
    final = V3[0]  # the transmitted degree-0 LinePoly (honest: V3[0] == V3[1])
    s_fin = absorb_qm31(st, final)
    nonce, c = None, 0
    while True:
        cand = (0).to_bytes(4, "big") + c.to_bytes(4, "big")
        if pow_val(s_fin, cand) < POW_THRESHOLD: nonce = cand; break
        c += 1
    s_n = absorb_nonce(s_fin, nonce)
    qidx, st2 = [], s_n
    for _ in range(4):
        v, st2 = squeeze_m31(st2)
        qidx.append(v % 16)
    return dict(pub=pub, traceRoot=trace_root, compRoot=comp_root, alpha=alpha, zfelt=zfelt,
                Zood=Zood, T0z=T0z, T1z=T1z, T2z=T2z, Czs=Czs, gamma=gamma,
                friRoots=fri_roots, betas=[beta0, beta1, beta2], Tcol=Tc, Ccol=Cc,
                P0col=P0c, V1=V1, V2=V2, V3=V3, final=final, nonce=nonce, nonceCounter=c,
                queryIndices=qidx, sFin=s_fin)

H = prove(b"")
assert H["V3"][0] == H["V3"][1], "honest terminal constant (production transcript)"
# verifier-side per-query replay for ALL 16 q
for q in range(16):
    px, py = query_point(q)
    p0 = H["P0col"][q]
    k1, k2, k3 = q >> 1, q >> 2, q >> 3
    v1 = fold(H["P0col"][q & ~1], H["P0col"][q | 1], query_point(q & ~1)[1], H["betas"][0])
    assert v1 == H["V1"][k1]
    v2 = fold(H["V1"][k1 & ~1], H["V1"][k1 | 1], query_point(2 * (k1 & ~1))[0], H["betas"][1])
    assert v2 == H["V2"][k2]
    v3 = fold(H["V2"][k2 & ~1], H["V2"][k2 | 1], pim(query_point(4 * (k2 & ~1))[0]), H["betas"][2])
    assert v3 == H["final"], f"terminal at q={q}"
print(f"PHASE C: production transcript PASS (nonce counter {H['nonceCounter']}, queries {H['queryIndices']})")

# ============ PHASE E: honest-abort audit ============
tsqH = qmul(H["zfelt"], H["zfelt"])
assert qadd(ONE, tsqH) != Z4, "1 + t^2 != 0"
ZH = H["Zood"]
for Zp in (ZH, qpadd_base(ZH, STEP_PT), qpadd_base(qpadd_base(ZH, STEP_PT), STEP_PT)):
    assert (Zp[1][2], Zp[1][3]) != (0, 0), "mask-point y has a u-part (line non-degenerate)"
    for q in range(16):
        assert denom_cm(Zp, *query_point(q)) != (0, 0), "no zero DEEP denominator"
assert piq(piq(ZH[0])) != Z4, "V(z) != 0"
assert pair_van(embp(P0pt), embp(P1pt), ZH) != Z4, "boundary line nonzero at z"
print("PHASE E: honest-abort audit PASS (48 denominators + all degenerate channels clear)")

# ============ PHASE F: adversarial pre-validation ============
def rejected_at_terminal(F):
    """True iff some position's v3 != transmitted final (i.e. the size-2 halves differ)."""
    V3 = F["V3"]
    return V3[0] != V3[1]

# --- N-GARBAGE: conjugate-symmetric garbage trace+comp; samples derived so compose-check PASSES ---
rngF = random.Random(99)
symT = []
for k in range(8):
    v = rngF.randrange(P); symT += [v, v]
def garbageC(alpha):
    out = []
    for k in range(8):
        v = tuple(rngF.randrange(P) for _ in range(4)); out += [v, v]
    return out
def derivedSamples(alpha, Zood, Cc):
    # arbitrary trace samples; cj-z chosen so recomb == compose formula => compose-check passes
    T0z = tuple(rngF.randrange(P) for _ in range(4))
    T1z = tuple(rngF.randrange(P) for _ in range(4))
    T2z = tuple(rngF.randrange(P) for _ in range(4))
    Cz = compose(T0z, T1z, T2z, Zood, alpha)
    return T0z, T1z, T2z, [Cz, Z4, Z4, Z4]  # recomb([Cz,0,0,0]) == Cz
NG = prove(b"garbage", Tc=symT, CcOverride=garbageC, sampleOverride=derivedSamples)
# compose-check passes by construction:
assert qadd(qadd(NG["Czs"][0], qmul((0, 1, 0, 0), NG["Czs"][1])),
            qadd(qmul((0, 0, 1, 0), NG["Czs"][2]), qmul((0, 0, 0, 1), NG["Czs"][3]))) == \
       compose(NG["T0z"], NG["T1z"], NG["T2z"], NG["Zood"], NG["alpha"])
assert rejected_at_terminal(NG), "N-GARBAGE rejected ONLY at the FRI terminal"

# --- N-OOD-FRI: lied t-z, cj-z recomputed so compose passes; committed trees HONEST ---
def liedOOD(alpha, Zood, Cc):
    T0z, T1z, T2z = open3(Zood)
    T0lie = qadd(T0z, qemb(13))
    Cz = compose(T0lie, T1z, T2z, Zood, alpha)
    return T0lie, T1z, T2z, [Cz, Z4, Z4, Z4]
NO = prove(b"oodlie", sampleOverride=liedOOD)
assert rejected_at_terminal(NO), "N-OOD-FRI rejected at the terminal (compose-check passes)"

# --- RECOMB-CANCEL: coordinate-tuple lie preserving recomb ---
def recombCancel(alpha, Zood, Cc):
    T0z, T1z, T2z = open3(Zood)
    cc_ = solve_q([basis8_q(embp(query_point(q))) for q in range(8)], Cc[:8])
    Czs = [coord_at(cc_, j, Zood) for j in range(4)]
    d = qemb(7)
    iinv = qinv((0, 1, 0, 0))
    lied = [qadd(Czs[0], d), qsub(Czs[1], qmul(d, iinv)), Czs[2], Czs[3]]
    # recomb(lied) == recomb(honest): delta = d + i*(-d*i^-1) = 0
    return T0z, T1z, T2z, lied
RC = prove(b"recomb", sampleOverride=recombCancel)
assert rejected_at_terminal(RC), "RECOMB-CANCEL rejected at the terminal"

# --- N23/N24: wrong trace end-to-end honest ---
def wrong_trace(rows):
    tc_ = solve_m31([basis8_m(pt) for pt in coset], rows)
    return [sum(mmul(c, b) for c, b in zip(tc_, basis8_m(query_point(q)))) % P for q in range(16)]
N23 = prove(b"transviolation", Tc=wrong_trace([1, 1, 2, 3, 6, 8, 13, 21]))
assert rejected_at_terminal(N23), "N23 (transition violation) rejected at the terminal"
N24 = prove(b"wrongseed", Tc=wrong_trace([1, 2, 3, 5, 8, 13, 21, 34]))
assert rejected_at_terminal(N24), "N24 (wrong seed) rejected at the terminal"
print("PHASE F: adversarial pre-validation PASS (N-GARBAGE, N-OOD-FRI, RECOMB-CANCEL, N23, N24)")

# ============ PHASE D: KAT export ============
hx = lambda b: b.hex()
out = {
    "params": PARAMS.hex(), "ctx": (DOMAIN_LABEL + bytes([0x01]) + PARAMS + sha(b"")).hex(),
    "traceRoot": hx(H["traceRoot"]), "compRoot": hx(H["compRoot"]),
    "alpha": H["alpha"], "zfelt": H["zfelt"],
    "zx": H["Zood"][0], "zy": H["Zood"][1],
    "Tz": H["T0z"], "Tgz": H["T1z"], "Tg2z": H["T2z"],
    "Czs": H["Czs"], "gamma": H["gamma"],
    "friRoots": [hx(r) for r in H["friRoots"]], "betas": H["betas"],
    "Tcol": H["Tcol"], "Ccol": H["Ccol"], "P0col": H["P0col"],
    "V1": H["V1"], "V2": H["V2"], "V3": H["V3"], "final": H["final"],
    "nonce": hx(H["nonce"]), "queryIndices": H["queryIndices"],
    "S": STEP_PT, "P0pt": P0pt, "P1pt": P1pt, "P6pt": P6pt, "P7pt": P7pt,
    "SEL": None, "B01": None,  # filled below
    "perQuery": {},
}
# pinned pair-vanishing line constants (M31 lines through base points): A*x + B*y + C
def line_consts(e0, e1):
    return (msub(e0[1], e1[1]), msub(e1[0], e0[0]), msub(mmul(e0[0], e1[1]), mmul(e0[1], e1[0])))
out["SEL"] = line_consts(P6pt, P7pt)
out["B01"] = line_consts(P0pt, P1pt)
assert out["SEL"] == (1569360727, 1569360727, 2147450879)
assert out["B01"] == (1569360727, 578122920, 2147450879)
for q in H["queryIndices"]:
    px, py = query_point(q)
    Zood = H["Zood"]
    Z1, Z2 = qpadd_base(Zood, STEP_PT), qpadd_base(qpadd_base(Zood, STEP_PT), STEP_PT)
    out["perQuery"][str(q)] = {
        "px": px, "py": py,
        "D0": denom_cm(Zood, px, py), "D1": denom_cm(Z1, px, py), "D2": denom_cm(Z2, px, py),
        "p0": H["P0col"][q], "v1": H["V1"][q >> 1], "v2": H["V2"][q >> 2], "v3": H["final"],
    }
_pos = [a for a in sys.argv[1:] if not a.startswith("--") and a not in ("toy", "full")]
dest = _pos[0] if _pos else "/tmp/gear6e-kats.json"
with open(dest, "w") as f:
    json.dump(out, f, indent=1, default=str)
print(f"PHASE D: KATs exported to {dest}")
print("ALL GEAR-6E REPLAY PHASES PASS")

# ============ M2 FULL MODE: production wire-layer replay + KAT export ============
# SCOPE (honest): at the production point this replay covers the WIRE LAYER and the
# FOLD ARITHMETIC only. It consumes the trace and composition COLUMNS exported by the
# Rust prover (interop/fixtures/columns-full.json, gitignored, regenerated on demand:
#   cd interop && cargo run --release --bin prove -- --point full --dump-columns
# ) and independently recomputes: both Merkle trees and roots, the full transcript
# schedule (alpha, z, gamma, every beta, the pow check, the query indices), the DEEP
# quotient column, the complete fold chains with hint checks, and the final value,
# asserting every value equals the Rust fixture. The from-scratch interpolation and
# the dim-membership gate remain TOY-ONLY; they re-ran above (module-level phases),
# as this file's header requires. docs/m2-soundness.md discloses this scope split.


def bitrev(i, log):
    r = 0
    for _ in range(log):
        r = (r << 1) | (i & 1)
        i >>= 1
    return r


def batch_minv(xs):
    """Montgomery batch inversion in M31: one minv + 3n mults."""
    pref = [1] * (len(xs) + 1)
    for i, x in enumerate(xs):
        pref[i + 1] = pref[i] * x % P
    inv = minv(pref[-1])
    out = [0] * len(xs)
    for i in range(len(xs) - 1, -1, -1):
        out[i] = pref[i] * inv % P
        inv = inv * xs[i] % P
    return out


def batch_qinv(xs):
    """Montgomery batch inversion in QM31 (one qinv total)."""
    pref = [ONE] * (len(xs) + 1)
    for i, x in enumerate(xs):
        pref[i + 1] = qmul(pref[i], x)
    inv = qinv(pref[-1])
    out = [Z4] * len(xs)
    for i in range(len(xs) - 1, -1, -1):
        out[i] = qmul(pref[i], inv)
        inv = qmul(inv, xs[i])
    return out


def fold_i(a, b, xinv, beta):
    """fold with a PRECOMPUTED twiddle inverse (batch-inverted; hints are checked
    separately against these same twiddles, never trusted for the chain itself)."""
    return qadd(qadd(a, b), qmul(beta, qmulm(qsub(a, b), xinv)))


def pim_iter(x, k):
    for _ in range(k):
        x = pim(x)
    return x


def tree_sibs(lv, idx):
    """Bare sibling hashes leaf to root from a build_tree level list."""
    return [lv[d][(idx >> d) ^ 1] for d in range(len(lv) - 1)]


def run_full_replay():
    import params as _pp
    point = _pp.PRODUCTION_POINT
    dv = _pp.derived(point)
    log_d = point["log_trace"] + point["log_blowup"]
    n = 2 ** log_d
    half = n // 2
    n_layers = log_d - 1
    nq = point["n_queries"]
    STEPf = cpow(G, 2 ** (31 - point["log_trace"]))
    assert (STEPf[0], STEPf[1]) == (dv["SX"], dv["SY"]), "trace step matches the oracle"
    # the FS-ordered LDE domain from the oracle's OFF/H (independent circle math)
    off = (dv["OFF"]["re"], dv["OFF"]["im"])
    hstep = (dv["H"]["re"], dv["H"]["im"])
    dpts = [None] * n
    cur = off
    for i in range(half):
        dpts[i] = cur
        dpts[half + i] = conj_pt(cur)
        cur = padd(cur, hstep)
    fs_pts = [dpts[bitrev(q, log_d)] for q in range(n)]
    assert all(fs_pts[2 * k][0] == fs_pts[2 * k + 1][0]
               and fs_pts[2 * k][1] == (P - fs_pts[2 * k + 1][1]) % P
               for k in range(half)), "FS adjacency = conjugate pairs at production size"

    fixtures = json.load(open("interop/fixtures/rust-proofs-full.json"))
    cols = json.load(open("interop/fixtures/columns-full.json"))
    assert len(fixtures) == 3, "three production proofs"
    Tc = cols["tcol"]
    assert len(Tc) == n and all(0 <= v < P for v in Tc), "trace column shape"
    PARAMSf = dv["PARAMS"]
    kat = None

    for f in fixtures:
        pub = bytes.fromhex(f["pub"])
        Cc = [tuple(v) for v in cols["perPub"][f["pub"]]["ccol"]]
        assert len(Cc) == n, "composition column shape"

        # ---- transcript: ctx (VERSION 0x02) -> alpha -> z -> gamma ----
        s0 = sha(DOMAIN_LABEL + bytes([0x02]) + PARAMSf + sha(pub))
        trace_lv = build_tree([leaf(qemb(v)) for v in Tc])
        assert trace_lv[-1][0].hex() == f["traceRoot"], "trace root"
        alpha, st = squeeze_qm31(absorb_root(s0, trace_lv[-1][0]))
        comp_lv = build_tree([leaf(v) for v in Cc])
        assert comp_lv[-1][0].hex() == f["compRoot"], "comp root"
        zfelt, st = squeeze_qm31(absorb_root(st, comp_lv[-1][0]))
        Zood = felt_to_point(zfelt)
        assert on_circle_q(Zood), "z on the circle"
        T0z, T1z, T2z = tuple(f["Tz"]), tuple(f["Tgz"]), tuple(f["Tg2z"])
        Czs = [tuple(c) for c in f["Czs"]]
        for v in (T0z, T1z, T2z, *Czs):
            st = absorb_qm31(st, v)
        gamma, st = squeeze_qm31(st)

        # ---- the DEEP column from the exported columns (own formulas + batch inv) ----
        Z1 = qpadd_base(Zood, STEPf)
        Z2 = qpadd_base(Z1, STEPf)
        g = [ONE]
        for _ in range(6):
            g.append(qmul(g[-1], gamma))
        cf0 = [line_coeffs(Zood[1], v, w) for v, w in
               [(T0z, g[0]), (Czs[0], g[3]), (Czs[1], g[4]),
                (Czs[2], g[5]), (Czs[3], g[6])]]
        cf1 = [line_coeffs(Z1[1], T1z, g[1])]
        cf2 = [line_coeffs(Z2[1], T2z, g[2])]
        dinv0 = batch_qinv([cemb(denom_cm(Zood, px, py)) for px, py in fs_pts])
        dinv1 = batch_qinv([cemb(denom_cm(Z1, px, py)) for px, py in fs_pts])
        dinv2 = batch_qinv([cemb(denom_cm(Z2, px, py)) for px, py in fs_pts])

        def numer(cfs, fvals, py):
            acc = Z4
            for (a, b, c), fv in zip(cfs, fvals):
                acc = qadd(acc, qsub(qmul(c, fv), qadd(qmulm(a, py), b)))
            return acc

        P0c = []
        for q in range(n):
            px, py = fs_pts[q]
            f0 = [qemb(Tc[q]), qemb(Cc[q][0]), qemb(Cc[q][1]),
                  qemb(Cc[q][2]), qemb(Cc[q][3])]
            P0c.append(qadd(qadd(qmul(numer(cf0, f0, py), dinv0[q]),
                                 qmul(numer(cf1, [qemb(Tc[q])], py), dinv1[q])),
                            qmul(numer(cf2, [qemb(Tc[q])], py), dinv2[q])))

        # ---- FRI: roots, betas, the complete fold chain with OWN twiddles ----
        p0_lv = build_tree([leaf(v) for v in P0c])
        assert p0_lv[-1][0].hex() == f["friRoots"][0], "fri root 0"
        own_fri_roots = [p0_lv[-1][0].hex()]
        beta, st = squeeze_qm31(absorb_root(st, p0_lv[-1][0]))
        betas = [beta]
        tw = batch_minv([fs_pts[2 * k][1] for k in range(half)])
        curL = [fold_i(P0c[2 * k], P0c[2 * k + 1], tw[k], beta) for k in range(half)]
        line_layers, line_lvs = [], []
        for l in range(1, n_layers):
            lv = build_tree([leaf(v) for v in curL])
            assert lv[-1][0].hex() == f["friRoots"][l], f"fri root {l}"
            own_fri_roots.append(lv[-1][0].hex())
            beta, st = squeeze_qm31(absorb_root(st, lv[-1][0]))
            betas.append(beta)
            line_layers.append(curL)
            line_lvs.append(lv)
            m_ = len(curL) // 2
            tw = batch_minv([pim_iter(fs_pts[mm << (l + 1)][0], l - 1)
                             for mm in range(m_)])
            curL = [fold_i(curL[2 * mm], curL[2 * mm + 1], tw[mm], beta)
                    for mm in range(m_)]
        own_final = curL[0]
        assert len(curL) == 2 and curL[0] == curL[1] == tuple(f["final"]), "constant terminal == final"

        # ---- grind + query draw ----
        s_fin = absorb_qm31(st, own_final)
        nonce = bytes.fromhex(f["nonce"])
        assert pow_val(s_fin, nonce) < dv["POW_THRESHOLD"], "pow grind"
        st2 = absorb_nonce(s_fin, nonce)
        qidx = []
        for _ in range(nq):
            v, st2 = squeeze_m31(st2)
            qidx.append(v % n)
        assert qidx == f["queryIndices"], "query indices"

        # ---- per-query bundles: openings, sibs, and the v2 hints ----
        for q, b in zip(qidx, f["bundles"]):
            assert b["tX"] == [Tc[q], 0, 0, 0], f"tX at q={q}"
            assert [s.hex() for s in tree_sibs(trace_lv, q)] == b["tSibs"], f"tSibs q={q}"
            assert tuple(b["cX"]) == Cc[q], f"cX at q={q}"
            assert [s.hex() for s in tree_sibs(comp_lv, q)] == b["cSibs"], f"cSibs q={q}"
            assert tuple(b["p0Sib"]) == P0c[q ^ 1], f"p0Sib at q={q}"
            assert [s.hex() for s in tree_sibs(p0_lv, q)[1:]] == b["p0Sibs"], f"p0Sibs q={q}"
            for j in range(n_layers - 1):
                k = q >> (j + 1)
                lsj = b["lineSibs"][j]
                assert tuple(lsj["sib"]) == line_layers[j][k ^ 1], f"line sib {j} q={q}"
                assert [s.hex() for s in tree_sibs(line_lvs[j], k)[1:]] == lsj["sibs"], \
                    f"line sibs {j} q={q}"
            hints = b["hints"]
            assert len(hints) == n_layers, f"hints length at q={q}"
            assert hints[0] * fs_pts[q & ~1][1] % P == 1, f"hint 0 inverts y_q at q={q}"
            for l in range(1, n_layers):
                x_l = pim_iter(fs_pts[((q >> l) & ~1) << l][0], l - 1)
                assert hints[l] * x_l % P == 1, f"hint {l} inverts x_{l} at q={q}"
        print(f"FULL REPLAY pub={f['pub']!r}: transcript, trees, DEEP, {n_layers}-layer "
              f"fold chain, and hints all match the Rust fixture")

        if f["pub"] == "":
            # the union KAT schema the plan header pins: betas carries ALL
            # N_LAYERS betas in fold order, the OOD openings ride along
            kat = {
                "point": "PRODUCTION_POINT", "pub": f["pub"],
                "ctx": (DOMAIN_LABEL + bytes([0x02]) + PARAMSf + sha(b"")).hex(),
                "traceRoot": trace_lv[-1][0].hex(), "compRoot": comp_lv[-1][0].hex(),
                "alpha": alpha, "zfelt": zfelt, "zx": Zood[0], "zy": Zood[1],
                "Tz": T0z, "Tgz": T1z, "Tg2z": T2z, "Czs": Czs,
                "gamma": gamma, "friRoots": own_fri_roots, "betas": betas,
                "final": own_final, "nonce": f["nonce"], "queryIndices": qidx,
            }

    with open("tools/kats-full.json", "w") as fh:
        json.dump(kat, fh, indent=1, default=str)
    print("FULL KATs exported to tools/kats-full.json")


if "--point" in sys.argv:
    _val = sys.argv[sys.argv.index("--point") + 1]
    assert _val in ("toy", "full"), f"--point takes toy or full, got {_val}"
    if _val == "full":
        run_full_replay()
