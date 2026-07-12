// tests/full/callread-body.test.ts: the call-read probe's serialization must
// equal the tests/full/args-full.ts builders byte for byte, for every
// committed production fixture. New file; no frozen suite file is touched.
import { describe, expect, it } from "vitest";
import { cvToHex } from "@stacks/transactions";
import { FIXTURES_FULL, adapterCanaryValue, verifyArgsFull } from "./args-full";
// plain .mjs module, no type declarations; vitest resolves it at runtime
import { verifyArgHexes } from "../../tools/callread-verify.mjs";

describe("callread-verify builder equals args-full builders", () => {
  it("adapter canary stays live", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("serializes every committed fixture byte for byte identically", () => {
    expect(FIXTURES_FULL.length).toBeGreaterThanOrEqual(3);
    for (const p of FIXTURES_FULL) {
      expect(verifyArgHexes(p)).toEqual(verifyArgsFull(p).map(cvToHex));
    }
  });
});
