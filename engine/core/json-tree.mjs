// A JSON text read as engine/core/yaml.mjs reads YAML — map, seq and scalar nodes, each with its 1-based line (a
// key's line on its entry) — so that the readers of the infra adapters apply to both (ARM templates, CloudFormation's
// JSON form). JSON.parse checks the text first; then one walk with a stack, no recursion whatever the depth, and no
// regular expression. Comments (which ARM accepts: // and /* */) are blanked first by `withoutJsonComments`.

/**
 * @typedef {{ type: "map", line: number, entries: Array<{ key: string, line: number, value: JsonNode }> } |
 *   { type: "seq", line: number, items: JsonNode[] } | { type: "scalar", line: number, value: string }} JsonNode
 * @typedef {{ stack: Array<{ node: any, key: string|null, line: number }>, root: JsonNode|null, line: number }} Walk
 *   the collections open, each awaiting its next key, and the line the walk is on
 */

/** Where a JSON string that opens at `i` ends (the index of its closing quote, or of its line's end). */
function stringEnd(s, i) {
  let k = i + 1;
  while (k < s.length && s[k] !== '"' && s[k] !== "\n") k += s[k] === "\\" ? 2 : 1;
  return k;
}

/**
 * The text with its comments (// and /* *\/ outside strings) blanked — newlines kept, so every line stays where it
 * was. One walk.
 * @param {string} s
 */
export function withoutJsonComments(s) {
  const parts = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') i = stringEnd(s, i);
    else if (s[i] === "/" && (s[i + 1] === "/" || s[i + 1] === "*")) {
      const line = s[i + 1] === "/";
      const close = line ? s.indexOf("\n", i) : s.indexOf("*/", i + 2);
      const end = close === -1 ? s.length : line ? close : close + 2;
      const blank = s
        .slice(i, end)
        .split("\n")
        .map((l) => " ".repeat(l.length))
        .join("\n");
      parts.push(s.slice(from, i), blank);
      from = end;
      i = end - 1;
    }
  }
  return parts.length ? parts.join("") + s.slice(from) : s;
}

/** Collections nested deeper than this: the text is no template a person wrote, and is not read. */
const MAX_DEPTH = 256;

/** Whether no collection of the text is nested deeper than MAX_DEPTH (strings skipped). One walk, before JSON.parse. */
function shallow(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') i = stringEnd(s, i);
    else if (c === "{" || c === "[") {
      if (++depth > MAX_DEPTH) return false;
    } else if (c === "}" || c === "]") depth--;
  }
  return true;
}

/** Whether JSON.parse accepts the text (then every string of it is closed and well escaped). */
function parses(s) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/** A node read: the root, an item of the list open, or the value of the key read in the mapping open. */
function attach(walk, node) {
  const top = walk.stack[walk.stack.length - 1];
  if (!top) walk.root ??= node;
  else if (top.node.type === "seq") top.node.items.push(node);
  else {
    top.node.entries.push({ key: top.key, line: top.line, value: node });
    top.key = null;
  }
  return node;
}

/** A string at `i`: the key a mapping awaits, else a value; the index of its closing quote. */
function jsonString(walk, s, i) {
  const end = stringEnd(s, i);
  const value = JSON.parse(s.slice(i, end + 1));
  const top = walk.stack[walk.stack.length - 1];
  if (top?.node.type === "map" && top.key === null) Object.assign(top, { key: value, line: walk.line });
  else attach(walk, { type: "scalar", line: walk.line, value });
  return end;
}

/** A number, true, false or null at `i`, kept as written: the index of its last character. */
function jsonWord(walk, s, i) {
  let k = i;
  while (k < s.length && !" \t\r\n,:]}".includes(s[k])) k++;
  attach(walk, { type: "scalar", line: walk.line, value: s.slice(i, k) });
  return k - 1;
}

/**
 * The nodes of a JSON text (a byte order mark allowed), or null when JSON.parse refuses it. A string never holds a
 * raw newline in JSON, so the walk counts the lines as it goes.
 * @param {string} raw
 * @returns {JsonNode|null}
 */
export function jsonTree(raw) {
  const s = raw.charCodeAt(0) === 0xfeff ? ` ${raw.slice(1)}` : raw;
  if (!shallow(s) || !parses(s)) return null;
  /** @type {Walk} */
  const walk = { stack: [], root: null, line: 1 };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\n") walk.line++;
    else if (c === '"') i = jsonString(walk, s, i);
    else if (c === "{" || c === "[") {
      const node =
        c === "{" ? { type: "map", line: walk.line, entries: [] } : { type: "seq", line: walk.line, items: [] };
      walk.stack.push({ node: attach(walk, /** @type {JsonNode} */ (node)), key: null, line: 0 });
    } else if (c === "}" || c === "]") walk.stack.pop();
    else if (!" \t\r,:".includes(c)) i = jsonWord(walk, s, i);
  }
  return walk.root;
}
