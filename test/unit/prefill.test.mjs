// `new --prefill` (ARCHITECTURE.md §6.11, lot V7): stripPrefillMarkers (every template, with or without
// --prefill, never leaves a marker behind), prefillTemplate for the five sources (key cells filled, the rest
// turned into guidance, zero items keeps the example row), and the CLI (new.noFacts, new.noPrefill, a prefilled
// page is still "unwritten": its other sections still hold their own guidance).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PREFILL_MARKER,
  PREFILL_SOURCES,
  stripPrefillMarkers,
  prefillTemplate,
} from "../../engine/context/prefill.mjs";
import { countGuidance, loadPageTemplates } from "../../engine/build/page-templates.mjs";
import { createPage } from "../../cli/commands/new.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { loadDictionary } from "../../engine/i18n.mjs";
import { KIT_ROOT, demoCopy } from "../tools/helpers.mjs";

async function withDir(make, fn) {
  const dir = make();
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const config = async (dir) => (await loadProject({ project: dir, env: {} })).config;

/** The 10 template files carrying a prefill marker (the 5 prefillable types, en and fr). */
const PREFILLABLE_FILES = Object.keys(PREFILL_SOURCES).flatMap((type) => [
  `templates/pages/en/${type}.md`,
  `templates/pages/fr/${type}.md`,
]);

describe("stripPrefillMarkers", () => {
  test("every one of the 10 templates carries exactly one marker, matching its PREFILL_SOURCES entry", () => {
    for (const type of Object.keys(PREFILL_SOURCES))
      for (const lang of ["en", "fr"]) {
        const text = fs.readFileSync(path.join(KIT_ROOT, "templates", "pages", lang, `${type}.md`), "utf8");
        const matches = [...text.matchAll(new RegExp(PREFILL_MARKER.source, "gm"))];
        assert.equal(matches.length, 1, `${lang}/${type}.md`);
        assert.equal(matches[0][1], PREFILL_SOURCES[type], `${lang}/${type}.md`);
      }
  });

  test("removes the marker and nothing else, on every prefillable template", () => {
    for (const f of PREFILLABLE_FILES) {
      const text = fs.readFileSync(path.join(KIT_ROOT, f), "utf8");
      const out = stripPrefillMarkers(text);
      assert.doesNotMatch(out, /doc-kit:prefill/, f);
      assert.equal(
        out.split("\n").length,
        text.split("\n").length - 1,
        `${f}: exactly the marker's own line is removed`,
      );
    }
  });

  test("a template with no marker at all is left untouched", () => {
    const text = fs.readFileSync(path.join(KIT_ROOT, "templates", "pages", "en", "screen.md"), "utf8");
    assert.equal(stripPrefillMarkers(text), text);
  });
});

describe("prefillTemplate: the five sources", () => {
  const read = (type, lang = "en") =>
    fs.readFileSync(path.join(KIT_ROOT, "templates", "pages", lang, `${type}.md`), "utf8");

  test("env (variables): name, files (or —, or `.env.example` without any), the rest guidance", () => {
    const items = [
      { name: "DATABASE_URL", files: ["lib/db.ts:5", "lib/pool.ts:1"] },
      { name: "FEATURE_X", files: [] },
      { name: "SEEDED_FROM_EXAMPLE", files: [], example: true },
    ];
    const { text, rows } = prefillTemplate(read("variables"), { source: "env", items, template: "variables" });
    assert.equal(rows, 3);
    assert.doesNotMatch(text, /doc-kit:prefill/);
    assert.match(
      text,
      /\| `DATABASE_URL` \| <!-- guidance: Service or vault --> \| `lib\/db\.ts:5`, `lib\/pool\.ts:1` \| <!-- guidance: Values understood by the code, and the default --> \| <!-- guidance: Infrastructure default, known pitfall --> \|/,
    );
    assert.match(text, /\| `FEATURE_X` \| <!-- guidance: Service or vault --> \| — \|/);
    assert.match(text, /\| `SEEDED_FROM_EXAMPLE` \| `\.env\.example` \| — \|/);
  });

  test("api (api-surface): method, route, [[verified file]] — in French, [[verifie file]]", () => {
    const items = [{ method: "GET", route: "/api/orders/{id}", file: "backend/api/orders.py" }];
    const en = prefillTemplate(read("api-surface"), { source: "api", items, template: "api-surface" });
    assert.match(
      en.text,
      /\| GET \| `\/api\/orders\/\{id\}` \| <!-- guidance: Session cookie --> \| <!-- guidance: Any signed-in user --> \| <!-- guidance: Filtered by tenant --> \| \[\[verified file\]\] \|/,
    );
    const fr = prefillTemplate(read("api-surface", "fr"), { source: "api", items, template: "api-surface" });
    assert.match(fr.text, /\[\[verifie file\]\]/);
  });

  test("db (data-model): table, columns joined, [[verified file]]", () => {
    const items = [{ table: "orders", columns: ["id", "total", "customer_id"] }];
    const { text } = prefillTemplate(read("data-model"), { source: "db", items, template: "data-model" });
    assert.match(
      text,
      /\| `orders` \| id, total, customer_id \| <!-- guidance: One row per customer order --> \| \[\[verified file\]\] \|/,
    );
  });

  test("dependencies: only the direct ones; name, version, licence or guidance", () => {
    const items = [
      { name: "marked", version: "18.0.14", direct: true, license: "MIT" },
      { name: "no-license", version: "1.0.0", direct: true },
      { name: "transitive-dep", version: "2.0.0", direct: false, license: "MIT" },
    ];
    const { text, rows } = prefillTemplate(read("dependencies"), {
      source: "dependencies",
      items,
      template: "dependencies",
    });
    assert.equal(rows, 2, "the transitive dependency is skipped");
    assert.match(text, /\| `marked` \| 18\.0\.14 \| <!-- guidance: What it is used for --> \| MIT \|/);
    assert.match(
      text,
      /\| `no-license` \| 1\.0\.0 \| <!-- guidance: What it is used for --> \| <!-- guidance: MIT --> \|/,
    );
    assert.doesNotMatch(text, /transitive-dep/);
  });

  test("agents (agent-instructions): file, lines, words, hidden.length (0 without any)", () => {
    const items = [
      { file: "AGENTS.md", lines: 80, words: 540, hidden: [] },
      { file: ".clinerules", lines: 12, words: 70, hidden: [{ line: 3, codepoint: 8203 }] },
    ];
    const { text, rows } = prefillTemplate(read("agent-instructions"), {
      source: "agents",
      items,
      template: "agent-instructions",
    });
    assert.equal(rows, 2);
    assert.match(text, /\| `AGENTS\.md` \| 80 \| 540 \| 0 \|/);
    assert.match(text, /\| `\.clinerules` \| 12 \| 70 \| 1 \|/);
  });

  test("zero items: the example row is kept exactly as the template had it, rows: 0", () => {
    const original = read("variables");
    const { text, rows } = prefillTemplate(original, { source: "env", items: [], template: "variables" });
    assert.equal(rows, 0);
    assert.equal(stripPrefillMarkers(original), text);
  });

  test("no marker for this source → new.noPrefill (EXIT.USAGE)", () => {
    assert.throws(
      () => prefillTemplate(read("screen"), { source: "env", items: [], template: "screen" }),
      (e) => e.code === 2 && e.key === "new.noPrefill" && e.vars.template === "screen",
    );
  });
});

describe("new --prefill (CLI)", () => {
  function writeFacts(dir, source, items) {
    fs.mkdirSync(path.join(dir, "facts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "facts", `${source}.json`),
      JSON.stringify(
        { source, generator: "doc-kit test", generated: "2026-10-02T00:00:00.000Z", commit: null, app: null, items },
        null,
        2,
      ),
    );
  }

  test("--prefill variables: the page is created, its table filled, and it still counts as unwritten (other sections keep their guidance)", () =>
    withDir(demoCopy, async (dir) => {
      writeFacts(dir, "env", [{ name: "DATABASE_URL", files: ["lib/db.ts:5"] }]);
      const r = createPage({
        root: dir,
        config: await config(dir),
        id: "maintain/variables",
        template: "variables",
        summary: "To write.",
        prefill: true,
      });
      assert.deepEqual(r.prefilled, { rows: 1, source: "env" });
      const text = fs.readFileSync(path.join(dir, "content", r.file.split("/").slice(1).join("/")), "utf8");
      assert.match(text, /`DATABASE_URL`/);
      assert.doesNotMatch(text, /doc-kit:prefill/);
      assert.ok(
        countGuidance(text) > 0,
        "the other sections of the template still hold their guidance: the page is still a draft",
      );
    }));

  test("without --prefill: the marker is still removed, prefilled is null, no facts file needed", () =>
    withDir(demoCopy, async (dir) => {
      const r = createPage({
        root: dir,
        config: await config(dir),
        id: "maintain/variables",
        template: "variables",
        summary: "To write.",
      });
      assert.equal(r.prefilled, null);
      const text = fs.readFileSync(path.join(dir, "content", "maintain", "variables.md"), "utf8");
      assert.doesNotMatch(text, /doc-kit:prefill/);
    }));

  test("--prefill without the facts file → new.noFacts, exit code 1", () =>
    withDir(demoCopy, async (dir) => {
      // The demo now commits its own facts/ (ARCHITECTURE.md §6.9, §6.10: app.dir and sync need them): remove
      // the one this test means to find missing, as if `doc-kit facts` had never run.
      fs.rmSync(path.join(dir, "facts", "env.json"), { force: true });
      const cfg = await config(dir);
      assert.throws(
        () =>
          createPage({
            root: dir,
            config: cfg,
            id: "maintain/variables",
            template: "variables",
            summary: "x",
            prefill: true,
          }),
        (e) => e.code === 1 && e.key === "new.noFacts" && e.vars.source === "env",
      );
    }));

  test('--prefill on a type without a marker (e.g. "screen") → new.noPrefill, exit code 2', () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      assert.throws(
        () => createPage({ root: dir, config: cfg, id: "use/x", template: "screen", summary: "x", prefill: true }),
        (e) => e.code === 2 && e.key === "new.noPrefill",
      );
    }));

  test("CLI: full flow, exit codes 0/1/2, messages in the project's language", () =>
    withDir(demoCopy, async (dir) => {
      // Same reason as the test above: start as if `doc-kit facts` had never run.
      fs.rmSync(path.join(dir, "facts", "env.json"), { force: true });
      let out = "";
      let err = "";
      const cli = async (args) => {
        out = "";
        err = "";
        const code = await runCli(args, {
          stdout: { write: (s) => (out += s) },
          stderr: { write: (s) => (err += s) },
          env: {},
        });
        return code;
      };
      assert.equal(
        await cli(["new", "maintain/variables", "--template", "variables", "--prefill", "--project", dir]),
        1,
        out + err,
      );
      assert.match(err, /no facts to prefill from: facts[\\/]env\.json/);

      writeFacts(dir, "env", [{ name: "API_KEY", files: [] }]);
      assert.equal(
        await cli(["new", "maintain/variables", "--template", "variables", "--prefill", "--project", dir]),
        0,
        out + err,
      );
      assert.match(out, /✔ 1 row prefilled from facts\/env\.json/);

      assert.equal(await cli(["new", "maintain/other", "--template", "screen", "--prefill", "--project", dir]), 2);
      assert.match(err, /--prefill has nothing to fill for “screen”/);
      assert.match(err, /prefillable types: .*variables/);
    }));
});

describe("i18n: cli.new.prefilled / noFacts / noPrefill exist in en and fr, same variables", () => {
  test("keys", () => {
    const en = loadDictionary("en");
    const fr = loadDictionary("fr");
    for (const k of [
      "cli.new.prefilled",
      "cli.new.noFacts",
      "cli.new.noFacts.help",
      "cli.new.noPrefill",
      "cli.new.noPrefill.help",
    ]) {
      assert.ok(k in en, k);
      assert.ok(k in fr, k);
    }
  });
});

describe("page-templates.test.mjs stays accurate: the 3 new tables do not break required-section detection", () => {
  test("data-model, dependencies, agent-instructions still declare all their required sections", () => {
    const table = loadPageTemplates();
    for (const type of ["data-model", "dependencies", "agent-instructions"]) assert.ok(table.types[type], type);
  });
});
