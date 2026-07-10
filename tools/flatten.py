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


# ---------------- Stage 2/4: classification and the two edit kinds ----------------

CLASS_LITERAL = "literal"
CLASS_LOCAL = "local"
CLASS_TOPLEVEL = "toplevel"
CLASS_NATIVE = "native"

# Vendored Clarity 3 native set, hand-pinned from clarity-repl's documented
# function and keyword list at clarinet 3.19.0 (no machine-readable export
# exists in the local toolchain; deviation from the spec recorded in the
# plan). Omissions fail loudly (unclassifiable atom); extras are inert
# (natives are never rewritten).
NATIVE_WHITELIST = {
    # arithmetic, comparison, logic
    "+", "-", "*", "/", "mod", "pow", "sqrti", "log2", "xor", "and", "or",
    "not", ">", ">=", "<", "<=", "is-eq",
    # bit operations
    "bit-and", "bit-not", "bit-or", "bit-shift-left", "bit-shift-right",
    "bit-xor",
    # sequences
    "append", "as-max-len?", "concat", "element-at", "element-at?", "filter",
    "fold", "index-of", "index-of?", "len", "list", "map", "replace-at?",
    "slice?",
    # control flow and unwrapping
    "asserts!", "begin", "default-to", "if", "let", "match", "try!",
    "unwrap!", "unwrap-err!", "unwrap-err-panic", "unwrap-panic",
    # options and responses
    "err", "is-err", "is-none", "is-ok", "is-some", "ok", "some",
    # tuples
    "get", "merge", "tuple",
    # definitions (the forbidden ones are still RECOGNIZED here; the
    # FORBIDDEN_DEFINES gate rejects their USE with a targeted message)
    "define-constant", "define-private", "define-read-only", "define-public",
    "define-data-var", "define-map", "define-trait", "use-trait",
    "impl-trait", "define-fungible-token", "define-non-fungible-token",
    # data (recognized; forbidden via FORBIDDEN_ATOMS in the lint gate)
    "var-get", "var-set", "map-delete", "map-get?", "map-insert", "map-set",
    # hashing and signatures
    "hash160", "keccak256", "sha256", "sha512", "sha512/256",
    "secp256k1-recover?", "secp256k1-verify",
    # conversions
    "buff-to-int-be", "buff-to-int-le", "buff-to-uint-be", "buff-to-uint-le",
    "from-consensus-buff?", "int-to-ascii", "int-to-utf8", "string-to-int?",
    "string-to-uint?", "to-consensus-buff?", "to-int", "to-uint",
    # principals and calls
    "as-contract", "contract-call?", "contract-of", "is-standard",
    "principal-construct?", "principal-destruct?", "principal-of?",
    # chain state (recognized; forbidden via FORBIDDEN_ATOMS)
    "at-block", "get-block-info?", "get-burn-block-info?",
    "get-stacks-block-info?", "get-tenure-info?", "print",
    # assets (recognized; the defining forms are already forbidden)
    "ft-burn?", "ft-get-balance", "ft-get-supply", "ft-mint?", "ft-transfer?",
    "nft-burn?", "nft-get-owner?", "nft-mint?", "nft-transfer?",
    "stx-account", "stx-burn?", "stx-get-balance", "stx-transfer?",
    "stx-transfer-memo?",
    # keywords (recognized; forbidden via FORBIDDEN_ATOMS where applicable)
    "block-height", "burn-block-height", "chain-id", "contract-caller",
    "is-in-mainnet", "is-in-regtest", "stacks-block-height",
    "stx-liquid-supply", "tenure-height", "tx-sender", "tx-sponsor?",
    # type words (appear in signatures and (list N T) forms)
    "bool", "buff", "int", "optional", "principal", "response",
    "string-ascii", "string-utf8", "uint",
}
# Environment and state reads would make the merged contract's behavior
# differ from the gears' (different contract identity, different state).
# All vacuous today; any future use fails the build with this message.
FORBIDDEN_ATOMS = {
    "as-contract", "at-block", "block-height", "burn-block-height",
    "contract-caller", "get-block-info?", "get-burn-block-info?",
    "get-stacks-block-info?", "get-tenure-info?", "map-delete", "map-get?",
    "map-insert", "map-set", "stacks-block-height", "tenure-height",
    "tx-sender", "tx-sponsor?", "var-get", "var-set",
}
# No response wrapper may hold a contract-call?: the direct-call rewrite is
# only proven for bare read-only values (verified suite-wide precondition).
WRAP_FORBIDDEN = {"try!", "unwrap!", "unwrap-err!", "match"}


def is_literal_atom(t):
    return (t.startswith("0x")
            or (t.startswith("u") and t[1:].isdigit())
            or t.isdigit() or (t.startswith("-") and t[1:].isdigit())
            or t in ("true", "false", "none"))


def is_contract_call(n):
    return (isinstance(n, Node) and n.children
            and isinstance(n.children[0], Token)
            and n.children[0].text == "contract-call?")


class CallSite:
    __slots__ = ("caller", "callee", "fn", "arity", "args",
                 "enclosing_params", "start")

    def __init__(self, caller, callee, fn, arity, args, enclosing_params, start):
        self.caller = caller
        self.callee = callee
        self.fn = fn
        self.arity = arity
        self.args = args
        self.enclosing_params = enclosing_params
        self.start = start


class Analysis:
    def __init__(self):
        self.edits = []
        self.call_sites = []
        self.local_names = set()
        self.tuple_keys = set()


def classify_gear(gear):
    """ONE traversal per gear: classifies every atom, collects the rename
    edits (Rule 2), the contract-call? frames (Rule 1), local binders, and
    tuple keys. Rename rule: every symbol atom equal to a top-level name of
    THIS gear is prefixed, excluding tuple keys, the key argument of get,
    type annotations, and local shadows (the collision lint pins that none
    exist). A future `match` with binders would surface here as an
    unclassifiable binder atom, loudly."""
    a = Analysis()
    top = set(gear.defs.keys())

    def atom_class(tok, locals_):
        t = tok.text
        if is_literal_atom(t):
            return CLASS_LITERAL
        if t in locals_:
            return CLASS_LOCAL
        if t in top:
            return CLASS_TOPLEVEL
        if NATIVE_WHITELIST is None or t in NATIVE_WHITELIST:
            if t in FORBIDDEN_ATOMS:
                raise FlattenError(
                    f"{gear.name}: forbidden native {t!r} at byte {tok.start}; "
                    "environment/state reads break the pure-function transform")
            return CLASS_NATIVE
        raise FlattenError(
            f"{gear.name}: unclassifiable atom {t!r} at byte {tok.start}; "
            "not a literal, local, top-level name, or whitelisted native")

    def walk_type(node):
        # type annotations: atoms must be natives or literals, keys are keys
        if isinstance(node, Token):
            if node.kind == "ATOM" and not is_literal_atom(node.text) \
                    and NATIVE_WHITELIST is not None \
                    and node.text not in NATIVE_WHITELIST:
                raise FlattenError(
                    f"{gear.name}: unknown atom {node.text!r} in a type "
                    f"annotation at byte {node.start}")
            return
        if isinstance(node, Tup):
            for key, val in node.pairs:
                a.tuple_keys.add(key.text)
                walk_type(val)
            return
        for k in node.children:
            walk_type(k)

    def walk(node, locals_, enclosing_params):
        if isinstance(node, Token):
            if node.kind == "ATOM" and atom_class(node, locals_) == CLASS_TOPLEVEL:
                a.edits.append((node.start, node.end,
                                gear.name + SEPARATOR + node.text))
            return
        if isinstance(node, Tup):
            for key, val in node.pairs:
                a.tuple_keys.add(key.text)  # keys are NEVER renamed (wire format)
                walk(val, locals_, enclosing_params)
            return
        kids = node.children
        head = kids[0] if kids and isinstance(kids[0], Token) else None
        if head is not None and head.text in WRAP_FORBIDDEN and len(kids) > 1 \
                and is_contract_call(kids[1]):
            raise FlattenError(
                f"{gear.name}: {head.text} wraps a contract-call? at byte "
                f"{node.start}; the direct-call rewrite is not proven under a "
                "response wrapper. STOP and review the design.")
        if is_contract_call(node):
            target, fn = kids[1], kids[2]
            if not (isinstance(target, Token) and isinstance(fn, Token)
                    and target.text.startswith(".")):
                raise FlattenError(
                    f"{gear.name}: unsupported contract-call? shape at byte {node.start}")
            callee = target.text[1:]
            a.call_sites.append(CallSite(gear.name, callee, fn.text,
                                         len(kids) - 3, kids[3:],
                                         enclosing_params, node.start))
            # Rule 1: (contract-call? .X fn a1 ...) becomes (X/fn a1 ...),
            # arguments byte-copied verbatim (walked below for their own edits)
            a.edits.append((head.start, fn.end, callee + SEPARATOR + fn.text))
            for arg in kids[3:]:
                walk(arg, locals_, enclosing_params)
            return
        if head is not None and head.text == "get" and len(kids) == 3:
            a.tuple_keys.add(kids[1].text)  # the key argument of get: never renamed
            walk(kids[2], locals_, enclosing_params)
            return
        # merge needs no special case: bare keys can only appear inside tuple literals
        # { key: val }, which the Tup branch above already excludes from renaming.
        if head is not None and head.text == "let":
            inner = set(locals_)  # Clarity let is sequential
            for b in kids[1].children:
                walk(b.children[1], inner, enclosing_params)
                a.local_names.add(b.children[0].text)
                inner.add(b.children[0].text)
            for body in kids[2:]:
                walk(body, inner, enclosing_params)
            return
        for k in kids:
            walk(k, locals_, enclosing_params)

    for form in gear.forms:
        head = form.children[0].text
        if head == "define-constant":
            name_tok = form.children[1]
            a.edits.append((name_tok.start, name_tok.end,
                            gear.name + SEPARATOR + name_tok.text))
            walk(form.children[2], set(), [])
        else:
            sig = form.children[1]
            name_tok = sig.children[0]
            a.edits.append((name_tok.start, name_tok.end,
                            gear.name + SEPARATOR + name_tok.text))
            params_list = gear.defs[name_tok.text].params
            for pname, ptype in params_list:
                a.local_names.add(pname)
                walk_type(ptype)
            locals_ = {p for p, _t in params_list}
            for body in form.children[2:]:
                walk(body, locals_, params_list)
    return a


def apply_edits(src, edits):
    """Apply non-overlapping byte-range edits right to left. Nested
    contract-call? edits sit inside other edits' ARGUMENT ranges, never inside
    a replaced range, so descending-start order applies them inside out."""
    edits = sorted(edits, key=lambda e: e[0], reverse=True)
    for i in range(len(edits) - 1):
        if edits[i + 1][1] > edits[i][0]:
            raise FlattenError(f"overlapping edits at byte {edits[i][0]}")
    out = src
    for start, end, rep in edits:
        out = out[:start] + rep + out[end:]
    return out


# ---------------- Stage 2 acceptance: the pinned call census ----------------

# 138 sites by callee, recounted by the judges and re-verified against the
# working tree at plan time. Any future gear edit that adds or removes a
# cross-contract call must re-pin this table DELIBERATELY.
PINNED_CALL_BREAKDOWN = {"qm31": 90, "transcript": 19, "commit": 9,
                         "field": 5, "query": 4, "merkle": 4, "fri": 2,
                         "cair": 2, "schedule": 2, "cdeep": 1}


def check_call_sites(by_name, all_sites):
    counts = {}
    for s in all_sites:
        counts[s.callee] = counts.get(s.callee, 0) + 1
        callee_gear = by_name.get(s.callee)
        if callee_gear is None:
            raise FlattenError(f"{s.caller}: contract-call? to unknown gear .{s.callee}")
        d = callee_gear.defs.get(s.fn)
        if d is None:
            raise FlattenError(f"{s.caller}: call to missing {s.callee}.{s.fn}")
        if d.kind != "read-only":
            raise FlattenError(
                f"{s.caller}: {s.callee}.{s.fn} is {d.kind}, not read-only. "
                "The direct-call rewrite is only proven for bare read-only "
                "values; a define-public callee returns a response wrapper. "
                "STOP and extend the design before flattening this call.")
        if d.arity != s.arity:
            raise FlattenError(
                f"{s.caller}: {s.callee}.{s.fn} arity {d.arity} != {s.arity}")
        if GEAR_ORDER.index(s.callee) >= GEAR_ORDER.index(s.caller):
            raise FlattenError(
                f"{s.caller} calls {s.callee}: violates definition order "
                f"(GEAR_ORDER is the concatenation order)")
    if counts != PINNED_CALL_BREAKDOWN:
        raise FlattenError(
            f"call-site census drifted: {counts} != {PINNED_CALL_BREAKDOWN}. "
            "A gear edit changed the cross-contract call set; re-pin deliberately.")


def check_collisions(gears):
    """No local binder or tuple key in gear g may equal a top-level name OF g.
    Those are exactly the atoms the rename pass targets in g, so this pins the
    exclusion logic. The scope is per gear on purpose: cross-gear overlap is
    harmless (renames are per gear) and real today, e.g. the tuple key pow-ok
    in schedule/driver versus transcript's pow-ok function. With the /
    separator, prefixed names cannot collide with locals by construction;
    this lint keeps the un-prefixed space clean anyway (belt and braces)."""
    for g in gears:
        bad = (g.analysis.local_names | g.analysis.tuple_keys) & set(g.defs)
        if bad:
            raise FlattenError(
                f"{g.name}: locals/tuple keys collide with this gear's "
                f"top-level names: {sorted(bad)}")


# ---------------- Stage 5: emission ----------------

SIZE_LIMIT = 80 * 1024  # hard read-length headroom assert


def gear_flat_text(gear, edits):
    """Rewritten body for one gear: the two edit kinds plus comment deletion.
    Prose lives in the gears; the artifact carries banners and provenance."""
    edits = list(edits) + [(t.start, t.end, "")
                           for t in gear.tokens if t.kind == "COMMENT"]
    text = apply_edits(gear.src, edits)
    lines = [ln.rstrip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln != "")


def banner(gear_name):
    bar = "=" * 25
    return f";; {bar} gear: {gear_name} (contracts/{gear_name}.clar) {bar}"


def provenance_header(gears):
    lines = [
        ";; verifold-flat.clar: GENERATED FILE. DO NOT EDIT.",
        ";; One-contract emission of the 11-gear circle-STARK verifier.",
        f";; Generator: tools/flatten.py v{GENERATOR_VERSION} (separator {SEPARATOR!r})",
        ";; Regenerate: python3 tools/flatten.py",
        ";; Verify:     python3 tools/flatten_check.py",
        ";; Inputs (sha256):",
    ]
    for g in gears:
        lines.append(f";;   {sha256_hex(g.src)}  contracts/{g.name}.clar")
    return "\n".join(lines)


def emit_flat(gears, extra=None):
    """Deterministic emission: provenance header, then per-gear banner and
    body in GEAR_ORDER. No timestamps anywhere."""
    extra = extra or {}
    parts = [provenance_header(gears)]
    for g in gears:
        parts.append(banner(g.name))
        parts.append(gear_flat_text(g, g.analysis.edits + extra.get(g.name, [])))
    flat = "\n".join(parts) + "\n"
    size = len(flat.encode("utf-8"))
    if size >= SIZE_LIMIT:
        raise FlattenError(f"emitted {size} bytes >= {SIZE_LIMIT} hard limit")
    return flat


def max_let_depth(node, cur=0):
    best = cur
    if isinstance(node, Node):
        head = node.children[0] if node.children \
            and isinstance(node.children[0], Token) else None
        nxt = cur + 1 if head is not None and head.text == "let" else cur
        for k in node.children:
            best = max(best, max_let_depth(k, nxt))
    elif isinstance(node, Tup):
        for _k, v in node.pairs:
            best = max(best, max_let_depth(v, cur))
    return best


def print_stats(flat, gears):
    # the spec's Stage 5 --emit-stats names the FUNCTION count, so functions
    # and constants print separately (never a merged definitions number)
    depth = max(max_let_depth(f) for g in gears for f in g.forms)
    n_fn = sum(1 for g in gears for d in g.defs.values() if d.kind != "constant")
    n_const = sum(1 for g in gears for d in g.defs.values() if d.kind == "constant")
    print(f"emit-stats: bytes={len(flat.encode('utf-8'))} "
          f"functions={n_fn} constants={n_const} "
          f"gears={len(gears)} max-let-depth={depth}")


# ---------------- driver ----------------

def build(names):
    """Parse, self-check, and classify the requested gears."""
    gears = [Gear(n, read_gear(n)) for n in names]
    by_name = {g.name: g for g in gears}
    for g in gears:
        if reemit(g.src, g.tokens) != g.src:
            raise FlattenError(f"{g.name}: span re-emission not byte-identical")
        g.analysis = classify_gear(g)
    if set(names) == set(GEAR_ORDER):
        all_sites = [s for g in gears for s in g.analysis.call_sites]
        check_call_sites(by_name, all_sites)
        check_collisions(gears)
    return gears, by_name


def parse_args(argv):
    opts = {"gears": None,
            "out": os.path.join(REPO_ROOT, "contracts", "verifold-flat.clar"),
            "out_given": False,
            "manifest": os.path.join(REPO_ROOT, "tools", "flat-manifest.json"),
            "mutate": None, "production": False}
    it = iter(argv)
    for arg in it:
        if arg == "--gears":
            opts["gears"] = next(it).split(",")
        elif arg == "--out":
            opts["out"] = next(it)
            opts["out_given"] = True
        elif arg == "--manifest":
            opts["manifest"] = next(it)
        elif arg == "--mutate":
            opts["mutate"] = next(it)
        elif arg == "--production":
            opts["production"] = True
        else:
            raise SystemExit(f"unknown option {arg}")
    return opts


def main(argv):
    opts = parse_args(argv)
    names = opts["gears"] or GEAR_ORDER
    unknown = [n for n in names if n not in GEAR_ORDER]
    if unknown:
        raise SystemExit(f"unknown gears: {unknown}")
    names = [n for n in GEAR_ORDER if n in names]  # always emit in deploy order
    gears, by_name = build(names)
    flat = emit_flat(gears)
    with open(opts["out"], "w", encoding="utf-8") as fh:
        fh.write(flat)
    print_stats(flat, gears)
    print(f"wrote {opts['out']}")


if __name__ == "__main__":
    main(sys.argv[1:])
