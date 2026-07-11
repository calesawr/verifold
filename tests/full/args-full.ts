// tests/full support: production-point fixture loader and Clarity argument
// builders for the generated full artifact. Mirrors tests/interop.test.ts's
// proof-arg builder, generalized to parametric depths (POINT) and wire v2
// (per-bundle inverse hints). All full-artifact traffic goes through
// fullSimnet(), which unwraps the flat-mode adapter proxy (tests-support/
// flat-adapter.ts exposes __verifoldBase): the toy manifest has no
// verifold-flat-full entries, so full calls must never enter the adapter's
// lookup. Outside flat/diff mode __verifoldBase is undefined and the plain
// global is used unchanged.
import { readFileSync } from "node:fs";
import { Cl, ClarityValue, cvToValue } from "@stacks/transactions";
import { POINT } from "./point";

export const FLAT_FULL = "verifold-flat-full";
const P = 2147483647;

export type FullLayer = { sib: number[]; sibs: string[] };
export type FullBundle = {
  tX: number[]; tSibs: string[]; cX: number[]; cSibs: string[];
  p0Sib: number[];      // the circle-fold (P0 tree) conjugate witness value
  p0Sibs: string[];     // its parent path, first hash dropped (LOG_DOMAIN-1 entries)
  lineSibs: FullLayer[]; // entry j opens line layer j+1 at pair index q >> (j+1)
  hints: number[];      // hints[0] = y^-1; hints[k] = x_k^-1 (wire v2)
};
export type FullProof = {
  pub: string; traceRoot: string; compRoot: string;
  Tz: number[]; Tgz: number[]; Tg2z: number[]; Czs: number[][];
  friRoots: string[]; final: number[]; nonce: string;
  queryIndices: number[]; bundles: FullBundle[];
};

export const FIXTURES_FULL: FullProof[] = JSON.parse(readFileSync(
  new URL("../../interop/fixtures/rust-proofs-full.json", import.meta.url), "utf8"));

export const fullSimnet = (): any => {
  const sim: any = (globalThis as any).simnet;
  return sim.__verifoldBase ?? sim;
};
export const deployer = (): string => fullSimnet().getAccounts().get("deployer")!;

// one call through the NORMAL (possibly adapter-wrapped) path: keeps every
// tests/full file live for the adapter's per-file anti-vacuity gate
export const adapterCanaryValue = (): bigint => {
  const { result } = (globalThis as any).simnet.callReadOnlyFn(
    "field", "m31-add", [Cl.uint(2), Cl.uint(3)], deployer());
  return (result as any).value as bigint;
};

export const clQn = (l: number[]) =>
  Cl.tuple({ c0: Cl.uint(l[0]), c1: Cl.uint(l[1]), c2: Cl.uint(l[2]), c3: Cl.uint(l[3]) });
export const clHexList = (hs: string[]) =>
  Cl.list(hs.map((h) => Cl.buffer(Buffer.from(h, "hex"))));

export const clBundleFull = (b: FullBundle) => {
  const fields: Record<string, ClarityValue> = {
    "t-x": clQn(b.tX), "t-sibs": clHexList(b.tSibs),
    "c-x": clQn(b.cX), "c-sibs": clHexList(b.cSibs),
    "p0-sib": clQn(b.p0Sib), "p0-sibs": clHexList(b.p0Sibs),
    hints: Cl.list(b.hints.map((h) => Cl.uint(h))),
  };
  // lineSibs[k-1] carries line layer k (the fixture schema has no entry
  // for the circle fold; that witness is p0Sib/p0Sibs above)
  for (let k = 1; k < POINT.N_LAYERS; k++) {
    fields[`l${k}-sib`] = clQn(b.lineSibs[k - 1].sib);
    fields[`l${k}-sibs`] = clHexList(b.lineSibs[k - 1].sibs);
  }
  return Cl.tuple(fields);
};

export const verifyArgsFull = (p: FullProof): ClarityValue[] => [
  Cl.buffer(Buffer.from(p.pub, "hex")),
  Cl.buffer(Buffer.from(p.traceRoot, "hex")), Cl.buffer(Buffer.from(p.compRoot, "hex")),
  clQn(p.Tz), clQn(p.Tgz), clQn(p.Tg2z),
  clQn(p.Czs[0]), clQn(p.Czs[1]), clQn(p.Czs[2]), clQn(p.Czs[3]),
  clHexList(p.friRoots), clQn(p.final), Cl.buffer(Buffer.from(p.nonce, "hex")),
  Cl.list(p.bundles.map(clBundleFull)),
];

export const callVerifyFull = (p: FullProof) =>
  cvToValue(fullSimnet().callReadOnlyFn(
    FLAT_FULL, "driver/verify", verifyArgsFull(p), deployer()).result);

// ---- tamper machinery: one flipped value per class, deep-copied ----
export const flipHex = (h: string): string => {
  const b = Buffer.from(h, "hex"); b[0] ^= 0x01; return b.toString("hex");
};
export type Tamper = { name: string; mutate: (p: FullProof) => void };
export const TAMPER_CLASSES: Tamper[] = [
  { name: "traceRoot bit flip", mutate: (p) => { p.traceRoot = flipHex(p.traceRoot); } },
  { name: "OOD opening limb bump (Tz.c0)", mutate: (p) => { p.Tz[0] = (p.Tz[0] + 1) % P; } },
  { name: "sibling hash flip (bundle 0, tSibs[1])",
    mutate: (p) => { p.bundles[0].tSibs[1] = flipHex(p.bundles[0].tSibs[1]); } },
  { name: "hint bump (bundle 0, hints[0]): the v2 inverse check must abort",
    mutate: (p) => { p.bundles[0].hints[0] = (p.bundles[0].hints[0] + 1) % P; } },
  { name: "final limb bump", mutate: (p) => { p.final[0] = (p.final[0] + 1) % P; } },
  { name: "nonce flip (grinding gate)", mutate: (p) => { p.nonce = flipHex(p.nonce); } },
  { name: "bundle leaf value bump (bundle 0, tX.c0)",
    mutate: (p) => { p.bundles[0].tX[0] = (p.bundles[0].tX[0] + 1) % P; } },
];
export const tampered = (p: FullProof, t: Tamper): FullProof => {
  const c: FullProof = structuredClone(p); t.mutate(c); return c;
};
