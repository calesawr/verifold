#!/usr/bin/env python3
"""Unit tests for tools/flatten.py. No pytest in this environment:
plain asserts, run as `python3 tools/test_flatten.py` from the repo root."""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flatten


def test_tokenize_edge_cases():
    # covers: 0x literals, comments, tuple sugar with colon and comma, strings
    src = '(define-constant X 0x0102) ;; c\n{ a: u1, b: "s" }'
    kinds = [t.kind for t in flatten.tokenize(src)]
    assert kinds == ["LPAREN", "ATOM", "ATOM", "ATOM", "RPAREN", "COMMENT",
                     "LBRACE", "ATOM", "COLON", "ATOM", "COMMA",
                     "ATOM", "COLON", "STRING", "RBRACE"], kinds
    # atoms may contain ? ! . / (contract-call?, require!, .field, sha512/256)
    texts = [t.text for t in flatten.tokenize("(contract-call? .field require! sha512/256)")]
    assert texts == ["(", "contract-call?", ".field", "require!", "sha512/256", ")"], texts


def test_reemission_byte_identical_all_gears():
    # Stage 1 acceptance: re-emitting each gear from its spans with zero edits
    # is byte-identical (sha256 equal) for all 11 inputs.
    for gear in flatten.GEAR_ORDER:
        src = flatten.read_gear(gear)
        out = flatten.reemit(src, flatten.tokenize(src))
        assert hashlib.sha256(out.encode()).hexdigest() == \
            hashlib.sha256(src.encode()).hexdigest(), gear


def test_symbol_tables_field():
    g = flatten.Gear("field", flatten.read_gear("field"))
    d = g.defs["m31-add"]
    assert d.kind == "read-only" and d.arity == 2
    assert [p[0] for p in d.params] == ["a", "b"]
    assert g.defs["pow-step"].kind == "private"
    assert g.defs["P"].kind == "constant"
    assert g.defs["P"].value == ("uint", 2147483647)
    assert g.defs["STEPS"].value[0] == "list"
    assert len(g.defs["STEPS"].value[1]) == 31


def test_symbol_tables_all_gears():
    total = 0
    for name in flatten.GEAR_ORDER:
        g = flatten.Gear(name, flatten.read_gear(name))
        total += len(g.defs)
    assert total == 134, total


def test_constant_values():
    q = flatten.Gear("query", flatten.read_gear("query"))
    assert q.defs["OFF"].value == ("tuple", {"re": ("uint", 1179735656),
                                             "im": ("uint", 1241207368)})
    d = flatten.Gear("driver", flatten.read_gear("driver"))
    assert d.defs["PARAMS"].value == ("buff", bytes.fromhex("040302080000000a"))
    t = flatten.Gear("transcript", flatten.read_gear("transcript"))
    assert t.defs["OP_ABSORB"].value == ("buff", b"\x00")


TESTS = [
    test_tokenize_edge_cases,
    test_reemission_byte_identical_all_gears,
    test_symbol_tables_field,
    test_symbol_tables_all_gears,
    test_constant_values,
]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
