// Stack adapter of Laravel (ARCHITECTURE.md §5): the routes of `Route::<verb>(…)`, `Route::match`, `Route::any`,
// `Route::view` and of `Route::resource` / `apiResource` (their seven and five actions, `only` and `except`), in the
// groups that hold them — `Route::prefix(…)->middleware(…)->group(…)`, `Route::group([…], …)`, nested, and a routes
// file mounted by `->group(base_path(…))` —, and the "/api" prefix of routes/api.php (`apiPrefix` of bootstrap/app.php
// when it names another). The guards are the names of the middleware (`auth:sanctum`, `can:admin`, a class), the
// route's own and its groups', each kept through the kit's whitelist of values (a parameter that looks like a key is
// dropped); Laravel's `web` and `api` groups and a rate limit are no access rule and left out.
// Behaviour hints: Eloquent and the query builder, the parameters a request reads, the validation rules
// (`validate([…])`, a FormRequest's `rules()`) and the scheduler. A declaration in a comment (//, #, /* */) is no
// route; a path that is not a literal, a controller's own middleware and a Blade view are not read. The PHP walk
// (comments, brackets) is shared with the `symfony` adapter (engine/facts/stack-php.mjs).
import path from "node:path";
import { textIndex, callSpan, paramSignal, safeValues } from "../../engine/facts/behaviour-common.mjs";
import { STACK_PHP_PATTERNS, phpScan } from "../../engine/facts/stack-php.mjs";
import { MAX_ITEMS, withGuards, singular } from "../../engine/facts/stack-common.mjs";

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5), all bounded. */
export const LARAVEL_PATTERNS = Object.freeze({
  /** The files read: PHP, a Blade view left out. */
  FILES: /(?<!\.blade)\.php$/,
  /** A statement of the router: `Route::name(`. */
  ROUTE_START: /\bRoute::(\w{1,32})\s{0,20}\(/g,
  /** The next call of a chain, right after the previous one (read on a bounded slice): `->name(`. */
  LINK: /^\s{0,200}->\s{0,20}(\w{1,32})\s{0,20}\(/,
  /** The literal after a first argument that is a list (`Route::match([…], '/path'`). */
  AFTER_LIST: /^\s{0,200},\s{0,200}["']([^"'\n]{0,300})["']/,
  ARRAY_START: /^\s{0,200}\[/,
  /** A name of a list (middleware, actions, methods, rules): a literal, or a class (`EnsureAdmin::class`). */
  NAME: /["']([^"'\n]{1,120})["']|\b(\w{1,64})::class\b/g,
  /** A key of `Route::group([…])`'s array, or of a resource's options. */
  KEY: /["'](prefix|middleware|excluded_middleware|only|except)["']\s{0,20}=>\s{0,20}/g,
  /** A routes file a group mounts: `base_path('routes/x.php')`, `__DIR__ . '/../routes/x.php'`. */
  MOUNT: /^\s{0,200}(?:base_path\(\s{0,20}["']([^"'\n]{1,200})["']|__DIR__\s{0,20}\.\s{0,20}["']([^"'\n]{1,200})["'])/,
  API_PREFIX: /\bapiPrefix\s{0,20}:\s{0,20}["']([^"'\n]{0,100})["']/,
  /** A resource of `Route::resources([…])`: `'orders' => …`. */
  RESOURCE_PAIR: /["']([\w./-]{1,100})["']\s{0,20}=>/g,
  /** A middleware that is no access rule: Laravel's `web` and `api` groups, a rate limit. */
  NOT_A_GUARD: /^(?:web|api|bindings|throttle(?::.{0,120})?)$/,
  TRAILING: /(.)\/$/,
  // The behaviour hints.
  WHERE_LIKE:
    /(?:->|::)(?:where|orWhere)\(\s{0,20}["']([\w.]{1,64})["']\s{0,20},\s{0,20}["'](like|ilike|LIKE|ILIKE)["']\s{0,20},/g,
  WHERE_SET: /(?:->|::)(?:where|orWhere)(?:Not)?(In|Between)\(\s{0,20}["']([\w.]{1,64})["']/g,
  ORDER_BY: /(?:->|::)orderBy(Desc)?\(\s{0,20}["']([\w.]{1,64})["'](?:\s{0,20},\s{0,20}["'](asc|desc|ASC|DESC)["'])?/g,
  LATEST: /(?:->|::)(latest|oldest)\(\s{0,20}(?:["']([\w.]{1,64})["'])?/g,
  PAGINATE: /(?:->|::)(paginate|simplePaginate|cursorPaginate)\(\s{0,20}(\d{1,6})?/g,
  TAKE: /(?:->|::)(take|limit|skip|offset)\(\s{0,20}(?:(\d{1,6})\s{0,20})?\)/g,
  REQUEST_PARAM:
    /(?:\$request|\brequest\(\))->(?:query|input|get|integer|string|boolean|float|date)\(\s{0,20}["'](\w{1,40})["'](?:\s{0,20},\s{0,20}(\d{1,6}))?/g,
  VALIDATE: /(?:->validate|->validateWithBag|\bValidator::make)\(/g,
  RULES_FUNCTION: /\bfunction\s{1,20}rules\s{0,20}\(\s{0,20}\)[^{;]{0,100}\{/g,
  RULE_ENTRY: /["']([\w.-]{1,64})["']\s{0,20}=>\s{0,20}/g,
  RULE_IN: /\bRule::in\(\s{0,20}\[/g,
  SCHEDULE: /(?:\$schedule->|\bSchedule::)(?:command|job|call|exec)\(/g,
  AT: /^\s{0,20}["']?(\d{1,2})(?::(\d{2}))?["']?/,
});
const P = LARAVEL_PATTERNS;
const PHP = STACK_PHP_PATTERNS;

/** At most this many calls in a chain, and this many nested groups followed (a deeper one takes its parent's). */
const MAX_LINKS = 16;
const MAX_DEPTH = 10;
const VERBS = new Map(["get", "post", "put", "patch", "delete", "options", "any"].map((v) => [v, v.toUpperCase()]));
VERBS.set("view", "GET").set("inertia", "GET");
const KINDS = new Set([...VERBS.keys(), "match", "resource", "apiResource", "resources", "apiResources"]);
/** A resource's actions, in Laravel's order: action, method, path after the resource ("{}": its parameter). */
const ACTIONS = "index GET,create GET /create,store POST,show GET /{},edit GET /{}/edit,update PUT /{},update PATCH /{}"
  .concat(",destroy DELETE /{}")
  .split(",")
  .map((a) => a.split(" "));
const API_ACTIONS = new Set(["index", "store", "show", "update", "destroy"]);

/** The names of a list: its literals and its classes. */
const namesIn = (text) => [...text.matchAll(P.NAME)].map((m) => m[1] ?? m[2]);
/** The literal at the start of a text (a first argument: a path, a prefix, a resource; a value), or null. */
const literalOf = (text) => PHP.LITERAL.exec(text)?.[1] ?? null;
/** A route from its parts: one leading "/", none doubled, none trailing. */
const joined = (...parts) => ("/" + parts.join("/")).replace(PHP.SLASHES, "/").replace(P.TRAILING, "$1");

/**
 * The calls of a chain from the call whose "(" is at `open`: [{ name, open, args, end }]. Each call's arguments are
 * read once (callSpan, 4,000 characters at most: a longer call ends the chain with what was read); a `group(` ends
 * it unread, its body holding routes.
 * @param {string} text
 * @param {string} name
 * @param {number} open
 */
function chainOf(text, name, open) {
  const links = [];
  for (let k = 0; k < MAX_LINKS; k++) {
    if (name === "group") return [...links, { name, open, args: "", end: open + 1 }];
    const span = callSpan(text, open);
    links.push({ name, open, args: span.closed ? span.args : text.slice(open + 1, span.end), end: span.end });
    const next = span.closed ? P.LINK.exec(text.slice(span.end, span.end + 260)) : null;
    if (!next) break;
    [name, open] = [next[1], span.end + next[0].length - 1];
  }
  return links;
}

/**
 * The value at `at` of a text: an array's content, or a literal with its quotes (`'admin'`), "" else — and where it
 * ends. Bounded: 1,000 characters for an array, 300 for a literal.
 */
function valueAt(text, at) {
  if (text[at] === "[") return callSpan(text, at, 1000);
  const literal = PHP.LITERAL.exec(text.slice(at, at + 310))?.[0] ?? "";
  return { args: literal, end: at + literal.length };
}

/** The keyed values of an array (`'middleware' => ['auth']`, `'prefix' => 'admin'`): [{ key, value }], read once. */
function keyed(args) {
  const out = [];
  const re = P.KEY;
  re.lastIndex = 0;
  for (let m = re.exec(args); m; m = re.exec(args)) {
    const { args: value, end } = valueAt(args, m.index + m[0].length);
    out.push({ key: m[1], value });
    re.lastIndex = Math.max(re.lastIndex, end);
  }
  return out;
}

/**
 * A middleware as a guard keeps it (RULES.md S7): its name (a class's last segment) and its parameters (`role:admin`),
 * each through the kit's whitelist of values — a parameter that looks like a key drops the parameters, a name the
 * guard (null).
 */
function keptGuard(middleware) {
  const [name, ...rest] = middleware.split(":");
  const parts = [name, ...rest.join(":").split(",").filter(Boolean)].map((p) => p.split("\\").pop());
  const safe = parts.map((p) => safeValues([p]).length === 1);
  if (!safe[0]) return null;
  return safe.every(Boolean) && parts.length > 1 ? `${parts[0]}:${parts.slice(1).join(",")}` : parts[0];
}
/** The guards a list of middleware gives. */
const guardsIn = (text) => namesIn(text).map(keptGuard).filter(Boolean);

/**
 * The prefix and the middleware a chain's calls give: `prefix` (the last one, as Laravel's registrar keeps it),
 * `middleware`, `withoutMiddleware`, `can`.
 */
function attributes(links) {
  const own = { prefix: "", guards: [], without: [] };
  for (const { name, args } of links)
    if (name === "prefix") own.prefix = literalOf(args) ?? "";
    else if (name === "middleware") own.guards.push(...guardsIn(args));
    else if (name === "withoutMiddleware") own.without.push(...guardsIn(args));
    else if (name === "can") own.guards.push(keptGuard(`can:${namesIn(args).join(",")}`) ?? "can");
  return own;
}

/** The attributes of `Route::group([…], …)`'s array, and where its body starts. */
function groupArray(text, link) {
  const own = { prefix: "", guards: [], without: [] };
  const head = P.ARRAY_START.exec(text.slice(link.open + 1, link.open + 202));
  if (!head) return { own, from: link.open + 1 };
  const span = callSpan(text, link.open + head[0].length);
  for (const { key, value } of keyed(span.args))
    if (key === "prefix") own.prefix = literalOf(value) ?? "";
    else if (key === "middleware") own.guards.push(...guardsIn(value));
    else if (key === "excluded_middleware") own.without.push(...guardsIn(value));
  return { own, from: span.end };
}

/**
 * The guards of a scope: its parent's (already cut) and its own, those it removes and those that are no access rule
 * left out, MAX_GUARDS at most (withGuards): composing costs its own list, whatever the depth.
 */
function guardsOf(outer, own) {
  const without = new Set(own.without);
  const kept = (g) => !without.has(g) && !P.NOT_A_GUARD.test(g);
  return withGuards(outer.filter(kept), own.guards.filter(kept));
}

/** A group: its scope (prefix and guards), the routes file it mounts (MOUNT's match), where its body starts. */
function groupOf(text, links, outer) {
  const last = links.at(-1);
  const array = groupArray(text, last);
  const own = links.length > 1 ? attributes(links.slice(0, -1)) : array.own;
  const scope = { prefix: joined(outer.prefix, own.prefix), guards: guardsOf(outer.guards, own) };
  return { scope, mount: P.MOUNT.exec(text.slice(last.open + 1, last.open + 440)), from: array.from };
}

/** The parameter Laravel names after a resource: the singular of its last segment, "_" for "-" (user_profile). */
export const resourceParameter = (name) => singular(name.split("/").pop().split("-").join("_"));

/** The routes of a resource (`photos.comments`: nested), its actions those `keep` keeps. */
function resourceRoutes(name, api, keep) {
  const segments = name.split(".");
  const last = segments.length - 1;
  const base = segments.map((s, i) => (i < last ? `${s}/{${resourceParameter(s)}}` : s)).join("/");
  const parameter = `{${resourceParameter(segments[last])}}`;
  const kept = ACTIONS.filter(([action]) => (!api || API_ACTIONS.has(action)) && keep(action));
  return kept.map(([, method, suffix = ""]) => ({ method, uri: base + suffix.replace("{}", parameter) }));
}

/** The actions a resource keeps: its `->only([…])`, `->except([…])`, or its options' `'only' => […]`. */
function actionFilter(args, after) {
  const [only, except] = [[], []];
  const lists = new Map([
    ["only", only],
    ["except", except],
  ]);
  for (const { name, args: a } of after) lists.get(name)?.push(...namesIn(a));
  for (const { key, value } of keyed(args)) lists.get(key)?.push(...namesIn(value));
  return (action) => (!only.length || only.includes(action)) && !except.includes(action);
}

/** The methods and paths of `Route::match([…], '/path', …)`. */
function matchEndpoints(args) {
  const head = P.ARRAY_START.exec(args);
  if (!head) return [];
  const list = callSpan(args, head[0].length - 1, 300);
  const uri = P.AFTER_LIST.exec(args.slice(list.end, list.end + 520))?.[1];
  return uri === undefined ? [] : namesIn(list.args).map((m) => ({ method: m.toUpperCase(), uri }));
}

/** The methods and paths of a route call (a verb, `match`, a resource). */
function endpoints(link, after) {
  const { name, args } = link;
  if (VERBS.has(name)) {
    const uri = literalOf(args);
    return uri === null ? [] : [{ method: VERBS.get(name), uri }];
  }
  if (name === "match") return matchEndpoints(args);
  const keep = actionFilter(args, after);
  const api = name.startsWith("api");
  if (name.endsWith("s")) {
    const head = P.ARRAY_START.exec(args);
    const list = head ? callSpan(args, head[0].length - 1, 2000).args : "";
    return [...list.matchAll(P.RESOURCE_PAIR)].flatMap((m) => resourceRoutes(m[1], api, keep));
  }
  const resource = literalOf(args);
  return resource === null ? [] : resourceRoutes(resource, api, keep);
}

/** The routes of a chain that declares some, in the scope of its groups: [{ method, route, guards }]. */
function routesOf(links, outer) {
  const at = links.findIndex((l) => KINDS.has(l.name));
  if (at === -1) return [];
  const own = attributes([...links.slice(0, at), ...links.slice(at + 1)]);
  const [prefix, guards] = [joined(outer.prefix, own.prefix), guardsOf(outer.guards, own)];
  return endpoints(links[at], links.slice(at + 1)).map((e) => ({
    method: e.method,
    route: joined(prefix, e.uri),
    guards,
  }));
}

/**
 * The routes of one PHP file, with the prefix and middleware of the groups that hold them (a group's routes are
 * those inside its call, matched by phpScan), and the routes files it mounts: { routes: [{ method, route, line,
 * guards }], mounts: [{ target, prefix, guards }] }. Each statement is read once, a group's body walked in place;
 * the walk stops at `budget` routes.
 * @param {string} text
 * @param {string} file
 * @param {number} budget
 */
function laravelFile(text, file, budget) {
  const { comments, closing } = phpScan(text);
  const index = textIndex(text, comments);
  const [routes, mounts, groups] = [[], [], []];
  const re = P.ROUTE_START;
  re.lastIndex = 0;
  for (let m = re.exec(text); m && routes.length < budget; m = re.exec(text)) {
    if (index.inComment(m.index)) continue;
    while (groups.length && groups.at(-1).end <= m.index) groups.pop();
    const outer = groups.at(-1) ?? { prefix: "", guards: [] };
    const links = chainOf(text, m[1], m.index + m[0].length - 1);
    const last = links.at(-1);
    if (last.name !== "group") {
      const found = routesOf(links, outer).slice(0, budget - routes.length);
      for (const r of found) routes.push({ ...r, line: index.lineOf(m.index) });
      re.lastIndex = Math.max(re.lastIndex, last.end);
      continue;
    }
    const { scope, mount, from } = groupOf(text, links, outer);
    if (mount) mounts.push({ ...scope, target: mount[1] ?? path.posix.join(path.posix.dirname(file), mount[2]) });
    else if (groups.length < MAX_DEPTH) groups.push({ ...scope, end: closing.get(last.open) ?? text.length });
    re.lastIndex = Math.max(re.lastIndex, from);
  }
  return { routes, mounts };
}

/**
 * The Laravel routes of a set of PHP files (file → text): { method, route, file, line, guards }. A file another one
 * mounts (`->group(base_path('routes/x.php'))`) takes that group's prefix and middleware; routes/api.php, when no
 * file mounts it, takes "/api" (or bootstrap/app.php's `apiPrefix`). MAX_ITEMS routes at most.
 * @param {Map<string, string>} sources
 */
function laravelRoutes(sources) {
  const files = [];
  let budget = MAX_ITEMS;
  for (const [file, text] of sources)
    if (budget > 0 && text.includes("Route::")) {
      const read = laravelFile(text, file, budget);
      budget -= read.routes.length;
      files.push({ file, ...read });
    }
  const named = [...sources.values()].map((text) => P.API_PREFIX.exec(text)?.[1]).find((p) => p !== undefined);
  // The first mount of each target, found by the target or by a sub-path of it (each a lookup).
  const mounted = new Map();
  for (const m of files.flatMap((f) => f.mounts)) if (!mounted.has(m.target)) mounted.set(m.target, m);
  const mountOf = (file) =>
    file.split("/").reduce((found, _, i, parts) => found ?? mounted.get(parts.slice(i).join("/")), undefined);
  const isApi = (file) => file === "routes/api.php" || file.endsWith("/routes/api.php");
  return files.flatMap(({ file, routes }) => {
    const outer = mountOf(file) ?? { prefix: isApi(file) ? (named ?? "api") : "", guards: [] };
    return routes.map(({ method, route, line, guards }) => {
      return { method, route: joined(outer.prefix, route), file, line, guards: withGuards(outer.guards, guards) };
    });
  });
}

// ─── Behaviours ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Eloquent and the query builder: a LIKE search, a filter in a list or a range, the order. */
function conditions(text, push) {
  const via = "laravel";
  for (const m of text.matchAll(P.WHERE_LIKE)) {
    const field = m[1].split(".").pop();
    const pattern = text.slice(m.index + m[0].length, m.index + m[0].length + 80).split("\n")[0];
    push({ family: "search", signal: pattern.includes("%") ? "contains" : "like", field, via }, m.index);
    if (m[2].toLowerCase() === "ilike") push({ family: "search", signal: "caseInsensitive", field, via }, m.index);
  }
  for (const m of text.matchAll(P.WHERE_SET))
    push({ family: "filter", signal: m[1] === "In" ? "in" : "range", field: m[2].split(".").pop(), via }, m.index);
  for (const m of text.matchAll(P.ORDER_BY)) {
    const value = m[1] ? "desc" : (m[3] || "asc").toLowerCase();
    push({ family: "sort", signal: "orderBy", field: m[2].split(".").pop(), value, via }, m.index);
  }
  for (const m of text.matchAll(P.LATEST)) {
    const value = m[1] === "latest" ? "desc" : "asc";
    push({ family: "sort", signal: "orderBy", field: m[2] ?? "created_at", value, via }, m.index);
  }
}

/** The page of a query (`paginate(15)`, `take(10)`), and the parameters a request reads (`$request->query('q')`). */
function pages(text, push) {
  const via = "laravel";
  for (const m of text.matchAll(P.PAGINATE)) {
    push({ family: "pagination", signal: "pageSize", value: m[2], via }, m.index);
    if (m[1] === "cursorPaginate") push({ family: "pagination", signal: "cursor", via }, m.index);
  }
  for (const m of text.matchAll(P.TAKE)) {
    const signal = m[1] === "take" || m[1] === "limit" ? "limit" : "offset";
    push({ family: "pagination", signal, value: m[2], via }, m.index);
  }
  for (const m of text.matchAll(P.REQUEST_PARAM))
    push({ ...paramSignal(m[1]), field: m[1], value: m[2], via }, m.index);
}

/** A validation rule → its signal (the same name, unless renamed here); the rules that name a field's type. */
const RULES = new Set(["required", "email", "url", "uuid", "integer", "min", "max"]);
const RENAMED = { nullable: "optional", sometimes: "optional", regex: "pattern", size: "length", digits: "length" };
const TYPES = { numeric: "number", date: "date" };

/** The signals of one rule of a field (`max:80`, `between:1,9`, `in:a,b`). */
function ruleSignals(rule, field, at, push) {
  const colon = rule.indexOf(":");
  const name = (colon === -1 ? rule : rule.slice(0, colon)).trim();
  const param = colon === -1 ? "" : rule.slice(colon + 1);
  const via = "laravel";
  const check = (signal, value) => push({ family: "validation", signal, field, value, via }, at);
  if (RULES.has(name) || Object.hasOwn(RENAMED, name)) check(RENAMED[name] ?? name, param);
  else if (Object.hasOwn(TYPES, name)) check("type", TYPES[name]);
  else if (name === "in") push({ family: "values", signal: "enum", field, values: param.split(","), via }, at);
  else if (name === "between") for (const [k, v] of param.split(",").slice(0, 2).entries()) check(k ? "max" : "min", v);
}

/**
 * The rules of one field's value at `at` (`'required|max:80'`, `['required', Rule::in([…])]`), the lists of its
 * `Rule::in([…])` (never rules), and where the value ends; each read once.
 */
function fieldRules(body, at) {
  const { args, end } = valueAt(body, at);
  if (body[at] !== "[") return { rules: (literalOf(args) ?? "").split("|"), enums: [], end };
  const [enums, re] = [[], P.RULE_IN];
  let [outside, from] = ["", 0];
  re.lastIndex = 0;
  for (let r = re.exec(args); r; r = re.exec(args)) {
    const span = callSpan(args, r.index + r[0].length - 1, 1000);
    [outside, from] = [outside + args.slice(from, r.index), span.end];
    enums.push(namesIn(span.args));
    re.lastIndex = Math.max(re.lastIndex, span.end);
  }
  return { rules: namesIn(outside + args.slice(from)).flatMap((n) => n.split("|")), enums, end };
}

/** The rules of an array of fields (`'email' => 'required|email'`), `base` being the index of `body` in the file. */
function ruleEntries(body, base, push) {
  const re = P.RULE_ENTRY;
  re.lastIndex = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const { rules, enums, end } = fieldRules(body, m.index + m[0].length);
    for (const rule of rules) ruleSignals(rule, m[1], base + m.index, push);
    for (const values of enums)
      push({ family: "values", signal: "enum", field: m[1], values, via: "laravel" }, base + m.index);
    re.lastIndex = Math.max(re.lastIndex, end);
  }
}

/** The fields checked by `validate([…])`, `Validator::make(…)` and a FormRequest's `rules()`. */
function validation(text, push) {
  for (const re of [P.VALIDATE, P.RULES_FUNCTION]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const open = m.index + m[0].length - 1;
      const span = callSpan(text, open);
      ruleEntries(span.closed ? span.args : text.slice(open + 1, span.end), open + 1, push);
      re.lastIndex = Math.max(re.lastIndex, span.end);
    }
  }
}

/** Laravel's frequencies: the fields of the cron expression each one sets, from the minute ("_": left as it was). */
const FREQUENCIES = new Map(
  (
    "everyMinute=*|everyTwoMinutes=*/2|everyFiveMinutes=*/5|everyTenMinutes=*/10|everyFifteenMinutes=*/15|hourly=0|" +
    "everyThirtyMinutes=0,30|daily=0 0|weekdays=_ _ _ _ 1-5|weekends=_ _ _ _ 6,0|weekly=0 0 _ _ 0|monthly=0 0 1|" +
    "yearly=0 0 1 1"
  )
    .split("|")
    .map((f) => /** @type {[string, string]} */ (f.split("="))),
);
const DAYS = ["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"];

/** The fields a frequency of the scheduler sets, or null. */
function frequencyOf(name, args) {
  if (FREQUENCIES.has(name)) return FREQUENCIES.get(name);
  if (DAYS.includes(name)) return `_ _ _ _ ${DAYS.indexOf(name)}`;
  const at = P.AT.exec(args);
  if (at && (name === "dailyAt" || name === "at")) return `${Number(at[2] ?? 0)} ${Number(at[1])}`;
  return at && name === "hourlyAt" ? `${Number(at[1])}` : null;
}

/** The cron expression of a scheduled task's calls (`->cron('…')`, or its frequencies), or undefined. */
function cronOf(links) {
  const fields = ["*", "*", "*", "*", "*"];
  let known = false;
  for (const { name, args } of links) {
    if (name === "cron") return literalOf(args) ?? undefined;
    const spec = frequencyOf(name, args);
    for (const [i, v] of (spec ?? "").split(" ").entries()) if (v && v !== "_") fields[i] = v;
    known ||= !!spec;
  }
  return known ? fields.join(" ") : undefined;
}

/** The scheduler: `$schedule->command(…)->dailyAt(…)`, `Schedule::job(…)->cron(…)`. */
function schedules(text, push) {
  const re = P.SCHEDULE;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const links = chainOf(text, "command", m.index + m[0].length - 1);
    push({ family: "schedule", signal: "cron", value: cronOf(links.slice(1)), via: "laravel" }, m.index);
    re.lastIndex = Math.max(re.lastIndex, links.at(-1).end);
  }
}

export default {
  name: "laravel",
  files: P.FILES,
  api: ({ sources }) => laravelRoutes(sources),
  /** The hints of a PHP file, outside its comments (// and /* *\/ for the sink, # too here). */
  behaviours(text, sink) {
    const index = textIndex(text, phpScan(text).comments);
    const push = (s, i) => !index.inComment(i) && sink.push(s, i);
    for (const read of [conditions, pages, validation, schedules]) if (!sink.full) read(text, push);
  },
};
