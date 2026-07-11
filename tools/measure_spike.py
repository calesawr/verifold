#!/usr/bin/env python3
"""Stage 0 cost-shape spike driver: measure ONE candidate parameter point.

Drives tools/gen_fullsize.py at the candidate's (depth, queries) shape,
TEMPORARILY registers the generated contract on simnet, runs a one-call
vitest spec with --costs, extracts the run() call totals plus the
artifact byte size from costs-reports.json, prints the raw receipt as
JSON, and restores the working tree. Nothing this script creates is ever
committed: the spike contract, the Clarinet.toml entry, the rewritten
simnet plan, and the throwaway spec are all removed or restored in the
finally block. The printed JSON is the raw receipt; paste it VERBATIM
into docs/m2-cost-receipts.md.

Usage (from the repo root):
    python3 tools/measure_spike.py {CAND_A|CAND_B|CAND_C|FALLBACK_POINT}
"""
import json
import os
import subprocess
import sys

import params

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPIKE_NAME = "spike-cost"
SPIKE_CLAR = os.path.join(REPO_ROOT, "contracts", SPIKE_NAME + ".clar")
SPIKE_SPEC = os.path.join(REPO_ROOT, "tests", SPIKE_NAME + ".test.ts")
CLARINET_TOML = os.path.join(REPO_ROOT, "Clarinet.toml")
SIMNET_PLAN = os.path.join(REPO_ROOT, "deployments",
                           "default.simnet-plan.yaml")
COSTS_JSON = os.path.join(REPO_ROOT, "costs-reports.json")
SPIKE_NAMES = ("CAND_A", "CAND_B", "CAND_C", "FALLBACK_POINT")

TOML_BLOCK = f"""
[contracts.{SPIKE_NAME}]
path = "contracts/{SPIKE_NAME}.clar"
clarity_version = 3
epoch = "3.1"
"""

SPEC_TS = f"""import {{ describe, expect, it }} from "vitest";
import {{ cvToString }} from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

// THROWAWAY spec written by tools/measure_spike.py. NEVER commit this file.
describe("{SPIKE_NAME} shape measurement", () => {{
  it("runs the full query fold once for cost capture", () => {{
    const {{ result }} = simnet.callReadOnlyFn(
      "{SPIKE_NAME}", "run", [], deployer);
    expect(cvToString(result)).toMatch(/^0x[0-9a-f]{{64}}$/);
  }}, 600_000);
}});
"""


def shape_for(point):
    """gen_fullsize.py CLI shape: (depth, queries) with layers = depth - 1
    built into the generator."""
    return point["log_trace"] + point["log_blowup"], point["n_queries"]


def extract_costs(report, contract_name):
    """The cost_result of the run() call on contract_name; loud if absent."""
    hits = [e for e in report
            if e["contract_id"].endswith("." + contract_name)
            and e["method"].endswith("run")]
    if not hits:
        raise SystemExit(
            f"no costs entry for {contract_name}.run in costs-reports.json")
    return max(hits,
               key=lambda e: e["cost_result"]["total"]["runtime"]
               )["cost_result"]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in SPIKE_NAMES:
        raise SystemExit("usage: python3 tools/measure_spike.py "
                         "{CAND_A|CAND_B|CAND_C|FALLBACK_POINT}")
    name = sys.argv[1]
    depth, queries = shape_for(params.POINTS[name])
    original_toml = open(CLARINET_TOML).read()
    original_plan = open(SIMNET_PLAN).read()
    if os.path.exists(COSTS_JSON):
        os.remove(COSTS_JSON)   # a stale report would poison extraction
    try:
        gen = subprocess.run(
            [sys.executable,
             os.path.join(REPO_ROOT, "tools", "gen_fullsize.py"),
             str(depth), str(queries)],
            check=True, capture_output=True, text=True)
        with open(SPIKE_CLAR, "w") as fh:
            fh.write(gen.stdout)
        with open(CLARINET_TOML, "w") as fh:
            fh.write(original_toml + TOML_BLOCK)
        with open(SPIKE_SPEC, "w") as fh:
            fh.write(SPEC_TS)
        subprocess.run(
            ["npx", "vitest", "run", "tests/" + SPIKE_NAME + ".test.ts",
             "--", "--costs"],
            check=True, cwd=REPO_ROOT)
        with open(COSTS_JSON) as fh:
            cost_result = extract_costs(json.load(fh), SPIKE_NAME)
        receipt = {
            "point": name, "depth": depth, "queries": queries,
            "layers": depth - 1,
            "artifact_bytes": len(gen.stdout.encode()),
            "run_total": cost_result["total"],
            "block_limits": cost_result["limit"],
        }
        print(json.dumps(receipt, indent=2))
    finally:
        with open(CLARINET_TOML, "w") as fh:
            fh.write(original_toml)
        with open(SIMNET_PLAN, "w") as fh:
            fh.write(original_plan)
        for path in (SPIKE_CLAR, SPIKE_SPEC, COSTS_JSON):
            if os.path.exists(path):
                os.remove(path)


if __name__ == "__main__":
    main()
