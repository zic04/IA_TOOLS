// The directives drawn from the facts files (ARCHITECTURE.md §6.9, §6.13), rendered at build time by the Markdown
// engine (engine/build/markdown.mjs): ::facts{source columns} (::faits), ::erd{tables title} (::mcd),
// ::changes{version sources} (::changements), and the developer views ::modules, ::hotspots (::points-chauds),
// ::health (::sante) and ::c4 (engine/build/developer.mjs, engine/build/c4.mjs). A missing facts file is a strict
// `facts.missing`; an empty view says so in the page. One function per directive, chosen through RENDERERS: a new
// view drawn from the facts is one more entry, never a new branch in the Markdown engine.
import { esc } from "../core/text.mjs";
import { renderErd } from "./erd.mjs";
import { renderModules, renderHotspots, renderHealth, limitOf } from "./developer.mjs";
import { systemModel, renderC4 } from "./c4.mjs";
import { renderChanges } from "../facts/changes.mjs";

/** Facts files read by the health summary (::health), in the order of its cards. */
const HEALTH_SOURCES = ["quality", "security", "secrets", "tests", "modules", "history", "dependencies"];

/**
 * @typedef {{ exists: (file: string) => boolean, read: (file: string) => string, paths: { facts: string },
 *   t: (key: string, vars?: object) => string, signal: (strict: boolean, key: string, vars?: object) => void,
 *   changes: any[] }} Env
 * @typedef {{ kind: string, a: Record<string, string> }} Token
 */

/** A comma-separated attribute as a list, or null when it is not given. */
const listOf = (value) =>
  value
    ? value
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : null;

/** "Not available" paragraph of an empty view. */
const none = (env, key) => `<p class="usage-none">${esc(env.t(key))}</p>`;

/** A facts file of the project, parsed; null when it is missing or not valid JSON. */
function readFactsFile(env, source) {
  const f = `${env.paths.facts}/${source}.json`;
  try {
    return env.exists(f) ? JSON.parse(env.read(f)) : null;
  } catch {
    return null;
  }
}

/** A facts file the directive needs: its data, or null after a strict `facts.missing`. */
function need(env, source) {
  const data = readFactsFile(env, source);
  if (!data) env.signal(true, "facts.missing", { source, file: `${env.paths.facts}/${source}.json` });
  return data;
}

/** The caption of a table or figure drawn from a facts file: its source, date and commit. */
function caption(env, source, data) {
  const commit = data.commit ? data.commit.slice(0, 7) : env.t("render.facts.commitUnknown");
  const date = String(data.generated || "").slice(0, 10) || "—";
  return env.t("render.facts.caption", { source, date, commit });
}

/** Header label of a facts column: render.facts.column.<key> when translated, else the raw key. */
function factsLabel(env, column) {
  const key = `render.facts.column.${column}`;
  const label = env.t(key);
  return label === key ? column : label;
}

/** One cell of a facts table (ARCHITECTURE.md §6.9): lists joined with commas, booleans ✔ / —, "—" when absent.
 * A path-like scalar value (a file path, a route — contains "/") is wrapped in `<code>`, so that it gets the
 * same break opportunities as hand-written inline code (engine/build/markdown.mjs): a long nested path (a Next.js
 * route such as `frontend/src/app/admin/orders/[id]/…`) must be able to wrap, never widen the table. */
function factsCell(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "✔" : "—";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return esc(value.map((x) => (x && typeof x === "object" ? Object.values(x).join(":") : String(x))).join(", "));
  }
  const text = String(value);
  return text.includes("/") ? `<code>${esc(text)}</code>` : esc(text);
}

/** ::facts{source columns}: a table of the items of facts/<source>.json. */
function factsTable(env, tk) {
  const source = tk.a.source || "";
  const data = source ? readFactsFile(env, source) : null;
  if (!data) {
    env.signal(true, "facts.missing", { source, file: `${env.paths.facts}/${source}.json` });
    return "";
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const requested = listOf(tk.a.columns) || Object.keys(items[0] || {});
  // No items: nothing to validate a column name against (an empty facts file is not a column error).
  const known = new Set(items.flatMap((it) => Object.keys(it)));
  if (items.length)
    for (const c of requested) if (!known.has(c)) env.signal(true, "facts.column", { source, column: c });
  const header = requested.map((c) => `<th>${esc(factsLabel(env, c))}</th>`).join("");
  const rows = items.map((it) => `<tr>${requested.map((c) => `<td>${factsCell(it[c])}</td>`).join("")}</tr>`).join("");
  // data-generated: so that the wrapping div can be told apart from a table the writer wrote by hand in Markdown
  // (check tables, ARCHITECTURE.md §6.9: a directive's own table is never a too narrow column to fix).
  return `<table data-generated="facts"><caption>${esc(caption(env, source, data))}</caption><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** ::erd{tables title}: the entity-relationship diagram of facts/db.json (doc-kit facts --source db). */
function erdView(env, tk) {
  const data = need(env, "db");
  if (!data) return "";
  const title = tk.a.title || env.t("render.erd.title");
  const more = (n) => env.t("render.erd.more", { n });
  const svg = renderErd(data.items, { esc, title, only: listOf(tk.a.tables), more });
  if (!svg) {
    env.signal(false, "erd.empty", { file: `${env.paths.facts}/db.json` });
    return none(env, "render.erd.empty");
  }
  const text = caption(env, "db", data);
  return `<figure class="schema erd-figure">${svg}<figcaption>${esc(tk.a.title ? `${tk.a.title} · ${text}` : text)}</figcaption></figure>`;
}

/** ::changes{version sources}: what changed in the application, version by version (doc-kit changes --record). */
function changesView(env, tk) {
  const version = tk.a.version || null;
  const html = env.changes.length
    ? renderChanges(env.changes, { t: env.t, esc, version, sources: listOf(tk.a.sources) })
    : "";
  if (!html) {
    env.signal(false, "changes.empty", { version: version || "—" });
    return none(env, "render.changes.empty");
  }
  return `<div class="changes" data-generated="changes">${html}</div>`;
}

/** The HTML of one developer view, or "" when a facts file it needs is missing (already signalled). */
function developerHtml(env, tk) {
  const { t } = env;
  const limit = limitOf(tk.a.limit);
  if (tk.kind === "modules") {
    const modules = need(env, "modules");
    return modules ? renderModules(modules, { t, esc, limit }) : null;
  }
  if (tk.kind === "hotspots") {
    const history = need(env, "history");
    const quality = need(env, "quality");
    return history && quality ? renderHotspots(history, quality, { t, esc, limit }) : null;
  }
  if (tk.kind === "c4") {
    const dependencies = need(env, "dependencies");
    if (!dependencies) return null;
    const model = systemModel({ dependencies, env: readFactsFile(env, "env"), db: readFactsFile(env, "db") });
    return renderC4(model, { t, esc, title: tk.a.title || t("render.c4.title") });
  }
  const facts = Object.fromEntries(HEALTH_SOURCES.map((source) => [source, readFactsFile(env, source)]));
  // Every card says "not measured" for a missing source; with none at all, the page has nothing to show.
  if (Object.values(facts).every((d) => !d)) {
    need(env, "quality"); // the strict facts.missing, then nothing (no "empty" notice on top)
    return null;
  }
  return renderHealth(facts, { t, esc, limit });
}

/** ::modules, ::hotspots, ::health and ::c4: a view drawn from the facts, or "not available". */
function developerView(env, tk) {
  const html = developerHtml(env, tk);
  if (html === null) return "";
  if (!html) {
    env.signal(false, "developer.empty", { kind: tk.kind });
    return none(env, `render.${tk.kind}.empty`);
  }
  return html;
}

/** Directive kind → its renderer. */
const RENDERERS = {
  facts: factsTable,
  erd: erdView,
  changes: changesView,
  modules: developerView,
  hotspots: developerView,
  health: developerView,
  c4: developerView,
};

/**
 * The renderer of the facts directives of one build.
 * @param {Env} env   exists, read, paths, t, signal (reports a problem of the current page), changes (by version)
 * @returns {{ render: (tk: Token) => string|null }}  null: not a facts directive
 */
export function createFactDirectives(env) {
  return { render: (tk) => (RENDERERS[tk.kind] ? RENDERERS[tk.kind](env, tk) : null) };
}
