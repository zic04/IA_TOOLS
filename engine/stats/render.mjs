// The "Cost of the documentation" tables (ARCHITECTURE.md §6.14): `::usage{view}` (`::consommation{vue}`) renders
// the production statistics of usage/<version>.jsonl at build time.
//   view = summary   totals: kit time, agent time, human time, agents run, models used (agents per model),
//                    tokens, estimated cost, runs, versions
//          versions  one row per version: phases, runs, time, tokens, models, cost
//          steps     time per step (each step's parts under it), with its share
//          models    tokens and cost per model
//          slowest   the ten slowest parts (step › part), where to optimise first
// Without `view`, every table in that order. Cost: `llm.prices` per million tokens (input, output, cacheRead,
// cacheWrite; cacheWrite defaults to 1.25 × input, cacheRead to 0.1 × input); no price, no cost column.
import { summarize, compareVersions } from "./usage.mjs";

export const USAGE_VIEWS = Object.freeze(["summary", "versions", "steps", "models", "slowest"]);

const tokensOf = (e) => (e.tokens ? (e.tokens.in || 0) + (e.tokens.out || 0) + (e.tokens.cacheRead || 0) + (e.tokens.cacheWrite || 0) : 0);

/** Cost of one line's tokens with `prices[model]` (per million tokens), or null when it has no price. */
export function costOf(e, prices = {}) {
  if (!e.tokens || !e.model) return null;
  const p = prices[e.model];
  if (!p) return null;
  const t = e.tokens;
  return (((t.in || 0) * p.input + (t.out || 0) * p.output + (t.cacheRead || 0) * (p.cacheRead ?? p.input * 0.1) + (t.cacheWrite || 0) * (p.cacheWrite ?? p.input * 1.25)) / 1e6);
}

/** "1.2 s", "3 min 4 s", "1 h 2 min". */
export function humanDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/**
 * HTML of the requested views.
 * @param {object[]} entries   lines of usage/*.jsonl (engine/stats/usage.mjs readUsage)
 * @param {string|undefined} view
 * @param {{ t: Function, esc: Function, prices?: object, currency?: string|null, locale?: string }} o
 */
export function renderUsage(entries, view, { t, esc, prices = {}, currency = null, locale = "en" }) {
  const views = view ? [view] : USAGE_VIEWS;
  const n = (x) => Math.round(x).toLocaleString(locale);
  const priced = entries.some((e) => costOf(e, prices) !== null);
  const money = (x) => (x === null ? "—" : `${x.toFixed(2)}${currency ? ` ${esc(currency)}` : ""}`);
  const sumCost = (list) => {
    const c = list.map((e) => costOf(e, prices)).filter((x) => x !== null);
    return c.length ? c.reduce((a, b) => a + b, 0) : null;
  };
  const table = (kind, head, rows, caption) =>
    `<table data-generated="usage" data-view="${kind}"><caption>${esc(caption)}</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  const bar = (share) => `<span class="usage-bar" style="--w:${Math.round(Math.min(1, share) * 100)}%"></span> ${Math.round(share * 100)} %`;
  const top = entries.filter((e) => !e.sub);
  const time = (list, actor) => list.filter((e) => (e.actor || "kit") === actor).reduce((s, e) => s + e.ms, 0);
  const out = [];

  for (const v of views) {
    if (v === "summary") {
      const versions = new Set(entries.map((e) => e.version));
      // One line per agent run (actor "agent"); the models with how many agents each, most used first.
      const agents = entries.filter((e) => e.actor === "agent");
      const perModel = new Map();
      for (const e of agents) perModel.set(e.model || "—", (perModel.get(e.model || "—") || 0) + 1);
      const modelsUsed = [...perModel.entries()].sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m} × ${n(c)}`).join(", ");
      const rows = [
        [t("render.usage.kitTime"), humanDuration(time(top, "kit"))],
        [t("render.usage.agentTime"), humanDuration(time(top, "agent"))],
        [t("render.usage.humanTime"), humanDuration(time(top, "human"))],
        [t("render.usage.agents"), n(agents.length)],
        [t("render.usage.modelsUsed"), modelsUsed || "—"],
        [t("render.usage.tokens"), n(entries.reduce((s, e) => s + tokensOf(e), 0))],
        ...(priced ? [[t("render.usage.cost"), money(sumCost(entries))]] : []),
        [t("render.usage.runs"), n(new Set(entries.map((e) => e.run)).size)],
        [t("render.usage.versions"), n(versions.size)],
      ].map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`);
      out.push(table("summary", [t("render.usage.measure"), t("render.usage.value")], rows, t("render.usage.caption.summary")));
    }
    if (v === "versions") {
      const by = new Map();
      for (const e of entries) by.set(e.version, [...(by.get(e.version) || []), e]);
      const rows = [...by.keys()]
        .sort(compareVersions)
        .map((version) => {
          const list = by.get(version);
          const lTop = list.filter((e) => !e.sub);
          const phases = [...new Set(list.map((e) => e.phase).filter(Boolean))].map((p) => t(`render.usage.phase.${p}`)).join(", ");
          const models = [...new Set(list.map((e) => e.model).filter(Boolean))].join(", ") || "—";
          const cells = [version, phases, n(new Set(list.map((e) => e.run)).size), humanDuration(lTop.reduce((s, e) => s + e.ms, 0)), n(list.reduce((s, e) => s + tokensOf(e), 0)), models, ...(priced ? [money(sumCost(list))] : [])];
          return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
        });
      const head = ["version", "phase", "runs", "time", "tokens", "models", ...(priced ? ["cost"] : [])].map((h) => t(`render.usage.col.${h}`));
      out.push(table("versions", head, rows, t("render.usage.caption.versions")));
    }
    if (v === "steps") {
      const { groups } = summarize(entries, "step");
      const rows = groups.map((g) => {
        const nested = g.key.includes(" › ");
        const label = nested ? `↳ ${g.key.split(" › ")[1]}` : g.key;
        return `<tr${nested ? ' class="usage-part"' : ""}><td>${esc(label)}</td><td>${esc(humanDuration(g.ms))}</td><td>${bar(g.share)}</td><td>${esc(n(g.count))}</td><td>${esc(g.tokens ? n(g.tokens) : "—")}</td></tr>`;
      });
      const head = ["step", "time", "share", "count", "tokens"].map((h) => t(`render.usage.col.${h}`));
      out.push(table("steps", head, rows, t("render.usage.caption.steps")));
    }
    if (v === "models") {
      const by = new Map();
      for (const e of entries.filter((x) => x.model)) by.set(e.model, [...(by.get(e.model) || []), e]);
      const rows = [...by.entries()]
        .map(([model, list]) => ({ model, list, tokens: list.reduce((s, e) => s + tokensOf(e), 0) }))
        .sort((a, b) => b.tokens - a.tokens)
        .map(({ model, list, tokens }) => {
          const io = list.reduce((a, e) => ({ in: a.in + (e.tokens?.in || 0), out: a.out + (e.tokens?.out || 0), cache: a.cache + (e.tokens?.cacheRead || 0) + (e.tokens?.cacheWrite || 0) }), { in: 0, out: 0, cache: 0 });
          const cells = [model, n(list.length), n(io.in), n(io.out), n(io.cache), n(tokens), humanDuration(list.reduce((s, e) => s + e.ms, 0)), ...(priced ? [money(sumCost(list))] : [])];
          return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
        });
      const head = ["model", "agents", "in", "out", "cache", "tokens", "time", ...(priced ? ["cost"] : [])].map((h) => t(`render.usage.col.${h}`));
      out.push(rows.length ? table("models", head, rows, t("render.usage.caption.models")) : `<p class="usage-none">${esc(t("render.usage.noModels"))}</p>`);
    }
    if (v === "slowest") {
      const parts = summarize(entries, "step").groups.filter((g) => g.key.includes(" › ")).slice(0, 10);
      const rows = parts.map((g) => `<tr><td>${esc(g.key)}</td><td>${esc(humanDuration(g.ms))}</td><td>${esc(humanDuration(g.ms / g.count))}</td><td>${esc(n(g.count))}</td></tr>`);
      const head = ["part", "time", "average", "count"].map((h) => t(`render.usage.col.${h}`));
      out.push(rows.length ? table("slowest", head, rows, t("render.usage.caption.slowest")) : `<p class="usage-none">${esc(t("render.usage.noParts"))}</p>`);
    }
  }
  return out.join("\n");
}
