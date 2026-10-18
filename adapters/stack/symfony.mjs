// Stack adapter of Symfony (ARCHITECTURE.md §5): the `#[Route(…)]` attributes of a controller's class (its prefix,
// its default methods) and of its methods — one item per method of `methods`, "ANY" when none —, and the `@Route(…)`
// annotations of the docblocks before them (read inside those comments, on purpose). The guards are the roles and
// attributes checked: `#[IsGranted(…)]` and `@IsGranted(…)` on the class or the method, the `is_granted(…)` of
// `#[Security(…)]`, and `$this->denyAccessUnlessGranted(…)` at the start of the method's body (its first 2,000
// characters) — a role that looks like a key is kept as the check's name. Behaviour hints: Doctrine's QueryBuilder
// and repositories, the query parameters of a request, the constraints of the Validator. Routes in YAML or XML
// (config/routes/), security.yaml's access_control and the constraints written as docblock annotations are not read;
// nor is a declaration in a comment that is no docblock. The PHP walk (comments) is shared with the `laravel` adapter
// (engine/facts/stack-php.mjs).
import { textIndex, callSpan, paramSignal, safeValues } from "../../engine/facts/behaviour-common.mjs";
import { SQL_PATTERNS } from "../../engine/facts/behaviour-sql.mjs";
import { STACK_PHP_PATTERNS, phpScan } from "../../engine/facts/stack-php.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5), all bounded. */
export const SYMFONY_PATTERNS = Object.freeze({
  /** The files read: PHP under a src/ folder (anchored: one start). */
  FILES: /^(?:[^/\n]{1,255}\/){0,32}?src\/(?:[^/\n]{1,255}\/){0,32}[^/\n]{1,255}\.php$/,
  /** An attribute block: `#[`, its "[" ending the match. */
  ATTRIBUTE: /#\[/g,
  /** One attribute of a block, where the previous one ended: its name (`Route`, `Assert\Length`), "(" for arguments. */
  ATTRIBUTE_ITEM: /\s{0,200}\\?([\w\\]{1,200})\s{0,20}(\(?)/y,
  SEPARATOR: /\s{0,200},/y,
  ANNOTATION: /@(Route|IsGranted|Security)\s{0,20}\(/g,
  /** A class or a method: what an attribute or an annotation applies to (`Order::class` is neither). */
  DECLARATION: /(?<![\w$:>])(class|function)\s{1,20}\w{1,128}/g,
  /** A path named: `path: '/x'`, `path="/x"`. */
  PATH: /\bpath\s{0,20}[:=]\s{0,20}["']([^"'\n]{0,300})["']/,
  /** The methods of a route: `methods: ['GET']`, `methods={"GET"}`, `methods: 'GET'`. */
  METHODS: /\bmethods\s{0,20}[:=]\s{0,20}(?:[[{]|["'](\w{1,10})["'])/,
  QUOTED: /["']([^"'\n]{1,120})["']/g,
  /** The role or attribute IsGranted checks: its first literal, or `attribute:`. */
  GRANTED: /^\s{0,200}(?:attribute\s{0,20}:\s{0,20})?["']([^"'\n]{1,120})["']/,
  /** A role checked in an expression (`#[Security("is_granted('ROLE_ADMIN')")]`). */
  IS_GRANTED: /\b(?:is_granted|has_role)\(\s{0,20}["']([^"'\n]{1,120})["']/g,
  DENY: /\$this->denyAccessUnlessGranted\(\s{0,20}["']([^"'\n]{1,120})["']/g,
  // The behaviour hints.
  WHERE: /->(?:where|andWhere|orWhere)\(/g,
  /** A comparison of DQL: `o.status = :s`, `o.status IN (:s)`, `o.price >= :min`. */
  DQL_FILTER: /\b[A-Za-z_]\w{0,63}\.(\w{1,64})\s{0,20}(=|IN\s{0,20}\(|>=?|<(?!>)=?|BETWEEN\b)/gi,
  EXPR: /->expr\(\)->(like|eq|in|gte|gt|lte|lt|between)\(\s{0,20}["'](?:[A-Za-z_]\w{0,63}\.)?(\w{1,64})["']/g,
  ORDER_BY:
    /->(?:add)?[oO]rderBy\(\s{0,20}["'](?:[A-Za-z_]\w{0,63}\.)?(\w{1,64})["'](?:\s{0,20},\s{0,20}["'](ASC|DESC|asc|desc)["'])?/g,
  FIND_BY: /->find(?:One)?By\(/g,
  ORDER_PAIR: /["'](\w{1,64})["']\s{0,20}=>\s{0,20}["'](ASC|DESC|asc|desc)["']/g,
  MAX_RESULTS: /->setMaxResults\(\s{0,20}(\d{1,6})?/g,
  FIRST_RESULT: /->setFirstResult\(/g,
  QUERY_PARAM:
    /\$request->query->(?:get|getInt|getAlpha|getAlnum|getDigits|getBoolean|getString|has)\(\s{0,20}["'](\w{1,40})["'](?:\s{0,20},\s{0,20}(\d{1,6}))?/g,
  MAP_QUERY: /#\[MapQueryParameter\b[^\]]{0,200}\]\s{0,200}(?:[?\w\\|]{1,100}\s{1,20})?\$(\w{1,40})/g,
  /** The property (or promoted parameter) after a constraint: the first `$name` before a ";", "{" or "}". */
  PROPERTY: /^[^;{}$]{0,600}\$(\w{1,64})/,
  BOUND: /\b(min|max|exactly|value)\s{0,20}[:=]\s{0,20}(-?\d{1,9})/g,
  FIRST_NUMBER: /^\s{0,200}(-?\d{1,9})/,
  CHOICES: /\bchoices\s{0,20}[:=]\s{0,20}[[{]|^\s{0,200}[[{]/,
});
const P = SYMFONY_PATTERNS;
const PHP = STACK_PHP_PATTERNS;

/** At most this many characters between an attribute and what it applies to, and read of a method's body. */
const GAP = 2000;
const BODY = 2000;
const quoted = (text) => [...text.matchAll(P.QUOTED)].map((m) => m[1]);

/**
 * Each call of `re` (a global expression ending with "(") with its arguments read once (callSpan; what was read when
 * it does not close) and their index in the text; the next call is looked for after them.
 */
function eachCall(re, text, fn) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const open = m.index + m[0].length - 1;
    const span = callSpan(text, open);
    fn(span.closed ? span.args : text.slice(open + 1, span.end), open + 1);
    re.lastIndex = Math.max(re.lastIndex, span.end);
  }
}

/** The attributes of a block's content: [{ name (its last segment), args (null: none) }], each read once. */
function attributesIn(block) {
  const out = [];
  for (let pos = 0; pos < block.length && out.length < 32;) {
    P.ATTRIBUTE_ITEM.lastIndex = pos;
    const m = P.ATTRIBUTE_ITEM.exec(block);
    if (!m) break;
    const span = m[2] ? callSpan(block, P.ATTRIBUTE_ITEM.lastIndex - 1, 4000) : null;
    out.push({ name: m[1].split("\\").pop(), args: span ? span.args : null });
    P.SEPARATOR.lastIndex = span ? span.end : P.ATTRIBUTE_ITEM.lastIndex;
    if (!P.SEPARATOR.exec(block)) break;
    pos = P.SEPARATOR.lastIndex;
  }
  return out;
}

/** The attribute blocks of a file outside its comments: [{ at, end, items }], each block read once. */
function attributeBlocks(text, index) {
  const out = [];
  eachCall(P.ATTRIBUTE, text, (args, base) => {
    if (!index.inComment(base - 2)) out.push({ at: base - 2, end: base + args.length + 1, items: attributesIn(args) });
  });
  return out;
}

/** The path and the methods of a route's arguments (an attribute's or an annotation's). */
function routeOf(args) {
  const path = PHP.LITERAL.exec(args)?.[1] ?? P.PATH.exec(args)?.[1] ?? null;
  const m = P.METHODS.exec(args);
  const list = m && !m[1] ? callSpan(args, m.index + m[0].length - 1, 300).args : "";
  const methods = m ? (m[1] ? [m[1]] : quoted(list)) : [];
  return { path, methods: methods.map((x) => x.toUpperCase()) };
}

/** A role as a guard keeps it (RULES.md S7): through the kit's whitelist of values, else the check's own name. */
const roleOr = (role, check) => (safeValues([role]).length === 1 ? role : check);

/** A declaration of an attribute or an annotation at `at`: a route, a guard (the roles it checks), or null. */
function declarationOf(name, args, at) {
  if (name === "Route" && args !== null) return { kind: "route", at, ...routeOf(args) };
  if (name !== "IsGranted" && name !== "Security") return null;
  const first = name === "IsGranted" ? P.GRANTED.exec(args ?? "")?.[1] : undefined;
  const roles = first ? [first] : [...(args ?? "").matchAll(P.IS_GRANTED)].map((m) => m[1]);
  return { kind: "guard", at, names: roles.length ? roles.map((r) => roleOr(r, name)) : [name] };
}

/** The annotations of a docblock from `start` to `end`, pushed into `out`; each annotation read once. */
function annotations(text, start, end, out) {
  const doc = text.slice(start, end);
  const re = P.ANNOTATION;
  re.lastIndex = 0;
  for (let m = re.exec(doc); m; m = re.exec(doc)) {
    const span = callSpan(doc, m.index + m[0].length - 1, 4000);
    const found = declarationOf(m[1], span.closed ? span.args : null, start + m.index);
    if (found) out.push(found);
    re.lastIndex = Math.max(re.lastIndex, span.end);
  }
}

/**
 * @typedef {{ kind: string, at: number, path?: string|null, methods?: string[], names?: string[] }} Declaration
 *   a route (path, methods), a guard (names), a class or a method, at its index
 */

/** The routes, guards, classes and methods of a file, in text order. */
function eventsOf(text, comments, index) {
  const out = /** @type {Declaration[]} */ ([]);
  for (const block of attributeBlocks(text, index))
    for (const a of block.items) {
      const found = declarationOf(a.name, a.args, block.at);
      if (found) out.push(found);
    }
  for (const [start, end] of comments) if (text.startsWith("/**", start)) annotations(text, start, end, out);
  for (const m of text.matchAll(P.DECLARATION)) if (!index.inComment(m.index)) out.push({ kind: m[1], at: m.index });
  return out.sort((a, b) => a.at - b.at);
}

/** The roles a method's body checks first (`denyAccessUnlessGranted`): its first BODY characters, up to `next`. */
function bodyGuards(text, index, at, next) {
  const window = text.slice(at, Math.min(at + BODY, next));
  const checks = [...window.matchAll(P.DENY)].filter((m) => !index.inComment(at + m.index));
  return checks.map((m) => roleOr(m[1], "denyAccessUnlessGranted"));
}

/** The class a method belongs to: its route's prefix and methods, its guards (MAX_GUARDS at most, withGuards). */
const ownerOf = (routes, guards) => ({
  prefix: routes[0]?.path ?? "",
  methods: routes[0]?.methods ?? [],
  guards: withGuards([], guards),
});

/** The items of one route of a method: one per method, its class's when it names none, else "ANY". */
function methodRoutes(r, owner, guards, file, line) {
  const route = ("/" + owner.prefix + r.path).replace(PHP.SLASHES, "/");
  const methods = r.methods.length ? r.methods : owner.methods.length ? owner.methods : ["ANY"];
  return methods.map((method) => ({ method, route, file, line, guards }));
}

/**
 * The Symfony routes of one PHP file: { method, route, file, line, guards } — line: the route's attribute or
 * annotation. An attribute applies to the class or the method that follows it, GAP characters away at most. The
 * guards of a method compose its class's (already cut), its own and its body's: MAX_GUARDS at most (withGuards).
 * `budget` routes at most.
 * @param {string} text
 * @param {string} file
 * @param {number} budget
 */
function symfonyRoutes(text, file, budget) {
  const { comments } = phpScan(text);
  const index = textIndex(text, comments);
  const events = eventsOf(text, comments, index);
  const items = [];
  let owner = ownerOf([], []);
  let pending = [];
  for (const [k, e] of events.entries()) {
    if (items.length >= budget) break;
    if (e.kind === "route" || e.kind === "guard") {
      pending.push(e);
      continue;
    }
    const near = pending.length && e.at - pending.at(-1).at <= GAP ? pending : [];
    pending = [];
    const routes = near.filter((p) => p.kind === "route" && p.path !== null);
    const guards = near.flatMap((p) => p.names ?? []);
    if (e.kind === "class") owner = ownerOf(routes, guards);
    else if (routes.length) {
      const next = k + 1 < events.length ? events[k + 1].at : text.length;
      const all = withGuards(withGuards(owner.guards, guards), bodyGuards(text, index, e.at, next));
      for (const r of routes) items.push(...methodRoutes(r, owner, all, file, index.lineOf(r.at)));
    }
  }
  return items.slice(0, budget);
}

/** The routes of a set of PHP files (file → text), MAX_ITEMS at most. */
function symfonyApi(sources) {
  const items = [];
  for (const [file, text] of sources)
    if (items.length < MAX_ITEMS) items.push(...symfonyRoutes(text, file, MAX_ITEMS - items.length));
  return items;
}

// ─── Behaviours ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The signals of a QueryBuilder condition (`'LOWER(o.name) LIKE :q'`, `'o.status IN (:s)'`) at `base`. */
function whereSignals(args, base, push) {
  const via = "doctrine";
  SQL_PATTERNS.like.lastIndex = 0;
  for (const l of args.matchAll(SQL_PATTERNS.like)) {
    const field = l[2].split(".").pop();
    const after = args.slice(l.index + l[0].length, l.index + l[0].length + 60);
    push({ family: "search", signal: after.includes("%") ? "contains" : "like", field, via }, base + l.index);
    if (l[3].toUpperCase() === "ILIKE" || ["lower", "upper"].includes(l[1]?.toLowerCase()))
      push({ family: "search", signal: "caseInsensitive", field, via }, base + l.index);
  }
  for (const f of args.matchAll(P.DQL_FILTER)) {
    const op = f[2].toUpperCase();
    const signal = op === "=" ? "equals" : op.startsWith("IN") ? "in" : "range";
    push({ family: "filter", signal, field: f[1], via }, base + f.index);
  }
}

/** An operator of Doctrine's expression builder → its family and signal. */
const EXPRESSIONS = new Map(
  Object.entries({ like: ["search", "like"], eq: ["filter", "equals"], in: ["filter", "in"] }),
);

/**
 * Doctrine (the QueryBuilder's conditions, order and page, a repository's `findBy(…, ['x' => 'DESC'])`) and the
 * query parameters a controller reads.
 */
function queries(text, push) {
  const via = "doctrine";
  eachCall(P.WHERE, text, (args, base) => whereSignals(args, base, push));
  eachCall(P.FIND_BY, text, (args, base) => {
    for (const o of args.matchAll(P.ORDER_PAIR))
      push({ family: "sort", signal: "orderBy", field: o[1], value: o[2].toLowerCase(), via }, base + o.index);
  });
  for (const m of text.matchAll(P.EXPR)) {
    const [family, signal] = EXPRESSIONS.get(m[1]) ?? ["filter", "range"];
    push({ family, signal, field: m[2], via }, m.index);
  }
  for (const m of text.matchAll(P.ORDER_BY))
    push({ family: "sort", signal: "orderBy", field: m[1], value: (m[2] || "asc").toLowerCase(), via }, m.index);
  for (const m of text.matchAll(P.MAX_RESULTS))
    push({ family: "pagination", signal: "limit", value: m[1], via }, m.index);
  for (const m of text.matchAll(P.FIRST_RESULT)) push({ family: "pagination", signal: "offset", via }, m.index);
  for (const m of text.matchAll(P.QUERY_PARAM))
    push({ ...paramSignal(m[1]), field: m[1], value: m[2], via: "symfony" }, m.index);
  for (const m of text.matchAll(P.MAP_QUERY)) push({ ...paramSignal(m[1]), field: m[1], via: "symfony" }, m.index);
}

/** A constraint of the Validator → its signal; the bounds of Length, Range and Count; the comparisons. */
const CONSTRAINTS = new Map(
  Object.entries({
    NotBlank: "required",
    NotNull: "required",
    Email: "email",
    Url: "url",
    Uuid: "uuid",
    Regex: "pattern",
    Positive: "positive",
    PositiveOrZero: "positive",
  }),
);
const BOUNDS = new Map(Object.entries({ min: "min", max: "max", exactly: "length" }));
const COMPARISONS = new Map(
  Object.entries({ GreaterThan: "min", GreaterThanOrEqual: "min", LessThan: "max", LessThanOrEqual: "max" }),
);
const CHECKS = new Set([...CONSTRAINTS.keys(), ...COMPARISONS.keys(), "Length", "Range", "Count", "Choice"]);

/** The signals of one constraint of a field (`#[Assert\Length(min: 1, max: 80)]`). */
function constraintSignals({ name, args }, field, at, push) {
  const via = "symfony";
  const text = args ?? "";
  const bounds = name === "Length" || name === "Range" || name === "Count" ? [...text.matchAll(P.BOUND)] : [];
  if (CONSTRAINTS.has(name)) push({ family: "validation", signal: CONSTRAINTS.get(name), field, via }, at);
  for (const b of bounds.filter((b) => BOUNDS.has(b[1])))
    push({ family: "validation", signal: BOUNDS.get(b[1]), field, value: Number(b[2]), via }, at);
  if (COMPARISONS.has(name)) {
    const value = P.FIRST_NUMBER.exec(text)?.[1] ?? [...text.matchAll(P.BOUND)][0]?.[2];
    push({ family: "validation", signal: COMPARISONS.get(name), field, value: Number(value), via }, at);
  }
  if (name === "Choice") {
    const list = P.CHOICES.exec(text);
    const values = list ? quoted(callSpan(text, list.index + list[0].length - 1, 1000).args) : [];
    push({ family: "values", signal: "enum", field, values, via }, at);
  }
}

/** The constraints of the Validator on a property or a promoted parameter, the attribute's line kept. */
function constraints(text, index, push) {
  for (const block of attributeBlocks(text, index)) {
    if (!block.items.some((a) => CHECKS.has(a.name))) continue;
    const field = P.PROPERTY.exec(text.slice(block.end, block.end + 620))?.[1];
    if (field) for (const a of block.items) constraintSignals(a, field, block.at, push);
  }
}

export default {
  name: "symfony",
  files: P.FILES,
  api: ({ sources }) => symfonyApi(sources),
  /** The hints of a PHP file, outside its comments (// and /* *\/ for the sink, # too here). */
  behaviours(text, sink) {
    const index = textIndex(text, phpScan(text).comments);
    const push = (s, i) => {
      if (!index.inComment(i)) sink.push(s, i);
    };
    queries(text, push);
    if (!sink.full) constraints(text, index, push);
  },
};
