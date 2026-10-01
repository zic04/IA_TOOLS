// Builds the documentation site as ONE self-contained HTML file. No side effect: the function reads the
// project and returns the HTML; writing the file, printing messages and the exit code are the CLI's job.
//   Inputs: <content>/ (Markdown + toc.json + glossary.json + home.md), <images>/ (WebP + zones/*.json),
//           <diagrams>/ (SVG), theme logo; the template, the style and the browser engine come from the kit.
//   Strict by default: any inconsistency (screenshot, zones, link, missing page) is an error;
//   options.draft turns them into warnings (missing pages are replaced by a "page being written" note).
//   Legacy French-keyed files (ARCHITECTURE.md §6.7) are normalised when read.
//
// The data embedded in the site (#donnees) keeps its historical key names (titre, pages, ordre…), so that
// equivalence level 1 can compare a build with the older engine; only meta.generator and i18n are added.
import fs from "node:fs";
import path from "node:path";
import { createMarkdownEngine } from "./markdown.mjs";
import { indexPage } from "./search.mjs";
import { assemble } from "./assemble.mjs";
import { loadPageTemplates, checkPage } from "./page-templates.mjs";
import { esc, escapeRegex } from "./text.mjs";
import { checkLinks } from "../check/links.mjs";
import { createI18n, EMBEDDED_NAMESPACES } from "../i18n.mjs";
import { createIcons } from "../site/icons.mjs";
import { loadLogo } from "../theme/logo.mjs";
import { tokenStylesheet, themeTokens } from "../theme/tokens.mjs";
import { resolve as resolveTokens } from "../theme/contrast.mjs";
import { validate, closest } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { normalizeToc, normalizeGlossary, normalizeZones, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { generatorTag } from "../brand.mjs";

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
 * @param {{ draft?: boolean, date?: string, output?: string, siteDir?: string }} [p.options]
 *   siteDir: alternative folder for template.html, app.js and style.css (equivalence tests of older engines).
 * @returns {{ html: string|null, data: object|null, stats: object|null, errors: object[], warnings: object[], output: string }}
 *   errors and warnings: { kind, key, vars } (text: i18n key `cli.build.<key>`);
 *   kind "validate": { kind, key, vars, file, path } (key `cli.validate.<key>`).
 */
export function build({ project, config, options = {} }) {
  const root = project.root;
  const draft = !!options.draft;
  const { content, images, diagrams } = config.paths;
  const siteDir = options.siteDir || SITE_DIR;
  const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const exists = (p) => fs.existsSync(path.join(root, p));
  const errors = [];
  const warnings = [];
  const report = (strict, s) => (strict && !draft ? errors : warnings).push(s);
  const output = path.resolve(root, options.output || config.output);
  const fail = () => ({ html: null, data: null, stats: null, errors, warnings, output });
  const readJson = (file) => {
    try {
      return JSON.parse(read(file));
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

  // ─── Texts, icons, logo ────────────────────────────────────────────────────
  const i18n = createI18n({ language: config.language, overrides: config.texts });
  const t = i18n.t;
  const reference = createI18n({ language: "en" });
  for (const key of Object.keys(config.texts))
    if (!reference.has(key))
      warnings.push({ kind: "texts", key: "texts.unknown", vars: { key, closest: closest(key, Object.keys(reference.keys)) || "—" } });
  const { ICONS, icon, key: iconKey } = createIcons(config.theme.icons);
  const { logo, problem: logoProblem } = loadLogo(root, config.theme.logo);
  if (logoProblem) report(true, { kind: "theme", ...logoProblem });

  // ─── Table of contents (current or legacy file name) ───────────────────────
  const tocFile = [CURRENT_FILES.toc, LEGACY_FILES.toc].map((f) => `${content}/${f}`).find(exists);
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

  // ─── Glossary ──────────────────────────────────────────────────────────────
  let glossary = [];
  const glossaryFile = [CURRENT_FILES.glossary, LEGACY_FILES.glossary].map((f) => `${content}/${f}`).find(exists);
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

  // ─── Screenshot metadata: <images>/zones/<id>.json ─────────────────────────
  const captures = {};
  let legacyZones = 0;
  const zonesDir = `${images}/zones`;
  for (const f of exists(zonesDir) ? fs.readdirSync(path.join(root, zonesDir)).filter((x) => x.endsWith(".json")) : []) {
    const file = `${zonesDir}/${f}`;
    const raw = readJson(file);
    if (raw === undefined) continue;
    const nz = normalizeZones(raw);
    if (nz.legacy) legacyZones++;
    if (validateContent(nz.value, "zones", file)) captures[f.slice(0, -5)] = nz.value;
  }
  if (legacyZones) legacyFiles.push(`${zonesDir}/*.json (${legacyZones})`);

  const version = readProjectVersion(root, config.version);
  const date = siteDate(options.date, i18n);

  // ─── Pages ─────────────────────────────────────────────────────────────────
  const engine = createMarkdownEngine({ captures, exists, read, report, t, icon, statuses: config.statuses, paths: { images, diagrams } });
  const templates = loadPageTemplates(KIT_ROOT);
  const pages = {};
  const order = [];
  const index = [];
  const links = {};
  const sections = [];

  for (const sec of toc.sections) {
    if (sec.icon && !(iconKey(sec.icon) in ICONS)) warnings.push({ kind: "toc", key: "toc.icon", vars: { section: sec.id, icon: sec.icon } });
    const groups = [];
    for (const g of sec.groups) {
      const ids = g.pages.map((p) => {
        const file = `${content}/${p.file || p.id + ".md"}`;
        let source;
        if (exists(file)) source = read(file);
        else {
          report(true, { kind: "page", key: "page.missing", vars: { file } });
          source = `> [!NOTE] ${t("render.draftPage.title")}\n> ${t("render.draftPage.text")}\n`;
        }
        if (pages[p.id]) warnings.push({ kind: "toc", key: "toc.duplicate", vars: { page: p.id } });
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
        };
        links[p.id] = r.links;
        order.push(p.id);
        indexPage(index, p.id, p.title, r.html);
        // Page template (page-templates.mjs): required sections of a typed page (strict), guidance left (warning).
        const headings = r.toc.filter((x) => x.niveau === 2).map((x) => x.titre);
        for (const { strict, ...problem } of checkPage({ pageId: p.id, template: p.template, headings, source, templates, language: config.language }))
          report(strict, { kind: "template", ...problem });
        return p.id;
      });
      groups.push({ titre: g.title || "", pages: ids });
    }
    const intro = `${content}/${sec.id}/index.md`;
    sections.push({
      id: sec.id,
      titre: sec.title,
      titre_court: sec.shortTitle,
      sous_titre: sec.subtitle,
      icone: sec.icon === undefined ? undefined : iconKey(sec.icon),
      vedette: !!sec.featured,
      points: sec.highlights || [],
      intro_html: exists(intro) ? engine.render(read(intro), sec.id).html : "",
      groupes: groups,
    });
  }
  const homeFile = HOME_FILES.map((f) => `${content}/${f}`).find(exists);
  if (homeFile && homeFile.endsWith(HOME_FILES[1])) legacyFiles.push(homeFile);
  const homeHtml = homeFile ? engine.render(read(homeFile), "accueil").html : "";

  // Internal links: target page and anchor exist; journey steps exist.
  for (const problem of checkLinks({ pages, links, sections: toc.sections.map((s) => s.id), journeys: toc.journeys || [] })) report(true, problem);
  if (legacyFiles.length) warnings.push({ kind: "legacy", key: "legacy.read", vars: { files: legacyFiles.join(", ") } });

  // ─── Embedded images (once each) ───────────────────────────────────────────
  const imageBlocks = [...engine.usedCaptures]
    .map((id) => {
      const f = path.join(root, images, captures[id].file);
      if (!fs.existsSync(f)) return "";
      const type = IMAGE_TYPES[path.extname(f).slice(1).toLowerCase()] || "image/webp";
      return `<script type="text/plain" id="img-${esc(id)}">data:${type};base64,${fs.readFileSync(f).toString("base64")}</script>`;
    })
    .join("\n");

  // ─── Assembly ──────────────────────────────────────────────────────────────
  const stats = { pages: order.length, captures: engine.usedCaptures.size, zones: engine.zoneCount, schemas: engine.usedDiagrams.size };
  const generator = generatorTag();
  const data = {
    meta: {
      titre: toc.title,
      produit: config.product.name,
      accroche: toc.tagline,
      version,
      date,
      stats,
      generator,
      ...(config.feedback ? { feedback: { label: config.feedback.label || t("ui.feedback"), url: config.feedback.url } } : {}),
    },
    icones: ICONS,
    sections,
    pages,
    ordre: order,
    recherche: index,
    glossaire: glossary.map((g) => ({ terme: g.term, def: g.def, motif: g.pattern || escapeRegex(g.term) })),
    parcours: (toc.journeys || []).map((j) => ({ titre: j.title, desc: j.description, etapes: j.steps })),
    suggestions: toc.suggestions || [],
    accueil_html: homeHtml,
    i18n: i18n.subset(EMBEDDED_NAMESPACES),
  };

  const brand = resolveTokens(themeTokens(config.theme, "light")).brand;
  const html = assemble({
    template: fs.readFileSync(path.join(siteDir, "template.html"), "utf8"),
    app: fs.readFileSync(path.join(siteDir, "app.js"), "utf8"),
    markers: {
      TITLE: esc(toc.title),
      PRODUCT: esc(config.product.name),
      LANG: esc(config.language),
      GENERATOR: esc(generator),
      THEME_KEY: config.theme.key,
      TOKENS: tokenStylesheet(config.theme),
      STYLE: fs.readFileSync(path.join(siteDir, "style.css"), "utf8"),
      LOGO: logo.inline,
      FAVICON: esc(logo.favicon(brand)),
      VERSION: esc(version),
      IMAGES: imageBlocks,
    },
    t,
    icon,
    data,
    themeKey: config.theme.key,
    textVars: { product: config.product.name, version },
    captures,
  });
  return { html, data, stats: { ...stats, diagrams: stats.schemas, bytes: Buffer.byteLength(html) }, errors, warnings, output };
}
