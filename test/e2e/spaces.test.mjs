// Spaces in the generated site (ARCHITECTURE.md §6.1a), Playwright on the spaces test project: the selector and
// aria-pressed, #/@<id>, the remembered space and the space of the page shown, the filtered menus and neighbours,
// the search grouped by space, the space badge, the breadcrumb and the counterpart, the home page in "everything"
// and in space mode, the full print of a space, the exports (no selector), keyboard, ARIA and contrasts in the
// light and dark themes.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildSpaces, spacesCopy, tempDir } from "../tools/helpers.mjs";

let browser;
let dir;
const files = {};
const errors = [];
const SPACE_KEY = "acme-orders-doc-theme.space";

before(async () => {
  dir = tempDir("doc-kit-e2e-spaces-");
  const r = await buildSpaces();
  assert.deepEqual(r.errors, []);
  files.full = path.join(dir, "full.html");
  fs.writeFileSync(files.full, r.html);
  for (const s of r.sites) {
    files[s.space] = path.join(dir, `${s.space}.html`);
    fs.writeFileSync(files[s.space], s.html);
  }
  // A topic group of three pages, two of them in Use: joined by a list on the settings page alone.
  const grouped = spacesCopy((toc) => {
    const pages = toc.sections.flatMap((s) => s.groups).flatMap((g) => g.pages);
    pages.find((p) => p.id === "use/settings").counterpart = ["take-over/orders-api"];
    return toc;
  });
  try {
    const g = await buildSpaces({ root: grouped });
    assert.deepEqual(g.errors, []);
    files.grouped = path.join(dir, "grouped.html");
    fs.writeFileSync(files.grouped, g.html);
  } finally {
    fs.rmSync(grouped, { recursive: true, force: true });
  }
  // The same project without spaces: no `spaces`, no `space`; its counterparts kept.
  const plain = spacesCopy((toc) => {
    const drop = (x) =>
      Array.isArray(x)
        ? x.map(drop)
        : x && typeof x === "object"
          ? Object.fromEntries(
              Object.entries(x)
                .filter(([k]) => k !== "space" && k !== "spaces")
                .map(([k, v]) => [k, drop(v)]),
            )
          : x;
    return drop(toc);
  });
  try {
    const p = await buildSpaces({ root: plain });
    assert.deepEqual(p.errors, []);
    files.plain = path.join(dir, "plain.html");
    fs.writeFileSync(files.plain, p.html);
  } finally {
    fs.rmSync(plain, { recursive: true, force: true });
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors");
});

async function open(hash = "", { file = "full", colorScheme = "light", width = 1440, context } = {}) {
  const ctx = context || (await browser.newContext({ viewport: { width, height: 900 }, colorScheme }));
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
    "#/" + hash,
  );
const text = (page, sel) => page.locator(sel).first().textContent();
const texts = (page, sel) => page.locator(sel).allTextContents();
const pressed = (page, sel = "#espaces .espace-choix") =>
  page.locator(sel).evaluateAll((bs) => bs.map((b) => `${b.textContent}:${b.getAttribute("aria-pressed")}`));
const remembered = (page) => page.evaluate((k) => localStorage.getItem(k), SPACE_KEY);

describe("selector", () => {
  test("everything, then one button per space; aria-pressed follows the current space; each leads to #/@<id>", async () => {
    const page = await open();
    const bar = page.locator("#espaces");
    assert.equal(await bar.getAttribute("role"), "group");
    assert.equal(await bar.getAttribute("aria-label"), "Spaces");
    assert.deepEqual(await pressed(page), ["Everything:true", "Use:false", "Develop:false"]);
    assert.equal(
      await page.locator("#espaces .espace-choix").nth(1).getAttribute("title"),
      "Users, key users, support",
    );
    await page.locator("#espaces .espace-choix", { hasText: "Use" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => location.hash), "#/@use");
    assert.deepEqual(await pressed(page), ["Everything:false", "Use:true", "Develop:false"]);
    await page.locator("#espaces .espace-choix", { hasText: "Everything" }).click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => location.hash), "#/@");
    assert.deepEqual(await pressed(page), ["Everything:true", "Use:false", "Develop:false"]);
    await page.context().close();
  });

  test("#/@<id> opens the home page of that space; an unknown id means everything", async () => {
    const page = await open("@develop");
    assert.deepEqual(await pressed(page), ["Everything:false", "Use:false", "Develop:true"]);
    assert.match(await text(page, ".espace-bandeau"), /You are reading: Developing the application/);
    await go(page, "@nope");
    assert.deepEqual(await pressed(page), ["Everything:true", "Use:false", "Develop:false"]);
    assert.equal(await page.locator(".espace-bandeau").count(), 0);
    await page.context().close();
  });

  test("remembered for the next visit; a page shown makes its own space current", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let page = await open("@develop", { context });
    assert.equal(await remembered(page), "develop");
    await page.close();
    page = await open("", { context });
    // Chromium hands a localStorage write to the other pages of the context asynchronously (another renderer
    // process): the next visit is the first page load that sees it. A real visit comes long after.
    for (let i = 0; i < 20 && (await remembered(page)) !== "develop"; i++) {
      await page.waitForTimeout(50);
      await page.reload();
    }
    assert.deepEqual(
      await pressed(page),
      ["Everything:false", "Use:false", "Develop:true"],
      "the home page opens on the remembered space",
    );
    await go(page, "use/orders");
    assert.deepEqual(await pressed(page), ["Everything:false", "Use:true", "Develop:false"]);
    assert.equal(await remembered(page), "use");
    // A section belongs to its own space.
    await go(page, "take-over");
    assert.deepEqual(await pressed(page), ["Everything:false", "Use:false", "Develop:true"]);
    await go(page, "@");
    assert.equal(await remembered(page), "");
    await context.close();
  });
});

describe("filter", () => {
  test("top and side menus show the current space; previous and next stay inside it", async () => {
    const page = await open("use/settings");
    assert.deepEqual(await texts(page, "#topnav a"), ["Use"]);
    assert.deepEqual(await texts(page, "#lateral .lat-section > button"), ["Using Acme Orders"]);
    assert.equal(await page.locator('#lateral a[href="#/use/api-limits"]').count(), 0);
    // use/settings is the last use page: no "next" (the next page of the whole site is a develop page).
    assert.match(await text(page, ".pied-nav"), /Previous[\s\S]*Order details/);
    assert.equal(await page.locator(".pied-nav a.suivant").count(), 0);

    // "Everything" (an unknown page keeps it): nothing filtered, the title of each space above its sections.
    await go(page, "@");
    await go(page, "nowhere");
    assert.deepEqual(await texts(page, "#lateral .lat-espace"), [
      "Using the application",
      "Developing the application",
    ]);
    assert.deepEqual(await texts(page, "#lateral .lat-section > button"), [
      "Using Acme Orders",
      "Taking over Acme Orders",
    ]);
    assert.equal(await page.locator('#lateral a[href="#/use/api-limits"]').count(), 1);

    await go(page, "use/api-limits");
    assert.deepEqual(await texts(page, "#topnav a"), ["Use", "Take over"]);
    // "Use" leads to its first develop page: its overview belongs to the use space.
    assert.equal(await page.locator("#topnav a").first().getAttribute("href"), "#/use/api-limits");
    assert.equal(
      await page.locator('#lateral .lat-section[data-section="use"] a', { hasText: "Section overview" }).count(),
      0,
    );
    assert.equal(
      await page.locator('#lateral .lat-section[data-section="take-over"] a', { hasText: "Section overview" }).count(),
      1,
    );
    assert.equal(await page.locator(".pied-nav a").count(), 1);
    assert.match(await text(page, ".pied-nav a.suivant"), /Architecture of Acme Orders/);
    await page.context().close();
  });

  test("search: results of the current space first, then “In {space} (n)”; in everything mode, paths start with the space", async () => {
    const page = await open("use/settings");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("orders");
    await page.waitForTimeout(80);
    const heading = page.locator(".recherche-groupe");
    assert.equal(await heading.count(), 1);
    const n = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("#recherche-resultats > *"));
      const at = items.findIndex((x) => x.classList.contains("recherche-groupe"));
      return {
        before: items.slice(0, at).map((a) => a.getAttribute("href")),
        after: items.slice(at + 1).map((a) => a.getAttribute("href")),
      };
    });
    assert.ok(
      n.before.length > 0 && n.before.every((h) => /^#\/use\/(orders|settings)/.test(h)),
      JSON.stringify(n.before),
    );
    assert.ok(
      n.after.length > 0 && n.after.every((h) => /^#\/(take-over\/|use\/api-limits)/.test(h)),
      JSON.stringify(n.after),
    );
    assert.equal(await heading.textContent(), `In Develop (${n.after.length})`);
    // Keyboard selection skips the heading.
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator(".resultat.actif").count(), 1);
    await page.keyboard.press("Escape");

    await go(page, "@");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("orders");
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".recherche-groupe").count(), 0);
    for (const path_ of await texts(page, ".resultat .chemin")) assert.match(path_, /^(Use|Develop) › /);
    await page.context().close();
  });

  test("search: the scope chips — All, then each space; one of them keeps its results alone; none in an export", async () => {
    const page = await open("use/settings");
    await page.keyboard.press("Control+k");
    assert.equal(await page.getAttribute("#recherche-portee", "aria-label"), "Search in:");
    assert.deepEqual(
      (await texts(page, "#recherche-portee .portee")).map((x) => x.trim()),
      ["All", "Use", "Develop"],
    );
    assert.equal(await page.getAttribute('#recherche-portee [data-scope=""]', "aria-pressed"), "true");
    await page.keyboard.type("orders");
    await page.waitForSelector(".resultat");
    await page.click('#recherche-portee [data-scope="develop"]');
    assert.equal(await page.getAttribute('#recherche-portee [data-scope="develop"]', "aria-pressed"), "true");
    assert.equal(await page.getAttribute('#recherche-portee [data-scope=""]', "aria-pressed"), "false");
    const hrefs = await page.$$eval(".resultat", (els) => els.map((a) => a.getAttribute("href")));
    assert.ok(hrefs.length && hrefs.every((h) => /^#\/(take-over\/|use\/api-limits)/.test(h)), JSON.stringify(hrefs));
    assert.equal(await page.locator(".recherche-groupe").count(), 0, "one space: no heading");
    await page.click('#recherche-portee [data-scope=""]');
    assert.equal(
      await page.locator(".recherche-groupe").count(),
      1,
      "All again: the current space first, then Develop",
    );
    await page.context().close();
    const exported = await open("use/orders", { file: "use" });
    await exported.keyboard.press("Control+k");
    assert.equal(await exported.locator("#recherche-portee").isVisible(), false, "an export: one space, no chip");
    await exported.context().close();
  });

  test("search: a typo — its close words said first, their results shown and marked", async () => {
    const page = await open("use/orders");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("ordrs");
    await page.waitForSelector(".recherche-proche");
    assert.match(await text(page, ".recherche-proche"), /^No exact match: close words — .*\borders\b/);
    // Heard with the count, by a screen reader (role="status").
    assert.match(await text(page, "#recherche-statut"), /^No exact match: close words — .*\. \d+ results?/);
    assert.ok((await page.locator(".resultat").count()) > 0);
    assert.ok((await page.locator(".resultat mark").count()) > 0);
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator(".resultat.actif").count(), 1, "the note is no result");
    await page.context().close();
  });

  test("print everything: the current space only", async () => {
    const page = await open("use/orders");
    // Print media: the lazy screenshots of the printed pages are decoded before printing.
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => {
      window.confirm = () => true;
      window.print = () => (window.__printed = (window.__printed || 0) + 1);
    });
    await page.evaluate(() => document.getElementById("bouton-imprimer").click());
    await page.waitForFunction(() => window.__printed === 1);
    assert.equal(await page.locator("#impression .page-imprimee").count(), 4, "outline + the 3 use pages");
    assert.doesNotMatch(await text(page, "#impression"), /marker-takeover-9z/);
    await page.context().close();
  });
});

describe("page", () => {
  test("space badge, breadcrumb from the space, counterpart in both directions", async () => {
    const page = await open("use/orders");
    assert.equal((await text(page, ".page-meta .puce.espace")).trim(), "Use");
    assert.equal(await page.locator(".page-meta .puce").first().getAttribute("title"), "Using the application");
    assert.deepEqual(
      (await texts(page, ".ariane a, .ariane span:not(.sep)")).map((x) => x.trim()),
      ["Home", "Use", "Using Acme Orders", "Getting started"],
    );
    assert.equal(await page.locator(".ariane a").nth(1).getAttribute("href"), "#/@use");
    // The topic line: its title, the page read (its space, marked), the other page of its group.
    assert.equal(await page.getAttribute(".pendant", "aria-label"), "This topic for:");
    assert.equal((await text(page, ".pendant-titre")).trim(), "This topic for:");
    assert.equal((await text(page, '.pendant strong[aria-current="page"]')).trim(), "Use");
    const counterpart = page.locator(".pendant a");
    assert.equal((await counterpart.textContent()).trim(), "Develop");
    assert.equal(await counterpart.getAttribute("href"), "#/take-over/orders-api");
    await counterpart.click();
    await page.waitForTimeout(100);
    assert.equal(await text(page, "h1.page-titre"), "The orders API");
    assert.deepEqual(await pressed(page), ["Everything:false", "Use:false", "Develop:true"]);
    assert.equal((await text(page, '.pendant strong[aria-current="page"]')).trim(), "Develop");
    assert.equal((await text(page, ".pendant a")).trim(), "Use");
    await page.locator(".pendant a").click();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => location.hash), "#/use/orders~the-screen");
    const top = await page.evaluate(() => document.getElementById("the-screen").getBoundingClientRect().top);
    assert.ok(top >= 0 && top < 200, `anchor scrolled into view (${top})`);
    await page.context().close();
  });

  test("a topic group of three, declared once: in the order of the spaces, then of the site, the same on each page", async () => {
    const chipsOf = (page) =>
      page.$$eval(".pendant strong, .pendant a", (els) =>
        els.map((e) => [e.tagName, e.textContent.trim(), e.getAttribute("href")]),
      );
    const orders = await open("use/orders", { file: "grouped" });
    const settings = await orders.evaluate(() => document.querySelector(".pendant a").textContent.trim());
    assert.deepEqual(await chipsOf(orders), [
      ["STRONG", "Use · The orders list", null],
      ["A", settings, "#/use/settings"],
      ["A", "Develop", "#/take-over/orders-api"],
    ]);
    assert.match(settings, /^Use · /, "a title beside a space that holds two");
    await orders.context().close();
    const page = await open("use/settings", { file: "grouped" });
    assert.deepEqual(await chipsOf(page), [
      ["A", "Use · The orders list", "#/use/orders~the-screen"],
      ["STRONG", settings, null],
      ["A", "Develop", "#/take-over/orders-api"],
    ]);
    // Declared on the settings page alone: the orders API names it too.
    await page.locator(".pendant a").last().click();
    await page.waitForTimeout(100);
    assert.deepEqual(await page.$$eval(".pendant a", (els) => els.map((e) => e.getAttribute("href"))), [
      "#/use/orders~the-screen",
      "#/use/settings",
    ]);
    await page.context().close();
  });

  test('without spaces: "Related:", then the titles of the other pages', async () => {
    const page = await open("use/orders", { file: "plain" });
    assert.equal((await text(page, ".pendant-titre")).trim(), "Related:");
    assert.equal(await page.locator(".pendant strong").count(), 0);
    assert.deepEqual(
      await page.$$eval(".pendant a", (els) => els.map((e) => [e.textContent.trim(), e.getAttribute("href")])),
      [["The orders API", "#/take-over/orders-api"]],
    );
    await page.context().close();
  });
});

describe("home page", () => {
  test("everything: one door per space, then the home page and every journey", async () => {
    const page = await open("@");
    assert.deepEqual(await texts(page, ".portes .porte h2"), ["Using the application", "Developing the application"]);
    assert.deepEqual(await texts(page, ".portes .porte-pour"), [
      "Readers: Users, key users, support",
      "Readers: Developers, takeover team, security",
    ]);
    assert.deepEqual(await texts(page, ".portes .aller"), ["3 pages ›", "3 pages ›"], "pages of each space");
    assert.equal(await page.locator(".portes .porte").first().getAttribute("href"), "#/@use");
    assert.equal(await page.locator(".parcours .carte-lien").count(), 2);
    assert.match(await text(page, ".accueil-corps .contenu"), /Welcome/);
    // The journeys by audience, each under its space (the first one's space comes from its steps).
    assert.deepEqual(
      (await texts(page, ".parcours-public")).map((x) => x.trim()),
      ["Use", "Develop"],
    );
    assert.deepEqual(
      await page.$$eval(".parcours", (grids) =>
        grids.map((g) => [g.previousElementSibling?.className ?? "", g.querySelector(".titre").textContent]),
      ),
      [
        ["parcours-public", "Discover Acme Orders"],
        ["parcours-public", "Take over Acme Orders"],
      ],
    );
    await page.context().close();
    const develop = await open("@develop");
    assert.equal(
      await develop.locator(".parcours-public").count(),
      0,
      "a space current: its journeys alone, no heading",
    );
    await develop.context().close();
  });

  test("a space: strip “You are reading”, its sections, its journeys; the primary action stays inside the space", async () => {
    const page = await open("@use");
    assert.match(await text(page, ".espace-bandeau"), /You are reading: Using the application/);
    assert.equal(await page.locator(".espace-bandeau a").getAttribute("href"), "#/@");
    assert.deepEqual(await texts(page, ".portes .porte h2"), ["Using Acme Orders"]);
    assert.deepEqual(await texts(page, ".parcours .carte-lien .titre"), ["Discover Acme Orders"]);
    assert.equal(await page.locator(".heros .bouton.primaire").getAttribute("href"), "#/use");
    await go(page, "@develop");
    // "use" holds one develop page: shown, without its "featured" mark, which belongs to the use space.
    assert.deepEqual(await texts(page, ".portes .porte h2"), ["Using Acme Orders", "Taking over Acme Orders"]);
    assert.equal(await page.locator(".portes .porte .etiquette").count(), 0);
    assert.equal(await page.locator(".heros .bouton.primaire").getAttribute("href"), "#/take-over");
    assert.deepEqual(
      await texts(page, ".portes .aller"),
      ["1 page ›", "2 pages ›"],
      "pages of each section in the space",
    );
    await page.locator(".espace-bandeau a").click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".portes .porte").count(), 2);
    await page.context().close();
  });
});

describe("exports", () => {
  test("no selector: the space as a label; only its pages; hidden journey steps; replaced links", async () => {
    const page = await open("", { file: "use" });
    assert.equal(await page.locator(".espace-choix").count(), 0);
    assert.equal((await text(page, "#espaces .espace-unique")).trim(), "Use");
    assert.equal(await page.locator("#espaces").getAttribute("role"), null);
    assert.equal(await page.locator(".espace-bandeau").count(), 0, "nothing else to show");
    assert.deepEqual(await texts(page, "#topnav a"), ["Use"]);
    assert.match(await text(page, ".parcours"), /\+ 1 step in another part of the documentation/);
    assert.match(await text(page, ".accueil-corps .contenu"), /the architecture \(see the Develop documentation\)/);
    await go(page, "use/orders");
    assert.equal(await page.locator(".pendant").count(), 0, "the counterpart is in the other export");
    assert.equal(await page.locator(".lien-exclu").count(), 2);
    await go(page, "take-over/architecture");
    assert.equal(await text(page, "h1.page-titre"), "Page not found");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("architecture");
    await page.waitForTimeout(80);
    // Only the use page whose text names the architecture (its link replaced): no develop page.
    assert.deepEqual(
      await page.locator(".resultat").evaluateAll((rs) => rs.map((r) => r.getAttribute("href").split("~")[0])),
      ["#/use/orders"],
    );
    await page.context().close();

    const develop = await open("take-over/orders-api", { file: "develop" });
    assert.equal((await text(develop, "#espaces .espace-unique")).trim(), "Develop");
    assert.equal(await develop.locator(".pied-nav a").count(), 1);
    assert.match(await text(develop, ".contenu"), /the orders list \(see the Use documentation\)/);
    await develop.context().close();
  });
});

describe("accessibility", () => {
  // WCAG contrast of the text of an element over its effective background (ancestors composited).
  const contrastOf = (page, selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const parse = (c) => {
        const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c);
        if (srgb) return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]];
        const v = c.match(/[\d.]+/g).map(Number);
        return [v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]];
      };
      const background = (node) => {
        if (!node || node.nodeType !== 1) return [255, 255, 255];
        const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
        if (a >= 1) return [r, g, b];
        const under = background(node.parentElement);
        return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
      };
      const lum = ([r, g, b]) =>
        [r, g, b]
          .map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const [x, y] = [lum(parse(getComputedStyle(el).color).slice(0, 3)), lum(background(el))].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    }, selector);

  for (const colorScheme of ["light", "dark"]) {
    test(`contrasts ≥ 4.5 of the selector, the badge, the counterpart, the strip, the doors, the search headings (${colorScheme})`, async () => {
      const page = await open("use/orders", { colorScheme });
      const checks = {};
      for (const sel of [
        '#espaces .espace-choix[aria-pressed="true"]',
        '#espaces .espace-choix[aria-pressed="false"]',
        ".page-meta .puce.espace",
        ".pendant a",
        ".pendant strong",
        ".pendant-titre",
      ])
        checks[sel] = await contrastOf(page, sel);
      await page.keyboard.press("Control+k");
      await page.keyboard.type("orders");
      await page.waitForTimeout(80);
      checks[".recherche-groupe"] = await contrastOf(page, ".recherche-groupe");
      await page.keyboard.press("Escape");
      await go(page, "@use");
      for (const sel of [".espace-bandeau span", ".espace-bandeau a", ".espace-bandeau strong"])
        checks[sel] = await contrastOf(page, sel);
      await go(page, "@");
      checks[".porte-pour"] = await contrastOf(page, ".porte-pour");
      await page.context().close();
      const exported = await open("", { file: "use", colorScheme });
      checks[".espace-unique"] = await contrastOf(exported, ".espace-unique");
      await exported.context().close();
      for (const [sel, ratio] of Object.entries(checks))
        assert.ok(ratio >= 4.5, `${colorScheme} ${sel}: ${ratio && ratio.toFixed(2)}`);
    });
  }

  test("keyboard and ARIA: buttons with a name, reached with Tab, Enter selects; below 1080 px, the selector heads the side menu", async () => {
    const page = await open("use/orders");
    for (const b of await page.locator("#espaces .espace-choix").all()) {
      assert.equal(await b.evaluate((x) => x.tagName), "BUTTON");
      assert.ok((await b.textContent()).trim());
      assert.match(await b.getAttribute("aria-pressed"), /^(true|false)$/);
    }
    await page.locator("#espaces .espace-choix").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Develop");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => location.hash), "#/@develop");
    await page.context().close();

    const narrow = await open("use/orders", { width: 1000 });
    assert.equal(await narrow.locator("#espaces").isVisible(), false);
    const side = narrow.locator("#lateral .lat-espaces");
    assert.ok(await side.isVisible());
    assert.equal(await side.getAttribute("role"), "group");
    assert.equal(await side.getAttribute("aria-label"), "Spaces");
    assert.deepEqual(await pressed(narrow, "#lateral .espace-choix"), [
      "Everything:false",
      "Use:true",
      "Develop:false",
    ]);
    await narrow.locator("#lateral .espace-choix", { hasText: "Develop" }).click();
    await narrow.waitForTimeout(80);
    assert.equal(await narrow.evaluate(() => location.hash), "#/@develop");
    await narrow.context().close();
  });
});
