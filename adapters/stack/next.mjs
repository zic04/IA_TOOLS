// Stack adapter of Next.js (ARCHITECTURE.md §5): the route handlers of the App Router (`route.ts|js` under app/ or
// src/app/: one item per exported method) and of `pages/api` (its `req.method` checks, else every method), with the
// session calls and role words of each handler (`auth (body)`: always "unknown"); the screens of the App Router
// (`page.*`) and of the Pages Router.
// Route groups and parallel slots add no segment; intercepting routes and private folders are not routes.
import { textIndex, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { partialGuard } from "../../engine/facts/guards.mjs";

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";
const EXPORT_FN = new RegExp(`export\\s{1,20}(?:async\\s{1,20})?function\\s{1,20}(${METHODS})\\s*\\(`, "g");
const EXPORT_CONST = new RegExp(`export\\s{1,20}const\\s{1,20}(${METHODS})\\s*[=:]`, "g");
/** A `pages/api` handler's method check. */
const REQ_METHOD = new RegExp(`req\\.method\\s*===?\\s*["'](${METHODS})["']`, "g");
const ROUTE_FILE = /(^|\/)route\.(ts|js|tsx|jsx)$/;
const PAGE_FILE = /(^|\/)page\.(ts|tsx|js|jsx|mdx)$/;
const SCRIPT = /\.(ts|tsx|js|jsx)$/;
/** A file of the Pages Router that is no screen: the application shell, the document, an error page. */
const PAGES_SHELL = /(^|\/)_(app|document|error)\.|(^|\/)(404|500)\./;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const NEXT_PATTERNS = Object.freeze({ EXPORT_FN, EXPORT_CONST, REQ_METHOD });

/**
 * Route of an App Router file (a `route.*` or `page.*`) relative to its app folder, or null (an intercepting route,
 * a private folder).
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

/** Route of a `pages/api/**` file, relative to the `pages/api` folder: `[id].ts` → `/api/[id]`, `index.ts` → the folder. */
export function pagesApiRouteOf(file) {
  const noExt = file.replace(/\.(ts|tsx|js|jsx)$/, "").replace(/(^|\/)index$/, "");
  return "/api" + (noExt ? "/" + noExt : "");
}

/** The exports of a route file, outside its comments: [{ method, start }] in text order. */
function exportsOf(source) {
  const index = textIndex(source, jsCommentRanges(source));
  const spans = [];
  for (const re of [EXPORT_FN, EXPORT_CONST])
    for (const m of source.matchAll(re)) if (!index.inComment(m.index)) spans.push({ method: m[1], start: m.index });
  return { index, spans: spans.sort((a, b) => a.start - b.start) };
}

/** Method → 1-based line of its export, for an App Router `route.ts|js` file (the first export wins). */
export function nextRouteHandlers(source) {
  const { index, spans } = exportsOf(source);
  const handlers = new Map();
  for (const s of spans) if (!handlers.has(s.method)) handlers.set(s.method, index.lineOf(s.start));
  return handlers;
}

/** HTTP methods exported by an App Router `route.ts|js` file. */
export const nextRouteMethods = (source) => [...nextRouteHandlers(source).keys()];

// Session calls and role words looked for in a handler's body (ARCHITECTURE.md §6.13): a lookup gives an anonymous
// caller nothing and refuses him nothing, and a role word may be a query of a table (`db.role.findMany()`), so each
// is a partial guard, "unknown" whatever the patterns (`auth (body)`, engine/facts/guards.mjs) — never "user" nor
// "role", whatever the handler returns.
/** @type {Array<[string, RegExp]>} */
const SESSION_CALLS = ["auth", "getServerSession", "getSession", "currentUser"].map((n) => [
  n,
  new RegExp(`\\b${n}\\s*\\(`),
]);
/** @type {Array<[string, RegExp]>} */
const ROLE_TOKENS = ["role", "isAdmin"].map((n) => [n, new RegExp(`\\b${n}\\b`, "i")]);

/** Guard names found in a piece of handler source (a session call, or a role word), each a partial guard. */
function guardsIn(body) {
  return [...SESSION_CALLS, ...ROLE_TOKENS].filter(([, re]) => re.test(body)).map(([n]) => partialGuard(n, "body"));
}

/**
 * Guard names per method, for every handler of an App Router `route.ts|js` file: the body of a handler is the text
 * between its own export and the next one (or the end of the file) — the usual one-handler-per-export file.
 */
export function nextHandlerGuards(source) {
  const { spans } = exportsOf(source);
  const guards = new Map();
  for (let i = 0; i < spans.length; i++) {
    if (guards.has(spans[i].method)) continue;
    const end = i + 1 < spans.length ? spans[i + 1].start : source.length;
    guards.set(spans[i].method, guardsIn(source.slice(spans[i].start, end)));
  }
  return guards;
}

/** HTTP methods a `pages/api` handler answers to (its req.method checks), else "ALL" (one export for every method). */
function pagesApiMethods(source) {
  const methods = new Set();
  for (const m of source.matchAll(REQ_METHOD)) methods.add(m[1]);
  return methods.size ? [...methods] : ["ALL"];
}

/** The folder among `candidates` that holds one of `files` (the first found), or null. */
const folderOf = (files, candidates) => candidates.find((c) => files.some((f) => f.startsWith(`${c}/`))) ?? null;

export default {
  name: "next",
  files: /^(?:src\/)?(?:app|pages)\/.{0,4000}\.(?:ts|tsx|js|jsx|mdx)$/,
  /** The route handlers: App Router route files, then `pages/api`. */
  api({ sources }) {
    const files = [...sources.keys()];
    const items = [];
    const app = folderOf(files, ["app", "src/app"]);
    if (app)
      for (const file of files.filter((f) => f.startsWith(`${app}/`) && ROUTE_FILE.test(f))) {
        const route = nextAppRouteOf(file.slice(app.length + 1));
        if (route === null) continue;
        const source = sources.get(file);
        const guards = nextHandlerGuards(source);
        for (const [method, line] of nextRouteHandlers(source))
          items.push({ method, route, file, line, framework: "next-app-router", guards: guards.get(method) || [] });
      }
    const pagesApi = folderOf(files, ["pages/api", "src/pages/api"]);
    if (pagesApi)
      for (const file of files.filter((f) => f.startsWith(`${pagesApi}/`) && SCRIPT.test(f))) {
        const source = sources.get(file);
        const guards = guardsIn(source);
        for (const method of pagesApiMethods(source))
          items.push({
            method,
            route: pagesApiRouteOf(file.slice(pagesApi.length + 1)),
            file,
            line: 1,
            framework: "next-pages-api",
            guards,
          });
      }
    return items;
  },
  /** The screens: App Router pages, then the Pages Router (its API, shell and error pages left out). */
  screens({ sources }) {
    const files = [...sources.keys()];
    const items = [];
    const app = folderOf(files, ["app", "src/app"]);
    if (app)
      for (const file of files.filter((f) => f.startsWith(`${app}/`) && PAGE_FILE.test(f))) {
        const route = nextAppRouteOf(file.slice(app.length + 1));
        if (route !== null) items.push({ route, file, line: 1, framework: "next-app-router" });
      }
    const pages = folderOf(files, ["pages", "src/pages"]);
    if (pages)
      for (const file of files.filter((f) => f.startsWith(`${pages}/`) && /\.(tsx|jsx|js|ts|mdx)$/.test(f))) {
        const rel = file.slice(pages.length + 1);
        if (rel.startsWith("api/") || PAGES_SHELL.test(rel)) continue;
        const route = "/" + rel.replace(/\.(tsx|jsx|js|ts|mdx)$/, "").replace(/(^|\/)index$/, "");
        items.push({ route: route === "/" ? "/" : route.replace(/\/$/, ""), file, line: 1, framework: "next-pages" });
      }
    return items;
  },
};
