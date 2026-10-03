// Business space in the generated site (ARCHITECTURE.md §6.8), Playwright on the business test project: the
// glossary bubble shows the `technical` correspondence of a term only when the project has no spaces, or the
// current space is takeover or "everything"; an export other than takeover never has the data to show it at all.
// The home page never marks glossary terms (pre-existing behaviour, engine/site/app.js hydrate()), and viewing a
// page always makes its own space current, so "everything" is tested on a project without spaces at all (no space
// concept: `technical` always shows, regardless of which page is viewed).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildBusiness, businessCopy, tempDir } from "../tools/helpers.mjs";

let browser;
let dir;
let noSpacesDir;
const files = {};
let noSpacesFile;
const errors = [];

before(async () => {
  dir = tempDir("doc-kit-e2e-business-");
  const r = await buildBusiness();
  assert.deepEqual(r.errors, []);
  files.full = path.join(dir, "full.html");
  fs.writeFileSync(files.full, r.html);
  for (const s of r.sites) {
    files[s.space] = path.join(dir, `${s.space}.html`);
    fs.writeFileSync(files[s.space], s.html);
  }
  // A copy without "spaces" at all: the project-wide fallback of showing `technical` (no space concept).
  noSpacesDir = businessCopy((toc) => {
    delete toc.spaces;
    for (const sec of toc.sections) delete sec.space;
    return toc;
  });
  const rn = await buildBusiness({ root: noSpacesDir });
  assert.deepEqual(rn.errors, []);
  noSpacesFile = path.join(dir, "no-spaces.html");
  fs.writeFileSync(noSpacesFile, rn.html);
  files.noSpaces = noSpacesFile;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(noSpacesDir, { recursive: true, force: true });
  assert.deepEqual(errors, [], "page errors");
});

async function open(hash, file = "full") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(files[file]).href + "#/" + hash);
  await page.waitForTimeout(60);
  return page;
}

/** Hovers the first marked glossary term ("order"/"Order") and returns the bubble's HTML. */
async function bubbleHtml(page) {
  await page.locator(".gl").first().hover();
  await page.waitForTimeout(80);
  return page.locator("#bulle").innerHTML();
}

describe("glossary bubble: `technical` follows the current space", () => {
  test("no spaces declared: always shown (no space concept)", async () => {
    const page = await open("use/approval", "noSpaces");
    const html = await bubbleHtml(page);
    assert.match(html, /bulle-tech/);
    assert.match(html, /table `orders`, column `status`/);
    await page.context().close();
  });

  test("the business space (a page whose own space is business): hidden", async () => {
    const page = await open("use/approval");
    const html = await bubbleHtml(page);
    assert.doesNotMatch(html, /bulle-tech/);
    assert.doesNotMatch(html, /table `orders`/);
    await page.context().close();
  });

  test("the takeover space (a page whose own space is takeover): shown", async () => {
    const page = await open("take-over/notes");
    const html = await bubbleHtml(page);
    assert.match(html, /bulle-tech/);
    assert.match(html, /table `orders`, column `status`/);
    await page.context().close();
  });

  test('export "business": the data itself drops `tech` (§6.1a, §6.8), so the bubble never shows it', async () => {
    const page = await open("use/approval", "business");
    const html = await bubbleHtml(page);
    assert.doesNotMatch(html, /bulle-tech/);
    await page.context().close();
  });

  test('export "takeover": `tech` is kept, and the export is always current, so the bubble shows it', async () => {
    const page = await open("take-over/notes", "takeover");
    const html = await bubbleHtml(page);
    assert.match(html, /bulle-tech/);
    assert.match(html, /table `orders`, column `status`/);
    await page.context().close();
  });
});
