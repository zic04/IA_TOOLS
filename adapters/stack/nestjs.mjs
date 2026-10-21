// Stack adapter of NestJS (ARCHITECTURE.md §5): the routes of its controllers — `@Controller('orders')`,
// `@Controller({ path: 'orders' })`, `@Controller()`, then `@Get()`, `@Get(':id')`, `@Post`, `@Put`, `@Patch`,
// `@Delete`, `@Options`, `@Head` and `@All` ("ANY") on the methods of the class — under the global prefix
// (`app.setGlobalPrefix('api')` of main.ts, when the application sets one: two different ones are left out rather than
// guessed). The guards are the global ones (`app.useGlobalGuards(…)`, a provider `APP_GUARD`), then those of the class,
// then those of the method: `@UseGuards(AuthGuard('jwt'), RolesGuard)` → "AuthGuard('jwt')", "RolesGuard",
// `@Roles('admin')` → "Roles(admin)"; a route marked `@Public()` (class or method) has none. A path that is not a
// literal, a module's prefix (`RouterModule.register`) and URI versioning are not read. The behaviour hints: the query
// parameters a handler reads (`@Query('q')`), the checks of class-validator on the fields of a DTO, the scheduled jobs
// (`@Cron`, `@Interval`). A decorator in a comment is none. The literal of a decorator's arguments, the name of a guard
// and the roles of a list are read as the front-end adapters read them (engine/facts/stack-js.mjs).
import { textIndex, jsCommentRanges, callSpan, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import { literalTree, guardName, roleValues } from "../../engine/facts/stack-js.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

/** A decorator, and whether it is called: `@Get(`, `@Injectable(`, `@Public`. */
const DECORATOR = /@([A-Za-z_$][\w$]{0,63})(\s{0,20}\()?/g;
/** What a group of decorators decorates (sticky, at its first word): a class, or a member and its name. */
const MEMBER =
  /(?:(?:export|default|abstract|declare|public|private|protected|readonly|static|async|override|accessor|get|set)\s{1,20}){0,8}(class\b|[A-Za-z_$][\w$]{0,63})/y;
const GLOBAL_PREFIX = /\.setGlobalPrefix\(\s{0,20}["'`]([^"'`\n]{0,200})["'`]/g;
const GLOBAL_GUARDS = /\.useGlobalGuards\(/g;
const APP_GUARD =
  /\bprovide\s{0,20}:\s{0,20}APP_GUARD\s{0,20},\s{0,20}use(?:Class|Existing)\s{0,20}:\s{0,20}([A-Za-z_$][\w$]{0,63})/g;
/** The path of `@Controller({ path: … })`: a string or an array of them. */
const PATH_OPTION = /\bpath\s{0,20}:\s{0,20}(\[[^\]]{0,600}\]|["'`][^"'`\n]{0,300}["'`])/;
const QUOTED = /["'`]([^"'`\n]{0,300})["'`]/g;
/** What may stand between the strings of a list of paths: blanks, commas, its brackets. */
const PATH_SEPARATORS = /[\s,[\]]/g;
/** The slashes of a route: doubled, and at its end. */
const SLASHES = /\/{2,}/g;
const TRAILING_SLASH = /\/$/;
/** The first argument when it is a string: `@Query('q')`, `@Cron('0 * * * *')`. */
const FIRST_LITERAL = /^\s{0,20}["'`]([^"'`\n]{1,200})["'`]/;
/** An argument that is a number: `@MaxLength(80)`, `@Length(1, 80)`. */
const NUMBER = /^\s{0,20}(\d{1,9})\s{0,20}$/;
/** The last argument when it is a number: `@Interval(5000)`, `@Interval('sync', 5000)`. */
const LAST_NUMBER = /(?:^|[\s,(])(\d{1,9})\s{0,20}$/;
const ROLES = /^(?:Roles|HasRoles|RequireRoles|Permissions|RequirePermissions|Scopes)$/;
const PUBLIC = /^(?:Public|IsPublic|AllowAnonymous|SkipAuth|NoAuth)$/;
/** A decorator of class-validator (what makes a field checked: required unless `@IsOptional()`). */
const VALIDATOR =
  /^(?:Is[A-Z][\w$]{0,40}|Min|Max|MinLength|MaxLength|Length|Matches|Array[A-Z][\w$]{0,20}|ValidateNested|Equals|NotEquals|Contains|NotContains)$/;
const MARKER =
  /@Controller\(|\.setGlobalPrefix\(|\.useGlobalGuards\(|\bAPP_GUARD\b|["'](?:class-validator|@nestjs\/schedule)["']/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const NESTJS_PATTERNS = Object.freeze({
  DECORATOR,
  MEMBER,
  GLOBAL_PREFIX,
  GLOBAL_GUARDS,
  APP_GUARD,
  PATH_OPTION,
  QUOTED,
  PATH_SEPARATORS,
  SLASHES,
  TRAILING_SLASH,
  FIRST_LITERAL,
  NUMBER,
  LAST_NUMBER,
  VALIDATOR,
  MARKER,
});

const HTTP = new Map([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Options", "OPTIONS"],
  ["Head", "HEAD"],
  ["All", "ANY"],
]);
/** The checks of class-validator kept as hints: a signal alone, or a bound (its number). */
const SIMPLE = new Map([
  ["IsEmail", "email"],
  ["IsUrl", "url"],
  ["IsUUID", "uuid"],
  ["Matches", "pattern"],
  ["IsInt", "integer"],
  ["IsPositive", "positive"],
]);
const BOUND = new Map([
  ["MinLength", "min"],
  ["Min", "min"],
  ["MaxLength", "max"],
  ["Max", "max"],
]);
/** At most this many characters of blanks and comments between two decorators of a group. */
const GAP = 1000;
/** At most this many paths of one decorator (`@Controller(['a', 'b'])`). */
const MAX_PATHS = 8;

const isBlank = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

/** The index of the first character after `i` that is neither blank nor in a comment (GAP characters at most). */
function afterBlanks(text, i) {
  const limit = Math.min(text.length, i + GAP);
  let k = i;
  while (k < limit)
    if (isBlank(text[k])) k++;
    else if (text[k] === "/" && text[k + 1] === "/") while (k < limit && text[k] !== "\n") k++;
    else if (text[k] === "/" && text[k + 1] === "*") {
      for (k += 2; k + 1 < limit && !(text[k] === "*" && text[k + 1] === "/");) k++;
      k += 2;
    } else break;
  return k;
}

/** What follows a group of decorators: { kind: "class" } or { kind: "member", name, at } (name null when unknown). */
function targetAt(text, i) {
  MEMBER.lastIndex = i;
  const m = MEMBER.exec(text);
  if (m?.[1] === "class") return { kind: "class", name: null, at: i };
  return { kind: "member", name: m ? m[1] : null, at: m ? i + m[0].length - m[1].length : i };
}

/**
 * The groups of decorators of a file, in text order — decorators written one after the other, blanks and comments
 * between — with what they decorate. Each decorator's arguments are read once (callSpan, 4,000 characters at most),
 * the next one looked for after them.
 * @param {string} text
 * @param {{ inComment: (i: number) => boolean }} index
 */
function decoratorGroups(text, index) {
  const groups = [];
  let decorators = null;
  let expected = -1;
  DECORATOR.lastIndex = 0;
  for (let m = DECORATOR.exec(text); m; m = DECORATOR.exec(text)) {
    if (index.inComment(m.index)) continue;
    const open = m[2] ? m.index + m[0].length - 1 : -1;
    const span = open === -1 ? { args: "", end: m.index + m[0].length, closed: true } : callSpan(text, open, 4000);
    DECORATOR.lastIndex = Math.max(DECORATOR.lastIndex, span.end);
    if (decorators && m.index !== expected)
      groups.push({ decorators, target: { kind: "member", name: null, at: expected } });
    if (!decorators || m.index !== expected) decorators = [];
    decorators.push({ name: m[1], args: span.args, closed: span.closed, at: m.index, open });
    const next = afterBlanks(text, span.end);
    if (text[next] === "@") expected = next;
    else {
      groups.push({ decorators, target: targetAt(text, next) });
      decorators = null;
    }
  }
  if (decorators) groups.push({ decorators, target: { kind: "member", name: null, at: text.length } });
  return groups;
}

/** The guard names of a call's arguments (`UseGuards(…)`, `useGlobalGuards(…)`), read as a literal (literalTree). */
const guardNames = (text, args) =>
  args.parts
    .filter((p) => p.first >= 0)
    .map((p) => guardName(text.slice(p.first, Math.min(p.end, p.first + 400))))
    .filter(Boolean);

/** The guards of a group of decorators, and whether it marks its routes public. */
function guardsOf(text, decorators) {
  const guards = [];
  let open = false;
  for (const d of decorators)
    if (d.name === "UseGuards" && d.open !== -1) guards.push(...guardNames(text, literalTree(text, d.open, 4000)));
    else if (ROLES.test(d.name)) {
      const values = roleValues(d.args);
      guards.push(values.length ? `${d.name}(${values.join(", ")})` : d.name);
    } else if (PUBLIC.test(d.name)) open = true;
  return { guards, open };
}

/** The paths of `@Controller(…)` or `@Get(…)`: [""] without one, [] when it is not a literal (not read). */
function pathsOf(args) {
  const text = args.trim();
  const list = text.startsWith("{") ? (PATH_OPTION.exec(text)?.[1] ?? "") : text;
  if (!list) return [""];
  const values = [...list.matchAll(QUOTED)].map((m) => m[1]);
  const literal = list.replace(QUOTED, "").replace(PATH_SEPARATORS, "") === "";
  return values.length && literal ? values.slice(0, MAX_PATHS) : [];
}

const routeOf = (...segments) => {
  const route = `/${segments.join("/")}`.replace(SLASHES, "/");
  return route.length > 1 ? route.replace(TRAILING_SLASH, "") : route;
};

/** The global prefix (when the application sets one only) and the global guards of a set of files. */
function globals(files) {
  const prefixes = new Set();
  const guards = [];
  for (const { text, index } of files) {
    for (const m of text.matchAll(GLOBAL_PREFIX)) if (!index.inComment(m.index)) prefixes.add(m[1]);
    for (const m of text.matchAll(APP_GUARD)) if (!index.inComment(m.index)) guards.push(m[1]);
    GLOBAL_GUARDS.lastIndex = 0;
    for (let m = GLOBAL_GUARDS.exec(text); m; m = GLOBAL_GUARDS.exec(text)) {
      if (index.inComment(m.index)) continue;
      const args = literalTree(text, m.index + m[0].length - 1, 4000);
      guards.push(...guardNames(text, args));
      GLOBAL_GUARDS.lastIndex = Math.max(GLOBAL_GUARDS.lastIndex, args.end);
    }
  }
  return { prefix: prefixes.size === 1 ? [...prefixes][0] : "", guards: withGuards([], guards) };
}

/** The controller a class group declares: its paths, its guards composed with the global ones, whether it is public. */
function controllerOf(text, decorators, globalGuards) {
  const c = decorators.find((d) => d.name === "Controller");
  if (!c) return null;
  const { guards, open } = guardsOf(text, decorators);
  return { paths: c.closed ? pathsOf(c.args) : [], guards: withGuards(globalGuards, guards), open };
}

/**
 * The routes of the controllers of one file, added to `items` until it holds MAX_ITEMS; each route's guards are its
 * controller's and its own, MAX_GUARDS at most (withGuards).
 */
function controllerRoutes({ file, text, index }, prefix, globalGuards, items) {
  let controller = null;
  for (const { decorators, target } of decoratorGroups(text, index)) {
    if (target.kind === "class") controller = controllerOf(text, decorators, globalGuards);
    if (target.kind === "class" || !controller) continue;
    const own = guardsOf(text, decorators);
    const guards = own.open || controller.open ? [] : withGuards(controller.guards, own.guards);
    for (const d of decorators.filter((x) => HTTP.has(x.name)))
      for (const path of d.closed ? pathsOf(d.args) : [])
        for (const base of controller.paths) {
          if (items.length >= MAX_ITEMS) return;
          const line = index.lineOf(d.at);
          items.push({ method: HTTP.get(d.name), route: routeOf(prefix, base, path), file, line, guards });
        }
  }
}

/**
 * The NestJS routes of a set of TypeScript files (file → text): { method, route, file, line, guards }, in text order,
 * MAX_ITEMS at most.
 * @param {Map<string, string>} sources
 */
export function nestRoutes(sources) {
  const files = [...sources].map(([file, text]) => ({ file, text, index: textIndex(text, jsCommentRanges(text)) }));
  const { prefix, guards } = globals(files);
  const items = [];
  for (const f of files) controllerRoutes(f, prefix, guards, items);
  return items;
}

/** The hints of one check of class-validator: [{ family, signal, value?, values? }]. */
function checksOf(d) {
  const numbers = d.args.split(",").map((s) => (NUMBER.test(s) ? Number(NUMBER.exec(s)[1]) : undefined));
  if (SIMPLE.has(d.name)) return [{ family: "validation", signal: SIMPLE.get(d.name) }];
  if (BOUND.has(d.name)) return [{ family: "validation", signal: BOUND.get(d.name), value: numbers[0] }];
  if (d.name === "Length")
    return [
      { family: "validation", signal: "min", value: numbers[0] },
      { family: "validation", signal: "max", value: numbers[1] },
    ];
  if (d.name === "IsIn")
    return [{ family: "values", signal: "enum", values: [...d.args.matchAll(QUOTED)].map((m) => m[1]) }];
  return [];
}

/** The hint of a decorator of a handler or a job: a query parameter it reads, a schedule; null for another. */
function callHint(d) {
  const first = FIRST_LITERAL.exec(d.args)?.[1];
  if (d.name === "Query" && first) return { ...paramSignal(first), field: first, via: "nestjs" };
  if (d.name === "Cron") return { family: "schedule", signal: "cron", value: first, via: "nestjs" };
  if (d.name !== "Interval") return null;
  const every = LAST_NUMBER.exec(d.args);
  return { family: "schedule", signal: "interval", value: every ? Number(every[1]) : undefined, via: "nestjs" };
}

/**
 * The hints of one group of decorators: its query parameters and its scheduled jobs (at each decorator), the checks
 * of class-validator on its field (at the field), which is required unless one is `@IsOptional()`.
 */
function groupHints({ decorators, target }, sink) {
  const field = target.kind === "member" ? target.name : null;
  const checks = field ? decorators.filter((d) => VALIDATOR.test(d.name)) : [];
  for (const d of decorators) {
    const hint = callHint(d);
    if (hint) sink.push(hint, d.at);
  }
  for (const d of checks)
    for (const hint of checksOf(d)) sink.push({ ...hint, field, via: "class-validator" }, target.at);
  const signal = checks.some((d) => d.name === "IsOptional") ? "optional" : "required";
  if (checks.length) sink.push({ family: "validation", signal, field, via: "class-validator" }, target.at);
}

/**
 * The behaviour hints of a NestJS file, pushed into the sink of the file (engine/facts/behaviour-common.mjs).
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function nestBehaviours(text, sink) {
  const index = textIndex(text, jsCommentRanges(text));
  for (const group of decoratorGroups(text, index)) {
    if (sink.full) return;
    groupHints(group, sink);
  }
}

export default {
  name: "nestjs",
  files: /\.ts$/,
  marker: MARKER,
  api: ({ sources }) => nestRoutes(sources),
  behaviours: (text, sink) => nestBehaviours(text, sink),
};
