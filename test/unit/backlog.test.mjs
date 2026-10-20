// The backlog of a documentation (engine/build/backlog.mjs, ARCHITECTURE.md §6.8b): a feature's depth, the epics of
// the table of contents, each feature in its epic, each story with its version and criteria, the checks; then in a
// build: the ticket links of the stories (config.backlog.refs) and ::stories{}.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { featureDepth, backlogModel } from "../../engine/build/backlog.mjs";
import { buildBusiness, businessCopy, testEngine } from "../tools/helpers.mjs";

const counts = (answered, na, unknown, missing) => ({ answered, na, unknown, missing });

describe("featureDepth", () => {
  test("the mean of the criteria that apply: a sheet, stories, their criteria, rules, the rubrics of its cards", () => {
    const full = { sheet: { conformant: true, guidance: 0 }, stories: 2, storiesWithCriteria: 2, rules: 1 };
    assert.equal(featureDepth({ ...full, rubrics: { answered: 4, total: 4 } }).score, 100);
    const noCards = featureDepth({ ...full, rubrics: { answered: 0, total: 0 } });
    assert.equal(noCards.score, 100, "without cards, the rubrics do not apply");
    assert.equal(noCards.criteria.find((c) => c.key === "rubrics")?.value, null);
    assert.equal(
      featureDepth({ ...full, sheet: { conformant: false, guidance: 0 }, rubrics: { answered: 1, total: 2 } }).score,
      Math.round(((0.5 + 1 + 1 + 1 + 0.5) / 5) * 100),
    );
    const empty = featureDepth({
      sheet: null,
      stories: 0,
      storiesWithCriteria: 0,
      rules: 0,
      rubrics: { answered: 0, total: 0 },
    });
    assert.equal(empty.score, 0);
    assert.deepEqual(
      empty.criteria.map((c) => c.key),
      ["sheet", "stories", "criteria", "rules", "rubrics"],
    );
  });
});

describe("backlogModel", () => {
  const page = (id, extra = {}) => ({ id, title: id, ...extra });
  const toc = {
    sections: [
      {
        id: "product",
        title: "Product",
        groups: [
          {
            title: "Find an order",
            epic: "E-01",
            summary: "Find it.",
            ref: "ADO#120",
            pages: [page("p/track"), page("p/view", { since: "1.2", ref: "nope ref" })],
          },
          { title: "Approve", pages: [page("p/approve", { epic: "E-01" }), page("p/export")] },
          { title: "Twice", epic: "E-01", pages: [] },
          { title: "Elsewhere", pages: [page("p/lost", { epic: "E-09" })] },
          { title: "Prose", pages: [page("p/rules"), page("p/notes", { since: "2.0" })] },
        ],
      },
    ],
  };
  const features = new Map(
    [
      ["F-01", "p/track"],
      ["F-02", "p/view"],
      ["F-03", "p/approve"],
      ["F-04", "p/export"],
      ["F-05", "p/lost"],
    ].map(([id, p]) => [id, { id, title: `T ${id}`, summary: "", page: p }]),
  );
  const stories = new Map([
    ["US-01", { title: "a", page: "p/track", anchor: "us-01", role: "Manager", since: "1.10", ref: "PROJ-1" }],
    ["US-02", { title: "b", page: "p/track", anchor: "us-02", role: "Manager" }],
    ["US-03", { title: "c", page: "p/view", anchor: "us-03", role: "Approver" }],
    ["US-04", { title: "d", page: "p/rules", anchor: "us-04" }],
  ]);
  const cards = new Map([
    ["B-01", { id: "B-01", kind: "search", page: "p/track", feature: null, counts: counts(3, 1, 0, 0) }],
    ["B-02", { id: "B-02", kind: "export", page: "p/rules", feature: "F-04", counts: counts(1, 0, 1, 0) }],
  ]);
  const m = backlogModel({
    toc,
    features,
    stories,
    scenarios: [{ story: "US-01" }, { story: "US-01" }, { story: null }],
    rules: new Map([
      ["BR-1", { page: "p/track" }],
      ["BR-2", { page: "p/rules" }],
    ]),
    cards,
    // p/track cites BR-1 (its own) and BR-2 (defined on p/rules): two rules; p/view cites BR-2 and BR-404 (defined
    // nowhere, not a rule): one.
    cited: new Map([
      ["p/track", new Set(["BR-1", "BR-2"])],
      ["p/view", new Set(["BR-2", "BR-404"])],
    ]),
    sheets: { "p/track": { conformant: true, guidance: 0 }, "p/view": { conformant: true, guidance: 2 } },
  });

  test("the epics: the groups that name one, the groups of sheets that do not; a duplicate id reported", () => {
    assert.deepEqual(
      m.epics.map((e) => [e.id, e.title, e.features]),
      [
        ["E-01", "Find an order", ["F-01", "F-02", "F-03"]],
        [null, "Approve", ["F-04"]],
        [null, "Elsewhere", ["F-05"]],
      ],
    );
    assert.equal(m.epics[0].summary, "Find it.");
    assert.equal(m.epics[0].ref, "ADO#120");
    assert.deepEqual(
      m.problems.filter((p) => p.key.startsWith("epic.")).map((p) => [p.key, p.vars.id, p.strict]),
      [
        ["epic.duplicate", "E-01", true],
        ["epic.unknown", "E-09", true],
      ],
    );
  });

  test("a feature: its version and ticket, roles, kinds, rules, stories, criteria and depth", () => {
    const f1 = m.features.find((f) => f.id === "F-01");
    assert.deepEqual(
      { ...f1, depth: f1.depth.score },
      {
        id: "F-01",
        title: "T F-01",
        summary: "",
        page: "p/track",
        epic: "E-01",
        since: null,
        ref: null,
        roles: ["Manager"],
        kinds: ["search"],
        rules: 2,
        stories: ["US-01", "US-02"],
        criteria: 2,
        depth: Math.round(((1 + 1 + 0.5 + 1 + 1) / 5) * 100),
        // The rubrics of its cards, counted for the audit (behaviourDepth): all four answered.
        rubrics: { answered: 4, total: 4 },
      },
    );
    const f2 = m.features.find((f) => f.id === "F-02");
    assert.equal(f2.since, "1.2");
    assert.equal(f2.rules, 1, "a rule cited, defined on another page; a citation of a rule defined nowhere: none");
    assert.equal(f2.depth.criteria[0].value, 0.5, "guidance left in its sheet");
    assert.deepEqual(m.features.find((f) => f.id === "F-04").kinds, ["export"], "a card naming its feature");
    assert.equal(m.features.find((f) => f.id === "F-05").epic, null, "an unknown epic: none");
  });

  test("the stories: their own version, else their feature's; one outside a feature sheet reported", () => {
    assert.deepEqual(
      m.stories.map((s) => [s.id, s.feature, s.since, s.criteria]),
      [
        ["US-01", "F-01", "1.10", 2],
        ["US-02", "F-01", null, 0],
        ["US-03", "F-02", "1.2", 0],
      ],
    );
    assert.deepEqual(
      m.problems.find((p) => p.key === "story.outside"),
      { key: "story.outside", vars: { id: "US-04", page: "p/rules" }, strict: false },
    );
    assert.deepEqual(m.versions, ["1.2", "1.10", null], "numerically, no version last");
    assert.deepEqual(
      m.problems.filter((p) => p.key === "backlog.ref").map((p) => p.vars),
      [{ id: "F-02", ref: "nope ref" }],
    );
  });
});

describe("in a build", () => {
  test("a story's ticket linked from config.backlog.refs; ::stories{}; an unknown epic fails the build", async () => {
    const dir = businessCopy((toc) => {
      toc.sections[0].groups[0].epic = "E-01";
      toc.sections[0].groups[0].summary = "Approve the large orders.";
      return toc;
    });
    try {
      const rules = path.join(dir, "content", "use", "rules.md");
      fs.appendFileSync(rules, "\n\n## Stories\n\n::stories{}\n");
      const refs = { azure: "https://dev.azure.com/acme/shop/_workitems/edit/{id}" };
      const r = await buildBusiness({ root: dir, modify: (c) => ({ ...c, backlog: { refs } }) });
      assert.deepEqual(r.errors, []);
      const approval = r.data.pages["use/approval"].html;
      assert.match(
        approval,
        /<a class="puce reference" href="https:\/\/dev\.azure\.com\/acme\/shop\/_workitems\/edit\/121" target="_blank" rel="noopener noreferrer">ADO#121<\/a>/,
      );
      assert.doesNotMatch(approval, /data-ticket/);
      const table = r.data.pages["use/rules"].html;
      assert.match(table, /<th>User story<\/th>/);
      assert.match(table, /<td><a href="#\/use\/approval~us-01">US-01<\/a><\/td><td>Approve a large order<\/td>/);
      assert.match(table, /<td>1\.0<\/td><td>1<\/td><td><a class="puce reference" href="https:\/\/dev\.azure\.com/);
      // Without a template: the reference as written, never a link.
      const plain = await buildBusiness({ root: dir });
      assert.match(plain.data.pages["use/approval"].html, /<span class="puce reference">ADO#121<\/span>/);
      // A sheet naming an epic no group declares: an error of the strict build.
      const toc = JSON.parse(fs.readFileSync(path.join(dir, "content", "toc.json"), "utf8"));
      toc.sections[0].groups[0].pages[0].epic = "E-09";
      fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify(toc));
      const bad = await buildBusiness({ root: dir });
      assert.deepEqual(
        bad.errors.map((e) => e.key),
        ["epic.unknown"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("review of Lot 6a", () => {
  test("a backlog field on a page that is no feature sheet is reported; a large table of contents read in one pass", () => {
    const one = (pages) => ({ sections: [{ id: "s", title: "S", groups: [{ title: "G", epic: "E-01", pages }] }] });
    const r = backlogModel({
      toc: one([{ id: "p/notes", title: "n", since: "2.0", ref: "ADO#1" }]),
      features: new Map(),
      stories: new Map(),
      scenarios: [],
      rules: new Map(),
      cards: new Map(),
      sheets: {},
    });
    assert.deepEqual(
      r.problems.map((p) => [p.key, p.vars.field]),
      [
        ["backlog.field", "since"],
        ["backlog.field", "ref"],
      ],
    );
    /** The time of the model of n features in one epic, the best of two runs. */
    const timed = (n) => {
      const pages = Array.from({ length: n }, (_, k) => ({ id: `p/${k}`, title: `${k}` }));
      const features = new Map(
        pages.map((p, k) => [`F-${k}`, { id: `F-${k}`, title: p.title, summary: "", page: p.id }]),
      );
      const p = { toc: one(pages), features, stories: new Map(), scenarios: [], rules: new Map(), cards: new Map() };
      let best = Infinity;
      for (let k = 0; k < 2; k++) {
        const start = performance.now();
        assert.equal(backlogModel({ ...p, sheets: {} }).epics[0].features.length, n);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const [small, large] = [10_000, 40_000].map(timed);
    // A search per feature (quadratic) grows ×16 for ×4 features; one pass about ×4.
    assert.ok(large < 50 || large / small < 8, `${small.toFixed(0)} → ${large.toFixed(0)} ms`);
  });

  test("::recits{} is ::stories{}; a hostile reference and a template with a quote stay escaped", async () => {
    const { render } = testEngine({ language: "fr" });
    assert.match(render("::recits{}").html, /<div class="biz-directive" data-biz="stories"><\/div>/);
    const dir = businessCopy();
    try {
      const approval = path.join(dir, "content", "use", "approval.md");
      fs.writeFileSync(
        approval,
        fs.readFileSync(approval, "utf8").replace('ref="ADO#121"', 'ref="<img src=x onerror=alert(1)>"'),
      );
      const evil = { azure: 'https://x.example.test/{id}"onmouseover="alert(1)' };
      const r = await buildBusiness({ root: dir, modify: (c) => ({ ...c, backlog: { refs: evil } }) });
      const html = r.data.pages["use/approval"].html;
      assert.match(html, /<span class="puce reference">&lt;img src=x onerror=alert\(1\)&gt;<\/span>/);
      assert.doesNotMatch(html, /<img src=x/);
      fs.writeFileSync(
        approval,
        fs.readFileSync(approval, "utf8").replace('ref="<img src=x onerror=alert(1)>"', 'ref="ADO#7"'),
      );
      const linked = (await buildBusiness({ root: dir, modify: (c) => ({ ...c, backlog: { refs: evil } }) })).data
        .pages["use/approval"].html;
      assert.match(linked, /href="https:\/\/x\.example\.test\/7&quot;onmouseover=&quot;alert\(1\)"/);
      assert.doesNotMatch(linked, /"onmouseover="/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("in a build of two languages, a problem of the backlog is reported once", async () => {
    const dir = businessCopy((toc) => {
      toc.sections[0].groups[0].pages[0].epic = "E-09";
      return toc;
    });
    try {
      const r = await buildBusiness({ root: dir, draft: true, modify: (c) => ({ ...c, languages: ["en", "fr"] }) });
      assert.equal(r.warnings.filter((w) => w.key === "epic.unknown").length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
