// The reference of `doc-kit sync`, sync.json (ARCHITECTURE.md §6.10, schemas/sync.schema.json): read by the
// build (page footer) and by the report, written by `--mark`. Tolerant reader: a missing file is simply "no
// reference yet"; an unreadable or invalid one is a warning, never a hard failure (the build still runs).
import fs from "node:fs";
import path from "node:path";
import { validate } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { adapterTools, normalize } from "../check/coverage.mjs";
import { wholeIndexes } from "../core/text.mjs";
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

/**
 * Every message file followed now (`labelFiles`) or recorded before, flattened: `{}` for one that no longer exists
 * (its keys are gone), null for one that cannot be read; `followed`: still one of `labelFiles`.
 * @returns {Array<{ file: string, flat: object|null, followed: boolean }>}
 */
function allFlatLabels(root, config, recorded) {
  const followed = new Set(labelFiles(root, config));
  return [...new Set([...followed, ...Object.keys(recorded || {})])].sort().map((file) => {
    // resolve, not join: a label file may be declared as an absolute path (sync.labels), which join would
    // concatenate onto root instead of using as is.
    const abs = path.resolve(root, file);
    return { file, flat: readFlatLabels(abs), followed: followed.has(file) };
  });
}

/**
 * The commit a page was checked at (`pages[id].commit`); a page of an older sync.json, without one, was checked at
 * the global `app.commit` (no migration: read as it is).
 */
export function pageCommit(reference, id) {
  const page = reference?.pages?.[id];
  return page && "commit" in page ? page.commit : (reference?.app?.commit ?? null);
}

/** The text without the line ends that close it. */
function withoutFinalLineEnds(text) {
  let end = text.length;
  while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
  return text.slice(0, end);
}

/**
 * The fingerprint of a page's Markdown (`source`, ARCHITECTURE.md §6.10): hashText (a BOM and CRLF ignored) of the
 * text without its final line ends, so that an editor adding or dropping the last newline edits nothing.
 */
export const pageSource = (markdown) => hashText(withoutFinalLineEnds(markdown));

/** Whether a marked page's Markdown is no longer the one marked (`source`; an older sync.json hashed it whole). */
export const isEdited = (recorded, markdown) =>
  !!recorded?.source && recorded.source !== pageSource(markdown) && recorded.source !== hashText(markdown);

/**
 * Whether the documentation was checked against another version than `version`: the last marking, or one of the
 * pages still written (`writtenIds`; a page removed since is not waited for).
 */
export const versionBehind = (reference, version, writtenIds) =>
  reference.app.version !== version ||
  Object.entries(reference.pages || {}).some(([id, p]) => writtenIds.has(id) && p.version !== version);

/**
 * The labels after a marking: merged, never rebuilt (ARCHITECTURE.md §6.10). A key no written page cited yet is
 * added when one cites it; a recorded key keeps its value while a page that is not being acknowledged still cites
 * it — that page has its signal still; a page that holds the new value there does not cite the old one inside it —
 * and otherwise takes its current value (dropped when it left its file, or the file is gone). A file that cannot be
 * read keeps what was recorded. `everyPage` (`--mark --all`): a key no written page cites any more is dropped.
 */
function mergeLabels(recorded, files, written, acknowledged, everyPage) {
  const out = {};
  const cited = (value, pages, now = null) => pages.some((p) => citesLabel(p.markdown, value, now));
  const notAcknowledged = written.filter((p) => !acknowledged.includes(p));
  for (const { file, flat, followed } of files) {
    const entries = { ...(recorded?.[file] || {}) };
    if (flat) {
      for (const [key, value] of Object.entries(entries))
        if (flat[key] !== value && !cited(value, notAcknowledged, flat[key]))
          if (typeof flat[key] === "string") entries[key] = flat[key];
          else delete entries[key];
      if (followed)
        for (const { key, value } of citedLabels(flat, written)) if (!(key in entries)) entries[key] = value;
    }
    if (everyPage) for (const [key, value] of Object.entries(entries)) if (!cited(value, written)) delete entries[key];
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

/** What may follow a route where it ends: a blank, a quote, a closing bracket, a backquote, `?`, `#`, `*`, `|`. */
const ROUTE_END = /[\s"'`’”»)\]}>?#*|]/u;
/** Punctuation that ends a sentence or a clause, a route before it ending there when an end follows (`/invoices.`). */
const ROUTE_STOP = /[.,;:!]/;

/** Whether a route cited in `text` ends at `i`: one "/" there at most (a trailing slash), punctuation, then the end
 * of the text or ROUTE_END. `/invoices` ends in "`/invoices`", "(/invoices)", "/invoices?page=2", "/invoices."; it
 * does not in "/invoices-export", "/invoices.csv", "/invoices/2026" (another path). */
function routeEndsAt(text, i) {
  let j = text[i] === "/" ? i + 1 : i;
  while (j < text.length && ROUTE_STOP.test(text[j])) j++;
  return j >= text.length || ROUTE_END.test(text[j]);
}

/**
 * Whether a marked page's text (normalised) documents an item: one of its forms as a whole; a route (a form with a
 * "/") made of whole segments — `/detail` is not in `/orders/detail`, nor `/ord` in `/orders` — and ending where its
 * last segment does (routeEndsAt). A form that ends with "/" (the static prefix of `/orders/[id]`) goes on with a
 * segment.
 */
function documents(item, text) {
  return (item.match || []).some((m) => {
    const form = normalize(String(m ?? "")).trim();
    const prefix = form.length > 1 && form.endsWith("/");
    const stem = prefix ? form.slice(0, -1) : form;
    if (!stem) return false;
    const route = stem.includes("/");
    return wholeIndexes(text, stem).some((i) => {
      const end = i + stem.length;
      return prefix ? text[end] === "/" && !routeEndsAt(text, end) : !route || routeEndsAt(text, end);
    });
  });
}

/** The recorded inventory, plus the items the marked pages document now: marking a page acknowledges only those. */
function mergeInventory(recorded, inventory, marked) {
  const out = structuredClone(recorded || {});
  const texts = marked.map((p) => normalize(pageCiteText(p)));
  for (const a of inventory.adapters)
    for (const f of a.families || []) {
      const key = `${a.adapter}/${f.name}`;
      const ids = new Set(out[key] || []);
      for (const item of f.items) if (texts.some((text) => documents(item, text))) ids.add(item.id);
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
 * kept as they are, unless they are no longer written. A restamp (`sync --apply`) acknowledges nothing pending: no
 * label, no inventory item, no capture. With no page written (a table of contents that cannot be read), nothing is
 * marked: `sync.noWrittenPage`.
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
  // No page written — a table of contents that cannot be read, or nothing written yet: nothing is marked, and nothing
  // pending is acknowledged (`--all` would mark "every page" of none).
  if (!writtenIds.size) throw new KitError(EXIT.CHECK, "sync.noWrittenPage");
  const targets = all ? [...writtenIds] : [...new Set(pages)];
  for (const id of targets) if (!writtenIds.has(id)) throw new KitError(EXIT.CHECK, "sync.unwritten", { page: id });

  const warnings = [];
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const tools = adapterTools(root);
  // A page of an older sync.json was checked at app.commit: kept as its own before app is rewritten. A page no longer
  // written is dropped.
  const newPages = Object.fromEntries(
    Object.entries(reference?.pages || {})
      .filter(([id]) => writtenIds.has(id))
      .map(([id, p]) => [id, { commit: pageCommit(reference, id), ...p }]),
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
      source: pageSource(page.markdown),
      files,
      declared,
      captures: deps.captures,
    };
  }

  const cited = new Set(targets.flatMap((id) => newPages[id].captures));
  // Acknowledged as a whole only by a person who marks every page (or the first marking): the project's inventory;
  // and a label no written page cites any more is dropped.
  const everyPage = targets.length === writtenIds.size && !restamp;
  const marked = restamp ? [] : written.filter((p) => targets.includes(p.id));
  const ref = {
    generator: generatorTag(),
    app: { commit, version, date },
    pages: newPages,
    proofs: newProofs,
    labels: mergeLabels(reference?.labels, allFlatLabels(root, config, reference?.labels), written, marked, everyPage),
    inventory:
      !reference || everyPage ? inventoryIds(inventory) : mergeInventory(reference.inventory, inventory, marked),
    captures: mergeCaptures(reference?.captures, plans, cited, restamp),
  };
  return { reference: ref, warnings };
}

export { declaredFile };
