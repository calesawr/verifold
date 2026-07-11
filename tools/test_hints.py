#!/usr/bin/env python3
"""Wire-v2 hint check: every emitted hint is the modular inverse of the twiddle the
full driver derives for that query and layer. Twiddles are recomputed HERE from
params.py circle math only (no Stwo, no contract): hints[0] inverts y_q (the im of the
EVEN FS member of q's conjugate pair); hints[k] inverts the layer-k line twiddle
x_k = pi^(k-1)(query_x(2^k * even(q >> k))). Skips with exit 0 when the full fixtures
are absent (they are committed by the production proving run task)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from params import P, G, cmul, cpow, PRODUCTION_POINT, derived

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "interop", "fixtures", "rust-proofs-full.json")


def bitrev(i, log):
    r = 0
    for _ in range(log):
        r = (r << 1) | (i & 1)
        i >>= 1
    return r


def main():
    if not os.path.exists(FIX):
        print("SKIP: interop/fixtures/rust-proofs-full.json absent "
              "(regenerate: cd interop && cargo run --release --bin prove -- --point full)")
        return
    pt = PRODUCTION_POINT
    log_d = pt["log_trace"] + pt["log_blowup"]
    n_layers = log_d - 1
    dv = derived(pt)
    off = (dv["OFF"]["re"], dv["OFF"]["im"])
    hstep = (dv["H"]["re"], dv["H"]["im"])
    half = 2 ** (log_d - 1)
    pts = [None] * (2 ** log_d)
    cur = off
    for i in range(half):
        pts[i] = cur
        pts[half + i] = (cur[0], (P - cur[1]) % P)
        cur = cmul(cur, hstep)
    fs = [pts[bitrev(q, log_d)] for q in range(2 ** log_d)]

    def pim(x):
        return (2 * x * x - 1) % P

    fx = json.load(open(FIX))
    assert len(fx) == 3, "three production proofs"
    checked = 0
    for f in fx:
        for q, b in zip(f["queryIndices"], f["bundles"]):
            hints = b["hints"]
            assert len(hints) == n_layers, f"hints length at q={q}"
            tw = [fs[q & ~1][1]]
            for l in range(1, n_layers):
                x = fs[((q >> l) & ~1) << l][0]
                for _ in range(l - 1):
                    x = pim(x)
                tw.append(x)
            for t, h in zip(tw, hints):
                assert t * h % P == 1, f"(t*h) mod p != 1 at q={q}"
                checked += 1
    print(f"PASS: {checked} hint inverses verified against params.py twiddles")


if __name__ == "__main__":
    main()
