import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { inv } from "./m31";
import { QM31 } from "./qm31";
import { foldStep, foldDown, Layer } from "./fri";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

function num(x: any): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
}
const clQ = (q: QM31) =>
  Cl.tuple({ c0: Cl.uint(q[0]), c1: Cl.uint(q[1]), c2: Cl.uint(q[2]), c3: Cl.uint(q[3]) });
const toQ = (cv: any): QM31 => {
  const o = cvToValue(cv) as any;
  return [num(o.c0), num(o.c1), num(o.c2), num(o.c3)];
};
type HintLayer = { sibling: QM31; x: bigint; hint: bigint; beta: QM31; vIsRight: boolean };
const clHintLayer = (L: HintLayer) =>
  Cl.tuple({ sibling: clQ(L.sibling), x: Cl.uint(L.x), hint: Cl.uint(L.hint),
             beta: clQ(L.beta), "v-is-right": Cl.bool(L.vIsRight) });
const cFoldDownHint = (v0: QM31, layers: HintLayer[]): QM31 =>
  toQ(simnet.callReadOnlyFn("fri", "fri-fold-down-hint",
    [clQ(v0), Cl.list(layers.map(clHintLayer))], deployer).result);

// pinned values in the fri.test.ts KAT style; hints computed with the same
// Fermat inverse the reference foldStep uses internally
const a: QM31 = [5n, 6n, 7n, 8n];
const b: QM31 = [9n, 1n, 2n, 3n];
const beta: QM31 = [2n, 3n, 4n, 5n];
const x1 = 32768n; // query.clar H.re, a live toy twiddle
const x2 = 1234567n;

describe("fri-fold-down-hint -- wire v2 hint-checked fold", () => {
  it("single layer with a correct hint equals the reference fold", () => {
    const got = cFoldDownHint(a, [{ sibling: b, x: x1, hint: inv(x1), beta, vIsRight: false }]);
    expect(got).toEqual(foldStep(a, b, x1, beta));
  });

  it("multi-layer chain with correct hints equals the reference fold-down", () => {
    const layers: Layer[] = [
      { sibling: b, x: x1, beta, vIsRight: false },
      { sibling: a, x: x2, beta, vIsRight: true },
    ];
    const hinted: HintLayer[] = layers.map((L) => ({ ...L, hint: inv(L.x) }));
    expect(cFoldDownHint(a, hinted)).toEqual(foldDown(a, layers));
  });

  it("a wrong hint aborts (reject direction)", () => {
    expect(() => cFoldDownHint(a,
      [{ sibling: b, x: x1, hint: inv(x1) + 1n, beta, vIsRight: false }])).toThrow();
  });

  it("hint zero aborts", () => {
    expect(() => cFoldDownHint(a,
      [{ sibling: b, x: x1, hint: 0n, beta, vIsRight: false }])).toThrow();
  });

  it("x zero aborts regardless of the hint (0*h can never be 1)", () => {
    expect(() => cFoldDownHint(a,
      [{ sibling: b, x: 0n, hint: 1n, beta, vIsRight: false }])).toThrow();
  });
});
