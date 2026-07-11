#!/usr/bin/env python3
"""Unit tests for tools/params.py. Run: python3 tools/test_params.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import params


def test_derived_matches_pinned():
    # the exact decimals pinned in query.clar / cair.clar / cdeep.clar /
    # schedule.clar / driver.clar; independently recomputed from G here
    d = params.derived()
    assert d["OFF"] == {"re": 1179735656, "im": 1241207368}
    assert d["H"] == {"re": 32768, "im": 2147450879}
    assert d["SX"] == 32768 and d["SY"] == 2147450879
    assert d["POW_THRESHOLD"] == 1329227995784915872903807060280344576  # 2^120
    assert d["PARAMS"].hex() == "040302080000000a"
    assert d["DOMAIN_SIZE"] == 16


def test_group_orders():
    assert params.order_of(params.cpow(params.G, 2 ** 26)) == 32
    assert params.order_of(params.cpow(params.G, 2 ** 28)) == 8


def test_point_dicts_pinned():
    # the plan skeleton's parameter table, verbatim
    assert params.TOY_POINT == {"log_trace": 3, "log_blowup": 1,
                                "n_queries": 4, "pow_bits": 8, "air_id": 10}
    assert params.CAND_A == {"log_trace": 13, "log_blowup": 4,
                             "n_queries": 23, "pow_bits": 8, "air_id": 11}
    assert params.CAND_B == {"log_trace": 14, "log_blowup": 3,
                             "n_queries": 31, "pow_bits": 8, "air_id": 11}
    assert params.CAND_C == {"log_trace": 15, "log_blowup": 2,
                             "n_queries": 46, "pow_bits": 8, "air_id": 11}
    assert params.FALLBACK_POINT == {"log_trace": 12, "log_blowup": 4,
                                     "n_queries": 23, "pow_bits": 8,
                                     "air_id": 11}


def test_toy_point_backwards_compatible():
    # derived() with no argument == derived(TOY_POINT); flatten.py's Stage 3
    # math anchor consumes the no-argument form and must not move
    d0, dt = params.derived(), params.derived(params.TOY_POINT)
    assert d0 == dt
    assert d0["LOG_DOMAIN"] == 4 and d0["N_LAYERS"] == 3
    assert d0["BLOWUP"] == 2 and d0["TRACE_ROWS"] == 8


def test_toy_sel_b01_match_cair_pins():
    # the pair-vanishing line constants pinned in cair.clar
    d = params.derived()
    assert d["SEL"] == {"A": 1569360727, "B": 1569360727, "C": 2147450879}
    assert d["B01"] == {"A": 1569360727, "B": 578122920, "C": 2147450879}
    # toy coincidence: H == S numerically ONLY at log_blowup == 1
    assert (d["SX"], d["SY"]) == (d["H"]["re"], d["H"]["im"])


def test_candidate_derivations():
    for pt in (params.CAND_A, params.CAND_B, params.CAND_C):
        d = params.derived(pt)
        assert d["LOG_DOMAIN"] == 17 and d["N_LAYERS"] == 16
        assert d["DOMAIN_SIZE"] == 131072
        # H and S DIVERGE at production; consuming one for the other is the
        # derivation fumble this test exists to catch
        assert (d["SX"], d["SY"]) != (d["H"]["re"], d["H"]["im"])
        assert params.order_is((d["OFF"]["re"], d["OFF"]["im"]),
                               2 * d["DOMAIN_SIZE"])
        assert params.order_is((d["H"]["re"], d["H"]["im"]),
                               d["DOMAIN_SIZE"] // 2)
        assert params.order_is((d["SX"], d["SY"]), d["TRACE_ROWS"])
    df = params.derived(params.FALLBACK_POINT)
    assert df["LOG_DOMAIN"] == 16 and df["N_LAYERS"] == 15
    assert df["TRACE_ROWS"] == 4096


def test_params_bytes_per_point():
    assert params.derived(params.CAND_A)["PARAMS"].hex() == "171010080000000b"
    assert params.derived(params.CAND_B)["PARAMS"].hex() == "1f1008080000000b"
    assert params.derived(params.CAND_C)["PARAMS"].hex() == "2e1004080000000b"
    assert params.derived(params.FALLBACK_POINT)["PARAMS"].hex() == \
        "170f10080000000b"


def test_json_cli_round_trip():
    d = json.loads(params.point_json("CAND_A"))
    assert d["PARAMS"] == "171010080000000b"
    assert d["SX"] == params.derived(params.CAND_A)["SX"]
    assert d["SEL"] == params.derived(params.CAND_A)["SEL"]
    t = json.loads(params.point_json("TOY_POINT"))
    assert t["PARAMS"] == "040302080000000a"


TESTS = [test_derived_matches_pinned, test_group_orders,
         test_point_dicts_pinned, test_toy_point_backwards_compatible,
         test_toy_sel_b01_match_cair_pins, test_candidate_derivations,
         test_params_bytes_per_point, test_json_cli_round_trip]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
