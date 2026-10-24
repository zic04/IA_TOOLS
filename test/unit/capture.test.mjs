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
  shownPath,
  shownUrl,
  applicationKey,
} from "../../engine/capture/plans.mjs";
import { measureZone, routeWithView, describeTarget, actionKind } from "../../engine/capture/actions.mjs";
import { storageValues, summarizeRequests, zoneFile } from "../../engine/capture/capture.mjs";
import {
  forbiddenRequestKind,
  requestGuard,
  localNetworkGrant,
  addressForm,
  blockSpeculationRules,
} from "../../engine/capture/guard.mjs";
import { afterRedirects, SessionExpired, originOf } from "../../engine/capture/take.mjs";
import { TIMINGS } from "../../engine/capture/timings.mjs";
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
   * with the headers it set in `sent` (none: the request's own, as the browser built them), and the timeout it gave
   * in `timeouts`. The request carries a cookie and a referrer, like a navigation of a signed-in page. A page of the
   * site may take `ms` on the fake clock (a hop past its timeout fails as Playwright's do), weigh `bytes` and carry
   * `headers`; each answer freed by the guard is in `disposed`, each wait for a frame's next commit in `commits`.
   * What the browser gets is `{ response: status, headers }` (an answer the guard fetched) or `{ status, body }` (its
   * own page). `newPage()` gives another page and its top-level frame; `close(page)` closes one.
   */
  function fakeSite(site, { forbidden = forbiddenMatchers(["^/orders/\\d+/approval$"]), appOrigin, limits } = {}) {
    const result = { blocked: [], refused: [], prefetched: [] };
    const navigations = [];
    const stops = [];
    const requested = [];
    const sent = [];
    const timeouts = [];
    const disposed = [];
    const commits = [];
    let clock = 0;
    const closing = new Map();
    const pageOf = (frames) => ({
      waitForEvent: async (event, { predicate, timeout }) => {
        commits.push([event, timeout]);
        return frames.find(predicate) ?? null;
      },
      once: (event, handler) => {
        assert.equal(event, "close");
        assert.ok(!closing.has(frames), "one handler per page");
        closing.set(frames, handler);
      },
    });
    const newPage = () => {
      const frames = [];
      const page = pageOf(frames);
      const frameIn = (parent) => {
        const frame = { parentFrame: () => parent, page: () => page };
        frames.push(frame);
        return frame;
      };
      return { page, frames, frameIn, top: frameIn(null) };
    };
    const first = newPage();
    const { top, frameIn } = first;
    const close = ({ frames }) => closing.get(frames)?.();
    const guard = requestGuard({
      appOrigin: appOrigin || "http://app.test",
      forbidden,
      readOnly: true,
      result,
      onNavigation: (p) => navigations.push(p),
      onStop: (key, vars) => stops.push([key, vars]),
      ...(limits ? { limits } : {}),
      now: () => clock,
    });
    const answer = (target, timeout) => {
      requested.push(target);
      const r = site[target] || { status: 404 };
      timeouts.push(timeout);
      if ((r.ms || 0) > timeout) {
        clock += timeout;
        throw Object.assign(new Error(`apiResponse: Timeout ${timeout}ms exceeded`), { name: "TimeoutError" });
      }
      clock += r.ms || 0;
      return {
        status: () => r.status,
        headers: () => ({ ...(r.location ? { location: r.location } : {}), ...(r.headers || {}) }),
        body: async () => Buffer.alloc(r.bytes || 0),
        dispose: async () => disposed.push(target),
      };
    };
    const signedIn = { accept: "text/html", cookie: "sid=APP", referer: "http://app.test/orders?page=2" };
    const seenHeaders = [];
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
        fetch: async ({ url: target, maxRedirects, headers, timeout } = {}) => {
          assert.equal(maxRedirects, 0, "the guard never lets a request follow a redirect");
          sent.push([target || url, headers]);
          await site[(target || url).split("#")[0]]?.gate; // a server that answers when the test says so
          return answer((target || url).split("#")[0], timeout); // a fragment is never sent
        },
        fulfill: async ({ response, status, body, headers }) => {
          if (response) seenHeaders.push(headers);
          outcome = response ? { response: response.status() } : { status, body };
        },
        abort: async (r) => (outcome = `abort:${r}`),
        fallback: async () => (outcome = "fallback"),
      });
      return outcome;
    };
    return {
      run,
      guard,
      top,
      frameIn,
      newPage,
      close,
      result,
      navigations,
      stops,
      requested,
      sent,
      timeouts,
      disposed,
      commits,
      seenHeaders,
    };
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
    // An iframe gets the end of its chain directly, never the guard's page: a sandboxed one could not run its
    // script (it would stay blank, and the answer held for it would never be opened).
    const inner = s.frameIn(s.top);
    assert.deepEqual(await s.run("http://app.test/signin", { frame: inner }), { response: 200 });
    assert.deepEqual([s.guard.landing(inner), s.guard.held()], [undefined, 0]);
    // A top-level frame that goes elsewhere before opening the end of its chain: the answer held for it is dropped.
    assert.equal((await s.run("http://app.test/signin")).status, 200);
    assert.deepEqual(await s.run("http://app.test/elsewhere"), { response: 404 });
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 });
    assert.equal(s.requested.filter((u) => u === "http://app.test/home").length, 5);
  });

  test("the answer held for a frame is only that frame's: another frame, or a pop-up being created, asks the server", async () => {
    const s = fakeSite({
      "http://app.test/signin": { status: 302, location: "/home" },
      "http://app.test/home": { status: 200 },
    });
    const other = s.frameIn(null);
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

  test("each answer the guard fetched is freed: a hop's once read, the end's once the browser has it, a held one once opened or dropped", async () => {
    const s = fakeSite({
      "http://app.test/signin": { status: 302, location: "https://idp.test/authorize" },
      "https://idp.test/authorize": { status: 302, location: "http://app.test/home" },
      "http://app.test/home": { status: 200 },
      "http://app.test/latest": { status: 302, location: "/orders/7/approval" },
    });
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 });
    assert.deepEqual(s.disposed, ["http://app.test/home"], "the answer itself, once the browser has it");
    assert.equal((await s.run("http://app.test/signin")).status, 200);
    assert.deepEqual(s.disposed.slice(1), ["http://app.test/signin", "https://idp.test/authorize"], "each hop");
    assert.deepEqual(s.commits, [], "the end is held, not opened yet");
    // The frame opens the end: its next commit awaited (the signal of afterRedirects), the held answer freed after.
    const landing = s.guard.landing(s.top);
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 });
    assert.deepEqual(s.commits, [["framenavigated", TIMINGS.page]]);
    assert.equal(await landing.committed, s.top);
    assert.deepEqual(s.disposed.slice(3), ["http://app.test/home"]);
    // A frame that goes elsewhere before opening the end of its chain: the held answer is freed, its wait fails.
    assert.equal((await s.run("http://app.test/signin")).status, 200);
    const dropped = s.guard.landing(s.top);
    assert.equal(await s.run("http://app.test/latest"), "abort:blockedbyclient");
    const settled = (p) =>
      Promise.race([
        p.then(
          () => "committed",
          (e) => e.message,
        ),
        new Promise(setImmediate),
      ]);
    assert.match(await settled(dropped.committed), /went elsewhere before the end of its redirects/);
    assert.deepEqual(s.disposed.slice(4), [
      "http://app.test/signin",
      "https://idp.test/authorize",
      "http://app.test/home",
      "http://app.test/latest",
    ]);
    // A pop-up being created holds nothing: the end it fetched is freed at once.
    assert.equal((await s.run("http://app.test/signin", { frame: null })).status, 200);
    assert.equal(s.disposed.at(-1), "http://app.test/home");
  });

  test("a hop gets the hop timeout at most, and the whole chain its deadline: a slow chain is stopped and said, never followed further", async () => {
    const limits = { hop: 100, chain: 250, bytes: 1000, held: 5000 };
    const secret = ["SESSION", "SECRET", "42"].join("-");
    const s = fakeSite(
      {
        "http://app.test/slow": { status: 200, ms: 101 },
        [`http://app.test/a;jsessionid=${secret}?token=${secret}`]: { status: 302, location: "/b", ms: 90 },
        "http://app.test/b": { status: 302, location: "/c", ms: 90 },
        "http://app.test/c": { status: 302, location: "/d", ms: 70 },
        "http://app.test/d": { status: 200 },
        "http://app.test/quick": { status: 302, location: "/d", ms: 100 },
      },
      { limits },
    );
    // One hop past its timeout.
    assert.equal(await s.run("http://app.test/slow"), "abort:timedout");
    assert.deepEqual(s.timeouts, [100]);
    assert.deepEqual(s.stops, [["redirectTimeout", { route: "/slow", seconds: 1 }]]);
    // The whole chain past its deadline: each hop gets what is left of it, and no hop is asked once it has passed.
    assert.equal(await s.run(`http://app.test/a;jsessionid=${secret}?token=${secret}`), "abort:timedout");
    assert.deepEqual(s.timeouts.slice(1), [100, 100, 70]);
    assert.ok(!s.requested.includes("http://app.test/d"));
    assert.deepEqual(s.stops[1], ["redirectTimeout", { route: "/a", seconds: 1 }], "reported without its parameters");
    // Within both bounds: followed.
    assert.match((await s.run("http://app.test/quick")).body, /location\.replace\("http:\/\/app\.test\/d"\)/);
    assert.equal(s.stops.length, 2);
    // An iframe's chain too slow: aborted, the capture goes on.
    assert.equal(await s.run("http://app.test/slow", { frame: s.frameIn(s.top) }), "abort:timedout");
    assert.equal(s.stops.length, 2);
    // Playwright's own bounds, without a test seam.
    const real = fakeSite({
      "http://app.test/x": { status: 302, location: "/y" },
      "http://app.test/y": { status: 200 },
    });
    await real.run("http://app.test/x");
    assert.deepEqual(real.timeouts, [TIMINGS.redirectHop, TIMINGS.redirectHop]);
    assert.ok(TIMINGS.redirectHop <= TIMINGS.redirectChain && TIMINGS.redirectChain < TIMINGS.start);
  });

  test("the answer held for a frame is capped: past the cap the navigation is refused and said; the end itself is not held", async () => {
    const limits = { hop: 100, chain: 250, bytes: 1000, held: 5000 };
    const s = fakeSite(
      {
        "http://app.test/big": { status: 302, location: "/huge" },
        "http://app.test/huge": { status: 200, bytes: 1001 },
        "http://app.test/fits": { status: 302, location: "/full" },
        "http://app.test/full": { status: 200, bytes: 1000 },
      },
      { limits },
    );
    assert.equal(await s.run("http://app.test/big"), "abort:failed");
    assert.deepEqual(s.stops, [["landingTooLarge", { route: "/big", mb: 0 }]]);
    assert.equal(s.guard.landing(s.top), undefined);
    assert.deepEqual(s.disposed, ["http://app.test/big", "http://app.test/huge"]);
    assert.equal((await s.run("http://app.test/fits")).status, 200);
    assert.equal(s.guard.landing(s.top).url, "http://app.test/full");
    // An answer handed to the browser as is (no redirect) is not held: no cap.
    assert.deepEqual(await s.run("http://app.test/huge"), { response: 200 });
    assert.equal(s.stops.length, 1);
  });

  test("the answers held for all frames are capped together; one is no longer counted once opened, nor once its page closes", async () => {
    const limits = { hop: 100, chain: 250, bytes: 1000, held: 1500 };
    const s = fakeSite(
      {
        "http://app.test/a": { status: 302, location: "/end" },
        "http://app.test/end": { status: 200, bytes: 800 },
        "http://app.test/b": { status: 302, location: "/fits" },
        "http://app.test/fits": { status: 200, bytes: 700 },
      },
      { limits },
    );
    const second = s.newPage();
    const third = s.newPage();
    assert.equal((await s.run("http://app.test/a")).status, 200);
    assert.equal(s.guard.held(), 800);
    // Another page (a pop-up) whose end would bring the total over the cap: refused, and said; nothing held for it.
    assert.equal(await s.run("http://app.test/a", { frame: second.top }), "abort:failed");
    assert.deepEqual(s.stops, [["heldTooLarge", { route: "/a", mb: 0 }]]);
    assert.deepEqual([s.guard.landing(second.top), s.guard.held()], [undefined, 800]);
    assert.equal(s.disposed.at(-1), "http://app.test/end", "the refused end is freed");
    // Up to the cap exactly: held.
    assert.equal((await s.run("http://app.test/b", { frame: third.top })).status, 200);
    assert.equal(s.guard.held(), 1500);
    // The first page opens its end: no longer counted, the other page's end fits.
    assert.deepEqual(await s.run("http://app.test/end"), { response: 200 });
    assert.equal(s.guard.held(), 700);
    assert.equal((await s.run("http://app.test/a", { frame: second.top })).status, 200);
    assert.equal(s.guard.held(), 1500);
    // A page that closes before opening its end: what was held for it is freed, its wait fails.
    const held = s.guard.landing(second.top);
    const freed = s.disposed.length;
    s.close(second);
    assert.deepEqual([s.guard.landing(second.top), s.guard.held()], [undefined, 700]);
    await assert.rejects(held.committed, /went elsewhere/);
    assert.deepEqual(s.disposed.slice(freed), ["http://app.test/end"]);
    // A page that has opened its end: closing it frees nothing twice.
    assert.deepEqual(await s.run("http://app.test/fits", { frame: third.top }), { response: 200 });
    assert.equal(s.guard.held(), 0);
    const opened = s.disposed.length;
    s.close(third);
    assert.deepEqual([s.disposed.length, s.guard.held()], [opened, 0]);
    // Playwright's own bounds, without a test seam: 32 MB for one end, 64 MB for all.
    const real = fakeSite({
      "http://app.test/x": { status: 302, location: "/y" },
      "http://app.test/y": { status: 200, bytes: 32 * 2 ** 20 },
    });
    const pages = [real.newPage(), real.newPage(), real.newPage()];
    for (const p of pages.slice(0, 2))
      assert.equal((await real.run("http://app.test/x", { frame: p.top })).status, 200);
    assert.equal(await real.run("http://app.test/x", { frame: pages[2].top }), "abort:failed");
    assert.deepEqual(real.stops, [["heldTooLarge", { route: "/x", mb: 64 }]]);
  });

  test("a frame's chain that ends after the frame's next navigation started: held in place of the end held before, nothing left held once the page closes, round after round", async () => {
    const site = {
      "http://app.test/slow": { status: 302, location: "/end-a" },
      "http://app.test/end-a": { status: 200, bytes: 500 },
      "http://app.test/b": { status: 302, location: "/end-b" },
      "http://app.test/end-b": { status: 200, bytes: 300 },
    };
    const s = fakeSite(site);
    for (let round = 1; round <= 3; round++) {
      const page = s.newPage();
      let answer;
      site["http://app.test/slow"].gate = new Promise((resolve) => (answer = resolve));
      // The page opens /slow, whose server is slow, then /b before /slow answers: /b's end is held first.
      const slow = s.run("http://app.test/slow", { frame: page.top });
      assert.equal((await s.run("http://app.test/b", { frame: page.top })).status, 200);
      assert.equal(s.guard.held(), 300, `round ${round}`);
      // /slow answers at last: its end is held for the frame, /b's (never opened now) dropped and freed.
      const freed = s.disposed.length;
      answer();
      assert.equal((await slow).status, 200);
      assert.equal(s.guard.held(), 500, `round ${round}: only the frame's last end held`);
      assert.deepEqual(s.disposed.slice(freed), ["http://app.test/slow", "http://app.test/end-b"], "the hop, /b's end");
      s.close(page);
      assert.deepEqual([s.guard.landing(page.top), s.guard.held()], [undefined, 0], `round ${round}`);
    }
  });

  test("a document the browser gets from the guard has no Speculation-Rules header: Chromium would fetch the pages of its rules unseen", async () => {
    const headers = { "speculation-rules": '"/rules.json"', "content-type": "text/html" };
    const s = fakeSite({
      "http://app.test/home": { status: 200, headers },
      "http://app.test/a": { status: 302, location: "/home" },
    });
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 }, "the answer itself");
    assert.equal((await s.run("http://app.test/a")).status, 200);
    assert.deepEqual(await s.run("http://app.test/home"), { response: 200 }, "the answer held for the frame");
    assert.deepEqual(await s.run("http://app.test/a", { frame: s.frameIn(s.top) }), { response: 200 }, "an iframe");
    assert.deepEqual(s.seenHeaders, Array(3).fill({ "content-type": "text/html" }));
  });

  test("the end of a chain is one address in Node.js's form and in Chromium's: opened with the answer held, never asked again (addressForm)", async () => {
    const s = fakeSite({
      "http://app.test/pipe": { status: 302, location: "/end|x?q=a|b" },
      "http://app.test/end|x?q=a|b": { status: 401 },
    });
    const first = await s.run("http://app.test/pipe");
    assert.match(first.body, /location\.replace\("http:\/\/app\.test\/end\|x\?q=a\|b"\)/);
    // Chromium opens it as /end%7Cx?q=a%7Cb: the answer held (a 401, which afterRedirects reads), never asked again.
    assert.deepEqual(await s.run("http://app.test/end%7Cx?q=a%7Cb"), { response: 401 });
    assert.deepEqual(s.requested, ["http://app.test/pipe", "http://app.test/end|x?q=a|b"]);
    assert.equal(s.guard.landing(s.top).response.status(), 401);
    assert.deepEqual(
      [
        "http://a.test/x|y%7cz",
        "http://a.test/x%7Cy%7Cz#f|g",
        "http://a.test/a^b{c}`d'e\"f",
        "http://a.test/%2f/x;p=1?y=%2F&z=/:@!$()*+,",
        "http://a.test/100%",
      ].map(addressForm),
      [
        "http://a.test/x%7Cy%7Cz",
        "http://a.test/x%7Cy%7Cz",
        "http://a.test/a%5Eb%7Bc%7D%60d%27e%22f",
        "http://a.test/%2F/x;p=1?y=%2F&z=/:@!$()*+,",
        "http://a.test/100%",
      ],
    );
    // An escaped delimiter is another address than the delimiter itself.
    assert.notEqual(addressForm("http://a.test/a%2Fb"), addressForm("http://a.test/a/b"));
  });

  test("an address is shown by its origin and path only: never its query, fragment, credentials or path parameters (shownUrl, S7)", () => {
    const secret = ["SESSION", "SECRET", "42"].join("-");
    assert.deepEqual(
      [
        `http://127.0.0.1:3000/login;jsessionid=${secret}?state=${secret}&code=${secret}#${secret}`,
        `https://robin:${secret}@idp.test/authorize?x=${secret}`,
        "about:blank",
        `data:text/html,${secret}`,
        "chrome-error://chromewebdata/",
        "not a url",
      ].map((u) => shownUrl(u)),
      [
        "http://127.0.0.1:3000/login",
        "https://idp.test/authorize",
        "about:blank",
        "data:",
        "chrome-error://chromewebdata/",
        "",
      ],
    );
    // The sign-in page of an expired session, printed and written in --json (SessionExpired.url).
    const expired = new SessionExpired(`http://app.test/login;jsessionid=${secret}?code=${secret}`);
    assert.equal(expired.url, "http://app.test/login");
    assert.ok(!expired.message.includes(secret), expired.message);
  });

  test("the start page off the application is shown by its origin; one without an origin as shownUrl shows it, never its query (originOf, S7)", () => {
    const secret = ["SESSION", "SECRET", "42"].join("-");
    assert.deepEqual(
      [
        `http://idp.test:8080/authorize;jsessionid=${secret}?code=${secret}#${secret}`,
        `about:blank?code=${secret}#${secret}`,
        `data:text/html,${secret}`,
        `file:///C:/app/index.html?code=${secret}`,
        `blob:http://app.test/${secret}`,
        "not a url",
      ].map((u) => originOf(u)),
      ["http://idp.test:8080", "about:blank", "data:", "file:", "http://app.test", ""],
    );
  });

  test("a WebSocket to a forbidden route of the application is refused before it opens and listed, never its path parameters; any other is left to connect (socketGuard)", async () => {
    const secret = ["SESSION", "SECRET", "42"].join("-");
    const result = { blocked: [], refused: [], prefetched: [] };
    const forbidden = forbiddenMatchers(["^/orders/\\d+/approval$"]);
    const { sockets } = requestGuard({ appOrigin: "http://127.0.0.1:3000", forbidden, readOnly: true, result });
    const matches = (url) => sockets.matches(new URL(url));
    // Every address of the application (wss as https, a loopback alias), every form of the path.
    for (const url of [
      "ws://127.0.0.1:3000/orders/7/approval",
      "wss://127.0.0.1:3000/orders/7/approval",
      "ws://localhost:3000/orders/7/approval?x=1",
      `ws://127.0.0.1:3000/orders/7/approval;jsessionid=${secret}`,
      "ws://127.0.0.1:3000/orders/7/approval%2e",
    ])
      assert.equal(matches(url), true, url);
    // Another route, another port, another host: left to connect.
    for (const url of [
      "ws://127.0.0.1:3000/live",
      "ws://127.0.0.1:3000/orders/7/approval/x",
      "ws://127.0.0.1:4000/orders/7/approval",
      "wss://socket.example/orders/7/approval",
    ])
      assert.equal(matches(url), false, url);
    // Refused: closed as a failed connection, never connected; listed by its path only.
    const closed = [];
    await sockets.refuse(
      /** @type {any} */ ({
        url: () => `ws://127.0.0.1:3000/orders/7/approval;jsessionid=${secret}?token=${secret}`,
        close: async (options) => closed.push(options),
        connectToServer: () => assert.fail("a refused socket never reaches its server"),
      }),
    );
    assert.deepEqual(closed, [{ code: 1006 }]);
    assert.deepEqual(result.prefetched, ["GET /orders/7/approval"]);
    assert.deepEqual([result.refused, result.blocked], [[], []], "the capture goes on");
    // Without forbidden routes, no socket is refused.
    const none = requestGuard({ appOrigin: "http://127.0.0.1:3000", forbidden: [], readOnly: true, result });
    assert.equal(none.sockets.matches(new URL("ws://127.0.0.1:3000/orders/7/approval")), false);
  });

  /**
   * A page as blockSpeculationRules sees it (its global object): a document (its children made by `build`), elements
   * and shadow roots, each a light tree that querySelectorAll walks as a browser does (never into a shadow root), a
   * node removed from its parent; one mutation observer, whose records the test hands over (notify); the microtasks
   * run, and DOMContentLoaded fired, when the test says.
   */
  function fakePage(build = () => []) {
    const removed = [];
    const observers = [];
    const microtasks = [];
    const loaded = [];
    const descendants = (n) => n.children.flatMap((c) => [c, ...descendants(c)]);
    const node = (name, { localName = "div", type = "", children = [], shadowRoot = null, nodeType = 1 } = {}) => {
      const n = {
        name,
        nodeType,
        localName,
        type,
        children,
        shadowRoot,
        parent: null,
        remove: () => {
          removed.push(name);
          n.parent?.children.splice(n.parent.children.indexOf(n), 1);
          n.parent = null;
        },
        querySelectorAll: (selector) => descendants(n).filter((c) => selector === "*" || c.localName === selector),
      };
      for (const c of children) c.parent = n;
      return n;
    };
    const script = (name, type = "speculationrules") => node(name, { localName: "script", type });
    const shadow = (name, children) => node(name, { nodeType: 11, localName: undefined, children });
    const append = (parent, child) => {
      parent.children.push(child);
      child.parent = parent;
      return child;
    };
    class Element {}
    Element.prototype.attachShadow = function attachShadow(init) {
      const root = shadow(`shadow of ${this.name}`, [script(`in the shadow of ${this.name}`)]);
      if (init.mode === "open") this.shadowRoot = root;
      return root;
    };
    const document = node("document", { nodeType: 9, localName: undefined, children: build({ script }) });
    const scope = {
      document,
      Element,
      MutationObserver: class {
        constructor(callback) {
          this.callback = callback;
          this.roots = [];
          observers.push(this);
        }
        observe(root, options) {
          assert.deepEqual(options, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });
          this.roots.push(root.name);
        }
      },
      queueMicrotask: (task) => microtasks.push(task),
      addEventListener: (type, listener, capture) => {
        assert.deepEqual([type, capture], ["DOMContentLoaded", true], "before the page's own listeners");
        loaded.push(listener);
      },
    };
    blockSpeculationRules(scope);
    const [observer] = observers;
    return {
      scope,
      document,
      node,
      script,
      shadow,
      append,
      removed,
      observers,
      microtasks,
      loaded,
      roots: () => new Set(observer.roots),
      notify: (...records) => observer.callback(records),
      runMicrotasks: () => microtasks.splice(0).forEach((task) => task()),
    };
  }

  test("the page's half against speculation rules: each rules script removed, in the document and in every shadow root (blockSpeculationRules)", () => {
    // The document observed, and what it already holds swept.
    const before = fakePage(({ script }) => [script("parsed before"), script("application", "module")]);
    assert.equal(before.observers.length, 1);
    assert.deepEqual([[...before.roots()], before.removed], [["document"], ["parsed before"]]);
    const p = fakePage();
    const { node, script, removed, notify, document } = p;
    const text = { nodeType: 3 };
    // Inserted by the parser or a script, inside an inserted element, retyped in place: removed; the others kept.
    notify(
      { target: document, addedNodes: [script("parsed"), text] },
      { target: document, addedNodes: [script("upper case", "SpeculationRules"), script("data", "application/json")] },
      {
        target: document,
        addedNodes: [node("panel", { children: [node("inner", { children: [script("nested")] })] })],
      },
      { target: script("retyped"), addedNodes: [text] },
      { target: script("classic", "text/javascript"), addedNodes: [text] },
    );
    assert.deepEqual(removed, ["parsed", "upper case", "nested", "retyped"]);
    // A shadow root the page attaches, even closed: observed and swept; the method keeps its name and length.
    const root = p.scope.Element.prototype.attachShadow.call(node("host"), { mode: "closed" });
    assert.equal(root.name, "shadow of host");
    assert.ok(p.roots().has("shadow of host"));
    assert.equal(removed.at(-1), "in the shadow of host");
    assert.deepEqual(
      [p.scope.Element.prototype.attachShadow.name, p.scope.Element.prototype.attachShadow.length],
      ["attachShadow", 1],
    );
    // An open shadow root that came with its host (declared in the HTML): observed and swept.
    const declared = p.shadow("declared", [script("declared rules")]);
    notify({ target: document, addedNodes: [node("card", { shadowRoot: declared })] });
    assert.ok(p.roots().has("declared"));
    assert.equal(removed.at(-1), "declared rules");
  });

  test("speculation rules in a shadow root at any depth: a declared root inside another, a host below the inserted element; a root declared on a host already seen, found once the document is parsed or after a script attaches a shadow root (blockSpeculationRules)", () => {
    const p = fakePage();
    const { node, script, shadow, append, removed, notify, document } = p;
    const host = (name, root, children = []) => node(name, { shadowRoot: root, children });
    // Declared roots inside declared roots, two and three levels down: each one observed, its rules removed.
    const two = host("my-a", shadow("a", [host("my-b", shadow("b", [script("two levels")]))]));
    const three = host(
      "my-c",
      shadow("c", [host("my-d", shadow("d", [host("my-e", shadow("e", [script("three levels")]))]))]),
    );
    notify({ target: document, addedNodes: [two] }, { target: document, addedNodes: [three] });
    assert.deepEqual(removed, ["two levels", "three levels"]);
    for (const r of ["a", "b", "c", "d", "e"]) assert.ok(p.roots().has(r), r);
    // A host below the inserted element (a tree built aside, then inserted at once).
    const below = host("host", shadow("below", [script("below the inserted element")]));
    notify({ target: document, addedNodes: [node("panel", { children: [node("wrap", { children: [below] })] })] });
    assert.equal(removed.at(-1), "below the inserted element");
    assert.ok(p.roots().has("below"));
    // A host the observer saw before the parser declared its root (a script before its <template shadowrootmode>):
    // no record comes; the document swept again once parsed finds it.
    const late = append(document, node("late host"));
    notify({ target: document, addedNodes: [late] });
    late.shadowRoot = shadow("late root", [script("declared late")]);
    assert.equal(removed.at(-1), "below the inserted element", "no record, nothing seen yet");
    assert.equal(p.loaded.length, 1);
    p.loaded[0]();
    assert.equal(removed.at(-1), "declared late");
    assert.ok(p.roots().has("late root"));
    // After a script attaches shadow roots: the document swept again, once for all those before a microtask checkpoint.
    const later = append(document, node("later host"));
    later.shadowRoot = shadow("later root", [script("declared later")]);
    const attach = () => p.scope.Element.prototype.attachShadow.call(node("x"), { mode: "closed" });
    attach();
    attach();
    assert.equal(p.microtasks.length, 1);
    assert.equal(removed.at(-1), "in the shadow of x");
    p.runMicrotasks();
    assert.equal(removed.at(-1), "declared later");
    // And again after the next one.
    const last = append(document, node("last host"));
    last.shadowRoot = shadow("last root", [script("declared last")]);
    attach();
    assert.equal(p.microtasks.length, 1);
    p.runMicrotasks();
    assert.equal(removed.at(-1), "declared last");
    // What the sweeps removed is gone from the page: swept again, nothing is removed twice.
    const count = removed.length;
    p.loaded[0]();
    assert.equal(removed.length, count);
  });

  test("forbidden routes: a segment's trailing dots and spaces dropped, as IIS does, each with its minimal pair", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$"]);
    // [a form IIS reads as the forbidden route, the closest form it does not]
    const pairs = [
      ["/orders/7/approval.", "/orders/7/approval.x"],
      ["/orders/7/approval%20", "/orders/7/approval%20x"],
      ["/orders/7/approval%2e", "/orders/7/approval%2ex"],
      ["/orders/7/approval%252E", "/orders/7/approval%252Ex"],
      ["/orders/7/approval.%20.", "/orders/7/approval.%20.s"],
      ["/orders/7./approval", "/orders/7.x/approval"],
      ["/orders/7%20/approval/", "/orders/7%20x/approval/"],
      ["/orders/7/approval./", "/orders/7/approval.x/"],
      ["/orders/7/approval.;jsessionid=1", "/orders/7/approval.x;jsessionid=1"],
    ];
    for (const [hit, miss] of pairs) {
      assert.equal(forbiddenMatch(hit, m), "^/orders/\\d+/approval$", hit);
      assert.equal(forbiddenMatch(miss, m), null, miss);
    }
    // A dot segment is never a name whose dots are dropped: "/orders/7/approval/.." is "/orders/7/".
    assert.equal(forbiddenMatch("/orders/7/approval/..", m), null);
    assert.equal(forbiddenMatch("/orders/7/approval/%2e%2e", m), null);
  });

  test("an address of the application in another form is the application: scheme upgrade, trailing dot, a loopback alias", async () => {
    const site = { "http://app.test/up": { status: 302, location: "https://app.test/orders/7/approval" } };
    const s = fakeSite(site);
    assert.equal(await s.run("http://app.test/up"), "abort:blockedbyclient", "upgraded to https");
    for (const url of ["https://app.test/orders/7/approval", "http://app.test./orders/7/approval"])
      assert.equal(await s.run(url), "abort:blockedbyclient", url);
    assert.deepEqual(s.result.refused, Array(3).fill("GET /orders/7/approval"));
    assert.deepEqual(s.requested, ["http://app.test/up"]);
    // Another port, another host: another application.
    for (const url of ["https://app.test:8443/orders/7/approval", "http://www.app.test/orders/7/approval"])
      assert.deepEqual(await s.run(url), { response: 404 }, url);
    // A loopback application: every name of the loopback interface is the application. The guard fetches a hop from
    // Node.js, which reaches 0.0.0.0 and [::ffff:127.0.0.1] where Chromium refuses them.
    const local = fakeSite({}, { appOrigin: "http://127.0.0.1:3000" });
    const aliases = [
      "localhost",
      "[::1]",
      "0.0.0.0",
      "[::ffff:127.0.0.1]",
      "[::]",
      "127.0.0.2",
      "localhost.",
      "a.localhost",
    ];
    for (const host of aliases)
      assert.equal(await local.run(`http://${host}:3000/orders/7/approval`), "abort:blockedbyclient", host);
    for (const host of ["localhost:3001", "[::ffff:10.0.0.1]:3000", "0.0.0.1:3000", "128.0.0.1:3000"])
      assert.deepEqual(await local.run(`http://${host}/orders/7/approval`), { response: 404 }, host);
    // The key itself. Any *.localhost name is the loopback interface too (RFC 6761: Chromium resolves it there
    // itself), so the same server as 127.0.0.1 on that port: one loopback definition with isLoopbackUrl (M6).
    assert.deepEqual(
      [
        "http://App.Test/x",
        "https://app.test:443/",
        "http://app.test.:80",
        "http://127.0.0.9:3000",
        "http://[::1]:3000",
        "http://localhost:3000",
        "http://app.localhost:3000",
        "http://0.0.0.0:3000",
        "http://[::]:3000",
        "http://[::ffff:127.0.0.1]:3000",
        "http://[::ffff:0.0.0.0]:3000",
        "http://localhost.:3000",
        "http://[::ffff:10.0.0.1]:3000",
        "http://app.test:8080",
        "data:text/plain,x",
        "not a url",
      ].map((u) => applicationKey(u)),
      [
        "app.test:",
        "app.test:",
        "app.test:",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "loopback:3000",
        "[::ffff:a00:1]:3000",
        "app.test:8080",
        null,
        null,
      ],
    );
  });

  test("after a goto, the page is awaited until it has committed the end of the chain the guard followed, and its answer read (afterRedirects)", async () => {
    const top = {};
    const waits = [];
    const page = {
      mainFrame: () => top,
      waitForLoadState: async (state, options) => waits.push([state, options]),
      waitForURL: () => assert.fail("never the address: the page may rewrite it at once (history.replaceState)"),
    };
    const goto = { status: () => 200 };
    const end = { status: () => 401 };
    // No chain followed for this frame: the goto's own answer, nothing awaited.
    assert.equal(await afterRedirects(page, { landing: () => undefined }, goto, { timeout: 5 }), goto);
    assert.deepEqual(waits, []);
    const held = (committed) => ({ landing: (frame) => (frame === top ? { response: end, committed } : undefined) });
    // The end committed: its load state, then its answer (a 401 is seen).
    assert.equal(await afterRedirects(page, held(Promise.resolve()), goto, { timeout: 5 }), end);
    assert.deepEqual(waits, [["load", { timeout: 5 }]]);
    await afterRedirects(page, held(Promise.resolve()), goto, { waitUntil: "domcontentloaded", timeout: 7 });
    assert.deepEqual(waits[1], ["domcontentloaded", { timeout: 7 }]);
    // Not committed yet: the load state waits for it.
    let commit;
    const pending = afterRedirects(page, held(new Promise((r) => (commit = r))), goto, { timeout: 1000 });
    await new Promise(setImmediate);
    assert.equal(waits.length, 2, "nothing awaited before the end has committed");
    commit();
    assert.equal(await pending, end);
    // The frame went elsewhere first, or the end never committed: an error, never a capture of the wrong page.
    await assert.rejects(
      afterRedirects(page, held(Promise.reject(new Error("went elsewhere"))), goto, { timeout: 5 }),
      /went elsewhere/,
    );
    await assert.rejects(
      afterRedirects(page, held(new Promise(() => {})), goto, { timeout: 5 }),
      /Timeout 5ms exceeded/,
    );
    assert.equal(waits.length, 3);
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

  test("forbidden routes: path parameters dropped before decoding, each run of escapes decoded on its own, and twice", () => {
    const m = forbiddenMatchers(["^/orders/\\d+/approval$"]);
    // [a form a server reads as the forbidden route, the closest form it does not]
    const pairs = [
      // A malformed escape leaves the others decoded: Tomcat drops the parameters, then decodes the rest.
      ["/orders/7/%61pproval;x=%zz", "/orders/7/%61pprovals;x=%zz"],
      ["/%zz/../orders/7/%61pproval", "/%zz/../orders/7/%61pprovals"],
      // Parameters dropped before decoding: an escaped slash inside one never makes a segment.
      ["/orders/7/%61pproval;x=%2Fy", "/orders/7/%61pproval:x=%2Fy"],
      // A run of escapes that is not UTF-8 still has its ASCII escapes decoded.
      ["/orders/7/x%FF%2F%2E%2E%2Fapproval", "/orders/7/x%FF%2F%2E%2E%2E%2Fapproval"],
      // Decoded twice: a proxy that decodes the path before the server does.
      ["/orders/7/%2561pproval", "/orders/7/%2562pproval"],
      ["/orders/7/x/%252e%252e/approval", "/orders/7/x/%252e%252e%252e/approval"],
    ];
    for (const [hit, miss] of pairs) {
      assert.equal(forbiddenMatch(hit, m), "^/orders/\\d+/approval$", hit);
      assert.equal(forbiddenMatch(miss, m), null, miss);
    }
  });

  test("a path is reported without its path parameters, so a session id in the URL is never printed (shownPath)", async () => {
    const secret = ["SESSION", "SECRET", "42"].join("-");
    const s = fakeSite({
      [`http://app.test/latest;jsessionid=${secret}`]: {
        status: 302,
        location: `/orders/7/approval;jsessionid=${secret}?token=${secret}`,
      },
    });
    assert.equal(
      await s.run(`http://app.test/orders/7/approval;jsessionid=${secret}?x=${secret}`),
      "abort:blockedbyclient",
    );
    assert.equal(await s.run(`http://app.test/latest;jsessionid=${secret}`), "abort:blockedbyclient");
    await s.run(`http://app.test/api/save;jsessionid=${secret}?x=${secret}`, { method: "POST" });
    await s.run(`https://cdn.test/beacon;jsessionid=${secret}`, { method: "POST" });
    assert.deepEqual(s.result, {
      blocked: ["POST /api/save", "POST cdn.test/beacon"],
      refused: ["GET /orders/7/approval", "GET /orders/7/approval"],
      prefetched: [],
    });
    assert.deepEqual(s.navigations, ["/orders/7/approval", "/orders/7/approval"]);
    assert.ok(!JSON.stringify([s.result, s.navigations]).includes(secret));
    assert.deepEqual(
      ["/a;b=1/c;d", "/a", "/;x", "/a%3Bb"].map((p) => shownPath(p)),
      ["/a/c", "/a", "/", "/a%3Bb"],
    );
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
      ...["generic", "forbiddenHit", "redirectTimeout", "landingTooLarge", "heldTooLarge"].map(
        (k) => `cli.capture.error.${k}`,
      ),
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
