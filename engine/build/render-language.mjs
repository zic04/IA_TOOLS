// One language's site data (ARCHITECTURE.md §6.12), for `build` (build.mjs): the source, or a declared
// translation. Every language reuses the SAME table-of-contents traversal: `langToc` already carries that
// language's texts, merged onto the source's structure by `translatedToc` (identical ids and order, guaranteed).
// Mutates nothing shared but the build context's problem lists; problems go through `reportLang` (the build's
// `report`, with `vars.lang` added for every language but the source).
import { createMarkdownEngine } from "./markdown.mjs";
import { indexPage } from "./search.mjs";
import { checkPage } from "../core/page-templates.mjs";
import { escapeRegex } from "../core/text.mjs";
import { checkLinks } from "../check/links.mjs";
import { EMBEDDED_NAMESPACES } from "../i18n.mjs";
import { resolveSpaces, counterpartOf, withoutSpaceTexts } from "./spaces.mjs";
import { buildFeatureRegistry, resolveBusinessRefs, hasTechnicalProof, BUSINESS_TYPES } from "./business.mjs";
import { withoutLanguageTexts } from "./languages.mjs";
import { translationState, readSources } from "../core/translations.mjs";
import { generatorTag } from "../brand.mjs";
import { engineReadersFor } from "./build-context.mjs";

export const HOME_FILES = ["home.md", "accueil.md"];

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
 * @param {object} b      the build context (build-context.mjs)
 * @param {object} site   what every language shares: usage, changes, icons (ICONS, icon, iconKey), spaces,
 *   syncRef, templates, version, sourceLangId, recordedByLang (lang → recorded fingerprints, filled on demand)
 * @param {object} lang   lang, isSource, langToc, langGlossary, langCaptures, langT, langI18n, reportLang
 * @returns {{ data: object, used: object, engine: object, counterparts: object, pages: object }}
 */
export function renderLanguage(
  b,
  site,
  { lang, isSource, langToc, langGlossary, langCaptures, langT, langI18n, reportLang },
) {
  const { features, problems: featureProblems } = buildFeatureRegistry({ toc: langToc });
  if (isSource)
    for (const { strict, ...problem } of featureProblems) b.report(strict, { kind: "business", ...problem });

  const { images, diagrams, facts, translations } = b.paths;
  const readers = isSource ? { exists: b.existsFs, read: b.readFs } : engineReadersFor(b, lang);
  const engine = createMarkdownEngine({
    captures: langCaptures,
    exists: readers.exists,
    read: readers.read,
    report: reportLang,
    t: langT,
    icon: site.icon,
    statuses: b.config.statuses,
    paths: { images, diagrams, facts },
    usage: site.usage,
    changes: site.changes,
    llm: b.config.llm,
    locale: lang,
  });

  /** The state of this language's pass, shared by the steps below. */
  const r = {
    b,
    site,
    lang,
    isSource,
    langT,
    reportLang,
    engine,
    pages: {},
    order: [],
    index: [],
    links: {},
    unwritten: new Set(),
    used: { pages: {}, intros: {}, home: null },
    counterparts: {},
    recorded: isSource ? {} : (site.recordedByLang[lang] ??= readSources(b.root, translations, lang)),
  };

  const sections = langToc.sections.map((sec) => renderSection(r, sec));
  const home = renderHome(r);
  checkLanguage(r, { langToc, features });

  const stats = {
    pages: r.order.length,
    captures: engine.usedCaptures.size,
    zones: engine.zoneCount,
    diagrams: engine.usedDiagrams.size,
  };
  const data = languageData(r, { langToc, langGlossary, langI18n, sections, home, stats });
  return { data, used: r.used, engine, counterparts: r.counterparts, pages: r.pages };
}

/**
 * The translated document at `rel` (relative to content/): fallback to the source when missing/absent, with the
 * strict/draft report and the `fallback` flag the site shows a banner for. `sourceMissing`: the page/intro/home
 * itself has no SOURCE file either (ARCHITECTURE.md §6.12: nothing to report, nothing to translate — the
 * placeholder is the only content, in this language).
 */
function resolveDoc(r, rel, sourceText, sourceMissing) {
  if (r.isSource || sourceMissing) return { text: sourceText, fallback: null };
  const abs = `${r.b.paths.translations}/${r.lang}/${rel}`;
  if (!r.b.existsFs(abs)) {
    r.reportLang(true, { kind: "translation", key: "translation.missing", vars: { file: rel } });
    return { text: sourceText, fallback: r.site.sourceLangId };
  }
  const text = r.b.readFs(abs);
  const state = translationState({ sourceText, translatedExists: true, recorded: r.recorded[rel] });
  if (state === "stale") r.reportLang(false, { kind: "translation", key: "translation.stale", vars: { file: rel } });
  return { text, fallback: null };
}

/** One section of the table of contents: its pages, then its introduction (`<section>/index.md`). */
function renderSection(r, sec) {
  const { b, site } = r;
  if (r.isSource && sec.icon && !(site.iconKey(sec.icon) in site.ICONS))
    b.warnings.push({ kind: "toc", key: "toc.icon", vars: { section: sec.id, icon: sec.icon } });
  const groups = sec.groups.map((g) => ({ title: g.title || "", pages: g.pages.map((p) => renderPage(r, sec, g, p)) }));
  const introRel = `${sec.id}/index.md`;
  let introRender = null;
  let introFallback = null;
  if (b.existsFs(`${b.paths.content}/${introRel}`)) {
    const { text, fallback } = resolveDoc(r, introRel, b.readFs(`${b.paths.content}/${introRel}`), false);
    introFallback = fallback;
    introRender = r.engine.render(text, sec.id);
    r.used.intros[sec.id] = introRender.used;
  }
  return {
    id: sec.id,
    title: sec.title,
    shortTitle: sec.shortTitle,
    subtitle: sec.subtitle,
    icon: sec.icon === undefined ? undefined : site.iconKey(sec.icon),
    featured: !!sec.featured,
    highlights: sec.highlights || [],
    introHtml: introRender ? introRender.html : "",
    groups,
    ...(site.spaces ? { space: sec.space } : {}),
    ...(introFallback ? { fallback: introFallback } : {}),
  };
}

/** One page: rendered, indexed for the search, checked against its template; returns its id. */
function renderPage(r, sec, g, p) {
  const { b, site, langT } = r;
  const rel = p.file || `${p.id}.md`;
  const file = `${b.paths.content}/${rel}`;
  let sourceText;
  const missing = !b.existsFs(file);
  if (!missing) sourceText = b.readFs(file);
  else {
    if (r.isSource) {
      r.unwritten.add(p.id);
      b.report(true, { kind: "page", key: "page.missing", vars: { page: p.id, file } });
    }
    sourceText = `> [!NOTE] ${langT("render.draftPage.title")}\n> ${langT("render.draftPage.text")}\n`;
  }
  const { text: source, fallback } = resolveDoc(r, rel, sourceText, missing);
  if (r.isSource && r.pages[p.id]) b.warnings.push({ kind: "toc", key: "toc.duplicate", vars: { page: p.id } });
  const out = r.engine.render(source, p.id);
  const verified = site.syncRef?.pages?.[p.id];
  r.pages[p.id] = {
    id: p.id,
    title: p.title,
    menuTitle: p.menuTitle,
    summary: p.summary || "",
    section: sec.id,
    group: g.title || "",
    level: p.level || 1,
    routes: p.routes || [],
    permissions: p.permissions || [],
    html: out.html,
    toc: out.toc,
    captures: out.captures,
    ...(site.spaces ? { space: p.space ?? sec.space } : {}),
    ...(p.counterpart ? { counterpart: counterpartOf(p.counterpart) } : {}),
    ...(verified ? { verified: { version: verified.version, date: verified.verified } } : {}),
    ...(fallback ? { fallback } : {}),
  };
  if (p.counterpart) r.counterparts[p.id] = p.counterpart;
  r.used.pages[p.id] = out.used;
  r.links[p.id] = out.links;
  r.order.push(p.id);
  indexPage(r.index, p.id, p.title, out.html);
  const headings = out.toc.filter((x) => x.level === 2).map((x) => x.title);
  if (!missing)
    for (const { strict, ...problem } of checkPage({
      pageId: p.id,
      template: p.template,
      headings,
      source,
      templates: site.templates,
      language: r.lang,
    }))
      r.reportLang(strict, { kind: "template", ...problem });
  if (
    !missing &&
    site.spaces &&
    (p.space ?? sec.space) === "business" &&
    BUSINESS_TYPES.includes(p.template) &&
    hasTechnicalProof(source)
  )
    r.reportLang(false, { kind: "business", key: "business.technical", vars: { page: p.id } });
  return p.id;
}

/** The home page (`home.md`, or the legacy `accueil.md`): { html, fallback }. */
function renderHome(r) {
  const { b } = r;
  const content = b.paths.content;
  const homeFile = HOME_FILES.map((f) => `${content}/${f}`).find(b.existsFs);
  if (r.isSource && homeFile && homeFile.endsWith(HOME_FILES[1])) b.legacyFiles.push(homeFile);
  if (!homeFile) return { html: "", fallback: null };
  const homeRel = HOME_FILES.find((f) => b.existsFs(`${content}/${f}`)) || HOME_FILES[0];
  const { text, fallback } = resolveDoc(r, homeRel, b.readFs(homeFile), false);
  const out = r.engine.render(text, "accueil");
  r.used.home = out.used;
  return { html: out.html, fallback };
}

/**
 * Checks once every page has rendered. Internal links: target page and anchor exist; journey steps exist.
 * Counterparts: checked once, on the source (the declared anchor is always a source slug, §6.12); mapped by
 * position for the other languages by the caller (the counterpart's target may come later in the table of
 * contents). Then the business references, the empty spaces and the legacy files read.
 */
function checkLanguage(r, { langToc, features }) {
  const { b, site, isSource } = r;
  const { pages, links, counterparts, unwritten, order } = r;
  for (const problem of checkLinks({
    pages,
    links,
    sections: langToc.sections.map((s) => s.id),
    journeys: langToc.journeys || [],
    counterparts: isSource ? counterparts : {},
    unwritten,
  }))
    r.reportLang(true, problem);
  const { problems: businessRefProblems } = resolveBusinessRefs({ pages, features, rules: r.engine.rules, t: r.langT });
  for (const { strict, ...problem } of businessRefProblems) r.reportLang(strict, { kind: "business", ...problem });
  if (isSource && site.spaces) {
    for (const s of site.spaces) s.pages = order.filter((id) => pages[id].space === s.id).length;
    for (const s of site.spaces.filter((x) => !x.pages))
      b.warnings.push({ kind: "space", key: "space.empty", vars: { space: s.id } });
  }
  if (isSource && b.legacyFiles.length)
    b.warnings.push({ kind: "legacy", key: "legacy.read", vars: { files: b.legacyFiles.join(", ") } });
}

/** The data object embedded in the site (#site-data), with the key names of toc.json (see build.mjs). */
function languageData(r, { langToc, langGlossary, langI18n, sections, home, stats }) {
  const { b, site, lang, langT } = r;
  const { config, languages } = b;
  const { spaces } = site;
  const spaced = !!spaces || Object.keys(r.counterparts).length > 0;
  const prefixes = languages ? [...EMBEDDED_NAMESPACES, "template."] : EMBEDDED_NAMESPACES;
  let embedded = langI18n.subset(prefixes);
  if (!spaced) embedded = withoutSpaceTexts(embedded);
  if (!languages) embedded = withoutLanguageTexts(embedded);

  const siteSpaces = spaces
    ? resolveSpaces({ toc: langToc, t: langT, iconKey: site.iconKey }).spaces.map((s, i) => ({
        ...s,
        pages: spaces[i]?.pages ?? s.pages,
      }))
    : null;

  return {
    meta: {
      title: langToc.title,
      product: config.product.name,
      tagline: langToc.tagline,
      version: site.version,
      date: siteDate(b.options.date, langI18n),
      stats,
      generator: generatorTag(),
      ...(config.feedback
        ? { feedback: { label: config.feedback.label || langT("ui.feedback"), url: config.feedback.url } }
        : {}),
      ...(languages ? { languages, language: lang } : {}),
      ...(home.fallback ? { homeFallback: home.fallback } : {}),
    },
    ...(siteSpaces ? { spaces: siteSpaces } : {}),
    icons: site.ICONS,
    sections,
    pages: r.pages,
    order: r.order,
    search: r.index,
    glossary: langGlossary.map((g) => ({
      term: g.term,
      def: g.def,
      pattern: g.pattern || escapeRegex(g.term),
      ...(g.technical ? { tech: g.technical } : {}),
    })),
    journeys: (langToc.journeys || []).map((j) => ({
      title: j.title,
      desc: j.description,
      steps: j.steps,
      ...(spaces ? { space: j.space ?? r.pages[j.steps[0]]?.space ?? null } : {}),
    })),
    suggestions: langToc.suggestions || [],
    homeHtml: home.html,
    i18n: embedded,
  };
}
