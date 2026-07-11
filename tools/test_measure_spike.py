#!/usr/bin/env python3
"""Unit tests for tools/measure_spike.py pure helpers.
Run: python3 tools/test_measure_spike.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import measure_spike
import params


def test_shape_for_matches_skeleton_table():
    assert measure_spike.shape_for(params.CAND_A) == (17, 23)
    assert measure_spike.shape_for(params.CAND_B) == (17, 31)
    assert measure_spike.shape_for(params.CAND_C) == (17, 46)
    assert measure_spike.shape_for(params.FALLBACK_POINT) == (16, 23)


def test_extract_costs_picks_the_spike_run():
    report = [
        {"contract_id": "ST1.verifold-flat", "method": "qm31/qm31-mul",
         "cost_result": {"total": {"runtime": 1}, "limit": {}}},
        {"contract_id": "ST1.spike-cost", "method": "run",
         "cost_result": {"total": {"runtime": 7, "read_length": 9},
                         "limit": {"runtime": 10}}},
    ]
    got = measure_spike.extract_costs(report, "spike-cost")
    assert got["total"]["runtime"] == 7
    assert got["total"]["read_length"] == 9


def test_extract_costs_fails_loud_when_missing():
    try:
        measure_spike.extract_costs([], "spike-cost")
    except SystemExit as e:
        assert "spike-cost" in str(e)
    else:
        assert False, "expected SystemExit"


def test_toml_block_and_paths_are_exact():
    assert measure_spike.TOML_BLOCK == (
        "\n[contracts.spike-cost]\n"
        'path = "contracts/spike-cost.clar"\n'
        "clarity_version = 3\n"
        'epoch = "3.1"\n')
    assert measure_spike.SPIKE_CLAR.endswith("contracts/spike-cost.clar")
    assert measure_spike.SPIKE_SPEC.endswith("tests/spike-cost.test.ts")


TESTS = [test_shape_for_matches_skeleton_table,
         test_extract_costs_picks_the_spike_run,
         test_extract_costs_fails_loud_when_missing,
         test_toml_block_and_paths_are_exact]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
