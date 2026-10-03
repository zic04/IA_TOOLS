// Takeover space rendering and audit (ARCHITECTURE.md §6.9): the `::facts` directive (columns, translated
// labels, lists, booleans, caption with date and commit, both spellings, errors), the claim badges (both
// spellings, with and without a proof), and the informative `facts`/`claims` audit indicators (stale files,
// claim counts on the takeover pages). The fragment `standard/templates/takeover.json` and its 10 templates are
// covered by test/unit/page-templates.test.mjs, which already parses every type (including these ten).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runAudit } from "../../engine/audit/audit.mjs";
import { renderMarkdown } from "../../engine/audit/report.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { testEngine, KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures");
const TYPED = path.join(FIXTURES, "audit-typed");
const NOW = new Date(Date.UTC(2026, 9, 1, 12));

describe("::facts and ::faits (ARCHITECTURE.md §6.9)", () => {
  const data = {
    source: "env",
    generator: "doc-kit 0.1.0",
    generated: "2026-10-02T08:00:00.000Z",
    commit: "abcdef1234567890",
    app: "..",
    items: [
      { name: "DATABASE_URL", files: ["lib/db.ts:3", "lib/db.ts:9"], example: true },
      { name: "INTERNAL_FLAG", files: [], example: false },
    ],
  };
  const files = {
    "facts/env.json": JSON.stringify(data),
    "facts/empty.json": JSON.stringify({ ...data, source: "empty", items: [] }),
  };

  test("columns, translated headers, lists joined with commas, booleans ✔ / —", () => {
    const { render } = testEngine({ files });
    const r = render('::facts{source="env" columns="name,files,example"}');
    // data-generated="facts" (on the wrapping div and the table itself): tells `check tables` not to report this
    // table for being too narrow a column to fix — a directive's table, never one the writer wrote by hand.
    assert.match(
      r.html,
      /<div class="tableau" data-generated="facts"><table data-generated="facts"><caption>[^<]*<\/caption><thead><tr><th>Name<\/th><th>Files<\/th><th>In the example file<\/th><\/tr><\/thead>/,
    );
    assert.match(r.html, /<tr><td>DATABASE_URL<\/td><td>lib\/db\.ts:3, lib\/db\.ts:9<\/td><td>✔<\/td><\/tr>/);
    assert.match(r.html, /<tr><td>INTERNAL_FLAG<\/td><td>—<\/td><td>—<\/td><\/tr>/);
  });

  test("a path-like scalar cell (contains '/': a file path, a route) is wrapped in <code>, so a long nested path (a real-world Next.js route) gets the same <wbr> break opportunities as hand-written inline code; a plain scalar (no '/') stays plain text", () => {
    const apiData = {
      source: "api",
      generator: "doc-kit 0.1.0",
      generated: "2026-10-02T08:00:00.000Z",
      commit: "abcdef1234567890",
      app: "..",
      items: [
        {
          method: "GET",
          route: "/admin/orders/[id]",
          file: "frontend/src/app/admin/pulse-projects/[id]/edit/page.tsx",
        },
      ],
    };
    const { render } = testEngine({ files: { "facts/api.json": JSON.stringify(apiData) } });
    const r = render('::facts{source="api" columns="method,route,file"}');
    assert.match(r.html, /<td>GET<\/td>/, "a plain scalar (no '/') is never wrapped in <code>");
    assert.doesNotMatch(r.html, /<code>GET<\/code>/);
    assert.match(
      r.html,
      /<td><code>\/admin\/orders\/\[id\]<\/code><\/td>/,
      "a short path-like value: wrapped, no <wbr> needed under 28 characters",
    );
    const longFile = "frontend/src/app/admin/pulse-projects/[id]/edit/page.tsx";
    assert.ok(longFile.length >= 28, "sanity check: long enough to need a break opportunity");
    assert.match(
      r.html,
      /<td><code>frontend\/<wbr>src\/<wbr>app\/<wbr>admin\/<wbr>pulse-projects\/<wbr>\[id\]\/<wbr>edit\/<wbr>page\.<wbr>tsx<\/code><\/td>/,
    );
  });

  test("without `columns`: every key of the first item", () => {
    const { render } = testEngine({ files });
    const r = render('::facts{source="env"}');
    assert.match(r.html, /<th>Name<\/th><th>Files<\/th><th>In the example file<\/th>/);
  });

  test("an unknown column header falls back to the raw key; an untranslated column is still reported if absent from the items", () => {
    const { render, reports } = testEngine({ files });
    const r = render('::facts{source="env" columns="name,bogus"}');
    assert.match(r.html, /<th>bogus<\/th>/);
    assert.deepEqual(reports, [
      { strict: true, kind: "facts", key: "facts.column", vars: { page: "page/test", source: "env", column: "bogus" } },
    ]);
  });

  test("the caption gives the date (generated) and a short commit", () => {
    const { render } = testEngine({ files });
    const r = render('::facts{source="env" columns="name"}');
    assert.match(r.html, /<caption>env · as of 2026-10-02 · commit abcdef1<\/caption>/);
  });

  test("facts.missing: unknown source, or no source at all — strict error, nothing rendered", () => {
    const { render, reports } = testEngine({ files });
    const r = render('::facts{source="nope"}');
    assert.equal(r.html.trim(), "");
    assert.deepEqual(reports, [
      {
        strict: true,
        kind: "facts",
        key: "facts.missing",
        vars: { page: "page/test", source: "nope", file: "facts/nope.json" },
      },
    ]);
  });

  test("French spelling: ::faits{source colonnes}, empty items render an empty body without error", () => {
    const { render, reports } = testEngine({ files });
    const r = render('::faits{source="empty" colonnes="name,files"}');
    assert.match(r.html, /<tbody><\/tbody>/);
    assert.deepEqual(reports, []);
  });
});

describe("claim badges [[verified]] [[deduced]] [[unknown]] (and the French spellings)", () => {
  test("with a file:line proof, and without one", () => {
    const { render } = testEngine({});
    const withProof = render("[[verified lib/orders.ts:42]]").html;
    assert.match(
      withProof,
      /<span class="puce affirmation verifie" title="Verified in the code">Verified in the code <code>lib\/orders\.ts:42<\/code><\/span>/,
    );
    const bare = render("[[deduced]]").html;
    assert.match(
      bare,
      /<span class="puce affirmation deduit" title="Deduced, not directly verified">Deduced, not directly verified<\/span>/,
    );
    assert.doesNotMatch(bare, /<code>/);
  });

  test("[[unknown]] and the French spellings verifie / deduit / inconnu", () => {
    const { render } = testEngine({ language: "fr" });
    assert.match(render("[[unknown]]").html, /class="puce affirmation inconnu"/);
    assert.match(
      render("[[verifie chemin/fichier.ts:1]]").html,
      /class="puce affirmation verifie"[^>]*>[^<]*<code>chemin\/fichier\.ts:1<\/code>/,
    );
    assert.match(render("[[deduit]]").html, /class="puce affirmation deduit"/);
    assert.match(render("[[inconnu]]").html, /class="puce affirmation inconnu"/);
  });

  test("never confused with the other badges ([[perm …]], [[route …]]): distinct keywords, both need [[ ]]", () => {
    const { render } = testEngine({});
    assert.match(render("[[route /orders]]").html, /class="puce route"/);
    assert.match(render("[[verified]]").html, /class="puce affirmation verifie"/);
  });
});

describe("audit: facts (stale) and claims (informative, no criterion)", () => {
  async function audited(change, measure) {
    const dir = tempDir("doc-kit-takeover-audit-");
    try {
      fs.cpSync(TYPED, dir, { recursive: true });
      await change?.(dir);
      const { project, config } = await loadProject({ project: dir, env: {} });
      return await runAudit({ project, config, measure: { tables: null, ...measure }, now: NOW, env: {} });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const writeFacts = (dir, source, commit) => {
    fs.mkdirSync(path.join(dir, "facts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "facts", `${source}.json`),
      JSON.stringify({ source, generator: "x", generated: "2026-01-01T00:00:00.000Z", commit, app: "..", items: [] }),
    );
  };

  test("no facts/ folder: 0 files, 0 stale", async () => {
    const r = await audited();
    assert.deepEqual(r.facts, { files: 0, stale: 0 });
  });

  test("a facts file whose commit differs from the application's current HEAD is stale", async () => {
    const r = await audited(
      (dir) => {
        writeFacts(dir, "env", "old-commit");
        writeFacts(dir, "api", "current-commit");
      },
      { commit: "current-commit" },
    );
    assert.deepEqual(r.facts, { files: 2, stale: 1 });
  });

  test("tool-*.json reports (--tools) are not counted as facts files", async () => {
    const r = await audited(
      (dir) => {
        writeFacts(dir, "env", "x");
        fs.writeFileSync(path.join(dir, "facts", "tool-gitleaks.json"), "{}");
      },
      { commit: "x" },
    );
    assert.equal(r.facts.files, 1);
  });

  test("without a known current commit (no app.dir, no git), nothing is stale", async () => {
    const r = await audited((dir) => writeFacts(dir, "env", "whatever"), { commit: null });
    assert.deepEqual(r.facts, { files: 1, stale: 0 });
  });

  test("claims: tallied on the written takeover pages only, with the verified ratio", async () => {
    const r = await audited((dir) => {
      const f = path.join(dir, "content", "take-over", "architecture.md");
      fs.appendFileSync(
        f,
        "\n\n[[verified lib/orders/rules.ts:40]] and [[verified lib/orders/rules.ts:41]], but [[deduced]] and [[unknown]] remain.\n",
      );
      // A claim badge outside Take over (use/orders) must not be counted.
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), "\n\n[[verified lib/orders.ts:1]]\n");
    });
    assert.deepEqual(r.claims, { verified: 2, deduced: 1, unknown: 1, ratio: 2 / 3 });
  });

  test("no claim anywhere: ratio is null, never a division by zero", async () => {
    const r = await audited();
    assert.deepEqual(r.claims, { verified: 0, deduced: 0, unknown: 0, ratio: null });
  });

  test("facts and claims appear in the Markdown report only when there is something to show", async () => {
    const r1 = await audited();
    assert.doesNotMatch(
      renderMarkdown(r1, createI18n({ language: "en", vars: { command: "doc-kit" } })),
      /Facts and claims/,
    );
    const r2 = await audited((dir) => writeFacts(dir, "env", "x"), { commit: "x" });
    assert.match(
      renderMarkdown(r2, createI18n({ language: "en", vars: { command: "doc-kit" } })),
      /## Facts and claims\n\n- 1 facts file, 0 stale/,
    );
  });

  test("the level never changes because of facts or claims: both are informative only", async () => {
    const plain = await audited();
    const withStale = await audited((dir) => writeFacts(dir, "env", "old"), { commit: "new" });
    assert.equal(plain.level, withStale.level);
    assert.ok(!withStale.criteria.some((c) => c.id.startsWith("facts") || c.id.startsWith("claims")));
  });
});
