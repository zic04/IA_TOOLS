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

/** Escapes a string for use inside a regular expression. */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
