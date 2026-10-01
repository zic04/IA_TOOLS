// Capture engine without a browser: plan normalisation (legacy keys included), validation, loading (duplicates,
// missing export), selection, forbidden routes, map framing, zone measurement, storage, request summary, masking
// (.env parsing, sensitive values, regular expression), WebP header, targets helpers; every i18n key used exists.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeEntry, validateEntry, loadPlans, selectCaptures, patternRegex, forbiddenMatchers, forbiddenMatch, routePath } from "../../engine/capture/plans.mjs";
import { measureZone, routeWithView, describeTarget, actionKind } from "../../engine/capture/actions.mjs";
import { storageValues, summarizeRequests, zoneFile, forbiddenRequestKind, requestGuard } from "../../engine/capture/capture.mjs";
import { parseEnv, sensitiveValues, maskSource, maskText, DOTS } from "../../engine/capture/masking.mjs";
import { webpSize } from "../../engine/capture/webp.mjs";
import { isSignInUrl, sessionFile, sessionStorageOf, forgetSession } from "../../engine/capture/session.mjs";
import * as targets from "../../engine/capture/targets.mjs";
import { loadDictionary } from "../../engine/i18n.mjs";
import { KitError } from "../../engine/project/errors.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const en = loadDictionary("en");

describe("plan entries", () => {
  test("legacy French entry → current keys, caption (libelle, on any target) and settle (stabiliser) included", () => {
    const { value, legacy } = normalizeEntry({
      id: "a",
      titre: "T",
      route: "/x",
      contexte: "bureau",
      stabiliser: 900,
      actions: [{ clic: { role: "button", nom: "Open" } }, { saisir: { champ: "Name" }, valeur: "Ada" }],
      cadre: { css: "main", marge: 0, margeV: 0, libelle: "Main" },
      zones: [{ texte: "Total", libelle: "Total", cote: "coin" }, { union: [{ champ: "A", libelle: "a" }, { champ: "B" }], libelle: "Row" }],
      masques: [{ css: ".x", libelle: undefined }],
    });
    assert.equal(legacy, true);
    assert.deepEqual(value, {
      id: "a",
      title: "T",
      route: "/x",
      context: "desktop",
      settle: 900,
      actions: [{ click: { role: "button", name: "Open" } }, { type: { field: "Name" }, value: "Ada" }],
      frame: { css: "main", margin: 0, marginY: 0, caption: "Main" },
      zones: [{ text: "Total", side: "corner", caption: "Total" }, { union: [{ field: "A", caption: "a" }, { field: "B" }], caption: "Row" }],
      masks: [{ css: ".x", caption: undefined }],
    });
    assert.deepEqual(validateEntry(value), [], "an undefined property (a helper passing an optional argument) counts as absent");
  });

  test("the schema accepts what the engine executes: negative margins, a 150 px strip, wheel steps 0, negative nth, fractional waits", () => {
    const entry = {
      id: "strip",
      route: "/",
      viewport: { width: 1600, height: 150 },
      delay: 1500.5,
      settle: 0,
      actions: [{ wheel: { x: 10, y: 10, steps: 0 } }, { wait: 250.5 }],
      frame: { css: "header", margin: -2, marginY: -4 },
      zones: [{ css: ".kpi", margin: -6, nth: -1 }, { union: [{ css: ".a" }, { css: ".b" }], margin: -40 }],
    };
    assert.deepEqual(validateEntry(entry), []);
    const keys = (e) => validateEntry(e).map((x) => `${x.path}:${x.key}`);
    assert.deepEqual(keys({ id: "a", route: "/", viewport: { height: 0 }, delay: -1, actions: [{ wheel: { x: 1, y: 1, steps: -1, direction: 2 } }, { wait: -5 }] }), [
      "viewport.height:minimum",
      "delay:minimum",
      "actions[0].wheel.steps:minimum",
      "actions[0].wheel.direction:enum",
      "actions[1].wait:anyOf",
    ]);
    assert.deepEqual(keys({ id: "a", route: "/", viewport: { height: 150.5 }, zones: [{ css: "a", margin: "4" }] }), ["viewport.height:type", "zones[0].margin:type"]);
  });

  test("a current entry is left alone and is valid (RegExp names, eval function, union zone)", () => {
    const entry = {
      id: "use-orders.list_1",
      title: "Orders",
      route: "/orders?status=open",
      context: "mobile",
      viewport: { height: 2200 },
      view: { lon: 2.35, lat: 48.85, zoom: 12 },
      storage: { tab: "lines", panels: ["a"] },
      delay: 0,
      actions: [{ click: { role: "tab", name: /^Lines/ }, options: { force: true } }, { wait: 300 }, { wait: { css: ".done" } }, { eval: () => 1 }, { wheel: { x: 1, y: 2, steps: 2, direction: 1 } }, { select: { label: "Status" }, value: ["Open"] }],
      frame: { text: "Panel", framed: true, margin: 20, marginY: 4 },
      zones: [{ role: "button", name: "Save", within: { css: "form" }, nth: 1, caption: "Save", side: "bottom-right" }, { union: [{ field: "A" }, { placeholder: /Search/ }] }],
      masks: [{ css: ".secret", has: "token" }],
    };
    assert.deepEqual(normalizeEntry(entry), { value: entry, legacy: false });
    assert.deepEqual(validateEntry(entry), []);
  });

  test("validation: unknown key with suggestion, one kind per target and per action, value of type/select, id and route", () => {
    const keys = (e) => validateEntry(e).map((x) => `${x.path}:${x.key}`);
    assert.deepEqual(keys({ id: "a", route: "/", zonse: [] }), ["zonse:unknownClose"]);
    assert.deepEqual(keys({ id: "a b", route: "x" }), ["id:pattern", "route:pattern"]);
    assert.deepEqual(keys({ route: "/" }), ["id:required"]);
    assert.deepEqual(keys({ id: "a", route: "/", zones: [{ css: "a", text: "b" }, { caption: "x" }, { union: [{ css: "a" }, {}] }] }), ["zones[0]:target", "zones[1]:target", "zones[2].union[1]:target"]);
    assert.deepEqual(keys({ id: "a", route: "/", actions: [{ click: { css: "a" }, hover: { css: "b" } }, {}, { type: { css: "a" } }] }), ["actions[0]:action", "actions[1]:action", "actions[2].value:required"]);
    assert.deepEqual(keys({ id: "a", route: "/", frame: { union: [{ css: "a" }] } }), ["frame.union:unknown"]);
    assert.deepEqual(keys({ id: "a", route: "/", actions: [{ wheel: { x: 1 } }] }), ["actions[0].wheel.y:required"]);
  });

  test("loading: alphabetical order, file name kept, legacy files listed; duplicates, missing export and invalid entries refused", async () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, "b.mjs"), 'export const CAPTURES = [{ id: "two", route: "/b" }];');
      fs.writeFileSync(path.join(dir, "a.mjs"), 'export const CAPTURES = [{ id: "one", titre: "Un", route: "/a" }];');
      const r = await loadPlans({ folder: dir });
      assert.deepEqual(r.captures.map((c) => [c.id, c.file, c.title]), [["one", "a.mjs", "Un"], ["two", "b.mjs", undefined]]);
      assert.deepEqual(r.legacy, ["a.mjs"]);

      fs.writeFileSync(path.join(dir, "c.mjs"), 'export const CAPTURES = [{ id: "one", route: "/c" }];');
      await assert.rejects(loadPlans({ folder: dir }), (e) => e instanceof KitError && e.code === 2 && e.key === "capture.duplicate" && e.vars.first === "a.mjs" && e.vars.second === "c.mjs");
      fs.writeFileSync(path.join(dir, "c.mjs"), "export const OTHER = 1;");
      await assert.rejects(loadPlans({ folder: dir, display: "plans" }), (e) => e.key === "capture.planNoExport" && e.vars.file === "plans/c.mjs");
      // Every invalid entry of every file, each one with its file, its id (and index) and its path; the valid ones
      // and the other files do not hide them.
      fs.writeFileSync(path.join(dir, "c.mjs"), 'export const CAPTURES = [{ id: "ok", route: "/" }, { id: "bad", route: "/", zones: [{ txt: "x" }] }];');
      fs.writeFileSync(path.join(dir, "d.mjs"), 'export const CAPTURES = [{ route: "/d" }, { id: "fine", route: "/" }, { id: "worse", route: "d", delay: -1 }];');
      await assert.rejects(loadPlans({ folder: dir, display: "plans" }), (e) => {
        assert.equal(e.key, "capture.planInvalid");
        assert.deepEqual(e.vars, { folder: "plans", n: 4 });
        assert.deepEqual(
          e.details.map((d) => [d.file, d.entry, d.path, d.key]),
          [
            ["plans/c.mjs", "bad (CAPTURES[1])", "zones[0].txt", "unknownClose"],
            ["plans/d.mjs", "CAPTURES[0]", "id", "required"],
            ["plans/d.mjs", "worse (CAPTURES[2])", "route", "pattern"],
            ["plans/d.mjs", "worse (CAPTURES[2])", "delay", "minimum"],
          ]
        );
        return true;
      });
      fs.rmSync(path.join(dir, "d.mjs"));
      fs.writeFileSync(path.join(dir, "c.mjs"), "export const CAPTURES = [;");
      await assert.rejects(loadPlans({ folder: dir }), (e) => e.key === "capture.planImport");
      await assert.rejects(loadPlans({ folder: path.join(dir, "nope") }), (e) => e.key === "capture.plansMissing");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the demo plans load and are valid (English syntax, one union zone)", async () => {
    const r = await loadPlans({ folder: path.join(KIT_ROOT, "examples/demo-docs/captures/plans") });
    assert.deepEqual(r.captures.map((c) => [c.id, c.zones.length]), [["orders-list", 3], ["settings-profile", 2]]);
    assert.equal(r.legacy.length, 0);
    assert.ok(r.captures[0].zones.some((z) => Array.isArray(z.union)));
  });

  test("selection patterns (* and ?, anchored) and plan order", () => {
    const all = ["use-orders", "use-orders-detail", "admin-users", "prod-use-orders"].map((id) => ({ id }));
    assert.deepEqual(selectCaptures(all, ["use-*"]).map((c) => c.id), ["use-orders", "use-orders-detail"]);
    assert.deepEqual(selectCaptures(all, ["*-users", "use-orders"]).map((c) => c.id), ["use-orders", "admin-users"]);
    assert.equal(selectCaptures(all, []).length, 4);
    assert.ok(patternRegex("a?c").test("abc") && !patternRegex("a.c").test("abc"));
  });

  test("requests to a forbidden route: a top-level navigation stops the capture, anything else is a prefetch", () => {
    const frame = (parent) => ({ parentFrame: () => parent });
    const req = (nav, f) => ({ isNavigationRequest: () => nav, frame: f });
    assert.equal(forbiddenRequestKind(req(false, () => frame(null))), "prefetch"); // fetch, XHR, <link rel=prefetch>
    assert.equal(forbiddenRequestKind(req(true, () => frame(null))), "navigation"); // the page itself, a click
    assert.equal(forbiddenRequestKind(req(true, () => frame(frame(null)))), "prefetch"); // an iframe
    const popup = () => {
      throw new Error("no frame yet");
    };
    assert.equal(forbiddenRequestKind(req(true, popup)), "navigation"); // a pop-up being created
  });

  test("request guard: forbidden prefetch aborted and counted, forbidden navigation reported, read-only, other origins", async () => {
    const result = { blocked: [], refused: [], prefetched: [] };
    const navigations = [];
    const guard = requestGuard({ appOrigin: "http://app.test", forbidden: forbiddenMatchers(["^/orders/\\d+/approval$"]), readOnly: true, result, onNavigation: (p) => navigations.push(p) });
    const run = async (url, { method = "GET", nav = false, parent = null } = {}) => {
      let outcome;
      const request = { url: () => url, method: () => method, isNavigationRequest: () => nav, frame: () => ({ parentFrame: () => parent }) };
      await guard({ request: () => request, abort: async (r) => (outcome = `abort:${r}`), fallback: async () => (outcome = "fallback") });
      return outcome;
    };
    assert.equal(await run("http://app.test/orders/7/approval?_rsc=1"), "abort:blockedbyclient");
    assert.equal(await run("http://app.test/orders/7/approval", { nav: true, parent: {} }), "abort:blockedbyclient");
    assert.deepEqual([result.prefetched, result.refused, navigations], [["GET /orders/7/approval", "GET /orders/7/approval"], [], []]);
    assert.equal(await run("http://app.test/orders/7/approval", { nav: true }), "abort:blockedbyclient");
    assert.deepEqual([result.refused, navigations], [["GET /orders/7/approval"], ["/orders/7/approval"]]);
    assert.equal(await run("http://app.test/orders/7"), "fallback");
    assert.equal(await run("http://other.test/orders/7/approval"), "fallback", "another origin is not the application");
    assert.equal(await run("http://app.test/api/presence", { method: "POST" }), "abort:blockedbyclient");
    assert.equal(await run("https://cdn.test/beacon", { method: "POST" }), "abort:blockedbyclient");
    assert.deepEqual(result.blocked, ["POST /api/presence", "POST cdn.test/beacon"]);
    assert.equal(await run("data:text/plain,x"), "fallback");
  });

  test("forbidden routes: on the path only, invalid expression → exit code 2", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$", "/sync"]);
    assert.equal(forbiddenMatch("/orders/12/approval?x=1#y", m), "^/orders/\\d+/approval$");
    assert.equal(forbiddenMatch("/orders/12", m), null);
    assert.equal(forbiddenMatch("/admin/sync-now", m), "/sync");
    assert.equal(routePath("/a?b"), "/a");
    assert.throws(() => forbiddenMatchers(["("]), (e) => e.code === 2 && e.details[0].path === "capture.forbidden[0]");
  });
});

describe("measures and helpers", () => {
  test("zone in percentages of the clip; marker in the corner when there is no room on the left", () => {
    const clip = { x: 100, y: 50, width: 800, height: 400 };
    assert.deepEqual(measureZone(1, { x: 300, y: 150, width: 200, height: 100 }, clip, { caption: "Total" }), { n: 1, x: 25, y: 25, w: 25, h: 25, label: "Total" });
    assert.deepEqual(measureZone(2, { x: 110, y: 50, width: 80, height: 40 }, clip), { n: 2, x: 1.25, y: 0, w: 10, h: 10, side: "corner" });
    assert.equal(measureZone(3, { x: 110, y: 50, width: 80, height: 40 }, clip, { side: "right" }).side, "right");
  });

  test("map framing: lon/lat → Web Mercator; x/y/z as is; nothing without capture.map", () => {
    const map = { x: "mx", y: "my", z: "mz" };
    assert.equal(routeWithView("/map", { lon: 0, lat: 0, zoom: 5 }, map), "/map?mx=0.00&my=0.00&mz=5");
    assert.match(routeWithView("/map?a=1", { lon: 180, lat: 0, zoom: 3 }, map), /^\/map\?a=1&mx=20037508\.34&my=0\.00&mz=3$/);
    assert.equal(routeWithView("/map", { x: 2.5, y: 48.1, z: 11 }, { x: "lon", y: "lat", z: "z" }), "/map?lon=2.5&lat=48.1&z=11");
    assert.equal(routeWithView("/map", { lon: 1, lat: 1, zoom: 1 }, null), "/map");
  });

  test("storage values, request summary (bot challenges grouped), zone file", () => {
    assert.deepEqual(storageValues({ a: "x{version}", b: { open: true }, c: 3 }, "1.2.0"), { a: "x1.2.0", b: '{"open":true}', c: "3" });
    assert.deepEqual(summarizeRequests(["POST /api/presence", "POST /cdn-cgi/challenge-platform/h/b/jsd/r/1", "POST /cdn-cgi/challenge-platform/h/b/jsd/r/2", "POST /api/presence"]), [
      "POST /api/presence",
      "POST /cdn-cgi/challenge-platform/…",
    ]);
    const z = zoneFile({ entry: { id: "x", route: "/r" }, clip: { width: 99.6, height: 50.2 }, zones: [], version: "1.0.0", captured: "2026-10-01" });
    assert.deepEqual(z, { file: "x.webp", title: "", route: "/r", width: 100, height: 50, version: "1.0.0", captured: "2026-10-01", zones: [] });
  });

  test("target and action descriptions; targets helpers (union)", () => {
    assert.equal(describeTarget({ role: "button", name: "Save" }), "role button “Save”");
    assert.equal(describeTarget({ union: [{ field: "A" }, { css: "b" }] }), "field “A” + css “b”");
    assert.equal(actionKind({ wait: 3 }), "wait");
    assert.deepEqual(targets.union(targets.field("A"), [targets.button("B")]), { union: [{ field: "A" }, { role: "button", name: "B", exact: false }] });
    assert.deepEqual(targets.card("Today"), { text: "Today", framed: true });
  });

  test("sign-in pages: another origin, or the path matching the pattern (not the host)", () => {
    const app = "https://login-portal.example.org";
    assert.equal(isSignInUrl("https://login-portal.example.org/orders", app), false);
    assert.equal(isSignInUrl("https://login-portal.example.org/login?next=/x", app), true);
    assert.equal(isSignInUrl("https://idp.example.com/oauth2/authorize", app), true);
    assert.equal(isSignInUrl("https://login-portal.example.org/auth/start", app, "^/auth"), true);
  });

  test("session file: default .doc-kit/session.json, <PREFIX>_SESSION; storage of the session; forget", () => {
    const config = { env: { prefix: "ACME" } };
    assert.equal(sessionFile("/p", config, {}), path.resolve("/p", ".doc-kit", "session.json"));
    assert.equal(sessionFile("/p", config, { ACME_SESSION: "s.json" }), path.resolve("/p", "s.json"));
    assert.equal(sessionFile("/p", config, { ACME_SESSION: "s.json", DOC_KIT_SESSION: "k.json" }), path.resolve("/p", "k.json"));
    const dir = tempDir();
    try {
      const f = path.join(dir, "s.json");
      fs.writeFileSync(f, JSON.stringify({ cookies: [], origins: [{ origin: "http://a", localStorage: [{ name: "token", value: "t" }] }] }));
      assert.deepEqual(sessionStorageOf(f, "http://a"), { token: "t" });
      assert.deepEqual(sessionStorageOf(f, "http://b"), {});
      assert.equal(forgetSession(f), true);
      assert.equal(forgetSession(f), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("WebP header size (VP8, VP8L, VP8X); not a WebP → null", () => {
    const riff = (chunk, bytes) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.from(chunk), Buffer.from(bytes)]);
    const vp8x = riff("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x06, 0x00, 0x8b, 0x02, 0x00, 0, 0]);
    assert.deepEqual(webpSize(vp8x), { width: 1600, height: 652 });
    assert.equal(webpSize(Buffer.from("not an image at all, really not one")), null);
  });
});

describe("masking", () => {
  test(".env parsing: export, quotes, comments", () => {
    assert.deepEqual(parseEnv('# c\nexport API_URL="https://api.example.org/v1" # main\nTENANT_ID=abc-123 # id\nEMPTY=\nQ=\'x y\'\n'), [
      { key: "API_URL", value: "https://api.example.org/v1", line: 2 },
      { key: "TENANT_ID", value: "abc-123", line: 3 },
      { key: "EMPTY", value: "", line: 4 },
      { key: "Q", value: "x y", line: 5 },
    ]);
  });

  test("sensitive values: key names, length > 6, exclusions, several files, duplicates once", () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, ".env"), "API_URL=https://api.internal.example\nDB_HOST=localhost:5432\nPORT=3000000\nSHORT_KEY=abc\nADMIN_EMAIL=ops@example.org\nCLIENT_SECRET=s3cr3t-value\n");
      fs.writeFileSync(path.join(dir, ".env.local"), "API_URL=https://api.internal.example\nSTORAGE_ACCOUNT=acmestorage01\n");
      const v = sensitiveValues(dir, { env: [".env", ".env.local", "missing.env"], exclude: "localhost|127\\.0\\.0\\.1" });
      assert.deepEqual(v.map((x) => x.key), ["API_URL", "ADMIN_EMAIL", "CLIENT_SECRET", "STORAGE_ACCOUNT"]);
      assert.deepEqual(sensitiveValues(dir, { env: [".env"], exclude: null }).map((x) => x.key), ["API_URL", "DB_HOST", "ADMIN_EMAIL", "CLIENT_SECRET"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("masking expression: longest value first, GUIDs, patterns; nothing to mask → null", () => {
    const src = maskSource(["https://api.example.org", "https://api.example.org/v1"], { guid: true, patterns: ["acct-\\d+"] });
    assert.equal(maskText("see https://api.example.org/v1/x and 7D3C5A1E-9B2F-4C6D-8E1A-2F3B4C5D6E7F, acct-42", src), `see ${DOTS}/x and ${DOTS}, ${DOTS}`);
    assert.equal(maskSource([], { guid: false, patterns: [] }), null);
    assert.equal(maskText("a.b", maskSource(["a.b"], { guid: false })), DOTS);
    assert.equal(maskText("axb", maskSource(["a.b"], { guid: false })), "axb");
  });
});

describe("i18n keys of the capture engine, the adapters and the checks", () => {
  const read = (p) => fs.readFileSync(path.join(KIT_ROOT, p), "utf8");
  const uses = (source, re) => [...source.matchAll(re)].map((m) => m[1]);
  const files = [
    "engine/capture/plans.mjs",
    "engine/capture/actions.mjs",
    "engine/capture/capture.mjs",
    "engine/capture/session.mjs",
    "engine/capture/masking.mjs",
    "engine/check/coverage.mjs",
    "engine/check/images.mjs",
    "engine/check/secrets.mjs",
    "cli/commands/capture.mjs",
    "cli/commands/connect.mjs",
    "cli/commands/demo.mjs",
    "cli/commands/inventory.mjs",
    "cli/commands/check.mjs",
  ];
  const source = files.map(read).join("\n");

  test("KitError, CaptureError, ctx.t, ctx.error, validation and problem keys exist in en and fr", () => {
    const fr = loadDictionary("fr");
    const keys = [
      ...uses(source, /KitError\(EXIT\.\w+, "([\w.]+)"/g).map((k) => `cli.${k}`),
      ...uses(source, /new CaptureError\("(\w+)"/g).map((k) => `cli.capture.error.${k}`),
      ...uses(source, /ctx\.t\("([\w.]+)"/g),
      ...uses(source, /ctx\.error\("([\w.]+)"/g).map((k) => `cli.${k}`),
      ...uses(source, /key: "(check\.[\w.]+)"/g).map((k) => `cli.${k}`),
      ...uses(source, /key: "(\w+)", vars: \{ (?:found|kinds)/g).map((k) => `cli.validate.${k}`),
      ...["generic", "forbiddenHit"].map((k) => `cli.capture.error.${k}`),
      ...["notFound", "blockNotFound", "error", "unknown"].map((k) => `cli.adapter.reason.${k}`),
      ...["env", "guid", "pattern", "privateKey", "jwt", "connectionString", "credentialsUrl", "cloudKey", "assignment", "signedUrl"].map((k) => `cli.check.secrets.kind.${k}`),
      ...["sessionOutside", "sessionTracked"].map((k) => `cli.check.secrets.${k}`),
    ];
    assert.ok(keys.length > 60);
    for (const k of keys) {
      assert.ok(k in en, `missing en: ${k}`);
      assert.ok(k in fr, `missing fr: ${k}`);
    }
  });

  test("the capture fragment has the same keys, variables and shapes in en and fr", () => {
    const a = JSON.parse(read("i18n/en/capture.json"));
    const b = JSON.parse(read("i18n/fr/capture.json"));
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    const vars = (v) => [...new Set((typeof v === "object" ? Object.values(v) : [v]).flatMap((t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
    for (const k of Object.keys(a)) {
      assert.deepEqual(vars(b[k]), vars(a[k]), k);
      assert.equal(typeof b[k], typeof a[k], k);
      assert.ok(k.startsWith("cli."), k);
    }
  });
});
