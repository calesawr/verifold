// Plain-JS reference for the Fiat-Shamir transcript ("channel"), gear 4.
// Easy to read = easy to trust; used as the oracle to differential-test the Clarity version.
// Design (locked for the spike, per the gear-4 design panel):
//   - state is ONE evolving 32-byte sha256 digest (no growing buffer, no counter)
//   - absorb:   state' = sha256(state || 0x00 || type_tag || msg)        (stir a commitment in)
//   - squeeze:  blk = sha256(state || 0x01); value = BE(blk[0..16]) mod p; state' = blk
//   - pow:      BE(sha256(state || 0x02 || nonce)[0..16]) < threshold
// Big-endian, 16-byte reduce, advance-on-squeeze. All choices are deliberate (see spec).
import { createHash } from "node:crypto";

export const P = 2147483647n; // 2^31 - 1, shared with field.clar

// 1-byte op tags (keep absorb / squeeze / proof-of-work in disjoint hash-input spaces)
const OP_ABSORB = 0x00;
const OP_SQUEEZE = 0x01;
const OP_POW = 0x02;

// 1-byte field-kind tags (so a root can never be reinterpreted as a qm31, etc.)
export const T_ROOT = 0x01;
export const T_M31 = 0x02;
export const T_QM31 = 0x03;
export const T_NONCE = 0x05;

const sha = (b: Buffer): Buffer => createHash("sha256").update(b).digest();

// big-endian: first byte is most significant (matches Clarity buff-to-uint-be)
const beUint = (b: Buffer): bigint => {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
};

// seed the transcript from the caller-assembled context
// (DOMAIN_LABEL || VERSION || PARAMS || sha256(public_inputs))
export const tInit = (ctx: Buffer): Buffer => sha(ctx);

// stir one tagged, fixed-width message into the state
export const absorb = (state: Buffer, typeTag: number, msg: Buffer): Buffer =>
  sha(Buffer.concat([state, Buffer.from([OP_ABSORB, typeTag]), msg]));

export const absorbRoot = (state: Buffer, root: Buffer): Buffer => absorb(state, T_ROOT, root);
export const absorbQm31 = (state: Buffer, q: Buffer): Buffer => absorb(state, T_QM31, q);
// bind the 8-byte grinding nonce in its own tag space (gear 6d-ii Fiat-Shamir schedule)
export const absorbNonce = (state: Buffer, nonce: Buffer): Buffer => absorb(state, T_NONCE, nonce);

// read out one Mersenne-31 challenge; the state advances so the next read differs
export const squeezeM31 = (state: Buffer): { v: bigint; state: Buffer } => {
  const blk = sha(Buffer.concat([state, Buffer.from([OP_SQUEEZE])]));
  return { v: beUint(blk.subarray(0, 16)) % P, state: blk };
};

// a QM31 (~124-bit) challenge = 4 independent M31 limbs, threading the state
export const squeezeQm31 = (
  state: Buffer
): { c0: bigint; c1: bigint; c2: bigint; c3: bigint; state: Buffer } => {
  const r0 = squeezeM31(state);
  const r1 = squeezeM31(r0.state);
  const r2 = squeezeM31(r1.state);
  const r3 = squeezeM31(r2.state);
  return { c0: r0.v, c1: r1.v, c2: r2.v, c3: r3.v, state: r3.state };
};

// grinding / proof-of-work check: leading 16 bytes as BE uint must be below the threshold
export const powOk = (state: Buffer, nonce: Buffer, threshold: bigint): boolean => {
  const h = sha(Buffer.concat([state, Buffer.from([OP_POW]), nonce]));
  return beUint(h.subarray(0, 16)) < threshold;
};
