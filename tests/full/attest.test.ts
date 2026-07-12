// M3a Stage B: verifold-attest, the minimal public consumer of the
// production verifier. attest wraps driver/verify in a transaction
// context: acceptance records {attester, height} under (sha256 pub) and
// increments the count; ANY verifier abort rolls back the whole call
// (reject-by-abort propagates through contract-call?). All attest
// traffic goes through fullSimnet() because the flat adapter forbids
// callPublicFn on the wrapped global; the adapter canary keeps this
// file live under the per-file anti-vacuity gate.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import {
  FIXTURES_FULL, TAMPER_CLASSES, adapterCanaryValue, deployer, fullSimnet,
  tampered, verifyArgsFull,
} from "./args-full";

const ATTEST = "verifold-attest";
const pubHash = (pubHex: string): Buffer =>
  createHash("sha256").update(Buffer.from(pubHex, "hex")).digest();
const wallet = (n: number): string =>
  fullSimnet().getAccounts().get(`wallet_${n}`)!;
const getAttestation = (pubHex: string): any =>
  fullSimnet().callReadOnlyFn(
    ATTEST, "get-attestation", [Cl.buffer(pubHash(pubHex))], deployer()).result;
const getCount = (): bigint =>
  (fullSimnet().callReadOnlyFn(ATTEST, "get-count", [], deployer())
    .result as any).value;

describe("verifold-attest: attest, get-attestation, get-count", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });

  it("honest fixture: (ok true), print event, map entry, count increment", () => {
    const p = FIXTURES_FULL[0];
    const before = getCount();
    const res = fullSimnet().callPublicFn(
      ATTEST, "attest", verifyArgsFull(p), wallet(1));
    expect(res.result).toEqual(Cl.ok(Cl.bool(true)));
    const prints = res.events.filter((e: any) => e.event === "print_event");
    expect(JSON.stringify(prints)).toContain("verifold-attest");
    const entry = getAttestation(p.pub);
    expect(entry.type).toBe("some");
    expect(entry.value.value.attester.value).toBe(wallet(1));
    expect(entry.value.value.height.value).toBeGreaterThan(0n);
    expect(getCount()).toBe(before + 1n);
  }, 600000);

  it("a tampered proof aborts the whole attest call, count unchanged", () => {
    const before = getCount();
    const bad = tampered(FIXTURES_FULL[0], TAMPER_CLASSES[0]);
    expect(() => fullSimnet().callPublicFn(
      ATTEST, "attest", verifyArgsFull(bad), wallet(1),
    )).toThrow(/Runtime error/);
    expect(getCount()).toBe(before);
  }, 600000);

  it("duplicate attest overwrites attester and height, count still increments", () => {
    const p = FIXTURES_FULL[1];
    const start = getCount();
    const r1 = fullSimnet().callPublicFn(
      ATTEST, "attest", verifyArgsFull(p), wallet(1));
    expect(r1.result).toEqual(Cl.ok(Cl.bool(true)));
    const h1 = getAttestation(p.pub).value.value.height.value as bigint;
    fullSimnet().mineEmptyBurnBlocks(3);
    const r2 = fullSimnet().callPublicFn(
      ATTEST, "attest", verifyArgsFull(p), wallet(2));
    expect(r2.result).toEqual(Cl.ok(Cl.bool(true)));
    const entry = getAttestation(p.pub);
    expect(entry.value.value.attester.value).toBe(wallet(2));
    expect(entry.value.value.height.value as bigint).toBeGreaterThan(h1);
    expect(getCount()).toBe(start + 2n);
  }, 1200000);

  it("get-attestation returns none for a never-attested pub-hash", () => {
    const r = fullSimnet().callReadOnlyFn(
      ATTEST, "get-attestation", [Cl.buffer(Buffer.alloc(32, 7))],
      deployer()).result;
    expect(r).toEqual(Cl.none());
  });
});
