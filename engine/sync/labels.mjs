// Message labels cited verbatim in the documentation (ARCHITECTURE.md §6.10 §2.5, §2.8, §2.9): which files to
// read, flattening nested JSON to dotted keys, which entries a written page cites, and the only contexts
// `--apply --labels` is allowed to rewrite.
import fs from "node:fs";
import { adapterTools } from "../check/coverage.mjs";
import { wholeIndexes } from "../core/text.mjs";

/** Nested JSON → dotted keys, string values only ({ "a": { "b": "x" } } → { "a.b": "x" }). */
export function flattenMessages(json, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(json || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flattenMessages(v, key));
  }
  return out;
}

/** A message file, flattened; null when it is missing or not valid JSON (then nothing is known of its labels). */
export function readFlatLabels(abs) {
  try {
    return fs.existsSync(abs) ? flattenMessages(JSON.parse(fs.readFileSync(abs, "utf8"))) : null;
  } catch {
    return null;
  }
}
/** Splits a glob with a literal directory prefix (possibly "../…") from its wildcard part. */
function splitGlob(pattern) {
  const parts = pattern.split("/");
  const i = parts.findIndex((p) => p.includes("*"));
  if (i < 0) return { base: parts.slice(0, -1).join("/") || ".", pattern: parts.at(-1) };
  return { base: parts.slice(0, i).join("/") || ".", pattern: parts.slice(i).join("/") };
}

/** Files matching a glob, relative to the documentation project (handles a literal "../" prefix). */
function globProjRel(tools, pattern) {
  const { base, pattern: sub } = splitGlob(pattern);
  return tools.glob(sub, base).map((f) => (base === "." ? f : `${base}/${f}`));
}

/**
 * Message files whose labels are followed (ARCHITECTURE.md §6.10): `config.sync.labels` (globs relative to the
 * project; a pattern without "*" is kept as is when it exists), else the `messages` of every `i18n-registry`
 * coverage adapter.
 * @returns {string[]} projRel, sorted
 */
export function labelFiles(root, config) {
  const tools = adapterTools(root);
  const patterns = config.sync?.labels || [];
  if (patterns.length) {
    const out = new Set();
    for (const pattern of patterns) {
      if (!pattern.includes("*")) {
        if (tools.exists(pattern)) out.add(pattern);
      } else for (const f of globProjRel(tools, pattern)) out.add(f);
    }
    return [...out].sort();
  }
  return [
    ...new Set(
      (config.coverage || [])
        .filter((c) => c.adapter === "i18n-registry")
        .map((c) => c.messages)
        .filter(Boolean),
    ),
  ];
}

/** A code fence (``` or ~~~) after any indentation or quote markers; its closing line. Linear: no class overlaps
 * the next one (RULES.md S5). */
const FENCE = /^[ \t>]*(`{3,}|~{3,})/;
const FENCE_END = /^[ \t>]*(`+|~+)[ \t\r]*$/;
/** A list item (`- `, `* `, `+ `, `1. `, `1) `): its indentation, its marker, the spaces after it. */
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|\r?$)/;
/** A heading: an indented line right after it is code too. */
const HEADING = /^ {0,3}#/;
/** A blank line inside a tag: a tag never spans one. */
const BLANK_LINE = /\n[ \t]*\r?\n/;

/** The columns of a line's indentation, a tab to the next multiple of four. */
function indentOf(line) {
  let n = 0;
  for (const ch of line)
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  return n;
}

/** Each character but a line end as NUL: what is blanked keeps its length (an index still points at the same one). */
const blank = (s) => s.replace(/[^\n]/g, "\0");

/** A front matter: an opening `---` followed by a YAML key or comment, up to its closing `---` or `...`. */
function frontMatterEnd(lines) {
  if (lines[0].replace(/^﻿/, "").trimEnd() !== "---" || !/^(?:[\w-]+:|#)/.test(lines[1] ?? "")) return -1;
  return lines.findIndex((l, i) => i > 0 && (l.trimEnd() === "---" || l.trimEnd() === "..."));
}

/**
 * The lines that are never text, blanked (ARCHITECTURE.md §6.10): the front matter, fenced code blocks (``` or ~~~, to
 * the closing fence of the same character and at least the same length, else to the end), indented code blocks
 * (four columns beyond the list item they sit in, after a blank line, a heading or another block). One pass.
 */
function blankCodeLines(markdown) {
  const lines = markdown.split("\n");
  const start = frontMatterEnd(lines) + 1;
  for (let n = 0; n < start; n++) lines[n] = blank(lines[n]);
  let fence = null;
  let canStartCode = true; // after a blank line, a heading or a block: an indented line there is code
  let inCode = false;
  let listIndent = -1; // the content column of the list item the text sits in, -1 outside a list
  for (let n = start; n < lines.length; n++) {
    const line = lines[n];
    if (fence) {
      const end = FENCE_END.exec(line);
      if (end && end[1][0] === fence[0] && end[1].length >= fence.length) fence = null;
      lines[n] = blank(line);
      canStartCode = !fence;
      continue;
    }
    if (line.trim() === "") {
      canStartCode = true;
      continue;
    }
    const indent = indentOf(line);
    if ((canStartCode || inCode) && indent >= Math.max(listIndent, 0) + 4) {
      lines[n] = blank(line);
      inCode = true;
      continue;
    }
    const afterBlank = canStartCode && !inCode;
    inCode = false;
    const open = FENCE.exec(line);
    if (open && !(open[1][0] === "`" && line.slice(open[0].length).includes("`"))) {
      fence = open[1];
      lines[n] = blank(line);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const after = indentOf(item[3]);
      listIndent = indentOf(item[1]) + item[2].length + (after >= 1 && after <= 4 ? after : 1);
    } else if (afterBlank && listIndent >= 0 && indent < listIndent) listIndent = indent > 0 ? indent : -1;
    canStartCode = HEADING.test(line);
  }
  return lines.join("\n");
}

/** The [from, to) ranges of the HTML comments (to their `-->`, else to the end). */
function commentRanges(text) {
  const out = [];
  for (let i = text.indexOf("<!--"); i !== -1;) {
    const end = text.indexOf("-->", i + 4);
    out.push([i, end === -1 ? text.length : end + 3]);
    i = end === -1 ? -1 : text.indexOf("<!--", end + 3);
  }
  return out;
}

/** The [from, to) ranges of the HTML tags spread over several lines (never over a blank one). Each `<` is read once,
 * and the next `>` is looked for again only once passed (RULES.md S5). */
function multiLineTags(text) {
  const out = [];
  let close = -1;
  for (let i = text.indexOf("<"); i !== -1;) {
    const next = text.indexOf("<", i + 1);
    if (close < i) close = text.indexOf(">", i);
    if (close === -1) break;
    if ((next === -1 || close < next) && /^<\/?[A-Za-z]/.test(text.slice(i, i + 3))) {
      const tag = text.slice(i, close + 1);
      if (tag.includes("\n") && !BLANK_LINE.test(tag)) out.push([i, close + 1]);
    }
    i = next;
  }
  return out;
}

/** HTML comments and tags over several lines, blanked (a tag inside a comment is the comment's). */
function blankMarkup(text) {
  let out = "";
  let last = 0;
  for (const [a, b] of [...commentRanges(text), ...multiLineTags(text)].sort((x, y) => x[0] - y[0])) {
    if (b <= last) continue;
    const from = Math.max(a, last);
    out += text.slice(last, from) + blank(text.slice(from, b));
    last = b;
  }
  return out + text.slice(last);
}

/**
 * The Markdown without what is never text, blanked (each character but a line end as NUL, so that an index still
 * points at the same character): code blocks, the front matter, HTML comments and tags over several lines. A label
 * there is neither cited nor rewritten (ARCHITECTURE.md §6.10).
 */
export const proseOf = (markdown) => blankMarkup(blankCodeLines(markdown));

/** proseOf, kept for the pages of a run: every label is looked for in every page (bounded). */
const PROSE = new Map();
function cachedProse(markdown) {
  let prose = PROSE.get(markdown);
  if (prose === undefined) {
    if (PROSE.size >= 256) PROSE.clear();
    prose = proseOf(markdown);
    PROSE.set(markdown, prose);
  }
  return prose;
}

/** A label as it is written, composed (NFC) and decomposed (NFD): `é` is one character, or `e` and an accent. */
const formsOf = (value) => [...new Set([value, value.normalize("NFC"), value.normalize("NFD")])];

/**
 * Whether a page's Markdown cites a label value: verbatim, case-sensitive, in either Unicode form, as a whole ("No" is
 * not in "Note"), outside code blocks, the front matter, comments and tags over several lines (proseOf).
 */
export const citesLabel = (markdown, value) =>
  formsOf(value).some((form) => wholeIndexes(cachedProse(markdown), form).length > 0);

/** Entries of a flattened message file cited verbatim (2+ characters, whole) by at least one of the pages. */
export function citedLabels(flat, pages) {
  const out = [];
  for (const [key, value] of Object.entries(flat)) {
    if (typeof value !== "string" || value.length < 2) continue;
    const citedBy = pages.filter((p) => citesLabel(p.markdown, value)).map((p) => p.id);
    if (citedBy.length) out.push({ key, value, pages: citedBy });
  }
  return out;
}

/**
 * The Markdown `--apply --labels` reads (ARCHITECTURE.md §6.10 §2.8), once proseOf has blanked what is never text.
 * PROTECTED, blanked too and never rewritten: a directive's name and attributes (`:::screen{capture="…"}`), a
 * link's or an image's target (`](orders.md "Orders")`), a link definition, an HTML tag, a verified badge (it names
 * its source file). CONTEXT: the contexts it may rewrite — bold, code spans, badges and quotes. Linear: no class runs
 * over the character that opens the next match, so a scan that fails never reads past it again (RULES.md S5).
 */
export const LABEL_PATTERNS = Object.freeze({
  PROTECTED:
    /:{2,3}[A-Za-z][\w-]*(?:\[[^[\]\n]*\])?\{[^{}\n]*\}|\]\([^()\n]*\)|^ {0,3}\[[^[\]\n]+\]:[^\n]*|<\/?[A-Za-z][^<>\n]*>|\[\[(?:verified|verifie)\s[^[\]\n]*\]\]/gm,
  CONTEXT: /\*\*[^*\n]+\*\*|`[^`\n]+`|\[\[[^[\]\n]+\]\]|"[^"\n]+"|«[^«»\n]+»|“[^“”\n]+”/g,
});

/** The part of a context token that holds text: inside its delimiters; for a badge, after its kind (`[[menu …]]`). */
function textRange(token) {
  if (!token.startsWith("[[")) return token.startsWith("**") ? [2, token.length - 2] : [1, token.length - 1];
  const space = token.slice(2).search(/\s/);
  return space < 0 ? [0, 0] : [space + 3, token.length - 2];
}

/** Where a context token's text holds the label, in any of its forms: [index in the token, length]. */
function labelsIn(token, forms) {
  const [from, to] = textRange(token);
  const inner = token.slice(from, to);
  if (token[0] === "`") {
    const form = forms.find((f) => inner.trim() === f);
    return form ? [[from + inner.indexOf(form), form.length]] : [];
  }
  return forms.flatMap((form) => wholeIndexes(inner, form).map((i) => [from + i, form.length]));
}

/**
 * Replaces `oldValue` (as written, NFC or NFD) by `newValue`, as a whole word or phrase, only inside the allowed
 * contexts and never in a protected part (proseOf, LABEL_PATTERNS); a code span is replaced only when it is the
 * label itself (`Approve`), never inside longer code. The rest of the Markdown is untouched.
 */
export function replaceLabel(markdown, oldValue, newValue) {
  if (!oldValue || oldValue.includes("\0")) return { text: markdown, n: 0 };
  const masked = proseOf(markdown).replace(LABEL_PATTERNS.PROTECTED, (s) => "\0".repeat(s.length));
  const forms = formsOf(oldValue);
  const at = [];
  for (const m of masked.matchAll(LABEL_PATTERNS.CONTEXT))
    for (const [i, length] of labelsIn(m[0], forms)) at.push([m.index + i, length]);
  let text = "";
  let last = 0;
  let n = 0;
  for (const [i, length] of at.sort((a, b) => a[0] - b[0])) {
    if (i < last) continue;
    text += markdown.slice(last, i) + newValue;
    last = i + length;
    n++;
  }
  return { text: text + markdown.slice(last), n };
}

const DOTTED_LITERAL = /["'`]([a-z0-9_-]+(?:\.[a-z0-9_-]+)+)["'`]/gi;
const NS_CALL = /\b(?:useTranslations|getTranslations)\(\s*["'`]([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)["'`]/i;
const T_CALL = /\bt\(\s*["'`]([a-z0-9_-]+)["'`]/gi;

/**
 * Message keys a source excerpt references (ARCHITECTURE.md §6.11, `context`): dotted string literals, plus the
 * bare keys of `t("key")` calls prefixed with the file's `useTranslations("ns")` / `getTranslations("ns")`.
 * @returns {Array<{ key: string, ns?: string }>}
 */
export function labelKeysInCode(text) {
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(DOTTED_LITERAL))
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push({ key: m[1] });
    }
  const ns = NS_CALL.exec(text)?.[1];
  if (ns)
    for (const m of text.matchAll(T_CALL)) {
      const key = `${ns}.${m[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, ns });
      }
    }
  return out;
}
