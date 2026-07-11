#!/usr/bin/env python3
"""Clarity consensus-serialization size of the production proofs as verify() call
arguments. For each proof in the fixtures file it computes the encoded size of every
argument and of the whole argument list, then enforces the 1 MB Clarity value cap
(1048576 bytes) on the largest single argument (the bundles list). Size model:
uint = 17; (buff n) = 5 + n (hex strings count as buffs); list = 5 + sum(items);
tuple = 5 + sum(1 + len(kebab-name) + size(value)); a 4-array of numbers counts as
the {c0,c1,c2,c3} qm31 tuple (85). Field names are counted in their kebab-case
Clarity form (one extra byte per camelCase hump), an ESTIMATE of the generated full
driver's argument names; name bytes are a rounding error next to the hash lists.
Exit 1 if any single argument reaches the cap."""
import json, sys

CAP = 1048576


def kebab_len(name):
    return len(name) + sum(1 for ch in name if ch.isupper())


def size(v, key=None):
    if isinstance(v, int):
        return 17
    if isinstance(v, str):
        return 5 + len(v) // 2
    if isinstance(v, list):
        if len(v) == 4 and all(isinstance(x, int) for x in v):
            return 5 + 4 * (1 + 2 + 17)
        return 5 + sum(size(x) for x in v)
    if isinstance(v, dict):
        return 5 + sum(1 + kebab_len(k) + size(x, k) for k, x in v.items())
    raise TypeError(f"unhandled {type(v)} at {key}")


def main(path):
    proofs = json.load(open(path))
    worst = 0
    for pr in proofs:
        args = {
            "pub": pr["pub"], "trace-root": pr["traceRoot"], "comp-root": pr["compRoot"],
            "t-z": pr["Tz"], "t-gz": pr["Tgz"], "t-g2z": pr["Tg2z"],
            "c0-z": pr["Czs"][0], "c1-z": pr["Czs"][1], "c2-z": pr["Czs"][2],
            "c3-z": pr["Czs"][3], "fri-roots": pr["friRoots"], "final": pr["final"],
            "nonce": pr["nonce"], "bundles": pr["bundles"],
        }
        sizes = {k: size(v, k) for k, v in args.items()}
        total = sum(sizes.values())
        big = max(sizes, key=sizes.get)
        worst = max(worst, sizes[big])
        print(f"pub={pr['pub']!r:24} total-args={total:>8} bytes; largest arg "
              f"{big} = {sizes[big]} bytes; margin to 1MB cap = {CAP - sizes[big]} bytes")
    if worst >= CAP:
        print(f"FAIL: an argument reaches the {CAP} byte Clarity value cap")
        return 1
    print(f"OK: every argument sits under the {CAP} byte Clarity value cap")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else
                  "interop/fixtures/rust-proofs-full.json"))
