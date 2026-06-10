import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import { QM31, qadd, qmulM31 } from "./qm31";
import {
  Layer, piX, neg, foldStep, foldDown, evalPoly, foldPoly,
} from "./fri";

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
const clLayer = (L: Layer) =>
  Cl.tuple({ sibling: clQ(L.sibling), x: Cl.uint(L.x), beta: clQ(L.beta), "v-is-right": Cl.bool(L.vIsRight) });
const clLayers = (ls: Layer[]) => Cl.list(ls.map(clLayer));
const ro = (fn: string, args: any[]) => simnet.callReadOnlyFn("fri", fn, args, deployer).result;
const toQ = (cv: any): QM31 => {
  const o = cvToValue(cv) as any;
  return [num(o.c0), num(o.c1), num(o.c2), num(o.c3)];
};

const cPiX = (x: bigint): bigint => num(cvToValue(ro("pi-x", [Cl.uint(x)])));
const cFoldStep = (a: QM31, b: QM31, x: bigint, beta: QM31): QM31 =>
  toQ(ro("fri-fold-step", [clQ(a), clQ(b), Cl.uint(x), clQ(beta)]));
const cFoldCheck = (a: QM31, b: QM31, x: bigint, beta: QM31, claimed: QM31): boolean =>
  cvToValue(ro("fri-fold-check", [clQ(a), clQ(b), Cl.uint(x), clQ(beta), clQ(claimed)])) as boolean;
const cFoldDown = (v0: QM31, layers: Layer[]): QM31 => toQ(ro("fri-fold-down", [clQ(v0), clLayers(layers)]));
const cFinalOk = (v0: QM31, layers: Layer[], final: QM31): boolean =>
  cvToValue(ro("fri-final-ok", [clQ(v0), clLayers(layers), clQ(final)])) as boolean;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xf21a);
const randField = (): bigint => BigInt(Math.floor(rng() * Number(P)));
const randNonzero = (): bigint => {
  let x = 0n;
  while (x === 0n) x = randField();
  return x;
};
const randQ = (): QM31 => [randField(), randField(), randField(), randField()];

describe("pi-x -- circle/Chebyshev next-point map (2x^2 - 1)", () => {
  it("known answers: pi(0) = -1, pi(1) = 1", () => {
    expect(cPiX(0n)).toBe(P - 1n);
    expect(cPiX(1n)).toBe(1n);
  });
  it("matches the reference over 500 random points", () => {
    for (let k = 0; k < 500; k++) {
      const x = randField();
      expect(cPiX(x)).toBe(piX(x));
    }
  });
});

describe("fri-fold-step -- the 2-to-1 butterfly", () => {
  it("matches the reference over 800 random (a, b, x, beta)", () => {
    for (let k = 0; k < 800; k++) {
      const a = randQ(), b = randQ(), x = randNonzero(), beta = randQ();
      expect(cFoldStep(a, b, x, beta)).toEqual(foldStep(a, b, x, beta));
    }
  });

  it("is NOT symmetric in (a,b): swapping the siblings changes the result", () => {
    const a: QM31 = [3n, 0n, 0n, 0n], b: QM31 = [1n, 0n, 0n, 0n], x = randNonzero(), beta = randQ();
    expect(cFoldStep(a, b, x, beta)).not.toEqual(cFoldStep(b, a, x, beta));
  });

  it("fri-fold-check is the is-eq wrapper (obligation B)", () => {
    const a = randQ(), b = randQ(), x = randNonzero(), beta = randQ();
    const folded = cFoldStep(a, b, x, beta);
    expect(cFoldCheck(a, b, x, beta, folded)).toBe(true);
    const wrong: QM31 = [folded[0], folded[1], folded[2], (folded[3] + 1n) % P];
    expect(cFoldCheck(a, b, x, beta, wrong)).toBe(false);
  });

  // Oracle-INDEPENDENT: hand-derived from folded = (a+b) + beta*(a-b)/x with R=2+i.
  it("known-answer folds pin the no-1/2 convention and beta-through-QM31", () => {
    // a=3, b=1, x=2: f0 = 4, (a-b)/x = 2/2 = 1, folded = 4 + 5*1 = 9.
    // (a /2 convention would give 1073741828 here, not 9.)
    expect(cFoldStep([3n, 0n, 0n, 0n], [1n, 0n, 0n, 0n], 2n, [5n, 0n, 0n, 0n])).toEqual([9n, 0n, 0n, 0n]);
    // beta = u: folded = 4 + u*1 = 4 + u  =>  [4,0,1,0] (pins beta flowing through the QM31 multiply)
    expect(cFoldStep([3n, 0n, 0n, 0n], [1n, 0n, 0n, 0n], 2n, [0n, 0n, 1n, 0n])).toEqual([4n, 0n, 1n, 0n]);
  });

  it("degenerate folds: beta=0 -> a+b;  a=b -> 2a", () => {
    const a = randQ(), b = randQ(), x = randNonzero();
    expect(cFoldStep(a, b, x, [0n, 0n, 0n, 0n])).toEqual(qadd(a, b));
    expect(cFoldStep(a, a, x, randQ())).toEqual(qmulM31(a, 2n));
  });

  it("rejects x=0 by aborting (m31-inv(0) would silently null the fold, beta-independent)", () => {
    expect(() => cFoldStep([1n, 0n, 0n, 0n], [0n, 0n, 0n, 0n], 0n, [5n, 7n, 9n, 11n])).toThrow();
  });

  // STRONG: the fold must equal the radix-2 even/odd split of a REAL low-degree polynomial,
  // computed an entirely different way. Catches a wrong twiddle or normalization a self-diff misses.
  it("equals the even/odd split of an actual low-degree polynomial (200x)", () => {
    for (let k = 0; k < 200; k++) {
      const deg = 1 + Math.floor(rng() * 12);
      const coeffs: QM31[] = Array.from({ length: deg + 1 }, () => randQ());
      const x = randNonzero();
      const beta = randQ();
      const a = evalPoly(coeffs, x);
      const b = evalPoly(coeffs, neg(x));
      // expected = 2*(fe(x^2) + beta*fo(x^2)) via the foldPoly machinery, evaluated at x^2
      const folded = foldPoly(coeffs, beta); // poly in w = x^2
      const xx = (x * x) % P;
      const expected = evalPoly(folded, xx);
      expect(cFoldStep(a, b, x, beta)).toEqual(expected);
    }
  });
});

describe("fri-fold-down -- fold an opened value all the way down", () => {
  it("matches the reference for layer counts 1,2,4,8,16,32, both orientations (random)", () => {
    for (const n of [1, 2, 4, 8, 16, 32]) {
      for (let trial = 0; trial < 20; trial++) {
        const v0 = randQ();
        const layers: Layer[] = Array.from({ length: n }, () => ({
          sibling: randQ(), x: randNonzero(), beta: randQ(), vIsRight: rng() < 0.5,
        }));
        expect(cFoldDown(v0, layers)).toEqual(foldDown(v0, layers));
      }
    }
  });
});

// Build an honest FRI instance from a real low-degree polynomial and the classical x^2 point chain,
// so the codeword provably folds down to its constant term.
function buildChain(L: number, x0: bigint, ncoeffs?: number) {
  const N = ncoeffs ?? 1 << L; // decouple #coeffs from L (1<<32 === 1 in JS); poly collapses then doubles
  const coeffs: QM31[] = Array.from({ length: N }, () => randQ());
  const layers: Layer[] = [];
  let poly = coeffs;
  let xi = x0;
  for (let i = 0; i < L; i++) {
    layers.push({ sibling: evalPoly(poly, neg(xi)), x: xi, beta: randQ(), vIsRight: false });
    poly = foldPoly(poly, layers[i].beta); // f^{(i+1)} in w = x^2
    xi = (xi * xi) % P; // x_{i+1} = x_i^2
  }
  const v0 = evalPoly(coeffs, x0); // opened layer-0 value f(x0)
  const final = poly[0]; // degree-0 remainder = the committed constant
  return { v0, layers, final };
}

describe("fri-final-ok -- low-degree check on a real codeword (obligation D)", () => {
  it("accepts an honest low-degree codeword folded to its constant (L=1..5)", () => {
    for (let L = 1; L <= 5; L++) {
      const { v0, layers, final } = buildChain(L, randNonzero());
      expect(cFinalOk(v0, layers, final)).toBe(true);
    }
  });

  it("rejects a tampered sibling, a tampered beta, a wrong source point, and a wrong final", () => {
    const { v0, layers, final } = buildChain(4, randNonzero());

    const badSibling = layers.map((l, i) =>
      i === 1 ? { ...l, sibling: [l.sibling[0], l.sibling[1], l.sibling[2], (l.sibling[3] + 1n) % P] as QM31 } : l
    );
    expect(cFinalOk(v0, badSibling, final)).toBe(false);

    const badBeta = layers.map((l, i) =>
      i === 2 ? { ...l, beta: [(l.beta[0] + 1n) % P, l.beta[1], l.beta[2], l.beta[3]] as QM31 } : l
    );
    expect(cFinalOk(v0, badBeta, final)).toBe(false);

    const badX = layers.map((l, i) => (i === 0 ? { ...l, x: (l.x % (P - 1n)) + 1n } : l));
    expect(cFinalOk(v0, badX, final)).toBe(false);

    const wrongFinal: QM31 = [(final[0] + 1n) % P, final[1], final[2], final[3]];
    expect(cFinalOk(v0, layers, wrongFinal)).toBe(false);
  });

  it("rejects an opened value inconsistent with the committed final", () => {
    const { layers, final } = buildChain(4, randNonzero());
    expect(cFinalOk(randQ(), layers, final)).toBe(false); // wrong opened value -> wrong fold-down
  });
});

describe("fri -- degree halving and full depth", () => {
  it("folds an honest codeword through all 32 layers", () => {
    const { v0, layers, final } = buildChain(32, randNonzero(), 65); // degree-64 poly, 32 layers
    expect(layers.length).toBe(32);
    expect(cFinalOk(v0, layers, final)).toBe(true);
  });

  // Proves the fold genuinely HALVES degree (so a real multi-query verifier rejects high degree):
  // a degree-(2^L) poly does not collapse to a constant, so its fold-down depends on the eval point.
  it("degree 2^L does not collapse (two points differ); degree 2^L-1 collapses (two points agree)", () => {
    const L = 4, N = 1 << L;
    const betas = Array.from({ length: L }, () => randQ());
    const buildFrom = (coeffs: QM31[], x0: bigint) => {
      const layers: Layer[] = [];
      let poly = coeffs, xi = x0;
      for (let i = 0; i < L; i++) {
        layers.push({ sibling: evalPoly(poly, neg(xi)), x: xi, beta: betas[i], vIsRight: false });
        poly = foldPoly(poly, betas[i]);
        xi = (xi * xi) % P;
      }
      return { v0: evalPoly(coeffs, x0), layers };
    };
    const xA = randNonzero(), xB = randNonzero();
    const hi: QM31[] = Array.from({ length: N + 1 }, () => randQ()); // degree 2^L -> final poly degree 1
    const Ahi = buildFrom(hi, xA), Bhi = buildFrom(hi, xB);
    expect(cFoldDown(Ahi.v0, Ahi.layers)).not.toEqual(cFoldDown(Bhi.v0, Bhi.layers));
    const lo: QM31[] = Array.from({ length: N }, () => randQ()); // degree 2^L-1 -> final poly constant
    const Alo = buildFrom(lo, xA), Blo = buildFrom(lo, xB);
    expect(cFoldDown(Alo.v0, Alo.layers)).toEqual(cFoldDown(Blo.v0, Blo.layers));
  });
});

// ----- ToB re-audit hardening: oracle-INDEPENDENT structural invariants -----
// Computed entirely from the contracts (qm31 + field), with no shared JS oracle, so they hold even
// if the co-located oracle had the same bug. They pin the soundness-relevant structure of the fold
// that the existing differential tests don't isolate.
const qcall = (fn: string, args: any[]) => simnet.callReadOnlyFn("qm31", fn, args, deployer).result;
const cQAdd = (a: QM31, b: QM31): QM31 => toQ(qcall("qm31-add", [clQ(a), clQ(b)]));
const cQSub = (a: QM31, b: QM31): QM31 => toQ(qcall("qm31-sub", [clQ(a), clQ(b)]));
const cQMul = (a: QM31, b: QM31): QM31 => toQ(qcall("qm31-mul", [clQ(a), clQ(b)]));
const cQMulM31 = (a: QM31, s: bigint): QM31 => toQ(qcall("qm31-mul-m31", [clQ(a), Cl.uint(s)]));
const cInvF = (x: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("field", "m31-inv", [Cl.uint(x)], deployer).result));

describe("fri — oracle-independent structural invariants (ToB re-audit)", () => {
  it("affine in beta (#1): fold(b1) - fold(b2) == (b1-b2) * ((a-b)/x)  [contract-only, 300x]", () => {
    for (let k = 0; k < 300; k++) {
      const a = randQ(), b = randQ(), x = randNonzero(), b1 = randQ(), b2 = randQ();
      const lhs = cQSub(cFoldStep(a, b, x, b1), cFoldStep(a, b, x, b2));
      const rhs = cQMul(cQSub(b1, b2), cQMulM31(cQSub(a, b), cInvF(x)));
      expect(lhs).toEqual(rhs);
    }
  });

  it("linear in the value pair (#1): fold(a1+a2,b1+b2) == fold(a1,b1) + fold(a2,b2)  [contract-only, 300x]", () => {
    for (let k = 0; k < 300; k++) {
      const a1 = randQ(), a2 = randQ(), b1 = randQ(), b2 = randQ(), x = randNonzero(), beta = randQ();
      const lhs = cFoldStep(cQAdd(a1, a2), cQAdd(b1, b2), x, beta);
      const rhs = cQAdd(cFoldStep(a1, b1, x, beta), cFoldStep(a2, b2, x, beta));
      expect(lhs).toEqual(rhs);
    }
  });

  it("v-is-right bit routes the carried value into the correct (f(x), f(-x)) slot (#6)", () => {
    const A = randQ(), B = randQ(), x = randNonzero(), beta = randQ();
    // vIsRight:true => carried v=B is the RIGHT sibling f(-x); fold = foldStep(sibling=A, v=B)
    expect(cFoldDown(B, [{ sibling: A, x, beta, vIsRight: true }])).toEqual(cFoldStep(A, B, x, beta));
    // vIsRight:false => carried v=B is the LEFT f(x);  fold = foldStep(v=B, sibling=A)
    expect(cFoldDown(B, [{ sibling: A, x, beta, vIsRight: false }])).toEqual(cFoldStep(B, A, x, beta));
  });

  it("boundary twiddles x=1 (x^-1=1) and x=p-1 (x^-1=p-1): hand-derived KATs (#9)", () => {
    // x=1:   folded = (a+b) + beta*(a-b)        => 7 + 3*3 = 16
    expect(cFoldStep([5n, 0n, 0n, 0n], [2n, 0n, 0n, 0n], 1n, [3n, 0n, 0n, 0n])).toEqual([16n, 0n, 0n, 0n]);
    // x=p-1: x^-1=p-1, folded = (a+b) - beta*(a-b) => 7 - 9 = p-2
    expect(cFoldStep([5n, 0n, 0n, 0n], [2n, 0n, 0n, 0n], P - 1n, [3n, 0n, 0n, 0n])).toEqual([P - 2n, 0n, 0n, 0n]);
  });

  it("empty layers (#8/#10): final-ok(v0,[],v0)=true, (v0,[],other)=false (documented L-binding precondition)", () => {
    const v0 = randQ();
    expect(cFinalOk(v0, [], v0)).toBe(true);
    const other: QM31 = [(v0[0] + 1n) % P, v0[1], v0[2], v0[3]];
    expect(cFinalOk(v0, [], other)).toBe(false);
  });

  it("an x=0 layer ABORTS through fold-down and final-ok (#25): the reject propagates, not absorbed", () => {
    const { v0, layers, final } = buildChain(4, randNonzero());
    const bad = layers.map((l, i) => (i === 2 ? { ...l, x: 0n } : l));
    expect(() => cFoldDown(v0, bad)).toThrow();
    expect(() => cFinalOk(v0, bad, final)).toThrow();
  });
});
