// Stack adapter of Go web servers (ARCHITECTURE.md §5, §6.9), one file at a time: net/http (`http.HandleFunc("/x",
// h)`, `mux.Handle(…)`, the Go 1.22 patterns "GET /orders/{id}"), gorilla/mux (`.HandleFunc(…).Methods("GET")`,
// `s := r.PathPrefix("/api").Subrouter()`), gin (`r.GET("/orders", mw, h)`, `api := r.Group("/api", mw)`), echo
// (`e.GET("/orders", h, mw)`, `g := e.Group("/admin", mw)`) and chi (`r.Get(…)`, `r.Route("/orders", func(r
// chi.Router) {…})`, `r.Group(func(r chi.Router) {…})`, `r.With(mw).Get(…)`, `r.Mount("/admin", adminRouter())` of a
// function of the same file). The guards are the middleware names given to the route, to its groups and to the
// `Use(…)` of its router before it (gin copies them when a group is made), and, for net/http, the wrappers around a
// handler whose name says so (`requireAuth(h)`); logging, recovery, CORS and the like are no guards. The behaviour
// hints: the query parameters read (`c.Query("q")`, `r.URL.Query().Get("q")`), gorm's `.Order("created_at desc")`,
// `.Limit(20)`, `.Offset(n)` and the SQL of its `.Where("name LIKE ?", …)` (engine/facts/behaviour-sql.mjs).
import { textIndex, jsCommentRanges, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import { sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

const UPPER = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any";
const CHI = "Get|Post|Put|Patch|Delete|Head|Options|Connect|Trace";
const HANDLE = "Handle|HandleFunc|Method|MethodFunc";
const CALL = new RegExp(
  `\\b([A-Za-z_]\\w{0,63})\\.(${UPPER}|${CHI}|${HANDLE}|Group|Route|Use|With|Mount|PathPrefix)\\(`,
  "g",
);
/** A route call chained right after `With(…)`: `r.With(mw).Get(…)`. */
const CHAINED = new RegExp(`^\\.(${UPPER}|${CHI}|${HANDLE})\\(`);
const LITERAL = /^\s{0,200}(?:"([^"\n]{0,500})"|`([^`]{0,500})`)/;
/** The variable a group is assigned to, on the 100 characters before its call: `api := r.Group(`. */
const ASSIGNED = /([A-Za-z_]\w{0,63})\s{0,20}:?=\s{0,20}$/;
const SUBROUTER = /^\.Subrouter\(\)/;
const METHODS_AFTER = /^\s{0,20}\.Methods\(([^)]{0,200})\)/;
const QUOTED = /"([A-Za-z]{3,7})"/g;
const FUNC_PARAM = /^\s{0,200}func\s{0,20}\(\s{0,20}([A-Za-z_]\w{0,63})/;
const FUNC = /\bfunc\s{1,20}([A-Za-z_]\w{0,63})\s{0,20}\(/g;
/** A router made by a function call: `adminRouter()`. */
const CALLED = /^\s{0,200}([A-Za-z_]\w{0,63})\(\s{0,20}\)/;
const MIDDLEWARE = /^\s{0,200}([A-Za-z_][\w.]{0,120})/;
const WRAPPER = /^\s{0,200}([A-Za-z_][\w.]{0,120})\(/;
/** A net/http pattern: "[METHOD ][HOST]/PATH". */
const PATTERN = /^(?:([A-Z]{3,7})\s{1,20})?[^/\s]{0,200}(\/\S{0,500})?$/;
/** A net/http wrapper whose name says it guards (auth, session, role, admin…). */
const GUARDISH = /auth|login|session|token|jwt|role|admin|perm|guard|protect|require|acl|polic|verif/i;
const QUERY =
  /\.(?:Query|DefaultQuery|QueryParam|GetQuery|QueryArray|FormValue)\(\s{0,20}"(\w{1,40})"(?:\s{0,20},\s{0,20}"(\d{1,6})")?/g;
const URL_QUERY = /\.URL\.Query\(\)\.Get\(\s{0,20}"(\w{1,40})"/g;
const ORDER = /\.Order\(\s{0,20}"([A-Za-z_][\w.]{0,63})(?:\s{1,20}(asc|desc|ASC|DESC))?"/g;
const LIMIT = /(?<!rate)\.(Limit|Offset)\(\s{0,20}(\d{1,6})?/g;
/** An HTTP method written as a literal: `Handle("GET", …)`. */
const METHOD_WORD = /^[A-Za-z]{3,7}$/;
/** Slashes side by side in a route composed of a prefix and a path. */
const SLASHES = /\/{2,}/g;
const BLANKS = /\s+/;
const FRAMEWORKS = Object.entries({
  gin: /gin-gonic\/gin/,
  echo: /labstack\/echo/,
  chi: /go-chi\/chi/,
  "gorilla/mux": /gorilla\/mux/,
});

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const GO_PATTERNS = Object.freeze({
  ...{ CALL, CHAINED, LITERAL, ASSIGNED, SUBROUTER, METHODS_AFTER, QUOTED, FUNC_PARAM, FUNC, CALLED, MIDDLEWARE },
  ...{ WRAPPER, PATTERN, GUARDISH, QUERY, URL_QUERY, ORDER, LIMIT, METHOD_WORD, SLASHES, BLANKS },
  ...Object.fromEntries(FRAMEWORKS.map(([name, re]) => [`FRAMEWORK_${name}`, re])),
});

/** The order of the items: route, method, file. */
const byRoute = (a, b) =>
  a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file);

/** Middleware that never guards a route (by its full name, or its last segment). */
const NOT_GUARDS = new Set(
  `func Logger LoggerWithConfig Recovery Recover Recoverer CORS CORSWithConfig RequestID RealIP Timeout
  TimeoutWithConfig Compress Gzip GzipWithConfig StripSlashes RedirectSlashes Heartbeat NoCache BodyLimit CleanPath
  Throttle SetHeader AllowContentType ContentCharset GetHead URLFormat Static Decompress Secure RequestLogger
  RequestLoggerWithConfig cors.Default cors.New cors.AllowAll cors.Handler gzip.Gzip`.split(BLANKS),
);

/**
 * The middleware names of arguments (`AuthRequired()`, `middleware.BasicAuth(…)`), those of NOT_GUARDS left out,
 * MAX_GUARDS at most.
 */
const namesOf = (args) =>
  withGuards(
    [],
    args
      .map((a) => MIDDLEWARE.exec(a)?.[1])
      .filter((n) => n && !NOT_GUARDS.has(n) && !NOT_GUARDS.has(n.slice(n.lastIndexOf(".") + 1))),
  );

/** The value of a literal argument, or undefined. */
const literal = (arg) => {
  const m = LITERAL.exec(arg || "");
  return m ? (m[1] ?? m[2]) : undefined;
};

/** Where the string or rune that starts at `i` ends: its closing quote (a "…" or '…' ends at its line too). */
function quoteEnd(text, i) {
  const c = text[i];
  if (c === "`") {
    const e = text.indexOf("`", i + 1);
    return e === -1 ? text.length : e;
  }
  let k = i + 1;
  for (; k < text.length && text[k] !== c && text[k] !== "\n"; k++) if (text[k] === "\\") k++;
  return k;
}

/** Where the string, rune or comment that starts at `i` ends (its last character), or -1 when none starts there. */
function skipped(text, i) {
  const c = text[i];
  if (c === "`" || c === '"' || c === "'") return quoteEnd(text, i);
  if (c !== "/" || (text[i + 1] !== "/" && text[i + 1] !== "*")) return -1;
  const e = text.indexOf(text[i + 1] === "/" ? "\n" : "*/", i + 2);
  return e === -1 ? text.length : text[i + 1] === "/" ? e - 1 : e + 1;
}

/** The index of the bracket that closes each "(", "[" and "{" of a text (-1: none), by one walk. */
function closings(text) {
  const close = new Int32Array(text.length).fill(-1);
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const skip = skipped(text, i);
    const c = text[i];
    if (skip !== -1) i = skip;
    else if (c === "(" || c === "[" || c === "{") stack.push(i);
    else if ((c === ")" || c === "]" || c === "}") && stack.length) close[stack.pop()] = i;
  }
  return close;
}

/** The arguments of a call, split on its top-level commas, its comments left out. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const skip = skipped(text, i);
    if (skip !== -1) {
      if (c !== "/") current += text.slice(i, skip + 1);
      i = skip;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The guards of a net/http handler: the wrappers around it whose name says they guard (5 deep at most). */
function wrappers(arg) {
  const out = [];
  let rest = arg || "";
  for (let depth = 0; depth < 5; depth++) {
    const w = WRAPPER.exec(rest);
    if (!w) break;
    if (!w[1].startsWith("http.") && GUARDISH.test(w[1])) out.push(w[1]);
    rest = rest.slice(w[0].length);
  }
  return out;
}

/** `Handle("GET", "/x", h)` (gin), `Method("GET", "/x", h)` (chi): a method and a path as literals; else null. */
function methodRoute(args, framework) {
  const method = literal(args[0]);
  const path = literal(args[1]);
  if (!METHOD_WORD.test(method || "") || path === undefined) return null;
  return { methods: [method.toUpperCase()], path, guards: framework === "gin" ? namesOf(args.slice(2, -1)) : [] };
}

/** `HandleFunc("GET /orders/{id}", h)` (net/http, gorilla, chi): a pattern, the guards of the handler's wrappers. */
function patternRoute(args) {
  const p = PATTERN.exec(literal(args[0]) ?? "");
  return p?.[2] ? { methods: [p[1] || "ANY"], path: p[2], guards: wrappers(args[1]) } : null;
}

/** `r.GET("/x", mw, h)` (gin), `e.GET("/x", h, mw)` (echo), `r.Get("/x", h)` (chi); null for an HTTP client call. */
function verbRoute(verb, receiver, args, framework) {
  const path = literal(args[0]);
  if (receiver === "http" || path === undefined || (path !== "" && !path.startsWith("/"))) return null;
  const guards = framework === "echo" ? namesOf(args.slice(2)) : framework === "gin" ? namesOf(args.slice(1, -1)) : [];
  return { methods: [verb === "Any" ? "ANY" : verb.toUpperCase()], path, guards };
}

/** A route call's methods, path and own guards, or null. */
function routeOf(verb, receiver, args, framework) {
  if (verb === "Method" || verb === "MethodFunc") return methodRoute(args, framework);
  if (verb === "Handle" || verb === "HandleFunc") return methodRoute(args, framework) ?? patternRoute(args);
  return verbRoute(verb, receiver, args, framework);
}

/** The handlers of the calls of CALL by their verb: each adds what the call declares to the model of the file. */
const DECLARES = {
  Use: (c, model) => model.uses.push({ at: c.at, receiver: c.receiver, names: namesOf(c.args) }),
  Mount(c, model) {
    const fn = CALLED.exec(c.args[1] || "")?.[1];
    if (fn) model.mounts.push({ at: c.at, receiver: c.receiver, prefix: literal(c.args[0]) ?? "", fn });
  },
  Route: (c, model) => scope(c, model, c.args[1], literal(c.args[0]) ?? ""),
  Group: (c, model) => scope(c, model, c.args[0], "") || group(c, model),
  PathPrefix: (c, model) => SUBROUTER.test(c.text.slice(c.end + 1, c.end + 20)) && group(c, model),
  With(c, model) {
    const chained = CHAINED.exec(c.text.slice(c.end + 1, c.end + 40));
    const open = c.end + (chained?.[0].length ?? 0);
    const route = chained && routeOf(chained[1], c.receiver, c.argsAt(open).args, c.framework);
    if (route)
      model.routes.push({
        ...route,
        at: c.at,
        receiver: c.receiver,
        guards: withGuards(namesOf(c.args), route.guards),
      });
  },
};

/** A chi closure (`Route("/x", func(r chi.Router) {…})`, `Group(func(r chi.Router) {…})`): a scope; false when none. */
function scope(c, model, fn, prefix) {
  const param = FUNC_PARAM.exec(fn || "")?.[1];
  if (param) model.scopes.push({ start: c.open, end: c.extent, param, prefix, receiver: c.receiver, at: c.at });
  return Boolean(param);
}

/** A group assigned to a variable (gin, echo, gorilla's subrouter): its prefix and middleware. */
function group(c, model) {
  const name = ASSIGNED.exec(c.text.slice(Math.max(0, c.at - 100), c.at))?.[1];
  const decl = { at: c.at, receiver: c.receiver, prefix: literal(c.args[0]) ?? "", guards: namesOf(c.args.slice(1)) };
  if (name) (model.groups.get(name) ?? model.groups.set(name, []).get(name)).push(decl);
}

/** A route call (a verb, Handle…), with gorilla's `.Methods(…)` after it. */
function route(c, model) {
  const r = routeOf(c.verb, c.receiver, c.args, c.framework);
  const after = r && c.verb.startsWith("Handle") ? METHODS_AFTER.exec(c.text.slice(c.end + 1, c.end + 240)) : null;
  if (after) r.methods = [...new Set([...after[1].matchAll(QUOTED)].map((q) => q[1].toUpperCase()))];
  if (r) model.routes.push({ ...r, at: c.at, receiver: c.receiver });
}

/**
 * What the route calls of one file declare: routes, groups, scopes (chi closures, mounts), `Use` calls. A call's
 * arguments are read up to the next call at most, 4,000 characters at most; its extent (a closure) is whole.
 */
function readCalls(text, index, close, framework) {
  const model = { routes: [], groups: new Map(), scopes: [], uses: [], mounts: [] };
  const calls = [...text.matchAll(CALL)].filter((m) => !index.inComment(m.index));
  for (const [k, m] of calls.entries()) {
    const next = k + 1 < calls.length ? calls[k + 1].index : text.length;
    const argsAt = (open) => {
      const limit = Math.min(open + 4000, next);
      const end = close[open] !== -1 && close[open] < limit ? close[open] : limit;
      return { args: splitArgs(text.slice(open + 1, end)), end };
    };
    const open = m.index + m[0].length - 1;
    const { args, end } = argsAt(open);
    const extent = close[open] === -1 ? text.length : close[open];
    const c = { text, at: m.index, receiver: m[1], verb: m[2], open, args, end, extent, argsAt, framework };
    (DECLARES[m[2]] ?? route)(c, model);
  }
  return model;
}

/** The scopes of the functions that `Mount(…)` names (their bodies), a router of any name inside each. */
function mountScopes(text, index, close, mounts) {
  const wanted = new Map(mounts.map((m) => [m.fn, m]));
  const out = [];
  if (!wanted.size) return out;
  for (const f of text.matchAll(FUNC)) {
    const mount = wanted.get(f[1]);
    const params = close[f.index + f[0].length - 1];
    if (!mount || index.inComment(f.index) || params === -1) continue;
    const brace = params + text.slice(params, params + 300).indexOf("{");
    if (brace >= params && close[brace] !== -1) out.push({ ...mount, start: brace, end: close[brace], param: "*" });
  }
  return out;
}

/** The last element of a list sorted by `key` whose key is before `at` (binary search), or undefined. */
function lastBefore(list, at, key = (x) => x.at) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < at) lo = mid + 1;
    else hi = mid;
  }
  return list[lo - 1];
}

/** Scopes sorted by their start, each with its parent: the innermost one that holds it (they nest). */
function nested(scopes) {
  const sorted = scopes.sort((a, b) => a.start - b.start);
  const stack = [];
  for (const s of sorted) {
    while (stack.length && stack.at(-1).end < s.start) stack.pop();
    s.parent = stack.at(-1) ?? null;
    stack.push(s);
  }
  return sorted;
}

/** What made a router variable at a place: its last group declaration in its scope, else the scope itself. */
function ownerOf(decls = [], scope, at) {
  const decl = lastBefore(decls, at);
  if (decl && decl.at > (scope ? scope.start : -1)) return decl;
  return scope ? { ...scope, guards: [] } : null;
}

const NONE = { prefix: "", guards: [] };

/**
 * The prefix and the guards of a router variable at a place of the file: its group declaration (gin, echo, gorilla)
 * or the chi closure or mount it is the router of, composed with those of its parent where it was made, and the
 * `Use(…)` of that router before the place; each list composed with withGuards (MAX_GUARDS at most, never copied
 * whole), so that K groups of K middleware cost K, not K².
 */
function chains(model) {
  const scopes = nested(model.scopes);
  const ids = new Map(scopes.map((s, k) => [s, k]));
  const innermost = (name, at) => {
    let s = lastBefore(scopes, at, (x) => x.start);
    for (let n = 0; s && n < 64; s = s.parent, n++) if (at < s.end && (s.param === name || s.param === "*")) return s;
    return null;
  };
  const uses = new Map();
  for (const u of model.uses) {
    const key = `${ids.get(innermost(u.receiver, u.at)) ?? -1}|${u.receiver}`;
    const list = uses.get(key) ?? uses.set(key, []).get(key);
    list.push({ at: u.at, names: withGuards(list.at(-1)?.names ?? [], u.names) });
  }
  const chainOf = (name, at, depth = 0) => {
    if (depth > 8) return NONE;
    const scope = innermost(name, at);
    const own = ownerOf(model.groups.get(name), scope, at);
    const base = own ? chainOf(own.receiver, own.at, depth + 1) : NONE;
    const used = lastBefore(uses.get(`${ids.get(scope) ?? -1}|${name}`) || [], at)?.names ?? [];
    return {
      prefix: base.prefix + (own?.prefix ?? ""),
      guards: withGuards(withGuards(base.guards, own?.guards ?? []), used),
    };
  };
  return chainOf;
}

/**
 * The routes of one Go file: { method, route, file, line, framework, guards }, `max` at most (the rest of the file is
 * not composed once they are reached).
 * @param {string} text
 * @param {string} file
 * @param {number} [max]
 */
export function goRoutes(text, file, max = MAX_ITEMS) {
  const index = textIndex(text, jsCommentRanges(text));
  const close = closings(text);
  const framework = FRAMEWORKS.find(([, re]) => re.test(text))?.[0] ?? "net/http";
  const model = readCalls(text, index, close, framework);
  model.scopes.push(...mountScopes(text, index, close, model.mounts));
  const chainOf = chains(model);
  const items = [];
  for (const r of model.routes) {
    if (items.length >= max) break;
    const chain = chainOf(r.receiver, r.at);
    // chi: the "/" of a subrouter is its prefix itself (`r.Route("/invoices", …)` then `r.Get("/", …)`: /invoices).
    const path = framework === "chi" && r.path === "/" && chain.prefix ? "" : r.path;
    const route = (chain.prefix + path).replace(SLASHES, "/") || "/";
    const guards = withGuards(chain.guards, r.guards);
    for (const method of r.methods.slice(0, max - items.length))
      items.push({ method, route, file, line: index.lineOf(r.at), framework, guards });
  }
  return items;
}

/** The routes of a set of Go files, MAX_ITEMS at most: a file is not read once they are reached. */
function goApi(sources) {
  const items = [];
  for (const [file, text] of sources) {
    if (items.length >= MAX_ITEMS) break;
    items.push(...goRoutes(text, file, MAX_ITEMS - items.length));
  }
  return items.sort(byRoute);
}

/**
 * The behaviour hints of a Go text, pushed into the sink of its file: query parameters, gorm's order and page, SQL.
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function goBehaviours(text, sink) {
  const param = (m) => {
    const { family, signal } = paramSignal(m[1]);
    sink.push({ family, signal, field: m[1], value: m[2] ? Number(m[2]) : undefined, via: "go" }, m.index);
  };
  for (const re of [QUERY, URL_QUERY]) for (const m of text.matchAll(re)) param(m);
  for (const m of text.matchAll(ORDER)) {
    const value = (m[2] || "asc").toLowerCase();
    sink.push({ family: "sort", signal: "orderBy", field: m[1].split(".").pop(), value, via: "gorm" }, m.index);
  }
  for (const m of text.matchAll(LIMIT)) {
    const value = m[2] ? Number(m[2]) : undefined;
    sink.push({ family: "pagination", signal: m[1].toLowerCase(), value, via: "gorm" }, m.index);
  }
  if (!sink.full) sqlBehaviours(text, sink);
}

export default {
  name: "go",
  files: /\.go$/,
  api: ({ sources }) => goApi(sources),
  behaviours: (text, sink) => goBehaviours(text, sink),
};
