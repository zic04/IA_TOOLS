// A YAML reader for the infrastructure files of an application (ARCHITECTURE.md §6.9, source `infra`: Kubernetes
// manifests, Compose files, CI pipelines, CloudFormation and Ansible). The text is untrusted (SECURITY.md), so the
// reader takes YAML as these files write it — block mappings and sequences, plain, quoted and block scalars, flow
// collections, several documents — in one pass over the lines, and expands nothing:
//   - an alias (`*base`) stays the text "*base", an anchor (`&base`) is dropped: no billion laughs;
//   - a tag (`!Ref name`, `!!str`) is kept beside the scalar, never resolved;
//   - the depth, the number of nodes and the length of a block scalar are bounded; past a bound, what was read is
//     kept and the rest is not;
//   - text that is not YAML (a Helm template, `{{ … }}`) gives what could be read, never an error.
// Pure: no I/O.
//   node: { type: "map", line, entries: [{ key, line, value }] } | { type: "seq", line, items } |
//         { type: "scalar", line, value, tag?, alias?, quoted? } | null (an empty value)

/** At most this many nodes per text, this many levels, this many characters per block scalar or flow collection. */
const LIMITS = Object.freeze({ nodes: 200_000, depth: 64, block: 64 * 1024, flow: 4000 });

/** A block scalar's header (`|`, `>-`, `|+2`) and the escapes of a double-quoted scalar. */
const BLOCK_HEADER = /^[|>][-+0-9]{0,3}$/;
const ESCAPE = /\\(["\\/nt])/g;

/** The expressions of this module (test/tools/redos-worker.mjs). */
export const YAML_PATTERNS = Object.freeze({ BLOCK_HEADER, ESCAPE });

/**
 * The lines of a text that hold YAML: their indentation, their text without its comment, their 1-based number;
 * blank and comment lines are left out, a document marker (`---`, `...`) is kept as such.
 * @param {string[]} rawLines   the text split at its newlines
 */
function linesOf(rawLines) {
  const out = [];
  let n = 0;
  for (const raw of rawLines) {
    n++;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    let indent = 0;
    while (indent < line.length && (line[indent] === " " || line[indent] === "\t")) indent++;
    const content = withoutComment(line.slice(indent)).trimEnd();
    if (!content) continue;
    const marker = indent === 0 && (content === "---" || content.startsWith("--- ") || content === "...");
    out.push({
      indent,
      content: marker && content.startsWith("--- ") ? content.slice(4) : content,
      line: n,
      marker,
    });
  }
  return out;
}

/** A line's text without its comment: a `#` at its start or after a blank, outside quotes. Linear. */
function withoutComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (quote === '"' && c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || " \t:[{,-".includes(s[i - 1])) quote = c;
    } else if (c === "#" && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) return s.slice(0, i);
  }
  return s;
}

/**
 * Where the key of a mapping entry ends in a line's text (the index of its ":", followed by a blank or the end), or
 * -1 when the text is no entry: a quoted key, or a plain one — never inside a flow collection or a quoted scalar.
 */
function keyEnd(s) {
  if (s[0] === "[" || s[0] === "{" || s.startsWith("- ") || s === "-") return -1;
  let i = 0;
  if (s[0] === '"' || s[0] === "'") {
    i = quotedEnd(s, 0);
    while (s[i] === " ") i++;
    return s[i] === ":" && (i + 1 === s.length || s[i + 1] === " ") ? i : -1;
  }
  for (; i < s.length; i++) if (s[i] === ":" && (i + 1 === s.length || s[i + 1] === " " || s[i + 1] === "\t")) return i;
  return -1;
}

/** The index after a quoted scalar that opens at `i` ('' and \" inside it), or the text's length. */
function quotedEnd(s, i) {
  const q = s[i];
  for (let k = i + 1; k < s.length; k++) {
    if (q === '"' && s[k] === "\\") k++;
    else if (s[k] === q) {
      if (q === "'" && s[k + 1] === "'") k++;
      else return k + 1;
    }
  }
  return s.length;
}

/** The value of a quoted scalar ('' → ', a few \ escapes), from its text. */
function unquoted(s) {
  const q = s[0];
  const end = quotedEnd(s, 0);
  const body = s.slice(1, s[end - 1] === q ? end - 1 : end);
  if (q === "'") return body.replaceAll("''", "'");
  return body.replace(ESCAPE, (m, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

/** A key as written: a quoted one unquoted. */
const keyOf = (s) => (s[0] === '"' || s[0] === "'" ? unquoted(s) : s.trim());

/** A value's text without the anchor and the tag before it (`&base`, `!Ref`, two at most), and that tag. */
function properties(text) {
  let s = text.trim();
  let tag;
  for (let k = 0; k < 2 && (s[0] === "!" || s[0] === "&"); k++) {
    const sp = s.indexOf(" ");
    const word = sp === -1 ? s : s.slice(0, sp);
    if (word[0] === "!") tag = word;
    s = sp === -1 ? "" : s.slice(sp + 1).trim();
  }
  return { s, tag };
}

/**
 * A scalar from its text: a tag (`!Ref`, `!!str`) and an anchor (`&a`) before it taken off (the tag kept), an alias
 * kept as written (`*a`, never expanded), a quoted one unquoted.
 */
function scalarOf(text, line) {
  const { s, tag } = properties(text);
  const node = { type: "scalar", line, value: s };
  if (tag) node.tag = tag;
  if (s[0] === "*") node.alias = true;
  else if (s[0] === '"' || s[0] === "'") Object.assign(node, { value: unquoted(s), quoted: true });
  return s || tag ? node : null;
}

/**
 * A flow collection (`[a, b]`, `{a: 1, b: [x]}`) from its text, LIMITS.flow characters at most, `depth` levels of
 * nesting at most; an unclosed one gives what it holds.
 */
function flowOf(s, line, state, depth = 0) {
  const at = { i: 0 };
  const node = flowNode(s.slice(0, LIMITS.flow), at, line, state, depth);
  return node;
}

/** One flow node from `at.i` of `s` (none past LIMITS.nodes). */
function flowNode(s, at, line, state, depth) {
  while (s[at.i] === " ") at.i++;
  if (state.nodes >= LIMITS.nodes) return null;
  state.nodes++;
  const open = s[at.i];
  if ((open === "[" || open === "{") && depth < LIMITS.depth) {
    at.i++;
    const node = open === "[" ? { type: "seq", line, items: [] } : { type: "map", line, entries: [] };
    const close = open === "[" ? "]" : "}";
    while (at.i < s.length) {
      while (s[at.i] === " " || s[at.i] === ",") at.i++;
      if (s[at.i] === close) {
        at.i++;
        break;
      }
      const before = at.i;
      if (open === "{") {
        const key = flowScalarText(s, at, ":");
        if (s[at.i] === ":") at.i++;
        node.entries.push({ key: keyOf(key), line, value: flowNode(s, at, line, state, depth + 1) });
      } else node.items.push(flowNode(s, at, line, state, depth + 1));
      if (at.i === before) at.i++;
    }
    return node;
  }
  return scalarOf(flowScalarText(s, at, ""), line);
}

/** The text of a flow scalar from `at.i`: to the next "," "]" "}" (and `stop`) outside quotes. */
function flowScalarText(s, at, stop) {
  const from = at.i;
  if (s[at.i] === '"' || s[at.i] === "'") at.i = quotedEnd(s, at.i);
  while (at.i < s.length && !",]}".includes(s[at.i]) && !(stop && s[at.i] === stop)) at.i++;
  return s.slice(from, at.i);
}

/** How much a piece of text opens flow brackets (outside quotes): + for each "[" "{", - for each "]" "}". */
function bracketDelta(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") i = quotedEnd(s, i) - 1;
    else if (c === "[" || c === "{") d++;
    else if (c === "]" || c === "}") d--;
  }
  return d;
}

/**
 * The text of a flow collection that opens a value: its line, and the next more indented lines while its brackets
 * are open — LIMITS.flow characters and 64 lines at most, each piece's brackets counted once.
 */
function flowText(p, first, indent) {
  let out = first;
  let open = bracketDelta(first);
  for (let k = 0; k < 64 && open > 0 && out.length < LIMITS.flow && p.at < p.lines.length; k++) {
    const l = p.lines[p.at];
    if (l.marker || l.indent <= indent) break;
    const piece = l.content.trim();
    out += " " + piece;
    open += bracketDelta(piece);
    p.at++;
  }
  return out;
}

/** The parser's state over the lines of a text: the next line, the nodes made, the raw lines (for block scalars). */
function parser(lines, raw) {
  return { lines, raw, at: 0, nodes: 0 };
}

/** The indentation of a raw line (blanks and tabs), its length when the line is blank. */
function indentOf(raw) {
  let i = 0;
  while (i < raw.length && (raw[i] === " " || raw[i] === "\t" || raw[i] === "\r")) i++;
  return i;
}

/**
 * A block scalar (`|`, `>`, with their modifiers) whose header ends line `line`: the raw lines after it more indented
 * than `indent`, and the blank ones between them — comments are text there — LIMITS.block characters at most, their
 * indentation taken off, the blank lines at its end left out. Each raw line read once: the parser goes on after them.
 */
function blockScalar(p, indent, line) {
  const parts = [];
  let size = 0;
  let margin = -1;
  let k = line; // the raw lines are 0-based: the one after the header
  for (; k < p.raw.length; k++) {
    const raw = p.raw[k].endsWith("\r") ? p.raw[k].slice(0, -1) : p.raw[k];
    const ind = indentOf(raw);
    if (ind < raw.length && ind <= indent) break;
    if (margin === -1 && ind < raw.length) margin = ind;
    if (size < LIMITS.block) {
      const text = ind < raw.length ? raw.slice(Math.min(margin, ind)) : "";
      parts.push(text);
      size += text.length + 1;
    }
  }
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  while (p.at < p.lines.length && p.lines[p.at].line <= k) p.at++;
  return { type: "scalar", line, value: parts.join("\n").slice(0, LIMITS.block), block: true };
}

/**
 * The value of an entry or an item whose text after its key or dash is `rest`, on line `line`, at `indent`. Below an
 * entry, a sequence may start at the entry's own indentation (`key:` then `- a`); below an empty item, a line at its
 * indentation is the next item, never its value.
 */
function valueAfter(p, rest, indent, line, depth, ofItem = false) {
  const r = rest.trim();
  const { s: bare, tag } = properties(r);
  // A tag before a block scalar, a flow collection or a value on the lines below stays on what is read (`!Sub |`).
  const tagged = (n) => (tag && n ? Object.assign(n, { tag }) : n);
  if (BLOCK_HEADER.test(bare)) return tagged(blockScalar(p, indent, line));
  if (bare === "") {
    const next = p.lines[p.at];
    if (next && !next.marker && (next.indent > indent || (!ofItem && next.indent === indent && isItem(next.content))))
      return tagged(node(p, next.indent, depth + 1));
    return null;
  }
  if (bare[0] === "[" || bare[0] === "{") return tagged(flowOf(flowText(p, bare, indent), line, p, depth));
  // A plain scalar may go on over the next, more indented lines: they are its text, not entries.
  const parts = [r];
  while (p.at < p.lines.length && p.lines[p.at].indent > indent && !p.lines[p.at].marker && parts.length < 64) {
    const next = p.lines[p.at];
    if (keyEnd(next.content) !== -1 || isItem(next.content)) break;
    parts.push(next.content.trim());
    p.at++;
  }
  return scalarOf(parts.join(" "), line);
}

/** Whether a line's text is a sequence item ("- x", or a dash alone). */
const isItem = (s) => s === "-" || s.startsWith("- ");

/** The node that starts at the current line, at `indent`: a sequence, a mapping or a scalar. */
function node(p, indent, depth) {
  const first = p.lines[p.at];
  if (!first || depth > LIMITS.depth || p.nodes >= LIMITS.nodes) {
    while (p.at < p.lines.length && p.lines[p.at].indent >= indent && !p.lines[p.at].marker) p.at++;
    return null;
  }
  p.nodes++;
  if (isItem(first.content)) return sequence(p, first.indent, depth);
  if (keyEnd(first.content) !== -1) return mapping(p, first.indent, first.content, first.line, depth);
  p.at++;
  return valueAfter(p, first.content, first.indent, first.line, depth);
}

/** A block sequence at `indent`: its items, each "- " followed by a scalar, a flow collection, an entry or nothing. */
function sequence(p, indent, depth) {
  const seq = { type: "seq", line: p.lines[p.at].line, items: [] };
  while (p.at < p.lines.length) {
    const l = p.lines[p.at];
    if (l.marker || l.indent !== indent || !isItem(l.content) || p.nodes >= LIMITS.nodes) break;
    p.nodes++;
    p.at++;
    const rest = l.content === "-" ? "" : l.content.slice(2);
    const offset = l.content.length - rest.trimStart().length;
    if (keyEnd(rest.trimStart()) !== -1)
      seq.items.push(mapping(p, indent + offset, rest.trimStart(), l.line, depth + 1));
    else seq.items.push(valueAfter(p, rest, indent, l.line, depth, true));
  }
  return seq;
}

/**
 * A block mapping at `indent` whose first entry's text is `head` (already taken from its line when it follows a
 * dash): its entries, each "key:" and its value on the same line or below.
 */
function mapping(p, indent, head, line, depth) {
  const map = { type: "map", line, entries: [] };
  let text = head;
  let at = line;
  let taken = p.lines[p.at]?.content === head && p.lines[p.at]?.line === line;
  for (;;) {
    if (taken) p.at++;
    const k = keyEnd(text);
    if (k === -1 || p.nodes >= LIMITS.nodes) break;
    p.nodes++;
    map.entries.push({
      key: keyOf(text.slice(0, k)),
      line: at,
      value: valueAfter(p, text.slice(k + 1), indent, at, depth),
    });
    const l = p.lines[p.at];
    if (!l || l.marker || l.indent !== indent || isItem(l.content) || keyEnd(l.content) === -1) break;
    text = l.content;
    at = l.line;
    taken = true;
  }
  return map;
}

/**
 * The documents of a YAML text, each a node (null for an empty document).
 * @param {string} text
 * @returns {Array<any>}
 */
export function readYaml(text) {
  const raw = text.split("\n");
  const p = parser(linesOf(raw), raw);
  const docs = [];
  // Past LIMITS.nodes, the rest of the text is not read.
  while (p.at < p.lines.length && p.nodes < LIMITS.nodes) {
    if (p.lines[p.at].marker) {
      const l = p.lines[p.at++];
      if (l.content !== "---" && l.content !== "..." && l.content) docs.push(scalarOf(l.content, l.line));
      continue;
    }
    const before = p.at;
    docs.push(node(p, p.lines[p.at].indent, 0));
    // What could not be read (a line less indented than its document, a template's text): skipped, one line.
    if (p.at === before) p.at++;
  }
  return docs;
}

/** The value of a key of a mapping node, or undefined. */
export const field = (map, key) => (map?.type === "map" ? map.entries.find((e) => e.key === key) : undefined);

/** The scalar text of a node (a number, a word: as written), or null. */
export const text = (n) => (n?.type === "scalar" ? n.value : null);

/** The items of a sequence node, or []. */
export const items = (n) => (n?.type === "seq" ? n.items : []);

/** The entries of a mapping node, or []. */
export const entries = (n) => (n?.type === "map" ? n.entries : []);

/** The node at a path of keys in mappings ("spec", "template", "spec"), or undefined. */
export function at(n, ...keys) {
  let cur = n;
  for (const k of keys) cur = field(cur, k)?.value;
  return cur ?? undefined;
}
