# Verifying a STARK proof on Stacks testnet: a walkthrough

What is live (deployed 2026-07-12, receipts in docs/m3-testnet-receipts.md):

- Verifier: `ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production` (deploy txid `0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572`)
- Attest wrapper: `ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-attest` (deploy txid `0x2cad9068fe41f8614b28314aa1b26235caa480296f904efab4bf28a56867417d`)

## 1. What you need

git, Node 24 with npm, Rust (the nightly pinned in interop/rust-toolchain.toml
installs itself via rustup), Python 3.11 or newer, and a wallet that can hold a
THROWAWAY testnet key. Never reuse a key that has ever touched mainnet funds.

## 2. Clone and check the deployed code is this repo's code

    git clone <repo url> && cd verifold
    npm ci
    python3 tools/flatten.py --point full --production
    git diff --exit-code contracts/verifold-flat-full-production.clar
    curl -s "https://api.testnet.hiro.so/v2/contracts/source/ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F/verifold-flat-full-production?proof=0" \
      | python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["source"])' > /tmp/onchain.clar
    diff /tmp/onchain.clar contracts/verifold-flat-full-production.clar

Both diffs are empty: the contract on testnet is byte for byte the committed,
regenerable artifact. We ran exactly these commands ourselves before writing
this walkthrough (`REGEN-BYTE-IDENTICAL` then `ONCHAIN-MATCHES-REPO`, both
files 54926 bytes, no trailing newline delta).

## 3. Generate a proof with YOUR OWN public input

    cd interop
    cargo run --release --bin prove -- --point full --pubs your-handle --out fixtures/my-proof.json
    cd ..
    python3 tools/test_hints.py interop/fixtures/my-proof.json

Proving takes under a second after the first build.

## 4. Fund a throwaway testnet key

Create a fresh 24 word phrase in your wallet's testnet mode, then fund its
address at https://explorer.hiro.so/sandbox/faucet?chain=testnet or with
curl -s -X POST "https://api.testnet.hiro.so/extended/v1/faucets/stx?address=<your address>".

## 5. Attest your proof on-chain

    export SIGNER_MNEMONIC="<your throwaway phrase>"
    node tools/submit-proof.mjs --network testnet \
      --fixture interop/fixtures/my-proof.json --pub "your-handle" \
      --contract ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-attest

The tool prints the transaction size and the network fee estimate before
broadcasting, then the txid, the fee paid, and blocks to inclusion. For scale,
our five recorded attests, all ~196KB transactions (docs/m3-testnet-receipts.md):

| pub | estimated fee (microSTX) | actual fee (microSTX) | inclusion blocks |
|---|---|---|---|
| "" | 1963940 (no estimate available; fallback 10 microSTX/byte) | 1963940 | 1 |
| "interop-1" | 1936760 (mid of low/mid/high) | 1936760 | 2 |
| "interop-2" | 2017994 (mid of low/mid/high) | 2017994 | 1 |
| "m3-demo-1" | 2017994 (mid of low/mid/high) | 2017994 | 1 |
| "m3-demo-2" | 2018417 (mid of low/mid/high) | 2018417 | 1 |

## 6. See it

Your transaction page: https://explorer.hiro.so/txid/<your txid>?chain=testnet.
Query the attestation record (the key is sha256 of your pub bytes):

    printf '%s' 'your-handle' | sha256sum
    curl -s -X POST -H 'Content-Type: application/json' \
      -d '{"sender":"ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F","arguments":["0x0200000020<that hash>"]}' \
      "https://api.testnet.hiro.so/v2/contracts/call-read/ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F/verifold-attest/get-attestation"

The Hiro indexer ingested the deployment cleanly: all 114 slash-named
functions of the verifier are present in its ABI and the contract and its
transactions show canonical true (docs/m3-testnet-receipts.md), so the
indexer's extended API works for this contract too, no node RPC workaround
needed.

## 7. Honest notes

- All five of our own attestations were signed by and sent from the deployer
  address (a founder decision on 2026-07-12 dropped an earlier plan to send
  one from a second wallet). That demonstrates the contract accepts
  submissions from that address; it is not independent adoption. Be the
  first stranger.
- Duplicate attestations of the same pub are allowed and simply re-record at
  the new height; the map keeps the latest.
- The read only probe of driver/verify with a full proof succeeded: HTTP 200,
  okay true, result 0x03 (Clarity true), recorded verbatim in
  docs/m3-testnet-receipts.md (DRIVER-7a).
- Testnet liveness is not a security claim. The verifier is not audited. See
  docs/m2-soundness.md for what is proven versus conjectured.

## 8. What it cost (from docs/m3-testnet-receipts.md)

Deploys, both confirmed at block 4040277:

| contract | estimated fee (microSTX) | actual fee (microSTX) |
|---|---|---|
| verifold-flat-full-production | 549260 | 549260 |
| verifold-attest | 39780 | 39780 |

Attests: see the table in step 5 above; estimated and actual fees are pulled
straight from the receipts and never blended.
