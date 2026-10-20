// The depth of the feature sheets in the audit (standard/maturity.md, engine/audit/depth.mjs): featureSheets (level
// 3), scenarios and behaviourDepth (level 4), measured on the written feature sheets of the strict build's backlog;
// n/a without one, and with spaces declared but none of a kind that measures depth; by space, in the Product space
// only; their actions with the sheets and stories behind them; the report's table and its line about the backlog.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runAudit } from "../../engine/audit/audit.mjs";
import { depthOf, measuresDepth } from "../../engine/audit/depth.mjs";
import { renderMarkdown } from "../../engine/audit/report.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { demoCopy } from "../tools/helpers.mjs";

const NOW = new Date(Date.UTC(2026, 9, 1, 12));
/** No browser, no coverage adapter, no secrets check: only what the depth needs. */
const MEASURE = { tables: null, coverage: null, secrets: null };

async function audit(dir) {
  const { project, config } = await loadProject({ project: dir, env: {} });
  return runAudit({ project, config, measure: MEASURE, now: NOW, env: {} });
}
/** An audit of a copy of the demo, changed first. */
async function demoAudit(change = () => {}) {
  const dir = demoCopy();
  try {
    change(dir);
    return await audit(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const edit = (dir, rel, fn) => {
  const f = path.join(dir, rel);
  fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8")));
};
const values = (I) => ["featureSheets", "scenarios", "behaviourDepth"].map((k) => [I[k].n, I[k].total]);
const criterion = (r, id) => r.criteria.find((c) => c.id === id);

describe("depthOf", () => {
  const backlog = {
    features: [
      { id: "F-01", page: "p/a", stories: ["US-01", "US-02"], rubrics: { answered: 3, total: 4 } },
      { id: "F-02", page: "p/b", stories: [], rubrics: { answered: 0, total: 0 } },
      { id: "F-03", page: "p/draft", stories: ["US-03"], rubrics: { answered: 0, total: 5 } },
    ],
    stories: [
      { id: "US-01", feature: "F-01", criteria: 2 },
      { id: "US-02", feature: "F-01", criteria: 0 },
      { id: "US-03", feature: "F-03", criteria: 1 },
    ],
  };
  const pages = [
    { id: "p/a", written: true },
    { id: "p/b", written: true },
    { id: "p/draft", written: false },
  ];

  test("on the written sheets only: their stories, their stories' criteria, their cards' rubrics", () => {
    const { indicators, sets } = depthOf(backlog, pages, true);
    assert.deepEqual(values(indicators), [
      [1, 2],
      [1, 2],
      [3, 4],
    ]);
    assert.deepEqual(
      sets.sheets.map((f) => f.id),
      ["F-01", "F-02"],
      "the draft is written's",
    );
  });

  test("n/a when it does not apply, and without a written sheet; measured without spaces or with a Product kind", () => {
    for (const { indicators } of [depthOf(backlog, pages, false), depthOf(null, pages, true)])
      for (const k of ["featureSheets", "scenarios", "behaviourDepth"]) assert.equal(indicators[k].value, null, k);
    assert.equal(measuresDepth(null), true);
    assert.equal(measuresDepth([{ id: "use", profile: { depth: false } }]), false);
    assert.equal(
      measuresDepth([
        { id: "use", profile: {} },
        { id: "product", profile: { depth: true } },
      ]),
      true,
    );
  });
});

describe("the depth in the audit", () => {
  test("the demo: its two sheets, four stories, the rubrics of its cards; by space, the Product space alone", async () => {
    const r = await demoAudit();
    assert.deepEqual(values(r.indicators), [
      [2, 2],
      [4, 4],
      [15, 17],
    ]);
    assert.deepEqual(
      ["featureSheets3", "scenarios4", "behaviourDepth4"].map((id) => [criterion(r, id).level, criterion(r, id).ok]),
      [
        [3, true],
        [4, true],
        [4, false],
      ],
    );
    // The criteria by level, as the report lists them: featureSheets3 with level 3, before every level-4 one.
    const levels = r.criteria.map((c) => c.level);
    assert.deepEqual(
      levels,
      [...levels].sort((a, b) => a - b),
    );
    const ids = r.criteria.map((c) => c.id);
    assert.ok(ids.indexOf("featureSheets3") < ids.indexOf("takeover4"));
    const behaviour = r.actions.find((a) => a.key === "behaviourDepth");
    assert.deepEqual(behaviour.items, [
      { id: "features/approve-order", key: "rubrics", vars: { feature: "F-02", left: 2, total: 4 } },
    ]);
    const product = r.spaces.find((s) => s.id === "product");
    assert.deepEqual(values(product.indicators), [
      [2, 2],
      [4, 4],
      [15, 17],
    ]);
    const use = r.spaces.find((s) => s.id === "use");
    assert.equal(use.indicators.featureSheets.value, null, "n/a in a kind that does not measure depth");
    assert.ok(criterion(use, "behaviourDepth4").ok);
    // The report: the backlog in one line, then each feature.
    assert.deepEqual(r.depth.backlog, { epics: 2, features: 2, stories: 4, withCriteria: 4, versions: ["1.0", "1.2"] });
    assert.deepEqual(
      r.depth.features.map((f) => [f.id, f.state, f.score, f.criteria.rubrics]),
      [
        ["F-01", "written", 100, 1],
        ["F-02", "written", 90, 0.5],
      ],
    );
  });

  test("a sheet without a story, stories without criteria: the criteria fail, their actions name them", async () => {
    const r = await demoAudit((dir) => {
      edit(dir, "content/features/approve-order.md", (s) =>
        s
          .replace(/:::story\{id="US-04"[^\n]*\n[^\n]*\n:::\n/, "No story written yet.\n")
          .split(' story="US-04"')
          .join(""),
      );
      edit(dir, "content/features/track-orders.md", (s) =>
        s.split(' story="US-01"').join("").split(' story="US-03"').join(""),
      );
    });
    assert.deepEqual(values(r.indicators).slice(0, 2), [
      [1, 2],
      [1, 3],
    ]);
    assert.equal(criterion(r, "featureSheets3").ok, false);
    assert.equal(criterion(r, "scenarios4").ok, false);
    const stories = r.actions.find((a) => a.key === "featureStories");
    assert.equal(stories.level, 3);
    assert.deepEqual(stories.items, [
      { id: "features/approve-order", key: "featureStories", vars: { feature: "F-02" } },
    ]);
    const scenarios = r.actions.find((a) => a.key === "scenarios");
    assert.equal(scenarios.vars.need, 2, "80 % of 3 stories: 3, one has criteria");
    assert.deepEqual(
      scenarios.items.map((i) => [i.id, i.vars.page]),
      [
        ["US-01", "features/track-orders"],
        ["US-03", "features/track-orders"],
      ],
    );
    for (const language of ["en", "fr"]) {
      const md = renderMarkdown(r, createI18n({ language, vars: { command: "doc-kit" } }));
      assert.doesNotMatch(md, /cli\.(audit|build)\.[\w.]+/, `${language}: untranslated key`);
      assert.doesNotMatch(md, /\{\w+\}/, `${language}: variable left`);
    }
  });

  test("a feature sheet in a space whose kind does not measure depth: n/a there, still measured for the project", async () => {
    const r = await demoAudit((dir) =>
      edit(dir, "content/toc.json", (s) => {
        const toc = JSON.parse(s);
        const pages = toc.sections.flatMap((x) => x.groups).flatMap((g) => g.pages);
        pages.find((p) => p.id === "features/approve-order").space = "use";
        return JSON.stringify(toc);
      }),
    );
    const use = r.spaces.find((s) => s.id === "use");
    assert.equal(use.indicators.featureSheets.value, null, "F-02's sheet, in Use: not measured there");
    const product = r.spaces.find((s) => s.id === "product");
    assert.deepEqual([product.indicators.featureSheets.n, product.indicators.featureSheets.total], [1, 1]);
    assert.deepEqual([r.indicators.featureSheets.n, r.indicators.featureSheets.total], [2, 2], "the project: both");
  });

  test("spaces without a kind that measures depth: n/a, met", async () => {
    const r = await demoAudit((dir) =>
      edit(dir, "content/toc.json", (s) => {
        const toc = JSON.parse(s.split('"space": "product"').join('"space": "use"'));
        toc.spaces = toc.spaces.filter((x) => x !== "product");
        return JSON.stringify(toc);
      }),
    );
    for (const k of ["featureSheets", "scenarios", "behaviourDepth"]) assert.equal(r.indicators[k].value, null, k);
    assert.ok(criterion(r, "behaviourDepth4").ok && criterion(r, "behaviourDepth4").na);
    assert.equal(
      r.actions.find((a) => a.key === "behaviourDepth"),
      undefined,
    );
    assert.ok(r.depth, "the table stays: informative");
  });

  test("without spaces: measured on the feature sheets", async () => {
    const r = await demoAudit((dir) =>
      edit(dir, "content/toc.json", (s) => {
        // The demo without its spaces: no `spaces`, no `space` anywhere.
        const drop = (x) =>
          Array.isArray(x)
            ? x.map(drop)
            : x && typeof x === "object"
              ? Object.fromEntries(
                  Object.entries(x)
                    .filter(([k]) => k !== "space" && k !== "spaces")
                    .map(([k, v]) => [k, drop(v)]),
                )
              : x;
        return JSON.stringify(drop(JSON.parse(s)));
      }),
    );
    assert.equal(r.spaces, undefined);
    assert.deepEqual(values(r.indicators), [
      [2, 2],
      [4, 4],
      [15, 17],
    ]);
  });

  test("the report, in English and in French: the depth's indicators, criteria, table and backlog line", async () => {
    const r = await demoAudit();
    const en = renderMarkdown(r, createI18n({ language: "en", vars: { command: "doc-kit" } }));
    assert.match(
      en,
      /## Depth of the feature sheets\n\nBacklog: 2 epics · 2 features · 4 user stories \(4 with acceptance criteria\) · versions 1\.0, 1\.2\./,
    );
    assert.match(
      en,
      /\| F-02 · Approve an order \| `features\/approve-order` \(written\) \| 90% \| 100% \| 100% \| 100% \| 100% \| 50% \|/,
    );
    assert.match(en, /\| `behaviourDepth` \| 15 \/ 17 \(88\.2%\) \| ≥ 90% \(level 4\) \| ✖ \|/);
    assert.match(en, /Answer the rubrics left of the behaviour cards of the feature sheet below/);
    const fr = renderMarkdown(r, createI18n({ language: "fr", vars: { command: "doc-kit" } }));
    assert.match(fr, /## Profondeur des fiches de fonctionnalité/);
    assert.match(fr, /`features\/approve-order` — F-02 : 2 rubriques sur 4 sans réponse/);
  });
});
