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


TESTS = [
    test_tokenize_edge_cases,
    test_reemission_byte_identical_all_gears,
]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
