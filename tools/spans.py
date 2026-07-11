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
