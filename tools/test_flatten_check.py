#!/usr/bin/env python3
"""Unit tests for tools/flatten_check.py. Run: python3 tools/test_flatten_check.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flatten_check


def _artifact():
    path = os.path.join(flatten_check.REPO_ROOT, "contracts", "verifold-flat.clar")
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_layer0_green_on_artifact():
    assert flatten_check.compare(_artifact()) == []


def test_layer0_fires_on_logic_edit():
    # a one-token logic edit in the artifact must break token identity
    doctored = _artifact().replace(
        "(mod (+ a b) field/P)", "(mod (+ a b u1) field/P)", 1)
    failures = flatten_check.compare(doctored)
    assert failures and "field" in failures[0], failures


def test_layer0_fires_on_missing_gear():
    doctored = _artifact().replace("gear: merkle", "gear: xerkle", 1)
    failures = flatten_check.compare(doctored)
    assert failures and "merkle" in failures[0], failures


TESTS = [test_layer0_green_on_artifact, test_layer0_fires_on_logic_edit,
         test_layer0_fires_on_missing_gear]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
