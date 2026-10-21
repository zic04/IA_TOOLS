// Stack adapter of FastAPI (ARCHITECTURE.md §5, §6.13): the `@<router>.<method>("/path")` decorators (and
// `.websocket`, method "WS"), composed with the `APIRouter(prefix=…)` of the same file and the
// `include_router(…, prefix=…)` that mounts it; the guards are the `Depends(…)` of the handler's own signature, of
// its router and of its inclusion. A decorator in a comment or a docstring (an example) is no route.
// Shared with the `fastapi` coverage adapter and with sync (engine/sync/routes.mjs).
import { textIndex, pyCommentRanges, callSpan } from "../../engine/facts/behaviour-common.mjs";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
/** A router of the file: `name = APIRouter(`, from the start of a name (bounded). */
const ROUTER = /\b(\w{1,64})\s*=\s*APIRouter\(/g;
const INCLUDE = /include_router\(/g;
const PREFIX = /prefix\s*=\s*["']([^"']{0,500})["']/;
/** What `include_router(` mounts: `name` or `module.name`. */
const INCLUDED = /^\s*(\w{1,64})(?:\.(\w{1,64}))?/;
const DEPENDS = /Depends\(\s*([A-Za-z_][\w.]{0,120})/g;
const DECORATOR = new RegExp(`@(\\w{1,64})\\.(${METHODS.join("|")}|websocket)\\(\\s*["']([^"']{0,500})["']`, "g");
/** A function, its "(" ending the match: the one a decorator applies to is the first after the decorator's own call. */
const DEF = /\bdef\s{1,20}\w{1,120}\s*\(/g;
/** At most this many characters between a decorator's call and its function (the other decorators between). */
const DEF_GAP = 2000;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const FASTAPI_PATTERNS = Object.freeze({ ROUTER, INCLUDE, PREFIX, INCLUDED, DEPENDS, DECORATOR, DEF });

/** Leading identifiers of every `Depends(name…)` of a piece of text (a signature, a call's arguments). */
const dependsNames = (text) => [...text.matchAll(DEPENDS)].map((m) => m[1]);

/**
 * Each call of `re` (a global expression ending with "(") with its arguments (4,000 characters at most; "" when it
 * does not close): the next call is looked for after them, so that a file of unclosed calls is walked once.
 * @param {RegExp} re
 * @param {string} text
 * @returns {Generator<{ m: RegExpExecArray, args: string }>}
 */
function* callsOf(re, text) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const span = callSpan(text, m.index + m[0].length - 1, 4000, "py");
    re.lastIndex = Math.max(re.lastIndex, span.end);
    yield { m, args: span.args };
  }
}

/** The routers of one file: name → { prefix, guards }. */
function routersOf(text) {
  const own = new Map();
  for (const { m, args } of callsOf(ROUTER, text))
    own.set(m[1], { prefix: PREFIX.exec(args)?.[1] ?? "", guards: dependsNames(args) });
  return own;
}

/**
 * The prefixes and guards given where a router is included: file → { prefix, guards }. `include_router(x.name,
 * prefix=…)` names the file of stem `x`; the bare form `include_router(name, …)` the one file that declares `name`
 * (when there are several, it is left unresolved rather than guessed).
 */
function inclusions(sources, ownRouters) {
  const stem = (f) => f.split("/").pop().replace(/\.py$/, "");
  const fileOfStem = new Map([...sources.keys()].map((f) => [stem(f), f]));
  const declaring = new Map();
  for (const [file, own] of ownRouters)
    for (const name of own.keys()) declaring.set(name, [...(declaring.get(name) || []), file]);
  const extra = new Map();
  for (const text of sources.values())
    for (const { args } of callsOf(INCLUDE, text)) {
      const head = INCLUDED.exec(args);
      if (!head) continue;
      const [, first, second] = head;
      const file = second ? fileOfStem.get(first) : declaring.get(first)?.length === 1 ? declaring.get(first)[0] : null;
      if (!file) continue;
      const was = extra.get(file) || { prefix: "", guards: [] };
      extra.set(file, {
        prefix: was.prefix + (PREFIX.exec(args)?.[1] ?? ""),
        guards: [...was.guards, ...dependsNames(args)],
      });
    }
  return extra;
}

/**
 * The signature guards of each function of a file, by the index of its "def": the `Depends(…)` of its arguments,
 * read up to the next function at most (each read once), and a finder of the function a decorator applies to — the
 * first one after the decorator's own call, DEF_GAP characters away at most (a binary search).
 * @param {string} text
 * @param {{ inComment: (i: number) => boolean }} index
 */
function functionsOf(text, index) {
  const defs = [...text.matchAll(DEF)].filter((m) => !index.inComment(m.index));
  const guards = defs.map((m, k) => {
    const open = m.index + m[0].length - 1;
    const next = k + 1 < defs.length ? defs[k + 1].index : text.length;
    return dependsNames(callSpan(text, open, Math.min(4000, next - open), "py").args);
  });
  return (from) => {
    let lo = 0;
    let hi = defs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (defs[mid].index < from) lo = mid + 1;
      else hi = mid;
    }
    return lo < defs.length && defs[lo].index - from <= DEF_GAP ? guards[lo] : [];
  };
}

/**
 * The FastAPI routes of a set of Python files (file → text): { method, route, file, line, guards }, sorted by route,
 * method and file. A router's prefix is resolved per file (each router module names its variable `router`). A
 * decorator's own call is read up to the next decorator at most, its function looked for after it.
 * @param {Map<string, string>} sources
 */
export function fastapiRoutes(sources) {
  const ownRouters = new Map([...sources].map(([file, text]) => [file, routersOf(text)]));
  const extra = inclusions(sources, ownRouters);
  const items = [];
  for (const [file, text] of sources) {
    const own = ownRouters.get(file);
    const included = extra.get(file) || { prefix: "", guards: [] };
    const index = textIndex(text, pyCommentRanges(text, { docstrings: true }));
    const signatureOf = functionsOf(text, index);
    const decorators = [...text.matchAll(DECORATOR)].filter((m) => !index.inComment(m.index));
    for (const [k, m] of decorators.entries()) {
      const [, obj, verb, path] = m;
      const router = obj === "app" ? null : own.get(obj);
      const base = obj === "app" ? "" : included.prefix + (router?.prefix || "");
      const route = (base + path).replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1") || "/";
      const open = m.index + m[0].indexOf("(");
      const next = k + 1 < decorators.length ? decorators[k + 1].index : text.length;
      const after = callSpan(text, open, Math.min(4000, next - open), "py").end;
      const guards = [...new Set([...signatureOf(after), ...(router?.guards || []), ...included.guards])];
      const method = verb === "websocket" ? "WS" : verb.toUpperCase();
      items.push({ method, route, file, line: index.lineOf(m.index), framework: "fastapi", guards });
    }
  }
  return items.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

export default {
  name: "fastapi",
  files: /\.py$/,
  marker: /APIRouter\(|@\w{1,64}\.(?:get|post|put|patch|delete|head|options|websocket)\(/,
  api: ({ sources }) => fastapiRoutes(sources),
};
