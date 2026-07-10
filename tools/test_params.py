#!/usr/bin/env python3
"""Unit tests for tools/params.py. Run: python3 tools/test_params.py"""
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


TESTS = [test_derived_matches_pinned, test_group_orders]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
