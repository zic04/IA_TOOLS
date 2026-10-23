// Runs the property tests of the lock proof (test/unit/facts-deps-properties-*.test.mjs, test/tools/fuzz/soak.mjs):
// one sandbox application per test file, rewritten for each case; each case read as `--network` reads it —
// collectDependencies, privateRegistries with an explicit empty environment (never process.env, no HOME), then
// checkExistence with a spy `fetch` that records every URL (no request leaves the machine, RULES.md M4) —; a failing
// case shrunk (shrink.mjs) and reported with what reproduces it.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { collectDependencies } from "../../../engine/facts/dependencies.mjs";
import { checkExistence, createRegistryClient, privateRegistries } from "../../../engine/facts/network.mjs";
import { sentName } from "../deps-apps.mjs";
import { tempDir } from "../helpers.mjs";
import { caseSeed, hex, rng } from "./prng.mjs";
import { GEN_VERSION } from "./model.mjs";
import { modelOf, applyTextOps } from "./ops.mjs";
import { toBytes } from "./lines.mjs";
import { shrink } from "./shrink.mjs";

/** The run seed of `npm test`: fixed, so that a run is the same run every time (soak.mjs draws its own). */
export const RUN_SEED = 0x0d0c11a1;
/** The name of the application folder (its link-to-root spellings name it). */
export const APP = "App-Fuzz";

/** Files beside an application that no reader of its dependencies takes (R-RELOCATE): their presence changes nothing. */
export const UNRELATED = Object.freeze({
  "README.md": "# app\n",
  "src/index.js": "export {};\n",
  "src/app.py": "print('x')\n",
  "docs/guide.md": "# guide\n",
  "node_modules/corp-lib/package.json": '{ "name": "corp-lib", "version": "1.0.0" }\n',
  "node_modules/.package-lock.json": '{ "name": "app", "lockfileVersion": 3, "packages": {} }\n',
  ".git/config": "[core]\n",
});

/**
 * One sandbox: an application folder under a new temporary folder, rewritten for each case (the files of the case
 * before removed), removed by `dispose`. Evaluations of the same files are kept (the kit is deterministic; I4 checks
 * it on its own cases, `fresh`).
 */
export function createSandbox(prefix = "doc-kit-fuzz-") {
  const root = tempDir(prefix);
  const app = path.join(root, APP);
  fs.mkdirSync(app);
  const cache = new Map();
  /** The files on disk now, by relative path: the hash of their bytes (a file already right is not written again). */
  const onDisk = new Map();
  const digest = (bytes) => createHash("sha1").update(bytes).digest("hex");
  /** The application made of exactly `files`: the previous case's other files removed, with their empty folders. */
  const write = (files) => {
    for (const rel of [...onDisk.keys()])
      if (!Object.hasOwn(files, rel)) {
        fs.rmSync(path.join(app, rel), { force: true, maxRetries: 5, retryDelay: 50 });
        onDisk.delete(rel);
        for (let dir = path.dirname(path.join(app, rel)); dir !== app; dir = path.dirname(dir))
          try {
            fs.rmdirSync(dir);
          } catch {
            break; // not empty: the folders above it are not either
          }
      }
    for (const [rel, bytes] of Object.entries(files)) {
      const h = digest(bytes);
      if (onDisk.get(rel) === h) continue;
      fs.mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      fs.writeFileSync(path.join(app, rel), bytes);
      onDisk.set(rel, h);
    }
  };
  return {
    root,
    app,
    /** The folder of the lock below the application (`sub`: "" or "sub/a"). */
    dir: (sub = "") => path.join(app, ...sub.split("/").filter(Boolean)),
    /**
     * `--network` on `files` (relative path → bytes): what it sends, what it read, how it judged each item.
     * @param {Record<string, Buffer>} files
     * @param {{ fresh?: boolean }} [o]
     */
    async evaluate(files, { fresh = false } = {}) {
      const key = createHash("sha1");
      for (const rel of Object.keys(files).sort()) key.update(rel).update("\0").update(files[rel]).update("\0");
      const id = key.digest("hex");
      if (!fresh && cache.has(id)) return cache.get(id);
      write(files);
      const ev = await readApp(app);
      if (!fresh) cache.set(id, ev);
      return ev;
    },
    dispose: () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  };
}

/** `--network` on the application in `app` (critic's design, §1: one evaluation). */
async function readApp(app) {
  const unreadable = [];
  const items = collectDependencies(app, unreadable);
  const registries = privateRegistries(app, { items, env: {} });
  const urls = [];
  const out = await checkExistence(items, async (url) => (urls.push(url), { ok: true, status: 200 }), { registries });
  // The gateway itself (I3): it accepts every item sent, and throws on every direct item kept back.
  const client = createRegistryClient({ fetch: async () => ({ ok: true, status: 200 }), registries });
  const gateway = [];
  for (let k = 0; k < items.length; k++) {
    if (!items[k].direct) continue;
    const kept = out[k].private || out[k].unproven;
    const threw = await client.exists(items[k]).then(
      () => false,
      () => true,
    );
    if (kept && !threw) gateway.push(`the gateway accepted ${items[k].name}, which the filter keeps back`);
    if (!kept && threw) gateway.push(`the gateway refused ${items[k].name}, which the filter sends`);
  }
  // sentName decodes npm's name; PyPI's is decoded here (a name sent as `caf%C3%A9` is `café`).
  const sent = urls.map((u) => {
    const s = sentName(u);
    const at = s.indexOf(" ");
    const eco = s.slice(0, at);
    return { eco, name: eco === "pip" ? decodeURIComponent(s.slice(at + 1)) : s.slice(at + 1) };
  });
  return { urls, sent, items, out, unreadable, registries, gateway };
}

/** The names a result sends, as identities ("npm react", "pip my-lib"), sorted. */
export const sentSet = (ev, identity) => [...new Set(ev.sent.map((s) => identity(s.eco, s.name)))].sort();

/**
 * A case made into files: its model with its model operators, rendered for the folder it is written in, its text
 * operators applied, the lines a shrink dropped left out. `files`: relative to the application → bytes.
 * @param {any} c
 * @param {any} format
 * @param {{ dir: (sub?: string) => string }} sandbox
 */
export function materialize(c, format, sandbox) {
  const lockDir = sandbox.dir(c.sub ?? "");
  const model = modelOf(c);
  const rendering = format.render(model, c.style ?? {}, { dirName: path.basename(lockDir), abs: lockDir });
  // The lines a shrink dropped go before the text operators run: an operator's own lines are never dropped.
  const drop = new Set(c.drop ?? []);
  const kept = drop.size
    ? rendering.docs.map((d) => ({ ...d, lines: d.lines.filter((l) => !drop.has(l.id)) }))
    : rendering.docs;
  const docs = applyTextOps(kept, c.ops ?? []);
  const files = {};
  const prefix = c.sub ? `${c.sub}/` : "";
  for (const d of docs) files[prefix + d.rel] = toBytes(d);
  if (c.unrelated) for (const [rel, text] of Object.entries(UNRELATED)) files[prefix + rel] = Buffer.from(text);
  return { model, rendering, kept, docs, files };
}

/** The files of a case as a report shows them: JSON strings (\r, \u0301 visible), the sandbox's path as <ABS>. */
export function showFiles(files, sandbox) {
  const abs = [sandbox.app, sandbox.app.split("\\").join("/"), sandbox.app.split("/").join("\\")];
  const out = {};
  for (const [rel, bytes] of Object.entries(files)) {
    let text = bytes.toString("utf8");
    for (const a of abs) text = text.split(a).join("<ABS>");
    out[rel] = text;
  }
  return out;
}

/**
 * Runs a property on `count` cases from `seed` (a fixed run seed by default): the first failure is shrunk and fails
 * the test with its report. A property is `{ id, title, gen(r, i), check(c, sandbox) → failure|null, after?(stats) }`;
 * `stats` collects what `check` records (the non-vacuity guard reads it).
 * @param {any} property
 * @param {{ sandbox: ReturnType<typeof createSandbox>, count?: number, seed?: number, shrinkBudget?: number,
 *   only?: number, index?: number, all?: boolean }} o  only: run that case seed alone (soak.mjs --case); index: run
 *   case `index` alone (a production of a grammar, soak.mjs --index); all: go on after a failure, every failure of a
 *   new signature (property, format, failure id, operator kinds) shrunk and reported
 * @returns {Promise<{ cases: number, stats: Record<string, number>, failure: string|null, failures: string[] }>}
 */
export async function forAll(
  property,
  { sandbox, count = property.count, seed = RUN_SEED, shrinkBudget = 300, only, index, all = false },
) {
  const stats = {};
  const failures = [];
  const signatures = new Set();
  const seeds = only !== undefined ? [only] : Array.from({ length: count }, (_, i) => caseSeed(seed, i));
  const first = index ?? 0;
  for (let i = first; i < (index === undefined ? seeds.length : Math.min(index + 1, seeds.length)); i++) {
    const c = property.gen(rng(seeds[i]), only !== undefined ? 0 : i, seeds[i]);
    if (!c) continue;
    const check = (x) => property.check(x, sandbox, stats).catch((e) => ({ id: "I4", detail: `threw: ${e.stack}` }));
    const failure = await check(c);
    if (!failure) continue;
    const signature = [failure.id, c.format, c.label ?? "", ...(c.ops ?? []).map((o) => o.op)].join(" ");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    const quiet = (x) => property.check(x, sandbox, {}).catch((e) => ({ id: "I4", detail: `threw: ${e.stack}` }));
    // The lines a shrink may drop: those rendered, never those an operator wrote or changed.
    const lineIds = (x) => materialize(x, property.format(x), sandbox).kept.flatMap((d) => d.lines.map((l) => l.id));
    const { best, tries, failure: last } = await shrink(c, failure, quiet, shrinkBudget, lineIds);
    failures.push(report({ property, seed, index: i, caseSeed: seeds[i], best, tries, failure: last, sandbox }));
    if (!all) return { cases: i + 1, stats, failure: failures[0], failures };
  }
  const guard = property.after?.(stats) ?? null;
  if (guard) failures.push(guard);
  return { cases: seeds.length, stats, failure: failures[0] ?? null, failures };
}

/** forAll in a test: fails it with the report. */
export async function assertProperty(property, o) {
  const { failure } = await forAll(property, o);
  if (failure) assert.fail(failure);
}

/** The report of a failure: what broke, how to run it again, the shrunk case and its files, a test to paste. */
function report({ property, seed, index, caseSeed: s, best, tries, failure, sandbox }) {
  const files = showFiles(materialize(best, property.format(best), sandbox).files, sandbox);
  const ops = (best.ops ?? []).map((o) => JSON.stringify(o)).join("\n    ") || "(none)";
  const name = failure.name ? ` "${failure.name}"` : "";
  return [
    `${failure.id} ${property.title} (${best.format}):${name} ${failure.detail}`,
    `run seed ${hex(seed)}, case ${index} -> case seed ${hex(s)}, GEN_VERSION ${GEN_VERSION}`,
    property.labels
      ? `again: node test/tools/fuzz/soak.mjs --property "${property.id}" --production ${JSON.stringify(property.labels[index])}`
      : `again: node test/tools/fuzz/soak.mjs --case ${hex(s)} --only ${best.format} --property "${property.id}"`,
    `after shrinking (${tries} evaluations): style ${JSON.stringify(best.style ?? {})}, sub ${JSON.stringify(best.sub ?? "")}`,
    `  ops:\n    ${ops}`,
    `  files:`,
    ...Object.entries(files).map(([rel, text]) => `    ${JSON.stringify(rel)}: ${JSON.stringify(text)},`),
    "a regression test (test/unit/facts-deps-review.test.mjs; <ABS>: the application's folder):",
    `  test(${JSON.stringify(`${property.id} (${best.format}): ${failure.detail}`.slice(0, 110))}, async () => {`,
    `    const files = ${JSON.stringify(files)};`,
    `    const { sent } = await network(files);`,
    // network() lists a pip name as its URL writes it (`pip corp_lib`): compared the PEP 503 way, as the report names it.
    !failure.name
      ? `    assert.deepEqual(sent, []); // ${failure.id}: adjust to what the property expects`
      : failure.name.startsWith("pip ")
        ? `    assert.deepEqual(sent.filter((s) => s.toLowerCase().replace(/[-_.]+/g, "-") === ${JSON.stringify(failure.name)}), []);`
        : `    assert.deepEqual(sent.filter((s) => s === ${JSON.stringify(failure.name)}), []);`,
    "  });",
  ].join("\n");
}
