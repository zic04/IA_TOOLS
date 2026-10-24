// Stack adapter of Flask (ARCHITECTURE.md §5, §6.9): the `@<app|blueprint>.route("/path", methods=[…])` decorators
// (GET when no method is named) and their shortcuts `.get`, `.post`, `.put`, `.patch`, `.delete`, composed with the
// prefix of their Blueprint across files — the `url_prefix` of `register_blueprint(bp, url_prefix=…)`, which
// replaces the Blueprint's own as Flask does, else its own `Blueprint(…, url_prefix=…)`, after the prefix of the
// blueprint it is registered on (nested blueprints). A blueprint is named through the imports of the file that uses
// it (`from .orders import bp as orders_bp`), else by the one file that declares it. The guards are the decorators
// between the route decorator and its function (`@login_required`, `@roles_required("admin")`, `@jwt_required()`) —
// one above the route decorator does not guard the route in Flask; `optional=True` in its arguments is kept — and
// `before_request`, always "unknown", for each before_request hook of its blueprint or of the application that may
// deny a request (mayDeny); a hook that logs or loads the user is none. A decorator in a comment or a docstring is no
// route.
// The readers of Python it shares with the Django adapter (the imports of a file, the file of a module) are
// engine/facts/stack-py.mjs.
import { textIndex, pyCommentRanges, callSpan } from "../../engine/facts/behaviour-common.mjs";
import {
  STACK_PY_PATTERNS,
  pyImports,
  pyModuleFile,
  pyGuard,
  pyJoin,
  pyCalls,
  pyIndent,
  pyBlockEnd,
  literalOf,
} from "../../engine/facts/stack-py.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";
import { HOOK_GUARD, wholeNameGuard } from "../../engine/facts/guards.mjs";

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
/** A before_request hook, by the object it is registered on; its function is the next `def`. */
const BEFORE_REQUEST = /^[ \t]{0,200}@(\w{1,64})\.before_request\b/gm;
/** A function, by its name; its "(" ends the match. */
const DEF = /\bdef\s{1,20}(\w{1,120})\s{0,20}\(/g;
/** A call in a hook's body: its dotted name (`verify_jwt_in_request()`, `g.user = get_current_user()`). */
const CALL = /\b([A-Za-z_][\w.]{0,120})[ \t]{0,20}\(/g;
/** What may deny a request in a hook's body: `abort(`, `raise`, `redirect(`, a `return` of a value other than None. */
const MAY_DENY = /\babort[ \t]{0,20}\(|\braise\b|\bredirect[ \t]{0,20}\(|\breturn[ \t]{1,20}(?!None\b)[^\s#]/g;
/**
 * A call's arguments that let anonymous callers in: `optional=` anything but False (Flask-JWT-Extended's and
 * Flask-HTTPAuth's `optional=True`, a constant), or `True` first (`verify_jwt_in_request(True)`).
 */
const OPTIONAL = /\boptional\s{0,20}=(?!\s{0,20}False\b)|^\s{0,20}True\b/;
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
  CALL,
  MAY_DENY,
  OPTIONAL,
  ROUTE_DECORATOR,
});

/** A piece of Python without its `#` comments (its strings kept). */
function uncommented(code) {
  let out = "";
  let at = 0;
  for (const [from, to] of pyCommentRanges(code)) {
    out += code.slice(at, from);
    at = to;
  }
  return out + code.slice(at);
}

/**
 * A call's name, with `(optional=True)` when its arguments (`open`: its "("), outside their comments, let anonymous
 * callers in.
 */
const called = (text, open, name) =>
  OPTIONAL.test(uncommented(callSpan(text, open, DEF_GAP, "py").args)) ? `${name}(optional=True)` : name;

/**
 * Whether a before_request hook may deny a request, its function DEF_GAP characters away at most: a guard decorator
 * under the hook (`@login_required`), or, in its body outside its strings and comments, `abort(`, `raise`,
 * `redirect(`, a `return` of a value other than None, or a call of a guard by its whole name (a built-in user guard,
 * `verify_jwt_in_request()`, or instead a name `review.guards.user` matches, as it replaces them; a name
 * `review.guards.role` matches, never a built-in role word: engine/facts/guards.mjs). Such a hook gives HOOK_GUARD to the
 * routes it applies to, which is "unknown" whatever its name, its body or the patterns: which requests it lets
 * through is not read. A hook that may deny nothing (it logs, loads `g.user`, does `pass`) gives none.
 * @param {{ text: string, defs: number[], defMatches: RegExpMatchArray[], decorators: RegExpMatchArray[] }} file
 * @param {RegExpMatchArray} m   the hook's decorator
 * @param {import("../../engine/facts/guards.mjs").GuardPatterns} patterns
 */
function mayDeny(file, m, patterns) {
  const { text, defs, defMatches } = file;
  const after = m.index + m[0].length;
  const def = defMatches[lowerBound(defs, after)];
  if (!def || def.index - after > DEF_GAP) return false;
  if (guardsAfter(text, after, defs, file.decorators).length) return true;
  const from = callSpan(text, def.index + def[0].length - 1, DEF_GAP, "py").end;
  const body = text.slice(from, pyBlockEnd(text, from, pyIndent(text, def.index), DEF_GAP));
  const index = textIndex(body, pyCommentRanges(body, { strings: true }));
  const outside = (x) => !index.inComment(x.index);
  return (
    [...body.matchAll(MAY_DENY)].some(outside) ||
    [...body.matchAll(CALL)].some((c) => outside(c) && wholeNameGuard(c[1], patterns))
  );
}

/**
 * What one file declares: its blueprints, the blueprints it registers, its routes, its before_request hooks.
 * @param {string} text
 * @param {import("../../engine/facts/guards.mjs").GuardPatterns} patterns
 */
function readFile(text, patterns) {
  const index = textIndex(text, pyCommentRanges(text, { docstrings: true }));
  const blueprints = new Map();
  for (const { m, args } of pyCalls(BLUEPRINT, text, index)) blueprints.set(m[1], literalOf(URL_PREFIX.exec(args)));
  const registrations = [];
  for (const { m, args } of pyCalls(REGISTER, text, index)) {
    const what = REGISTERED.exec(args)?.[1];
    if (what) registrations.push({ on: m[1], what, prefix: literalOf(URL_PREFIX.exec(args)) });
  }
  const defMatches = [...text.matchAll(DEF)].filter((m) => !index.inComment(m.index));
  const defs = defMatches.map((m) => m.index);
  const decorators = [...text.matchAll(DECORATOR)].filter((m) => !index.inComment(m.index));
  const routes = [];
  for (const { m, args, end } of pyCalls(ROUTE, text, index)) {
    const path = literalOf(LITERAL.exec(args));
    if (path === undefined) continue;
    const named = [
      ...new Set([...(METHODS.exec(args)?.[1] ?? "").matchAll(QUOTED_WORD)].map((q) => q[1].toUpperCase())),
    ];
    const methods = m[2] !== "route" ? [m[2].toUpperCase()] : named.length ? named : ["GET"];
    const guards = guardsAfter(text, end, defs, decorators);
    routes.push({ obj: m[1], path, methods, line: index.lineOf(m.index), guards });
  }
  // 64 hooks of a file at most are read, each body DEF_GAP characters at most: a bounded cost per file.
  const file = { text, defs, defMatches, decorators };
  const hooks = [...text.matchAll(BEFORE_REQUEST)]
    .filter((m) => !index.inComment(m.index))
    .slice(0, 64)
    .filter((m) => mayDeny(file, m, patterns))
    .map((m) => ({ on: m[1], guards: [HOOK_GUARD] }));
  return { blueprints, registrations, routes, before: hooks };
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

/**
 * The guard decorators between a route decorator's call (ending at `after`) and its function, DEF_GAP away at most;
 * one whose arguments let anonymous callers in (`@jwt_required(optional=True)`, `@jwt_required (optional=True)`, on
 * one line or several) keeps them.
 */
function guardsAfter(text, after, defs, decorators) {
  const def = defs[lowerBound(defs, after)];
  if (def === undefined || def - after > DEF_GAP) return [];
  const out = [];
  for (let k = lowerBound(decorators, after, (d) => d.index); k < decorators.length; k++) {
    const d = decorators[k];
    if (d.index >= def) break;
    if (ROUTE_DECORATOR.test(d[1]) || !pyGuard(d[1])) continue;
    // Blanks between a decorator's name and its "(" are Python's: the walk stops before the function, DEF_GAP away.
    let open = d.index + d[0].length;
    while (open < def && (text[open] === " " || text[open] === "\t")) open++;
    out.push(text[open] === "(" ? called(text, open, d[1]) : d[1]);
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
 * method and file. A before_request hook guards by the project's patterns (`review.guards`; the built-in ones by
 * default).
 * @param {Map<string, string>} sources
 * @param {import("../../engine/facts/guards.mjs").GuardPatterns} [patterns]
 */
export function flaskRoutes(sources, patterns = {}) {
  const files = new Map([...sources].map(([file, text]) => [file, readFile(text, patterns)]));
  const blueprintOf = blueprintResolver(sources, files);
  const mounts = new Map();
  const before = new Map();
  for (const [file, f] of files) {
    for (const r of f.registrations) {
      const key = blueprintOf(file, r.what);
      if (key) add(mounts, key, { parent: blueprintOf(file, r.on), prefix: r.prefix });
    }
    for (const b of f.before) for (const g of b.guards) add(before, blueprintOf(file, b.on) ?? "app", g);
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
  api: ({ sources, guards }) => flaskRoutes(sources, guards),
};
