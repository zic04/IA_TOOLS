// Capture engine without a browser: plan validation (the former French keys refused), loading (duplicates,
// missing export), selection, forbidden routes, map framing, zone measurement, storage, request summary, masking
// (.env parsing, sensitive values, regular expression), WebP header, targets helpers; every i18n key used exists.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  validateEntry,
  loadPlans,
  selectCaptures,
  patternRegex,
  forbiddenMatchers,
  forbiddenMatch,
  routePath,
} from "../../engine/capture/plans.mjs";
import { measureZone, routeWithView, describeTarget, actionKind } from "../../engine/capture/actions.mjs";
import {
  storageValues,
  summarizeRequests,
  zoneFile,
  forbiddenRequestKind,
  requestGuard,
  localNetworkGrant,
} from "../../engine/capture/capture.mjs";
import { afterRedirects } from "../../engine/capture/take.mjs";
import { compareOutcome } from "../../engine/capture/compare.mjs";
import { parseEnv, sensitiveValues, maskSource, maskText, DOTS } from "../../engine/capture/masking.mjs";
import { webpSize } from "../../engine/capture/webp.mjs";
import {
  isSignInUrl,
  sessionFile,
  sessionStorageOf,
  forgetSession,
  writePrivateFile,
  checkSession,
} from "../../engine/capture/session.mjs";
import * as targets from "../../engine/capture/targets.mjs";
import { loadDictionary } from "../../engine/i18n.mjs";
import { KitError } from "../../engine/project/errors.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir, demoCopy } from "../tools/helpers.mjs";

const en = loadDictionary("en");

describe("plan entries", () => {
  test("the former French keys are not renamed (ARCHITECTURE.md §6.7): each one is an unknown key", () => {
    const keys = (e) => validateEntry(e).map((x) => `${x.path}:${x.key}:${x.vars.closest}`);
    assert.deepEqual(
      keys({
        id: "a",
        titre: "T",
        route: "/x",
        contexte: "bureau",
        stabiliser: 900,
        actions: [{ clic: { role: "button", nom: "Open" } }],
        cadre: { css: "main" },
        zones: [{ texte: "Total", libelle: "Total" }],
        masques: [{ css: ".x" }],
      }),
      [
        "titre:unknownClose:title",
        "contexte:unknownClose:context",
        "stabiliser:unknown:",
        "actions[0].clic:unknownClose:click",
        "cadre:unknown:",
        "zones[0].texte:unknownClose:text",
        "zones[0].libelle:unknown:",
        "masques:unknown:",
      ],
    );
    assert.deepEqual(
      validateEntry({
        id: "a",
        route: "/x",
        zones: [{ text: "Total", caption: "Total" }],
        masks: [{ css: ".x", caption: undefined }],
      }),
      [],
      "the current keys; an undefined property (a helper passing an optional argument) counts as absent",
    );
  });

  test("a plan file with a French key is refused when loaded (capture.planInvalid, exit code 2)", async () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, "a.mjs"), 'export const CAPTURES = [{ id: "one", titre: "Un", route: "/a" }];');
      await assert.rejects(loadPlans({ folder: dir, display: "plans" }), (e) => {
        assert.equal(e.code, 2);
        assert.equal(e.key, "capture.planInvalid");
        assert.deepEqual(
          e.details.map((d) => [d.file, d.entry, d.path, d.key]),
          [["plans/a.mjs", "one (CAPTURES[0])", "titre", "unknownClose"]],
        );
        return true;
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      zones: [
        { css: ".kpi", margin: -6, nth: -1 },
        { union: [{ css: ".a" }, { css: ".b" }], margin: -40 },
      ],
    };
    assert.deepEqual(validateEntry(entry), []);
    const keys = (e) => validateEntry(e).map((x) => `${x.path}:${x.key}`);
    assert.deepEqual(
      keys({
        id: "a",
        route: "/",
        viewport: { height: 0 },
        delay: -1,
        actions: [{ wheel: { x: 1, y: 1, steps: -1, direction: 2 } }, { wait: -5 }],
      }),
      [
        "viewport.height:minimum",
        "delay:minimum",
        "actions[0].wheel.steps:minimum",
        "actions[0].wheel.direction:enum",
        "actions[1].wait:anyOf",
      ],
    );
    assert.deepEqual(keys({ id: "a", route: "/", viewport: { height: 150.5 }, zones: [{ css: "a", margin: "4" }] }), [
      "viewport.height:type",
      "zones[0].margin:type",
    ]);
  });

  test("a current entry is valid (RegExp names, eval function, union zone)", () => {
    const entry = {
      id: "use-orders.list_1",
      title: "Orders",
      route: "/orders?status=open",
      context: "mobile",
      viewport: { height: 2200 },
      view: { lon: 2.35, lat: 48.85, zoom: 12 },
      storage: { tab: "lines", panels: ["a"] },
      delay: 0,
      actions: [
        { click: { role: "tab", name: /^Lines/ }, options: { force: true } },
        { wait: 300 },
        { wait: { css: ".done" } },
        { eval: () => 1 },
        { wheel: { x: 1, y: 2, steps: 2, direction: 1 } },
        { select: { label: "Status" }, value: ["Open"] },
      ],
      frame: { text: "Panel", framed: true, margin: 20, marginY: 4 },
      zones: [
        { role: "button", name: "Save", within: { css: "form" }, nth: 1, caption: "Save", side: "bottom-right" },
        { union: [{ field: "A" }, { placeholder: /Search/ }] },
      ],
      masks: [{ css: ".secret", has: "token" }],
    };
    assert.deepEqual(validateEntry(entry), []);
  });

  test("validation: unknown key with suggestion, one kind per target and per action, value of type/select, id and route", () => {
    const keys = (e) => validateEntry(e).map((x) => `${x.path}:${x.key}`);
    assert.deepEqual(keys({ id: "a", route: "/", zonse: [] }), ["zonse:unknownClose"]);
    assert.deepEqual(keys({ id: "a b", route: "x" }), ["id:pattern", "route:pattern"]);
    assert.deepEqual(keys({ route: "/" }), ["id:required"]);
    assert.deepEqual(
      keys({ id: "a", route: "/", zones: [{ css: "a", text: "b" }, { caption: "x" }, { union: [{ css: "a" }, {}] }] }),
      ["zones[0]:target", "zones[1]:target", "zones[2].union[1]:target"],
    );
    assert.deepEqual(
      keys({
        id: "a",
        route: "/",
        actions: [{ click: { css: "a" }, hover: { css: "b" } }, {}, { type: { css: "a" } }],
      }),
      ["actions[0]:action", "actions[1]:action", "actions[2].value:required"],
    );
    assert.deepEqual(keys({ id: "a", route: "/", frame: { union: [{ css: "a" }] } }), ["frame.union:unknown"]);
    assert.deepEqual(keys({ id: "a", route: "/", actions: [{ wheel: { x: 1 } }] }), ["actions[0].wheel.y:required"]);
  });

  test("loading: alphabetical order, file name kept; duplicates, missing export and invalid entries refused", async () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, "b.mjs"), 'export const CAPTURES = [{ id: "two", route: "/b" }];');
      fs.writeFileSync(path.join(dir, "a.mjs"), 'export const CAPTURES = [{ id: "one", title: "Un", route: "/a" }];');
      const r = await loadPlans({ folder: dir });
      assert.deepEqual(
        r.captures.map((c) => [c.id, c.file, c.title]),
        [
          ["one", "a.mjs", "Un"],
          ["two", "b.mjs", undefined],
        ],
      );
      assert.deepEqual(r.files, ["a.mjs", "b.mjs"]);

      fs.writeFileSync(path.join(dir, "c.mjs"), 'export const CAPTURES = [{ id: "one", route: "/c" }];');
      await assert.rejects(
        loadPlans({ folder: dir }),
        (e) =>
          e instanceof KitError &&
          e.code === 2 &&
          e.key === "capture.duplicate" &&
          e.vars.first === "a.mjs" &&
          e.vars.second === "c.mjs",
      );
      fs.writeFileSync(path.join(dir, "c.mjs"), "export const OTHER = 1;");
      await assert.rejects(
        loadPlans({ folder: dir, display: "plans" }),
        (e) => e.key === "capture.planNoExport" && e.vars.file === "plans/c.mjs",
      );
      // Every invalid entry of every file, each one with its file, its id (and index) and its path; the valid ones
      // and the other files do not hide them.
      fs.writeFileSync(
        path.join(dir, "c.mjs"),
        'export const CAPTURES = [{ id: "ok", route: "/" }, { id: "bad", route: "/", zones: [{ txt: "x" }] }];',
      );
      fs.writeFileSync(
        path.join(dir, "d.mjs"),
        'export const CAPTURES = [{ route: "/d" }, { id: "fine", route: "/" }, { id: "worse", route: "d", delay: -1 }];',
      );
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
          ],
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
    assert.deepEqual(
      r.captures.map((c) => [c.id, c.zones.length]),
      [
        ["orders-list", 3],
        ["settings-profile", 2],
      ],
    );
    assert.ok(r.captures[0].zones.some((z) => Array.isArray(z.union)));
  });

  test("selection patterns (* and ?, anchored) and plan order", () => {
    const all = ["use-orders", "use-orders-detail", "admin-users", "prod-use-orders"].map((id) => ({ id }));
    assert.deepEqual(
      selectCaptures(all, ["use-*"]).map((c) => c.id),
      ["use-orders", "use-orders-detail"],
    );
    assert.deepEqual(
      selectCaptures(all, ["*-users", "use-orders"]).map((c) => c.id),
      ["use-orders", "admin-users"],
    );
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
    const guard = requestGuard({
      appOrigin: "http://app.test",
      forbidden: forbiddenMatchers(["^/orders/\\d+/approval$"]),
      readOnly: true,
      result,
      onNavigation: (p) => navigations.push(p),
    });
    const run = async (url, { method = "GET", nav = false, parent = null } = {}) => {
      let outcome;
      const request = {
        url: () => url,
        method: () => method,
        isNavigationRequest: () => nav,
        frame: () => ({ parentFrame: () => parent }),
      };
      await guard({
        request: () => request,
        abort: async (r) => (outcome = `abort:${r}`),
        fallback: async () => (outcome = "fallback"),
      });
      return outcome;
    };
    assert.equal(await run("http://app.test/orders/7/approval?_rsc=1"), "abort:blockedbyclient");
    assert.equal(await run("http://app.test/orders/7/approval", { nav: true, parent: {} }), "abort:blockedbyclient");
    assert.deepEqual(
      [result.prefetched, result.refused, navigations],
      [["GET /orders/7/approval", "GET /orders/7/approval"], [], []],
    );
    assert.equal(await run("http://app.test/orders/7/approval", { nav: true }), "abort:blockedbyclient");
    assert.deepEqual([result.refused, navigations], [["GET /orders/7/approval"], ["/orders/7/approval"]]);
    assert.equal(await run("http://app.test/orders/7"), "fallback");
    assert.equal(await run("http://other.test/orders/7/approval"), "fallback", "another origin is not the application");
    assert.equal(await run("http://app.test/api/presence", { method: "POST" }), "abort:blockedbyclient");
    assert.equal(await run("https://cdn.test/beacon", { method: "POST" }), "abort:blockedbyclient");
    assert.deepEqual(result.blocked, ["POST /api/presence", "POST cdn.test/beacon"]);
    assert.equal(await run("data:text/plain,x"), "fallback");
  });

  /**
   * A guard on a fake site: `run(url)` hands it one navigation of the top-level frame `top` (or of `frame`), and
   * tells what it did with it. Every request the guard sends is in `requested` (always without following redirects),
   * with the headers it set in `sent` (none: the request's own, as the browser built them). The request carries a
   * cookie and a referrer, like a navigation of a signed-in page.
   */
  function fakeSite(site, { forbidden = forbiddenMatchers(["^/orders/\\d+/approval$"]) } = {}) {
    const result = { blocked: [], refused: [], prefetched: [] };
    const navigations = [];
    const requested = [];
    const sent = [];
    const top = { parentFrame: () => null };
    const guard = requestGuard({
      appOrigin: "http://app.test",
      forbidden,
      readOnly: true,
      result,
      onNavigation: (p) => navigations.push(p),
    });
    const answer = (target) => {
      requested.push(target);
      const r = site[target] || { status: 404 };
      return { status: () => r.status, headers: () => (r.location ? { location: r.location } : {}) };
    };
    const signedIn = { accept: "text/html", cookie: "sid=APP", referer: "http://app.test/orders?page=2" };
    const run = async (url, { frame = top, method = "GET", headers = signedIn } = {}) => {
      let outcome;
      const request = {
        url: () => url,
        method: () => method,
        isNavigationRequest: () => true,
        frame: frame ? () => frame : () => assert.fail("a pop-up being created has no frame yet"),
        headers: () => headers,
      };
      await guard({
        request: () => request,
        fetch: async ({ url: target, maxRedirects, headers } = {}) => {
          assert.equal(maxRedirects, 0, "the guard never lets a request follow a redirect");
          sent.push([target || url, headers]);
          return answer((target || url).split("#")[0]); // a fragment is never sent
        },
        fulfill: async ({ response, status, body }) =>
          (outcome = response ? { response: response.status() } : { status, body }),
        abort: async (r) => (outcome = `abort:${r}`),
        fallback: async () => (outcome = "fallback"),
      });
      return outcome;
    };
    return { run, guard, top, result, navigations, requested, sent };
  }

  test("a server redirect to a forbidden route is refused before the browser follows it (SECURITY.md)", async () => {
    // The application: /latest → /orders/7 → /orders/7/approval; /home → 200; /loop → itself.
    const s = fakeSite({
      "http://app.test/latest": { status: 302, location: "/orders/7" },
      "http://app.test/orders/7": { status: 302, location: "http://app.test/orders/7/approval" },
      "http://app.test/home": { status: 200 },
      "http://app.test/loop": { status: 302, location: "/loop" },
      "http://app.test/app-link": { status: 302, location: "acme-app://open" },
    });
    assert.equal(await s.run("http://app.test/latest"), "abort:blockedbyclient");
    assert.deepEqual([s.result.refused, s.navigations], [["GET /orders/7/approval"], ["/orders/7/approval"]]);
    assert.deepEqual(s.requested, ["http://app.test/latest", "http://app.test/orders/7"], "never the forbidden route");
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 }, "no redirect: the answer itself");
    assert.equal(await s.run("http://app.test/loop"), "abort:blockedbyclient", "an endless chain is refused");
    assert.equal(await s.run("http://app.test/app-link"), "abort:failed", "a redirect off the web is not followed");
  });

  test("a chain of 10 redirects is followed, one of 11 refused", async () => {
    const hop = (name, n) => [`http://app.test/${name}${n}`, { status: 302, location: `/${name}${n + 1}` }];
    const s = fakeSite({
      ...Object.fromEntries(Array.from({ length: 10 }, (_, n) => hop("r", n))),
      "http://app.test/r10": { status: 200 },
      ...Object.fromEntries(Array.from({ length: 11 }, (_, n) => hop("s", n))),
      "http://app.test/s11": { status: 200 },
    });
    assert.match((await s.run("http://app.test/r0")).body, /location\.replace\("http:\/\/app\.test\/r10"\)/);
    assert.equal(await s.run("http://app.test/s0"), "abort:blockedbyclient");
    assert.ok(!s.requested.includes("http://app.test/s11"));
  });

  test("a navigation sent with another method is never fetched by the guard: read-only blocks it", async () => {
    const s = fakeSite({ "http://app.test/orders/7": { status: 303, location: "/orders/7/approval" } });
    assert.equal(await s.run("http://app.test/orders/7", { method: "POST" }), "abort:blockedbyclient");
    assert.deepEqual([s.result.blocked, s.requested], [["POST /orders/7"], []]);
  });

  test("a navigation off the web is left to the browser; a hop on another origin is not tested against capture.forbidden", async () => {
    const s = fakeSite({
      "http://app.test/partner": { status: 302, location: "https://idp.test/orders/7/approval" },
      "https://idp.test/orders/7/approval": { status: 200 },
    });
    assert.equal(await s.run("data:text/html,<p>x</p>"), "fallback");
    assert.equal(await s.run("blob:http://app.test/0b6e"), "fallback");
    assert.deepEqual(s.requested, []);
    assert.match((await s.run("http://app.test/partner")).body, /idp\.test\/orders\/7\/approval/);
    assert.deepEqual(s.result.refused, [], "capture.forbidden covers the application's origin only");
  });

  test("redirects through another origin (a sign-in round trip): every hop fetched by the guard, a hop back on the application tested", async () => {
    // A sign-in round trip: the application → the identity provider → back to the application.
    const s = fakeSite({
      "http://app.test/sso": { status: 302, location: "https://idp.test/login?next=/orders/7/approval" },
      "https://idp.test/login?next=/orders/7/approval": { status: 302, location: "http://app.test/orders/7/approval" },
      "https://idp.test/start": { status: 302, location: "http://app.test/orders/7/approval/" },
    });
    assert.equal(await s.run("http://app.test/sso"), "abort:blockedbyclient");
    assert.deepEqual(s.requested, ["http://app.test/sso", "https://idp.test/login?next=/orders/7/approval"]);
    assert.deepEqual([s.result.refused, s.navigations], [["GET /orders/7/approval"], ["/orders/7/approval"]]);
    // A navigation that starts on another origin is followed too.
    assert.equal(await s.run("https://idp.test/start"), "abort:blockedbyclient");
    assert.deepEqual(s.result.refused, ["GET /orders/7/approval", "GET /orders/7/approval/"]);
    assert.ok(!s.requested.some((u) => u.includes("/orders/7/approval") && u.startsWith("http://app.test")));
  });

  test("a hop never carries the cookies of the request: the browser's own for the hop are added; another origin gets the referrer's origin only", async () => {
    const s = fakeSite({
      "http://app.test/signin": { status: 302, location: "https://idp.test/authorize" },
      "https://idp.test/authorize": { status: 302, location: "http://app.test/home" },
      "http://app.test/home": { status: 200 },
    });
    assert.equal((await s.run("http://app.test/signin")).status, 200);
    assert.deepEqual(s.sent, [
      ["http://app.test/signin", undefined],
      ["https://idp.test/authorize", { accept: "text/html", referer: "http://app.test/" }],
      ["http://app.test/home", { accept: "text/html", referer: "http://app.test/orders?page=2" }],
    ]);
    // A referrer that cannot be read is left out.
    const t = fakeSite({ "http://app.test/a": { status: 302, location: "/b" }, "http://app.test/b": { status: 200 } });
    await t.run("http://app.test/a", { headers: { accept: "text/html", referer: "::not a url::" } });
    assert.deepEqual(t.sent[1], ["http://app.test/b", { accept: "text/html" }]);
  });

  test("a chain that ends on an allowed page: each hop requested once, the browser opens its end with the answer already fetched", async () => {
    const s = fakeSite({
      "http://app.test/signin": { status: 302, location: "https://idp.test/authorize" },
      "https://idp.test/authorize": { status: 303, location: "http://app.test/callback?code=1" },
      "http://app.test/callback?code=1": { status: 302, location: "/home#top" },
      "http://app.test/home": { status: 200 },
    });
    const first = await s.run("http://app.test/signin");
    assert.equal(first.status, 200);
    assert.match(first.body, /<script>location\.replace\("http:\/\/app\.test\/home#top"\)<\/script>/);
    const hops = ["http://app.test/signin", "https://idp.test/authorize", "http://app.test/callback?code=1"];
    assert.deepEqual(s.requested, [...hops, "http://app.test/home"]);
    const landing = s.guard.landing(s.top);
    assert.deepEqual([landing.url, landing.response.status()], ["http://app.test/home#top", 200]);
    // The navigation to the end of the chain gets the answer the guard fetched: the server is not asked again.
    assert.deepEqual(await s.run("http://app.test/home#top"), { response: 200 });
    assert.deepEqual(s.requested, [...hops, "http://app.test/home"]);
    assert.equal(s.guard.landing(s.top), landing, "still the frame's landing while it opens it");
    // Once: a later navigation to the same page asks the server, and the frame's landing is forgotten.
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 });
    assert.deepEqual(s.requested, [...hops, "http://app.test/home", "http://app.test/home"]);
    assert.equal(s.guard.landing(s.top), undefined);
    // Another frame (an iframe) has its own landing.
    const inner = { parentFrame: () => s.top };
    assert.equal((await s.run("http://app.test/signin", { frame: inner })).status, 200);
    assert.deepEqual([s.guard.landing(inner).url, s.guard.landing(s.top)], ["http://app.test/home#top", undefined]);
    // A frame that goes elsewhere before opening the end of its chain: the answer held for it is dropped.
    assert.deepEqual(await s.run("http://app.test/elsewhere", { frame: inner }), { response: 404 });
    assert.deepEqual(await s.run("http://app.test/home", { frame: inner }), { response: 200 });
    assert.equal(s.requested.filter((u) => u === "http://app.test/home").length, 4);
  });

  test("the answer held for a frame is only that frame's: another frame, or a pop-up being created, asks the server", async () => {
    const s = fakeSite({
      "http://app.test/signin": { status: 302, location: "/home" },
      "http://app.test/home": { status: 200 },
    });
    const other = { parentFrame: () => null };
    assert.equal((await s.run("http://app.test/signin")).status, 200);
    assert.deepEqual(await s.run("http://app.test/home", { frame: other }), { response: 200 });
    assert.equal(s.requested.filter((u) => u === "http://app.test/home").length, 2, "another frame: asked again");
    assert.equal((await s.run("http://app.test/signin", { frame: null })).status, 200);
    assert.equal(s.guard.landing(s.top).url, "http://app.test/home", "the top frame's landing is untouched");
    assert.deepEqual(await s.run("http://app.test/home", { frame: null }), { response: 200 });
    assert.equal(s.requested.filter((u) => u === "http://app.test/home").length, 4, "no frame: asked again");
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 });
    assert.equal(s.requested.filter((u) => u === "http://app.test/home").length, 4, "its own frame: the held answer");
  });

  test("after a goto, the page is awaited at the end of the chain the guard followed, and its answer read (afterRedirects)", async () => {
    const top = {};
    const waits = [];
    const page = {
      mainFrame: () => top,
      waitForURL: async (match, options) => waits.push([match, options]),
    };
    const goto = { status: () => 200 };
    const end = { status: () => 401 };
    // No chain followed for this frame: the goto's own answer, nothing awaited.
    assert.equal(await afterRedirects(page, { landing: () => undefined }, goto, { timeout: 5 }), goto);
    assert.deepEqual(waits, []);
    const guard = {
      landing: (frame) => (frame === top ? { url: "http://app.test/home#top", response: end } : undefined),
    };
    assert.equal(await afterRedirects(page, guard, goto, { timeout: 5 }), end, "the end's answer: a 401 is seen");
    assert.equal(waits.length, 1);
    const [match, options] = waits[0];
    assert.deepEqual(options, { waitUntil: "load", timeout: 5 });
    assert.deepEqual(
      ["http://app.test/home", "http://app.test/home#other", "http://app.test/signin", "http://app.test/home/"].map(
        (u) => match(new URL(u)),
      ),
      [true, true, false, false],
    );
    await afterRedirects(page, guard, goto, { waitUntil: "domcontentloaded", timeout: 7 });
    assert.deepEqual(waits[1][1], { waitUntil: "domcontentloaded", timeout: 7 });
  });

  test("the session check reads the answer at the end of the chain: a 401 there means expired (checkSession settle)", async () => {
    const goto = { status: () => 200 };
    const page = { goto: async () => goto, waitForLoadState: async () => {} };
    const auth = { options: { start: "/" }, adapter: { session: async () => ({ who: "robin" }) } };
    const settled = [];
    const settle = (end) => async (p, r) => (settled.push([p, r]), end);
    assert.equal(
      await checkSession(page, { url: "http://app.test", auth, settle: settle({ status: () => 401 }) }),
      null,
    );
    assert.deepEqual(settled, [[page, goto]]);
    assert.deepEqual(await checkSession(page, { url: "http://app.test", auth, settle: settle(goto) }), {
      who: "robin",
    });
    assert.deepEqual(await checkSession(page, { url: "http://app.test", auth }), { who: "robin" }, "no guard: as is");
  });

  test("local network access is given back to a loopback application's own origin only, and only with forbidden routes", () => {
    const m = forbiddenMatchers(["^/x$"]);
    const grant = (origin) => [["local-network-access"], { origin }];
    assert.deepEqual(localNetworkGrant("http://localhost:3000/app", m), grant("http://localhost:3000"));
    assert.deepEqual(localNetworkGrant("http://127.0.0.1:8080", m), grant("http://127.0.0.1:8080"));
    assert.deepEqual(localNetworkGrant("http://[::1]:3000", m), grant("http://[::1]:3000"));
    assert.equal(localNetworkGrant("http://192.168.1.20:3000", m), null, "a LAN address");
    assert.equal(localNetworkGrant("https://app.example.com", m), null, "a remote application");
    assert.equal(
      localNetworkGrant("http://localhost:3000", []),
      null,
      "no forbidden route: the browser loads the pages",
    );
  });

  test("a redirect whose location has no fragment keeps the request's, as a browser does", async () => {
    const s = fakeSite({
      "http://app.test/old": { status: 301, location: "/home" },
      "http://app.test/home": { status: 200 },
    });
    const first = await s.run("http://app.test/old#tab");
    assert.match(first.body, /location\.replace\("http:\/\/app\.test\/home#tab"\)/);
    assert.deepEqual(s.requested, ["http://app.test/old", "http://app.test/home"]);
  });

  test("without capture.forbidden, a navigation is left to the browser (nothing to protect)", async () => {
    const s = fakeSite({ "http://app.test/sso": { status: 302, location: "/home" } }, { forbidden: [] });
    assert.equal(await s.run("http://app.test/sso"), "fallback");
    assert.deepEqual(s.requested, []);
  });

  test("forbidden routes: encoded, doubled-slash and trailing-slash forms of a path match too", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$"]);
    for (const p of [
      "/orders/7/approval",
      "/orders/7%2Fapproval",
      "/orders/7/appr%6Fval",
      "//orders//7/approval",
      "/orders/7/approval/",
    ])
      assert.ok(forbiddenMatch(p, m), p);
    assert.equal(forbiddenMatch("/orders/7%ZZ", m), null, "a malformed escape is read as written, never thrown");
  });

  test("forbidden routes: dot segments and path parameters resolved as a server does, each with its minimal pair", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$"]);
    // [a form a server reads as the forbidden route, the closest form it does not]
    const pairs = [
      ["/orders/7/./approval", "/orders/7/.x/approval"],
      ["/orders/7/x/../approval", "/orders/7/x/.../approval"],
      ["/orders/x/../7/approval", "/orders/x/../x/7/approval"],
      ["/../orders/7/approval", "/../x/orders/7/approval"],
      ["/orders/7/approval/.", "/orders/7/approval/.."],
      ["/orders/7/%2e/approval", "/orders/7/%2e%2e%2e/approval"],
      ["/orders/7/x/%2E%2E/approval", "/orders/7/x/%2E%2E%2E/approval"],
      ["/orders/7/approval;jsessionid=0A1B2C", "/orders/7/approval:jsessionid=0A1B2C"],
      ["/orders;v=1/7/approval", "/orders,v=1/7/approval"],
      ["/orders/7;x=y/approval/", "/orders/7:x=y/approval/"],
      ["/orders/7/approval%3Bx=1", "/orders/7/approval%3Ax=1"],
      ["//orders/./7//x/../approval;a", "//orders/./7//x/../approvals;a"],
      // A backslash is a slash to IIS and ASP.NET.
      ["/orders/7%5Capproval", "/orders/7%5Bapproval"],
      ["/orders/7/x%5C..%5Capproval", "/orders/7/x%5C...%5Capproval"],
    ];
    for (const [hit, miss] of pairs) {
      assert.equal(forbiddenMatch(hit, m), "^/orders/\\d+/approval$", hit);
      assert.equal(forbiddenMatch(miss, m), null, miss);
    }
    // A dot segment at the end leaves the path a folder: "/admin/x/.." is "/admin/", for a pattern that wants the slash.
    const folder = forbiddenMatchers(["^/admin/$"]);
    assert.equal(forbiddenMatch("/admin/x/..", folder), "^/admin/$");
    assert.equal(forbiddenMatch("/admin/x/.x", folder), null);
  });

  test("forbidden routes: on the path only, invalid expression → exit code 2", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$", "/sync"]);
    assert.equal(forbiddenMatch("/orders/12/approval?x=1#y", m), "^/orders/\\d+/approval$");
    assert.equal(forbiddenMatch("/orders/12", m), null);
    assert.equal(forbiddenMatch("/admin/sync-now", m), "/sync");
    assert.equal(routePath("/a?b"), "/a");
    assert.throws(
      () => forbiddenMatchers(["("]),
      (e) => e.code === 2 && e.details[0].path === "capture.forbidden[0]",
    );
  });
});

describe("measures and helpers", () => {
  test("zone in percentages of the clip; marker in the corner when there is no room on the left", () => {
    const clip = { x: 100, y: 50, width: 800, height: 400 };
    assert.deepEqual(measureZone(1, { x: 300, y: 150, width: 200, height: 100 }, clip, { caption: "Total" }), {
      n: 1,
      x: 25,
      y: 25,
      w: 25,
      h: 25,
      label: "Total",
    });
    assert.deepEqual(measureZone(2, { x: 110, y: 50, width: 80, height: 40 }, clip), {
      n: 2,
      x: 1.25,
      y: 0,
      w: 10,
      h: 10,
      side: "corner",
    });
    assert.equal(measureZone(3, { x: 110, y: 50, width: 80, height: 40 }, clip, { side: "right" }).side, "right");
  });

  test("map framing: lon/lat → Web Mercator; x/y/z as is; nothing without capture.map", () => {
    const map = { x: "mx", y: "my", z: "mz" };
    assert.equal(routeWithView("/map", { lon: 0, lat: 0, zoom: 5 }, map), "/map?mx=0.00&my=0.00&mz=5");
    assert.match(
      routeWithView("/map?a=1", { lon: 180, lat: 0, zoom: 3 }, map),
      /^\/map\?a=1&mx=20037508\.34&my=0\.00&mz=3$/,
    );
    assert.equal(
      routeWithView("/map", { x: 2.5, y: 48.1, z: 11 }, { x: "lon", y: "lat", z: "z" }),
      "/map?lon=2.5&lat=48.1&z=11",
    );
    assert.equal(routeWithView("/map", { lon: 1, lat: 1, zoom: 1 }, null), "/map");
  });

  test("storage values, request summary (bot challenges grouped), zone file", () => {
    assert.deepEqual(storageValues({ a: "x{version}", b: { open: true }, c: 3 }, "1.2.0"), {
      a: "x1.2.0",
      b: '{"open":true}',
      c: "3",
    });
    assert.deepEqual(
      summarizeRequests([
        "POST /api/presence",
        "POST /cdn-cgi/challenge-platform/h/b/jsd/r/1",
        "POST /cdn-cgi/challenge-platform/h/b/jsd/r/2",
        "POST /api/presence",
      ]),
      ["POST /api/presence", "POST /cdn-cgi/challenge-platform/…"],
    );
    const z = zoneFile({
      entry: { id: "x", route: "/r" },
      clip: { width: 99.6, height: 50.2 },
      zones: [],
      version: "1.0.0",
      captured: "2026-10-01",
    });
    assert.deepEqual(z, {
      file: "x.webp",
      title: "",
      route: "/r",
      width: 100,
      height: 50,
      version: "1.0.0",
      captured: "2026-10-01",
      zones: [],
    });
  });

  test("zone file: commit and plan (ARCHITECTURE.md §6.10) are included only when given", () => {
    const base = {
      entry: { id: "x", route: "/r" },
      clip: { width: 100, height: 50 },
      zones: [],
      version: "1.0.0",
      captured: "2026-10-01",
    };
    assert.deepEqual(Object.keys(zoneFile(base)), [
      "file",
      "title",
      "route",
      "width",
      "height",
      "version",
      "captured",
      "zones",
    ]);
    assert.deepEqual(zoneFile({ ...base, commit: "9f2c0ff", plan: "c0ffee00c0ffee00" }), {
      file: "x.webp",
      title: "",
      route: "/r",
      width: 100,
      height: 50,
      version: "1.0.0",
      captured: "2026-10-01",
      zones: [],
      commit: "9f2c0ff",
      plan: "c0ffee00c0ffee00",
    });
    assert.deepEqual(zoneFile({ ...base, commit: null, plan: null }), {
      file: "x.webp",
      title: "",
      route: "/r",
      width: 100,
      height: 50,
      version: "1.0.0",
      captured: "2026-10-01",
      zones: [],
    });
  });

  test("target and action descriptions; targets helpers (union)", () => {
    assert.equal(describeTarget({ role: "button", name: "Save" }), "role button “Save”");
    assert.equal(describeTarget({ union: [{ field: "A" }, { css: "b" }] }), "field “A” + css “b”");
    assert.equal(actionKind({ wait: 3 }), "wait");
    assert.deepEqual(targets.union(targets.field("A"), [targets.button("B")]), {
      union: [{ field: "A" }, { role: "button", name: "B", exact: false }],
    });
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
    assert.equal(
      sessionFile("/p", config, { ACME_SESSION: "s.json", DOC_KIT_SESSION: "k.json" }),
      path.resolve("/p", "k.json"),
    );
    const dir = tempDir();
    try {
      const f = path.join(dir, "s.json");
      fs.writeFileSync(
        f,
        JSON.stringify({
          cookies: [],
          origins: [{ origin: "http://a", localStorage: [{ name: "token", value: "t" }] }],
        }),
      );
      assert.deepEqual(sessionStorageOf(f, "http://a"), { token: "t" });
      assert.deepEqual(sessionStorageOf(f, "http://b"), {});
      assert.equal(forgetSession(f), true);
      assert.equal(forgetSession(f), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("compare outcome: a different size, or a ratio above the threshold, is a change (ARCHITECTURE.md §6.10)", () => {
    assert.equal(compareOutcome({ ratio: 0, sameSize: true, threshold: 0.005 }), "unchanged");
    assert.equal(
      compareOutcome({ ratio: 0.005, sameSize: true, threshold: 0.005 }),
      "unchanged",
      "at the threshold: not above it",
    );
    assert.equal(compareOutcome({ ratio: 0.0051, sameSize: true, threshold: 0.005 }), "changed");
    assert.equal(compareOutcome({ ratio: 1, sameSize: false, threshold: 0.005 }), "changed");
    assert.equal(
      compareOutcome({ ratio: 0, sameSize: false, threshold: 0.005 }),
      "changed",
      "a size mismatch is always a change, whatever the ratio",
    );
  });

  test("WebP header size (VP8, VP8L, VP8X); not a WebP → null", () => {
    const riff = (chunk, bytes) =>
      Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("WEBP"),
        Buffer.from(chunk),
        Buffer.from(bytes),
      ]);
    const vp8x = riff("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x06, 0x00, 0x8b, 0x02, 0x00, 0, 0]);
    assert.deepEqual(webpSize(vp8x), { width: 1600, height: 652 });
    assert.equal(webpSize(Buffer.from("not an image at all, really not one")), null);
  });
});

describe("masking", () => {
  test(".env parsing: export, quotes, comments", () => {
    assert.deepEqual(
      parseEnv("# c\nexport API_URL=\"https://api.example.org/v1\" # main\nTENANT_ID=abc-123 # id\nEMPTY=\nQ='x y'\n"),
      [
        { key: "API_URL", value: "https://api.example.org/v1", line: 2 },
        { key: "TENANT_ID", value: "abc-123", line: 3 },
        { key: "EMPTY", value: "", line: 4 },
        { key: "Q", value: "x y", line: 5 },
      ],
    );
  });

  test("sensitive values: key names, length > 6, exclusions, several files, duplicates once", () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(
        path.join(dir, ".env"),
        "API_URL=https://api.internal.example\nDB_HOST=localhost:5432\nPORT=3000000\nSHORT_KEY=abc\nADMIN_EMAIL=ops@example.org\nCLIENT_SECRET=s3cr3t-value\n",
      );
      fs.writeFileSync(
        path.join(dir, ".env.local"),
        "API_URL=https://api.internal.example\nSTORAGE_ACCOUNT=acmestorage01\n",
      );
      const v = sensitiveValues(dir, {
        env: [".env", ".env.local", "missing.env"],
        exclude: "localhost|127\\.0\\.0\\.1",
      });
      assert.deepEqual(
        v.map((x) => x.key),
        ["API_URL", "ADMIN_EMAIL", "CLIENT_SECRET", "STORAGE_ACCOUNT"],
      );
      assert.deepEqual(
        sensitiveValues(dir, { env: [".env"], exclude: null }).map((x) => x.key),
        ["API_URL", "DB_HOST", "ADMIN_EMAIL", "CLIENT_SECRET"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("masking expression: longest value first, GUIDs, patterns; nothing to mask → null", () => {
    const src = maskSource(["https://api.example.org", "https://api.example.org/v1"], {
      guid: true,
      patterns: ["acct-\\d+"],
    });
    assert.equal(
      maskText("see https://api.example.org/v1/x and 7D3C5A1E-9B2F-4C6D-8E1A-2F3B4C5D6E7F, acct-42", src),
      `see ${DOTS}/x and ${DOTS}, ${DOTS}`,
    );
    assert.equal(maskSource([], { guid: false, patterns: [] }), null);
    assert.equal(maskText("a.b", maskSource(["a.b"], { guid: false })), DOTS);
    assert.equal(maskText("axb", maskSource(["a.b"], { guid: false })), "axb");
  });
});

describe("CLI: --compare, --stale (ARCHITECTURE.md §6.10), no browser needed on this path", () => {
  async function cli(args) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
    });
    return { code, out, err };
  }

  // The demo's own plans import "doc-kit/targets" (resolves only inside the kit, test/e2e/capture.test.mjs):
  // replaced with a trivial local plan, since these tests never reach the browser.
  function trivialPlans(dir) {
    fs.rmSync(path.join(dir, "captures", "plans"), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "captures", "plans"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "captures", "plans", "a.mjs"),
      'export const CAPTURES = [{ id: "a", route: "/a" }];',
    );
  }

  test("--stale without a sync report → capture.noSyncReport, exit code 2 (checked before any URL or session)", async () => {
    const dir = demoCopy();
    try {
      trivialPlans(dir);
      const r = await cli(["capture", "--project", dir, "--stale"]);
      assert.equal(r.code, 2, r.out + r.err);
      assert.match(r.err, /✖ no sync report yet: .*sync-report\.json\n {2}→ run doc-kit sync first/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--stale narrows the plans to the ids of .doc-kit/sync-report.json; nothing stale → exit code 0, nothing opened", async () => {
    const dir = demoCopy();
    try {
      trivialPlans(dir);
      fs.mkdirSync(path.join(dir, ".doc-kit"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".doc-kit", "sync-report.json"), JSON.stringify({ captures: [] }));
      const r = await cli(["capture", "--project", dir, "--stale"]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.equal(r.out.trim(), "Nothing is stale: every capture already matches the application.");
      assert.doesNotMatch(r.out, /captures? ·/, "nothing was opened");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      ...["changed", "unchanged"].map((k) => `cli.capture.compare.${k}`),
      ...["notFound", "blockNotFound", "error", "unknown"].map((k) => `cli.adapter.reason.${k}`),
      ...[
        "env",
        "guid",
        "pattern",
        "privateKey",
        "jwt",
        "connectionString",
        "credentialsUrl",
        "cloudKey",
        "assignment",
        "signedUrl",
      ].map((k) => `cli.check.secrets.kind.${k}`),
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
    const vars = (v) =>
      [
        ...new Set(
          (typeof v === "object" ? Object.values(v) : [v]).flatMap((t) =>
            [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
          ),
        ),
      ].sort();
    for (const k of Object.keys(a)) {
      assert.deepEqual(vars(b[k]), vars(a[k]), k);
      assert.equal(typeof b[k], typeof a[k], k);
      assert.ok(k.startsWith("cli."), k);
    }
  });
});

describe("session file (SECURITY.md, AUDIT.md S10)", () => {
  test("written readable by its owner only from its first byte, replacing an older file with wider rights", () => {
    const dir = tempDir();
    try {
      const file = path.join(dir, "session.json");
      fs.writeFileSync(file, "old", { mode: 0o644 });
      writePrivateFile(file, '{"cookies":[]}');
      assert.equal(fs.readFileSync(file, "utf8"), '{"cookies":[]}');
      // Windows ignores the mode (the file takes its folder's rights there, as SECURITY.md says): the rights are
      // checked where the system applies them.
      if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      writePrivateFile(path.join(dir, "new.json"), "{}");
      if (process.platform !== "win32") assert.equal(fs.statSync(path.join(dir, "new.json")).mode & 0o777, 0o600);
      // No temporary file is left behind.
      assert.deepEqual(fs.readdirSync(dir).sort(), ["new.json", "session.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
