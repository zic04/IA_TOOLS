// Site assets and theme: no literal colour in style.css, no hard-coded text in app.js, tokens, logo,
// contrast of the default palette, icons; the kit stays product-neutral.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenNames, tokenStylesheet, themeTokens, checkOverrides, loadTokens } from "../../engine/theme/tokens.mjs";
import { checkContrasts, ratio, resolve } from "../../engine/theme/contrast.mjs";
import { sanitizeLogo, loadLogo } from "../../engine/theme/logo.mjs";
import { ICONS, ALIASES, icon, createIcons } from "../../engine/site/icons.mjs";
import { assemble } from "../../engine/build/assemble.mjs";
import { KIT_ROOT, DEMO } from "../tools/helpers.mjs";

const read = (p) => fs.readFileSync(path.join(KIT_ROOT, p), "utf8");
const css = read("engine/site/style.css");
const declarations = (source) =>
  [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({ property: m[1], value: m[2].trim() }));

describe("style.css", () => {
  test("no literal colour: only var(--token) and color-mix()", () => {
    const named = /\b(white|black|red|green|blue|gray|grey|silver|yellow|orange|purple|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i;
    for (const { property, value } of declarations(css)) {
      const v = value.replace(/var\(--[\w-]+\)/g, "");
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b/i, `${property}: ${value}`);
      assert.doesNotMatch(v, /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i, `${property}: ${value}`);
      assert.doesNotMatch(v, named, `${property}: ${value}`);
    }
  });

  test("every colour token used exists in the palette", () => {
    const known = new Set(tokenNames());
    const local = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]));
    local.add("pos"); // set at runtime by app.js (before/after handle)
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/var\(--([\w-]+)/g)) assert.ok(known.has(m[1]) || local.has(m[1]), `unknown token: --${m[1]}`);
  });

  test("English diagram classes and their legacy names are styled together", () => {
    for (const [en, fr] of [["d-box", "s-boite"], ["d-brand", "s-marque"], ["d-line", "s-trait"], ["d-arrow-brand", "s-fleche-marque"], ["d-white", "s-blanc"], ["d-solid", "s-plein"], ["d-chrome", "s-navy"]])
      assert.match(css, new RegExp(`\\.${en},\\n\\.${fr} \\{`), en);
  });
});

describe("app.js and template.html", () => {
  test("no hard-coded user-facing text in app.js", () => {
    const code = read("engine/site/app.js")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /[À-ÿŒœ]/, "accented letters");
    // Text between tags inside template literals: only ${…} expressions or punctuation.
    for (const m of code.matchAll(/(?:<[a-z][^<>]*>|<\/[a-z]+>)([^<>`$"'()]*?[A-Za-z]{2,}[^<>`$"'()]*?)</g)) assert.fail(`hard-coded text: «${m[1].trim()}»`);
    for (const m of code.matchAll(/\b(title|aria-label|placeholder)="([^"$]+)"/g)) assert.fail(`hard-coded attribute: ${m[0]}`);
    assert.doesNotMatch(code, /confirm\("/);
  });

  test("template.html: no visible text outside {{t:…}} markers", () => {
    const html = read("engine/site/template.html").replace(/<script>[\s\S]*?<\/script>/, "").replace(/<style>[\s\S]*?<\/style>/, "");
    for (const m of html.matchAll(/>([^<>]+)</g)) assert.match(m[1].trim(), /^(|\{\{[^}]+\}\}(\s*\{\{[^}]+\}\})*|[↑↓]|v\{\{VERSION\}\})$/, `text: «${m[1].trim()}»`);
    for (const m of html.matchAll(/\b(title|aria-label|placeholder|content)="([^"]*)"/g))
      if (!["width=device-width, initial-scale=1"].includes(m[2])) assert.match(m[2], /^\{\{[^}]+\}\}$/, m[0]);
  });

  test("assemble: one pass, content containing {{…}} is never re-interpreted", () => {
    const html = assemble({
      template: "<p>{{TITLE}}</p>{{t:template.menu}}{{ICON:menu}}<script>{{DATA}}</script>{{APP}}",
      app: 'k="__THEME_KEY__"',
      markers: { TITLE: "{{APP}}" },
      t: (k) => `«${k}»`,
      icon: (n) => `[${n}]`,
      data: { x: "</script>{{TITLE}}" },
      themeKey: "key",
    });
    assert.equal(html, '<p>{{APP}}</p>«template.menu»[menu]<script>{"x":"\\u003c/script>{{TITLE}}"}</script>k="key"');
    assert.throws(() => assemble({ template: "{{NOPE}}", app: "", markers: {}, t: String, icon: String, data: {}, themeKey: "k" }), /NOPE/);
  });
});

describe("theme", () => {
  test("token stylesheet: light then dark, overrides applied", () => {
    const sheet = tokenStylesheet({ colors: { brand: "#123456" }, dark: { brand: "#abcdef" } });
    assert.match(sheet, /^:root \{\n {2}color-scheme: light;\n/);
    assert.match(sheet, /--brand: #123456;/);
    assert.match(sheet, /html\[data-theme="dark"\] \{\n {2}color-scheme: dark;[\s\S]*--brand: #abcdef;/);
    assert.equal(themeTokens({ colors: { brand: "#123456" } }, "dark").brand, loadTokens().dark.brand);
    assert.deepEqual(checkOverrides({ colors: { brand: "#000000", nope: "#000000" } }).map((e) => e.path), ["theme.colors.nope"]);
  });

  test("the default palette is neutral and passes every WCAG pair, in both themes", () => {
    const failing = checkContrasts().filter((r) => !r.ok);
    assert.deepEqual(failing, []);
    assert.equal(ratio("#ffffff", "#000000"), 21);
    assert.equal(resolve({ a: "var(--b)", b: "#fff" }).a, "#fff");
  });

  test("logo: sanitised, inlined without xmlns, favicon in the brand colour; unsafe logos rejected", () => {
    const ok = sanitizeLogo('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
    assert.equal(ok.ok, true);
    assert.equal(ok.inline, '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
    assert.match(decodeURIComponent(ok.favicon("#2563eb")), /^data:image\/svg\+xml,<svg fill="#2563eb" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/);
    const reasons = [
      ["<div/>", "notSvg"],
      ['<svg viewBox="0 0 1 1"><script>x()</script></svg>', "script"],
      ['<svg viewBox="0 0 1 1" onload="x()"></svg>', "handler"],
      ['<svg viewBox="0 0 1 1"><a href="javascript:x()"/></svg>', "javascript"],
      ['<svg viewBox="0 0 1 1"><foreignObject/></svg>', "embedded"],
      ['<svg viewBox="0 0 1 1"><image href="https://example.org/x.png"/></svg>', "external"],
      ["<svg><path/></svg>", "viewBox"],
    ];
    for (const [svg, reason] of reasons) assert.deepEqual(sanitizeLogo(svg), { ok: false, reason }, reason);
    assert.match(loadLogo(DEMO, null).source, /default-logo\.svg$/);
    assert.match(loadLogo(DEMO, "theme/logo.svg").source, /theme[\\/]logo\.svg$/);
    assert.equal(loadLogo(DEMO, "missing.svg").problem, null);
  });

  test("icons: English aliases, fallback, project icons", () => {
    for (const key of Object.values(ALIASES)) assert.ok(key in ICONS, key);
    assert.equal(icon("search"), icon("recherche"));
    assert.equal(icon("nope"), icon("note"));
    const set = createIcons({ star: '<path d="M1 1"/>' });
    assert.match(set.icon("star"), /M1 1/);
    assert.equal(set.key("screen"), "ecran");
  });
});

describe("product neutrality", () => {
  // The terms that must never appear in the kit (customer names, internal hosts, brand colours) are private:
  // they are read from test/.forbidden-terms (one regular expression per line, git-ignored) or from the
  // DOC_KIT_FORBIDDEN_TERMS variable, so that the list itself is never published.
  const termsFile = path.join(KIT_ROOT, "test", ".forbidden-terms");
  const terms = [
    ...(process.env.DOC_KIT_FORBIDDEN_TERMS || "").split("|"),
    ...(fs.existsSync(termsFile) ? fs.readFileSync(termsFile, "utf8").split(/\r?\n/) : []),
  ].map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
  test("no customer name, internal URL or brand colour of a real project in the kit", { skip: terms.length === 0 && "no private term list (test/.forbidden-terms)" }, () => {
    const forbidden = new RegExp(terms.join("|"), "i");
    const skip = new Set(["node_modules", ".git"]);
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        if (skip.has(d.name)) return [];
        const p = path.join(dir, d.name);
        return d.isDirectory() ? walk(p) : /\.(mjs|js|json|css|html|md|svg)$/.test(d.name) ? [p] : [];
      });
    const own = ["cli", "engine", "i18n", "schemas", "test", "examples", "standard", "templates", "skill", "docs", "ci"]
      .filter((d) => fs.existsSync(path.join(KIT_ROOT, d)))
      .flatMap((d) => walk(path.join(KIT_ROOT, d)));
    for (const f of ["README.md", "README.fr.md", "ARCHITECTURE.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "package.json"]) {
      if (fs.existsSync(path.join(KIT_ROOT, f))) own.push(path.join(KIT_ROOT, f));
    }
    assert.ok(own.length > 30);
    for (const f of own) {
      if (f.includes(`${path.sep}__snapshots__${path.sep}`) || f === fileURLToPath(import.meta.url)) continue;
      const m = forbidden.exec(fs.readFileSync(f, "utf8"));
      assert.equal(m, null, `${path.relative(KIT_ROOT, f)}: ${m && m[0]}`);
    }
  });
});
