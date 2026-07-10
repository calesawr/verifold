#!/usr/bin/env python3
"""Layer 0 round-trip verifier: proves contracts/verifold-flat.clar contains
no logic that is not in the 11 gears.

Inverts the transform WITHOUT reusing the flattener's classifier: split the
artifact at gear banners, tokenize both sides with the shared reader, strip
`<gear>/` prefixes on the flat side, expand `(X/f ...)` frames back to
`(contract-call? .X f ...)`, and assert token-text identity with the original
gears. Comments and whitespace are ignored on both sides; the only permitted
differences are exactly the two edit kinds.

Known blind spot, stated honestly: a wrongly prefixed tuple key would strip
clean and round-trip green. It is caught instead by the Stage 2 classifier
(key positions are typed; misclassification is a build error) and would break
the wire format, failing dozens of tests loudly, not silently.

Run from the repo root: python3 tools/flatten_check.py   (exit 0 = identity)
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flatten import GEAR_ORDER, REPO_ROOT, SEPARATOR, read_gear, tokenize

BANNER_RE = re.compile(r"^;; =+ gear: ([a-z0-9]+) \(contracts/[a-z0-9]+\.clar\) =+$")
GEARS = set(GEAR_ORDER)


def split_sections(flat_text):
    """Parse the flat artifact into (header_text, sections_dict).

    header_text is everything before the first gear banner.
    sections_dict maps gear name -> body text (lines between banners).
    Raises ValueError on duplicate gear banners.
    """
    sections = {}
    header_lines = []
    current, buf = None, []
    for line in flat_text.split("\n"):
        m = BANNER_RE.match(line)
        if m:
            name = m.group(1)
            if name in sections:
                raise ValueError(f"duplicate gear banner: {name}")
            if current is not None:
                sections[current] = "\n".join(buf)
            current, buf = name, []
        elif current is not None:
            buf.append(line)
        else:
            # before the first gear banner — accumulate as header
            header_lines.append(line)
    if current is not None:
        sections[current] = "\n".join(buf)
    return "\n".join(header_lines), sections


def code_tokens(text):
    return [t for t in tokenize(text) if t.kind != "COMMENT"]


def invert(flat_toks, gear_name):
    """Exact inverse of the two edit kinds, from the separator alone."""
    out = []
    for t in flat_toks:
        if t.kind == "ATOM" and SEPARATOR in t.text:
            prefix, rest = t.text.split(SEPARATOR, 1)
            if prefix == gear_name:
                out.append(rest)  # same-gear prefixed top-level name
                continue
            if prefix in GEARS:
                # cross-gear frame: (X/f ...) was (contract-call? .X f ...)
                out.extend(["contract-call?", "." + prefix, rest])
                continue
            # an atom like sha512/256: a native containing '/', pass through
        out.append(t.text)
    return out


def compare(flat_text):
    """Token-stream identity for all 11 gears; returns failure diagnostics."""
    failures = []
    try:
        header_text, sections = split_sections(flat_text)
    except ValueError as exc:
        return [str(exc)]

    # (a) Header region must contain zero non-comment tokens
    header_code = code_tokens(header_text)
    if header_code:
        failures.append(
            f"header: non-comment token(s) found before first gear banner "
            f"(first: {header_code[0].text!r})")

    # (b) Discovered section names must equal GEAR_ORDER exactly
    expected = set(GEAR_ORDER)
    found = set(sections)
    unknown = found - expected
    missing = expected - found
    for name in sorted(unknown):
        failures.append(f"unknown section: {name!r} is not a known gear")
    for name in sorted(missing):
        failures.append(f"{name}: missing gear banner/section")
    if unknown or missing:
        return failures  # stop early — no point checking unknown/missing gears

    for gear in GEAR_ORDER:
        want = [t.text for t in code_tokens(read_gear(gear))]
        got = invert(code_tokens(sections[gear]), gear)
        if want != got:
            k = 0
            while k < min(len(want), len(got)) and want[k] == got[k]:
                k += 1
            failures.append(
                f"{gear}: token divergence at index {k}: "
                f"gear {want[k:k + 5]} vs inverted flat {got[k:k + 5]}")
    return failures


def main():
    path = os.path.join(REPO_ROOT, "contracts", "verifold-flat.clar")
    with open(path, encoding="utf-8") as fh:
        flat_text = fh.read()
    failures = compare(flat_text)
    if failures:
        for f in failures:
            print(f"flatten_check: FAIL {f}")
        return 1
    print(f"flatten_check: OK ({len(GEAR_ORDER)} gears token-identical)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
