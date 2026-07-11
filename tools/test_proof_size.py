#!/usr/bin/env python3
"""Hand-computed pins for the tools/proof_size.py Clarity consensus size model."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proof_size import size, kebab_len


def main():
    assert size(7) == 17, "uint = 1 type byte + 16 value bytes"
    assert size("ab" * 32) == 37, "buff 32 = 1 + 4 + 32"
    assert size("") == 5, "empty buff = 1 + 4"
    assert size([1, 2, 3, 4]) == 85, "qm31 tuple {c0..c3} = 5 + 4*(1+2+17)"
    assert size(["ab" * 32, "cd" * 32]) == 79, "list of two buff 32 = 5 + 2*37"
    assert kebab_len("tX") == 3, "tX -> t-x"
    assert kebab_len("p0Sibs") == 7, "p0Sibs -> p0-sibs"
    assert size({"tX": [1, 2, 3, 4]}) == 94, "one-field tuple = 5 + (1 + 3 + 85)"
    print("PASS: proof_size Clarity size model pins")


if __name__ == "__main__":
    main()
