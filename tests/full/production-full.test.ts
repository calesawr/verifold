// M3a Stage A: the deploy profile at the full point. The 3 committed
// production fixtures are accepted by verifold-flat-full-production
// "driver/verify", and the NOT-STANDALONE-SOUND driver/verify-query is no
// longer externally callable there (demoted to define-private), with the
// un-demoted equivalence artifact as the failing-differently control.
// The adapter canary keeps this file live under the per-file
// anti-vacuity gate in flat/diff modes; production-artifact traffic goes
// through fullSimnet() (the adapter has no manifest entries for it).
import { describe, expect, it } from "vitest";
import { cvToValue } from "@stacks/transactions";
import {
  FIXTURES_FULL, FLAT_FULL, adapterCanaryValue, deployer, fullSimnet,
  verifyArgsFull,
} from "./args-full";

const FLAT_FULL_PRODUCTION = "verifold-flat-full-production";

describe("production-full: the deployable artifact on simnet", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("all 3 committed fixtures accepted via driver/verify", () => {
    expect(FIXTURES_FULL.length).toBeGreaterThanOrEqual(3);
    for (const p of FIXTURES_FULL) {
      const { result } = fullSimnet().callReadOnlyFn(
        FLAT_FULL_PRODUCTION, "driver/verify", verifyArgsFull(p), deployer());
      expect(cvToValue(result)).toBe(true);
    }
  }, 600000);
  it("driver/verify-query is not externally callable (define-private)", () => {
    expect(() => fullSimnet().callReadOnlyFn(
      FLAT_FULL_PRODUCTION, "driver/verify-query", [], deployer(),
    )).toThrow(/is not a read-only function/);
  });
  it("control: the same probe fails DIFFERENTLY on the equivalence artifact", () => {
    let msg = "";
    try {
      fullSimnet().callReadOnlyFn(FLAT_FULL, "driver/verify-query", [], deployer());
    } catch (e) {
      msg = String(e);
    }
    // still read-only there: the zero-arg probe dies on arity, never on
    // visibility, so the private-visibility assertion above is not vacuous
    expect(msg).not.toContain("is not a read-only function");
    expect(msg).toContain("Error calling contract function");
  });
});
