// Gear 6f: Rust-proven, Clarity-verified. The fixtures in interop/fixtures/rust-proofs.json are
// produced by interop/src/bin/prove.rs, where every ALGEBRAIC stage is computed by STWO'S OWN
// FUNCTIONS (pinned dev @ cca98119: interpolate, eval_at_point, accumulate_row_quotients,
// fold_circle_into_line, fold_line) and the wire layer (sha256 duplex transcript + sha256 Merkle
// trees) is a THIRD independent implementation (Rust sha2; the others: Clarity native, Python
// hashlib). verify(rust proof) == true closes the loop the expert-review QUERY/CDEEP questions
// could previously only source-read: the conventions are now executable facts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { QM31 } from "./qm31";
import { buildHonestProof } from "./driver";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

type RustBundle = {
  tX: number[]; tSibs: string[]; cX: number[]; cSibs: string[];
  p0Sib: number[]; p0Sibs: string[]; l1Sib: number[]; l1Sibs: string[];
  l2Sib: number[]; l2Sibs: string[];
};
type RustProof = {
  pub: string; traceRoot: string; compRoot: string;
  Tz: number[]; Tgz: number[]; Tg2z: number[]; Czs: number[][];
  friRoots: string[]; final: number[]; nonce: string;
  queryIndices: number[]; bundles: RustBundle[];
};

const FIXTURES: RustProof[] = JSON.parse(
  readFileSync(new URL("../interop/fixtures/rust-proofs.json", import.meta.url), "utf8"));

const clQn = (l: number[]) =>
  Cl.tuple({ c0: Cl.uint(l[0]), c1: Cl.uint(l[1]), c2: Cl.uint(l[2]), c3: Cl.uint(l[3]) });
const clHexList = (hs: string[]) => Cl.list(hs.map((h) => Cl.buffer(Buffer.from(h, "hex"))));
const clRustBundle = (b: RustBundle) =>
  Cl.tuple({
    "t-x": clQn(b.tX), "t-sibs": clHexList(b.tSibs),
    "c-x": clQn(b.cX), "c-sibs": clHexList(b.cSibs),
    "p0-sib": clQn(b.p0Sib), "p0-sibs": clHexList(b.p0Sibs),
    "l1-sib": clQn(b.l1Sib), "l1-sibs": clHexList(b.l1Sibs),
    "l2-sib": clQn(b.l2Sib), "l2-sibs": clHexList(b.l2Sibs),
  });

const callVerifyRust = (p: RustProof) =>
  cvToValue(simnet.callReadOnlyFn("driver", "verify", [
    Cl.buffer(Buffer.from(p.pub, "hex")),
    Cl.buffer(Buffer.from(p.traceRoot, "hex")), Cl.buffer(Buffer.from(p.compRoot, "hex")),
    clQn(p.Tz), clQn(p.Tgz), clQn(p.Tg2z),
    clQn(p.Czs[0]), clQn(p.Czs[1]), clQn(p.Czs[2]), clQn(p.Czs[3]),
    clHexList(p.friRoots), clQn(p.final), Cl.buffer(Buffer.from(p.nonce, "hex")),
    Cl.list(p.bundles.map(clRustBundle)),
  ], deployer).result);

describe("interop -- Rust-proven (Stwo dev@cca98119), Clarity-verified", () => {
  it("driver.clar verify() accepts every Rust-built proof", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(3);
    for (const p of FIXTURES) {
      expect(callVerifyRust(p)).toBe(true);
    }
  });
  it("three-implementation agreement: the Rust empty-pub proof == the TS mini-prover byte-for-byte", () => {
    const rust = FIXTURES.find((p) => p.pub === "")!;
    const ts = buildHonestProof(Buffer.alloc(0));
    expect(rust.traceRoot).toBe(ts.traceRoot.toString("hex"));
    expect(rust.compRoot).toBe(ts.compRoot.toString("hex"));
    expect(rust.friRoots).toEqual(ts.friRoots.map((r) => r.toString("hex")));
    expect(rust.Tz.map(BigInt)).toEqual(ts.Tz);
    expect(rust.Czs.map((c) => c.map(BigInt))).toEqual(ts.Czs);
    expect(rust.final.map(BigInt)).toEqual(ts.final);
    expect(rust.nonce).toBe(ts.nonce.toString("hex"));
    expect(rust.queryIndices.map(BigInt)).toEqual(ts.queryIndices);
    // per-bundle wire equality on the drawn queries
    rust.bundles.forEach((rb, i) => {
      const tb = ts.bundles[i];
      expect(rb.tX.map(BigInt)).toEqual(tb.tX);
      expect(rb.tSibs).toEqual(tb.tSibs.map((s) => s.toString("hex")));
      expect(rb.cX.map(BigInt)).toEqual(tb.cX);
      expect(rb.p0Sib.map(BigInt)).toEqual(tb.p0Sib);
      expect(rb.p0Sibs).toEqual(tb.p0Sibs.map((s) => s.toString("hex")));
      expect(rb.l1Sib.map(BigInt)).toEqual(tb.l1Sib);
      expect(rb.l2Sib.map(BigInt)).toEqual(tb.l2Sib);
      expect(rb.l2Sibs).toEqual(tb.l2Sibs.map((s) => s.toString("hex")));
    });
  });
  it("a tampered Rust proof still aborts (the reject channel survives the wire crossing)", () => {
    const p = FIXTURES[1];
    const tampered: RustProof = {
      ...p,
      bundles: p.bundles.map((b, i) =>
        (i === 0 ? { ...b, tX: [(b.tX[0] + 1) % 2147483647, b.tX[1], b.tX[2], b.tX[3]] } : b)),
    };
    expect(() => callVerifyRust(tampered)).toThrow();
  });
});
