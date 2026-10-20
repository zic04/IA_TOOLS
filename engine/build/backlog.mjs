// The backlog of a documentation (ARCHITECTURE.md §6.8b): its epics, its features and their user stories, read from
// what the build already knows — the table of contents (an epic is a group with `epic`, `summary`, `ref`; a feature
// sheet may set `since`, `ref` and `epic`), the feature registry (engine/build/business.mjs) and what the pages
// declared (stories, scenarios, rules, behaviour cards: engine/build/markdown-product.mjs). One model — read by the
// build's checks and `::stories{}`, and the one the Product board and the backlog export are to read — and one
// measure of how far a feature is specified (featureDepth). Pure.
//   epic     { id, title, summary, ref, section, features: [feature ids] }   id null: a group without an epic
//   feature  { id, title, summary, page, epic, since, ref, roles, kinds, rules, stories: [ids], criteria, depth,
//              rubrics: { answered, total }, gaps }   rubrics: those of its behaviour cards (the audit's
//              behaviourDepth); gaps: what is still open in its sheet (the skill's depth loop, ARCHITECTURE.md
//              §6.11a) — { cards: [{ id, kind, title, rubrics: [{ id, state: missing|unknown }] }], stories: [ids
//              without acceptance criteria], noStory, noRule }
//   story    { id, title, role, since, ref, feature, page, anchor, criteria, text: [lines],
//              scenarios: [{ title, steps: [{ step, keyword, text }] }] }   its text and acceptance criteria, as plain
//              text (the backlog export, engine/backlog/)
import { parseRef } from "../core/refs.mjs";
import { compareVersions } from "../stats/usage.mjs";

/**
 * @typedef {{ conformant: boolean, guidance: number }|null} SheetState   analysePage of the feature's sheet (null:
 *   the sheet is not written)
 * @typedef {{ key: string, value: number|null }} DepthCriterion   value 0 to 1, null when it does not apply
 * @typedef {{ score: number, criteria: DepthCriterion[] }} Depth
 * @typedef {{ key: string, vars: object, strict: boolean }} Problem
 */

/**
 * How far a feature is specified, from 0 to 100: the mean of the criteria that apply —
 *   sheet     its sheet written and conformant (1), written with a required section missing or guidance left (0.5);
 *   stories   at least one user story;
 *   criteria  the share of its stories that have acceptance criteria (a scenario naming them);
 *   rules     at least one business rule, defined in its sheet or cited by it;
 *   rubrics   the share of the rubrics of its behaviour cards answered (an explicit "n/a" counts), when it has cards.
 * @param {{ sheet: SheetState, stories: number, storiesWithCriteria: number, rules: number,
 *   rubrics: { answered: number, total: number } }} f
 * @returns {Depth}
 */
export function featureDepth(f) {
  const criteria = [
    { key: "sheet", value: f.sheet ? (f.sheet.conformant && !f.sheet.guidance ? 1 : 0.5) : 0 },
    { key: "stories", value: f.stories > 0 ? 1 : 0 },
    { key: "criteria", value: f.stories > 0 ? f.storiesWithCriteria / f.stories : 0 },
    { key: "rules", value: f.rules > 0 ? 1 : 0 },
    { key: "rubrics", value: f.rubrics.total ? f.rubrics.answered / f.rubrics.total : null },
  ];
  const counted = criteria.filter((c) => c.value !== null);
  const score = Math.round((100 * counted.reduce((n, c) => n + /** @type {number} */ (c.value), 0)) / counted.length);
  return { score, criteria };
}

/** A version's place among the others: the explicit ones in order, "no version" (null) last. */
const byVersion = (a, b) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : compareVersions(a, b));

/** Items grouped by a key: key → items, in their order. */
function groupBy(items, keyOf) {
  const out = new Map();
  for (const item of items)
    for (const key of keyOf(item)) {
      if (!key) continue;
      const list = out.get(key);
      if (list) list.push(item);
      else out.set(key, [item]);
    }
  return out;
}

/**
 * The epics: the groups that name one (the first wins a duplicate id), and the groups of feature sheets that name
 * none (each its own group of the backlog).
 */
function epicsOf(toc, sheetPages, problems) {
  const epics = [];
  const declared = new Map();
  for (const sec of toc.sections)
    for (const g of sec.groups) {
      const pages = g.pages.filter((p) => sheetPages.has(p.id)).map((p) => p.id);
      if (g.epic && declared.has(g.epic)) {
        problems.push({ key: "epic.duplicate", vars: { id: g.epic, section: sec.id }, strict: true });
        continue;
      }
      if (!g.epic && !pages.length) continue;
      const epic = { id: g.epic ?? null, title: g.title || sec.title, summary: g.summary || "", ref: g.ref || null };
      epics.push({ ...epic, section: sec.id, features: [], pages });
      if (g.epic) declared.set(g.epic, epics.at(-1));
    }
  const byPage = new Map(epics.flatMap((e) => e.pages.map((p) => [p, e])));
  return { epics, declared, byPage };
}

/** The share of the rubrics of a feature's cards that are answered (an explicit "n/a" counts). */
function rubricsOf(cards) {
  const rubrics = { answered: 0, total: 0 };
  for (const { counts } of cards) {
    rubrics.answered += counts.answered + counts.na;
    rubrics.total += counts.answered + counts.na + counts.unknown + counts.missing;
  }
  return rubrics;
}

/** One feature of the model, in its epic: the one its sheet names, else its group's. */
function featureOf(f, ctx) {
  const p = ctx.tocPages.get(f.page) ?? {};
  let epic = ctx.epicByPage.get(f.page);
  if (p.epic && !ctx.declared.has(p.epic))
    ctx.problems.push({ key: "epic.unknown", vars: { id: p.epic, page: f.page }, strict: true });
  else if (p.epic) epic = ctx.declared.get(p.epic);
  epic?.features.push(f.id);
  const own = ctx.storiesByPage.get(f.page) ?? [];
  const cards = [...(ctx.cardsByPage.get(f.page) ?? []), ...(ctx.cardsByFeature.get(f.id) ?? [])];
  // Its rules: those its sheet defines, and those it cites (a rule is defined once, cited everywhere) — a citation
  // of a rule defined nowhere is not a rule (the build reports it: rule.unknown).
  const defined = (ctx.rulesByPage.get(f.page) ?? []).map(([id]) => id);
  const cited = [...(ctx.cited.get(f.page) ?? [])].filter((id) => ctx.rules.has(id));
  const rules = new Set([...defined, ...cited]).size;
  const withCriteria = own.filter(([id]) => ctx.criteria.get(id)).length;
  const unique = [...new Set(cards)];
  const rubrics = rubricsOf(unique);
  return {
    id: f.id,
    title: f.title,
    summary: f.summary,
    page: f.page,
    epic: epic?.id ?? null,
    since: p.since ?? null,
    ref: p.ref ?? null,
    roles: [...new Set(own.map(([, s]) => s.role).filter(Boolean))],
    kinds: [...new Set(cards.map((c) => c.kind))],
    rules,
    stories: own.map(([id]) => id),
    criteria: own.reduce((n, [id]) => n + (ctx.criteria.get(id) || 0), 0),
    depth: featureDepth({
      sheet: ctx.sheets[f.page] ?? null,
      stories: own.length,
      storiesWithCriteria: withCriteria,
      rules,
      rubrics,
    }),
    rubrics,
    gaps: {
      cards: unique
        .filter((c) => c.open?.length)
        .map((c) => ({ id: c.id, kind: c.kind, title: c.title, rubrics: c.open })),
      stories: own.filter(([id]) => !ctx.criteria.get(id)).map(([id]) => id),
      noStory: own.length === 0,
      noRule: rules === 0,
    },
  };
}

/** Each story of a feature sheet, with its version (its own, else its feature's) and its acceptance criteria. */
function storiesOf(stories, features, scenariosByStory, problems) {
  const featureOfStory = new Map(features.flatMap((f) => f.stories.map((id) => [id, f])));
  const out = [];
  for (const [id, s] of stories) {
    const f = featureOfStory.get(id);
    if (!f) problems.push({ key: "story.outside", vars: { id, page: s.page }, strict: false });
    else
      out.push({
        id,
        title: s.title,
        role: s.role ?? null,
        since: s.since ?? f.since ?? null,
        ref: s.ref ?? null,
        feature: f.id,
        page: s.page,
        anchor: s.anchor,
        criteria: scenariosByStory.get(id)?.length ?? 0,
        text: s.text ?? [],
        scenarios: (scenariosByStory.get(id) ?? []).map((x) => ({ title: x.title, steps: x.steps ?? [] })),
      });
  }
  return out;
}

/**
 * The backlog of one language's build.
 * @param {{ toc: any, features: Map<string, any>, stories: Map<string, any>,
 *   scenarios: Array<{ story: string|null, title: string, steps?: any[] }>,
 *   rules: Map<string, { page: string }>, cards: Map<string, any>, sheets: Record<string, SheetState>,
 *   cited?: Map<string, Set<string>> }} p
 *   sheets: page id → the analysis of its sheet, for the feature sheets written; cited: page id → the rules it cites
 * @returns {{ epics: any[], features: any[], stories: any[], versions: Array<string|null>, problems: Problem[] }}
 */
export function backlogModel({ toc, features, stories, scenarios, rules, cards, sheets, cited = new Map() }) {
  /** @type {Problem[]} */
  const problems = [];
  // A story's acceptance criteria: the scenarios that name it.
  const scenariosByStory = groupBy(scenarios, (s) => [s.story]);
  const criteria = new Map([...scenariosByStory].map(([id, list]) => [id, list.length]));
  const sheetPages = new Set([...features.values()].map((f) => f.page));
  const { epics, declared, byPage } = epicsOf(toc, sheetPages, problems);
  const tocPages = new Map(toc.sections.flatMap((sec) => sec.groups.flatMap((g) => g.pages.map((p) => [p.id, p]))));
  for (const [id, p] of tocPages)
    if (!sheetPages.has(id))
      for (const field of ["epic", "since", "ref"])
        if (p[field] !== undefined) problems.push({ key: "backlog.field", vars: { page: id, field }, strict: false });
  const ctx = {
    tocPages,
    epicByPage: byPage,
    declared,
    problems,
    criteria,
    sheets,
    cited,
    rules,
    storiesByPage: groupBy([...stories.entries()], ([, s]) => [s.page]),
    cardsByPage: groupBy([...cards.values()], (c) => [c.page]),
    cardsByFeature: groupBy([...cards.values()], (c) => [c.feature]),
    rulesByPage: groupBy([...rules.entries()], ([, r]) => [r.page]),
  };
  const featureList = [...features.values()].map((f) => featureOf(f, ctx));
  const storyList = storiesOf(stories, featureList, scenariosByStory, problems);

  // A reference the kit cannot read: shown as written, without a link.
  for (const item of [...epics, ...featureList, ...storyList])
    if (item.ref && !parseRef(item.ref))
      problems.push({ key: "backlog.ref", vars: { id: item.id ?? item.title, ref: item.ref }, strict: false });

  const versions = [...new Set([...featureList, ...storyList].map((x) => x.since))].sort(byVersion);
  return { epics: epics.map(({ pages, ...e }) => e), features: featureList, stories: storyList, versions, problems };
}
