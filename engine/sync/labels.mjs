// Message labels cited verbatim in the documentation (ARCHITECTURE.md §6.10 §2.5, §2.8, §2.9): which files to
// read, flattening nested JSON to dotted keys, which entries a written page cites — where the page, rendered by the
// kit's renderer, shows them as text — and how `--apply --labels` rewrites them: in the only contexts it is allowed
// to, then kept only when the page renders as it did but for the label.
import fs from "node:fs";
import { adapterTools } from "../check/coverage.mjs";
import { wholeIndexes } from "../core/text.mjs";
import { blank, blankRanges, readMarkdown } from "./prose.mjs";
import { collapse, isBlank, rendersAsBefore, shownText } from "./html-text.mjs";

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

/** A message file, flattened: {} when it is missing (its keys are gone), null when it is not valid JSON (nothing is
 * known of its labels then). */
export function readFlatLabels(abs) {
  try {
    return fs.existsSync(abs) ? flattenMessages(JSON.parse(fs.readFileSync(abs, "utf8"))) : {};
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

/** A label as it is written, composed (NFC) and decomposed (NFD): `é` is one character, or `e` and an accent. */
const formsOf = (value) => [...new Set([value, value.normalize("NFC"), value.normalize("NFD")])];

/** The [from, to) ranges where `text` holds `value` whole, in any of its forms, in order (`breaks`: wholeIndexes). */
const heldBy = (text, value, breaks = null) =>
  formsOf(value)
    .flatMap((form) => wholeIndexes(text, form, breaks).map((i) => [i, i + form.length]))
    .sort((a, b) => a[0] - b[0]);

/** The [index, length] matches (in order) that no range of `held` holds whole. */
function notHeld(matches, held) {
  let p = 0;
  let end = -1;
  return matches.filter(([i, length]) => {
    while (p < held.length && held[p][0] <= i) end = Math.max(end, held[p++][1]);
    return end < i + length;
  });
}

/**
 * The Markdown `--apply --labels` reads (ARCHITECTURE.md §6.10 §2.8), once proseOf has blanked what is never text.
 * PROTECTED, blanked too and never rewritten: a directive's name and attributes (`:::screen{capture="…"}`), a
 * link's or an image's target (`](orders.md "Orders")`, one level of parentheses in it), a link definition, an HTML
 * tag, a verified badge (it names its source file), a bare address the renderer turns into a link
 * (`https://…`, `www.…`, to the next blank). CONTEXT: the contexts it may rewrite — bold, badges and quotes; bold and
 * typographic quotes (`«…»`, `“…”`, always paired) over one line end too, a label written across it (a code span
 * that is the label itself is found by proseOf's reading, never by a pattern). DEFINITION: the label of a link
 * definition, and REFERENCE a label between brackets, which refers to it when it names one. Linear: no class runs over the character
 * that opens the next match, so a scan that fails never reads past it again (RULES.md S5).
 */
export const LABEL_PATTERNS = Object.freeze({
  PROTECTED:
    /:{2,3}[A-Za-z][\w-]*(?:\[[^[\]\n]*\])?\{[^{}\n]*\}|\]\((?:[^()\n]|\([^()\n]*\))*\)|^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?\[[^[\]\n]+\]:[^\n]*|<\/?[A-Za-z][^<>\n]*>|\[\[(?:verified|verifie)\s[^[\]\n]*\]\]|\b(?:https?|ftp):\/\/[^\s<]*|\bwww\.[^\s<]*/gm,
  CONTEXT:
    /\*\*[^*\n]+(?:\n[^*\n]+)?\*\*|\[\[[^[\]\n]+\]\]|"[^"\n]+"|«[^«»\n]+(?:\n[^«»\n]+)?»|“[^“”\n]+(?:\n[^“”\n]+)?”/g,
  DEFINITION: /^[ \t>]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?\[([^[\]\n]+)\]:/gm,
  REFERENCE: /\[([^[\]\n]+)\]/g,
});

/** A link label as Markdown matches it: without case, its blanks as one space. */
const linkLabel = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The parts of the prose `--apply --labels` never rewrites, blanked: PROTECTED, and a label between brackets that
 * names a link definition of the page (`[Approve]`, `[the page][Approve]`: rewritten, the link would break). */
function protectedParts(prose) {
  const masked = prose.replace(LABEL_PATTERNS.PROTECTED, (s) => "\0".repeat(s.length));
  const defined = new Set([...prose.matchAll(LABEL_PATTERNS.DEFINITION)].map((m) => linkLabel(m[1])));
  if (!defined.size) return masked;
  return masked.replace(LABEL_PATTERNS.REFERENCE, (s, label) => (defined.has(linkLabel(label)) ? blank(s) : s));
}

/** The part of a context token that holds text: inside its delimiters; for a badge, after its kind (`[[menu …]]`). */
function textRange(token) {
  if (!token.startsWith("[[")) return token.startsWith("**") ? [2, token.length - 2] : [1, token.length - 1];
  const space = token.slice(2).search(/\s/);
  return space < 0 ? [0, 0] : [space + 3, token.length - 2];
}

/**
 * A text with each run of blanks (spaces, tabs, line ends) as one space, as the page shows it, and for each of its
 * characters the index it comes from, then the text's length.
 */
function shownBlanks(text) {
  let shown = "";
  const from = [];
  let blank = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!(isBlank(c) && blank)) {
      shown += isBlank(c) ? " " : c;
      from.push(i);
    }
    blank = isBlank(c);
  }
  from.push(text.length);
  return { shown, from };
}

/** Where `text` holds one of the `forms` whole, its blanks read as the page shows them (`**Approval\nchain**` holds
 * `Approval chain`): [index, length] in `text`, in order. */
function wholeSpans(text, forms) {
  const { shown, from } = shownBlanks(text);
  return forms
    .flatMap((form) => wholeIndexes(shown, form).map((i) => [from[i], from[i + form.length - 1] + 1 - from[i]]))
    .sort((a, b) => a[0] - b[0]);
}

/** Where a context token's text holds the label, in any of its forms: [index in the token, length]. */
function labelsIn(token, forms) {
  const [from, to] = textRange(token);
  return wholeSpans(token.slice(from, to), forms).map(([i, length]) => [from + i, length]);
}

/**
 * Where `--apply --labels` replaces `oldValue` (in any of its `forms`): a code span that is the label itself, and the
 * label as a whole inside an allowed context — never in a protected part, and never in a code span, wherever it nests
 * (in bold, between quotes) —, a line end in it read as the page shows it, a space. [index, length], in order.
 */
function labelSpots(markdown, forms) {
  const { prose, spans, tags } = readMarkdown(markdown);
  let masked = protectedParts(prose);
  const at = [];
  for (const [a, b, ticks] of spans) {
    const inner = masked.slice(a + ticks, b - ticks);
    const core = inner.trim();
    if (forms.includes(shownBlanks(core).shown)) at.push([a + ticks + inner.indexOf(core), core.length]);
  }
  masked = blankRanges(blankRanges(masked, spans), tags);
  const context = new RegExp(LABEL_PATTERNS.CONTEXT.source, "g");
  for (let m; (m = context.exec(masked));) {
    // A `**` that opens no bold is passed over, never the bold that follows it (`5 ** 2`, then `the **order**`).
    if (!couldBe(m[0])) context.lastIndex = m.index + 2;
    else for (const [i, length] of labelsIn(m[0], forms)) at.push([m.index + i, length]);
  }
  return { at: at.sort((x, y) => x[0] - y[0]), masked };
}

/** Whether a context token can be what it says: a bold one as Marked reads one, no blank right inside its `**` (`5 **
 * 2` then `the **order**` is no bold around `2 … the`); a badge or quotes, always. */
function couldBe(token) {
  if (!token.startsWith("**")) return true;
  const inner = token.slice(2, -2);
  return !isBlank(inner[0]) && !isBlank(inner.at(-1));
}

/**
 * The rewrite `--apply --labels` proposes (its candidates, read in the Markdown): `oldValue` (as written, NFC or NFD)
 * replaced by `newValue`, as a whole word or phrase, only inside the allowed contexts and never in a protected part
 * (readMarkdown of engine/sync/prose.mjs, LABEL_PATTERNS); a code span only when it is the label itself (`Approve`),
 * never inside longer code. Where the page already holds `newValue` (`Approval chain history` for `Approval chain`),
 * nothing is replaced: replacing twice is replacing once. The rest of the Markdown is untouched. This reading of the
 * Markdown is close to the renderer's, and is not the renderer: labelReader keeps the rewrite only when the rendered
 * page agrees.
 */
function candidates(markdown, oldValue, newValue) {
  if (!oldValue || oldValue.includes("\0")) return { text: markdown, n: 0 };
  const { at, masked } = labelSpots(markdown, formsOf(oldValue));
  let text = "";
  let last = 0;
  let n = 0;
  const held = wholeSpans(masked, formsOf(newValue)).map(([i, length]) => [i, i + length]);
  for (const [i, length] of notHeld(at, held)) {
    if (i < last) continue;
    text += markdown.slice(last, i) + newValue;
    last = i + length;
    n++;
  }
  return { text: text + markdown.slice(last), n };
}

/** The Markdown of a run's pages kept rendered: more than a documentation holds, so that a run renders each page
 * once. */
const CACHE_CHARS = 1 << 23;

/** A page rendered: its HTML and the text it shows; when the renderer fails on it, no HTML, and its Markdown whole as
 * the text it shows (every label it holds is cited: never a signal lost). */
function renderPage(render, markdown) {
  try {
    const html = render(markdown);
    return { html, shown: shownText(html) };
  } catch {
    return { html: null, shown: { text: markdown, breaks: new Set() } };
  }
}

/**
 * The labels of the pages of a run, read through the kit's renderer (ARCHITECTURE.md §6.10): `render` gives a page's
 * Markdown as the HTML the site shows (engine/build/sync-renderer.mjs, given by the CLI as `exec` is: sync comes
 * before the build, RULES.md M14). A page cites a label where its rendered text shows it (shownText); a rewrite of
 * `--apply --labels` is kept only when the page renders as it did but for the label's text (rendersAsBefore), else
 * the page is left as it is, `byHand`: to update by hand, its signal still pending. Each page is rendered once a run,
 * whatever the number of labels: the pages read last are kept, up to `cacheChars` characters of Markdown in all.
 * @param {(markdown: string) => string} render
 * @param {{ cacheChars?: number }} [o]
 */
export function labelReader(render, { cacheChars = CACHE_CHARS } = {}) {
  const pages = new Map();
  let chars = 0;
  /** @returns {{ html: string|null, shown: { text: string, breaks: Set<number> } }} */
  const read = (markdown) => {
    let page = pages.get(markdown);
    if (page !== undefined) pages.delete(markdown);
    else {
      page = renderPage(render, markdown);
      chars += markdown.length;
      for (const [old] of pages) {
        if (chars <= cacheChars) break;
        pages.delete(old);
        chars -= old.length;
      }
    }
    pages.set(markdown, page);
    return page;
  };

  /**
   * Whether a page's Markdown cites a label value: verbatim, case-sensitive, in either Unicode form, as a whole ("No"
   * is not in "Note"), its blanks as the page shows them (collapsed), where the rendered page shows it as text. With
   * `except` (the new value of a renamed label), a spot where the page holds that value whole does not cite the old
   * one inside it (`Approval chain` in `Approval chain history`).
   * @param {string} markdown
   * @param {string} value
   * @param {string|null} [except]
   */
  function citesLabel(markdown, value, except = null) {
    const { text, breaks } = read(markdown).shown;
    const held = except ? heldBy(text, collapse(except), breaks) : [];
    return formsOf(collapse(value)).some(
      (form) =>
        notHeld(
          wholeIndexes(text, form, breaks).map((i) => [i, form.length]),
          held,
        ).length > 0,
    );
  }

  /**
   * Entries of a flattened message file cited verbatim (2+ characters, whole) by at least one of the pages.
   * @param {Record<string, any>} flat
   * @param {Array<{ id: string, markdown: string }>} written
   */
  function citedLabels(flat, written) {
    const out = [];
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value !== "string" || value.length < 2) continue;
      const citedBy = written.filter((p) => citesLabel(p.markdown, value)).map((p) => p.id);
      if (citedBy.length) out.push({ key, value, pages: citedBy });
    }
    return out;
  }

  /**
   * `oldValue` replaced by `newValue` where `--apply --labels` may (candidates), kept only when the page renders as it
   * did but for the label's text; otherwise the Markdown as it is, `byHand`.
   * @param {string} markdown
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {{ text: string, n: number, byHand?: true }}
   */
  function replaceLabel(markdown, oldValue, newValue) {
    const r = candidates(markdown, oldValue, newValue);
    if (!r.n) return r;
    const before = read(markdown).html;
    const after = before === null ? null : read(r.text).html;
    if (after !== null && rendersAsBefore(before, after, formsOf(oldValue), newValue)) return r;
    return { text: markdown, n: 0, byHand: true };
  }

  return { citesLabel, citedLabels, replaceLabel };
}

/** @typedef {ReturnType<typeof labelReader>} LabelReader */

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
