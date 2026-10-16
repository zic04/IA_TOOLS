// Sources `api` and `screens` (ARCHITECTURE.md §6.9, §6.13): the routes and the screens of the application, read
// by the stack adapters (engine/facts/stacks.mjs, adapters/stack/: Next.js, Express, FastAPI… and the project's own),
// and the access of each from its guards, classified here with the project's patterns (`review.guards`).
//   api item: { method, route, file, line, framework, auth, guards } — line: 1-based line of the handler (decorator,
//   export or call).
//   screens item: { route, file, line, framework, auth?, guards? } — auth and guards when the router declares them.
// Also the helpers the other sources share: the line of an index, the content of a call.
import { BUILT_IN_STACKS, stackSources } from "./stacks.mjs";

/** 1-based line of a character index of a text. */
export const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// ─── Authentication of a route (ARCHITECTURE.md §6.13) ────────────────────────────────────────────────────────
// `auth` is classified from the `guards` found at the handler: "none" (no guard), "role" (a guard matching the
// role pattern, checked first), "user" (a guard matching the user pattern), "unknown" (a guard matching neither).
export const DEFAULT_ROLE_GUARD = /admin|role|permission|scope|owner|super|staff/i;
export const DEFAULT_USER_GUARD = /current_user|authenticated|login_required|require_auth|session|token/i;

/**
 * Guard patterns to classify `auth`, from `review.guards` (ARCHITECTURE.md §6.13: regular expressions as strings;
 * a non-empty list replaces the built-in pattern, joined with "|"). `review.guards` may be undefined.
 */
export function resolveGuardPatterns(guards = {}) {
  const role = guards?.role?.length ? new RegExp(guards.role.join("|"), "i") : DEFAULT_ROLE_GUARD;
  const user = guards?.user?.length ? new RegExp(guards.user.join("|"), "i") : DEFAULT_USER_GUARD;
  return { role, user };
}

/** `auth` of a route from its `guards` (the names found at the handler), against `patterns` (resolveGuardPatterns). */
export function classifyAuth(guards, patterns = {}) {
  if (!guards || !guards.length) return "none";
  const role = patterns.role ?? DEFAULT_ROLE_GUARD;
  const user = patterns.user ?? DEFAULT_USER_GUARD;
  if (guards.some((g) => role.test(g))) return "role";
  if (guards.some((g) => user.test(g))) return "user";
  return "unknown";
}

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
  const items = [];
  for (const { adapter, sources } of stackSources(appDir, stacks, "api"))
    for (const r of adapter.api({ sources })) {
      if (!complete(r, ["method", "route", "file"])) continue;
      const g = Array.isArray(r.guards) ? r.guards.filter((x) => typeof x === "string") : [];
      items.push({
        method: r.method,
        route: r.route,
        file: r.file,
        line: Number.isInteger(r.line) ? r.line : 1,
        framework: typeof r.framework === "string" ? r.framework : adapter.name,
        auth: classifyAuth(g, patterns),
        guards: g,
      });
    }
  return items.sort(byRoute);
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
  const items = [];
  for (const { adapter, sources } of stackSources(appDir, stacks, "screens"))
    for (const r of adapter.screens({ sources })) {
      if (!complete(r, ["route", "file"])) continue;
      const framework = typeof r.framework === "string" ? r.framework : adapter.name;
      const item = { route: r.route, file: r.file, line: Number.isInteger(r.line) ? r.line : 1, framework };
      const guards = Array.isArray(r.guards) ? r.guards.filter((x) => typeof x === "string") : null;
      if (guards) Object.assign(item, { auth: classifyAuth(guards, patterns), guards });
      items.push(item);
    }
  return items.sort(byRoute);
}
