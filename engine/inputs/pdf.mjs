// PDF index for the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): a PDF is not
// converted, the agents read the file itself page by page; the kit only records how many pages it has, whether it
// is encrypted, and its title. The file is untrusted input (SECURITY.md), so it is never parsed whole: one linear
// pass of a small tokenizer over at most its first and its last megabyte (the whole file when it is smaller), which
// skips literal and hexadecimal strings, comments and streams as units and nothing else.
//   - pages: the largest `/Count` of a `/Type /Pages` dictionary (the root of the page tree), else the `/N` of the
//     linearization dictionary, else the number of `/Type /Page` dictionaries seen, else null (a page tree kept in
//     a compressed object stream cannot be read without inflating it, which this index does not do);
//   - encrypted: a dictionary with an `/Encrypt` entry (the trailer's, or the cross-reference stream's);
//   - title: the `/Title (…)` of the document information dictionary, when it is plain ASCII; else null.
// Errors: KitError(EXIT.CHECK, "inputs.refused", { reason: "notPdf" }) when no `%PDF-` header starts the file.
import { KitError, EXIT } from "../project/errors.mjs";

/** Bytes read at each end of the file. */
const AREA = 1024 * 1024;
/** The header may follow a little garbage (PDF 32000-1 § 7.5.2 readers accept it within the first kilobyte). */
const HEADER_SCAN = 1024;
/** Characters of a literal string kept (a title is short). */
const MAX_STRING = 1024;
/** Dictionaries open at once (a tail that starts inside binary data may open many that never close). */
const MAX_OPEN = 256;
/** Keys whose presence matters, recorded per dictionary. */
const KEYS = new Set(["Encrypt", "Linearized", "Parent", "P"]);
const DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const isWhite = (c) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";

/** The index just past the whitespace and comments at `i`. */
function skipWhite(s, i) {
  while (i < s.length) {
    if (isWhite(s[i])) i++;
    else if (s[i] === "%") {
      while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
    } else break;
  }
  return i;
}

/**
 * The literal string at `i` (`(` … `)`, nested parentheses and escapes): its first MAX_STRING characters when
 * they are plain printable ASCII (escapes of `(`, `)` and `\` decoded), else null; and the index just past it.
 */
function literalString(s, i) {
  let depth = 0;
  let out = "";
  let plain = true;
  for (let j = i; j < s.length; j++) {
    let c = s[j];
    if (c === "\\") {
      c = s[++j] ?? "";
      if (c !== "(" && c !== ")" && c !== "\\") plain = false;
    } else if (c === "(" && ++depth === 1) continue;
    else if (c === ")" && --depth === 0) return { value: plain ? out : null, end: j + 1 };
    if (c < " " || c > "~") plain = false;
    if (plain && out.length < MAX_STRING) out += c;
  }
  return { value: null, end: s.length };
}

/** The end of the run of regular characters (neither whitespace nor delimiter) at `i`. */
function wordEnd(s, i) {
  let j = i;
  while (j < s.length && !isWhite(s[j]) && !DELIMITERS.has(s[j])) j++;
  return j;
}

/**
 * The token at `i`: `{ kind, value, end }`, kind one of name, number, string, open (`<<`), close (`>>`), array
 * (`[`), endArray (`]`), stream (the keyword: its data follows), keyword; null at the end of the text.
 */
function nextToken(s, from) {
  const i = skipWhite(s, from);
  if (i >= s.length) return null;
  const c = s[i];
  if (c === "/") {
    const end = wordEnd(s, i + 1);
    return { kind: "name", value: s.slice(i + 1, end), end };
  }
  if (c === "(") return { kind: "string", ...literalString(s, i) };
  if (c === "<" && s[i + 1] === "<") return { kind: "open", end: i + 2 };
  if (c === ">" && s[i + 1] === ">") return { kind: "close", end: i + 2 };
  if (c === "<") {
    const end = s.indexOf(">", i);
    return { kind: "string", value: null, end: end < 0 ? s.length : end + 1 };
  }
  if (c === "[") return { kind: "array", end: i + 1 };
  if (c === "]") return { kind: "endArray", end: i + 1 };
  if (DELIMITERS.has(c)) return { kind: "keyword", value: c, end: i + 1 };
  const end = wordEnd(s, i);
  const word = s.slice(i, end);
  if (word === "stream") return { kind: "stream", end };
  const number = [...word].every((d) => (d >= "0" && d <= "9") || d === "." || d === "-" || d === "+");
  return number ? { kind: "number", value: Number(word), end } : { kind: "keyword", value: word, end };
}

/** Records what a dictionary that just closed says about the document. */
function finish(d, found) {
  if (d.type === "Pages" && Number.isInteger(d.count) && d.count >= 0)
    found.count = Math.max(found.count ?? 0, d.count);
  if (d.type === "Page") found.pageObjects++;
  if (d.keys.has("Linearized") && Number.isInteger(d.n) && d.n > 0) found.linearized ??= d.n;
  if (d.keys.has("Encrypt")) found.encrypted = true;
  const info = d.title !== undefined && !d.type && !d.keys.has("Parent") && !d.keys.has("P");
  if (info && found.title === undefined) found.title = d.title;
}

/** Applies one token to the dictionaries open (`stack`): their keys, and the values that matter. */
function apply(stack, t, found) {
  if (t.kind === "open") {
    if (stack.length < MAX_OPEN) stack.push({ pending: null, array: 0, keys: new Set() });
    return;
  }
  if (t.kind === "close") {
    const d = stack.pop();
    if (!d) return;
    finish(d, found);
    const parent = stack[stack.length - 1];
    if (parent && !parent.array) parent.pending = null; // the dictionary was the value of its parent's key
    return;
  }
  const d = stack[stack.length - 1];
  if (!d) return;
  if (t.kind === "array") d.array++;
  else if (t.kind === "endArray") {
    if (d.array && --d.array === 0) d.pending = null;
  } else if (d.array) return;
  else if (t.kind === "name" && d.pending === null) {
    d.pending = t.value;
    if (KEYS.has(t.value)) d.keys.add(t.value);
  } else {
    if (d.pending === "Type" && t.kind === "name") d.type = t.value;
    else if (d.pending === "Count" && t.kind === "number") d.count = t.value;
    else if (d.pending === "N" && t.kind === "number") d.n = t.value;
    else if (d.pending === "Title" && t.kind === "string") d.title = t.value;
    d.pending = null;
  }
}

/** One pass over an area of the file; a stream's data is skipped up to its `endstream`. */
function scanArea(s, found) {
  const stack = [];
  let i = 0;
  for (let t = nextToken(s, i); t; t = nextToken(s, i)) {
    i = t.end;
    if (t.kind === "stream") {
      const end = s.indexOf("endstream", i);
      i = end < 0 ? s.length : end + "endstream".length;
    } else apply(stack, t, found);
  }
}

/**
 * The index of a PDF: its number of pages (null when it cannot be told without reading the whole file), whether
 * it is encrypted, and its title (plain ASCII only, else null).
 * @param {Buffer} buf
 * @returns {{ pages: number|null, encrypted: boolean, title: string|null }}
 * @throws {KitError} "inputs.refused", { reason: "notPdf" }
 */
export function pdfIndex(buf) {
  if (buf.subarray(0, HEADER_SCAN).indexOf("%PDF-") < 0)
    throw new KitError(EXIT.CHECK, "inputs.refused", { reason: "notPdf" });
  const found = { count: undefined, linearized: undefined, pageObjects: 0, encrypted: false, title: undefined };
  if (buf.length <= 2 * AREA) scanArea(buf.toString("latin1"), found);
  else {
    scanArea(buf.toString("latin1", 0, AREA), found);
    scanArea(buf.toString("latin1", buf.length - AREA), found);
  }
  return {
    pages: found.count ?? found.linearized ?? (found.pageObjects || null),
    encrypted: found.encrypted,
    title: found.encrypted ? null : (found.title ?? null),
  };
}
