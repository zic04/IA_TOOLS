// Text helpers of the build. Their output is part of the generated HTML: change them only on purpose.

/** Minimal HTML escaping (& < > "). The apostrophe is NOT escaped. */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * A text on one line: each run of control characters (a newline, a tab, NUL, U+0085, U+2028…) one space — so that a
 * name read from an application never opens a new line in a Markdown table, a list or a context file. One pass, no
 * expression.
 */
export function oneLine(s) {
  let out = "";
  let gap = false;
  for (const ch of String(s ?? "")) {
    const code = ch.charCodeAt(0);
    const control = code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
    if (!control) out += ch;
    else if (!gap) out += " ";
    gap = control;
  }
  return out;
}

/**
 * The text up to the end of the last match of `close` (a global expression), "" when none. A scan whose every match
 * ends with a `close` (an element, a block) finds the same matches there, and an opening never closed is not read
 * to the end of the text again from each one (RULES.md S5).
 */
export function upToLast(text, close) {
  let end = 0;
  for (const m of text.matchAll(close)) end = m.index + m[0].length;
  return text.slice(0, end);
}

/** Attributes of a directive: `id="x" title="y"` → { id: "x", title: "y" }. */
export const attrs = (s) =>
  Object.fromEntries([...String(s || "").matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

/** Plain text of an HTML fragment (search index, table of contents titles). */
export const plainText = (html) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Where an HTML fragment ends a line of text: a paragraph, a list item, a heading, a table row, a line break. */
const LINE_ENDS = ["</p>", "</li>", "</h1>", "</h2>", "</h3>", "</h4>", "</h5>", "</h6>", "</tr>", "</pre>", "<br>"];

/**
 * An HTML fragment without its tags, in one pass: each "<…>" dropped, a "<" never closed kept as text with what
 * follows it (an expression like /<[^>]*>/g would try every "<" to the end: quadratic on "<<<…").
 */
function withoutTags(html) {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    const close = open < 0 ? -1 : html.indexOf(">", open);
    if (close < 0) return out + html.slice(i);
    out += html.slice(i, open);
    i = close + 1;
  }
  return out;
}

/** The entities the Markdown engine writes, "&amp;" last (so that "&amp;lt;" stays "&lt;"). */
const ENTITIES = [
  ["&nbsp;", " "],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&amp;", "&"],
];

/**
 * The lines of an HTML fragment as plain text, one per paragraph, list item, heading, row or line break, the empty
 * ones left out (the text of a user story, for the backlog export). Linear: no expression but the blanks'.
 * @param {string} html
 * @returns {string[]}
 */
export function plainLines(html) {
  let s = String(html ?? "");
  for (const end of LINE_ENDS) s = s.split(end).join(end + "\u0000");
  // Cells apart; any other tag is inline, its text glued to its neighbours ("<b>manager</b>," → "manager,").
  for (const cell of ["</td>", "</th>"]) s = s.split(cell).join(" " + cell);
  return s
    .split("\u0000")
    .map((line) => {
      let text = withoutTags(line);
      for (const [entity, ch] of ENTITIES) text = text.split(entity).join(ch);
      return text.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

/** Anchor of a heading: lower case, no accents, hyphens; at most 60 characters. */
export const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

/** Without accents or case (label comparison). */
export const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** A letter, a digit, a combining mark or a connector (`_`), of any script: what continues a word. One code point. */
const WORD_CHAR = /^[\p{L}\p{N}\p{M}\p{Pc}]$/u;
const isSurrogate = (code, from) => code >= from && code <= from + 0x3ff;
/** The code point that ends right before `i` (a pair of surrogates is one), "" at the start. */
function pointBefore(text, i) {
  if (i <= 0) return "";
  const pair = i >= 2 && isSurrogate(text.charCodeAt(i - 1), 0xdc00) && isSurrogate(text.charCodeAt(i - 2), 0xd800);
  return String.fromCodePoint(text.codePointAt(pair ? i - 2 : i - 1));
}
/** The code point that starts at `i`, "" at the end. */
const pointAt = (text, i) => (i < text.length ? String.fromCodePoint(text.codePointAt(i)) : "");

/**
 * Where `needle` appears in `text` as a whole: no word character right before or after it (WORD_CHAR: "No" is not
 * in "Note", "Noé", "No_x", "éNo"), or a break there (`breaks`: the indexes where a word ends whatever follows — the
 * edge of an element in a rendered page). Left to right, never overlapping. Shared by the whole ids of coverage and
 * the labels of sync (ARCHITECTURE.md §6.10).
 * @param {string} text
 * @param {string} needle
 * @param {Set<number>|null} [breaks]
 * @returns {number[]}
 */
export function wholeIndexes(text, needle, breaks = null) {
  const out = [];
  if (!needle) return out;
  for (let i = text.indexOf(needle); i !== -1;) {
    const end = i + needle.length;
    const whole =
      (!!breaks?.has(i) || !WORD_CHAR.test(pointBefore(text, i))) &&
      (!!breaks?.has(end) || !WORD_CHAR.test(pointAt(text, end)));
    if (whole) out.push(i);
    i = text.indexOf(needle, whole ? end : i + 1);
  }
  return out;
}

/** Escapes a string for use inside a regular expression. */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
