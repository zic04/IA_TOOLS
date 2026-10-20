// The depth of the feature sheets in the audit (standard/maturity.md, "The depth of the feature sheets"), measured on
// the backlog of the strict build (engine/build/backlog.mjs — one measure, featureDepth, shared with the board):
//   featureSheets   written feature sheets with at least one user story ÷ written feature sheets     (level 3)
//   scenarios       their user stories with acceptance criteria (a scenario naming them) ÷ their stories (level 4)
//   behaviourDepth  the rubrics of their behaviour cards answered (an explicit n/a counts) ÷ the rubrics  (level 4)
// As every page indicator, on the written pages only: an unwritten sheet is `written`'s. n/a without a written
// feature sheet, and when the spaces declared include none of a kind that measures depth (standard/spaces.json
// `depth`: Product). Also what the report shows: the depth of each feature, and a line about the backlog. Pure.
import { ratio } from "./criteria.mjs";
import { THRESHOLDS, need } from "./thresholds.mjs";

/**
 * The depth indicators of a set of pages (the project's, or a space's), and the sheets and stories behind them.
 * @param {{ features: any[], stories: any[] }|null} backlog   build().backlog
 * @param {Array<{ id: string, written: boolean }>} pages   the audit's pages
 * @param {boolean} applies   false: n/a (no space of a kind that measures depth)
 */
export function depthOf(backlog, pages, applies) {
  const written = new Set(pages.filter((p) => p.written).map((p) => p.id));
  const sheets = applies ? (backlog?.features ?? []).filter((f) => written.has(f.page)) : [];
  const ids = new Set(sheets.map((f) => f.id));
  const stories = (backlog?.stories ?? []).filter((s) => ids.has(s.feature));
  const answered = sheets.reduce((n, f) => n + (f.rubrics?.answered ?? 0), 0);
  const total = sheets.reduce((n, f) => n + (f.rubrics?.total ?? 0), 0);
  return {
    indicators: {
      featureSheets: ratio(sheets.filter((f) => f.stories.length).length, sheets.length),
      scenarios: ratio(stories.filter((s) => s.criteria > 0).length, stories.length),
      behaviourDepth: ratio(answered, total),
    },
    sets: { sheets, stories },
  };
}

/** Whether the depth is measured: without spaces, always; with spaces, when one is of a kind that measures it. */
export const measuresDepth = (declared) => !declared || declared.some((s) => s.profile?.depth);

/**
 * What the report shows (informative): each feature's depth — its sheet's state, its score, its criteria and what
 * is still open in its sheet (`gaps`, read by the skill's depth loop, ARCHITECTURE.md §6.11a) — and the backlog in
 * one line; null without a feature sheet.
 * @param {{ epics: any[], features: any[], stories: any[], versions: Array<string|null> }|null} backlog
 * @param {Array<{ id: string, state: string }>} pages
 */
export function depthReport(backlog, pages) {
  if (!backlog?.features.length) return null;
  const state = new Map(pages.map((p) => [p.id, p.state]));
  return {
    backlog: {
      epics: backlog.epics.filter((e) => e.id).length,
      features: backlog.features.length,
      stories: backlog.stories.length,
      withCriteria: backlog.stories.filter((s) => s.criteria > 0).length,
      versions: backlog.versions.filter((v) => v !== null),
    },
    features: backlog.features.map((f) => ({
      id: f.id,
      title: f.title,
      page: f.page,
      state: state.get(f.page) ?? "missing",
      score: f.depth.score,
      criteria: Object.fromEntries(f.depth.criteria.map((c) => [c.key, c.value])),
      gaps: f.gaps,
    })),
  };
}

/** The actions of the depth criteria (engine/audit/actions.mjs): `x.depth` is what depthOf returned. */
export const DEPTH_ACTIONS = {
  featureSheets3: (c, x) => {
    const bare = x.depth.sets.sheets.filter((f) => !f.stories.length);
    return [
      {
        key: "featureStories",
        vars: { n: bare.length },
        items: bare.map((f) => ({ id: f.page, key: "featureStories", vars: { feature: f.id } })),
      },
    ];
  },
  scenarios4: (c, x) => {
    const { stories } = x.depth.sets;
    const bare = stories.filter((s) => !s.criteria);
    return [
      {
        key: "scenarios",
        vars: { n: bare.length, need: need(THRESHOLDS.scenarios4, stories.length, stories.length - bare.length) },
        items: bare.map((s) => ({ id: s.id, key: "storyCriteria", vars: { page: s.page } })),
      },
    ];
  },
  behaviourDepth4: (c, x) => {
    const open = x.depth.sets.sheets.filter((f) => f.rubrics && f.rubrics.answered < f.rubrics.total);
    return [
      {
        key: "behaviourDepth",
        vars: { n: open.length },
        items: open.map((f) => ({
          id: f.page,
          key: "rubrics",
          vars: { feature: f.id, left: f.rubrics.total - f.rubrics.answered, total: f.rubrics.total },
        })),
      },
    ];
  },
};
