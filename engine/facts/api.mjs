// `api` source (ARCHITECTURE.md §6.9) and the parsers shared with the `fastapi` coverage adapter and the `api`
// option of the `next-app-router` coverage adapter (adapters/coverage/*.mjs): Next.js App Router route handlers,
// Next.js `pages/api`, FastAPI decorators (with `APIRouter(prefix)` and `include_router(prefix)`), Express.
//   item: { method, route, file, line, framework, auth, guards } — line: 1-based line of the handler (decorator,
//   export or call); auth/guards: ARCHITECTURE.md §6.13, the static access matrix.
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const ROUTE_FILE = /(^|\/)route\.(ts|js|tsx|jsx)$/;
const PAGE_FILE = /(^|\/)page\.(ts|tsx|js|jsx|mdx)$/;

/** 1-based line of a character index of a text. */
export const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// ─── Strings and comments (ARCHITECTURE.md §6.9/§6.13) ────────────────────────────────────────────────────────
// A route-looking decorator or call found inside a comment or a docstring is a false positive (a commented-out
// route, or example text quoted in a Python docstring): heuristic ranges, not a full parser — good enough to
// discard the usual case, in the spirit of the rest of this file. A decorator's own route argument (a normal
// quoted string right after the call) is never masked: only comments and multi-line/triple-quoted strings are.

/** Character ranges `[start, end)` of a Python source that are comments or triple-quoted strings. */
export function pythonNonCodeRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(/("""|''')[\s\S]*?\1/g)) ranges.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(/#.*$/gm)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/** Character ranges `[start, end)` of a JS/TS source that are line or block comments. */
export function jsNonCodeRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) ranges.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(/(?<!:)\/\/.*$/gm)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/** Whether `index` falls inside one of `ranges` (pairs `[start, end)`), i.e. in a string or a comment. */
export function inNonCodeRange(ranges, index) {
  return ranges.some(([a, b]) => index >= a && index < b);
}

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

/**
 * Route of a Next.js App Router file (a `route.*` or `page.*`), folded like `adapters/coverage/next-app-router.mjs`
 * (route groups and parallel slots add no segment; intercepting routes and private folders are not routes).
 */
export function nextAppRouteOf(file) {
  const out = [];
  for (const s of file.split("/").slice(0, -1)) {
    if (/^\(\.{1,3}\)/.test(s)) return null;
    if (s.startsWith("_")) return null;
    if (/^\(.*\)$/.test(s) || s.startsWith("@")) continue;
    out.push(s);
  }
  return "/" + out.join("/");
}

const EXPORT_FN_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
const EXPORT_CONST_RE = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[=:]/g;

/** HTTP methods exported by a Next.js App Router `route.ts|js` file. */
export function nextRouteMethods(source) {
  return [...nextRouteHandlers(source).keys()];
}

/** Method → 1-based line of its export, for a Next.js App Router `route.ts|js` file (the first export wins). */
export function nextRouteHandlers(source) {
  const handlers = new Map();
  for (const re of [EXPORT_FN_RE, EXPORT_CONST_RE])
    for (const m of source.matchAll(re)) if (!handlers.has(m[1])) handlers.set(m[1], lineAt(source, m.index));
  return handlers;
}

// Session calls and role checks looked for in a Next.js route handler's body (ARCHITECTURE.md §6.13).
const NEXT_SESSION_CALLS = ["auth", "getServerSession", "getSession", "currentUser"];
const NEXT_ROLE_TOKENS = ["role", "isAdmin"];

/** Guard names found in a piece of Next.js handler source (a session call, or a role check). */
function nextGuardsIn(body) {
  const guards = [];
  for (const name of NEXT_SESSION_CALLS) if (new RegExp(`\\b${name}\\s*\\(`).test(body)) guards.push(name);
  for (const name of NEXT_ROLE_TOKENS) if (new RegExp(`\\b${name}\\b`, "i").test(body)) guards.push(name);
  return guards;
}

/**
 * Guard names per method, for every handler of a Next.js App Router `route.ts|js` file: the body of a handler is
 * taken as the text between its own export and the next one (or the end of the file) — simple and good enough for
 * the usual one-handler-per-export file.
 */
export function nextHandlerGuards(source) {
  const spans = [];
  for (const re of [EXPORT_FN_RE, EXPORT_CONST_RE]) for (const m of source.matchAll(re)) spans.push({ method: m[1], start: m.index });
  spans.sort((a, b) => a.start - b.start);
  const guards = new Map();
  for (let i = 0; i < spans.length; i++) {
    if (guards.has(spans[i].method)) continue;
    const end = i + 1 < spans.length ? spans[i + 1].start : source.length;
    guards.set(spans[i].method, nextGuardsIn(source.slice(spans[i].start, end)));
  }
  return guards;
}

/** Route of a `pages/api/**` file, relative to the `pages/api` folder: `[id].ts` → `/api/[id]`, `index.ts` → the folder. */
export function pagesApiRouteOf(file) {
  const noExt = file.replace(/\.(ts|tsx|js|jsx)$/, "").replace(/(^|\/)index$/, "");
  return "/api" + (noExt ? "/" + noExt : "");
}

/** HTTP methods a `pages/api` handler answers to (req.method checks), else "ALL" (one default export for every method). */
export function pagesApiMethods(source) {
  const methods = new Set();
  for (const m of source.matchAll(/req\.method\s*===?\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']/g)) methods.add(m[1]);
  return methods.size ? [...methods] : ["ALL"];
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

/** Leading identifiers of every `Depends(name…)` found in a piece of text (a function signature, a kwarg list). */
function dependsNames(text) {
  const names = [];
  for (const m of text.matchAll(/Depends\(\s*([A-Za-z_][\w.]*)/g)) names.push(m[1]);
  return names;
}

/** Splits a call's arguments on top-level commas (depth-aware, strings are not split). */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let cur = "";
  let inStr = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      cur += c;
      if (c === inStr && text[i - 1] !== "\\") inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      cur += c;
      continue;
    }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/**
 * FastAPI routes of a set of Python files. `APIRouter(prefix=…)` is resolved PER FILE (every router module
 * conventionally names its variable `router`, so a global, cross-file map would mix up unrelated routers); a
 * `@name.<method>("…")` decorator is composed with the prefix declared in the SAME file.
 * `include_router(x.name, prefix=…)` (the common form when several routers are mounted from one place) adds its
 * own prefix to the file named `x` (matched by file stem, `routers/x.py`); the bare form `include_router(name,
 * prefix=…)` adds it to the one file that declares `name`, when there is exactly one (ambiguous otherwise, so
 * left unresolved rather than guessed).
 * `auth`/`guards` (ARCHITECTURE.md §6.13): the `Depends(…)` of the handler's own signature, plus the
 * `dependencies=[Depends(…)]` of the `APIRouter(…)` that declares it and of the `include_router(…)` that mounts it.
 */
export function fastapiRoutes(sources, patterns = {}) {
  const stem = (f) => f.split("/").pop().replace(/\.py$/, "");
  const fileOfStem = new Map([...sources.keys()].map((f) => [stem(f), f]));
  const ownPrefix = new Map(); // file -> Map(varName -> { prefix, guards })
  const varFiles = new Map(); // varName -> files that declare it (to resolve an unambiguous bare include)
  for (const [file, text] of sources) {
    const own = new Map();
    for (const m of text.matchAll(/(\w+)\s*=\s*APIRouter\(/g)) {
      const args = balancedParens(text, m.index + m[0].length - 1);
      const p = /prefix\s*=\s*["']([^"']*)["']/.exec(args);
      own.set(m[1], { prefix: p ? p[1] : "", guards: dependsNames(args) });
      varFiles.set(m[1], [...(varFiles.get(m[1]) || []), file]);
    }
    ownPrefix.set(file, own);
  }
  const extraPrefix = new Map(); // file -> extra prefix given where its router was included
  const extraGuards = new Map(); // file -> extra guard names given where its router was included
  for (const text of sources.values())
    for (const m of text.matchAll(/include_router\(/g)) {
      const args = balancedParens(text, m.index + m[0].length - 1);
      const head = /^\s*(\w+)(?:\.(\w+))?/.exec(args);
      if (!head) continue;
      const [, first, second] = head;
      const file = second ? fileOfStem.get(first) : (varFiles.get(first) || []).length === 1 ? varFiles.get(first)[0] : null;
      if (!file) continue;
      const prefix = /prefix\s*=\s*["']([^"']*)["']/.exec(args);
      if (prefix) extraPrefix.set(file, (extraPrefix.get(file) || "") + prefix[1]);
      const guards = dependsNames(args);
      if (guards.length) extraGuards.set(file, [...(extraGuards.get(file) || []), ...guards]);
    }
  const methodRe = new RegExp(`@(\\w+)\\.(${HTTP_METHODS.map((m) => m.toLowerCase()).join("|")})\\(\\s*["']([^"']*)["']`, "g");
  // WebSocket routes (ARCHITECTURE.md §6.13): `@app.websocket(...)` / `@router.websocket(...)`, method "WS".
  const websocketRe = /@(\w+)\.websocket\(\s*["']([^"']*)["']/g;
  const items = [];
  for (const [file, text] of sources) {
    const own = ownPrefix.get(file);
    const extra = extraPrefix.get(file) || "";
    const nonCode = pythonNonCodeRanges(text);
    const push = (m, obj, method, route) => {
      if (inNonCodeRange(nonCode, m.index)) return; // a string or a comment (a docstring example, commented-out route)
      const router = obj === "app" ? null : own.get(obj);
      const base = obj === "app" ? "" : extra + (router?.prefix || "");
      const full = (base + route).replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1") || "/";
      const defMatch = /\bdef\s+\w+\s*\(/.exec(text.slice(m.index));
      const sigGuards = defMatch ? dependsNames(balancedParens(text, m.index + defMatch.index + defMatch[0].length - 1)) : [];
      const guards = [...new Set([...sigGuards, ...(router?.guards || []), ...(extraGuards.get(file) || [])])];
      items.push({ method, route: full, file, line: lineAt(text, m.index), framework: "fastapi", auth: classifyAuth(guards, patterns), guards });
    };
    for (const m of text.matchAll(methodRe)) push(m, m[1], m[2].toUpperCase(), m[3]);
    for (const m of text.matchAll(websocketRe)) push(m, m[1], "WS", m[2]);
  }
  return items.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file));
}

/**
 * Express routes of a source file: `app.<method>("/path", …middleware, handler)`, `.ws(...)` included
 * (`express-ws`, method "WS" — ARCHITECTURE.md §6.13). `auth`/`guards`: the middleware names between the path
 * and the handler. A match inside a comment (a docstring-like block, a commented-out route) is ignored.
 */
export function expressRoutes(source, file, patterns = {}) {
  const items = [];
  const nonCode = jsNonCodeRanges(source);
  const re = /\b(?:app|router)\.(get|post|put|patch|delete|head|options|all|ws)\(/g;
  for (const m of source.matchAll(re)) {
    if (inNonCodeRange(nonCode, m.index)) continue;
    const args = splitArgs(balancedParens(source, m.index + m[0].length - 1));
    const routeMatch = /^["'`]([^"'`]+)["'`]/.exec(args[0] || "");
    if (!routeMatch) continue; // not a literal path: out of scope (ARCHITECTURE.md §6.9)
    const guards = args
      .slice(1, -1)
      .map((a) => /^([A-Za-z_][\w.]*)/.exec(a)?.[1])
      .filter(Boolean);
    items.push({ method: m[1].toUpperCase(), route: routeMatch[1], file, line: lineAt(source, m.index), framework: "express", auth: classifyAuth(guards, patterns), guards });
  }
  return items;
}

/** The first existing folder among `candidates` (relative to `appDir`), or null. */
function firstFolder(appDir, candidates) {
  return candidates.find((c) => fs.existsSync(path.join(appDir, c))) ?? null;
}

/**
 * The `api` source: Next.js App Router route handlers, Next.js `pages/api`, FastAPI decorators, Express routes.
 * @param {object} [guards]   `review.guards` of the configuration (ARCHITECTURE.md §6.13): `{ role: string[],
 *   user: string[] }`, regular expressions as strings; replaces the built-in pattern when not empty.
 * @returns {Array<{method,route,file,line,framework,auth,guards}>} sorted by route then method
 */
export function collectApi(appDir, guards = {}) {
  const patterns = resolveGuardPatterns(guards);
  const items = [];

  const appFolder = firstFolder(appDir, ["app", "src/app"]);
  if (appFolder)
    for (const rel of listFiles(path.join(appDir, appFolder)).filter((f) => ROUTE_FILE.test(f))) {
      const route = nextAppRouteOf(rel);
      if (route === null) continue;
      const file = `${appFolder}/${rel}`;
      const source = fs.readFileSync(path.join(appDir, file), "utf8");
      const handlerGuards = nextHandlerGuards(source);
      for (const [method, line] of nextRouteHandlers(source)) {
        const g = handlerGuards.get(method) || [];
        items.push({ method, route, file, line, framework: "next-app-router", auth: classifyAuth(g, patterns), guards: g });
      }
    }

  const pagesApi = firstFolder(appDir, ["pages/api", "src/pages/api"]);
  if (pagesApi)
    for (const rel of listFiles(path.join(appDir, pagesApi)).filter((f) => PAGE_FILE.test(f) || /\.(ts|tsx|js|jsx)$/.test(f))) {
      const file = `${pagesApi}/${rel}`;
      const source = fs.readFileSync(path.join(appDir, file), "utf8");
      const g = nextGuardsIn(source);
      for (const method of pagesApiMethods(source))
        items.push({ method, route: pagesApiRouteOf(rel), file, line: 1, framework: "next-pages-api", auth: classifyAuth(g, patterns), guards: g });
    }

  const pyFiles = listFiles(appDir).filter((f) => f.endsWith(".py"));
  const pySources = new Map(pyFiles.filter((f) => /APIRouter\(|@\w+\.(get|post|put|patch|delete|head|options|websocket)\(/.test(fs.readFileSync(path.join(appDir, f), "utf8"))).map((f) => [f, fs.readFileSync(path.join(appDir, f), "utf8")]));
  items.push(...fastapiRoutes(pySources, patterns));

  for (const rel of listFiles(appDir).filter((f) => /\.(js|ts|mjs|cjs)$/.test(f) && !ROUTE_FILE.test(f))) {
    const text = fs.readFileSync(path.join(appDir, rel), "utf8");
    if (!/\b(?:app|router)\.(get|post|put|patch|delete|head|options|all|ws)\(/.test(text)) continue;
    items.push(...expressRoutes(text, rel, patterns));
  }

  return items.sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file));
}
