// Infra adapter of Bicep (ARCHITECTURE.md §5, §6.9): the declarations of the `.bicep` files — `resource sym
// 'Type@version' = …` (existing ones, conditions `= if (…) {`, loops `= [for … : {`, and the child resources declared
// in a parent's body, their type completed by the parent's) with the name its `name:` property gives when a literal,
// else its symbol; `module sym './x.bicep' = …` or a registry's 'br:…'/'ts:…' with its source, the version of its
// reference and the names of its params; `param` (never its default) and `output` (never its value) — read by one
// linear walk that follows the strings ('…' with \ and '' escapes and ${…} templates, '''…''' over several lines) and
// the comments (//, /* */): a declaration in a comment or a string is none. A security rule in a resource's body whose
// sourceAddressPrefix(es) is open ('*', 'Internet', '0.0.0.0/0') — inbound, allowed — makes it openToAll. A
// `.bicepparam` file (values) is never read.
import { textIndex } from "../../engine/facts/behaviour-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import { environmentOfPath, withoutQuery } from "../../engine/facts/infra-common.mjs";
import { blank, push, rangeToken, openness } from "../../engine/facts/infra-lexer.mjs";

/** The files read: `.bicep` (never `.bicepparam`, which holds values). */
const FILES = /\.bicep$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const BICEP_PATTERNS = Object.freeze({ FILES });

/** The longest identifier kept as a word, the tokens kept of a statement, the inputs named per module. */
const MAX_WORD = 256;
const STATEMENT = 6;
const MAX_INPUTS = 64;
/** The longest type composed for a child resource (its parent's, "/", its own): a longer one is its own alone. */
const MAX_TYPE = 200;
/** Brackets nested deeper than this are counted, not followed (no Bicep file goes so deep). */
const MAX_DEPTH = 256;
/** The tokens after which a "{" opens the body of the declaration being read (`= {`, `if (…) {`, `[for … : {`). */
const BODY_AFTER = new Set(["=", ")", ":"]);
/** The properties of a security rule that hold its source ranges. */
const RANGES = new Set(["sourceAddressPrefix", "sourceAddressPrefixes"]);

/**
 * @typedef {{ type: string, value: string|null, index: number }} Token
 * @typedef {{ kind: string, provider?: string, type: string, name: string, file: string, line: number, env?: string,
 *   source?: string, version?: string, variables?: string[], openToAll?: boolean }} Item
 * @typedef {{ open: string, brace: Frame|null, stmt: Token[], n: number, last?: string, role?: string, item?: Item,
 *   res?: Item, ranges?: boolean, wide?: boolean, unknown?: boolean, shut?: boolean }} Frame
 *   a bracket open in the walk: `brace` the nearest "{" around it, `stmt` the first tokens of its current statement
 *   (`n` their number, `last` the type of the last one), `res` the resource it is in; `ranges`: a source range was
 *   seen, `wide`: an open one in a rule that lets in, `shut`: this rule is outbound or denies
 * @typedef {{ stack: Frame[], deep: number, collector: Frame|null,
 *   pending: { item: Item, owner: Frame, depth: number }|null, file: string, env?: string,
 *   lineOf: (i: number) => number, items: Item[] }} Walk   `deep`: the brackets open past MAX_DEPTH
 */

const isStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isPart = (c) => isStart(c) || (c >= "0" && c <= "9");

/** One character of a template's expression: a nested string opens, braces are counted, the last one closes it. */
function template(stack, c) {
  const depth = /** @type {number} */ (stack[stack.length - 1]);
  if (c === "'") stack.push("s");
  else if (c === "{") stack[stack.length - 1] = depth + 1;
  else if (c === "}") {
    if (depth === 0) stack.pop();
    else stack[stack.length - 1] = depth - 1;
  }
}

/**
 * A string that opens at `i`: the index after it, and its value when it is a literal. '''…''' runs to its closing
 * quotes (no escape, no template: no value); '…' ends at its quote ('' and \' escape one) or its line, its templates
 * and the strings nested in them followed by a stack ("s" for a string, a template's depth of braces).
 * @param {string} text
 * @param {number} i
 * @returns {{ end: number, value: string|null }}
 */
function quoted(text, i) {
  if (text.startsWith("'''", i)) {
    const close = text.indexOf("'''", i + 3);
    return { end: close === -1 ? text.length : close + 3, value: null };
  }
  const stack = /** @type {Array<"s"|number>} */ (["s"]);
  const state = { literal: true };
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (stack[stack.length - 1] !== "s") template(stack, c);
    else if ((c !== "'" || text[k + 1] === "'") && c !== "\n") k = stringCharacter(text, k, stack, state);
    else if (stack.length > 1) stack.pop();
    else if (c === "\n") return { end: k, value: null };
    else return { end: k + 1, value: state.literal ? text.slice(i + 1, k) : null };
  }
  return { end: text.length, value: null };
}

/**
 * A character of a string at `k` that may escape the next one (`\`, the first quote of ''), or open a template
 * (`${`): the index of the last character it takes. A string with either has no literal value.
 */
function stringCharacter(text, k, stack, state) {
  const c = text[k];
  if (c === "\\" || c === "'") {
    state.literal = false;
    return k + 1;
  }
  if (c !== "$" || text[k + 1] !== "{") return k;
  state.literal = false;
  stack.push(0);
  return k + 1;
}

/** An identifier that starts at `i`: its text (none past MAX_WORD characters) and its end. */
function identifier(text, i) {
  let k = i + 1;
  while (k < text.length && isPart(text[k])) k++;
  return { type: "id", value: k - i <= MAX_WORD ? text.slice(i, k) : "", end: k };
}

/**
 * The token at `i` and the index after it: type null for blanks, comments and `#disable-next-line` directives
 * (skipped), "str" (its value when a literal), "id", "nl", "=", ":", ",", "@", a bracket, or "op" for anything else
 * (`==`, `=~`, `=>` included).
 * @returns {{ type: string|null, value: string|null, end: number }}
 */
function token(text, i) {
  const c = text[i];
  const skipped = blank(text, i);
  if (skipped) return skipped;
  if (c === "'") return { type: "str", ...quoted(text, i) };
  if (isStart(c)) return identifier(text, i);
  if (c === "\n") return { type: "nl", value: null, end: i + 1 };
  if ("{}[](),:@".includes(c)) return { type: c, value: null, end: i + 1 };
  return operator(text, i);
}

/** An operator at `i`: "=" alone, else "op" (one token for ==, !=, =~, !~, <=, >=, =>). */
function operator(text, i) {
  const second = "=~>".includes(text[i + 1] ?? " ");
  if (text[i] === "=" && !second) return { type: "=", value: null, end: i + 1 };
  return { type: "op", value: null, end: i + (second ? 2 : 1) };
}

/** The version of a module from a registry or a template spec ('br:…/storage:v1', 'ts:…:1.0'), or undefined. */
function moduleVersion(source) {
  if (!source.startsWith("br:") && !source.startsWith("br/") && !source.startsWith("ts:") && !source.startsWith("ts/"))
    return undefined;
  const v = source.slice(source.lastIndexOf(":") + 1);
  return v && !v.includes("/") ? v : undefined;
}

/** `resource sym 'Type@version'` in `f`: its item — a child's type completed by its parent's — awaiting its body. */
function resource(w, f, s, value) {
  const at = value.indexOf("@");
  let type = at === -1 ? value : value.slice(0, at);
  let version = at === -1 ? undefined : value.slice(at + 1);
  const parent = f.role === "body" ? f.res : undefined;
  if (parent && !type.includes("/")) {
    if (parent.type.length + type.length < MAX_TYPE) type = `${parent.type}/${type}`;
    version ??= parent.version;
  }
  return push(w, { kind: "resource", provider: "azure", type, version, name: s[1].value }, s[0].index);
}

/** `module sym 'path'` in `f`: its item, awaiting its body (where its params are named). */
function module(w, s, value) {
  const source = withoutQuery(value);
  const fields = { kind: "module", type: "module", name: s[1].value, source, version: moduleVersion(source) };
  return Object.assign(push(w, fields, s[0].index), { variables: [] });
}

/** A declaration's first tokens: `param name`, `output name`, `resource sym 'T@v'`, `module sym 'path'`. */
function declaration(w, f) {
  const s = f.stmt;
  if (s[0].type !== "id" || s[1].type !== "id") return;
  const keyword = s[0].value;
  if (f.n === 2 && f.role === "root" && (keyword === "param" || keyword === "output"))
    push(w, { kind: keyword === "param" ? "variable" : "output", type: keyword, name: s[1].value }, s[0].index);
  const value = f.n === 3 && s[2].type === "str" ? s[2].value : null;
  const item = value === null ? null : declared(w, f, keyword, value);
  if (item) w.pending = { item, owner: f, depth: w.stack.length };
}

/** `resource sym 'T@v'` (at the top or in a parent's body), `module sym 'path'` (at the top): its item, or null. */
function declared(w, f, keyword, value) {
  if (keyword === "resource" && (f.role === "root" || f.role === "body")) return resource(w, f, f.stmt, value);
  return keyword === "module" && f.role === "root" ? module(w, f.stmt, value) : null;
}

/** Whether a property says its security rule is outbound or denies: then its ranges let no one in. */
function shuts(key, value) {
  const v = value.toLowerCase();
  return (key === "direction" && v === "outbound") || (key === "access" && v === "deny");
}

/** The key of a statement `key:` (an identifier or a quoted literal), or null. */
const keyOf = (s) => ((s[0].type === "id" || s[0].type === "str") && s[1].type === ":" ? s[0].value : null);

/** `key:` in `f`: a module's param named, a source range starts (its strings are read until the statement ends). */
function property(w, f, key) {
  if (f.role === "params" && f.item.variables.length < MAX_INPUTS) f.item.variables.push(key);
  if (f.res && RANGES.has(key)) {
    w.collector = f;
    f.ranges = true;
  }
}

/** The statement of a "{" frame ends (a newline, a comma, its closing brace). */
function endStatement(w, f) {
  if (w.collector === f) w.collector = null;
  if (w.pending?.owner === f) w.pending = null;
  const s = f.stmt;
  const key = f.n === 3 && s[2].type === "str" && s[2].value !== null ? keyOf(s) : null;
  if (key === "name" && f.role === "body") f.item.name = s[2].value;
  else if (key && f.res && shuts(key, s[2].value)) f.shut = true;
  f.stmt = [];
  f.n = 0;
}

const topOf = (w) => w.stack[w.stack.length - 1];

/** Any other token: kept in its statement, where it may complete a declaration or a property's key. */
function word(w, t) {
  const top = topOf(w);
  if (top.n < STATEMENT) top.stmt.push(t);
  top.n++;
  top.last = t.type;
  if (w.collector) rangeToken(w.collector, t);
  if (top.open !== "{") return;
  if (top.n === 2 || top.n === 3) declaration(w, top);
  if (t.type === ":" && top.n === 2 && keyOf(top.stmt) !== null) property(w, top, keyOf(top.stmt));
}

/** A "{" opens: the body of the declaration being read, a module's params, or a value. */
function opened(w, top, f) {
  const p = w.pending;
  if (p && w.stack[p.depth - 1] === p.owner && BODY_AFTER.has(top.last)) {
    f.item = p.item;
    f.role = p.item.kind === "module" ? "module" : "body";
    if (p.item.kind === "resource") f.res = p.item;
    w.pending = null;
  } else if (top.role === "module" && top.n === 2 && keyOf(top.stmt) === "params") {
    f.role = "params";
    f.item = top.item;
  }
}

/** A "{" frame closes: what it saw goes to its resource (a body: the resource's own, never its parent's). */
function closed(f) {
  if (f.role === "body") {
    if (f.ranges) f.item.openToAll = openness(f);
    return;
  }
  const up = f.brace;
  if (up && f.ranges) up.ranges = true;
  if (up && f.wide && !f.shut) up.wide = true;
  if (up && f.unknown && !f.shut) up.unknown = true;
}

/** What each token does to the walk (any other: `word`). */
const HANDLERS = Object.freeze({
  nl(w) {
    if (topOf(w).open === "{") endStatement(w, topOf(w));
  },
  ",": (w) => HANDLERS.nl(w),
  "{"(w) {
    if (w.stack.length >= MAX_DEPTH) return void w.deep++;
    const top = topOf(w);
    const f = /** @type {Frame} */ ({ open: "{", brace: top.open === "{" ? top : top.brace, stmt: [], n: 0 });
    f.res = top.res;
    opened(w, top, f);
    w.stack.push(f);
  },
  "}"(w, t) {
    if (w.deep) return void w.deep--;
    while (w.stack.length > 1) {
      const f = w.stack.pop();
      if (f.open !== "{") continue;
      endStatement(w, f);
      closed(f);
      break;
    }
    word(w, t);
  },
  "["(w, t) {
    const top = topOf(w);
    word(w, t);
    if (w.stack.length >= MAX_DEPTH) return void w.deep++;
    w.stack.push({ open: t.type, brace: top.open === "{" ? top : top.brace, stmt: [], n: 0, res: top.res });
  },
  "(": (w, t) => HANDLERS["["](w, t),
  "]"(w, t) {
    if (w.deep) return void w.deep--;
    if (w.stack.length === 1 || topOf(w).open !== (t.type === "]" ? "[" : "(")) return;
    w.stack.pop();
    const top = topOf(w);
    // A decorator (`@secure()`, `@description('…')`) ends with its parenthesis: the declaration starts after it.
    if (t.type === ")" && top.stmt[0]?.type === "@") Object.assign(top, { stmt: [], n: 0 });
    else word(w, t);
  },
  ")": (w, t) => HANDLERS["]"](w, t),
});

/**
 * The items of one Bicep file, pushed into `items` (the walk stops once it holds MAX_ITEMS).
 * @param {string} text
 * @param {string} file
 * @param {Item[]} [items]
 * @returns {Item[]}
 */
export function bicepDeclarations(text, file, items = []) {
  const root = /** @type {Frame} */ ({ open: "{", brace: null, stmt: [], n: 0, role: "root" });
  const { lineOf } = textIndex(text);
  /** @type {Walk} */
  const w = {
    stack: [root],
    deep: 0,
    collector: null,
    pending: null,
    file,
    env: environmentOfPath(file),
    lineOf,
    items,
  };
  for (let i = 0; i < text.length && items.length < MAX_ITEMS;) {
    const t = token(text, i);
    if (t.type) (HANDLERS[t.type] ?? word)(w, { type: t.type, value: t.value, index: i });
    i = t.end;
  }
  return items;
}

export default {
  name: "bicep",
  files: FILES,
  infra({ sources }) {
    const items = [];
    for (const [file, text] of sources) if (items.length < MAX_ITEMS) bicepDeclarations(text, file, items);
    return items;
  },
};
