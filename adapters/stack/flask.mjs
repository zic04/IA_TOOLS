// Stack adapter of Flask (ARCHITECTURE.md §5, §6.9): the `@<app|blueprint>.route("/path", methods=[…])` decorators
// (GET when no method is named) and their shortcuts `.get`, `.post`, `.put`, `.patch`, `.delete`, composed with the
// prefix of their Blueprint across files — the `url_prefix` of `register_blueprint(bp, url_prefix=…)`, which
// replaces the Blueprint's own as Flask does, else its own `Blueprint(…, url_prefix=…)`, after the prefix of the
// blueprint it is registered on (nested blueprints). A blueprint is named through the imports of the file that uses
// it (`from .orders import bp as orders_bp`), else by the one file that declares it. The guards are the decorators
// between the route decorator and its function (`@login_required`, `@roles_required("admin")`, `@jwt_required()`) —
// one above the route decorator does not guard the route in Flask — and the `before_request` functions of its
// blueprint or of the application. A decorator in a comment or a docstring is no route.
// The readers of Python it shares with the Django adapter (the imports of a file, the file of a module) are
// engine/facts/stack-py.mjs.
import { textIndex, pyCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import {
  STACK_PY_PATTERNS,
  pyImports,
  pyModuleFile,
  pyGuard,
  pyJoin,
  pyCalls,
  literalOf,
} from "../../engine/facts/stack-py.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

const { LITERAL, QUOTED_WORD } = STACK_PY_PATTERNS;
const ROUTE = /@(\w{1,64})\.(route|get|post|put|patch|delete)\(/g;
const METHODS = /\bmethods\s{0,20}=\s{0,20}[[(]([^\])]{0,300})[\])]/;
const BLUEPRINT = /\b(\w{1,64})[ \t]{0,20}=[ \t]{0,20}(?:\w{1,64}\.)?(?:API)?Blueprint\(/g;
const REGISTER = /\b(\w{1,64})\.register_blueprint\(/g;
const URL_PREFIX = /\burl_prefix\s{0,20}=\s{0,20}[rRuU]?(?:"([^"\n]{0,500})"|'([^'\n]{0,500})')/;
/** What `register_blueprint(` registers: `bp`, `orders.bp`. */
const REGISTERED = /^\s{0,200}([A-Za-z_]\w{0,63}(?:\.[A-Za-z_]\w{0,63}){0,3})/;
/** A decorator, on its own line. */
const DECORATOR = /^[ \t]{0,200}@([A-Za-z_][\w.]{0,120})/gm;
const BEFORE_REQUEST =
  /^[ \t]{0,200}@(\w{1,64})\.before_request\b[^\n]{0,200}\n[ \t]{0,200}def[ \t]{1,20}(\w{1,120})/gm;
const DEF = /\bdef\s{1,20}\w{1,120}\s{0,20}\(/g;
/** A route decorator among a function's decorators: never one of its guards. */
const ROUTE_DECORATOR = /\.(?:route|get|post|put|patch|delete)$/;
/** At most this many prefixes for one blueprint (one per registration). */
const MAX_PREFIXES = 8;
/** At most this many characters between a route decorator's call and its function (the decorators between). */
const DEF_GAP = 2000;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const FLASK_PATTERNS = Object.freeze({
  ROUTE,
  METHODS,
  BLUEPRINT,
  REGISTER,
  URL_PREFIX,
  REGISTERED,
  DECORATOR,
  BEFORE_REQUEST,
  DEF,
  ROUTE_DECORATOR,
});

/** What one file declares: its blueprints, the blueprints it registers, its routes, its before_request functions. */
function readFile(text) {
  const index = textIndex(text, pyCommentRanges(text, { docstrings: true }));
  const blueprints = new Map();
  for (const { m, args } of pyCalls(BLUEPRINT, text, index)) blueprints.set(m[1], literalOf(URL_PREFIX.exec(args)));
  const registrations = [];
  for (const { m, args } of pyCalls(REGISTER, text, index)) {
    const what = REGISTERED.exec(args)?.[1];
    if (what) registrations.push({ on: m[1], what, prefix: literalOf(URL_PREFIX.exec(args)) });
  }
  const before = [...text.matchAll(BEFORE_REQUEST)].filter((m) => !index.inComment(m.index));
  const defs = [...text.matchAll(DEF)].filter((m) => !index.inComment(m.index)).map((m) => m.index);
  const decorators = [...text.matchAll(DECORATOR)].filter((m) => !index.inComment(m.index));
  const routes = [];
  for (const { m, args, end } of pyCalls(ROUTE, text, index)) {
    const path = literalOf(LITERAL.exec(args));
    if (path === undefined) continue;
    const named = [
      ...new Set([...(METHODS.exec(args)?.[1] ?? "").matchAll(QUOTED_WORD)].map((q) => q[1].toUpperCase())),
    ];
    const methods = m[2] !== "route" ? [m[2].toUpperCase()] : named.length ? named : ["GET"];
    routes.push({ obj: m[1], path, methods, line: index.lineOf(m.index), guards: guardsAfter(end, defs, decorators) });
  }
  return { blueprints, registrations, routes, before: before.map((m) => ({ on: m[1], name: m[2] })) };
}

/** The first index of a sorted list of numbers that is at least `n` (binary search). */
function lowerBound(sorted, n, key = (x) => x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(sorted[mid]) < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The guard decorators between a route decorator's call (ending at `after`) and its function, DEF_GAP away at most. */
function guardsAfter(after, defs, decorators) {
  const def = defs[lowerBound(defs, after)];
  if (def === undefined || def - after > DEF_GAP) return [];
  const out = [];
  for (let k = lowerBound(decorators, after, (d) => d.index); k < decorators.length; k++) {
    const d = decorators[k];
    if (d.index >= def) break;
    if (!ROUTE_DECORATOR.test(d[1]) && pyGuard(d[1])) out.push(d[1]);
  }
  return withGuards([], out);
}

/** A text without its leading (`start`) or trailing slashes, by a walk (no expression: linear). */
function trimSlashes(s, start) {
  let b = 0;
  let e = s.length;
  if (start) while (b < e && s[b] === "/") b++;
  else while (e > b && s[e - 1] === "/") e--;
  return s.slice(b, e);
}

/** The route of a path under a prefix, as Flask joins them. */
const joined = (prefix, path) =>
  !prefix ? path || "/" : path ? `${trimSlashes(prefix, false)}/${trimSlashes(path, true)}` : prefix;

/** Adds a value to the list of a key of a map (in place: a list grows in linear time). */
const add = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);

/**
 * The resolver of the blueprint (`file#name`) an expression of a file names, or null (the application): a blueprint
 * of the file itself, else one named through its imports, else the one file that declares that name.
 */
function blueprintResolver(sources, files) {
  const imports = new Map();
  const importsOf = (file) => imports.get(file) ?? imports.set(file, pyImports(sources.get(file))).get(file);
  const declaring = new Map();
  for (const [file, f] of files) for (const name of f.blueprints.keys()) add(declaring, name, file);
  return (file, expr) => {
    const parts = expr.split(".");
    let name = parts.pop();
    let target = null;
    const head = importsOf(file).get(parts[0] ?? name);
    if (!parts.length && files.get(file).blueprints.has(name)) target = file;
    else if (head) {
      if (!parts.length) name = head.name;
      const module = parts.length ? [pyJoin(head.module, head.name), ...parts.slice(1)].join(".") : head.module;
      target = pyModuleFile(module, sources, file);
    } else if (parts.length) target = pyModuleFile(parts.join("."), sources, file);
    if (!target && declaring.get(name)?.length === 1) target = declaring.get(name)[0];
    return target && files.get(target).blueprints.has(name) ? `${target}#${name}` : null;
  };
}

/**
 * The prefixes of a blueprint (one per registration, MAX_PREFIXES at most: the registrations past them are not
 * composed), its parents' first; a cycle stops at its own.
 */
function prefixer(files, mounts) {
  const memo = new Map();
  const prefixesOf = (key, depth = 0) => {
    if (memo.has(key)) return memo.get(key);
    const [file, name] = key.split("#");
    const own = files.get(file).blueprints.get(name) ?? "";
    memo.set(key, [own]);
    const out = new Set();
    for (const r of depth < 8 ? mounts.get(key) || [] : []) {
      for (const p of r.parent ? prefixesOf(r.parent, depth + 1) : [""]) {
        if (out.size === MAX_PREFIXES) break;
        out.add(joined(p, r.prefix ?? own));
      }
      if (out.size === MAX_PREFIXES) break;
    }
    memo.set(key, out.size ? [...out] : [own]);
    return memo.get(key);
  };
  return prefixesOf;
}

/** The items of a route under each of its prefixes, one per method, MAX_ITEMS in all at most. */
function routeItems(items, r, prefixes) {
  for (const prefix of prefixes)
    for (const method of r.methods)
      if (items.length < MAX_ITEMS)
        items.push({ method, route: joined(prefix, r.path), file: r.file, line: r.line, guards: r.guards });
}

/**
 * The Flask routes of a set of Python files (file → text): { method, route, file, line, guards }, sorted by route,
 * method and file.
 * @param {Map<string, string>} sources
 */
export function flaskRoutes(sources) {
  const files = new Map([...sources].map(([file, text]) => [file, readFile(text)]));
  const blueprintOf = blueprintResolver(sources, files);
  const mounts = new Map();
  const before = new Map();
  for (const [file, f] of files) {
    for (const r of f.registrations) {
      const key = blueprintOf(file, r.what);
      if (key) add(mounts, key, { parent: blueprintOf(file, r.on), prefix: r.prefix });
    }
    for (const b of f.before.slice(0, 64)) add(before, blueprintOf(file, b.on) ?? "app", b.name);
  }
  const prefixesOf = prefixer(files, mounts);
  const items = [];
  const app = withGuards([], before.get("app") || []);
  for (const [file, f] of files)
    for (const r of f.routes) {
      if (items.length >= MAX_ITEMS) break;
      const key = blueprintOf(file, r.obj);
      const guards = withGuards(withGuards(r.guards, before.get(key) || []), app);
      routeItems(items, { ...r, file, guards }, key ? prefixesOf(key) : [""]);
    }
  return items.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

export default {
  name: "flask",
  files: /\.py$/,
  marker: /@\w{1,64}\.(?:route|get|post|put|patch|delete|before_request)\b|Blueprint\(|register_blueprint\(/,
  api: ({ sources }) => flaskRoutes(sources),
};
