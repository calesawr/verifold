import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const FLAT = process.env.VERIFOLD_FLAT === "1";

// Guard for the flat-mode adapter (tests-support/flat-adapter.ts). Under
// VERIFOLD_FLAT=1 the adapter redirects callReadOnlyFn to the flat artifact;
// every other sdk entry point that can execute Clarity against the gears
// (callPublicFn, callPrivateFn, deployContract, execute) must throw instead,
// or those calls would silently run gear code while the suite claims to be
// testing the flat artifact. Outside flat mode the adapter is inert, so the
// same entry points must keep working; that keeps this file meaningful in
// baseline and diff runs and pins the sdk surface the adapter must cover.
describe("flat-mode entry-point guard", () => {
  it("callReadOnlyFn stays live (redirected under flat mode)", () => {
    const { result } = simnet.callReadOnlyFn(
      "field", "m31-add", [Cl.uint(2), Cl.uint(3)], deployer);
    expect((result as any).value).toBe(5n);
  });

  // each probe reaches gear code through an entry point the redirect does not
  // cover; expected value confirms the probe is real, not a typo that throws
  const bypass: [string, () => any, bigint][] = [
    ["callPrivateFn", () =>
      (simnet as any).callPrivateFn("driver", "even-of", [Cl.uint(7)], deployer), 6n],
    ["execute", () => (simnet as any).execute("(+ u2 u3)"), 5n],
  ];

  for (const [name, probe, expected] of bypass) {
    if (FLAT) {
      it(`${name} is forbidden under flat mode`, () => {
        expect(probe).toThrow(/forbidden in flat mode/);
      });
    } else {
      it(`${name} stays live outside flat mode`, () => {
        expect((probe().result as any).value).toBe(expected);
      });
    }
  }
});
