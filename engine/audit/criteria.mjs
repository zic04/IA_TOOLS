// The criteria of standard/maturity.md on a set of indicators, and the level they reach (1 to 4), shared by the
// project's level and the level of each space (engine/audit/audit.mjs). Pure.
import { THRESHOLDS } from "./thresholds.mjs";

/** The kinds of indicator: a ratio n ÷ total, a count, one that could not be measured. */
export const ratio = (n, total) => ({ kind: "ratio", measured: true, n, total, value: total ? n / total : null });
export const count = (n) => ({ kind: "count", measured: true, n, value: n });
export const notMeasured = (kind, reason, error) => ({
  kind,
  measured: false,
  reason,
  ...(error ? { error } : {}),
  value: null,
});

const atLeast = (ind, x) =>
  !ind.measured
    ? { ok: true, measured: false }
    : ind.value === null
      ? { ok: true, na: true }
      : { ok: ind.value >= x - 1e-9 };
const atMost = (ind, x) =>
  !ind.measured
    ? { ok: true, measured: false }
    : ind.value === null
      ? { ok: true, na: true }
      : { ok: ind.value <= x + 1e-9 };

/**
 * The criteria of standard/maturity.md, on a set of indicators (the project's, or those of a space); the level 1
 * and 2 criteria that are not indicators are the project's (`emptySections`, `homeFile`, `linkLegend`).
 */
export function criteriaOf(indicators, { emptySections, homeFile, linkLegend }) {
  const T = THRESHOLDS;
  return [
    { level: 1, id: "config", ok: true },
    { level: 1, id: "draftBuild", ok: true },
    { level: 1, id: "sectionsWritten", ok: emptySections.length === 0 },
    { level: 1, id: "home", ok: !!homeFile },
    {
      level: 1,
      id: "glossary1",
      indicator: "glossary",
      threshold: T.glossary1,
      ...atLeast(indicators.glossary, T.glossary1),
    },
    { level: 1, id: "tours1", indicator: "tours", threshold: T.tours1, ...atLeast(indicators.tours, T.tours1) },
    {
      level: 2,
      id: "written2",
      indicator: "written",
      threshold: T.written2,
      ...atLeast(indicators.written.outsideTakeover, T.written2),
    },
    {
      level: 2,
      id: "annotated2",
      indicator: "annotated",
      threshold: T.annotated2,
      ...atLeast(indicators.annotated, T.annotated2),
    },
    {
      level: 2,
      id: "coverage2",
      indicator: "coverage",
      threshold: T.coverage2,
      ...atLeast(indicators.coverage, T.coverage2),
    },
    { level: 2, id: "linksLegend", ok: linkLegend.length === 0, n: linkLegend.length },
    { level: 3, id: "written3", indicator: "written", threshold: 1, ...atLeast(indicators.written, 1) },
    { level: 3, id: "blocking3", indicator: "blocking", threshold: 0, ...atMost(indicators.blocking, 0) },
    { level: 3, id: "typed3", indicator: "typed", threshold: T.typed3, ...atLeast(indicators.typed, T.typed3) },
    {
      level: 3,
      id: "conformant3",
      indicator: "conformant",
      threshold: T.conformant3,
      ...atLeast(indicators.conformant, T.conformant3),
    },
    {
      level: 3,
      id: "annotated3",
      indicator: "annotated",
      threshold: T.annotated3,
      ...atLeast(indicators.annotated, T.annotated3),
    },
    { level: 3, id: "guidance3", indicator: "guidance", threshold: 0, ...atMost(indicators.guidance, 0) },
    { level: 3, id: "wideTables3", indicator: "wideTables", threshold: 0, ...atMost(indicators.wideTables, 0) },
    {
      level: 3,
      id: "glossary3",
      indicator: "glossary",
      threshold: T.glossary3,
      ...atLeast(indicators.glossary, T.glossary3),
    },
    { level: 3, id: "tours3", indicator: "tours", threshold: T.tours3, ...atLeast(indicators.tours, T.tours3) },
    {
      level: 4,
      id: "takeover4",
      indicator: "takeover",
      threshold: Math.min(T.takeover4, indicators.takeover.total),
      ok: indicators.takeover.n >= Math.min(T.takeover4, indicators.takeover.total),
    },
    { level: 4, id: "proofs4", indicator: "proofs", threshold: T.proofs4, ...atLeast(indicators.proofs, T.proofs4) },
    {
      level: 4,
      id: "completeness4",
      indicator: "completeness",
      threshold: T.completeness4,
      ...atLeast(indicators.completeness, T.completeness4),
    },
    {
      level: 4,
      id: "tooLong4",
      indicator: "tooLong",
      threshold: T.tooLong4,
      ...atMost(indicators.tooLong, T.tooLong4),
    },
    {
      level: 4,
      id: "upToDate4",
      indicator: "upToDateCaptures",
      threshold: T.upToDate4,
      ...atLeast(indicators.upToDateCaptures, T.upToDate4),
    },
    {
      level: 4,
      id: "upToDatePages4",
      indicator: "upToDatePages",
      threshold: T.upToDatePages4,
      ...atLeast(indicators.upToDatePages, T.upToDatePages4),
    },
    ...depthCriteria(indicators),
  ].sort((a, b) => a.level - b.level);
}

/** The criteria of the depth of the feature sheets (engine/audit/depth.mjs): one of level 3, two of level 4. */
const depthCriteria = (indicators) => [
  {
    level: 3,
    id: "featureSheets3",
    indicator: "featureSheets",
    threshold: THRESHOLDS.featureSheets3,
    ...atLeast(indicators.featureSheets, THRESHOLDS.featureSheets3),
  },
  {
    level: 4,
    id: "scenarios4",
    indicator: "scenarios",
    threshold: THRESHOLDS.scenarios4,
    ...atLeast(indicators.scenarios, THRESHOLDS.scenarios4),
  },
  {
    level: 4,
    id: "behaviourDepth4",
    indicator: "behaviourDepth",
    threshold: THRESHOLDS.behaviourDepth4,
    ...atLeast(indicators.behaviourDepth, THRESHOLDS.behaviourDepth4),
  },
];

/** Level reached by a list of criteria: every criterion of each level up to it is met. */
export function levelOf(criteria) {
  let level = 0;
  for (const L of [1, 2, 3, 4]) {
    if (criteria.filter((c) => c.level === L).every((c) => c.ok)) level = L;
    else break;
  }
  return level;
}
