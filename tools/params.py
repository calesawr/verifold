#!/usr/bin/env python3
"""Toy-parameter math anchor, factored from tools/gear6e_replay.py.

Recomputes the derived gear constants from the circle-group math so the
flattener's Stage 3 gate certifies the pinned constants against the math
itself, not just against each other. M2's parametric generator consumes
derived() as its parameter oracle at any (log_domain, queries, layers) point;
M1 asserts it at the toy point the KATs pin. Stdlib only."""

P = 2 ** 31 - 1
G = (2, 1268011823)   # Stwo M31_CIRCLE_GEN, order 2^31 on the unit circle
LOG_DOMAIN = 4        # toy: DOMAIN_SIZE = 16 (blowup 2 over 8 trace rows)
TRACE_ROWS = 8
N_QUERIES = 4
FRI_COMMITMENTS = 3   # 1 first-layer root + 2 inner line layers
BLOWUP = 2
POW_BITS = 8
AIR_ID = 10           # u32 BE; monotonic registry, never reuse a retired id


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


def derived():
    """The derived constants at the current parameter point."""
    off = cpow(G, 2 ** 26)  # canonic coset shift, order 32
    h = cpow(G, 2 ** 28)    # half-coset step; numerically == the trace step S
    assert order_of(off) == 2 * (2 ** LOG_DOMAIN)
    assert order_of(h) == TRACE_ROWS
    return {
        "DOMAIN_SIZE": 2 ** LOG_DOMAIN,
        "OFF": {"re": off[0], "im": off[1]},
        "H": {"re": h[0], "im": h[1]},
        "SX": h[0],
        "SY": h[1],
        "POW_THRESHOLD": 2 ** (128 - POW_BITS),
        "PARAMS": bytes([N_QUERIES, FRI_COMMITMENTS, BLOWUP, POW_BITS])
                  + AIR_ID.to_bytes(4, "big"),
    }


if __name__ == "__main__":
    for k, v in derived().items():
        print(k, v.hex() if isinstance(v, bytes) else v)
