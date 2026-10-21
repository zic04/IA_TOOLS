// The Product board (ARCHITECTURE.md §6.8b): its data (engine/build/board.mjs, D.board), when a site has it — a space
// whose kind shows it, or ::board{} in a page — and when it does not (no ui.board.* texts then), a space's export,
// and the script of the site with its modules (engine/build/site-script.mjs). The drawing itself: test/e2e/board.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { boardData } from "../../engine/build/board.mjs";
import { siteScript } from "../../engine/build/site-script.mjs";
import { buildDemo, buildBusiness, businessCopy, demoCopy, tempDir, testEngine, KIT_ROOT } from "../tools/helpers.mjs";

describe("boardData", () => {
  const model = {
    epics: [{ id: "E-01", title: "Find", summary: "s", ref: "ADO#120", features: ["F-01"] }],
    features: [
      {
        id: "F-01",
        title: "Track",
        summary: "",
        page: "p/track",
        epic: "E-01",
        since: "1.0",
        ref: "nope ref",
        roles: ["Manager"],
        kinds: ["search", "custom"],
        rules: 2,
        criteria: 3,
        stories: ["US-01"],
        depth: {
          score: 80,
          criteria: [
            { key: "sheet", value: 1 },
            { key: "rubrics", value: null },
          ],
        },
      },
    ],
    stories: [
      {
        id: "US-01",
        title: "a",
        role: "Manager",
        since: "1.0",
        ref: "PROJ-7",
        feature: "F-01",
        page: "p/track",
        anchor: "us-01",
        criteria: 3,
      },
    ],
    versions: ["1.0", null],
  };
  const kinds = new Map([["search", { id: "search", title: { en: "Search", fr: "Recherche" }, icon: "search" }]]);

  test("tickets linked from the project's addresses only, kinds in the site's language, depth as values", () => {
    const d = boardData(model, {
      refs: { azure: "https://dev.azure.com/a/b/_workitems/edit/{id}" },
      kinds,
      language: "fr",
      iconKey: (n) => `k-${n}`,
    });
    assert.deepEqual(d.epics[0].ticket, { text: "ADO#120", url: "https://dev.azure.com/a/b/_workitems/edit/120" });
    assert.deepEqual(d.features[0].ticket, { text: "nope ref" }, "no form the kit reads: no link");
    assert.deepEqual(d.stories[0].ticket, { text: "PROJ-7" }, "no Jira address: no link");
    assert.deepEqual(d.kinds, {
      search: { title: "Recherche", icon: "k-search" },
      custom: { title: "custom", icon: "k-mecanisme" },
    });
    assert.deepEqual(d.features[0].depth, { score: 80, criteria: [1, null] });
    assert.deepEqual(d.versions, ["1.0", null]);
  });
});

describe("D.board in a site", () => {
  test("the demo: its Product space shows the board, its epics, features and stories; its export keeps it", async () => {
    const r = await buildDemo();
    assert.deepEqual(r.errors, []);
    const { board, spaces } = r.data;
    assert.equal(spaces.find((s) => s.id === "product")?.board, true);
    assert.equal(spaces.find((s) => s.id === "use")?.board, undefined);
    assert.deepEqual(
      board.epics.map((e) => e.id),
      ["E-01", "E-02"],
    );
    assert.deepEqual(
      board.features.map((f) => [f.id, f.since, f.rules]),
      [
        ["F-01", "1.0", 2],
        ["F-02", "1.2", 1],
      ],
    );
    assert.ok(board.stories.length >= 4);
    assert.ok("ui.board.title" in r.data.i18n);
    const product = r.sites.find((s) => s.space === "product");
    const use = r.sites.find((s) => s.space === "use");
    assert.equal(product.data.board.features.length, 2);
    assert.equal(use.data.board, undefined);
  });

  test("a space's export: the features whose sheet it keeps, only where it is shown; else neither board nor texts", async () => {
    const dir = demoCopy();
    try {
      // F-02's sheet goes to the Use space: the Product export keeps F-01 and its epic only.
      const tocFile = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(tocFile, "utf8"));
      const pages = toc.sections.flatMap((s) => s.groups).flatMap((g) => g.pages);
      pages.find((p) => p.id === "features/approve-order").space = "use";
      fs.writeFileSync(tocFile, JSON.stringify(toc));
      const exportOf = (r, space) => r.sites.find((s) => s.space === space).data;
      const r = await buildDemo({ root: dir });
      assert.deepEqual(r.errors, []);
      const product = exportOf(r, "product");
      assert.deepEqual(
        product.board.features.map((f) => f.id),
        ["F-01"],
      );
      assert.deepEqual(
        product.board.epics.map((e) => [e.id, e.features]),
        [["E-01", ["F-01"]]],
      );
      assert.ok(product.board.stories.length && product.board.stories.every((s) => s.feature === "F-01"));
      // The Use export keeps F-02's sheet, but its kind does not show the board and none of its pages holds
      // ::board{}: no board, and none of its texts. Nor in the Admin export, which keeps no sheet.
      for (const space of ["use", "admin"]) {
        const d = exportOf(r, space);
        assert.equal(d.board, undefined, space);
        assert.ok(!Object.keys(d.i18n).some((k) => k.startsWith("ui.board.")), space);
      }
      // ::board{} in a page of the Use space: its export shows the board of what it keeps.
      fs.appendFileSync(path.join(dir, "content", "features", "approve-order.md"), "\n\n::board{}\n");
      const use = exportOf(await buildDemo({ root: dir }), "use");
      assert.deepEqual(
        use.board.epics.map((e) => [e.id, e.features]),
        [["E-02", ["F-02"]]],
      );
      assert.ok("ui.board.title" in use.i18n);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("::tableau{} is ::board{}: the placeholder of the second pass", () => {
    for (const [language, directive] of [
      ["en", "::board{}"],
      ["fr", "::tableau{}"],
    ])
      assert.match(
        testEngine({ language }).render(directive).html,
        /<div class="biz-directive" data-biz="board"><\/div>/,
        directive,
      );
  });

  test("a site without a board space: no D.board, no ui.board texts; ::board{} in a page gives both", async () => {
    const plain = await buildBusiness();
    assert.equal(plain.data.board, undefined);
    assert.ok(!Object.keys(plain.data.i18n).some((k) => k.startsWith("ui.board.")));
    const dir = businessCopy();
    try {
      fs.appendFileSync(path.join(dir, "content", "use", "rules.md"), "\n\n## Backlog\n\n::board{}\n");
      const r = await buildBusiness({ root: dir });
      assert.deepEqual(r.errors, []);
      assert.match(r.data.pages["use/rules"].html, /<div class="tableau-produit" data-board><\/div>/);
      assert.deepEqual(
        r.data.board.features.map((f) => [f.id, f.rules]),
        [["F-01", 1]],
        "F-01 cites BR-12, defined on use/rules",
      );
      assert.ok("ui.board.view.map" in r.data.i18n);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the script of the site", () => {
  test("app.js with its modules in blocks, in file name order, at its marker; a folder without lib/ as it is", () => {
    const dir = tempDir("doc-kit-site-script-");
    try {
      fs.writeFileSync(path.join(dir, "app.js"), "(function () {\n  const EXT = {};\n  /* @lib */\n})();\n");
      assert.equal(siteScript(dir), fs.readFileSync(path.join(dir, "app.js"), "utf8"), "no lib/: as it is");
      fs.mkdirSync(path.join(dir, "lib"));
      fs.writeFileSync(path.join(dir, "lib", "b.js"), "function b() {}");
      fs.writeFileSync(path.join(dir, "lib", "a.js"), "function a() {}");
      fs.writeFileSync(path.join(dir, "lib", "notes.txt"), "not a module");
      assert.equal(
        siteScript(dir),
        "(function () {\n  const EXT = {};\n  {\nfunction a() {}\n}\n{\nfunction b() {}\n}\n})();\n",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const kit = siteScript(path.join(KIT_ROOT, "engine", "site"));
    assert.doesNotMatch(kit, /\/\* @lib \*\//);
    assert.ok(kit.indexOf("const EXT = ") < kit.indexOf("EXT.hydrators.push"), "the modules after EXT");
  });
});
