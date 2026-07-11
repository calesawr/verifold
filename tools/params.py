#!/usr/bin/env python3
"""Parameter-point oracle for the verifold verifier family.

Recomputes every derived gear constant from the circle-group math at any
registered parameter point, so generators and gates certify pinned
constants against the math itself, not just against each other. M1
pinned the toy point; M2 adds the production candidates. flatten.py's
Stage 3 math anchor calls derived() with no argument and must keep
getting the toy values. Stdlib only."""
import json
import sys

P = 2 ** 31 - 1
G = (2, 1268011823)   # Stwo M31_CIRCLE_GEN, order 2^31 on the unit circle

# ---------------- parameter points ----------------
# A point is the free-choice tuple; everything else derives in derived().
# air_id registry is monotonic: 10 is the toy 8-row Fibonacci; 11 is the
# production-trace circle Fibonacci (whichever candidate wins the Stage 0
# measurement); never reuse a retired id.
TOY_POINT = {"log_trace": 3, "log_blowup": 1, "n_queries": 4,
             "pow_bits": 8, "air_id": 10}
CAND_A = {"log_trace": 13, "log_blowup": 4, "n_queries": 23,
          "pow_bits": 8, "air_id": 11}
CAND_B = {"log_trace": 14, "log_blowup": 3, "n_queries": 31,
          "pow_bits": 8, "air_id": 11}
CAND_C = {"log_trace": 15, "log_blowup": 2, "n_queries": 46,
          "pow_bits": 8, "air_id": 11}
FALLBACK_POINT = {"log_trace": 12, "log_blowup": 4, "n_queries": 23,
                  "pow_bits": 8, "air_id": 11}
POINTS = {"TOY_POINT": TOY_POINT, "CAND_A": CAND_A, "CAND_B": CAND_B,
          "CAND_C": CAND_C, "FALLBACK_POINT": FALLBACK_POINT}

# PRODUCTION_POINT: the Stage 0 selection-rule winner. Rule: the cheapest
# candidate that clears 96 conjectured bits (tools/soundness.py) with
# headroom on measured runtime, measured read_length, the flattener's
# 80 KB artifact assert, and Clarity's 1 MB value cap for the proof
# argument. Raw numbers and the recorded reasoning:
# docs/m2-cost-receipts.md (Stage 0 spike measurements, Selection).
# FALLBACK_POINT stays named as the escape hatch if Stage 1 measurement
# invalidates this choice.
PRODUCTION_POINT = CAND_A
POINTS["PRODUCTION_POINT"] = PRODUCTION_POINT

# Legacy toy aliases (M1 import surface), single-sourced from TOY_POINT.
LOG_DOMAIN = TOY_POINT["log_trace"] + TOY_POINT["log_blowup"]
TRACE_ROWS = 2 ** TOY_POINT["log_trace"]
N_QUERIES = TOY_POINT["n_queries"]
FRI_COMMITMENTS = LOG_DOMAIN - 1   # 1 first-layer root + inner line layers
BLOWUP = 2 ** TOY_POINT["log_blowup"]
POW_BITS = TOY_POINT["pow_bits"]
AIR_ID = TOY_POINT["air_id"]


def mmul(a, b):
    return a * b % P


def cmul(a, b):
    """CM31 product == circle-group addition on norm-1 elements."""
    return ((a[0] * b[0] - a[1] * b[1]) % P, (a[0] * b[1] + a[1] * b[0]) % P)


def cpow(b, e):
    r = (1, 0)
    while e:
        if e & 1:
            r = cmul(r, b)
        b = cmul(b, b)
        e >>= 1
    return r


def order_of(pt):
    n, c = 1, pt
    while c != (1, 0):
        c = cmul(c, pt)
        n += 1
    return n


def order_is(pt, n):
    """Exact order check for power-of-two n in O(log n): in the cyclic
    2-group <G>, pt has order exactly n iff pt^n == 1 and pt^(n/2) != 1.
    order_of() stays for the toy pins; this scales to order 2^18."""
    return cpow(pt, n) == (1, 0) and cpow(pt, n >> 1) != (1, 0)


def line_consts(e0, e1):
    """M31 line A*x + B*y + C through two circle points, exactly as
    tools/gear6e_replay.py derives the SEL/B01 pair-vanishing lines."""
    return ((e0[1] - e1[1]) % P, (e1[0] - e0[0]) % P,
            (e0[0] * e1[1] - e0[1] * e1[0]) % P)


def derived(point=None):
    """The derived constants at a parameter point (default: TOY_POINT).

    Exponent map (G has order 2^31 on the circle):
      OFF = G^(2^(30 - LOG_DOMAIN))  canonic coset shift, order 2*DOMAIN_SIZE
      H   = G^(2^(32 - LOG_DOMAIN))  half-coset step, order DOMAIN_SIZE/2
      S   = G^(2^(31 - log_trace))   trace step, order TRACE_ROWS (keys SX/SY)
    At the toy point (log_blowup == 1) H == S numerically; at production
    they diverge. Consumers must read H and SX/SY separately, never one
    for the other.
    """
    p = TOY_POINT if point is None else point
    log_domain = p["log_trace"] + p["log_blowup"]
    n_layers = log_domain - 1   # fold to a size-2 last layer, degree-0 final
    trace_rows = 2 ** p["log_trace"]
    blowup = 2 ** p["log_blowup"]
    off = cpow(G, 2 ** (30 - log_domain))
    h = cpow(G, 2 ** (32 - log_domain))
    s = cpow(G, 2 ** (31 - p["log_trace"]))
    assert order_is(off, 2 ** (log_domain + 1)), "OFF order 2*DOMAIN_SIZE"
    assert order_is(h, 2 ** (log_domain - 1)), "H order DOMAIN_SIZE/2"
    assert order_is(s, trace_rows), "S order TRACE_ROWS"
    if p["log_blowup"] == 1:
        assert h == s, "toy coincidence: H and S share exponent 2^28"
    # Trace coset (gear6e_replay.py convention): point k = INI * S^k with
    # INI = G^(2^(30 - log_trace)); SEL vanishes on the LAST two points
    # (transition selector), B01 on the FIRST two (boundary line).
    ini = cpow(G, 2 ** (30 - p["log_trace"]))
    first0, first1 = ini, cmul(ini, s)
    last0 = cmul(ini, cpow(s, trace_rows - 2))
    last1 = cmul(ini, cpow(s, trace_rows - 1))
    sel = line_consts(last0, last1)
    b01 = line_consts(first0, first1)
    return {
        "LOG_DOMAIN": log_domain,
        "DOMAIN_SIZE": 2 ** log_domain,
        "N_LAYERS": n_layers,
        "BLOWUP": blowup,
        "TRACE_ROWS": trace_rows,
        "OFF": {"re": off[0], "im": off[1]},
        "H": {"re": h[0], "im": h[1]},
        "SX": s[0],
        "SY": s[1],
        "SEL": {"A": sel[0], "B": sel[1], "C": sel[2]},
        "B01": {"A": b01[0], "B": b01[1], "C": b01[2]},
        "POW_THRESHOLD": 2 ** (128 - p["pow_bits"]),
        "PARAMS": bytes([p["n_queries"], n_layers, blowup, p["pow_bits"]])
                  + p["air_id"].to_bytes(4, "big"),
    }


def point_json(name):
    """The derived dict at a registered point as deterministic JSON
    (sorted keys, PARAMS hex-encoded). Consumed by interop/src/params.rs
    (Task 4) and any shell caller via --json."""
    d = derived(POINTS[name])
    d["PARAMS"] = d["PARAMS"].hex()
    return json.dumps(d, sort_keys=True)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--json":
        if sys.argv[2] not in POINTS:
            sys.exit(f"unknown point {sys.argv[2]!r}; one of {sorted(POINTS)}")
        print(point_json(sys.argv[2]))
    elif len(sys.argv) == 1:
        for k, v in derived().items():
            print(k, v.hex() if isinstance(v, bytes) else v)
    else:
        sys.exit("usage: params.py [--json POINT_NAME]")
