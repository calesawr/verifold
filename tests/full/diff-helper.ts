// Differential caller at the production point: every call runs against BOTH
// the generated full gears (field-full ... driver-full) and the flattened
// verifold-flat-full artifact, asserting identical abort behavior and
// identical cvToString results. The flat name comes from
// tools/flat-manifest-full.json, mirroring tests-support/flat-adapter.ts's
// discipline: never derive a flat name by string convention.
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { ClarityValue, cvToString } from "@stacks/transactions";
import { FLAT_FULL, fullSimnet, deployer } from "./args-full";

type ManifestFn = { flat: string; kind: string; arity: number };
type Manifest = { contract: string; functions: Record<string, Record<string, ManifestFn>> };
let manifest: Manifest | null = null;
const loadManifest = (): Manifest => {
  if (!manifest) {
    manifest = JSON.parse(readFileSync(
      new URL("../../tools/flat-manifest-full.json", import.meta.url), "utf8"));
    if (manifest!.contract !== FLAT_FULL) {
      throw new Error(`diff-helper: manifest targets ${manifest!.contract}, expected ${FLAT_FULL}`);
    }
  }
  return manifest!;
};

export type BothResult = { threw: boolean; value?: string };

export function callBoth(gear: string, fn: string, args: ClarityValue[]): BothResult {
  const entry = loadManifest().functions[gear]?.[fn];
  if (!entry) {
    throw new Error(`diff-helper: unmapped call (${gear}, ${fn}); ` +
      "regenerate tools/flat-manifest-full.json with python3 tools/flatten.py --point full");
  }
  const sim = fullSimnet();
  let gearRes: any, flatRes: any;
  let gearThrew = false, flatThrew = false;
  try { gearRes = sim.callReadOnlyFn(`${gear}-full`, fn, args, deployer()); }
  catch { gearThrew = true; }
  try { flatRes = sim.callReadOnlyFn(FLAT_FULL, entry.flat, args, deployer()); }
  catch { flatThrew = true; }
  expect(flatThrew,
    `abort parity on (${gear}, ${fn}): gear ${gearThrew ? "aborted" : "returned"}, ` +
    `flat ${flatThrew ? "aborted" : "returned"}`).toBe(gearThrew);
  if (gearThrew) return { threw: true };
  const g = cvToString(gearRes.result);
  const f = cvToString(flatRes.result);
  expect(f, `value parity on (${gear}, ${fn})`).toBe(g);
  return { threw: false, value: g };
}
