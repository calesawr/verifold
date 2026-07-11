// Layer 1 equivalence adapter. Appended to setupFiles AFTER the clarinet
// environment hook; inert without env vars, so the baseline run is untouched.
//
//   VERIFOLD_FLAT=1  redirect every simnet.callReadOnlyFn(contract, fn, ...)
//                    to ("verifold-flat", manifest lookup) so the unmodified
//                    240-test suite runs against the flat artifact.
//
// The lookup consumes tools/flat-manifest.json. The adapter NEVER derives a
// flat name by string convention: generator and harness cannot drift.
//
// HOW THE REBIND WORKS (and why there is no assignment): the sdk's simnet is
// a Proxy whose get trap intercepts callReadOnlyFn / callPublicFn /
// callPrivateFn / deployContract BY NAME and always returns a fresh closure
// over the wasm session (@stacks/clarinet-sdk 3.19.0,
// dist/esm/node/src/sdkProxy.js). Assigning sim.callReadOnlyFn = patched
// writes an own property onto the proxy TARGET: readers never see it (the
// trap intercepts first) and the trap's internal session[prop] dispatch then
// finds the patch and recurses forever. So this adapter never assigns onto
// the sdk proxy; it rebinds the GLOBAL to a second Proxy that serves the
// patched callReadOnlyFn and Reflects everything else (initSession,
// setCurrentTestName, getLastContractCallTrace, collectReport) through
// untouched. vitest-environment-clarinet re-sets global.simnet at every test
// file's environment setup, so the wrap re-applies per file in beforeEach,
// keyed on a __verifoldWrapped probe that only the wrapper answers.
import { readFileSync } from "node:fs";
import { beforeEach } from "vitest";

const FLAT = process.env.VERIFOLD_FLAT === "1";

type ManifestFn = { flat: string; kind: string; arity: number };
type Manifest = {
  contract: string;
  functions: Record<string, Record<string, ManifestFn>>;
};

let manifest: Manifest | null = null;
function loadManifest(): Manifest {
  if (!manifest) {
    manifest = JSON.parse(readFileSync(
      new URL("../tools/flat-manifest.json", import.meta.url), "utf8"));
  }
  return manifest!;
}

function lookup(contract: string, fn: string): ManifestFn {
  const entry = loadManifest().functions[contract]?.[fn];
  if (!entry) {
    throw new Error(`flat-adapter: unmapped call (${contract}, ${fn}); ` +
      "regenerate tools/flat-manifest.json with python3 tools/flatten.py");
  }
  return entry;
}

function wrapSimnet(sim: any): any {
  // capturing the trap-made closure once is safe: the underlying session
  // method is never overwritten, so orig always reaches the real wasm session
  const orig = sim.callReadOnlyFn;
  const patched = (contract: string, fn: string, args: any[], sender: string) => {
    const entry = lookup(contract, fn);
    return orig(loadManifest().contract, entry.flat, args, sender);
  };
  return new Proxy(sim, {
    get(target, prop, receiver) {
      if (prop === "__verifoldWrapped") return true;
      if (prop === "callReadOnlyFn") return patched;
      return Reflect.get(target, prop, receiver);
    },
  });
}

if (FLAT) {
  beforeEach(() => {
    const sim: any = (globalThis as any).simnet;
    if (!sim) throw new Error("flat-adapter: simnet global not initialized");
    if (sim.__verifoldWrapped) return; // this file's global is already wrapped
    (globalThis as any).simnet = wrapSimnet(sim);
  });
}
