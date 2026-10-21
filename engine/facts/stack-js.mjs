// The reader of JavaScript and TypeScript route records the stack adapters of the front end share (ARCHITECTURE.md
// §5): Vue Router, Angular and React Router (adapters/stack/vue-router.mjs, angular.mjs, react-router.mjs) read their
// arrays of routes with it — a JavaScript literal read by one linear walk, the imports of a file, the arrays of routes
// of a file and their composition across files into screens, a path composed with its parents', the guards of a
// record —, and NestJS (adapters/stack/nestjs.mjs) the literal of a decorator's arguments, the name of a guard and the
// roles of a list. Each adapter keeps what is its own: the calls that hold an array of routes, and how one record
// becomes a route node (`toNode`). Bounded expressions only (RULES.md S5, test/tools/redos-worker.mjs).
import { textIndex, jsCommentRanges, callSpan, safeValues } from "./behaviour-common.mjs";
import { MAX_ITEMS, withGuards } from "./stack-common.mjs";

/** At most this many characters of one literal are read (a larger array of routes is read in part). */
const MAX_LITERAL = 256 * 1024;
/** Literals nested deeper than this are not built (the readers look 24 routes deep): their brackets are counted. */
const MAX_NESTING = 96;
/** Records nested deeper than this (children, mounted arrays) are not read. */
const MAX_DEPTH = 24;
/** At most this many records are visited when the screens are composed (an array mounted many times over). */
const MAX_VISITS = 20_000;
/** At most this many arrays are mounted by one reference (the routes of a module are a few). */
const MAX_TARGETS = 16;
const BLANK = new Set([" ", "\t", "\n", "\r"]);
/** What a module specifier may leave out: its extension, or its folder's index. */
const MODULE_ENDINGS = ".ts .tsx .js .jsx .mjs .vue /index.ts /index.tsx /index.js /index.jsx".split(" ");

/** A declared array: `const routes: Routes = [`, `export const adminRoutes = [` (its name or type tells routes). */
const NAMED_ARRAY = /\b(?:const|let|var)\s{1,20}([A-Za-z_$][\w$]{0,63})\s{0,20}(?::([^=;\n]{1,80}))?=\s{0,20}\[/g;
/** `export default [` (an array), `export default routes` (a name). */
const DEFAULT_EXPORT = /\bexport\s{1,20}default\s{0,20}(?:(\[)|([A-Za-z_$][\w$]{0,63})(?![\w$.(]))/g;
/** The name (routes, adminRoutes, ADMIN_ROUTES) or the type (Routes, RouteRecordRaw[], RouteObject[]) of routes. */
const ROUTES_NAME = /routes$/i;
const ROUTE_TYPE = /\bRoute/;
const SPREAD = /^\.\.\.\s{0,20}([A-Za-z_$][\w$]{0,63})\s{0,20}$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;
/** A character of a name (a key of an object), and a digit (no name starts with one). */
const NAME_CHAR = /[\w$]/;
const DIGIT = /\d/;
const QUOTED = /["'`]([^"'`\n]{0,300})["'`]/g;
/** What may stand between the words of a guard's arguments: blanks and commas. */
const SEPARATORS = /[\s,]/g;
/** A guard as written: a name (a dotted one), `new` dropped, and whether a call follows. */
const GUARD_HEAD = /^(?:new\s{1,20})?([A-Za-z_$][\w$]{0,63}(?:\.[A-Za-z_$][\w$]{0,63}){0,3})(\s{0,20}\()?/;
/** A guard written as a function where it is used: `(to) => …`, `async () => …`, `function () {…}`, `x => …`. */
const INLINE_FUNCTION = /^(?:async\b|function\b|\(|[A-Za-z_$][\w$]{0,63}\s{0,20}=>)/;
/** A flag of a record's `meta` (or Angular's `data`) that asks for a signed-in user. */
const META_FLAG = /^(?:requires?[A-Z][\w$]{0,40}|auth|authRequired|authenticated|protected)$/;
/** A list of roles of a record's `meta` (or `data`), and one of its values (a word, or a name: Role.Admin). */
const ROLE_KEY = /^(?:roles?|permissions?|scopes?|authorities)$/;
// A quoted value is read whole, up to its closing quote (or the end of its line), so that a long one — a passphrase, a
// key — reaches the whitelist as one value and is dropped there, never split into the words inside it.
const ROLE_VALUE =
  /"([^"\n]{0,4000})"?|'([^'\n]{0,4000})'?|`([^`]{0,4000})`?|([A-Za-z_$][\w$]{0,63}(?:\.[A-Za-z_$][\w$]{0,63}){0,2})/g;
const IMPORT =
  /\bimport\s{1,20}(?:type\s{1,20})?(\{[^{}]{0,600}\}|[A-Za-z_$][\w$]{0,63}(?:\s{0,20},\s{0,20}\{[^{}]{0,600}\})?)\s{0,20}from\s{0,20}["']([^"'\n]{1,300})["']/g;
const IMPORT_NAME = /^(?:type\s{1,20})?([A-Za-z_$][\w$]{0,63})(?:\s{1,20}as\s{1,20}([A-Za-z_$][\w$]{0,63}))?$/;
/** The slashes of a route: doubled, at its end, and React Router's "/*" (what a route mounts below it). */
const SLASHES = /\/{2,}/g;
const TRAILING_SLASH = /\/$/;
const SPLAT = /\/\*$/;

/** The expressions of this module, by name (test/tools/redos-worker.mjs, RULES.md S5). */
export const STACK_JS_PATTERNS = Object.freeze({
  NAMED_ARRAY,
  DEFAULT_EXPORT,
  ROUTES_NAME,
  ROUTE_TYPE,
  SPREAD,
  IDENTIFIER,
  NAME_CHAR,
  DIGIT,
  QUOTED,
  SEPARATORS,
  GUARD_HEAD,
  INLINE_FUNCTION,
  META_FLAG,
  ROLE_KEY,
  ROLE_VALUE,
  IMPORT,
  IMPORT_NAME,
  SLASHES,
  TRAILING_SLASH,
  SPLAT,
});

/**
 * @typedef {{ start: number, end: number, first: number, key?: string, keyAt?: number, node?: Literal }} Part
 * @typedef {{ open: string, start: number, end: number, parts: Part[], props: Map<string, Part>, expectKey: boolean }} Literal
 * @typedef {{ local?: string, module?: string, name?: string, want?: string, routesOf?: boolean, targets?: string[] }} Ref
 * @typedef {{ path: string|null, index: boolean, skip: boolean, screen: boolean, guards: string[],
 *   childGuards: string[], children: RouteNode[], refs: Ref[], file: string, line: number }} RouteNode
 * @typedef {{ arrays: Map<string, RouteNode[]>, defaultName: string|null,
 *   imports: Map<string, { from: string, name: string }>, index: ReturnType<typeof textIndex> }} RouteEntry
 * @typedef {object} RouteRecord   a record of an array of routes, as an adapter reads it (routeEntry's `toNode`)
 * @property {(key: string) => boolean} has
 * @property {(key: string) => string|null} string   its value when it is a string literal alone
 * @property {(key: string, max?: number) => string} text   its value as written (2,000 characters at most)
 * @property {(key: string) => string[]} elements   the elements of an array value (or the value alone)
 * @property {(key: string) => RouteRecord|null} object   an object value
 * @property {() => string[]} keys
 * @property {(key?: string) => { children: RouteNode[], refs: Ref[] }} children   an array value, or a name (a ref)
 * @property {{ file: string, line: number }} at   where the record is: the line of its `path`, else of its "{"
 */

const isQuote = (ch) => ch === '"' || ch === "'" || ch === "`";
const isComment = (text, i) => text[i] === "/" && (text[i + 1] === "/" || text[i + 1] === "*");

/** Where the comment at `i` ends (a line comment: at its line break), `limit` at most. */
function commentEnd(text, i, limit) {
  let k = i + 2;
  if (text[i + 1] === "/") while (k < limit && text[k] !== "\n") k++;
  else while (k + 1 < limit && !(text[k] === "*" && text[k + 1] === "/")) k++;
  return Math.min(limit, text[i + 1] === "/" ? k : k + 2);
}

/**
 * Where the string, template literal or comment at `i` ends (a quoted string ends at its line, as in callSpan), at
 * `limit` at most; -1 when none starts there.
 * @param {string} text
 * @param {number} i
 * @param {number} limit
 * @returns {number}
 */
export function tokenEnd(text, i, limit) {
  if (isComment(text, i)) return commentEnd(text, i, limit);
  const quote = text[i];
  if (!isQuote(quote)) return -1;
  for (let k = i + 1; k < limit; k++)
    if (text[k] === "\\") k++;
    else if (text[k] === quote || (text[k] === "\n" && quote !== "`")) return k + 1;
  return limit;
}

/** The index of the first character from `i` that is neither blank nor in a comment, `limit` at most. */
function skipBlank(text, i, limit) {
  let k = i;
  while (k < limit && (BLANK.has(text[k]) || isComment(text, k)))
    k = BLANK.has(text[k]) ? k + 1 : commentEnd(text, k, limit);
  return k;
}

/** @returns {Part} */
const newPart = (start) => ({ start, end: -1, first: -1 });
/** @returns {Literal} */
const newLiteral = (open, start) => ({
  open,
  start,
  end: -1,
  parts: [newPart(start + 1)],
  props: new Map(),
  expectKey: open === "{",
});

/** The name at `i` (64 characters at most) or the quoted key ('path'): { key, end }, or null. */
function keyName(text, i, limit) {
  if (text[i] === '"' || text[i] === "'") {
    const end = tokenEnd(text, i, limit);
    return text[end - 1] === text[i] && end - i <= 66 ? { key: text.slice(i + 1, end - 1), end } : null;
  }
  let k = i;
  while (k < limit && k - i < 64 && NAME_CHAR.test(text[k])) k++;
  return k > i && !DIGIT.test(text[i]) ? { key: text.slice(i, k), end: k } : null;
}

/** Reads the key of an object's property at `i` (`path:`, `'path':`): the index after its ":", or -1. */
function keyAt(text, i, limit, lit) {
  const name = keyName(text, i, limit);
  if (!name) return -1;
  const { key } = name;
  let k = name.end;
  while (k < limit && BLANK.has(text[k])) k++;
  if (text[k] !== ":") return -1;
  const part = lit.parts[lit.parts.length - 1];
  Object.assign(part, { key, keyAt: i, start: k + 1 });
  if (!lit.props.has(key)) lit.props.set(key, part);
  return k + 1;
}

function closeLiteral(lit, i, closed) {
  const last = lit.parts[lit.parts.length - 1];
  last.end = i;
  if (last.first === -1 && last.key === undefined) lit.parts.pop();
  lit.end = closed ? i + 1 : i;
}

/** One character of a value: a bracket opens or closes a literal, a comma ends a part, a string is skipped whole. */
function valueStep(text, i, limit, stack, state) {
  const lit = stack[stack.length - 1];
  const part = lit.parts[lit.parts.length - 1];
  const ch = text[i];
  if (ch === "]" || ch === "}" || ch === ")") {
    closeLiteral(lit, i, true);
    stack.pop();
    return i + 1;
  }
  if (ch === ",") {
    part.end = i;
    lit.parts.push(newPart(i + 1));
    lit.expectKey = lit.open === "{";
    return i + 1;
  }
  if (part.first === -1) part.first = i;
  const end = tokenEnd(text, i, limit);
  if (end !== -1) return end;
  if (ch === "[" || ch === "{" || ch === "(") {
    if (stack.length >= MAX_NESTING) state.deeper = 1;
    else {
      const child = newLiteral(ch, i);
      if (part.first === i) part.node = child;
      stack.push(child);
    }
  }
  return i + 1;
}

/** A step inside literals nested deeper than MAX_NESTING: strings skipped, brackets counted, nothing built. */
function deepStep(text, i, limit, state) {
  const end = tokenEnd(text, i, limit);
  if (end !== -1) return end;
  const ch = text[i];
  if (ch === "[" || ch === "{" || ch === "(") state.deeper++;
  else if (ch === "]" || ch === "}" || ch === ")") state.deeper--;
  return i + 1;
}

/**
 * The structure of the JavaScript literal whose "[", "{" or "(" is at `open`: its parts (an array's elements, an
 * object's properties by key, a call's arguments) and the literals they hold — read by one linear walk, `max`
 * characters at most, strings and comments skipped (a literal it does not close ends where the walk stopped).
 * @param {string} text
 * @param {number} open
 * @param {number} [max]
 * @returns {Literal}
 */
export function literalTree(text, open, max = MAX_LITERAL) {
  const limit = Math.min(text.length, open + max);
  const root = newLiteral(text[open], open);
  const stack = [root];
  const state = { deeper: 0 };
  let i = open + 1;
  while (i < limit && stack.length) {
    const lit = stack[stack.length - 1];
    if (BLANK.has(text[i])) i++;
    else if (isComment(text, i)) i = commentEnd(text, i, limit);
    else if (state.deeper > 0) i = deepStep(text, i, limit, state);
    else {
      const after = lit.expectKey ? keyAt(text, i, limit, lit) : -1;
      lit.expectKey = false;
      i = after !== -1 ? after : valueStep(text, i, limit, stack, state);
    }
  }
  for (const lit of stack) closeLiteral(lit, i, false);
  return root;
}

/** The string a part holds when it is a string literal alone ('orders', "orders", `orders` without `${}`), else null. */
function stringOf(text, part) {
  if (!part || part.first < 0 || !isQuote(text[part.first])) return null;
  const quote = text[part.first];
  const end = tokenEnd(text, part.first, part.end);
  if (text[end - 1] !== quote || end - part.first > 502) return null;
  const value = text.slice(part.first + 1, end - 1);
  // Only blanks and comments may follow it in its part ('a' + b is no literal).
  const alone = skipBlank(text, end, part.end) >= part.end;
  return alone && !(quote === "`" && value.includes("${")) ? value : null;
}

/** A part's text as written, `max` characters at most ("" when there is none). */
const textOf = (text, part, max = 2000) =>
  part && part.first >= 0 ? text.slice(part.first, Math.min(part.end, part.first + max)) : "";

/** The elements of an array part, each as written (400 characters at most); the part alone when it is no array. */
function elementsOf(text, part) {
  if (!part) return [];
  if (part.node?.open !== "[") return [textOf(text, part, 400).trim()].filter(Boolean);
  return part.node.parts.map((p) => textOf(text, p, 400).trim()).filter(Boolean);
}

/**
 * The name of a guard as written: "AuthGuard", "auth.check", `new RolesGuard()` → "RolesGuard", a call with words
 * for arguments kept with them ("AuthGuard('jwt')"), a function written in place named after `fallback` (its key).
 * Null when it is none of these.
 * @param {string} written
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
export function guardName(written, fallback = null) {
  const text = written.trim();
  if (INLINE_FUNCTION.test(text)) return fallback;
  const head = GUARD_HEAD.exec(text);
  if (!head) return null;
  if (!head[2]) return head[1];
  const args = callSpan(text, head[0].length - 1, 400).args;
  const values = [...args.matchAll(QUOTED)].map((m) => m[1]);
  const words = values.length > 0 && args.replace(QUOTED, "").replace(SEPARATORS, "") === "";
  const kept = words ? safeValues(values) : [];
  return words && kept.length === values.length ? `${head[1]}(${kept.map((v) => `'${v}'`).join(", ")})` : head[1];
}

/**
 * The roles of a list as written (`['admin', Role.Manager]`, `'admin', 'manager'`): words and names only, through
 * the whitelist of the behaviour hints.
 * @param {string} text
 * @returns {string[]}
 */
export const roleValues = (text) => safeValues([...text.matchAll(ROLE_VALUE)].map((v) => v[1] ?? v[2] ?? v[3] ?? v[4]));

/**
 * The guards a record's `meta` (Vue) or `data` (Angular) declares: a flag set to true ("requiresAuth"), a list of
 * roles ("roles(admin, manager)"; words and names only, through the whitelist of the behaviour hints).
 * @param {RouteRecord|null} meta
 * @returns {string[]}
 */
export function metaGuards(meta) {
  if (!meta) return [];
  const out = [];
  for (const key of meta.keys()) {
    if (META_FLAG.test(key) && meta.text(key, 10).trim() === "true") out.push(key);
    else if (ROLE_KEY.test(key)) {
      const values = roleValues(meta.text(key, 400));
      if (values.length) out.push(`${key}(${values.join(", ")})`);
    }
  }
  return out;
}

/**
 * A route node: what an adapter read of one record or one tag, its defaults filled in.
 * @param {{ file: string, line: number }} at
 * @param {Partial<RouteNode>} fields
 * @returns {RouteNode}
 */
export const routeNode = (at, fields) => ({
  path: null,
  index: false,
  skip: false,
  screen: false,
  guards: [],
  childGuards: [],
  children: [],
  refs: [],
  ...at,
  ...fields,
});

/** The records of an array literal, each read by `ctx.toNode`; a spread `...name` is a group that mounts `name`. */
function nodesOf(ctx, lit, depth) {
  const nodes = [];
  if (!lit || lit.open !== "[" || depth > MAX_DEPTH) return nodes;
  for (const part of lit.parts) {
    const spread = part.node ? null : SPREAD.exec(textOf(ctx.text, part, 80).trim());
    const at = { file: ctx.file, line: ctx.index.lineOf(part.first) };
    const node =
      part.node?.open === "{"
        ? ctx.toNode(recordOf(ctx, part.node, depth))
        : spread && routeNode(at, { refs: [{ local: spread[1] }] });
    if (node) nodes.push(node);
  }
  return nodes;
}

/** @returns {RouteRecord} */
function recordOf(ctx, lit, depth) {
  const prop = (key) => lit.props.get(key);
  return {
    has: (key) => lit.props.has(key),
    string: (key) => stringOf(ctx.text, prop(key)),
    text: (key, max) => textOf(ctx.text, prop(key), max),
    elements: (key) => elementsOf(ctx.text, prop(key)),
    object: (key) => (prop(key)?.node?.open === "{" ? recordOf(ctx, prop(key).node, depth) : null),
    keys: () => [...lit.props.keys()],
    children(key = "children") {
      const part = prop(key);
      if (part?.node?.open === "[") return { children: nodesOf(ctx, part.node, depth + 1), refs: [] };
      const name = textOf(ctx.text, part, 80).trim();
      return { children: [], refs: IDENTIFIER.test(name) ? [{ local: name }] : [] };
    },
    at: { file: ctx.file, line: ctx.index.lineOf(prop("path")?.keyAt ?? lit.start) },
  };
}

/** The imports of a file: local name → { from, name } ("default" for a default import). */
function importsOf(text, index) {
  const imports = new Map();
  for (const m of text.matchAll(IMPORT)) {
    if (index.inComment(m.index)) continue;
    const [clause, from] = [m[1], m[2]];
    const brace = clause.indexOf("{");
    const first = (brace === -1 ? clause : clause.slice(0, brace)).replace(",", "").trim();
    if (first) imports.set(first, { from, name: "default" });
    if (brace !== -1)
      for (const piece of clause.slice(brace + 1, -1).split(",")) {
        const named = IMPORT_NAME.exec(piece.trim());
        if (named) imports.set(named[2] ?? named[1], { from, name: named[1] });
      }
  }
  return imports;
}

/**
 * The file among the sources that a module specifier names, relative (`./admin/admin.routes`) or under the `src`
 * folder of the importing file (`@/router/admin`, the alias of Vite and Vue CLI): the file itself, with an extension,
 * or its folder's index. Null for a package or a file that is not among them.
 * @param {string} from
 * @param {string} spec
 * @param {(file: string) => boolean} has
 * @returns {string|null}
 */
export function resolveModule(from, spec, has) {
  const dir = from.split("/").slice(0, -1);
  let segments;
  if (spec.startsWith("./") || spec.startsWith("../")) segments = [...dir, ...spec.split("/")];
  else if (spec.startsWith("@/") && dir.includes("src"))
    segments = [...dir.slice(0, dir.indexOf("src") + 1), ...spec.slice(2).split("/")];
  else return null;
  const out = [];
  for (const s of segments)
    if (s === "..") {
      if (!out.length) return null;
      out.pop();
    } else if (s !== "." && s !== "") out.push(s);
  const base = out.join("/");
  return ["", ...MODULE_ENDINGS].map((ext) => base + ext).find(has) ?? null;
}

/**
 * The arrays of routes of one file, each record read by `adapter.toNode`, by name: a declared one by its own,
 * `export default [` as "default", one written inside a call (`adapter.inline`: `createRouter({ routes: [`…) as
 * "#1", "#2"…; with the file's default export when it names an array, and its imports. An array inside another is
 * read with it, never again (each character is read once).
 * @param {string} file
 * @param {string} text
 * @param {{ inline: RegExp[], toNode: (record: RouteRecord) => RouteNode|null }} adapter
 * @returns {RouteEntry}
 */
export function routeEntry(file, text, adapter) {
  const index = textIndex(text, jsCommentRanges(text));
  const ctx = { text, file, index, toNode: adapter.toNode };
  const found = [NAMED_ARRAY, DEFAULT_EXPORT, ...adapter.inline]
    .flatMap((re, kind) => [...text.matchAll(re)].map((m) => ({ m, kind })))
    .filter(({ m }) => !index.inComment(m.index))
    .sort((a, b) => a.m.index - b.m.index);
  const arrays = new Map();
  let defaultName = null;
  let after = 0;
  let anonymous = 0;
  for (const { m, kind } of found) {
    if (m.index < after) continue;
    if (kind === 1 && m[2]) defaultName = m[2];
    const named = kind === 0 && (ROUTES_NAME.test(m[1]) || ROUTE_TYPE.test(m[2] ?? ""));
    const name = named ? m[1] : kind === 1 && m[1] ? "default" : kind > 1 ? `#${++anonymous}` : null;
    if (!name) continue;
    const tree = literalTree(text, m.index + m[0].length - 1);
    after = tree.end;
    arrays.set(name, nodesOf(ctx, tree, 0));
  }
  return { arrays, defaultName, imports: importsOf(text, index), index };
}

/** The keys ("file\nname") of the arrays of the files given, MAX_TARGETS at most. */
function arraysIn(registry, files) {
  const keys = [];
  for (const file of files)
    for (const name of registry.get(file).arrays.keys()) if (keys.length < MAX_TARGETS) keys.push(`${file}\n${name}`);
  return keys;
}

/** The routes of a module (an Angular NgModule): its own arrays, else those of the files it imports (once per file). */
function moduleRoutes(registry, target, cache) {
  if (!cache.has(target)) {
    const entry = registry.get(target);
    const imported = [...entry.imports.values()].map((i) => resolveModule(target, i.from, (f) => registry.has(f)));
    cache.set(target, arraysIn(registry, entry.arrays.size ? [target] : [...new Set(imported.filter(Boolean))]));
  }
  return cache.get(target);
}

/**
 * The arrays a reference mounts, as "file\nname" keys: a name of the file or one it imports, a module's export
 * ("default": its default export, or the array it names) — or, for `routesOf`, the routes of that module.
 */
function targetsOf(registry, file, ref, cache) {
  const own = registry.get(file);
  if (ref.local && !ref.want && own.arrays.has(ref.local)) return [`${file}\n${ref.local}`];
  const origin = ref.local ? own.imports.get(ref.local) : { from: ref.module, name: ref.name };
  const target = origin ? resolveModule(file, origin.from, (f) => registry.has(f)) : null;
  if (!target) return [];
  const entry = registry.get(target);
  const wanted = ref.want ?? origin.name ?? "default";
  const name = wanted === "default" && !entry.arrays.has("default") ? entry.defaultName : wanted;
  if (entry.arrays.has(name)) return [`${target}\n${name}`];
  return ref.routesOf ? moduleRoutes(registry, target, cache) : [];
}

/** Every node of an entry, children included (an explicit stack: no recursion on the application's nesting). */
function* allNodes(entry) {
  const stack = [...entry.arrays.values()].flat();
  while (stack.length) {
    const node = stack.pop();
    yield node;
    for (const child of node.children) stack.push(child);
  }
}

/**
 * A route's path joined to its parent's (an absolute one stays as it is), with one leading "/" and none at the end.
 * @param {string} base
 * @param {string|null} path
 * @returns {string}
 */
export function joinRoute(base, path) {
  const raw = path === null || path === "" ? base : path.startsWith("/") ? path : `${base}/${path}`;
  const route = `/${raw}`.replace(SLASHES, "/");
  return route.length > 1 ? route.replace(TRAILING_SLASH, "") : route;
}

/**
 * @typedef {{ out: object[], visits: number, frames: Map<RouteNode[], boolean>,
 *   arrayAt: (key: string) => RouteNode[] }} Walk
 */

/** Whether one of these records stands for its parent's own path (an index route, a path ""): once per array. */
function framing(ctx, nodes) {
  if (!ctx.frames.has(nodes))
    ctx.frames.set(
      nodes,
      nodes.some((k) => k.screen && !k.skip && (k.index || k.path === "")),
    );
  return ctx.frames.get(nodes);
}

/**
 * One record and, below it, its children and the arrays it mounts (an array already on the way is not mounted
 * again); a record framed by a child that stands for its own path is no screen of its own (a layout). Its guards are
 * its parents' and its own, MAX_GUARDS at most (withGuards: composing costs as much whatever their number), and the
 * walk stops at MAX_ITEMS screens.
 * @param {Walk} ctx
 * @param {RouteNode} node
 * @param {string} base
 * @param {string[]} inherited
 * @param {Set<string>} seen
 * @param {number} depth
 */
function walk(ctx, node, base, inherited, seen, depth) {
  if (ctx.visits >= MAX_VISITS || ctx.out.length >= MAX_ITEMS || depth > MAX_DEPTH || node.skip) return;
  ctx.visits++;
  const route = joinRoute(base, node.path);
  const guards = withGuards(inherited, node.guards);
  const mounted = [...new Set(node.refs.flatMap((r) => r.targets ?? []))].filter((key) => !seen.has(key));
  const framed = framing(ctx, node.children) || mounted.some((key) => framing(ctx, ctx.arrayAt(key)));
  if (node.screen && !framed)
    ctx.out.push({ route, file: node.file, line: node.line, ...(guards.length ? { guards } : {}) });
  const below = route.replace(SPLAT, "");
  const next = withGuards(guards, node.childGuards);
  for (const kid of node.children) walk(ctx, kid, below, next, seen, depth + 1);
  for (const key of mounted) {
    const path = new Set(seen).add(key);
    for (const kid of ctx.arrayAt(key)) walk(ctx, kid, below, next, path, depth + 1);
  }
}

/**
 * The screens of a set of route entries (file → routeEntry): every array no other one mounts is a root, each record
 * composed with the paths and the guards of its parents; `guards` only when one is declared on the way.
 * @param {Map<string, RouteEntry>} registry
 * @returns {Array<{ route: string, file: string, line: number, guards?: string[] }>}
 */
export function composeScreens(registry) {
  const mounted = new Set();
  const modules = new Map();
  for (const [file, entry] of registry)
    for (const node of allNodes(entry))
      for (const ref of node.refs) {
        ref.targets = targetsOf(registry, file, ref, modules);
        for (const key of ref.targets) mounted.add(key);
      }
  const arrayAt = (key) => {
    const cut = key.lastIndexOf("\n");
    return registry.get(key.slice(0, cut))?.arrays.get(key.slice(cut + 1)) ?? [];
  };
  /** @type {Walk} */
  const ctx = { out: [], visits: 0, frames: new Map(), arrayAt };
  for (const [file, entry] of registry)
    for (const [name, nodes] of entry.arrays) {
      const key = `${file}\n${name}`;
      if (!mounted.has(key)) for (const node of nodes) walk(ctx, node, "", [], new Set([key]), 0);
    }
  return ctx.out;
}
