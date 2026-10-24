// Sources `api` and `screens` (ARCHITECTURE.md §6.9, §6.13): the routes and the screens of the application, read
// by the stack adapters (engine/facts/stacks.mjs, adapters/stack/: Next.js, Express, FastAPI… and the project's own),
// and the access of each from its guards, classified with the project's patterns (`review.guards`) by
// engine/facts/guards.mjs.
//   api item: { method, route, file, line, framework, auth, guards } — line: 1-based line of the handler (decorator,
//   export or call).
//   screens item: { route, file, line, framework, auth?, guards? } — auth and guards when the router declares them.
// Also the helpers the other sources share: the line of an index, the content of a call.
import { BUILT_IN_STACKS, stackSources } from "./stacks.mjs";
import { routeWithoutSecrets } from "./behaviour-common.mjs";
import { MAX_GUARDS, MAX_ITEMS } from "./stack-common.mjs";
import { classifyAuth, resolveGuardPatterns } from "./guards.mjs";

/** 1-based line of a character index of a text. */
export const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** Content between the matching closing parenthesis of the "(" found at `openIndex`, not included. */
export function balancedParens(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return text.slice(openIndex + 1);
}

/** Whether an adapter's item has each of `keys` as a string (a project adapter may return anything: it is left out). */
const complete = (r, keys) => r && typeof r === "object" && keys.every((k) => typeof r[k] === "string");

/**
 * The items of the adapter that owns each declaration (a file and a line), each item once. Where nothing tells the
 * stack (no manifest), two of the kit's adapters may read one declaration — a `@router.get` is FastAPI's form and
 * Flask's — and give different routes for it (with or without its router's prefix): the adapter whose name the file
 * holds (`from fastapi import…`) owns it, else the one whose name another of its files holds, else the first in the
 * registry. One adapter's items on one line (a Rails `resources`, a mapping of two paths) are all kept, and a
 * project's adapter is never overruled: what it gives is what the project declared.
 * @param {Array<{ adapter: string, kit: boolean, mentions: number, item: any }>} found   in the registry's order;
 *   mentions: 2 the file names the adapter, 1 another of its files does, 0 none
 * @param {(item: any) => string} key   what makes two items one
 */
function owned(found, key) {
  const owner = new Map();
  for (const f of found.filter((x) => x.kit)) {
    const at = `${f.item.file}:${f.item.line}`;
    const o = owner.get(at);
    if (!o || (f.mentions > o.mentions && o.adapter !== f.adapter)) owner.set(at, f);
  }
  const seen = new Set();
  return found
    .filter((f) => !f.kit || owner.get(`${f.item.file}:${f.item.line}`).adapter === f.adapter)
    .filter((f) => !seen.has(`${f.adapter}\n${key(f.item)}`) && seen.add(`${f.adapter}\n${key(f.item)}`))
    .map((f) => f.item);
}

/** The kit's stack adapters themselves (a project's adapter is never one of them, whatever its name). */
const kitStacks = () => /** @type {Set<unknown>} */ (new Set(BUILT_IN_STACKS));

/**
 * How much an adapter's framework is named where a declaration is: 2 the file names it (its text holds the adapter's
 * name: fastapi, flask, express…), 1 another of the adapter's files does, 0 none.
 */
function namer(sources, adapter) {
  const cache = new Map();
  const names = (file) => (sources.get(file) ?? "").toLowerCase().includes(adapter.name);
  let anywhere = null;
  return (file) => {
    if (!cache.has(file)) {
      if (names(file)) cache.set(file, 2);
      else {
        anywhere ??= [...sources.keys()].some(names);
        cache.set(file, anywhere ? 1 : 0);
      }
    }
    return cache.get(file);
  };
}

/** The order of the items of both sources: route, then method, then file. */
const byRoute = (a, b) =>
  a.route.localeCompare(b.route) || (a.method ?? "").localeCompare(b.method ?? "") || a.file.localeCompare(b.file);

/**
 * The `api` source: the route handlers of every stack adapter that reads them.
 * @param {string} appDir
 * @param {object} [guards]   `review.guards` of the configuration (ARCHITECTURE.md §6.13): `{ role: string[],
 *   user: string[] }`, regular expressions as strings; replaces the built-in pattern when not empty.
 * @param {readonly import("./stacks.mjs").StackAdapter[]} [stacks]
 * @returns {Array<{method,route,file,line,framework,auth,guards}>} sorted by route then method
 */
export function collectApi(appDir, guards = {}, stacks = BUILT_IN_STACKS) {
  const patterns = resolveGuardPatterns(guards);
  const kit = kitStacks();
  const found = [];
  for (const { adapter, sources } of stackSources(appDir, stacks, "api")) {
    const mentions = namer(sources, adapter);
    let n = 0;
    // `guards`: the project's patterns, for an adapter that keeps a hook only when it guards (Flask's before_request).
    for (const r of adapter.api({ sources, guards: patterns })) {
      // The bounds of every adapter, the project's own too: MAX_ITEMS routes, MAX_GUARDS guards each.
      if (n === MAX_ITEMS) break;
      if (!complete(r, ["method", "route", "file"])) continue;
      n++;
      const g = Array.isArray(r.guards) ? r.guards.filter((x) => typeof x === "string").slice(0, MAX_GUARDS) : [];
      const item = {
        method: r.method,
        route: routeWithoutSecrets(r.route),
        file: r.file,
        line: Number.isInteger(r.line) ? r.line : 1,
        framework: typeof r.framework === "string" ? r.framework : adapter.name,
        auth: classifyAuth(g, patterns),
        guards: g,
      };
      found.push({ adapter: adapter.name, kit: kit.has(adapter), mentions: mentions(r.file), item });
    }
  }
  return owned(found, (i) => `${i.method} ${i.route} ${i.file}:${i.line}`).sort(byRoute);
}

/**
 * The `screens` source: the screens of every stack adapter that reads them (a front router, a page folder); their
 * access when the router declares guards (a route's canActivate, meta.requiresAuth…), else none is claimed.
 * @param {string} appDir
 * @param {object} [guards]   as for collectApi
 * @param {readonly import("./stacks.mjs").StackAdapter[]} [stacks]
 */
export function collectScreens(appDir, guards = {}, stacks = BUILT_IN_STACKS) {
  const patterns = resolveGuardPatterns(guards);
  const kit = kitStacks();
  const found = [];
  for (const { adapter, sources } of stackSources(appDir, stacks, "screens")) {
    const mentions = namer(sources, adapter);
    let n = 0;
    for (const r of adapter.screens({ sources })) {
      if (n === MAX_ITEMS) break;
      if (!complete(r, ["route", "file"])) continue;
      n++;
      const framework = typeof r.framework === "string" ? r.framework : adapter.name;
      const line = Number.isInteger(r.line) ? r.line : 1;
      const item = { route: routeWithoutSecrets(r.route), file: r.file, line, framework };
      const guards = Array.isArray(r.guards)
        ? r.guards.filter((x) => typeof x === "string").slice(0, MAX_GUARDS)
        : null;
      if (guards) Object.assign(item, { auth: classifyAuth(guards, patterns), guards });
      found.push({ adapter: adapter.name, kit: kit.has(adapter), mentions: mentions(r.file), item });
    }
  }
  return owned(found, (i) => `${i.route} ${i.file}:${i.line}`).sort(byRoute);
}
