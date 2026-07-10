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
    # renaming merkle -> xerkle yields both an unknown section and a missing gear failure
    assert failures and any("merkle" in f or "xerkle" in f for f in failures), failures


def test_layer0_fires_on_swapped_call_target():
    # Swap a cross-gear call target inside the qm31 section:
    # field/m31-inv -> merkle/m31-inv forces the inversion to reconstruct
    # (contract-call? .merkle m31-inv ...) instead of (contract-call? .field m31-inv ...)
    text = _artifact()
    # The qm31 section uses field/m31-inv; swap it to merkle/m31-inv
    # We target only the first occurrence that sits inside the qm31 section
    # (line 58 area of the flat file, inside qm31/cm-inv definition)
    doctored = text.replace(
        "(let ((ninv (field/m31-inv", "(let ((ninv (merkle/m31-inv", 1)
    failures = flatten_check.compare(doctored)
    assert failures and "qm31" in failures[0], failures


def test_layer0_fires_on_header_injection():
    # Prepend a definition above the first gear banner; header must contain
    # zero non-comment tokens
    text = _artifact()
    injected = "(define-read-only (evil) u1)\n" + text
    failures = flatten_check.compare(injected)
    assert failures and "header" in failures[0].lower(), failures


def test_layer0_fires_on_unknown_section():
    # Append a forged banner + definition; unknown section must be rejected
    text = _artifact()
    forged = (text + "\n"
              ";; ========================= gear: zzz (contracts/zzz.clar) =========================\n"
              "(define-read-only (zzz/evil) u99)\n")
    failures = flatten_check.compare(forged)
    assert failures and ("zzz" in failures[0] or "unknown" in failures[0].lower()), failures


TESTS = [test_layer0_green_on_artifact, test_layer0_fires_on_logic_edit,
         test_layer0_fires_on_missing_gear,
         test_layer0_fires_on_swapped_call_target,
         test_layer0_fires_on_header_injection,
         test_layer0_fires_on_unknown_section]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
