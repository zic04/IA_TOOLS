// Reading a manifest of the `dependencies` source (engine/facts/dependencies.mjs): a file that cannot be read, a
// JSON manifest that is not valid JSON or an XML one that is not well-formed, is listed in `unreadable`
// ({ file, reason: "read"|"json"|"xml" }) — its dependencies are unknown, which is not the same as none (AUDIT.md
// M14). The small text helpers below (lines, comma lists, one-line TOML tables) scan with indexOf and single passes,
// no regular expression: the manifests are untrusted (RULES.md S5).
import fs from "node:fs";
import { walkXml } from "../../core/xml.mjs";

/** Text of a manifest, or null when it cannot be read (then listed in `unreadable`). */
export const readText = (abs, manifest, unreadable) => {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    unreadable.push({ file: manifest, reason: "read" });
    return null;
  }
};

/** Parsed JSON manifest, or null when it cannot be read or is not valid JSON (then listed in `unreadable`). */
export const readJson = (abs, manifest, unreadable) => {
  const text = readText(abs, manifest, unreadable);
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

/** The lines of a text, without their "\r". */
export const textLines = (text) => text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

/**
 * Calls `visit(c, i)` on each character of `text` from `from` that is outside a quoted string (" or ', a backslash
 * escaping the next character in "…"), until `visit` returns true. One pass: linear.
 * @param {string} text
 * @param {number} from
 * @param {(c: string, i: number) => boolean} visit
 * @returns {number} the index where `visit` returned true, or text.length
 */
export function scanOutsideQuotes(text, from, visit) {
  let quote = "";
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (visit(c, i)) return i;
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

/** The key (unquoted) and the value of a `key = value` piece, both trimmed, or null. */
export function keyValue(text) {
  const eq = text.indexOf("=");
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
