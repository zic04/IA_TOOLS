// A count is shown in the plural form of its number (RULES.md M2), the way the kit writes plurals (engine/i18n.mjs):
//   - a message { one, other } whose form is chosen by the variable `n` (Intl.PluralRules: 0 and 1 singular in
//     French, only 1 in English);
//   - for a second count in the same sentence, a counted noun: a plural whose text shows the number as {count}
//     (numbers().count of engine/build/format.mjs, counted() of engine/build/developer.mjs), passed as a variable.
// The rules below read the dictionaries and the kit's calls, each checker first run on samples it must flag.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadDictionary, createI18n } from "../../engine/i18n.mjs";
import { numbers } from "../../engine/build/format.mjs";
import { renderModules } from "../../engine/build/developer.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

const en = loadDictionary("en");
const fr = loadDictionary("fr");
const forms = (value) => (typeof value === "object" ? Object.values(value) : [value]);

// ── The dictionaries ─────────────────────────────────────────────────────────────────────────────────────────────

/** A plural written as a suffix in brackets: "file(s)", "dependency(ies)", "cité(s)". The protocol http(s) is not one. */
const bracketPlural = (text) => /\p{L}\((?:s|x|es|ies)\)/u.test(text.replace(/\bhttp\(s\)/g, ""));
/** Words ending in s that are not plurals: "{n} in the plans" is fine, and so is "({n} dans les plans)". */
const NOT_PLURAL = new Set([
  "is",
  "was",
  "has",
  "as",
  "its",
  "this",
  "less",
  "dans",
  "sous",
  "sans",
  "plus",
  "pas",
  "après",
]);
/** In a text message (not a plural), the selector or a counted number before a plural word: "{n} files". */
const selectorBeforeNoun = (text) =>
  [...text.matchAll(/\{(?:n|need|count)\} (?:more )?([\p{L}-]*s)\b/gu)].some((m) => !NOT_PLURAL.has(m[1]));
/** In a text message, a count named after its noun: "{lines} lines", "{days} days" (a unit such as {ms} ms is not one). */
const countBeforeItsNoun = (text) => /\{(\w{2,}s)\} \1\b/.test(text);

/** The keys of a dictionary that break a rule, with the language. */
function offenders(rule, { plainOnly = false } = {}) {
  const out = [];
  for (const [lang, d] of [
    ["en", en],
    ["fr", fr],
  ])
    for (const [key, value] of Object.entries(d))
      if (!(plainOnly && typeof value === "object") && forms(value).some((text) => rule(String(text))))
        out.push(`${lang} ${key}`);
  return out;
}

describe("the dictionaries", () => {
  test("the rules flag what they forbid, and let the rest through (positive controls)", () => {
    for (const bad of ["{n} file(s)", "{n} dependency(ies)", "{covered} déjà cité(s)", "{n} réplica(x)"])
      assert.ok(bracketPlural(bad), bad);
    for (const good of ["http(s)://host[:port]", "{n} files", "(see the facts)", "Zone {n}: {text}"])
      assert.ok(!bracketPlural(good), good);
    for (const bad of ["{n} items, at most {max}", "at least {need} more pages", "… {count} more lines"])
      assert.ok(selectorBeforeNoun(bad), bad);
    for (const good of [
      "Step {i} / {n}",
      "{n} today, {threshold} expected",
      "zone {n} ({target})",
      "({n} dans les plans)",
    ])
      assert.ok(!selectorBeforeNoun(good), good);
    assert.ok(selectorBeforeNoun("({n} dans les plans, {n} listées)"), "a plural after a word that is not one");
    for (const bad of ["{lines} lines", "{file} is {days} days old", "({tokens} tokens, {cuts} cuts)"])
      assert.ok(countBeforeItsNoun(bad), bad);
    for (const good of ["{ms} ms in all", "{current} current", "{commits}, complexity", "{files}, {tests}"])
      assert.ok(!countBeforeItsNoun(good), good);
  });

  test("no plural is written in brackets, in either language", () => {
    assert.deepEqual(offenders(bracketPlural), []);
  });

  test("a text message never shows its count before a plural noun: it is a plural, chosen by n", () => {
    assert.deepEqual(offenders(selectorBeforeNoun, { plainOnly: true }), []);
    assert.deepEqual(offenders(countBeforeItsNoun, { plainOnly: true }), []);
  });
});

// ── The calls ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The kit's source files (.mjs, .js) of engine/, cli/ and adapters/, with their text. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(mjs|js)$/.test(e.name)) out.push([path.relative(KIT_ROOT, abs), fs.readFileSync(abs, "utf8")]);
    }
  };
  for (const root of ["engine", "cli", "adapters"]) walk(path.join(KIT_ROOT, root));
  return out;
}

/**
 * The calls `t("<plural key>", { … })` (t, tv, th, ctx.t) whose object, written in the call, has no `n` nor a spread:
 * the form would never follow the count. A call that passes a variable (`t(key, vars)`) is not judged here.
 */
function callsWithoutN(text, plurals) {
  const out = [];
  for (const m of text.matchAll(/\bt[hv]?\(\s*"([\w.]+)"\s*(\)|,\s*\{)?/g)) {
    if (!plurals.has(m[1]) || m[2] === undefined) continue; // not a plural, or a variable follows: not judged
    if (m[2] === ")" || !hasN(text, m.index + m[0].length - 1)) out.push(m[1]);
  }
  return out;
}

/** Whether the object literal opening at `start` names `n` or spreads another object, at its own depth. */
function hasN(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      if (--depth === 0) return false;
    } else if (depth === 1 && /[{,\s]/.test(text[i - 1] ?? "")) {
      if (text.startsWith("...", i)) return true;
      if (/^n\s*[:,}]/.test(text.slice(i, i + 4))) return true;
    }
  }
  return false;
}

describe("the calls", () => {
  const plurals = new Set(Object.keys(en).filter((k) => typeof en[k] === "object"));

  test("the reader flags a plural without n, and lets the rest through (positive controls)", () => {
    const keys = new Set(["p.files"]);
    assert.deepEqual(callsWithoutN('t("p.files", { files: list.length })', keys), ["p.files"]);
    assert.deepEqual(callsWithoutN('ctx.t("p.files")', keys), ["p.files"]);
    assert.deepEqual(callsWithoutN('t("p.files", { files: f({ n: 1 }) })', keys), ["p.files"], "an inner n");
    assert.deepEqual(callsWithoutN('t("p.files", { n: list.length })', keys), []);
    assert.deepEqual(callsWithoutN('t("p.files", { file, n })', keys), []);
    assert.deepEqual(callsWithoutN('t("p.files", {\n  ...vars,\n  file })', keys), []);
    assert.deepEqual(callsWithoutN('t("p.files", vars)', keys), [], "a variable: not judged");
    assert.deepEqual(callsWithoutN('t("p.text", { files })', keys), [], "not a plural");
  });

  test("a plural message written in a call always gets its n", () => {
    const found = sources().flatMap(([file, text]) => callsWithoutN(text, plurals).map((k) => `${file}: ${k}`));
    assert.deepEqual(found, []);
  });
});

// ── What a reader sees ───────────────────────────────────────────────────────────────────────────────────────────

describe("one, two, and zero in French", () => {
  const te = createI18n({ language: "en" });
  const tf = createI18n({ language: "fr" });

  test("a count shown without its noun beside another one: the noun follows the count it belongs to", () => {
    const vars = { n: 5, need: 1, file: "toc.json" };
    assert.match(te.t("cli.audit.action.typedChoose", vars), /^Type at least 1 more of the 5 pages that follow/);
    assert.match(tf.t("cli.audit.action.typedChoose", vars), /^Typez au moins 1 de plus parmi les 5 pages qui/);
    assert.match(te.t("cli.audit.item.rubrics", { feature: "f", left: 1, total: 4, n: 1 }), /1 rubric of 4 without/);
    assert.match(tf.t("cli.audit.item.rubrics", { feature: "f", left: 3, total: 4, n: 3 }), /3 rubriques sur 4 sans/);
  });

  test("counted nouns: each number with its own noun, in the plural form of that number", () => {
    const line = (i18n, ok, warn, fail) =>
      i18n.t("cli.doctor.summary.ok", {
        ok,
        warnings: numbers(i18n).count("cli.doctor.count.warnings", warn),
        problems: numbers(i18n).count("cli.doctor.count.problems", fail),
      });
    assert.equal(line(te, 9, 1, 0), "9 OK · 1 warning · 0 problems: ready.");
    assert.equal(line(te, 9, 2, 1), "9 OK · 2 warnings · 1 problem: ready.");
    assert.equal(line(tf, 9, 1, 0), "9 OK · 1 avertissement · 0 problème : prêt.");
    assert.equal(line(tf, 9, 2, 3), "9 OK · 2 avertissements · 3 problèmes : prêt.");
    const footer = (i18n, pages, captures) =>
      i18n.t("ui.footer.site", {
        product: "Acme",
        version: "1.0",
        date: "1 October 2026",
        pages: i18n.t("ui.footer.pages", { n: pages }),
        captures: i18n.t("ui.page.annotatedScreens", { n: captures }),
      });
    assert.match(footer(te, 1, 1), /· 1 page, 1 annotated screen$/);
    assert.match(footer(tf, 12, 0), /· 12 pages, 0 écran annoté$/);
  });

  test("a renderer passes each count to its noun: ::modules with one file", () => {
    const esc = (s) => String(s);
    const data = { items: [{ file: "a.js", imports: 0, importedBy: 0 }], summary: { files: 1, edges: 0, cycles: [] } };
    const summary = (i18n) => renderModules(data, { t: i18n.t, esc }).match(/<p class="dev-summary">([^<]*)<\/p>/)[1];
    assert.equal(summary(te), "1 file, 0 imports between them, 0 import cycles, 1 orphan file.");
    assert.equal(summary(tf), "1 fichier, 0 import entre eux, 0 cycle d'import, 1 fichier orphelin.");
  });
});
