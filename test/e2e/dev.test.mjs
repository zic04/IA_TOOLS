// `doc-kit dev`: the page reloads after a change (same route), a build error shows in an overlay of the page
// (and disappears once fixed), the command stops cleanly.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startDevServer, injectClient, STATE_PATH } from "../../engine/dev/server.mjs";
import { reloadConfig } from "../../engine/dev/environment.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy } from "../tools/helpers.mjs";

let browser;
const errors = [];
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  assert.deepEqual(errors, [], "page errors");
});

const texts = { language: "en", title: "Build error", hint: "Fix and save.", close: "Close", waiting: "No build yet." };
const state = async (url) => (await fetch(new URL(STATE_PATH, url))).json();
async function waitFor(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("dev server", () => {
  test("live reload on a change, error overlay, recovery", async () => {
    const dir = demoCopy();
    const server = await startDevServer({
      root: dir,
      loadConfig: () => reloadConfig(dir, {}),
      describe: (p) => ({ what: `${p.key} ${p.vars?.file || ""}`.trim(), help: "help text" }),
      describeError: (e) => ({ what: e.message, help: "" }),
      texts,
      debounce: 60,
    });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      assert.equal((await state(server.url)).id, 1);
      await page.goto(server.url + "#/use/orders");
      assert.equal(await page.locator("h1.page-titre").textContent(), "The orders list");
      assert.equal(await page.locator("#doc-kit-dev").count(), 1, "client injected");

      // A content change: rebuilt, the page reloads on the same route.
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), "\nA sentence added while the server runs.\n");
      await page.waitForFunction(
        () => document.body.textContent.includes("A sentence added while the server runs."),
        null,
        { timeout: 8000 },
      );
      assert.equal(await page.evaluate(() => location.hash), "#/use/orders");
      assert.equal((await state(server.url)).id, 2);

      // A build error (invalid table of contents): overlay, the last good build stays on screen.
      const toc = path.join(dir, "content", "toc.json");
      const good = fs.readFileSync(toc, "utf8");
      fs.writeFileSync(toc, "{ broken");
      const overlay = page.locator("#doc-kit-dev-overlay");
      await overlay.waitFor({ timeout: 8000 });
      assert.match(await overlay.textContent(), /✖ Build error/);
      assert.match(await overlay.textContent(), /json\.invalid content\/toc\.json/);
      assert.match(await overlay.textContent(), /→ help text/);
      assert.equal(await page.locator("h1.page-titre").textContent(), "The orders list");
      assert.equal((await state(server.url)).errors.length, 1);

      // Fixed: the overlay disappears with the reload.
      fs.writeFileSync(toc, good.replace("Acme Orders documentation", "Acme Orders handbook"));
      await waitFor(async () => (await state(server.url)).id === 3);
      await page.waitForFunction(
        () => !document.getElementById("doc-kit-dev-overlay") && document.title.includes("handbook"),
        null,
        { timeout: 8000 },
      );

      // The configuration is watched too.
      const config = path.join(dir, "doc.config.mjs");
      fs.writeFileSync(
        config,
        fs.readFileSync(config, "utf8").replace('"Explore the architecture"', '"Start with the architecture"'),
      );
      await page.goto(server.url);
      await page.waitForFunction(() => document.body.textContent.includes("Start with the architecture"), null, {
        timeout: 8000,
      });
    } finally {
      await page.close();
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("first build failing: placeholder page with the overlay; client injected before </body>", async () => {
    const dir = demoCopy();
    fs.writeFileSync(path.join(dir, "content", "toc.json"), "[");
    const server = await startDevServer({
      root: dir,
      loadConfig: () => reloadConfig(dir, {}),
      describe: (p) => ({ what: p.key }),
      describeError: (e) => ({ what: e.message }),
      texts,
      debounce: 60,
    });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(server.url);
      assert.match(await page.locator("#doc-kit-dev-overlay").textContent(), /json\.invalid/);
      await page.click("#doc-kit-dev-overlay button");
      assert.equal(await page.locator("#doc-kit-dev-overlay").count(), 0, "closed by hand");
      assert.equal(injectClient("<body>x</body>", { id: 1 }).indexOf("<script"), "<body>x".length);
      assert.doesNotMatch(injectClient("<body></body>", { texts: { title: "</script><b>" } }), /<\/script><b>/);
    } finally {
      await page.close();
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the command: serves, reports, stops cleanly (signal = Ctrl+C)", async () => {
    const dir = demoCopy();
    const controller = new AbortController();
    let out = "";
    const running = runCli(["dev", "--project", dir, "--port", "0"], {
      stdout: { write: (s) => (out += s) },
      stderr: { write: () => {} },
      env: { DOC_KIT_NO_OPEN: "1" },
      signal: controller.signal,
    });
    try {
      const url = await waitFor(() => /Site: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out)?.[1]);
      // 2 warnings: the two spaces' own (ARCHITECTURE.md §6.1a, a link to the other space replaced by its text).
      assert.match(out, /✔ built in \d+\.\d s — 11 pages · 2 screenshots · 2 warnings \(draft\)/);
      assert.match(out, /watching content\/, images\/, diagrams\/, theme\/, doc\.config\.mjs/);
      const html = await (await fetch(url)).text();
      assert.match(html, /<script id="doc-kit-dev">/);
      controller.abort();
      assert.equal(await running, 0);
      assert.match(out, /Stopped\.\n$/);
      await assert.rejects(fetch(url), "the server is closed");
    } finally {
      controller.abort();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
