// M2 vacuity guard: proves the tests/full suite exercises the GENERATED FULL
// artifact and not the toy one. A live u2+u3 probe against verifold-flat-full,
// a source scan proving the full suite never targets plain verifold-flat and
// routes contract calls through the args-full helpers, and the adapter canary.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { FLAT_FULL, fullSimnet, deployer, adapterCanaryValue } from "./args-full";

describe("guard-full: the full suite is not vacuous", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("verifold-flat-full is live: field/m31-add u2+u3 == u5", () => {
    const { result } = fullSimnet().callReadOnlyFn(
      FLAT_FULL, "field/m31-add", [Cl.uint(2), Cl.uint(3)], deployer());
    expect((result as any).value).toBe(5n);
  });
  it("the full suite resolves against verifold-flat-full, never verifold-flat", () => {
    expect(FLAT_FULL).toBe("verifold-flat-full");
    const files = ["fixtures-full.test.ts", "kats-full.test.ts",
                   "differential-full.test.ts", "diff-helper.ts", "args-full.ts"];
    for (const f of files) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, `${f} calls the TOY flat artifact`)
        .not.toMatch(/callReadOnlyFn\(\s*"verifold-flat"/);
    }
    const args = readFileSync(new URL("./args-full.ts", import.meta.url), "utf8");
    expect(args).toContain('export const FLAT_FULL = "verifold-flat-full"');
    // the fixture and differential files must not name ANY contract string
    // literal in a call: all full-artifact traffic goes through the helpers
    for (const f of ["fixtures-full.test.ts", "differential-full.test.ts"]) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, `${f} bypasses the shared callers`)
        .not.toMatch(/callReadOnlyFn\(\s*"(?!field")/);
    }
  });
});
