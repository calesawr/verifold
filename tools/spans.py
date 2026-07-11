#!/usr/bin/env python3
"""M2 span templates: parameter-driven renders of the manifest-tagged spans.

render_span(gear, name, point) -> bytes renders the COMPLETE top-level form(s)
for one m2ParameterSpans entry at a parameter point, consuming
params.derived(point) as the oracle. THE GATE: at params.TOY_POINT every
render is byte-identical to the checked-in gear bytes at the manifest
extents (tools/test_spans.py; flatten.templated_gear enforces it again at
build time). Shape-divergent spans (wire v1 vs v2) pin the toy bytes by
sha256 and re-render the gear slice; editing such a gear span fails loudly
here until the pin AND the full template are revisited together.

Python 3 stdlib only. Consumed by tools/flatten.py --point {toy,full}."""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import params

_QT = "{ c0: uint, c1: uint, c2: uint, c3: uint }"

TEMPLATES = {}


def template(gear, name):
    def register(fn):
        TEMPLATES[(gear, name)] = fn
        return fn
    return register


def render_span(gear, name, point):
    fn = TEMPLATES.get((gear, name))
    if fn is None:
        implemented = ", ".join(f"{g}/{n}" for g, n in sorted(TEMPLATES))
        raise NotImplementedError(
            f"span {gear}/{name}: no template yet (implemented: {implemented})")
    d = params.derived(point)
    return fn(point, d).encode("utf-8")


def list_cap(d):
    """Shared Clarity list cap for the schedule/driver challenge and index
    lists. needed = max(N_LAYERS, n_queries); the floor 32 is the checked-in
    toy cap: caps only need to be >= actual lengths, and shrinking below 32
    would change toy bytes and break the byte-identity gate. The query count
    is read from PARAMS byte 0 (params.py pins the layout n_queries,
    N_LAYERS, BLOWUP, pow_bits, then air_id u32 BE), so callers need only
    the derived dict."""
    return max(32, d["N_LAYERS"], d["PARAMS"][0])


def _ulist(values):
    return "(list " + " ".join(f"u{v}" for v in values) + ")"


# ---------------- Task 9: the 16 pure-constant spans ----------------

@template("query", "DOMAIN_SIZE")
def _q_domain(point, d):
    return f"(define-constant DOMAIN_SIZE u{d['DOMAIN_SIZE']})"


@template("query", "HALF")
def _q_half(point, d):
    return f"(define-constant HALF u{d['DOMAIN_SIZE'] // 2})"


@template("query", "CM_POW_BOUND")
def _q_cm_pow_bound(point, d):
    # cm-pow's max exponent is HALF-1, so the bound is exactly HALF
    return f"(define-constant CM_POW_BOUND u{d['DOMAIN_SIZE'] // 2})"


@template("query", "CM_STEPS")
def _q_cm_steps(point, d):
    # ceil(log2(HALF)) = LOG_DOMAIN - 1 unrolled square-and-multiply bits
    return f"(define-constant CM_STEPS {_ulist(range(d['LOG_DOMAIN'] - 1))})"


def _coset_line(name, pt, d):
    """OFF and H render as an aligned pair (the checked-in toy formatting):
    the name field pads to the wider of the two names, the re literal (with
    its comma) pads to the wider of the two re literals."""
    off, h = d["OFF"], d["H"]
    name_w = max(len("OFF"), len("H"))
    re_w = max(len(f"u{off['re']},"), len(f"u{h['re']},"))
    re_lit = f"u{pt['re']},"
    return (f"(define-constant {name:<{name_w}} "
            f"{{ re: {re_lit:<{re_w}} im: u{pt['im']} }})")


@template("query", "OFF")
def _q_off(point, d):
    return _coset_line("OFF", d["OFF"], d)


@template("query", "H")
def _q_h(point, d):
    return _coset_line("H", d["H"], d)


@template("schedule", "N")
def _s_n(point, d):
    return f"(define-constant N u{point['n_queries']})"


@template("schedule", "L")
def _s_l(point, d):
    return f"(define-constant L u{d['N_LAYERS']})"


@template("schedule", "DOMAIN_SIZE")
def _s_domain(point, d):
    return f"(define-constant DOMAIN_SIZE u{d['DOMAIN_SIZE']})"


@template("schedule", "POW_THRESHOLD")
def _s_pow(point, d):
    return f"(define-constant POW_THRESHOLD u{d['POW_THRESHOLD']})"


@template("schedule", "QUERY_COUNTER")
def _s_counter(point, d):
    return f"(define-constant QUERY_COUNTER {_ulist(range(point['n_queries']))})"


def _sx(point, d):
    return f"(define-constant SX u{d['SX']})"


def _sy(point, d):
    return f"(define-constant SY u{d['SY']})"


TEMPLATES[("cair", "SX")] = _sx
TEMPLATES[("cair", "SY")] = _sy
TEMPLATES[("cdeep", "SX")] = _sx
TEMPLATES[("cdeep", "SY")] = _sy


@template("driver", "PARAMS")
def _d_params(point, d):
    return f"(define-constant PARAMS 0x{d['PARAMS'].hex()})"


# ---------------- Task 10: computed structures ----------------

# Toy pins for spans whose full-point shape DIVERGES from (or must equal)
# the checked-in gear form. The pinned sha256 is of the exact gear slice at
# the definition extents. Editing such a gear span fails here loudly; re-pin
# ONLY together with a review of the full-point template.
TOY_PIN_SHA256 = {
    ("cair", "mask-point"):
        "ea7060861e9612d391dda9bc2b1c4428bb6ca0fb0d29f0aa5c7648ae043b0e90",
    ("cdeep", "deep-row"):
        "c32022d0006810777f41f9db5e2ae4d0a1000007f05e76095ec82fd2c31e3fdc",
}


def _toy_slice(gear, name):
    """The exact checked-in gear bytes of one definition, sha256-pinned."""
    import flatten
    g = flatten.Gear(gear, flatten.read_gear(gear))
    d = g.defs[name]
    text = g.src[d.start:d.end]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    want = TOY_PIN_SHA256[(gear, name)]
    if digest != want:
        raise RuntimeError(
            f"{gear}/{name}: gear span drifted (sha256 {digest}, pinned "
            f"{want}); re-pin ONLY after reviewing the full-point template")
    return text


def _sel(letter):
    def render(point, d):
        return f"(define-constant SEL_{letter} u{d['SEL'][letter]})"
    return render


def _b01(letter):
    def render(point, d):
        return f"(define-constant B01_{letter} u{d['B01'][letter]})"
    return render


for _l in ("A", "B", "C"):
    TEMPLATES[("cair", "SEL_" + _l)] = _sel(_l)
    TEMPLATES[("cair", "B01_" + _l)] = _b01(_l)


@template("query", "BITREV4")
def _q_bitrev_table(point, d):
    if point == params.TOY_POINT:
        bits = d["LOG_DOMAIN"]
        table = [int(format(i, f"0{bits}b")[::-1], 2)
                 for i in range(d["DOMAIN_SIZE"])]
        return f"(define-constant BITREV4 {_ulist(table)})"
    # a 2^LOG_DOMAIN-entry table is infeasible at production size; the lookup
    # is absorbed into the computed bitrev below (see query/bitrev)
    return (";; BITREV4 lookup absorbed at this point: bitrev is computed "
            "over LOG_DOMAIN bits (see bitrev)")


_BITREV_TOY = """(define-read-only (bitrev (q uint))
  (unwrap-panic (element-at? BITREV4 q)))"""


@template("query", "bitrev")
def _q_bitrev_fn(point, d):
    if point == params.TOY_POINT:
        return _BITREV_TOY
    bits = d["LOG_DOMAIN"]
    counter = _ulist(range(bits))
    return f"""(define-private (bitrev-step (i uint) (st {{ q: uint, r: uint }}))
  {{ q: (/ (get q st) u2),
    r: (+ (* (get r st) u2) (mod (get q st) u2)) }})
(define-read-only (bitrev (q uint))
  (begin
    (unwrap-panic (if (< q DOMAIN_SIZE) (some true) none))
    (get r (fold bitrev-step {counter} {{ q: q, r: u0 }}))))"""


@template("cair", "coset-vanish")
def _c_coset_vanish(point, d):
    k = point["log_trace"] - 1  # log2(TRACE_ROWS) - 1 lifted qpi doublings
    body = "(qpi " * k + "zx" + ")" * k
    return (f"(define-read-only (coset-vanish "
            f"(zx {{ c0: uint, c1: uint, c2: uint, c3: uint }}))\n"
            f"  {body})")


@template("cair", "mask-point")
def _c_mask_point(point, d):
    # shape follows the 3-point AIR mask, unchanged in M2; SX/SY are
    # referenced by NAME, so the point enters via the Task 9 constant spans
    return _toy_slice("cair", "mask-point")


@template("cdeep", "deep-row")
def _cd_deep_row(point, d):
    # gamma powers g^0..g^6 and the 3 conjugate-pair batches follow the AIR
    # mask and the 4 comp coordinates, both unchanged in M2
    return _toy_slice("cdeep", "deep-row")


@template("schedule", "fri-beta-step")
def _s_fri_beta_step(point, d):
    cap = list_cap(d)
    return f"""(define-private (fri-beta-step
    (root (buff 32))
    (acc {{ state: (buff 32), betas: (list {cap} {{ c0: uint, c1: uint, c2: uint, c3: uint }}) }}))
  (let ((b (contract-call? .transcript squeeze-qm31 (contract-call? .transcript absorb-root (get state acc) root))))
    {{ state: (get state b),
      betas: (unwrap-panic (as-max-len? (append (get betas acc)
                {{ c0: (get c0 b), c1: (get c1 b), c2: (get c2 b), c3: (get c3 b) }}) u{cap})) }}))"""


@template("schedule", "query-idx-step")
def _s_query_idx_step(point, d):
    cap = list_cap(d)
    return f"""(define-private (query-idx-step
    (i uint)
    (acc {{ state: (buff 32), idx: (list {cap} uint) }}))
  (let ((r (contract-call? .transcript squeeze-m31 (get state acc))))
    {{ state: (get state r),
      idx: (unwrap-panic (as-max-len? (append (get idx acc) (mod (get v r) DOMAIN_SIZE)) u{cap})) }}))"""


# ---------------- Task 11: the generated driver cascade (wire v2) ----------------

TOY_PIN_SHA256.update({
    ("driver", "verify-query"):
        "4247592a537b1e7a36b0d2ec2116591f27949b7223d3a0dd4c77cff7ede9657f",
    ("driver", "query-step"):
        "134c581308a6f9fc54df57fb4038c109338c671e4b6cefd7015a6dbabcaae067",
    ("driver", "verify"):
        "7afb692c56ec3b6064d636b064c5dc0159342126e257e21d93624cc870be9997",
})

_FOLD_ONE_HINT = """(define-read-only (fold-one-hint
    (v { c0: uint, c1: uint, c2: uint, c3: uint })
    (sib { c0: uint, c1: uint, c2: uint, c3: uint })
    (t uint)
    (h uint)
    (beta { c0: uint, c1: uint, c2: uint, c3: uint })
    (pos uint))
  (contract-call? .fri fri-fold-down-hint v
    (list { sibling: sib, x: t, hint: h, beta: beta, v-is-right: (is-eq (mod pos u2) u1) })))"""


def _path_helpers_full(D):
    """Full-depth twins of path-step/path-from-pos/bound-at-pos/pair-bound.
    The toy originals stay in the source verbatim (they are outside every
    span) but their (list 4)/(list 3) caps cannot carry depth-D paths, so
    the generated cascade defines and uses -full variants."""
    return f"""(define-private (path-step-full
    (sib (buff 32))
    (st {{ path: (list {D} {{ sibling: (buff 32), node-is-right: bool }}), pos: uint }}))
  {{ path: (unwrap-panic (as-max-len? (append (get path st)
            {{ sibling: sib, node-is-right: (is-eq (mod (get pos st) u2) u1) }}) u{D})),
    pos: (/ (get pos st) u2) }})
(define-read-only (path-from-pos-full (sibs (list {D} (buff 32))) (pos uint))
  (get path (fold path-step-full sibs {{ path: (list), pos: pos }})))
(define-read-only (bound-at-pos-full
    (v {_QT})
    (sibs (list {D} (buff 32)))
    (pos uint)
    (depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len sibs) depth))
    (contract-call? .merkle merkle-verify (qleaf v) (path-from-pos-full sibs pos) root)))
(define-read-only (pair-bound-full
    (self {_QT})
    (sib {_QT})
    (pos uint)
    (parent-sibs (list {D - 1} (buff 32)))
    (parent-depth uint)
    (root (buff 32)))
  (begin
    (require! (is-eq (len parent-sibs) parent-depth))
    (contract-call? .merkle merkle-verify
      (contract-call? .merkle merkle-root (qleaf self)
        (list {{ sibling: (qleaf sib), node-is-right: (is-eq (mod pos u2) u1) }}))
      (path-from-pos-full parent-sibs (/ pos u2))
      root)))"""


def _line_x(k):
    """Twiddle helper for line layer k: multiplier 2^k and k-1 iterated pi-x
    calls (line-x1/line-x2 already exist in the gear and match this shape)."""
    open_pi = "(contract-call? .fri pi-x " * (k - 1)
    close_pi = ")" * (k - 1)
    m = 2 ** k
    return (f"(define-read-only (line-x{k} (q uint))\n"
            f"  {open_pi}(contract-call? .query query-x "
            f"(* u{m} (even-of (/ q u{m})))){close_pi})")


def _bundle_type(d, pad):
    """Per-query proof bundle tuple type: full-depth t/c paths, the first
    layer pair, one (sib, parent-path) pair per line layer with parent depth
    LOG_DOMAIN-1-k, and the N_LAYERS inverse hints (wire v2)."""
    D, L = d["LOG_DOMAIN"], d["N_LAYERS"]
    rows = [f"t-x: {_QT}, t-sibs: (list {D} (buff 32)),",
            f"c-x: {_QT}, c-sibs: (list {D} (buff 32)),",
            f"p0-sib: {_QT}, p0-sibs: (list {D - 1} (buff 32)),"]
    for k in range(1, L):
        rows.append(f"l{k}-sib: {_QT}, l{k}-sibs: (list {D - 1 - k} (buff 32)),")
    rows.append(f"hints: (list {L} uint) }}")
    return "{ " + ("\n" + " " * pad).join(rows)


def _env_type(d, pad):
    L = d["N_LAYERS"]
    rows = [f"{n}: {_QT}," for n in ("t-z", "t-gz", "t-g2z", "c0-z", "c1-z",
                                     "c2-z", "c3-z", "zx", "zy", "gamma")]
    rows += [f"b{k}: {_QT}," for k in range(L)]
    rows.append("troot: (buff 32), croot: (buff 32),")
    rows.append(" ".join(f"fr{k}: (buff 32)," for k in range(L)))
    rows.append(f"final: {_QT} }}")
    return "{ " + ("\n" + " " * pad).join(rows)


@template("driver", "VERSION")
def _d_version(point, d):
    v = 1 if point == params.TOY_POINT else 2
    return f"(define-constant VERSION 0x{v:02x})"


@template("driver", "verify-query")
def _d_verify_query(point, d):
    if point == params.TOY_POINT:
        return _toy_slice("driver", "verify-query")  # wire v1, untouched
    D, L = d["LOG_DOMAIN"], d["N_LAYERS"]
    parts = [_FOLD_ONE_HINT, _path_helpers_full(D)]
    parts += [_line_x(k) for k in range(3, L)]

    def hint(k):
        return f"(unwrap-panic (element-at? (get hints prf) u{k}))"

    # per-layer semantics mirror driver.clar's toy cascade exactly: position
    # parity routes orientation, pair-bound parents carry depth D-1-k, the
    # circle fold's twiddle slot carries y (fold_circle_into_line), and the
    # final fold value must equal the transmitted degree-0 constant.
    lets = ["(pt (contract-call? .query query-point q))"]
    lets += [f"(k{k} (/ q u{2 ** k}))" for k in range(1, L)]
    lets.append("(g-base (require! (and (is-eq (get c1 (get t-x prf)) u0) "
                "(is-eq (get c2 (get t-x prf)) u0) "
                "(is-eq (get c3 (get t-x prf)) u0))))")
    lets.append(f"(g-t (require! (bound-at-pos-full (get t-x prf) "
                f"(get t-sibs prf) q u{D} (get troot env))))")
    lets.append(f"(g-c (require! (bound-at-pos-full (get c-x prf) "
                f"(get c-sibs prf) q u{D} (get croot env))))")
    lets.append("(p0 (contract-call? .cdeep deep-row (get t-x prf) (get c-x prf) "
                "(get t-z env) (get t-gz env) (get t-g2z env) "
                "(get c0-z env) (get c1-z env) (get c2-z env) (get c3-z env) "
                "(get re pt) (get im pt) (get zx env) (get zy env) (get gamma env)))")
    lets.append(f"(g-p0 (require! (pair-bound-full p0 (get p0-sib prf) q "
                f"(get p0-sibs prf) u{D - 1} (get fr0 env))))")
    lets.append(f"(v1 (fold-one-hint p0 (get p0-sib prf) (y-twiddle q) "
                f"{hint(0)} (get b0 env) q))")
    for k in range(1, L):
        lets.append(f"(g-l{k} (require! (pair-bound-full v{k} (get l{k}-sib prf) "
                    f"k{k} (get l{k}-sibs prf) u{D - 1 - k} (get fr{k} env))))")
        lets.append(f"(v{k + 1} (fold-one-hint v{k} (get l{k}-sib prf) "
                    f"(line-x{k} q) {hint(k)} (get b{k} env) k{k}))")
    lets.append(f"(g-fin (require! (contract-call? .qm31 qm31-eq v{L} "
                f"(get final env))))")
    binds = ("\n" + " " * 8).join(lets)
    parts.append(f"""(define-read-only (verify-query
    (q uint)
    (prf {_bundle_type(d, 11)})
    (env {_env_type(d, 11)}))
  (let ({binds})
    true))""")
    return "\n".join(parts)


@template("driver", "query-step")
def _d_query_step(point, d):
    if point == params.TOY_POINT:
        return _toy_slice("driver", "query-step")
    cap = list_cap(d)
    return f"""(define-private (query-step
    (prf {_bundle_type(d, 11)})
    (st {{ k: uint, idx: (list {cap} uint),
          env: {_env_type(d, 16)} }}))
  (begin
    (require! (verify-query (unwrap-panic (element-at? (get idx st) (get k st))) prf (get env st)))
    {{ k: (+ (get k st) u1), idx: (get idx st), env: (get env st) }}))"""


@template("driver", "verify")
def _d_verify(point, d):
    if point == params.TOY_POINT:
        return _toy_slice("driver", "verify")
    L, n = d["N_LAYERS"], point["n_queries"]
    # same check order as the toy sound entry point: lengths, derive, pow
    # FIRST, betas/index lengths, felt-to-point once, the OOD closure
    # (cair-compose-check, mutation-pinned, DO NOT REMOVE), then the N
    # per-query pipelines via fold. Sequential let bindings preserve order.
    env_rows = ["t-z: t-z, t-gz: t-gz, t-g2z: t-g2z,",
                "c0-z: c0-z, c1-z: c1-z, c2-z: c2-z, c3-z: c3-z,",
                "zx: (get x zp), zy: (get y zp),",
                "gamma: (get gamma ch),"]
    env_rows += [f"b{k}: (unwrap-panic (element-at? (get betas ch) u{k})),"
                 for k in range(L)]
    env_rows.append("troot: trace-root, croot: comp-root,")
    env_rows += [f"fr{k}: (unwrap-panic (element-at? fri-roots u{k})),"
                 for k in range(L)]
    env_rows.append("final: final }")
    env_text = "{ " + ("\n" + " " * 25).join(env_rows)
    return f"""(define-read-only (verify
    (pub (buff 256))
    (trace-root (buff 32))
    (comp-root (buff 32))
    (t-z {_QT})
    (t-gz {_QT})
    (t-g2z {_QT})
    (c0-z {_QT})
    (c1-z {_QT})
    (c2-z {_QT})
    (c3-z {_QT})
    (fri-roots (list {L} (buff 32)))
    (final {_QT})
    (nonce (buff 8))
    (queries (list {n} {_bundle_type(d, 21)})))
  (let ((params (contract-call? .schedule get-params))
        (g-lr (require! (is-eq (len fri-roots) (get l params))))
        (g-nq (require! (is-eq (len queries) (get n params))))
        (ch (contract-call? .schedule derive-challenges (make-ctx pub)
             trace-root comp-root t-z t-gz t-g2z c0-z c1-z c2-z c3-z fri-roots final nonce))
        (g-pow (require! (get pow-ok ch)))
        (g-bl (require! (is-eq (len (get betas ch)) (get l params))))
        (g-ql (require! (is-eq (len (get query-indices ch)) (get n params))))
        (zp (contract-call? .cair felt-to-point (get z ch)))
        (g-ood (require! (contract-call? .cair cair-compose-check
                 t-z t-gz t-g2z (get x zp) (get y zp) (get alpha ch)
                 c0-z c1-z c2-z c3-z)))
        (done (fold query-step queries
                {{ k: u0, idx: (get query-indices ch),
                  env: {env_text} }})))
    true))"""
