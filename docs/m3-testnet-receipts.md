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
