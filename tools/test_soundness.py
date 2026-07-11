#!/usr/bin/env python3
"""Unit tests for tools/soundness.py. Run: python3 tools/test_soundness.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import params
import soundness


def test_toy_anchor_is_12():
    # driver.clar states the ~2^12 forgery cost; the accounting must agree:
    # 4 queries * log2(2) + 8 pow bits = 12, no cap binding
    b = soundness.bits(params.TOY_POINT)
    assert b["conjectured"] == 12
    assert b["terms"]["query_term"] == 4
    assert b["terms"]["grinding_term"] == 8
    assert b["terms"]["applied_cap"] == "none"


def test_candidates_clear_96_conjectured():
    # the plan skeleton table's conjectured column, exactly
    for pt, want in ((params.CAND_A, 100), (params.CAND_B, 101),
                     (params.CAND_C, 100), (params.FALLBACK_POINT, 100)):
        b = soundness.bits(pt)
        assert b["conjectured"] == want
        assert b["conjectured"] >= 96
        assert b["terms"]["applied_cap"] == "none"


def test_proven_below_conjectured_and_itemized():
    for pt in (params.TOY_POINT, params.CAND_A, params.CAND_B,
               params.CAND_C, params.FALLBACK_POINT):
        b = soundness.bits(pt)
        assert b["proven"] < b["conjectured"]
        assert b["proven"] == \
            pt["n_queries"] * pt["log_blowup"] / 2 + pt["pow_bits"]
        assert b["terms"]["proven_query_term"] == \
            b["terms"]["query_term"] / 2
        assert 123.9 < b["terms"]["ood_term"] < 124.0
        assert b["terms"]["transcript_term"] == 128.0


def test_monotonic_in_queries_and_pow_bits():
    base = dict(params.CAND_A)
    more_q = dict(base, n_queries=base["n_queries"] + 1)
    more_pow = dict(base, pow_bits=base["pow_bits"] + 1)
    for accounting in ("conjectured", "proven"):
        assert soundness.bits(more_q)[accounting] > \
            soundness.bits(base)[accounting]
        assert soundness.bits(more_pow)[accounting] > \
            soundness.bits(base)[accounting]


def test_challenge_space_cap_binds():
    # no query count may claim more than the ~124-bit QM31 challenge space
    absurd = dict(params.CAND_A, n_queries=1000)
    b = soundness.bits(absurd)
    assert b["conjectured"] < 124
    assert b["terms"]["applied_cap"] == "ood_term"


def test_production_point_pinned_and_gated():
    # Task 3 pin: the measured winner, one of the named candidates, and
    # registered so --json PRODUCTION_POINT serves the Rust mirror
    assert params.PRODUCTION_POINT in (params.CAND_A, params.CAND_B,
                                       params.CAND_C, params.FALLBACK_POINT)
    assert params.POINTS["PRODUCTION_POINT"] is params.PRODUCTION_POINT
    b = soundness.bits(params.PRODUCTION_POINT)
    assert b["conjectured"] >= 96


TESTS = [test_toy_anchor_is_12, test_candidates_clear_96_conjectured,
         test_proven_below_conjectured_and_itemized,
         test_monotonic_in_queries_and_pow_bits,
         test_challenge_space_cap_binds,
         test_production_point_pinned_and_gated]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
