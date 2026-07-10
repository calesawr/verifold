#!/usr/bin/env python3
"""Verifold M1 flattening codegen: the 11 gear contracts become one generated
Clarity contract, contracts/verifold-flat.clar.

Span-preserving source-to-source transform. Exactly two edit kinds exist:
top-level name prefixing and contract-call? elimination. Untouched code is
reused character for character; there is no printer. See docs/flatten.md.

Python 3 stdlib only. Run from the repo root: python3 tools/flatten.py
"""
import hashlib
import json
import os
import sys

GENERATOR_VERSION = "1.0"
SEPARATOR = "/"
# The existing simnet deploy order (deployments/default.simnet-plan.yaml).
# A valid definition order: every direct call target is defined earlier.
GEAR_ORDER = ["field", "qm31", "cair", "cdeep", "merkle", "commit",
              "fri", "query", "transcript", "schedule", "driver"]
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class FlattenError(Exception):
    """Any violated precondition. The flattener degrades loudly, never wrongly."""


# ---------------- Stage 1: span-tagged reader ----------------

PUNCT = {"(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE",
         ":": "COLON", ",": "COMMA"}
ATOM_END = set(" \t\r\n(){}:,;\"")


class Token:
    __slots__ = ("kind", "text", "start", "end")

    def __init__(self, kind, text, start, end):
        self.kind = kind
        self.text = text
        self.start = start
        self.end = end

    def __repr__(self):
        return f"Token({self.kind},{self.text!r},{self.start},{self.end})"


def tokenize(src):
    """Tokenize Clarity source. Every byte is either inside a token span or
    inter-token whitespace. Comments are tokens (kind COMMENT), so the emitter
    can strip them and Layer 0 can ignore them, both by span."""
    toks = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in " \t\r\n":
            i += 1
            continue
        if c == ";":
            j = i
            while j < n and src[j] != "\n":
                j += 1
            toks.append(Token("COMMENT", src[i:j], i, j))
            i = j
            continue
        if c in PUNCT:
            toks.append(Token(PUNCT[c], c, i, i + 1))
            i += 1
            continue
        if c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            if j >= n:
                raise FlattenError(f"unterminated string literal at byte {i}")
            toks.append(Token("STRING", src[i:j + 1], i, j + 1))
            i = j + 1
            continue
        j = i
        while j < n and src[j] not in ATOM_END:
            j += 1
        if j == i:
            raise FlattenError(f"cannot tokenize byte {i}: {src[i:i + 20]!r}")
        toks.append(Token("ATOM", src[i:j], i, j))
        i = j
    return toks


def reemit(src, toks):
    """Rebuild the file from token spans; gaps must be pure whitespace.
    Proves the tokenizer accounts for every byte (Stage 1 acceptance)."""
    out = []
    pos = 0
    for t in toks:
        gap = src[pos:t.start]
        if gap.strip() != "":
            raise FlattenError(f"non-whitespace gap before byte {t.start}: {gap!r}")
        if src[t.start:t.end] != t.text:
            raise FlattenError(f"span mismatch at byte {t.start}")
        out.append(gap)
        out.append(t.text)
        pos = t.end
    tail = src[pos:]
    if tail.strip() != "":
        raise FlattenError(f"non-whitespace tail: {tail!r}")
    out.append(tail)
    return "".join(out)


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_gear(name):
    path = os.path.join(REPO_ROOT, "contracts", f"{name}.clar")
    with open(path, encoding="utf-8") as fh:
        return fh.read()
