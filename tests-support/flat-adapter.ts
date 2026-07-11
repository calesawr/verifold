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
// untouched. With pool forks + isolate:false, the environment sets
// globalThis.simnet ONCE per worker and it persists across files; the setup
// module re-imports fresh per file. The wrap re-applies per file via a
// module-local wrapped flag, and __verifoldBase unwraps the persisted
// prior-file proxy so each new wrapper binds the real sdk proxy (no stacking,
// no dead counter closures).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect } from "vitest";

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

let redirected = 0;
let atFileStart = 0;
// per-module-instance guard: with isolate:false + forks pool, the environment
// sets globalThis.simnet ONCE and it persists across files.  The setupFile
// module is RE-IMPORTED for each file (invalidated by the runner before
// runSetupFiles), so each file gets fresh module-scope variables.  We must
// re-wrap even when globalThis.simnet is already a proxy from a previous file,
// because that proxy's closure increments the *previous* file's `redirected`.
let wrapped = false;

function wrapSimnet(sim: any): any {
  // unwrap a stale proxy from a prior file so orig reaches the real wasm session
  const base = (sim as any).__verifoldBase ?? sim;
  const orig = base.callReadOnlyFn;
  const patched = (contract: string, fn: string, args: any[], sender: string) => {
    const entry = lookup(contract, fn);
    redirected += 1;
    return orig(loadManifest().contract, entry.flat, args, sender);
  };
  // anti-vacuity: the suite is read-only end to end; any other entry point
  // appearing under flat mode means the equivalence claim is off the rails
  const forbidden = (name: string) => () => {
    throw new Error(`flat-adapter: ${name} is forbidden in flat mode`);
  };
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "__verifoldBase") return base;
      if (prop === "callReadOnlyFn") return patched;
      if (prop === "callPublicFn") return forbidden("callPublicFn");
      if (prop === "deployContract") return forbidden("deployContract");
      return Reflect.get(target, prop, receiver);
    },
  });
}

if (FLAT) {
  beforeEach(() => {
    if (wrapped) return; // this module instance has already wrapped globalThis.simnet
    const sim: any = (globalThis as any).simnet;
    if (!sim) throw new Error("flat-adapter: simnet global not initialized");
    (globalThis as any).simnet = wrapSimnet(sim);
    wrapped = true;
  });

  beforeAll(() => {
    atFileStart = redirected; // per-file snapshot (isolate: false shares state)
  });

  afterAll(() => {
    // every test file in this suite makes contract calls; zero redirected
    // calls means the redirect never went live for this file
    expect(redirected - atFileStart,
      `flat-adapter: zero redirected calls in ${expect.getState().testPath}`)
      .toBeGreaterThan(0);
  });
}
