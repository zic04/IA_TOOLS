// Builds the documentation site as ONE self-contained HTML file. No side effect: the function reads the
// project and returns the HTML; writing the file, printing messages and the exit code are the CLI's job.
//   Inputs: <content>/ (Markdown + toc.json + glossary.json + home.md), <images>/ (WebP + zones/*.json),
//           <diagrams>/ (SVG), <facts>/ (read by ::facts, §6.9; never written here), theme logo; the template,
//           the style and the browser engine come from the kit.
//   Strict by default: any inconsistency (screenshot, zones, link, missing page) is an error;
//   options.draft turns them into warnings (missing pages are replaced by a "page being written" note).
//   Legacy French-keyed files (ARCHITECTURE.md §6.7) are normalised when read.
//   Spaces (§6.1a, engine/build/spaces.mjs): besides the full site, one export per declared space (`sites`).
//   Languages (§6.12, engine/build/languages.mjs): besides the source data, one data object per other declared
//   language (`renderLanguage`, below), or with `options.lang` the single requested language instead of every one.
//
// The data embedded in the site (#donnees) keeps its historical key names (titre, pages, ordre…), so that
// equivalence level 1 can compare a build with the older engine; only meta.generator and i18n are added. The data
// of the spaces (spaces, space, counterpart…) and of the languages (meta.languages, meta.language, fallback…) is
// only emitted when declared: without them, the output is unchanged (§9).
import fs from "node:fs";
import path from "node:path";
import { createMarkdownEngine } from "./markdown.mjs";
import { indexPage } from "./search.mjs";
import { assemble } from "./assemble.mjs";
import { loadPageTemplates, checkPage } from "./page-templates.mjs";
import { esc, escapeRegex } from "./text.mjs";
import { checkLinks } from "../check/links.mjs";
import { createI18n, EMBEDDED_NAMESPACES } from "../i18n.mjs";
import { resolveSpaces, counterpartOf, exportSite, spaceOutput, withoutSpaceTexts } from "./spaces.mjs";
import { buildFeatureRegistry, resolveBusinessRefs, hasTechnicalProof, BUSINESS_TYPES } from "./business.mjs";
import {
  withoutLanguageTexts,
  translatableFiles,
  translationState,
  readSources,
  translatedToc,
  translatedGlossary,
  languageOutput,
  checkIdClash,
  languageCounts,
} from "./languages.mjs";
import { hashText } from "../sync/hash.mjs";
import { normalizeZones } from "../project/legacy.mjs";
import { createIcons } from "../site/icons.mjs";
import { loadLogo } from "../theme/logo.mjs";
import { tokenStylesheet, themeTokens } from "../theme/tokens.mjs";
import { resolve as resolveTokens } from "../theme/contrast.mjs";
import { validate, closest } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { normalizeToc, normalizeGlossary, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { generatorTag } from "../brand.mjs";
import { readSyncReference } from "../sync/reference.mjs";
import { readUsage, USAGE_DIR } from "../stats/usage.mjs";
import { readChanges } from "../facts/changes.mjs";

export const SITE_DIR = path.join(KIT_ROOT, "engine", "site");
const IMAGE_TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
export const HOME_FILES = ["home.md", "accueil.md"];

/** Documented version: version.file + version.pattern (first group), otherwise version.fallback. */
export function readProjectVersion(root, { file, pattern, fallback }) {
  if (file) {
    const f = path.resolve(root, file);
    if (fs.existsSync(f)) {
      const m = new RegExp(pattern).exec(fs.readFileSync(f, "utf8"));
      if (m && m[1]) return m[1];
    }
  }
  return fallback;
}

/** Displayed date: --date YYYY-MM-DD (reproducible, independent of the time zone) or now. */
export function siteDate(date, i18n) {
  if (date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) throw new Error(`invalid date: ${date} (expected YYYY-MM-DD)`);
    return i18n.date(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)), { utc: true });
  }
  return i18n.date(new Date());
}

/**
 * @param {object} p
 * @param {{ root: string }} p.project
 * @param {object} p.config     validated and completed configuration (engine/project/load.mjs)
 * @param {{ draft?: boolean, date?: string, output?: string, siteDir?: string, space?: string, spaceOutput?: string, lang?: string }} [p.options]
 *   siteDir: alternative folder for template.html, app.js and style.css (equivalence tests of older engines).
 *   space: only the export of that space in `sites` (the full site is still computed), even with
 *   spaces.export false; spaceOutput: the file of that export. lang (§6.12, a declared language other than the
 *   caller validates with checkLanguageOption): a mono-language file of that language alone, instead of the
 *   multilingual file.
 * @returns {{ html: string|null, data: object|null, stats: object|null, errors: object[], warnings: object[], output: string,
 *   sites: Array<{ space: string, html: string, data: object, stats: object, output: string, excludedLinks: number }>,
 *   languages: Array<{ id: string, source: boolean, current: number, stale: number, unmarked: number, missing: number }> }}
 *   errors and warnings: { kind, key, vars } (text: i18n key `cli.build.<key>`);
 *   kind "validate": { kind, key, vars, file, path } (key `cli.validate.<key>`).
 *   sites: one export per declared space, in declaration order; [] without spaces (§6.1a).
 *   languages: one entry per declared language (counts of translated files, read from disk, ARCHITECTURE.md
 *   §6.12); [] without `languages`, whether or not `options.lang` was given.
 */
export function build({ project, config, options = {} }) {
  const root = project.root;
  const draft = !!options.draft;
  const { content, images, diagrams, facts, translations } = config.paths;
  // Production statistics (ARCHITECTURE.md §6.14), for ::usage: read once, whatever the language.
  const usage = readUsage(path.join(root, USAGE_DIR));
  // Recorded changes of the application (doc-kit changes --record), for ::changes.
  const changes = readChanges(root);
  const siteDir = options.siteDir || SITE_DIR;
  const readFs = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const existsFs = (p) => fs.existsSync(path.join(root, p));
  const errors = [];
  const warnings = [];
  const report = (strict, s) => (strict && !draft ? errors : warnings).push(s);
  const languages = config.languages || null;
  const outputRel = options.output || (options.lang ? languageOutput(config.output, options.lang) : config.output);
  const output = path.resolve(root, outputRel);
  const fail = () => ({ html: null, data: null, stats: null, errors, warnings, output, sites: [], languages: [] });
  const readJson = (file) => {
    try {
      return JSON.parse(readFs(file));
    } catch (e) {
      report(true, { kind: "json", key: "json.invalid", vars: { file, error: e.message } });
      return undefined;
    }
  };
  const validateContent = (value, schema, file) => {
    const r = validate(value, readSchema(schema));
    for (const e of r.errors) report(true, { kind: "validate", key: e.key, vars: e.vars, file, path: e.path });
    return r.errors.length === 0;
  };
  const legacyFiles = [];

  // ─── Texts, icons, logo (source language) ───────────────────────────────────
  const i18n = createI18n({ language: config.language, overrides: config.texts });
  const t = i18n.t;
  const reference = createI18n({ language: "en" });
  for (const key of Object.keys(config.texts))
    if (!reference.has(key))
      warnings.push({ kind: "texts", key: "texts.unknown", vars: { key, closest: closest(key, Object.keys(reference.keys)) || "—" } });
  const { ICONS, icon, key: iconKey } = createIcons(config.theme.icons);
  const { logo, problem: logoProblem } = loadLogo(root, config.theme.logo);
  if (logoProblem) report(true, { kind: "theme", ...logoProblem });

  // ─── Table of contents (current or legacy file name), source language ──────
  const tocFile = [CURRENT_FILES.toc, LEGACY_FILES.toc].map((f) => `${content}/${f}`).find(existsFs);
  if (!tocFile) {
    errors.push({ kind: "toc", key: "toc.missing", vars: { file: `${content}/${CURRENT_FILES.toc}` } });
    return fail();
  }
  const rawToc = readJson(tocFile);
  if (rawToc === undefined) {
    if (draft) errors.push(warnings.pop());
    return fail();
  }
  const nt = normalizeToc(rawToc);
  if (nt.legacy) legacyFiles.push(tocFile);
  const toc = nt.value;
  const vt = validate(toc, readSchema("toc"));
  if (vt.errors.length) {
    // An invalid outline prevents any build, even a draft one.
    for (const e of vt.errors) errors.push({ kind: "validate", key: e.key, vars: e.vars, file: tocFile, path: e.path });
    return fail();
  }
  if (toc.product && toc.product !== config.product.name)
    warnings.push({ kind: "toc", key: "toc.productDeprecated", vars: { toc: toc.product, config: config.product.name } });

  // Languages (§6.12): a section id, or the first segment of a page id, equal to a declared language is blocking,
  // even a draft build, before any rendering — like an invalid space or outline declaration.
  if (languages) {
    const clashes = checkIdClash({ toc, languages });
    if (clashes.length) {
      errors.push(...clashes);
      return fail();
    }
  }

  // Spaces (§6.1a): like an invalid outline, a wrong declaration prevents any build, even a draft one.
  const { spaces, errors: spaceErrors } = resolveSpaces({ toc, t, iconKey });
  if (spaceErrors.length) {
    errors.push(...spaceErrors);
    return fail();
  }

  const version = readProjectVersion(root, config.version);
  const templates = loadPageTemplates(KIT_ROOT);
  // Sync reference (ARCHITECTURE.md §6.10): which pages were marked as checked, and against which version —
  // common to every language (translations are never read by sync).
  const { reference: syncRef, problem: syncProblem } = readSyncReference(root, config);
  if (syncProblem) report(false, { kind: "sync", ...syncProblem });

  // ─── Per-language rendering reader (§6.12) ──────────────────────────────────
  // Diagrams and images of a translated language, when they exist, replace the source's for that language; a
  // capture's own existence check (markdown.mjs) therefore also falls back to the source file. Facts (common to
  // every language) and anything else are read exactly like the source. A translated diagram lives under the
  // TRANSLATIONS tree (`<paths.translations>/<lang>/diagrams/<id>.svg`, mirroring content/, ARCHITECTURE.md
  // §6.12); a translated image lives as a SIBLING of <paths.images> (`<paths.images>/<lang>/<id>.webp`, §7).
  function engineReadersFor(lang) {
    const diagramPath = (rel) => (existsFs(`${translations}/${lang}/${diagrams}/${rel}`) ? `${translations}/${lang}/${diagrams}/${rel}` : null);
    const imagePath = (rel) => (existsFs(`${images}/${lang}/${rel}`) ? `${images}/${lang}/${rel}` : null);
    return {
      exists: (p) => {
        if (p.startsWith(`${diagrams}/`)) return existsFs(diagramPath(p.slice(diagrams.length + 1)) || p) || existsFs(p);
        if (p.startsWith(`${images}/`)) return existsFs(imagePath(p.slice(images.length + 1)) || p) || existsFs(p);
        return existsFs(p);
      },
      read: (p) => {
        if (p.startsWith(`${diagrams}/`)) {
          const f = diagramPath(p.slice(diagrams.length + 1));
          if (f) return readFs(f);
        }
        return readFs(p);
      },
    };
  }

  /** Zone files of `<images>/<lang>/zones/*.json`, normalised like the source's; `{}` without a folder. */
  function zonesFor(lang) {
    const dir = `${images}/${lang}/zones`;
    const out = {};
    if (!existsFs(dir)) return out;
    for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith(".json"))) {
      const raw = readJson(`${dir}/${f}`);
      if (raw === undefined) continue;
      const nz = normalizeZones(raw);
      if (validateContent(nz.value, "zones", `${dir}/${f}`)) out[f.slice(0, -5)] = nz.value;
    }
    return out;
  }

  /** Translated `<lang>.json` content file (toc.json / glossary.json): parsed, or null (missing / unreadable). */
  function readTranslatedJson(lang, name) {
    const rel = `${translations}/${lang}/${name}`;
    if (!existsFs(rel)) return null;
    try {
      return JSON.parse(readFs(rel));
    } catch (e) {
      report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: name, error: e.message } });
      return null;
    }
  }

  const sourceLangId = languages ? languages[0] : null;
  const recordedByLang = {}; // lang → { file: fingerprint } (translations/<lang>/.sources.json)

  /**
   * Renders one language's full data (the source, or a declared translation), reusing the SAME table-of-contents
   * traversal for every language: `langToc` already carries that language's texts, merged onto the source's
   * structure by `translatedToc` (identical ids and order, guaranteed). Mutates nothing shared; pushes problems
   * through `reportLang` (the build's `report`, with `vars.lang` added for every language but the source).
   * @returns {{ data: object, used: object, engine: object, pages: object }}
   */
  function renderLanguage({ lang, isSource, langToc, langGlossary, langCaptures, langT, langI18n, reportLang }) {
    const { features, problems: featureProblems } = buildFeatureRegistry({ toc: langToc });
    if (isSource) for (const { strict, ...problem } of featureProblems) report(strict, { kind: "business", ...problem });

    const engine = createMarkdownEngine({
      captures: langCaptures,
      exists: isSource ? existsFs : engineReadersFor(lang).exists,
      read: isSource ? readFs : engineReadersFor(lang).read,
      report: reportLang,
      t: langT,
      icon,
      statuses: config.statuses,
      paths: { images, diagrams, facts },
      usage,
      changes,
      llm: config.llm,
      locale: lang,
    });

    const pages = {};
    const order = [];
    const index = [];
    const links = {};
    const sections = [];
    const unwritten = new Set();
    const used = { pages: {}, intros: {}, home: null };
    const counterparts = {};
    const recorded = isSource ? {} : (recordedByLang[lang] ??= readSources(root, translations, lang));
    /** The translated document at `rel` (relative to content/): fallback to the source when missing/absent,
     * with the strict/draft report and the `fallback` flag the site shows a banner for. `sourceMissing`: the
     * page/intro/home itself has no SOURCE file either (ARCHITECTURE.md §6.12: nothing to report, nothing to
     * translate — the placeholder below is the only content, in this language). */
    function resolveDoc(rel, sourceText, sourceMissing) {
      if (isSource || sourceMissing) return { text: sourceText, fallback: null };
      const abs = `${translations}/${lang}/${rel}`;
      if (!existsFs(abs)) {
        reportLang(true, { kind: "translation", key: "translation.missing", vars: { file: rel } });
        return { text: sourceText, fallback: sourceLangId };
      }
      const text = readFs(abs);
      const state = translationState({ sourceText, translatedExists: true, recorded: recorded[rel] });
      if (state === "stale") reportLang(false, { kind: "translation", key: "translation.stale", vars: { file: rel } });
      return { text, fallback: null };
    }

    for (const sec of langToc.sections) {
      if (isSource && sec.icon && !(iconKey(sec.icon) in ICONS)) warnings.push({ kind: "toc", key: "toc.icon", vars: { section: sec.id, icon: sec.icon } });
      const groups = [];
      for (const g of sec.groups) {
        const ids = g.pages.map((p) => {
          const rel = p.file || `${p.id}.md`;
          const file = `${content}/${rel}`;
          let sourceText;
          const missing = !existsFs(file);
          if (!missing) sourceText = readFs(file);
          else {
            if (isSource) {
              unwritten.add(p.id);
              report(true, { kind: "page", key: "page.missing", vars: { page: p.id, file } });
            }
            sourceText = `> [!NOTE] ${langT("render.draftPage.title")}\n> ${langT("render.draftPage.text")}\n`;
          }
          const { text: source, fallback } = resolveDoc(rel, sourceText, missing);
          if (isSource && pages[p.id]) warnings.push({ kind: "toc", key: "toc.duplicate", vars: { page: p.id } });
          const r = engine.render(source, p.id);
          pages[p.id] = {
            id: p.id,
            titre: p.title,
            titre_menu: p.menuTitle,
            resume: p.summary || "",
            section: sec.id,
            groupe: g.title || "",
            niveau: p.level || 1,
            routes: p.routes || [],
            droits: p.permissions || [],
            html: r.html,
            toc: r.toc,
            captures: r.captures,
            ...(spaces ? { space: p.space ?? sec.space } : {}),
            ...(p.counterpart ? { counterpart: counterpartOf(p.counterpart) } : {}),
            ...(syncRef?.pages?.[p.id] ? { verified: { version: syncRef.pages[p.id].version, date: syncRef.pages[p.id].verified } } : {}),
            ...(fallback ? { fallback } : {}),
          };
          if (p.counterpart) counterparts[p.id] = p.counterpart;
          used.pages[p.id] = r.used;
          links[p.id] = r.links;
          order.push(p.id);
          indexPage(index, p.id, p.title, r.html);
          const headings = r.toc.filter((x) => x.niveau === 2).map((x) => x.titre);
          if (!missing)
            for (const { strict, ...problem } of checkPage({ pageId: p.id, template: p.template, headings, source, templates, language: lang }))
              reportLang(strict, { kind: "template", ...problem });
          if (!missing && spaces && (p.space ?? sec.space) === "business" && BUSINESS_TYPES.includes(p.template) && hasTechnicalProof(source))
            reportLang(false, { kind: "business", key: "business.technical", vars: { page: p.id } });
          return p.id;
        });
        groups.push({ titre: g.title || "", pages: ids });
      }
      const introRel = `${sec.id}/index.md`;
      const introFile = `${content}/${introRel}`;
      const introSourceMissing = !existsFs(introFile);
      let introRender = null;
      let introFallback = null;
      if (!introSourceMissing) {
        const introSourceText = readFs(introFile);
        const { text: introText, fallback } = resolveDoc(introRel, introSourceText, false);
        introFallback = fallback;
        introRender = engine.render(introText, sec.id);
        used.intros[sec.id] = introRender.used;
      }
      sections.push({
        id: sec.id,
        titre: sec.title,
        titre_court: sec.shortTitle,
        sous_titre: sec.subtitle,
        icone: sec.icon === undefined ? undefined : iconKey(sec.icon),
        vedette: !!sec.featured,
        points: sec.highlights || [],
        intro_html: introRender ? introRender.html : "",
        groupes: groups,
        ...(spaces ? { space: sec.space } : {}),
        ...(introFallback ? { fallback: introFallback } : {}),
      });
    }
    const homeFile = HOME_FILES.map((f) => `${content}/${f}`).find(existsFs);
    if (isSource && homeFile && homeFile.endsWith(HOME_FILES[1])) legacyFiles.push(homeFile);
    const homeSourceMissing = !homeFile;
    let homeRender = null;
    let homeFallback = null;
    if (!homeSourceMissing) {
      const homeRel = HOME_FILES.find((f) => existsFs(`${content}/${f}`)) || HOME_FILES[0];
      const { text: homeText, fallback } = resolveDoc(homeRel, readFs(homeFile), false);
      homeFallback = fallback;
      homeRender = engine.render(homeText, "accueil");
      used.home = homeRender.used;
    }
    const homeHtml = homeRender ? homeRender.html : "";

    // Internal links: target page and anchor exist; journey steps exist. Counterparts: checked once, on the
    // source (the declared anchor is always a source slug, §6.12); mapped by position for the other languages,
    // after every page has rendered (the counterpart's target may come later in the table of contents).
    for (const problem of checkLinks({ pages, links, sections: langToc.sections.map((s) => s.id), journeys: langToc.journeys || [], counterparts: isSource ? counterparts : {}, unwritten }))
      reportLang(true, problem);
    const { problems: businessRefProblems } = resolveBusinessRefs({ pages, features, rules: engine.rules, t: langT });
    for (const { strict, ...problem } of businessRefProblems) reportLang(strict, { kind: "business", ...problem });
    if (isSource && spaces) {
      for (const s of spaces) s.pages = order.filter((id) => pages[id].space === s.id).length;
      for (const s of spaces.filter((x) => !x.pages)) warnings.push({ kind: "space", key: "space.empty", vars: { space: s.id } });
    }
    if (isSource && legacyFiles.length) warnings.push({ kind: "legacy", key: "legacy.read", vars: { files: legacyFiles.join(", ") } });

    const stats = { pages: order.length, captures: engine.usedCaptures.size, zones: engine.zoneCount, schemas: engine.usedDiagrams.size };
    const spaced = !!spaces || Object.keys(counterparts).length > 0;
    const prefixes = languages ? [...EMBEDDED_NAMESPACES, "template."] : EMBEDDED_NAMESPACES;
    let embedded = langI18n.subset(prefixes);
    if (!spaced) embedded = withoutSpaceTexts(embedded);
    if (!languages) embedded = withoutLanguageTexts(embedded);

    const siteSpaces = spaces
      ? resolveSpaces({ toc: langToc, t: langT, iconKey }).spaces.map((s, i) => ({ ...s, pages: spaces[i]?.pages ?? s.pages }))
      : null;

    const data = {
      meta: {
        titre: langToc.title,
        produit: config.product.name,
        accroche: langToc.tagline,
        version,
        date: siteDate(options.date, langI18n),
        stats,
        generator: generatorTag(),
        ...(config.feedback ? { feedback: { label: config.feedback.label || langT("ui.feedback"), url: config.feedback.url } } : {}),
        ...(languages ? { languages, language: lang } : {}),
        ...(homeFallback ? { homeFallback } : {}),
      },
      ...(siteSpaces ? { spaces: siteSpaces } : {}),
      icones: ICONS,
      sections,
      pages,
      ordre: order,
      recherche: index,
      glossaire: langGlossary.map((g) => ({ terme: g.term, def: g.def, motif: g.pattern || escapeRegex(g.term), ...(g.technical ? { tech: g.technical } : {}) })),
      parcours: (langToc.journeys || []).map((j) => ({ titre: j.title, desc: j.description, etapes: j.steps, ...(spaces ? { space: j.space ?? pages[j.steps[0]]?.space ?? null } : {}) })),
      suggestions: langToc.suggestions || [],
      accueil_html: homeHtml,
      i18n: embedded,
    };
    return { data, used, engine, counterparts, pages };
  }

  // ─── Source language ─────────────────────────────────────────────────────────
  const glossaryFile = [CURRENT_FILES.glossary, LEGACY_FILES.glossary].map((f) => `${content}/${f}`).find(existsFs);
  let glossary = [];
  if (glossaryFile) {
    const raw = readJson(glossaryFile);
    if (raw !== undefined) {
      const ng = normalizeGlossary(raw);
      if (ng.legacy) legacyFiles.push(glossaryFile);
      if (validateContent(ng.value, "glossary", glossaryFile)) glossary = ng.value;
    }
  }
  for (const g of glossary) {
    try {
      new RegExp(`(${g.pattern || escapeRegex(g.term)})`, "iu");
    } catch (e) {
      report(true, { kind: "glossary", key: "glossary.pattern", vars: { term: g.term, error: e.message } });
    }
  }
  const sourceCaptures = {};
  let legacyZones = 0;
  const zonesDir = `${images}/zones`;
  for (const f of existsFs(zonesDir) ? fs.readdirSync(path.join(root, zonesDir)).filter((x) => x.endsWith(".json")) : []) {
    const file = `${zonesDir}/${f}`;
    const raw = readJson(file);
    if (raw === undefined) continue;
    const nz = normalizeZones(raw);
    if (nz.legacy) legacyZones++;
    if (validateContent(nz.value, "zones", file)) sourceCaptures[f.slice(0, -5)] = nz.value;
  }
  if (legacyZones) legacyFiles.push(`${zonesDir}/*.json (${legacyZones})`);

  const sourcePass = renderLanguage({ lang: config.language, isSource: true, langToc: toc, langGlossary: glossary, langCaptures: sourceCaptures, langT: t, langI18n: i18n, reportLang: report });
  const { data } = sourcePass;

  // ─── Other declared languages (§6.12) ─────────────────────────────────────────
  // With options.lang: only the source and the requested language are rendered (the others are summarised from
  // disk alone, languageCounts — rendering an unrelated language's draft issues must never block this one).
  const byLang = { [config.language]: sourcePass };
  const capturesByLang = { [config.language]: sourceCaptures };
  const toRender = languages ? (options.lang ? [options.lang] : languages.slice(1)) : [];
  for (const lang of toRender) {
    const rawToc2 = readTranslatedJson(lang, CURRENT_FILES.toc);
    const translatedTocRaw = rawToc2 ? normalizeToc(rawToc2).value : null;
    const { toc: langToc, problems: tocProblems } = translatedToc({ source: toc, translated: translatedTocRaw });
    // A structural mismatch is blocking even with --draft (like an invalid outline, ARCHITECTURE.md §6.12); a
    // non-text field the translation changed ("ignored") is only ever informative.
    for (const p of tocProblems) {
      const problem = { kind: "translation", key: p.key, vars: { lang, ...p.vars } };
      if (p.blocking) errors.push(problem);
      else warnings.push(problem);
    }
    if (!translatedTocRaw) report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: "toc.json" } });

    const rawGlossary = readTranslatedJson(lang, CURRENT_FILES.glossary);
    const translatedGlossaryRaw = rawGlossary ? normalizeGlossary(rawGlossary).value : null;
    let langGlossary = glossary;
    if (translatedGlossaryRaw) {
      const { glossary: merged, problem } = translatedGlossary({ source: glossary, translated: translatedGlossaryRaw });
      langGlossary = merged;
      if (problem) report(true, { kind: "translation", key: "translation.glossary.structure", vars: { lang, ...problem } });
    } else if (glossaryFile) report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: CURRENT_FILES.glossary } });

    const langCaptures = { ...sourceCaptures, ...zonesFor(lang) };
    capturesByLang[lang] = langCaptures;
    const langI18n = createI18n({ language: lang, overrides: config.texts });
    const reportLang = (strict, s) => report(strict, { ...s, vars: { ...s.vars, lang } });
    byLang[lang] = renderLanguage({ lang, isSource: false, langToc, langGlossary, langCaptures, langT: langI18n.t, langI18n, reportLang });

    // Counterpart anchors (§5): mapped by position from the source target's outline to this language's, once
    // every page of both languages has rendered. Unmappable: the anchor is dropped, warning `translation.anchor`.
    for (const [pageId, raw] of Object.entries(byLang[lang].counterparts)) {
      const page = byLang[lang].pages[pageId];
      if (!page?.counterpart?.anchor) continue;
      const targetId = page.counterpart.id;
      const sourceToc = data.pages[targetId]?.toc;
      const targetToc = byLang[lang].pages[targetId]?.toc;
      const i = sourceToc ? sourceToc.findIndex((h) => h.id === page.counterpart.anchor) : -1;
      const mapped = i >= 0 && targetToc && targetToc.length === sourceToc.length ? targetToc[i]?.id : null;
      if (mapped) page.counterpart.anchor = mapped;
      else {
        delete page.counterpart.anchor;
        report(false, { kind: "translation", key: "translation.anchor", vars: { lang, page: pageId } });
      }
    }
  }

  // ─── Embedded images (once each; a language variant only for the ids that language uses, and only when a
  // file exists for it; its name may itself differ, taken from that language's own zone file when it has one) ──
  const imageFile = (id, lang) => {
    const file = (lang ? capturesByLang[lang]?.[id] : sourceCaptures[id])?.file;
    if (!file) return null;
    const f = path.join(root, images, ...(lang ? [lang] : []), file);
    return fs.existsSync(f) ? f : null;
  };
  const imageBlock = (id, lang) => {
    const f = imageFile(id, lang);
    if (!f) return "";
    const type = IMAGE_TYPES[path.extname(f).slice(1).toLowerCase()] || "image/webp";
    return `<script type="text/plain" id="img-${esc(id)}${lang ? "@" + esc(lang) : ""}">data:${type};base64,${fs.readFileSync(f).toString("base64")}</script>`;
  };
  const allUsedCaptures = new Set(Object.values(byLang).flatMap((b) => [...b.engine.usedCaptures]));

  // ─── Assembly ──────────────────────────────────────────────────────────────
  const monoLang = options.lang || null;
  const monoData = monoLang
    ? (() => {
        const d = structuredClone(byLang[monoLang].data);
        delete d.meta.languages;
        delete d.meta.language;
        return d;
      })()
    : null;
  const mainData = monoLang ? monoData : data;
  const stats = mainData.meta.stats;
  const generator = generatorTag();
  const brand = resolveTokens(themeTokens(config.theme, "light")).brand;
  const template = fs.readFileSync(path.join(siteDir, "template.html"), "utf8");
  const app = fs.readFileSync(path.join(siteDir, "app.js"), "utf8");
  const style = fs.readFileSync(path.join(siteDir, "style.css"), "utf8");
  const langTOf = (lang) => createI18n({ language: lang, overrides: config.texts });
  const mainT = monoLang ? langTOf(monoLang).t : t;
  const mainCaptures = monoLang ? capturesByLang[monoLang] : sourceCaptures;
  /** One HTML file: the template filled with the data of a site, its other languages and its images. */
  const assembleSite = (siteData, imageIds, otherLanguages = []) =>
    assemble({
      template,
      app,
      markers: {
        TITLE: esc(mainData.meta.titre),
        PRODUCT: esc(config.product.name),
        LANG: esc(monoLang || config.language),
        GENERATOR: esc(generator),
        THEME_KEY: config.theme.key,
        TOKENS: tokenStylesheet(config.theme),
        STYLE: style,
        LOGO: logo.inline,
        FAVICON: esc(logo.favicon(brand)),
        VERSION: esc(version),
        IMAGES: imageIds.flatMap((id) => [imageBlock(id), ...otherLanguages.map((l) => imageBlock(id, l.id))].filter(Boolean)).join("\n"),
      },
      t: mainT,
      icon,
      data: siteData,
      themeKey: config.theme.key,
      textVars: { product: config.product.name, version },
      captures: mainCaptures,
      languages: otherLanguages,
    });

  let html;
  const sites = [];
  const languagesSummary = languages
    ? languages.map((id, i) => (i === 0 ? { id, source: true, current: 0, stale: 0, unmarked: 0, missing: 0 } : { id, source: false, ...languageCounts({ root, config, toc, lang: id }) }))
    : [];

  if (monoLang) {
    const used = [...byLang[monoLang].engine.usedCaptures];
    html = assembleSite(monoData, used);
    if (spaces && (config.spaces.export !== false || options.space))
      for (const s of spaces) {
        if (options.space && s.id !== options.space) continue;
        const x = exportSite({ data: monoData, space: s.id, used: byLang[monoLang].used, t: mainT });
        const siteHtml = assembleSite(x.data, used.filter((id) => x.images.has(id)));
        const siteStats = x.data.meta.stats;
        const siteOutput = options.space && options.spaceOutput ? path.resolve(root, options.spaceOutput) : spaceOutput(root, config, s.id, output);
        sites.push({ space: s.id, html: siteHtml, data: x.data, stats: { ...siteStats, diagrams: siteStats.schemas, bytes: Buffer.byteLength(siteHtml) }, output: siteOutput, excludedLinks: x.excludedLinks });
        if (x.excludedLinks) warnings.push({ kind: "space", key: "space.excludedLinks", vars: { space: s.id, n: x.excludedLinks } });
      }
  } else {
    const otherLanguages = toRender.map((lang) => ({ id: lang, data: byLang[lang].data, captures: capturesByLang[lang] }));
    html = assembleSite(data, [...allUsedCaptures], otherLanguages);
    if (spaces && (config.spaces.export !== false || options.space))
      for (const s of spaces) {
        if (options.space && s.id !== options.space) continue;
        const x = exportSite({ data, space: s.id, used: sourcePass.used, t });
        const xLangs = otherLanguages.map((l) => {
          const xl = exportSite({ data: l.data, space: s.id, used: byLang[l.id].used, t: langTOf(l.id).t });
          return { id: l.id, data: xl.data, captures: l.captures, images: xl.images };
        });
        const kept = new Set(x.images);
        for (const xl of xLangs) for (const id of xl.images) kept.add(id);
        const siteHtml = assembleSite(x.data, [...allUsedCaptures].filter((id) => kept.has(id)), xLangs);
        const siteStats = x.data.meta.stats;
        const siteOutput = options.space && options.spaceOutput ? path.resolve(root, options.spaceOutput) : spaceOutput(root, config, s.id, output);
        sites.push({ space: s.id, html: siteHtml, data: x.data, stats: { ...siteStats, diagrams: siteStats.schemas, bytes: Buffer.byteLength(siteHtml) }, output: siteOutput, excludedLinks: x.excludedLinks });
        if (x.excludedLinks) warnings.push({ kind: "space", key: "space.excludedLinks", vars: { space: s.id, n: x.excludedLinks } });
      }
  }

  return { html, data: mainData, stats: { ...stats, diagrams: stats.schemas, bytes: Buffer.byteLength(html) }, errors, warnings, output, sites, languages: languagesSummary };
}
