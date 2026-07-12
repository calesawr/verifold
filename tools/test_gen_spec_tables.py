#!/usr/bin/env python3
"""Unit tests for tools/gen_spec_tables.py. No pytest in this environment:
plain asserts, run as `python3 tools/test_gen_spec_tables.py`."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_spec_tables as g
import params


def _fails(text):
    try:
        g.parse_fences(text)
    except SystemExit as e:
        return str(e)
    raise AssertionError("expected FenceError, parse succeeded")


def test_begin_without_end_fails():
    msg = _fails("<!-- BEGIN-GENERATED: field-constants -->\nx\n")
    assert "never closed" in msg, msg


def test_end_without_begin_fails():
    msg = _fails("x\n<!-- END-GENERATED: field-constants -->\n")
    assert "without BEGIN" in msg, msg


def test_unknown_block_id_fails_listing_offender():
    msg = _fails("<!-- BEGIN-GENERATED: no-such-block -->\n"
                 "<!-- END-GENERATED: no-such-block -->\n")
    assert "unknown block id no-such-block" in msg, msg


def test_mismatched_pair_fails():
    msg = _fails("<!-- BEGIN-GENERATED: field-constants -->\n"
                 "<!-- END-GENERATED: qm31-tower -->\n")
    assert "does not match" in msg, msg


def test_duplicate_block_id_fails():
    msg = _fails(("<!-- BEGIN-GENERATED: field-constants -->\n"
                  "<!-- END-GENERATED: field-constants -->\n") * 2)
    assert "duplicate block id field-constants" in msg, msg


def test_all_offenders_reported_in_one_run():
    msg = _fails("<!-- END-GENERATED: qm31-tower -->\n"
                 "<!-- BEGIN-GENERATED: not-a-block -->\n"
                 "<!-- END-GENERATED: not-a-block -->\n")
    assert "without BEGIN" in msg and "unknown block id not-a-block" in msg, msg


def test_registry_is_exactly_the_pinned_twenty():
    pinned = {
        "field-constants", "qm31-tower", "circle-generator",
        "merkle-leaf-encoding", "transcript-operations", "transcript-schedule",
        "air-constants", "deep-openings", "fri-layer-table", "hint-check",
        "verify-signature", "attest-integration", "parameter-point",
        "soundness-accounting", "deviations-register", "vector-ctx",
        "vector-challenges", "vector-query-bundle", "vector-final",
        "wire-v1-appendix",
    }
    ids = set(g.EMITTERS) | set(g.PENDING)
    assert ids == pinned, ids.symmetric_difference(pinned)
    assert not set(g.EMITTERS) & set(g.PENDING)


def test_field_constants_reads_params():
    out = g.emit_field_constants()
    assert str(params.P) in out, out
    assert "tools/params.py" in out


def test_qm31_tower_quotes_the_gear_header():
    out = g.emit_qm31_tower()
    assert "CM31 = M31[i]/(i^2 + 1)" in out, out
    assert "QM31 = CM31[u]/(u^2 - (2+i))" in out, out
    assert "(c0 + c1*i) + (c2 + c3*i)*u" in out, out
    # the gear comment tail (double-hyphen prose) must not leak in
    assert "--" not in out.replace("<!--", "").replace("-->", ""), out


def test_circle_generator_reads_params_g():
    out = g.emit_circle_generator()
    assert str(params.G[0]) in out and str(params.G[1]) in out, out
    assert "2^31" in out


def test_parameter_point_matches_derived():
    d = params.derived(params.PRODUCTION_POINT)
    out = g.emit_parameter_point()
    for needle in (str(d["DOMAIN_SIZE"]), str(d["TRACE_ROWS"]),
                   str(d["POW_THRESHOLD"]), d["PARAMS"].hex(),
                   str(d["SEL"]["B"]), str(d["B01"]["B"]),
                   str(params.PRODUCTION_POINT["n_queries"])):
        assert needle in out, needle


def test_spec_splice_deterministic_double_run():
    text = g.read_text(g.SPEC)
    once, n1 = g.splice(text)
    twice, n2 = g.splice(once)
    assert n1 == n2 == 20, (n1, n2)
    assert once == twice


def test_merkle_leaf_encoding_quotes_contract_and_example_is_real():
    import hashlib
    out = g.emit_merkle_leaf_encoding()
    # known substrings from the real source (flat contract, commit gear)
    assert "(define-private (commit/m31-to-be4" in out, out
    assert "(define-read-only (commit/qm31-leaf" in out, out
    assert "slice? (unwrap-panic (to-consensus-buff? v)) u13 u17" in out
    # the worked example must be the generator's own computation
    enc = b"".join(v.to_bytes(4, "big") for v in (1, 2, 3, 4))
    assert enc.hex() in out
    assert hashlib.sha256(enc).hexdigest() in out


def test_transcript_operations_tags_come_from_contract():
    out = g.emit_transcript_operations()
    flat = g.read_text(g.FLAT)
    import re as _re
    for name in ("OP_ABSORB", "OP_SQUEEZE", "OP_POW",
                 "T_ROOT", "T_QM31", "T_NONCE"):
        tag = _re.search(r"\(define-constant transcript/" + name
                         + r" (0x[0-9a-f]+)\)", flat).group(1)
        assert "| {} | {} |".format(name, tag) in out, name
    assert "(define-read-only (transcript/squeeze-m31" in out
    assert "(define-read-only (transcript/pow-ok" in out


def test_transcript_schedule_matches_contract_and_kats():
    import json
    out = g.emit_transcript_schedule()
    assert "(define-read-only (schedule/derive-challenges" in out
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "kats-full.json")) as f:
        kats = json.load(f)
    assert "squeeze m31 {} times".format(len(kats["queryIndices"])) in out
    assert "each of the {} FRI roots".format(len(kats["friRoots"])) in out
    # the modulus must be the contract's schedule/DOMAIN_SIZE
    import re as _re
    dom = _re.search(r"\(define-constant schedule/DOMAIN_SIZE u(\d+)\)",
                     g.read_text(g.FLAT)).group(1)
    assert "mod {}".format(dom) in out


def test_air_constants_cross_checks_params_against_contract():
    out = g.emit_air_constants()
    d = params.derived(params.PRODUCTION_POINT)
    for needle in (str(d["SX"]), str(d["SY"]), str(d["SEL"]["A"]),
                   str(d["SEL"]["B"]), str(d["B01"]["B"])):
        assert needle in out, needle
    # registry rows come from params.POINTS, not from prose
    assert "| 10 | TOY_POINT |" in out
    assert "PRODUCTION_POINT" in out
    assert "air_id registry is monotonic" in out  # quoted from params.py


def test_deep_openings_table_rows_verified_against_deep_row():
    out = g.emit_deep_openings()
    assert "(define-read-only (cdeep/deep-row" in out
    assert "(define-read-only (cdeep/line-coeffs" in out
    assert "(define-read-only (cdeep/denom-inv" in out
    for w in ("gamma^2", "gamma^3", "gamma^4", "gamma^5", "gamma^6"):
        assert w in out, w
    assert "(cdeep/line-coeffs zy c3-z g6)" in out  # anchor column live


def test_fri_layer_table_sizes_and_layer_count():
    out = g.emit_fri_layer_table()
    d = params.derived(params.PRODUCTION_POINT)
    assert "| 0 | {} |".format(d["DOMAIN_SIZE"]) in out
    assert "| {} | 2 |".format(d["N_LAYERS"]) in out  # transmitted final
    assert out.count("committed (fri root") == d["N_LAYERS"]
    assert "transmitted" in out


def test_hint_check_quotes_the_exact_guard_line():
    out = g.emit_hint_check()
    assert "(define-read-only (fri/fri-fold-step-hint" in out
    assert ("(unwrap-panic (if (is-eq (field/m31-mul x hint) u1)"
            " (some true) none))") in out


TESTS = [
    test_begin_without_end_fails,
    test_end_without_begin_fails,
    test_unknown_block_id_fails_listing_offender,
    test_mismatched_pair_fails,
    test_duplicate_block_id_fails,
    test_all_offenders_reported_in_one_run,
    test_registry_is_exactly_the_pinned_twenty,
    test_field_constants_reads_params,
    test_qm31_tower_quotes_the_gear_header,
    test_circle_generator_reads_params_g,
    test_parameter_point_matches_derived,
    test_spec_splice_deterministic_double_run,
    test_merkle_leaf_encoding_quotes_contract_and_example_is_real,
    test_transcript_operations_tags_come_from_contract,
    test_transcript_schedule_matches_contract_and_kats,
    test_air_constants_cross_checks_params_against_contract,
    test_deep_openings_table_rows_verified_against_deep_row,
    test_fri_layer_table_sizes_and_layer_count,
    test_hint_check_quotes_the_exact_guard_line,
]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
