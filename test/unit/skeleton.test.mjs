// The skeleton of a project (engine/dev/skeleton.mjs, ARCHITECTURE.md §2.1 and §6.1a): `--spaces` read, the table
// of contents cut to the spaces chosen — the operating part of Administer going to Develop when only Develop is kept,
// the counterparts, journeys and suggestions that named a page left out —, and the files of those pages removed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseSpaces,
  tailorToc,
  writeSkeleton,
  cutToSpaces,
  jsonText,
  SPACE_PRESETS,
} from "../../engine/dev/skeleton.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const page = (id, extra = {}) => ({ id, title: id, ...extra });
const section = (id, space, pages) => ({ id, title: id, space, groups: [{ title: "g", pages }] });
/** A skeleton-like table of contents: one section per space, the operating part in Administer. */
const toc = () => ({
  title: "Docs",
  spaces: ["use", { id: "product" }, "admin", "develop"],
  sections: [
    section("use", "use", [page("u/start")]),
    section("features", "product", [page("p/feature", { counterpart: ["d/feature", "u/start~steps"] })]),
    section("administer", "admin", [page("a/users")]),
    section("operate", "admin", [page("o/runbook", { file: "o/runbook-page.md" })]),
    section("take-over", "develop", [page("d/feature", { counterpart: "p/feature" }), page("d/arch")]),
  ],
  journeys: [
    { title: "Users", space: "use", steps: ["u/start"] },
    { title: "Admins", space: "admin", steps: ["a/users", "o/runbook"] },
    { title: "Mixed", steps: ["p/feature", "d/arch"] },
    { title: "Product only", steps: ["p/feature"] },
  ],
  suggestions: ["u/start", "p/feature", "d/arch"],
});
const ids = (t) => t.sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => p.id)));
const pageOf = (t, id) => t.sections.flatMap((s) => s.groups.flatMap((g) => g.pages)).find((p) => p.id === id);

describe("--spaces", () => {
  test("none, or ids of the skeleton's spaces: each once, in the skeleton's order", () => {
    assert.deepEqual(parseSpaces("none"), []);
    assert.deepEqual(parseSpaces(" develop , use "), ["use", "develop"]);
    assert.deepEqual(parseSpaces("use,product,admin,develop"), SPACE_PRESETS.all);
    for (const value of ["", ",", "use,use", "use,foo", "none,use", "Use"])
      assert.throws(
        () => parseSpaces(value),
        (e) =>
          e.key === "init.spacesInvalid" &&
          e.code === 2 &&
          e.vars.value === value &&
          e.vars.known === "use, product, admin, develop",
        JSON.stringify(value),
      );
  });
});

describe("the table of contents for some spaces", () => {
  test("only Develop: the operating part of Administer goes to Develop; what named a page left out goes", () => {
    const source = toc();
    const { toc: t, removed } = tailorToc(source, ["develop"]);
    assert.deepEqual(
      t.sections.map((s) => [s.id, s.space]),
      [
        ["operate", "develop"],
        ["take-over", "develop"],
      ],
    );
    assert.deepEqual(t.spaces, ["develop"]);
    assert.deepEqual(
      removed.map((p) => p.id),
      ["u/start", "p/feature", "a/users"],
    );
    assert.equal(pageOf(t, "d/feature").counterpart, undefined, "its counterpart left out");
    // The journey of Administer goes with its space; a journey of no space keeps its steps left, or goes without any.
    assert.deepEqual(t.journeys, [{ title: "Mixed", steps: ["d/arch"] }]);
    assert.deepEqual(t.suggestions, ["d/arch"]);
    assert.deepEqual(source, toc(), "pure: the table given is unchanged");
  });

  test("Administer kept: its operating part stays in it; the French id too", () => {
    const { toc: t } = tailorToc(toc(), ["admin", "develop"]);
    assert.deepEqual(
      t.sections.map((s) => [s.id, s.space]),
      [
        ["administer", "admin"],
        ["operate", "admin"],
        ["take-over", "develop"],
      ],
    );
    assert.deepEqual(
      t.journeys.map((j) => j.title),
      ["Admins", "Mixed"],
    );
    const french = toc();
    french.sections[3].id = "exploiter";
    assert.deepEqual(
      tailorToc(french, ["use", "develop"]).toc.sections.map((s) => [s.id, s.space]),
      [
        ["use", "use"],
        ["exploiter", "develop"],
        ["take-over", "develop"],
      ],
    );
    // Another section of Administer never moves.
    assert.ok(!ids(tailorToc(toc(), ["develop"]).toc).includes("a/users"));
  });

  test("a list of counterparts keeps the targets left, anchors included; one kept as it was", () => {
    const { toc: t } = tailorToc(toc(), ["use", "product"]);
    assert.deepEqual(pageOf(t, "p/feature").counterpart, ["u/start~steps"]);
    assert.deepEqual(t.spaces, ["use", { id: "product" }]);
    const all = tailorToc(toc(), SPACE_PRESETS.all).toc;
    assert.deepEqual(pageOf(all, "p/feature").counterpart, ["d/feature", "u/start~steps"]);
    assert.equal(pageOf(all, "d/feature").counterpart, "p/feature");
    assert.deepEqual(all, toc(), "the four: nothing changes");
    const single = toc();
    pageOf(single, "d/feature").counterpart = "u/start~steps";
    assert.equal(pageOf(tailorToc(single, ["use", "develop"]).toc, "d/feature").counterpart, "u/start~steps");
  });

  test("no space at all: the same pages, without spaces, nor a space on a section, a page or a journey", () => {
    const source = toc();
    pageOf(source, "u/start").space = "use";
    const { toc: t, removed } = tailorToc(source, []);
    assert.deepEqual(removed, []);
    assert.equal("spaces" in t, false);
    assert.deepEqual(ids(t), ids(toc()));
    for (const s of t.sections) assert.equal("space" in s, false, s.id);
    assert.equal("space" in pageOf(t, "u/start"), false);
    for (const j of t.journeys) assert.equal("space" in j, false, j.title);
    assert.equal(t.journeys.length, 4);
  });
});

describe("the table of contents rewritten", () => {
  test("laid out as the template is: a list of plain values on one line when it fits in 120 columns", () => {
    for (const language of ["en", "fr"]) {
      const file = path.join(KIT_ROOT, "templates", "project", language, "content", "toc.json");
      const text = fs.readFileSync(file, "utf8");
      assert.equal(jsonText(JSON.parse(text)), text, language);
    }
    // 120 columns exactly, the comma that follows counted.
    assert.equal(jsonText({ k: ["a".repeat(109)] }), `{\n  "k": ["${"a".repeat(109)}"]\n}\n`);
    assert.equal(jsonText({ k: ["a".repeat(110)] }), `{\n  "k": [\n    "${"a".repeat(110)}"\n  ]\n}\n`);
    assert.equal(jsonText({ k: ["a".repeat(108)], z: 1 }), `{\n  "k": ["${"a".repeat(108)}"],\n  "z": 1\n}\n`);
    assert.match(jsonText({ k: ["a".repeat(109)], z: 1 }), /^\{\n {2}"k": \[\n/);
    assert.equal(
      jsonText({ a: [1, null, true], b: [], c: {}, d: [{ e: "f" }] }),
      '{\n  "a": [1, null, true],\n  "b": [],\n  "c": {},\n  "d": [\n    {\n      "e": "f"\n    }\n  ]\n}\n',
    );
  });
});

describe("the skeleton written for some spaces", () => {
  for (const [language, gone, kept] of [
    ["en", ["features", "take-over"], "use/getting-started.md"],
    ["fr", ["fonctionnalites", "reprendre"], "utiliser/prise-en-main.md"],
  ])
    test(`${language}: the files of the pages left out and their empty folders removed, the list without them`, () => {
      const target = path.join(tempDir("doc-kit-skeleton-"), "docs");
      try {
        const files = writeSkeleton({ target, language, vars: { name: "Shop" }, mode: "none", spaces: ["use"] });
        const content = path.join(target, "content");
        for (const dir of gone) assert.ok(!fs.existsSync(path.join(content, dir)), dir);
        assert.ok(fs.existsSync(path.join(content, kept)));
        const onDisk = fs
          .readdirSync(target, { recursive: true })
          .map(String)
          .filter((f) => fs.statSync(path.join(target, f)).isFile())
          .map((f) => f.split(path.sep).join("/"))
          .sort();
        assert.deepEqual(files, onDisk, "exactly the files written");
        const t = JSON.parse(fs.readFileSync(path.join(content, "toc.json"), "utf8"));
        assert.deepEqual(t.spaces, ["use"]);
        for (const id of ids(t)) assert.ok(files.includes(`content/${id}.md`), id);
      } finally {
        fs.rmSync(path.dirname(target), { recursive: true, force: true });
      }
    });

  test("a page left out is removed only inside content/, whatever its id or its file says", () => {
    const root = tempDir("doc-kit-skeleton-");
    const target = path.join(root, "docs");
    try {
      const content = path.join(target, "content");
      fs.mkdirSync(path.join(content, "p"), { recursive: true });
      const outside = ["outside.md", "docs/outside.md", "docs/kept.md"];
      for (const f of [...outside, "docs/content/p/f.md"]) fs.writeFileSync(path.join(root, ...f.split("/")), "x");
      const t = toc();
      // Only the Product section is left out: its pages are the files to remove.
      t.sections[1].groups[0].pages = [
        page("p/f"),
        page("../outside"),
        page("../../outside"),
        page("x", { file: "../kept.md" }),
      ];
      fs.writeFileSync(path.join(content, "toc.json"), JSON.stringify(t));
      assert.deepEqual(cutToSpaces(target, ["use", "admin", "develop"]), ["content/p/f.md"]);
      for (const f of outside) assert.ok(fs.existsSync(path.join(root, ...f.split("/"))), f);
      assert.ok(!fs.existsSync(path.join(content, "p")), "its folder left empty, removed");
      assert.ok(fs.existsSync(content), "content/ itself stays");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("without spaces given: the four, the table of contents as the template has it", () => {
    const target = path.join(tempDir("doc-kit-skeleton-"), "docs");
    try {
      const files = writeSkeleton({ target, language: "en", vars: { name: "Shop" }, mode: "none" });
      assert.ok(files.includes("content/take-over/runbook.md"));
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(target, "content", "toc.json"), "utf8")).spaces,
        SPACE_PRESETS.all,
      );
    } finally {
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });
});
