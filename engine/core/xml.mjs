// Linear XML event reader for the parts of the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md
// §6.19): word/document.xml, word/styles.xml, draw.io files. The text is untrusted (SECURITY.md), so the reader is
// built to stay linear and to expand nothing:
//   - it scans with indexOf and single passes, no regular expression; every construct it starts must end, or the
//     text is refused, so no position is ever scanned twice;
//   - a `<!DOCTYPE …>` is skipped whole, its internal subset included: an entity it declares is never expanded
//     (no XXE, no billion laughs); only the five predefined entities and numeric references are decoded, any
//     other `&name;` stays literal text;
//   - comments and processing instructions are skipped, CDATA is text as it is;
//   - the depth and the number of elements are bounded.
// Errors: KitError(EXIT.CHECK, "inputs.refused", { reason: "xml" }).
import { KitError, EXIT } from "../project/errors.mjs";

const PREDEFINED = Object.freeze({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" });
/** The longest entity reference decoded, `&` and `;` excluded (`#x10FFFF`, `#1114111`). */
const ENTITY_MAX = 8;
const SPACE = new Set([" ", "\t", "\n", "\r"]);

/** The error of a refused XML text. */
const refused = () => new KitError(EXIT.CHECK, "inputs.refused", { reason: "xml" });

/** True for a code point XML allows in a document (XML 1.0 § 2.2, Char). */
function validCodePoint(n) {
  if (n === 0x9 || n === 0xa || n === 0xd) return true;
  return (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
}

/** True when `s` is made of decimal digits only (hexadecimal ones with `hex`), and is not empty. */
function digitsOnly(s, hex) {
  if (!s) return false;
  for (const c of s) {
    const decimal = c >= "0" && c <= "9";
    const letter = hex && ((c >= "a" && c <= "f") || (c >= "A" && c <= "F"));
    if (!decimal && !letter) return false;
  }
  return true;
}

/** The character of one entity reference (`amp`, `#38`, `#x26`), or null when it is not decoded. */
function entityValue(name) {
  if (Object.hasOwn(PREDEFINED, name)) return PREDEFINED[name];
  if (name[0] !== "#") return null;
  const hex = name[1] === "x" || name[1] === "X";
  const digits = name.slice(hex ? 2 : 1);
  if (!digitsOnly(digits, hex)) return null;
  const n = Number.parseInt(digits, hex ? 16 : 10);
  return validCodePoint(n) ? String.fromCodePoint(n) : null;
}

/**
 * Decodes the predefined entities and the numeric references of a text. Any other reference (`&xxe;`, an entity a
 * DTD would declare), or a reference to a code point XML forbids, is kept as literal text. Looks at most
 * ENTITY_MAX characters past each `&`: linear.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  if (!text.includes("&")) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf("&", i);
    if (amp < 0) break;
    const semi = text.slice(amp + 1, amp + 2 + ENTITY_MAX).indexOf(";");
    const value = semi > 0 ? entityValue(text.slice(amp + 1, amp + 1 + semi)) : null;
    out += text.slice(i, amp) + (value ?? "&");
    i = value === null ? amp + 1 : amp + 2 + semi;
  }
  return out + text.slice(i);
}

/**
 * Text from a document made inert for Markdown: every `<` that could open an HTML tag, comment or declaration
 * (followed by a letter, `/`, `!` or `?`) is written `&lt;`, so no HTML of the document reaches a page.
 * @param {string} text
 * @returns {string}
 */
export function inertMarkup(text) {
  let out = "";
  let i = 0;
  for (let lt = text.indexOf("<"); lt >= 0; lt = text.indexOf("<", lt + 1)) {
    const c = text[lt + 1] || "";
    const opens = c === "/" || c === "!" || c === "?" || c.toLowerCase() !== c.toUpperCase();
    if (!opens) continue;
    out += text.slice(i, lt) + "&lt;";
    i = lt + 1;
  }
  return out + text.slice(i);
}

/** Index just past `marker` searched from `from`, or a refusal when the construct never ends. */
function after(text, marker, from) {
  const at = text.indexOf(marker, from);
  if (at < 0) throw refused();
  return at + marker.length;
}

/**
 * Index just past a `<!…>` declaration starting at `lt` (a DOCTYPE and its internal subset `[ … ]`, with the
 * quoted literals, comments and processing instructions it holds). Nothing in it is kept.
 */
function skipDeclaration(text, lt) {
  let depth = 0;
  let i = lt + 2;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") i = after(text, c, i + 1);
    else if (text.startsWith("<!--", i)) i = after(text, "-->", i + 4);
    else if (text.startsWith("<?", i)) i = after(text, "?>", i + 2);
    else {
      if (c === "[") depth++;
      else if (c === "]") depth--;
      else if (c === ">" && depth <= 0) return i + 1;
      i++;
    }
  }
  throw refused();
}

/** The name at the start of `s` (up to a space, `/`, `>` or `=`) and the index just past it. */
function readName(s, from) {
  let i = from;
  while (i < s.length && !SPACE.has(s[i]) && s[i] !== "/" && s[i] !== ">" && s[i] !== "=") i++;
  return { name: s.slice(from, i), end: i };
}

/** The attributes of a start tag's body (what follows its name), values decoded. Refuses a malformed one. */
function readAttributes(body) {
  /** @type {Record<string, string>} */
  const attrs = {};
  let i = 0;
  while (i < body.length) {
    if (SPACE.has(body[i]) || body[i] === "/") {
      i++;
      continue;
    }
    const { name, end } = readName(body, i);
    let j = end;
    while (SPACE.has(body[j])) j++;
    if (!name || body[j] !== "=") throw refused();
    j++;
    while (SPACE.has(body[j])) j++;
    const quote = body[j];
    if (quote !== '"' && quote !== "'") throw refused();
    const close = body.indexOf(quote, j + 1);
    if (close < 0) throw refused();
    if (name !== "__proto__") attrs[name] = decodeEntities(body.slice(j + 1, close)); // never the prototype
    i = close + 1;
  }
  return attrs;
}

/**
 * The start tag at `lt`: its name, attributes, whether it closes itself, and the index just past it. A `<` before
 * its `>` refuses the text (XML allows none, even in a quoted value), which keeps the scan linear.
 */
function readStartTag(text, lt) {
  let quote = "";
  let i = lt + 1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "<") throw refused();
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") break;
  }
  if (i >= text.length) throw refused();
  const selfClosing = text[i - 1] === "/";
  const inner = text.slice(lt + 1, selfClosing ? i - 1 : i);
  const { name, end } = readName(inner, 0);
  if (!name) throw refused();
  return { name, attrs: readAttributes(inner.slice(end)), selfClosing, end: i + 1 };
}

/**
 * Walks an XML text and reports its events: `open(name, attrs)` for each element (attribute values decoded),
 * `close(name)` at its end (right after `open` for an empty element), `text(decoded)` for the text inside the root
 * element (CDATA as it is). Names keep their prefix (`w:p`). Comments, processing instructions and the DOCTYPE are
 * skipped; no entity is ever expanded.
 * @param {string} text
 * @param {{ open?: (name: string, attrs: Record<string, string>) => void, close?: (name: string) => void,
 *   text?: (text: string) => void }} handlers
 * @param {{ maxDepth?: number, maxNodes?: number }} [limits]
 * @throws {KitError} "inputs.refused", { reason: "xml" }: malformed or unbalanced, deeper than maxDepth, or more
 *   than maxNodes elements
 */
export function walkXml(text, { open, close, text: onText }, { maxDepth = 256, maxNodes = 2_000_000 } = {}) {
  const stack = [];
  let nodes = 0;
  let i = 0;
  const emit = (raw, decode) => {
    if (raw && stack.length && onText) onText(decode ? decodeEntities(raw) : raw);
  };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    emit(text.slice(i, lt < 0 ? text.length : lt), true);
    if (lt < 0) break;
    if (text.startsWith("<!--", lt)) i = after(text, "-->", lt + 4);
    else if (text.startsWith("<![CDATA[", lt)) {
      i = after(text, "]]>", lt + 9);
      emit(text.slice(lt + 9, i - 3), false);
    } else if (text.startsWith("<?", lt)) i = after(text, "?>", lt + 2);
    else if (text.startsWith("<!", lt)) i = skipDeclaration(text, lt);
    else if (text[lt + 1] === "/") {
      i = after(text, ">", lt + 2);
      const name = text.slice(lt + 2, i - 1).trim();
      if (stack.pop() !== name) throw refused();
      close?.(name);
    } else {
      const tag = readStartTag(text, lt);
      if (++nodes > maxNodes || stack.length >= maxDepth) throw refused();
      open?.(tag.name, tag.attrs);
      if (tag.selfClosing) close?.(tag.name);
      else stack.push(tag.name);
      i = tag.end;
    }
  }
  if (stack.length) throw refused();
}
