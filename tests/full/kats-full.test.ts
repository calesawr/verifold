// M2 Stage 3: the Python replay's production known-answer values
// (tools/kats-full.json, exported by tools/gear6e_replay.py at
// PRODUCTION_POINT) pin schedule-full's derive-challenges and the flat-full
// equivalents, plus the point.ts <-> generated-artifact drift guard.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { POINT } from "./point";
import { clQn, clHexList, FLAT_FULL, fullSimnet, deployer, adapterCanaryValue } from "./args-full";

type Kats = {
  point: string; pub: string; ctx: string;
  traceRoot: string; compRoot: string;
  alpha: number[]; zfelt: number[]; zx: number[]; zy: number[];
  Tz: number[]; Tgz: number[]; Tg2z: number[]; Czs: number[][]; gamma: number[];
  friRoots: string[]; betas: number[][]; final: number[]; nonce: string;
  queryIndices: number[];
};
const K: Kats = JSON.parse(readFileSync(
  new URL("../../tools/kats-full.json", import.meta.url), "utf8"));

const num = (x: any): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
};
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("c0" in x) && !Array.isArray(x) ? x.value : x;
const qn = (o: any): bigint[] => {
  const t = deref(o);
  return [num(t.c0), num(t.c1), num(t.c2), num(t.c3)];
};
const asBig = (l: number[]): bigint[] => l.map(BigInt);

const deriveArgs = () => [
  Cl.buffer(Buffer.from(K.ctx, "hex")),
  Cl.buffer(Buffer.from(K.traceRoot, "hex")), Cl.buffer(Buffer.from(K.compRoot, "hex")),
  clQn(K.Tz), clQn(K.Tgz), clQn(K.Tg2z),
  clQn(K.Czs[0]), clQn(K.Czs[1]), clQn(K.Czs[2]), clQn(K.Czs[3]),
  clHexList(K.friRoots), clQn(K.final), Cl.buffer(Buffer.from(K.nonce, "hex")),
];

const checkChallenges = (contract: string, fn: string) => {
  const ch = deref(cvToValue(
    fullSimnet().callReadOnlyFn(contract, fn, deriveArgs(), deployer()).result)) as any;
  expect(qn(ch.alpha)).toEqual(asBig(K.alpha));
  expect(qn(ch.z)).toEqual(asBig(K.zfelt));
  expect(qn(ch.gamma)).toEqual(asBig(K.gamma));
  expect((deref(ch.betas) as any[]).map(qn)).toEqual(K.betas.map(asBig));
  expect((deref(ch["query-indices"]) as any[]).map(num)).toEqual(asBig(K.queryIndices));
  expect(deref(ch["pow-ok"])).toBe(true);
};

describe("full KATs: the Python replay pins the on-chain challenge schedule", () => {
  it("adapter canary: the toy pipeline stays live in every mode", () => {
    expect(adapterCanaryValue()).toBe(5n);
  });
  it("the KAT file is the production-point export", () => {
    expect(K.point).toBe("PRODUCTION_POINT");
    expect(K.friRoots.length).toBe(POINT.N_LAYERS);
    expect(K.betas.length).toBe(POINT.N_LAYERS);
    expect(K.queryIndices.length).toBe(POINT.N_QUERIES);
  });
  it("drift guard: point.ts equals the generated artifact's get-params", () => {
    const params = deref(cvToValue(fullSimnet().callReadOnlyFn(
      FLAT_FULL, "schedule/get-params", [], deployer()).result)) as any;
    expect(num(params.n)).toBe(BigInt(POINT.N_QUERIES));
    expect(num(params.l)).toBe(BigInt(POINT.N_LAYERS));
    expect(num(params["domain-size"])).toBe(BigInt(POINT.DOMAIN_SIZE));
  });
  it("ctx layout pins wire v2: version byte 0x02, PARAMS at bytes 15..22", () => {
    const ctx = Buffer.from(K.ctx, "hex");
    expect(ctx.subarray(0, 14).toString("latin1")).toBe("verifold-fs-v1");
    expect(ctx[14]).toBe(0x02);
    expect(ctx.subarray(15, 23).toString("hex")).toBe(POINT.PARAMS_HEX);
  });
  it("make-ctx reproduces the replay ctx on driver-full AND flat-full", () => {
    for (const [c, fn] of [["driver-full", "make-ctx"], [FLAT_FULL, "driver/make-ctx"]] as const) {
      const got = (cvToValue(fullSimnet().callReadOnlyFn(
        c, fn, [Cl.buffer(Buffer.from(K.pub, "hex"))], deployer()).result) as string)
        .replace(/^0x/, "");
      expect(got, `${c} ${fn}`).toBe(K.ctx);
    }
  });
  it("derive-challenges KATs on schedule-full (gear side)", () => {
    checkChallenges("schedule-full", "derive-challenges");
  }, 600000);
  it("derive-challenges KATs on verifold-flat-full (flat side)", () => {
    checkChallenges(FLAT_FULL, "schedule/derive-challenges");
  }, 600000);
});
