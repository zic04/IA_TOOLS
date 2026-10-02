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
import { loadPageTemplates, analysePage, guessTemplate, closestTemplate, headingsOf, sectionLabel, sectionCount, countGuidance } from "../build/page-templates.mjs";
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
  glossary: 3, wideTables: 3, upToDate: 3, sectionsWritten: 4, annotated: 4, completeness: 4, tooLong: 4, written: 5, writtenAll: 5, writtenRest: 5,
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
        const hasFile = fs.existsSync(abs);
        const source = hasFile ? fs.readFileSync(abs, "utf8") : "";
        const rendered = hasFile ? data.pages[p.id]?.toc : null;
        const headings = rendered ? rendered.filter((x) => x.niveau === 2).map((x) => x.titre) : headingsOf(source);
        const a = analysePage({ table, type: p.template, headings, source, language });
        // standard/maturity.md: a page is WRITTEN when its file exists and holds no template guidance. A page
        // without its file is "missing", one that still holds guidance is a "draft": `written` owns both, and no
        // other indicator counts them (their sections, examples and build errors wait until they are written).
        const state = !hasFile ? "missing" : a.guidance > 0 ? "draft" : "written";
        const written = state === "written";
        // The template's examples live in its guidance comments: they never satisfy a criterion.
        const body = written ? source.replace(/<!--[\s\S]*?-->/g, " ") : "";
        const page = {
          id: p.id,
          section: sec.id,
          level,
          parent: level === 2 && parent ? parent.id : null,
          template: p.template || null,
          file,
          state,
          hasFile,
          written,
          headings,
          takeover: sec.id === takeoverId,
          words: a.words,
          maxWords: a.maxWords,
          guidance: a.guidance,
          placeholder: placeholders.includes(p.summary),
          screen: SCREEN.test(body),
          proof: PROOF.test(body),
          finding: FINDING.test(body),
          analysis: p.template ? a : null,
          guess: null,
          closest: null,
        };
        if (!page.template && hasFile) {
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
  // `written` owns the pages not written yet (missing or draft); the other page indicators are measured on the
  // written pages only, so that an unwritten page is counted once (standard/maturity.md, "Who counts what").
  const total = pages.length;
  const written = pages.filter((p) => p.written);
  const unwritten = pages.filter((p) => !p.written);
  const unwrittenIds = new Set(unwritten.map((p) => p.id));
  const outside = pages.filter((p) => !p.takeover);
  const typed = pages.filter((p) => p.template);
  const typedWritten = typed.filter((p) => p.written);
  const takeoverPages = pages.filter((p) => p.takeover);
  const takeoverWritten = takeoverPages.filter((p) => p.written);
  // Annotated: the screen and editor pages; while no page is typed, every page outside Take over.
  const screenPages = (typed.length ? pages.filter((p) => ["screen", "editor"].includes(p.template)) : outside).filter((p) => p.written);
  const completenessOf = typedWritten.map((p) => (p.analysis?.known ? p.analysis.completeness : 0));
  const tooLong = written.filter((p) => p.words > p.maxWords);
  const unfinished = [...written.filter((p) => p.placeholder).map((p) => ({ id: p.id, key: "placeholder", vars: { n: 0 } })), ...leftoverGuidance(root, content, toc)];

  const captures = readCaptures(root, images);
  const versioned = captures.filter((c) => c.version);
  // The build errors of the pages not written yet (page.missing, and every error raised in a draft) belong to
  // `written`; a journey step that names an unknown page stays a link error.
  const ownedByWritten = (e) => e.key === "page.missing" || (e.key !== "link.journey" && unwrittenIds.has(e.vars?.page));
  const buildErrors = built.errors.filter((e) => !ownedByWritten(e));
  const linkLegend = buildErrors.filter((e) => e.kind === "link" || ["screen.legend", "capture.hasZones"].includes(e.key));

  const coverageFn = measure.coverage === undefined ? measureCoverage : measure.coverage;
  const coverage = coverageFn ? await coverageFn({ project, config }) : { measured: false, reason: "skipped" };
  const secretsFn = measure.secrets === undefined ? measureSecrets : measure.secrets;
  const secrets = secretsFn ? await secretsFn({ project, config, data, env }) : { measured: false, reason: "skipped" };
  const tables = measure.tables ? await measure.tables(built.html) : { measured: false, reason: measure.tablesReason || "skipped" };

  const takeover = evaluateTakeover({ pages: takeoverPages, subPages, takeoverId, table, language });
  const missingCount = unwritten.filter((p) => p.state === "missing").length;
  // `blocking` counts the elements that no page cites, not even a page not written yet: those that only the entry
  // of an unwritten page cites are already counted by `written` (that page) and `coverage` (level 2).
  const uncovered = coverage.measured ? coverage.total - Math.max(coverage.n, coverage.planned ?? 0) : 0;

  const indicators = {
    written: { ...ratio(written.length, total), outsideTakeover: ratio(outside.filter((p) => p.written).length, outside.length), missing: missingCount, drafts: unwritten.length - missingCount },
    typed: ratio(typed.length, total),
    conformant: ratio(typedWritten.filter((p) => p.analysis?.conformant).length, typedWritten.length),
    completeness: { kind: "average", measured: true, total: typedWritten.length, value: typedWritten.length ? completenessOf.reduce((a, b) => a + b, 0) / typedWritten.length : null },
    // A documentation declared without screenshots (capture.mode "none") has nothing to annotate: n/a.
    annotated: config.capture?.mode === "none" ? { ...ratio(0, 0), mode: "none" } : ratio(screenPages.filter((p) => p.screen).length, screenPages.length),
    coverage: coverage.measured ? { ...ratio(coverage.n, coverage.total), ...(coverage.planned > coverage.n ? { planned: coverage.planned } : {}) } : notMeasured("ratio", coverage.reason, coverage.error),
    proofs: ratio(takeoverWritten.filter((p) => p.proof).length, takeoverWritten.length),
    takeover: { kind: "ratio", measured: true, n: takeover.filter((t) => t.ok).length, total: TAKEOVER_ITEMS.length, value: takeover.filter((t) => t.ok).length / TAKEOVER_ITEMS.length },
    tooLong: ratio(tooLong.length, written.length),
    guidance: count(unfinished.length),
    upToDateCaptures: { ...ratio(versioned.filter((c) => c.version === version).length, versioned.length), current: version },
    glossary: count(data.glossaire.length),
    tours: count(data.parcours.length),
    blocking: { ...count(buildErrors.length + uncovered + (secrets.measured ? secrets.findings.length : 0)), build: buildErrors.length, unwritten: built.errors.length - buildErrors.length, coverage: uncovered, secrets: secrets.measured ? secrets.findings.length : null, ...(secrets.measured ? {} : { secretsReason: secrets.reason, secretsError: secrets.error }) },
    wideTables: tables.measured ? count(tables.problems.length) : notMeasured("count", tables.reason, tables.error),
  };

  // ─── Criteria and level ────────────────────────────────────────────────────
  const atLeast = (ind, x) => (!ind.measured ? { ok: true, measured: false } : ind.value === null ? { ok: true, na: true } : { ok: ind.value >= x - 1e-9 });
  const atMost = (ind, x) => (!ind.measured ? { ok: true, measured: false } : ind.value === null ? { ok: true, na: true } : { ok: ind.value <= x + 1e-9 });
  // Level 1 (Skeleton): a section has its first page as soon as one of its pages has a file, even a draft.
  const emptySections = toc.sections.filter((s) => !pages.some((p) => p.section === s.id && p.hasFile)).map((s) => s.id);
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
    { level: 3, id: "written3", indicator: "written", threshold: 1, ...atLeast(indicators.written, 1) },
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
  const ctx = { pages, byId, subPages, indicators, built, buildErrors, linkLegend, coverage, secrets, tables, takeover, takeoverId, total, outside, screenPages, typed, typedWritten, tooLong, unfinished, captures, versioned, version, emptySections, content, tocInfo, table, language, takeoverPages, takeoverWritten, written, unwritten };
  const actions = [];
  for (const c of criteria) {
    if (c.ok || c.level <= level) continue;
    for (const a of actionsFor(c, ctx))
      if (!actions.some((b) => b.key === a.key)) actions.push({ level: c.level, criterion: c.id, effort: EFFORT[a.key] ?? 3, ...a });
  }
  // One unwritten page, one item: the pages already listed outside Take over (level 2) are not listed again.
  const outsideAction = actions.find((a) => a.key === "written");
  const allAction = actions.find((a) => a.key === "writtenAll");
  if (outsideAction && allAction) {
    const listed = new Set(outsideAction.items.map((i) => i.id));
    const rest = unwritten.filter((p) => !listed.has(p.id));
    if (rest.length) Object.assign(allAction, { key: "writtenRest", vars: unwrittenVars(rest), items: rest.map(unwrittenItem) });
    else actions.splice(actions.indexOf(allAction), 1);
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
  // Only the written pages count (standard/maturity.md): a draft, or a page without its file, is named as the page
  // to write (`unwritten`), never as present.
  const live = pages.filter((p) => p.written);
  const typeOf = (p) => p.template || p.guess?.type || null;
  const pending = (test) => {
    const u = pages.find((p) => !p.written && test(p));
    return u ? { id: u.id, state: u.state } : null;
  };
  return TAKEOVER_ITEMS.map((item) => {
    const r = { id: item.id, ok: false, page: null, candidate: null, unwritten: null, template: item.template, suggest: item.suggest, sub: item.sub || null, min: item.min || 0 };
    if (!takeoverId) return r;
    if (item.match) {
      const p = live.find(item.match);
      return { ...r, ok: !!p, page: p?.id ?? null, unwritten: p ? null : pending(item.match) };
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
      } else r.unwritten = pending((p) => p.level === 1 && (p.template === item.type || item.hint.test(p.id)));
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
      return [{ key: "written", vars: { ...unwrittenVars(missing), need: need(T.written2, x.outside.length, x.outside.length - missing.length) }, items: missing.map(unwrittenItem) }];
    }
    case "written3":
      return [{ key: "writtenAll", vars: unwrittenVars(x.unwritten), items: x.unwritten.map(unwrittenItem) }];
    case "annotated2":
    case "annotated3": {
      const missing = x.screenPages.filter((p) => !p.screen);
      return [{ key: "annotated", vars: { n: missing.length, need: need(c.threshold, x.screenPages.length, x.screenPages.length - missing.length), percent: c.threshold }, items: missing.map((p) => ({ id: p.id })) }];
    }
    case "coverage2": {
      const items = coverageItems(x.coverage);
      const planned = items.filter((i) => i.key === "plannedBy").length;
      return [{ key: "coverage", vars: { n: x.coverage.total - x.coverage.n, need: need(T.coverage2, x.coverage.total, x.coverage.n) }, ...(planned ? { note: { key: "coveragePlanned", vars: { n: planned } } } : {}), items }];
    }
    case "linksLegend":
      return [{ key: "linksLegend", vars: { n: x.linkLegend.length }, items: x.linkLegend.map(problemItem) }];
    case "blocking3": {
      const out = [];
      if (x.buildErrors.length) out.push({ key: "blocking", vars: { n: x.buildErrors.length }, items: x.buildErrors.map(problemItem) });
      if (I.blocking.coverage) out.push({ key: "coverage", vars: { n: I.blocking.coverage, need: I.blocking.coverage }, items: coverageItems(x.coverage).filter((i) => i.key !== "plannedBy") });
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
      const others = untyped.filter((p) => !p.guess && !p.untyped && p.hasFile);
      if (candidates.length < still && others.length) {
        out.push({
          key: "typedChoose",
          vars: { n: others.length, need: Math.min(others.length, still - candidates.length), field: key, file: x.tocInfo.file },
          items: others.map((p) => (p.closest ? { id: p.id, key: "closest", vars: { template: p.closest.type, missing: p.closest.missing } } : { id: p.id })),
        });
      }
      return out;
    }
    case "conformant3": {
      const bad = x.typedWritten.filter((p) => !p.analysis?.conformant);
      return [{ key: "conformant", vars: { n: bad.length }, items: bad.map((p) => (p.analysis?.known ? { id: p.id, key: "missingSections", vars: { template: p.template, missing: p.analysis.missing } } : { id: p.id, key: "unknownTemplate", vars: { template: p.template } })) }];
    }
    case "guidance3":
      return [{ key: "guidance", vars: { n: x.unfinished.length }, items: x.unfinished }];
    case "wideTables3":
      return [{ key: "wideTables", vars: { n: x.tables.problems.length }, items: x.tables.problems.map((t) => ({ id: t.page, key: "wideTable", vars: t })) }];
    case "takeover4":
      return [{ key: "takeover", vars: { n: TAKEOVER_ITEMS.length - I.takeover.n }, items: x.takeover.filter((t) => !t.ok).map((t) => takeoverItem(t, x)) }];
    case "proofs4": {
      const missing = x.takeoverWritten.filter((p) => !p.proof);
      return [{ key: "proofs", vars: { n: missing.length, need: need(T.proofs4, x.takeoverWritten.length, x.takeoverWritten.length - missing.length) }, items: missing.map((p) => ({ id: p.id })) }];
    }
    case "completeness4": {
      const low = x.typedWritten
        .filter((p) => p.analysis?.known && p.analysis.completeness < 1)
        .sort((a, b) => a.analysis.completeness - b.analysis.completeness)
        .slice(0, 20);
      return [{ key: "completeness", vars: { n: low.length, percent: T.completeness4 }, items: low.map((p) => ({ id: p.id, key: "optionalSections", vars: { percent: p.analysis.completeness, missing: optionalMissing(p, x) } })) }];
    }
    case "tooLong4": {
      const sorted = [...x.tooLong].sort((a, b) => b.words / b.maxWords - a.words / a.maxWords);
      return [{ key: "tooLong", vars: { n: sorted.length, need: Math.max(0, sorted.length - Math.floor(T.tooLong4 * x.written.length + 1e-9)) }, items: sorted.map((p) => ({ id: p.id, key: "words", vars: { words: p.words, max: p.maxWords } })) }];
    }
    case "upToDate4": {
      const old = x.versioned.filter((c) => c.version !== x.version);
      return [{ key: "upToDate", vars: { n: old.length, current: x.version }, items: old.map((c) => ({ id: c.id, key: "captureVersion", vars: { version: c.version } })) }];
    }
    default:
      return [];
  }
}

/** Counts of a list of pages not written yet: { n, missing (no file), drafts (template guidance left) }. */
function unwrittenVars(list) {
  const missing = list.filter((p) => p.state === "missing").length;
  return { n: list.length, missing, drafts: list.length - missing };
}

/** What to do for a page not written yet: create it (`new`, or write its file), or finish the draft. */
function unwrittenItem(p) {
  if (p.state === "draft") return { id: p.id, key: "finishDraft", vars: { n: p.guidance } };
  return { id: p.id, key: p.template ? "newPage" : "writeFile", vars: { file: p.file, template: p.template } };
}

/** Uncovered elements; those that the entry of a page not written yet cites name that page. */
function coverageItems(coverage) {
  return (coverage.missing || []).map((id) => (coverage.plannedBy?.[id] ? { id, key: "plannedBy", vars: { page: coverage.plannedBy[id] } } : { id }));
}

/**
 * Template guidance left outside the declared pages: the home page and the section introductions
 * (`<section>/index.md`). The declared pages that hold guidance are drafts, counted by `written`.
 */
function leftoverGuidance(root, content, toc) {
  const files = [HOME_FILES.map((f) => `${content}/${f}`).find((f) => fs.existsSync(path.join(root, f))), ...toc.sections.map((s) => `${content}/${s.id}/index.md`)];
  const out = [];
  for (const file of files) {
    if (!file || !fs.existsSync(path.join(root, file))) continue;
    const n = countGuidance(fs.readFileSync(path.join(root, file), "utf8"));
    if (n) out.push({ id: file, key: "guidanceLeft", vars: { n } });
  }
  return out;
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
  if (t.unwritten) return { id: t.unwritten.id, key: t.unwritten.state === "draft" ? "takeover.finish" : "takeover.create", vars: { ...vars, page: t.unwritten.id } };
  if (t.candidate) {
    const c = t.candidate;
    if (c.follows && t.sub) return { id: c.id, key: c.subs >= t.min ? "takeover.typeWithSubs" : "takeover.typeAddSubs", vars: { ...vars, n: c.subs, need: Math.max(0, t.min - c.subs) } };
    if (c.follows) return { id: c.id, key: "takeover.type", vars };
    return { id: c.id, key: "takeover.rename", vars: { ...vars, missing: c.missing } };
  }
  return { id: suggested, key: "takeover.new", vars: { ...vars, page: suggested } };
}
