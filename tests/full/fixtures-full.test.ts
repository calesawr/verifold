// M2 Stage 3: the Rust production fixtures (interop/fixtures/rust-proofs-full.json,
// regenerated only by a local `cargo run --release --bin prove -- --point full`) are
// accepted by verifold-flat-full "driver/verify", and one representative of
// every tamper class aborts (reject-by-abort survives the wire crossing at
// the production point).
import { describe, expect, it } from "vitest";
import {
  FIXTURES_FULL, callVerifyFull, TAMPER_CLASSES, tampered, adapterCanaryValue,
} from "./args-full";

describe("full fixtures: Rust-proven at PRODUCTION_POINT, Clarity-verified", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("at least 3 production fixtures, all accepted", () => {
    expect(FIXTURES_FULL.length).toBeGreaterThanOrEqual(3);
    for (const p of FIXTURES_FULL) {
      expect(callVerifyFull(p)).toBe(true);
    }
  }, 600000);
  it("cost snapshot (informational): one full verify() wall time on simnet", () => {
    const t0 = performance.now();
    expect(callVerifyFull(FIXTURES_FULL[0])).toBe(true);
    const ms = performance.now() - t0;
    console.log(`full driver/verify simnet wall time: ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(600000);
  }, 600000);
  describe("tamper suite: one flipped value per class aborts", () => {
    for (const t of TAMPER_CLASSES) {
      it(t.name, () => {
        expect(() => callVerifyFull(tampered(FIXTURES_FULL[0], t))).toThrow();
      }, 600000);
    }
  });
  it("sanity: the tamper helpers never mutate the shared fixture", () => {
    expect(callVerifyFull(FIXTURES_FULL[0])).toBe(true);
  }, 600000);
});
