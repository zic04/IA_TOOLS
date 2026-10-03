// Message labels cited verbatim in the documentation (ARCHITECTURE.md §6.10 §2.5, §2.8, §2.9): which files to
// read, flattening nested JSON to dotted keys, which entries a written page cites, and the only contexts
// `--apply --labels` is allowed to rewrite.
import { adapterTools } from "../check/coverage.mjs";

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

/** Entries of a flattened message file cited verbatim (2+ characters) by at least one written page. */
export function citedLabels(flat, pages) {
  const out = [];
  for (const [key, value] of Object.entries(flat)) {
    if (typeof value !== "string" || value.length < 2) continue;
    const citedBy = pages.filter((p) => p.markdown.includes(value)).map((p) => p.id);
    if (citedBy.length) out.push({ key, value, pages: citedBy });
  }
  return out;
}

/** The five contexts `--apply --labels` may rewrite (ARCHITECTURE.md §6.10 §2.8): bold, code spans, badges, and quotes. */
const LABEL_CONTEXT = /\*\*[^*\n]+\*\*|`[^`\n]+`|\[\[[^\]\n]+\]\]|"[^"\n]+"|«[^»\n]+»|“[^”\n]+”/g;

/** Replaces `oldValue` by `newValue`, only inside the allowed contexts; the rest of the Markdown is untouched. */
export function replaceLabel(markdown, oldValue, newValue) {
  let n = 0;
  const text = markdown.replace(LABEL_CONTEXT, (token) => {
    if (!token.includes(oldValue)) return token;
    const parts = token.split(oldValue);
    n += parts.length - 1;
    return parts.join(newValue);
  });
  return { text, n };
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
