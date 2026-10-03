// The text helpers of the build (engine/core/text.mjs) and the numbers of the CLI summaries (engine/build/format.mjs),
// tested directly (AUDIT.md M8). Their output lands in the generated HTML and in every summary line: a change here
// is a change of the site or of the CLI, so each behaviour is pinned.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esc, attrs, plainText, slug, normalize, escapeRegex } from "../../engine/core/text.mjs";
import { numbers } from "../../engine/build/format.mjs";
import { createI18n } from "../../engine/i18n.mjs";

describe("esc: minimal HTML escaping", () => {
  test("& < > and the double quote are escaped, & first (no double escaping of the others)", () => {
    assert.equal(esc(`<a href="x">Tom & Jerry</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;");
    assert.equal(esc("&lt;"), "&amp;lt;", "an entity is text: escaped again");
  });
  test("the apostrophe is kept (attributes are always double-quoted)", () => {
    assert.equal(esc("l'ordre"), "l'ordre");
  });
  test("null and undefined give an empty string; numbers become text", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
    assert.equal(esc(0), "0");
    assert.equal(esc(12.5), "12.5");
  });
  test("an injected script cannot survive as markup", () => {
    const out = esc(`"><script>alert(1)</script>`);
    assert.doesNotMatch(out, /[<>"]/);
  });
});

describe("attrs: attributes of a directive", () => {
  test("double-quoted attributes, hyphens and empty values", () => {
    assert.deepEqual(attrs(`id="x" data-title="A title" empty=""`), { id: "x", "data-title": "A title", empty: "" });
  });
  test("single quotes and bare words are not attributes; nothing gives {}", () => {
    assert.deepEqual(attrs(`id='x' bare title="ok"`), { title: "ok" });
    assert.deepEqual(attrs(""), {});
    assert.deepEqual(attrs(undefined), {});
  });
});

describe("plainText: text of an HTML fragment", () => {
  test("tags removed, entities decoded, white space collapsed and trimmed", () => {
    assert.equal(
      plainText("<p>Tom&nbsp;&amp;&nbsp;Jerry</p>\n<p>&lt;b&gt; &quot;x&quot; l&#39;un</p>  "),
      `Tom & Jerry <b> "x" l'un`,
    );
  });
  test("an inline SVG is dropped whole (its text and markup)", () => {
    assert.equal(plainText(`Before<svg viewBox="0 0 1 1"><text>label</text></svg>after`), "Before after");
  });
});

describe("slug: anchor of a heading", () => {
  test("lower case, accents removed, every other run of characters becomes one hyphen", () => {
    assert.equal(slug("Créer une commande — étape 2"), "creer-une-commande-etape-2");
    assert.equal(slug("  --Déjà vu!--  "), "deja-vu");
  });
  test("tags are dropped, at most 60 characters, and an empty result is `section`", () => {
    assert.equal(slug("<code>doc-kit</code> build"), "doc-kit-build");
    assert.equal(slug("a".repeat(80)).length, 60);
    assert.equal(slug("!!!"), "section");
    assert.equal(slug("日本語"), "section");
  });
});

describe("normalize and escapeRegex", () => {
  test("normalize: no accents, no case, trimmed; null is empty", () => {
    assert.equal(normalize("  Écran PRINCIPAL "), "ecran principal");
    assert.equal(normalize(null), "");
  });
  test("escapeRegex: every special character matches itself", () => {
    const text = "a.b*c+d?e^f${g}(h)|i[j]\\k";
    assert.ok(new RegExp(`^${escapeRegex(text)}$`).test(text));
    assert.ok(!new RegExp(escapeRegex("a.b")).test("axb"));
  });
});

describe("numbers: the numbers of the CLI summaries", () => {
  test("numbers follow the language: 1,440 in English, 1 440 in French (narrow no-break space)", () => {
    assert.equal(numbers(createI18n({ language: "en" })).number(1440), "1,440");
    assert.equal(
      numbers(createI18n({ language: "fr" }))
        .number(1440)
        .replace(/\s/g, " "),
      "1 440",
    );
    assert.equal(
      numbers(createI18n({ language: "fr" })).number(0.25, { maximumFractionDigits: 1 }),
      "0,3",
      "options give a new format",
    );
  });
  test("count: the plural form of the number, with the number formatted", () => {
    const i18n = createI18n({
      language: "en",
      overrides: { "test.diagrams": { one: "{count} diagram", other: "{count} diagrams" } },
    });
    const { count } = numbers(i18n);
    assert.equal(count("test.diagrams", 1), "1 diagram");
    assert.equal(count("test.diagrams", 1440), "1,440 diagrams");
  });
});
