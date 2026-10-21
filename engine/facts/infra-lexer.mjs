// What the walks of the C-like infrastructure languages share (adapters/infra/terraform.mjs, bicep.mjs; ARCHITECTURE.md
// §5): the end of a line, the comments and blanks a token is not (`#`, `//`, `/* */`), the item of a walk's file, and
// what a token tells of an address range. No regular expression: each character is looked at once by its walk.
import { openToAll } from "./infra-common.mjs";

/** The index of the end of the line that holds `i` (its "\n", or the end of the text). */
export function lineEnd(text, i) {
  const nl = text.indexOf("\n", i);
  return nl === -1 ? text.length : nl;
}

/** A comment `/* … *\/` that opens at `i`: a newline token when it spans lines (it ends a statement), and its end. */
function blockComment(text, i) {
  const close = text.indexOf("*/", i + 2);
  const end = close === -1 ? text.length : close + 2;
  for (let k = i; k < end; k++) if (text[k] === "\n") return { type: "nl", value: null, end };
  return { type: null, value: null, end };
}

/**
 * Blanks or a comment at `i` (type null; a block comment over several lines is a newline), or null.
 * @param {string} text
 * @param {number} i
 * @returns {{ type: string|null, value: null, end: number }|null}
 */
export function blank(text, i) {
  const c = text[i];
  if (c === " " || c === "\t" || c === "\r") return { type: null, value: null, end: i + 1 };
  if (c === "#" || (c === "/" && text[i + 1] === "/")) return { type: null, value: null, end: lineEnd(text, i) };
  return c === "/" && text[i + 1] === "*" ? blockComment(text, i) : null;
}

/**
 * An item of the walk's file, pushed (its line from the index of its first token; its environment from the file's path).
 * @param {{ file: string, env?: string, lineOf: (i: number) => number, items: object[] }} w
 * @param {object} fields
 * @param {number} index
 * @returns {any}
 */
export function push(w, fields, index) {
  const item = /** @type {any} */ ({ ...fields, file: w.file, line: w.lineOf(index) });
  if (w.env) item.env = w.env;
  w.items.push(item);
  return item;
}

/**
 * What a token of an address range tells its rule (`f`): a literal string open to all lets anyone in (`wide`); a name
 * or a string that is no literal (a variable, a parameter, an expression, a template) leaves it `unknown` — the kit
 * cannot tell, so it never says such a rule is closed.
 * @param {{ wide?: boolean, unknown?: boolean }} f
 * @param {{ type: string|null, value: string|null }} t
 */
export function rangeToken(f, t) {
  if (t.type === "str" && t.value !== null) f.wide ||= openToAll(t.value);
  else if (t.type === "id" || t.type === "str") f.unknown = true;
}

/** Whether a rule's ranges let anyone in: true, false, or undefined when one of them is not written as a literal. */
export const openness = (/** @type {{ wide?: boolean, unknown?: boolean, shut?: boolean }} */ f) =>
  f.wide && !f.shut ? true : f.unknown && !f.shut ? undefined : false;
