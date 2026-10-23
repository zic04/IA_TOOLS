// `audit` (standard/maturity.md): the indicators, the maturity level (1 to 4) and the prioritised actions that
// lead to the next level. Reads the project and builds it IN MEMORY (strict mode, so that the errors that would
// block a build are known); writes nothing. The reports (.doc-kit/audit.md, .doc-kit/audit.json) are rendered by
// report.mjs and written by the CLI.
//
// Measures that may be unavailable (coverage adapters, browser for the table widths) are injected through
// `measure`; an unavailable measure is "not measured" and never lowers the level.
//
// Spaces (ARCHITECTURE.md §6.1a): their kinds say which pages are the takeover pages and where the takeover
// dossier lives (takeover.mjs); the result also holds the level of each space (`spaces`).
import fs from "node:fs";
import path from "node:path";
import { build } from "../build/build.mjs";
import { readProjectVersion } from "../project/version.mjs";
import {
  loadPageTemplates,
  analysePage,
  guessTemplate,
  closestTemplate,
  headingsOf,
  countGuidance,
} from "../core/page-templates.mjs";
import { languageCounts } from "../build/languages.mjs";
import { createI18n, LANGUAGES } from "../i18n.mjs";
import { generatorTag } from "../brand.mjs";
import { measureCoverage, measureSecrets } from "./optional.mjs";
import { readSyncReference } from "../sync/reference.mjs";
import { readToc, HOME_FILE } from "../project/toc.mjs";
import { factsSummary } from "../facts/freshness.mjs";
import { THRESHOLDS, TAKEOVER_ITEMS } from "./thresholds.mjs";
import { ratio, count, notMeasured, criteriaOf, levelOf } from "./criteria.mjs";
import { depthOf, depthReport, measuresDepth } from "./depth.mjs";
import { actionsOf, draftBuildAction } from "./actions.mjs";
import { dossierLayout, evaluateTakeover, takeoverIndicator } from "./takeover.mjs";

// Kept as exports of the audit module for the commands and tests that import them from here.
export { readToc, THRESHOLDS, TAKEOVER_ITEMS };

/** Parent types whose sub-pages stay untyped (standard/templates.md, "Untyped pages"). */
const UNTYPED_UNDER = ["screen", "editor", "findings"];
/** An annotated screen: a `:::screen` (or `:::ecran`) block. */
const SCREEN = /^\s{0,3}:::(?:screen|ecran)\b/m;
/**
 * A `file:line` proof: a file name, then `:` and a number, in backticks (`lib/orders.ts:42`, `api.py:7-12`), or a
 * verified claim badge naming its source ([[verified lib/orders.ts:42]], [[verifie …]]).
 */
export const PROOF =
  /`[^`\n]*?(?:[\w@./-]*[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile):\d+[^`\n]*`|\[\[(?:verified|verifie)\s[^\]\n]*?(?:[\w@./-]*[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile):\d+[^\]\n]*\]\]/;
/** A numbered finding (standard/writing.md §9): C, I, M, P, N (en) or R (fr), then a number. */
const FINDING = /\b[CIMPNR]\d{1,3}\b/;
/** A claim badge (ARCHITECTURE.md §6.9): [[verified]], [[deduced]], [[unknown]] (verifie, deduit, inconnu). */
const CLAIM = /\[\[(verified|verifie|deduced|deduit|unknown|inconnu)\b/g;
/** Spelling of a claim badge → its status. */
const CLAIM_STATUS = Object.freeze({
  verified: "verified",
  verifie: "verified",
  deduced: "deduced",
  deduit: "deduced",
  unknown: "unknown",
  inconnu: "unknown",
});

/** Placeholders of the page summary written by `new` (both languages): a page that still has one is unfinished. */
const summaryPlaceholders = () =>
  LANGUAGES.map((l) => createI18n({ language: /** @type {"en"|"fr"} */ (l) }).t("cli.new.summaryPlaceholder"));

/**
 * Audits a project.
 * @param {object} p
 * @param {{ root: string }} p.project
 * @param {object} p.config  validated configuration
 * @param {{ coverage?: Function|null, secrets?: Function|null, tables?: Function|null, tablesReason?: string,
 *   commit?: string|null, exec?: import("../util/safe-git.mjs").Exec }} [p.measure]
 *   coverage({ project, config }), secrets({ project, config, data, env, exec }) and tables(html) return { measured, … }
 *   (optional.mjs). `null`: not measured. Default: coverage and secrets measured when the checks of the kit exist;
 *   tables not measured (they need a browser: the CLI passes them).
 * @param {Date} [p.now]
 * @param {object} [p.env]  environment (session file of the secrets check)
 *   `commit`: the application's current HEAD (ARCHITECTURE.md §6.9: `facts.stale`), read by the CLI through the
 *   `commit` test seam; null when it cannot be known (no app.dir, no git). `exec`: the launcher of the CLI context
 *   (`ctx.exec`), for the git check of the secrets measure (is the session tracked).
 */
export async function runAudit({ project, config, measure = {}, now = new Date(), env = process.env }) {
  const root = project.root;
  const language = config.language;
  const table = loadPageTemplates();
  const { content } = config.paths;
  const built = build({ project, config, options: {} });
  const tocInfo = readToc(root, content);
  const version = readProjectVersion(root, config.version);
  const base = {
    generator: generatorTag(),
    date: now.toISOString(),
    product: config.product.name,
    language,
    version,
    tocFile: tocInfo.file,
  };
  // Facts and claims (§6.9) are informative: computed whichever the level, never part of a criterion.
  const facts = factsSummary(root, config.paths.facts, measure.commit ?? null);
  const noClaims = { verified: 0, deduced: 0, unknown: 0, ratio: null };

  // Without a readable table of contents nothing can be measured: level 0, fix the build first.
  if (!built.html || !tocInfo.toc || !Array.isArray(tocInfo.toc.sections)) {
    const criteria = [{ level: 1, id: "draftBuild", ok: false }];
    return {
      ...base,
      level: 0,
      pages: 0,
      indicators: {},
      criteria,
      takeover: [],
      typing: [],
      facts,
      claims: noClaims,
      errors: built.errors,
      warnings: built.warnings,
      actions: [draftBuildAction(built.errors)],
    };
  }
  const toc = tocInfo.toc;
  const data = built.data;

  const { pages, claimCounts, ...layout } = collectPages({ root, content, toc, data, table, language });
  const byId = new Map(pages.map((p) => [p.id, p]));
  const subPages = (p) => {
    const i = pages.indexOf(p);
    const out = [];
    for (let j = i + 1; j < pages.length && pages[j].parent === p.id; j++) out.push(pages[j]);
    return out;
  };

  const m = await measureIndicators({
    project,
    config,
    env,
    measure,
    built,
    toc,
    pages,
    subPages,
    layout,
    table,
    version,
  });
  const { indicators } = m;

  // ─── Criteria and level ────────────────────────────────────────────────────
  // Level 1 (Skeleton): a section has its first page as soon as one of its pages has a file, even a draft.
  const emptySections = toc.sections
    .filter((s) => !pages.some((p) => p.section === s.id && p.hasFile))
    .map((s) => s.id);
  const homeFile = fs.existsSync(path.join(root, content, HOME_FILE)) ? `${content}/${HOME_FILE}` : undefined;
  const project1 = { emptySections, homeFile, linkLegend: m.linkLegend };
  const criteria = criteriaOf(indicators, project1);
  const level = levelOf(criteria);
  const spaces = spaceLevels({ layout, pages, subPages, indicators, config, data, project1, table, language, built });

  const ctx = {
    ...m,
    pages,
    byId,
    subPages,
    indicators,
    built,
    total: pages.length,
    version,
    emptySections,
    content,
    tocInfo,
    table,
    language,
  };
  const actions = actionsOf(criteria, level, ctx);
  return {
    ...base,
    level,
    pages: pages.length,
    takeoverSection: layout.takeoverId,
    indicators,
    criteria,
    takeover: m.takeover,
    facts,
    ...informative({ root, config, toc, pages, built, claimCounts }),
    actions,
    errors: built.errors,
    warnings: built.warnings,
    ...(spaces ? { spaces } : {}),
  };
}

/**
 * What the audit reports beside the level, never a criterion (the level never changes because of it): the pages
 * whose type it guesses, the claims of the takeover pages (§6.9), the translated files of each other language
 * (§6.12), the depth of each feature and the backlog in one line (engine/audit/depth.mjs).
 */
function informative({ root, config, toc, pages, built, claimCounts }) {
  const typing = pages
    .filter((p) => p.guess)
    .map((p) => ({ page: p.id, template: p.guess.type, completeness: p.guess.completeness }));
  const { verified, deduced, unknown } = claimCounts;
  const claims = { verified, deduced, unknown, ratio: verified + deduced ? verified / (verified + deduced) : null };
  const languages = config.languages
    ? config.languages.slice(1).map((id) => {
        const c = languageCounts({ root, config, toc, lang: id });
        const totalFiles = c.current + c.stale + c.unmarked + c.missing;
        return { ...c, ratio: totalFiles ? c.current / totalFiles : null };
      })
    : null;
  const depth = depthReport(built.backlog, pages);
  return { typing, claims, ...(languages ? { languages } : {}), ...(depth ? { depth } : {}) };
}

/**
 * The pages of the table of contents, each read and analysed (state, type guess, screens, proofs, findings), and
 * the claim badges of the written takeover pages; what each page is for the dossier comes from dossierLayout.
 */
function collectPages({ root, content, toc, data, table, language }) {
  const layout = dossierLayout(toc);
  const placeholders = summaryPlaceholders();
  const pages = [];
  const claimCounts = { verified: 0, deduced: 0, unknown: 0 };
  for (const sec of toc.sections)
    for (const g of sec.groups || []) {
      let parent = null;
      for (const p of g.pages || []) {
        const page = readPage(
          { root, content, data, table, language, placeholders, claimCounts },
          { sec, p, parent, ...layout.roleOf(sec, p) },
        );
        if (page.level === 1) parent = page;
        pages.push(page);
      }
    }
  return { pages, claimCounts, ...layout };
}

/** One page of the audit: its file read and analysed against its type (or a type guessed for it). */
function readPage(
  { root, content, data, table, language, placeholders, claimCounts },
  { sec, p, parent, space, takeover, inDossier, prefer },
) {
  const level = p.level === 2 ? 2 : 1;
  const file = `${content}/${p.file || p.id + ".md"}`;
  const abs = path.join(root, file);
  const hasFile = fs.existsSync(abs);
  const source = hasFile ? fs.readFileSync(abs, "utf8") : "";
  const rendered = hasFile ? data.pages[p.id]?.toc : null;
  const headings = rendered ? rendered.filter((x) => x.level === 2).map((x) => x.title) : headingsOf(source);
  const a = analysePage({ table, type: p.template, headings, source, language });
  // standard/maturity.md: a page is WRITTEN when its file exists and holds no template guidance. A page
  // without its file is "missing", one that still holds guidance is a "draft": `written` owns both, and no
  // other indicator counts them (their sections, examples and build errors wait until they are written).
  const state = !hasFile ? "missing" : a.guidance > 0 ? "draft" : "written";
  const written = state === "written";
  // The template's examples live in its guidance comments: they never satisfy a criterion.
  const body = written ? source.replace(/<!--[\s\S]*?-->/g, " ") : "";
  // Claims (§6.9, informative): tallied on the written takeover pages only.
  if (written && takeover) for (const m of body.matchAll(CLAIM)) claimCounts[CLAIM_STATUS[m[1]]]++;
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
    takeover,
    inDossier,
    space,
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
      page.guess = guessTemplate({ table, headings, language, level, parent: parentType, prefer });
      if (!page.guess) page.closest = closestTemplate({ table, headings, language });
    }
  }
  return page;
}

/** An optional measure the caller turned off (`measure.coverage` or `measure.secrets` null). */
const skipped = () => ({ measured: false, reason: "skipped" });

/**
 * The indicators of standard/maturity.md, and what the actions need to name the pages behind them. `written` owns
 * the pages not written yet (missing or draft); the other page indicators are measured on the written pages only,
 * so that an unwritten page is counted once (standard/maturity.md, "Who counts what") — the depth of the feature
 * sheets too (engine/audit/depth.mjs).
 */
async function measureIndicators({
  project,
  config,
  env,
  measure,
  built,
  toc,
  pages,
  subPages,
  layout,
  table,
  version,
}) {
  const root = project.root;
  const { content, images } = config.paths;
  const language = config.language;
  const data = built.data;
  const measured = measurePages(pages, config);
  const { written, unwritten, outside, typed, typedWritten, takeoverWritten, screenPages, tooLong } = measured.sets;
  const unwrittenIds = new Set(unwritten.map((p) => p.id));
  const unfinished = [
    ...written.filter((p) => p.placeholder).map((p) => ({ id: p.id, key: "placeholder", vars: { n: 0 } })),
    ...leftoverGuidance(root, content, toc),
  ];

  // Following the application (ARCHITECTURE.md §6.10, standard/maturity.md): a level 4 criterion, n/a (so met)
  // without sync.json — a project that never ran `sync --mark` is not penalised for it.
  const { reference: syncRef } = readSyncReference(root, config);
  const upToDatePages = syncRef
    ? ratio(written.filter((p) => syncRef.pages[p.id]?.version === version).length, written.length)
    : ratio(0, 0);

  const captures = readCaptures(root, images);
  const versioned = captures.filter((c) => c.version);
  // The build errors of the pages not written yet (page.missing, and every error raised in a draft) belong to
  // `written`; a journey step that names an unknown page stays a link error.
  const ownedByWritten = (e) =>
    e.key === "page.missing" || (e.key !== "link.journey" && unwrittenIds.has(e.vars?.page));
  const buildErrors = built.errors.filter((e) => !ownedByWritten(e));
  const linkLegend = buildErrors.filter(
    (e) => e.kind === "link" || ["screen.legend", "capture.hasZones"].includes(e.key),
  );

  const coverageFn = measure.coverage === undefined ? measureCoverage : measure.coverage;
  const coverage = coverageFn ? await coverageFn({ project, config }) : skipped();
  const secretsFn = measure.secrets === undefined ? measureSecrets : measure.secrets;
  const secrets = secretsFn ? await secretsFn({ project, config, data, env, exec: measure.exec }) : skipped();
  const tables = measure.tables
    ? await measure.tables(built.html)
    : { measured: false, reason: measure.tablesReason || "skipped" };

  const takeover = evaluateTakeover({
    pages: pages.filter((p) => p.inDossier),
    subPages,
    sections: layout.itemSections,
    table,
    language,
  });
  // `blocking` counts the elements that no page cites, not even a page not written yet: those that only the entry
  // of an unwritten page cites are already counted by `written` (that page) and `coverage` (level 2).
  const uncovered = coverage.measured ? coverage.total - Math.max(coverage.n, coverage.planned ?? 0) : 0;

  const P = measured.indicators;
  const depth = depthOf(built.backlog, pages, measuresDepth(layout.declared));
  const indicators = {
    written: P.written,
    typed: P.typed,
    conformant: P.conformant,
    completeness: P.completeness,
    annotated: P.annotated,
    coverage: coverage.measured
      ? {
          ...ratio(coverage.n, coverage.total),
          ...(coverage.planned > coverage.n ? { planned: coverage.planned } : {}),
        }
      : notMeasured("ratio", coverage.reason, coverage.error),
    proofs: P.proofs,
    takeover: takeoverIndicator(takeover),
    tooLong: P.tooLong,
    guidance: count(unfinished.length),
    upToDateCaptures: {
      ...ratio(versioned.filter((c) => c.version === version).length, versioned.length),
      current: version,
    },
    upToDatePages,
    glossary: count(data.glossary.length),
    tours: count(data.journeys.length),
    blocking: {
      ...count(buildErrors.length + uncovered + (secrets.measured ? secrets.findings.length : 0)),
      build: buildErrors.length,
      unwritten: built.errors.length - buildErrors.length,
      coverage: uncovered,
      secrets: secrets.measured ? secrets.findings.length : null,
      ...(secrets.measured ? {} : { secretsReason: secrets.reason, secretsError: secrets.error }),
    },
    wideTables: tables.measured ? count(tables.problems.length) : notMeasured("count", tables.reason, tables.error),
    ...depth.indicators,
  };
  return {
    indicators,
    buildErrors,
    linkLegend,
    coverage,
    secrets,
    tables,
    takeover,
    outside,
    screenPages,
    typed,
    typedWritten,
    tooLong,
    unfinished,
    captures,
    versioned,
    takeoverWritten,
    written,
    unwritten,
    syncRef,
    depth,
  };
}

/**
 * Level by space (§6.1a), null without spaces: the page indicators of each space are measured on its pages; the
 * project-wide ones are shared, but for the required takeover pages: those that belong to it (`itemSpaces` of the
 * dossier layout), looked for in its pages; the depth of the feature sheets in a space of a kind that measures it
 * (standard/spaces.json `depth`), n/a in the others. A criterion that does not concern a space is met and shown n/a, as its
 * kind says (standard/spaces.json): `written2` in a kind with `proofs` (develop), `proofs4` in the others,
 * `takeover4` in a space no required takeover page belongs to.
 */
function spaceLevels({ layout, pages, subPages, indicators, config, data, project1, table, language, built }) {
  if (!layout.declared) return null;
  return layout.declared.map(({ id, profile }) => {
    const list = pages.filter((p) => p.space === id);
    const own = {
      ...indicators,
      ...measurePages(list, config).indicators,
      // The depth, in a space of a kind that measures it (Product); n/a in the others.
      ...depthOf(built.backlog, list, !!profile?.depth).indicators,
    };
    const items = TAKEOVER_ITEMS.filter((item) => layout.itemSpaces[item.id] === id);
    const dossier = { subPages, sections: layout.itemSections, items, table, language };
    if (items.length)
      own.takeover = takeoverIndicator(evaluateTakeover({ ...dossier, pages: list.filter((p) => p.inDossier) }));
    const skip = [profile?.proofs ? "written2" : "proofs4", ...(items.length ? [] : ["takeover4"])];
    const crit = criteriaOf(own, project1).map((c) => (skip.includes(c.id) ? { ...c, ok: true, na: true } : c));
    return {
      id,
      title: data.spaces?.find((x) => x.id === id)?.title ?? id,
      pages: list.length,
      level: levelOf(crit),
      indicators: own,
      criteria: crit,
    };
  });
}

/**
 * The page indicators (standard/maturity.md) of a list of pages: the whole project, or the pages of one space.
 * @returns {{ sets: object, indicators: { written, typed, conformant, completeness, annotated, proofs, tooLong } }}
 */
function measurePages(pages, config) {
  const written = pages.filter((p) => p.written);
  const unwritten = pages.filter((p) => !p.written);
  const outside = pages.filter((p) => !p.takeover);
  const typed = pages.filter((p) => p.template);
  const typedWritten = typed.filter((p) => p.written);
  const takeoverPages = pages.filter((p) => p.takeover);
  const takeoverWritten = takeoverPages.filter((p) => p.written);
  // Annotated: the screen and editor pages; while no page is typed, every page outside Take over.
  const screenPages = (typed.length ? pages.filter((p) => ["screen", "editor"].includes(p.template)) : outside).filter(
    (p) => p.written,
  );
  const completenessOf = typedWritten.map((p) => (p.analysis?.known ? p.analysis.completeness : 0));
  const tooLong = written.filter((p) => p.words > p.maxWords);
  const missingCount = unwritten.filter((p) => p.state === "missing").length;
  const indicators = {
    written: {
      ...ratio(written.length, pages.length),
      outsideTakeover: ratio(outside.filter((p) => p.written).length, outside.length),
      missing: missingCount,
      drafts: unwritten.length - missingCount,
    },
    typed: ratio(typed.length, pages.length),
    conformant: ratio(typedWritten.filter((p) => p.analysis?.conformant).length, typedWritten.length),
    completeness: {
      kind: "average",
      measured: true,
      total: typedWritten.length,
      value: typedWritten.length ? completenessOf.reduce((a, b) => a + b, 0) / typedWritten.length : null,
    },
    // A documentation declared without screenshots (capture.mode "none") has nothing to annotate: n/a.
    annotated:
      config.capture?.mode === "none"
        ? { ...ratio(0, 0), mode: "none" }
        : ratio(screenPages.filter((p) => p.screen).length, screenPages.length),
    proofs: ratio(takeoverWritten.filter((p) => p.proof).length, takeoverWritten.length),
    tooLong: ratio(tooLong.length, written.length),
  };
  return {
    sets: { written, unwritten, outside, typed, typedWritten, takeoverWritten, screenPages, tooLong },
    indicators,
  };
}

/** Zone files of the captures: id and version. */
function readCaptures(root, images) {
  const dir = path.join(root, images, "zones");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".json"))
    .sort()) {
    try {
      const z = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out.push({ id: f.slice(0, -5), version: typeof z?.version === "string" ? z.version : null });
    } catch {
      // An invalid zone file is reported by the build (blocking).
    }
  }
  return out;
}

/**
 * Template guidance left outside the declared pages: the home page and the section introductions
 * (`<section>/index.md`). The declared pages that hold guidance are drafts, counted by `written`.
 */
function leftoverGuidance(root, content, toc) {
  const files = [`${content}/${HOME_FILE}`, ...toc.sections.map((s) => `${content}/${s.id}/index.md`)];
  const out = [];
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const n = countGuidance(fs.readFileSync(path.join(root, file), "utf8"));
    if (n) out.push({ id: file, key: "guidanceLeft", vars: { n } });
  }
  return out;
}
