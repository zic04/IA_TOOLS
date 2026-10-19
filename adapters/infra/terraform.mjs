// Infra adapter of Terraform (ARCHITECTURE.md §5, §6.9): the blocks of the `.tf` files — resources and data sources,
// modules (their source, version and the names of their inputs), providers (their blocks, and the required_providers
// of the terraform block with their version), variables and outputs — read by one linear walk of the HCL text that
// follows its strings (escapes, ${…} and %{…} templates), its heredocs (<<EOF, <<-EOF) and its comments (#, //,
// /* */): a declaration in a comment, a string or a heredoc is none. A resource whose address ranges (cidr_blocks,
// source_address_prefix…) let anyone in — a rule that is inbound and allows — is openToAll. Never a value: a
// variable's default, an output's value, a module input's value (its name only), what a module source's query may
// carry but its ref; a .tfvars file (values) is never read, nor the JSON form (.tf.json).
import { textIndex } from "../../engine/facts/behaviour-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import { environmentOfPath, withoutQuery } from "../../engine/facts/infra-common.mjs";
import { lineEnd, blank, push, rangeToken, openness } from "../../engine/facts/infra-lexer.mjs";

/** The files read: `.tf` (never `.tfvars`, which hold values). */
const FILES = /\.tf$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const TERRAFORM_PATTERNS = Object.freeze({ FILES });

/** A literal string's text with its backslash escapes taken off (\" → ", \\ → \): one walk, no expression. */
function unescaped(raw) {
  if (!raw.includes("\\")) return raw;
  let out = "";
  for (let k = 0; k < raw.length; k++) out += raw[k] === "\\" && k + 1 < raw.length ? raw[++k] : raw[k];
  return out;
}

/** The longest identifier kept as a word (a longer one is a token without a value), the tokens kept of a statement. */
const MAX_WORD = 256;
const STATEMENT = 6;
/** At most this many inputs named per module. */
const MAX_INPUTS = 64;
/** Brackets nested deeper than this are counted, not followed (no Terraform file goes so deep). */
const MAX_DEPTH = 256;

/** The top-level blocks read, and the kind of item each gives. */
const BLOCKS = Object.freeze({
  resource: "resource",
  data: "resource",
  module: "module",
  provider: "provider",
  variable: "variable",
  output: "output",
});
/** The arguments of a module block that are none of its inputs (Terraform's meta-arguments). */
const META = new Set(["source", "version", "providers", "count", "for_each", "depends_on"]);
/** The address ranges of a rule: an open one lets anyone in, unless the rule is outbound or denies. */
const RANGES = new Set([
  "cidr_blocks",
  "ipv6_cidr_blocks",
  "cidr_ipv4",
  "cidr_ipv6",
  "source_address_prefix",
  "source_address_prefixes",
  "source_ranges",
]);

/**
 * @typedef {{ type: string, value: string|null, index: number }} Token
 * @typedef {{ kind: string, provider?: string, type: string, name: string, file: string, line: number, env?: string,
 *   source?: string, version?: string, variables?: string[], openToAll?: boolean }} Item
 * @typedef {{ open: string, brace: Frame|null, stmt: Token[], n: number, role?: string, item?: Item, res?: Item,
 *   ranges?: boolean, wide?: boolean, unknown?: boolean, shut?: boolean }} Frame
 *   a bracket open in the walk: `brace` the nearest "{" around it, `stmt` the first tokens of its current statement
 *   (`n` their number), `res` the resource it is in; `ranges`: an address range was seen, `wide`: an open one in a
 *   rule that lets in, `shut`: this rule is outbound or denies
 * @typedef {{ stack: Frame[], deep: number, collector: Frame|null, file: string, env?: string,
 *   lineOf: (i: number) => number, items: Item[] }} Walk   `deep`: the brackets open past MAX_DEPTH
 */

const isStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isPart = (c) => isStart(c) || (c >= "0" && c <= "9") || c === "-";

/** One character of a template's expression: a nested string opens, braces are counted, the last one closes it. */
function template(stack, c) {
  const depth = /** @type {number} */ (stack[stack.length - 1]);
  if (c === '"') stack.push("s");
  else if (c === "{") stack[stack.length - 1] = depth + 1;
  else if (c === "}") {
    if (depth === 0) stack.pop();
    else stack[stack.length - 1] = depth - 1;
  }
}

/**
 * A quoted string that opens at `i`: the index after it, and its value when it is a literal (no ${…} or %{…}
 * template). One walk; its templates and the strings nested in them are followed by a stack ("s" for a string, a
 * template's depth of braces). A string ends at its line (an unclosed quote costs its line); a template may go on.
 * @param {string} text
 * @param {number} i
 * @returns {{ end: number, value: string|null }}
 */
function quoted(text, i) {
  const stack = /** @type {Array<"s"|number>} */ (["s"]);
  const state = { literal: true };
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (stack[stack.length - 1] !== "s") template(stack, c);
    else if (c !== '"' && c !== "\n") k = stringCharacter(text, k, stack, state);
    else if (stack.length > 1) stack.pop();
    else if (c === "\n") return { end: k, value: null };
    else return { end: k + 1, value: state.literal ? unescaped(text.slice(i + 1, k)) : null };
  }
  return { end: text.length, value: null };
}

/**
 * A character of a string at `k` that may escape the next one (`\`), open a template (`${`, `%{`) or write one as
 * text (`$${`, `%%{`): the index of the last character it takes.
 */
function stringCharacter(text, k, stack, state) {
  const c = text[k];
  if (c === "\\") return k + 1;
  if (c !== "$" && c !== "%") return k;
  if (text[k + 1] === "{") {
    state.literal = false;
    stack.push(0);
    return k + 1;
  }
  return text[k + 1] === c && text[k + 2] === "{" ? k + 2 : k;
}

/**
 * Where a heredoc that opens at `i` (`<<EOF`, `<<-EOF`, the marker alone on its line) ends — the end of its closing
 * line, or of the text when it does not close — or -1 when none opens there. Each line is read once.
 */
function heredocEnd(text, i) {
  let k = i + 2;
  if (text[k] === "-") k++;
  const from = k;
  if (!isStart(text[k])) return -1;
  while (k < text.length && isPart(text[k])) k++;
  const marker = text.slice(from, k);
  while (text[k] === " " || text[k] === "\t" || text[k] === "\r") k++;
  if (k < text.length && text[k] !== "\n") return -1;
  for (let start = k + 1; start < text.length;) {
    const end = lineEnd(text, start);
    if (text.slice(start, end).trim() === marker) return end;
    start = end + 1;
  }
  return text.length;
}

/** An identifier that starts at `i`: its text (none past MAX_WORD characters) and its end. */
function identifier(text, i) {
  let k = i + 1;
  while (k < text.length && isPart(text[k])) k++;
  return { type: "id", value: k - i <= MAX_WORD ? text.slice(i, k) : "", end: k };
}

/**
 * The token at `i` and the index after it: type null for blanks and comments (skipped), "str" for a quoted string
 * or a heredoc (its value when a literal), "id", "nl", "=", ",", a bracket, or "op" for anything else.
 * @returns {{ type: string|null, value: string|null, end: number }}
 */
function token(text, i) {
  const c = text[i];
  const skipped = blank(text, i);
  if (skipped) return skipped;
  if (c === '"') return { type: "str", ...quoted(text, i) };
  const heredoc = c === "<" && text[i + 1] === "<" ? heredocEnd(text, i) : -1;
  if (heredoc !== -1) return { type: "str", value: null, end: heredoc };
  if (isStart(c)) return identifier(text, i);
  if (c === "\n") return { type: "nl", value: null, end: i + 1 };
  if ("{}[](),".includes(c)) return { type: c, value: null, end: i + 1 };
  return operator(text, i);
}

/** An operator at `i`: "=" alone, else "op" (one token for ==, !=, <=, >=). */
function operator(text, i) {
  const next = text[i + 1];
  if (text[i] === "=" && next !== "=" && next !== ">") return { type: "=", value: null, end: i + 1 };
  return { type: "op", value: null, end: i + (next === "=" ? 2 : 1) };
}

/**
 * The tokens of an HCL text in order, each handed to `emit` (which returns true to stop): one walk, each character
 * read once (twice for the identifier after a "<<" that opens no heredoc).
 * @param {string} text
 * @param {(t: Token) => boolean} emit
 */
function hclTokens(text, emit) {
  for (let i = 0; i < text.length;) {
    const t = token(text, i);
    if (t.type && emit({ type: t.type, value: t.value, index: i })) return;
    i = t.end;
  }
}

/** Whether an argument says its rule is outbound or denies: then its ranges let no one in. */
function shuts(key, value) {
  const v = value.toLowerCase();
  if (key === "type") return v === "egress";
  if (key === "direction") return v === "outbound" || v === "egress";
  return (key === "access" || key === "rule_action") && v === "deny";
}

/** A top-level block: its item (null when it is not read: locals, terraform, moved…, or its labels do not fit). */
function topLevel(w, type, labels, index) {
  const kind = BLOCKS[type];
  const two = type === "resource" || type === "data";
  if (!kind || labels.length !== (two ? 2 : 1)) return null;
  const [first, second] = labels;
  if (two)
    return push(
      w,
      { kind, provider: first.split("_")[0], type: type === "data" ? `data.${first}` : first, name: second },
      index,
    );
  if (type === "module") return push(w, { kind, type, name: first, variables: [] }, index);
  return push(w, { kind, provider: type === "provider" ? first : undefined, type, name: first }, index);
}

/** A top-level block opens: what `f` stands for (a resource's own egress rule lets no one in). */
function rootBlock(w, f, type, labels, index) {
  f.item = topLevel(w, type, labels, index) ?? undefined;
  if (type === "terraform") f.role = "terraform";
  else if (f.item?.kind === "module") f.role = "module";
  else if (f.item?.kind === "resource") {
    f.res = f.item;
    f.shut = f.item.type.endsWith("_egress_rule");
  }
}

/**
 * A block opens (`type label… {`) in `parent`: what `f` stands for — a nested egress block lets no one in, nor does
 * a resource that holds a deny block (a firewall that blocks).
 */
function block(w, parent, f, type, labels, index) {
  if (parent.role === "root") rootBlock(w, f, type, labels, index);
  else if (parent.role === "terraform" && type === "required_providers") f.role = "required_providers";
  else if (f.res && (type === "egress" || (type === "dynamic" && labels[0] === "egress"))) f.shut = true;
  else if (f.res && type === "deny" && parent.item === f.res) parent.shut = true;
}

/** A "{" opens in a body: a block (its header is the statement before it), or a value (`name = {`). */
function classify(w, parent, f) {
  const s = parent.stmt;
  const labels = s.slice(1);
  if (
    parent.n >= 1 &&
    parent.n <= 4 &&
    s[0].type === "id" &&
    labels.every((t) => (t.type === "str" || t.type === "id") && t.value !== null)
  )
    return block(
      w,
      parent,
      f,
      s[0].value,
      labels.map((t) => t.value),
      s[0].index,
    );
  if (parent.role === "required_providers" && parent.n === 2 && s[0].type === "id" && s[1].type === "=") {
    f.role = "required";
    f.item = push(
      w,
      { kind: "provider", type: "required_provider", name: s[0].value, provider: s[0].value },
      s[0].index,
    );
  }
}

/** An argument `key = "literal"` ends in `f`. */
function argument(w, f, key, value) {
  const k = key.value;
  if ((f.role === "module" || f.role === "required") && (k === "source" || k === "version"))
    f.item[k] = k === "source" ? withoutQuery(value) : value;
  else if (f.role === "required_providers")
    push(w, { kind: "provider", type: "required_provider", name: k, provider: k, version: value }, key.index);
  else if (f.res && shuts(k, value)) f.shut = true;
}

/** The statement of a "{" frame ends (a newline, a comma, its closing brace). */
function endStatement(w, f) {
  if (w.collector === f) w.collector = null;
  const [a, b, c] = f.stmt;
  if (f.n === 3 && a.type === "id" && b.type === "=" && c.type === "str" && c.value !== null)
    argument(w, f, a, c.value);
  f.stmt = [];
  f.n = 0;
}

/** `key =` in `f`: an address range starts (its strings are read until the statement ends), a module's input. */
function assigned(w, f, key) {
  if (f.res && RANGES.has(key)) {
    w.collector = f;
    f.ranges = true;
  }
  if (f.role === "module" && !META.has(key) && f.item.variables.length < MAX_INPUTS) f.item.variables.push(key);
}

const topOf = (w) => w.stack[w.stack.length - 1];

/** Any other token: kept in its statement; `=` after a name assigns it, a string of an address range is read. */
function word(w, t) {
  const top = topOf(w);
  if (top.n < STATEMENT) top.stmt.push(t);
  top.n++;
  if (t.type === "=" && top.n === 2 && top.open === "{" && top.stmt[0].type === "id")
    assigned(w, top, top.stmt[0].value);
  else if (w.collector) rangeToken(w.collector, t);
}

/** A "{" frame closes: what it saw goes to the frame around it, and to its resource. */
function closed(f) {
  const up = f.brace;
  if (up && f.ranges) up.ranges = true;
  if (up && f.wide && !f.shut) up.wide = true;
  if (up && f.unknown && !f.shut) up.unknown = true;
  if (f.item?.kind === "resource" && f.ranges) f.item.openToAll = openness(f);
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
    if (top.open === "{") classify(w, top, f);
    else if (top.shut) f.shut = true; // a rule of `egress = [{ … }]`: outbound
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
    // The attribute form of the outbound rules (`egress = [{ cidr_blocks = … }]`): the rules in it let no one in.
    const [key, eq] = top.stmt;
    const shut = top.open === "{" ? key?.type === "id" && key.value === "egress" && eq?.type === "=" : top.shut;
    w.stack.push({ open: t.type, brace: top.open === "{" ? top : top.brace, stmt: [], n: 0, res: top.res, shut });
  },
  "(": (w, t) => HANDLERS["["](w, t),
  "]"(w, t) {
    if (w.deep) return void w.deep--;
    if (w.stack.length > 1 && topOf(w).open === (t.type === "]" ? "[" : "(")) w.stack.pop();
  },
  ")": (w, t) => HANDLERS["]"](w, t),
});

/**
 * The items of one Terraform file, pushed into `items` (the walk stops once it holds MAX_ITEMS).
 * @param {string} text
 * @param {string} file
 * @param {Item[]} [items]
 * @returns {Item[]}
 */
export function terraformBlocks(text, file, items = []) {
  const root = /** @type {Frame} */ ({ open: "{", brace: null, stmt: [], n: 0, role: "root" });
  /** @type {Walk} */
  const w = {
    stack: [root],
    deep: 0,
    collector: null,
    file,
    env: environmentOfPath(file),
    lineOf: textIndex(text).lineOf,
    items,
  };
  hclTokens(text, (t) => {
    (HANDLERS[t.type] ?? word)(w, t);
    return items.length >= MAX_ITEMS;
  });
  return items;
}

export default {
  name: "terraform",
  files: FILES,
  infra({ sources }) {
    const items = [];
    for (const [file, text] of sources) if (items.length < MAX_ITEMS) terraformBlocks(text, file, items);
    return items;
  },
};
