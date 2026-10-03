// Production statistics of a documentation project (ETUDE-CAPTURES.md §6): how long each step took, for which
// version of the application, and — for the agents — how many tokens and which model.
//   usage/<version>.jsonl   one JSON object per line, appended, never rewritten; committed with the project.
// Recording is on when the project has a `usage/` folder (written by `init`), unless DOC_KIT_STATS=0. Older
// projects opt in by creating the folder.
//
// A line:
//   { at, version, run, command, phase, step, sub?, part?, ms, model?, tokens?, pages?, actor }
//   step   the block measured: capture, facts, build, sync, translate, generate, review, setup… (one per command,
//          plus the sub-steps the engine reports: a capture's navigate/wait/mask/shot/encode/compare, a facts source)
//   actor  "kit" (measured by the kit), "agent" (an AI agent, tokens and model given), "human" (a person's time)
import fs from "node:fs";
import path from "node:path";

export const USAGE_DIR = "usage";

/** The project's usage folder, or null when statistics are not recorded for it. */
export function usageFolder(root, env = process.env) {
  if (env.DOC_KIT_STATS === "0") return null;
  const dir = path.join(root, USAGE_DIR);
  try {
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

/** File name of a version's usage (unsafe characters replaced). */
export const usageFile = (dir, version) =>
  path.join(dir, `${String(version || "unversioned").replace(/[^\w.+-]/g, "_")}.jsonl`);

/**
 * A timer: spans measured during one command.
 *   const end = timer.start("capture", { sub: "orders-list", part: "wait" }); … end();
 *   await timer.time("facts", { sub: "api" }, () => collectApi(dir));
 * @param {() => number} [now]  milliseconds (test seam)
 */
export function createTimer(now = () => performance.now()) {
  const spans = [];
  const timer = {
    spans,
    start(step, detail = {}) {
      const t0 = now();
      let done = false;
      return (extra = {}) => {
        if (done) return;
        done = true;
        spans.push({ step, ...detail, ...extra, ms: Math.round(now() - t0) });
      };
    },
    async time(step, detail, fn) {
      const end = timer.start(step, detail);
      try {
        return await fn();
      } finally {
        end();
      }
    },
    /** A span measured elsewhere (an agent's duration, a person's time). */
    add(step, detail, ms) {
      spans.push({ step, ...detail, ms: Math.max(0, Math.round(ms)) });
    },
  };
  return timer;
}

/** An identifier for one run of a command: date and time, plus a few random characters. */
function runId(date = new Date()) {
  return `r-${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Appends a run's spans to usage/<version>.jsonl.
 * @param {{ dir: string, version: string, command: string, phase: string, spans: object[], date?: Date, run?: string }} p
 * @returns {{ file: string, lines: number }}
 */
export function appendUsage({ dir, version, command, phase, spans, date = new Date(), run = runId(date) }) {
  const at = date.toISOString();
  const lines = spans.map((s) => JSON.stringify({ at, version, run, command, phase, actor: "kit", ...s }));
  const file = usageFile(dir, version);
  if (lines.length) fs.appendFileSync(file, lines.join("\n") + "\n");
  return { file, lines: lines.length };
}

/** Every line of every usage file (invalid lines skipped), oldest first. */
export function readUsage(dir) {
  const out = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return out;
  }
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && typeof e === "object" && typeof e.ms === "number") out.push(e);
      } catch {
        // a broken line is skipped
      }
    }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** The key of a line for a grouping: step, version, command, model, phase, page (first page), actor. */
const KEYS = {
  step: (e) => (e.sub ? `${e.step} › ${e.part || e.sub}` : e.step),
  version: (e) => e.version,
  command: (e) => e.command,
  model: (e) => e.model || "—",
  phase: (e) => e.phase,
  page: (e) => (e.pages && e.pages[0]) || "—",
  actor: (e) => e.actor || "kit",
};
export const GROUPINGS = Object.freeze(Object.keys(KEYS));

/**
 * Totals of lines grouped by `by`. A command's own span (no `sub`) and the spans inside it are both counted under
 * their own keys; the overall total only counts top-level spans (no `sub`), so that nothing is counted twice.
 * @returns {{ total: { ms, tokens, runs }, groups: Array<{ key, ms, tokens, count, share }> }} groups sorted by time
 */
export function summarize(entries, by = "step", { since } = /** @type {{ since?: string }} */ ({})) {
  const key = KEYS[by];
  if (!key) throw new Error(`unknown grouping: ${by}`);
  const kept = since ? entries.filter((e) => compareVersions(e.version, since) >= 0) : entries;
  const tokensOf = (e) =>
    e.tokens ? (e.tokens.in || 0) + (e.tokens.out || 0) + (e.tokens.cacheRead || 0) + (e.tokens.cacheWrite || 0) : 0;
  const top = kept.filter((e) => !e.sub);
  const total = {
    ms: top.reduce((s, e) => s + e.ms, 0),
    tokens: kept.reduce((s, e) => s + tokensOf(e), 0),
    runs: new Set(kept.map((e) => e.run)).size,
  };
  // Sub-steps are grouped among themselves (by part) and top-level spans among themselves: the share of a part
  // is its share of its own step.
  const map = new Map();
  for (const e of by === "step" ? kept : top) {
    const k = key(e);
    const g = map.get(k) || { key: k, ms: 0, tokens: 0, count: 0, nested: !!e.sub };
    g.ms += e.ms;
    g.tokens += tokensOf(e);
    g.count++;
    map.set(k, g);
  }
  // Longest first; each step's parts right after it, longest first too.
  const sorted = [...map.values()].sort((a, b) => b.ms - a.ms);
  const parentOf = (g) => g.key.split(" › ")[0];
  const groups = [];
  for (const g of sorted.filter((x) => !x.nested))
    groups.push(g, ...sorted.filter((x) => x.nested && parentOf(x) === g.key));
  groups.push(...sorted.filter((x) => x.nested && !groups.includes(x)));
  for (const g of groups) {
    const base = g.nested
      ? kept.filter((e) => !e.sub && `${e.step}` === g.key.split(" › ")[0]).reduce((s, e) => s + e.ms, 0)
      : total.ms;
    g.share = base ? g.ms / base : 0;
  }
  return { total, groups };
}

/** Compares two versions numerically, part by part ("1.10.0" > "1.9.2"); non-numeric parts as text. */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/);
  const pb = String(b).split(/[.+-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (c) return Math.sign(c);
  }
  return 0;
}

/** CSV of the lines (one row per line, the fields in a fixed order). */
export function usageCsv(entries) {
  const cols = [
    "at",
    "version",
    "run",
    "command",
    "phase",
    "actor",
    "step",
    "sub",
    "part",
    "ms",
    "model",
    "tokensIn",
    "tokensOut",
    "cacheRead",
    "cacheWrite",
    "pages",
  ];
  const cell = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map((e) =>
    [
      e.at,
      e.version,
      e.run,
      e.command,
      e.phase,
      e.actor || "kit",
      e.step,
      e.sub,
      e.part,
      e.ms,
      e.model,
      e.tokens?.in,
      e.tokens?.out,
      e.tokens?.cacheRead,
      e.tokens?.cacheWrite,
      (e.pages || []).join(" "),
    ]
      .map(cell)
      .join(","),
  );
  return [cols.join(","), ...rows].join("\n") + "\n";
}
