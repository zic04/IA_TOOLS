// The former French-keyed formats are no longer read (removed in 0.4.0, ARCHITECTURE.md §6.7): the files
// sommaire.json, glossaire.json and accueil.md are ignored, and a French key in toc.json, glossary.json, a zone file
// or a capture plan entry is never renamed — the schema reports it (an unknown key, or a required key missing).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readToc, TOC_FILE, GLOSSARY_FILE, HOME_FILE } from "../../engine/project/toc.mjs";
import { buildDemo, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";

/** Builds a copy of the demo after `edit(dir)`; the copy is removed afterwards. */
async function buildEdited(edit, options = {}) {
  const dir = demoCopy();
  try {
    edit(dir);
    return await buildDemo({ root: dir, ...options });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const move = (dir, from, to) => fs.renameSync(path.join(dir, from), path.join(dir, to));
const rewrite = (dir, file, fn) =>
  fs.writeFileSync(path.join(dir, file), fn(fs.readFileSync(path.join(dir, file), "utf8")));
/** The problems of a build that come from one file: "path:key". */
const problemsOf = (list, file) => list.filter((e) => e.file === file).map((e) => `${e.path}:${e.key}`);

describe("the files of the project", () => {
  test("one name each: toc.json, glossary.json, home.md", () => {
    assert.deepEqual([TOC_FILE, GLOSSARY_FILE, HOME_FILE], ["toc.json", "glossary.json", "home.md"]);
  });

  test("readToc reads content/toc.json only (a byte-order mark tolerated); sommaire.json is not found", () => {
    const dir = tempDir("doc-kit-toc-");
    try {
      fs.mkdirSync(path.join(dir, "content"));
      const missing = { file: "content/toc.json", toc: null, found: false };
      assert.deepEqual(readToc(dir, "content"), missing);
      fs.writeFileSync(path.join(dir, "content/sommaire.json"), JSON.stringify({ titre: "Docs", sections: [] }));
      assert.deepEqual(readToc(dir, "content"), missing, "the former name is not read");
      fs.writeFileSync(path.join(dir, "content/toc.json"), "﻿" + JSON.stringify({ titre: "Docs", sections: [] }));
      assert.deepEqual(
        readToc(dir, "content"),
        { file: "content/toc.json", toc: { titre: "Docs", sections: [] }, found: true },
        "read as written: no key renamed, no `legacy` field",
      );
      fs.writeFileSync(path.join(dir, "content/toc.json"), "{ not json");
      assert.deepEqual(readToc(dir, "content"), { file: "content/toc.json", toc: null, found: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a content/sommaire.json alone: the build stops on toc.missing (content/toc.json)", async () => {
    const r = await buildEdited((d) => move(d, "content/toc.json", "content/sommaire.json"));
    assert.equal(r.html, null);
    assert.deepEqual(
      r.errors.map((e) => [e.key, e.vars.file]),
      [["toc.missing", "content/toc.json"]],
    );
  });

  test("a glossaire.json alone is not read: no glossary, no error, no warning of its own", async () => {
    const current = await buildDemo();
    assert.ok(dataOf(current.html).glossary.length > 0, "the demo has a glossary");
    // The demo's French translation keeps the same glossary (§6.12): renamed the same way, there too.
    const r = await buildEdited((d) => {
      move(d, "content/glossary.json", "content/glossaire.json");
      move(d, "translations/fr/glossary.json", "translations/fr/glossaire.json");
    });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(dataOf(r.html).glossary, []);
    assert.deepEqual(
      r.warnings.map((w) => w.key),
      current.warnings.map((w) => w.key),
    );
  });

  test("an accueil.md alone is not read: the home page has no text of its own", async () => {
    const current = await buildDemo();
    assert.notEqual(dataOf(current.html).homeHtml, "", "the demo has a home page");
    const r = await buildEdited((d) => move(d, "content/home.md", "content/accueil.md"));
    assert.deepEqual(r.errors, []);
    assert.equal(dataOf(r.html).homeHtml, "");
    assert.ok(!r.warnings.some((w) => w.key === "legacy.read"));
  });
});

describe("French keys are reported, never renamed", () => {
  test("toc.json: each French key is an unknown key (the current one suggested when close); the build stops", async () => {
    const r = await buildEdited((d) =>
      rewrite(d, "content/toc.json", (s) =>
        s.replace('"title":', '"titre":').replace('"tagline":', '"accroche":').replace('"journeys":', '"parcours":'),
      ),
    );
    assert.equal(r.html, null);
    assert.deepEqual(
      r.errors.map((e) => [e.file, e.path, e.key, e.vars.key, e.vars.closest]),
      [
        ["content/toc.json", "title", "required", "title", undefined],
        ["content/toc.json", "titre", "unknownClose", "titre", "title"],
        ["content/toc.json", "accroche", "unknown", "accroche", ""],
        ["content/toc.json", "parcours", "unknown", "parcours", ""],
      ],
    );
  });

  test("glossary.json: terme and motif are unknown keys (an error, a warning with --draft)", async () => {
    const french = (d) =>
      rewrite(d, "content/glossary.json", (s) => s.replace(/"term":/g, '"terme":').replace(/"pattern":/g, '"motif":'));
    const r = await buildEdited(french);
    const problems = problemsOf(r.errors, "content/glossary.json");
    assert.ok(problems.includes("[0].terme:unknownClose"), problems.join(", "));
    assert.ok(problems.includes("[0].term:required"), problems.join(", "));
    const draft = await buildEdited(french, { draft: true });
    assert.deepEqual(problemsOf(draft.errors, "content/glossary.json"), []);
    assert.ok(problemsOf(draft.warnings, "content/glossary.json").includes("[0].terme:unknownClose"));
    assert.deepEqual(dataOf(draft.html).glossary, [], "the invalid glossary is left out");
  });

  test("a zone file: the French names leave its required keys missing; an unknown French key alone is ignored", async () => {
    const file = "images/zones/orders-list.json";
    const r = await buildEdited((d) =>
      rewrite(d, file, (s) =>
        s
          .replace('"file":', '"fichier":')
          .replace('"width":', '"largeur":')
          .replace('"height":', '"hauteur":')
          .replace(/"w":/g, '"l":'),
      ),
    );
    const problems = problemsOf(r.errors, file);
    for (const p of ["file:required", "width:required", "height:required", "zones[0].w:required"])
      assert.ok(problems.includes(p), `${p} in ${problems.join(", ")}`);
    // The zone file is a tolerant reader (unknown fields accepted): `libelle` is not the caption, only ignored.
    const ignored = await buildEdited((d) => rewrite(d, file, (s) => s.replace(/"label":/g, '"libelle":')));
    assert.deepEqual(ignored.errors, []);
    assert.deepEqual(problemsOf(ignored.warnings, file), []);
  });
});
