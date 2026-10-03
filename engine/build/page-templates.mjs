// Page templates (ARCHITECTURE.md §6.4), shared by the build and by `audit`.
//   - standard/templates.json is the source of truth: types, sections per language, `required` indexes,
//     `maxWords`, aliases;
//   - a section is found when a `##` heading of the page STARTS WITH its label or one of its aliases, ignoring
//     case, accents, the shape of the apostrophe and repeated spaces ("Step by step: approve" ⇒ "Step by step");
//   - template guidance left in a page is an HTML comment `<!-- guidance: … -->` (en) or `<!-- consigne : … -->` (fr);
//   - words are counted on the Markdown source, without code, comments and markup.
// Pure functions, except loadPageTemplates (reads the kit's file once).
import fs from "node:fs";
import path from "node:path";
import { normalize } from "./text.mjs";
import { KIT_ROOT } from "../project/find.mjs";

/** Word limit of a page that declares no template (standard/structure.md, "Sub-pages"). */
export const DEFAULT_MAX_WORDS = 2000;
/** Opening of a guidance comment, in both languages of the templates. */
const GUIDANCE = /<!--\s*(?:guidance|consigne)\s*:/gi;

const cache = new Map();

/**
 * The template table of the kit, or null when it is missing. Read once: standard/templates.json, then the
 * fragments standard/templates/<group>.json in file name order (ARCHITECTURE.md §6.4a), whose types and aliases
 * are added to the table. A type defined twice is a defect of the kit: an error is thrown.
 */
export function loadPageTemplates(kitRoot = KIT_ROOT) {
  if (!cache.has(kitRoot)) {
    const f = path.join(kitRoot, "standard", "templates.json");
    if (!fs.existsSync(f)) cache.set(kitRoot, null);
    else {
      const table = JSON.parse(fs.readFileSync(f, "utf8"));
      table.aliases ??= {};
      const dir = path.join(kitRoot, "standard", "templates");
      const fragments = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : [];
      for (const name of fragments) {
        const fragment = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        for (const [type, def] of Object.entries(fragment.types || {})) {
          if (table.types[type]) throw new Error(`page template defined twice: ${type} (standard/templates/${name})`);
          table.types[type] = def;
        }
        for (const [language, aliases] of Object.entries(fragment.aliases || {}))
          for (const [label, list] of Object.entries(aliases)) {
            const known = (table.aliases[language] ??= {});
            known[label] = [...(known[label] || []), ...list];
          }
      }
      cache.set(kitRoot, table);
    }
  }
  return cache.get(kitRoot);
}

/** Comparable form of a heading or a label: no case, no accents, one kind of apostrophe, single spaces. */
export const comparable = (s) => normalize(s).replace(/[’ʼ`]/g, "'").replace(/\s+/g, " ");

/** Label of the section at `index` of a type, in a language (English when the language has none). */
export function sectionLabel(table, type, index, language) {
  const def = table.types[type];
  return def.sections?.[language]?.[index] ?? def.sections?.en?.[index];
}

/** Accepted labels of a section: its label, then its aliases in that language. */
function sectionLabels(table, type, index, language) {
  const label = sectionLabel(table, type, index, language);
  return [label, ...(table.aliases?.[language]?.[label] || [])].filter(Boolean);
}

/** Number of sections of a type (the en and fr lists have the same length). */
export const sectionCount = (table, type) => (table.types[type].sections?.en || Object.values(table.types[type].sections || {})[0] || []).length;

/** Word limit of a page: the `maxWords` of its template, otherwise DEFAULT_MAX_WORDS. */
export const maxWordsOf = (table, type) => table?.types?.[type]?.maxWords ?? DEFAULT_MAX_WORDS;

/**
 * `##` headings of a Markdown source (a `#` heading counts as `##`, like in the build), outside fenced code.
 * The build passes the rendered headings instead; this is for callers that only have the source.
 */
export function headingsOf(source) {
  const out = [];
  let fence = null;
  for (const line of String(source ?? "").split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^\s{0,3}#{1,2}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (m) out.push(m[1].replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim());
  }
  return out;
}

/** Indexes of the sections of `type` found among `headings`. */
export function presentSections({ table, type, headings, language = "en" }) {
  const hs = headings.map(comparable);
  const found = [];
  for (let i = 0; i < sectionCount(table, type); i++) {
    const labels = sectionLabels(table, type, i, language).map(comparable);
    if (labels.some((l) => hs.some((h) => h.startsWith(l)))) found.push(i);
  }
  return found;
}

/** Number of guidance comments left in a page. */
export const countGuidance = (source) => (String(source ?? "").match(GUIDANCE) || []).length;

/** Capture modes of `capture.mode` (ARCHITECTURE.md §3). */
export const CAPTURE_MODES = ["app", "none"];
const VARIANT_START = /^\s*<!--\s*doc-kit:capture=([\w-]+)\s*-->\s*$/;
const VARIANT_END = /^\s*<!--\s*doc-kit:end\s*-->\s*$/;

/**
 * Keeps the variant of a template that matches the capture mode (ARCHITECTURE.md §6.4): the lines between
 * `<!-- doc-kit:capture=<mode> -->` and the next marker are kept when <mode> is `mode`, dropped otherwise; the
 * markers themselves are removed, and `<!-- doc-kit:end -->` closes the passage. Text outside the markers is common.
 */
export function captureVariant(text, mode = "app") {
  const eol = String(text).includes("\r\n") ? "\r\n" : "\n";
  const out = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const start = VARIANT_START.exec(line);
    if (start) current = start[1];
    else if (VARIANT_END.test(line)) current = null;
    else if (current === null || current === mode) out.push(line);
  }
  return out.join(eol);
}

/** Words of a Markdown page: prose, headings, tables and legends; not code, comments, URLs or markup. */
export function countWords(source) {
  const text = String(source ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s{0,3}\1[^\n]*$/gm, " ")
    .replace(/^\s*:{2,3}[\w-]*(\{[^}\n]*\})?\s*$/gm, " ")
    .replace(/\[\[[\w-]+ ([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/\[![A-ZÉÈ]+\]/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Analyses one page against a template.
 * @param {{ table: object, type: string, headings: string[], source?: string, language?: string }} p
 * @returns {{ known: boolean, sections: number, present: number[], missing: string[], conformant: boolean,
 *   completeness: number, words: number, maxWords: number, guidance: number }}
 *   `missing`: labels of the REQUIRED sections that are absent; `present`: indexes of every section found.
 */
export function analysePage({ table, type, headings, source = "", language = "en" }) {
  const words = countWords(source);
  const guidance = countGuidance(source);
  const def = type ? table?.types?.[type] : undefined;
  if (!def) return { known: false, sections: 0, present: [], missing: [], conformant: false, completeness: 0, words, maxWords: DEFAULT_MAX_WORDS, guidance };
  const present = presentSections({ table, type, headings, language });
  const missing = (def.required || []).filter((i) => !present.includes(i)).map((i) => sectionLabel(table, type, i, language)).filter(Boolean);
  const sections = sectionCount(table, type);
  return { known: true, sections, present, missing, conformant: missing.length === 0, completeness: sections ? present.length / sections : 1, words, maxWords: maxWordsOf(table, type), guidance };
}

/**
 * Build check of one page. Only a page that declares `template` is checked against its required sections
 * (strict: an error of the strict build, a warning in draft mode). Guidance is reported for every page, as a
 * warning (standard/quality.md: it must be handled before handover, but does not block the build).
 * @param {{ pageId: string, template?: string, headings: string[], source?: string, templates: object|null, language?: string }} p
 * @returns {Array<{ key: string, vars: object, strict: boolean }>}  i18n keys `cli.build.<key>`
 */
export function checkPage({ pageId, template, headings, source = "", templates, language = "en" }) {
  const problems = [];
  if (template && templates?.types) {
    if (!templates.types[template])
      problems.push({ key: "template.unknown", vars: { page: pageId, template, known: Object.keys(templates.types).join(", ") }, strict: true });
    else
      for (const index of templates.types[template].required || []) {
        const labels = sectionLabels(templates, template, index, language).map(comparable);
        if (!labels.length) continue;
        if (!labels.some((l) => headings.some((h) => comparable(h).startsWith(l))))
          problems.push({ key: "template.missingSection", vars: { page: pageId, template, section: sectionLabel(templates, template, index, language) }, strict: true });
      }
  }
  const n = countGuidance(source);
  if (n) problems.push({ key: "template.guidance", vars: { page: pageId, n }, strict: false });
  return problems;
}

/**
 * The template an untyped page already follows, judged by its headings: every required section of the type is
 * present. Types without required sections are never guessed, and the sub-page types (`journey-step`,
 * `troubleshooting-area`) only when `parent` (the type of the level-1 page above) is their parent type.
 * Best score: a type of `prefer` (the usual types of the page's section) first, then the most required sections
 * (the most specific type), then the highest completeness.
 * @returns {{ type: string, completeness: number } | null}
 */
export function guessTemplate({ table, headings, language = "en", level = 1, parent = null, prefer = [] }) {
  let best = null;
  for (const [type, def] of Object.entries(table?.types || {})) {
    const required = def.required || [];
    if (!required.length) continue;
    if (SUB_TYPES[type] && (level !== 2 || parent !== SUB_TYPES[type])) continue;
    const present = presentSections({ table, type, headings, language });
    if (!required.every((i) => present.includes(i))) continue;
    const completeness = present.length / sectionCount(table, type);
    const score = (prefer.includes(type) ? 100 : 0) + required.length + completeness;
    if (!best || score > best.score) best = { type, completeness, score };
  }
  return best && { type: best.type, completeness: best.completeness };
}

/** Sub-page types and the type of their parent page. */
const SUB_TYPES = Object.freeze({ "journey-step": "journey", "troubleshooting-area": "troubleshooting" });

/**
 * The type an untyped page is closest to (most required sections present, at least half of them), with the
 * required sections still missing: what to rename or add to type it.
 * @returns {{ type: string, missing: string[] } | null}
 */
export function closestTemplate({ table, headings, language = "en" }) {
  let best = null;
  for (const [type, def] of Object.entries(table?.types || {})) {
    const required = def.required || [];
    if (required.length < 2 || SUB_TYPES[type]) continue;
    const present = presentSections({ table, type, headings, language });
    const hit = required.filter((i) => present.includes(i)).length;
    if (hit * 2 < required.length || hit === required.length) continue;
    const ratio = hit / required.length;
    if (!best || ratio > best.ratio) best = { type, ratio, missing: required.filter((i) => !present.includes(i)).map((i) => sectionLabel(table, type, i, language)) };
  }
  return best && { type: best.type, missing: best.missing };
}
