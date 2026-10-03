// Agent context folder (ARCHITECTURE.md §6.11, lot V7): excerpts (pure), the budget (pure), buildContext on the
// sync fixtures (real pageDependencies) and on hand-built dependencies (labels, glossary, counterpart, --update,
// budget cuts), the CLI (missing/unknown page, --budget, --update without a report, --json).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { excerpts, buildContext, contextFileName, factsFor, glossaryFor } from "../../engine/context/context.mjs";
import { estimateTokens, fitBudget } from "../../engine/context/budget.mjs";
import { pageDependencies } from "../../engine/sync/dependencies.mjs";
import { runCoverage, adapterTools } from "../../engine/check/coverage.mjs";
import { loadPageTemplates } from "../../engine/core/page-templates.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { createI18n, loadDictionary } from "../../engine/i18n.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const SYNC_DOCS = path.join(KIT_ROOT, "test", "fixtures", "sync-docs");
const SYNC_APP = path.join(KIT_ROOT, "test", "fixtures", "sync-app");
const en = createI18n({ language: "en" }).t;

/** A sibling copy of sync-docs + sync-app (app.dir: "../sync-app" keeps resolving): removed by the caller. */
function syncFixtureCopy() {
  const base = tempDir("doc-kit-context-");
  const docs = path.join(base, "sync-docs");
  const app = path.join(base, "sync-app");
  fs.cpSync(SYNC_DOCS, docs, { recursive: true });
  fs.cpSync(SYNC_APP, app, { recursive: true });
  return { base, docs, app };
}

async function syncDocsConfig(root) {
  const raw = (await import(pathToFileURL(path.join(root, "doc.config.mjs")).href)).default;
  return prepareConfig(structuredClone(raw), { env: {} });
}

describe("excerpts (pure)", () => {
  test("a direct file of 400 lines or fewer is given whole, numbered, whatever the cited lines; a shared file never is", () => {
    const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
    const [ex] = excerpts(text, [[3, 3]]);
    assert.deepEqual([ex.from, ex.to, ex.extent], [1, 12, "whole"]);
    assert.equal(ex.text.split("\n")[0], "1│ line 1");
    assert.equal(ex.text.split("\n")[11], "12│ line 12");
    assert.deepEqual(
      excerpts(text, [], { kind: "shared" }),
      [],
      "a small shared file without cited line: its path only",
    );
    assert.deepEqual(
      excerpts(text, [[3, 3]], { kind: "shared" }).map((e) => [e.from, e.to, e.extent]),
      [[1, 12, "range"]],
    );
  });

  test("a file over 400 lines, no cited line: a direct file gives its first 200, a shared file gives nothing", () => {
    const text = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n");
    const direct = excerpts(text, [], { kind: "direct" });
    assert.equal(direct.length, 1);
    assert.deepEqual([direct[0].from, direct[0].to, direct[0].extent], [1, 200, "head"]);
    assert.deepEqual(excerpts(text, [], { kind: "shared" }), []);
  });

  test("a file over 400 lines with cited lines: ±40 around each, merged when they overlap", () => {
    const text = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n");
    // 100±40 = 60-140; 200±40 = 160-240: far apart, two ranges.
    const far = excerpts(
      text,
      [
        [100, 100],
        [200, 200],
      ],
      { kind: "direct" },
    );
    assert.deepEqual(
      far.map((e) => [e.from, e.to, e.extent]),
      [
        [60, 140, "range"],
        [160, 240, "range"],
      ],
    );
    // 100±40 = 60-140; 150±40 = 110-190: overlapping, merged into one.
    const near = excerpts(
      text,
      [
        [100, 100],
        [150, 150],
      ],
      { kind: "direct" },
    );
    assert.deepEqual(
      near.map((e) => [e.from, e.to]),
      [[60, 190]],
    );
    // Clamped at the file's bounds.
    assert.deepEqual(excerpts(text, [[1, 1]], { kind: "direct" })[0], {
      from: 1,
      to: 41,
      extent: "range",
      text: excerpts(text, [[1, 1]], { kind: "direct" })[0].text,
    });
  });

  test("an unreadable file (null) gives no excerpt at all; an empty file gives none either", () => {
    assert.deepEqual(excerpts(null, [[1, 1]]), []);
    assert.deepEqual(excerpts("", [[1, 1]]), []);
  });
});

describe("budget.mjs (pure)", () => {
  test("estimateTokens: characters ÷ 4, rounded up", () => {
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
    assert.equal(estimateTokens(""), 0);
  });

  test("fitBudget: page and sections never cut; shared (longest first), then excerpt (farthest first), then facts, then labels", () => {
    const parts = [
      { kind: "page", text: "PAGE", cutLine: "" },
      { kind: "sections", text: "SECTIONS", cutLine: "" },
      { kind: "shared", text: "S".repeat(40), cutLine: "(cut: shared short)" },
      { kind: "shared", text: "S".repeat(80), cutLine: "(cut: shared long)" },
      { kind: "excerpt", priority: 5, text: "E".repeat(40), cutLine: "(cut: excerpt near)" },
      { kind: "excerpt", priority: 50, text: "E".repeat(40), cutLine: "(cut: excerpt far)" },
      { kind: "facts", text: "F".repeat(40), cutLine: "(cut: facts)" },
      { kind: "labels", text: "L".repeat(40), cutLine: "(cut: labels)" },
    ];
    const total = parts.reduce((n, p) => n + estimateTokens(p.text), 0);
    // Budget tight enough to need every cuttable kind, loose enough to prove the order.
    const { kept, cut } = fitBudget(parts, total - 1);
    assert.deepEqual(
      cut.map((c) => c.kind),
      ["shared"],
    );
    assert.equal(kept[3].text, "(cut: shared long)", "the longest shared excerpt is cut first");
    assert.equal(kept[2].text, "S".repeat(40), "the shorter shared excerpt is kept");

    const tiny = fitBudget(parts, 3);
    assert.deepEqual(
      tiny.cut.map((c) => c.kind),
      ["shared", "shared", "excerpt", "excerpt", "facts", "labels"],
    );
    assert.equal(tiny.kept[5].text, "(cut: excerpt far)", "cut before");
    assert.equal(
      tiny.kept[4].text,
      "(cut: excerpt near)",
      "the farthest excerpt (priority 50) is cut before the nearest (priority 5)",
    );
    assert.equal(tiny.kept[0].text, "PAGE", "page is never cut");
    assert.equal(tiny.kept[1].text, "SECTIONS", "sections is never cut");
  });

  test("fitBudget: already within budget → nothing cut", () => {
    const parts = [{ kind: "shared", text: "x", cutLine: "(cut)" }];
    const { kept, cut } = fitBudget(parts, 1000);
    assert.equal(cut.length, 0);
    assert.equal(kept[0].text, "x");
  });
});

describe("factsFor / glossaryFor (pure)", () => {
  test("factsFor: a row matches by file, by files[] (path:line → path), or by route", () => {
    const facts = {
      env: [
        { name: "DATABASE_URL", files: ["lib/orders.ts:5"] },
        { name: "UNRELATED", files: ["x.ts:1"] },
      ],
      api: [{ method: "GET", route: "/api/orders/{id}", file: "backend/api/orders.py" }],
    };
    const rows = factsFor(facts, new Set(["lib/orders.ts"]), ["/api/orders/{id}"]);
    assert.deepEqual(
      rows.map((r) => r.source),
      ["env", "api"],
    );
  });

  test("glossaryFor: pattern (or escaped term) tested against the page and the excerpts, case-insensitive", () => {
    const glossary = [
      { term: "Threshold", def: "The amount above which an order needs approval." },
      { term: "Nope", def: "never cited" },
    ];
    assert.deepEqual(
      glossaryFor(glossary, ["the THRESHOLD is 10000"]).map((g) => g.term),
      ["Threshold"],
    );
    assert.deepEqual(glossaryFor(glossary, ["nothing here"]), []);
  });
});

describe("contextFileName", () => {
  test('"/" → "__"', () => {
    assert.equal(contextFileName("use/orders"), "use__orders.md");
    assert.equal(contextFileName("take-over/orders-api"), "take-over__orders-api.md");
  });
});

describe("buildContext on the sync fixtures (real pageDependencies)", () => {
  test("use/orders: direct files whole (≤150 lines), required sections of its template, in order", async () => {
    const config = await syncDocsConfig(SYNC_DOCS);
    const toc = JSON.parse(fs.readFileSync(path.join(SYNC_DOCS, "content", "toc.json"), "utf8"));
    const inventory = await runCoverage({ root: SYNC_DOCS, config });
    const tools = adapterTools(SYNC_DOCS);
    const deps = await pageDependencies({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "use/orders",
      inventory,
      tools,
      factsDir: config.paths.facts,
    });
    const templates = loadPageTemplates();
    const appDir = path.resolve(SYNC_DOCS, config.app.dir);
    const { text, tokens, cut } = buildContext({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "use/orders",
      deps,
      appDir,
      templates,
      t: en,
    });
    assert.equal(cut.length, 0);
    assert.ok(tokens > 0);
    assert.match(text, /^# The orders list \(use\/orders\)/);
    assert.match(text, /- Template: screen/);
    assert.match(text, /- Routes: \/orders/);
    assert.match(text, /Filters and the order table\./);
    assert.match(text, /## Required sections of the template/);
    assert.match(text, /- What it is for \(required\)/);
    assert.match(text, /- Each action\n/, "a non-required section, without the marker");
    // Order: direct files before shared (each group keeping its own dependency order); proof-cited lib/orders.ts
    // is whole (46 lines ≤ 150); app/layout.tsx is shared (ARCHITECTURE.md §2.3: only the page's own folder is
    // direct, not the layouts above it).
    const order = [...text.matchAll(/^### (\S+) \((direct|shared)\)/gm)].map((m) => [m[1], m[2]]);
    assert.deepEqual(order, [
      ["app/orders/page.tsx", "direct"],
      ["lib/orders.ts", "direct"],
      ["app/layout.tsx", "shared"],
      ["components/order-table.tsx", "shared"],
    ]);
    assert.match(text, /1│ import \{ OrderTable \} from "@\/components\/order-table";/);
    assert.match(
      text,
      /42│ {3}if \(order\.total > threshold\) \{/,
      "the cited line is in the excerpt, correctly numbered",
    );
  });

  test("take-over/orders-api: declared `sources` (*.py) direct, the facts file shared and path-only, its row in Facts", async () => {
    const config = await syncDocsConfig(SYNC_DOCS);
    const toc = JSON.parse(fs.readFileSync(path.join(SYNC_DOCS, "content", "toc.json"), "utf8"));
    const inventory = await runCoverage({ root: SYNC_DOCS, config });
    const tools = adapterTools(SYNC_DOCS);
    const deps = await pageDependencies({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "take-over/orders-api",
      inventory,
      tools,
      factsDir: config.paths.facts,
    });
    const appDir = path.resolve(SYNC_DOCS, config.app.dir);
    const facts = { api: JSON.parse(fs.readFileSync(path.join(SYNC_DOCS, "facts", "api.json"), "utf8")).items };
    const { text } = buildContext({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "take-over/orders-api",
      deps,
      appDir,
      facts,
      templates: loadPageTemplates(),
      t: en,
    });
    assert.match(text, /### backend\/api\/orders\.py \(direct\)/);
    assert.match(text, /### backend\/api\/deps\.py \(direct\)/);
    assert.match(text, /### facts\/api\.json \(shared\)\n\(path only/);
    assert.match(
      text,
      /## Facts\n\n- `api`: \{"method":"GET","route":"\/api\/orders\/\{id\}","file":"backend\/api\/orders\.py","framework":"fastapi"\}/,
    );
  });

  test("a declared page not written yet is accepted: pageDependencies still returns routes/files, buildContext still renders", async () => {
    const config = await syncDocsConfig(SYNC_DOCS);
    const toc = JSON.parse(fs.readFileSync(path.join(SYNC_DOCS, "content", "toc.json"), "utf8"));
    const inventory = await runCoverage({ root: SYNC_DOCS, config });
    const tools = adapterTools(SYNC_DOCS);
    const deps = await pageDependencies({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "use/orders/detail",
      inventory,
      tools,
      factsDir: config.paths.facts,
    });
    const appDir = path.resolve(SYNC_DOCS, config.app.dir);
    const { text } = buildContext({
      root: SYNC_DOCS,
      config,
      toc,
      pageId: "use/orders/detail",
      deps,
      appDir,
      templates: loadPageTemplates(),
      t: en,
    });
    assert.match(text, /^# Order details \(use\/orders\/detail\)/);
    assert.match(text, /### app\/orders\/\[id\]\/page\.tsx \(direct\)/);
  });
});

describe("buildContext with hand-built dependencies (labels, glossary, counterpart, --update, cuts)", () => {
  function baseDeps(pageOverrides = {}) {
    return {
      page: { id: "p", title: "P", template: null, routes: [], ...pageOverrides },
      routes: [],
      captures: [],
      factsSources: [],
      files: [],
      proofs: [],
      truncated: false,
    };
  }
  const config = { language: "en", paths: { content: "content", facts: "facts" }, app: {} };
  const toc = { sections: [] };

  test('exact labels: a key cited as a string literal, or via t("key") under useTranslations("ns"), resolved against the flat label files', () => {
    const dir = tempDir("doc-kit-context-labels-");
    try {
      fs.writeFileSync(
        path.join(dir, "a.tsx"),
        'useTranslations("orders");\nconst x = t("approve");\nconst y = "orders.new";\n',
      );
      const deps = baseDeps({ title: "Orders" });
      deps.files = [{ path: "a.tsx", kind: "direct", via: ["route"], lines: [] }];
      const labels = { "messages/en.json": { "orders.approve": "Approve", "orders.new": "New order" } };
      const { text } = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        labels,
        templates: null,
        t: en,
      });
      assert.match(text, /## Exact labels/);
      assert.match(text, /`orders\.approve`: Approve/);
      assert.match(text, /`orders\.new`: New order/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("glossary: a term matching the page's title/summary or an excerpt is included, in both directions", () => {
    const dir = tempDir("doc-kit-context-glossary-");
    try {
      fs.writeFileSync(path.join(dir, "a.ts"), "export const x = 1; // mentions a workspace\n");
      const deps = baseDeps({ title: "Orders", summary: "about a workspace" });
      deps.files = [{ path: "a.ts", kind: "direct", via: ["route"], lines: [] }];
      const glossary = [
        { term: "Workspace", def: "A tenant." },
        { term: "Nope", def: "never cited" },
      ];
      const { text } = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        glossary,
        templates: null,
        t: en,
      });
      assert.match(text, /## Glossary/);
      assert.match(text, /\*\*Workspace\*\*: A tenant\./);
      assert.doesNotMatch(text, /Nope/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("counterpart: the target's id, title and summary are shown (looked up in toc, not re-fetched as dependencies)", () => {
    const deps = baseDeps({ title: "Orders", counterpart: "tech/orders" });
    const tocWithTarget = {
      sections: [
        {
          id: "s",
          groups: [{ pages: [{ id: "tech/orders", title: "Orders (technical)", summary: "How it is built." }] }],
        },
      ],
    };
    const { text } = buildContext({
      root: "/x",
      config,
      toc: tocWithTarget,
      pageId: "p",
      deps,
      appDir: null,
      templates: null,
      t: en,
    });
    assert.match(text, /Counterpart: tech\/orders — Orders \(technical\) — How it is built\./);
  });

  test("header: product and documented version shown first when given, omitted when not (ARCHITECTURE.md §6.11)", () => {
    const deps = baseDeps({ title: "Orders" });
    const bare = buildContext({ root: "/x", config, toc, pageId: "p", deps, appDir: null, templates: null, t: en });
    assert.doesNotMatch(bare.text, /Product:/);
    assert.doesNotMatch(bare.text, /Documented version:/);

    const { text } = buildContext({
      root: "/x",
      config,
      toc,
      pageId: "p",
      deps,
      appDir: null,
      templates: null,
      product: "Acme Orders",
      version: "2.4.0",
      t: en,
    });
    assert.match(text, /^# Orders \(p\)\n\n- Product: Acme Orders\n- Documented version: 2\.4\.0\n/);

    const fr = createI18n({ language: "fr" }).t;
    const frText = buildContext({
      root: "/x",
      config,
      toc,
      pageId: "p",
      deps,
      appDir: null,
      templates: null,
      product: "Acme Orders",
      version: "2.4.0",
      t: fr,
    }).text;
    assert.match(frText, /- Produit: Acme Orders\n- Version documentée: 2\.4\.0\n/);
  });

  test("--update: without a report, every category is empty (no crash); the report's entries for this page only, the diff, the capture sheets", () => {
    const deps = baseDeps({ title: "Orders" });
    const noReport = buildContext({
      root: "/x",
      config,
      toc,
      pageId: "p",
      deps,
      appDir: null,
      templates: null,
      update: true,
      report: null,
      t: en,
    });
    assert.match(noReport.text, /## What changed since this page was last checked\n\nNothing reported for this page\./);

    const dir = tempDir("doc-kit-context-update-");
    try {
      fs.mkdirSync(path.join(dir, ".doc-kit", "sync"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".doc-kit", "sync", "p.diff"), "--- a\n+++ b\n-old\n+new\n");
      const report = {
        proofs: { moved: [{ page: "p", ref: "a.ts:1", newRef: "a.ts:5" }], broken: [] },
        labels: [{ file: "messages/en.json", key: "orders.approve", old: "Approve", new: "Validate", pages: ["p"] }],
        review: [{ page: "p", priority: "shared", reasons: [{ path: "b.ts", kind: "shared", change: "modified" }] }],
        captures: [{ id: "orders-list", pages: ["p"], reasons: ["route"] }],
        new: [{ family: "glob/Routes", id: "/new-thing", suggest: "p" }],
        removed: [{ family: "glob/Routes", id: "/gone", pages: ["p"] }],
      };
      const { text } = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: null,
        templates: null,
        update: true,
        report,
        t: en,
      });
      assert.match(text, /proof moved: a\.ts:1 → a\.ts:5/);
      assert.match(text, /“Approve” → “Validate”/);
      assert.match(text, /b\.ts changed/);
      assert.match(text, /orders-list: retake \(route\)/);
      assert.match(text, /glob\/Routes: \/new-thing \(new\) — suggested page: p/);
      assert.match(text, /glob\/Routes: \/gone \(removed, still cited in: p\)/);
      assert.match(text, /Diff of its changed files:\n```diff\n--- a\n\+\+\+ b\n-old\n\+new\n```/);
      assert.match(text, /Before\/after sheets of its captures:\n- \.doc-kit\/compare\/orders-list\.png/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("budget: shared excerpts are cut before direct ones; a tiny budget cuts everything cuttable; cuts are listed at the end", () => {
    const dir = tempDir("doc-kit-context-budget-");
    try {
      const big = Array.from({ length: 600 }, (_, i) => `console.log(${i});`).join("\n");
      fs.writeFileSync(path.join(dir, "shared.ts"), big);
      fs.writeFileSync(path.join(dir, "direct.ts"), big);
      const deps = baseDeps({ title: "Orders", template: null });
      // Both cited (around line 200), so both produce an actual excerpt (not a bare path): the budget order
      // (shared before direct/excerpt) is only observable when there is something to cut from each.
      deps.files = [
        { path: "direct.ts", kind: "direct", via: ["proof"], lines: [[200, 200]] },
        { path: "shared.ts", kind: "shared", via: ["import"], lines: [[200, 200]] },
      ];
      const full = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        templates: null,
        budget: 1_000_000,
        t: en,
      });
      assert.equal(full.cut.length, 0);
      assert.match(full.text, /### shared\.ts \(shared\) — lines 160-240/);

      // Tight enough to need exactly one cut: the shared excerpt goes, the direct one stays.
      const oneCut = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        templates: null,
        budget: full.tokens - 5,
        t: en,
      });
      assert.deepEqual(
        oneCut.cut.map((c) => c.kind),
        ["shared"],
      );
      assert.match(oneCut.text, /\(cut: shared shared\.ts 160-240\)/);
      assert.match(
        oneCut.text,
        /### direct\.ts \(direct\) — lines 160-240\n```/,
        "the direct excerpt is still shown in full",
      );

      const squeezed = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        templates: null,
        budget: 50,
        t: en,
      });
      assert.ok(squeezed.tokens < full.tokens);
      assert.deepEqual(
        squeezed.cut.map((c) => c.kind),
        ["shared", "excerpt"],
      );
      assert.match(squeezed.text, /## Cut to fit the budget/);
      assert.match(squeezed.text, /\(cut: direct direct\.ts 160-240\)/);
      assert.match(squeezed.text, /^# Orders \(p\)/, "page part is never cut, even at a tiny budget");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the screen's own files (reached by its routes): whole up to 800 lines, and the last excerpts a budget cuts", () => {
    const dir = tempDir("doc-kit-context-own-");
    try {
      fs.writeFileSync(
        path.join(dir, "page.tsx"),
        Array.from({ length: 600 }, (_, i) => `const a${i} = ${i};`).join("\n"),
      );
      fs.writeFileSync(path.join(dir, "router.py"), Array.from({ length: 600 }, (_, i) => `x${i} = ${i}`).join("\n"));
      const deps = baseDeps({ title: "Orders", template: null });
      deps.files = [
        { path: "page.tsx", kind: "direct", via: ["route"], lines: [] },
        { path: "router.py", kind: "direct", via: ["api"], lines: [[300, 300]] },
      ];
      const full = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        templates: null,
        budget: 1_000_000,
        t: en,
      });
      assert.match(full.text, /### page\.tsx \(direct\) — whole file/);
      assert.match(full.text, /### router\.py \(direct\) — lines 260-340/);
      const oneCut = buildContext({
        root: dir,
        config,
        toc,
        pageId: "p",
        deps,
        appDir: dir,
        templates: null,
        budget: full.tokens - 5,
        t: en,
      });
      assert.deepEqual(
        oneCut.cut.map((c) => c.path),
        ["router.py"],
        "the handler excerpt goes before the screen itself",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CLI: context <page…> [--budget] [--update]", () => {
  async function cli(args, opts = {}) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
      ...opts,
    });
    return { code, out, err };
  }

  test("no page → context.missingPage, exit code 2", async () => {
    const r = await cli(["context", "--project", SYNC_DOCS]);
    assert.equal(r.code, 2);
    assert.match(r.err, /at least one page id is expected/);
  });

  test("unknown page → context.unknownPage, exit code 2", async () => {
    const r = await cli(["context", "nope/nope", "--project", SYNC_DOCS]);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown page: nope\/nope/);
  });

  test("invalid --budget → option.value, exit code 2", async () => {
    const r = await cli(["context", "use/orders", "--budget", "0", "--project", SYNC_DOCS]);
    assert.equal(r.code, 2);
    const r2 = await cli(["context", "use/orders", "--budget", "abc", "--project", SYNC_DOCS]);
    assert.equal(r2.code, 2);
  });

  test("--update without a sync report → context.noSyncReport, exit code 2", async () => {
    const { base, docs } = syncFixtureCopy();
    try {
      const r = await cli(["context", "use/orders", "--update", "--project", docs]);
      assert.equal(r.code, 2);
      assert.match(r.err, /no sync report yet: .*sync-report\.json/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("writes .doc-kit/context/<page>.md for two pages, prints token counts; --json gives the same, structured", async () => {
    const { base, docs } = syncFixtureCopy();
    try {
      const r = await cli(["context", "use/orders", "take-over/orders-api", "--project", docs]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /use\/orders: \.doc-kit\/context\/use__orders\.md \(\d+ tokens, 0 cuts\)/);
      assert.match(
        r.out,
        /take-over\/orders-api: \.doc-kit\/context\/take-over__orders-api\.md \(\d+ tokens, 0 cuts\)/,
      );
      assert.ok(fs.existsSync(path.join(docs, ".doc-kit", "context", "use__orders.md")));
      assert.ok(fs.existsSync(path.join(docs, ".doc-kit", "context", "take-over__orders-api.md")));

      const json = JSON.parse((await cli(["context", "use/orders", "--project", docs, "--json"])).out);
      assert.equal(json.length, 1);
      assert.deepEqual(Object.keys(json[0]).sort(), ["cut", "cuts", "file", "page", "tokens"].sort());
      assert.equal(json[0].page, "use/orders");
      assert.equal(json[0].cuts, 0);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("the written context file's header also gives the product (config.product.name) and the documented version (readProjectVersion)", async () => {
    const { base, docs } = syncFixtureCopy();
    try {
      const r = await cli(["context", "use/orders", "--project", docs]);
      assert.equal(r.code, 0, r.out + r.err);
      const text = fs.readFileSync(path.join(docs, ".doc-kit", "context", "use__orders.md"), "utf8");
      // test/fixtures/sync-docs/doc.config.mjs: product.name "Acme Orders", no version.file configured → fallback "0.0.0".
      assert.match(text, /^# .+\n\n- Product: Acme Orders\n- Documented version: 0\.0\.0\n/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("--update: with a hand-written sync report, the context gains its entry (ARCHITECTURE.md §6.11 point 7)", async () => {
    const { base, docs } = syncFixtureCopy();
    try {
      fs.mkdirSync(path.join(docs, ".doc-kit"), { recursive: true });
      fs.writeFileSync(
        path.join(docs, ".doc-kit", "sync-report.json"),
        JSON.stringify({
          proofs: { moved: [], broken: [] },
          labels: [],
          review: [
            {
              page: "use/orders",
              priority: "direct",
              reasons: [{ path: "app/orders/page.tsx", kind: "direct", change: "modified" }],
            },
          ],
          captures: [],
          new: [],
          removed: [],
        }),
      );
      const r = await cli(["context", "use/orders", "--update", "--project", docs]);
      assert.equal(r.code, 0, r.out + r.err);
      const text = fs.readFileSync(path.join(docs, ".doc-kit", "context", "use__orders.md"), "utf8");
      assert.match(text, /## What changed since this page was last checked/);
      assert.match(text, /app\/orders\/page\.tsx changed/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("i18n: the context fragment has the same keys, variables and shapes in en and fr", () => {
  test("context.json", () => {
    const read = (p) => JSON.parse(fs.readFileSync(path.join(KIT_ROOT, p), "utf8"));
    const a = read("i18n/en/context.json");
    const b = read("i18n/fr/context.json");
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    const vars = (v) =>
      [
        ...new Set(
          (typeof v === "object" ? Object.values(v) : [v]).flatMap((t) =>
            [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
          ),
        ),
      ].sort();
    for (const k of Object.keys(a)) {
      assert.deepEqual(vars(b[k]), vars(a[k]), k);
      assert.equal(typeof b[k], typeof a[k], k);
    }
  });

  test("every key used by engine/context/*.mjs and cli/commands/context.mjs exists in en and fr", () => {
    const fr = loadDictionary("fr");
    const en2 = loadDictionary("en");
    const read = (p) => fs.readFileSync(path.join(KIT_ROOT, p), "utf8");
    const source = ["engine/context/context.mjs", "cli/commands/context.mjs"].map(read).join("\n");
    const uses = (re) => [...source.matchAll(re)].map((m) => m[1]);
    const keys = new Set([
      ...uses(/t\("(cli\.[\w.]+)"/g),
      ...uses(/KitError\(EXIT\.\w+, "([\w.]+)"/g).map((k) => `cli.${k}`),
    ]);
    // Dynamic keys (template literals: `cli.context.file.${…}`, `cli.sync.proof.broken.${…}`, `cli.sync.reason.${…}`),
    // not matched by the literal regex above: added by hand.
    for (const extent of ["wholeFile", "headOnly", "lines"]) keys.add(`cli.context.file.${extent}`);
    for (const k of ["direct", "shared"]) keys.add(`cli.context.file.${k}`);
    for (const reason of ["fileDeleted", "textNotFound", "ambiguous"]) keys.add(`cli.sync.proof.broken.${reason}`);
    for (const change of ["modified", "deleted"]) keys.add(`cli.sync.reason.${change}`);
    for (const k of keys) {
      assert.ok(k in en2, `missing en: ${k}`);
      assert.ok(k in fr, `missing fr: ${k}`);
    }
  });
});
