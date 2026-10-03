// audit (engine/audit/*, cli/commands/audit.mjs): indicators, maturity levels, prioritised actions with page ids,
// legacy untyped projects, unavailable measures ("not measured", never an error), reports in en and fr, CLI.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runAudit, THRESHOLDS, TAKEOVER_ITEMS } from "../../engine/audit/audit.mjs";
import { readCoverage } from "../../engine/audit/optional.mjs";
import { renderMarkdown, renderSummary, withTexts, INDICATORS } from "../../engine/audit/report.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, DEMO, tempDir } from "../tools/helpers.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures");
const TYPED = path.join(FIXTURES, "audit-typed");
const LEGACY = path.join(FIXTURES, "audit-legacy");
const NOW = new Date(Date.UTC(2026, 9, 1, 12));
/** Tables are never measured here (no browser in unit tests). */
const MEASURE = { tables: null };

/** Copy of a fixture in a temporary folder, modified by `change(dir)`; removed after `fn`. */
async function withCopy(fixture, change, fn) {
  const dir = tempDir("doc-kit-audit-");
  try {
    fs.cpSync(fixture, dir, { recursive: true });
    await change(dir);
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function audit(dir, measure = MEASURE) {
  const { project, config } = await loadProject({ project: dir, env: {} });
  return runAudit({ project, config, measure, now: NOW, env: {} });
}
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));
const failed = (r) => r.criteria.filter((c) => !c.ok).map((c) => c.id);
const action = (r, key) => r.actions.find((a) => a.key === key);
const i18n = (language) => createI18n({ language, vars: { command: "doc-kit" } });

/** Every sentence of the reports comes from an existing key (an unknown key would be printed as is). */
function assertTranslated(result) {
  for (const language of ["en", "fr"]) {
    const md =
      renderMarkdown(result, i18n(language)) + renderSummary(result, i18n(language), { md: "a.md", json: "a.json" });
    assert.doesNotMatch(md, /cli\.(audit|build|validate)\.[\w.]+/, `${language}: untranslated key`);
    assert.doesNotMatch(md, /\{\w+\}/, `${language}: variable left`);
  }
}

describe("a complete typed site", () => {
  test("level 4: every criterion met, no action, every indicator measured but coverage and tables", async () => {
    const r = await audit(TYPED);
    assert.equal(r.level, 4);
    assert.deepEqual(failed(r), []);
    assert.deepEqual(r.actions, []);
    assert.equal(r.pages, 16);
    assert.deepEqual(Object.keys(r.indicators), INDICATORS);
    const I = r.indicators;
    assert.deepEqual([I.typed.n, I.typed.total, I.conformant.n, I.conformant.total], [15, 16, 15, 15]);
    assert.equal(I.completeness.value, 1);
    assert.deepEqual(
      [I.annotated.n, I.annotated.total],
      [3, 3],
      "the screen and editor pages only: the untyped sub-page does not count",
    );
    assert.deepEqual([I.takeover.n, I.proofs.n, I.proofs.total], [7, 12, 12]);
    assert.deepEqual([I.glossary.n, I.tours.n, I.blocking.n, I.guidance.n], [20, 3, 0, 0]);
    assert.deepEqual([I.upToDateCaptures.n, I.upToDateCaptures.total, I.upToDateCaptures.current], [1, 1, "2.4.0"]);
    assert.deepEqual([I.upToDatePages.value, I.upToDatePages.measured], [null, true], "no sync.json yet: n/a, met");
    assert.equal(I.coverage.measured, false);
    assert.equal(I.wideTables.measured, false);
    assert.equal(I.blocking.secrets, 0, "the secrets check of the kit ran and found nothing");
    assert.deepEqual(
      r.takeover.map((t) => [t.id, t.ok]),
      TAKEOVER_ITEMS.map((t) => [t.id, true]),
    );
    assertTranslated(r);
    assert.match(renderMarkdown(r, i18n("en")), /\*\*Level reached: 4 · Takeover\*\*/);
  });

  test("a heading renamed on a typed page: blocking and conformant fail, the page and the section are named", () =>
    withCopy(
      TYPED,
      (d) =>
        edit(path.join(d, "content/use/customers.md"), (s) =>
          s.replace("## Required permissions", "## Who can see it"),
        ),
      async (d) => {
        const r = await audit(d);
        assert.equal(r.level, 2);
        assert.deepEqual(failed(r), ["blocking3", "conformant3"]);
        const c = action(r, "conformant");
        assert.deepEqual(c.items, [
          {
            id: "use/customers",
            key: "missingSections",
            vars: { template: "screen", missing: ["Required permissions"] },
          },
        ]);
        assert.equal(action(r, "blocking").items[0].problem.key, "template.missingSection");
        assert.deepEqual(
          r.actions.map((a) => a.level),
          [3, 3],
        );
        const md = renderMarkdown(r, i18n("en"));
        assert.match(md, /## To reach level 3 · Complete/);
        assert.match(md, /- `use\/customers` — `screen`, missing: “Required permissions”/);
        assertTranslated(r);
      },
    ));

  test("guidance left in a page makes it a draft (counted by written only); the summary placeholder and the home guidance are guidance", () =>
    withCopy(
      TYPED,
      (d) => {
        edit(path.join(d, "content/configure/approval-chains.md"), (s) => s + "\n<!-- guidance: write this -->\n");
        const placeholder = i18n("fr").t("cli.new.summaryPlaceholder");
        edit(path.join(d, "content/toc.json"), (s) =>
          s.replace('"summary": "Customers: what it is for."', `"summary": ${JSON.stringify(placeholder)}`),
        );
        edit(path.join(d, "content/home.md"), (s) => s + "\n<!-- guidance: keep the callout -->\n");
      },
      async (d) => {
        const r = await audit(d);
        const W = r.indicators.written;
        assert.deepEqual(
          [W.n, W.total, W.missing, W.drafts, W.outsideTakeover.n, W.outsideTakeover.total],
          [15, 16, 0, 1, 3, 4],
        );
        assert.equal(r.indicators.guidance.n, 2, "the placeholder of a written page and the home page; not the draft");
        assert.deepEqual(
          [r.indicators.conformant.n, r.indicators.conformant.total],
          [14, 14],
          "the draft is not measured by conformant",
        );
        assert.equal(r.level, 1, "3 of 4 pages written outside Take over: < 90 %");
        assert.deepEqual(failed(r), ["written2", "written3", "guidance3"]);
        assert.deepEqual(action(r, "written").items, [
          { id: "configure/approval-chains", key: "finishDraft", vars: { n: 1 } },
        ]);
        assert.equal(action(r, "writtenAll"), undefined, "an unwritten page is listed once");
        assert.equal(action(r, "writtenRest"), undefined);
        assert.deepEqual(action(r, "guidance").items, [
          { id: "use/customers", key: "placeholder", vars: { n: 0 } },
          { id: "content/home.md", key: "guidanceLeft", vars: { n: 1 } },
        ]);
        assert.ok(
          r.warnings.some((w) => w.key === "template.guidance"),
          "the build reports it too",
        );
        assertTranslated(r);
        assert.match(
          renderSummary(r, i18n("en")),
          /\n {2}Pages: 15 written of 16 — 1 to write \(0 without a file, 1 still in template guidance\)\n/,
        );
        assert.match(
          renderMarkdown(r, i18n("fr")),
          /1\. Écrivez la page pas encore écrite hors Reprendre \(0 sans fichier, 1 encore en consignes\)\n {3}- `configure\/approval-chains` → à terminer : 1 consigne de gabarit restante/,
        );
      },
    ));

  test("a page declared without its file: one problem, owned by written; no section, no blocking, no conformance counted", () =>
    withCopy(
      TYPED,
      (d) => {
        fs.rmSync(path.join(d, "content/use/customers.md"));
        // An anchor into the page not written yet cannot be checked before it exists.
        edit(
          path.join(d, "content/use/orders.md"),
          (s) => s + "\nSee [the permissions](#/use/customers~required-permissions).\n",
        );
      },
      async (d) => {
        const r = await audit(d);
        assert.deepEqual(
          r.errors.map((e) => [e.key, e.vars.page]),
          [["page.missing", "use/customers"]],
          "neither the template's sections nor the anchor",
        );
        assert.deepEqual(
          [r.indicators.written.n, r.indicators.written.missing, r.indicators.written.drafts],
          [15, 1, 0],
        );
        assert.deepEqual(
          [r.indicators.blocking.n, r.indicators.blocking.build, r.indicators.blocking.unwritten],
          [0, 0, 1],
        );
        assert.deepEqual([r.indicators.conformant.n, r.indicators.conformant.total], [14, 14]);
        assert.equal(r.indicators.completeness.value, 1);
        assert.deepEqual(failed(r), ["written2", "written3"]);
        assert.deepEqual(action(r, "written").items, [
          { id: "use/customers", key: "newPage", vars: { file: "content/use/customers.md", template: "screen" } },
        ]);
        assert.equal(action(r, "blocking"), undefined, "the missing page is not counted again as a build error");
        assert.equal(action(r, "conformant"), undefined);
        assert.match(
          renderMarkdown(r, i18n("en")),
          /\| `blocking` \| 0 · \+ 1 error in the pages not written yet \(counted by `written`\) \|/,
        );
        assertTranslated(r);
      },
    ));

  test("a Take over page that keeps its guidance is not present, and the template's example finding does not count", () =>
    withCopy(
      TYPED,
      (d) => {
        // The findings page back to its template state: guidance, and the example "(C1)" of the template.
        edit(
          path.join(d, "content/take-over/findings.md"),
          (s) =>
            s.replace(/\b[CIMPNR]\d{1,3}\b/g, "X") +
            "\n<!-- guidance: number the findings -->\n1. **Priority action**: why, and the findings concerned (C1).\n",
        );
      },
      async (d) => {
        const r = await audit(d);
        const findings = r.takeover.find((t) => t.id === "findings");
        assert.deepEqual([findings.ok, findings.unwritten], [false, { id: "take-over/findings", state: "draft" }]);
        assert.deepEqual(action(r, "takeover").items, [
          {
            id: "take-over/findings",
            key: "takeover.finish",
            vars: { item: "findings", template: "findings", sub: null, min: 0, page: "take-over/findings" },
          },
        ]);
        assert.equal(r.indicators.proofs.total, 11, "a draft is not measured by proofs");
        assert.match(
          renderMarkdown(r, i18n("en")),
          /\| 6 \| Numbered findings \| ✖ \| `take-over\/findings` \(draft\) \|/,
        );
      },
    ));

  test("a finding id in an HTML comment of a written page does not count", () =>
    withCopy(
      TYPED,
      (d) =>
        edit(
          path.join(d, "content/take-over/findings.md"),
          (s) => s.replace(/\b[CIMPNR]\d{1,3}\b/g, "X") + "\n<!-- note for the writers: C1 -->\n",
        ),
      async (d) => {
        const r = await audit(d);
        assert.equal(r.takeover.find((t) => t.id === "findings").ok, false);
        assert.deepEqual(
          action(r, "takeover").items.map((i) => i.key),
          ["takeover.number"],
        );
      },
    ));

  test("a required Take over page missing: level 3, the new command is suggested", () =>
    withCopy(
      TYPED,
      (d) =>
        edit(path.join(d, "content/toc.json"), (s) =>
          JSON.stringify(dropPage(JSON.parse(s), "take-over/maintaining-docs"), null, 2),
        ),
      async (d) => {
        const r = await audit(d);
        assert.equal(r.level, 3);
        assert.deepEqual(failed(r), ["takeover4"]);
        assert.deepEqual(action(r, "takeover").items, [
          {
            id: "take-over/maintaining-docs",
            key: "takeover.new",
            vars: { item: "maintaining", template: "technical", sub: null, min: 0, page: "take-over/maintaining-docs" },
          },
        ]);
        assert.match(
          renderMarkdown(r, i18n("en")),
          /Maintaining the docs: create it — `doc-kit new take-over\/maintaining-docs --template technical`/,
        );
      },
    ));

  test("thresholds: proofs and pages too long", () =>
    withCopy(
      TYPED,
      (d) => {
        for (const f of ["operations", "maintaining-docs", "findings", "troubleshooting", "architecture"])
          edit(path.join(d, `content/take-over/${f}.md`), (s) =>
            s.replace(/`lib\/orders\/rules\.ts:\d+`/g, "the rules"),
          );
        edit(path.join(d, "content/use/orders/detail.md"), (s) => s + "word ".repeat(2001));
      },
      async (d) => {
        const r = await audit(d);
        assert.deepEqual([r.indicators.proofs.n, r.indicators.proofs.total], [7, 12]);
        assert.ok(r.indicators.proofs.value < THRESHOLDS.proofs4);
        assert.equal(r.indicators.tooLong.n, 1);
        assert.ok(r.indicators.tooLong.value > THRESHOLDS.tooLong4);
        assert.deepEqual(failed(r), ["proofs4", "tooLong4"]);
        assert.equal(action(r, "proofs").vars.need, 1);
        assert.deepEqual(action(r, "tooLong").items[0], {
          id: "use/orders/detail",
          key: "words",
          vars: { words: 2015, max: 2000 },
        });
      },
    ));
});

/** Removes a page from a toc (current format). */
function dropPage(toc, id) {
  for (const s of toc.sections) for (const g of s.groups) g.pages = g.pages.filter((p) => p.id !== id);
  return toc;
}

/** Every page id declared in a toc.json (current format), in declaration order. */
function pageIds(toc) {
  return toc.sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => p.id)));
}

/** Writes a minimal, schema-valid sync.json (ARCHITECTURE.md §6.10) marking `pages` ({ id: version }). */
function writeSync(dir, pages, { version = "2.4.0" } = {}) {
  const ref = {
    generator: "doc-kit test",
    app: { commit: null, version, date: "2026-10-01" },
    pages: Object.fromEntries(
      Object.entries(pages).map(([id, v]) => [id, { verified: "2026-10-01", version: v, source: "0000000000000000" }]),
    ),
  };
  fs.writeFileSync(path.join(dir, "sync.json"), JSON.stringify(ref, null, 2));
}

describe("following the application: upToDatePages (standard/maturity.md, level 4)", () => {
  test("sync.json marking every written page at the current version: the criterion passes, level stays 4", () =>
    withCopy(
      TYPED,
      (d) => {
        const toc = JSON.parse(fs.readFileSync(path.join(d, "content/toc.json"), "utf8"));
        writeSync(d, Object.fromEntries(pageIds(toc).map((id) => [id, "2.4.0"])));
      },
      async (d) => {
        const r = await audit(d);
        assert.deepEqual(
          [r.indicators.upToDatePages.n, r.indicators.upToDatePages.total, r.indicators.upToDatePages.value],
          [16, 16, 1],
        );
        assert.equal(r.level, 4);
        assert.deepEqual(failed(r), []);
        assertTranslated(r);
      },
    ));

  test("a page marked on an old version, and one never marked: the criterion fails, capped at level 3, both named", () =>
    withCopy(
      TYPED,
      (d) => {
        const toc = JSON.parse(fs.readFileSync(path.join(d, "content/toc.json"), "utf8"));
        const ids = pageIds(toc);
        const pages = Object.fromEntries(ids.slice(0, -2).map((id) => [id, "2.4.0"]));
        pages[ids.at(-2)] = "2.3.0"; // marked, but stale
        // the very last page is left out of sync.json entirely: never marked
        writeSync(d, pages);
      },
      async (d) => {
        const r = await audit(d);
        assert.deepEqual([r.indicators.upToDatePages.n, r.indicators.upToDatePages.total], [14, 16]);
        assert.ok(r.indicators.upToDatePages.value < THRESHOLDS.upToDatePages4);
        assert.ok(failed(r).includes("upToDatePages4"));
        assert.equal(r.level, 3);
        const a = action(r, "upToDatePages");
        assert.equal(a.vars.n, 2);
        assert.deepEqual(a.items.map((i) => i.key).sort(), ["pageUnmarked", "pageVersion"]);
        const versioned = a.items.find((i) => i.key === "pageVersion");
        assert.equal(versioned.vars.version, "2.3.0");
        assertTranslated(r);
      },
    ));
});

describe("measures that may be unavailable", () => {
  test("not measured never lowers the level; a measured failure does", async () => {
    const tables = async () => ({
      measured: true,
      problems: [{ page: "use/orders", heading: "Settings reference", wide: 1500, visible: 900 }],
    });
    const r = await audit(TYPED, { tables });
    assert.equal(r.level, 2);
    assert.deepEqual(failed(r), ["wideTables3"]);
    assert.deepEqual(action(r, "wideTables").items, [
      {
        id: "use/orders",
        key: "wideTable",
        vars: { page: "use/orders", heading: "Settings reference", wide: 1500, visible: 900 },
      },
    ]);
    const off = await audit(TYPED, {
      tables: null,
      tablesReason: "disabled",
      coverage: async () => ({ measured: false, reason: "error", error: "boom" }),
      secrets: null,
    });
    assert.equal(off.level, 4);
    assert.match(
      renderMarkdown(off, i18n("en")),
      /## Not measured\n\n- `coverage`: the measure failed: boom\n- `wideTables`: skipped \(`DOC_KIT_NO_BROWSER`\)\n- `blocking › secrets`: not measured by this run/,
    );
  });

  test("coverage measured: uncovered elements block level 3 and are listed", async () => {
    const coverage = async () =>
      readCoverage({
        adapters: [
          {
            adapter: "x",
            available: true,
            families: [
              {
                name: "Routes",
                items: [
                  { id: "/orders", covered: true },
                  { id: "/reports", covered: false },
                ],
              },
            ],
          },
        ],
      });
    const r = await audit(TYPED, { tables: null, coverage });
    assert.deepEqual([r.indicators.coverage.n, r.indicators.coverage.total, r.indicators.blocking.coverage], [1, 2, 1]);
    assert.equal(r.level, 1, "coverage 50 % < 80 %: level 2 is not reached");
    assert.deepEqual(action(r, "coverage").items, [{ id: "/reports" }]);
    // need = n: the sentence says it once ("the element", "the 4 elements"), never "4, at least 4".
    assert.match(renderMarkdown(r, i18n("en")), /\d\. Document the element that no written page cites\n/);
  });

  test("coverage: an element cited only by the entry of a page not written yet is planned, counted by coverage, not by blocking", async () => {
    const items = [
      { id: "/orders", covered: true },
      { id: "/reports", covered: false, plannedBy: "use/reports" },
      { id: "/a", covered: false },
      { id: "/b", covered: false },
      { id: "/c", covered: false },
    ];
    const coverage = async () =>
      readCoverage({ adapters: [{ adapter: "x", available: true, families: [{ name: "Routes", items }] }] });
    const r = await audit(TYPED, { tables: null, coverage });
    assert.deepEqual(
      [
        r.indicators.coverage.n,
        r.indicators.coverage.total,
        r.indicators.coverage.planned,
        r.indicators.blocking.coverage,
      ],
      [1, 5, 2, 3],
    );
    const a = action(r, "coverage");
    assert.deepEqual(a.items[0], { id: "/reports", key: "plannedBy", vars: { page: "use/reports" } });
    assert.deepEqual(a.vars, { n: 4, need: 3 });
    const md = renderMarkdown(r, i18n("fr"));
    assert.match(md, /\| `coverage` \| 1 \/ 5 \(20\s%\) · avec les pages pas encore écrites : 2 \/ 5 \|/);
    assert.match(
      md,
      /Documentez les éléments qu'aucune page écrite ne cite : 4, dont au moins 3 ; 1 est prévu par une page pas encore écrite\n {3}- `\/reports` → prévu dans `use\/reports`, pas encore écrite/,
    );
    assertTranslated(r);
  });

  test("capture.mode none: annotated is n/a, so a site whose screens are tables is not held at level 1", () =>
    withCopy(
      TYPED,
      (dir) => {
        // Every screen described by a table of its elements instead of an annotated screenshot.
        for (const f of fs
          .readdirSync(path.join(dir, "content"), { recursive: true })
          .map(String)
          .filter((x) => x.endsWith(".md")))
          edit(path.join(dir, "content", f), (s) =>
            s.replace(
              /^:::(?:screen|ecran)\{[^\n]*\}\n([\s\S]*?)^:::[ \t]*$/gm,
              (m, items) =>
                "| Element | What it shows |\n|---|---|\n" +
                items
                  .trim()
                  .split("\n")
                  .map((l) => `| ${l.replace(/^\d+\.\s*/, "")} | |`)
                  .join("\n"),
            ),
          );
      },
      async (dir) => {
        const { project, config } = await loadProject({ project: dir, env: {} });
        const app = await runAudit({ project, config, measure: MEASURE, now: NOW, env: {} });
        assert.deepEqual([app.indicators.annotated.n, app.indicators.annotated.total], [0, 3]);
        assert.ok(failed(app).includes("annotated2"), "with screenshots expected, the tables do not count");
        const none = await runAudit({
          project,
          config: { ...config, capture: { ...config.capture, mode: "none" } },
          measure: MEASURE,
          now: NOW,
          env: {},
        });
        assert.equal(none.indicators.annotated.value, null);
        assert.deepEqual(
          failed(none).filter((id) => id.startsWith("annotated")),
          [],
        );
        assert.equal(none.criteria.find((c) => c.id === "annotated2").na, true);
        assert.ok(none.level >= 2 && none.level > app.level, `level ${none.level} > ${app.level}`);
        assert.match(renderMarkdown(none, i18n("en")), /\| `annotated` \| n\/a \|/);
        assert.match(renderMarkdown(none, i18n("fr")), /\| `annotated` \| n\/a \|/);
        assertTranslated(none);
      },
    ));

  test("readCoverage: the shapes of a coverage result", () => {
    assert.deepEqual(
      readCoverage({ adapters: [{ available: false, families: [] }], total: 0, covered: 0, missing: 0 }),
      { measured: false, reason: "noAdapter" },
    );
    assert.deepEqual(readCoverage({ total: 4, covered: 3, missing: 1 }), {
      measured: true,
      n: 3,
      total: 4,
      missing: [],
    });
    assert.deepEqual(readCoverage({ available: false }), { measured: false, reason: "noAdapter" });
    assert.deepEqual(readCoverage({ something: 1 }), { measured: false, reason: "format" });
  });
});

describe("a legacy project, written before page types", () => {
  test("typed = 0 %, the other indicators measured; types guessed from the headings; level 2", async () => {
    const r = await audit(LEGACY);
    assert.equal(r.legacyToc, true);
    assert.equal(r.tocFile, "contenu/sommaire.json");
    assert.equal(r.level, 2);
    assert.deepEqual([r.indicators.typed.n, r.indicators.typed.total], [0, 14]);
    assert.deepEqual(
      [r.indicators.annotated.n, r.indicators.annotated.total],
      [3, 3],
      "untyped: every page outside Take over",
    );
    assert.equal(r.indicators.conformant.value, null);
    assert.equal(r.indicators.proofs.n, 11);
    const typing = Object.fromEntries(r.typing.map((t) => [t.page, t.template]));
    assert.equal(typing["utiliser/commandes"], "screen", "« À quoi sert l'écran » is an alias");
    assert.equal(typing["reprendre/parcours-commande"], "journey");
    assert.equal(typing["reprendre/parcours-commande/validation"], "journey-step");
    assert.equal(typing["reprendre/diagnostic/acces"], "troubleshooting-area");
    assert.equal(typing["reprendre/points-attention"], "findings");
    assert.ok(!("utiliser/commandes/detail" in typing), "a sub-page of a screen stays untyped");
    assert.ok(!("utiliser/reglages" in typing), "a required section is missing");
    const declare = action(r, "typedDeclare");
    assert.equal(declare.level, 3);
    assert.deepEqual(declare.vars, { n: 12, need: 12, file: "contenu/sommaire.json", field: "gabarit" });
  });

  test("Take over: the pages to type are named, the missing one is suggested in French", async () => {
    const r = await audit(LEGACY);
    assert.deepEqual(
      action(r, "takeover").items.map((i) => [i.id, i.key]),
      [
        ["reprendre/dat", "takeover.type"],
        ["reprendre/parcours-commande", "takeover.typeWithSubs"],
        ["reprendre/diagnostic", "takeover.typeWithSubs"],
        ["reprendre/points-attention", "takeover.type"],
        ["reprendre/maintenir-doc", "takeover.new"],
      ],
    );
  });

  test("the French report explains how to type the pages", async () => {
    const r = await audit(LEGACY);
    const md = renderMarkdown(r, i18n("fr"));
    assert.match(md, /\*\*Niveau atteint : 2 · Utilisateur\*\*/);
    assert.match(md, /> \[!NOTE\] Ce site ne déclare aucun type de page/);
    assert.match(md, /ajoutez `"gabarit": "<type>"` à son entrée dans `contenu\/sommaire\.json`/);
    assert.match(md, /- `utiliser\/commandes` → `screen`/);
    assert.match(
      md,
      /- `reprendre\/parcours-commande` — Parcours de bout en bout, avec au moins 3 étapes : déclarez `journey` sur cette page et `journey-step` sur ses 3 sous-pages/,
    );
    assert.match(md, /`doc-kit new reprendre\/maintenir-doc --template technical`/);
    assertTranslated(r);
  });

  test("the closest type and its missing sections, for the pages that follow none", async () => {
    // The demo: one typed page out of four; the others follow no type yet.
    const { project, config } = await loadProject({ project: DEMO, env: {} });
    const r = await runAudit({ project, config, measure: MEASURE, now: NOW, env: {} });
    const choose = action(r, "typedChoose");
    assert.ok(choose.items.some((i) => i.id === "use/settings" && i.key === "closest" && i.vars.template === "editor"));
    assertTranslated(r);
  });
});

describe("a project that cannot be built", () => {
  test("no table of contents: level 0, the build errors are the only action", () =>
    withCopy(
      TYPED,
      (d) => fs.rmSync(path.join(d, "content/toc.json")),
      async (d) => {
        const r = await audit(d);
        assert.equal(r.level, 0);
        assert.deepEqual(
          r.actions.map((a) => a.key),
          ["draftBuild"],
        );
        assert.equal(r.actions[0].items[0].problem.key, "toc.missing");
        assertTranslated(r);
        assert.match(renderSummary(r, i18n("en")), /level 0 · none/);
      },
    ));
});

describe("CLI", () => {
  async function cli(args, env = {}) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: { DOC_KIT_NO_BROWSER: "1", ...env },
    });
    return { code, out, err };
  }

  test("writes .doc-kit/audit.md and audit.json, prints a summary; exit code 0 even when levels are missing", () =>
    withCopy(
      LEGACY,
      () => {},
      async (d) => {
        const r = await cli(["audit", "--project", d]);
        assert.equal(r.code, 0, r.err);
        assert.match(r.out, /^◆ Acme Orders — niveau 2 · Utilisateur \(14 pages\)\n/);
        assert.match(r.out, /Prochain : niveau 3 · Complet — 3 critères à remplir/);
        assert.match(r.out, /1\. Déclarez le type des 12 pages .* ajoutez "gabarit": "<type>"/);
        assert.doesNotMatch(r.out, /`/, "no Markdown code marks in the terminal");
        assert.match(r.out, /→ rapport : .*\.doc-kit\/audit\.md · données : .*\.doc-kit\/audit\.json\n$/);
        assert.equal(
          fs.readFileSync(path.join(d, ".doc-kit/.gitignore"), "utf8").trim(),
          "*",
          "work files are never committed",
        );
        const md = fs.readFileSync(path.join(d, ".doc-kit/audit.md"), "utf8");
        assert.match(md, /^# Audit de la documentation — Acme Orders\n/);
        const json = JSON.parse(fs.readFileSync(path.join(d, ".doc-kit/audit.json"), "utf8"));
        assert.equal(json.level, 2);
        assert.equal(json.levelName, "Utilisateur");
        assert.ok(
          json.actions.every((a) => typeof a.text === "string" && a.items.every((i) => typeof i.text === "string")),
        );
        assert.equal(json.indicators.wideTables.reason, "disabled");
      },
    ));

  test("--json and --lang en", () =>
    withCopy(
      TYPED,
      () => {},
      async (d) => {
        const r = await cli(["audit", "--project", d, "--json"]);
        assert.equal(r.code, 0, r.err);
        const j = JSON.parse(r.out);
        assert.equal(j.level, 4);
        assert.equal(j.levelName, "Takeover");
        const fr = await cli(["audit", "--project", d, "--lang", "fr"]);
        assert.match(fr.out, /niveau 4 · Reprise/);
        assert.match(fr.out, /Niveau 4 atteint/);
      },
    ));

  test("a project that cannot be read: exit code 2", async () => {
    const dir = tempDir();
    try {
      assert.equal((await cli(["audit", "--project", dir])).code, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("withTexts keeps the result and adds the text of every action", async () => {
    const r = await audit(LEGACY);
    const j = withTexts(r, i18n("en"));
    assert.equal(j.levelName, "User");
    assert.match(j.actions[0].text, /^Declare the type of the 12 pages that already follow a template/);
    assert.equal(j.actions[0].items[0].text, "→ `screen`");
  });
});
