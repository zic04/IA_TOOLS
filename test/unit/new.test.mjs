// new (cli/commands/new.mjs): page created from its template, entry added to the table of contents without
// reformatting it (indentation, inline arrays, line endings), placement (after the parent and its sub-pages, end of
// the group with the longest id prefix), refusals and exit codes; the former French-keyed files are not read.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPage, locateJson, insertEntry, addProperty, PAGE_ID } from "../../cli/commands/new.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { captureVariant } from "../../engine/core/page-templates.mjs";
import { build } from "../../engine/build/build.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir } from "../tools/helpers.mjs";

/** A French project whose folders are named in French through `paths` (contenu/, schemas/). */
const FRENCH = path.join(KIT_ROOT, "test", "fixtures", "audit-untyped");
const SUMMARY = "To write.";

async function withDir(make, fn) {
  const dir = make();
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const frenchCopy = () => {
  const dir = tempDir("doc-kit-new-");
  fs.cpSync(FRENCH, dir, { recursive: true });
  return dir;
};
const config = async (dir) => (await loadProject({ project: dir, env: {} })).config;
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
/** Ids of the pages of a toc, with their level, in order. */
const outline = (toc) =>
  toc.sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => `${p.id}:${p.level ?? 1}`)));
/** Every line of `before` is still in `after`, in the same order (nothing was reformatted). */
function assertOnlyAdded(before, after) {
  const b = before.split("\n");
  const a = after.split("\n");
  let j = 0;
  for (const line of b) {
    while (j < a.length && a[j] !== line) j++;
    assert.ok(j < a.length, `line lost or changed: ${line}`);
    j++;
  }
}

describe("locating and editing JSON as text", () => {
  test("locateJson: offsets of every value", () => {
    const text = String.fromCharCode(0xfeff) + '{ "a": [1, { "b": "x\\"y" }], "c": true, "d": [] }';
    const tree = locateJson(text);
    assert.equal(tree.type, "object");
    assert.deepEqual(
      tree.props.map((p) => p.key),
      ["a", "c", "d"],
    );
    for (const p of tree.props)
      assert.deepEqual(JSON.parse(text.slice(p.value.start, p.value.end)), JSON.parse(text.slice(1))[p.key]);
    assert.equal(tree.props[0].value.items[1].props[0].value.value, 'x"y');
  });

  test(
    "locateJson: a string left open is an error, never a read past the end nor a loop without end",
    { timeout: 10_000 },
    () => {
      for (const text of ['{"sections": [{"id": "use', '"', '{"a": "x\\', '{"a": "x\\"'])
        assert.throws(() => locateJson(text), SyntaxError, JSON.stringify(text));
      assert.equal(locateJson('{"a": "x\\""}').props[0].value.value, 'x"', "the control: the same string closed");
    },
  );

  test("insertEntry: a multi-line sibling, an inline sibling, an empty array; CRLF and tabs kept", () => {
    const multi = '{\r\n\t"pages": [\r\n\t\t{\r\n\t\t\t"id": "a"\r\n\t\t}\r\n\t]\r\n}\r\n';
    const out = insertEntry(multi, locateJson(multi).props[0].value, 0, { id: "b", list: ["x", "y"] });
    assert.equal(
      out,
      '{\r\n\t"pages": [\r\n\t\t{\r\n\t\t\t"id": "a"\r\n\t\t},\r\n\t\t{\r\n\t\t\t"id": "b",\r\n\t\t\t"list": [\r\n\t\t\t\t"x",\r\n\t\t\t\t"y"\r\n\t\t\t]\r\n\t\t}\r\n\t]\r\n}\r\n',
    );
    const inline = '{\n  "pages": [\n    { "id": "a", "title": "A" }\n  ]\n}\n';
    assert.equal(
      insertEntry(inline, locateJson(inline).props[0].value, 0, { id: "b" }),
      '{\n  "pages": [\n    { "id": "a", "title": "A" },\n    { "id": "b" }\n  ]\n}\n',
    );
    const sameLine = '{ "pages": [{"id":"a"}] }';
    assert.equal(
      insertEntry(sameLine, locateJson(sameLine).props[0].value, 0, { id: "b" }),
      '{ "pages": [{"id":"a"}, {"id":"b"}] }',
    );
    const empty = '{\n  "groups": [\n    { "title": "G", "pages": [] }\n  ]\n}\n';
    const node = locateJson(empty).props[0].value.items[0].props[1].value;
    const added = insertEntry(empty, node, -1, { id: "b" });
    assert.deepEqual(JSON.parse(added).groups[0].pages, [{ id: "b" }]);
    assert.match(added, /"pages": \[\n {6}\{\n {8}"id": "b"\n {6}\}\n {4}\]/);
  });

  test("addProperty: at the end of a multi-line or inline object", () => {
    const multi = '{\n  "id": "a",\n  "title": "A"\n}';
    assert.equal(
      addProperty(multi, locateJson(multi), "template", "screen"),
      '{\n  "id": "a",\n  "title": "A",\n  "template": "screen"\n}',
    );
    const inline = '{ "id": "a" }';
    assert.equal(addProperty(inline, locateJson(inline), "template", "screen"), '{ "id": "a", "template": "screen" }');
  });

  test("page ids", () => {
    for (const id of ["use/orders", "use/orders/export", "take-over/journey-order/step_2"]) assert.match(id, PAGE_ID);
    for (const id of ["use", "Use/orders", "use/../x", "use//x", "/use/x", "use/x/", "use/é"])
      assert.doesNotMatch(id, PAGE_ID);
  });
});

describe("creating a page", () => {
  test("--parent: right after the parent and its sub-pages, level 2; the template is copied in the variant of the capture mode", () =>
    withDir(demoCopy, async (dir) => {
      const before = read(dir, "content/toc.json");
      const r = createPage({
        root: dir,
        config: await config(dir),
        id: "use/orders/export",
        template: "screen",
        title: "Exporting orders",
        parent: "use/orders",
        summary: SUMMARY,
      });
      assert.deepEqual(r.placement, { kind: "after", after: "use/orders/detail" });
      assert.deepEqual(r.entry, {
        id: "use/orders/export",
        title: "Exporting orders",
        menuTitle: "Exporting orders",
        level: 2,
        summary: SUMMARY,
        template: "screen",
      });
      assert.equal(
        read(dir, "content/use/orders/export.md"),
        captureVariant(fs.readFileSync(path.join(KIT_ROOT, "templates/pages/en/screen.md"), "utf8"), "app"),
      );
      assert.doesNotMatch(
        read(dir, "content/use/orders/export.md"),
        /doc-kit:capture|doc-kit:end/,
        "no variant marker left",
      );
      const after = read(dir, "content/toc.json");
      assertOnlyAdded(before, after);
      assert.match(
        after,
        /"highlights": \["The annotated orders list", "Settings, step by step"\]/,
        "inline arrays are kept",
      );
      assert.deepEqual(outline(JSON.parse(after)).slice(0, 4), [
        "use/orders:1",
        "use/orders/detail:2",
        "use/orders/export:2",
        "use/settings:1",
      ]);
    }));

  test("without --parent: at the end of the group of the longest id prefix; a draft build passes", () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      const r = createPage({
        root: dir,
        config: cfg,
        id: "maintain/deployment",
        template: "technical",
        summary: SUMMARY,
      });
      assert.deepEqual(r.placement, { kind: "end", group: "Technical", section: "maintain" });
      assert.equal(r.entry.title, "Deployment");
      const hint = createPage({
        root: dir,
        config: cfg,
        id: "use/settings/advanced",
        template: "screen",
        summary: SUMMARY,
      });
      assert.equal(hint.placement.parentHint, "use/settings", "the id extends a level-1 page");
      assert.deepEqual(outline(JSON.parse(read(dir, "content/toc.json"))), [
        "use/orders:1",
        "use/orders/detail:2",
        "use/settings:1",
        "use/settings/advanced:1",
        "features/track-orders:1",
        "features/approve-order:1",
        "features/rules:1",
        "features/roles:1",
        "secure/access-ownership:1",
        "maintain/architecture:1",
        "maintain/deployment:1",
        "secure/api-surface:1",
        "risks/findings:1",
      ]);
      const b = build({ project: { root: dir }, config: cfg, options: { draft: true } });
      assert.ok(b.html);
      assert.deepEqual(b.errors, []);
      assert.ok(b.warnings.some((w) => w.key === "template.guidance" && w.vars.page === "maintain/deployment"));
    }));

  test("a multilingual project (the demo, en and fr): the same entry, at the same place, in the French table of contents; a draft build passes", () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      assert.deepEqual(cfg.languages, ["en", "fr"], "the demo is bilingual");
      const frenchBefore = read(dir, "translations/fr/toc.json");
      const r = createPage({
        root: dir,
        config: cfg,
        id: "maintain/deployment",
        template: "technical",
        summary: SUMMARY,
      });
      assert.deepEqual(r.translations, [{ lang: "fr", file: "translations/fr/toc.json" }]);
      const french = JSON.parse(read(dir, "translations/fr/toc.json"));
      assert.deepEqual(
        outline(french),
        outline(JSON.parse(read(dir, "content/toc.json"))),
        "the structure is the source's",
      );
      const entry = french.sections
        .flatMap((s) => s.groups.flatMap((g) => g.pages))
        .find((p) => p.id === "maintain/deployment");
      assert.equal(entry.title, "Deployment", "the source's text, to translate");
      assertOnlyAdded(frenchBefore, read(dir, "translations/fr/toc.json"));
      const b = build({ project: { root: dir }, config: cfg, options: { draft: true } });
      assert.deepEqual(b.errors, []);
      assert.ok(
        b.warnings.some((w) => w.key === "translation.missing" && w.vars.lang === "fr"),
        "the French page is missing: the source is shown with its banner",
      );
      assert.ok(!b.warnings.some((w) => w.key === "translation.toc.structure"), "no structure difference");
    }));

  // Each row edits the French table of contents of a copy of the demo before `new maintain/deployment` (it goes at
  // the end of the group of maintain/architecture); `gains`: whether that file gets the entry. The source page is
  // created in every case; a file left as it is is the build's to report (translation.toc.structure).
  const asJson = (fn) => (text) => {
    const toc = JSON.parse(text);
    fn(toc);
    return JSON.stringify(toc, null, 2);
  };
  const groupOf = (toc, id) => toc.sections.flatMap((s) => s.groups).find((g) => g.pages.some((p) => p.id === id));
  for (const [label, edit, gains] of [
    ["in step with the source (the control)", (text) => text, true],
    [
      "its maintain section missing",
      asJson((t) => (t.sections = t.sections.filter((s) => s.id !== "maintain"))),
      false,
    ],
    [
      "one more page in that group: the index is not the source's",
      asJson((t) => groupOf(t, "maintain/architecture").pages.unshift({ id: "maintain/other", title: "Autre" })),
      false,
    ],
    [
      "the page already declared there (in another group): never twice",
      asJson((t) => groupOf(t, "use/settings").pages.push({ id: "maintain/deployment", title: "Déploiement" })),
      false,
    ],
    [
      "not valid JSON, cut inside a string: read once, never located (it used to loop without end)",
      (text) => text.slice(0, text.indexOf('"maintain/architecture"') + 10),
      false,
    ],
  ])
    test(
      `a translated table of contents ${label}: ${gains ? "the entry added" : "left as it is"}`,
      { timeout: 30_000 },
      () =>
        withDir(demoCopy, async (dir) => {
          const file = path.join(dir, "translations/fr/toc.json");
          fs.writeFileSync(file, edit(fs.readFileSync(file, "utf8")));
          const before = fs.readFileSync(file, "utf8");
          const r = createPage({
            root: dir,
            config: await config(dir),
            id: "maintain/deployment",
            template: "technical",
            summary: SUMMARY,
          });
          assert.ok(fs.existsSync(path.join(dir, r.file)), "the source page is created");
          assert.deepEqual(r.translations, gains ? [{ lang: "fr", file: "translations/fr/toc.json" }] : []);
          const after = fs.readFileSync(file, "utf8");
          if (!gains) assert.equal(after, before);
          else
            assert.deepEqual(
              groupOf(JSON.parse(after), "maintain/architecture").pages.map((p) => p.id),
              ["maintain/architecture", "maintain/deployment"],
            );
        }),
    );

  test("the CLI says which translated table of contents gained the entry, in English and in French", () =>
    withDir(demoCopy, async (dir) => {
      for (const [lang, id, expected] of [
        ["en", "maintain/deployment", "the same entry, at the same place, in the fr table of contents"],
        ["fr", "maintain/upgrade", "la même entrée, au même endroit, dans le sommaire fr"],
      ]) {
        let out = "";
        const code = await runCli(["new", id, "--template", "technical", "--project", dir, "--lang", lang], {
          stdout: { write: (s) => (out += s) },
          stderr: { write: () => {} },
          env: {},
        });
        assert.equal(code, 0);
        assert.match(out, new RegExp(`translations/fr/toc\\.json.*${expected}`));
      }
    }));

  test("capture.mode none: the screen and editor pages describe the screen with a table, never a :::screen", () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      const none = { ...cfg, capture: { ...cfg.capture, mode: "none" } };
      createPage({ root: dir, config: none, id: "use/reports", template: "screen", summary: SUMMARY });
      createPage({ root: dir, config: none, id: "use/report-builder", template: "editor", summary: SUMMARY });
      for (const f of ["content/use/reports.md", "content/use/report-builder.md"]) {
        const text = read(dir, f);
        assert.doesNotMatch(text, /^:::screen\{|^::before-after\{|doc-kit:(?:capture|end)/m, f);
        assert.match(
          text,
          /## The screen\n\n<!-- guidance: no screenshot in this project[^\n]*-->\n\n\| Element \| What it shows \|\n\|---\|---\|\n/,
          f,
        );
      }
      const b = build({ project: { root: dir }, config: none, options: { draft: true } });
      assert.deepEqual(b.errors, []);
    }));

  test("refuses to overwrite (exit code 1) and leaves the table of contents unchanged", () =>
    withDir(demoCopy, async (dir) => {
      const before = read(dir, "content/toc.json");
      assert.throws(
        () =>
          createPage({
            root: dir,
            config: { paths: { content: "content" }, language: "en" },
            id: "use/settings",
            template: "screen",
            summary: SUMMARY,
          }),
        (e) => e.code === 1 && e.key === "new.exists",
      );
      assert.equal(read(dir, "content/toc.json"), before);
    }));

  test("a page declared but not written: only its file is written, and its template added to its entry", () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      fs.rmSync(path.join(dir, "content/use/settings.md"));
      assert.throws(
        () => createPage({ root: dir, config: cfg, id: "use/settings", summary: SUMMARY }),
        (e) => e.code === 2 && e.key === "new.missingTemplate",
      );
      const r = createPage({ root: dir, config: cfg, id: "use/settings", template: "editor", summary: SUMMARY });
      assert.deepEqual(r.placement, { kind: "typed" });
      const toc = JSON.parse(read(dir, "content/toc.json"));
      assert.equal(toc.sections[0].groups[0].pages[2].template, "editor");
      fs.rmSync(path.join(dir, "content/use/orders.md"));
      assert.throws(
        () => createPage({ root: dir, config: cfg, id: "use/orders", template: "editor", summary: SUMMARY }),
        (e) => e.code === 2 && e.key === "new.templateConflict",
      );
      assert.deepEqual(createPage({ root: dir, config: cfg, id: "use/orders", summary: SUMMARY }).placement, {
        kind: "declared",
      });
    }));

  test("usage errors (exit code 2)", () =>
    withDir(demoCopy, async (dir) => {
      const cfg = await config(dir);
      const fails = (args, key) =>
        assert.throws(
          () => createPage({ root: dir, config: cfg, summary: SUMMARY, ...args }),
          (e) => e.code === 2 && e.key === key,
          key,
        );
      fails({}, "new.missingId");
      fails({ id: "Use/X", template: "screen" }, "new.invalidId");
      fails({ id: "use/x", template: "nope" }, "new.unknownTemplate");
      fails({ id: "use/x" }, "new.missingTemplate");
      fails({ id: "nope/x", template: "screen" }, "new.unknownSection");
      fails({ id: "use/x", template: "screen", parent: "use/nope" }, "new.unknownParent");
      fails({ id: "use/x", template: "screen", parent: "use/orders/detail" }, "new.parentIsSubPage");
      fails({ id: "use/x", template: "screen", parent: "maintain/architecture" }, "new.parentSection");
    }));

  test("a French project (contenu/toc.json): the French template, the entry in the keys of toc.json", () =>
    withDir(frenchCopy, async (dir) => {
      const before = read(dir, "contenu/toc.json");
      const r = createPage({
        root: dir,
        config: await config(dir),
        id: "reprendre/maintenir-doc",
        template: "technical",
        title: "Maintenir la doc",
        summary: "À écrire.",
      });
      assert.equal(r.toc, "contenu/toc.json");
      assert.deepEqual(r.entry, {
        id: "reprendre/maintenir-doc",
        title: "Maintenir la doc",
        menuTitle: "Maintenir la doc",
        summary: "À écrire.",
        template: "technical",
      });
      assert.match(read(dir, "contenu/reprendre/maintenir-doc.md"), /<!-- consigne :/);
      assertOnlyAdded(before, read(dir, "contenu/toc.json"));
      const sub = createPage({
        root: dir,
        config: await config(dir),
        id: "reprendre/dat/flux",
        template: "technical-sub",
        parent: "reprendre/dat",
        summary: "À écrire.",
      });
      assert.equal(sub.entry.level, 2);
    }));

  test("the former French-keyed files are not read (ARCHITECTURE.md §6.7)", () =>
    withDir(frenchCopy, async (dir) => {
      const cfg = await config(dir);
      const create = () =>
        createPage({ root: dir, config: cfg, id: "utiliser/export", template: "screen", summary: SUMMARY });
      const toc = path.join(dir, "contenu/toc.json");
      const text = fs.readFileSync(toc, "utf8");
      // A sommaire.json alone: no table of contents.
      fs.renameSync(toc, path.join(dir, "contenu/sommaire.json"));
      assert.throws(create, (e) => e.code === 1 && e.key === "new.noToc" && e.vars.file === "contenu/toc.json");
      // A toc.json with French keys: an invalid table of contents, nothing written.
      fs.rmSync(path.join(dir, "contenu/sommaire.json"));
      const french = text.replace(/"title":/g, '"titre":').replace(/"groups":/g, '"groupes":');
      fs.writeFileSync(toc, french);
      assert.throws(create, (e) => e.code === 1 && e.key === "new.invalidToc" && e.vars.error === "schema");
      assert.equal(fs.readFileSync(toc, "utf8"), french);
      assert.ok(!fs.existsSync(path.join(dir, "contenu/utiliser/export.md")));
    }));
});

describe("CLI", () => {
  async function cli(args) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
    });
    return { code, out, err };
  }

  test("messages in the project's language, next steps; --json; exit codes", () =>
    withDir(frenchCopy, async (dir) => {
      const r = await cli([
        "new",
        "reprendre/parcours-commande/archivage",
        "--template",
        "journey-step",
        "--parent",
        "reprendre/parcours-commande",
        "--project",
        dir,
      ]);
      assert.equal(r.code, 0, r.err);
      assert.equal(
        r.out,
        "✔ contenu/reprendre/parcours-commande/archivage.md créée à partir du gabarit « journey-step »\n" +
          "✔ contenu/toc.json : « reprendre/parcours-commande/archivage » ajoutée après « reprendre/parcours-commande/facture », en sous-page\n" +
          "→ rédigez la page (contenu/reprendre/parcours-commande/archivage.md) et son résumé dans contenu/toc.json, puis regardez-la : doc-kit dev\n",
      );
      const toc = JSON.parse(read(dir, "contenu/toc.json"));
      const added = toc.sections[1].groups[1].pages.find((p) => p.id === "reprendre/parcours-commande/archivage");
      assert.equal(added.summary, "À écrire : une phrase qui dit ce que le lecteur trouve sur cette page.");
      const again = await cli([
        "new",
        "reprendre/parcours-commande/archivage",
        "--template",
        "journey-step",
        "--project",
        dir,
        "--lang",
        "en",
      ]);
      assert.equal(again.code, 1);
      assert.match(
        again.err,
        /^✖ the page already exists: contenu\/reprendre\/parcours-commande\/archivage\.md\n {2}→ nothing was written/,
      );
      const json = await cli(["new", "utiliser/export", "--template", "screen", "--project", dir, "--json"]);
      assert.equal(JSON.parse(json.out).placement.kind, "end");
      assert.equal((await cli(["new", "--project", dir])).code, 2);
    }));

  test("the demo itself is never modified by the tests", () => {
    assert.ok(!fs.existsSync(path.join(DEMO, "content/use/orders/export.md")));
  });
});
