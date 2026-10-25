// The reference of `doc-kit sync`, sync.json (ARCHITECTURE.md §6.10, schemas/sync.schema.json): read by the
// build (page footer) and by the report, written by `--mark`. Tolerant reader: a missing file is simply "no
// reference yet"; an unreadable or invalid one is a warning, never a hard failure (the build still runs).
import fs from "node:fs";
import path from "node:path";
import { validate } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { adapterTools, normalize, isCovered } from "../check/coverage.mjs";
import { hashText, hashPlanEntry } from "../core/hash.mjs";
import { pageDependencies, writtenPages, pageCiteText } from "./dependencies.mjs";
import { recordProof } from "./proofs.mjs";
import { citedLabels, citesLabel, labelFiles, readFlatLabels } from "./labels.mjs";
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

/** Every message file of the project, flattened ({ [key]: value }); null for an unreadable or missing one. */
function allFlatLabels(root, config) {
  // resolve, not join: a label file may be declared as an absolute path (sync.labels), which join would
  // concatenate onto root instead of using as is.
  return labelFiles(root, config).map((f) => [f, readFlatLabels(path.resolve(root, f))]);
}

/**
 * The commit a page was checked at (`pages[id].commit`); a page of an older sync.json, without one, was checked at
 * the global `app.commit` (no migration: read as it is).
 */
export function pageCommit(reference, id) {
  const page = reference?.pages?.[id];
  return page && "commit" in page ? page.commit : (reference?.app?.commit ?? null);
}

/** Whether the documentation was checked against another version than `version`: the last marking, or a page. */
export const versionBehind = (reference, version) =>
  reference.app.version !== version || Object.values(reference.pages || {}).some((p) => p.version !== version);

/**
 * The labels after a marking: merged, never rebuilt (ARCHITECTURE.md §6.10). A key no written page cited yet is
 * added when one cites it; a recorded key keeps its value while a page that is not being acknowledged still cites
 * it — that page has its signal still — and otherwise takes its current value (dropped when it left its file). A
 * file that cannot be read keeps what was recorded.
 */
function mergeLabels(recorded, files, written, acknowledged) {
  const out = {};
  const stillCited = (value) => written.some((p) => !acknowledged.has(p.id) && citesLabel(p.markdown, value));
  for (const [file, flat] of files) {
    const entries = { ...(recorded?.[file] || {}) };
    if (flat) {
      for (const [key, value] of Object.entries(entries))
        if (flat[key] !== value && !stillCited(value))
          if (typeof flat[key] === "string") entries[key] = flat[key];
          else delete entries[key];
      for (const { key, value } of citedLabels(flat, written)) if (!(key in entries)) entries[key] = value;
    }
    if (Object.keys(entries).length) out[file] = entries;
  }
  return out;
}

/** Every item id of every coverage adapter family (facts sources are coverage adapters too, §6.9). */
function inventoryIds(inventory) {
  const out = {};
  for (const a of inventory.adapters)
    for (const f of a.families || []) out[`${a.adapter}/${f.name}`] = f.items.map((i) => i.id);
  return out;
}

/** The recorded inventory, plus the items the marked pages document now: marking a page acknowledges only those. */
function mergeInventory(recorded, inventory, marked) {
  const out = structuredClone(recorded || {});
  const texts = marked.map((p) => normalize(pageCiteText(p)));
  for (const a of inventory.adapters)
    for (const f of a.families || []) {
      const key = `${a.adapter}/${f.name}`;
      const ids = new Set(out[key] || []);
      for (const item of f.items) if (texts.some((text) => isCovered(item, text))) ids.add(item.id);
      if (ids.size) out[key] = [...ids];
    }
  return out;
}

/** The hashes of a page's dependency files that exist ("doc:<path>" in the project, the others in app.dir). */
function hashFiles(root, appDir, deps) {
  const files = {};
  for (const f of deps) {
    const abs = f.path.startsWith("doc:") ? path.join(root, f.path.slice(4)) : appDir && path.join(appDir, f.path);
    if (abs && fs.existsSync(abs)) files[f.path] = hashText(fs.readFileSync(abs));
  }
  return files;
}

/** The captures cited by the marked pages get the hash of their plan entry; a restamp records only a new one, so
 * that a capture to retake stays one. */
function mergeCaptures(recorded, plans, cited, restamp) {
  const out = { ...(recorded || {}) };
  for (const plan of plans)
    if (cited.has(plan.id) && !(restamp && out[plan.id]))
      out[plan.id] = { plan: hashPlanEntry(plan), route: plan.route };
  return out;
}

/**
 * Marks pages as checked now (ARCHITECTURE.md §6.10, "`--mark <page…>` / `--all`"): records the hashes of each
 * marked page, its dependencies, its proofs and the commit it was checked at, and merges the rest into the
 * reference (mergeLabels; the inventory items the marked pages document, the whole inventory when every page is
 * marked; the capture plan hashes used by the marked pages). Pages already in the reference but not marked now are
 * kept as they are. A restamp (`sync --apply`) acknowledges nothing pending: no label, no inventory item, no capture.
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object} p.toc
 * @param {string[]} [p.pages]        page ids to mark (ignored when `all`)
 * @param {boolean} [p.all]           mark every written page
 * @param {boolean} [p.restamp]       a restamp by `sync --apply`, not a check by a person
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
  restamp = false,
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
  // A page of an older sync.json was checked at app.commit: kept as its own before app is rewritten.
  const newPages = Object.fromEntries(
    Object.entries(reference?.pages || {}).map(([id, p]) => [id, { commit: pageCommit(reference, id), ...p }]),
  );
  const newProofs = { ...(reference?.proofs || {}) };

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

    const files = hashFiles(root, appDir, deps.files);
    for (const proof of deps.proofs) {
      const recorded = appDir ? recordProof(appDir, proof) : null;
      if (recorded) newProofs[proof.ref] = recorded;
      else warnings.push({ key: "sync.proofUnresolved", vars: { page: id, ref: proof.ref } });
    }

    newPages[id] = {
      verified: date,
      version,
      commit,
      source: hashText(page.markdown),
      files,
      declared,
      captures: deps.captures,
    };
  }

  const cited = new Set(targets.flatMap((id) => newPages[id].captures));
  // The project's inventory is acknowledged as a whole only by a person who marks every page (or the first marking).
  const everyPage = targets.length === writtenIds.size;
  const marked = restamp ? [] : written.filter((p) => targets.includes(p.id));
  const ref = {
    generator: generatorTag(),
    app: { commit, version, date },
    pages: newPages,
    proofs: newProofs,
    labels: mergeLabels(reference?.labels, allFlatLabels(root, config), written, new Set(marked.map((p) => p.id))),
    inventory:
      !reference || (everyPage && !restamp)
        ? inventoryIds(inventory)
        : mergeInventory(reference.inventory, inventory, marked),
    captures: mergeCaptures(reference?.captures, plans, cited, restamp),
  };
  return { reference: ref, warnings };
}

export { declaredFile };
