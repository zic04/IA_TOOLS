// Read-only captures and redirects (SECURITY.md › Read-only captures, RULES.md S6), end to end: `doc-kit capture`
// on a real headless Chromium against real local servers (node:http) on three ports, so three origins — the
// application, an identity provider (reached as localhost, so that it shares no cookie with the application) and a
// local API. What is checked is what the servers receive, never what the kit reports alone:
//   - a redirect chain that leaves the application for the identity provider and comes back to a capture.forbidden
//     route never reaches it, and the capture stops;
//   - a normal sign-in round trip through the identity provider still opens the page it ends on, each hop requested
//     once, with the cookies a browser sends: the identity provider never gets the application's, and the cookie set
//     on the way (the sign-in state) comes back to the application;
//   - a server whose second answer differs (it redirects to a forbidden route only once its first answer was seen)
//     is asked once: the browser never replays the chain;
//   - with capture.forbidden declared, a page of a local application still reaches its API on another local port;
//   - a page at the end of a chain that rewrites its own address (history.replaceState: a sign-in callback that drops
//     its ?code=, a router) is captured, and the run's session check opens such a start page too;
//   - a redirect to a loopback alias of the application (localhost for 127.0.0.1, same port) is the application:
//     its forbidden routes are refused there; a start page that lands on another origin stops the run;
//   - a path parameter of a refused route (;jsessionid=…) is never printed nor written in the --json output;
//   - the guard's bounds (a hop that never answers, a chain past its deadline, an answer too large to hold), with
//     small bounds given to the guard itself on a real Chromium page.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { requestGuard } from "../../engine/capture/guard.mjs";
import { forbiddenMatchers } from "../../engine/capture/plans.mjs";
import { launchBrowser } from "../../engine/project/browser.mjs";
import { tempDir } from "../tools/helpers.mjs";

const FORBIDDEN = "^/orders/\\d+/approval$";
/** Requests each server received ("GET /path"), in order, and the cookies the identity provider received. */
const seen = { app: [], idp: [], api: [] };
const idpCookies = [];
const servers = {};
let dir;
/** A session id that the application puts in its URLs (Tomcat's URL rewriting): never printed. */
const SECRET = ["SESSION", "SECRET", "42"].join("-");

/** A server on 127.0.0.1 and a free port, reached as `host`. */
function listen(name, handler, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      seen[name].push(`${req.method} ${req.url}`);
      handler(req, res);
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, url: `http://${host}:${s.address().port}` }));
  });
}

const redirect = (res, location) => {
  res.writeHead(302, { location });
  res.end();
};
const page = (res, body, headers = {}) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(`<!doctype html><html><body><main>${body}</main></body></html>`);
};

/** How long the application takes to answer each hop of /drip/<n> (a redirect to /drip/<n + 1>). */
const DRIP_MS = 300;
/** How many times the application has answered /next: a redirect to the forbidden route from the second time on. */
let nextAnswers = 0;

before(async () => {
  servers.app = await listen("app", (req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    const cookie = req.headers.cookie || "";
    if (p === "/") return page(res, "<h1>Start</h1>", { "set-cookie": "sid=APP; Path=/" });
    if (p === "/start") return redirect(res, `${servers.idp.url}/authorize`);
    if (p === "/sso") {
      res.writeHead(302, { location: `${servers.idp.url}/login`, "set-cookie": "state=S1; Path=/" });
      return res.end();
    }
    if (p === "/callback")
      return cookie.split("; ").includes("state=S1") ? redirect(res, "/home") : page(res, "<h1>Bad state</h1>");
    if (p === "/flip") return redirect(res, "/next");
    if (p === "/next") return nextAnswers++ ? redirect(res, "/orders/7/approval") : page(res, "<h1>Next page</h1>");
    if (p === "/home") return page(res, "<h1>Home page</h1>");
    // An end of a chain that rewrites its own address: while it is parsed, or once it has loaded.
    if (p === "/r1") return redirect(res, "/end1?code=1");
    if (p === "/end1") return page(res, `<h1>End one</h1><script>history.replaceState(null, "", "/end1")</script>`);
    if (p === "/r2") return redirect(res, "/end2?code=2");
    if (p === "/end2")
      return page(
        res,
        `<h1>End two</h1><script>addEventListener("load", () => history.replaceState(null, "", "/end2"))</script>`,
      );
    if (p === "/spa")
      return page(
        res,
        `<h1>Single page</h1><script>addEventListener("load", () => history.replaceState(null, "", "/spa/home"))</script>`,
      );
    // The run's start page, for a session check: a redirect, then an address rewritten.
    if (p === "/welcome") return redirect(res, "/landing?code=3");
    if (p === "/landing")
      return page(res, `<h1>Landing</h1><script>history.replaceState(null, "", "/landing")</script>`);
    if (p === "/leak") return redirect(res, `/orders/7/approval;jsessionid=${SECRET}`);
    if (p === "/alias") return redirect(res, `${servers.app.url.replace("127.0.0.1", "localhost")}/orders/7/approval`);
    if (p === "/moved") return redirect(res, `${servers.idp.url}/elsewhere`);
    // A slow server and a huge answer: the guard's bounds.
    if (p === "/hang") return; // never answers (its socket is closed after the tests)
    const drip = /^\/drip\/(\d+)$/.exec(p);
    if (drip) return setTimeout(() => redirect(res, `/drip/${Number(drip[1]) + 1}`), DRIP_MS);
    if (p === "/big") return redirect(res, "/huge");
    if (p === "/huge") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><h1>Huge</h1><!--${"x".repeat(2 * 2 ** 20)}-->`);
    }
    if (p === "/fits") return redirect(res, "/home");
    if (p === "/calls")
      return page(
        res,
        `<h1>Calls</h1><p id="api">pending</p><script>
          fetch(${JSON.stringify(`${servers.api.url}/api/ping`)})
            .then((r) => r.text()).then((t) => (document.getElementById("api").textContent = "api " + t))
            .catch(() => (document.getElementById("api").textContent = "api failed"));
        </script>`,
      );
    if (/^\/orders\/\d+\/approval(;.*)?$/.test(p)) return page(res, "<h1>Approved</h1>");
    page(res, "<h1>Other</h1>");
  });
  servers.idp = await listen(
    "idp",
    (req, res) => {
      idpCookies.push(req.headers.cookie || "");
      const p = new URL(req.url, "http://x").pathname;
      if (p === "/authorize") return redirect(res, `${servers.app.url}/orders/7/approval`);
      if (p === "/login") return redirect(res, `${servers.app.url}/callback`);
      page(res, "<h1>Identity provider</h1>");
    },
    "localhost",
  );
  servers.api = await listen("api", (req, res) => {
    res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
    res.end("pong");
  });
  dir = tempDir("doc-kit-e2e-redirects-");
  project(dir, { adapter: "none" });
});

/** A documentation project of the application in `folder`, signed in with `auth`. */
function project(folder, auth) {
  const config = {
    product: { name: "Acme Orders" },
    app: { url: servers.app.url },
    auth,
    capture: { plans: "captures/plans", forbidden: [FORBIDDEN] },
  };
  fs.writeFileSync(path.join(folder, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  fs.mkdirSync(path.join(folder, "content"), { recursive: true });
  fs.writeFileSync(path.join(folder, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  fs.mkdirSync(path.join(folder, "captures", "plans"), { recursive: true });
  fs.writeFileSync(
    path.join(folder, "captures", "plans", "redirects.mjs"),
    `export const CAPTURES = [
      { id: "round-trip", route: "/start" },
      { id: "sign-in", route: "/sso", zones: [{ text: "Home page" }] },
      { id: "stateful", route: "/flip", zones: [{ text: "Next page" }] },
      { id: "local-api", route: "/calls", zones: [{ text: "api pong" }] },
      { id: "rewritten", route: "/r1", zones: [{ text: "End one" }] },
      { id: "rewritten-on-load", route: "/r2", zones: [{ text: "End two" }] },
      { id: "rewritten-no-redirect", route: "/spa?tab=1", zones: [{ text: "Single page" }] },
      { id: "home", route: "/home", zones: [{ text: "Home page" }] },
      { id: "leak", route: "/leak" },
      { id: "alias", route: "/alias" },
    ];`,
  );
}

after(async () => {
  for (const s of Object.values(servers)) {
    s.server.closeAllConnections(); // /hang never answered
    await new Promise((r) => s.server.close(r));
  }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Runs `doc-kit capture <id>` on the project, the requests of the servers counted from zero. Each capture first opens
 * the start page "/" (to write its localStorage), then its route. */
async function capture(id, { folder = dir, args = [] } = {}) {
  for (const list of [...Object.values(seen), idpCookies]) list.length = 0;
  let out = "";
  let err = "";
  const code = await runCli(["capture", id, "--project", folder, ...args], {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
  });
  return { code, out, err };
}

describe("capture: redirects through other origins (SECURITY.md › Read-only captures)", () => {
  test("a round trip through the identity provider back to a forbidden route: never requested, the capture stops", async () => {
    const r = await capture("round-trip");
    assert.deepEqual(seen.app, ["GET /", "GET /start"], "the application never receives the forbidden route");
    assert.deepEqual(seen.idp, ["GET /authorize"]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(
      r.err,
      /✖ round-trip: the page requested a forbidden route \(\/orders\/7\/approval\): capture stopped/,
    );
    assert.match(r.err, /✖ forbidden route: 1 request refused — GET \/orders\/7\/approval/);
    assert.ok(!fs.existsSync(path.join(dir, "images", "round-trip.webp")));
  });

  test("a sign-in round trip that ends on an allowed page opens that page; each hop is requested once", async () => {
    const r = await capture("sign-in");
    assert.deepEqual(idpCookies, [""], "the application's session cookie never goes to another origin");
    assert.deepEqual(seen.idp, ["GET /login"]);
    assert.deepEqual(seen.app, ["GET /", "GET /sso", "GET /callback", "GET /home"], "the sign-in state came back");
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ sign-in \(1 zone, \d+ KB, [\d.]+ s\)\n/);
    const zones = JSON.parse(fs.readFileSync(path.join(dir, "images", "zones", "sign-in.json"), "utf8"));
    assert.equal(zones.route, "/sso");
  });

  test("a server whose second answer differs is asked once: the browser never replays the chain", async () => {
    nextAnswers = 0;
    const r = await capture("stateful");
    assert.deepEqual(seen.app, ["GET /", "GET /flip", "GET /next"], "each hop once, never the forbidden route");
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ stateful \(1 zone, \d+ KB, [\d.]+ s\)\n/);
  });
});

describe("capture: a local application with capture.forbidden still reaches its local API (SECURITY.md)", () => {
  test("the page's call to another local port gets its answer", async () => {
    const r = await capture("local-api");
    assert.deepEqual(seen.api, ["GET /api/ping"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ local-api \(1 zone, \d+ KB, [\d.]+ s\)\n/);
  });
});

describe("capture: a page that rewrites its own address after the redirects (history.replaceState)", () => {
  test("rewritten while it is parsed, at the end of a chain: captured", async () => {
    const r = await capture("rewritten");
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(seen.app, ["GET /", "GET /r1", "GET /end1?code=1"], "each hop once");
    assert.match(r.out, /✔ rewritten \(1 zone, \d+ KB, [\d.]+ s\)\n/);
  });

  test("rewritten once loaded, at the end of a chain; or with no redirect: captured", async () => {
    for (const id of ["rewritten-on-load", "rewritten-no-redirect"]) {
      const r = await capture(id);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, new RegExp(`✔ ${id} \\(1 zone, \\d+ KB, [\\d.]+ s\\)\\n`));
    }
  });

  test("the run's session check opens a start page that is redirected, then rewrites its address", async () => {
    const folder = tempDir("doc-kit-e2e-redirects-session-");
    try {
      project(folder, { adapter: "manual", loginPattern: "^/login", start: "/welcome" });
      fs.mkdirSync(path.join(folder, ".doc-kit"));
      const host = new URL(servers.app.url).hostname;
      const cookie = {
        name: "sid",
        value: "APP",
        domain: host,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
      };
      const state = { cookies: [{ ...cookie, sameSite: "Lax" }], origins: [] };
      fs.writeFileSync(path.join(folder, ".doc-kit", "session.json"), JSON.stringify(state));
      const r = await capture("home", { folder });
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /read-only: on\n/);
      assert.match(r.out, /✔ home \(1 zone, \d+ KB, [\d.]+ s\)\n/);
      assert.deepEqual(seen.app.slice(0, 2), ["GET /welcome", "GET /landing?code=3"], "the session check");
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("capture: what the guard reports, and the addresses of the application", () => {
  test("a refused route's path parameter (a session id) is never printed, nor written in --json", async () => {
    const r = await capture("leak");
    assert.equal(r.code, 1, r.out + r.err);
    assert.deepEqual(seen.app, ["GET /", "GET /leak"], "the forbidden route is never requested");
    assert.match(r.err, /✖ leak: the page requested a forbidden route \(\/orders\/7\/approval\): capture stopped/);
    assert.match(r.err, /✖ forbidden route: 1 request refused — GET \/orders\/7\/approval\n/);
    assert.ok(!(r.out + r.err).includes(SECRET), r.out + r.err);
    const json = await capture("leak", { args: ["--json"] });
    assert.equal(json.code, 1);
    assert.ok(json.out.includes("/orders/7/approval"), json.out);
    assert.ok(!(json.out + json.err).includes(SECRET), json.out + json.err);
  });

  test("a redirect to a loopback alias of the application (localhost for 127.0.0.1): its forbidden route is refused", async () => {
    const r = await capture("alias");
    assert.equal(r.code, 1, r.out + r.err);
    assert.deepEqual(seen.app, ["GET /", "GET /alias"], "the application never receives the forbidden route");
    assert.match(r.err, /✖ forbidden route: 1 request refused — GET \/orders\/7\/approval\n/);
  });

  test("a start page that lands on another origin stops the run: capture.forbidden would not cover its pages", async () => {
    const folder = tempDir("doc-kit-e2e-redirects-moved-");
    try {
      project(folder, { adapter: "none", start: "/moved" });
      const r = await capture("home", { folder });
      assert.equal(r.code, 2, r.out + r.err);
      assert.deepEqual(seen.app, ["GET /moved"]);
      assert.match(
        r.err,
        /✖ the start page opened on http:\/\/localhost:\d+, not on the application \(http:\/\/127\.0\.0\.1:\d+\)/,
      );
      assert.ok(!fs.existsSync(path.join(folder, "images", "home.webp")));
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the guard's bounds, on a real Chromium page and real servers (a slow one, a huge one)", () => {
  test("a hop that never answers, a chain past its deadline, an answer too large to hold: the navigation stops, and says why", async () => {
    const browser = await launchBrowser({ headless: true });
    try {
      const context = await browser.newContext();
      const stops = [];
      const guard = requestGuard({
        appOrigin: servers.app.url,
        forbidden: forbiddenMatchers([FORBIDDEN]),
        readOnly: false,
        result: { blocked: [], refused: [], prefetched: [] },
        onStop: (key, vars) => stops.push([key, vars]),
        limits: { hop: 1000, chain: 4 * DRIP_MS, bytes: 2 ** 20 },
      });
      await context.route("**/*", guard);
      // A page of its own for each navigation: one that failed may still be opening its error page.
      const open = async (route) => {
        const page = await context.newPage();
        return { page, goto: page.goto(servers.app.url + route) };
      };
      for (const list of Object.values(seen)) list.length = 0;
      await assert.rejects((await open("/hang")).goto, /net::ERR_TIMED_OUT/);
      assert.deepEqual(
        stops.map(([key, { route }]) => [key, route]),
        [["redirectTimeout", "/hang"]],
      );
      assert.ok(stops[0][1].seconds >= 1, "how long it waited, in seconds");
      assert.deepEqual(seen.app, ["GET /hang"]);
      // Each hop answers within its timeout, the chain does not within its deadline: no hop is asked past it.
      await assert.rejects((await open("/drip/0")).goto, /net::ERR_TIMED_OUT/);
      assert.equal(stops[1][0], "redirectTimeout");
      const drips = seen.app.filter((r) => r.startsWith("GET /drip/"));
      assert.ok(drips.length >= 3 && drips.length <= 5, drips.join(", "));
      // The end of a chain over the cap is never held, nor shown.
      const big = await open("/big");
      await assert.rejects(big.goto, /net::ERR_FAILED/);
      assert.deepEqual(stops[2], ["landingTooLarge", { route: "/big", mb: 1 }]);
      assert.equal(guard.landing(big.page.mainFrame()), undefined);
      // Within the bounds: the end of the chain opens.
      const { page, goto } = await open("/fits");
      await goto;
      await page.waitForURL(`${servers.app.url}/home`);
      assert.equal(await page.textContent("h1"), "Home page");
      assert.equal(stops.length, 3);
    } finally {
      await browser.close();
    }
  });
});
