// The actions of `audit` (standard/maturity.md): for each criterion not met above the level reached, what to do,
// on which pages, ordered by level, then by effort. Pure: the audit (audit.mjs) passes what it measured.
import { sectionLabel, sectionCount } from "../core/page-templates.mjs";
import { THRESHOLDS, TAKEOVER_ITEMS } from "./thresholds.mjs";

/** Effort of each kind of action (1 = minutes, 5 = real writing): orders the actions inside a level. */
const EFFORT = {
  draftBuild: 1,
  home: 1,
  guidance: 1,
  secrets: 2,
  conformant: 1,
  typedDeclare: 1,
  linksLegend: 2,
  blocking: 2,
  tours: 2,
  typedChoose: 3,
  glossary: 3,
  wideTables: 3,
  upToDate: 3,
  sectionsWritten: 4,
  annotated: 4,
  completeness: 4,
  tooLong: 4,
  upToDatePages: 4,
  written: 5,
  writtenAll: 5,
  writtenRest: 5,
  coverage: 5,
  proofs: 5,
  takeover: 5,
};

const need = (threshold, total, n) => Math.max(0, Math.ceil(threshold * total - 1e-9) - n);

/** The one action of a project whose build fails: fix the build first (level 0). */
export function draftBuildAction(errors) {
  return {
    level: 1,
    criterion: "draftBuild",
    effort: EFFORT.draftBuild,
    key: "draftBuild",
    vars: { n: errors.length },
    items: errors.map(problemItem),
  };
}

/** The actions for every level above the one reached, ordered by level, then effort. */
export function actionsOf(criteria, level, ctx) {
  const actions = [];
  for (const c of criteria) {
    if (c.ok || c.level <= level) continue;
    for (const a of actionsFor(c, ctx))
      if (!actions.some((b) => b.key === a.key))
        actions.push({ level: c.level, criterion: c.id, effort: EFFORT[a.key] ?? 3, ...a });
  }
  // One unwritten page, one item: the pages already listed outside Take over (level 2) are not listed again.
  const outsideAction = actions.find((a) => a.key === "written");
  const allAction = actions.find((a) => a.key === "writtenAll");
  if (outsideAction && allAction) {
    const listed = new Set(outsideAction.items.map((i) => i.id));
    const rest = ctx.unwritten.filter((p) => !listed.has(p.id));
    if (rest.length)
      Object.assign(allAction, { key: "writtenRest", vars: unwrittenVars(rest), items: rest.map(unwrittenItem) });
    else actions.splice(actions.indexOf(allAction), 1);
  }
  actions.sort((a, b) => a.level - b.level || a.effort - b.effort);
  return actions;
}

/** An item of an action that is a build problem (rendered with the build's message). */
const problemItem = (e) => ({
  id: e.vars?.page || e.vars?.file || e.file || "",
  problem: { kind: e.kind, key: e.key, vars: e.vars, file: e.file, path: e.path },
});

/**
 * Actions that satisfy a failed criterion, by criterion id: (criterion, measured) → [{ key, vars, items: [{ id,
 * key?, vars?, problem? }] }]. `x` is what the audit measured (audit.mjs, runAudit).
 */
const ACTIONS = {
  sectionsWritten: (c, x) => [
    { key: "sectionsWritten", vars: { n: x.emptySections.length }, items: x.emptySections.map((id) => ({ id })) },
  ],
  home: (c, x) => [{ key: "home", vars: { file: `${x.content}/home.md` }, items: [] }],
  glossary1: (c, x) => [
    {
      key: "glossary",
      vars: { n: x.indicators.glossary.n, need: c.threshold - x.indicators.glossary.n, threshold: c.threshold },
      items: [],
    },
  ],
  glossary3: (c, x) => ACTIONS.glossary1(c, x),
  tours1: (c, x) => [
    {
      key: "tours",
      vars: {
        n: x.indicators.tours.n,
        need: c.threshold - x.indicators.tours.n,
        threshold: c.threshold,
        file: x.tocInfo.file,
      },
      items: [],
    },
  ],
  tours3: (c, x) => ACTIONS.tours1(c, x),
  written2: (c, x) => {
    const missing = x.outside.filter((p) => !p.written);
    return [
      {
        key: "written",
        vars: {
          ...unwrittenVars(missing),
          need: need(THRESHOLDS.written2, x.outside.length, x.outside.length - missing.length),
        },
        items: missing.map(unwrittenItem),
      },
    ];
  },
  written3: (c, x) => [{ key: "writtenAll", vars: unwrittenVars(x.unwritten), items: x.unwritten.map(unwrittenItem) }],
  annotated2: (c, x) => {
    const missing = x.screenPages.filter((p) => !p.screen);
    return [
      {
        key: "annotated",
        vars: {
          n: missing.length,
          need: need(c.threshold, x.screenPages.length, x.screenPages.length - missing.length),
          percent: c.threshold,
        },
        items: missing.map((p) => ({ id: p.id })),
      },
    ];
  },
  annotated3: (c, x) => ACTIONS.annotated2(c, x),
  coverage2: (c, x) => {
    const items = coverageItems(x.coverage);
    const planned = items.filter((i) => i.key === "plannedBy").length;
    return [
      {
        key: "coverage",
        vars: { n: x.coverage.total - x.coverage.n, need: need(THRESHOLDS.coverage2, x.coverage.total, x.coverage.n) },
        ...(planned ? { note: { key: "coveragePlanned", vars: { n: planned } } } : {}),
        items,
      },
    ];
  },
  linksLegend: (c, x) => [
    { key: "linksLegend", vars: { n: x.linkLegend.length }, items: x.linkLegend.map(problemItem) },
  ],
  blocking3: (c, x) => {
    const out = [];
    if (x.buildErrors.length)
      out.push({ key: "blocking", vars: { n: x.buildErrors.length }, items: x.buildErrors.map(problemItem) });
    if (x.indicators.blocking.coverage)
      out.push({
        key: "coverage",
        vars: { n: x.indicators.blocking.coverage, need: x.indicators.blocking.coverage },
        items: coverageItems(x.coverage).filter((i) => i.key !== "plannedBy"),
      });
    if (x.indicators.blocking.secrets)
      out.push({
        key: "secrets",
        vars: { n: x.indicators.blocking.secrets },
        items: x.secrets.findings.map((s) => ({ id: s.where, key: "secret", vars: { kind: s.kind } })),
      });
    return out;
  },
  typed3: (c, x) => {
    const untyped = x.pages.filter((p) => !p.template);
    const candidates = untyped.filter((p) => p.guess);
    const still = need(THRESHOLDS.typed3, x.total, x.typed.length);
    const out = [];
    const key = x.tocInfo.legacy ? "gabarit" : "template";
    if (candidates.length)
      out.push({
        key: "typedDeclare",
        vars: { n: candidates.length, need: still, file: x.tocInfo.file, field: key },
        items: candidates.map((p) => ({ id: p.id, key: "typeAs", vars: { template: p.guess.type, field: key } })),
      });
    const others = untyped.filter((p) => !p.guess && !p.untyped && p.hasFile);
    if (candidates.length < still && others.length) {
      out.push({
        key: "typedChoose",
        vars: {
          n: others.length,
          need: Math.min(others.length, still - candidates.length),
          field: key,
          file: x.tocInfo.file,
        },
        items: others.map((p) =>
          p.closest
            ? { id: p.id, key: "closest", vars: { template: p.closest.type, missing: p.closest.missing } }
            : { id: p.id },
        ),
      });
    }
    return out;
  },
  conformant3: (c, x) => {
    const bad = x.typedWritten.filter((p) => !p.analysis?.conformant);
    return [
      {
        key: "conformant",
        vars: { n: bad.length },
        items: bad.map((p) =>
          p.analysis?.known
            ? { id: p.id, key: "missingSections", vars: { template: p.template, missing: p.analysis.missing } }
            : { id: p.id, key: "unknownTemplate", vars: { template: p.template } },
        ),
      },
    ];
  },
  guidance3: (c, x) => [{ key: "guidance", vars: { n: x.unfinished.length }, items: x.unfinished }],
  wideTables3: (c, x) => [
    {
      key: "wideTables",
      vars: { n: x.tables.problems.length },
      items: x.tables.problems.map((t) => ({ id: t.page, key: "wideTable", vars: t })),
    },
  ],
  takeover4: (c, x) => [
    {
      key: "takeover",
      vars: { n: TAKEOVER_ITEMS.length - x.indicators.takeover.n },
      items: x.takeover.filter((t) => !t.ok).map((t) => takeoverItem(t, x)),
    },
  ],
  proofs4: (c, x) => {
    const missing = x.takeoverWritten.filter((p) => !p.proof);
    return [
      {
        key: "proofs",
        vars: {
          n: missing.length,
          need: need(THRESHOLDS.proofs4, x.takeoverWritten.length, x.takeoverWritten.length - missing.length),
        },
        items: missing.map((p) => ({ id: p.id })),
      },
    ];
  },
  completeness4: (c, x) => {
    const low = x.typedWritten
      .filter((p) => p.analysis?.known && p.analysis.completeness < 1)
      .sort((a, b) => a.analysis.completeness - b.analysis.completeness)
      .slice(0, 20);
    return [
      {
        key: "completeness",
        vars: { n: low.length, percent: THRESHOLDS.completeness4 },
        items: low.map((p) => ({
          id: p.id,
          key: "optionalSections",
          vars: { percent: p.analysis.completeness, missing: optionalMissing(p, x) },
        })),
      },
    ];
  },
  tooLong4: (c, x) => {
    const sorted = [...x.tooLong].sort((a, b) => b.words / b.maxWords - a.words / a.maxWords);
    return [
      {
        key: "tooLong",
        vars: {
          n: sorted.length,
          need: Math.max(0, sorted.length - Math.floor(THRESHOLDS.tooLong4 * x.written.length + 1e-9)),
        },
        items: sorted.map((p) => ({ id: p.id, key: "words", vars: { words: p.words, max: p.maxWords } })),
      },
    ];
  },
  upToDate4: (c, x) => {
    const old = x.versioned.filter((c) => c.version !== x.version);
    return [
      {
        key: "upToDate",
        vars: { n: old.length, current: x.version },
        items: old.map((c) => ({ id: c.id, key: "captureVersion", vars: { version: c.version } })),
      },
    ];
  },
  upToDatePages4: (c, x) => {
    const stale = x.written.filter((p) => x.syncRef.pages[p.id]?.version !== x.version);
    return [
      {
        key: "upToDatePages",
        vars: { n: stale.length, current: x.version },
        items: stale.map((p) =>
          x.syncRef.pages[p.id]
            ? { id: p.id, key: "pageVersion", vars: { version: x.syncRef.pages[p.id].version } }
            : { id: p.id, key: "pageUnmarked" },
        ),
      },
    ];
  },
};

/** Actions that satisfy a failed criterion (none for a criterion without actions). */
const actionsFor = (c, x) => ACTIONS[c.id]?.(c, x) ?? [];

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
  return (coverage.missing || []).map((id) =>
    coverage.plannedBy?.[id] ? { id, key: "plannedBy", vars: { page: coverage.plannedBy[id] } } : { id },
  );
}

/** Sections of the template that the page does not have (required or not), in its language. */
function optionalMissing(p, x) {
  const all = Array.from({ length: sectionCount(x.table, p.template) }, (_, i) => i);
  return all
    .filter((i) => !p.analysis.present.includes(i))
    .map((i) => sectionLabel(x.table, p.template, i, x.language));
}

/** What to do for one missing Take over page. */
function takeoverItem(t, x) {
  const vars = { item: t.id, template: t.template, sub: t.sub, min: t.min };
  if (!x.takeoverId) return { id: "", key: "takeover.noSection", vars };
  const suggested = `${x.takeoverId}/${t.suggest[x.language] || t.suggest.en}`;
  if (t.page && t.sub && (t.subs ?? 0) < t.min)
    return { id: t.page, key: "takeover.subPages", vars: { ...vars, n: t.subs ?? 0, need: t.min - (t.subs ?? 0) } };
  if (t.page && t.numbered === false) return { id: t.page, key: "takeover.number", vars };
  if (t.unwritten)
    return {
      id: t.unwritten.id,
      key: t.unwritten.state === "draft" ? "takeover.finish" : "takeover.create",
      vars: { ...vars, page: t.unwritten.id },
    };
  if (t.candidate) {
    const c = t.candidate;
    if (c.follows && t.sub)
      return {
        id: c.id,
        key: c.subs >= t.min ? "takeover.typeWithSubs" : "takeover.typeAddSubs",
        vars: { ...vars, n: c.subs, need: Math.max(0, t.min - c.subs) },
      };
    if (c.follows) return { id: c.id, key: "takeover.type", vars };
    return { id: c.id, key: "takeover.rename", vars: { ...vars, missing: c.missing } };
  }
  return { id: suggested, key: "takeover.new", vars: { ...vars, page: suggested } };
}
