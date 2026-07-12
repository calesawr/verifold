// M3a Stage B/C support: the two freshly generated demo proofs
// (interop/fixtures/rust-proofs-demo.json, pubs m3-demo-1 and m3-demo-2,
// regenerated only by a local cargo run, committed like the other
// fixtures) attest cleanly on simnet before any real network sees them.
// New file so the frozen suites stay untouched. The adapter canary
// keeps this file live under the per-file anti-vacuity gate; attest
// traffic uses fullSimnet() (flat mode forbids callPublicFn on the
// wrapped global).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import type { FullProof } from "./args-full";
import {
  adapterCanaryValue, deployer, fullSimnet, verifyArgsFull,
} from "./args-full";

const ATTEST = "verifold-attest";
const DEMO: FullProof[] = JSON.parse(readFileSync(
  new URL("../../interop/fixtures/rust-proofs-demo.json", import.meta.url),
  "utf8"));

describe("demo proofs: fresh pubs attest cleanly before deploy day", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("the demo file carries exactly the two pinned pubs, in order", () => {
    expect(DEMO.map((p) => p.pub)).toEqual([
      Buffer.from("m3-demo-1").toString("hex"),
      Buffer.from("m3-demo-2").toString("hex"),
    ]);
  });
  it("both demo proofs attest: (ok true) each", () => {
    for (const p of DEMO) {
      const res = fullSimnet().callPublicFn(
        ATTEST, "attest", verifyArgsFull(p), deployer());
      expect(res.result).toEqual(Cl.ok(Cl.bool(true)));
    }
  }, 1200000);
});
