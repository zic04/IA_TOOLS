// i18n: en/fr parity (keys, variables, plural shapes), translation, plurals, overrides, dates; every key used
// by the code exists in the dictionaries.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadDictionary, createI18n, variables, format, EMBEDDED_NAMESPACES } from "../../engine/i18n.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

const en = loadDictionary("en");
const fr = loadDictionary("fr");
const NAMESPACES = ["ui.", "template.", "render.", "callouts.", "home.", "cli."];

describe("dictionary parity", () => {
  test("same keys", () => {
    const a = Object.keys(en).sort();
    const b = Object.keys(fr).sort();
    assert.deepEqual(
      a.filter((k) => !b.includes(k)),
      [],
      "keys missing from fr.json",
    );
    assert.deepEqual(
      b.filter((k) => !a.includes(k)),
      [],
      "keys missing from en.json",
    );
  });

  test("same variables and same shape (text or plural) for each key", () => {
    for (const k of Object.keys(en)) {
      assert.deepEqual(variables(fr[k]), variables(en[k]), `variables of ${k}`);
      assert.equal(typeof fr[k], typeof en[k], `shape of ${k}`);
      if (typeof en[k] === "object")
        for (const d of [en, fr]) assert.ok("one" in d[k] && "other" in d[k], `plural without one/other: ${k}`);
    }
  });

  test("every key belongs to a known namespace; no empty value", () => {
    for (const k of Object.keys(en)) {
      assert.ok(
        NAMESPACES.some((n) => k.startsWith(n)),
        `unknown namespace: ${k}`,
      );
      for (const d of [en, fr])
        for (const t of typeof d[k] === "object" ? Object.values(d[k]) : [d[k]])
          assert.ok(String(t).trim(), `empty value: ${k}`);
    }
  });

  test("every “.help” key has its message", () => {
    for (const k of Object.keys(en).filter((x) => x.endsWith(".help"))) assert.ok(k.slice(0, -5) in en, k);
  });

  test("the command name is never hard-coded in the CLI messages (variable {command})", () => {
    for (const d of [en, fr])
      for (const [k, v] of Object.entries(d))
        if (k.startsWith("cli.") && k !== "cli.version")
          for (const t of typeof v === "object" ? Object.values(v) : [v]) assert.doesNotMatch(t, /doc-kit/, k);
  });
});

describe("translation", () => {
  test("variables, unknown key, missing variable, default variables", () => {
    const { t } = createI18n({ language: "en", vars: { command: "kit" } });
    assert.equal(t("ui.notFound.text", { path: "x/y" }), "No page matches “x/y”.");
    assert.equal(t("unknown.key"), "unknown.key");
    assert.equal(format("{a} and {b}", { a: 1 }), "1 and {b}");
    assert.equal(t("cli.site.missing.help"), "run kit build");
  });

  test("plurals (Intl.PluralRules): fr has 0 and 1 singular, en only 1", () => {
    const te = createI18n({ language: "en" }).t;
    const tf = createI18n({ language: "fr" }).t;
    assert.equal(te("ui.page.annotatedScreens", { n: 1 }), "1 annotated screen");
    assert.equal(te("ui.page.annotatedScreens", { n: 0 }), "0 annotated screens");
    assert.equal(tf("ui.page.annotatedScreens", { n: 0 }), "0 écran annoté");
    assert.equal(tf("ui.page.annotatedScreens", { n: 3 }), "3 écrans annotés");
    assert.equal(tf("ui.subPages", { n: 1 }), "1 sous-page");
    assert.equal(
      tf("home.journeysIntro", { n: 3, count: "Trois" }),
      "Trois chemins de lecture selon ce que vous venez faire.",
    );
    assert.equal(
      te("home.journeysIntro", { n: 1, count: "One" }),
      "One reading path depending on what you came to do.",
    );
  });

  test("numbers in words from 1 to 6", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((n) => fr[`home.number.${n}`]),
      ["Un", "Deux", "Trois", "Quatre", "Cinq", "Six"],
    );
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((n) => en[`home.number.${n}`]),
      ["One", "Two", "Three", "Four", "Five", "Six"],
    );
  });

  test("project overrides (config.texts), plural overrides included", () => {
    const { t, subset } = createI18n({
      language: "en",
      overrides: {
        "home.primaryAction": "Explore the editors",
        "ui.subPages": { one: "{n} part", other: "{n} parts" },
      },
    });
    assert.equal(t("home.primaryAction"), "Explore the editors");
    assert.equal(subset()["home.primaryAction"], "Explore the editors");
    assert.equal(t("ui.subPages", { n: 2 }), "2 parts");
  });

  test("only ui.* and home.* keys are embedded", () => {
    const e = createI18n({ language: "fr" }).subset();
    assert.ok(Object.keys(e).length > 30);
    assert.ok(Object.keys(e).every((k) => EMBEDDED_NAMESPACES.some((p) => k.startsWith(p))));
  });

  test("long date: historical French format; US English", () => {
    const d = new Date(Date.UTC(2026, 9, 1, 12));
    const frDate = createI18n({ language: "fr" }).date(d, { utc: true });
    assert.equal(frDate, "1 octobre 2026");
    assert.equal(
      frDate,
      new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d),
    );
    assert.equal(createI18n({ language: "en" }).date(d, { utc: true }), "October 1, 2026");
  });
});

describe("the code only uses existing keys", () => {
  const read = (p) => fs.readFileSync(path.join(KIT_ROOT, p), "utf8");
  const uses = (source, re) => [...source.matchAll(re)].map((m) => m[1]);

  test('app.js: each t("…") exists and is embedded (ui.* or home.*)', () => {
    const keys = uses(read("engine/site/app.js"), /\bth?\("([\w.]+)"/g);
    assert.ok(keys.length > 25);
    for (const k of keys) {
      assert.ok(k in en, `missing key: ${k}`);
      assert.ok(
        EMBEDDED_NAMESPACES.some((p) => k.startsWith(p)),
        `key not embedded: ${k}`,
      );
    }
  });

  test("template.html: each {{t:…}} exists", () => {
    const keys = uses(read("engine/site/template.html"), /\{\{t:([\w.]+)\}\}/g);
    assert.ok(keys.length > 15);
    for (const k of keys) assert.ok(k in en && k.startsWith("template."), k);
  });

  test("build and CLI: each referenced key exists", () => {
    const build = [
      "engine/build/markdown.mjs",
      "engine/build/build.mjs",
      "engine/core/page-templates.mjs",
      "engine/check/links.mjs",
      "engine/theme/logo.mjs",
    ]
      .map(read)
      .join("\n");
    for (const k of uses(build, /\bt\("([\w.]+)"/g)) assert.ok(k in en, k);
    for (const k of uses(build, /key: "(\w+\.[\w.]+)"/g))
      assert.ok(`cli.build.${k}` in en || `cli.validate.${k}` in en, k);
    for (const k of uses(read("engine/build/markdown.mjs"), /signal\((?:true|false), "([\w.]+)"/g))
      assert.ok(`cli.build.${k}` in en, k);
    for (const reason of uses(read("engine/theme/logo.mjs"), /reason: "(\w+)"/g))
      assert.ok(`cli.build.theme.logo.${reason}` in en, reason);
    const project = [
      "engine/project/load.mjs",
      "engine/project/find.mjs",
      "engine/project/env.mjs",
      "engine/project/browser.mjs",
      "engine/theme/tokens.mjs",
    ]
      .map(read)
      .join("\n");
    for (const k of uses(project, /KitError\(EXIT\.\w+, "([\w.]+)"/g)) assert.ok(`cli.${k}` in en, k);
    for (const k of uses(project, /key: "([\w.]+)"/g)) assert.ok(`cli.validate.${k}` in en, k);
    const cli = fs
      .readdirSync(path.join(KIT_ROOT, "cli/commands"))
      .map((f) => read("cli/commands/" + f))
      .concat([read("cli/doc-kit.mjs"), read("cli/common.mjs")])
      .join("\n");
    for (const k of uses(cli, /KitError\(EXIT\.\w+, "([\w.]+)"/g)) assert.ok(`cli.${k}` in en, k);
    for (const k of uses(cli, /ctx\.error\("([\w.]+)"/g)) assert.ok(`cli.${k}` in en, k);
    for (const k of uses(cli, /ctx\.t\("([\w.]+)"/g)) assert.ok(k in en, k);
  });

  test("callouts: one title per canonical type", () => {
    for (const k of ["tip", "warning", "caution", "permissions", "note", "recipe", "how"])
      assert.ok(`callouts.${k}` in en, k);
  });
});
