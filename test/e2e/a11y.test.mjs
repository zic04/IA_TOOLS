// Reader features of the generated site: screen zones reachable by keyboard (Enter/Space opens the bubble),
// focus kept inside the viewer and the search while open (and given back on Escape), search results announced
// (aria-live), "Screenshots taken on <date>, version <x>" footer, "Report a problem" link — and nothing of it
// when unused.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildDemo, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";
import { assemble, screenshotInfo } from "../../engine/build/assemble.mjs";

let browser;
let dir;
let noSyncDir;
const files = {};
const errors = [];

/** Sets meta.screenshots in a built page, as the build does from the zone files (captured, version). */
function withScreenshots(html, screenshots) {
  const data = dataOf(html);
  data.meta.screenshots = screenshots;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html.replace(/(<script type="application\/json" id="donnees">)[\s\S]*?(<\/script>)/, (m, a, b) => a + json + b);
}

before(async () => {
  dir = tempDir("doc-kit-a11y-");
  const write = (name, html) => {
    files[name] = path.join(dir, `${name}.html`);
    fs.writeFileSync(files[name], html);
  };
  const feedback = (c) => ({ ...c, feedback: { url: "https://example.org/report" } });
  // The demo now commits its own sync.json (ARCHITECTURE.md §6.10: every page marked, "Checked against
  // version…"): "plain" means neither optional feature is used, so it builds from a copy with no sync.json
  // and no screenshot dates, not from the demo as committed.
  noSyncDir = demoCopy();
  fs.rmSync(path.join(noSyncDir, "sync.json"), { force: true });
  const plain = await buildDemo({ draft: true, root: noSyncDir });
  write("plain", withScreenshots(plain.html, undefined));
  const en = await buildDemo({ draft: true, modify: feedback });
  write("en", withScreenshots(en.html, { "orders-list": { captured: "2026-01-01", version: "1.4.0" } }));
  const fr = await buildDemo({ language: "fr", draft: true, modify: feedback });
  write("fr", withScreenshots(fr.html, { "orders-list": { captured: "2026-01-01", version: "1.4.0" }, "settings-profile": { captured: "2026-03-15", version: "1.5.0" } }));
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(noSyncDir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors");
});

async function open(name, hash = "") {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(files[name]).href + (hash ? "#/" + hash : ""));
  return page;
}
const focused = (page) => page.evaluate(() => (document.activeElement.id || document.activeElement.className || document.activeElement.tagName).toString());

describe("keyboard", () => {
  test("screen zones: focusable buttons named after their legend; Enter and Space open the bubble; Escape closes it", async () => {
    const page = await open("en", "use/orders");
    const zone = page.locator('.ecran-cadre .zone[data-n="2"]').first();
    assert.equal(await zone.getAttribute("tabindex"), "0");
    assert.equal(await zone.getAttribute("role"), "button");
    assert.equal(await zone.getAttribute("aria-label"), "Zone 2: Order summary: today's figures, recalculated each time the page opens.");
    // Reached with Tab from the zone before it.
    await page.locator('.ecran-cadre .zone[data-n="1"]').first().focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.n), "2");
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains("allume")), "highlighted on focus");
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#bulle.visible").textContent(), /Order summary/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#bulle.visible").count(), 0);
    const scroll = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Space");
    assert.match(await page.locator("#bulle.visible").textContent(), /Order summary/);
    assert.equal(await page.evaluate(() => window.scrollY), scroll, "Space does not scroll the page");
    // A small scroll (the page following the focus) keeps the bubble open, next to its zone.
    await page.evaluate(() => window.scrollBy(0, 40));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await page.locator("#bulle.visible").count(), 1, "still open after a scroll");
    await page.context().close();
  });

  test("viewer: focus on Close, Tab stays inside, Enter on a zone goes to its step, Escape gives the focus back", async () => {
    const page = await open("en", "use/orders");
    const zoom = page.locator("figure.ecran button[data-action=zoom]").first();
    await zoom.focus();
    await page.keyboard.press("Enter");
    assert.ok(await page.locator(".visionneuse.ouverte").isVisible());
    assert.equal(await focused(page), "vis-fermer");
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.getElementById("visionneuse").contains(document.activeElement)), `Tab ${i + 1} stays in the viewer`);
    }
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(() => document.getElementById("visionneuse").contains(document.activeElement)));
    await page.locator('#vis-scene .zone[data-n="3"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    assert.match(await page.locator(".vis-carte .entete").textContent(), /Step 3 \/ 3/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".visionneuse.ouverte").count(), 0);
    assert.ok(await page.evaluate(() => document.activeElement.matches("figure.ecran button[data-action=zoom]")), "focus back on the Enlarge button");
    await page.context().close();
  });

  test("search: results announced (aria-live), Tab stays in the dialog, Escape gives the focus back", async () => {
    const page = await open("en", "use/orders");
    const status = page.locator("#recherche-statut");
    assert.equal(await status.getAttribute("aria-live"), "polite");
    assert.equal(await status.getAttribute("role"), "status");
    await page.locator("#ouvrir-recherche").focus();
    await page.keyboard.press("Enter");
    assert.equal(await focused(page), "recherche-champ");
    assert.equal(await status.textContent(), "");
    await page.keyboard.type("order");
    await page.waitForTimeout(50);
    const n = await page.locator(".resultat").count();
    assert.ok(n > 1);
    assert.equal(await status.textContent(), `${n} results`);
    for (let i = 0; i < n + 2; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.getElementById("recherche").contains(document.activeElement)), `Tab ${i + 1} stays in the search`);
    }
    await page.locator("#recherche-champ").fill("zzzz");
    assert.equal(await status.textContent(), "No results for “zzzz”.");
    await page.keyboard.press("Escape");
    assert.equal(await focused(page), "ouvrir-recherche", "focus back on the search button");
    await page.context().close();
  });
});

describe("footer", () => {
  test("screenshot date and version; Report a problem link", async () => {
    const page = await open("en", "use/orders");
    // The demo's own sync.json (ARCHITECTURE.md §6.10) marks every page: "Checked against version…" always
    // comes first, before the screenshot dates (set by this fixture's own withScreenshots, above).
    assert.equal(await page.locator(".pied-captures").textContent(), "Checked against version 1.4.0 on October 2, 2026, Screenshots taken on January 1, 2026, version 1.4.0");
    const link = page.locator('.pied-site a[href="https://example.org/report"]');
    assert.equal(await link.textContent(), "Report a problem");
    assert.equal(await link.getAttribute("rel"), "noopener");
    // A page whose screenshot has no metadata, but still marked: only the "Checked against…" part.
    await page.evaluate(() => (location.hash = "#/use/settings"));
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".pied-captures").textContent(), "Checked against version 1.4.0 on October 2, 2026");
    assert.equal(await page.locator(".pied-site a").count(), 1);
    await page.context().close();
  });

  test("French, several dates and versions", async () => {
    const page = await open("fr", "use/orders");
    assert.equal(await page.locator(".pied-captures").textContent(), "Vérifiée sur la version 1.4.0 le 2 octobre 2026, Captures d'écran prises le 1 janvier 2026, version 1.4.0");
    await page.evaluate(() => (location.hash = "#/use/settings"));
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".pied-captures").textContent(), "Vérifiée sur la version 1.4.0 le 2 octobre 2026, Captures d'écran prises le 15 mars 2026, version 1.5.0");
    // The sub-page shows both screenshots (before / after).
    await page.evaluate(() => (location.hash = "#/use/orders/detail"));
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".pied-captures").textContent(), "Vérifiée sur la version 1.4.0 le 2 octobre 2026, Captures d'écran prises entre le 1 janvier 2026 et le 15 mars 2026, versions 1.4.0, 1.5.0");
    await page.context().close();
  });

  test("assemble: meta.screenshots from the zone files of the screenshots the pages use; nothing when unknown", () => {
    const data = () => ({ meta: { titre: "x" }, pages: { a: { html: '<img data-img="one"><img data-img="two">' }, b: { html: '<img data-img="three">' } } });
    const captures = { one: { captured: "2026-01-01", version: "1.0.0" }, two: { file: "two.webp" }, three: { version: "2.0.0" }, unused: { captured: "2020-01-01" } };
    assert.deepEqual(screenshotInfo(data(), captures), { one: { captured: "2026-01-01", version: "1.0.0" }, three: { version: "2.0.0" } });
    assert.equal(screenshotInfo(data(), { two: {} }), null);
    assert.equal(screenshotInfo(data(), undefined), null);
    const run = (c) => assemble({ template: "{{DATA}}", app: "", markers: {}, t: String, icon: String, data: data(), themeKey: "k", captures: c });
    assert.deepEqual(JSON.parse(run(captures)).meta.screenshots.three, { version: "2.0.0" });
    const plain = JSON.stringify(data()).replace(/</g, "\\u003c");
    assert.equal(run({ two: {} }), plain, "unchanged output when no screenshot is dated");
    assert.equal(run(undefined), plain);
  });

  test("unused: no screenshot line, no feedback link", async () => {
    const page = await open("plain", "use/orders");
    assert.equal(await page.locator(".pied-captures").count(), 0);
    assert.equal(await page.locator(".pied-site a").count(), 0);
    await page.context().close();
  });
});
