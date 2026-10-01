// Page templates (engine/build/page-templates.mjs): standard/templates.json and the 13 templates agree; section
// matching (prefix, case, accents, apostrophes, aliases); guidance; words; guessing the type of an untyped page;
// the build check (required sections: strict; guidance: warning).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadPageTemplates,
  comparable,
  presentSections,
  headingsOf,
  countWords,
  countGuidance,
  analysePage,
  checkPage,
  guessTemplate,
  closestTemplate,
  maxWordsOf,
  DEFAULT_MAX_WORDS,
} from "../../engine/build/page-templates.mjs";
import { loadDictionary } from "../../engine/i18n.mjs";
import { KIT_ROOT, buildDemo, demoCopy } from "../tools/helpers.mjs";
import { build } from "../../engine/build/build.mjs";
import { loadProject } from "../../engine/project/load.mjs";

const table = loadPageTemplates();
const TYPES = ["screen", "editor", "recipe", "technical", "technical-sub", "journey", "journey-step", "troubleshooting", "troubleshooting-area", "findings", "architecture", "variables", "resources"];

describe("standard/templates.json and the page templates", () => {
  test("13 types; en and fr lists of the same length; required indexes in range; word limits", () => {
    assert.deepEqual(Object.keys(table.types), TYPES);
    for (const [type, def] of Object.entries(table.types)) {
      assert.equal(def.sections.en.length, def.sections.fr.length, type);
      for (const i of def.required) assert.ok(Number.isInteger(i) && i >= 0 && i < def.sections.en.length, `${type}: ${i}`);
      assert.ok(def.maxWords >= 1000, type);
    }
    for (const language of ["en", "fr"])
      for (const label of Object.keys(table.aliases[language])) assert.ok(TYPES.some((t) => table.types[t].sections[language].includes(label)), `alias of an unknown label: ${label}`);
  });

  test("each template exists in both languages, follows its own type, and holds guidance in its own language only", () => {
    for (const [type, def] of Object.entries(table.types))
      for (const language of ["en", "fr"]) {
        const file = path.join(KIT_ROOT, def.template.replace("{language}", language));
        const source = fs.readFileSync(file, "utf8");
        const a = analysePage({ table, type, headings: headingsOf(source), source, language });
        assert.ok(a.conformant, `${type}/${language}: missing ${a.missing.join(", ")}`);
        assert.equal(a.present.length, a.sections, `${type}/${language}: every section of the type`);
        assert.ok(a.guidance > 0, `${type}/${language}: guidance`);
        assert.doesNotMatch(source, language === "en" ? /<!--\s*consigne\s*:/ : /<!--\s*guidance\s*:/, `${type}/${language}: guidance of the other language`);
        assert.ok(a.words < def.maxWords, `${type}/${language}: words`);
      }
  });
});

describe("matching a section", () => {
  test("prefix, case, accents, apostrophe shape and spaces are ignored", () => {
    assert.equal(comparable("  L’Écran   de  SAISIE "), "l'ecran de saisie");
    const headings = ["WHAT IT’S FOR", "How it works, in detail", "The screen", "Step by step: approve an order", "Pitfalls"];
    // "What it's for" and "Pitfalls" are aliases; "Step by step: …" starts with "Step by step".
    assert.deepEqual(presentSections({ table, type: "screen", headings, language: "en" }), [0, 1, 2, 5, 7]);
  });

  test("French labels and aliases; the labels of the other language do not count", () => {
    const headings = ["À QUOI SERT l'écran", "Comment ca marche", "L’écran", "Pieges et limites", "Droits requis"];
    assert.deepEqual(presentSections({ table, type: "screen", headings, language: "fr" }), [0, 1, 2, 7, 9]);
    assert.deepEqual(presentSections({ table, type: "screen", headings, language: "en" }), []);
  });

  test("headingsOf: # and ## headings, not ### nor the headings inside fenced code", () => {
    const source = "# One\n\n## Two **bold** `code`\n\n### Three\n\n```md\n## Not a heading\n```\n\n~~~\n## Nor this\n~~~\n## Four ##\n";
    assert.deepEqual(headingsOf(source), ["One", "Two bold code", "Four"]);
  });
});

describe("guidance and words", () => {
  test("guidance comments, in English and in French", () => {
    assert.equal(countGuidance("<!-- guidance: a -->\ntext\n<!--consigne : b -->\n<!-- Guidance : c -->\n<!-- a comment -->"), 3);
    assert.equal(countGuidance("No comment. La consigne : rien."), 0);
  });

  test("words: prose, headings, tables and legends; not code, comments, URLs or markup", () => {
    const source = [
      "## Two words",
      "<!-- guidance: not counted at all -->",
      "One **bold** word and [a link](#/use/orders~x) here.",
      "```js",
      "const notCounted = 1;",
      "```",
      ':::screen{capture="x" title="Not counted"}',
      "1. **Label**: legend.",
      ":::",
      "> [!NOTE] Box title",
      "| Setting | Effect |",
      "|---|---|",
      "| [[menu Area › Screen]] | — |",
    ].join("\n");
    // Two words (2) · One bold word and a link here (7) · 1. Label: legend. (3) · Box title (2) · Setting Effect (2) · Area Screen (2)
    assert.equal(countWords(source), 18);
  });

  test("word limit: maxWords of the template, 2,000 without one", () => {
    assert.equal(maxWordsOf(table, "screen"), table.types.screen.maxWords);
    assert.equal(maxWordsOf(table, null), DEFAULT_MAX_WORDS);
    assert.equal(maxWordsOf(table, "nope"), 2000);
  });
});

describe("checkPage (build)", () => {
  const headings = ["What it is for", "How it works", "The screen", "Pitfalls and limits"];
  test("an untyped page is never checked against a template; its guidance is reported", () => {
    assert.deepEqual(checkPage({ pageId: "use/x", headings: [], source: "text", templates: table }), []);
    assert.deepEqual(checkPage({ pageId: "use/x", headings: [], source: "<!-- guidance: x -->", templates: table }), [
      { key: "template.guidance", vars: { page: "use/x", n: 1 }, strict: false },
    ]);
  });

  test("a typed page: each missing required section (strict), unknown template (strict)", () => {
    assert.deepEqual(checkPage({ pageId: "use/x", template: "screen", headings, templates: table, language: "en" }), [
      { key: "template.missingSection", vars: { page: "use/x", template: "screen", section: "Required permissions" }, strict: true },
    ]);
    const [p] = checkPage({ pageId: "use/x", template: "nope", headings, templates: table });
    assert.equal(p.key, "template.unknown");
    assert.equal(p.strict, true);
    assert.deepEqual(checkPage({ pageId: "use/x", template: "screen", headings, templates: null }), []);
  });

  test("the messages exist in both languages, with a plural for the guidance", () => {
    for (const language of ["en", "fr"]) {
      const d = loadDictionary(language);
      for (const k of ["template.missingSection", "template.unknown", "template.guidance", "template.guidance.help"]) assert.ok(`cli.build.${k}` in d, k);
      assert.ok(d["cli.build.template.guidance"].one && d["cli.build.template.guidance"].other);
    }
  });
});

describe("guessing the template of an untyped page", () => {
  const screen = ["What it is for", "How it works", "The screen", "Settings reference", "Pitfalls and limits", "Required permissions"];
  test("all the required sections of a type; the most specific type wins, unless the section prefers another", () => {
    // These headings satisfy both `screen` (5 required) and `editor` (6 required).
    assert.equal(guessTemplate({ table, headings: screen }).type, "editor");
    assert.equal(guessTemplate({ table, headings: screen, prefer: ["screen"] }).type, "screen");
    assert.equal(guessTemplate({ table, headings: ["Overview"] }), null);
  });

  test("sub-page types only under their parent type; types without required sections never", () => {
    const step = ["In short", "What happens, step by step", "What the user sees", "When things go wrong", "Further reading"];
    assert.equal(guessTemplate({ table, headings: step, level: 2, parent: "journey" }).type, "journey-step");
    assert.notEqual(guessTemplate({ table, headings: step, level: 1 })?.type, "journey-step");
    assert.notEqual(guessTemplate({ table, headings: ["Further reading"], level: 2, parent: "technical" })?.type, "technical-sub");
  });

  test("closest type: at least half of its required sections, and what is missing", () => {
    assert.deepEqual(closestTemplate({ table, headings: ["What it is for", "How it works", "The screen", "Pitfalls and limits"], language: "en" }), { type: "screen", missing: ["Required permissions"] });
    assert.equal(closestTemplate({ table, headings: ["Overview"], language: "en" }), null);
  });
});

describe("the build reports guidance and missing sections", () => {
  const load = (dir) => loadProject({ project: dir, env: {} });

  test("guidance: a warning in strict and draft builds, the site is still produced", async () => {
    const dir = demoCopy();
    try {
      fs.appendFileSync(path.join(dir, "content/use/settings.md"), "\n<!-- guidance: write this section -->\n<!-- guidance: and this one -->\n");
      const { project, config } = await load(dir);
      for (const draft of [false, true]) {
        const r = build({ project, config, options: { draft, date: "2026-01-01" } });
        assert.deepEqual(r.errors, []);
        assert.ok(r.html);
        assert.deepEqual(r.warnings.filter((w) => w.key === "template.guidance"), [{ kind: "template", key: "template.guidance", vars: { page: "use/settings", n: 2 } }]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a required section missing from a typed page: error in strict mode, warning in draft mode", async () => {
    const dir = demoCopy();
    try {
      const f = path.join(dir, "content/use/orders.md");
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("## Required permissions", "## Who can see it"));
      const { project, config } = await load(dir);
      const strict = build({ project, config, options: {} });
      assert.deepEqual(strict.errors.map((e) => [e.key, e.vars.section]), [["template.missingSection", "Required permissions"]]);
      const draft = build({ project, config, options: { draft: true } });
      assert.deepEqual(draft.errors, []);
      assert.ok(draft.warnings.some((w) => w.key === "template.missingSection"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the demo (one typed page, no guidance) builds without any template problem", async () => {
    const r = await buildDemo();
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings.filter((w) => w.kind === "template"), []);
  });
});
