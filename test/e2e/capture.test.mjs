// End-to-end capture flow against the fictional demo app (examples/demo-app), headless only — no visible window:
// sign-in through the fake login page and session saving (manual, nextauth, api-me), capture of the demo plans into
// a temporary copy (WebP + zone files with version and date, previews), read-only blocking of a POST, forbidden
// routes (refused before opening; a background prefetch aborted and counted while the capture goes on; a click
// that navigates to one stops the capture; control run without the guard), expired session, masking in the page,
// demo setup, and the checks on the captured project.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { runCli } from "../../cli/doc-kit.mjs";
import { serve } from "../../examples/demo-app/serve.mjs";
import { connect, loadAdapter } from "../../engine/capture/session.mjs";
import { maskPage, maskSource, DOTS } from "../../engine/capture/masking.mjs";
import { webpSize } from "../../engine/capture/webp.mjs";
import { registerSelectors, zoneBox } from "../../engine/capture/actions.mjs";
import { DEMO, KIT_ROOT, demoCopy, tempDir } from "../tools/helpers.mjs";

const PLANS = path.join(KIT_ROOT, "examples", "demo-docs", "captures", "plans");
let app;
let dir;
let work;

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env: { ...env } });
  return { code, out, err };
}

/** Signs in through the fake login page of the demo app (what a person does in the visible window). */
async function signIn(page) {
  await page.waitForURL(/\/login/);
  await page.fill("#email", "robin@example.org");
  await page.fill("#password", "demo");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/orders$/);
}

before(async () => {
  app = await serve({ port: 0 });
  work = tempDir("doc-kit-e2e-capture-");
  dir = demoCopy();
  // The demo's own plans import "doc-kit/targets", which only resolves inside the kit: they are read from there.
  fs.rmSync(path.join(dir, "captures", "plans"), { recursive: true, force: true });
  const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
  const config = {
    ...raw,
    app: { url: app.url },
    auth: { adapter: "manual", loginPattern: "^/login" },
    capture: { plans: PLANS, setup: "captures/setup.mjs", forbidden: ["^/orders/\\d+/approval$"] },
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
});

after(async () => {
  await app?.close();
  for (const d of [dir, work]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

describe("sign-in and session", () => {
  test("manual: Enter pressed too early → “not yet”; then signed in → session saved, .doc-kit ignored by git", async () => {
    const auth = await loadAdapter("auth", { adapter: "manual", loginPattern: "^/login" }, dir, "auth");
    const file = path.join(dir, ".doc-kit", "session.json");
    const events = [];
    let calls = 0;
    const s = await connect({
      url: app.url,
      auth,
      file,
      headless: true,
      poll: 100,
      onStatus: (e) => events.push(e),
      waitForUser: async (page) => {
        if (calls++ === 0) return; // "Enter" before signing in
        await signIn(page);
      },
    });
    assert.deepEqual(events, ["notYet"]);
    assert.equal(s.file, file);
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(state.cookies.some((c) => c.name === "acme_session" && c.httpOnly));
    assert.equal(fs.readFileSync(path.join(dir, ".doc-kit", ".gitignore"), "utf8"), "*\n");
  });

  test("nextauth and api-me detect the session by themselves (who, expiry)", async () => {
    for (const spec of [{ adapter: "nextauth" }, { adapter: "api-me", proof: "id" }]) {
      const auth = await loadAdapter("auth", spec, dir, "auth");
      const file = path.join(work, `${spec.adapter}.json`);
      const s = await connect({
        url: app.url,
        auth,
        file,
        headless: true,
        poll: 100,
        waitForUser: async (page) => {
          await signIn(page);
          return new Promise(() => {}); // never presses Enter: the adapter must detect the session
        },
      });
      assert.equal(s.who, "Robin Demo", spec.adapter);
      if (spec.adapter === "nextauth") {
        assert.equal(s.details, "admin");
        assert.match(s.expires, /^\d{4}-\d{2}-\d{2}T/);
      }
      assert.ok(fs.existsSync(file));
    }
  });
});

describe("capture", () => {
  test("demo plans: session checked, read-only blocks the heartbeat POST, WebP + zone files, previews", async () => {
    const r = await cli(["capture", "--project", dir, "--preview"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /^2 captures · http:\/\/127\.0\.0\.1:\d+ · session: .*session\.json · read-only: on\n/);
    assert.match(r.out, /✔ orders-list \(3 zones, \d+ KB, [\d.]+ s\)\n✔ settings-profile \(2 zones, \d+ KB, [\d.]+ s\)\n/);
    assert.match(r.out, /2\/2 captures taken\.\n/);
    assert.match(r.out, /Read-only: 1 write request blocked — POST \/api\/presence\n$/);
    assert.ok(!app.state.writes.includes("POST /api/presence"), "the heartbeat never reached the server");

    const today = new Date().toISOString().slice(0, 10);
    for (const [id, n] of [["orders-list", 3], ["settings-profile", 2]]) {
      const z = JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", `${id}.json`), "utf8"));
      assert.equal(z.file, `${id}.webp`);
      assert.equal(z.version, "1.4.0");
      assert.ok(z.captured === today || z.captured <= today);
      assert.equal(z.zones.length, n);
      for (const zone of z.zones) for (const k of ["x", "y", "w", "h"]) assert.ok(zone[k] >= -1 && zone[k] <= 101, `${id} ${k}=${zone[k]}`);
      const size = webpSize(fs.readFileSync(path.join(dir, "images", `${id}.webp`)));
      assert.deepEqual(size, { width: z.width, height: z.height });
      assert.ok(fs.statSync(path.join(dir, ".doc-kit", `${id}.zones.png`)).size > 1000);
    }
    const orders = JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", "orders-list.json"), "utf8"));
    assert.deepEqual(orders.zones.map((z) => z.label), ["Filters", "Order summary", "New order"]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", "settings-profile.json"), "utf8")).zones[1].side, "right");
  });

  test("the captured project builds and passes every check", async () => {
    const r = await cli(["check", "all", "--project", dir]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /2 images checked \(2 cited\) — 0 errors, 0 warnings\./);
    assert.match(r.out, /✔ No secret found/);
    assert.match(r.out, /Coverage: skipped/);
  });

  test("forbidden routes: refused before opening; a prefetch is aborted and counted, the capture goes on; a click towards one stops it; the server never renders it", async () => {
    const plans = path.join(work, "plans-forbidden");
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(
      path.join(plans, "detail.mjs"),
      `export const CAPTURES = [
        { id: "x-approval", route: "/orders/1042/approval", delay: 100 },
        { id: "y-detail", route: "/orders/1042", delay: 300, actions: [{ click: { text: "Approval chain" } }] },
        { id: "z-detail", route: "/orders/1042", delay: 500, zones: [{ text: "Approval chain", caption: "Approval" }] },
      ];`
    );
    let r = await cli(["capture", "--project", dir, "--plans", plans]);
    assert.equal(r.code, 1);
    assert.match(r.err, /✖ x-approval: the route \/orders\/1042\/approval is forbidden \(capture\.forbidden: \^\/orders\/\\d\+\/approval\$\)/);
    assert.doesNotMatch(r.out, /captures? ·/, "nothing was opened");

    // The order page prefetches its approval chain (a fetch in the background): aborted, counted, not a failure.
    r = await cli(["capture", "z-*", "--project", dir, "--plans", plans]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ z-detail \(1 zone, \d+ KB, [\d.]+ s\)\n/);
    assert.match(r.out, /\n1 prefetch request to forbidden routes aborted — GET \/orders\/1042\/approval\nRead-only: /);
    assert.doesNotMatch(r.err, /forbidden route/);
    assert.ok(fs.existsSync(path.join(dir, "images", "z-detail.webp")));
    const json = JSON.parse((await cli(["capture", "z-*", "--project", dir, "--plans", plans, "--json"])).out);
    assert.deepEqual([json.ok.length, json.prefetched, json.prefetchedRequests, json.refused], [1, 1, ["GET /orders/1042/approval"], []]);

    // A click on the link navigates the page to the forbidden route: aborted, and the capture stops.
    r = await cli(["capture", "y-*", "--project", dir, "--plans", plans]);
    assert.equal(r.code, 1);
    assert.match(r.err, /✖ y-detail: the page requested a forbidden route \(\/orders\/1042\/approval\): capture stopped/);
    assert.match(r.err, /✖ forbidden route: 1 request refused — GET \/orders\/1042\/approval/);
    assert.match(r.out, /0\/1 capture taken\. Failed: y-detail/);
    assert.match(r.out, /1 prefetch request to forbidden routes aborted/);
    assert.ok(!app.state.writes.some((w) => w.startsWith("approval chain")), "no approval chain created");
    assert.ok(!fs.existsSync(path.join(dir, "images", "y-detail.webp")));
  });

  test("control: without capture.forbidden, the same prefetch reaches the server, which renders the page and writes", async () => {
    // Proves that the demo's prefetch is real, so that the test above proves the guard.
    // Another copy of the project (a configuration module is imported once per process).
    const open = demoCopy();
    try {
      fs.rmSync(path.join(open, "captures", "plans"), { recursive: true, force: true });
      const plans = path.join(open, "captures", "plans");
      fs.mkdirSync(plans, { recursive: true });
      fs.writeFileSync(path.join(plans, "a.mjs"), 'export const CAPTURES = [{ id: "w-detail", route: "/orders/1043", delay: 500 }];');
      const config = JSON.parse(fs.readFileSync(path.join(dir, "doc.config.mjs"), "utf8").replace(/^export default |;\s*$/g, ""));
      config.capture = { ...config.capture, plans: "captures/plans", forbidden: [] };
      fs.writeFileSync(path.join(open, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
      fs.mkdirSync(path.join(open, ".doc-kit"), { recursive: true });
      fs.copyFileSync(path.join(dir, ".doc-kit", "session.json"), path.join(open, ".doc-kit", "session.json"));
      const r = await cli(["capture", "--project", open]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.doesNotMatch(r.out, /prefetch/);
      assert.ok(app.state.writes.includes("approval chain created for order 1043"), app.state.writes.join(", "));
    } finally {
      fs.rmSync(open, { recursive: true, force: true });
      app.state.writes.length = 0;
    }
  });

  test("expired session → exit code 3 before the first capture, with what to do", async () => {
    const stale = path.join(work, "stale.json");
    const state = JSON.parse(fs.readFileSync(path.join(dir, ".doc-kit", "session.json"), "utf8"));
    for (const c of state.cookies) if (c.name === "acme_session") c.value = "0000";
    fs.writeFileSync(stale, JSON.stringify(state));
    const r = await cli(["capture", "orders-list", "--project", dir], { DOC_KIT_SESSION: stale });
    assert.equal(r.code, 3);
    assert.match(r.err, /^✖ the session has expired \(sign-in page: http:\/\/127\.0\.0\.1:\d+\/login\?next=%2Forders\)\n {2}→ run doc-kit connect, then capture again\n$/);
  });

  test("demo: runs capture.setup, which resets the demo app's data", async () => {
    app.state.data.orders.length = 0;
    const r = await cli(["demo", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /demo data reset on http:\/\/127\.0\.0\.1:\d+\n✔ Demo data ready \(captures\/setup\.mjs\)\./);
    assert.equal(app.state.data.orders.length, 6);
  });

  test("a sign-out during the run stops it: exit code 3, what was taken is kept", async () => {
    const plans = path.join(work, "plans-logout");
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(
      path.join(plans, "a.mjs"),
      'export const CAPTURES = [{ id: "a-orders", route: "/orders", delay: 200 }, { id: "b-logout", route: "/logout", delay: 200 }, { id: "c-settings", route: "/settings", delay: 200 }];'
    );
    const r = await cli(["capture", "--project", dir, "--plans", plans]);
    assert.equal(r.code, 3, r.out + r.err);
    assert.match(r.out, /✔ a-orders \(0 zones/);
    assert.match(r.out, /1\/3 captures taken\./);
    assert.match(r.err, /✖ the session expired during the run, at “b-logout” \(sign-in page: .*\/login\)\n {2}→ run doc-kit connect/);
    assert.ok(fs.existsSync(path.join(dir, "images", "a-orders.webp")));
    assert.ok(!fs.existsSync(path.join(dir, "images", "c-settings.webp")));
  });
});

describe("in the page", () => {
  let browser;
  before(async () => {
    await registerSelectors();
    browser = await chromium.launch();
  });
  after(() => browser?.close());

  test("masking: .env values, GUIDs, patterns, field values, attributes, then the masks targets", async () => {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <p id="a">API: https://orders.internal.example/api/v1 (tenant 7D3C5A1E-9B2F-4C6D-8E1A-2F3B4C5D6E7F)</p>
      <input id="b" value="acct-0042" title="https://orders.internal.example/api">
      <span class="secret">Robin's personal note</span><button class="secret">Keep me</button></main>`);
    const n = await maskPage(page, { source: maskSource(["https://orders.internal.example/api"], { guid: true, patterns: ["acct-\\d+"] }), masks: [{ css: ".secret" }] });
    assert.equal(n, 4);
    assert.equal(await page.textContent("#a"), `API: ${DOTS}/v1 (tenant ${DOTS})`);
    assert.equal(await page.inputValue("#b"), DOTS);
    assert.equal(await page.getAttribute("#b", "title"), DOTS);
    assert.equal(await page.textContent("span.secret"), DOTS);
    assert.equal(await page.textContent("button.secret"), DOTS);
    // A mask target that finds nothing stops the capture: what it should hide would be shown otherwise.
    await assert.rejects(maskPage(page, { source: maskSource([], { guid: false, patterns: [] }), masks: [{ css: ".gone" }] }), (e) => e.key === "maskMissing" && /\.gone/.test(e.vars.target));
    // The second pass (just before the shot) tolerates a target already turned into dots.
    await maskPage(page, { source: null, masks: [{ text: "Robin's personal note" }, { css: ".gone" }], required: false });
    await page.close();
  });

  test("targets: field, union, framed (border or capture.selectors.frame), up, within, has", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<style>body{margin:0;font:16px sans-serif} .card{border:1px solid #888;padding:10px;margin:20px} label{display:block;height:30px}</style>
      <div class="card" id="c1"><h2>Today</h2><label><span>Status</span><select><option>All</option></select></label><label><span>Customer</span><input></label></div>
      <section class="box" id="c2"><p>Plain <b>Total</b></p></section>`);
    const box = (z, sel = {}) => zoneBox(page, z, sel, { timeout: 2000 });
    const status = await box({ field: "Status", margin: 0 });
    const both = await box({ union: [{ field: "Status" }, { field: "Customer" }], margin: 0 });
    assert.equal(both.y, status.y);
    assert.equal(both.height, 60);
    const card = await box({ text: "Today", framed: true, margin: 0 });
    const c1 = await page.locator("#c1").boundingBox();
    assert.deepEqual(card, { x: c1.x, y: c1.y, width: c1.width, height: c1.height });
    const framed = await box({ text: "Total", framed: true, margin: 0 }, { frame: "section.box" });
    assert.equal(framed.y, (await page.locator("#c2").boundingBox()).y);
    const up = await box({ text: "Total", up: 1, margin: 0 });
    assert.equal(up.width, (await page.locator("#c2 p").boundingBox()).width);
    const within = await box({ css: "label", within: { css: "#c1" }, has: "Customer", margin: 0 });
    assert.equal(within.y, status.y + 30);
    await assert.rejects(box({ block: "Today" }), /blockSelector/);
    const block = await box({ block: "Today", margin: 0 }, { block: ".card" });
    assert.equal(block.y, c1.y);
    await page.close();
  });
});
