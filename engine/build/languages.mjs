// Languages (ARCHITECTURE.md §6.12, lot V8): one source, one site, several languages. This module, shared by the
// build, the CLI and the skill: translated-file bookkeeping (states, fingerprints), merging a translated
// toc.json/glossary.json onto the source's structure, the id/language clash check, the --lang option, and the
// per-language capture options. A project without `languages` never calls any of this (§9, equivalence).
import fs from "node:fs";
import path from "node:path";
import { hashText } from "../sync/hash.mjs";
import { LOCALES } from "../i18n.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

/** Text fields of each kind of entry in content/toc.json: translated; every other field comes from the source. */
export const TEXT_FIELDS = Object.freeze({
  toc: ["title", "tagline"],
  section: ["title", "shortTitle", "subtitle", "highlights"],
  group: ["title"],
  page: ["title", "menuTitle", "summary"],
  journey: ["title", "description"],
  space: ["title", "shortTitle", "subtitle", "for"],
});

/** Keys of the i18n fragment of the languages (i18n/en/languages.json): embedded only when the site uses them. */
export const LANGUAGE_TEXT_KEYS = Object.freeze(
  Object.keys(JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "i18n", "en", "languages.json"), "utf8"))),
);

/** Embedded texts without those of the languages (a site that does not declare `languages`). */
export function withoutLanguageTexts(texts) {
  const skip = new Set(LANGUAGE_TEXT_KEYS);
  return Object.fromEntries(Object.entries(texts).filter(([k]) => !skip.has(k)));
}

// ─── Translated files: which ones, and their state ────────────────────────────────────────────────────────────

/**
 * The translatable files of a project, in a stable order: toc.json, glossary.json, home.md, then for each
 * section its introduction (`<section>/index.md`, ONLY when that source file exists — a section without one is
 * never translatable, no fallback either, exactly like the build itself, ARCHITECTURE.md §6.1/§6.12,
 * `introSourceMissing` in engine/build/build.mjs) and its pages (`p.file || p.id + ".md"`).
 * @param {{ toc: object, root: string, content: string }} p   `root`/`content`: the documentation project root
 *   and `config.paths.content`, used only to check whether a section's introduction source exists.
 * @returns {Array<{ file: string, kind: "toc"|"glossary"|"home"|"page", page?: string, section?: string }>}
 */
export function translatableFiles({ toc, root, content }) {
  /** @type {Array<{ file: string, kind: "toc"|"glossary"|"home"|"page", page?: string, section?: string }>} */
  const files = [
    { file: "toc.json", kind: "toc" },
    { file: "glossary.json", kind: "glossary" },
    { file: "home.md", kind: "home" },
  ];
  for (const sec of toc.sections || []) {
    const introRel = `${sec.id}/index.md`;
    if (fs.existsSync(path.join(root, content, introRel)))
      files.push({ file: introRel, kind: "page", section: sec.id });
    for (const g of sec.groups || [])
      for (const p of g.pages || []) files.push({ file: p.file || `${p.id}.md`, kind: "page", page: p.id });
  }
  return files;
}

/**
 * State of one translated file (ARCHITECTURE.md §6.12).
 * @param {{ sourceText: string|null, translatedExists: boolean, recorded: string|undefined }} p
 *   sourceText: current content of the SOURCE file (hashed to detect staleness); recorded: the fingerprint of
 *   `translations/<lang>/.sources.json` for this file, or undefined.
 * @returns {"missing"|"unmarked"|"stale"|"current"}
 */
export function translationState({ sourceText, translatedExists, recorded }) {
  if (!translatedExists) return "missing";
  if (recorded === undefined || recorded === null) return "unmarked";
  return recorded === hashText(sourceText ?? "") ? "current" : "stale";
}

/** `translations/<lang>/.sources.json`: `{ file: fingerprint }`, tolerant (missing or unreadable: `{}`). */
export function readSources(root, translationsDir, lang) {
  const file = path.join(root, translationsDir, lang, ".sources.json");
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Writes `translations/<lang>/.sources.json`: keys sorted, 2-space JSON, LF, trailing newline. */
export function writeSources(root, translationsDir, lang, map) {
  const dir = path.join(root, translationsDir, lang);
  fs.mkdirSync(dir, { recursive: true });
  const sorted = Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((k) => [k, map[k]]),
  );
  fs.writeFileSync(path.join(dir, ".sources.json"), JSON.stringify(sorted, null, 2) + "\n");
}

// ─── Merging a translated toc.json / glossary.json onto the source's structure ────────────────────────────────

const pickText = (source, translated, field) =>
  translated && translated[field] !== undefined ? translated[field] : source[field];

/** Non-text fields of a node (every key but `skip`); a translated value that differs from the source is ignored
 * (warning `translation.toc.ignored`), the source's value is always kept. */
function mergeNonText(source, translated, skip, path, problems) {
  if (!translated) return;
  for (const key of Object.keys(source)) {
    if (skip.includes(key)) continue;
    if (translated[key] === undefined) continue;
    if (JSON.stringify(translated[key]) !== JSON.stringify(source[key]))
      problems.push({ key: "translation.toc.ignored", vars: { path: `${path}.${key}` }, blocking: false });
  }
}

function mergePage(sp, group, i, problems, basePath) {
  const tp = group?.pages?.[i];
  const path = `${basePath}.pages[${i}]`;
  if (!tp || tp.id !== sp.id) {
    problems.push({ key: "translation.toc.structure", vars: { path }, blocking: true });
    return { ...sp };
  }
  mergeNonText(sp, tp, [...TEXT_FIELDS.page, "id"], path, problems);
  return {
    ...sp,
    title: pickText(sp, tp, "title"),
    menuTitle: pickText(sp, tp, "menuTitle"),
    summary: pickText(sp, tp, "summary"),
  };
}

function mergeGroup(sg, section, i, problems, basePath) {
  const tg = section?.groups?.[i];
  const path = `${basePath}.groups[${i}]`;
  if (!tg || (sg.pages || []).length !== (tg.pages || []).length) {
    problems.push({ key: "translation.toc.structure", vars: { path }, blocking: true });
    return { ...sg, pages: (sg.pages || []).map((p) => ({ ...p })) };
  }
  mergeNonText(sg, tg, [...TEXT_FIELDS.group, "pages"], path, problems);
  return {
    ...sg,
    title: pickText(sg, tg, "title"),
    pages: (sg.pages || []).map((p, j) => mergePage(p, tg, j, problems, path)),
  };
}

function mergeSection(ss, translated, i, problems) {
  // No translated toc.json yet (a translation just started): every text falls back to the source, silently.
  if (!translated)
    return { ...ss, groups: (ss.groups || []).map((g) => ({ ...g, pages: (g.pages || []).map((p) => ({ ...p })) })) };
  const ts = translated?.sections?.[i];
  const path = `sections[${i}]`;
  if (!ts || ts.id !== ss.id || (ss.groups || []).length !== (ts.groups || []).length) {
    problems.push({ key: "translation.toc.structure", vars: { path }, blocking: true });
    return { ...ss, groups: (ss.groups || []).map((g) => ({ ...g })) };
  }
  mergeNonText(ss, ts, [...TEXT_FIELDS.section, "id", "groups"], path, problems);
  return {
    ...ss,
    title: pickText(ss, ts, "title"),
    shortTitle: pickText(ss, ts, "shortTitle"),
    subtitle: pickText(ss, ts, "subtitle"),
    highlights: pickText(ss, ts, "highlights"),
    groups: (ss.groups || []).map((g, j) => mergeGroup(g, ts, j, problems, path)),
  };
}

const spaceIdOf = (s) => (typeof s === "string" ? s : s?.id);

function mergeSpace(ss, translated, i, problems) {
  // The whole `spaces` array is optional in the translation (nothing to translate: every space keeps its
  // default texts, ARCHITECTURE.md §6.12); only present-but-mismatched is structural.
  if (!translated || translated.spaces === undefined) return ss;
  const id = spaceIdOf(ss);
  const tsRaw = translated.spaces[i];
  const path = `spaces[${i}]`;
  if (tsRaw === undefined || spaceIdOf(tsRaw) !== id) {
    problems.push({ key: "translation.toc.structure", vars: { path }, blocking: true });
    return ss;
  }
  if (typeof ss === "string")
    return typeof tsRaw === "string"
      ? ss
      : {
          id,
          ...Object.fromEntries(TEXT_FIELDS.space.filter((f) => tsRaw[f] !== undefined).map((f) => [f, tsRaw[f]])),
        };
  const ts = typeof tsRaw === "string" ? {} : tsRaw;
  mergeNonText(ss, ts, [...TEXT_FIELDS.space, "id"], path, problems);
  const out = { ...ss };
  for (const f of TEXT_FIELDS.space) out[f] = pickText(ss, ts, f);
  return out;
}

function mergeJourney(sj, translated, i, problems) {
  // The whole `journeys` array is optional in the translation too: omitted entirely, every journey keeps its
  // source title and description, no warning (like a page's title falling back silently).
  if (!translated || translated.journeys === undefined) return { ...sj };
  const tj = translated.journeys[i];
  const path = `journeys[${i}]`;
  if (!tj || (tj.steps !== undefined && (sj.steps || []).length !== tj.steps.length)) {
    problems.push({ key: "translation.toc.structure", vars: { path }, blocking: true });
    return { ...sj };
  }
  mergeNonText(sj, tj, [...TEXT_FIELDS.journey, "steps"], path, problems);
  return { ...sj, title: pickText(sj, tj, "title"), description: pickText(sj, tj, "description") };
}

/**
 * Merges a translated table of contents onto the source's structure (ARCHITECTURE.md §6.12): every non-text field
 * (ids, routes, permissions, counterparts, steps…) comes from the SOURCE; every text field (titles, summaries…)
 * comes from the TRANSLATION when present, else the source (a partial translation is accepted, without warning).
 * @param {{ source: object, translated: object|null }} p   normalised toc.json objects
 * @returns {{ toc: object, problems: Array<{ key: string, vars: object, blocking: boolean }> }}
 *   problems: "translation.toc.structure" (blocking: a section/group/page/journey/space missing, added, out of
 *   order, or a different count of steps/suggestions) and "translation.toc.ignored" (a non-text field the
 *   translation changed: kept as the source had it).
 */
export function translatedToc({ source, translated }) {
  const problems = [];
  if ((source.suggestions || []).length !== (translated?.suggestions || source.suggestions || []).length)
    problems.push({ key: "translation.toc.structure", vars: { path: "suggestions" }, blocking: true });
  else
    mergeNonText(
      { suggestions: source.suggestions || [] },
      translated ? { suggestions: translated.suggestions } : null,
      [],
      "",
      problems,
    );

  const toc = {
    ...source,
    title: pickText(source, translated, "title"),
    tagline: pickText(source, translated, "tagline"),
    sections: (source.sections || []).map((s, i) => mergeSection(s, translated, i, problems)),
    ...(source.spaces ? { spaces: source.spaces.map((s, i) => mergeSpace(s, translated, i, problems)) } : {}),
    ...(source.journeys ? { journeys: source.journeys.map((j, i) => mergeJourney(j, translated, i, problems)) } : {}),
  };
  return { toc, problems };
}

/**
 * Merges a translated glossary onto the source's (same entries, same order): `term`, `def` and `pattern`
 * translated, `technical` always from the source. A different number of entries is reported (the caller decides
 * whether that is an error or, with --draft, a warning that falls back to the whole source glossary).
 * @param {{ source: object[], translated: object[]|null }} p
 * @returns {{ glossary: object[], problem?: { expected: number, found: number } }}
 */
export function translatedGlossary({ source, translated }) {
  if (!translated) return { glossary: source };
  if (translated.length !== source.length)
    return { glossary: source, problem: { expected: source.length, found: translated.length } };
  const glossary = source.map((g, i) => ({
    ...g,
    term: translated[i].term ?? g.term,
    def: translated[i].def ?? g.def,
    ...(g.pattern !== undefined || translated[i].pattern !== undefined
      ? { pattern: translated[i].pattern ?? g.pattern }
      : {}),
  }));
  return { glossary };
}

// ─── Options and checks shared by the build and the CLI ───────────────────────────────────────────────────────

/** Output file of a mono-language build (`build --lang <l>`): the configured output with "-<lang>" before its
 * extension ("dist/Acme-Orders-Documentation.html" → "dist/Acme-Orders-Documentation-fr.html"). */
export function languageOutput(output, lang) {
  const ext = path.extname(output);
  return `${output.slice(0, output.length - ext.length)}-${lang}${ext}`;
}

/**
 * The --lang option of a multilingual project: a declared language, else a usage error (exit code 2).
 * @param {{ languages: string[]|null, lang: string, t: (key: string, vars?: object) => string }} p
 * @throws {KitError} build.langUnknown { lang, known }
 */
export function checkLanguageOption({ languages, lang, t }) {
  if (languages && languages.includes(lang)) return lang;
  throw new KitError(EXIT.USAGE, "build.langUnknown", { lang, known: (languages || []).join(", ") });
}

/**
 * A section id, or the first segment of a page id, equal to a declared language: the URL grammar (§6.12 §3)
 * reserves it. Blocking even a draft build, checked before any rendering (like an invalid space declaration).
 * @returns {Array<{ kind: "languages", key: "languages.idClash", vars: { id: string, lang: string } }>}
 */
export function checkIdClash({ toc, languages }) {
  if (!languages) return [];
  /** @type {Array<{ kind: "languages", key: "languages.idClash", vars: { id: string, lang: string } }>} */
  const problems = [];
  const hit = (id) => languages.find((l) => l === id);
  for (const sec of toc.sections || []) {
    const lang = hit(sec.id);
    if (lang) problems.push({ kind: "languages", key: "languages.idClash", vars: { id: sec.id, lang } });
    for (const g of sec.groups || [])
      for (const p of g.pages || []) {
        const first = String(p.id).split("/")[0];
        const l = hit(first);
        if (l) problems.push({ kind: "languages", key: "languages.idClash", vars: { id: p.id, lang: l } });
      }
  }
  return problems;
}

/**
 * Capture options of one language (`capture --lang <l>`, ARCHITECTURE.md §6.12): `capture.languages.<l>`
 * (`locale`, `cookies`, `storage`) merged over `capture.locale`, `capture.cookies`, `capture.storage`.
 * @param {object} capture   config.capture
 * @param {string} lang
 */
export function mergeLanguageCapture(capture, lang) {
  const lc = capture.languages?.[lang] || {};
  return {
    ...capture,
    locale: lc.locale ?? LOCALES[lang] ?? capture.locale,
    cookies: [...(capture.cookies || []), ...(lc.cookies || [])],
    storage: { ...(capture.storage || {}), ...(lc.storage || {}) },
  };
}

/**
 * Translation counts of one language, read from disk (ARCHITECTURE.md §6.12): used by `doctor`, the guided mode
 * and `audit`. The source language itself is never counted (nothing to translate into itself).
 * @param {{ root: string, config: object, toc: object, lang: string }} p
 * @returns {{ id: string, current: number, stale: number, unmarked: number, missing: number }}
 */
export function languageCounts({ root, config, toc, lang }) {
  const { content, translations } = config.paths;
  const files = translatableFiles({ toc, root, content });
  const recorded = readSources(root, translations, lang);
  const counts = { current: 0, stale: 0, unmarked: 0, missing: 0 };
  for (const f of files) {
    const srcAbs = path.join(root, content, f.file);
    const trAbs = path.join(root, translations, lang, f.file);
    const exists = fs.existsSync(trAbs);
    const sourceText = fs.existsSync(srcAbs) ? fs.readFileSync(srcAbs, "utf8") : null;
    counts[translationState({ sourceText, translatedExists: exists, recorded: recorded[f.file] })]++;
  }
  return { id: lang, ...counts };
}
