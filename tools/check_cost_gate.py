#!/usr/bin/env python3
"""Enforced cost gate for the M2 exhibit regeneration.

Consumes a costs-reports.json produced by `npm run test:report`
(clarinet-sdk --costs output: a JSON list of per-call entries with
contract_id, method, and cost_result.total). Two gates:

  gate 1 (the M1 exhibit's promise, now enforced): the toy flat artifact's
         driver/verify runtime is at or below the gear pipeline's verify
         runtime (maximum entry on each side, conservative).
  gate 2 (M2): the full-flat driver/verify runtime is within the baseline
         recorded in docs/m2-cost-receipts.md plus 10 percent, in exact
         integer arithmetic: measured * 10 <= recorded * 11.

NOT a default CI job: cost instrumentation stays out of CI. Run it whenever
docs/m2-cost-exhibit.md regenerates:

    npm run test:report
    python3 tools/check_cost_gate.py costs-reports.json

The receipts line this script consumes (Task 18 appends it; the LAST
matching line wins, receipts are append-only):

    cost-gate: full-flat driver/verify runtime <N> of 5000000000
"""
import json
import re
import sys

RECEIPTS = "docs/m2-cost-receipts.md"
GATE_RE = re.compile(r"^cost-gate: full-flat driver/verify runtime (\d+) of 5000000000$")


def max_runtime(entries, contract_suffix, method):
    """Maximum runtime among matching call entries, or None if absent."""
    vals = [e["cost_result"]["total"]["runtime"] for e in entries
            if e["contract_id"].endswith(contract_suffix) and e["method"] == method]
    return max(vals) if vals else None


def recorded_runtime(receipts_text):
    """The last cost-gate line's runtime, or None."""
    hits = [int(m.group(1)) for line in receipts_text.splitlines()
            for m in [GATE_RE.match(line.strip())] if m]
    return hits[-1] if hits else None


def gate(entries, receipts_text):
    """Both gates; returns a list of failure strings (empty means PASS)."""
    failures = []
    gear_toy = max_runtime(entries, ".driver", "verify")
    flat_toy = max_runtime(entries, ".verifold-flat", "driver/verify")
    if gear_toy is None or flat_toy is None:
        failures.append("gate 1: missing toy verify entries "
                        f"(gear={gear_toy}, flat={flat_toy}); "
                        "run npm run test:report over the whole suite first")
    elif flat_toy > gear_toy:
        failures.append(f"gate 1 FAILED: flat toy runtime {flat_toy} "
                        f"exceeds gear runtime {gear_toy}")
    flat_full = max_runtime(entries, ".verifold-flat-full", "driver/verify")
    recorded = recorded_runtime(receipts_text)
    if flat_full is None:
        failures.append("gate 2: no verifold-flat-full driver/verify entry in the "
                        "report; the tests/full suite must run under --costs")
    elif recorded is None:
        failures.append(f"gate 2: no 'cost-gate:' line in {RECEIPTS}; "
                        "append the measured baseline first (see Task 18)")
    elif flat_full * 10 > recorded * 11:
        failures.append(f"gate 2 FAILED: full-flat runtime {flat_full} exceeds "
                        f"recorded {recorded} plus 10 percent "
                        f"({recorded * 11 // 10})")
    return failures


def main(argv):
    report_path = argv[1] if len(argv) > 1 else "costs-reports.json"
    receipts_path = argv[2] if len(argv) > 2 else RECEIPTS
    with open(report_path) as f:
        entries = json.load(f)
    with open(receipts_path) as f:
        receipts_text = f.read()
    failures = gate(entries, receipts_text)
    for msg in failures:
        print(msg)
    if failures:
        return 1
    print("cost gate PASSED: "
          f"toy flat {max_runtime(entries, '.verifold-flat', 'driver/verify')} <= "
          f"gear {max_runtime(entries, '.driver', 'verify')}; "
          f"full flat {max_runtime(entries, '.verifold-flat-full', 'driver/verify')} "
          "within the receipts baseline plus 10 percent")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
