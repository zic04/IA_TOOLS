// inventory [--json] · inventory --features [--write] [--force]
// Lists what the coverage adapters (config.coverage) see in the application — routes, registry entries, files —
// and whether each element is already cited in the documentation. A starting point for the table of contents:
//   inventory --json > .doc-kit/inventory.json
// --features (ARCHITECTURE.md §6.8): groups every item of every adapter into candidate business features, by the
// first static segment of its id — a screen route ("/orders", "/orders/[id]", "/orders/new" → "orders"), an API
// route ("GET /api/orders/{id}" → "orders", the "api" segment itself ignored), or an i18n key ("orders.title" →
// "orders"). Each candidate gets a suggested id (F-01…, in the order the groups are first seen), a name, its
// routes, API routes and i18n keys, and the features.json entry that already covers it, if any (a page template
// "feature" whose own routes or api overlap the candidate's: the simplest reading of "the sheet that already
// cites it", since a candidate otherwise carries no page to point to).
import fs from "node:fs";
import path from "node:path";
import { runCoverage } from "../../engine/check/coverage.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { reasonText } from "./check.mjs";

export const options = {
  features: { type: "boolean" },
  write: { type: "boolean" },
  force: { type: "boolean" },
};

/** Method-prefixed id ("GET /api/orders/{id}") → its path alone ("/api/orders/{id}"), else the id unchanged. */
const pathOf = (id) => /^[A-Z]+ (\/.*)$/.exec(id)?.[1] ?? id;
const isApi = (id) => /^[A-Z]+ \//.test(id);
const isRoute = (id) => !isApi(id) && id.startsWith("/");

/** First static segment of an item's id (ARCHITECTURE.md §6.8): the grouping key of a candidate feature. */
export function segmentOf(id) {
  const path = pathOf(id);
  if (path.startsWith("/")) {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "api") parts.shift();
    const first = parts.find((p) => !/^[:{[]/.test(p));
    return first || parts[0] || path;
  }
  return path.split(".")[0] || path;
}

/** "orders-export" → "Orders export" (a readable name for a candidate without one of its own). */
const humanise = (id) =>
  id
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Candidate features (ARCHITECTURE.md §6.8), from the items of every available adapter (runCoverage), grouped by
 * `segmentOf`, in the order each group is first encountered.
 * @param {Array<{ available: boolean, families: Array<{ items: Array<{ id: string }> }> }>} adapters
 * @param {Array<{ id: string, routes?: string[], api?: string[], keys?: string[] }>} existingFeatures
 *   features.json already in the project (or []): a candidate already covered by one of its entries is matched
 *   back to it (`sheet`), by a shared route or API route.
 * @returns {Array<{ id: string, name: string, routes: string[], api: string[], keys: string[], sheet?: string }>}
 */
export function candidateFeatures(adapters, existingFeatures = []) {
  const groups = new Map();
  for (const a of adapters) {
    if (!a.available) continue;
    for (const f of a.families) for (const it of f.items) {
      const key = segmentOf(it.id);
      const g = groups.get(key) ?? groups.set(key, { routes: new Set(), api: new Set(), keys: new Set() }).get(key);
      if (isApi(it.id)) g.api.add(it.id);
      else if (isRoute(it.id)) g.routes.add(it.id);
      else g.keys.add(it.id);
    }
  }
  let n = 0;
  return [...groups.entries()].map(([key, g]) => {
    const routes = [...g.routes].sort();
    const api = [...g.api].sort();
    const keys = [...g.keys].sort();
    const sheet = existingFeatures.find((f) => [...routes, ...api].some((x) => (f.routes || []).includes(x) || (f.api || []).includes(x)));
    n++;
    return { id: `F-${String(n).padStart(2, "0")}`, name: humanise(key), routes, api, keys, ...(sheet ? { sheet: sheet.id } : {}) };
  });
}

/**
 * `--force`: entries already in features.json are kept as they are (their id included); only the candidates that
 * share no route or API route with an existing entry are appended, numbered after the highest existing F-xx.
 * @param {Array<object>} existing   features.json already in the project
 * @param {Array<object>} candidates candidateFeatures() of the current inventory
 */
export function mergeFeatures(existing, candidates) {
  const overlaps = (e, c) => [...c.routes, ...c.api].some((x) => (e.routes || []).includes(x) || (e.api || []).includes(x));
  const maxN = Math.max(0, ...existing.map((e) => Number(/-(\d+)$/.exec(e.id)?.[1] || 0)));
  let n = maxN;
  const added = [];
  for (const c of candidates) {
    if (existing.some((e) => overlaps(e, c))) continue;
    n++;
    added.push({ id: `F-${String(n).padStart(2, "0")}`, title: c.name, ...(c.routes.length ? { routes: c.routes } : {}), ...(c.api.length ? { api: c.api } : {}), ...(c.keys.length ? { keys: c.keys } : {}) });
  }
  return [...existing, ...added];
}

async function runFeatures({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (!config.coverage.length) throw new KitError(EXIT.USAGE, "check.coverage.none");
  const res = await runCoverage({ root: project.root, config });
  const file = path.resolve(project.root, "features.json");
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const candidates = candidateFeatures(res.adapters, existing);

  if (values.write) {
    if (fs.existsSync(file) && !values.force) throw new KitError(EXIT.CHECK, "inventory.features.written", { file: "features.json" });
    const result = values.force ? mergeFeatures(existing, candidates) : candidates.map(({ id, name, routes, api, keys }) => ({ id, title: name, ...(routes.length ? { routes } : {}), ...(api.length ? { api } : {}), ...(keys.length ? { keys } : {}) }));
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
    if (ctx.json) ctx.print(JSON.stringify({ file: "features.json", n: result.length }, null, 2));
    else ctx.print(ctx.t("cli.inventory.features.wrote", { file: "features.json", n: result.length }));
    return EXIT.OK;
  }
  if (ctx.json) {
    ctx.print(JSON.stringify(candidates, null, 2));
    return EXIT.OK;
  }
  for (const c of candidates) {
    ctx.print(`\n${ctx.t("cli.inventory.features.group", { id: c.id, name: c.name })}`);
    if (c.routes.length) ctx.print(`  ${ctx.t("cli.inventory.features.routes", { routes: c.routes.join(", ") })}`);
    if (c.api.length) ctx.print(`  ${ctx.t("cli.inventory.features.api", { routes: c.api.join(", ") })}`);
    if (c.keys.length) ctx.print(`  ${ctx.t("cli.inventory.features.keys", { keys: c.keys.join(", ") })}`);
    ctx.print(`  ${c.sheet ? ctx.t("cli.inventory.features.sheet", { sheet: c.sheet }) : ctx.t("cli.inventory.features.noSheet")}`);
  }
  ctx.print(`\n${ctx.t("cli.inventory.features.summary", { n: candidates.length })}`);
  return EXIT.OK;
}

export async function run({ ctx, values, positionals }) {
  if (values.features) return runFeatures({ ctx, values, positionals });
  const { project, config } = await ctx.loadProject();
  if (!config.coverage.length) throw new KitError(EXIT.USAGE, "check.coverage.none");
  const res = await runCoverage({ root: project.root, config });
  if (ctx.json) {
    ctx.print(JSON.stringify(res, null, 2));
    return EXIT.OK;
  }
  for (const a of res.adapters) {
    if (!a.available) {
      ctx.print(`⚠ ${ctx.t("cli.check.coverage.skipped", { adapter: a.adapter, reason: reasonText(ctx, a) })}`);
      continue;
    }
    for (const f of a.families) {
      ctx.print(`\n${ctx.t("cli.inventory.family", { adapter: a.adapter, name: f.name, n: f.total, covered: f.covered })}`);
      for (const it of f.items) ctx.print(`  ${it.covered ? "✔" : "·"} ${it.id}${it.label ? ` — ${it.label}` : ""}`);
    }
  }
  ctx.print(`\n${ctx.t("cli.inventory.summary", { n: res.total, covered: res.covered })}`);
  return EXIT.OK;
}
