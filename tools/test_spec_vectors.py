#!/usr/bin/env python3
"""Independent re-verification of the docs/protocol-spec.md test vectors.

Parses the four vector blocks OUT of the shipped document and re-checks
every value against the committed fixtures directly (tools/kats-full.json,
interop/fixtures/rust-proofs-full.json, docs/m3-testnet-receipts.md),
importing nothing from tools/gen_spec_tables.py: the document is checked
against the chain of custody, not against its own generator. A missing
spec or fixture file is an error, never a skip (all inputs are committed).
Plain assert, stdlib only."""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from params import PRODUCTION_POINT, derived

SPEC = os.path.join(ROOT, "docs", "protocol-spec.md")
KATS = os.path.join(HERE, "kats-full.json")
FIXTURES = os.path.join(ROOT, "interop", "fixtures", "rust-proofs-full.json")
RECEIPTS = os.path.join(ROOT, "docs", "m3-testnet-receipts.md")


def block(doc, block_id):
    m = re.search(r"<!-- BEGIN-GENERATED: " + re.escape(block_id)
                  + r" -->\n(.*?)\n<!-- END-GENERATED: " + re.escape(block_id)
                  + r" -->", doc, re.S)
    assert m, f"block {block_id} not found in docs/protocol-spec.md"
    return m.group(1)


def doc_list(body, name):
    m = re.search(re.escape(name) + r"\s*= (\[[^\]]*\])", body)
    assert m, f"{name} line not found"
    return json.loads(m.group(1))


def main():
    doc = open(SPEC).read()
    kats = json.load(open(KATS))
    fx0 = json.load(open(FIXTURES))[0]
    dv = derived(PRODUCTION_POINT)
    n_layers = dv["N_LAYERS"]

    # vector-ctx: the hex string, then the breakdown re-derived from scratch
    ctx_block = block(doc, "vector-ctx")
    m = re.search(r"ctx \((\d+) bytes\) = ([0-9a-f]+)", ctx_block)
    assert m, "ctx line not found"
    n, ctx_hex = int(m.group(1)), m.group(2)
    assert ctx_hex == kats["ctx"], "doc ctx differs from kats-full.json"
    ctx = bytes.fromhex(ctx_hex)
    assert len(ctx) == n, "stated ctx byte length wrong"
    assert ctx[:14] == b"verifold-fs-v1", "DOMAIN_LABEL bytes"
    assert ctx[14] == 2, "wire v2 VERSION byte"
    assert ctx[15:23] == dv["PARAMS"], "PARAMS slice disagrees with params.py"
    assert ctx[23:] == hashlib.sha256(bytes.fromhex(kats["pub"])).digest(), \
        "pub hash slice"
    for off, ln in ((0, 14), (14, 1), (15, 8), (23, 32)):
        assert re.search(r"\| %d \| %d \| %s \|" % (off, ln,
                         ctx[off:off + ln].hex()), ctx_block), \
            f"offset row {off} missing or wrong"

    # vector-challenges
    ch = block(doc, "vector-challenges")
    assert doc_list(ch, "alpha") == kats["alpha"]
    assert doc_list(ch, "zfelt") == kats["zfelt"]
    assert doc_list(ch, "gamma") == kats["gamma"]
    assert len(kats["betas"]) == n_layers, "betas count is not one per layer"
    assert doc_list(ch, "betas[0]") == kats["betas"][0]
    assert doc_list(ch, f"betas[{n_layers - 1}]") == kats["betas"][-1]
    assert doc_list(ch, "queryIndices") == kats["queryIndices"]
    assert len(kats["queryIndices"]) == PRODUCTION_POINT["n_queries"]
    mn = re.search(r"nonce\s*= ([0-9a-f]+)", ch)
    assert mn and mn.group(1) == kats["nonce"], "nonce differs"
    assert kats["queryIndices"] == fx0["queryIndices"], \
        "KAT and fixture query indices differ"

    # vector-query-bundle: fixture 0 bundle 0
    qb = block(doc, "vector-query-bundle")
    b0 = fx0["bundles"][0]
    mq = re.search(r"queryIndex\s*= (\d+)", qb)
    assert mq and int(mq.group(1)) == fx0["queryIndices"][0]
    assert doc_list(qb, "tX") == b0["tX"]
    assert doc_list(qb, "cX") == b0["cX"]
    assert doc_list(qb, "p0Sib") == b0["p0Sib"]
    assert doc_list(qb, "lineSibs[0].sib") == b0["lineSibs"][0]["sib"]
    last = n_layers - 2
    assert doc_list(qb, f"lineSibs[{last}].sib") == b0["lineSibs"][last]["sib"]
    hm = re.search(r"hints \(%d\)\s*= (\[[^\]]*\])" % n_layers, qb)
    assert hm and json.loads(hm.group(1)) == b0["hints"], "hints differ"
    assert re.search(r"tSibs\s*= 17 hashes", qb), "tSibs length line"
    assert f"tSibs[0] = {b0['tSibs'][0]}" in qb
    assert f"tSibs[16] = {b0['tSibs'][16]}" in qb
    assert re.search(r"cSibs\s*= 17 hashes", qb), "cSibs length line"
    assert re.search(r"p0Sibs\s*= 16 hashes", qb), "p0Sibs length line"
    assert re.search(r"lineSibs\s*= 15 entries", qb), "lineSibs count line"
    # the stated lengths against the real tree shape from params.py
    assert len(b0["tSibs"]) == dv["LOG_DOMAIN"] == 17
    assert len(b0["cSibs"]) == dv["LOG_DOMAIN"] == 17
    assert len(b0["p0Sibs"]) == dv["LOG_DOMAIN"] - 1 == 16
    assert [len(e["sibs"]) for e in b0["lineSibs"]] == list(range(15, 0, -1))
    assert len(b0["hints"]) == n_layers == 16

    # vector-final: the value against BOTH sources, the txid against receipts
    fb = block(doc, "vector-final")
    fm = re.search(r"final = (\[[^\]]*\])", fb)
    assert fm and json.loads(fm.group(1)) == kats["final"] == fx0["final"], \
        "final differs from a source"
    tm = re.search(r"(0x[0-9a-f]{64})", fb)
    assert tm, "txid missing from vector-final"
    receipts = open(RECEIPTS).read()
    sect = receipts.split("### Attest 1 of 5", 1)[1] \
                   .split("### Attest 2 of 5", 1)[0]
    assert f"- txid: {tm.group(1)}" in sect, \
        "txid is not the attest 1 txid in the receipts"

    print("PASS: all four vector blocks re-verified against the fixtures "
          "and receipts")


if __name__ == "__main__":
    main()
