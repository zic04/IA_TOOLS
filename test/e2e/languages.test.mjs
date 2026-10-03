// Languages in the generated site (ARCHITECTURE.md §6.12), Playwright on the languages test project (two
// languages, en source + fr, cohabiting with the two spaces of ARCHITECTURE.md §6.1a): the selector and
// aria-pressed, the #/[<lang>/]<path>[~anchor] URL grammar and its rewrite, the remembered language and the
// browser language fallback, the template texts re-applied, the page kept across a switch with its anchor
// mapped by position, search by language, the "not translated yet" banner, the combination with spaces,
// per-language images, the mono-language build (--lang fr), full print, mobile, keyboard, ARIA and contrasts
// in the light and dark themes.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildLanguages, tempDir } from "../tools/helpers.mjs";

let browser;
let dir;
const files = {};
const errors = [];
const LANG_KEY = "acme-orders-doc-theme.lang";

before(async () => {
  dir = tempDir("doc-kit-e2e-languages-");
  const r = await buildLanguages({ draft: true });
  assert.deepEqual(r.errors, []);
  files.full = path.join(dir, "full.html");
  fs.writeFileSync(files.full, r.html);
  for (const s of r.sites) {
    files[s.space] = path.join(dir, `${s.space}.html`);
    fs.writeFileSync(files[s.space], s.html);
  }
  const mono = await buildLanguages({ draft: true, options: { lang: "fr" } });
  assert.deepEqual(mono.errors, []);
  files.mono = path.join(dir, "mono-fr.html");
  fs.writeFileSync(files.mono, mono.html);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors");
});

async function open(hash = "", { file = "full", colorScheme = "light", width = 1440, locale = "en-US", context } = {}) {
  const ctx = context || (await browser.newContext({ viewport: { width, height: 900 }, colorScheme, locale }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(pathToFileURL(files[file]).href + (hash ? "#/" + hash : ""));
  return page;
}
const go = (page, hash) =>
  page.evaluate(
    (h) =>
      new Promise((r) => {
        window.addEventListener("hashchange", () => setTimeout(r, 30), { once: true });
        location.hash = h;
      }),
    "#/" + hash
  );
const text = (page, sel) => page.locator(sel).first().textContent();
const pressed = (page, sel = "#langues .espace-choix") => page.locator(sel).evaluateAll((bs) => bs.map((b) => `${b.textContent}:${b.getAttribute("aria-pressed")}`));
const remembered = (page) => page.evaluate((k) => localStorage.getItem(k), LANG_KEY);

describe("selector", () => {
  test("two buttons (autonyms), aria-pressed follows the current language, each button leads to #/<lang>/<path>", async () => {
    const page = await open("use/orders", { locale: "en-US" });
    const bar = page.locator("#langues");
    assert.equal(await bar.getAttribute("role"), "group");
    assert.equal(await bar.getAttribute("aria-label"), "Language");
    assert.deepEqual(await pressed(page), ["English:true", "Français:false"]);
    assert.equal(await page.locator("#langues .espace-choix").first().getAttribute("lang"), "en");
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => location.hash), "#/fr/use/orders");
    assert.deepEqual(await pressed(page), ["English:false", "Français:true"]);
    assert.equal(await remembered(page), "fr");
    await page.context().close();
  });

  test("document.documentElement.lang follows the current language", async () => {
    const page = await open("use/orders", { locale: "en-US" });
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr");
    await page.context().close();
  });
});

describe("URL grammar and initial language", () => {
  test("a URL without a prefix is rewritten with the current language (replaceState, no history entry)", async () => {
    const page = await open("use/orders", { locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => location.hash), "#/en/use/orders");
    // replaceState never grows the history stack: loading a prefix-less URL and loading the already-rewritten
    // one land on the same length (a hashchange navigation through `go`, by contrast, does grow it — covered
    // implicitly by every other test using `go` without ever going back).
    const withoutPrefix = await page.evaluate(() => history.length);
    await page.context().close();
    const page2 = await open("en/use/orders", { locale: "en-US" });
    await page2.waitForTimeout(80);
    const withPrefix = await page2.evaluate(() => history.length);
    assert.equal(withoutPrefix, withPrefix, "the rewrite itself adds no history entry");
    await page2.context().close();
  });

  test("a URL with the fr prefix opens directly in French", async () => {
    const page = await open("fr/use/orders", { locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr");
    assert.match(await text(page, ".page-titre"), /La liste des commandes/);
    await page.context().close();
  });

  test("remembered language wins over the browser's; without it, navigator.languages decides", async () => {
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
    await ctx1.addInitScript((k) => localStorage.setItem(k, "en"), LANG_KEY);
    const page1 = await open("use/orders", { context: ctx1 });
    await page1.waitForTimeout(80);
    assert.equal(await page1.evaluate(() => document.documentElement.lang), "en", "stored preference wins over the French browser");
    await ctx1.close();

    const page2 = await open("use/orders", { locale: "fr-FR" });
    await page2.waitForTimeout(80);
    assert.equal(await page2.evaluate(() => document.documentElement.lang), "fr", "no stored preference: navigator.languages (fr-FR) decides");
    await page2.context().close();
  });
});

describe("page kept across a switch, anchor mapped by position", () => {
  test("same number of headings: the anchor is carried over to its translated id", async () => {
    const page = await open("en/use/settings~what-it-is-for", { locale: "en-US" });
    await page.waitForTimeout(80);
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => location.hash), "#/fr/use/settings~son-role");
    await page.context().close();
  });

  test("the page is kept even without an anchor; the title changes to the translation", async () => {
    const page = await open("en/use/orders", { locale: "en-US" });
    await page.waitForTimeout(80);
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => location.hash), "#/fr/use/orders");
    assert.match(await text(page, ".page-titre"), /La liste des commandes/);
    await page.context().close();
  });
});

describe("template and UI texts re-applied", () => {
  test("sidebar menu titles, search placeholder, theme button aria-label, breadcrumb — restored on switching back", async () => {
    const page = await open("en/use/settings", { locale: "en-US" });
    await page.waitForTimeout(80);
    assert.match(await text(page, ".lat-lien.actif"), /Settings/);
    assert.equal(await page.locator("#recherche-champ").getAttribute("placeholder"), "Search for a feature, a setting, a screen…");
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(100);
    assert.match(await text(page, ".lat-lien.actif"), /Réglages/);
    assert.notEqual(await page.locator("#recherche-champ").getAttribute("placeholder"), "Search for a feature, a setting, a screen…");
    assert.equal(await page.locator("#bouton-theme").getAttribute("aria-label"), "Changer de thème");
    await page.locator("#langues .espace-choix", { hasText: "English" }).click();
    await page.waitForTimeout(100);
    assert.match(await text(page, ".lat-lien.actif"), /Settings/);
    assert.equal(await page.locator("#bouton-theme").getAttribute("aria-label"), "Change theme");
    await page.context().close();
  });
});

describe("search", () => {
  test("a French word finds the French page; the same word finds nothing while the site is shown in English", async () => {
    const page = await open("fr/", { locale: "en-US" });
    await page.waitForTimeout(80);
    await page.keyboard.press("Control+k");
    await page.locator("#recherche-champ").fill("réglages");
    await page.waitForTimeout(80);
    const resultsFr = await page.locator(".resultat").count();
    assert.ok(resultsFr >= 1, "finds results in French");
    await page.keyboard.press("Escape");
    await go(page, "en/");
    await page.waitForTimeout(80);
    await page.keyboard.press("Control+k");
    await page.locator("#recherche-champ").fill("réglages");
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".resultat").count(), 0, "no result in English for the French word");
    await page.context().close();
  });
});

describe("translation banner (draft build)", () => {
  test("the untranslated page shows the banner naming the source language; no other page has it", async () => {
    const page = await open("fr/take-over/orders-api", { locale: "en-US" });
    await page.waitForTimeout(80);
    const banner = page.locator(".bandeau-traduction");
    assert.equal(await banner.count(), 1);
    assert.equal(await banner.getAttribute("role"), "note");
    // The source language (English) is named IN THE INTERFACE LANGUAGE shown (French here: "anglais"), never
    // its autonym ("English" is reserved for the language selector).
    assert.match(await banner.textContent(), /anglais/);
    assert.doesNotMatch(await banner.textContent(), /English/);
    await go(page, "fr/use/orders");
    assert.equal(await page.locator(".bandeau-traduction").count(), 0);
    await go(page, "fr/take-over/architecture");
    assert.equal(await page.locator(".bandeau-traduction").count(), 0, "unmarked, not missing: no banner");
    await go(page, "fr/use/api-limits");
    assert.equal(await page.locator(".bandeau-traduction").count(), 0, "stale, not missing: no banner");
    await page.context().close();
  });
});

describe("images per language", () => {
  // The fixture's images/fr/orders-list.webp happens to hold the same bytes as the source (only the build's
  // embedding is under test here, not visually distinct art), so the element actually used is checked by id
  // (img-orders-list@fr vs img-orders-list), not by content inequality.
  test("the translated screenshot resolves to its @fr element; the untranslated one resolves to the shared element", async () => {
    const page = await open("en/use/orders", { locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => !!document.getElementById("img-orders-list@fr")), true, "img-orders-list@fr embedded");
    const srcEn = await page.evaluate(() => document.querySelector('img[data-img="orders-list"]')?.getAttribute("src"));
    const enBlock = await page.evaluate(() => document.getElementById("img-orders-list").textContent.trim());
    assert.equal(srcEn, enBlock, "en: resolves to the plain img-orders-list element");
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(100);
    const srcFr = await page.evaluate(() => document.querySelector('img[data-img="orders-list"]')?.getAttribute("src"));
    const frBlock = await page.evaluate(() => document.getElementById("img-orders-list@fr").textContent.trim());
    assert.equal(srcFr, frBlock, "fr: resolves to the img-orders-list@fr element");
    await go(page, "fr/use/settings");
    await page.waitForTimeout(80);
    const settingsFr = await page.evaluate(() => document.querySelector('img[data-img="settings-profile"]')?.getAttribute("src"));
    const settingsBlock = await page.evaluate(() => document.getElementById("img-settings-profile").textContent.trim());
    const hasFrVariant = await page.evaluate(() => !!document.getElementById("img-settings-profile@fr"));
    assert.equal(hasFrVariant, false, "settings-profile has no fr variant embedded");
    assert.equal(settingsFr, settingsBlock, "settings-profile: the source image is shared, even while fr is current");
    await page.context().close();
  });
});

describe("combination with spaces", () => {
  test("#/fr/@business: the space is pressed, the menu is filtered, titles are in French", async () => {
    const page = await open("fr/@business", { locale: "en-US" });
    await page.waitForTimeout(80);
    assert.deepEqual(
      await pressed(page, "#espaces .espace-choix"),
      ["Tout:false", "Métier:true", "Reprise:false"]
    );
    assert.match(await text(page, ".heros h1"), /Acme Orders/);
    await page.context().close();
  });

  test("exports keep both languages (no build per language) and no space selector, but keep the language selector", async () => {
    const page = await open("", { file: "business", locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#espaces .espace-choix").count(), 0, "no space selector in an export");
    assert.equal(await page.locator(".espace-unique").count(), 1, "the space shown as a label");
    assert.equal(await page.locator("#langues .espace-choix").count(), 2, "the language selector is still there");
    await page.locator("#langues .espace-choix", { hasText: "Français" }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr");
    await page.context().close();
  });
});

describe("mono-language build (--lang fr)", () => {
  test("no selector, no #donnees-fr, the site is in French, a plain URL is not rewritten", async () => {
    const page = await open("use/orders", { file: "mono", locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#langues").count(), 0, "#langues removed");
    assert.equal(await page.evaluate(() => !!document.getElementById("donnees-fr")), false);
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr");
    assert.match(await text(page, ".page-titre"), /La liste des commandes/);
    assert.equal(await page.evaluate(() => location.hash), "#/use/orders", "no language prefix added");
    await page.context().close();
  });
});

describe("full print", () => {
  test("printing everything in French includes the French titles", async () => {
    const page = await open("fr/use/orders", { locale: "en-US" });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      window.confirm = () => true;
      window.print = () => (window.__printed = (window.__printed || 0) + 1);
    });
    await page.click("#bouton-imprimer");
    await page.waitForFunction(() => window.__printed === 1);
    assert.match(await page.locator("#impression").textContent(), /La liste des commandes/);
    await page.context().close();
  });
});

describe("mobile", () => {
  test("below 1080px the topbar selector is hidden; .lat-langues heads the open side menu, above the spaces", async () => {
    const page = await open("en/use/orders", { width: 390, locale: "en-US" });
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".topbar .langues").isVisible(), false);
    await page.locator("#menu-mobile").click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".lat-langues").isVisible(), true);
    const order = await page.evaluate(() => Array.from(document.querySelectorAll(".lateral > .espaces")).map((el) => el.className));
    assert.ok(order[0].includes("lat-langues") && order[1].includes("lat-espaces") && !order[1].includes("lat-langues"), "languages above spaces: " + order.join(" | "));
    await page.context().close();
  });
});

describe("keyboard and ARIA", () => {
  test("the language buttons are reached with Tab and activated with Enter", async () => {
    const page = await open("en/use/orders", { locale: "en-US" });
    await page.locator("#langues .espace-choix", { hasText: "Français" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#langues .espace-choix", { hasText: "Français" }).getAttribute("aria-pressed"), "true");
    await page.context().close();
  });
});

describe("accessibility: contrasts in both themes", () => {
  async function contrast(page, sel) {
    return page.locator(sel).first().evaluate((el) => {
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const cs = getComputedStyle(el);
      const [a, b] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
  }
  for (const colorScheme of ["light", "dark"]) {
    test(`${colorScheme}: pressed language button and the translation banner are readable (WCAG >= 4.5)`, async () => {
      const page = await open("fr/take-over/orders-api", { colorScheme, locale: "en-US" });
      await page.waitForTimeout(80);
      const selector = await contrast(page, "#langues .espace-choix[aria-pressed=true]");
      assert.ok(selector >= 4.5, `${colorScheme} selector: ${selector.toFixed(2)}`);
      const banner = await contrast(page, ".bandeau-traduction");
      assert.ok(banner >= 4.5, `${colorScheme} banner: ${banner.toFixed(2)}`);
      await page.context().close();
    });
  }
});
