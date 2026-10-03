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
// The data embedded in the site (#site-data) uses the key names of toc.json (title, order, journeys…); the older
// engine's French names (titre, ordre, parcours…) are translated by test/tools/legacy-data.mjs, so that
// equivalence level 1 can still compare a build with that engine. The data
// of the spaces (spaces, space, counterpart…) and of the languages (meta.languages, meta.language, fallback…) is
// only emitted when declared: without them, the output is unchanged (§9).
import fs from "node:fs";
import path from "node:path";
import { assemble } from "./assemble.mjs";
import { loadPageTemplates } from "../core/page-templates.mjs";
import { esc, escapeRegex } from "../core/text.mjs";
import { createI18n } from "../i18n.mjs";
import { resolveSpaces, exportSite, spaceOutput } from "./spaces.mjs";
import { translatedToc, translatedGlossary, languageOutput, checkIdClash, languageCounts } from "./languages.mjs";
import { createIcons } from "../site/icons.mjs";
import { loadLogo } from "../theme/logo.mjs";
import { tokenStylesheet, themeTokens } from "../theme/tokens.mjs";
import { resolve as resolveTokens } from "../theme/contrast.mjs";
import { validate, closest } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { normalizeToc, normalizeGlossary, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { generatorTag } from "../brand.mjs";
import { readProjectVersion } from "../project/version.mjs";
import { readSyncReference } from "../sync/reference.mjs";
import { readUsage, USAGE_DIR } from "../stats/usage.mjs";
import { readChanges } from "../facts/changes.mjs";
import { createBuildContext, readZoneFolder, readTranslatedJson } from "./build-context.mjs";
import { renderLanguage, siteDate, HOME_FILES } from "./render-language.mjs";

export { siteDate, HOME_FILES };
export const SITE_DIR = path.join(KIT_ROOT, "engine", "site");
const IMAGE_TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

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
  const b = createBuildContext({ project, config, options });
  const { root, errors, warnings, report, languages } = b;
  const outputRel = options.output || (options.lang ? languageOutput(config.output, options.lang) : config.output);
  const output = path.resolve(root, outputRel);
  const fail = () => ({ html: null, data: null, stats: null, errors, warnings, output, sites: [], languages: [] });
  // Production statistics (ARCHITECTURE.md §6.14), for ::usage, and the recorded changes of the application
  // (doc-kit changes --record), for ::changes: read once, whatever the language.
  const usage = readUsage(path.join(root, USAGE_DIR));
  const changes = readChanges(root);

  // ─── Texts, icons, logo (source language) ───────────────────────────────────
  const i18n = createI18n({ language: config.language, overrides: config.texts });
  checkTexts(b);
  const { ICONS, icon, key: iconKey } = createIcons(config.theme.icons);
  const { logo, problem: logoProblem } = loadLogo(root, config.theme.logo);
  if (logoProblem) report(true, { kind: "theme", ...logoProblem });

  // ─── Outline: table of contents, languages, spaces — any problem here prevents any build, even a draft one ──
  const toc = loadToc(b);
  if (!toc) return fail();
  // Languages (§6.12): a section id, or the first segment of a page id, equal to a declared language.
  const clashes = languages ? checkIdClash({ toc, languages }) : [];
  if (clashes.length) {
    errors.push(...clashes);
    return fail();
  }
  // Spaces (§6.1a): a wrong declaration.
  const { spaces, errors: spaceErrors } = resolveSpaces({ toc, t: i18n.t, iconKey });
  if (spaceErrors.length) {
    errors.push(...spaceErrors);
    return fail();
  }

  // Sync reference (ARCHITECTURE.md §6.10): which pages were marked as checked, and against which version —
  // common to every language (translations are never read by sync).
  const version = readProjectVersion(root, config.version);
  const templates = loadPageTemplates(KIT_ROOT);
  const { reference: syncRef, problem: syncProblem } = readSyncReference(root, config);
  if (syncProblem) report(false, { kind: "sync", ...syncProblem });
  const site = {
    usage,
    changes,
    ICONS,
    icon,
    iconKey,
    spaces,
    syncRef,
    templates,
    version,
    sourceLangId: languages ? languages[0] : null,
    recordedByLang: {},
  };

  // ─── Source language, then the other declared languages (§6.12) ─────────────
  const { glossary, glossaryFile } = loadGlossary(b);
  const sourceCaptures = loadSourceZones(b);
  const sourcePass = renderLanguage(b, site, {
    lang: config.language,
    isSource: true,
    langToc: toc,
    langGlossary: glossary,
    langCaptures: sourceCaptures,
    langT: i18n.t,
    langI18n: i18n,
    reportLang: report,
  });
  const { byLang, capturesByLang, toRender } = renderTranslations(b, site, {
    toc,
    glossary,
    glossaryFile,
    sourceCaptures,
    sourcePass,
  });

  // ─── Assembly ──────────────────────────────────────────────────────────────
  return assembleOutputs(b, {
    i18n,
    logo,
    icon,
    version,
    spaces,
    toc,
    sourcePass,
    sourceCaptures,
    byLang,
    capturesByLang,
    toRender,
    output,
  });
}

/** `texts` keys the kit does not know: a warning each, with the closest known key. */
function checkTexts(b) {
  const reference = createI18n({ language: "en" });
  for (const key of Object.keys(b.config.texts))
    if (!reference.has(key))
      b.warnings.push({
        kind: "texts",
        key: "texts.unknown",
        vars: { key, closest: closest(key, Object.keys(reference.keys)) || "—" },
      });
}

/** The source table of contents (current or legacy file name), normalised and valid; null after an error. */
function loadToc(b) {
  const { content } = b.paths;
  const tocFile = [CURRENT_FILES.toc, LEGACY_FILES.toc].map((f) => `${content}/${f}`).find(b.existsFs);
  if (!tocFile) {
    b.errors.push({ kind: "toc", key: "toc.missing", vars: { file: `${content}/${CURRENT_FILES.toc}` } });
    return null;
  }
  const rawToc = b.readJson(tocFile);
  if (rawToc === undefined) {
    if (b.draft) b.errors.push(b.warnings.pop());
    return null;
  }
  const nt = normalizeToc(rawToc);
  if (nt.legacy) b.legacyFiles.push(tocFile);
  const toc = nt.value;
  const vt = validate(toc, readSchema("toc"));
  if (vt.errors.length) {
    for (const e of vt.errors)
      b.errors.push({ kind: "validate", key: e.key, vars: e.vars, file: tocFile, path: e.path });
    return null;
  }
  if (toc.product && toc.product !== b.config.product.name)
    b.warnings.push({
      kind: "toc",
      key: "toc.productDeprecated",
      vars: { toc: toc.product, config: b.config.product.name },
    });
  return toc;
}

/** The source glossary (current or legacy file name), its patterns checked: { glossary, glossaryFile }. */
function loadGlossary(b) {
  const { content } = b.paths;
  const glossaryFile = [CURRENT_FILES.glossary, LEGACY_FILES.glossary].map((f) => `${content}/${f}`).find(b.existsFs);
  let glossary = [];
  if (glossaryFile) {
    const raw = b.readJson(glossaryFile);
    if (raw !== undefined) {
      const ng = normalizeGlossary(raw);
      if (ng.legacy) b.legacyFiles.push(glossaryFile);
      if (b.validateContent(ng.value, "glossary", glossaryFile)) glossary = ng.value;
    }
  }
  for (const g of glossary) {
    try {
      new RegExp(`(${g.pattern || escapeRegex(g.term)})`, "iu");
    } catch (e) {
      b.report(true, { kind: "glossary", key: "glossary.pattern", vars: { term: g.term, error: e.message } });
    }
  }
  return { glossary, glossaryFile };
}

/** The source zone files (`<images>/zones/*.json`): { id: zones }. */
function loadSourceZones(b) {
  const zonesDir = `${b.paths.images}/zones`;
  const { captures, legacy } = readZoneFolder(b, zonesDir);
  if (legacy) b.legacyFiles.push(`${zonesDir}/*.json (${legacy})`);
  return captures;
}

/**
 * The declared languages other than the source. With options.lang: only that one (the others are summarised
 * from disk alone, languageCounts — rendering an unrelated language's draft issues must never block this one).
 */
function renderTranslations(b, site, { toc, glossary, glossaryFile, sourceCaptures, sourcePass }) {
  const { config, options, languages, errors, warnings, report } = b;
  const byLang = { [config.language]: sourcePass };
  const capturesByLang = { [config.language]: sourceCaptures };
  const toRender = languages ? (options.lang ? [options.lang] : languages.slice(1)) : [];
  for (const lang of toRender) {
    const rawToc = readTranslatedJson(b, lang, CURRENT_FILES.toc);
    const translatedTocRaw = rawToc ? normalizeToc(rawToc).value : null;
    const { toc: langToc, problems: tocProblems } = translatedToc({ source: toc, translated: translatedTocRaw });
    // A structural mismatch is blocking even with --draft (like an invalid outline, ARCHITECTURE.md §6.12); a
    // non-text field the translation changed ("ignored") is only ever informative.
    for (const p of tocProblems) {
      const problem = { kind: "translation", key: p.key, vars: { lang, ...p.vars } };
      if (p.blocking) errors.push(problem);
      else warnings.push(problem);
    }
    if (!translatedTocRaw)
      report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: "toc.json" } });

    const rawGlossary = readTranslatedJson(b, lang, CURRENT_FILES.glossary);
    const translatedGlossaryRaw = rawGlossary ? normalizeGlossary(rawGlossary).value : null;
    let langGlossary = glossary;
    if (translatedGlossaryRaw) {
      const { glossary: merged, problem } = translatedGlossary({ source: glossary, translated: translatedGlossaryRaw });
      langGlossary = merged;
      if (problem)
        report(true, { kind: "translation", key: "translation.glossary.structure", vars: { lang, ...problem } });
    } else if (glossaryFile)
      report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: CURRENT_FILES.glossary } });

    const langCaptures = { ...sourceCaptures, ...readZoneFolder(b, `${b.paths.images}/${lang}/zones`).captures };
    capturesByLang[lang] = langCaptures;
    const langI18n = createI18n({ language: lang, overrides: config.texts });
    const reportLang = (strict, s) => report(strict, { ...s, vars: { ...s.vars, lang } });
    byLang[lang] = renderLanguage(b, site, {
      lang,
      isSource: false,
      langToc,
      langGlossary,
      langCaptures,
      langT: langI18n.t,
      langI18n,
      reportLang,
    });
    mapCounterpartAnchors(b, lang, byLang[lang], sourcePass.data);
  }
  return { byLang, capturesByLang, toRender };
}

/**
 * Counterpart anchors (§5): mapped by position from the source target's outline to this language's, once every
 * page of both languages has rendered. Unmappable: the anchor is dropped, warning `translation.anchor`.
 */
function mapCounterpartAnchors(b, lang, pass, sourceData) {
  for (const pageId of Object.keys(pass.counterparts)) {
    const page = pass.pages[pageId];
    if (!page?.counterpart?.anchor) continue;
    const targetId = page.counterpart.id;
    const sourceToc = sourceData.pages[targetId]?.toc;
    const targetToc = pass.pages[targetId]?.toc;
    const i = sourceToc ? sourceToc.findIndex((h) => h.id === page.counterpart.anchor) : -1;
    const mapped = i >= 0 && targetToc && targetToc.length === sourceToc.length ? targetToc[i]?.id : null;
    if (mapped) page.counterpart.anchor = mapped;
    else {
      delete page.counterpart.anchor;
      b.report(false, { kind: "translation", key: "translation.anchor", vars: { lang, page: pageId } });
    }
  }
}

/**
 * The HTML files: the main one (every language, or options.lang alone), then one per space export. Images are
 * embedded once each; a language variant only for the ids that language uses, and only when a file exists for
 * it (its name may itself differ, taken from that language's own zone file when it has one).
 */
function assembleOutputs(
  b,
  { i18n, logo, icon, version, spaces, toc, sourcePass, sourceCaptures, byLang, capturesByLang, toRender, output },
) {
  const { root, config, options, languages, warnings } = b;
  const imageFile = (id, lang) => {
    const file = (lang ? capturesByLang[lang]?.[id] : sourceCaptures[id])?.file;
    if (!file) return null;
    const f = path.join(root, b.paths.images, ...(lang ? [lang] : []), file);
    return fs.existsSync(f) ? f : null;
  };
  const imageBlock = (id, lang) => {
    const f = imageFile(id, lang);
    if (!f) return "";
    const type = IMAGE_TYPES[path.extname(f).slice(1).toLowerCase()] || "image/webp";
    return `<script type="text/plain" id="img-${esc(id)}${lang ? "@" + esc(lang) : ""}">data:${type};base64,${fs.readFileSync(f).toString("base64")}</script>`;
  };
  const allUsedCaptures = new Set(Object.values(byLang).flatMap((x) => [...x.engine.usedCaptures]));

  const monoLang = options.lang || null;
  const monoData = monoLang ? withoutLanguageMeta(byLang[monoLang].data) : null;
  const mainData = monoLang ? monoData : sourcePass.data;
  const stats = mainData.meta.stats;
  const generator = generatorTag();
  const brand = resolveTokens(themeTokens(config.theme, "light")).brand;
  const siteDir = options.siteDir || SITE_DIR;
  const template = fs.readFileSync(path.join(siteDir, "template.html"), "utf8");
  const app = fs.readFileSync(path.join(siteDir, "app.js"), "utf8");
  const style = fs.readFileSync(path.join(siteDir, "style.css"), "utf8");
  const langTOf = (lang) => createI18n({ language: lang, overrides: config.texts });
  const mainT = monoLang ? langTOf(monoLang).t : i18n.t;
  const mainCaptures = monoLang ? capturesByLang[monoLang] : sourceCaptures;
  /** One HTML file: the template filled with the data of a site, its other languages and its images. */
  const assembleSite = (siteData, imageIds, otherLanguages = []) =>
    assemble({
      template,
      app,
      markers: {
        TITLE: esc(mainData.meta.title),
        PRODUCT: esc(config.product.name),
        LANG: esc(monoLang || config.language),
        GENERATOR: esc(generator),
        THEME_KEY: config.theme.key,
        TOKENS: tokenStylesheet(config.theme),
        STYLE: style,
        LOGO: logo.inline,
        FAVICON: esc(logo.favicon(brand)),
        VERSION: esc(version),
        IMAGES: imageIds
          .flatMap((id) => [imageBlock(id), ...otherLanguages.map((l) => imageBlock(id, l.id))].filter(Boolean))
          .join("\n"),
      },
      t: mainT,
      icon,
      data: siteData,
      themeKey: config.theme.key,
      textVars: { product: config.product.name, version },
      captures: mainCaptures,
      languages: otherLanguages,
    });

  const languagesSummary = languages
    ? languages.map((id, i) =>
        i === 0
          ? { id, source: true, current: 0, stale: 0, unmarked: 0, missing: 0 }
          : { id, source: false, ...languageCounts({ root, config, toc, lang: id }) },
      )
    : [];
  // Mono-language: that language's data alone, no other language embedded.
  const main = monoLang
    ? {
        data: monoData,
        used: byLang[monoLang].used,
        t: mainT,
        imageIds: [...byLang[monoLang].engine.usedCaptures],
        otherLanguages: [],
      }
    : {
        data: sourcePass.data,
        used: sourcePass.used,
        t: i18n.t,
        imageIds: [...allUsedCaptures],
        otherLanguages: toRender.map((lang) => ({ id: lang, data: byLang[lang].data, captures: capturesByLang[lang] })),
      };
  const html = assembleSite(main.data, main.imageIds, main.otherLanguages);
  const sites =
    spaces && (config.spaces.export !== false || options.space)
      ? exportSpaces(b, { spaces, main, byLang, langTOf, assembleSite, output })
      : [];
  return {
    html,
    data: mainData,
    stats: { ...stats, bytes: Buffer.byteLength(html) },
    errors: b.errors,
    warnings,
    output,
    sites,
    languages: languagesSummary,
  };
}

/** A copy of a language's data without the language switcher's meta (a mono-language file). */
function withoutLanguageMeta(data) {
  const d = structuredClone(data);
  delete d.meta.languages;
  delete d.meta.language;
  return d;
}

/** One export per declared space (§6.1a), or options.space alone; its images are those its pages use. */
function exportSpaces(b, { spaces, main, byLang, langTOf, assembleSite, output }) {
  const { root, config, options, warnings } = b;
  const sites = [];
  for (const s of spaces) {
    if (options.space && s.id !== options.space) continue;
    const x = exportSite({ data: main.data, space: s.id, used: main.used, t: main.t });
    const xLangs = main.otherLanguages.map((l) => {
      const xl = exportSite({ data: l.data, space: s.id, used: byLang[l.id].used, t: langTOf(l.id).t });
      return { id: l.id, data: xl.data, captures: l.captures, images: xl.images };
    });
    const kept = new Set(x.images);
    for (const xl of xLangs) for (const id of xl.images) kept.add(id);
    const siteHtml = assembleSite(
      x.data,
      main.imageIds.filter((id) => kept.has(id)),
      xLangs,
    );
    const siteStats = x.data.meta.stats;
    const siteOutput =
      options.space && options.spaceOutput
        ? path.resolve(root, options.spaceOutput)
        : spaceOutput(root, config, s.id, output);
    sites.push({
      space: s.id,
      html: siteHtml,
      data: x.data,
      stats: { ...siteStats, bytes: Buffer.byteLength(siteHtml) },
      output: siteOutput,
      excludedLinks: x.excludedLinks,
    });
    if (x.excludedLinks)
      warnings.push({ kind: "space", key: "space.excludedLinks", vars: { space: s.id, n: x.excludedLinks } });
  }
  return sites;
}
