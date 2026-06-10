// Shared Merkle-tree helpers: a plain sha256 binary tree (the oracle) + the Clarity-path bridge.
// Used by merkle.test.ts and by commit.test.ts (gear 6d-i, which commits QM31 leaves).
import { Cl } from "@stacks/transactions";
import { createHash } from "node:crypto";

export const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest();

export type Step = { sibling: Buffer; nodeIsRight: boolean };

// Build all levels (level 0 = leaves, last level = [root]); leaves.length must be a power of two.
export function buildTree(leaves: Buffer[]): Buffer[][] {
  const levels: Buffer[][] = [leaves];
  let cur = leaves;
  while (cur.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(sha256(Buffer.concat([cur[i], cur[i + 1]])));
    levels.push(next);
    cur = next;
  }
  return levels;
}

export const rootOf = (levels: Buffer[][]): Buffer => levels[levels.length - 1][0];

// The authentication path for the leaf at `index`: one sibling per level, plus a bool saying whether
// OUR node sits on the right (so the verifier knows the concat order). Mirrors the Clarity merkle-step.
export function makeProof(levels: Buffer[][], index: number): Step[] {
  const path: Step[] = [];
  let i = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const nodeIsRight = i % 2 === 1;
    const siblingIndex = nodeIsRight ? i - 1 : i + 1;
    path.push({ sibling: levels[level][siblingIndex], nodeIsRight });
    i = Math.floor(i / 2);
  }
  return path;
}

export const clPath = (path: Step[]) =>
  Cl.list(path.map((p) => Cl.tuple({ sibling: Cl.buffer(p.sibling), "node-is-right": Cl.bool(p.nodeIsRight) })));
