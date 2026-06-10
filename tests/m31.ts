// Plain-JS reference implementation of Mersenne-31 field arithmetic (p = 2^31 - 1).
// Easy to get right; used as the oracle to differential-test the Clarity version.
export const P = 2147483647n; // 2^31 - 1

export const add = (a: bigint, b: bigint): bigint => (a + b) % P;
export const sub = (a: bigint, b: bigint): bigint => (((a - b) % P) + P) % P;
export const mul = (a: bigint, b: bigint): bigint => (a * b) % P;

// a^e mod p, by square-and-multiply (binary exponentiation).
export const pow = (a: bigint, e: bigint): bigint => {
  let result = 1n;
  let base = a % P;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % P; // if this bit is set, fold base into result
    base = (base * base) % P; // square the base for the next bit
    exp >>= 1n; // move to the next bit
  }
  return result;
};

// Multiplicative inverse via Fermat's little theorem: a^(p-2) = a^-1 for a != 0.
export const inv = (a: bigint): bigint => pow(a, P - 2n);

// Division: a / b = a * b^-1 (requires b != 0).
export const div = (a: bigint, b: bigint): bigint => mul(a, inv(b));
