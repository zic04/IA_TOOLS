// End-to-end tests of the generated site (Playwright, headless Chromium) on the demo project:
// routes, Ctrl+K search, theme switch, guided tour, glossary tooltip, print preview, no page error; `doc-kit view`.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildDemo, tempDir, DEMO } from "../tools/helpers.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { checkTables } from "../../engine/check/tables.mjs";

let browser;
let dir;
const files = {};
const errors = [];

before(async () => {
  dir = tempDir("doc-kit-e2e-");
  for (const language of ["en", "fr"]) {
    const r = await buildDemo({ language, draft: true });
    files[language] = path.join(dir, `demo-${language}.html`);
    fs.writeFileSync(files[language], r.html);
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors");
});

async function open(hash = "", { language = "en", colorScheme = "light", width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(files[language]).href + (hash ? "#/" + hash : ""));
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
// textContent: independent of CSS text-transform.
const text = (page, sel) => page.locator(sel).first().textContent();
/** Hover without the scroll that would hide the tooltip right away. */
async function hover(page, sel) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await el.hover();
}

describe("navigation", () => {
  test("home, section, page, sub-page, anchor, unknown page", async () => {
    const page = await open();
    assert.match(await text(page, ".heros h1"), /Understand, use and configure Acme Orders/);
    assert.match(await text(page, ".heros .actions"), /Explore the architecture/);
    assert.match(await text(page, ".accueil-section-sous"), /^One reading path/);

    await go(page, "use");
    assert.equal(await text(page, "h1.page-titre"), "Using Acme Orders");
    assert.match(await text(page, ".grille-cartes"), /1 sub-page · 3 annotated screens/);

    await go(page, "use/orders");
    assert.equal(await text(page, "h1.page-titre"), "The orders list");
    assert.match(await text(page, "#toc"), /On this page/);
    assert.equal(await page.locator(".lat-lien.niveau-2").count(), 1, "the sub-page shows in its branch");
    assert.match(await text(page, ".pied-nav"), /Next ›/);

    await go(page, "use/orders/detail");
    assert.match(await text(page, ".ariane"), /Orders/);
    assert.match(await text(page, ".lat-lien.parent-actif"), /Orders/);

    await go(page, "maintain/architecture");
    assert.equal(await page.locator(".lat-lien.niveau-2").count(), 0, "sub-pages of another branch are hidden");
    assert.equal(await page.locator("figure.schema svg").count(), 1);

    await go(page, "use/settings~settings-reference");
    const top = await page.evaluate(() => document.getElementById("settings-reference").getBoundingClientRect().top);
    assert.ok(top >= 0 && top < 200, `anchor scrolled into view (${top})`);

    await go(page, "nowhere");
    assert.equal(await text(page, "h1.page-titre"), "Page not found");
    await page.context().close();
  });
});

describe("search", () => {
  test("Ctrl+K opens it, results are highlighted, Enter navigates, Escape closes", async () => {
    const page = await open();
    await page.keyboard.press("Control+k");
    assert.ok(await page.locator("#recherche.ouverte").isVisible());
    assert.match(await text(page, "#recherche-resultats"), /Suggestions/);
    await page.keyboard.type("back order");
    await page.waitForTimeout(100);
    assert.ok((await page.locator(".resultat").count()) >= 1);
    assert.match(await page.locator(".resultat mark").first().innerText(), /back/i);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    assert.match(await page.evaluate(() => location.hash), /^#\/use\/orders/);
    assert.equal(await page.locator("#recherche.ouverte").count(), 0);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("zzzz");
    assert.match(await text(page, "#recherche-resultats"), /No results for “zzzz”/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#recherche.ouverte").count(), 0);
    await page.context().close();
  });
});

describe("theme", () => {
  test("follows the system, switches and is remembered", async () => {
    const dark = await open("", { colorScheme: "dark" });
    assert.equal(await dark.evaluate(() => document.documentElement.dataset.theme), "dark");
    await dark.context().close();

    const page = await open();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click("#bouton-theme");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.equal(await page.evaluate(() => localStorage.getItem("acme-orders-doc-theme")), "dark");
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), before);
    assert.equal(await page.getAttribute("#bouton-theme", "title"), "Light theme");
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await page.context().close();
  });

  test("the Ctrl K key of the top bar is readable in both themes (WCAG ≥ 4.5)", async () => {
    for (const colorScheme of ["light", "dark"]) {
      const page = await open("", { colorScheme });
      const contrast = await page.evaluate(() => {
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const kbd = getComputedStyle(document.querySelector(".recherche-bouton kbd"));
        const [a, b] = [lum(rgb(kbd.color)), lum(rgb(kbd.backgroundColor))].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
      assert.ok(contrast >= 4.5, `${colorScheme}: ${contrast.toFixed(2)}`);
      await page.context().close();
    }
  });
});

describe("annotated screens", () => {
  test("guided tour: steps, keyboard, finish", async () => {
    const page = await open("use/orders");
    await page.click("[data-action=visite]");
    await page.waitForTimeout(600);
    assert.ok(await page.locator(".visionneuse.ouverte.en-visite").isVisible());
    assert.match(await text(page, ".vis-carte .entete"), /Step 1 \/ 3/);
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(500);
    assert.match(await text(page, ".vis-carte .entete"), /Step 2 \/ 3/);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    assert.match(await text(page, ".vis-carte .entete"), /Step 3 \/ 3/);
    await page.getByRole("button", { name: "Finish" }).click();
    assert.equal(await page.locator(".visionneuse.ouverte").count(), 0);
    await page.context().close();
  });

  test("zone tooltip and glossary tooltip", async () => {
    const page = await open("use/orders");
    await hover(page, '.ecran-cadre .zone[data-n="2"]');
    assert.match(await text(page, "#bulle.visible"), /Order summary/);
    await hover(page, ".contenu .gl");
    assert.match(await text(page, "#bulle.visible"), /customer request/);
    await page.context().close();
  });
});

describe("printing", () => {
  test("print media hides the chrome; full print renders every page then cleans up", async () => {
    const page = await open("use/orders");
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".topbar")).display), "none");
    await page.evaluate(() => {
      window.confirm = () => true;
      window.print = () => (window.__printed = (window.__printed || 0) + 1);
    });
    await page.evaluate(() => document.getElementById("bouton-imprimer").click());
    await page.waitForFunction(() => window.__printed === 1);
    // Opening use/orders makes the business space current (ARCHITECTURE.md §6.1a): "print everything" only
    // covers that space (7 pages), not the takeover one too.
    assert.equal(await page.locator("#impression .page-imprimee").count(), 8, "outline + 7 business pages");
    assert.ok(await page.evaluate(() => document.body.classList.contains("impression-complete")));
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    assert.equal(await page.locator("#impression .page-imprimee").count(), 0);
    await page.context().close();
  });
});

describe("languages", () => {
  test("French interface", async () => {
    const page = await open("use/orders", { language: "fr" });
    assert.equal(await page.evaluate(() => document.documentElement.lang), "fr");
    assert.match(await text(page, "#toc"), /Sur cette page/);
    assert.match(await text(page, "[data-action=visite]"), /Visite guidée/);
    assert.match(await text(page, ".pied-site"), /documentation générée le 1 janvier 2026/);
    await go(page, "");
    assert.match(await text(page, ".heros h1"), /Comprendre, utiliser et configurer Acme Orders/);
    assert.match(await text(page, ".accueil-section-sous"), /^Un chemin de lecture/);
    await page.context().close();
  });

  test("narrow screen: menu button opens the side menu", async () => {
    const page = await open("use/orders", { width: 600 });
    assert.ok(await page.locator("#menu-mobile").isVisible());
    await page.click("#menu-mobile");
    assert.ok(await page.evaluate(() => document.body.classList.contains("menu-ouvert")));
    await page.context().close();
  });
});

describe("doc-kit view", () => {
  test("--full: the whole page in one image; without it, the window only", async () => {
    const size = (file) => {
      const b = fs.readFileSync(file);
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    const run = (args) => runCli(["view", "use/orders", "--project", DEMO, ...args], { stdout: { write() {} }, stderr: { write() {} }, env: {} });
    const window = path.join(dir, "window.png");
    const full = path.join(dir, "full.png");
    assert.equal(await run(["--output", window]), 0);
    assert.equal(await run(["--full", "--output", full]), 0);
    assert.deepEqual(size(window), [1440, 900]);
    const [width, height] = size(full);
    assert.equal(width, 1440);
    assert.ok(height > 900, `full page height ${height}`);
  });
});

describe("check tables: a table rendered by a directive is never reported", () => {
  test("a hand-written table wider than the reading column is reported; a ::facts/::faits one (data-generated) never is, however wide", async () => {
    const file = path.join(dir, "tables.html");
    fs.writeFileSync(
      file,
      `<!doctype html><html><body>
        <script type="application/json" id="donnees">${JSON.stringify({ ordre: ["page1"] })}</script>
        <main class="contenu" style="width:300px">
          <h2>Hand-written</h2>
          <div class="tableau" style="width:300px; overflow:auto;"><table style="width:2000px"><tr><td>wide, hand-written</td></tr></table></div>
          <h2>Generated</h2>
          <div class="tableau" data-generated="facts" style="width:300px; overflow:auto;"><table data-generated="facts" style="width:2000px"><tr><td>wide, from a directive</td></tr></table></div>
        </main>
      </body></html>`
    );
    const result = await checkTables({ file });
    assert.equal(result.pages, 1);
    assert.equal(result.problems.length, 1, JSON.stringify(result.problems));
    assert.equal(result.problems[0].heading, "Hand-written");
  });
});
