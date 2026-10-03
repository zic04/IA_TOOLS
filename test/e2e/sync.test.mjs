// End-to-end: `capture --compare` / `capture --stale` (ARCHITECTURE.md §6.10), against a temporary, modifiable
// copy of the demo app (examples/demo-app: served from the copy, never from examples/ itself) and a copy of the
// demo documentation project. Headless only — no visible browser window; the server is closed in `after`.
// `--stale` reads `.doc-kit/sync-report.json`: these tests write that file themselves (ARCHITECTURE.md §6.10 says
// a hand-written report is enough; the `sync` command that produces it for real has its own tests).
//
// This file is the shared end-to-end test of the whole "follow the application" lot (ARCHITECTURE.md §6.10-6.11):
// the captures above, `doc-kit context --update` (§6.11, test/e2e/sync.test.mjs §"context"), and the full
// update cycle (§"the full update cycle", V5a): `sync --mark --all` on examples/demo-app (version 1), switch to
// examples/demo-app-v2 (version 2: a renamed label, a modified screen, an added route — ARCHITECTURE.md §6.10),
// a real `sync` report (not hand-written), `--apply --labels`, `capture --stale --compare`, `--mark`, `--check`.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { connect, loadAdapter } from "../../engine/capture/session.mjs";
import { webpSize } from "../../engine/capture/webp.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir } from "../tools/helpers.mjs";

const PLANS = path.join(KIT_ROOT, "examples", "demo-docs", "captures", "plans");
let app;
let appDir;
let dir;

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: { ...env },
  });
  return { code, out, err };
}

/** Signs in through the fake login page of the demo app (what a person does in a visible window, here headless). */
async function signIn(page) {
  await page.waitForURL(/\/login/);
  await page.fill("#email", "robin@example.org");
  await page.fill("#password", "demo");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/orders$/);
}

before(async () => {
  // A modifiable copy of the whole demo app (serve.mjs, data.json, public/): examples/ is never written to.
  appDir = tempDir("doc-kit-e2e-sync-app-");
  fs.cpSync(path.join(KIT_ROOT, "examples", "demo-app"), appDir, { recursive: true });
  const { serve } = await import(pathToFileURL(path.join(appDir, "serve.mjs")).href);
  app = await serve({ port: 0 });

  dir = demoCopy();
  // The demo's own plans import "doc-kit/targets", which only resolves inside the kit (test/e2e/capture.test.mjs):
  // read from there, like every other end-to-end capture test.
  fs.rmSync(path.join(dir, "captures", "plans"), { recursive: true, force: true });
  const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
  // A lower threshold than the 0.5 % default: the heading-only change below moves few enough pixels (a single
  // line of text in a large page) that the default would call it unchanged too — a real UI change, just a small
  // one. compareThreshold is exactly the knob for this (ARCHITECTURE.md §6.10).
  // app.dir (the app copy's own folder) and a "glob" coverage adapter over its public/*.html: needed for the
  // "context" describe block below (ARCHITECTURE.md §6.11), which reads the application's files through
  // pageDependencies — nothing in the captures tests above depends on either.
  const config = {
    ...raw,
    app: { url: app.url, dir: appDir },
    auth: { adapter: "manual", loginPattern: "^/login" },
    capture: { plans: PLANS, setup: "captures/setup.mjs", compareThreshold: 0.001 },
    coverage: [
      {
        adapter: "glob",
        base: path.join(appDir, "public"),
        pattern: "*.html",
        match: "/{name}",
        family: "Routes",
        exclude: ["login", "approval"],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);

  const auth = await loadAdapter("auth", { adapter: "manual", loginPattern: "^/login" }, dir, "auth");
  await connect({
    url: app.url,
    auth,
    file: path.join(dir, ".doc-kit", "session.json"),
    headless: true,
    poll: 100,
    waitForUser: signIn,
  });
});

after(async () => {
  await app?.close();
  for (const d of [dir, appDir]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

describe("captures: --compare, --stale (ARCHITECTURE.md §6.10)", () => {
  test("baseline: images freshly captured from the untouched app — --compare leaves both byte for byte untouched", async () => {
    // The committed images were taken on one machine; fonts render differently on another system (CI runs on
    // Linux, Windows and macOS), so the baseline is first captured here, then compared with itself.
    const first = await cli(["capture", "--project", dir]);
    assert.equal(first.code, 0, first.out + first.err);
    const before = {
      "orders-list": fs.readFileSync(path.join(dir, "images", "orders-list.webp")),
      "settings-profile": fs.readFileSync(path.join(dir, "images", "settings-profile.webp")),
    };
    const r = await cli(["capture", "--project", dir, "--compare"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /= orders-list unchanged \(0\.00 % different, kept as is\)/);
    assert.match(r.out, /= settings-profile unchanged \(0\.00 % different, kept as is\)/);
    assert.match(r.out, /2 unchanged · 0 changed · 0 failed\./);
    for (const id of ["orders-list", "settings-profile"])
      assert.ok(
        fs.readFileSync(path.join(dir, "images", `${id}.webp`)).equals(before[id]),
        `${id}: unchanged image rewritten`,
      );
  });

  test("the application changes (version 2): the orders page heading only — settings.html and style.css untouched", () => {
    // The heading is not used as a locator by any zone of the capture plan (field/card/button look for "Status",
    // "Customer", "Date", "Today", "New order"): changing it leaves every target resolvable, only the pixels move.
    // style.css is deliberately left alone: --text doubles as the body's default text colour (not just the
    // cropped-out top bar), so touching it would also move settings-profile's pixels — the opposite of what this
    // step needs to prove.
    const file = path.join(appDir, "public", "orders.html");
    const html = fs.readFileSync(file, "utf8");
    assert.ok(html.includes("<h1>Orders</h1>"));
    fs.writeFileSync(file, html.replace("<h1>Orders</h1>", "<h1>All Orders</h1>"));
    // The server reads public/ on every request (examples/demo-app/serve.mjs): no restart needed.
  });

  test("--stale selects only the capture a hand-written sync report lists; capture --compare only replaces the image that really changed", async () => {
    const before = {
      "orders-list": fs.readFileSync(path.join(dir, "images", "orders-list.webp")),
      "settings-profile": fs.readFileSync(path.join(dir, "images", "settings-profile.webp")),
    };
    fs.mkdirSync(path.join(dir, ".doc-kit"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".doc-kit", "sync-report.json"),
      JSON.stringify({ captures: [{ id: "orders-list", pages: ["use/orders"], reasons: ["route"] }] }, null, 2),
    );

    const r = await cli(["capture", "--project", dir, "--stale"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ orders-list /);
    assert.doesNotMatch(r.out, /settings-profile/, "not selected: settings-profile is not even opened");
    const changed = /≠ orders-list changed \(([\d.]+) % different, image replaced\)/.exec(r.out);
    assert.ok(changed, r.out);
    assert.ok(Number(changed[1]) > 0.1, changed[1]);
    assert.match(r.out, /0 unchanged · 1 changed · 0 failed\./);

    const orders = fs.readFileSync(path.join(dir, "images", "orders-list.webp"));
    assert.ok(!orders.equals(before["orders-list"]), "orders-list: the image was replaced");
    assert.ok(
      fs.readFileSync(path.join(dir, "images", "settings-profile.webp")).equals(before["settings-profile"]),
      "settings-profile: never touched",
    );
    for (const file of ["orders-list.webp", "orders-list.png"])
      assert.ok(fs.existsSync(path.join(dir, ".doc-kit", "compare", file)), file);
    assert.ok(
      !fs.existsSync(path.join(dir, ".doc-kit", "compare", "settings-profile.png")),
      "settings-profile: no before/after sheet, it was never compared",
    );
  });

  test("--json: compared lists each id with its ratio and outcome (re-running --stale now finds the just-replaced image unchanged)", async () => {
    const json = JSON.parse((await cli(["capture", "--project", dir, "--stale", "--json"])).out);
    assert.deepEqual(
      json.compared.map((c) => c.id),
      ["orders-list"],
    );
    assert.equal(json.compared[0].changed, false);
    assert.equal(json.compared[0].ratio, 0);
  });

  test("capture --compare settings-profile (explicit, not via --stale): unchanged, byte for byte, zone file still refreshed (plan hash, today's date)", async () => {
    const before = fs.readFileSync(path.join(dir, "images", "settings-profile.webp"));
    const beforeZone = JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", "settings-profile.json"), "utf8"));
    const r = await cli(["capture", "settings-profile", "--project", dir, "--compare"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /= settings-profile unchanged/);
    const after = fs.readFileSync(path.join(dir, "images", "settings-profile.webp"));
    assert.ok(after.equals(before), "an unchanged image is never rewritten, byte for byte");
    assert.deepEqual(webpSize(after), { width: beforeZone.width, height: beforeZone.height });
    const zone = JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", "settings-profile.json"), "utf8"));
    assert.equal(
      zone.captured,
      new Date().toISOString().slice(0, 10),
      "the zone file is refreshed even though the image is not",
    );
    assert.match(zone.plan, /^[0-9a-f]{16}$/, "the plan entry hash (hashPlanEntry, engine/core/hash.mjs)");
    assert.equal(
      zone.commit,
      undefined,
      "app.dir is set but is not a git repository here: ctx.commit degrades to null, omitted from the zone file",
    );
  });
});

describe("context --update (ARCHITECTURE.md §6.11)", () => {
  test("writes .doc-kit/context/use__orders.md: the excerpt of public/orders.html (direct, via the glob coverage adapter), the sync report's review/captures entries for this page, the path of the before/after sheet", async () => {
    const r = await cli(["context", "use/orders", "--update", "--project", dir, "--json"]);
    assert.equal(r.code, 0, r.out + r.err);
    const [entry] = JSON.parse(r.out);
    assert.equal(entry.page, "use/orders");
    assert.equal(entry.cuts, 0);
    assert.ok(entry.tokens > 0);

    const file = path.join(dir, ".doc-kit", "context", "use__orders.md");
    assert.equal(path.join(dir, entry.file), file);
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^# The orders list \(use\/orders\)/);
    assert.match(text, /- Routes: \/orders/);
    assert.match(text, /### public\/orders\.html \(direct\)/);
    assert.match(text, /<h1>All Orders<\/h1>/, "the excerpt shows the application's current (modified) file");
    // The hand-written sync-report.json (written by the captures tests above) lists "orders-list" as a stale
    // capture of this page: its entry, and the path of its before/after sheet, both appear under --update.
    assert.match(text, /## What changed since this page was last checked/);
    assert.match(text, /orders-list: retake \(route\)/);
    assert.match(text, /Before\/after sheets of its captures:\n- \.doc-kit\/compare\/orders-list\.png/);
  });

  test('a page without --update: no sync report needed, no "What changed" section', async () => {
    const r = await cli(["context", "use/settings", "--project", dir]);
    assert.equal(r.code, 0, r.out + r.err);
    const text = fs.readFileSync(path.join(dir, ".doc-kit", "context", "use__settings.md"), "utf8");
    assert.doesNotMatch(text, /What changed since this page was last checked/);
  });
});

describe("the full update cycle (ARCHITECTURE.md §6.10, V5a: a real `sync` report, not hand-written)", () => {
  const V1 = path.join(KIT_ROOT, "examples", "demo-app");
  const V2 = path.join(KIT_ROOT, "examples", "demo-app-v2");

  /** The demo's own 2-capture plan (examples/demo-docs/captures/plans/use.mjs), as plain objects: no import of
   * "doc-kit/targets" (only resolves inside the kit), so that this temporary plan needs nothing but itself.
   * `notifications`: the "docs team" has updated the plan for the Settings screen's new field (version 2) —
   * this, not the screen's pixels alone, is what makes `sync` list the capture as stale (ARCHITECTURE.md §6.10,
   * "captures": the plan entry's hash, not a pixel diff, which is `capture --compare`'s job). */
  function writePlan(plansDir, notifications) {
    const settingsZones = [
      { text: "Profile", framed: true, caption: "Profile" },
      ...(notifications ? [{ field: "Notifications", caption: "Notifications" }] : []),
      { role: "button", name: "Save", exact: true, caption: "Save", side: "right" },
    ];
    const captures = [
      {
        id: "orders-list",
        title: "Acme Orders › Orders",
        route: "/orders",
        delay: 400,
        frame: { css: "main", marginY: 0 },
        zones: [
          { union: [{ field: "Status" }, { field: "Customer" }, { field: "Date" }], caption: "Filters" },
          { text: "Today", framed: true, caption: "Order summary" },
          { role: "button", name: "New order", exact: false, caption: "New order" },
        ],
      },
      {
        id: "settings-profile",
        title: "Acme Orders › Settings",
        route: "/settings",
        delay: 400,
        frame: { css: "main", marginY: 0 },
        zones: settingsZones,
      },
    ];
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, "use.mjs"), `export const CAPTURES = ${JSON.stringify(captures, null, 2)};\n`);
  }

  /** The project's configuration for one version of the app: its own URL, code folder, message file and a
   * "glob" coverage adapter over its public/*.html (as test/e2e/capture.test.mjs's own config already does). */
  function configFor(raw, plansDir, appDir, appUrl) {
    return {
      ...raw,
      app: { url: appUrl, dir: appDir },
      auth: { adapter: "manual", loginPattern: "^/login" },
      capture: { plans: plansDir, forbidden: ["^/orders/\\d+/approval$"] },
      sync: { labels: [path.join(appDir, "public", "messages", "en.json")] },
      coverage: [
        {
          adapter: "glob",
          base: path.join(appDir, "public"),
          pattern: "*.html",
          match: "/{name}",
          family: "Routes",
          exclude: ["login", "approval"],
        },
      ],
    };
  }

  test("mark v1 → switch to v2 → sync lists exactly the renamed label, the modified screen and the new route → --apply --labels → capture --stale --compare retakes only the changed image, byte for byte → --mark the treated pages → --check is 0", async () => {
    const plansDir = tempDir("doc-kit-e2e-cycle-plans-");
    const cycleDir = demoCopy();
    fs.rmSync(path.join(cycleDir, "captures", "plans"), { recursive: true, force: true });
    const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
    const writeConfig = (cfg) =>
      fs.writeFileSync(path.join(cycleDir, "doc.config.mjs"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
    const sessionFile = path.join(cycleDir, ".doc-kit", "session.json");

    // A single, mutable copy of the app: app.dir, the message file and the coverage base all keep the same
    // path throughout (what a real deployment does), only its content changes underneath — "switching to
    // version 2" means overwriting these files, not moving to a different folder (ARCHITECTURE.md §6.10: a
    // label file, recorded by its path at marking time, is read again from that same path at report time).
    const appDir = tempDir("doc-kit-e2e-cycle-app-");
    fs.cpSync(V1, appDir, { recursive: true });
    const serveApp = async (port) => {
      const mod = await import(pathToFileURL(path.join(appDir, "serve.mjs")).href + "?t=" + Date.now() + Math.random());
      return mod.serve({ port });
    };

    writePlan(plansDir, false);
    let app1;
    let app2;
    try {
      // ─── Version 1: mark everything as checked ──────────────────────────────────────────────────────────
      app1 = await serveApp(0);
      // Written once: `doc.config.mjs` is loaded through a dynamic import (engine/project/load.mjs), cached by
      // Node for the lifetime of this process like any ES module — rewriting the file a second time would not
      // be seen by a second `cli()` call against the same project path. Only `app.url` changes between the two
      // versions, and it does so through `DOC_KIT_URL` below (ARCHITECTURE.md §3, precedence over the file),
      // never by rewriting the file again.
      writeConfig(configFor(raw, plansDir, appDir, app1.url));
      const auth = await loadAdapter("auth", { adapter: "manual", loginPattern: "^/login" }, cycleDir, "auth");
      await connect({ url: app1.url, auth, file: sessionFile, headless: true, poll: 100, waitForUser: signIn });

      let r = await cli(["sync", "--mark", "--all", "--project", cycleDir, "--date", "2026-10-02"], {
        DOC_KIT_URL: app1.url,
      });
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /11 pages marked as checked/);

      await app1.close();
      app1 = null;

      // ─── Version 2: a renamed label, a modified screen (its plan updated to match), an added route ────────
      // examples/demo-app-v2 is never run from its own folder here: only its files are copied over, at the
      // same appDir as version 1, line for line identical outside the three intended differences (so that
      // every `file:line` proof of the takeover pages still resolves unmoved — see examples/demo-app-v2/serve.mjs).
      fs.cpSync(V2, appDir, { recursive: true });
      app2 = await serveApp(0);
      writePlan(plansDir, true);
      await connect({ url: app2.url, auth, file: sessionFile, headless: true, poll: 100, waitForUser: signIn });

      r = await cli(["sync", "--project", cycleDir, "--json"], { DOC_KIT_URL: app2.url });
      assert.equal(r.code, 0, r.out + r.err);
      const report = JSON.parse(r.out);
      // "Approval chain" is cited in bold from three pages: the feature sheet it is about, the rule that
      // defines it (features/rules.md, BR-02) and the note on features/roles.md — sync finds every one.
      assert.deepEqual(
        report.labels.map((l) => ({ key: l.key, old: l.old, new: l.new, pages: [...l.pages].sort() })),
        [
          {
            key: "orders.approvalLink",
            old: "Approval chain",
            new: "Approvals",
            pages: ["features/approve-order", "features/roles", "features/rules"],
          },
        ],
      );
      assert.deepEqual(
        report.captures.map((c) => c.id),
        ["settings-profile"],
      );
      assert.deepEqual(report.captures[0].pages, ["use/settings"]);
      assert.ok(report.captures[0].reasons.includes("plan"), "the plan entry's own hash changed, not a pixel diff");
      // The glob adapter's item id is the file itself (its `match` text, "/invoices", is what coverage checks).
      assert.deepEqual(
        report.new.map((n) => n.id),
        ["invoices.html"],
      );
      assert.equal(report.new[0].suggest, null, "no written page of the same family shares a path segment with it");
      assert.deepEqual(report.removed, []);
      // A verified claim badge is a proof (§6.10): risks/findings verifies its claim on order.html:22, the very line
      // whose label v2 renamed — the claim is reported to re-check, not silently kept.
      assert.deepEqual(report.proofs.moved, []);
      assert.deepEqual(
        report.proofs.broken.map((b) => ({ page: b.page, ref: b.ref, reason: b.reason })),
        [{ page: "risks/findings", ref: "order.html:22", reason: "textNotFound" }],
      );
      // The pages to review, by priority: use/settings (its own screen changed: also a capture to retake) and
      // risks/findings (the line of its claim changed) are direct; features/approve-order reaches serve.mjs through
      // its counterpart (shared); the two takeover pages cite serve.mjs lines that v2 left intact (the new route
      // was added elsewhere): probably intact, for the triage.
      assert.deepEqual(
        report.review.map((x) => [x.page, x.priority]),
        [
          ["features/approve-order", "shared"],
          ["risks/findings", "direct"],
          ["secure/access-ownership", "probablyIntact"],
          ["secure/api-surface", "probablyIntact"],
          ["use/settings", "direct"],
        ],
      );

      // ─── --apply --labels: the page is corrected, not just reported ────────────────────────────────────────
      r = await cli(["sync", "--apply", "--labels", "--project", cycleDir]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /content\/features\/approve-order\.md/);
      const approveOrderFile = path.join(cycleDir, "content", "features", "approve-order.md");
      const approveOrderText = fs.readFileSync(approveOrderFile, "utf8");
      assert.match(approveOrderText, /\*\*Approvals\*\*/);
      assert.doesNotMatch(approveOrderText, /Approval chain/);

      // ─── capture --stale --compare: only the capture the report just listed, and only its image rewritten ──
      const beforeOrders = fs.readFileSync(path.join(cycleDir, "images", "orders-list.webp"));
      const beforeSettings = fs.readFileSync(path.join(cycleDir, "images", "settings-profile.webp"));
      r = await cli(["capture", "--project", cycleDir, "--stale", "--compare"], { DOC_KIT_URL: app2.url });
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /≠ settings-profile changed \(([\d.]+) % different, image replaced\)/);
      assert.match(r.out, /0 unchanged · 1 changed · 0 failed\./);
      assert.doesNotMatch(r.out, /orders-list/, "not selected: only settings-profile was reported stale");
      assert.ok(
        fs.readFileSync(path.join(cycleDir, "images", "orders-list.webp")).equals(beforeOrders),
        "orders-list: never opened, byte for byte",
      );
      assert.ok(
        !fs.readFileSync(path.join(cycleDir, "images", "settings-profile.webp")).equals(beforeSettings),
        "settings-profile: the image was replaced",
      );

      // ─── --mark the treated pages (not --all): sync.json follows, nothing stays outstanding ───────────────
      // risks/findings: its claim still holds on the renamed line (the link keeps its data-prefetch), re-checked;
      // the two probably-intact takeover pages: confirmed by the triage, marked without being rewritten.
      r = await cli([
        "sync",
        "--mark",
        "features/approve-order",
        "use/settings",
        "risks/findings",
        "secure/access-ownership",
        "secure/api-surface",
        "--project",
        cycleDir,
        "--date",
        "2026-10-02",
      ]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /5 pages marked as checked/);

      r = await cli(["sync", "--check", "--project", cycleDir]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /the documentation follows the application/);
    } finally {
      await app1?.close();
      await app2?.close();
      fs.rmSync(cycleDir, { recursive: true, force: true });
      fs.rmSync(plansDir, { recursive: true, force: true });
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });
});
