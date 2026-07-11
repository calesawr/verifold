#!/usr/bin/env python3
"""Tests for tools/spans.py, the M2 span templates. Plain asserts, no pytest.
Run from the repo root: python3 tools/test_spans.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flatten
import params
import spans

# The spans each task implements. Task 10 extends this set to 29; Task 11 to 33.
TASK9_SPANS = {
    ("query", "DOMAIN_SIZE"), ("query", "HALF"), ("query", "CM_POW_BOUND"),
    ("query", "CM_STEPS"), ("query", "OFF"), ("query", "H"),
    ("schedule", "N"), ("schedule", "L"), ("schedule", "DOMAIN_SIZE"),
    ("schedule", "POW_THRESHOLD"), ("schedule", "QUERY_COUNTER"),
    ("cair", "SX"), ("cair", "SY"),
    ("cdeep", "SX"), ("cdeep", "SY"),
    ("driver", "PARAMS"),
}
EXPECTED_IMPLEMENTED = set(TASK9_SPANS)


def manifest_spans():
    path = os.path.join(flatten.REPO_ROOT, "tools", "flat-manifest.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["m2ParameterSpans"]


def test_registry_covers_exactly_the_expected_spans():
    assert set(spans.TEMPLATES) == EXPECTED_IMPLEMENTED, \
        sorted(set(spans.TEMPLATES) ^ EXPECTED_IMPLEMENTED)


def test_unimplemented_span_raises_not_implemented():
    try:
        spans.render_span("driver", "verify-query", params.TOY_POINT)
    except NotImplementedError as e:
        assert "driver/verify-query" in str(e), str(e)
        return
    if ("driver", "verify-query") in spans.TEMPLATES:
        return  # Task 11 landed; the guard below (coverage set) governs
    raise AssertionError("expected NotImplementedError")


def test_toy_renders_byte_identical_to_gear_spans():
    # THE core gate: for every implemented span, the toy render equals the
    # exact bytes at the manifest extents of the checked-in gear file.
    covered = 0
    for s in manifest_spans():
        key = (s["gear"], s["name"])
        if key not in spans.TEMPLATES:
            continue
        src = flatten.read_gear(s["gear"])
        want = src[s["byteStart"]:s["byteEnd"]].encode("utf-8")
        got = spans.render_span(s["gear"], s["name"], params.TOY_POINT)
        assert got == want, (key, got[:80], want[:80])
        covered += 1
    assert covered == len(EXPECTED_IMPLEMENTED), covered


def _parses(text):
    flatten.parse(flatten.tokenize(text))  # raises on imbalance
    return True


def test_full_renders_parse_and_carry_oracle_values():
    d = params.derived(params.PRODUCTION_POINT)
    for gear, name in sorted(spans.TEMPLATES):
        text = spans.render_span(gear, name, params.PRODUCTION_POINT).decode("utf-8")
        assert _parses(text), (gear, name)
    txt = lambda g, n: spans.render_span(g, n, params.PRODUCTION_POINT).decode("utf-8")
    assert f"u{d['DOMAIN_SIZE']}" in txt("query", "DOMAIN_SIZE")
    assert f"u{d['DOMAIN_SIZE'] // 2}" in txt("query", "HALF")
    assert f"u{d['DOMAIN_SIZE'] // 2}" in txt("query", "CM_POW_BOUND")
    assert txt("query", "CM_STEPS").count(" u") == d["LOG_DOMAIN"] - 1
    assert f"u{d['OFF']['re']}" in txt("query", "OFF")
    assert f"u{d['H']['im']}" in txt("query", "H")
    assert txt("schedule", "N") == f"(define-constant N u{params.PRODUCTION_POINT['n_queries']})"
    assert f"u{d['N_LAYERS']}" in txt("schedule", "L")
    assert f"u{d['POW_THRESHOLD']}" in txt("schedule", "POW_THRESHOLD")
    assert txt("schedule", "QUERY_COUNTER").count(" u") == \
        params.PRODUCTION_POINT["n_queries"]
    assert f"u{d['SX']}" in txt("cair", "SX") and f"u{d['SX']}" in txt("cdeep", "SX")
    assert f"u{d['SY']}" in txt("cair", "SY") and f"u{d['SY']}" in txt("cdeep", "SY")
    assert txt("driver", "PARAMS") == \
        f"(define-constant PARAMS 0x{d['PARAMS'].hex()})"


def test_full_renders_parse_at_fallback_point():
    # parametricity guard: nothing may hardcode the production candidate
    for gear, name in sorted(spans.TEMPLATES):
        text = spans.render_span(gear, name, params.FALLBACK_POINT).decode("utf-8")
        assert _parses(text), (gear, name)


TESTS = [
    test_registry_covers_exactly_the_expected_spans,
    test_unimplemented_span_raises_not_implemented,
    test_toy_renders_byte_identical_to_gear_spans,
    test_full_renders_parse_and_carry_oracle_values,
    test_full_renders_parse_at_fallback_point,
]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
