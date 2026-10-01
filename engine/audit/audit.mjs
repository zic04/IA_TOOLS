// `audit` (standard/maturity.md): the indicators, the maturity level (1 to 4) and the prioritised actions that
// lead to the next level. Reads the project and builds it IN MEMORY (strict mode, so that the errors that would
// block a build are known); writes nothing. The reports (.doc-kit/audit.md, .doc-kit/audit.json) are rendered by
// report.mjs and written by the CLI.
//
// Measures that may be unavailable (coverage adapters, browser for the table widths) are injected through
// `measure`; an unavailable measure is "not measured" and never lowers the level.
import fs from "node:fs";
import path from "node:path";
import { build, readProjectVersion, HOME_FILES } from "../build/build.mjs";
import { loadPageTemplates, analysePage, guessTemplate, closestTemplate, headingsOf, sectionLabel, sectionCount } from "../build/page-templates.mjs";
import { normalizeToc, normalizeZones, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { createI18n, LANGUAGES } from "../i18n.mjs";
import { generatorTag } from "../brand.mjs";
import { measureCoverage, measureSecrets } from "./optional.mjs";

/** Ids of the Take over section; otherwise the last section (when there are at least two). */
export const TAKEOVER_SECTION_IDS = ["take-over", "reprendre"];
/** Usual page types of the standard sections (standard/structure.md), used to guess the type of an untyped page. */
export const SECTION_TYPES = Object.freeze({
  use: ["screen"],
  utiliser: ["screen"],
  administer: ["screen"],
  administrer: ["screen"],
  configure: ["editor", "recipe"],
  configurer: ["editor", "recipe"],
});
/** Parent types whose sub-pages stay untyped (standard/templates.md, "Untyped pages"). */
const UNTYPED_UNDER = ["screen", "editor", "findings"];
const TAKEOVER_TYPES = ["technical", "journey", "journey-step", "troubleshooting", "troubleshooting-area", "findings", "architecture", "variables", "resources"];

/** An annotated screen: a `:::screen` (or `:::ecran`) block. */
export const SCREEN = /^\s{0,3}:::(?:screen|ecran)\b/m;
/** A `file:line` proof: a file name, then `:` and a number, in backticks (`lib/orders.ts:42`, `api.py:7-12`). */
export const PROOF = /`[^`\n]*?(?:[\w@./-]*[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile):\d+[^`\n]*`/;
/** A numbered finding (standard/writing.md §9): C, I, M, P, N (en) or R (fr), then a number. */
export const FINDING = /\b[CIMPNR]\d{1,3}\b/;

/** Thresholds of standard/maturity.md, by level. Ratios between 0 and 1. */
export const THRESHOLDS = Object.freeze({
  glossary1: 1,
  tours1: 1,
  written2: 0.9,
  annotated2: 0.8,
  coverage2: 0.8,
  typed3: 0.8,
  conformant3: 1,
  annotated3: 0.9,
  glossary3: 20,
  tours3: 3,
  takeover4: 7,
  proofs4: 0.6,
  completeness4: 0.7,
  tooLong4: 0.05,
  upToDate4: 0.9,
});

/** The 7 required Take over pages (standard/maturity.md). `suggest`: suggested id, after the section id. */
export const TAKEOVER_ITEMS = Object.freeze([
  { id: "architecture", match: (p) => /\/architecture$/.test(p.id), template: "technical", suggest: { en: "architecture", fr: "architecture" } },
  { id: "dat", type: "architecture", template: "architecture", hint: /\/(dat|technical-architecture)$/, suggest: { en: "technical-architecture", fr: "dat" } },
  { id: "journey", type: "journey", sub: "journey-step", min: 3, template: "journey", hint: /\/(journey|parcours)[^/]*$/, suggest: { en: "journey-<object>", fr: "parcours-<objet>" } },
  { id: "operations", match: (p) => /operations|deployment|exploitation|deploiement/.test(p.id), template: "technical", suggest: { en: "operations", fr: "exploitation" } },
  { id: "troubleshooting", type: "troubleshooting", sub: "troubleshooting-area", min: 2, template: "troubleshooting", hint: /\/(troubleshooting|diagnostic)$/, suggest: { en: "troubleshooting", fr: "diagnostic" } },
  { id: "findings", type: "findings", numbered: true, template: "findings", hint: /\/(findings|points-attention)$/, suggest: { en: "findings", fr: "points-attention" } },
  { id: "maintaining", match: (p) => /\/(maintaining-docs|maintenir-doc)$/.test(p.id), template: "technical", suggest: { en: "maintaining-docs", fr: "maintenir-doc" } },
]);

/** Effort of each kind of action (1 = minutes, 5 = real writing): orders the actions inside a level. */
const EFFORT = {
  draftBuild: 1, home: 1, guidance: 1, secrets: 2, conformant: 1, typedDeclare: 1, linksLegend: 2, blocking: 2, tours: 2, typedChoose: 3,
  glossary: 3, wideTables: 3, upToDate: 3, sectionsWritten: 4, annotated: 4, completeness: 4, tooLong: 4, written: 5,
  coverage: 5, proofs: 5, takeover: 5,
};

const ratio = (n, total) => ({ kind: "ratio", measured: true, n, total, value: total ? n / total : null });
const count = (n) => ({ kind: "count", measured: true, n, value: n });
const notMeasured = (kind, reason, error) => ({ kind, measured: false, reason, ...(error ? { error } : {}), value: null });
const need = (threshold, total, n) => Math.max(0, Math.ceil(threshold * total - 1e-9) - n);

/** Reads the table of contents (current or legacy name), normalised. */
export function readToc(root, content) {
  const rel = [CURRENT_FILES.toc, LEGACY_FILES.toc].map((f) => `${content}/${f}`).find((f) => fs.existsSync(path.join(root, f)));
  if (!rel) return { file: `${content}/${CURRENT_FILES.toc}`, toc: null };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
    const n = normalizeToc(raw);
    return { file: rel, toc: n.value, legacy: n.legacy || rel.endsWith(LEGACY_FILES.toc) };
  } catch {
    return { file: rel, toc: null };
  }
}

/** Placeholders of the page summary written by `new` (both languages): a page that still has one is unfinished. */
export const summaryPlaceholders = () => LANGUAGES.map((l) => createI18n({ language: l }).t("cli.new.summaryPlaceholder"));

/**
 * Audits a project.
 * @param {object} p
 * @param {{ root: string }} p.project
 * @param {object} p.config  validated configuration
 * @param {{ coverage?: Function|null, secrets?: Function|null, tables?: Function|null, tablesReason?: string }} [p.measure]
 *   coverage({ project, config }), secrets({ project, config, data, env }) and tables(html) return { measured, … }
 *   (optional.mjs). `null`: not measured. Default: coverage and secrets measured when the checks of the kit exist;
 *   tables not measured (they need a browser: the CLI passes them).
 * @param {Date} [p.now]
 * @param {object} [p.env]  environment (session file of the secrets check)
 */
export async function runAudit({ project, config, measure = {}, now = new Date(), env = process.env }) {
  const root = project.root;
  const language = config.language;
  const table = loadPageTemplates();
  const { content, images } = config.paths;
  const built = build({ project, config, options: {} });
  const tocInfo = readToc(root, content);
  const version = readProjectVersion(root, config.version);
  const base = { generator: generatorTag(), date: now.toISOString(), product: config.product.name, language, version, tocFile: tocInfo.file, legacyToc: !!tocInfo.legacy };

  // Without a readable table of contents nothing can be measured: level 0, fix the build first.
  if (!built.html || !tocInfo.toc || !Array.isArray(tocInfo.toc.sections)) {
    const criteria = [{ level: 1, id: "draftBuild", ok: false }];
    return { ...base, level: 0, pages: 0, indicators: {}, criteria, takeover: [], typing: [], errors: built.errors, warnings: built.warnings, actions: [{ level: 1, criterion: "draftBuild", effort: EFFORT.draftBuild, key: "draftBuild", vars: { n: built.errors.length }, items: built.errors.map(problemItem) }] };
  }
  const toc = tocInfo.toc;
  const data = built.data;

  // ─── Pages ─────────────────────────────────────────────────────────────────
  const sections = toc.sections.map((s) => s.id);
  const takeoverId = sections.find((s) => TAKEOVER_SECTION_IDS.includes(s)) ?? (sections.length > 1 ? sections.at(-1) : null);
  const placeholders = summaryPlaceholders();
  const pages = [];
  for (const sec of toc.sections)
    for (const g of sec.groups || []) {
      let parent = null;
      for (const p of g.pages || []) {
        const level = p.level === 2 ? 2 : 1;
        const file = `${content}/${p.file || p.id + ".md"}`;
        const abs = path.join(root, file);
        const written = fs.existsSync(abs);
        const source = written ? fs.readFileSync(abs, "utf8") : "";
        const rendered = data.pages[p.id]?.toc;
        const headings = rendered ? rendered.filter((x) => x.niveau === 2).map((x) => x.titre) : headingsOf(source);
        const a = analysePage({ table, type: p.template, headings, source, language });
        const page = {
          id: p.id,
          section: sec.id,
          level,
          parent: level === 2 && parent ? parent.id : null,
          template: p.template || null,
          file,
          written,
          headings,
          takeover: sec.id === takeoverId,
          words: a.words,
          maxWords: a.maxWords,
          guidance: a.guidance,
          placeholder: placeholders.includes(p.summary),
          screen: SCREEN.test(source),
          proof: PROOF.test(source),
          finding: FINDING.test(source),
          analysis: p.template ? a : null,
          guess: null,
          closest: null,
        };
        if (!page.template && written) {
          const parentType = level === 2 && parent ? parent.template || parent.guess?.type : null;
          // standard/templates.md, "Untyped pages": the sub-pages of a screen, an editor or the findings stay untyped.
          if (UNTYPED_UNDER.includes(parentType)) page.untyped = true;
          else {
            const prefer = sec.id === takeoverId ? TAKEOVER_TYPES : SECTION_TYPES[sec.id] || [];
            page.guess = guessTemplate({ table, headings, language, level, parent: parentType, prefer });
            if (!page.guess) page.closest = closestTemplate({ table, headings, language });
          }
        }
        if (level === 1) parent = page;
        pages.push(page);
      }
    }
  const byId = new Map(pages.map((p) => [p.id, p]));
  const subPages = (p) => {
    const i = pages.indexOf(p);
    const out = [];
    for (let j = i + 1; j < pages.length && pages[j].parent === p.id; j++) out.push(pages[j]);
    return out;
  };

  // ─── Indicators ────────────────────────────────────────────────────────────
  const total = pages.length;
  const written = pages.filter((p) => p.written);
  const outside = pages.filter((p) => !p.takeover);
  const typed = pages.filter((p) => p.template);
  const takeoverPages = pages.filter((p) => p.takeover);
  // Annotated: the screen and editor pages; while no page is typed, every page outside Take over.
  const screenPages = typed.length ? pages.filter((p) => ["screen", "editor"].includes(p.template)) : pages.filter((p) => !p.takeover);
  const completenessOf = typed.map((p) => (p.analysis?.known ? p.analysis.completeness : 0));
  const tooLong = pages.filter((p) => p.written && p.words > p.maxWords);
  const unfinished = pages.filter((p) => p.guidance > 0 || p.placeholder);

  const captures = readCaptures(root, images);
  const versioned = captures.filter((c) => c.version);
  const linkLegend = built.errors.filter((e) => e.kind === "link" || ["screen.legend", "capture.hasZones"].includes(e.key));

  const coverageFn = measure.coverage === undefined ? measureCoverage : measure.coverage;
  const coverage = coverageFn ? await coverageFn({ project, config }) : { measured: false, reason: "skipped" };
  const secretsFn = measure.secrets === undefined ? measureSecrets : measure.secrets;
  const secrets = secretsFn ? await secretsFn({ project, config, data, env }) : { measured: false, reason: "skipped" };
  const tables = measure.tables ? await measure.tables(built.html) : { measured: false, reason: measure.tablesReason || "skipped" };

  const takeover = evaluateTakeover({ pages: takeoverPages, subPages, takeoverId, table, language });
  const uncovered = coverage.measured ? coverage.total - coverage.n : 0;

  const indicators = {
    written: { ...ratio(written.length, total), outsideTakeover: ratio(outside.filter((p) => p.written).length, outside.length) },
    typed: ratio(typed.length, total),
    conformant: ratio(typed.filter((p) => p.analysis?.conformant).length, typed.length),
    completeness: { kind: "average", measured: true, total: typed.length, value: typed.length ? completenessOf.reduce((a, b) => a + b, 0) / typed.length : null },
    annotated: ratio(screenPages.filter((p) => p.screen).length, screenPages.length),
    coverage: coverage.measured ? ratio(coverage.n, coverage.total) : notMeasured("ratio", coverage.reason, coverage.error),
    proofs: ratio(takeoverPages.filter((p) => p.proof).length, takeoverPages.length),
    takeover: { kind: "ratio", measured: true, n: takeover.filter((t) => t.ok).length, total: TAKEOVER_ITEMS.length, value: takeover.filter((t) => t.ok).length / TAKEOVER_ITEMS.length },
    tooLong: ratio(tooLong.length, total),
    guidance: count(unfinished.length),
    upToDateCaptures: { ...ratio(versioned.filter((c) => c.version === version).length, versioned.length), current: version },
    glossary: count(data.glossaire.length),
    tours: count(data.parcours.length),
    blocking: { ...count(built.errors.length + uncovered + (secrets.measured ? secrets.findings.length : 0)), build: built.errors.length, coverage: uncovered, secrets: secrets.measured ? secrets.findings.length : null, ...(secrets.measured ? {} : { secretsReason: secrets.reason, secretsError: secrets.error }) },
    wideTables: tables.measured ? count(tables.problems.length) : notMeasured("count", tables.reason, tables.error),
  };

  // ─── Criteria and level ────────────────────────────────────────────────────
  const atLeast = (ind, x) => (!ind.measured ? { ok: true, measured: false } : ind.value === null ? { ok: true, na: true } : { ok: ind.value >= x - 1e-9 });
  const atMost = (ind, x) => (!ind.measured ? { ok: true, measured: false } : ind.value === null ? { ok: true, na: true } : { ok: ind.value <= x + 1e-9 });
  const emptySections = toc.sections.filter((s) => !pages.some((p) => p.section === s.id && p.written)).map((s) => s.id);
  const homeFile = HOME_FILES.map((f) => `${content}/${f}`).find((f) => fs.existsSync(path.join(root, f)));
  const T = THRESHOLDS;
  const criteria = [
    { level: 1, id: "config", ok: true },
    { level: 1, id: "draftBuild", ok: true },
    { level: 1, id: "sectionsWritten", ok: emptySections.length === 0 },
    { level: 1, id: "home", ok: !!homeFile },
    { level: 1, id: "glossary1", indicator: "glossary", threshold: T.glossary1, ...atLeast(indicators.glossary, T.glossary1) },
    { level: 1, id: "tours1", indicator: "tours", threshold: T.tours1, ...atLeast(indicators.tours, T.tours1) },
    { level: 2, id: "written2", indicator: "written", threshold: T.written2, ...atLeast(indicators.written.outsideTakeover, T.written2) },
    { level: 2, id: "annotated2", indicator: "annotated", threshold: T.annotated2, ...atLeast(indicators.annotated, T.annotated2) },
    { level: 2, id: "coverage2", indicator: "coverage", threshold: T.coverage2, ...atLeast(indicators.coverage, T.coverage2) },
    { level: 2, id: "linksLegend", ok: linkLegend.length === 0, n: linkLegend.length },
    { level: 3, id: "blocking3", indicator: "blocking", threshold: 0, ...atMost(indicators.blocking, 0) },
    { level: 3, id: "typed3", indicator: "typed", threshold: T.typed3, ...atLeast(indicators.typed, T.typed3) },
    { level: 3, id: "conformant3", indicator: "conformant", threshold: T.conformant3, ...atLeast(indicators.conformant, T.conformant3) },
    { level: 3, id: "annotated3", indicator: "annotated", threshold: T.annotated3, ...atLeast(indicators.annotated, T.annotated3) },
    { level: 3, id: "guidance3", indicator: "guidance", threshold: 0, ...atMost(indicators.guidance, 0) },
    { level: 3, id: "wideTables3", indicator: "wideTables", threshold: 0, ...atMost(indicators.wideTables, 0) },
    { level: 3, id: "glossary3", indicator: "glossary", threshold: T.glossary3, ...atLeast(indicators.glossary, T.glossary3) },
    { level: 3, id: "tours3", indicator: "tours", threshold: T.tours3, ...atLeast(indicators.tours, T.tours3) },
    { level: 4, id: "takeover4", indicator: "takeover", threshold: T.takeover4, ok: indicators.takeover.n >= T.takeover4 },
    { level: 4, id: "proofs4", indicator: "proofs", threshold: T.proofs4, ...atLeast(indicators.proofs, T.proofs4) },
    { level: 4, id: "completeness4", indicator: "completeness", threshold: T.completeness4, ...atLeast(indicators.completeness, T.completeness4) },
    { level: 4, id: "tooLong4", indicator: "tooLong", threshold: T.tooLong4, ...atMost(indicators.tooLong, T.tooLong4) },
    { level: 4, id: "upToDate4", indicator: "upToDateCaptures", threshold: T.upToDate4, ...atLeast(indicators.upToDateCaptures, T.upToDate4) },
  ];
  let level = 0;
  for (const L of [1, 2, 3, 4]) {
    if (criteria.filter((c) => c.level === L).every((c) => c.ok)) level = L;
    else break;
  }

  // ─── Actions, for every level above the one reached ────────────────────────
  const ctx = { pages, byId, subPages, indicators, built, linkLegend, coverage, secrets, tables, takeover, takeoverId, total, outside, screenPages, typed, tooLong, unfinished, captures, versioned, version, emptySections, content, tocInfo, table, language, takeoverPages };
  const actions = [];
  for (const c of criteria) {
    if (c.ok || c.level <= level) continue;
    for (const a of actionsFor(c, ctx))
      if (!actions.some((b) => b.key === a.key)) actions.push({ level: c.level, criterion: c.id, effort: EFFORT[a.key] ?? 3, ...a });
  }
  actions.sort((a, b) => a.level - b.level || a.effort - b.effort);

  const typing = pages.filter((p) => p.guess).map((p) => ({ page: p.id, template: p.guess.type, completeness: p.guess.completeness }));
  return { ...base, level, pages: total, takeoverSection: takeoverId, indicators, criteria, takeover, typing, actions, errors: built.errors, warnings: built.warnings };
}

/** Zone files of the captures: id and version. */
function readCaptures(root, images) {
  const dir = path.join(root, images, "zones");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    try {
      const z = normalizeZones(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).value;
      out.push({ id: f.slice(0, -5), version: typeof z?.version === "string" ? z.version : null });
    } catch {
      // An invalid zone file is reported by the build (blocking).
    }
  }
  return out;
}

/** The 7 required Take over pages: present or not, the page that satisfies each, and candidates. */
function evaluateTakeover({ pages, subPages, takeoverId, table, language }) {
  const live = pages.filter((p) => p.written);
  const typeOf = (p) => p.template || p.guess?.type || null;
  return TAKEOVER_ITEMS.map((item) => {
    const r = { id: item.id, ok: false, page: null, candidate: null, template: item.template, suggest: item.suggest, sub: item.sub || null, min: item.min || 0 };
    if (!takeoverId) return r;
    if (item.match) {
      const p = live.find(item.match);
      return { ...r, ok: !!p, page: p?.id ?? null };
    }
    for (const p of live.filter((x) => x.template === item.type)) {
      const subs = item.sub ? subPages(p).filter((s) => s.written && s.template === item.sub).length : 0;
      const numbered = item.numbered ? p.finding || subPages(p).some((s) => s.finding) : true;
      if (subs >= r.min && numbered) return { ...r, ok: true, page: p.id };
      if (!r.page) Object.assign(r, { page: p.id, subs, numbered });
    }
    if (!r.page) {
      // Not typed yet: a page that follows the template, or whose id is the conventional one.
      const c = live.find((p) => typeOf(p) === item.type) || live.find((p) => item.hint.test(p.id) && p.level === 1);
      if (c) {
        const subs = item.sub ? subPages(c).filter((s) => s.written && typeOf(s) === item.sub).length : 0;
        const missing = analysePage({ table, type: item.type, headings: c.headings, language }).missing;
        r.candidate = { id: c.id, follows: typeOf(c) === item.type, subs, missing };
      }
    }
    return r;
  });
}

/** An item of an action that is a build problem (rendered with the build's message). */
const problemItem = (e) => ({ id: e.vars?.page || e.vars?.file || e.file || "", problem: { kind: e.kind, key: e.key, vars: e.vars, file: e.file, path: e.path } });

/** Actions that satisfy a failed criterion: { key, vars, items: [{ id, key?, vars?, problem? }] }. */
function actionsFor(c, x) {
  const T = THRESHOLDS;
  const I = x.indicators;
  switch (c.id) {
    case "sectionsWritten":
      return [{ key: "sectionsWritten", vars: { n: x.emptySections.length }, items: x.emptySections.map((id) => ({ id })) }];
    case "home":
      return [{ key: "home", vars: { file: `${x.content}/home.md` }, items: [] }];
    case "glossary1":
    case "glossary3":
      return [{ key: "glossary", vars: { n: I.glossary.n, need: c.threshold - I.glossary.n, threshold: c.threshold }, items: [] }];
    case "tours1":
    case "tours3":
      return [{ key: "tours", vars: { n: I.tours.n, need: c.threshold - I.tours.n, threshold: c.threshold, file: x.tocInfo.file }, items: [] }];
    case "written2": {
      const missing = x.outside.filter((p) => !p.written);
      return [{ key: "written", vars: { n: missing.length, need: need(T.written2, x.outside.length, x.outside.length - missing.length) }, items: missing.map((p) => ({ id: p.id, key: p.template ? "newPage" : "writeFile", vars: { file: p.file, template: p.template } })) }];
    }
    case "annotated2":
    case "annotated3": {
      const missing = x.screenPages.filter((p) => !p.screen);
      return [{ key: "annotated", vars: { n: missing.length, need: need(c.threshold, x.screenPages.length, x.screenPages.length - missing.length), percent: c.threshold }, items: missing.map((p) => ({ id: p.id })) }];
    }
    case "coverage2":
      return [{ key: "coverage", vars: { n: x.coverage.total - x.coverage.n, need: need(T.coverage2, x.coverage.total, x.coverage.n) }, items: (x.coverage.missing || []).map((id) => ({ id })) }];
    case "linksLegend":
      return [{ key: "linksLegend", vars: { n: x.linkLegend.length }, items: x.linkLegend.map(problemItem) }];
    case "blocking3": {
      const out = [];
      if (x.built.errors.length) out.push({ key: "blocking", vars: { n: x.built.errors.length }, items: x.built.errors.map(problemItem) });
      if (I.blocking.coverage) out.push({ key: "coverage", vars: { n: I.blocking.coverage, need: I.blocking.coverage }, items: (x.coverage.missing || []).map((id) => ({ id })) });
      if (I.blocking.secrets) out.push({ key: "secrets", vars: { n: I.blocking.secrets }, items: x.secrets.findings.map((s) => ({ id: s.where, key: "secret", vars: { kind: s.kind } })) });
      return out;
    }
    case "typed3": {
      const untyped = x.pages.filter((p) => !p.template);
      const candidates = untyped.filter((p) => p.guess);
      const still = need(T.typed3, x.total, x.typed.length);
      const out = [];
      const key = x.tocInfo.legacy ? "gabarit" : "template";
      if (candidates.length)
        out.push({ key: "typedDeclare", vars: { n: candidates.length, need: still, file: x.tocInfo.file, field: key }, items: candidates.map((p) => ({ id: p.id, key: "typeAs", vars: { template: p.guess.type, field: key } })) });
      if (candidates.length < still) {
        const others = untyped.filter((p) => !p.guess && !p.untyped && p.written);
        out.push({
          key: "typedChoose",
          vars: { n: others.length, need: still - candidates.length, field: key, file: x.tocInfo.file },
          items: others.map((p) => (p.closest ? { id: p.id, key: "closest", vars: { template: p.closest.type, missing: p.closest.missing } } : { id: p.id })),
        });
      }
      return out;
    }
    case "conformant3": {
      const bad = x.typed.filter((p) => !p.analysis?.conformant);
      return [{ key: "conformant", vars: { n: bad.length }, items: bad.map((p) => (p.analysis?.known ? { id: p.id, key: "missingSections", vars: { template: p.template, missing: p.analysis.missing } } : { id: p.id, key: "unknownTemplate", vars: { template: p.template } })) }];
    }
    case "guidance3":
      return [{ key: "guidance", vars: { n: x.unfinished.length }, items: x.unfinished.map((p) => ({ id: p.id, key: p.guidance ? "guidanceLeft" : "placeholder", vars: { n: p.guidance } })) }];
    case "wideTables3":
      return [{ key: "wideTables", vars: { n: x.tables.problems.length }, items: x.tables.problems.map((t) => ({ id: t.page, key: "wideTable", vars: t })) }];
    case "takeover4":
      return [{ key: "takeover", vars: { n: TAKEOVER_ITEMS.length - I.takeover.n }, items: x.takeover.filter((t) => !t.ok).map((t) => takeoverItem(t, x)) }];
    case "proofs4": {
      const missing = x.takeoverPages.filter((p) => !p.proof);
      return [{ key: "proofs", vars: { n: missing.length, need: need(T.proofs4, x.takeoverPages.length, x.takeoverPages.length - missing.length) }, items: missing.map((p) => ({ id: p.id })) }];
    }
    case "completeness4": {
      const low = x.typed
        .filter((p) => p.analysis?.known && p.analysis.completeness < 1)
        .sort((a, b) => a.analysis.completeness - b.analysis.completeness)
        .slice(0, 20);
      return [{ key: "completeness", vars: { n: low.length, percent: T.completeness4 }, items: low.map((p) => ({ id: p.id, key: "optionalSections", vars: { percent: p.analysis.completeness, missing: optionalMissing(p, x) } })) }];
    }
    case "tooLong4": {
      const sorted = [...x.tooLong].sort((a, b) => b.words / b.maxWords - a.words / a.maxWords);
      return [{ key: "tooLong", vars: { n: sorted.length, need: Math.max(0, sorted.length - Math.floor(T.tooLong4 * x.total + 1e-9)) }, items: sorted.map((p) => ({ id: p.id, key: "words", vars: { words: p.words, max: p.maxWords } })) }];
    }
    case "upToDate4": {
      const old = x.versioned.filter((c) => c.version !== x.version);
      return [{ key: "upToDate", vars: { n: old.length, current: x.version }, items: old.map((c) => ({ id: c.id, key: "captureVersion", vars: { version: c.version } })) }];
    }
    default:
      return [];
  }
}

/** Sections of the template that the page does not have (required or not), in its language. */
function optionalMissing(p, x) {
  const all = Array.from({ length: sectionCount(x.table, p.template) }, (_, i) => i);
  return all.filter((i) => !p.analysis.present.includes(i)).map((i) => sectionLabel(x.table, p.template, i, x.language));
}

/** What to do for one missing Take over page. */
function takeoverItem(t, x) {
  const vars = { item: t.id, template: t.template, sub: t.sub, min: t.min };
  if (!x.takeoverId) return { id: "", key: "takeover.noSection", vars };
  const suggested = `${x.takeoverId}/${t.suggest[x.language] || t.suggest.en}`;
  if (t.page && t.sub && (t.subs ?? 0) < t.min) return { id: t.page, key: "takeover.subPages", vars: { ...vars, n: t.subs ?? 0, need: t.min - (t.subs ?? 0) } };
  if (t.page && t.numbered === false) return { id: t.page, key: "takeover.number", vars };
  if (t.candidate) {
    const c = t.candidate;
    if (c.follows && t.sub) return { id: c.id, key: c.subs >= t.min ? "takeover.typeWithSubs" : "takeover.typeAddSubs", vars: { ...vars, n: c.subs, need: Math.max(0, t.min - c.subs) } };
    if (c.follows) return { id: c.id, key: "takeover.type", vars };
    return { id: c.id, key: "takeover.rename", vars: { ...vars, missing: c.missing } };
  }
  return { id: suggested, key: "takeover.new", vars: { ...vars, page: suggested } };
}
