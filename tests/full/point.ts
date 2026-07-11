// tests/full/point.ts: the production parameter point, mirrored as TS constants.
// SOURCE OF TRUTH: tools/params.py (PRODUCTION_POINT). Regenerate the numbers
// with `python3 tools/params.py --json PRODUCTION_POINT` and keep this file in
// sync by hand. The get-params drift-guard test in tests/full/kats-full.test.ts
// fails if these numbers diverge from the generated artifact, which itself is
// generated from params.PRODUCTION_POINT.
export const POINT = {
  LOG_TRACE: 13,
  LOG_BLOWUP: 4,
  LOG_DOMAIN: 17,
  DOMAIN_SIZE: 131072,
  BLOWUP: 16,
  N_QUERIES: 23,
  N_LAYERS: 16,
  POW_BITS: 8,
  AIR_ID: 11,
  PARAMS_HEX: "171010080000000b",
} as const;
