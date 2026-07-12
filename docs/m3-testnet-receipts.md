# M3a testnet receipts (append only raw record)

Network: Stacks testnet, node and API at https://api.testnet.hiro.so
Date: 2026-07-12
Clarinet: clarinet 3.19.0
Deployer: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F

Every number in this file is pasted from an executed command against the
real network. Estimated fees and actual fees are recorded separately and
never blended. The signing phrases exist only in the gitignored
settings/Testnet.toml and in a session environment variable; they are
never in this file or anywhere in git.

## Deployment

Applied 2026-07-12 via `clarinet deployments apply --deployment-plan-path
deployments/m3a.testnet-plan.yaml --use-on-disk-deployment-plan --no-dashboard`
(clarinet 3.19.0; the `--testnet` flag is omitted because in clarinet 3.19 it
selects the default plan path, and the plan's own `network: testnet` key
governs). Both publishes confirmed in one batch.

### ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production

- Deploy txid: 0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572
- Estimated fee (plan cost field): 549260 microSTX
- Actual fee (API fee_rate): 549260 microSTX
- Tx status: success, block height 4040277
- Source endpoint: /v2/contracts/source 200; deployed source byte-identical to
  committed contracts/verifold-flat-full-production.clar (cmp clean; sha256
  dbf929778c292a1fcb0b37aee3c93dc7dd74f215f3992775b44d683aac48244e)
- Explorer: https://explorer.hiro.so/txid/0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572?chain=testnet

### ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-attest

- Deploy txid: 0x2cad9068fe41f8614b28314aa1b26235caa480296f904efab4bf28a56867417d
- Estimated fee (plan cost field): 39780 microSTX
- Actual fee (API fee_rate): 39780 microSTX
- Tx status: success, block height 4040277
- Source endpoint: /v2/contracts/source 200; deployed source byte-identical to
  committed contracts/verifold-attest.clar (cmp clean; sha256
  129e1ba2f759eb15fdc2dbdcb58796273a20e88bcccc068bca92aa2faff74813)
- Explorer: https://explorer.hiro.so/txid/0x2cad9068fe41f8614b28314aa1b26235caa480296f904efab4bf28a56867417d?chain=testnet

## Attestations

All five attestations are signed by and sent from the deployer address
ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F (founder decision 2026-07-12: the
second-address requirement was dropped; attest 5 signs with the deployer
phrase like attests 1 to 4).

### Attest 1 of 5: pub ""

- pub: "" (empty; fixture interop/fixtures/rust-proofs-full.json)
- pub hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- sender: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F
- txid: 0x70ff5ae9ac822049caf81ec294d9fb00d281bdb35013da47a87901d04142b512
- serialized transaction size: 196394 bytes
- estimated fee (tool printout): fee estimate unavailable; fallback 10 microSTX
  per byte, fee=1963940
- actual fee (API fee_rate): 1963940 microSTX
- inclusion_blocks (tool printout): 1 (broadcast at stacks height 4040278)
- tx_status success, block height 4040279
- explorer: https://explorer.hiro.so/txid/0x70ff5ae9ac822049caf81ec294d9fb00d281bdb35013da47a87901d04142b512?chain=testnet

### Attest 2 of 5: pub "interop-1"

- pub: "interop-1" (tool accepted the utf8 string form; fixture hex 696e7465726f702d31; fixture interop/fixtures/rust-proofs-full.json)
- pub hash: 8953aeb3a49b48aa133a1c2821004ed0f3de273be31b65a64c02374edad135fc
- sender: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F
- txid: 0x1f97d0bcb5e387e2b4d6660fecee26cc36c601764a868b4fed06baf45db40639
- serialized transaction size: 196403 bytes
- estimated fee (tool printout): estimates low/mid/high 1842278/1936760/1936760;
  using mid fee=1936760
- actual fee (API fee_rate): 1936760 microSTX
- inclusion_blocks (tool printout): 2 (broadcast at stacks height 4040279)
- tx_status success, block height 4040281
- explorer: https://explorer.hiro.so/txid/0x1f97d0bcb5e387e2b4d6660fecee26cc36c601764a868b4fed06baf45db40639?chain=testnet

### Attest 3 of 5: pub "interop-2"

- pub: "interop-2" (utf8 string form accepted; fixture hex 696e7465726f702d32; fixture interop/fixtures/rust-proofs-full.json)
- pub hash: 4707b803906b6fe408a83d2bd8bc0b9f3adede7a6715d19ec0c6fe4c9593ea5b
- sender: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F
- txid: 0x46537da25b831bbd9b172af3a1b1d83285ea8368d1b9f4862b605719ada14238
- serialized transaction size: 196403 bytes
- estimated fee (tool printout): estimates low/mid/high 1428908/2017994/2017994;
  using mid fee=2017994
- actual fee (API fee_rate): 2017994 microSTX
- inclusion_blocks (tool printout): 1 (broadcast at stacks height 4040281)
- tx_status success, block height 4040282
- explorer: https://explorer.hiro.so/txid/0x46537da25b831bbd9b172af3a1b1d83285ea8368d1b9f4862b605719ada14238?chain=testnet

### Attest 4 of 5: pub "m3-demo-1"

- pub: "m3-demo-1" (utf8 string form accepted; fixture interop/fixtures/rust-proofs-demo.json)
- pub hash: f456ac17b1e72e143c7f5098f96b919345bf322e3f5febc35dd493b59b85058c
- sender: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F
- txid: 0x5aed2188477c491967d9f03833032192153164a1a7cae897977af91aabd1c398
- serialized transaction size: 196403 bytes
- estimated fee (tool printout): estimates low/mid/high 1723328/2017994/2017994;
  using mid fee=2017994
- actual fee (API fee_rate): 2017994 microSTX
- inclusion_blocks (tool printout): 1 (broadcast at stacks height 4040282)
- tx_status success, block height 4040283
- explorer: https://explorer.hiro.so/txid/0x5aed2188477c491967d9f03833032192153164a1a7cae897977af91aabd1c398?chain=testnet

### Attest 5 of 5: pub "m3-demo-2"

- pub: "m3-demo-2" (utf8 string form accepted; fixture interop/fixtures/rust-proofs-demo.json)
- pub hash: a6af96a1c9aa01a02a7138f79ebdd7fe78f59af9e99c14de33115225edd8e06e
- sender: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F (deployer; founder decision
  2026-07-12 dropped the second-address requirement, so this attest signs with
  the deployer phrase like the other four)
- txid: 0x91899e3f044ca8b0be51a857769b12472ae8c0e0a543cda34e8aded3041fb5eb
- serialized transaction size: 196403 bytes
- estimated fee (tool printout): estimates low/mid/high 1871084/2018417/2018417;
  using mid fee=2018417
- actual fee (API fee_rate): 2018417 microSTX
- inclusion_blocks (tool printout): 1 (broadcast at stacks height 4040283)
- tx_status success, block height 4040284
- explorer: https://explorer.hiro.so/txid/0x91899e3f044ca8b0be51a857769b12472ae8c0e0a543cda34e8aded3041fb5eb?chain=testnet

## On-chain state check (call-read over the public node endpoint)

Hashes re-derived locally via `printf ... | sha256sum` and matched the brief's
table exactly. Raw responses, verbatim:

get-attestation 0x0200000020e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (pub ""):
{"okay":true,"result":"0x0a0c00000002086174746573746572051a070e57642b98105882f1e87c3266dd8d5ca7843c06686569676874010000000000000000000000000002f5ae"}

get-attestation 0x02000000208953aeb3a49b48aa133a1c2821004ed0f3de273be31b65a64c02374edad135fc (pub "interop-1"):
{"okay":true,"result":"0x0a0c00000002086174746573746572051a070e57642b98105882f1e87c3266dd8d5ca7843c06686569676874010000000000000000000000000002f5af"}

get-attestation 0x02000000204707b803906b6fe408a83d2bd8bc0b9f3adede7a6715d19ec0c6fe4c9593ea5b (pub "interop-2"):
{"okay":true,"result":"0x0a0c00000002086174746573746572051a070e57642b98105882f1e87c3266dd8d5ca7843c06686569676874010000000000000000000000000002f5af"}

get-attestation 0x0200000020f456ac17b1e72e143c7f5098f96b919345bf322e3f5febc35dd493b59b85058c (pub "m3-demo-1"):
{"okay":true,"result":"0x0a0c00000002086174746573746572051a070e57642b98105882f1e87c3266dd8d5ca7843c06686569676874010000000000000000000000000002f5af"}

get-attestation 0x0200000020a6af96a1c9aa01a02a7138f79ebdd7fe78f59af9e99c14de33115225edd8e06e (pub "m3-demo-2"):
{"okay":true,"result":"0x0a0c00000002086174746573746572051a070e57642b98105882f1e87c3266dd8d5ca7843c06686569676874010000000000000000000000000002f5af"}

get-count:
{"okay":true,"result":"0x0100000000000000000000000000000005"}

get-count decodes to u5: five attestations on-chain. All five tuples name the
same attester principal (the deployer). The height field is the burn block
height at attest time (0x2f5ae = 194990 and 0x2f5af = 194991).

## Read only probe (DRIVER-7a)

Command: node tools/callread-verify.mjs --node https://api.testnet.hiro.so
--contract ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production
--fixture interop/fixtures/rust-proofs-full.json --pub ""

Output, verbatim (complete; under 1,000 characters):

url=https://api.testnet.hiro.so/v2/contracts/call-read/ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F/verifold-flat-full-production/driver%2Fverify
body_bytes=392597
http_status=200
{"okay":true,"result":"0x03"}

Outcome: HTTP 200 with okay true and result 0x03 (Clarity true). The public
Hiro testnet node's read only call-read path accepted the ~392KB body, the
percent encoded slash name driver%2Fverify resolved, and the full production
verify ran to completion and accepted the real Rust proof (fixture pub "").

## Indexer observations

Hiro indexer contract endpoint,
/extended/v1/contract/ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production,
trimmed to the relevant fields:

{'tx_id': '0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572', 'canonical': True, 'contract_id': 'ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production', 'block_height': 4040277}
functions: 114 slash-named: 114 first5: ['cdeep/limb', 'cdeep/rot-s', 'commit/m31-to-be4', 'driver/even-of', 'driver/path-step']

Node interface endpoint,
/v2/contracts/interface/ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F/verifold-flat-full-production,
trimmed:

functions: 114 slash-named: 114
driver/verify present: True

Indexer contract endpoint for verifold-attest, trimmed:

{'tx_id': '0x2cad9068fe41f8614b28314aa1b26235caa480296f904efab4bf28a56867417d', 'canonical': True, 'contract_id': 'ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-attest'}

Indexer transaction page for the production deploy tx, trimmed:

{'tx_id': '0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572', 'tx_type': 'smart_contract', 'tx_status': 'success', 'canonical': True, 'block_height': 4040277, 'fee_rate': '549260', 'sender_address': 'ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F'}
contract_id: ST3GWNV45EC10P42Y7M7RCK6VP6NS9W47GAZHH9F.verifold-flat-full-production

Outcome: the indexer ingests the slash named contract without complaint. The
ABI is present, all 114 functions are slash named, the contract and its
transactions are canonical. No separator change, no redeploy needed.

Transaction pages for all seven transactions:

- deploy verifold-flat-full-production: https://explorer.hiro.so/txid/0x959c414fdcdd8c14b62e3a5a850fbac7a5888505e24cddd0946633ed9a356572?chain=testnet
- deploy verifold-attest: https://explorer.hiro.so/txid/0x2cad9068fe41f8614b28314aa1b26235caa480296f904efab4bf28a56867417d?chain=testnet
- attest 1 (pub ""): https://explorer.hiro.so/txid/0x70ff5ae9ac822049caf81ec294d9fb00d281bdb35013da47a87901d04142b512?chain=testnet
- attest 2 (interop-1): https://explorer.hiro.so/txid/0x1f97d0bcb5e387e2b4d6660fecee26cc36c601764a868b4fed06baf45db40639?chain=testnet
- attest 3 (interop-2): https://explorer.hiro.so/txid/0x46537da25b831bbd9b172af3a1b1d83285ea8368d1b9f4862b605719ada14238?chain=testnet
- attest 4 (m3-demo-1): https://explorer.hiro.so/txid/0x5aed2188477c491967d9f03833032192153164a1a7cae897977af91aabd1c398?chain=testnet
- attest 5 (m3-demo-2): https://explorer.hiro.so/txid/0x91899e3f044ca8b0be51a857769b12472ae8c0e0a543cda34e8aded3041fb5eb?chain=testnet
