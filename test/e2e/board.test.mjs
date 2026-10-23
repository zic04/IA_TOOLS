// The Product board in the generated site (ARCHITECTURE.md §6.8b, engine/site/lib/board.js), Playwright on the demo:
// the map on a wide screen and the list on a narrow one, the view remembered (and only a view), an epic and a feature
// folded, the filters and their count (the toolbar never drawn again), the arrow keys from card to card, a card
// opening its sheet, a linked ticket (never a link in a link), the print view, hostile data shown as text; in a page
// (::board{}), no glossary mark inside it, and drawn when the whole documentation is printed; no page error, no CSP
// violation.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildDemo, buildBusiness, businessCopy, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";

let browser;
let dir;
const files = {};
const errors = [];
const AZURE = "https://dev.azure.com/acme/orders/_workitems/edit/{id}";
/** A text that would be markup, or a script, were it not escaped. */
const EVIL = '"><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';

/** A built site with its data changed by `change` (the board, D.board). */
function rewritten(html, change) {
  const data = dataOf(html);
  change(data.board);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return html.replace(
    /(<script type="application\/json" id="site-data">)[\s\S]*?(<\/script>)/,
    (m, a, z) => a + json + z,
  );
}

/** A hostile board: every text and key of it a would-be element or script. */
function hostile(b) {
  const [f, e] = [b.features[0], b.epics[0]];
  const s = b.stories.find((x) => x.id === f.stories[0]);
  const was = f.id;
  Object.assign(f, { id: EVIL, title: EVIL, summary: EVIL, page: EVIL, since: EVIL, roles: [EVIL], kinds: [EVIL] });
  f.ticket = { text: EVIL, url: "javascript:window.__pwned=1" };
  for (const x of b.epics) x.features = x.features.map((id) => (id === was ? EVIL : id));
  Object.assign(e, { id: EVIL, title: EVIL, summary: EVIL, ticket: { text: EVIL, url: EVIL } });
  Object.assign(s, { id: EVIL, title: EVIL, role: EVIL, page: EVIL, anchor: EVIL, since: EVIL });
  f.stories[0] = EVIL;
  b.versions = [...b.versions, EVIL];
  b.kinds[EVIL] = { title: EVIL, icon: EVIL };
}

before(async () => {
  dir = tempDir("doc-kit-e2e-board-");
  const write = (name, html) => {
    files[name] = path.join(dir, `${name}.html`);
    fs.writeFileSync(files[name], html);
  };
  const r = await buildDemo();
  assert.deepEqual(r.errors, []);
  write("demo", r.html);
  write("hostile", rewritten(r.html, hostile));
  // F-02 without a story: nothing for its row to fold.
  write(
    "bare",
    rewritten(r.html, (b) => {
      b.features[1].stories = [];
    }),
  );
  // ::board{} at the top of a page with glossary terms, in a project without spaces.
  const business = businessCopy();
  try {
    const md = path.join(business, "content", "use", "rules.md");
    const lines = fs.readFileSync(md, "utf8").split("\n");
    lines.splice(lines.findIndex((l) => l.startsWith("# ")) + 1, 0, "", "::board{}", "");
    fs.writeFileSync(md, lines.join("\n"));
    const page = await buildBusiness({ root: business });
    assert.deepEqual(page.errors, []);
    write("page", page.html);
  } finally {
    fs.rmSync(business, { recursive: true, force: true });
  }
  // Tickets the kit links: an epic's and a feature's, with the address of Azure DevOps.
  const copy = demoCopy();
  try {
    const tocFile = path.join(copy, "content", "toc.json");
    const toc = JSON.parse(fs.readFileSync(tocFile, "utf8"));
    const groups = toc.sections.flatMap((x) => x.groups);
    groups.find((g) => g.epic === "E-01").ref = "ADO#120";
    groups.flatMap((g) => g.pages).find((p) => p.id === "features/track-orders").ref = "ADO#121";
    fs.writeFileSync(tocFile, JSON.stringify(toc));
    const linked = await buildDemo({
      root: copy,
      modify: (c) => ({ ...c, backlog: { ...c.backlog, refs: { azure: AZURE } } }),
    });
    assert.deepEqual(linked.errors, []);
    write("linked", linked.html);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors and CSP violations");
});

/** A page of a site (the demo by default) at `hash`, in a context of its own (its own storage) unless one is given. */
async function open(hash, { width = 1440, context, site = "demo" } = {}) {
  // The demo is bilingual (ARCHITECTURE.md §6.12) and its site follows the browser's language: English here,
  // whatever the machine's.
  const ctx = context ?? (await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US" }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && errors.push(m.text()));
  await page.goto(pathToFileURL(files[site]).href + "#/" + hash);
  await page.waitForSelector("[data-board] .tb-tete");
  return { page, ctx };
}

describe("the Product board", () => {
  test("the home of the Product space: the map, its epics, cards and stories; the list remembered", async () => {
    const { page, ctx } = await open("@product");
    assert.equal(await page.getAttribute('[data-view="map"]', "aria-pressed"), "true");
    assert.deepEqual(await page.locator(".tb-epic h3").allTextContents(), ["Find an order", "Approve an order"]);
    assert.equal(await page.locator("[data-card]").count(), 2);
    assert.ok((await page.locator(".tb-recit").count()) >= 4);
    assert.match(await page.locator(".tb-resultat").textContent(), /2 features shown/);
    await page.click('[data-view="list"]');
    assert.equal(await page.getAttribute('[data-view="list"]', "aria-pressed"), "true");
    assert.equal(await page.locator(".tb-niveau-epic").count(), 2);
    const second = await open("@product", { context: ctx });
    assert.equal(await second.page.getAttribute('[data-view="list"]', "aria-pressed"), "true", "the view remembered");
    await ctx.close();
  });

  test("the list: an epic folds its features and stories, its button says so", async () => {
    const { page, ctx } = await open("@product", { width: 600 });
    assert.equal(await page.getAttribute('[data-view="list"]', "aria-pressed"), "true", "a narrow screen: the list");
    const rows = page.locator('tr[data-parent~="E-01"]');
    const before = await rows.count();
    assert.ok(before >= 2);
    await page.click('[data-toggle="E-01"]');
    assert.equal(await page.getAttribute('[data-toggle="E-01"]', "aria-expanded"), "false");
    assert.equal(await page.locator('tr[data-parent~="E-01"]:not([hidden])').count(), 0);
    await page.click('[data-toggle="E-01"]');
    assert.equal(await page.locator('tr[data-parent~="E-01"]:not([hidden])').count(), before);
    await ctx.close();
  });

  test("the list: a feature folded stays folded inside its epic folded and opened again, and as the filters change", async () => {
    const { page, ctx } = await open("@product", { width: 600 });
    const stories = 'tr[data-parent="E-01 F-01"]';
    const n = await page.locator(stories).count();
    assert.ok(n >= 1);
    await page.click('[data-toggle="F-01"]');
    assert.equal(await page.getAttribute('[data-toggle="F-01"]', "aria-expanded"), "false");
    assert.equal(await page.locator(`${stories}:not([hidden])`).count(), 0);
    await page.click('[data-toggle="E-01"]');
    assert.equal(await page.locator('tr[data-parent~="E-01"]:not([hidden])').count(), 0);
    await page.click('[data-toggle="E-01"]');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.toggle), "E-01", "the focus kept");
    assert.equal(await page.locator('tr.tb-niveau-fonction[data-parent="E-01"]:not([hidden])').count(), 1);
    assert.equal(await page.locator(`${stories}:not([hidden])`).count(), 0, "F-01 still folded");
    await page.fill('[data-filter="q"]', "Track");
    assert.equal(await page.getAttribute('[data-toggle="F-01"]', "aria-expanded"), "false", "kept as a filter changes");
    assert.equal(await page.locator(`${stories}:not([hidden])`).count(), 0);
    await page.click('[data-toggle="F-01"]');
    assert.equal(await page.locator(`${stories}:not([hidden])`).count(), n);
    await ctx.close();
  });

  test("the toolbar is drawn once: the search box keeps its focus and caret, the count is the same node", async () => {
    const { page, ctx } = await open("@product");
    const input = await page.$('[data-filter="q"]');
    const status = await page.$(".tb-resultat");
    const epic = await page.$('[data-filter="epic"]');
    await input.focus();
    await page.keyboard.type("Trck");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("a");
    assert.deepEqual(
      await input.evaluate((el) => [el.isConnected, document.activeElement === el, el.value, el.selectionStart]),
      [true, true, "Track", 3],
    );
    assert.match(await status.textContent(), /1 feature shown/);
    await page.selectOption('[data-filter="epic"]', "E-02");
    await page.click('[data-view="list"]');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.view), "list");
    for (const node of [input, status, epic]) assert.equal(await node.evaluate((el) => el.isConnected), true);
    assert.equal(await page.locator(".tb-aucun").count(), 1);
    assert.match(await status.textContent(), /0 features shown/);
    await ctx.close();
  });

  test("a view remembered is read only when it is one: anything else gives the default", async () => {
    const { page, ctx } = await open("@product");
    await page.click('[data-view="list"]');
    const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.endsWith(".board")));
    assert.ok(key);
    await page.evaluate((k) => localStorage.setItem(k, "bogus"), key);
    const second = await open("@product", { context: ctx });
    assert.equal(await second.page.getAttribute('[data-view="map"]', "aria-pressed"), "true");
    assert.equal(await second.page.locator("[data-card]").count(), 2);
    await ctx.close();
  });

  test("printed: the list, every level open; the map again after", async () => {
    const { page, ctx } = await open("@product");
    await page.click('[data-view="list"]');
    await page.click('[data-toggle="E-01"]');
    await page.click('[data-view="map"]');
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    assert.equal(await page.locator("[data-board] .tb-liste").count(), 1);
    assert.equal(await page.locator("[data-board] tr[hidden]").count(), 0);
    assert.equal(await page.getAttribute('[data-view="map"]', "aria-pressed"), "true", "the view chosen kept");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    assert.equal(await page.locator("[data-board] .tb-liste").count(), 0);
    assert.equal(await page.locator("[data-card]").count(), 2);
    await ctx.close();
  });

  test("the filters: by epic, by text (a story's id); the count follows; nothing matches says so", async () => {
    const { page, ctx } = await open("@product");
    await page.selectOption('[data-filter="epic"]', "E-02");
    assert.deepEqual(await page.locator("[data-card]").allTextContents(), ["Approve an order"]);
    assert.match(await page.locator(".tb-resultat").textContent(), /1 feature shown/);
    await page.selectOption('[data-filter="epic"]', "");
    await page.fill('[data-filter="q"]', "US-03");
    assert.deepEqual(await page.locator("[data-card]").allTextContents(), ["Track orders"]);
    await page.fill('[data-filter="q"]', "nothing like this");
    assert.equal(await page.locator(".tb-aucun").count(), 1);
    await ctx.close();
  });

  test("the arrow keys go from card to card; a card opens its sheet", async () => {
    const { page, ctx } = await open("@product");
    await page.locator("[data-card]").first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(() => document.activeElement?.closest(".tb-carte")?.querySelector(".tb-id")?.textContent),
      "F-02",
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.hash.includes("features/approve-order"));
    await page.waitForSelector(".page-titre");
    assert.match(await page.locator(".page-titre").first().textContent(), /Approve an order/);
    await ctx.close();
  });

  test("a linked ticket: a link of its own, above the card's; never a link in a link; the card opens its sheet", async () => {
    const { page, ctx } = await open("@product", { site: "linked" });
    assert.equal(await page.locator("a a").count(), 0);
    const ticket = page.locator(".tb-carte a.tb-ticket");
    assert.equal(await ticket.count(), 1);
    assert.equal(await ticket.textContent(), "ADO#121");
    assert.equal(await ticket.getAttribute("href"), AZURE.replace("{id}", "121"));
    assert.equal(await ticket.getAttribute("rel"), "noopener noreferrer");
    assert.equal(await page.locator(".tb-epic a.tb-ticket").getAttribute("href"), AZURE.replace("{id}", "120"));
    // The point at the ticket's centre is the ticket, not the card's link stretched below it.
    await ticket.scrollIntoViewIfNeeded();
    const onTop = await ticket.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || hit?.outerHTML.slice(0, 80);
    });
    assert.equal(onTop, true);
    // Anywhere else on the card: its sheet.
    const box = await page.locator(".tb-carte .tb-compte").first().boundingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    await page.waitForFunction(() => location.hash.includes("features/track-orders"));
    await ctx.close();
  });

  test("hostile data: every text and key shown as text, no element, no script, no javascript: link", async () => {
    const { page, ctx } = await open("@product", { site: "hostile" });
    const clean = async (where) => {
      assert.equal(await page.locator("[data-board] img, [data-board] script").count(), 0, where);
      assert.equal(await page.locator('[data-board] a[href^="javascript:"]').count(), 0, where);
      assert.equal(await page.evaluate(() => window.__pwned), undefined, where);
    };
    assert.ok((await page.locator("[data-board]").textContent()).includes("<img src=x"));
    await clean("the map");
    await page.click('[data-view="list"]');
    await clean("the list");
    await page.locator("[data-toggle]").first().click();
    assert.equal(await page.locator("[data-toggle]").first().getAttribute("aria-expanded"), "false");
    await page.selectOption('[data-filter="epic"]', { index: 1 });
    await page.selectOption('[data-filter="who"]', { index: 1 });
    await page.selectOption('[data-filter="version"]', { index: 1 });
    await clean("filtered");
    await ctx.close();
  });

  test("the list: a feature without a story has no fold button to see or reach", async () => {
    const { page, ctx } = await open("@product", { width: 600, site: "bare" });
    assert.equal(await page.locator('[data-toggle="F-02"]').count(), 1);
    assert.equal(await page.locator('[data-toggle="F-02"]').isVisible(), false);
    assert.equal(await page.locator('[data-toggle="F-01"]').isVisible(), true);
    await ctx.close();
  });

  test("in a page: the glossary marks the page's text, never the board's", async () => {
    const { page, ctx } = await open("use/rules", { site: "page" });
    assert.equal(await page.locator("[data-board] .gl").count(), 0);
    assert.equal(await page.locator('.contenu .gl[data-term="Manager"]').count(), 1, "the term marked in the page");
    await ctx.close();
  });

  test("in a page: printing the whole documentation draws its board, then its list", async () => {
    const { page, ctx } = await open("use/rules", { site: "page" });
    await page.evaluate(() => {
      window.confirm = () => true;
      window.print = () => (window.__printed = (window.__printed || 0) + 1);
    });
    await page.evaluate(() => document.getElementById("bouton-imprimer").click());
    await page.waitForFunction(() => window.__printed === 1);
    assert.equal(await page.locator("#impression [data-board] .tb-tete").count(), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    assert.equal(await page.locator("#impression [data-board] .tb-liste").count(), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await ctx.close();
  });
});
