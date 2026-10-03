// Languages (ARCHITECTURE.md §6.12): one source, several languages. Declaration and its validation; a project
// without `languages` keeps the same data (equivalence §9); the multilingual build (fallback, stale, images,
// diagrams, counterpart anchors, exports, --lang); the pure merges (translatedToc, translatedGlossary,
// mapAnchor, fixAnchors); the CLI (`translate`, `context --translate`, `capture --lang`, `init --languages`);
// `check images`, `audit`, `sync` report; doctor and the guided mode; i18n parity of the new fragment.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import {
  TEXT_FIELDS,
  LANGUAGE_TEXT_KEYS,
  withoutLanguageTexts,
  translatedToc,
  translatedGlossary,
  languageOutput,
  checkLanguageOption,
  checkIdClash,
  mergeLanguageCapture,
  languageCounts,
} from "../../engine/build/languages.mjs";
import { translatableFiles, translationState, readSources, writeSources } from "../../engine/core/translations.mjs";
import { mapAnchor, fixAnchors } from "../../engine/translate/anchors.mjs";
import { statusOf, resolveItems, markFiles } from "../../engine/translate/status.mjs";
import { buildTranslateContext, translateContextFileName, findSourceCommit } from "../../engine/context/translate.mjs";
import { createGit } from "../../engine/sync/git.mjs";
import { hashText } from "../../engine/core/hash.mjs";
import { checkImages, embeddedCaptures, embeddedLanguageCaptures } from "../../engine/check/images.mjs";
import { runAudit } from "../../engine/audit/audit.mjs";
import { renderMarkdown } from "../../engine/audit/report.mjs";
import { compareWithReference, renderReport } from "../../engine/sync/report.mjs";
import { watchedPaths } from "../../engine/dev/server.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { createI18n, loadDictionary, LANGUAGES as KIT_LANGUAGES } from "../../engine/i18n.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { detectSituation, menuFor } from "../../cli/doc-kit.mjs";
import {
  KIT_ROOT,
  LANGUAGES,
  languagesConfig,
  buildLanguages,
  languagesCopy,
  dataOf,
  tempDir,
} from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}
const keys = (list) => list.map((p) => p.key);
const sourceToc = () => JSON.parse(fs.readFileSync(path.join(LANGUAGES, "content", "toc.json"), "utf8"));

// ─── Configuration ──────────────────────────────────────────────────────────────────────────────────────────

describe("configuration", () => {
  test("languagesMin, languagesDuplicate, languagesUnsupported, languagesSource, translationsInsideContent, captureLanguageUnknown", () => {
    const err = (raw) => {
      try {
        prepareConfig(raw, { env: {} });
        return null;
      } catch (e) {
        return e;
      }
    };
    assert.equal(err({ product: { name: "X" }, languages: ["en"] }).details[0].key, "languagesMin");
    assert.equal(
      err({ product: { name: "X" }, languages: ["en", "en"] }).details.find((d) => d.key === "languagesDuplicate")
        ?.path,
      "languages[1]",
    );
    assert.equal(
      err({ product: { name: "X" }, languages: ["en", "de"] }).details.find((d) => d.key === "languagesUnsupported")
        ?.path,
      "languages[1]",
    );
    assert.equal(
      err({ product: { name: "X" }, languages: ["fr", "en"], language: "en" }).details.find(
        (d) => d.key === "languagesSource",
      )?.path,
      "language",
    );
    assert.equal(
      err({ product: { name: "X" }, languages: ["en", "fr"], paths: { translations: "content/x" } }).details.find(
        (d) => d.key === "translationsInsideContent",
      )?.path,
      "paths.translations",
    );
    assert.equal(
      err({ product: { name: "X" }, capture: { languages: { de: {} } } }).details.find(
        (d) => d.key === "captureLanguageUnknown",
      )?.path,
      "capture.languages.de",
    );
    // Valid: completeConfig sets `language` to languages[0] before capture.locale is derived.
    const ok = prepareConfig({ product: { name: "X" }, languages: ["fr", "en"] }, { env: {} });
    assert.deepEqual(ok.languages, ["fr", "en"]);
    assert.equal(ok.language, "fr");
    assert.equal(ok.capture.locale, "fr-FR");
    assert.equal(ok.paths.translations, "translations");
  });

  test("the languages fixture's own configuration is valid", async () => {
    const config = await languagesConfig();
    assert.deepEqual(config.languages, ["en", "fr"]);
    assert.equal(config.language, "en");
  });
});

// ─── Equivalence: a project without `languages` is unaffected (§9) ─────────────────────────────────────────

describe("equivalence: no `languages` declared", () => {
  test("no meta.languages/language, no site-data-<lang>, no @ image, no ui.language/template.* text", async () => {
    const { buildSpaces } = await import("../tools/helpers.mjs");
    const r = await buildSpaces();
    assert.deepEqual(r.errors, []);
    assert.equal(r.data.meta.languages, undefined);
    assert.equal(r.data.meta.language, undefined);
    assert.deepEqual(r.languages, []);
    assert.ok(!r.html.includes('id="site-data-'), "no site-data-<lang> block");
    assert.ok(!/id="img-[^"]+@/.test(r.html), "no @<lang> image id");
    assert.ok(
      !Object.keys(r.data.i18n).some((k) => k.startsWith("ui.language.") || k.startsWith("template.")),
      "no language/template texts embedded",
    );
  });
});

// ─── Multilingual build ─────────────────────────────────────────────────────────────────────────────────────

describe("multilingual build (draft)", () => {
  test("strict vs draft: missing translation blocks strict, falls back with a warning in draft; stale always a warning", async () => {
    const draft = await buildLanguages({ draft: true });
    assert.deepEqual(draft.errors, []);
    assert.ok(keys(draft.warnings).includes("translation.missing"));
    assert.ok(keys(draft.warnings).includes("translation.stale"));
    const strict = await buildLanguages({ draft: false });
    assert.ok(keys(strict.errors).includes("translation.missing"), "missing is blocking in strict mode");
    assert.ok(keys(strict.warnings).includes("translation.stale"), "stale never blocks, even strict");
    const missingProblem = strict.errors.find((e) => e.key === "translation.missing");
    assert.equal(missingProblem.vars.lang, "fr");
  });

  test("#site-data-fr: same top-level keys, same order, same page/section ids, meta.language fr, i18n in French", async () => {
    const r = await buildLanguages({ draft: true });
    const dataFr = dataOf(r.html, "fr");
    assert.deepEqual(Object.keys(dataFr).sort(), Object.keys(r.data).sort());
    assert.deepEqual(dataFr.order, r.data.order);
    assert.deepEqual(Object.keys(dataFr.pages).sort(), Object.keys(r.data.pages).sort());
    assert.deepEqual(
      dataFr.sections.map((s) => s.id),
      r.data.sections.map((s) => s.id),
    );
    assert.equal(dataFr.meta.language, "fr");
    assert.deepEqual(dataFr.meta.languages, ["en", "fr"]);
    assert.equal(dataFr.sections.find((s) => s.id === "use").title, "Utiliser Acme Orders");
    assert.ok("template.menu" in dataFr.i18n, "template.* embedded in a multilingual site");
  });

  test("fallback: a missing page/section/home falls back to the source, with the right flag; a stale or unmarked page has none", async () => {
    const r = await buildLanguages({ draft: true });
    const dataFr = dataOf(r.html, "fr");
    assert.equal(dataFr.pages["take-over/orders-api"].fallback, "en");
    assert.equal(dataFr.pages["use/api-limits"].fallback, undefined, "stale is not a fallback");
    assert.equal(
      dataFr.pages["take-over/architecture"].fallback,
      undefined,
      "unmarked is not a fallback, and not reported by the build",
    );
    assert.equal(dataFr.meta.homeFallback, undefined, "home.md is translated");
    assert.equal(
      dataFr.sections.find((s) => s.id === "take-over").fallback,
      undefined,
      "take-over/index.md is translated",
    );
  });

  test("invariant: #site-data-fr minus meta.languages/language equals #site-data of `build --lang fr`; mono output name; no @ variant", async () => {
    const r = await buildLanguages({ draft: true });
    const dataFr = dataOf(r.html, "fr");
    const clone = structuredClone(dataFr);
    delete clone.meta.languages;
    delete clone.meta.language;
    const mono = await buildLanguages({ draft: true, options: { lang: "fr" } });
    assert.deepEqual(mono.data, clone);
    assert.match(mono.output, /-fr\.html$/);
    assert.ok(!mono.html.includes("site-data-fr"));
    assert.ok(!/id="img-[^"]+@/.test(mono.html), "no @ variant in a mono-language build");
    assert.ok(mono.html.includes('id="img-orders-list"'), "the fr image, embedded as the plain id");
    assert.deepEqual(
      mono.languages.map((l) => l.id),
      ["en", "fr"],
      "languages summary still returned with --lang",
    );
  });

  test("images: img-orders-list@fr embedded once, only for the id fr actually uses; settings-profile has no fr variant", async () => {
    const r = await buildLanguages({ draft: true });
    assert.equal([...r.html.matchAll(/id="img-orders-list@fr"/g)].length, 1);
    assert.ok(!r.html.includes('id="img-settings-profile@fr"'));
    const dataFr = dataOf(r.html, "fr");
    assert.equal(dataFr.meta.screenshots?.["orders-list"]?.version, "1.4.0");
  });

  test("diagram: the fr page embeds the translated SVG, the en page keeps the source one", async () => {
    const r = await buildLanguages({ draft: true });
    const dataFr = dataOf(r.html, "fr");
    assert.ok(dataFr.pages["take-over/architecture"].html.includes("Navigateur"));
    assert.ok(!dataFr.pages["take-over/architecture"].html.includes(">Browser<"));
    assert.ok(r.data.pages["take-over/architecture"].html.includes(">Browser<"));
  });

  test("checkLinks per language: a wrong anchor in the fr markdown is reported with vars.lang; counterpart mapped by position", async () => {
    const r = await buildLanguages({ draft: true });
    const anchorProblem = r.warnings.concat(r.errors).find((p) => p.key === "link.anchor" && p.vars.lang === "fr");
    assert.ok(anchorProblem, "the deliberately wrong #/use/settings~what-it-is-for link is reported for fr");
    const dataFr = dataOf(r.html, "fr");
    // take-over/orders-api~ (counterpart of use/orders) maps "the-screen" (en slug) to "l-ecran" (fr slug).
    assert.equal(dataFr.pages["take-over/orders-api"].counterpart.anchor, "l-ecran");
  });

  test("languages.idClash: a section or page id equal to a declared language is blocking, even a draft build", async () => {
    const dir = languagesCopy({ editToc: (t) => ((t.sections[0].id = "fr"), t) });
    try {
      const config = await languagesConfig();
      const r = build({ project: { root: dir }, config, options: { draft: true } });
      assert.deepEqual(keys(r.errors), ["languages.idClash"]);
      assert.equal(r.errors[0].vars.id, "fr");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--lang global on a project without `languages`: builds normally, languages: []", async () => {
    const { buildSpaces } = await import("../tools/helpers.mjs");
    const r = await buildSpaces({ options: {} });
    assert.deepEqual(r.languages, []);
  });
});

// ─── Exports per space, combined with languages ─────────────────────────────────────────────────────────────

describe("exports (ARCHITECTURE.md §6.1a + §6.12)", () => {
  test("each export embeds both languages (#site-data and #site-data-fr), pages filtered in both", async () => {
    const r = await buildLanguages({ draft: true });
    const business = r.sites.find((s) => s.space === "business");
    assert.ok(business.html.includes('id="site-data"'));
    assert.ok(business.html.includes('id="site-data-fr"'));
    const en = dataOf(business.html);
    const fr = dataOf(business.html, "fr");
    assert.ok(Object.keys(en.pages).every((id) => en.pages[id].space === "business"));
    assert.ok(Object.keys(fr.pages).every((id) => fr.pages[id].space === "business"));
  });

  test("--lang fr --space business: mono-language export", async () => {
    const r = await buildLanguages({ draft: true, options: { lang: "fr", space: "business" } });
    assert.equal(r.sites.length, 1);
    assert.ok(!r.sites[0].html.includes("site-data-fr"));
    const data = dataOf(r.sites[0].html);
    assert.equal(data.meta.language, undefined);
    assert.ok(Object.keys(data.pages).every((id) => data.pages[id].space === "business"));
  });
});

// ─── Pure merges: translatedToc, translatedGlossary ────────────────────────────────────────────────────────

describe("translatedToc", () => {
  test("text fields from the translation, non-text from the source; a partial translation falls back silently", () => {
    const source = sourceToc();
    const translated = {
      title: "FR",
      sections: source.sections.map((s) => ({
        id: s.id,
        title: `${s.title} FR`,
        groups: s.groups.map((g) => ({ pages: g.pages.map((p) => ({ id: p.id })) })),
      })),
    };
    const { toc, problems } = translatedToc({ source, translated });
    assert.deepEqual(problems, []);
    assert.equal(toc.title, "FR");
    assert.equal(toc.sections[0].title, `${source.sections[0].title} FR`);
    assert.equal(
      toc.sections[0].groups[0].pages[0].title,
      source.sections[0].groups[0].pages[0].title,
      "untranslated title falls back to the source, no warning",
    );
    assert.deepEqual(
      toc.sections[0].groups[0].pages[0].routes,
      source.sections[0].groups[0].pages[0].routes,
      "non-text fields come from the source",
    );
  });

  test("no translated toc.json yet (a translation just started): the source's texts, no problem at all", () => {
    const source = sourceToc();
    const { toc, problems } = translatedToc({ source, translated: null });
    assert.deepEqual(problems, []);
    assert.equal(toc.sections[0].title, source.sections[0].title);
    assert.deepEqual(
      toc.sections.map((s) => s.id),
      source.sections.map((s) => s.id),
    );
  });

  test("structure mismatch (missing section): blocking, with the path", () => {
    const source = sourceToc();
    const translated = { sections: [source.sections[0]] };
    const { problems } = translatedToc({ source, translated });
    const structural = problems.filter((p) => p.key === "translation.toc.structure");
    assert.ok(structural.some((p) => p.blocking));
    assert.ok(structural.some((p) => p.vars.path === "sections[1]"));
  });

  test("a non-text field the translation changed: ignored (never blocking)", () => {
    const source = sourceToc();
    const translated = JSON.parse(JSON.stringify(source));
    translated.sections[0].groups[0].pages[0].routes = ["/changed"];
    const { toc, problems } = translatedToc({ source, translated });
    assert.deepEqual(
      toc.sections[0].groups[0].pages[0].routes,
      source.sections[0].groups[0].pages[0].routes,
      "source value kept",
    );
    assert.ok(problems.some((p) => p.key === "translation.toc.ignored" && !p.blocking));
  });

  test("spaces and journeys merged the same way; omitted `steps`/`suggestions` (no attempt to translate them) is never structural", () => {
    const source = sourceToc();
    const translated = {
      sections: source.sections,
      spaces: ["business", { id: "takeover", subtitle: "FR" }],
      journeys: [
        { title: "FR1", description: "d1" },
        { title: "FR2", description: "d2" },
      ],
    };
    const { toc, problems } = translatedToc({ source, translated });
    assert.equal(toc.spaces[1].subtitle, "FR");
    assert.equal(toc.journeys[0].title, "FR1");
    assert.deepEqual(toc.journeys[0].steps, source.journeys[0].steps);
    assert.deepEqual(problems, []);
  });
});

describe("translatedGlossary", () => {
  test("term/def/pattern translated, same order; technical always from the source", () => {
    const source = [
      { term: "Order", pattern: "orders?", def: "A customer request", technical: { file: "x.ts", line: 1 } },
    ];
    const translated = [{ term: "Commande", pattern: "commandes?", def: "Une demande" }];
    const { glossary, problem } = translatedGlossary({ source, translated });
    assert.equal(problem, undefined);
    assert.deepEqual(glossary, [
      { term: "Commande", pattern: "commandes?", def: "Une demande", technical: { file: "x.ts", line: 1 } },
    ]);
  });

  test("a different count of entries: problem reported, source glossary returned (draft fallback)", () => {
    const source = [
      { term: "A", def: "a" },
      { term: "B", def: "b" },
    ];
    const translated = [{ term: "A'", def: "a'" }];
    const { glossary, problem } = translatedGlossary({ source, translated });
    assert.deepEqual(glossary, source);
    assert.deepEqual(problem, { expected: 2, found: 1 });
  });

  test("without a translated file at all (null): the source glossary, no problem", () => {
    const source = [{ term: "A", def: "a" }];
    assert.deepEqual(translatedGlossary({ source, translated: null }), { glossary: source });
  });
});

// ─── translatableFiles, translationState, readSources/writeSources ────────────────────────────────────────

describe("translatableFiles / translationState / sources", () => {
  test("order: toc.json, glossary.json, home.md, then per section its intro and its pages", () => {
    const files = translatableFiles({ toc: sourceToc(), root: LANGUAGES, content: "content" }).map((f) => f.file);
    assert.deepEqual(files.slice(0, 3), ["toc.json", "glossary.json", "home.md"]);
    assert.ok(files.includes("use/index.md"));
    assert.ok(files.includes("use/orders.md"));
    assert.ok(files.indexOf("use/index.md") < files.indexOf("use/orders.md"));
  });

  test("missing / unmarked / stale / current", () => {
    assert.equal(translationState({ sourceText: "a", translatedExists: false, recorded: undefined }), "missing");
    assert.equal(translationState({ sourceText: "a", translatedExists: true, recorded: undefined }), "unmarked");
    assert.equal(translationState({ sourceText: "a", translatedExists: true, recorded: hashText("b") }), "stale");
    assert.equal(translationState({ sourceText: "a", translatedExists: true, recorded: hashText("a") }), "current");
  });

  test("readSources tolerant (missing/unreadable → {}); writeSources sorted keys, 2-space JSON, trailing newline", () => {
    const dir = tempDir("doc-kit-sources-");
    try {
      assert.deepEqual(readSources(dir, "translations", "fr"), {});
      writeSources(dir, "translations", "fr", { b: "2", a: "1" });
      const raw = fs.readFileSync(path.join(dir, "translations", "fr", ".sources.json"), "utf8");
      assert.equal(raw, '{\n  "a": "1",\n  "b": "2"\n}\n');
      assert.deepEqual(readSources(dir, "translations", "fr"), { a: "1", b: "2" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("languageCounts matches the fixture's known state", async () => {
    const config = await languagesConfig();
    const c = languageCounts({ root: LANGUAGES, config, toc: sourceToc(), lang: "fr" });
    assert.deepEqual(c, { id: "fr", current: 8, stale: 1, unmarked: 1, missing: 1 });
  });
});

// ─── languageOutput, checkLanguageOption, checkIdClash, mergeLanguageCapture, withoutLanguageTexts ─────────

describe("small helpers", () => {
  test("languageOutput: -<lang> before the extension", () => {
    assert.equal(languageOutput("dist/Acme-Orders-Documentation.html", "fr"), "dist/Acme-Orders-Documentation-fr.html");
  });

  test("checkLanguageOption: known language passes, unknown throws build.langUnknown (exit 2)", () => {
    assert.equal(checkLanguageOption({ languages: ["en", "fr"], lang: "fr", t: (k) => k }), "fr");
    assert.throws(
      () => checkLanguageOption({ languages: ["en", "fr"], lang: "de", t: (k) => k }),
      (e) => e.code === 2 && e.key === "build.langUnknown",
    );
    assert.throws(
      () => checkLanguageOption({ languages: null, lang: "fr", t: (k) => k }),
      (e) => e.key === "build.langUnknown",
    );
  });

  test("checkIdClash: a section id or a page id's first segment equal to a declared language", () => {
    const toc = {
      sections: [
        { id: "fr", groups: [] },
        { id: "use", groups: [{ pages: [{ id: "en/orders" }, { id: "use/orders" }] }] },
      ],
    };
    const problems = checkIdClash({ toc, languages: ["en", "fr"] });
    assert.deepEqual(problems.map((p) => p.vars.id).sort(), ["en/orders", "fr"]);
    assert.deepEqual(checkIdClash({ toc, languages: null }), []);
  });

  test("mergeLanguageCapture: locale default, cookies concatenated, storage merged, --var still overridable fields untouched otherwise", () => {
    const capture = {
      locale: "en-US",
      cookies: [{ name: "a", value: "1" }],
      storage: { x: "1" },
      languages: { fr: { cookies: [{ name: "b", value: "2" }], storage: { y: "2" } } },
    };
    const merged = mergeLanguageCapture(capture, "fr");
    assert.equal(merged.locale, "fr-FR", "defaults to the locale of the language when not given");
    assert.deepEqual(merged.cookies, [
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
    assert.deepEqual(merged.storage, { x: "1", y: "2" });
    const withLocale = mergeLanguageCapture({ ...capture, languages: { fr: { locale: "fr-CA" } } }, "fr");
    assert.equal(withLocale.locale, "fr-CA");
  });

  test("withoutLanguageTexts strips exactly the languages.json fragment's keys", () => {
    const texts = { "ui.language.label": "Language", "ui.feedback": "Report a problem" };
    assert.deepEqual(withoutLanguageTexts(texts), { "ui.feedback": "Report a problem" });
    assert.ok(LANGUAGE_TEXT_KEYS.includes("ui.translation.missing"));
  });

  test("TEXT_FIELDS covers toc/section/group/page/journey/space", () => {
    assert.deepEqual(Object.keys(TEXT_FIELDS).sort(), ["group", "journey", "page", "section", "space", "toc"]);
  });
});

// ─── Anchors: mapAnchor, fixAnchors ─────────────────────────────────────────────────────────────────────────

describe("anchors (engine/translate/anchors.mjs)", () => {
  const h = (id) => ({ id });
  test("mapAnchor: already valid, mapped by position, unknown to either, different counts", () => {
    assert.equal(
      mapAnchor({ sourceToc: [h("a"), h("b")], targetToc: [h("x"), h("y")], anchor: "y" }),
      "y",
      "already a valid target heading: left as is",
    );
    assert.equal(
      mapAnchor({ sourceToc: [h("a"), h("b")], targetToc: [h("x"), h("y")], anchor: "b" }),
      "y",
      "mapped by position",
    );
    assert.equal(
      mapAnchor({ sourceToc: [h("a"), h("b")], targetToc: [h("x"), h("y")], anchor: "z" }),
      null,
      "unknown to both",
    );
    assert.equal(
      mapAnchor({ sourceToc: [h("a"), h("b"), h("c")], targetToc: [h("x"), h("y")], anchor: "c" }),
      null,
      "different heading counts",
    );
  });

  test("fixAnchors on the fixture's use/orders.md (fr): 1 changed, 0 unmapped; idempotent", () => {
    const text = fs.readFileSync(path.join(LANGUAGES, "translations", "fr", "use", "orders.md"), "utf8");
    const outlines = {
      "use/settings": {
        source: [h("what-it-is-for"), h("the-screen"), h("step-by-step")],
        target: [h("son-role"), h("l-ecran"), h("etape-par-etape")],
      },
      "use/api-limits": { source: [h("quotas"), h("timeouts")], target: [h("quotas"), h("delais")] },
    };
    const tocs = (id) => outlines[id] || { source: null, target: null };
    const first = fixAnchors({ markdown: text, tocs });
    assert.equal(first.changed.length, 1);
    assert.deepEqual(first.unmapped, []);
    assert.equal(first.changed[0].to, "son-role");
    assert.ok(first.text.includes("use/settings~son-role"));
    assert.ok(first.text.includes("use/api-limits~quotas"), "already-correct anchor left as is");
    const second = fixAnchors({ markdown: first.text, tocs });
    assert.equal(second.changed.length, 0, "idempotent");
  });

  test("fixAnchors reasons: missing (no target toc), count (different lengths), unknown (neither toc has it)", () => {
    const md = "[a](#/p1~x) [b](#/p2~x) [c](#/p3~x)";
    const tocs = (id) =>
      ({
        p1: { source: [h("x")], target: null },
        p2: { source: [h("x"), h("y")], target: [h("z")] },
        p3: { source: [h("other")], target: [h("other2")] },
      })[id];
    const { changed, unmapped } = fixAnchors({ markdown: md, tocs });
    assert.deepEqual(changed, []);
    assert.deepEqual(unmapped.map((u) => u.reason).sort(), ["count", "missing", "unknown"]);
  });

  test('fixAnchors also rewrites raw href="#/x~y" HTML links, with a function replacer (never a literal $-sensitive string)', () => {
    const md =
      'before <a href="#/use/settings~what-it-is-for">lien</a> after, with a dollar sign $& in the anchor text itself (untouched)';
    const tocs = () => ({ source: [h("what-it-is-for")], target: [h("son-role")] });
    const { text, changed } = fixAnchors({ markdown: md, tocs });
    assert.equal(changed.length, 1);
    assert.ok(text.includes('href="#/use/settings~son-role"'));
    assert.ok(
      text.includes("dollar sign $& in the anchor text itself"),
      "unrelated $-sequences in the text are never touched",
    );
  });
});

// ─── engine/translate/status.mjs ────────────────────────────────────────────────────────────────────────────

describe("engine/translate/status.mjs", () => {
  test("statusOf: counts and per-file state match the fixture", async () => {
    const config = await languagesConfig();
    const r = statusOf({ root: LANGUAGES, config, toc: sourceToc(), lang: "fr" });
    assert.equal(r.id, "fr");
    assert.deepEqual(r.counts, { current: 8, stale: 1, unmarked: 1, missing: 1 });
    const apiLimits = r.files.find((f) => f.file === "use/api-limits.md");
    assert.equal(apiLimits.state, "stale");
    assert.notEqual(apiLimits.source, apiLimits.recorded);
  });

  test("resolveItems: a page id, a content path (with a '.'); an unknown item throws translate.unknownItem", () => {
    const toc = sourceToc();
    const root = LANGUAGES;
    const content = "content";
    assert.deepEqual(resolveItems({ toc, root, content, items: ["use/orders"] }), [
      { file: "use/orders.md", page: "use/orders" },
    ]);
    assert.deepEqual(resolveItems({ toc, root, content, items: ["home.md"] }), [{ file: "home.md" }]);
    assert.throws(
      () => resolveItems({ toc, root, content, items: ["nope"] }),
      (e) => e.code === 2 && e.key === "translate.unknownItem",
    );
  });

  test("a section introduction without a source file (§6.12/§6.1, the build's own introSourceMissing): never translatable — translatableFiles excludes it, resolveItems refuses to mark it, statusOf/languageCounts never count it as missing", async () => {
    const toc = {
      ...sourceToc(),
      sections: [...sourceToc().sections, { id: "no-intro", title: "No intro", groups: [] }],
    };
    const root = LANGUAGES;
    const content = "content";
    assert.ok(!fs.existsSync(path.join(root, content, "no-intro", "index.md")), "sanity check: truly no source file");

    const files = translatableFiles({ toc, root, content }).map((f) => f.file);
    assert.ok(!files.includes("no-intro/index.md"));

    assert.throws(
      () => resolveItems({ toc, root, content, items: ["no-intro/index.md"] }),
      (e) => e.code === 2 && e.key === "translate.unknownItem",
    );

    const config = await languagesConfig();
    const status = statusOf({ root, config, toc, lang: "fr" });
    assert.ok(!status.files.some((f) => f.file === "no-intro/index.md"));

    const counts = languageCounts({ root, config, toc, lang: "fr" });
    const withoutExtraSection = languageCounts({ root, config, toc: sourceToc(), lang: "fr" });
    assert.deepEqual(
      counts,
      withoutExtraSection,
      "the sourceless section changes nothing to the counts doctor and sync report on",
    );
  });

  test("markFiles: writes .sources.json for the given items; --all; a missing translation file is reported, nothing written for it", async () => {
    const dir = languagesCopy();
    try {
      const config = await languagesConfig();
      const toc = JSON.parse(fs.readFileSync(path.join(dir, "content", "toc.json"), "utf8"));
      const { written, missing } = markFiles({
        root: dir,
        config,
        toc,
        lang: "fr",
        items: [{ file: "use/api-limits.md" }, { file: "take-over/orders-api.md" }],
      });
      assert.deepEqual(written, ["use/api-limits.md"]);
      assert.deepEqual(missing, ["take-over/orders-api.md"]);
      const sources = readSources(dir, "translations", "fr");
      assert.equal(
        sources["use/api-limits.md"],
        hashText(fs.readFileSync(path.join(dir, "content", "use", "api-limits.md"), "utf8")),
      );
      const all = markFiles({ root: dir, config, toc, lang: "fr", all: true });
      assert.ok(all.written.includes("take-over/architecture.md"), "the unmarked file gets marked by --all");
      assert.ok(!all.written.includes("take-over/orders-api.md"), "still missing, never marked");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── CLI `translate` ─────────────────────────────────────────────────────────────────────────────────────────

describe("CLI translate", () => {
  test("status: text and --json; --check is 1 when stale or missing", async () => {
    const r = await cli(["translate", "status", "--project", LANGUAGES]);
    assert.equal(r.code, 0);
    assert.match(r.out, /Translations — fr/);
    assert.match(r.out, /use\/api-limits\.md — stale/);
    const j = await cli(["translate", "status", "--project", LANGUAGES, "--json"]);
    const parsed = JSON.parse(j.out);
    assert.equal(parsed.languages[0].counts.missing, 1);
    const checked = await cli(["translate", "status", "--project", LANGUAGES, "--check"]);
    assert.equal(checked.code, 1);
  });

  test("--mark <page…>, --mark --all, a missing file -> exit 1; .sources.json sorted; translate alone -> usage (2); --lang unknown -> 2; --lang source -> 2", async () => {
    const dir = languagesCopy();
    try {
      const marked = await cli(["translate", "--mark", "use/api-limits", "--project", dir]);
      assert.equal(marked.code, 0);
      assert.match(marked.out, /\[fr\] 1 marked: use\/api-limits\.md/);
      const raw = fs.readFileSync(path.join(dir, "translations", "fr", ".sources.json"), "utf8");
      assert.deepEqual(Object.keys(JSON.parse(raw)), Object.keys(JSON.parse(raw)).slice().sort());
      const missingFile = await cli(["translate", "--mark", "take-over/orders-api", "--project", dir]);
      assert.equal(missingFile.code, 1);
      const nothing = await cli(["translate", "--mark", "--project", dir]);
      assert.equal(nothing.code, 2);
      const usage = await cli(["translate", "--project", dir]);
      assert.equal(usage.code, 2);
      const badLang = await cli(["translate", "status", "--lang", "de", "--project", dir]);
      assert.equal(badLang.code, 2);
      const sourceLang = await cli(["translate", "status", "--lang", "en", "--project", dir]);
      assert.equal(sourceLang.code, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--fix-anchors: rewrites and reports; --json shape; no `languages` -> translate.noLanguages (2)", async () => {
    const dir = languagesCopy();
    try {
      const r = await cli(["translate", "--fix-anchors", "--project", dir]);
      assert.equal(r.code, 0);
      assert.match(r.out, /\[fr\] use\/orders\.md: 1 link\(s\) rewritten/);
      const second = await cli(["translate", "--fix-anchors", "--project", dir]);
      assert.match(second.out, /no link needed rewriting/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const { SPACES } = await import("../tools/helpers.mjs");
    const noLang = await cli(["translate", "status", "--project", SPACES]);
    assert.equal(noLang.code, 2);
  });
});

// ─── engine/context/translate.mjs + CLI `context --translate` ─────────────────────────────────────────────

describe("context --translate", () => {
  test("findSourceCommit: first commit whose version matches the recorded fingerprint; null without git", () => {
    const exec = (bin, args) => {
      if (bin !== "git") return null;
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n" };
      if (args[0] === "log") return { status: 0, stdout: "c2\nc1\n" };
      if (args[0] === "show") {
        const [ref] = args.at(-1).split(":");
        return { status: 0, stdout: ref === "c1" ? "old text" : "new text" };
      }
      return { status: 1, stdout: "" };
    };
    const git = createGit(exec, "/docs");
    const found = findSourceCommit({ git, path: "use/orders.md", recorded: hashText("old text"), hashText, limit: 50 });
    assert.equal(found, "c1");
    assert.equal(findSourceCommit({ git: createGit(() => null, "/docs"), path: "x", recorded: "abc", hashText }), null);
    assert.equal(
      findSourceCommit({ git, path: "use/orders.md", recorded: null, hashText }),
      null,
      "no recorded fingerprint: no diff attempted",
    );
  });

  test("buildTranslateContext: page, glossary table, source, previous translation, diff; budget cuts diff first then previous", () => {
    const page = { title: "Orders", summary: "Filters, order list", template: null, file: "use/orders.md" };
    const glossary = [{ term: "Order", pattern: "orders?", def: "def" }];
    const glossaryL = [{ term: "Commande" }];
    const base = {
      page,
      pageL: null,
      pageId: "use/orders",
      lang: "fr",
      sourceFile: "content/use/orders.md",
      targetFile: "translations/fr/use/orders.md",
      state: "current",
      sourceText: "source text",
      previousText: "previous text",
      glossary,
      glossaryL,
      templates: null,
      diff: "+added",
      t: (k, v) => (v ? `${k}(${JSON.stringify(v)})` : k),
    };
    const full = buildTranslateContext(base);
    assert.ok(full.text.includes("source text") && full.text.includes("previous text") && full.text.includes("+added"));
    assert.deepEqual(full.cut, []);
    const tiny = buildTranslateContext({ ...base, budget: 1 });
    assert.deepEqual(
      tiny.cut.map((c) => c.kind),
      ["diff", "previous"],
    );
    assert.ok(!tiny.text.includes("+added") && !tiny.text.includes("previous text"));
    assert.ok(tiny.text.includes("source text"), "the source is never cut");
  });

  test("translateContextFileName: '/' -> '__', then .<lang>.md", () => {
    assert.equal(translateContextFileName("use/orders", "fr"), "use__orders.fr.md");
  });

  test("CLI: writes .doc-kit/context/<page>.fr.md; translateSource (2); translateUpdate (2)", async () => {
    const dir = languagesCopy();
    try {
      const r = await cli(["context", "use/orders", "--translate", "fr", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      const file = path.join(dir, ".doc-kit", "context", "use__orders.fr.md");
      assert.ok(fs.existsSync(file));
      const text = fs.readFileSync(file, "utf8");
      assert.match(text, /translations\/fr\/use\/orders\.md/);
      const sourceLang = await cli(["context", "use/orders", "--translate", "en", "--project", dir]);
      assert.equal(sourceLang.code, 2);
      const both = await cli(["context", "use/orders", "--translate", "fr", "--update", "--project", dir]);
      assert.equal(both.code, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── capture --lang ──────────────────────────────────────────────────────────────────────────────────────────

describe("capture --lang", () => {
  test("CLI validates --lang like the other language-aware commands (unknown -> 2)", async () => {
    const r = await cli(["capture", "--lang", "de", "--project", LANGUAGES]);
    assert.equal(r.code, 2);
  });
});

// ─── check images: language folders ─────────────────────────────────────────────────────────────────────────

describe("check images (language folders)", () => {
  test("embeddedLanguageCaptures / embeddedCaptures: source ids exclude @lang variants", () => {
    const html =
      '<script type="text/plain" id="img-orders-list">data:x</script><script type="text/plain" id="img-orders-list@fr">data:y</script>';
    assert.deepEqual(embeddedCaptures(html), new Set(["orders-list"]));
    assert.deepEqual(embeddedLanguageCaptures(html, "fr"), new Set(["orders-list"]));
  });

  test("an orphan image in images/fr/ is reported with its full path; a valid variant is not", async () => {
    const dir = languagesCopy();
    try {
      fs.mkdirSync(path.join(dir, "images", "fr"), { recursive: true });
      fs.copyFileSync(path.join(dir, "images", "settings-profile.webp"), path.join(dir, "images", "fr", "orphan.webp"));
      const config = await languagesConfig();
      const r = build({ project: { root: dir }, config, options: { draft: true } });
      const check = checkImages({ root: dir, config, html: r.html, warnings: r.warnings, version: "1.4.0" });
      const orphan = check.errors.find(
        (e) => e.key === "check.images.orphan" && e.vars.file === "images/fr/orphan.webp",
      );
      assert.ok(orphan, "orphan.webp reported with its full path");
      assert.ok(
        !check.errors.some((e) => e.key === "check.images.orphan" && e.vars.file === "images/fr/orders-list.webp"),
        "the valid fr variant is not an orphan",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── audit, sync ─────────────────────────────────────────────────────────────────────────────────────────────

describe("audit (languages table)", () => {
  test("result.languages and the Markdown table", async () => {
    const config = await languagesConfig();
    const r = await runAudit({ project: { root: LANGUAGES }, config, now: new Date("2026-01-01") });
    assert.deepEqual(r.languages, [{ id: "fr", current: 8, stale: 1, unmarked: 1, missing: 1, ratio: 8 / 11 }]);
    const md = renderMarkdown(r, createI18n({ language: "en" }));
    assert.match(md, /## Translations/);
    assert.match(md, /\| fr \| 8 \| 1 \| 1 \| 73 % \|/);
  });
});

describe("sync report (translations category)", () => {
  test("report.translations lists the stale and missing files; the summary line and hint; never without `languages`", async () => {
    const config = await languagesConfig();
    const toc = sourceToc();
    const report = await compareWithReference({
      root: LANGUAGES,
      config,
      toc,
      reference: null,
      since: null,
      git: null,
      inventory: { adapters: [] },
      plans: [],
      appDir: null,
      version: "1.0.0",
      commit: null,
      factsDir: config.paths.facts,
    });
    assert.deepEqual(report.translations, [
      { lang: "fr", file: "use/api-limits.md", state: "stale" },
      { lang: "fr", file: "take-over/orders-api.md", state: "missing" },
    ]);
    const md = renderReport(report, createI18n({ language: "en" }).t);
    assert.match(md, /2 translations to update/);
    assert.match(md, /translate status/);
  });

  test("never present without `languages`", async () => {
    const { SPACES, spacesConfig } = await import("../tools/helpers.mjs");
    const config = await spacesConfig();
    const toc = JSON.parse(fs.readFileSync(path.join(SPACES, "content", "toc.json"), "utf8"));
    const report = await compareWithReference({
      root: SPACES,
      config,
      toc,
      reference: null,
      since: null,
      git: null,
      inventory: { adapters: [] },
      plans: [],
      appDir: null,
      version: "1.0.0",
      commit: null,
      factsDir: config.paths.facts,
    });
    assert.equal(report.translations, undefined);
  });
});

// ─── init --languages ────────────────────────────────────────────────────────────────────────────────────────

describe("CLI init --languages", () => {
  function app() {
    const dir = tempDir("doc-kit-init-lang-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo-app", version: "1.0.0" }));
    return dir;
  }

  test("--languages en,fr --yes: config, empty translations/fr/.sources.json; translate status then shows everything missing", async () => {
    const appDir = app();
    try {
      const r = await cli(["init", appDir, "--yes", "--languages", "en,fr", "--capture", "none", "--auth", "none"]);
      assert.equal(r.code, 0, r.err);
      const docs = path.join(appDir, "docs", "manual");
      const configText = fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8");
      assert.match(configText, /languages:\s*\["en","fr"\]/);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(docs, "translations", "fr", ".sources.json"), "utf8")), {});
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  test("--lang fr --languages en,fr -> init.languagesLang (2); --languages en alone -> init.languagesInvalid (2)", async () => {
    const appDir = app();
    try {
      const mismatch = await cli([
        "init",
        appDir,
        "--yes",
        "--lang",
        "fr",
        "--languages",
        "en,fr",
        "--capture",
        "none",
        "--auth",
        "none",
      ]);
      assert.equal(mismatch.code, 2);
      const tooFew = await cli(["init", appDir, "--yes", "--languages", "en", "--capture", "none", "--auth", "none"]);
      assert.equal(tooFew.code, 2);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  test("init --yes without --languages: unaffected (no languages key, identical to before this lot)", async () => {
    const appDir = app();
    try {
      const r = await cli(["init", appDir, "--yes", "--capture", "none", "--auth", "none"]);
      assert.equal(r.code, 0, r.err);
      const docs = path.join(appDir, "docs", "manual");
      assert.doesNotMatch(fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8"), /languages:/);
      assert.ok(!fs.existsSync(path.join(docs, "translations")));
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});

// ─── doctor, guided mode ────────────────────────────────────────────────────────────────────────────────────

describe("doctor", () => {
  test("one line per declared language; ⚠ when stale/missing > 0", async () => {
    const r = await cli(["doctor", "--project", LANGUAGES]);
    assert.match(r.out, /⚠.*translations\/fr: 8 current · 1 stale · 1 missing/);
  });
});

describe("guided mode", () => {
  test("detectSituation: step translate when a declared language has a missing or stale file; menuFor adds translate status", async () => {
    const s = await detectSituation({ project: LANGUAGES });
    assert.equal(s.step, "translate");
    assert.ok(menuFor(s.config).includes("translate"));
    const { SPACES } = await import("../tools/helpers.mjs");
    const s2 = await detectSituation({ project: SPACES });
    assert.deepEqual(menuFor(s2.config), ["dev", "audit", "build", "doctor"]);
  });

  test("CLI --json: step translate, next suggests `translate status`", async () => {
    const r = await cli(["--project", LANGUAGES, "--json"]);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.step, "translate");
    assert.deepEqual(parsed.next, ["doc-kit translate status"]);
  });
});

// ─── dev server watch paths ─────────────────────────────────────────────────────────────────────────────────

describe("dev server", () => {
  test("watchedPaths includes paths.translations when `languages` is declared, not otherwise", async () => {
    const config = await languagesConfig();
    assert.ok(watchedPaths(config).folders.includes("translations"));
    const { spacesConfig } = await import("../tools/helpers.mjs");
    const plain = await spacesConfig();
    assert.ok(!watchedPaths(plain).folders.includes("translations"));
  });
});

// ─── i18n parity of the new fragment ────────────────────────────────────────────────────────────────────────

describe("i18n: languages.json fragment", () => {
  test("ui.language.en and ui.language.fr hold the same autonym in both dictionaries (en.json and fr.json)", () => {
    const en = loadDictionary("en");
    const fr = loadDictionary("fr");
    for (const lang of KIT_LANGUAGES) {
      assert.equal(
        en[`ui.language.${lang}`],
        fr[`ui.language.${lang}`],
        `ui.language.${lang} must read the same in both dictionaries (an autonym)`,
      );
    }
  });

  test("ui.language.name.<code>: the language is named IN the interface language, not its autonym (the untranslated-page banner)", () => {
    const en = loadDictionary("en");
    const fr = loadDictionary("fr");
    for (const lang of KIT_LANGUAGES) {
      assert.ok(`ui.language.name.${lang}` in en, `ui.language.name.${lang} missing in en.json`);
      assert.ok(`ui.language.name.${lang}` in fr, `ui.language.name.${lang} missing in fr.json`);
    }
    // French interface: "anglais" (lower case, a common noun), never the autonym "English".
    assert.equal(fr["ui.language.name.en"], "anglais");
    assert.notEqual(fr["ui.language.name.en"], fr["ui.language.en"]);
    // English interface: "French", never the autonym "Français".
    assert.equal(en["ui.language.name.fr"], "French");
    assert.notEqual(en["ui.language.name.fr"], en["ui.language.fr"]);
  });

  test("every cli.translate.*, cli.context.translate.*, cli.audit.languages.* key used by the CLI exists", () => {
    const en = loadDictionary("en");
    const translateSource = fs.readFileSync(path.join(KIT_ROOT, "cli", "commands", "translate.mjs"), "utf8");
    for (const m of translateSource.matchAll(/ctx\.t\("([\w.]+)"/g)) assert.ok(m[1] in en, m[1]);
    for (const m of translateSource.matchAll(/KitError\(EXIT\.\w+, "([\w.]+)"/g)) assert.ok(`cli.${m[1]}` in en, m[1]);
  });
});
