// Stack adapter of Rust web servers (ARCHITECTURE.md §5, §6.9). actix-web: the attribute macros `#[get("/orders/
// {id}")]` (`#[route("/x", method = "GET", method = "POST")]`, `wrap = "…"`), registered by `.service(handler)` under
// the `web::scope("/api")` that holds it; `web::resource("/x").route(web::get().to(h))`, `.route("/x",
// web::post().to(h))`; `.wrap(…)`, which guards every route of its scope or application. axum:
// `Router::new().route("/orders", get(list).post(create))` (one item per method), `.nest("/api", …)` and `.merge(…)`
// (an inline router, or a function that returns one), `.layer(…)` and `.route_layer(…)`, which guard the routes added
// before them on the same router (`middleware::from_fn(require_auth)` is named by its function, a `ServiceBuilder` by
// its layers). A chain of calls is read from its start (`Router::new()`, `App::new()`, `web::scope(…)`,
// `web::resource(…)`, `cfg.service(…)`) by one walk of the brackets of its file; a function a chain names
// (`.configure(config)`, `.nest("/x", routes())`, `.service(scope())`) and a handler `.service(get_order)` registers
// are found by name among the files read, the same file's first. Tracing, CORS, compression and the like are no
// guards. A route in a comment is none. No behaviour hints.
import { textIndex, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

const START =
  /\b(?:Router(?:::<[^<>\n]{0,100}>)?::new\(\)|App::new\(\)|web::(scope|resource)\(|(\w{1,64})(?=\.(?:route|service|nest|merge|configure)\())/g;
/** A call chained on the previous one: `.route(`, `.layer(`, `.nest::<S>(`. */
const LINK = /\.(\w{1,32})(?:::<[^<>\n]{0,100}>)?\(/y;
const LITERAL = /^\s{0,200}"([^"\n]{0,500})"\s{0,200}(,?)/;
/** An axum method router: `get(list)`, `routing::post(create)`, `get_service(…)`. */
const METHOD = /\s{0,200}(?:\w{1,64}::){0,3}(get|post|put|patch|delete|head|options|trace|any)(?:_service)?\(/y;
const ACTIX_METHOD = /^\s{0,200}web::(get|post|put|patch|delete|head|options|trace|connect)\(\)/;
/** A function named (`handlers::get_order`), or called without arguments (`api::routes()`). */
const FN_NAME = /^\s{0,200}((?:\w{1,64}::){0,4}(\w{1,64}))(\(\s{0,20}\))?\s{0,200}$/;
const FROM_FN = /\bfrom_fn(?:_with_state)?\(\s{0,20}(?:[\w.&():]{1,64}\s{0,20},\s{0,20})?([A-Za-z_][\w:]{0,120})/;
const LEAD = /^\s{0,200}([A-Za-z_][\w:]{0,120})/;
const ATTRIBUTE =
  /#\[(?:actix_web::)?(get|post|put|patch|delete|head|options|trace|connect|route)\(\s{0,20}"([^"\n]{0,500})"/g;
const ATTRIBUTE_METHOD = /\bmethod\s{0,20}=\s{0,20}"([A-Za-z]{3,7})"/g;
const ATTRIBUTE_WRAP = /\bwrap\s{0,20}=\s{0,20}"([^"\n]{0,300})"/g;
const FN = /\bfn\s{1,20}([A-Za-z_]\w{0,63})/g;
/** A character of an identifier (`r"…"` starts a raw string only after none). */
const WORD_CHAR = /\w/;
/** The name of a link that adds a method to an axum method router (`.post(…)`, `.get_service(…)`), its suffix. */
const ROUTER_METHOD = /^(?:get|post|put|patch|delete|head|options|trace|any)(?:_service)?$/;
const SERVICE_SUFFIX = /_service$/;
/** What ends a function's signature: its body, or its end (a declaration). */
const BODY_START = /[{;]/;
/** Slashes side by side in a route composed of a prefix and a path. */
const SLASHES = /\/{2,}/g;
const BLANKS = /\s+/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
/** A `use` declaration: `use crate::orders::index;`, `use crate::orders::{index, show};` (bounded). */
const USE = /\buse\s{1,20}((?:\w{1,64}::){1,8})(?:(\w{1,64})|\{([\w\s,]{0,400})\})\s{0,20};/g;
/** At most this many handlers of one ambiguous name are given under one registration. */
const MAX_CANDIDATES = 8;

export const RUST_PATTERNS = Object.freeze({
  USE,
  ...{ START, LINK, LITERAL, METHOD, ACTIX_METHOD, FN_NAME, FROM_FN, LEAD },
  ...{ ATTRIBUTE, ATTRIBUTE_METHOD, ATTRIBUTE_WRAP, FN, WORD_CHAR, ROUTER_METHOD, SERVICE_SUFFIX, BODY_START },
  ...{ SLASHES, BLANKS },
});

/** Layers and middleware that never guard a route (any segment of their path). */
const NOT_GUARDS = new Set(
  `Logger Compress Cors NormalizePath DefaultHeaders ErrorHandlers TraceLayer CorsLayer CompressionLayer
  DecompressionLayer TimeoutLayer Extension AddExtensionLayer HandleErrorLayer DefaultBodyLimit RequestBodyLimitLayer
  SetResponseHeaderLayer SetRequestIdLayer PropagateRequestIdLayer CatchPanicLayer NormalizePathLayer
  ConcurrencyLimitLayer BufferLayer`.split(BLANKS),
);
/** The links of a chain that guard its routes: actix's `wrap`, axum's `layer` and `route_layer`. */
const GUARD_LINKS = new Set(["wrap", "layer", "route_layer"]);

/** Where the string "…" that starts at `i` ends (its closing quote, or the end of the text). */
function stringEnd(text, i) {
  let k = i + 1;
  for (; k < text.length && text[k] !== '"'; k++) if (text[k] === "\\") k++;
  return k;
}

/** Where a raw string (`r"…"`, `r#"…"#`) that starts at `i` ends, or -1 (a raw identifier, `r#type`). */
function rawEnd(text, i) {
  let k = i + 1;
  while (text[k] === "#" && k - i < 256) k++;
  if (text[k] !== '"') return -1;
  const close = `"${"#".repeat(k - i - 1)}`;
  const end = text.indexOf(close, k + 1);
  return end === -1 ? text.length : end + close.length - 1;
}

/** Where a character that starts at `i` ends ('x', '\n', '\u{1F600}'), or -1 (a lifetime, 'a). */
function charEnd(text, i) {
  if (text[i + 1] !== "\\") return text[i + 2] === "'" ? i + 2 : -1;
  const end = text.slice(i + 3, i + 13).indexOf("'");
  return end === -1 ? -1 : i + 3 + end;
}

/** Where a comment that starts at `i` ends (its last character), or -1 when none starts there. */
function commentEnd(text, i) {
  const next = text[i + 1];
  if (text[i] !== "/" || (next !== "/" && next !== "*")) return -1;
  const end = text.indexOf(next === "/" ? "\n" : "*/", i + 2);
  return end === -1 ? text.length : next === "/" ? end - 1 : end + 1;
}

/** Where the string, character or comment that starts at `i` ends (its last character); -1: none (a lifetime). */
function skipped(text, i) {
  const c = text[i];
  if (c === '"') return stringEnd(text, i);
  if (c === "'") return charEnd(text, i);
  if (c === "r" && (text[i + 1] === '"' || text[i + 1] === "#") && !WORD_CHAR.test(text[i - 1] || ""))
    return rawEnd(text, i);
  return commentEnd(text, i);
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

/** The index after the blanks and comments that start at `i` (2,000 characters at most). */
function afterBlanks(text, i) {
  const limit = Math.min(text.length, i + 2000);
  while (i < limit) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
    else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) i = skipped(text, i) + 1;
    else break;
  }
  return i;
}

/** The guard names of a layer, a middleware or a `wrap = "…"`. */
function guardNames(arg) {
  const fromFn = FROM_FN.exec(arg);
  if (fromFn) return [fromFn[1]];
  const lead = LEAD.exec(arg)?.[1];
  if (!lead) return [];
  if (lead.endsWith("ServiceBuilder::new") || lead === "ServiceBuilder")
    return arg
      .split(".layer(")
      .slice(1)
      .flatMap((part) => guardNames(part));
  return lead.split("::").some((s) => NOT_GUARDS.has(s)) ? [] : [lead];
}

/** The calls chained after `from`: { name, at, open, end } (500 at most, each closed). */
function linksAfter(text, close, from) {
  const links = [];
  for (let i = from, n = 0; n < 500; n++) {
    i = afterBlanks(text, i);
    LINK.lastIndex = i;
    const m = LINK.exec(text);
    const open = i + (m?.[0].length ?? 0) - 1;
    if (!m || close[open] === -1) break;
    links.push({ name: m[1], at: i, open, end: close[open] });
    i = close[open] + 1;
  }
  return links;
}

/** The method items of an axum method router (`get(list).post(create).layer(…)`) from `i`: methods, own guards. */
function methodRouter(text, close, i) {
  METHOD.lastIndex = i;
  const first = METHOD.exec(text);
  if (!first) return null;
  const open = METHOD.lastIndex - 1;
  if (close[open] === -1) return null;
  const methods = new Set([first[1]]);
  let guards = [];
  for (const l of linksAfter(text, close, close[open] + 1)) {
    if (ROUTER_METHOD.test(l.name)) methods.add(l.name.replace(SERVICE_SUFFIX, ""));
    else if (l.name === "layer" || l.name === "route_layer")
      guards = withGuards(guards, guardNames(text.slice(l.open + 1, Math.min(l.end, l.open + 2000))));
  }
  return { methods: [...methods].map((m) => (m === "any" ? "ANY" : m.toUpperCase())), guards, framework: "axum" };
}

/** A `.route(…)` link: actix's (`web::get().to(h)`, a resource's without a path) or axum's (a method router). */
function routeLink(text, close, link, { literal, rest, after, path }) {
  const actix = ACTIX_METHOD.exec(after);
  if (actix || !literal)
    return { ...link, methods: [actix ? actix[1].toUpperCase() : "ANY"], guards: [], framework: "actix-web", path };
  const router = methodRouter(text, close, rest);
  return router && { ...link, ...router, path };
}

/** What a link of a chain declares: a route (path, methods), a function it names, a prefix, guards. */
function readLink(text, close, link) {
  const args = text.slice(link.open + 1, Math.min(link.end, link.open + 2000));
  const literal = LITERAL.exec(args);
  const rest = link.open + 1 + (literal ? literal[0].length : 0);
  const after = text.slice(rest, Math.min(link.end, rest + 2000));
  const path = literal?.[1] ?? "";
  if (link.name === "route") return routeLink(text, close, link, { literal, rest, after, path });
  if (link.name === "to") return { ...link, methods: ["ANY"], guards: [], framework: "actix-web", path };
  if (GUARD_LINKS.has(link.name)) return { ...link, guards: guardNames(args) };
  const fn = FN_NAME.exec(literal ? after : args);
  return { ...link, path, fn: fn?.[2], fnPath: fn?.[1], called: Boolean(fn?.[3]) };
}

/** The first element of a list sorted by `key` whose key is at least `at` (binary search), or undefined. */
function firstFrom(list, at, key) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < at) lo = mid + 1;
    else hi = mid;
  }
  return list[lo];
}

/** The functions of a file with a body: { name, start, end } ("{" … "}"). */
function functionsOf(text, close, defs) {
  const out = [];
  for (const m of defs) {
    const after = m.index + m[0].length;
    const paren = text.slice(after, after + 200).indexOf("(");
    const params = paren === -1 ? -1 : close[after + paren];
    const brace = params === -1 ? -1 : text.slice(params + 1, params + 300).search(BODY_START);
    const start = params + 1 + brace;
    if (brace !== -1 && text[start] === "{" && close[start] !== -1) out.push({ name: m[1], start, end: close[start] });
  }
  return out;
}

/** The attribute routes of a file (`#[get("/x")]` above a function): { name, path, methods, guards, line }. */
function attributesOf(text, index, close, defs) {
  const out = [];
  for (const m of text.matchAll(ATTRIBUTE)) {
    if (index.inComment(m.index)) continue;
    const open = m.index + m[0].indexOf("(");
    const args = text.slice(open + 1, close[open] === -1 ? open + 600 : Math.min(close[open], open + 600));
    const named = [...args.matchAll(ATTRIBUTE_METHOD)].map((x) => x[1].toUpperCase());
    const methods = m[1] !== "route" ? [m[1].toUpperCase()] : named.length ? named : ["ANY"];
    const guards = withGuards(
      [],
      [...args.matchAll(ATTRIBUTE_WRAP)].flatMap((w) => guardNames(w[1])),
    );
    const fn = firstFrom(defs, m.index, (d) => d.index);
    if (fn && fn.index - m.index <= 2000)
      out.push({ name: fn[1], path: m[2], methods, guards, line: index.lineOf(m.index) });
  }
  return out;
}

/** The chains of calls of a file, each link read, with the guards of its layers after each link. */
function chainsOf(text, index, close, file) {
  const chains = [];
  for (const m of text.matchAll(START)) {
    if (index.inComment(m.index)) continue;
    let from = m.index + m[0].length;
    let own = "";
    if (m[1]) {
      const open = from - 1;
      if (close[open] === -1) continue;
      own = LITERAL.exec(text.slice(open + 1, Math.min(close[open], open + 600)))?.[1] ?? "";
      from = close[open] + 1;
    }
    const links = linksAfter(text, close, from)
      .map((l) => readLink(text, close, l))
      .filter(Boolean)
      .map((l, k) => ({ ...l, k, line: index.lineOf(l.at) }));
    let wraps = [];
    for (const l of links) if (l.name === "wrap") wraps = withGuards(wraps, l.guards);
    // The layers after each link, composed from the last one: MAX_GUARDS each at most, whatever the chain's length.
    const after = new Array(links.length + 1).fill([]);
    for (let k = links.length - 1; k >= 0; k--) {
      const layer = links[k].name === "layer" || links[k].name === "route_layer" ? links[k].guards : [];
      after[k] = withGuards(layer, after[k + 1]);
    }
    chains.push({ file, start: m.index, own, links, wraps, after, parent: null });
  }
  return chains;
}

/** For each point (sorted), the innermost interval (sorted by start, nested) that holds it, or null. One sweep. */
function holders(intervals, points) {
  const out = [];
  const stack = [];
  let k = 0;
  for (const p of points) {
    while (k < intervals.length && intervals[k].start < p) {
      while (stack.length && stack.at(-1).end < intervals[k].start) stack.pop();
      stack.push(intervals[k++]);
    }
    while (stack.length && stack.at(-1).end < p) stack.pop();
    out.push(stack.at(-1) ?? null);
  }
  return out;
}

/** One file read: its chains, attribute routes and functions. */
function readFile(text, file) {
  const index = textIndex(text, jsCommentRanges(text));
  const close = closings(text);
  const defs = [...text.matchAll(FN)].filter((m) => !index.inComment(m.index));
  return {
    file,
    uses: usesOf(text, index),
    chains: chainsOf(text, index, close, file),
    attributes: attributesOf(text, index, close, defs).map((a) => ({ ...a, file })),
    fns: functionsOf(text, close, defs),
  };
}

/** The names a file brings in with `use`, each with the module it comes from (`use crate::orders::index;`: orders). */
function usesOf(text, index) {
  const out = new Map();
  for (const m of text.matchAll(USE)) {
    if (index.inComment(m.index)) continue;
    const modules = m[1].split("::").filter(Boolean);
    const module = modules[modules.length - 1];
    const names = m[2] ? [m[2]] : (m[3] ?? "").split(",").map((n) => n.trim());
    for (const name of names) if (name && !out.has(name)) out.set(name, module);
  }
  return out;
}

/** The module a file is: src/orders.rs and src/orders/mod.rs are `orders`; main.rs and lib.rs the crate's root. */
function moduleOf(file) {
  const parts = file.split("/");
  const last = parts[parts.length - 1];
  const name = last.endsWith(".rs") ? last.slice(0, -3) : last;
  if (name === "mod") return parts[parts.length - 2] ?? "";
  return name === "main" || name === "lib" ? "" : name;
}

/** The module a path names before its function (`orders::index`, `crate::api::orders::index`: orders), or null. */
function moduleIn(fnPath) {
  const parts = (fnPath ?? "").split("::");
  const module = parts.length > 1 ? parts[parts.length - 2] : null;
  return module && module !== "self" && module !== "super" && module !== "crate" ? module : null;
}

/**
 * An index of named things (handlers, references to a function) for a linear lookup: by name and module, by name
 * and file, and how many bear the name.
 * @param {Array<any>} list
 * @param {(x: any) => string} nameOf
 * @param {(x: any) => string|null} moduleOfIt   the module the thing names or is in
 * @param {(x: any) => string} fileOf
 */
function indexed(list, nameOf, moduleOfIt, fileOf) {
  const byModule = new Map();
  const byFile = new Map();
  const count = new Map();
  const all = new Map();
  for (const x of list) {
    const name = nameOf(x);
    count.set(name, (count.get(name) ?? 0) + 1);
    const named = all.get(name) ?? all.set(name, []).get(name);
    if (named.length < MAX_CANDIDATES) named.push(x);
    const m = moduleOfIt(x);
    if (m !== null) (byModule.get(`${name}\n${m}`) ?? byModule.set(`${name}\n${m}`, []).get(`${name}\n${m}`)).push(x);
    if (!byFile.has(`${name}\n${fileOf(x)}`)) byFile.set(`${name}\n${fileOf(x)}`, x);
  }
  const first = new Map();
  for (const x of list) if (!first.has(nameOf(x))) first.set(nameOf(x), x);
  return { byModule, byFile, count, first, all };
}

/**
 * The thing of a name a reference means: the one of the module it names (one only: two are ambiguous, none is
 * taken; none of that module: as if it named none), else the one of the reference's file, else the only one of that
 * name — never a guess among several.
 */
function resolved(index, name, module, file) {
  if (module !== null) {
    const there = index.byModule.get(`${name}\n${module}`);
    if (there) return there.length === 1 ? there[0] : null;
  }
  return index.byFile.get(`${name}\n${file}`) ?? (index.count.get(name) === 1 ? index.first.get(name) : null);
}

/**
 * The parent of each chain: the link of another chain whose arguments hold it (`.service(web::scope(…))`,
 * `.nest("/x", Router::new()…)`), else the link that names the function whose body holds it (`.nest("/x",
 * routes())`, `.configure(orders::config)`): the one naming that file's module, else one of the same file, else
 * the only one — never a guess among several.
 */
function link(files) {
  const refs = indexed(
    files
      .flatMap((f) => f.chains)
      .flatMap((c) =>
        c.links.filter((l) => l.fn && (l.called || l.name === "configure")).map((l) => ({ chain: c, link: l })),
      ),
    (r) => r.link.fn,
    (r) => moduleIn(r.link.fnPath),
    (r) => r.chain.file,
  );
  const byStart = (a, b) => a.start - b.start;
  for (const f of files) {
    const chains = [...f.chains].sort(byStart);
    const starts = chains.map((c) => c.start);
    const inLinks = holders(
      chains.flatMap((c) => c.links.map((l) => ({ start: l.open, end: l.end, chain: c, link: l }))).sort(byStart),
      starts,
    );
    const inFns = holders([...f.fns].sort(byStart), starts);
    for (const [k, c] of chains.entries()) {
      const byModule = inFns[k] ? resolved(refs, inFns[k].name, moduleOf(f.file), f.file) : null;
      const sameFile = inFns[k] ? refs.byFile.get(`${inFns[k].name}\n${f.file}`) : null;
      c.parent = inLinks[k] ?? sameFile ?? byModule ?? null;
    }
  }
}

/** Parts of a route joined, one "/" between them. */
const glued = (...parts) => parts.join("").replace(SLASHES, "/");

/** A route under a prefix ("/" alone for none); under an axum prefix, the "/" of a nested router is the prefix. */
const joined = (prefix, path, framework) =>
  (framework === "axum" && path === "/" && prefix ? prefix : glued(prefix, path)) || "/";

/** The prefix of a chain's routes: its parents', a `nest`'s path, its own scope or resource path (8 deep). */
function prefixOf(c, depth = 0) {
  if (!c.parent || depth > 8) return c.own;
  return glued(prefixOf(c.parent.chain, depth + 1), c.parent.link.name === "nest" ? c.parent.link.path : "", c.own);
}

/** The guards of the link `k` of a chain: the wraps of its chain, the layers after it, and so on up its parents. */
function guardsOf(c, k, depth = 0) {
  const own = withGuards(c.wraps, c.after[k + 1]);
  return !c.parent || depth > 8 ? own : withGuards(guardsOf(c.parent.chain, c.parent.link.k, depth + 1), own);
}

/**
 * The attribute route a `.service(path)` registers (`orders::index`, `index`): the handler of the module the path
 * names — or the module its file's `use` brings the name from — (src/orders.rs, src/orders/mod.rs), else that of
 * the same file, else the only one of that name; one per registration (an index: K handlers of one name registered K
 * times cost K). None when it stays ambiguous: the caller then gives each candidate under the registration.
 */
function handlerOf(handlers, name, fnPath, file, uses) {
  return resolved(handlers, name, moduleIn(fnPath) ?? uses?.get(name) ?? null, file);
}

/** The items of a link of a chain: its route (`.route`, `.to`), or the handler its `.service(name)` registers. */
function linkItems(c, l, handler, add) {
  if (l.methods) {
    const guards = withGuards(guardsOf(c, l.k), l.guards);
    add(l.methods, joined(prefixOf(c), l.path, l.framework), { ...l, file: c.file }, l.framework, guards);
  } else if (handler) {
    const guards = withGuards(guardsOf(c, l.k), handler.guards);
    add(handler.methods, joined(prefixOf(c), handler.path, "actix-web"), handler, "actix-web", guards);
  }
}

/**
 * The actix-web and axum routes of a set of Rust files (file → text): { method, route, file, line, framework, guards },
 * sorted by route, method and file.
 * @param {Map<string, string>} sources
 */
export function rustRoutes(sources) {
  const files = [...sources].map(([file, text]) => readFile(text, file));
  link(files);
  const all = files.flatMap((f) => f.attributes);
  const handlers = indexed(
    all,
    (a) => a.name,
    (a) => moduleOf(a.file),
    (a) => a.file,
  );
  const registered = new Set();
  const usesOf_ = new Map(files.map((f) => [f.file, f.uses]));
  const items = [];
  // MAX_ITEMS at most: once they are reached, no route is composed any more.
  const add = (methods, route, at, framework, guards) => {
    for (const method of methods)
      if (items.length < MAX_ITEMS) items.push({ method, route, file: at.file, line: at.line, framework, guards });
  };
  for (const c of files.flatMap((f) => f.chains))
    for (const l of c.links) {
      if (items.length >= MAX_ITEMS) break;
      const registers = l.name === "service" && l.fn && !l.called;
      const handler = registers ? handlerOf(handlers, l.fn, l.fnPath, c.file, usesOf_.get(c.file)) : null;
      if (handler) registered.add(handler);
      linkItems(c, l, handler, add);
      // A registration whose handler stays ambiguous: each candidate under the registration's prefix and guards (the
      // route it declares, whichever it is), and none of that name bare — a route without them would look public.
      if (registers && !handler)
        for (const h of handlers.all.get(l.fn) ?? []) {
          registered.add(h);
          linkItems(c, l, h, add);
        }
    }
  for (const a of all)
    if (items.length < MAX_ITEMS && !registered.has(a))
      add(a.methods, joined("", a.path, "actix-web"), a, "actix-web", a.guards);
  return items.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

export default {
  name: "rust",
  files: /\.rs$/,
  marker:
    /#\[(?:actix_web::)?(?:get|post|put|patch|delete|head|options|trace|connect|route)\(|\bweb::|::new\(\)|\.(?:route|nest|merge|service)\(/,
  api: ({ sources }) => rustRoutes(sources),
};
