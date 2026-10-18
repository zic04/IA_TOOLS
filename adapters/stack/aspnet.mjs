// Stack adapter of ASP.NET Core, in C# (ARCHITECTURE.md §5, §6.9). Controllers: a class with [ApiController], or
// deriving from Controller, ControllerBase or a base named like them, or named "…Controller"; its [Route] templates
// ([controller]: the class's name without "Controller", as written; [action]: the method's, without "Async"), each
// action's [HttpGet("…")], [HttpPost]… and [Route] (a template starting with "/" or "~/" ignores the controller's).
// The [Route] and [Authorize] of a base class, in any file, are inherited. Minimal APIs: app.MapGet("/path", …),
// MapPost, MapPut, MapDelete, MapPatch, MapMethods("/x", new[] { "GET" }, …), under the prefix of their group
// (`var api = app.MapGroup("/api")`, by its variable in the same file, or chained). Guards: [Authorize],
// [Authorize(Roles = "Admin")] → "Authorize(Roles = Admin)", of the class and of the action; [AllowAnonymous]: no
// guard; RequireAuthorization(…) chained after a map call or on its group, AllowAnonymous() chained. Not read: a
// declaration in a comment, a template that is not a literal, conventional routing (an action without a template),
// the other part of a partial class, Razor Pages, FluentValidation.
// Behaviour hints: LINQ and EF Core (a Where's Contains, StartsWith, EndsWith, ==, comparisons, a list's Contains;
// EF.Functions.Like; OrderBy and ThenBy; Skip and Take), [FromQuery] parameters, DataAnnotations, Hangfire's
// RecurringJob, Quartz's cron schedules. The walks of C-like code are shared with the Spring adapter
// (engine/facts/stack-c.mjs).
import { textIndex, callSpan, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import {
  isBlank,
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

/** An attribute section ([…]; not an index: no name, "]", ")", ">", "?" or "." before it) and its first letter. */
const SECTION = /(?<![\w\])>?.])\[\s{0,20}(?:[a-z]{1,10}\s{0,20}:\s{0,20})?[A-Z]/g;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const ASPNET_PATTERNS = Object.freeze({
  SECTION,
  /** What starts a declaration the routes need: an attribute section, or a type declared. */
  TOKEN: new RegExp(`${SECTION.source}|(?<![\\w$.@])(?:class|record|struct|interface)\\s`, "g"),
  /** An attribute of a section: its target (`property:`) left out, its name, "(" when it has arguments. */
  ATTRIBUTE: /^\s{0,20}(?:[a-z]{1,10}\s{0,20}:\s{0,20})?([A-Za-z_][\w.]{0,127})\s{0,20}(\()?/,
  WORD_AT: /[A-Za-z_]\w{0,63}/y,
  WORD_CHAR: /\w/,
  /** An argument that is one literal (a verbatim string too). */
  ONLY_LITERAL: /^@?"([^"\n]{0,500})"$/,
  /** A named argument: `Name = …` (a property) or `template: …` (a parameter). */
  NAMED: /^\s{0,20}([A-Za-z_]\w{0,31})\s{0,20}(?:=(?!=)|:(?!:))/,
  NUMBER: /^\s{0,20}(-?\d{1,9})\s{0,20}$/,
  QUOTES: /"/g,
  CONTROLLER_TOKEN: /\[controller\]/gi,
  ACTION_TOKEN: /\[action\]/gi,
  /** A minimal API: a map call, or a guard on a group's variable (`api.RequireAuthorization(…)`). */
  MINIMAL:
    /\.Map(Get|Post|Put|Delete|Patch|Methods|Group)\(|(?<![\w$.])([A-Za-z_]\w{0,63})\s{0,20}\.\s{0,20}(RequireAuthorization|AllowAnonymous)\(/g,
  WHERE: /\.Where\(/g,
  /** o.Customer.ToLower().Contains(q): the field, the calls between, the comparison. */
  TEXT_MATCH: /\.([A-Za-z_]\w{0,63})((?:\.\w{1,24}\([^()]{0,40}\)){0,4})\.(Contains|StartsWith|EndsWith)\(/g,
  FOLD: /\.To(?:Lower|Upper)(?:Invariant)?\(/,
  EQUALS: /\.([A-Za-z_]\w{0,63})\s{0,20}==\s{0,20}(?!null\b|true\b|false\b)[\w"]/g,
  RANGE: /\.([A-Za-z_]\w{0,63})\s{0,20}(?:>=|<=|>|<)\s{0,20}[\w(]/g,
  /** statuses.Contains(o.Status): a list that holds the field's value. */
  IN_LIST: /(?<![\w.])[A-Za-z_]\w{0,63}\.Contains\(\s{0,20}[A-Za-z_]\w{0,63}\.([A-Za-z_]\w{0,63})\s{0,20}\)/g,
  EF_LIKE: /\bEF\.Functions\.(Like|ILike)\(\s{0,20}[A-Za-z_]\w{0,63}\.([A-Za-z_][\w.]{0,127})\s{0,20},/g,
  ORDER:
    /\.(OrderBy|OrderByDescending|ThenBy|ThenByDescending)\(\s{0,20}([A-Za-z_]\w{0,63})\s{0,20}=>\s{0,20}\2\.([A-Za-z_][\w.]{0,127})/g,
  SKIP_TAKE: /\.(Skip|Take)\(\s{0,20}(\d{1,6}\b)?/g,
  RECURRING: /\bRecurringJob\.AddOrUpdate(?:<[^<>()]{0,200}>)?\(/g,
  /** A schedule of Hangfire's Cron class, without an argument (Cron.Daily, Cron.Daily()). */
  CRON_HELPER: /\bCron\.(Minutely|Hourly|Daily|Weekly|Monthly|Yearly)\b(?!\s{0,20}\(\s{0,20}[^\s)])/,
  CRON_LIKE: /^[\d*/,?LW# -]{9,64}$/,
  QUARTZ: /\.(?:WithCronSchedule|CronSchedule)\(\s{0,20}"([^"\n]{1,64})"/g,
  /** The files the adapter reads, and what one of them holds to be read. */
  FILES: /\.cs$/,
  MARKER:
    /\b(?:ApiController|ControllerBase|Controller|Http(?:Get|Post|Put|Delete|Patch)|Authorize|Required|StringLength|MaxLength|MinLength|Range|EmailAddress|RegularExpression|FromQuery|RecurringJob|WithCronSchedule)\b|\.Map(?:Get|Post|Put|Delete|Patch|Methods|Group)\(|\.(?:Where|OrderBy|OrderByDescending|Skip|Take)\(/,
});
const P = ASPNET_PATTERNS;

/** At most this many characters are read for one declaration, and templates per class (guards per route and routes
 * per adapter: engine/facts/stack-common.mjs); a group's prefix longer than MAX_PREFIX is not resolved. */
const WINDOW = 4000;
const MAX_TEMPLATES = 8;
const MAX_PREFIX = 1000;
const HTTP = new Map(
  ["Get", "Post", "Put", "Delete", "Patch", "Head", "Options"].map((v) => [`Http${v}`, v.toUpperCase()]),
);
const MODIFIERS = new Set(
  "public protected private internal static sealed abstract partial async virtual override readonly new unsafe extern required file const volatile".split(
    " ",
  ),
);
const TYPES = new Set(["class", "record", "struct", "interface"]);
const MAPS = new Set(["MapGet", "MapPost", "MapPut", "MapDelete", "MapPatch", "MapMethods", "MapGroup"]);
/** Hangfire's Cron helpers, as the cron expressions they return. */
const CRON_OF = {
  Minutely: "* * * * *",
  Hourly: "0 * * * *",
  Daily: "0 0 * * *",
  Weekly: "0 0 * * 1",
  Monthly: "0 0 1 * *",
  Yearly: "0 0 1 1 *",
};

/**
 * @typedef {{ name: string, args: string|null, index: number }} Attribute   args: null without parentheses
 * @typedef {{ attributes: Attribute[], kind: "class"|"member", abstract: boolean, name: string, bases: string[],
 *   decl: number, end: number }} Declaration
 */

/** The group of an endpoint mapped on the application itself (no prefix, no guard). */
const ROOT = Object.freeze({ prefix: "", all: [], open: false });
const cut = (s, suffix) => (s.endsWith(suffix) ? s.slice(0, -suffix.length) : s);

/** The attributes of a section's content ("HttpGet("{id}"), Authorize"): name ("Attribute" left out), arguments. */
function sectionOf(content) {
  const out = [];
  for (const part of topLevel(content).slice(0, 16)) {
    const m = P.ATTRIBUTE.exec(part);
    if (!m) continue;
    const args = m[2] ? callSpan(part, m[0].length - 1, part.length + 1).args : null;
    out.push({ name: cut(m[1].slice(m[1].lastIndexOf(".") + 1), "Attribute"), args });
  }
  return out;
}

/** A type's name after its keyword (`record struct X` too) and the index after it, or null without one. */
function typeNameAt(text, k, limit) {
  for (let n = 0; n < 2; n++) {
    P.WORD_AT.lastIndex = skipBlank(text, k, limit);
    const word = P.WORD_AT.exec(text)?.[0];
    if (!word) return null;
    k = P.WORD_AT.lastIndex;
    if (!TYPES.has(word)) return { name: word, end: k };
  }
  return null;
}

/** The base types of a type (the words after its ":", out of brackets) up to its "{" or ";", 300 characters at most. */
function basesAt(text, k, limit) {
  const bases = [];
  const end = Math.min(limit, k + 300);
  let depth = 0;
  let after = false;
  for (; k < end && text[k] !== "{" && text[k] !== ";"; k++) {
    const ch = text[k];
    depth += "(<".includes(ch) ? 1 : ")>".includes(ch) ? -1 : 0;
    after ||= ch === ":" && depth === 0;
    if (after && P.WORD_CHAR.test(ch) && !P.WORD_CHAR.test(text[k - 1])) {
      let j = k;
      while (j < end && P.WORD_CHAR.test(text[j])) j++;
      bases.push(text.slice(k, j));
      k = j - 1;
    }
  }
  return { bases, end: k };
}

/**
 * The attributes and modifiers written from `at` on, and what they annotate: a type (its name, its bases) or a member
 * — a method, a property, a parameter, whose declaration starts at `decl`. Read once, WINDOW characters at most.
 * @param {string} text
 * @param {number} at
 * @returns {Declaration}
 */
function declarationAt(text, at) {
  const limit = Math.min(text.length, at + WINDOW);
  const out = {
    attributes: [],
    kind: /** @type {"class"|"member"} */ ("member"),
    abstract: false,
    name: "",
    bases: [],
  };
  let k = skipBlank(text, at, limit);
  for (let n = 0; n < 64 && k < limit; n++) {
    if (text[k] === "[") {
      const span = callSpan(text, k, 2000);
      if (!span.closed) return { ...out, decl: span.end, end: span.end };
      for (const a of sectionOf(span.args)) out.attributes.push({ ...a, index: k });
      k = skipBlank(text, span.end, limit);
      continue;
    }
    P.WORD_AT.lastIndex = k;
    const word = P.WORD_AT.exec(text)?.[0];
    const type = TYPES.has(word) ? typeNameAt(text, P.WORD_AT.lastIndex, limit) : null;
    if (type) return { ...out, kind: "class", name: type.name, ...basesAt(text, type.end, limit), decl: k };
    if (!MODIFIERS.has(word)) break;
    out.abstract ||= word === "abstract";
    k = skipBlank(text, P.WORD_AT.lastIndex, limit);
  }
  return { ...out, decl: k, end: Math.max(k, at + 1) };
}

/** A template's attribute: its template, undefined without one, null when it is not a literal (a constant). */
function templateOf(a) {
  if (a.args === null) return undefined;
  for (const part of topLevel(a.args)) {
    const named = P.NAMED.exec(part);
    if (named && named[1] !== "template") continue;
    return P.ONLY_LITERAL.exec(named ? part.slice(named[0].length).trim() : part)?.[1] ?? null;
  }
  return undefined;
}

/** A guard's name: "Authorize", "Authorize(Roles = Admin)", "RequireAuthorization(Admin)"; 120 characters. */
const guardOf = (a) => guardName(a.args?.trim() ? `${a.name}(${a.args.replace(P.QUOTES, "")})` : a.name);

/**
 * The name a member declares — its last identifier before "(", "=", ",", ")", "{", ";", a line's end or an
 * attribute —, and the integer after its "=" (a parameter's default): 300 characters at most.
 */
function declared(text, decl) {
  const end = Math.min(text.length, decl + 300);
  let k = decl;
  for (let depth = 0; k < end; k++) {
    const ch = text[k];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "[" || (depth <= 0 && "=(),{};\n".includes(ch))) break;
  }
  let v = k + 1;
  while (text[k] === "=" && v < Math.min(text.length, k + 30) && !",);\n".includes(text[v])) v++;
  const value = text[k] === "=" ? P.NUMBER.exec(text.slice(k + 1, v)) : null;
  return { name: lastWord(text, decl, k), value: value ? Number(value[1]) : undefined };
}

/** A class: whether it is a controller, its route templates (null: one is a constant), its guards. */
function classOf(decl) {
  const names = new Set(decl.attributes.map((a) => a.name));
  const named = (w) => w.endsWith("Controller") || w.endsWith("ControllerBase");
  const templates = decl.attributes.filter((a) => a.name === "Route").map(templateOf);
  const controller = names.has("ApiController") || names.has("Controller") || [decl.name, ...decl.bases].some(named);
  return {
    name: decl.name,
    bases: decl.bases,
    controller: controller && !decl.abstract && !names.has("NonController"),
    templates: templates.includes(null) ? null : templates.filter((t) => t !== undefined).slice(0, MAX_TEMPLATES),
    guards: withGuards([], decl.attributes.filter((a) => a.name === "Authorize").map(guardOf)),
    anonymous: names.has("AllowAnonymous"),
    actions: [],
  };
}

/** An action of a controller: its name, its guards, and one endpoint per [HttpX] (or one for every method). */
function actionOf(decl, text, index) {
  const verbs = decl.attributes.filter((a) => HTTP.has(a.name));
  const routes = decl.attributes.filter((a) => a.name === "Route");
  const own = routes.map(templateOf).filter((t) => typeof t === "string");
  if (!verbs.length && !own.length) return null;
  const endpoints = verbs
    .map((a) => ({ a, t: templateOf(a) }))
    .filter(({ t }) => t !== null)
    .map(({ a, t }) => ({
      method: HTTP.get(a.name),
      line: index.lineOf(a.index),
      templates: t !== undefined ? [t] : own,
    }));
  if (!verbs.length) endpoints.push({ method: "ANY", line: index.lineOf(routes[0].index), templates: own });
  return {
    name: cut(declared(text, decl.decl).name ?? "", "Async"),
    guards: decl.attributes.filter((a) => a.name === "Authorize").map(guardOf),
    anonymous: decl.attributes.some((a) => a.name === "AllowAnonymous"),
    endpoints,
  };
}

/**
 * The classes of a file: each with its route templates, guards, bases and actions. An action belongs to the
 * innermost type whose body holds it: a type nested in a controller (a class, a record, an enum) ends at the "}" of
 * its own body, and the controller's actions after it are still its own.
 */
function classesOf(text, index, close) {
  const classes = [];
  const types = [];
  P.TOKEN.lastIndex = 0;
  for (let m = P.TOKEN.exec(text); m; m = P.TOKEN.exec(text)) {
    if (index.inComment(m.index)) continue;
    const decl = declarationAt(text, m.index);
    P.TOKEN.lastIndex = Math.max(P.TOKEN.lastIndex, decl.end);
    while (types.length && types[types.length - 1].end < m.index) types.pop();
    const current = types.length ? types[types.length - 1].cls : null;
    const action = decl.kind === "member" && current ? actionOf(decl, text, index) : null;
    const body = decl.kind === "class" ? typeBody(text, close, decl.end) : null;
    if (decl.kind === "class") classes.push(classOf(decl));
    if (body) types.push({ cls: classes[classes.length - 1], end: body.end });
    else if (action) current.actions.push(action);
  }
  return classes;
}

/** A controller's templates and guards, with those of its bases (by name, 4 levels at most). */
function inherited(cls, byName) {
  let { templates, anonymous, guards } = cls;
  for (let base = cls, depth = 0; depth < 4; depth++) {
    base = base.bases.map((b) => byName.get(b)).find((b) => b && b !== cls);
    if (!base) break;
    if (templates?.length === 0) templates = base.templates;
    guards = withGuards(guards, base.guards);
    anonymous ||= base.anonymous;
  }
  return { templates, guards, anonymous };
}

/** The route of a controller's template and an action's ("~/x" and "/x" ignore the controller's), or null. */
function actionRoute(prefix, template, controller, action) {
  const absolute = typeof template === "string" && (template.startsWith("/") || template.startsWith("~/"));
  if (!absolute && (prefix === null || (prefix === undefined && template === undefined))) return null;
  const route = absolute ? template.slice(template.indexOf("/")) : `${prefix ?? ""}/${template ?? ""}`;
  return joinPath(route.replace(P.CONTROLLER_TOKEN, controller).replace(P.ACTION_TOKEN, action), "");
}

/** The routes of a controller's actions, pushed into `items` (MAX_ITEMS at most). */
function controllerRoutes(cls, byName, file, items) {
  const { templates, guards, anonymous } = inherited(cls, byName);
  const prefixes = templates === null ? [null] : templates.length ? templates : [undefined];
  for (const action of cls.actions) {
    const own = anonymous || action.anonymous ? [] : withGuards(guards, action.guards);
    for (const { method, line, templates: list } of action.endpoints)
      for (const template of list.length ? list : [undefined])
        for (const prefix of prefixes) {
          const route = actionRoute(prefix, template, cut(cls.name, "Controller"), action.name);
          if (route !== null && items.length < MAX_ITEMS) items.push({ method, route, file, line, guards: [...own] });
        }
  }
}

// ─── Minimal APIs ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The index after generic arguments at `k` (`<Order>`), 200 characters at most; `k` without any. */
function skipGeneric(text, k, limit) {
  const end = text[k] === "<" ? Math.min(limit, k + 200) : k;
  for (let depth = 0, i = k; i < end; i++) {
    depth += text[i] === "<" ? 1 : text[i] === ">" ? -1 : 0;
    if (depth === 0) return i + 1;
  }
  return k;
}

/**
 * The calls chained after a call that ends at `from` — RequireAuthorization(…), AllowAnonymous(), WithName(…) — up
 * to a chained map call (`next`: the index of its "."): 16 calls and WINDOW characters at most, each read once.
 */
function chainAfter(text, from) {
  const limit = Math.min(text.length, from + WINDOW);
  const out = { guards: [], anonymous: false, next: -1, end: from };
  for (let n = 0; n < 16; n++) {
    const dot = skipBlank(text, out.end, limit);
    P.WORD_AT.lastIndex = dot + 1;
    const name = text[dot] === "." ? P.WORD_AT.exec(text)?.[0] : undefined;
    if (MAPS.has(name)) out.next = dot;
    if (!name || MAPS.has(name)) break;
    let k = skipGeneric(text, P.WORD_AT.lastIndex, limit);
    let args = null;
    if (text[k] === "(") ({ args, end: k } = callSpan(text, k, 2000));
    if (name === "RequireAuthorization") out.guards.push(guardOf({ name, args }));
    out.anonymous ||= name === "AllowAnonymous";
    out.end = k;
  }
  return out;
}

/** The group a map call is made on — a chained one, or the variable just before its "." — and where it starts. */
function receiverAt(text, dot, scope) {
  const chained = scope.chained.get(dot);
  if (chained) return chained;
  const stop = Math.max(0, dot - 200);
  let e = dot;
  while (e > stop && isBlank(text[e - 1])) e--;
  let s = e;
  while (s > stop && e - s < 64 && P.WORD_CHAR.test(text[s - 1])) s--;
  return { group: (s < e && scope.groups.get(text.slice(s, e))) || ROOT, start: s };
}

/** The variable an expression that starts at `start` is assigned to (`var api = …`, `api = …`), or null. */
function assignedTo(text, start) {
  const stop = Math.max(0, start - 200);
  let k = start;
  while (k > stop && isBlank(text[k - 1])) k--;
  if (text[k - 1] !== "=" || "=!<>".includes(text[k - 2])) return null;
  k--;
  while (k > stop && isBlank(text[k - 1])) k--;
  return P.WORD_CHAR.test(text[k - 1]) ? (lastWord(text, Math.max(stop, k - 64), k) ?? null) : null;
}

/** A group of a MapGroup call: its prefix (null: not a literal), its parent, its guards; known by its variable. */
function mapGroup(text, scope, receiver, path, chain) {
  const parent = receiver.group;
  const base = parent.prefix;
  const prefix = path === null || base === null || base.length > MAX_PREFIX ? null : joinPath(base, path);
  const group = { prefix, parent, own: chain.guards, anonymous: chain.anonymous, open: false, all: [] };
  const variable = assignedTo(text, receiver.start);
  if (variable) scope.groups.set(variable, group);
  if (chain.next !== -1) scope.chained.set(chain.next, { group, start: receiver.start });
  return group;
}

/** A statement on a group's variable (`api.RequireAuthorization(…)`, `api.AllowAnonymous()`); the index after it. */
function groupStatement(scope, m, span) {
  const group = scope.groups.get(m[2]);
  if (group && m[3] === "AllowAnonymous") group.anonymous = true;
  else if (group) group.own.push(guardOf({ name: m[3], args: span.args }));
  return span.end;
}

/** A map call — a group (MapGroup) or an endpoint — and the calls chained after it; the index after them. */
function mapCall(text, m, span, scope) {
  const chain = chainAfter(text, span.end);
  const parts = span.closed ? topLevel(span.args) : [];
  const path = P.ONLY_LITERAL.exec(parts[0] ?? "")?.[1] ?? null;
  const receiver = receiverAt(text, m.index, scope);
  const verbs = m[1] === "Methods" ? literalsOf(parts[1] ?? "").map((v) => v.toUpperCase()) : [m[1].toUpperCase()];
  if (m[1] === "Group") scope.made.push(mapGroup(text, scope, receiver, path, chain));
  else scope.endpoints.push({ methods: verbs.slice(0, 8), path, group: receiver.group, chain, at: m.index });
  return chain.end;
}

/** The routes of the endpoints of a file, under their groups (each group's guards resolved after its parent's). */
function endpointRoutes(scope, file, index, items) {
  for (const g of scope.made) {
    g.open = g.anonymous || g.parent.open;
    g.all = g.open ? [] : withGuards(g.parent.all, g.own);
  }
  for (const { methods, path, group, chain, at } of scope.endpoints) {
    if (group.prefix === null || path === null) continue;
    const guards = chain.anonymous || group.open ? [] : withGuards(group.all, chain.guards);
    for (const method of methods)
      if (items.length < MAX_ITEMS)
        items.push({ method, route: joinPath(group.prefix, path), file, line: index.lineOf(at), guards: [...guards] });
  }
}

/** The minimal APIs of a file, pushed into `items`: each map call under its group's prefix, with its guards. */
function minimalRoutes(text, file, index, items) {
  const scope = { groups: new Map(), chained: new Map(), made: [], endpoints: [] };
  P.MINIMAL.lastIndex = 0;
  for (let m = P.MINIMAL.exec(text); m; m = P.MINIMAL.exec(text)) {
    if (index.inComment(m.index)) continue;
    const span = callSpan(text, m.index + m[0].length - 1, 4000);
    const end = m[2] ? groupStatement(scope, m, span) : mapCall(text, m, span, scope);
    P.MINIMAL.lastIndex = Math.max(P.MINIMAL.lastIndex, end);
  }
  endpointRoutes(scope, file, index, items);
}

/**
 * The ASP.NET Core routes of a set of C# files (file → text): { method, route, file, line, guards }, the
 * controllers' then the minimal APIs', in the order of the files. A declaration is read once (4,000 characters).
 * @param {Map<string, string>} sources
 */
export function aspnetRoutes(sources) {
  const files = [...sources].map(([file, text]) => {
    const { ranges, close } = cScan(text, { csharp: true });
    const index = textIndex(text, ranges);
    return { file, text, index, classes: classesOf(text, index, close) };
  });
  const byName = new Map();
  for (const f of files) for (const c of f.classes) if (!byName.has(c.name)) byName.set(c.name, c);
  const items = [];
  for (const f of files) {
    for (const c of f.classes) if (c.controller) controllerRoutes(c, byName, f.file, items);
    minimalRoutes(f.text, f.file, f.index, items);
  }
  return items;
}

// ─── Behaviour hints ──────────────────────────────────────────────────────────────────────────────────────────────

const VIA_LINQ = "linq";
/** A DataAnnotations attribute → the signals of its first and second numbers, or its one signal without a value. */
const CHECKS = new Map([
  ["Required", "required"],
  ["EmailAddress", "email"],
  ["RegularExpression", "pattern"],
  ["Url", "url"],
]);
const BOUNDS = new Map([
  ["StringLength", ["max"]],
  ["MaxLength", ["max"]],
  ["MinLength", ["min"]],
  ["Length", ["min", "max"]],
  ["Range", ["min", "max"]],
]);
const SEARCH = { Contains: "contains", StartsWith: "startsWith", EndsWith: "endsWith" };

/** An integer argument (80, "80"), or undefined. */
const numberOf = (part = "") => {
  const n = P.NUMBER.exec(part) ?? P.NUMBER.exec(P.ONLY_LITERAL.exec(part)?.[1] ?? "");
  return n ? Number(n[1]) : undefined;
};

/** The value of a named argument (`MinimumLength = 1` → " 1"), or undefined. */
const namedArg = (parts, key) => {
  const part = parts.find((p) => P.NAMED.exec(p)?.[1] === key);
  return part === undefined ? undefined : part.slice(P.NAMED.exec(part)[0].length);
};

/** The hints of one attribute of a member (a check, its bounds, a query parameter). */
function attributeHint(a, member, push) {
  const parts = a.args ? topLevel(a.args) : [];
  const positional = parts.filter((p) => !P.NAMED.test(p) && !p.startsWith("typeof"));
  const check = (signal, value) =>
    value !== null && push({ family: "validation", signal, field: member.name, value, via: "data-annotations" });
  if (CHECKS.has(a.name)) check(CHECKS.get(a.name));
  for (const [i, signal] of (BOUNDS.get(a.name) ?? []).entries()) check(signal, numberOf(positional[i]) ?? null);
  if (a.name === "StringLength") check("min", numberOf(namedArg(parts, "MinimumLength")) ?? null);
  const name = a.name === "FromQuery" ? (literalsOf(namedArg(parts, "Name") ?? "")[0] ?? member.name) : null;
  if (name) push({ ...paramSignal(name), field: name, value: member.value, via: "aspnet" });
}

/** The criteria of a LINQ Where: Contains, StartsWith, EndsWith (case folded or not), ==, comparisons, a list. */
function whereHints(args, base, push) {
  for (const t of args.matchAll(P.TEXT_MATCH)) {
    push({ family: "search", signal: SEARCH[t[3]], field: t[1], via: VIA_LINQ }, base + t.index);
    const call = args.slice(t.index + t[0].length, t.index + t[0].length + 80);
    if (P.FOLD.test(t[2]) || call.includes("IgnoreCase"))
      push({ family: "search", signal: "caseInsensitive", field: t[1], via: VIA_LINQ }, base + t.index);
  }
  for (const [re, signal] of [
    [P.EQUALS, "equals"],
    [P.RANGE, "range"],
    [P.IN_LIST, "in"],
  ])
    for (const m of args.matchAll(re)) push({ family: "filter", signal, field: m[1], via: VIA_LINQ }, base + m.index);
}

/** LINQ and EF Core: the criteria of a Where, EF.Functions.Like, OrderBy and ThenBy, Skip and Take. */
function linq(text, sink) {
  const push = sink.push;
  eachCall(P.WHERE, text, (args, end, m) => whereHints(args, m.index + m[0].length, push));
  for (const m of text.matchAll(P.EF_LIKE)) {
    const field = m[2].split(".").filter(Boolean).pop();
    push({ family: "search", signal: "like", field, via: "ef-core" }, m.index);
    if (m[1] === "ILike") push({ family: "search", signal: "caseInsensitive", field, via: "ef-core" }, m.index);
  }
  for (const m of text.matchAll(P.ORDER)) {
    const value = m[1].endsWith("Descending") ? "desc" : "asc";
    push(
      { family: "sort", signal: "orderBy", field: m[3].split(".").filter(Boolean).pop(), value, via: VIA_LINQ },
      m.index,
    );
  }
  for (const m of text.matchAll(P.SKIP_TAKE)) {
    const value = m[2] ? Number(m[2]) : undefined;
    push({ family: "pagination", signal: m[1] === "Take" ? "limit" : "offset", value, via: VIA_LINQ }, m.index);
  }
}

/** The attributes of members (DataAnnotations, [FromQuery]), each section's declaration read once. */
function attributeHints(text, sink) {
  P.SECTION.lastIndex = 0;
  for (let m = P.SECTION.exec(text); m && !sink.full; m = P.SECTION.exec(text)) {
    const decl = declarationAt(text, m.index);
    P.SECTION.lastIndex = Math.max(P.SECTION.lastIndex, decl.end);
    const member = decl.kind === "member" ? declared(text, decl.decl) : null;
    if (member) for (const a of decl.attributes) attributeHint(a, member, (s) => sink.push(s, a.index));
  }
}

/** Scheduled jobs: Hangfire's RecurringJob.AddOrUpdate (a Cron helper or a cron string), Quartz's cron. */
function jobs(text, sink) {
  eachCall(P.RECURRING, text, (args, end, m) => {
    const helper = P.CRON_HELPER.exec(args);
    const value = helper ? CRON_OF[helper[1]] : literalsOf(args).find((l) => P.CRON_LIKE.test(l));
    sink.push({ family: "schedule", signal: "cron", value, via: "hangfire" }, m.index);
  });
  for (const m of text.matchAll(P.QUARTZ))
    sink.push({ family: "schedule", signal: "cron", value: m[1], via: "quartz" }, m.index);
}

export default {
  name: "aspnet",
  files: P.FILES,
  marker: P.MARKER,
  api: ({ sources }) => aspnetRoutes(sources),
  /**
   * Every behaviour hint of a C# text, pushed into the sink of its file (engine/facts/behaviour-common.mjs).
   * @param {string} text
   * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
   */
  behaviours(text, sink) {
    for (const read of [linq, attributeHints, jobs]) if (!sink.full) read(text, sink);
  },
};
