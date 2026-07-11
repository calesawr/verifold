#!/usr/bin/env python3
"""Unit tests for tools/check_cost_gate.py (fixture entries, no simnet).

Run from the repo root: python3 tools/test_check_cost_gate.py
"""
from check_cost_gate import gate, max_runtime, recorded_runtime


def entry(contract, method, runtime):
    return {"contract_id": f"ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.{contract}",
            "method": method,
            "cost_result": {"total": {"write_length": 0, "write_count": 0,
                                      "read_length": 1, "read_count": 1,
                                      "runtime": runtime}}}


RECEIPTS_OK = ("prose above\n"
               "cost-gate: full-flat driver/verify runtime 500000000 of 5000000000\n")


def test_pass_when_both_gates_hold():
    entries = [entry("driver", "verify", 50_000_000),
               entry("verifold-flat", "driver/verify", 44_000_000),
               entry("verifold-flat-full", "driver/verify", 520_000_000)]
    assert gate(entries, RECEIPTS_OK) == []


def test_gate1_fails_when_flat_slower_than_gear():
    entries = [entry("driver", "verify", 44_000_000),
               entry("verifold-flat", "driver/verify", 50_000_000),
               entry("verifold-flat-full", "driver/verify", 500_000_000)]
    fails = gate(entries, RECEIPTS_OK)
    assert any("gate 1 FAILED" in f for f in fails), fails


def test_gate2_boundary_is_inclusive_and_integer_exact():
    base = [entry("driver", "verify", 50_000_000),
            entry("verifold-flat", "driver/verify", 44_000_000)]
    at_limit = base + [entry("verifold-flat-full", "driver/verify", 550_000_000)]
    assert gate(at_limit, RECEIPTS_OK) == []
    over = base + [entry("verifold-flat-full", "driver/verify", 550_000_001)]
    fails = gate(over, RECEIPTS_OK)
    assert any("gate 2 FAILED" in f for f in fails), fails


def test_suffix_matching_never_conflates_toy_and_full():
    assert max_runtime([entry("verifold-flat-full", "driver/verify", 9)],
                       ".verifold-flat", "driver/verify") is None
    assert max_runtime([entry("driver-full", "verify", 9)], ".driver", "verify") is None
    assert max_runtime([entry("driver", "verify", 7), entry("driver", "verify", 9)],
                       ".driver", "verify") == 9


def test_missing_entries_and_missing_receipt_line_fail_loudly():
    fails = gate([], "no gate line here\n")
    assert any("gate 1" in f for f in fails), fails
    assert any("gate 2" in f for f in fails), fails
    assert recorded_runtime(
        "cost-gate: full-flat driver/verify runtime 7 of 5000000000") == 7
    assert recorded_runtime("cost-gate: full-flat driver/verify runtime 7 of 5000000000\n"
                            "cost-gate: full-flat driver/verify runtime 9 of 5000000000") == 9
    assert recorded_runtime("nothing") is None


if __name__ == "__main__":
    test_pass_when_both_gates_hold()
    test_gate1_fails_when_flat_slower_than_gear()
    test_gate2_boundary_is_inclusive_and_integer_exact()
    test_suffix_matching_never_conflates_toy_and_full()
    test_missing_entries_and_missing_receipt_line_fail_loudly()
    print("test_check_cost_gate: all tests passed")
