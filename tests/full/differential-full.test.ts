// M2 Stage 3: the gear-versus-flat differential at PRODUCTION_POINT. Every
// fixture accept and every tamper class must produce IDENTICAL accept/abort
// outcomes on driver-full verify and verifold-flat-full "driver/verify",
// plus leaf-function spot checks. The parity asserts live inside callBoth.
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  FIXTURES_FULL, verifyArgsFull, TAMPER_CLASSES, tampered, clQn, adapterCanaryValue,
} from "./args-full";
import { callBoth } from "./diff-helper";

describe("differential at full: gears-full versus verifold-flat-full", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("leaf spot check: field-full m31-add == flat-full field/m31-add (u2+u3)", () => {
    const r = callBoth("field", "m31-add", [Cl.uint(2), Cl.uint(3)]);
    expect(r).toEqual({ threw: false, value: "u5" });
  });
  it("leaf spot check: qm31 i*i == -1 agrees on both sides", () => {
    const i = clQn([0, 1, 0, 0]);
    const r = callBoth("qm31", "qm31-mul", [i, i]);
    expect(r.threw).toBe(false);
    expect(r.value).toContain("2147483646"); // c0 == p - 1
  });
  it("every fixture verify agrees: accept parity on all sides", () => {
    for (const p of FIXTURES_FULL) {
      const r = callBoth("driver", "verify", verifyArgsFull(p));
      expect(r).toEqual({ threw: false, value: "true" });
    }
  }, 1200000);
  describe("tamper parity: both sides abort on every class", () => {
    for (const t of TAMPER_CLASSES) {
      it(t.name, () => {
        const r = callBoth("driver", "verify",
          verifyArgsFull(tampered(FIXTURES_FULL[0], t)));
        expect(r.threw).toBe(true);
      }, 1200000);
    }
  });
});
