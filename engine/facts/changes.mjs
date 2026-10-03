import fs from "node:fs";
import path from "node:path";

// What changed in the application between two states of its facts (AUDIT.md §5, "what changed" on every build):
// routes, tables and columns, environment variables, dependencies, security findings, secrets, import cycles and
// tests, from facts/<source>.json as committed at a git reference against the files on disk now. Pure functions;
// the command (cli/commands/changes.mjs) reads the two sides.
//   result: { sources: { <source>: { added: [], removed: [], changed: [] } }, total }
// Items are compared by a key per source; `changed` lists the keys present on both sides whose watched fields
// differ, with { key, before, after }.

/** Per source: the key of an item, the fields whose change is reported, and a short label for the report. */
export const DIFFS = Object.freeze({
  api: { key: (i) => `${i.method} ${i.route}`, watch: ["auth"] },
  db: { key: (i) => i.table, watch: ["columns", "references", "rls"] },
  env: { key: (i) => i.name, watch: [] },
  dependencies: { key: (i) => `${i.name}${i.manifest ? ` (${i.manifest})` : ""}`, watch: ["version"] },
  security: { key: (i) => `${i.rule} ${i.file}`, watch: ["severity"] },
  secrets: { key: (i) => `${i.rule} ${i.file}`, watch: [] },
  agents: { key: (i) => i.file, watch: ["hidden"] },
});

/** Items of a facts file merged by key (a table defined in several files is one key; columns are merged). */
function byKey(items, source) {
  const d = DIFFS[source];
  const map = new Map();
  for (const it of items || []) {
    if (!it || typeof it !== "object") continue;
    const k = d.key(it);
    const prev = map.get(k);
    if (!prev) map.set(k, { ...it });
    else
      for (const f of d.watch) if (Array.isArray(it[f])) prev[f] = [...new Set([...(prev[f] || []), ...it[f]])].sort();
  }
  return map;
}

const same = (a, b) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

/** Differences of one source between two facts files (objects with `items`), or null when neither exists. */
export function diffSource(source, before, after) {
  if (!DIFFS[source] || (!before && !after)) return null;
  const a = byKey(before?.items, source);
  const b = byKey(after?.items, source);
  const out = { added: [], removed: [], changed: [] };
  for (const k of b.keys()) if (!a.has(k)) out.added.push(k);
  for (const k of a.keys()) if (!b.has(k)) out.removed.push(k);
  for (const [k, item] of b) {
    if (!a.has(k)) continue;
    const old = a.get(k);
    for (const f of DIFFS[source].watch)
      if (!same(old[f], item[f]))
        out.changed.push({ key: k, field: f, before: old[f] ?? null, after: item[f] ?? null });
  }
  out.added.sort();
  out.removed.sort();
  return out;
}

/** Summary-level changes that have no items to compare: tests (count) and modules (import cycles). */
function summaryChanges(source, before, after) {
  if (source === "tests") {
    const x = before?.summary?.tests ?? null;
    const y = after?.summary?.tests ?? null;
    return x === y
      ? null
      : { added: [], removed: [], changed: [{ key: "tests", field: "count", before: x, after: y }] };
  }
  if (source === "modules") {
    const key = (c) => c.join(" ⇄ ");
    const x = new Set((before?.summary?.cycles || []).map(key));
    const y = new Set((after?.summary?.cycles || []).map(key));
    const added = [...y].filter((c) => !x.has(c)).sort();
    const removed = [...x].filter((c) => !y.has(c)).sort();
    return added.length || removed.length ? { added, removed, changed: [] } : null;
  }
  return null;
}

/**
 * Every source's differences.
 * @param {Record<string, object|null>} before   facts files at the reference, by source
 * @param {Record<string, object|null>} after    facts files now, by source
 */
export function diffFacts(before, after) {
  const sources = {};
  let total = 0;
  for (const source of [...Object.keys(DIFFS), "tests", "modules"]) {
    const d = DIFFS[source]
      ? diffSource(source, before[source], after[source])
      : summaryChanges(source, before[source], after[source]);
    if (!d || (!d.added.length && !d.removed.length && !d.changed.length)) continue;
    sources[source] = d;
    total += d.added.length + d.removed.length + d.changed.length;
  }
  return { sources, total };
}

/**
 * Markdown of the changes: a heading per source, then added (+), removed (−), changed (~) lines. Used for
 * .doc-kit/changes.md, a pull request comment and the release notes.
 * @param {{ sources, total }} changes
 * @param {{ t: Function, since: string, until: string }} o
 */
export function changesMarkdown(changes, { t, since, until }) {
  const lines = [`## ${t("cli.changes.title", { since, until })}`, ""];
  if (!changes.total) return [...lines, t("cli.changes.none"), ""].join("\n");
  const show = (v) => (Array.isArray(v) ? v.join(", ") || "—" : v === null || v === undefined ? "—" : String(v));
  for (const [source, d] of Object.entries(changes.sources)) {
    lines.push(`### ${t(`cli.changes.source.${source}`)}`, "");
    for (const k of d.added) lines.push(`- ＋ \`${k}\``);
    for (const k of d.removed) lines.push(`- － \`${k}\``);
    for (const c of d.changed) lines.push(`- ～ \`${c.key}\` · ${c.field}: ${show(c.before)} → ${show(c.after)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Folder of the recorded changes (`changes --record`), one JSON file per documented version, committed. */
const CHANGES_DIR = "changes";

/** Writes changes/<version>.json ({ since, until, date, sources, total }); returns the file. */
export function recordChanges(root, record) {
  const dir = path.join(root, CHANGES_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(record.until || "unversioned").replace(/[^\w.+-]/g, "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}

/** Every recorded version (invalid files skipped), the most recent version first. */
export function readChanges(
  root,
  compare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }),
) {
  const dir = path.join(root, CHANGES_DIR);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (r && typeof r === "object" && r.sources && typeof r.sources === "object") out.push(r);
    } catch {
      // a broken file is skipped
    }
  }
  return out.sort((a, b) => compare(b.until, a.until));
}

/**
 * HTML of recorded changes (`::changes{version, sources}`): one block per version, most recent first, one list
 * per source with ＋ added, － removed, ～ changed.
 * @param {object[]} records   readChanges()
 * @param {{ t: Function, esc: Function, version?: string, sources?: string[]|null }} o
 */
export function renderChanges(records, { t, esc, version = null, sources = null }) {
  const kept = version ? records.filter((r) => r.until === version) : records;
  const show = (v) => (Array.isArray(v) ? v.join(", ") || "—" : v === null || v === undefined ? "—" : String(v));
  const blocks = kept.map((r) => {
    const parts = Object.entries(r.sources)
      .filter(([source]) => !sources || sources.includes(source))
      .map(([source, d]) => {
        const li = [
          ...(d.added || []).map(
            (k) => `<li class="changes-added"><span aria-hidden="true">＋</span> <code>${esc(k)}</code></li>`,
          ),
          ...(d.removed || []).map(
            (k) => `<li class="changes-removed"><span aria-hidden="true">－</span> <code>${esc(k)}</code></li>`,
          ),
          ...(d.changed || []).map(
            (c) =>
              `<li class="changes-changed"><span aria-hidden="true">～</span> <code>${esc(c.key)}</code> · ${esc(c.field)} : ${esc(show(c.before))} → ${esc(show(c.after))}</li>`,
          ),
        ];
        return `<p class="changes-source">${esc(t(`cli.changes.source.${source}`))}</p><ul class="changes-list">${li.join("")}</ul>`;
      });
    const head = t("render.changes.version", {
      until: r.until,
      since: r.since,
      date: String(r.date || "").slice(0, 10) || "—",
    });
    return `<div class="changes-version"><p class="changes-head"><strong>${esc(head)}</strong></p>${parts.length ? parts.join("") : `<p class="usage-none">${esc(t("cli.changes.none"))}</p>`}</div>`;
  });
  return blocks.join("\n");
}
