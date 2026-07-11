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
