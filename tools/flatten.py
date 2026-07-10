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


# ---------------- Stage 2: parse tree and symbol tables ----------------

class Node:
    """A parenthesized form; children are Node, Tup, or Token(ATOM|STRING)."""
    __slots__ = ("children", "start", "end")

    def __init__(self, children, start, end):
        self.children = children
        self.start = start
        self.end = end


class Tup:
    """{ key: val, ... } tuple sugar; pairs is a list of (key Token, value)."""
    __slots__ = ("pairs", "start", "end")

    def __init__(self, pairs, start, end):
        self.pairs = pairs
        self.start = start
        self.end = end


def parse(toks):
    """Parse the token stream (comments skipped) into top-level forms."""
    items = [t for t in toks if t.kind != "COMMENT"]
    pos = 0

    def parse_one():
        nonlocal pos
        t = items[pos]
        if t.kind == "LPAREN":
            start = t.start
            pos += 1
            kids = []
            while items[pos].kind != "RPAREN":
                kids.append(parse_one())
            end = items[pos].end
            pos += 1
            return Node(kids, start, end)
        if t.kind == "LBRACE":
            start = t.start
            pos += 1
            pairs = []
            while items[pos].kind != "RBRACE":
                key = items[pos]
                if key.kind != "ATOM" or items[pos + 1].kind != "COLON":
                    raise FlattenError(f"malformed tuple sugar at byte {key.start}")
                pos += 2
                pairs.append((key, parse_one()))
                if items[pos].kind == "COMMA":
                    pos += 1
            end = items[pos].end
            pos += 1
            return Tup(pairs, start, end)
        if t.kind in ("ATOM", "STRING"):
            pos += 1
            return t
        raise FlattenError(f"unexpected token {t!r}")

    forms = []
    while pos < len(items):
        forms.append(parse_one())
    return forms


def literal_value(v):
    """Evaluate a literal constant expression: uint/int/0x/bool/none, list,
    tuple. Every define-constant in the 11 gears is a literal; anything else
    is a loud error (the tripwire and math anchor need real values)."""
    if isinstance(v, Token) and v.kind == "ATOM":
        t = v.text
        if t.startswith("u") and t[1:].isdigit():
            return ("uint", int(t[1:]))
        if t.isdigit() or (t.startswith("-") and t[1:].isdigit()):
            return ("int", int(t))
        if t.startswith("0x"):
            return ("buff", bytes.fromhex(t[2:]))
        if t in ("true", "false"):
            return ("bool", t == "true")
        if t == "none":
            return ("none", None)
        raise FlattenError(f"non-literal constant value {t!r}")
    if isinstance(v, Node) and v.children and isinstance(v.children[0], Token) \
            and v.children[0].text == "list":
        return ("list", [literal_value(k) for k in v.children[1:]])
    if isinstance(v, Tup):
        return ("tuple", {k.text: literal_value(val) for k, val in v.pairs})
    raise FlattenError("non-literal constant value")


DEFINE_KINDS = {"define-read-only": "read-only", "define-private": "private",
                "define-constant": "constant"}
# Stage 3 lint gate: all vacuous today, all fail the build loudly on a future
# gear edit. A define-public callee would need a different rewrite (response
# wrapper) and human review; state and traits break the pure-function model.
FORBIDDEN_DEFINES = {"define-public", "define-data-var", "define-map",
                     "define-trait", "use-trait", "impl-trait",
                     "define-fungible-token", "define-non-fungible-token"}


class Definition:
    __slots__ = ("gear", "name", "kind", "arity", "params", "start", "end",
                 "name_tok", "head_tok", "value", "value_node")


class Gear:
    """One parsed gear: tokens, forms, and the symbol table."""

    def __init__(self, name, src):
        self.name = name
        self.src = src
        self.tokens = tokenize(src)
        self.forms = parse(self.tokens)
        self.defs = {}
        self.analysis = None  # set by classify_gear
        self._index()

    def _index(self):
        for form in self.forms:
            if not isinstance(form, Node) or not form.children \
                    or not isinstance(form.children[0], Token):
                raise FlattenError(f"{self.name}: malformed top-level form")
            head = form.children[0]
            if head.text in FORBIDDEN_DEFINES:
                raise FlattenError(
                    f"{self.name}: forbidden top-level form {head.text}. The "
                    "flattener is only proven for read-only/private/constant "
                    "definitions; STOP and extend the design before flattening.")
            if head.text not in DEFINE_KINDS:
                raise FlattenError(f"{self.name}: unsupported top-level form {head.text}")
            d = Definition()
            d.gear, d.kind = self.name, DEFINE_KINDS[head.text]
            d.start, d.end, d.head_tok = form.start, form.end, head
            if d.kind == "constant":
                name_tok = form.children[1]
                d.name, d.name_tok = name_tok.text, name_tok
                d.arity, d.params = None, None
                d.value_node = form.children[2]
                d.value = literal_value(d.value_node)
            else:
                sig = form.children[1]
                name_tok = sig.children[0]
                d.name, d.name_tok = name_tok.text, name_tok
                d.params = [(p.children[0].text, p.children[1])
                            for p in sig.children[1:]]
                d.arity = len(d.params)
                d.value, d.value_node = None, None
            if d.name in self.defs:
                raise FlattenError(f"{self.name}: duplicate definition {d.name}")
            self.defs[d.name] = d
