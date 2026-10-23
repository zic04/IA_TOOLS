#!/usr/bin/env node
// The long run of the property tests of the lock proof, for developers — never run by `npm test` (whose files run
// the same properties on a fixed seed: test/unit/facts-deps-properties-*.test.mjs). It prints its random seed first,
// then runs every property on a new seed each round, ten times as many cases, every pair of each grammar's axes and a
// rejection at four places, until its time is up; every failure of a new signature is shrunk (2,000 evaluations at
// most) and printed with what reproduces it. The exit code is 1 when one property failed.
//
//   node test/tools/fuzz/soak.mjs                          10 minutes, every format
//   node test/tools/fuzz/soak.mjs --minutes 30 --only yarn
//   node test/tools/fuzz/soak.mjs --seed 0x1234abcd        the rounds of that run seed
//   node test/tools/fuzz/soak.mjs --case 0x5f3a9c21 --only npm-v3 --property R-LE
//   node test/tools/fuzz/soak.mjs --property "TAINT-E uv" --production "private, escaped name key"
//
// No environment variable and no child process: it imports the property definitions and runs them itself.
import { webcrypto } from "node:crypto";
import { NPM_FORMATS } from "./render-npm.mjs";
import { PY_FORMATS } from "./render-python.mjs";
import { propertiesOf, grammarsOf } from "./properties.mjs";
import { createSandbox, forAll } from "./runner.mjs";
import { fmix32, hex, parseSeed } from "./prng.mjs";

/** How many times more cases a property runs here than in `npm test`. */
const SCALE = 10;
const SHRINK_BUDGET = 2000;

/** The options of the command line: `--name value` pairs. */
function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++)
    if (argv[i].startsWith("--"))
      out[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : "";
  return out;
}

/** The families of formats to run: all of them, or the one format `--only` names. */
function families(only) {
  const all = [NPM_FORMATS, PY_FORMATS];
  if (!only) return all;
  const family = all.find((f) => Object.hasOwn(f, only));
  if (!family) throw new Error(`--only: no format ${only} (${all.flatMap((f) => Object.keys(f)).join(", ")})`);
  return [{ [only]: family[only] }];
}

/** Runs one property in collect mode, prints its new failures; how many it found. */
async function run(property, o, seen) {
  const res = await forAll(property, { shrinkBudget: SHRINK_BUDGET, all: true, ...o });
  let found = 0;
  for (const failure of res.failures) {
    const signature = failure.split("\n")[0];
    if (seen.has(signature)) continue;
    seen.add(signature);
    found++;
    console.log(`\n${failure}\n`);
  }
  console.log(`  ${property.id}: ${res.cases} cases, ${found} new failures`);
  return found;
}

async function main() {
  const o = options(process.argv.slice(2));
  const first = o.seed ? parseSeed(o.seed) : webcrypto.getRandomValues(new Uint32Array(1))[0];
  console.log(`soak: run seed ${hex(first)}${o.only ? `, only ${o.only}` : ""}`);
  const deadline = Date.now() + Number(o.minutes ?? 10) * 60_000;
  const wanted = (p) => !o.property || p.id === o.property;
  const sandbox = createSandbox("doc-kit-fuzz-soak-");
  const seen = new Set();
  let failed = 0;
  try {
    for (const all of families(o.only)) {
      const select = o.production !== undefined ? (id, label) => label === o.production : undefined;
      // The grammars do not depend on the seed: once, every production, every pair of their axes.
      if (o.case === undefined)
        for (const f of Object.values(all))
          for (const p of grammarsOf(f, { full: true, select }).filter(wanted))
            failed += await run(p, { sandbox }, seen);
    }
    if (o.production !== undefined) return;
    for (let round = 0; Date.now() < deadline; round++) {
      const seed = round === 0 ? first : fmix32((first + round) >>> 0);
      console.log(`round ${round}: seed ${hex(seed)}`);
      for (const all of families(o.only))
        for (const p of propertiesOf(all).filter(wanted)) {
          const only = o.case !== undefined ? parseSeed(o.case) : undefined;
          failed += await run(p, { sandbox, seed, count: p.count * SCALE, only }, seen);
        }
      if (o.case !== undefined) break;
    }
  } finally {
    sandbox.dispose();
    console.log(`soak: ${failed} failures, run seed ${hex(first)}`);
    process.exitCode = failed ? 1 : 0;
  }
}

await main();
