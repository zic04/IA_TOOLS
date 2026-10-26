// The code behind a feature sheet (ARCHITECTURE.md §6.10): what features.json says of its feature — its screen
// routes, its API routes (their handlers, from facts/api.json), the globs of its `sources` — and the files those
// handlers and sources import, two levels deep (handler → service → query): the code its writer reads, and that sync
// follows. And, for any page, the lines of the behaviour hints (facts/behaviours.json) in its files, so that the
// excerpts of its context show them.
import fs from "node:fs";
import path from "node:path";
import { readFeatures, featuresFileOf } from "../core/features.mjs";
import { kindsOfHints } from "../core/behaviours.mjs";
import { SECRET_FILE } from "../check/secrets.mjs";
import { realInside, realPathOf } from "../core/confine.mjs";
import { projectTools } from "../core/project-tools.mjs";
import { resolveImports } from "../facts/imports.mjs";

/**
 * The entry of the features file (features.json) of a page that is a feature sheet (its `feature` field), or null.
 * The file is read with the project's tools (readFeatures): never through a link or a junction of the application.
 * @param {string} root
 * @param {any} config
 * @param {any} entry
 * @param {ReturnType<typeof projectTools>} [tools]
 */
export function featureOf(root, config, entry, tools = projectTools(root, config)) {
  if (!entry?.feature) return null;
  return readFeatures(tools, featuresFileOf(config)).features.get(entry.feature) ?? null;
}

/**
 * The files of `sources` globs (a page's in toc.json, a feature's in features.json), confined to the application: a
 * glob that is absolute, climbs (..) or holds a ":" (a drive, C:x; a data stream of a Windows file, .env::$DATA) is
 * left out, and so is what is not a file inside app.dir or is a secret file (.env, a key: SECRET_FILE) under the name
 * the system gives it (a short name, ENV~1, or another case, .ENV, is the real .env) — the context would give it whole
 * to an agent.
 * @param {string} appDir
 * @param {string[]} patterns
 * @param {(pattern: string) => string[]} glob   relative to app.dir
 */
export function safeSources(appDir, patterns, glob) {
  const base = realPathOf(appDir);
  if (!base) return [];
  const out = [];
  for (const pattern of patterns || []) {
    const p = String(pattern).replaceAll("\\", "/");
    if (p.startsWith("/") || p.includes(":") || p.split("/").includes("..")) continue;
    for (const f of glob(p)) {
      if (String(f).includes(":")) continue;
      // Where the file really is and its real name, as the system gives them (links and junctions followed, a short
      // name or another case resolved): inside the application only.
      const real = realInside(base, path.resolve(appDir, f));
      if (!real || SECRET_FILE.test(path.basename(f)) || SECRET_FILE.test(path.basename(real))) continue;
      try {
        if (fs.statSync(real).isFile() && !out.includes(f)) out.push(f);
      } catch {
        // gone between the glob and now: left out
      }
    }
  }
  return out;
}

/**
 * The code of a feature sheet's feature (ARCHITECTURE.md §6.10), given to `add` (engine/sync/dependencies.mjs): the
 * handlers of its API routes with their line and the files of its `sources`, direct (via "feature"); what they import
 * two levels deep, shared (via "feature-import").
 * @param {{ appDir: string, feature: any, apiItems: any[], glob: (pattern: string) => string[],
 *   add: (file: string, o: { via: string, direct?: boolean, lines?: [number, number] }) => void }} p
 */
export function featureDependencies({ appDir, feature, apiItems, glob, add }) {
  const seeds = new Set();
  for (const h of apiHandlers(feature, apiItems)) {
    add(h.file, { via: "feature", direct: true, lines: h.line ? [h.line, h.line] : undefined });
    seeds.add(h.file);
  }
  for (const f of safeSources(appDir, feature.sources, glob)) {
    add(f, { via: "feature", direct: true });
    seeds.add(f);
  }
  if (seeds.size)
    for (const f of resolveImports({ appDir, files: [...seeds], maxDepth: 2 }).files)
      if (!seeds.has(f)) add(f, { via: "feature-import" });
}

/** Whether two routes are the same, whatever the spelling of their parameters and of their method ("GET /orders"). */
export const sameRoute = (a, b) =>
  normalRoute(String(a).replace(/^[A-Z]+ /, "")) === normalRoute(String(b).replace(/^[A-Z]+ /, ""));

/** A route compared whatever the spelling of its parameters ([id], {id}, :id), without its trailing "/". */
function normalRoute(r) {
  const s = String(r)
    .trim()
    .replace(/\[[^\]/]{1,64}\]|\{[^}/]{1,64}\}|:\w{1,64}/g, ":p");
  // A loop, not /\/+$/: tried from each "/" of a long run, that expression is quadratic.
  let end = s.length;
  while (end > 0 && s[end - 1] === "/") end--;
  return s.slice(0, end);
}

/**
 * The handlers of a feature's API routes, from the items of facts/api.json: "GET /api/orders" names one method,
 * "/api/orders" every method of the route.
 * @param {{ api?: string[] }} feature
 * @param {Array<{ method: string, route: string, file: string, line?: number }>} apiItems
 * @returns {Array<{ file: string, line?: number }>}
 */
export function apiHandlers(feature, apiItems) {
  const wanted = (feature.api || []).map((a) => {
    const [first, ...rest] = String(a).trim().split(/\s+/);
    return rest.length
      ? { method: first.toUpperCase(), route: normalRoute(rest.join(" ")) }
      : { method: null, route: normalRoute(first) };
  });
  if (!wanted.length) return [];
  const routes = apiItems.map((item) => normalRoute(item.route));
  return apiItems.filter((item, k) =>
    wanted.some((w) => (!w.method || w.method === item.method) && w.route === routes[k]),
  );
}

/**
 * The kinds of behaviour card a candidate feature of `inventory --features` points to: those of the hints that sit in
 * a file of its segment (app/orders/page.tsx for "orders") or in a handler of one of its API routes.
 * @param {{ segment: string, api: string[] }} candidate
 * @param {Array<{ family: string, file: string }>} items   facts/behaviours.json items
 * @param {Array<{ method: string, route: string, file: string }>} apiItems   facts/api.json items
 * @returns {string[]}
 */
export function candidateKinds({ segment, api }, items, apiItems) {
  const handlers = new Set(apiHandlers({ api }, apiItems).map((h) => h.file));
  const s = String(segment).toLowerCase();
  const inSegment = (file) =>
    file
      .toLowerCase()
      .split("/")
      .some((part) => part === s || part.split(".")[0] === s);
  return kindsOfHints(items.filter((it) => handlers.has(it.file) || inSegment(it.file)));
}

/**
 * The lines of the behaviour hints that sit in one of `files`, by file.
 * @param {Array<{ file: string, line: number }>} items   facts/behaviours.json items
 * @param {Set<string>|string[]} files
 * @returns {Map<string, number[]>}
 */
export function behaviourLines(items, files) {
  const wanted = new Set(files);
  const out = new Map();
  for (const item of items)
    if (wanted.has(item.file)) (out.get(item.file) ?? out.set(item.file, []).get(item.file)).push(item.line);
  return out;
}
