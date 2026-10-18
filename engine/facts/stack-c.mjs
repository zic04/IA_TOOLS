// The walks of C-like code the stack adapters of Spring (Java, Kotlin) and ASP.NET Core (C#) share
// (adapters/stack/spring.mjs, aspnet.mjs; ARCHITECTURE.md §5, §6.9): blanks and comments skipped, the top-level
// arguments of a list, the last identifier of a declaration, a route joined to its prefix, each call of an expression
// with its arguments read once, the double-quoted literals of a piece of code, and the name a guard is kept under
// (never a secret, RULES.md S7). Each adapter keeps what is its own: its annotations or attributes, its declarations,
// its routes and its behaviour hints. Bounded expressions only (RULES.md S5, test/tools/redos-worker.mjs).
import { callSpan, safeField } from "./behaviour-common.mjs";

/** The expressions of this module, by name (test/tools/redos-worker.mjs, RULES.md S5). */
export const STACK_C_PATTERNS = Object.freeze({
  /** A character of an identifier (Java and Kotlin allow `$`). */
  IDENT_CHAR: /[\w$]/,
  /** A string literal (Java, Kotlin and C# strings are double-quoted). */
  LITERAL: /"([^"\n]{0,500})"/g,
  DIGITS: /^\d{1,6}$/,
  /** A word of a guard's text, checked on its own (guardName). */
  GUARD_WORD: /[\w$]{1,200}/g,
  SLASHES: /\/{2,}/g,
  BLANKS: /\s+/g,
});
const P = STACK_C_PATTERNS;

/**
 * Whether a character is a blank (a space, a tab, a line's end).
 * @param {string} ch
 */
export const isBlank = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

/** The index after a C# verbatim string whose opening quote is at `q` (`""` inside it is a quote). */
function verbatimEnd(text, q) {
  for (let k = q + 1; k < text.length; k++)
    if (text[k] === '"' && text[k + 1] === '"') k++;
    else if (text[k] === '"') return k + 1;
  return text.length;
}

/**
 * The index after a text block or a raw string that starts at `i`: in C#, a raw string ("""…""": as many quotes
 * close it as open it, 32 at most); in Java and Kotlin, three quotes close it, a Java text block's `\"""` does not
 * (an empty Kotlin raw string, `""""""`, is one).
 */
function rawEnd(text, i, csharp) {
  let n = 3;
  if (csharp) while (n < 32 && text[i + n] === '"') n++;
  const close = '"'.repeat(n);
  for (let k = i + n; k < text.length; k++)
    if (!csharp && text[k] === "\\") k++;
    else if (text.startsWith(close, k)) return k + n;
  return text.length;
}

/**
 * The index after the string that starts at `i` — "…" and '…' (escapes; ended by their line's end too, as callSpan
 * reads them), a Java text block, a Kotlin or C# raw string ("""…""": as many quotes close it, 32 at most), a C#
 * verbatim string (@"…", @$"…") — or `i` when none starts there.
 */
function stringEnd(text, i, csharp) {
  const c = text[i];
  if (c === "@")
    return text[i + 1] === '"' ? verbatimEnd(text, i + 1) : text.startsWith('$"', i + 1) ? verbatimEnd(text, i + 2) : i;
  if (c === '"' && text.startsWith('""', i + 1)) return rawEnd(text, i, csharp);
  if (c !== '"' && c !== "'") return i;
  for (let k = i + 1; k < text.length; k++)
    if (text[k] === "\\") k++;
    else if (text[k] === c || text[k] === "\n") return k + 1;
  return text.length;
}

/** The index after the string or the comment that starts at `i` (a line comment ends before its newline), or `i`. */
function tokenEnd(text, i, csharp) {
  const c = text[i];
  if (c === '"' || c === "'" || c === "@") return stringEnd(text, i, csharp);
  if (c !== "/" || (text[i + 1] !== "/" && text[i + 1] !== "*")) return i;
  const e = text.indexOf(text[i + 1] === "/" ? "\n" : "*/", i + 2);
  return e === -1 ? text.length : text[i + 1] === "/" ? e : e + 2;
}

/**
 * The comments and strings of a Java, Kotlin or C# text — what is no code: a declaration there is none — and the
 * closing bracket of each opening one (-1: none), by one linear walk.
 * @param {string} text
 * @param {{ csharp?: boolean }} [options]   csharp: C#'s raw strings (as many quotes close one as open it)
 * @returns {{ ranges: Array<[number, number]>, close: Int32Array }}
 */
export function cScan(text, { csharp = false } = {}) {
  const ranges = /** @type {Array<[number, number]>} */ ([]);
  const close = new Int32Array(text.length + 1).fill(-1);
  const open = [];
  for (let i = 0; i < text.length; i++) {
    const end = tokenEnd(text, i, csharp);
    if (end > i) {
      ranges.push([i, end]);
      i = end - 1;
    } else if ("([{".includes(text[i])) open.push(i);
    else if (")]}".includes(text[i]) && open.length) close[open.pop()] = i;
  }
  return { ranges, close };
}

/** Words that start a declaration: a type's header followed, on a new line, by one of them has no body. */
const DECLARES = new Set(
  "class interface object enum record struct fun val var data sealed open abstract annotation private public protected internal typealias import package".split(
    " ",
  ),
);

/**
 * Whether a line from `k` starts another declaration: an annotation, an attribute, or a word that declares — but
 * not Kotlin's `@Inject constructor(…)` on the line after a class's name, which is part of its header.
 */
function declares(text, k, limit) {
  let s = k;
  while (s < limit && isBlank(text[s])) s++;
  let e = s;
  while (e < limit && e - s < 32 && P.IDENT_CHAR.test(text[e])) e++;
  if (text[s] === "@") {
    const eol = text.indexOf("\n", s);
    const line = text.slice(s, Math.min(eol === -1 ? limit : eol, limit, s + 200));
    return !line.includes(" constructor");
  }
  return text[s] === "[" || DECLARES.has(text.slice(s, e));
}

/**
 * The body of a type whose header goes on from `k` (after its name): the index of its "{" and of the "}" that closes
 * it (`close`, cScan; the end of the text when it does not close), or null when it has none — Kotlin's `class A(val
 * x: Int)`, C#'s `record R(int X);`. Its header is read up to its "{", its brackets jumped, 400 characters at most;
 * ";", "=", "}", or a new line that starts another declaration end it.
 * @param {string} text
 * @param {Int32Array} close
 * @param {number} k
 * @returns {{ open: number, end: number } | null}
 */
export function typeBody(text, close, k) {
  const limit = Math.min(text.length, k + 400);
  for (let i = k; i < limit; i++) {
    const c = text[i];
    const t = tokenEnd(text, i);
    if (t > i) i = t - 1;
    else if (c === "(" || c === "[") {
      if (close[i] === -1) return null;
      i = close[i];
    } else if (c === "{") return { open: i, end: close[i] === -1 ? text.length : close[i] };
    else if (c === ";" || c === "=" || c === "}" || (c === "\n" && declares(text, i + 1, limit))) return null;
  }
  return null;
}

/** Where a comment that starts at `k` ends (`//`: at its line's end; `/* *\/`: after it), `limit` at most; else `k`. */
function commentEnd(text, k, limit) {
  const mark = text[k] !== "/" ? null : text[k + 1] === "/" ? "\n" : text[k + 1] === "*" ? "*/" : null;
  if (!mark) return k;
  let i = k + 2;
  while (i < limit && !text.startsWith(mark, i)) i++;
  return Math.min(limit, mark === "\n" ? i : i + 2);
}

/**
 * The index of the next character of code from `k` (blanks and comments skipped), `limit` at most.
 * @param {string} text
 * @param {number} k
 * @param {number} limit
 * @returns {number}
 */
export function skipBlank(text, k, limit) {
  for (let end = -1; end !== k;) {
    while (k < limit && isBlank(text[k])) k++;
    end = k;
    k = k < limit ? commentEnd(text, k, limit) : k;
  }
  return Math.min(k, limit);
}

/**
 * The top-level parts of a list of arguments: split on its commas outside brackets and strings (a linear walk).
 * @param {string} text
 * @returns {string[]}
 */
export function topLevel(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
}

/**
 * The last identifier of text[from, to), or undefined.
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @returns {string|undefined}
 */
export function lastWord(text, from, to) {
  let e = to;
  while (e > from && !P.IDENT_CHAR.test(text[e - 1])) e--;
  let s = e;
  while (s > from && e - s < 64 && P.IDENT_CHAR.test(text[s - 1])) s--;
  return s < e && !(text[s] >= "0" && text[s] <= "9") ? text.slice(s, e) : undefined;
}

/**
 * A route of a prefix and a path: one "/" between segments, none at the end.
 * @param {string} prefix
 * @param {string} path
 * @returns {string}
 */
export function joinPath(prefix, path) {
  const route = `/${prefix}/${path}`.replace(P.SLASHES, "/");
  return route.length > 1 && route.endsWith("/") ? route.slice(0, -1) : route;
}

/**
 * Each call of `re` (a global expression ending with "("), its arguments read once (callSpan, 4,000 characters at
 * most): `fn(args, end, m)`; the next call is looked for after them.
 * @param {RegExp} re
 * @param {string} text
 * @param {(args: string, end: number, m: RegExpExecArray) => void} fn
 */
export function eachCall(re, text, fn) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const span = callSpan(text, m.index + m[0].length - 1, 4000);
    fn(span.args, span.end, m);
    re.lastIndex = Math.max(re.lastIndex, span.end);
  }
}

/**
 * The literals of a piece of code.
 * @param {string} text
 * @returns {string[]}
 */
export const literalsOf = (text) => [...text.matchAll(P.LITERAL)].map((m) => m[1]);

/**
 * A guard's name as kept: its blanks collapsed, each word that looks like a key, a token or a long number masked
 * ("…", safeField: never a secret in the facts, RULES.md S7), 120 characters at most.
 * @param {string} text
 * @returns {string}
 */
export const guardName = (text) =>
  text
    .slice(0, 400)
    .replace(P.GUARD_WORD, (w) => (P.DIGITS.test(w) || safeField(w) ? w : "…"))
    .replace(P.BLANKS, " ")
    .trim()
    .slice(0, 120);
