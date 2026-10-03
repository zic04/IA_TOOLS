// The reference of `doc-kit sync`, sync.json (ARCHITECTURE.md §6.10, schemas/sync.schema.json): read by the
// build (page footer) and by the report, written by `--mark`. Tolerant reader: a missing file is simply "no
// reference yet"; an unreadable or invalid one is a warning, never a hard failure (the build still runs).
import fs from "node:fs";
import path from "node:path";
import { validate } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { adapterTools } from "../check/coverage.mjs";
import { hashText, hashPlanEntry } from "../core/hash.mjs";
import { pageDependencies, writtenPages } from "./dependencies.mjs";
import { recordProof } from "./proofs.mjs";
import { citedLabels, labelFiles, flattenMessages } from "./labels.mjs";
import { generatorTag } from "../brand.mjs";

const SYNC_FILE = "sync.json";

/** Absolute path of sync.json (config.paths.sync, default the project root). */
export const syncPath = (root, config) => path.join(root, config.paths.sync, SYNC_FILE);

/**
 * Reads sync.json.
 * @returns {{ reference: object|null, problem?: { key: "sync.invalid", vars: object } }}
 */
export function readSyncReference(root, config) {
  const file = syncPath(root, config);
  if (!fs.existsSync(file)) return { reference: null };
  const rel = path.relative(root, file).split(path.sep).join("/");
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { reference: null, problem: { key: "sync.invalid", vars: { file: rel, error: e.message } } };
  }
  const { value, errors } = validate(raw, readSchema("sync"), { applyDefaults: true });
  if (errors.length)
    return { reference: null, problem: { key: "sync.invalid", vars: { file: rel, error: errors[0].key } } };
  return { reference: value };
}

/** Recursively sorted keys (string arrays sorted too), for a readable git diff of sync.json. */
function sortDeep(v) {
  if (Array.isArray(v)) return v.every((x) => typeof x === "string") ? [...v].sort() : v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

/** Writes sync.json: 2-space indent, sorted keys, trailing newline. Returns the absolute file path. */
export function writeSyncReference(root, config, ref) {
  const file = syncPath(root, config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = {
    generator: ref.generator,
    app: ref.app,
    pages: sortDeep(ref.pages || {}),
    proofs: sortDeep(ref.proofs || {}),
    labels: sortDeep(ref.labels || {}),
    inventory: sortDeep(ref.inventory || {}),
    captures: sortDeep(ref.captures || {}),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  return file;
}

/** "file[:from[-to]]" → the file part, for a declared source. */
const declaredFile = (s) => /^(.+?)(?::\d+(?:-\d+)?)?$/.exec(s)[1];

/** Every message file of the project, flattened ({ [key]: value }); unreadable or missing files give {}. */
function allFlatLabels(root, config) {
  return labelFiles(root, config).map((f) => {
    // resolve, not join: a label file may be declared as an absolute path (sync.labels), which join would
    // concatenate onto root instead of using as is.
    const abs = path.resolve(root, f);
    if (!fs.existsSync(abs)) return [f, {}];
    try {
      return [f, flattenMessages(JSON.parse(fs.readFileSync(abs, "utf8")))];
    } catch {
      return [f, {}];
    }
  });
}

/**
 * Marks pages as checked now (ARCHITECTURE.md §6.10, "`--mark <page…>` / `--all`"): records the hashes of each
 * marked page, its dependencies, its proofs, the labels cited by any written page, the whole inventory and the
 * capture plan hashes used by the marked pages. Pages already in the reference but not marked now are kept as
 * they are.
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object} p.toc
 * @param {string[]} [p.pages]        page ids to mark (ignored when `all`)
 * @param {boolean} [p.all]           mark every written page
 * @param {string[]} [p.sources]      "file[:from[-to]]" (--sources; one page only, checked by the CLI)
 * @param {string} p.date             YYYY-MM-DD
 * @param {string|null} p.commit      the application's current HEAD
 * @param {string} p.version          documented version
 * @param {object} p.inventory        result of runCoverage({ root, config })
 * @param {object[]} [p.plans]        loaded capture plan entries (engine/capture/plans.mjs, loadPlans().captures)
 * @param {object|null} p.reference   the current sync.json, or null
 * @returns {Promise<{ reference: object, warnings: Array<{ key: string, vars: object }> }>}
 */
export async function markPages({
  root,
  config,
  toc,
  pages = [],
  all = false,
  sources = [],
  date,
  commit,
  version,
  inventory,
  plans = [],
  reference,
}) {
  const written = writtenPages({ root, config, toc });
  const writtenIds = new Set(written.map((p) => p.id));
  const targets = all ? [...writtenIds] : [...new Set(pages)];
  for (const id of targets) if (!writtenIds.has(id)) throw new KitError(EXIT.CHECK, "sync.unwritten", { page: id });

  const warnings = [];
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const tools = adapterTools(root);
  const newPages = { ...(reference?.pages || {}) };
  const newProofs = { ...(reference?.proofs || {}) };
  const newCaptures = { ...(reference?.captures || {}) };

  for (const id of targets) {
    const page = written.find((p) => p.id === id);
    const prevDeclared = reference?.pages?.[id]?.declared || [];
    const declared = sources.length ? [...new Set([...prevDeclared, ...sources])] : prevDeclared;
    const deps = await pageDependencies({
      root,
      config,
      toc,
      pageId: id,
      inventory,
      tools,
      factsDir: config.paths.facts,
      plans,
      declared,
    });

    const files = {};
    for (const f of deps.files) {
      const abs = f.path.startsWith("doc:")
        ? path.join(root, f.path.slice(4))
        : appDir
          ? path.join(appDir, f.path)
          : null;
      if (abs && fs.existsSync(abs)) files[f.path] = hashText(fs.readFileSync(abs));
    }

    for (const proof of deps.proofs) {
      const recorded = appDir ? recordProof(appDir, proof) : null;
      if (recorded) newProofs[proof.ref] = recorded;
      else warnings.push({ key: "sync.proofUnresolved", vars: { page: id, ref: proof.ref } });
    }

    newPages[id] = {
      verified: date,
      version,
      source: hashText(page.markdown),
      files,
      declared,
      captures: deps.captures,
    };
  }

  // Labels (no page attribution in sync.json): the current, full set of entries cited by any written page.
  const newLabels = {};
  for (const [file, flat] of allFlatLabels(root, config)) {
    const cited = citedLabels(flat, written);
    if (cited.length) newLabels[file] = Object.fromEntries(cited.map((c) => [c.key, c.value]));
  }

  // Inventory: every item id of every coverage adapter family (facts sources are coverage adapters too, §6.9).
  const newInventory = {};
  for (const a of inventory.adapters)
    for (const f of a.families || []) newInventory[`${a.adapter}/${f.name}`] = f.items.map((i) => i.id);

  // Captures cited by a marked page: the hash of the plan entry.
  for (const plan of plans)
    if (targets.some((id) => newPages[id]?.captures.includes(plan.id)))
      newCaptures[plan.id] = { plan: hashPlanEntry(plan), route: plan.route };

  const ref = {
    generator: generatorTag(),
    app: { commit, version, date },
    pages: newPages,
    proofs: newProofs,
    labels: newLabels,
    inventory: newInventory,
    captures: newCaptures,
  };
  return { reference: ref, warnings };
}

export { declaredFile };
