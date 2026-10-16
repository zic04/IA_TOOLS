// Migration 0.4.0 (engine/migrations/0.4.0.mjs): the two spaces of 0.3 (business, takeover) become the four of
// 0.4 (use, product, admin, develop) — sections by their id or their pages' types, the operating pages of the
// takeover moved with their sub-pages, page and journey spaces, texts, the spaces of the project's own given a
// kind — the same structure in each translation (checked by the build's own merge), a translation that was up to
// date kept so, nothing touched beyond the format, the format of kit 0.1 refused, and a second run that changes
// nothing.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planSpaces, applySpaces } from "../../engine/migrations/0.4.0/spaces.mjs";
import * as migration from "../../engine/migrations/0.4.0.mjs";
import { createVirtualFiles, pendingMigrations, runMigrations } from "../../engine/migrations/runner.mjs";
import { translatedToc } from "../../engine/build/languages.mjs";
import { hashText } from "../../engine/core/hash.mjs";
import { KIT_ROOT, tempDir, buildBusiness } from "../tools/helpers.mjs";

const page = (id, more = {}) => ({ id, title: id, ...more });

/** A table of contents of 0.3: every kind of section and page the migration has a rule for. */
function toc03() {
  return {
    title: "Acme",
    // A space of the project's own, as 0.3 had them: a title, no kind.
    spaces: ["business", { id: "takeover", subtitle: "For the team" }, { id: "ops", title: "Ops" }],
    sections: [
      { id: "use", space: "business", title: "Use", groups: [{ pages: [page("use/orders", { template: "screen" })] }] },
      {
        id: "features",
        space: "business",
        title: "Features",
        groups: [{ pages: [page("features/track", { template: "feature" })] }],
      },
      {
        id: "catalogue",
        space: "business",
        title: "Catalogue",
        groups: [{ pages: [page("catalogue/a", { template: "business-rules" }), page("catalogue/b")] }],
      },
      { id: "configure", space: "business", title: "Configure", groups: [{ pages: [page("configure/editor")] }] },
      {
        id: "take-over",
        space: "takeover",
        title: "Take over",
        groups: [
          {
            title: "Architecture",
            pages: [
              page("take-over/architecture", { template: "technical" }),
              page("take-over/dat", { template: "architecture" }),
              page("take-over/dat/network", { level: 2 }),
              page("take-over/limits", { space: "business", template: "release-notes" }),
            ],
          },
          {
            title: "Operate and evolve",
            pages: [page("take-over/runbook", { template: "runbook" }), page("take-over/findings")],
          },
        ],
      },
      {
        id: "ops-notes",
        space: "ops",
        title: "Ops notes",
        groups: [{ pages: [page("ops-notes/a", { template: "runbook" }), page("ops-notes/b")] }],
      },
    ],
    journeys: [
      { title: "Discover", steps: ["use/orders"] },
      { title: "Take over", space: "takeover", steps: ["take-over/architecture"] },
      { title: "Use", space: "business", steps: ["use/orders"] },
    ],
  };
}

const outline = (toc) =>
  toc.sections.map(
    (s) =>
      `${s.id}[${s.space ?? "-"}]: ${s.groups.map((g) => g.pages.map((p) => p.id + (p.space ? "@" + p.space : "")).join(",")).join(" | ")}`,
  );

describe("planSpaces / applySpaces", () => {
  test("sections, moved pages, page and journey spaces, texts and custom spaces", () => {
    const source = toc03();
    const out = applySpaces(source, planSpaces(source, "en"), "en");
    assert.deepEqual(out.spaces, [
      "use",
      "product",
      "admin",
      { id: "develop", subtitle: "For the team" },
      { id: "ops", title: "Ops", kind: "admin" },
    ]);
    assert.deepEqual(outline(out), [
      "use[use]: use/orders",
      "features[product]: features/track",
      "catalogue[product]: catalogue/a,catalogue/b",
      "configure[admin]: configure/editor",
      // The operating pages of the takeover, with their sub-pages, after the last admin section.
      "operate[admin]: take-over/dat,take-over/dat/network | take-over/runbook",
      "take-over[develop]: take-over/architecture,take-over/limits@product | take-over/findings",
      "ops-notes[ops]: ops-notes/a,ops-notes/b",
    ]);
    assert.deepEqual(
      out.sections[4].groups.map((g) => g.title),
      ["Architecture", "Operate and evolve"],
    );
    assert.equal(out.sections[4].title, "Operate the application");
    assert.deepEqual(
      out.journeys.map((j) => j.space),
      [undefined, "develop", "use"],
    );
    assert.equal(source.spaces[0], "business", "the input is not changed");
  });

  test("French: the operating section is “exploiter”; an id already taken gets a suffix", () => {
    const fr = applySpaces(toc03(), planSpaces(toc03(), "fr"), "fr");
    assert.deepEqual([fr.sections[4].id, fr.sections[4].title], ["exploiter", "Exploiter l'application"]);
    const taken = toc03();
    taken.sections[0].id = "operate";
    const out = applySpaces(taken, planSpaces(taken, "en"), "en");
    assert.ok(out.sections.some((s) => s.id === "operate-admin" && s.space === "admin"));
  });

  test("a section left without pages is removed; a page that already names its section's new space loses it", () => {
    const source = toc03();
    source.sections[4].groups = [{ pages: [{ id: "take-over/dat", title: "DAT", template: "architecture" }] }];
    source.sections[0].groups[0].pages[0].space = "business";
    source.journeys = source.journeys.filter((j) => j.space !== "takeover"); // nothing else names develop
    const out = applySpaces(source, planSpaces(source, "en"), "en");
    assert.ok(!out.sections.some((s) => s.id === "take-over"));
    assert.ok(!out.spaces.includes("develop") && !out.spaces.some((s) => s.id === "develop"), "develop has no page");
    assert.equal(out.sections[0].groups[0].pages[0].space, undefined);
  });

  test("a space of the project's own: the kind of most of its typed pages, else use; a standard id keeps its texts", () => {
    const toc = {
      title: "x",
      spaces: [{ id: "ops", title: "Ops" }, { id: "admin", title: "Back office" }, "docs"],
      sections: [
        {
          id: "a",
          space: "ops",
          title: "A",
          groups: [
            {
              pages: [
                page("a/1", { template: "technical" }),
                page("a/2", { template: "findings" }),
                page("a/3", { template: "screen" }),
              ],
            },
          ],
        },
        { id: "b", space: "admin", title: "B", groups: [{ pages: [page("b/1")] }] },
        { id: "c", space: "docs", title: "C", groups: [{ pages: [page("c/1")] }] },
      ],
    };
    const plan = planSpaces(toc, "en");
    assert.ok(plan, "only spaces of its own, without a kind: migrated too");
    const out = applySpaces(toc, plan, "en");
    assert.deepEqual(out.spaces, [
      { id: "admin", title: "Back office" },
      { id: "ops", title: "Ops", kind: "develop" },
      { id: "docs", kind: "use" },
    ]);
    assert.equal(planSpaces(out, "en"), null, "then nothing left to do");
    const translated = applySpaces(toc, plan, "fr", { source: false });
    assert.deepEqual(
      translated.spaces.slice(1),
      [{ id: "ops", title: "Ops" }, "docs"],
      "a translation never carries a kind",
    );
  });

  test("a sub-page follows the level-1 page above it in its own group; a page that names its space stays", () => {
    const toc = {
      title: "x",
      spaces: ["takeover"],
      sections: [
        {
          id: "take-over",
          space: "takeover",
          title: "T",
          groups: [
            {
              pages: [
                page("t/dat", { template: "architecture" }),
                page("t/api", { space: "takeover" }),
                page("t/api/auth", { level: 2 }),
              ],
            },
            { pages: [page("t/orphan", { level: 2 }), page("t/arch", { template: "technical" })] },
          ],
        },
      ],
    };
    assert.deepEqual(outline(applySpaces(toc, planSpaces(toc, "en"), "en")), [
      "operate[admin]: t/dat",
      "take-over[develop]: t/api,t/api/auth | t/orphan,t/arch",
    ]);
  });

  test("nothing beyond the format: a group or a section already empty is kept", () => {
    const source = toc03();
    source.sections.push({ id: "soon", space: "business", title: "Coming soon", groups: [] });
    source.sections[0].groups.push({ title: "Later", pages: [] });
    const out = applySpaces(source, planSpaces(source, "en"), "en");
    assert.deepEqual(out.sections.at(-1), { id: "soon", space: "use", title: "Coming soon", groups: [] });
    assert.deepEqual(out.sections[0].groups[1], { title: "Later", pages: [] });
  });

  test("nothing to do without spaces, or once migrated (idempotent)", () => {
    const none = toc03();
    delete none.spaces;
    assert.equal(planSpaces(none, "en"), null);
    const once = applySpaces(toc03(), planSpaces(toc03(), "en"), "en");
    assert.equal(planSpaces(once, "en"), null);
  });
});

describe("migrate (doc-kit upgrade)", () => {
  const dirs = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  const json = (v) => JSON.stringify(v, null, 2) + "\n";
  /** A project of 0.3 with an English source and a French translation of its table of contents. */
  function project({ translationCurrent = true } = {}) {
    const root = tempDir("doc-kit-migration-");
    dirs.push(root);
    const source = json(toc03());
    const translated = toc03();
    translated.title = "Acme FR";
    for (const s of translated.sections) {
      delete s.space;
      s.title = `${s.title} (fr)`;
    }
    fs.mkdirSync(path.join(root, "content"));
    fs.mkdirSync(path.join(root, "translations", "fr"), { recursive: true });
    fs.writeFileSync(path.join(root, "content", "toc.json"), source);
    fs.writeFileSync(path.join(root, "translations", "fr", "toc.json"), json(translated));
    fs.writeFileSync(
      path.join(root, "translations", "fr", ".sources.json"),
      json({ "home.md": "abc", "toc.json": translationCurrent ? hashText(source) : "0000000000000000" }),
    );
    return root;
  }
  const run = async (root, config = { language: "en" }) => {
    const files = createVirtualFiles(root);
    await migration.migrate({ files, config, root });
    return files;
  };
  const read = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

  test("the source and its translation get the same structure; the build's merge finds nothing to say", async () => {
    const root = project();
    const files = await run(root);
    assert.deepEqual(
      files.changes().map((c) => c.file),
      ["content/toc.json", "translations/fr/.sources.json", "translations/fr/toc.json"],
    );
    files.apply();
    const source = read(root, "content/toc.json");
    const translated = read(root, "translations/fr/toc.json");
    assert.equal(translated.sections[4].title, "Exploiter l'application", "the operating section in French");
    assert.equal(translated.sections[4].space, undefined, "a translation carries no space");
    assert.equal(translated.sections[5].title, "Take over (fr)");
    const { problems } = translatedToc({ source, translated });
    assert.deepEqual(problems, []);
    // Up to date before, up to date after: its fingerprint follows the new source; the others are untouched.
    const sources = read(root, "translations/fr/.sources.json");
    assert.equal(sources["toc.json"], hashText(fs.readFileSync(path.join(root, "content", "toc.json"), "utf8")));
    assert.equal(sources["home.md"], "abc");
    // A second run changes nothing.
    assert.deepEqual((await run(root)).changes(), []);
  });

  test("a translation that was not up to date stays so; a project without spaces is left as it is", async () => {
    const root = project({ translationCurrent: false });
    const files = await run(root);
    assert.ok(!files.changes().some((c) => c.file.endsWith(".sources.json")));
    const plain = tempDir("doc-kit-migration-");
    dirs.push(plain);
    fs.mkdirSync(path.join(plain, "content"));
    fs.writeFileSync(path.join(plain, "content", "toc.json"), json({ title: "x", sections: [] }));
    assert.deepEqual((await run(plain)).changes(), []);
    const empty = tempDir("doc-kit-migration-");
    dirs.push(empty);
    assert.deepEqual((await run(empty)).changes(), [], "no table of contents");
  });

  test("a table of contents saved with a byte order mark is read; the result has none", async () => {
    const root = project();
    const file = path.join(root, "content", "toc.json");
    fs.writeFileSync(file, "\uFEFF" + fs.readFileSync(file, "utf8"));
    const files = await run(root);
    files.apply();
    const text = fs.readFileSync(file, "utf8");
    assert.notEqual(text.charCodeAt(0), 0xfeff);
    assert.ok(JSON.parse(text).spaces.includes("use"));
  });

  test("the format of kit 0.1 is refused, with the way out (doc-kit migrate first); nothing is written", async () => {
    const legacy = tempDir("doc-kit-migration-");
    dirs.push(legacy);
    fs.mkdirSync(path.join(legacy, "content"));
    fs.writeFileSync(
      path.join(legacy, "content", "toc.json"),
      json({ titre: "x", espaces: ["business"], sections: [] }),
    );
    const file = path.join(KIT_ROOT, "engine", "migrations", "0.4.0.mjs");
    const files = createVirtualFiles(legacy);
    const done = await runMigrations([{ version: "0.4.0", file }], { files, config: {}, root: legacy });
    assert.deepEqual(
      done.map((d) => [d.version, d.key, d.vars]),
      [["0.4.0", "migration.legacyToc", { file: "content/toc.json" }]],
    );
    assert.deepEqual(files.changes(), []);
    fs.rmSync(path.join(legacy, "content", "toc.json"));
    fs.writeFileSync(
      path.join(legacy, "content", "sommaire.json"),
      json({ titre: "x", espaces: ["takeover"], sections: [] }),
    );
    const again = await runMigrations([{ version: "0.4.0", file }], {
      files: createVirtualFiles(legacy),
      config: {},
      root: legacy,
    });
    assert.deepEqual(again[0].vars, { file: "content/sommaire.json" });
    // Without spaces, there is nothing for 0.4.0 to do: it upgrades as before.
    fs.writeFileSync(path.join(legacy, "content", "sommaire.json"), json({ titre: "x", sections: [] }));
    const plain = await runMigrations([{ version: "0.4.0", file }], {
      files: createVirtualFiles(legacy),
      config: {},
      root: legacy,
    });
    assert.deepEqual(plain, [{ version: "0.4.0" }]);
  });

  test("folders written loosely in doc.config.mjs (./translations/, a backslash)", async () => {
    const root = project();
    const files = await run(root, {
      language: "en",
      paths: { content: "./content/", translations: ".\\translations\\" },
    });
    assert.deepEqual(
      files.changes().map((c) => c.file),
      ["content/toc.json", "translations/fr/.sources.json", "translations/fr/toc.json"],
    );
  });

  test("custom content and translations folders (doc.config.mjs paths)", async () => {
    const root = project();
    fs.renameSync(path.join(root, "content"), path.join(root, "docs"));
    fs.renameSync(path.join(root, "translations"), path.join(root, "i18n"));
    const files = await run(root, { language: "en", paths: { content: "docs", translations: "i18n" } });
    assert.deepEqual(
      files.changes().map((c) => c.file),
      ["docs/toc.json", "i18n/fr/.sources.json", "i18n/fr/toc.json"],
    );
  });

  test("a project of 0.3 is offered this migration by a kit of 0.4; the fixtures of the kit are already migrated", async () => {
    assert.deepEqual(
      pendingMigrations("^0.3.0", "0.4.0").map((m) => m.version),
      ["0.4.0"],
    );
    for (const dir of [
      "examples/demo-docs",
      "test/fixtures/spaces",
      "test/fixtures/business",
      "test/fixtures/languages",
    ]) {
      const files = await run(path.join(KIT_ROOT, dir));
      assert.deepEqual(files.changes(), [], dir);
    }
    assert.deepEqual((await buildBusiness()).errors, []);
  });
});
