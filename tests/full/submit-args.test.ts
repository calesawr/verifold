// M3a anti-drift gate: the broadcast-side Clarity argument builders in
// tools/submit-proof.mjs must equal the simnet-proven builders in
// tests/full/args-full.ts byte for byte, and the offline-constructed
// unsigned attest transaction must have the expected name and ~196KB
// size. NO test in this file makes a network call: explicit fee, nonce,
// and publicKey suppress every SDK fetch. The adapter canary keeps this
// file live under the per-file anti-vacuity gate in flat/diff modes.
import { describe, expect, it } from "vitest";
import {
  makeUnsignedContractCall, serializeCV, transactionToHex,
} from "@stacks/transactions";
import {
  FIXTURES_FULL, adapterCanaryValue, deployer, verifyArgsFull,
} from "./args-full";

const mjs: any = await import("../../tools/submit-proof.mjs");
// any 33-byte compressed public key works for OFFLINE construction
const STUB_PUBKEY =
  "03adb8de4bfb65db2cfd6120d55c6526ae9c52e675db7e47308636534ba7786110";

describe("submit-proof.mjs stays in lockstep with args-full.ts", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it('serialized Clarity args are byte-identical for the pub "" fixture', () => {
    const p = FIXTURES_FULL.find((f) => f.pub === "")!;
    const reference = verifyArgsFull(p).map((cv) => serializeCV(cv));
    const tool = mjs.attestArgs(p).map((cv: any) => serializeCV(cv));
    expect(reference.length).toBe(14);
    expect(tool).toEqual(reference);
  });
  it('findFixture maps the ASCII pub string "" to the hex-pub entry', () => {
    const entry = mjs.findFixture(new URL(
      "../../interop/fixtures/rust-proofs-full.json", import.meta.url,
    ).pathname, "");
    expect(entry.pub).toBe("");
    expect(() => mjs.findFixture(new URL(
      "../../interop/fixtures/rust-proofs-full.json", import.meta.url,
    ).pathname, "no-such-pub")).toThrow(/no fixture entry/);
  });
  it("offline unsigned attest transaction: function name and size envelope", async () => {
    const p = FIXTURES_FULL.find((f) => f.pub === "")!;
    const tx = await makeUnsignedContractCall({
      contractAddress: deployer(),
      contractName: "verifold-attest",
      functionName: "attest",
      functionArgs: mjs.attestArgs(p),
      publicKey: STUB_PUBKEY,
      network: "testnet",
      fee: 0n,
      nonce: 0n,
    });
    expect((tx.payload as any).functionName.content).toBe("attest");
    const hex = transactionToHex(tx);
    const bytes = (hex.length - 2) / 2;
    console.log(`unsigned attest transaction: ${bytes} bytes`);
    // within 10 percent of the spec's ~196000 (measured 196393 at plan time)
    expect(bytes).toBeGreaterThan(176400);
    expect(bytes).toBeLessThan(215600);
  });
});
