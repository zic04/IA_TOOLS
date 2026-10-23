// TOML values read as Poetry, uv and pip read them (the `dependencies` source, engine/facts/dependencies.mjs): a
// one-line string with its escapes decoded (`"corp\u002dlib"` is corp-lib, deps/read.mjs keyPart), an inline table by
// its decoded keys. What the kit cannot read as the tool does — a multi-line string, a string followed by more on
// its line, a key given twice — is null or a doubt, which a lock reader takes as no proof. One pass each, no regular
// expression of their own (RULES.md S5).
import { keyPart, splitTopLevel, equalsAt, dottedParts, MAX_NAME } from "./read.mjs";

/**
 * A one-line TOML string as the tools read it: a basic string with its escapes decoded, a literal one as written;
 * null for anything else (a multi-line string, a string followed by more on its line, a bare value).
 * @param {string} value  a TOML value as tomlEntries gives it (its comment dropped, trimmed)
 * @param {{ doubt?: boolean }} [report]  set when a basic string holds an escape TOML does not know
 * @returns {string|null}
 */
export function tomlString(value, report = {}) {
  const q = value[0];
  if (q !== '"' && q !== "'") return null;
  // A multi-line string (`"""x"""`) is an empty one followed by more: null, as anything followed by more is.
  let end = 1;
  // A basic string's backslash escapes the character after it; a literal string has no escape.
  while (end < value.length && value[end] !== q) end += q === '"' && value[end] === "\\" ? 2 : 1;
  if (end >= value.length || value.slice(end + 1).trim()) return null;
  return keyPart(value.slice(0, end + 1), report);
}

/**
 * The fields of a one-line TOML inline table by their decoded keys (`"regi\u0073try"` is `registry`; a dotted key's
 * parts joined by "."), as a tool reads them, or null when it is none. A key given twice — however it is spelled — is
 * a doubt (TOML refuses it), and so is a key over 1,000 characters (left out).
 * @param {string} value
 * @param {{ doubt?: boolean }} [report]
 */
export function inlineFields(value, report = {}) {
  if (value[0] !== "{") return null;
  const fields = new Map();
  for (const piece of splitTopLevel(value.slice(1))) {
    const eq = equalsAt(piece);
    if (eq <= 0) continue;
    if (piece.slice(0, eq).trim().length > MAX_NAME) {
      report.doubt = true;
      continue;
    }
    const key = dottedParts(piece.slice(0, eq), report).join(".");
    if (fields.has(key)) report.doubt = true;
    fields.set(key, piece.slice(eq + 1).trim());
  }
  return fields;
}
