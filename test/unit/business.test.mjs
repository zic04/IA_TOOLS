// Business space (ARCHITECTURE.md §6.8): the Markdown extensions (:::rule, [[feature …]], [[rule …]], ::features,
// ::rules, ::roles), the feature registry built from the table of contents, and the citation/table resolution that
// runs once every page has rendered (engine/build/business.mjs). English and French spellings both tested (§6.6).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { testEngine, buildBusiness, businessCopy, tempDir, KIT_ROOT } from "../tools/helpers.mjs";
import {
  hasTechnicalProof,
  buildFeatureRegistry,
  resolveBusinessRefs,
  BUSINESS_TYPES,
} from "../../engine/build/business.mjs";
import { segmentOf, candidateFeatures, mergeFeatures } from "../../cli/commands/inventory.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { indexPage } from "../../engine/build/search.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import fs from "node:fs";
import path from "node:path";

const t = createI18n({ language: "en" }).t;

describe(":::rule container (and :::regle)", () => {
  test("renders a div.regle with an h3 (id in lower case, 'ID · title', the usual anchor link); registers the rule", () => {
    const { render, engine } = testEngine();
    const r = render(
      ':::rule{id="BR-12" title="An order above the threshold waits for a manager"}\nStatement.\n:::',
      "use/rules",
    );
    assert.match(
      r.html,
      /<div class="regle"><h3 id="br-12">BR-12 · An order above the threshold waits for a manager<a class="ancre" href="#\/use\/rules~br-12"/,
    );
    assert.deepEqual(engine.rules.get("BR-12"), {
      title: "An order above the threshold waits for a manager",
      page: "use/rules",
      anchor: "br-12",
    });
    // In the page outline: a heading niveau 3 with that id.
    assert.ok(r.toc.some((x) => x.id === "br-12" && x.niveau === 3));
    // In the search index (search.mjs splits on <h[23] id="…">, exactly like a real heading).
    const index = indexPage([], "use/rules", "Rules", r.html);
    assert.ok(
      index.some(
        (e) =>
          e.p === "use/rules" && e.a === "br-12" && e.t === "BR-12 · An order above the threshold waits for a manager",
      ),
    );
  });

  test("the French spelling (:::regle, titre) renders and registers identically", () => {
    const { render, engine } = testEngine();
    render(':::regle{id="RG-01" titre="Une règle"}\nÉnoncé.\n:::', "p");
    assert.deepEqual(engine.rules.get("RG-01"), { title: "Une règle", page: "p", anchor: "rg-01" });
  });

  test("rule.duplicate: the same id defined twice", () => {
    const { render, reports } = testEngine();
    render(':::rule{id="BR-01" title="A"}\nX.\n:::', "p1");
    render(':::rule{id="BR-01" title="B"}\nY.\n:::', "p2");
    assert.deepEqual(
      reports.filter((r) => r.key === "rule.duplicate"),
      [{ strict: true, kind: "rule", key: "rule.duplicate", vars: { page: "p2", id: "BR-01" } }],
    );
  });

  test("rule.attributes: without id or without title", () => {
    const { render, reports } = testEngine();
    render(':::rule{title="No id"}\nX.\n:::', "p");
    render(':::rule{id="BR-02"}\nX.\n:::', "p");
    assert.deepEqual(
      reports.filter((r) => r.key === "rule.attributes").map((r) => r.vars),
      [{ page: "p" }, { page: "p" }],
    );
  });
});

describe("citations: [[feature …]] / [[rule …]] (and [[fonctionnalite …]] / [[regle …]])", () => {
  test("left as a placeholder at render time (resolved only once every page has rendered)", () => {
    const { render } = testEngine();
    const r = render("[[feature F-01]] and [[rule BR-12]], or [[fonctionnalite F-01]] and [[regle BR-12]].", "p");
    assert.match(r.html, /<span class="ref-feature" data-ref-id="F-01">F-01<\/span>/);
    assert.match(r.html, /<span class="ref-rule" data-ref-id="BR-12">BR-12<\/span>/g);
  });
});

describe("::features{} / ::rules{} / ::roles{} (and ::fonctionnalites{} / ::regles{})", () => {
  test("left as a placeholder div at render time", () => {
    const { render } = testEngine();
    for (const [kind, markup] of [
      ["features", "::features{}"],
      ["features", "::fonctionnalites{}"],
      ["rules", "::rules{}"],
      ["rules", "::regles{}"],
      ["roles", "::roles{}"],
    ]) {
      const r = render(markup, "p");
      assert.equal(r.html.trim(), `<div class="biz-directive" data-biz="${kind}"></div>`, markup);
    }
  });
});

describe("buildFeatureRegistry (content/toc.json, before any page renders)", () => {
  const toc = (pages) => ({ sections: [{ id: "s", groups: [{ pages }] }] });

  test("one feature, registered with its toc fields", () => {
    const { features, problems } = buildFeatureRegistry({
      toc: toc([
        {
          id: "p",
          title: "Order approval",
          summary: "…",
          template: "feature",
          feature: "F-01",
          permissions: ["orders:approve"],
        },
      ]),
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(features.get("F-01"), {
      id: "F-01",
      title: "Order approval",
      summary: "…",
      permissions: ["orders:approve"],
      page: "p",
    });
  });

  test('feature.template: a page names a feature id without template "feature"', () => {
    const { features, problems } = buildFeatureRegistry({
      toc: toc([{ id: "p", title: "T", template: "screen", feature: "F-01" }]),
    });
    assert.equal(features.size, 0);
    assert.deepEqual(problems, [{ key: "feature.template", vars: { page: "p", template: "screen" }, strict: true }]);
  });

  test("feature.duplicate: the same id on two pages", () => {
    const { features, problems } = buildFeatureRegistry({
      toc: toc([
        { id: "a", title: "A", template: "feature", feature: "F-01" },
        { id: "b", title: "B", template: "feature", feature: "F-01" },
      ]),
    });
    assert.equal(features.size, 1);
    assert.equal(features.get("F-01").page, "a");
    assert.deepEqual(problems, [
      { key: "feature.duplicate", vars: { id: "F-01", page: "b", first: "a" }, strict: true },
    ]);
  });

  test('feature.noId: a page of template "feature" without a feature id — a warning, never blocking', () => {
    const { problems } = buildFeatureRegistry({ toc: toc([{ id: "p", title: "T", template: "feature" }]) });
    assert.deepEqual(problems, [{ key: "feature.noId", vars: { page: "p" }, strict: false }]);
  });
});

describe("resolveBusinessRefs (second pass, once every page has rendered)", () => {
  test("feature.unknown / rule.unknown: an unresolved citation becomes plain text and is reported", () => {
    const pages = {
      p: {
        html: 'See <span class="ref-feature" data-ref-id="F-99">F-99</span> and <span class="ref-rule" data-ref-id="BR-99">BR-99</span>.',
      },
    };
    const { problems } = resolveBusinessRefs({ pages, features: new Map(), rules: new Map(), t });
    assert.equal(pages.p.html, "See F-99 and BR-99.");
    assert.deepEqual(
      problems.sort((a, b) => a.key.localeCompare(b.key)),
      [
        { key: "feature.unknown", vars: { page: "p", id: "F-99" }, strict: true },
        { key: "rule.unknown", vars: { page: "p", id: "BR-99" }, strict: true },
      ],
    );
  });

  test("a known citation becomes a link chip with the sheet's or the rule's title", () => {
    const pages = {
      p: {
        html: '<span class="ref-feature" data-ref-id="F-01">F-01</span> <span class="ref-rule" data-ref-id="BR-12">BR-12</span>',
      },
    };
    const features = new Map([["F-01", { id: "F-01", title: "Order approval", page: "use/approval" }]]);
    const rules = new Map([["BR-12", { title: "Threshold rule", page: "use/rules", anchor: "br-12" }]]);
    const { problems } = resolveBusinessRefs({ pages, features, rules, t });
    assert.deepEqual(problems, []);
    assert.equal(
      pages.p.html,
      '<a class="puce fonctionnalite" href="#/use/approval" title="Order approval">F-01</a> <a class="puce regle" href="#/use/rules~br-12" title="Threshold rule">BR-12</a>',
    );
  });

  test("a rule cited on a page object that sits before its own definition in `pages` still resolves (object order is irrelevant: the pass runs once every page has rendered)", () => {
    const pages = {
      "use/approval": { titre: "Approval", html: '<span class="ref-rule" data-ref-id="BR-12">BR-12</span>' },
      "use/rules": { titre: "Rules", html: "defines it" },
    };
    const rules = new Map([["BR-12", { title: "Threshold rule", page: "use/rules", anchor: "br-12" }]]);
    const { problems } = resolveBusinessRefs({ pages, features: new Map(), rules, t });
    assert.deepEqual(problems, []);
    assert.match(pages["use/approval"].html, /href="#\/use\/rules~br-12"/);
  });

  test('::features{} / ::rules{} / ::roles{}: table content, and the "cited by" column', () => {
    const pages = {
      a: { titre: "A", html: '<div class="biz-directive" data-biz="features"></div>' },
      b: { titre: "B", html: '<div class="biz-directive" data-biz="rules"></div>' },
      c: {
        titre: "C",
        html: '<div class="biz-directive" data-biz="roles"></div><span class="ref-rule" data-ref-id="BR-12">BR-12</span>',
      },
    };
    const features = new Map([
      [
        "F-01",
        {
          id: "F-01",
          title: "Order approval",
          summary: "Large orders wait.",
          permissions: ["orders:approve"],
          page: "a",
        },
      ],
    ]);
    const rules = new Map([["BR-12", { title: "Threshold rule", page: "b", anchor: "br-12" }]]);
    resolveBusinessRefs({ pages, features, rules, t });
    assert.match(
      pages.a.html,
      /<td>F-01<\/td><td><a href="#\/a">Order approval<\/a><\/td><td>Large orders wait\.<\/td><td>orders:approve<\/td>/,
    );
    // "Cited by" lists the feature id of the citing page, else the page id itself (c is not a feature sheet).
    assert.match(
      pages.b.html,
      /<a href="#\/b~br-12">BR-12<\/a><\/td><td>Threshold rule<\/td><td><a href="#\/b">B<\/a><\/td><td>c<\/td>/,
    );
    assert.match(pages.c.html, /<th>Feature<\/th><th>orders:approve<\/th>/);
    assert.match(
      pages.c.html,
      /<a href="#\/a">Order approval<\/a><\/td><td><span class="sr-only">Allowed<\/span>✔<\/td>/,
    );
  });
});

describe("business.technical: a business page citing code", () => {
  test("hasTechnicalProof: a file:line code span or a claim badge; never plain prose", () => {
    assert.ok(hasTechnicalProof("See `lib/orders.ts:42` for the real rule."));
    assert.ok(hasTechnicalProof("[[verified lib/orders.ts:42]]"));
    assert.ok(!hasTechnicalProof("The order waits for a manager, in plain business language."));
    assert.ok(!hasTechnicalProof("Version 2.4.0 shipped on 2026-09-15."));
  });

  test("BUSINESS_TYPES: exactly the types of standard/templates/business.json (only they must cite no code)", () => {
    const fragment = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "standard", "templates", "business.json"), "utf8"));
    assert.deepEqual([...BUSINESS_TYPES].sort(), Object.keys(fragment.types).sort());
  });
});

describe("glossary `technical` (§6.8)", () => {
  test("site data glossaire[].tech: present with the field, absent without it", async () => {
    const r = await buildBusiness();
    const byTerm = Object.fromEntries(r.data.glossaire.map((g) => [g.terme, g]));
    assert.equal(byTerm.Order.tech, "table `orders`, column `status`");
    assert.ok(!("tech" in byTerm.Manager));
  });
});

describe("the fixture project: end-to-end resolution through a real build", () => {
  test("builds cleanly; a rule cited before its own definition resolves; business.technical fires only in the business space", async () => {
    const r = await buildBusiness();
    assert.deepEqual(r.errors, []);
    const technical = r.warnings.filter((w) => w.key === "business.technical");
    assert.deepEqual(technical, [{ kind: "business", key: "business.technical", vars: { page: "use/proof" } }]);
    // use/approval cites BR-12, defined further down the table of contents, on use/rules.
    assert.match(
      r.data.pages["use/approval"].html,
      /<a class="puce regle" href="#\/use\/rules~br-12" title="An order above the threshold waits for a manager">BR-12<\/a>/,
    );
    // take-over/notes cites the feature sheet; its own file:line proof never raises business.technical (not business).
    assert.match(
      r.data.pages["take-over/notes"].html,
      /<a class="puce fonctionnalite" href="#\/use\/approval" title="Order approval">F-01<\/a>/,
    );
    assert.match(r.data.pages["use/rules"].html, /F-01/);
    assert.match(r.data.pages["use/rules"].html, /orders:approve/);
  });

  test("glossary.tech: kept in the full site and the takeover export, dropped from the business export", async () => {
    const r = await buildBusiness();
    assert.equal(r.data.glossaire[0].tech, "table `orders`, column `status`");
    const business = r.sites.find((s) => s.space === "business");
    const takeover = r.sites.find((s) => s.space === "takeover");
    assert.ok(!("tech" in business.data.glossaire[0]));
    assert.equal(takeover.data.glossaire[0].tech, "table `orders`, column `status`");
    assert.ok(!business.html.includes("table `orders`, column `status`"));
    assert.ok(takeover.html.includes("table `orders`, column `status`"));
  });

  test("an unknown citation fails a strict build, is only a warning with --draft", async () => {
    const dir = businessCopy();
    try {
      fs.appendFileSync(path.join(dir, "content/use/proof.md"), "\n[[feature F-404]]\n");
      const strict = await buildBusiness({ root: dir });
      assert.deepEqual(
        strict.errors.map((e) => e.key),
        ["feature.unknown"],
      );
      const draft = await buildBusiness({ root: dir, draft: true });
      assert.deepEqual(draft.errors, []);
      assert.ok(draft.warnings.some((w) => w.key === "feature.unknown"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("doc-kit inventory --features (ARCHITECTURE.md §6.8)", () => {
  test('segmentOf: the first static segment of a route, an API route (its "api" segment ignored) or an i18n key', () => {
    assert.equal(segmentOf("/orders"), "orders");
    assert.equal(segmentOf("/orders/[id]"), "orders");
    assert.equal(segmentOf("/orders/new"), "orders");
    assert.equal(segmentOf("GET /api/orders/{id}"), "orders");
    assert.equal(segmentOf("orders.title"), "orders");
  });

  test("candidateFeatures: grouped, a suggested id per group in order, and the features.json entry already covering it", () => {
    const adapters = [
      {
        available: true,
        families: [{ items: [{ id: "/orders" }, { id: "/orders/[id]" }, { id: "GET /api/orders/{id}" }] }],
      },
      { available: true, families: [{ items: [{ id: "settings.title" }] }] },
      { available: false, families: [{ items: [{ id: "/ignored" }] }] },
    ];
    const existing = [{ id: "F-07", routes: ["/orders/[id]"] }];
    const candidates = candidateFeatures(adapters, existing);
    assert.deepEqual(candidates, [
      {
        id: "F-01",
        name: "Orders",
        routes: ["/orders", "/orders/[id]"],
        api: ["GET /api/orders/{id}"],
        keys: [],
        sheet: "F-07",
      },
      { id: "F-02", name: "Settings", routes: [], api: [], keys: ["settings.title"] },
    ]);
  });

  test("mergeFeatures (--force): existing entries kept as they are, only the candidates with no shared route appended, numbered after the highest existing id", () => {
    const existing = [{ id: "F-03", title: "Already there", routes: ["/orders"] }];
    const candidates = [
      { id: "F-01", name: "Orders", routes: ["/orders"], api: [], keys: [] }, // overlaps F-03: not appended
      { id: "F-02", name: "Settings", routes: ["/settings"], api: [], keys: [] },
    ];
    assert.deepEqual(mergeFeatures(existing, candidates), [
      { id: "F-03", title: "Already there", routes: ["/orders"] },
      { id: "F-04", title: "Settings", routes: ["/settings"] },
    ]);
  });

  async function cli(args, cwd) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
    });
    return { code, out, err };
  }

  test("--json: the candidates; --write writes features.json; refused when it exists (exit code 1) unless --force", async () => {
    const dir = tempDir("doc-kit-inventory-features-");
    try {
      fs.writeFileSync(
        path.join(dir, "doc.config.mjs"),
        'export default { product: { name: "Acme Orders" }, language: "en", app: { url: "http://x" }, auth: { adapter: "none" }, coverage: [{ adapter: "local:routes.mjs" }] };',
      );
      // A tiny local adapter (ARCHITECTURE.md §5), the simplest way to control exactly which ids are inventoried.
      fs.writeFileSync(
        path.join(dir, "routes.mjs"),
        'export default { name: "routes", options: {}, async inventory() { return { available: true, families: [{ name: "Routes", items: [{ id: "/orders" }] }] }; } };',
      );
      fs.mkdirSync(path.join(dir, "content"));
      fs.writeFileSync(
        path.join(dir, "content/toc.json"),
        JSON.stringify({
          title: "T",
          sections: [{ id: "s", title: "S", groups: [{ pages: [{ id: "s/p", title: "P" }] }] }],
        }),
      );
      fs.mkdirSync(path.join(dir, "content/s"), { recursive: true });
      fs.writeFileSync(path.join(dir, "content/s/p.md"), "Text.");

      const json = await cli(["inventory", "--features", "--json", "--project", dir]);
      assert.equal(json.code, 0, json.err);
      assert.deepEqual(JSON.parse(json.out), [{ id: "F-01", name: "Orders", routes: ["/orders"], api: [], keys: [] }]);

      const write1 = await cli(["inventory", "--features", "--write", "--project", dir]);
      assert.equal(write1.code, 0, write1.err);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "features.json"), "utf8")), [
        { id: "F-01", title: "Orders", routes: ["/orders"] },
      ]);

      const refused = await cli(["inventory", "--features", "--write", "--project", dir]);
      assert.equal(refused.code, 1);

      fs.writeFileSync(
        path.join(dir, "features.json"),
        JSON.stringify([{ id: "F-09", title: "Kept", routes: ["/other"] }]),
      );
      const forced = await cli(["inventory", "--features", "--write", "--force", "--project", dir]);
      assert.equal(forced.code, 0, forced.err);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "features.json"), "utf8")), [
        { id: "F-09", title: "Kept", routes: ["/other"] },
        { id: "F-10", title: "Orders", routes: ["/orders"] },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
