// Independent oracle for gear 6d-i: the QM31 -> sha256 leaf encoding (obligation C's missing piece).
// Each limb is 4-byte BIG-ENDIAN, c0 first -- byte-identical to the 16-byte form transcript.clar's
// absorb-qm31 uses, so the bytes committed into the Merkle tree are the same bytes the transcript absorbs.
// A non-reduced limb (>= p) is REJECTED here (throws), matching the contract's canonicalization abort.
import { P } from "./m31";
import { QM31 } from "./qm31";
import { sha256 } from "./merkle";

export function encodeQm31(q: QM31): Buffer {
  const b = Buffer.alloc(16);
  for (let i = 0; i < 4; i++) {
    if (q[i] < 0n || q[i] >= P) throw new Error("non-canonical limb: " + q[i]);
    b.writeUInt32BE(Number(q[i]), i * 4);
  }
  return b;
}

export const qm31LeafOracle = (q: QM31): Buffer => sha256(encodeQm31(q));
