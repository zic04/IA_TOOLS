// Stack adapter of Spring, in Java and Kotlin (ARCHITECTURE.md §5, §6.9). Routes: the methods of a class annotated
// @RestController or @Controller mapped by @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping or
// @RequestMapping (no path; a string; `value =`, `path =`; an array `{…}`, `[…]`, `arrayOf(…)`: one item per path;
// `method =`, none for every method: "ANY"), under the paths of the class's own @RequestMapping; a class ends at the
// "}" of its body (a type nested in it, at its own). Guards: @PreAuthorize (its expression), @Secured(…), @RolesAllowed(…), of the class and
// of the method. Not read: a mapping in a comment, a path that is not a literal (a constant), the mappings of a type
// that is no controller (a Feign client's call another service), WebFlux's functional routes, an inherited mapping.
// Behaviour hints: Spring Data derived queries of a repository interface (findByNameContainingIgnoreCase,
// findTop10By…OrderByCreatedAtDesc; not those of a @Query), Pageable, PageRequest.of, Sort.by, @PageableDefault,
// @RequestParam, Bean Validation, @Scheduled, and the JPQL of @Query (the kit's SQL reader).
// The walks of C-like code it shares with the ASP.NET Core adapter (skipBlank, topLevel, lastWord, joinPath, eachCall,
// literalsOf, guardName) are engine/facts/stack-c.mjs.
import { textIndex, callSpan, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import { sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import {
  STACK_C_PATTERNS,
  skipBlank,
  topLevel,
  lastWord,
  joinPath,
  eachCall,
  literalsOf,
  guardName,
  cScan,
  typeBody,
} from "../../engine/facts/stack-c.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const SPRING_PATTERNS = Object.freeze({
  /** What starts a declaration the routes need: a mapping, a controller, a guard, or a type declared. */
  ROUTE_TOKEN:
    /@(?:Rest)?Controller\b|@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b|@(?:PreAuthorize|Secured|RolesAllowed)\b|(?<![\w$.:@])(?:class|interface|enum|record)\s/g,
  /** What starts a declaration a behaviour hint needs. */
  HINT_TOKEN:
    /@(?:[a-z]{1,10}:)?(?:RequestParam|NotNull|NotBlank|NotEmpty|Size|Min|Max|Email|Pattern|Positive|PositiveOrZero|Scheduled|PageableDefault)\b/g,
  /** An annotation at a place: its name (a Kotlin use-site target, `@field:`, left out). */
  ANNOTATION_AT: /@(?:[a-z]{1,10}:)?([A-Za-z_$][\w$.]{0,127})/y,
  WORD_AT: /[A-Za-z_$][\w$]{0,63}/y,
  /** A named argument of an annotation ("value =", "method ="). */
  NAMED: /^\s{0,20}([A-Za-z_]\w{0,31})\s{0,20}=(?!=)/,
  /** An integer argument (60_000, 20L), a literal one ("20"). */
  NUMBER: /^\s{0,20}(-?\d[\d_]{0,11})[lL]?\s{0,20}$/,
  /** An HTTP method of `method =`: RequestMethod.GET, or GET imported. */
  VERB: /\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE)\b/g,
  ARRAY_OF: /\barrayOf\b/g,
  /** Something left of a path's expression once its literals are taken: a name (a constant), not a literal path. */
  NAME_CHAR: /[A-Za-z_$]/,
  /** A Spring Data repository declared by the file. */
  REPOSITORY: /\binterface\s{1,20}\w{1,64}\b[^{}]{0,300}Repository\b/,
  /** A query written in full: the name of the method it annotates says nothing. */
  QUERY: /@Query\(/g,
  /** A method whose name may be a derived query, declared (not called: no "." before it). */
  DERIVED: /(?<![\w$.])((?:find|read|get|query|search|stream|count|exists|delete|remove)\w{0,200})\s*\(/g,
  /** The limit of a derived query's subject: findTop10, findFirst, findDistinctTop3. */
  SUBJECT_LIMIT: /(?:First|Top)(\d{1,4})?(?:Distinct)?$/,
  /** The criteria of a derived query, split on And and Or (followed by the next property). */
  CRITERIA_SPLIT: /(?:And|Or)(?=[A-Z])/,
  /** One property of a derived query's order (OrderByLastnameAscCreatedAtDesc). */
  ORDER_PART: /([A-Z][A-Za-z0-9_]{0,63}?)(Asc|Desc)(?=[A-Z]|$)/g,
  /** A parameter of type Pageable (Java `Pageable pageable`, Kotlin `pageable: Pageable`). */
  PAGEABLE: /\bPageable\s{1,20}[a-z_]\w{0,63}\s{0,20}[,)]|:\s{0,20}Pageable\??\s{0,20}[,)=]/g,
  PAGE_REQUEST: /\bPageRequest\.of\(/g,
  SORT_BY: /\bSort\.by\(/g,
  /** A descending order written in Sort.by's arguments. */
  DESC: /\bDESC\b|\.desc\(/,
  /** The files the adapter reads, and what one of them holds to be read. */
  FILES: /\.(?:java|kt)$/,
  MARKER:
    /@(?:Rest)?Controller\b|@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b|Repository\b|@(?:[a-z]{1,10}:)?(?:Scheduled|Query|RequestParam|NotNull|NotBlank|NotEmpty|Size|Min|Max|Email|Pattern)\b|\bPageable\b|\bPageRequest\.of\(|\bSort\.by\(/,
});
const P = SPRING_PATTERNS;
const C = STACK_C_PATTERNS;

/** At most this many characters are read for one declaration, and paths per annotation (guards per route and routes
 * per adapter: engine/facts/stack-common.mjs). */
const WINDOW = 4000;
const MAX_PATHS = 8;
const MAPPINGS = new Map([
  ["GetMapping", "GET"],
  ["PostMapping", "POST"],
  ["PutMapping", "PUT"],
  ["DeleteMapping", "DELETE"],
  ["PatchMapping", "PATCH"],
  ["RequestMapping", null],
]);
const GUARDS = new Set(["PreAuthorize", "Secured", "RolesAllowed"]);
const MODIFIERS = new Set(
  "public protected private static final abstract open data sealed internal override suspend inline synchronized default inner value annotation native strictfp transient volatile const lateinit".split(
    " ",
  ),
);
const TYPES = new Set(["class", "interface", "enum", "record"]);

/**
 * @typedef {{ name: string, args: string|null, closed: boolean, index: number }} Annotation   args: null without
 *   parentheses; closed: false when they do not close within 4,000 characters
 * @typedef {{ annotations: Annotation[], kind: "class"|"member", decl: number, end: number }} Declaration
 */

/** The annotation at `k` and the index after it (its arguments read once, callSpan). */
function annotationAt(text, k) {
  P.ANNOTATION_AT.lastIndex = k;
  const m = P.ANNOTATION_AT.exec(text);
  if (!m) return null;
  const a = { name: m[1].slice(m[1].lastIndexOf(".") + 1), args: null, closed: true, index: k };
  let end = P.ANNOTATION_AT.lastIndex;
  if (text[end] === "(") {
    const span = callSpan(text, end, 4000);
    Object.assign(a, { args: span.args, closed: span.closed });
    end = span.end;
  }
  return { a, end };
}

/** The index after the name of a type whose keyword ends at `k` (`class X`, `enum class X`), or -1 without one. */
function typeNameEnd(text, k, limit) {
  for (let n = 0; n < 2; n++) {
    P.WORD_AT.lastIndex = skipBlank(text, k, limit);
    const word = P.WORD_AT.exec(text)?.[0];
    if (!word) return -1;
    k = P.WORD_AT.lastIndex;
    if (!TYPES.has(word)) return k;
  }
  return -1;
}

/**
 * The annotations and modifiers written from `at` on, and what they annotate: a type (`kind` "class") or a member —
 * a method, a field, a parameter, whose declaration starts at `decl`. Read once, WINDOW characters at most.
 * @param {string} text
 * @param {number} at
 * @returns {Declaration}
 */
function declarationAt(text, at) {
  const limit = Math.min(text.length, at + WINDOW);
  const annotations = [];
  let k = skipBlank(text, at, limit);
  for (let n = 0; n < 64 && k < limit; n++) {
    const read = text[k] === "@" ? annotationAt(text, k) : null;
    if (read) {
      annotations.push(read.a);
      k = skipBlank(text, read.end, limit);
      continue;
    }
    P.WORD_AT.lastIndex = k;
    const word = P.WORD_AT.exec(text)?.[0];
    const named = TYPES.has(word) ? typeNameEnd(text, P.WORD_AT.lastIndex, limit) : -1;
    if (named !== -1) return { annotations, kind: "class", decl: k, end: Math.max(named, at + 1) };
    if (!MODIFIERS.has(word)) break;
    k = skipBlank(text, P.WORD_AT.lastIndex, limit);
  }
  return { annotations, kind: "member", decl: k, end: Math.max(k, at + 1) };
}

/** The part of an annotation's arguments named `key` (for "value": `path =` or the positional one), its name cut. */
function argument(parts, key) {
  for (const p of parts) {
    const named = P.NAMED.exec(p);
    if (named ? named[1] === key || (key === "value" && named[1] === "path") : key === "value")
      return named ? p.slice(named[0].length) : p;
  }
  return undefined;
}

/** An integer argument of an annotation (`key = 60_000`, or the positional one for "value"), or undefined. */
function numberArg(parts, key) {
  const n = P.NUMBER.exec(argument(parts, key) ?? "");
  return n ? Number(n[1].replaceAll("_", "")) : undefined;
}

/** The paths of a mapping annotation: [""] without one; null when one is not a literal (a constant) or unread. */
function pathsOf(a) {
  if (a.args === null) return [""];
  if (!a.closed) return null;
  const expr = argument(topLevel(a.args), "value");
  if (expr === undefined) return [""];
  const paths = literalsOf(expr);
  const rest = expr.replace(C.LITERAL, "").replace(P.ARRAY_OF, "");
  return paths.length && !P.NAME_CHAR.test(rest) ? paths.slice(0, MAX_PATHS) : null;
}

/** The methods of a mapping annotation: its own, those of `method =`, or "ANY". */
function verbsOf(a) {
  const own = MAPPINGS.get(a.name);
  if (own) return [own];
  const method = a.closed && a.args ? argument(topLevel(a.args), "method") : undefined;
  const verbs = method ? [...new Set(method.match(P.VERB))] : [];
  return verbs.length ? verbs : ["ANY"];
}

/** A guard's name: @PreAuthorize's expression, `Secured(ROLE_ADMIN)`, `RolesAllowed(ADMIN)`. */
function guardOf(a) {
  const args = a.closed && a.args ? a.args : "";
  const literals = literalsOf(args);
  const inside = literals.length ? literals.join(a.name === "PreAuthorize" ? "" : ", ") : args;
  return guardName(a.name === "PreAuthorize" && inside ? inside : inside ? `${a.name}(${inside})` : a.name);
}

const guardsOf = (annotations) => annotations.filter((a) => GUARDS.has(a.name)).map(guardOf);

/** What a class's annotations give its methods: whether it is a controller, its paths, its guards. */
function classOf(annotations) {
  const mapping = annotations.find((a) => a.name === "RequestMapping");
  return {
    controller: annotations.some((a) => a.name === "RestController" || a.name === "Controller"),
    prefixes: mapping ? (pathsOf(mapping) ?? []) : [""],
    guards: withGuards([], guardsOf(annotations)),
  };
}

/** The routes of one method of a controller, pushed into `items` (MAX_ITEMS at most). */
function methodRoutes(annotations, owner, file, index, items) {
  const guards = withGuards(owner.guards, guardsOf(annotations));
  for (const a of annotations) {
    const paths = MAPPINGS.has(a.name) ? pathsOf(a) : null;
    if (!paths) continue;
    const line = index.lineOf(a.index);
    for (const method of verbsOf(a))
      for (const prefix of owner.prefixes)
        for (const path of paths)
          if (items.length < MAX_ITEMS)
            items.push({ method, route: joinPath(prefix, path), file, line, guards: [...guards] });
  }
}

/**
 * The routes of one file, pushed into `items`: a method belongs to the innermost type whose body holds it — a type
 * nested in a controller (a record, an enum, a request class) ends at the "}" of its own body, and the controller's
 * methods after it keep their prefix and guards.
 */
function fileRoutes(file, text, items) {
  const { ranges, close } = cScan(text);
  const index = textIndex(text, ranges);
  const types = [];
  P.ROUTE_TOKEN.lastIndex = 0;
  for (let m = P.ROUTE_TOKEN.exec(text); m && items.length < MAX_ITEMS; m = P.ROUTE_TOKEN.exec(text)) {
    if (index.inComment(m.index)) continue;
    const decl = declarationAt(text, m.index);
    P.ROUTE_TOKEN.lastIndex = Math.max(P.ROUTE_TOKEN.lastIndex, decl.end);
    while (types.length && types[types.length - 1].end < m.index) types.pop();
    const body = decl.kind === "class" ? typeBody(text, close, decl.end) : null;
    const owner = types.length ? types[types.length - 1].owner : null;
    if (body) types.push({ owner: classOf(decl.annotations), end: body.end });
    else if (decl.kind === "member" && owner?.controller) methodRoutes(decl.annotations, owner, file, index, items);
  }
}

/**
 * The Spring routes of a set of Java and Kotlin files (file → text): { method, route, file, line, guards }, in the
 * order of the files and of their text, MAX_ITEMS at most. A declaration is read once (its annotations, 4,000
 * characters at most); the comments, strings and brackets of a file by one walk (cScan).
 * @param {Map<string, string>} sources
 */
export function springRoutes(sources) {
  const items = [];
  for (const [file, text] of sources) if (items.length < MAX_ITEMS) fileRoutes(file, text, items);
  return items;
}

// ─── Behaviour hints ──────────────────────────────────────────────────────────────────────────────────────────────

const VIA_DATA = "spring-data";
const VIA_VALIDATION = "bean-validation";
/**
 * A derived query's operator (the end of a criterion) → its signal: the first that ends the criterion wins, so that
 * NotIn is read before In, NotNull before Not. A property's "Is" before its operator is dropped (AgeIsNull).
 */
const OPERATORS = [
  ["filter not", "NotContaining NotLike NotIn"],
  ["filter equals", "NotNull Null NotEmpty Empty True False"],
  ["search contains", "Containing Contains"],
  ["search startsWith", "StartingWith StartsWith"],
  ["search endsWith", "EndingWith EndsWith"],
  ["search like", "Like"],
  ["filter in", "In"],
  ["filter range", "Between LessThanEqual LessThan GreaterThanEqual GreaterThan Before After"],
  ["search regex", "MatchesRegex Regex Matches"],
  ["filter not", "Not"],
  ["filter equals", "Equals Is"],
].flatMap(([signal, suffixes]) => suffixes.split(" ").map((suffix) => [suffix, ...signal.split(" ")]));
/** A Bean Validation annotation without a value → its signal. */
const CHECKS = new Map([
  ["NotNull", "required"],
  ["NotBlank", "required"],
  ["NotEmpty", "required"],
  ["Email", "email"],
  ["Pattern", "pattern"],
  ["Positive", "positive"],
  ["PositiveOrZero", "positive"],
]);

/** A property of a derived query as a field: CustomerName → customerName, Customer_Name → customer.name. */
const propertyField = (property) =>
  property
    .split("_")
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => s[0].toLowerCase() + s.slice(1))
    .join(".");

/** The criteria of a derived query (CustomerNameContainingIgnoreCaseAndStatusIn): one hint or two each. */
function criteriaHints(criteria) {
  const foldAll = ["AllIgnoreCase", "AllIgnoringCase"].find((s) => criteria.endsWith(s));
  const hints = [];
  for (const part of (foldAll ? criteria.slice(0, -foldAll.length) : criteria).split(P.CRITERIA_SPLIT).slice(0, 10)) {
    const fold = ["IgnoreCase", "IgnoringCase"].find((s) => part.endsWith(s));
    const p = fold ? part.slice(0, -fold.length) : part;
    const op = OPERATORS.find(([suffix]) => p.endsWith(suffix) && p.length > suffix.length);
    let property = op ? p.slice(0, -op[0].length) : p;
    if (property.endsWith("Is") && property.length > 2) property = property.slice(0, -2);
    if (!property) continue;
    const field = propertyField(property);
    hints.push({ family: op?.[1] ?? "filter", signal: op?.[2] ?? "equals", field, via: VIA_DATA });
    if (fold || foldAll) hints.push({ family: "search", signal: "caseInsensitive", field, via: VIA_DATA });
  }
  return hints;
}

/** The hints of a derived query's name (findTop10ByCustomerNameContainingOrderByCreatedAtDesc), [] for another. */
function derivedHints(name) {
  const by = name.indexOf("By");
  const predicate = name.slice(by + 2);
  if (by === -1 || !(predicate[0] >= "A" && predicate[0] <= "Z")) return [];
  const hints = [];
  const top = P.SUBJECT_LIMIT.exec(name.slice(0, by));
  if (top) hints.push({ family: "pagination", signal: "limit", value: Number(top[1] || 1), via: VIA_DATA });
  const order = predicate.indexOf("OrderBy");
  hints.push(...criteriaHints(order === -1 ? predicate : predicate.slice(0, order)));
  const sort = order === -1 ? "" : predicate.slice(order + 7);
  /** @type {Array<[string, string]>} property, direction */
  const parts = [...sort.matchAll(P.ORDER_PART)].slice(0, 10).map((m) => [m[1], m[2]]);
  if (!parts.length && sort) parts.push([sort, "Asc"]);
  for (const [property, direction] of parts)
    hints.push({
      family: "sort",
      signal: "orderBy",
      field: propertyField(property),
      value: direction.toLowerCase(),
      via: VIA_DATA,
    });
  return hints;
}

/**
 * Whether the method named at `at` is annotated by a @Query (its derived name is then no query): the last @Query
 * that ends before it (a binary search in `ends`) ends 400 characters away at most, with no ";", "{" or "}" between.
 */
function underQuery(text, ends, at) {
  let lo = 0;
  let hi = ends.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ends[mid] <= at) lo = mid + 1;
    else hi = mid;
  }
  const end = lo > 0 ? ends[lo - 1] : -1;
  if (end === -1 || at - end > 400) return false;
  for (let k = end; k < at; k++) if (text[k] === ";" || text[k] === "{" || text[k] === "}") return false;
  return true;
}

/** The derived queries of a repository interface (its methods declared, those of a @Query left out). */
function derivedQueries(text, sink) {
  const ends = [];
  eachCall(P.QUERY, text, (args, end) => ends.push(end));
  P.DERIVED.lastIndex = 0;
  for (let m = P.DERIVED.exec(text); m && !sink.full; m = P.DERIVED.exec(text))
    if (!underQuery(text, ends, m.index)) for (const hint of derivedHints(m[1])) sink.push(hint, m.index);
}

/** Pageable parameters, PageRequest.of(page, size), Sort.by(…). */
function paging(text, sink) {
  const push = sink.push;
  for (const m of text.matchAll(P.PAGEABLE)) push({ family: "pagination", signal: "page", via: VIA_DATA }, m.index);
  eachCall(P.PAGE_REQUEST, text, (args, end, m) => {
    push({ family: "pagination", signal: "page", via: VIA_DATA }, m.index);
    const size = numberArg(topLevel(args).slice(1, 2), "value");
    push({ family: "pagination", signal: "pageSize", value: size, via: VIA_DATA }, m.index);
  });
  eachCall(P.SORT_BY, text, (args, end, m) => {
    const value = P.DESC.test(args) || text.startsWith(".descending()", end) ? "desc" : "asc";
    for (const field of literalsOf(args).slice(0, 10))
      push({ family: "sort", signal: "orderBy", field, value, via: VIA_DATA }, m.index);
  });
}

/**
 * The name a member declares (a field, a parameter, a method): Java's last identifier before its end, Kotlin's
 * before its ":". Read up to its end — ";", "=", ",", a bracket, a line's end, the next annotation —, 160 characters
 * at most.
 */
function declaredName(text, decl) {
  const end = Math.min(text.length, decl + 160);
  let k = decl;
  let colon = -1;
  for (let depth = 0; k < end; k++) {
    const ch = text[k];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === ":" && colon === -1) colon = k;
    else if (ch === "@" || (depth <= 0 && ";=,(){\n".includes(ch))) break;
  }
  return lastWord(text, decl, colon === -1 ? k : colon);
}

/** A hint of Bean Validation. */
const check = (signal, field, value) => ({ family: "validation", signal, field, value, via: VIA_VALIDATION });

/** The hints of the annotations that take arguments, by name: (parts, field) → the hints. */
const HINTS = new Map(
  /** @type {Array<[string, (parts: string[], field?: string) => object[]]>} */ ([
    [
      "Size",
      (parts, field) =>
        ["min", "max"]
          .map((signal) => check(signal, field, numberArg(parts, signal)))
          .filter((h) => h.value !== undefined),
    ],
    ["Min", (parts, field) => [check("min", field, numberArg(parts, "value"))]],
    ["Max", (parts, field) => [check("max", field, numberArg(parts, "value"))]],
    [
      "RequestParam",
      (parts, field) => {
        const name = literalsOf(argument(parts, "name") ?? argument(parts, "value") ?? "")[0] ?? field;
        const fallback = literalsOf(argument(parts, "defaultValue") ?? "")[0] ?? "";
        const value = C.DIGITS.test(fallback) ? Number(fallback) : undefined;
        return name ? [{ ...paramSignal(name), field: name, value, via: "spring" }] : [];
      },
    ],
    [
      "Scheduled",
      (parts) => {
        const cron = argument(parts, "cron");
        if (cron) return [{ family: "schedule", signal: "cron", value: literalsOf(cron)[0], via: "spring" }];
        const every = numberArg(parts, "fixedRate") ?? numberArg(parts, "fixedDelay");
        return [{ family: "schedule", signal: "interval", value: every, via: "spring" }];
      },
    ],
    [
      "PageableDefault",
      (parts) => {
        const value = numberArg(parts, "size") ?? numberArg(parts, "value");
        return [{ family: "pagination", signal: "pageSize", value, via: VIA_DATA }];
      },
    ],
  ]),
);

/**
 * The hints of one annotation of a member: a check of Bean Validation (min and max only with their value), a query
 * parameter, a scheduled job, a page's size.
 */
function hintsOfAnnotation(a, field) {
  if (CHECKS.has(a.name)) return [check(CHECKS.get(a.name), field)];
  return HINTS.get(a.name)?.(a.closed && a.args ? topLevel(a.args) : [], field) ?? [];
}

/** The annotations of members: Bean Validation, @RequestParam, @Scheduled, @PageableDefault. */
function annotationHints(text, sink) {
  P.HINT_TOKEN.lastIndex = 0;
  for (let m = P.HINT_TOKEN.exec(text); m && !sink.full; m = P.HINT_TOKEN.exec(text)) {
    const decl = declarationAt(text, m.index);
    P.HINT_TOKEN.lastIndex = Math.max(P.HINT_TOKEN.lastIndex, decl.end);
    if (decl.kind !== "member") continue;
    const field = declaredName(text, decl.decl);
    for (const a of decl.annotations) for (const hint of hintsOfAnnotation(a, field)) sink.push(hint, a.index);
  }
}

export default {
  name: "spring",
  files: P.FILES,
  marker: P.MARKER,
  api: ({ sources }) => springRoutes(sources),
  /**
   * Every behaviour hint of a Java or Kotlin text, pushed into the sink of its file (engine/facts/behaviour-common.mjs).
   * @param {string} text
   * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
   */
  behaviours(text, sink) {
    if (P.REPOSITORY.test(text)) derivedQueries(text, sink);
    for (const read of [paging, annotationHints, sqlBehaviours]) if (!sink.full) read(text, sink);
  },
};
