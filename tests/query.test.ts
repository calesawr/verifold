import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { P } from "./m31";
import {
  CM31, cmul, cconj, cnorm, pix,
  DOMAIN_SIZE, G, OFF, H, domainPoint, domainX, bitrev, queryX,
} from "./query";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const num = (x: any): bigint => {
  if (typeof x === "bigint") return x;
  if (typeof x === "number" || typeof x === "string") return BigInt(x);
  if (x && typeof x === "object" && "value" in x) return num(x.value);
  throw new Error("not numeric: " + JSON.stringify(x));
};
const deref = (x: any): any =>
  x && typeof x === "object" && "value" in x && !("re" in x) ? x.value : x;

// contract callers
const cDomainPoint = (i: bigint): CM31 => {
  const o = deref(cvToValue(simnet.callReadOnlyFn("query", "domain-point", [Cl.uint(i)], deployer).result));
  return [num(o.re), num(o.im)];
};
const cDomainX = (i: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("query", "domain-x", [Cl.uint(i)], deployer).result));
const cBitrev = (q: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("query", "bitrev", [Cl.uint(q)], deployer).result));
const cQueryPoint = (q: bigint): CM31 => {
  const o = deref(cvToValue(simnet.callReadOnlyFn("query", "query-point", [Cl.uint(q)], deployer).result));
  return [num(o.re), num(o.im)];
};
const cQueryX = (q: bigint): bigint =>
  num(cvToValue(simnet.callReadOnlyFn("query", "query-x", [Cl.uint(q)], deployer).result));

const N = Number(DOMAIN_SIZE);

// Python-verified KAT tables (Stwo canonic coset, generator G=(2,1268011823))
const KAT_DOMAIN_X = [1179735656n, 1415090252n, 1241207368n, 2112881577n, 967747991n, 732393395n, 906276279n,
  34602070n, 1179735656n, 1415090252n, 1241207368n, 2112881577n, 967747991n, 732393395n, 906276279n, 34602070n];
const KAT_QUERY_X = [1179735656n, 1179735656n, 967747991n, 967747991n, 1241207368n, 1241207368n, 906276279n,
  906276279n, 1415090252n, 1415090252n, 732393395n, 732393395n, 2112881577n, 2112881577n, 34602070n, 34602070n];
const KAT_BITREV = [0n, 8n, 4n, 12n, 2n, 10n, 6n, 14n, 1n, 9n, 5n, 13n, 3n, 11n, 7n, 15n];

describe("query -- KATs vs the Python-verified Stwo canonic coset", () => {
  it("constants: domain-point(0) == OFF (since H^0 = identity, OFF * 1 = OFF)", () => {
    expect(cDomainPoint(0n)).toEqual(OFF);
  });
  it("domain-x(i) matches the KAT table for all 16 geometric indices", () => {
    for (let i = 0; i < N; i++) expect(cDomainX(BigInt(i))).toBe(KAT_DOMAIN_X[i]);
  });
  it("query-x(q) matches the KAT table for all 16 Fiat-Shamir indices (bit-reversed)", () => {
    for (let q = 0; q < N; q++) expect(cQueryX(BigInt(q))).toBe(KAT_QUERY_X[q]);
  });
  it("bitrev(q) matches the KAT table", () => {
    for (let q = 0; q < N; q++) expect(cBitrev(BigInt(q))).toBe(KAT_BITREV[q]);
  });
});

describe("query -- oracle-independent structural properties (the real defense)", () => {
  it("every domain point is ON THE CIRCLE: re^2 + im^2 == 1 mod p", () => {
    for (let i = 0; i < N; i++) expect(cnorm(cDomainPoint(BigInt(i)))).toBe(1n);
  });
  it("pi-x(domain-x(i)) == Re(2 * domain-point(i)): the FRI projection is doubling (ties to gear-5)", () => {
    for (let i = 0; i < N; i++) {
      const Pt = cDomainPoint(BigInt(i));
      expect(pix(cDomainX(BigInt(i)))).toBe(cmul(Pt, Pt)[0]); // 2*P via cm-mul, take Re
    }
  });
  it("the canonic coset avoids the degenerate points: every x_q != 0 and every y_q != 0", () => {
    for (let q = 0; q < N; q++) {
      const Pt = cQueryPoint(BigInt(q));
      expect(Pt[0]).not.toBe(0n); // x != 0 -> fri-fold-step's x-inverse never aborts on honest queries
      expect(Pt[1]).not.toBe(0n); // y != 0 -> the deferred circle first-fold's y-inverse is safe too
    }
  });
  it("bitrev is an involution: bitrev(bitrev(q)) == q", () => {
    for (let q = 0; q < N; q++) expect(cBitrev(cBitrev(BigInt(q)))).toBe(BigInt(q));
  });
  it("conjugate halves share x: domain-x(i) == domain-x(i+8) for i in [0,8)", () => {
    // NOTE (red-team): share-x is necessary-not-sufficient -- a degenerate no-conjugate construction
    // (domain-point(i)=OFF*H^(i mod 8)) also passes this. The y-negation test below is the load-bearing one.
    for (let i = 0; i < 8; i++) expect(cDomainX(BigInt(i))).toBe(cDomainX(BigInt(i + 8)));
  });
  it("conjugate halves negate y: domain-point(i+8) == conj(domain-point(i))", () => {
    for (let i = 0; i < 8; i++) expect(cDomainPoint(BigInt(i + 8))).toEqual(cconj(cDomainPoint(BigInt(i))));
  });
});

// Red-team: the existing structural tests check the GEOMETRIC pairing (i, i+8) but never wire bitrev into the
// ARRAY-ADJACENCY pairing the verifier actually folds. A shared bitrev-direction bug in BOTH query.clar and
// query.ts (the co-located-oracle trap -- e.g. "forgot to bit-reverse", an involution that keeps every x/y
// nonzero) would slip past every test above. These pin what FRI consumes, oracle-independently.
describe("query -- the bit-reversed array structure FRI folds (red-team: catches a shared bitrev bug)", () => {
  it("adjacent bit-reversed positions (2k, 2k+1) are conjugate siblings: same x, negated y", () => {
    for (let k = 0; k < 8; k++) {
      const a = cQueryPoint(BigInt(2 * k)), b = cQueryPoint(BigInt(2 * k + 1));
      expect(b[0]).toBe(a[0]);             // same x -> the circle first-fold (divide by y) collapses them
      expect(b[1]).toBe((P - a[1]) % P);   // negated y -> they are (x,y) and (x,-y), the y-divide siblings
    }
  });
  it("the 8 line x-coords (one per conjugate pair) pair adjacently as (x, -x): the line-fold sibling", () => {
    const pairX = Array.from({ length: 8 }, (_, k) => cQueryX(BigInt(2 * k))); // x shared by pair k
    for (let j = 0; j < 4; j++) expect(pairX[2 * j + 1]).toBe((P - pairX[2 * j]) % P);
  });
  it("the distinct domain x-set is CLOSED under negation (the line-FRI 2-to-1 prerequisite pi(x)=pi(-x))", () => {
    const xs = new Set(Array.from({ length: N }, (_, i) => cDomainX(BigInt(i))));
    for (const x of xs) expect(xs.has((P - x) % P)).toBe(true);
  });
  it("no pi-iterated FOLD-SOURCE layer (size > 1) contains x=0 -- the REAL fri-fold-step safety property", () => {
    // fri-fold-step aborts on the SOURCE x at EACH layer = pix^k(x), NOT layer-0 x_q; pix(32768)=0 with 32768
    // nonzero (= sqrt(1/2) mod p), so layer-0-nonzero is the wrong invariant. The size-1 terminal MAY be 0
    // (it is: pix^3 -> 0) -- it is a folded VALUE the driver compares, never a fold source.
    let layer = [...new Set(Array.from({ length: N }, (_, i) => cDomainX(BigInt(i))))]; // 8 distinct
    while (layer.length > 1) {
      for (const x of layer) expect(x).not.toBe(0n);
      layer = [...new Set(layer.map(pix))]; // pi halves the domain
    }
  });
});

describe("query -- tower cross-check (circle group law == the qm31 CM31 subfield)", () => {
  it("doubling a domain point via qm31-mul (CM31 embedded, u-coeff 0) matches cm-mul(P,P)", () => {
    for (let i = 0; i < N; i++) {
      const Pt = cDomainPoint(BigInt(i));
      const prod = cvToValue(simnet.callReadOnlyFn("qm31", "qm31-mul", [
        Cl.tuple({ c0: Cl.uint(Pt[0]), c1: Cl.uint(Pt[1]), c2: Cl.uint(0), c3: Cl.uint(0) }),
        Cl.tuple({ c0: Cl.uint(Pt[0]), c1: Cl.uint(Pt[1]), c2: Cl.uint(0), c3: Cl.uint(0) }),
      ], deployer).result) as any;
      const dbl = cmul(Pt, Pt);
      expect(num(prod.c0)).toBe(dbl[0]);
      expect(num(prod.c1)).toBe(dbl[1]);
      expect(num(prod.c2)).toBe(0n); // CM31 subfield: high limbs stay zero
      expect(num(prod.c3)).toBe(0n);
    }
  });
});

describe("query -- differential vs the independent (direct G^index_at) oracle", () => {
  it("contract domain-x and query-x match the oracle for every index", () => {
    for (let i = 0; i < N; i++) {
      expect(cDomainX(BigInt(i))).toBe(domainX(BigInt(i)));
      expect(cQueryX(BigInt(i))).toBe(queryX(BigInt(i)));
      expect(cBitrev(BigInt(i))).toBe(bitrev(BigInt(i)));
    }
  });
});

describe("query -- range guard", () => {
  it("an out-of-range index (>= DOMAIN_SIZE) aborts (reject direction)", () => {
    expect(() => cDomainX(DOMAIN_SIZE)).toThrow();
    expect(() => cQueryX(DOMAIN_SIZE)).toThrow();
  });
});
