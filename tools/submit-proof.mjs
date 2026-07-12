#!/usr/bin/env node
// tools/submit-proof.mjs: build, sign, broadcast, and confirm ONE
// verifold-attest call from a committed fixture entry (M3a Stage C).
// The signing phrase comes from the SIGNER_MNEMONIC environment variable
// ONLY (never a file, never logged); the second-address submission is
// this same tool run with the second wallet's phrase in the variable.
// tests/full/submit-args.test.ts pins attestArgs() byte for byte against
// the simnet-proven tests/full/args-full.ts builders, so the broadcast
// encoding and the tested encoding cannot drift.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import {
  Cl, broadcastTransaction, estimateTransactionByteLength,
  fetchFeeEstimateTransaction, fetchNonce, getAddressFromPrivateKey,
  makeContractCall, makeUnsignedContractCall, privateKeyToPublic,
  serializeCV, serializePayload,
} from "@stacks/transactions";

// ---- Clarity argument builders (pinned against tests/full/args-full.ts) ----
const N_LAYERS = 16; // tests/full/point.ts POINT.N_LAYERS; drift is caught by submit-args.test.ts
const qn = (l) =>
  Cl.tuple({ c0: Cl.uint(l[0]), c1: Cl.uint(l[1]), c2: Cl.uint(l[2]), c3: Cl.uint(l[3]) });
const hexList = (hs) => Cl.list(hs.map((h) => Cl.buffer(Buffer.from(h, "hex"))));
const bundle = (b) => {
  const fields = {
    "t-x": qn(b.tX), "t-sibs": hexList(b.tSibs),
    "c-x": qn(b.cX), "c-sibs": hexList(b.cSibs),
    "p0-sib": qn(b.p0Sib), "p0-sibs": hexList(b.p0Sibs),
    hints: Cl.list(b.hints.map((h) => Cl.uint(h))),
  };
  for (let k = 1; k < N_LAYERS; k++) {
    fields[`l${k}-sib`] = qn(b.lineSibs[k - 1].sib);
    fields[`l${k}-sibs`] = hexList(b.lineSibs[k - 1].sibs);
  }
  return Cl.tuple(fields);
};
export const attestArgs = (p) => [
  Cl.buffer(Buffer.from(p.pub, "hex")),
  Cl.buffer(Buffer.from(p.traceRoot, "hex")),
  Cl.buffer(Buffer.from(p.compRoot, "hex")),
  qn(p.Tz), qn(p.Tgz), qn(p.Tg2z),
  qn(p.Czs[0]), qn(p.Czs[1]), qn(p.Czs[2]), qn(p.Czs[3]),
  hexList(p.friRoots), qn(p.final),
  Cl.buffer(Buffer.from(p.nonce, "hex")),
  Cl.list(p.bundles.map(bundle)),
];
export const findFixture = (path, pubString) => {
  const pubHex = Buffer.from(pubString, "utf8").toString("hex");
  const all = JSON.parse(readFileSync(path, "utf8"));
  const hit = all.find((p) => p.pub === pubHex);
  if (!hit) {
    throw new Error(
      `no fixture entry with pub ${JSON.stringify(pubString)} (hex "${pubHex}") in ${path}`);
  }
  return hit;
};

// ---- networks and CLI ----
const NETWORKS = {
  devnet: { network: "devnet", baseUrl: "http://localhost:20443" },
  testnet: { network: "testnet", baseUrl: "https://api.testnet.hiro.so" },
};
const USAGE =
  "usage: node tools/submit-proof.mjs --network devnet|testnet " +
  "--fixture <path> --pub <string> --contract <deployer-address>.verifold-attest " +
  "[--yes] [--no-wait]   (signing phrase: SIGNER_MNEMONIC env var)";
const parseArgs = (argv) => {
  const opts = { yes: false, wait: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--network") opts.network = argv[++i];
    else if (a === "--fixture") opts.fixture = argv[++i];
    else if (a === "--pub") opts.pub = argv[++i];
    else if (a === "--contract") opts.contract = argv[++i];
    else if (a === "--yes") opts.yes = true;
    else if (a === "--no-wait") opts.wait = false;
    else throw new Error(`unknown option ${a}\n${USAGE}`);
  }
  for (const k of ["network", "fixture", "contract"]) {
    if (!opts[k]) throw new Error(`missing --${k}\n${USAGE}`);
  }
  if (opts.pub === undefined) throw new Error(`missing --pub\n${USAGE}`);
  if (!NETWORKS[opts.network]) {
    throw new Error(`--network must be devnet or testnet\n${USAGE}`);
  }
  if (opts.contract.indexOf(".") < 1) {
    throw new Error(`--contract must be <address>.<name>\n${USAGE}`);
  }
  return opts;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function confirmTx(baseUrl, txid, contractAddress, contractName, pubHashHex) {
  // primary: the extended API (testnet). fallback (devnet runs with the
  // API disabled): poll the attestation map via node RPC call-read until
  // the entry for this pub-hash exists.
  for (;;) {
    await sleep(5000);
    const r = await fetch(`${baseUrl}/extended/v1/tx/0x${txid}`).catch(() => null);
    if (r && r.ok) {
      const j = await r.json();
      if (j.tx_status === "success") return { height: j.block_height };
      if (typeof j.tx_status === "string" && j.tx_status.startsWith("abort")) {
        throw new Error(`transaction aborted: ${j.tx_status}`);
      }
      continue; // pending
    }
    const body = JSON.stringify({
      sender: contractAddress,
      arguments: ["0x" + serializeCV(Cl.buffer(Buffer.from(pubHashHex, "hex")))],
    });
    const cr = await fetch(
      `${baseUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/get-attestation`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
    ).catch(() => null);
    if (cr && cr.ok) {
      const j = await cr.json();
      if (j.okay && j.result && !j.result.startsWith("0x09")) { // 0x09 is (none)
        const info = await (await fetch(`${baseUrl}/v2/info`)).json();
        return { height: info.stacks_tip_height };
      }
    }
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mnemonic = process.env.SIGNER_MNEMONIC;
  if (!mnemonic) {
    throw new Error("SIGNER_MNEMONIC not set (24-word phrase, environment only)");
  }
  const net = NETWORKS[opts.network];
  const client = { baseUrl: net.baseUrl };
  const dot = opts.contract.indexOf(".");
  const contractAddress = opts.contract.slice(0, dot);
  const contractName = opts.contract.slice(dot + 1);
  const entry = findFixture(opts.fixture, opts.pub);
  const functionArgs = attestArgs(entry);
  const pubHashHex =
    createHash("sha256").update(Buffer.from(entry.pub, "hex")).digest("hex");

  const { generateWallet } = await import("@stacks/wallet-sdk");
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const senderKey = wallet.accounts[0].stxPrivateKey;
  const address = getAddressFromPrivateKey(senderKey, net.network);

  // size and fee estimate, printed BEFORE anything is broadcast
  const probe = await makeUnsignedContractCall({
    contractAddress, contractName, functionName: "attest", functionArgs,
    publicKey: privateKeyToPublic(senderKey),
    network: net.network, fee: 0n, nonce: 0n,
  });
  const sizeBytes = estimateTransactionByteLength(probe);
  let estimates = null;
  try {
    estimates = await fetchFeeEstimateTransaction({
      payload: serializePayload(probe.payload),
      estimatedLength: sizeBytes,
      network: net.network, client,
    });
  } catch {
    estimates = null; // the node had no estimate for this payload class
  }
  const fallbackFee = BigInt(sizeBytes) * 10n; // 10 microSTX per byte floor
  const fee = estimates
    ? BigInt(Math.ceil(Number(estimates[1].fee)))
    : fallbackFee;
  console.log(`network=${opts.network} node=${net.baseUrl}`);
  console.log(`contract=${opts.contract} sender=${address}`);
  console.log(`pub=${JSON.stringify(opts.pub)} pub-hash=${pubHashHex}`);
  console.log(`serialized transaction size: ${sizeBytes} bytes`);
  console.log(estimates
    ? `fee estimates (low/mid/high microSTX): ${estimates.map((e) => e.fee).join("/")}; using mid fee=${fee}`
    : `fee estimate unavailable; using fallback 10 microSTX per byte, fee=${fee}`);

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("broadcast this transaction? type yes to continue: ");
    rl.close();
    if (answer.trim() !== "yes") {
      console.log("not broadcast (answer was not yes)");
      process.exit(2);
    }
  }

  const nonce = await fetchNonce({ address, network: net.network, client });
  const tx = await makeContractCall({
    contractAddress, contractName, functionName: "attest", functionArgs,
    senderKey, network: net.network, fee, nonce,
  });
  const info0 = await (await fetch(`${net.baseUrl}/v2/info`)).json();
  const res = await broadcastTransaction({ transaction: tx, network: net.network, client });
  if (res.error) throw new Error(`broadcast rejected: ${JSON.stringify(res)}`);
  const txid = res.txid;
  console.log(`broadcast accepted txid=${txid} at stacks height ${info0.stacks_tip_height}`);
  if (!opts.wait) {
    console.log(`txid=${txid} fee=${fee} inclusion_blocks=unconfirmed`);
    return;
  }
  const conf = await confirmTx(net.baseUrl, txid, contractAddress, contractName, pubHashHex);
  console.log(`txid=${txid} fee=${fee} inclusion_blocks=${conf.height - info0.stacks_tip_height}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
}
