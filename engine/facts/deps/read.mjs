// Reading a manifest of the `dependencies` source (engine/facts/dependencies.mjs): a file that cannot be read, a
// JSON manifest that is not valid JSON or an XML one that is not well-formed, is listed in `unreadable`
// ({ file, reason: "read"|"json"|"xml" }) — its dependencies are unknown, which is not the same as none (AUDIT.md
// M14). The small text helpers below (lines, comma lists, one-line TOML tables) scan with indexOf and single passes,
// no regular expression: the manifests are untrusted (RULES.md S5).
import fs from "node:fs";
import path from "node:path";
import { walkXml } from "../../core/xml.mjs";
import { stripBom } from "../../project/toc.mjs";
import { stepQuotes, follow, hasControl } from "./toml-scan.mjs";

/**
 * A file's bytes as text: UTF-8, its byte order mark dropped, or UTF-16 when it starts with that mark (Windows
 * PowerShell 5 writes `pip freeze > requirements.txt` so; pip reads it).
 * @param {Buffer} bytes
 * @returns {string}
 */
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2, bytes.length - (bytes.length % 2)));
    return swapped.swap16().toString("utf16le");
  }
  return stripBom(bytes.toString("utf8"));
}

/**
 * Text of a manifest, or null when it cannot be read (then listed in `unreadable`). `utf8Only`: a lock file its tool
 * reads as UTF-8 only (npm, Yarn, Poetry, uv) — one in UTF-16 is no lock to the tool, nor to the kit; "strict": a lock
 * its tool refuses when it is not valid UTF-8 (Poetry, uv), where npm and Yarn read the bytes replaced.
 * @param {string} abs
 * @param {string} manifest
 * @param {Array<{ file: string, reason: string }>} unreadable
 * @param {boolean|"strict"} [utf8Only]
 * @returns {string|null}
 */
export const readText = (abs, manifest, unreadable, utf8Only = false) => {
  try {
    const bytes = fs.readFileSync(abs);
    const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    if (utf8Only && utf16) throw new Error("UTF-16");
    if (utf8Only === "strict") new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decodeText(bytes);
  } catch {
    unreadable.push({ file: manifest, reason: "read" });
    return null;
  }
};

/** The largest manifest read beside a lock file (a package.json, a pyproject.toml, a Pipfile holds a few KB). */
const MAX_BESIDE = 4 * 1024 * 1024;

/**
 * The text of a manifest read BESIDE another one (the package.json of a yarn.lock, a workspace member's), or null:
 * only an ordinary file — never a link (it could lead out of the application), a folder, a device or a named pipe —
 * of at most 4 MB; with `within`, none of the folders between `within` and the file may be a link either.
 * @param {string} file
 * @param {{ within?: string }} [o]
 * @returns {string|null}
 */
export function readBeside(file, { within } = {}) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_BESIDE) return null;
    if (within) {
      const rel = path.relative(within, path.dirname(file));
      if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
      let at = within;
      for (const part of rel ? rel.split(path.sep) : []) {
        at = path.join(at, part);
        if (fs.lstatSync(at).isSymbolicLink()) return null;
      }
    }
    return decodeText(fs.readFileSync(file));
  } catch {
    return null;
  }
}

/** Parsed JSON manifest, or null when it cannot be read or is not valid JSON (then listed in `unreadable`). */
export const readJson = (abs, manifest, unreadable, utf8Only = false) => {
  const text = readText(abs, manifest, unreadable, utf8Only);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    unreadable.push({ file: manifest, reason: "json" });
    return null;
  }
};

/** @typedef {{ name: string, attrs: Record<string, string>, children: XmlNode[], text: string }} XmlNode */

/** The elements of a manifest this large are not read (a project file holds a few hundred). */
const XML_MAX_NODES = 200_000;

/**
 * The root element of an XML manifest as a tree (names without their prefix, text trimmed), read by the bounded,
 * DTD-free reader of the sources (engine/core/xml.mjs: no entity expanded), or null when it cannot be read or is
 * not well-formed (then listed in `unreadable`, reason "xml").
 * @returns {XmlNode|null}
 */
export function readXml(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return null;
  const top = /** @type {XmlNode} */ ({ name: "", attrs: {}, children: [], text: "" });
  const stack = [top];
  try {
    walkXml(
      text,
      {
        open: (name, attrs) => {
          const node = { name: name.slice(name.indexOf(":") + 1), attrs, children: [], text: "" };
          stack.at(-1).children.push(node);
          stack.push(node);
        },
        close: () => void stack.pop(),
        text: (t) => void (stack.at(-1).text += t),
      },
      { maxNodes: XML_MAX_NODES },
    );
  } catch {
    unreadable.push({ file: manifest, reason: "xml" }); // walkXml refuses: KitError "inputs.refused"
    return null;
  }
  return top.children[0] || null;
}

/** The child elements of `node` named `name` (case ignored, as MSBuild does). */
export const xmlChildren = (node, name) =>
  (node?.children || []).filter((c) => c.name.toLowerCase() === name.toLowerCase());

/** The trimmed text of the first child element of `node` named `name`, or null. */
export const xmlText = (node, name) => xmlChildren(node, name)[0]?.text.trim() ?? null;

/** An attribute of an element, its name case ignored (MSBuild: `Include`, `include`), or null. */
export const xmlAttr = (node, name) => {
  const key = Object.keys(node.attrs).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? null : node.attrs[key];
};

/**
 * The lines of a configuration file (a requirements file, an .npmrc, a .yarnrc, a .yarnrc.yml, a pip.conf), at every
 * line break one of their tools reads: \r\n, a lone \r (configparser, npm's ini, YAML), \n, and \f, \v, 0x1c–0x1e,
 * U+0085, U+2028, U+2029 (pip: Python's str.splitlines). Splitting more than a tool does is the safe side: a declaration is never hidden in a line.
 * @param {string} text
 * @returns {string[]}
 */
/** The line breaks of Python's str.splitlines (pip), configparser, npm's ini and YAML, together. */
const LINE_BREAKS = new Set([10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]);

export function configLines(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (!LINE_BREAKS.has(c)) continue;
    out.push(text.slice(start, i));
    if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
    start = i + 1;
  }
  out.push(text.slice(start));
  return out;
}

/** The lines of a text, without their "\r". */
export const textLines = (text) => text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

/**
 * Calls `visit(c, i)` on each character of `text` from `from` that is outside a quoted string (" or ', their triple
 * forms one token, a backslash escaping the next character in "…"), until `visit` returns true. One pass: linear.
 * @param {string} text
 * @param {number} from
 * @param {(c: string, i: number) => boolean} visit
 * @returns {number} the index where `visit` returned true, or text.length
 */
export function scanOutsideQuotes(text, from, visit) {
  const state = { quote: "" };
  for (let i = from; i < text.length; i++) {
    const inside = state.quote !== "" || text[i] === '"' || text[i] === "'";
    if (inside) i = stepQuotes(text, i, state);
    else if (visit(text[i], i)) return i;
  }
  return text.length;
}

/**
 * The pieces of a list separated by commas outside quotes and brackets (`version = "1, 2", features = ["a", "b"]`:
 * two pieces), trimmed; it stops at a closing bracket that was never opened (the end of a call or of a table).
 * @param {string} text
 * @returns {string[]}
 */
export function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  const end = scanOutsideQuotes(text, 0, (c, i) => {
    if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) return depth-- === 0;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
    return false;
  });
  out.push(text.slice(start, end).trim());
  return out.filter(Boolean);
}

/** A key without its quotes (`"serde"` → serde). */
export const unquote = (key) =>
  key.length > 1 && (key[0] === '"' || key[0] === "'") && key.at(-1) === key[0] ? key.slice(1, -1) : key;

/** Where a `key = value` piece's "=" is: the first one outside quotes (a quoted key may hold one), or -1. */
export function equalsAt(text) {
  const at = scanOutsideQuotes(text, 0, (c) => c === "=");
  return at < text.length ? at : -1;
}

/** The key (unquoted) and the value of a `key = value` piece, both trimmed, or null. */
export function keyValue(text) {
  const eq = equalsAt(text);
  if (eq <= 0) return null;
  return { key: unquote(text.slice(0, eq).trim()), value: text.slice(eq + 1).trim() };
}

/** The string a value starts with, quoted with " or ' (`"1.0" # pinned` → 1.0), or null. */
export function quoted(value) {
  const q = value[0];
  if (q !== '"' && q !== "'") return null;
  const end = value.indexOf(q, 1);
  return end < 0 ? null : value.slice(1, end);
}

/** The raw fields of a one-line TOML inline table (`{ version = "1", path = "../x" }`), or null when it is none. */
export function inlineTable(value) {
  if (value[0] !== "{") return null;
  const fields = new Map();
  for (const piece of splitTopLevel(value.slice(1))) {
    const kv = keyValue(piece);
    if (kv) fields.set(kv.key, kv.value);
  }
  return fields;
}

/** The name of a TOML table header (`[target.'cfg(unix)'.dependencies]`), "" for an array of tables, or null. */
export function tomlHeader(line) {
  if (line[0] !== "[") return null;
  if (line[1] === "[") return "";
  const end = scanOutsideQuotes(line, 1, (c) => c === "]");
  return end < line.length ? line.slice(1, end).trim() : null;
}

/** The longest value a TOML entry is read to (an array of a lock file runs over many lines): longer ones are cut. */
const MAX_TOML_VALUE = 200_000;
/** The most parts a value's path keeps (`tool.uv.sources.lib.git` has five): the rest is not a path the kit reads. */
const MAX_PATH = 16;
/**
 * The longest key or table name a TOML file is followed by: a longer one (a header, a key, an inline table's key) is a
 * doubt, and what it holds is left out — no reader below ever builds a string or a map key from a long name.
 */
export const MAX_NAME = 1000;
/** The most inline tables opened one inside another (`a = { b = { c = … } }`): deeper, the table is one value. */
const MAX_INLINE_DEPTH = 8;

/** A TOML basic string's escapes: \uXXXX, \UXXXXXXXX, TOML 1.1's \xHH (uv reads them), one character. Linear (S5). */
const ESCAPE = /\\(?:u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|x([0-9a-fA-F]{2})|([\s\S]))/g;
const ESCAPED = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\u001b", '"': '"', "\\": "\\" };

/** Whether `text` is a TOML bare key: one character at least, each a letter, a digit, "_" or "-". */
function bareKey(text) {
  if (!text) return false;
  for (const c of text)
    if (!((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "-"))
      return false;
  return true;
}

/**
 * One part of a dotted key: a "basic" string with its escapes decoded, a 'literal' one as written, or bare. An escape
 * TOML does not know is a doubt (\`report.doubt\`): the tool may read a name the kit cannot.
 */
export function keyPart(part, report) {
  const p = part.trim();
  if (p.length < 2 || p[0] !== p.at(-1) || (p[0] !== '"' && p[0] !== "'")) {
    // A bare key holds letters, digits, "_" and "-" only: a blank inside, an empty part, any other character is no TOML.
    if (!bareKey(p)) report.doubt = true;
    return p;
  }
  if (p[0] === "'") return p.slice(1, -1);
  return p.slice(1, -1).replace(ESCAPE, (m, u4, u8, x2, ch) => {
    if (ch !== undefined) {
      if (ESCAPED[ch] === undefined) report.doubt = true;
      return ESCAPED[ch] ?? m;
    }
    const code = parseInt(u4 ?? u8 ?? x2, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : String.fromCodePoint(0xfffd);
  });
}

/**
 * The parts of a dotted TOML key or table name, split at the dots outside quotes, each trimmed and unquoted — a
 * basic string's escapes decoded (`"corp-lib"` is corp-lib) — (`tool.uv.sources."corp.lib"` → tool, uv, sources,
 * corp.lib), 16 at most. One pass: linear.
 * @param {string} text
 * @param {{ doubt?: boolean }} [report]  set when a part holds an escape TOML does not know
 * @returns {string[]}
 */
export function dottedParts(text, report = {}) {
  const parts = [];
  let start = 0;
  const end = scanOutsideQuotes(text, 0, (c, i) => {
    if (c !== ".") return false;
    parts.push(text.slice(start, i));
    start = i + 1;
    return parts.length >= MAX_PATH;
  });
  if (parts.length < MAX_PATH) parts.push(text.slice(start, end));
  return parts.map((part) => keyPart(part, report));
}

/** A value's path: its table's parts, then its key's, 16 at most. */
const pathOf = (tableParts, rawKey, report) => [...tableParts, ...dottedParts(rawKey, report)].slice(0, MAX_PATH);

/**
 * @typedef {{ section: string, block: number, key: string, value: string, path: string[] }} TomlEntry
 *   `path`: the table's parts, then the key's (split at the dots outside quotes, unquoted), 16 at most —
 *   `[tool.uv]` + `sources."corp.lib" = …` gives tool, uv, sources, corp.lib.
 */

/**
 * What tomlEntries keeps from one line to the next: the current table (its header's text, its parts, the number of
 * arrays of tables and of headers seen so far), and what TOML refuses to see twice — the keys given under each header,
 * the tables defined in each block, the names of the tables and of the arrays of tables.
 */
const newTomlState = () => ({
  section: "",
  /** @type {string[]} */
  tableParts: [],
  block: 0,
  header: 0,
  given: new Set(),
  tables: new Set(),
  tableNames: new Set(),
  arrays: new Set(),
  /** The current header's name is over MAX_NAME: its entries are left out. */
  skip: false,
});

/**
 * A header line read into `state`: its name ends at the first "]" (or "]]") outside quotes, and nothing may follow it
 * but a comment. A doubt for what TOML refuses — a header left open or followed by more, a table defined twice in one
 * block, a table that redefines an array of tables or the reverse — and for a name over 1,000 characters, whose
 * entries are then left out.
 * @param {string} line
 * @param {ReturnType<typeof newTomlState>} state
 * @param {{ doubt?: boolean, arrays?: Set<string> }} report
 */
function readHeader(line, state, report) {
  const array = line[1] === "[";
  const end = scanOutsideQuotes(line, array ? 2 : 1, (c, i) => c === "]" && (!array || line[i + 1] === "]"));
  if (end >= line.length || line.slice(end + (array ? 2 : 1)).trim()) report.doubt = true;
  state.section = line.slice(array ? 2 : 1, end).trim();
  state.tableParts = state.section ? dottedParts(state.section, report) : [];
  state.header++;
  if (array) state.block++;
  const name = state.tableParts.join(".");
  state.skip = name.length > MAX_NAME;
  if (state.skip) report.doubt = true;
  else if (array) {
    if (state.tableNames.has(name)) report.doubt = true;
    state.arrays.add(name);
    (report.arrays ??= new Set()).add(name);
  } else {
    const id = `${state.block}\0${name}`;
    if (state.arrays.has(name) || state.tables.has(id)) report.doubt = true;
    state.tables.add(id);
    state.tableNames.add(name);
  }
}

/**
 * The `key = value` entries of a TOML document, each with the table it sits in: `section` is the header's name
 * (`[[package]]` gives "package", `[package.dependencies]` "package.dependencies"), `block` counts the arrays of
 * tables seen so far (each `[[…]]` starts a new one), `path` the full dotted path of its value. A value that opens an
 * array or an inline table and goes on past its line is read up to where it closes. Comments outside strings are
 * dropped (after a header too). The state of the brackets and quotes is kept from one line to the next — a
 * multi-line string ("""…""", '''…''') is a value read on like an array, its text never TOML —: one pass, linear; a
 * table's parts are read once, at its header. `report.doubt` is set when the text is not TOML as the kit reads it —
 * a string or a bracket left open at its end, a one-line string left open, a bracket closed that was never opened, a
 * header left open or followed by more than a comment, a line that is neither a header nor a `key = value` (its "="
 * outside quotes), a value longer than 200,000 characters (followed to its end, not kept whole), what TOML refuses
 * and so does the tool — a key given twice under one header, a table defined twice in one block (`[package.source]`
 * twice), a table that redefines an array of tables (`[package]` after `[[package]]`) or the reverse —, a key or a
 * table name over 1,000 characters —: a reader of
 * private declarations takes the doubt as a declaration (declarations.mjs). `report.arrays` holds the name of every
 * array of tables the text opens (its parts joined by ".": `[[package.files]]` gives "package.files"), so that a
 * reader that knows only its own (`[[package]]`) can tell a table its block would not hold (python.mjs).
 * @param {string} text
 * @param {{ doubt?: boolean, arrays?: Set<string> }} [report]
 * @returns {TomlEntry[]}
 */
export function tomlEntries(text, report = {}) {
  const out = [];
  const state = newTomlState();
  /** @type {{ section: string, block: number, key: string, value: string, path: string[], depth: number, quote: string, frames: Array<{ array: boolean, key: boolean }>, ended?: boolean, bare?: boolean, doubt?: boolean, skip?: boolean }|null} */
  let open = null;
  /** An entry read to its end: kept, and its doubt reported. */
  const done = (e) => {
    if (e.doubt) report.doubt = true;
    if (!e.skip) out.push({ section: e.section, block: e.block, key: e.key, value: e.value.trim(), path: e.path });
  };
  for (const raw of textLines(text)) {
    // A control character (a tab apart), a lone \r: TOML has none, in a string or out of one — the tool refuses the
    // file.
    if (hasControl(raw)) report.doubt = true;
    if (open) {
      // Inside a string, the line is its text (a "[section]" or a "key = …" in it changes nothing); else it ends at
      // its comment.
      const chunk = open.quote
        ? raw
        : raw.slice(
            0,
            scanOutsideQuotes(raw, 0, (c) => c === "#"),
          );
      // Past 200,000 characters the value is no longer kept, but its brackets and quotes are still followed to its
      // end (the lines after it stay in place); a value not kept whole is a doubt.
      if (open.value.length < MAX_TOML_VALUE) open.value += "\n" + chunk;
      else open.doubt = true;
      if (follow(open, chunk)) {
        done(open);
        open = null;
      }
      continue;
    }
    const line = raw
      .slice(
        0,
        scanOutsideQuotes(raw, 0, (c) => c === "#"),
      )
      .trim();
    if (!line) continue;
    if (line[0] === "[") {
      readHeader(line, state, report);
      continue;
    }
    // A key and its value, the "=" outside quotes; any other line is no TOML: a doubt.
    const eq = equalsAt(line);
    if (eq <= 0) {
      report.doubt = true;
      continue;
    }
    const kv = { key: unquote(line.slice(0, eq).trim()), value: line.slice(eq + 1).trim() };
    if (!kv.value) report.doubt = true; // `key =` and nothing: TOML has no empty value
    // A key over MAX_NAME, or under a header over it: a doubt, its value followed to its end but left out.
    const skip = state.skip || line.slice(0, eq).trim().length > MAX_NAME;
    const keyParts = skip ? [] : dottedParts(line.slice(0, eq), report);
    const path = [...state.tableParts, ...keyParts].slice(0, MAX_PATH);
    // A key is known by the number of its header and its own parts — never the header's text again: linear.
    const id = `${state.header}\0${keyParts.join("\0")}`;
    if (skip || state.given.has(id)) report.doubt = true;
    else state.given.add(id);
    const entry = {
      section: state.section,
      block: state.block,
      key: kv.key,
      value: kv.value,
      path,
      depth: 0,
      quote: "",
      frames: [],
      skip,
    };
    if (follow(entry, kv.value)) done(entry);
    else open = entry;
  }
  if (open) {
    open.doubt = true; // a string or a bracket still open at the end
    done(open);
  }
  return out;
}

/** The elements of a TOML array value (`["a", { name = "b" }]`, over several lines), trimmed, or [] when it is none. */
export function tomlArray(value) {
  if (value[0] !== "[") return [];
  return splitTopLevel(value.slice(1));
}

/**
 * Every value of TOML entries with its full path, its inline tables opened: `[tool.uv]` + `sources = { lib = { git =
 * "…" } }` gives the path tool, uv, sources, lib, git; an array of inline tables too (`index = [{ url = "…" }]`:
 * tool, uv, index, url) — whatever the form a table is written in (a header, a dotted key, an inline table), the same
 * path. At most 8 tables deep (deeper, the table is one value) and 16 parts a path: each level reads its own text
 * once, so the work is linear in the text times that depth.
 * @param {TomlEntry[]} entries
 * @param {{ doubt?: boolean }} [report]  set when a key of an inline table holds an escape TOML does not know
 * @returns {Array<{ path: string[], value: string }>}
 */
export function tomlLeaves(entries, report = {}) {
  const out = [];
  const visit = (path, value, depth) => {
    const tables =
      value[0] === "{" ? [value] : value[0] === "[" ? tomlArray(value).filter((element) => element[0] === "{") : [];
    if (!tables.length || depth >= MAX_INLINE_DEPTH || path.length >= MAX_PATH) {
      out.push({ path, value });
      return;
    }
    for (const table of tables)
      for (const piece of splitTopLevel(table.slice(1))) {
        const eq = equalsAt(piece);
        if (eq <= 0) continue;
        // An inline table's key over MAX_NAME: a doubt, left out (as a key of a line is).
        if (piece.slice(0, eq).trim().length > MAX_NAME) report.doubt = true;
        else visit(pathOf(path, piece.slice(0, eq), report), piece.slice(eq + 1).trim(), depth + 1);
      }
  };
  for (const entry of entries) visit(entry.path, entry.value, 0);
  return out;
}

/**
 * The packages a table of dependencies names (Poetry's, a Pipfile's), each with its fields, read from the paths of
 * its values: `name = "^1"` (the field `version`), `name = { version = "^1", path = "../x" }`, `name.path = "../x"`,
 * `[table.name]` and its keys, a list of constraints `name = [{ … }, { … }]` — the same fields whatever the form, every
 * value of a field kept (a list of constraints may give a field twice: each is judged).
 * @param {TomlEntry[]} entries
 * @param {(keys: string[]) => number} tableLength  how many parts of a value's path name a table of dependencies, 0
 *   when it is in none
 * @returns {Array<{ table: string, name: string, fields: Map<string, string[]> }>}  `table`: its parts joined by "."
 */
export function tableDependencies(entries, tableLength) {
  const byName = new Map();
  for (const { path: keys, value } of tomlLeaves(entries)) {
    const n = tableLength(keys);
    if (!n || keys.length <= n) continue;
    const table = keys.slice(0, n).join(".");
    const id = `${table}\0${keys[n]}`;
    const dep = byName.get(id) ?? { table, name: keys[n], fields: new Map() };
    const field = keys.length > n + 1 ? keys[n + 1] : "version";
    // One more value pushed on the field's own list (never copied: a field written N times stays linear).
    const values = dep.fields.get(field);
    if (values) values.push(quoted(value) ?? value);
    else dep.fields.set(field, [quoted(value) ?? value]);
    byName.set(id, dep);
  }
  return [...byName.values()];
}
