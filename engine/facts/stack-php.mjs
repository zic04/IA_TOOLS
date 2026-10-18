// The walk of PHP the stack adapters of Laravel and Symfony share (adapters/stack/laravel.mjs, symfony.mjs;
// ARCHITECTURE.md §5, §6.9): the comments of a file (//, # but an attribute's #[, /* … */) and the closing bracket of
// each opening one, by one linear walk that skips strings; and the two expressions both adapters read PHP with — a
// literal at the start of a text, the doubled slashes of a route. Each adapter keeps what is its own: its routes, its
// guards, its behaviour hints. Bounded expressions only (RULES.md S5, test/tools/redos-worker.mjs).

/** The expressions of this module, by name (test/tools/redos-worker.mjs, RULES.md S5), all bounded. */
export const STACK_PHP_PATTERNS = Object.freeze({
  /** A literal at the start of a text: a path, a prefix, a resource, a value ('…' or "…"). */
  LITERAL: /^\s{0,200}["']([^"'\n]{0,300})["']/,
  /** The slashes doubled in a route. */
  SLASHES: /\/{2,200}/g,
});

/** The index after the quoted string that starts at `i`: its closing quote, or its line's end. */
function stringEnd(text, i) {
  for (let k = i + 1; k < text.length; k++)
    if (text[k] === "\\") k++;
    else if (text[k] === text[i] || text[k] === "\n") return k + 1;
  return text.length;
}

/** The index after the string or the comment that starts at `i` (a line comment ends before its newline), or `i`. */
function skipped(text, i) {
  const ch = text[i];
  if (ch === '"' || ch === "'") return stringEnd(text, i);
  if ((ch === "/" && text[i + 1] === "/") || (ch === "#" && text[i + 1] !== "[")) {
    const end = text.indexOf("\n", i);
    return end === -1 ? text.length : end;
  }
  if (ch !== "/" || text[i + 1] !== "*") return i;
  const end = text.indexOf("*/", i + 2);
  return end === -1 ? text.length : end + 2;
}

/**
 * The comments of a PHP text (//, # but an attribute's #[, /* … *\/) and the closing bracket of each opening one,
 * by one linear walk that skips strings — a quoted string ends at its line, as callSpan reads it.
 * @param {string} text
 * @returns {{ comments: Array<[number, number]>, closing: Map<number, number> }}
 */
export function phpScan(text) {
  const comments = /** @type {Array<[number, number]>} */ ([]);
  const closing = new Map();
  const open = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const skip = skipped(text, i);
    if (skip > i) {
      if (ch !== '"' && ch !== "'") comments.push([i, skip]);
      i = skip - 1;
    } else if (ch === "(" || ch === "[" || ch === "{") open.push(i);
    else if ((ch === ")" || ch === "]" || ch === "}") && open.length) closing.set(open.pop(), i);
  }
  return { comments, closing };
}
