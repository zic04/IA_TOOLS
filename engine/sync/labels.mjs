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

/** Whether a page's Markdown cites a label value: verbatim, case-sensitive, as a whole ("No" is not in "Note"). */
export const citesLabel = (markdown, value) => wholeIndexes(markdown, value).length > 0;

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
 * The Markdown `--apply --labels` reads (ARCHITECTURE.md §6.10 §2.8). PROTECTED, blanked first and never rewritten:
 * a directive's name and attributes (`:::screen{capture="…" title="…"}`), a link's or an image's target
 * (`](orders.md "Orders")`), a link definition, an HTML tag, a verified badge (it names its source file). CONTEXT:
 * the contexts it may rewrite — bold, code spans, badges and quotes. Linear: no class runs over the character that
 * opens the next match, so a scan that fails never reads past it again (RULES.md S5).
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

/**
 * Replaces `oldValue` by `newValue`, as a whole word or phrase, only inside the allowed contexts and never in a
 * protected part (LABEL_PATTERNS); a code span is replaced only when it is the label itself (`Approve`), never
 * inside longer code. The rest of the Markdown is untouched.
 */
export function replaceLabel(markdown, oldValue, newValue) {
  if (!oldValue || oldValue.includes("\0")) return { text: markdown, n: 0 };
  const masked = markdown.replace(LABEL_PATTERNS.PROTECTED, (s) => "\0".repeat(s.length));
  const at = [];
  for (const m of masked.matchAll(LABEL_PATTERNS.CONTEXT)) {
    const [from, to] = textRange(m[0]);
    const inner = m[0].slice(from, to);
    if (m[0][0] !== "`") for (const i of wholeIndexes(inner, oldValue)) at.push(m.index + from + i);
    else if (inner.trim() === oldValue) at.push(m.index + from + inner.indexOf(oldValue));
  }
  let text = "";
  let last = 0;
  for (const i of at) {
    text += markdown.slice(last, i) + newValue;
    last = i + oldValue.length;
  }
  return { text: text + markdown.slice(last), n: at.length };
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
