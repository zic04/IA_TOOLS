// Dependencies of a page (ARCHITECTURE.md §6.10, "Dependencies of a page"): the files the application code holds
// that a page's text depends on, deduced from its routes, its proofs, its captures, its `::facts` tables, its
// counterpart and its declared sources — never typed by hand (except `sources` and `--mark --sources`).
import fs from "node:fs";
import path from "node:path";
import { loadAdapter } from "../capture/session.mjs";
import { adapterTools } from "../check/coverage.mjs";
import { countGuidance } from "../core/page-templates.mjs";
import { relPath } from "../facts/common.mjs";
import { routeFiles, matchRoute } from "./routes.mjs";
import { resolveImports } from "../facts/imports.mjs";
import { extractProofs } from "./proofs.mjs";
import { apiRoutesCalledBy } from "./api-links.mjs";

/** Files read, cached for the lifetime of the process (ARCHITECTURE.md §8, performance). */
const fileCache = new Map();
function readCached(abs) {
  if (!fileCache.has(abs)) fileCache.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null);
  return fileCache.get(abs);
}

/** Loaded coverage adapters of a project (name, options), in `config.coverage` order; cached per process. */
const adapterCache = new Map();
async function loadCoverageAdapters(root, config) {
  const key = root;
  if (!adapterCache.has(key)) adapterCache.set(key, new Map());
  const byRoot = adapterCache.get(key);
  const out = [];
  for (const [i, spec] of (config.coverage || []).entries()) {
    const cacheKey = JSON.stringify(spec);
    if (!byRoot.has(cacheKey)) byRoot.set(cacheKey, await loadAdapter("coverage", spec, root, `coverage[${i}]`));
    out.push({ spec, ...byRoot.get(cacheKey) });
  }
  return out;
}

/** A page entry of the table of contents (id, title, template, routes, sources, counterpart…), or null. */
export function findPageEntry(toc, pageId) {
  for (const sec of toc.sections || [])
    for (const g of sec.groups || []) for (const p of g.pages || []) if (p.id === pageId) return p;
  return null;
}

/** `:::screen` / `::capture` ids cited by a page's Markdown (both English and French spellings). */
export function captureIds(markdown) {
  const ids = new Set();
  for (const m of markdown.matchAll(/:::(?:screen|ecran)\{[^}]*capture="([^"]+)"/g)) ids.add(m[1]);
  for (const m of markdown.matchAll(/::capture\{[^}]*id="([^"]+)"/g)) ids.add(m[1]);
  return [...ids];
}

/** `::facts` / `::faits` sources cited by a page's Markdown. */
const factsSourcesOf = (markdown) => [
  ...new Set([...markdown.matchAll(/::(?:facts|faits)\{[^}]*source="([^"]+)"/g)].map((m) => m[1])),
];

/** Written pages (ARCHITECTURE.md §5): a file that exists and holds no template guidance. */
export function writtenPages({ root, config, toc }) {
  const { content } = config.paths;
  const out = [];
  for (const sec of toc.sections || [])
    for (const g of sec.groups || [])
      for (const p of g.pages || []) {
        const file = `${content}/${p.file || `${p.id}.md`}`;
        const abs = path.join(root, file);
        if (!fs.existsSync(abs)) continue;
        const markdown = fs.readFileSync(abs, "utf8");
        if (countGuidance(markdown) > 0) continue;
        out.push({ id: p.id, file, markdown, entry: p });
      }
  return out;
}

/** Files of a glob relative to `base` (literal path kept as is when it has no "*" and exists). */
function globFiles(tools, base, pattern) {
  if (!pattern.includes("*")) return tools.exists(pattern) ? [pattern] : [];
  const parts = pattern.split("/");
  const i = parts.findIndex((p) => p.includes("*"));
  const dir = i < 0 ? base : [base, ...parts.slice(0, i)].filter((x) => x && x !== ".").join("/") || ".";
  const sub = i < 0 ? parts.at(-1) : parts.slice(i).join("/");
  return tools.glob(sub, dir).map((f) => (dir === "." ? f : `${dir}/${f}`));
}

/** Route files of one route, resolved against every configured coverage adapter, converted to appRel. */
async function filesOfRoute({ route, root, appDir, config, inventory, coverageAdapters, tools }) {
  for (const [i, a] of inventory.adapters.entries()) {
    for (const family of a.families || []) {
      const item = matchRoute(route, family.items);
      if (!item) continue;
      const files = routeFiles({
        spec: coverageAdapters[i].spec,
        options: coverageAdapters[i].options,
        item,
        route,
        tools,
      });
      return files.map((f) => toAppRel(root, appDir, f)).filter(Boolean);
    }
  }
  return [];
}

/** A projRel path converted to appRel, or null when it falls outside app.dir. */
function toAppRel(root, appDir, projRel) {
  if (!appDir) return null;
  const abs = path.resolve(root, projRel);
  const base = path.resolve(appDir);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return relPath(appDir, abs);
}

/** Is this an appRel route file a `layout.*` (never counted in D, ARCHITECTURE.md §2.3)? */
const isLayout = (f) => /(^|\/)layout\.(tsx|ts|jsx|js)$/.test(f);

/**
 * Dependencies of one page: what pageDependencies() returns.
 * @typedef {object} PageDependencies
 * @property {any} page
 * @property {string[]} routes
 * @property {string[]} captures
 * @property {string[]} factsSources
 * @property {Array<{ path: string, kind: "direct"|"shared", via: string[], lines: Array<[number,number]> }>} files
 * @property {Array<any>} proofs
 * @property {boolean} truncated
 * @property {string[]} routeFiles    R (ARCHITECTURE.md §2.3), for classifyMissingFile
 * @property {string[]} routeFolders  D (ARCHITECTURE.md §2.3)
 */

/**
 * Dependencies of one page.
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object} p.toc
 * @param {string} p.pageId
 * @param {object} p.inventory        result of runCoverage({ root, config })
 * @param {object} p.tools            adapterTools(root)
 * @param {string} p.factsDir         projRel folder of the facts files (config.paths.facts)
 * @param {object[]} [p.plans]        loaded capture plan entries (engine/capture/plans.mjs, loadPlans().captures)
 * @param {string[]} [p.declared]     "file[:from[-to]]" recorded by --mark --sources (sync.json pages[id].declared)
 * @param {number} [p._counterpartDepth]  internal: recursion depth of the counterpart's own dependencies
 * @returns {Promise<PageDependencies>}
 */
export async function pageDependencies({
  root,
  config,
  toc,
  pageId,
  inventory,
  tools,
  factsDir,
  plans = [],
  declared = [],
  _counterpartDepth = 0,
}) {
  const entry = findPageEntry(toc, pageId) || { id: pageId };
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const file = `${config.paths.content}/${entry.file || `${pageId}.md`}`;
  const markdown = readCached(path.join(root, file)) ?? "";
  const coverageAdapters = await loadCoverageAdapters(root, config);

  const routes = entry.routes || [];
  const proofs = extractProofs(markdown, appDir ? { appDir } : {});
  const captures = captureIds(markdown);
  const factsSources = factsSourcesOf(markdown);

  /** path → { kind, via: Set, lines: Set<"from-to"> } */
  const acc = new Map();
  const add = (
    p,
    { via, direct = false, lines } = /** @type {{ via?: string, direct?: boolean, lines?: any }} */ ({}),
  ) => {
    if (!p) return;
    if (!acc.has(p)) acc.set(p, { direct: false, via: new Set(), lines: new Set() });
    const e = acc.get(p);
    if (direct) e.direct = true;
    if (via) e.via.add(via);
    if (lines) e.lines.add(JSON.stringify(lines));
  };

  // ─── Routes (R) and D (folders of the page's own page/decorator/glob files, not the layouts) ────────────────
  const R = new Set();
  const D = new Set();
  // `pageFiles`: R without the layouts (ARCHITECTURE.md §2.3, "direct" membership). R itself keeps the layouts,
  // for the import closure below and for `classifyMissingFile` ("R empty" ⇒ the route itself is gone): a layout
  // is always shared ("Sinon partagé (y compris les layouts au-dessus…)"), even though it seeds the closure.
  const pageFiles = new Set();
  for (const route of routes) {
    const files = await filesOfRoute({ route, root, appDir, config, inventory, coverageAdapters, tools });
    for (const f of files) {
      R.add(f);
      add(f, { via: "route" });
      if (!isLayout(f)) {
        D.add(path.posix.dirname(f.split(path.sep).join("/")));
        pageFiles.add(f);
      }
    }
    // layouts specifically (already included in `files` for next-app-router): tag separately for clarity.
    for (const f of files.filter(isLayout)) add(f, { via: "layout" });
  }

  // ─── Proofs: the cited file is always direct ──────────────────────────────────────────────────────────────
  // A proof whose file cannot be found in the application (proof.path null) adds no dependency.
  for (const proof of proofs)
    add(appDir ? proof.path : proof.file, { via: "proof", direct: true, lines: [proof.from, proof.to ?? proof.from] });

  // ─── Server code behind the screen: the API paths written in the page's own files, matched against the routes
  // of facts/api.json (api-links.mjs); each handler's file is direct, with the handler's line ──────────────────
  const apiFacts = appDir && factsDir ? readCached(path.join(root, factsDir, "api.json")) : null;
  if (apiFacts && pageFiles.size) {
    let items = [];
    try {
      items = JSON.parse(apiFacts).items || [];
    } catch {
      // An unreadable facts file is reported by the build (::facts) and by doc-kit facts, not here.
    }
    const texts = [...pageFiles].map((f) => readCached(path.join(appDir, f)) ?? "");
    for (const item of apiRoutesCalledBy(texts, items))
      add(item.file, { via: "api", direct: true, lines: item.line ? [item.line, item.line] : undefined });
  }

  // ─── Closure of local imports, from R ──────────────────────────────────────────────────────────────────────
  let truncated = false;
  if (appDir && R.size) {
    const { files: closure, truncated: t } = resolveImports({ appDir, files: [...R] });
    truncated = t;
    for (const f of closure) if (!R.has(f)) add(f, { via: "import" });
  }

  // ─── Captures: the route of each cited plan entry ─────────────────────────────────────────────────────────
  for (const id of captures) {
    const planEntry = plans.find((p) => p.id === id);
    if (!planEntry) continue;
    const files = await filesOfRoute({
      route: planEntry.route,
      root,
      appDir,
      config,
      inventory,
      coverageAdapters,
      tools,
    });
    for (const f of files) add(f, { via: "capture" });
  }

  // ─── ::facts tables ────────────────────────────────────────────────────────────────────────────────────────
  for (const source of factsSources) add(`doc:${factsDir}/${source}.json`, { via: "facts" });

  // ─── Counterpart: one level of recursion, never beyond ────────────────────────────────────────────────────
  if (entry.counterpart && _counterpartDepth < 1) {
    const targetId = entry.counterpart.split("~")[0];
    const target = await pageDependencies({
      root,
      config,
      toc,
      pageId: targetId,
      inventory,
      tools,
      factsDir,
      plans,
      declared: [],
      _counterpartDepth: 1,
    });
    for (const f of target.files) add(f.path, { via: "counterpart", direct: false });
  }

  // ─── Declared page sources (toc field `sources`: globs relative to app.dir) ────────────────────────────────
  if (appDir && entry.sources?.length) {
    const appTools = adapterTools(appDir);
    for (const pattern of entry.sources)
      for (const f of globFiles(appTools, ".", pattern)) add(f, { via: "sources", direct: true });
  }

  // ─── Declared sources of --mark --sources (sync.json pages[id].declared) ──────────────────────────────────
  for (const d of declared) {
    const m = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(d);
    add(m[1], { via: "declared", direct: true, lines: m[2] ? [Number(m[2]), Number(m[3] || m[2])] : undefined });
  }

  // ─── Final classification (ARCHITECTURE.md §2.3): direct when a page file (not a layout), under a D folder,
  // or cited directly (proof/sources/declared) ─────────────────────────────────────────────────────────────
  const files = [...acc.entries()].map(([p, e]) => {
    const underD = !p.startsWith("doc:") && [...D].some((d) => p === d || p.startsWith(d + "/"));
    const direct = e.direct || pageFiles.has(p) || underD;
    return {
      path: p,
      kind: /** @type {"direct"|"shared"} */ (direct ? "direct" : "shared"),
      via: [...e.via],
      lines: /** @type {Array<[number, number]>} */ ([...e.lines].map((s) => JSON.parse(s))),
    };
  });

  // `routeFiles`/`routeFolders` (R/D, ARCHITECTURE.md §2.3) are exposed so that the report can classify a file
  // that disappeared (no longer reachable at all) by the same rule, using the current state.
  return {
    page: entry,
    routes,
    captures,
    factsSources,
    files,
    proofs,
    truncated,
    routeFiles: [...R],
    routeFolders: [...D],
  };
}

/** Classifies a path by the ARCHITECTURE.md §2.3 rule, from the R/D of a (possibly stale) pageDependencies
 * result: direct when it is a route file, under a route folder, or `routeFiles` is empty (the route itself is
 * gone: a disappeared file then counts as direct). Used by the report for a file that no longer exists. */
/** @param {string} p
 * @param {{ routeFiles: string[], routeFolders: string[] }} deps */
export function classifyMissingFile(p, { routeFiles: R, routeFolders: D }) {
  if (!R.length) return "direct";
  if (R.includes(p)) return "direct";
  if (D.some((d) => p === d || p.startsWith(d + "/"))) return "direct";
  return "shared";
}
