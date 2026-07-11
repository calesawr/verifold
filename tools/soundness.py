#!/usr/bin/env python3
"""Soundness accounting for verifold parameter points. Stdlib only.

Two accountings, both itemized so an expert can check the arithmetic.

CONJECTURED (the published headline, always named as a conjecture):
ethSTARK-style accounting (StarkWare, "ethSTARK Documentation", IACR
ePrint 2021/582, Conjecture 1, the capacity / "toy problem" conjecture):
each FRI query contributes log2(blowup) bits and grinding contributes
pow_bits, so

    conjectured = n_queries * log2(blowup) + pow_bits

capped by the two challenge-space ceilings no query count can exceed:
  ood_term        = log2(|QM31|) = 4 * log2(2^31 - 1), about 124 bits.
                    Every Fiat-Shamir challenge (alpha, z, gamma, betas)
                    is one QM31 element, so the OOD/DEEP batching error
                    terms are at best ~2^-124 each.
  transcript_term = 128. The transcript squeezes and the PoW check read
                    16 bytes (128 bits) of sha256 output
                    (transcript.clar; gear6e_replay.py squeeze_m31 and
                    pow_val both take blk[:16]).

PROVEN (the conservative disclosure, always computed alongside):
Johnson-bound accounting: in the provable list-decoding regime FRI gives
roughly sqrt(rate) proximity per query, i.e. HALF the rate-bits, so

    proven = n_queries * log2(blowup) / 2 + pow_bits

with the same caps. This is the conservative reading of the ethSTARK
provable-vs-conjectured discussion (ePrint 2021/582); it deliberately
drops the small additive epsilons (field-size and list-size terms, and
this repo's drawn-not-deduped query collisions) that shave fractions of
a bit at these domain sizes. docs/m2-soundness.md (Task 19) quantifies
those fractions term by term."""
import math

from params import P


def bits(point):
    """Both accountings for one parameter point.

    Returns {"conjectured": float, "proven": float, "terms": dict} where
    terms itemizes query_term, proven_query_term, grinding_term,
    ood_term, transcript_term, and applied_cap ("none" when the additive
    sum is below both ceilings, else the binding ceiling's name)."""
    query_term = point["n_queries"] * point["log_blowup"]
    proven_query_term = query_term / 2
    grinding_term = point["pow_bits"]
    ood_term = 4 * math.log2(P)   # ~123.99999999731
    transcript_term = 128.0
    cap = min(ood_term, transcript_term)
    raw_conjectured = query_term + grinding_term
    raw_proven = proven_query_term + grinding_term
    if raw_conjectured <= cap:
        applied_cap = "none"
    elif ood_term <= transcript_term:
        applied_cap = "ood_term"
    else:
        applied_cap = "transcript_term"
    return {
        "conjectured": min(raw_conjectured, cap),
        "proven": min(raw_proven, cap),
        "terms": {
            "query_term": query_term,
            "proven_query_term": proven_query_term,
            "grinding_term": grinding_term,
            "ood_term": ood_term,
            "transcript_term": transcript_term,
            "applied_cap": applied_cap,
        },
    }


if __name__ == "__main__":
    import params
    for name in sorted(params.POINTS):
        b = bits(params.POINTS[name])
        print(f"{name}: conjectured {b['conjectured']} proven {b['proven']}"
              f" (cap: {b['terms']['applied_cap']})")
