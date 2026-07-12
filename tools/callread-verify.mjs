#!/usr/bin/env node
// tools/callread-verify.mjs: build the /v2/contracts/call-read JSON body for
// one full point fixture proof and POST it to a Stacks node, invoking the
// read only driver/verify on a deployed verifold-flat-full-production.
// Probe only: no key, no signing, no broadcast, no funds at risk. The
// argument serialization is proven byte identical to the
// tests/full/args-full.ts builders by tests/full/callread-body.test.ts.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Cl, cvToHex } from "@stacks/transactions";

// tools/params.py PRODUCTION_POINT N_LAYERS, mirrored the same way
// tests/full/point.ts mirrors it; the equality test fails if this drifts.
const N_LAYERS = 16;

const clQn = (l) =>
  Cl.tuple({ c0: Cl.uint(l[0]), c1: Cl.uint(l[1]), c2: Cl.uint(l[2]), c3: Cl.uint(l[3]) });
const clHexList = (hs) => Cl.list(hs.map((h) => Cl.buffer(Buffer.from(h, "hex"))));
const clBundle = (b) => {
  const fields = {
    "t-x": clQn(b.tX), "t-sibs": clHexList(b.tSibs),
    "c-x": clQn(b.cX), "c-sibs": clHexList(b.cSibs),
    "p0-sib": clQn(b.p0Sib), "p0-sibs": clHexList(b.p0Sibs),
    hints: Cl.list(b.hints.map((h) => Cl.uint(h))),
  };
  for (let k = 1; k < N_LAYERS; k++) {
    fields[`l${k}-sib`] = clQn(b.lineSibs[k - 1].sib);
    fields[`l${k}-sibs`] = clHexList(b.lineSibs[k - 1].sibs);
  }
  return Cl.tuple(fields);
};

export const verifyArgHexes = (p) => [
  Cl.buffer(Buffer.from(p.pub, "hex")),
  Cl.buffer(Buffer.from(p.traceRoot, "hex")), Cl.buffer(Buffer.from(p.compRoot, "hex")),
  clQn(p.Tz), clQn(p.Tgz), clQn(p.Tg2z),
  clQn(p.Czs[0]), clQn(p.Czs[1]), clQn(p.Czs[2]), clQn(p.Czs[3]),
  clHexList(p.friRoots), clQn(p.final), Cl.buffer(Buffer.from(p.nonce, "hex")),
  Cl.list(p.bundles.map(clBundle)),
].map(cvToHex);

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const main = async () => {
  const node = flag("--node");
  const contract = flag("--contract");
  const fixture = flag("--fixture");
  const pub = flag("--pub");
  const dryRun = process.argv.includes("--dry-run");
  if (!node || !contract || !fixture || pub === undefined) {
    console.error(
      "usage: node tools/callread-verify.mjs --node <url> --contract <addr>.<name> --fixture <path> --pub <string> [--dry-run]");
    process.exit(2);
  }
  const proofs = JSON.parse(readFileSync(fixture, "utf8"));
  const proof = proofs.find(
    (p) => p.pub === pub || Buffer.from(p.pub, "hex").toString("utf8") === pub);
  if (!proof) {
    console.error(`no fixture entry with pub '${pub}' in ${fixture}`);
    process.exit(2);
  }
  const [addr, name] = contract.split(".");
  const body = JSON.stringify({ sender: addr, arguments: verifyArgHexes(proof) });
  const url = `${node}/v2/contracts/call-read/${addr}/${name}/driver%2Fverify`;
  console.log(`url=${url}`);
  console.log(`body_bytes=${Buffer.byteLength(body)}`);
  if (dryRun) return;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  console.log(`http_status=${res.status}`);
  console.log(await res.text());
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
