#!/usr/bin/env python3
"""Unit tests for tools/flatten.py. No pytest in this environment:
plain asserts, run as `python3 tools/test_flatten.py` from the repo root."""
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flatten


def test_tokenize_edge_cases():
    # covers: 0x literals, comments, tuple sugar with colon and comma, strings
    src = '(define-constant X 0x0102) ;; c\n{ a: u1, b: "s" }'
    kinds = [t.kind for t in flatten.tokenize(src)]
    assert kinds == ["LPAREN", "ATOM", "ATOM", "ATOM", "RPAREN", "COMMENT",
                     "LBRACE", "ATOM", "COLON", "ATOM", "COMMA",
                     "ATOM", "COLON", "STRING", "RBRACE"], kinds
    # atoms may contain ? ! . / (contract-call?, require!, .field, sha512/256)
    texts = [t.text for t in flatten.tokenize("(contract-call? .field require! sha512/256)")]
    assert texts == ["(", "contract-call?", ".field", "require!", "sha512/256", ")"], texts


def test_reemission_byte_identical_all_gears():
    # Stage 1 acceptance: re-emitting each gear from its spans with zero edits
    # is byte-identical (sha256 equal) for all 11 inputs.
    for gear in flatten.GEAR_ORDER:
        src = flatten.read_gear(gear)
        out = flatten.reemit(src, flatten.tokenize(src))
        assert hashlib.sha256(out.encode()).hexdigest() == \
            hashlib.sha256(src.encode()).hexdigest(), gear


def test_symbol_tables_field():
    g = flatten.Gear("field", flatten.read_gear("field"))
    d = g.defs["m31-add"]
    assert d.kind == "read-only" and d.arity == 2
    assert [p[0] for p in d.params] == ["a", "b"]
    assert g.defs["pow-step"].kind == "private"
    assert g.defs["P"].kind == "constant"
    assert g.defs["P"].value == ("uint", 2147483647)
    assert g.defs["STEPS"].value[0] == "list"
    assert len(g.defs["STEPS"].value[1]) == 31


def test_symbol_tables_all_gears():
    total = 0
    for name in flatten.GEAR_ORDER:
        g = flatten.Gear(name, flatten.read_gear(name))
        total += len(g.defs)
    assert total == 134, total


def test_constant_values():
    q = flatten.Gear("query", flatten.read_gear("query"))
    assert q.defs["OFF"].value == ("tuple", {"re": ("uint", 1179735656),
                                             "im": ("uint", 1241207368)})
    d = flatten.Gear("driver", flatten.read_gear("driver"))
    assert d.defs["PARAMS"].value == ("buff", bytes.fromhex("040302080000000a"))
    t = flatten.Gear("transcript", flatten.read_gear("transcript"))
    assert t.defs["OP_ABSORB"].value == ("buff", b"\x00")


def _flat_text(name):
    g = flatten.Gear(name, flatten.read_gear(name))
    a = flatten.classify_gear(g)
    return flatten.apply_edits(g.src, a.edits)


def test_rename_field():
    text = _flat_text("field")
    assert "(define-read-only (field/m31-add (a uint) (b uint))" in text
    assert "(mod (+ a b) field/P)" in text
    assert "(define-constant field/P u2147483647)" in text


def test_fold_callbacks_renamed():
    # the bare callback name is just another matching atom; no special case
    assert "(fold field/pow-step field/STEPS" in _flat_text("field")


def test_contract_call_elimination_qm31():
    text = _flat_text("qm31")
    assert "contract-call?" not in text
    assert "(field/m31-inv (qm31/m31-add (qm31/m31-mul c0 c0) " \
           "(qm31/m31-mul c1 c1))" in text
    # tuple keys re/im and get keys survive untouched
    assert "{ re: (qm31/m31-mul c0 ninv)" in text
    assert "(qm31/cm-mul-r (get re bd) (get im bd))" in text


def test_nested_call_rewrite_driver():
    # nested contract-call? in an argument position rewrites inside out
    text = _flat_text("driver")
    assert "contract-call?" not in text
    assert "(merkle/merkle-root (driver/qleaf self)" in text
    assert "(fold driver/query-step queries" in text


def test_tuple_keys_and_get_keys_never_renamed():
    # synthetic: a tuple key and a get key that COLLIDE with a top-level name
    # must stay bare while the constant itself is prefixed
    src = ("(define-constant re u1)\n"
           "(define-read-only (f (t { re: uint })) (get re t))\n")
    g = flatten.Gear("field", src)
    a = flatten.classify_gear(g)
    text = flatten.apply_edits(g.src, a.edits)
    assert "(define-constant field/re u1)" in text
    assert "(get re t)" in text
    assert "{ re: uint }" in text


def test_merge_key_positions():
    # synthetic: a top-level constant name (P) appears as a tuple key inside a
    # merge call. Per the brief, tuple keys must never be renamed. The Tup branch
    # in classify_gear walk should exclude P when it is a key in the tuple literals
    # passed to merge (bare keys can only appear inside tuple literals, excluded
    # by Tup); however, P as a value position should be renamed.
    src = ("(define-constant P u7)\n"
           "(define-read-only (f) (merge { P: u1 } { q: P }))\n")
    g = flatten.Gear("field", src)
    a = flatten.classify_gear(g)
    text = flatten.apply_edits(g.src, a.edits)
    # The constant definition itself is renamed
    assert "(define-constant field/P u7)" in text
    # The tuple key P (inside { P: u1 }) must stay bare
    assert "{ P: u1 }" in text
    # The value-position reference to P (inside { q: P }) must be renamed
    assert "{ q: field/P }" in text


def test_emit_two_gear_skeleton():
    gears, _by = flatten.build(["field", "qm31"])
    flat = flatten.emit_flat(gears)
    assert flat.startswith(";; verifold-flat.clar: GENERATED FILE. DO NOT EDIT.")
    assert "gear: field (contracts/field.clar)" in flat
    assert "gear: qm31 (contracts/qm31.clar)" in flat
    assert "contract-call?" not in flat
    # comments stripped: the only ;; lines are the header and the banners
    comment_lines = [ln for ln in flat.split("\n") if ln.lstrip().startswith(";;")]
    assert all(("GENERATED" in ln or "gear:" in ln or "Inputs" in ln
                or "Generator" in ln or "Regenerate" in ln or "Verify" in ln
                or ln.startswith(";;   ") or "One-contract" in ln)
               for ln in comment_lines), comment_lines


def expect_error(fn, needle):
    try:
        fn()
    except flatten.FlattenError as e:
        assert needle in str(e), (needle, str(e))
        return
    raise AssertionError(f"expected FlattenError containing {needle!r}")


def _all_gears():
    gears, by_name = flatten.build(list(flatten.GEAR_ORDER))
    sites = [s for g in gears for s in g.analysis.call_sites]
    return gears, by_name, sites


def test_native_whitelist_classifies_all_gears():
    # Stage 2 acceptance: all atoms in all 11 gears classify with the REAL
    # whitelist in force (build() raises on any unclassifiable atom)
    gears, _by, sites = _all_gears()
    # This assertion was the RED-phase guard and now documents intent.
    assert flatten.NATIVE_WHITELIST is not None
    assert len(sites) == 138


def test_unclassifiable_atom_is_error():
    expect_error(
        lambda: flatten.classify_gear(
            flatten.Gear("field", "(define-read-only (f) (frobnicate u1))")),
        "unclassifiable atom 'frobnicate'")


def test_call_census_pinned():
    _gears, by_name, sites = _all_gears()
    counts = {}
    for s in sites:
        counts[s.callee] = counts.get(s.callee, 0) + 1
    assert counts == flatten.PINNED_CALL_BREAKDOWN
    flatten.check_call_sites(by_name, sites)  # must not raise


def test_call_census_drift_fires():
    _gears, by_name, sites = _all_gears()
    # sites[0] is a real qm31 site, so the duplicate passes all per-site gates
    # and only the census comparison fires.
    expect_error(lambda: flatten.check_call_sites(by_name, sites + [sites[0]]),
                 "census drifted")


def test_non_readonly_callee_fires():
    _gears, by_name, sites = _all_gears()
    by_name["field"].defs["m31-inv"].kind = "private"  # fresh objects per test
    expect_error(lambda: flatten.check_call_sites(by_name, sites),
                 "not read-only")


def test_definition_order_violation_fires():
    # a gear calling a LATER gear cannot flatten in deploy order
    caller = flatten.Gear("field",
        "(define-read-only (f (a uint)) (contract-call? .qm31 qm31-from-m31 a))")
    a = flatten.classify_gear(caller)
    by_name = {"field": caller,
               "qm31": flatten.Gear("qm31", flatten.read_gear("qm31"))}
    # The definition-order gate fires inside the per-site loop, BEFORE the
    # census comparison, by design — so this synthetic 2-gear call-site list
    # never reaches the census check.
    expect_error(lambda: flatten.check_call_sites(by_name, a.call_sites),
                 "definition order")


def test_forbidden_define_public_fires():
    expect_error(lambda: flatten.Gear("field", "(define-public (f) (ok true))"),
                 "forbidden top-level form define-public")


def test_forbidden_data_var_fires():
    expect_error(lambda: flatten.Gear("field", "(define-data-var n uint u0)"),
                 "forbidden top-level form define-data-var")


def test_forbidden_trait_fires():
    expect_error(
        lambda: flatten.Gear("field",
            "(define-trait t ((f (uint) (response uint uint))))"),
        "forbidden top-level form define-trait")


def test_forbidden_env_atom_fires():
    expect_error(
        lambda: flatten.classify_gear(
            flatten.Gear("field", "(define-read-only (f) tx-sender)")),
        "forbidden native 'tx-sender'")


def test_wrap_around_contract_call_fires():
    src = ("(define-read-only (f) "
           "(try! (contract-call? .field m31-add u1 u2)))")
    expect_error(lambda: flatten.classify_gear(flatten.Gear("qm31", src)),
                 "try! wraps a contract-call?")


def test_collision_lint_fires():
    g = flatten.Gear("field",
        "(define-constant one u1)\n"
        "(define-read-only (f) (let ((one u2)) one))")
    g.analysis = flatten.classify_gear(g)
    expect_error(lambda: flatten.check_collisions([g]), "collide")


def test_lint_green_on_real_gears():
    gears, _by, _sites = _all_gears()  # env atoms and wraps checked in classify
    flatten.check_collisions(gears)    # locals/keys vs same-gear top-level names


def test_tripwire_green_on_real_gears():
    _gears, by_name, _sites = _all_gears()
    flatten.check_coupled_constants(by_name)


def test_tripwire_fires_on_diverged_p():
    _gears, by_name, _sites = _all_gears()
    by_name["qm31"].defs["P"].value = ("uint", 2147483646)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "P copies diverged")


def test_tripwire_fires_on_diverged_sx():
    _gears, by_name, _sites = _all_gears()
    by_name["cdeep"].defs["SX"].value = ("uint", 32769)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "cair.SX != cdeep.SX")


def test_tripwire_fires_on_diverged_domain_size():
    _gears, by_name, _sites = _all_gears()
    by_name["query"].defs["DOMAIN_SIZE"].value = ("uint", 32)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "query.DOMAIN_SIZE != schedule.DOMAIN_SIZE")


def test_tripwire_fires_on_params_drift():
    _gears, by_name, _sites = _all_gears()
    by_name["schedule"].defs["N"].value = ("uint", 5)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "PARAMS N byte")


def test_tripwire_fires_on_blowup_formula():
    # flip only the blowup byte (2 -> 3): DOMAIN_SIZE 16 != 8 * 3
    _gears, by_name, _sites = _all_gears()
    by_name["driver"].defs["PARAMS"].value = \
        ("buff", bytes.fromhex("040303080000000a"))
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "blowup byte")


def test_tripwire_fires_on_pow_threshold_formula():
    _gears, by_name, _sites = _all_gears()
    by_name["schedule"].defs["POW_THRESHOLD"].value = ("uint", 12345)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "POW_THRESHOLD != 2^(128")


def test_tripwire_fires_on_query_counter_length():
    _gears, by_name, _sites = _all_gears()
    by_name["schedule"].defs["QUERY_COUNTER"].value = \
        ("list", [("uint", 0), ("uint", 1), ("uint", 2)])
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "QUERY_COUNTER length 3")


def test_tripwire_fires_on_inlined_get_params():
    # get-params must RETURN the constants, not inline literals; doctor the
    # parsed body so the n slot carries a literal and the sub-check fires
    _gears, by_name, _sites = _all_gears()
    schedule = by_name["schedule"]
    form = next(f for f in schedule.forms
                if f.start == schedule.defs["get-params"].start)
    key, _val = form.children[2].pairs[0]
    form.children[2].pairs[0] = (key, flatten.Token("ATOM", "u4", 0, 2))
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "get-params returns")


def test_tripwire_fires_on_params_l_drift():
    # L byte (index 1) changed to 4, N unchanged
    _gears, by_name, _sites = _all_gears()
    by_name["driver"].defs["PARAMS"].value = ("buff", bytes.fromhex("040402080000000a"))
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "PARAMS L byte")


def test_tripwire_fires_on_sy_drift():
    # SY constant in cdeep must differ from cair's SY
    _gears, by_name, _sites = _all_gears()
    by_name["cdeep"].defs["SY"].value = ("uint", 32769)
    expect_error(lambda: flatten.check_coupled_constants(by_name),
                 "SY")


TESTS = [
    test_tokenize_edge_cases,
    test_reemission_byte_identical_all_gears,
    test_symbol_tables_field,
    test_symbol_tables_all_gears,
    test_constant_values,
    test_rename_field,
    test_fold_callbacks_renamed,
    test_contract_call_elimination_qm31,
    test_nested_call_rewrite_driver,
    test_tuple_keys_and_get_keys_never_renamed,
    test_merge_key_positions,
    test_emit_two_gear_skeleton,
    test_native_whitelist_classifies_all_gears,
    test_unclassifiable_atom_is_error,
    test_call_census_pinned,
    test_call_census_drift_fires,
    test_non_readonly_callee_fires,
    test_definition_order_violation_fires,
    test_forbidden_define_public_fires,
    test_forbidden_data_var_fires,
    test_forbidden_trait_fires,
    test_forbidden_env_atom_fires,
    test_wrap_around_contract_call_fires,
    test_collision_lint_fires,
    test_lint_green_on_real_gears,
    test_tripwire_green_on_real_gears,
    test_tripwire_fires_on_diverged_p,
    test_tripwire_fires_on_diverged_sx,
    test_tripwire_fires_on_diverged_domain_size,
    test_tripwire_fires_on_params_drift,
    test_tripwire_fires_on_blowup_formula,
    test_tripwire_fires_on_pow_threshold_formula,
    test_tripwire_fires_on_query_counter_length,
    test_tripwire_fires_on_inlined_get_params,
    test_tripwire_fires_on_params_l_drift,
    test_tripwire_fires_on_sy_drift,
]

if __name__ == "__main__":
    for t in TESTS:
        t()
        print(f"PASS {t.__name__}")
    print(f"OK ({len(TESTS)} tests)")
