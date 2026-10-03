// new (cli/commands/new.mjs): page created from its template, entry added to the table of contents without
// reformatting it (indentation, inline arrays, line endings, legacy French keys), placement (after the parent and
// its sub-pages, end of the group with the longest id prefix), refusals and exit codes.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPage, locateJson, insertEntry, addProperty, PAGE_ID } from "../../cli/commands/new.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { captureVariant } from "../../engine/build/page-templates.mjs";
import { build } from "../../engine/build/build.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir } from "../tools/helpers.mjs";

const LEGACY = path.join(KIT_ROOT, "test", "fixtures", "audit-legacy");
const SUMMARY = "To write.";

async function withDir(make, fn) {
  const dir = make();
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const legacyCopy = () => {
  const dir = tempDir("doc-kit-new-");
  fs.cpSync(LEGACY, dir, { recursive: true });
  return dir;
};
const config = async (dir) => (await loadProject({ project: dir, env: {} })).config;
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
/** Ids of the pages of a toc, with their level, in order. */
const outline = (toc) =>
  toc.sections.flatMap((s) =>
    (s.groups || s.groupes).flatMap((g) => g.pages.map((p) => `${p.id}:${p.level ?? p.niveau ?? 1}`)),
  );
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
    assert.equal(addProperty(inline, locateJson(inline), "gabarit", "screen"), '{ "id": "a", "gabarit": "screen" }');
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
        "maintain/architecture:1",
        "maintain/deployment:1",
        "secure/access-ownership:1",
        "secure/api-surface:1",
        "risks/findings:1",
      ]);
      const b = build({ project: { root: dir }, config: cfg, options: { draft: true } });
      assert.ok(b.html);
      assert.deepEqual(b.errors, []);
      assert.ok(b.warnings.some((w) => w.key === "template.guidance" && w.vars.page === "maintain/deployment"));
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

  test("a legacy table of contents (contenu/sommaire.json): French keys, French template", () =>
    withDir(legacyCopy, async (dir) => {
      const before = read(dir, "contenu/sommaire.json");
      const r = createPage({
        root: dir,
        config: await config(dir),
        id: "reprendre/maintenir-doc",
        template: "technical",
        title: "Maintenir la doc",
        summary: "À écrire.",
      });
      assert.equal(r.toc, "contenu/sommaire.json");
      assert.deepEqual(r.entry, {
        id: "reprendre/maintenir-doc",
        titre: "Maintenir la doc",
        titre_menu: "Maintenir la doc",
        resume: "À écrire.",
        gabarit: "technical",
      });
      assert.match(read(dir, "contenu/reprendre/maintenir-doc.md"), /<!-- consigne :/);
      assertOnlyAdded(before, read(dir, "contenu/sommaire.json"));
      const sub = createPage({
        root: dir,
        config: await config(dir),
        id: "reprendre/dat/flux",
        template: "technical-sub",
        parent: "reprendre/dat",
        summary: "À écrire.",
      });
      assert.equal(sub.entry.niveau, 2);
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
    withDir(legacyCopy, async (dir) => {
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
          "✔ contenu/sommaire.json : « reprendre/parcours-commande/archivage » ajoutée après « reprendre/parcours-commande/facture », en sous-page\n" +
          "→ rédigez la page (contenu/reprendre/parcours-commande/archivage.md) et son résumé dans contenu/sommaire.json, puis regardez-la : doc-kit dev\n",
      );
      const toc = JSON.parse(read(dir, "contenu/sommaire.json"));
      const added = toc.sections[1].groupes[1].pages.find((p) => p.id === "reprendre/parcours-commande/archivage");
      assert.equal(added.resume, "À écrire : une phrase qui dit ce que le lecteur trouve sur cette page.");
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
