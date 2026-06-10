import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { sha256, Step, buildTree, rootOf, makeProof, clPath } from "./merkle";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

// Merkle tree helpers + the Clarity-path bridge are shared from ./merkle (also used by commit.test.ts).

function cVerify(leaf: Buffer, path: Step[], root: Buffer): boolean {
  const r = simnet.callReadOnlyFn(
    "merkle",
    "merkle-verify",
    [Cl.buffer(leaf), clPath(path), Cl.buffer(root)],
    deployer
  ).result;
  return cvToValue(r) as boolean;
}

// --- deterministic random buffers so any failure reproduces ---

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x6d3a);
const randBuf = (): Buffer => {
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(rng() * 256);
  return b;
};
const randLeaves = (n: number): Buffer[] =>
  Array.from({ length: n }, () => randBuf());

// Flip one bit of a 32-byte buffer (smallest possible tamper).
const flipBit = (b: Buffer): Buffer => {
  const c = Buffer.from(b);
  c[0] ^= 0x01;
  return c;
};

describe("merkle-verify — accepts honest proofs", () => {
  it("verifies every leaf of trees of size 1, 2, 4, 8, 16", () => {
    for (const size of [1, 2, 4, 8, 16]) {
      const leaves = randLeaves(size);
      const levels = buildTree(leaves);
      const root = rootOf(levels);
      for (let idx = 0; idx < size; idx++) {
        const proof = makeProof(levels, idx);
        expect(cVerify(leaves[idx], proof, root)).toBe(true);
      }
    }
  });

  it("a single-leaf tree has an empty path and root == leaf", () => {
    const leaf = randBuf();
    expect(cVerify(leaf, [], leaf)).toBe(true);
  });
});

describe("merkle-verify — rejects forged proofs", () => {
  const size = 8;
  const leaves = randLeaves(size);
  const levels = buildTree(leaves);
  const root = rootOf(levels);
  const idx = 3;
  const proof = makeProof(levels, idx);
  const leaf = leaves[idx];

  it("rejects a tampered leaf", () => {
    expect(cVerify(flipBit(leaf), proof, root)).toBe(false);
  });

  it("rejects a tampered sibling", () => {
    const bad = proof.map((p, i) =>
      i === 1 ? { ...p, sibling: flipBit(p.sibling) } : p
    );
    expect(cVerify(leaf, bad, root)).toBe(false);
  });

  it("rejects a flipped direction bit", () => {
    const bad = proof.map((p, i) =>
      i === 0 ? { ...p, nodeIsRight: !p.nodeIsRight } : p
    );
    expect(cVerify(leaf, bad, root)).toBe(false);
  });

  it("rejects a wrong root", () => {
    expect(cVerify(leaf, proof, flipBit(root))).toBe(false);
  });

  it("rejects a proof for the wrong leaf (right shape, wrong index)", () => {
    const otherIdx = 6;
    expect(cVerify(leaves[otherIdx], proof, root)).toBe(false);
  });
});

describe("merkle-verify — randomized fuzz (seed 0x6d3a)", () => {
  it("accepts 300 honest proofs and rejects their single-bit tampers", () => {
    for (let t = 0; t < 300; t++) {
      const k = 1 + Math.floor(rng() * 5); // tree of 2^1..2^5 leaves
      const size = 1 << k;
      const leaves = randLeaves(size);
      const levels = buildTree(leaves);
      const root = rootOf(levels);
      const idx = Math.floor(rng() * size);
      const proof = makeProof(levels, idx);

      // honest proof passes
      expect(cVerify(leaves[idx], proof, root)).toBe(true);

      // tamper exactly one thing at random -> must fail
      const which = Math.floor(rng() * 3);
      if (which === 0) {
        expect(cVerify(flipBit(leaves[idx]), proof, root)).toBe(false);
      } else if (which === 1) {
        const lvl = Math.floor(rng() * proof.length);
        const bad = proof.map((p, i) =>
          i === lvl ? { ...p, sibling: flipBit(p.sibling) } : p
        );
        expect(cVerify(leaves[idx], bad, root)).toBe(false);
      } else {
        expect(cVerify(leaves[idx], proof, flipBit(root))).toBe(false);
      }
    }
  });
});
