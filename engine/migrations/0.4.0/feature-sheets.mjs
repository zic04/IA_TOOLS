// Migration 0.4.0 (engine/migrations/0.4.0.mjs), the feature sheets (ARCHITECTURE.md §6.8a): the `feature` template
// of 0.4 asks for sections a sheet of 0.3 does not have (User stories, Behaviours, Messages, Rights by action,
// Acceptance criteria). Each one missing is added — its heading and the guidance of the kit's template — before the
// first section that comes after it in the template, at the end otherwise: the build passes again (guidance is a
// warning, to be handled before handover) and the writer sees what to write. Nothing else of the page changes. A
// section already there, under its label or an alias ("Main scenario" for "Main path"), is never added again.
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { loadPageTemplates, presentSections, sectionLabel } from "../../core/page-templates.mjs";
import { plainText } from "../../core/text.mjs";
import { KIT_ROOT } from "../../project/find.mjs";

/** The Markdown parser of the build (engine/build/markdown.mjs), without its extensions: it finds the same headings. */
const md = new Marked({ gfm: true });

/** The guidance of each section of the kit's `feature` template in a language: its label → its comment. */
function guidanceOf(language) {
  const lines = fs.readFileSync(path.join(KIT_ROOT, "templates", "pages", language, "feature.md"), "utf8").split("\n");
  const out = new Map();
  lines.forEach((line, n) => {
    if (!line.startsWith("## ")) return;
    const next = lines.slice(n + 1).find((l) => l.trim());
    if (next?.trim().startsWith("<!--")) out.set(line.slice(3).trim(), next.trim());
  });
  return out;
}

/** The headings of a token and of the tokens it holds (a heading inside a quote or a list item counts too). */
function headingsIn(token, out = []) {
  if (token.type === "heading") out.push(token);
  for (const child of token.tokens || []) headingsIn(child, out);
  for (const item of token.items || []) headingsIn(item, out);
  return out;
}

/**
 * The headings the build counts as sections (levels 1 and 2), found by the same parser: written with # or underlined,
 * holding a link or code, inside a quote or a list item, but never inside code or an HTML comment. Each with the
 * line its top-level block starts on (`text` has "\n" line ends) and the template section it is (-1: none).
 */
function headingLines(text, table, language) {
  const out = [];
  let line = 0;
  for (const token of md.lexer(text)) {
    for (const heading of headingsIn(token).filter((h) => h.depth <= 2)) {
      const title = plainText(/** @type {string} */ (md.parseInline(heading.text)));
      const [index] = presentSections({ table, type: "feature", headings: [title], language });
      out.push({ line, index: index ?? -1 });
    }
    line += token.raw.split("\n").length - 1;
  }
  return out;
}

/**
 * A feature sheet with the required sections of the template it lacks, or null when it lacks none.
 * @param {string} text       the page's Markdown
 * @param {string} language   the page's language: its section labels and guidance (English when the kit has none)
 * @returns {string|null}
 */
export function withFeatureSections(text, language) {
  const table = loadPageTemplates();
  const def = table?.types?.feature;
  if (!def) return null;
  const lang = def.sections?.[language] ? language : "en";
  const eol = String(text).includes("\r\n") ? "\r\n" : "\n";
  const lines = String(text).split(eol);
  const headings = headingLines(lines.join("\n"), table, lang);
  const present = new Set(headings.map((h) => h.index));
  const missing = (def.required || []).filter((i) => !present.has(i));
  if (!missing.length) return null;
  const guidance = guidanceOf(lang);
  const block = (i) => {
    const label = sectionLabel(table, "feature", i, lang);
    return [`## ${label}`, "", guidance.get(label) ?? "", ""];
  };
  const before = new Map();
  const atEnd = [];
  for (const i of missing) {
    const next = headings.find((h) => h.index > i);
    if (!next) atEnd.push(i);
    else (before.get(next.line) ?? before.set(next.line, []).get(next.line)).push(...block(i));
  }
  const out = [];
  lines.forEach((line, n) => out.push(...(before.get(n) || []), line));
  let result = out.join(eol);
  if (atEnd.length)
    result =
      result.trimEnd() +
      eol +
      eol +
      atEnd
        .flatMap((i) => block(i))
        .join(eol)
        .trimEnd() +
      eol;
  return result;
}

/**
 * The pages of a table of contents typed `feature`, with the Markdown file of each (relative to the content folder).
 * @param {{ sections?: Array<{ groups?: Array<{ pages?: Array<{ id: string, file?: string, template?: string }> }> }> }} toc
 */
export function featureFiles(toc) {
  const out = [];
  for (const sec of toc.sections || [])
    for (const g of sec.groups || [])
      for (const p of g.pages || []) if (p.template === "feature") out.push(p.file || `${p.id}.md`);
  return out;
}
