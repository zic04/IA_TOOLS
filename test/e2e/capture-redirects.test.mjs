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
//   - a redirect to a loopback alias of the application (localhost for 127.0.0.1, same port; 0.0.0.0 and
//     [::ffff:127.0.0.1], which Node.js reaches) is the application: its forbidden routes are refused there; a start
//     page that lands on another origin stops the run;
//   - a path parameter of a refused route (;jsessionid=…) is never printed nor written in the --json output, nor the
//     query or the path parameters of a sign-in page (an expired session, before or during the run, or none);
//   - the speculation rules of a page (prefetch, prerender, document rules, inserted by a script, in a shadow root,
//     in declared roots inside declared roots, in a declared root whose host came first, from a Speculation-Rules
//     header), which Chromium would fetch from its own process, never reach a forbidden route, nor any other;
//   - a WebSocket to a forbidden route never reaches the server (its handshake is a GET no route sees); another
//     connects;
//   - a sandboxed iframe whose address is redirected shows the end of its chain; a forbidden end is still refused;
//   - an end of a chain whose address Chromium writes otherwise than Node.js (/end|x, /end%7Cx) is asked once, and
//     its own answer read (a 401);
//   - the guard's bounds (a hop that never answers, a chain past its deadline, an answer too large to hold, the
//     answers held for all pages), with small bounds given to the guard itself on a real Chromium page;
//   - what a page sends while the next entry replaces it (a beacon, a keepalive fetch, an image, on pagehide, unload
//     or visibilitychange), which no route sees, and fetchLater, never reach the server, even from a page that
//     redefines what the kit's script calls then; a page with such handlers still works while it is open, its writes
//     blocked and counted;
//   - a shared worker, whose requests no route sees, never starts (from a page or a frame), with forbidden routes or
//     read-only alone; a dedicated worker's writes, and those of the worker it starts, are blocked and counted.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { requestGuard, blockSpeculationRules } from "../../engine/capture/guard.mjs";
import { forbiddenMatchers } from "../../engine/capture/plans.mjs";
import { afterRedirects } from "../../engine/capture/take.mjs";
import { launchBrowser } from "../../engine/project/browser.mjs";
import { tempDir } from "../tools/helpers.mjs";

const FORBIDDEN = "^/orders/\\d+/approval$";
/**
 * Requests each server received ("GET /path"), in order, the WebSocket handshakes the application received, and the
 * cookies the identity provider received.
 */
const seen = { app: [], idp: [], api: [], sockets: [] };
const idpCookies = [];
const servers = {};
/** The sockets the application upgraded: no longer its HTTP connections, so closed after the tests one by one. */
const upgraded = new Set();
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

/** Speculation rules that prefetch and prerender a forbidden route, marked with how the page gave them. */
const rules = (via) =>
  JSON.stringify({
    prefetch: [{ source: "list", urls: [`/orders/7/approval?via=${via}-prefetch`] }],
    prerender: [{ source: "list", urls: [`/orders/8/approval?via=${via}-prerender`] }],
  });
/** A declared open shadow root holding `inner`. */
const declared = (inner) => `<template shadowrootmode="open">${inner}</template>`;
/**
 * A page with speculation rules in its HTML, document rules, rules a script inserts and rules in shadow roots: one a
 * script attaches, one declared, and declared roots inside declared roots, two and three levels down.
 */
const SPECULATION = `<h1>Speculation</h1><a href="/orders/9/approval?via=document">order 9</a>
<script type="speculationrules">${rules("parser")}</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/orders/*"},"eagerness":"immediate"}],
"prerender":[{"where":{"href_matches":"/orders/*"},"eagerness":"immediate"}]}</script>
<script>
  const s = document.createElement("script");
  s.type = "speculationrules";
  s.textContent = ${JSON.stringify(rules("script"))};
  document.head.append(s);
  const root = document.body.appendChild(document.createElement("div")).attachShadow({ mode: "closed" });
  const t = document.createElement("script");
  t.type = "speculationrules";
  t.textContent = ${JSON.stringify(rules("shadow"))};
  root.append(t);
</script>
<div><template shadowrootmode="open"><script type="speculationrules">${rules("declared")}</script></template></div>
<my-a>${declared(`<my-b>${declared(`<script type="speculationrules">${rules("nested")}</script>`)}</my-b>`)}</my-a>
<my-c>${declared(`<my-d>${declared(`<my-e>${declared(`<script type="speculationrules">${rules("deep")}</script>`)}</my-e>`)}</my-d>`)}</my-c>`;
/**
 * A declared root whose host the guard has seen before its <template shadowrootmode> (a script comes first): rules a
 * script puts in it once the page has loaded.
 */
const LATE_ROOT = `<h1>Late root</h1><div id="late"><script>0</script>${declared("<p>its root</p>")}</div>
<script>
  addEventListener("load", () => {
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = ${JSON.stringify(rules("late"))};
    document.getElementById("late").shadowRoot.append(s);
  });
</script>`;
/** WebSockets: one to a forbidden route, one to another route, whose first message the page shows. */
const SOCKETS = `<h1>Sockets</h1><p id="live">pending</p><p id="refused">pending</p>
<script>
  const live = new WebSocket("ws://" + location.host + "/live");
  live.onmessage = (e) => (document.getElementById("live").textContent = "live " + e.data);
  const refused = new WebSocket("ws://" + location.host + "/orders/101/approval");
  refused.onopen = () => (document.getElementById("refused").textContent = "opened");
  refused.onclose = (e) => (document.getElementById("refused").textContent = "refused " + e.code);
</script>`;

/**
 * A page that sends requests as it is left, in every way Chromium sends them unseen by any route (a beacon, a keepalive
 * fetch, an image; on pagehide, unload, or visibilitychange to hidden; a handler of the window or of the document,
 * added or set), and the requests it defers (fetchLater: sent when the page is left, or at once).
 */
const LEAVE = `<h1>Leaving</h1>
<script>
  addEventListener("pagehide", () => navigator.sendBeacon("/orders/71/approval?via=beacon", "x"));
  addEventListener("pagehide", () => fetch("/api/lock/release?via=keepalive", { method: "POST", keepalive: true }));
  onpagehide = () => (new Image().src = "/orders/72/approval?via=image");
  addEventListener("unload", () => navigator.sendBeacon("/api/unload?via=unload"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") fetch("/orders/73/approval?via=hidden", { keepalive: true });
  });
  if (typeof fetchLater === "function") {
    fetchLater("/orders/74/approval?via=fetchLater");
    fetchLater("/api/later?via=fetchLater-now", { method: "POST", body: "x", activateAfter: 0 });
  }
</script>`;
/**
 * A page with handlers for being left that works while it is open: its own events (pagehide, visibilitychange) run
 * its handlers, and the writes it sends at once (a beacon, a keepalive fetch) are blocked and counted.
 */
const STAYS = `<h1>Stays</h1><p id="state">open</p>
<script>
  const ran = [];
  addEventListener("pagehide", () => ran.push("pagehide"));
  document.addEventListener("visibilitychange", () => ran.push("visibilitychange " + document.visibilityState));
  dispatchEvent(new Event("pagehide"));
  document.dispatchEvent(new Event("visibilitychange"));
  document.getElementById("state").textContent = ran.join(", ") + ", fetchLater " + typeof fetchLater;
  navigator.sendBeacon("/api/beacon-open", "x");
  fetch("/api/keepalive-open", { method: "POST", keepalive: true }).catch(() => {});
</script>`;
/**
 * Pages that redefine, before they are left, what the kit's script calls when a page is left: the document's
 * visibilityState (on the document and on its prototype), Event.prototype.stopImmediatePropagation, or the `call`,
 * `apply` and `bind` of the browser's own functions and Reflect.apply; each sends a beacon on pagehide and on
 * visibilitychange.
 */
const REDEFINED = {
  visibility: `Object.defineProperty(document, "visibilityState", { get: () => "visible" });
  Object.defineProperty(Document.prototype, "visibilityState", { get: () => "visible" });`,
  stop: `Event.prototype.stopImmediatePropagation = function () {};`,
  call: `for (const f of [Event.prototype.stopImmediatePropagation,
    Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState").get])
    f.call = f.apply = f.bind = () => "visible";
  Reflect.apply = () => "visible";`,
};
const redefined = (name) => `<h1>Redefined</h1>
<script>
  ${REDEFINED[name]}
  addEventListener("pagehide", () => navigator.sendBeacon("/orders/51/approval?via=${name}-pagehide", "x"));
  document.addEventListener("visibilitychange", () => navigator.sendBeacon("/orders/52/approval?via=${name}-hidden", "x"));
</script>`;
/**
 * A page that starts shared workers (from the page, and from an about:blank frame it creates at once), which write
 * and ask for a forbidden route; and a dedicated worker that writes and starts a nested one, which writes too.
 */
const SHARED = `<h1>Shared worker</h1>
<script>
  const frame = document.body.appendChild(document.createElement("iframe"));
  for (const [scope, via] of [[window, "page"], [frame.contentWindow, "frame"]]) {
    try {
      new scope.SharedWorker("/worker/shared.js?via=" + via);
    } catch {}
  }
  new Worker("/worker/dedicated.js");
</script>`;
/** A shared worker's script, and those of a dedicated worker and of the worker it starts, by path. */
const WORKERS = {
  "/worker/shared.js": `fetch("/orders/30/approval?via=shared", { method: "POST" }).catch(() => {});
    fetch("/api/save?via=shared", { method: "PUT", body: "x" }).catch(() => {});
    fetch("/orders/31/approval?via=shared-get").catch(() => {});`,
  "/worker/dedicated.js": `fetch("/api/worker-save?via=dedicated", { method: "POST" }).catch(() => {});
    new Worker("/worker/nested.js");`,
  "/worker/nested.js": `fetch("/api/nested-save?via=nested", { method: "POST" }).catch(() => {});`,
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
    // Loopback aliases Chromium refuses but Node.js (the guard's fetch) reaches.
    if (p === "/alias0") return redirect(res, `${servers.app.url.replace("127.0.0.1", "0.0.0.0")}/orders/7/approval`);
    if (p === "/alias6")
      return redirect(res, `${servers.app.url.replace("127.0.0.1", "[::ffff:127.0.0.1]")}/orders/7/approval`);
    // A sign-in page whose address holds secrets: a session id, a state, a code.
    if (p === "/expire") return redirect(res, `/login;jsessionid=JS${SECRET}?state=ST${SECRET}&code=CODE${SECRET}`);
    if (p.startsWith("/login")) return page(res, "<h1>Sign in</h1>");
    // Speculation rules, in every way a page can give them.
    if (p === "/spec") return page(res, SPECULATION, { "speculation-rules": '"/spec-rules.json"' });
    if (p === "/spec-late") return page(res, LATE_ROOT);
    if (p === "/sockets") return page(res, SOCKETS);
    if (p === "/leave") return page(res, LEAVE);
    if (p === "/stays") return page(res, STAYS);
    const redefinedPage = /^\/redefined\/(\w+)$/.exec(p);
    if (redefinedPage) return page(res, redefined(redefinedPage[1]));
    if (p === "/shared") return page(res, SHARED);
    if (Object.hasOwn(WORKERS, p)) {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(WORKERS[p]);
    }
    if (p === "/spec-rules.json") {
      res.writeHead(200, { "content-type": "application/speculationrules+json" });
      return res.end(rules("header"));
    }
    // Sandboxed iframes (no script runs in them) whose address is redirected: to a page, to a forbidden route.
    if (p === "/framed")
      return page(
        res,
        `<h1>Framed</h1><iframe sandbox src="/frame-redir"></iframe><iframe sandbox src="/frame-forbidden"></iframe>`,
      );
    if (p === "/frame-redir") return redirect(res, "/frame-end");
    if (p === "/frame-end") return page(res, "<h1>Frame end</h1>");
    if (p === "/frame-forbidden") return redirect(res, "/orders/9/approval");
    // An end that Node.js writes /end|x and Chromium /end%7Cx; one that answers 401.
    if (p === "/pipe") return redirect(res, "/end|x");
    if (p === "/end|x" || p === "/end%7Cx") return page(res, "<h1>Pipe end</h1>");
    if (p === "/pipe401") return redirect(res, "/den|y");
    if (p === "/den|y" || p === "/den%7Cy") {
      res.writeHead(401, { "content-type": "text/html; charset=utf-8" });
      return res.end("<!doctype html><h1>Denied</h1>");
    }
    // An end of almost 1 MB: held for a page that cannot run the guard's script.
    if (p === "/held") return redirect(res, "/held-end");
    if (p === "/held-end") return page(res, `<h1>Held</h1><!--${"x".repeat(900 * 1024)}-->`);
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
  // WebSocket handshakes: /live is accepted and says hello (RFC 6455: its accept key, one text frame), any other is
  // closed.
  servers.app.server.on("upgrade", (req, socket) => {
    seen.sockets.push(`GET ${req.url}`);
    upgraded.add(socket);
    socket.on("error", () => {});
    if (req.url !== "/live") return socket.destroy();
    const accept = crypto
      .createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    const head = ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade"];
    socket.write([...head, `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
    socket.write(Buffer.from([0x81, 5, ...Buffer.from("hello")]));
  });
  dir = tempDir("doc-kit-e2e-redirects-");
  project(dir, { adapter: "none" });
});

/**
 * A documentation project of the application in `folder`, signed in with `auth`; `capture`: more capture options;
 * `plans`: the source of its own capture entries, in place of the file's.
 */
function project(folder, auth, { capture = {}, plans = null } = {}) {
  const config = {
    product: { name: "Acme Orders" },
    app: { url: servers.app.url },
    auth,
    capture: { plans: "captures/plans", forbidden: [FORBIDDEN], ...capture },
  };
  fs.writeFileSync(path.join(folder, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  fs.mkdirSync(path.join(folder, "content"), { recursive: true });
  fs.writeFileSync(path.join(folder, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  fs.mkdirSync(path.join(folder, "captures", "plans"), { recursive: true });
  if (plans)
    return fs.writeFileSync(path.join(folder, "captures", "plans", "own.mjs"), `export const CAPTURES = ${plans};`);
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
      { id: "alias0", route: "/alias0" },
      { id: "alias6", route: "/alias6" },
      { id: "spec", route: "/spec", delay: 1500, zones: [{ text: "Speculation" }] },
      { id: "spec-late", route: "/spec-late", delay: 1500, zones: [{ text: "Late root" }] },
      { id: "sockets", route: "/sockets", zones: [{ text: "live hello" }, { text: "refused 1006" }] },
      { id: "pipe", route: "/pipe", zones: [{ text: "Pipe end" }] },
      { id: "expire", route: "/expire" },
    ];`,
  );
}

after(async () => {
  for (const socket of upgraded) socket.destroy();
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

describe("capture: the loopback aliases Node.js reaches, and a sign-in page's secrets", () => {
  test("a redirect to 0.0.0.0 or to [::ffff:127.0.0.1] is the application: its forbidden route is never requested", async () => {
    for (const id of ["alias0", "alias6"]) {
      const r = await capture(id);
      assert.equal(r.code, 1, r.out + r.err);
      assert.deepEqual(seen.app, ["GET /", `GET /${id}`], "the application never receives the forbidden route");
      assert.match(r.err, /✖ forbidden route: 1 request refused — GET \/orders\/7\/approval\n/);
    }
  });

  test("the sign-in page of an expired session, or of none, is shown by its origin and path: never its session id, state or code", async () => {
    const folders = [];
    const login = `${servers.app.url}/login`;
    try {
      // A project of its own for each case (a configuration is imported once per file).
      const signIn = (start, { session = true } = {}) => {
        const folder = tempDir("doc-kit-e2e-redirects-sign-in-");
        folders.push(folder);
        project(folder, { adapter: "manual", loginPattern: "^/login", start });
        if (!session) return folder;
        fs.mkdirSync(path.join(folder, ".doc-kit"));
        const cookie = { name: "sid", value: "APP", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false };
        const state = { cookies: [{ ...cookie, secure: false, sameSite: "Lax" }], origins: [] };
        fs.writeFileSync(path.join(folder, ".doc-kit", "session.json"), JSON.stringify(state));
        return folder;
      };
      const run = async (folder, id, message, extra = []) => {
        for (const args of [extra, [...extra, "--json"]]) {
          const r = await capture(id, { folder, args });
          assert.equal(r.code, 3, r.out + r.err);
          assert.ok(!(r.out + r.err).includes(SECRET), r.out + r.err);
          if (!args.includes("--json")) assert.ok(r.err.includes(message), r.err);
          else if (id !== "home") assert.equal(JSON.parse(r.out).expired.url, login);
        }
      };
      // Before the run: the session check lands on the sign-in page.
      await run(signIn("/expire"), "home", `✖ the session has expired (sign-in page: ${login})`);
      // During the run: a capture lands on the sign-in page.
      const during = `✖ the session expired during the run, at “expire” (sign-in page: ${login})`;
      await run(signIn("/"), "expire", during);
      // Without a session.
      const none = `✖ “expire”: the application asks to sign in (${login})`;
      await run(signIn("/", { session: false }), "expire", none, ["--no-session"]);
    } finally {
      for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("capture: speculation rules, which Chromium fetches from its own process (SECURITY.md)", () => {
  test("prefetch and prerender, in the HTML, as document rules, inserted by a script, in shadow roots (declared roots inside declared roots, two and three levels down) or in a header: never received", async () => {
    const r = await capture("spec");
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ spec \(1 zone, \d+ KB, [\d.]+ s\)\n/);
    assert.deepEqual(seen.app, ["GET /", "GET /spec"], "no prefetch, no prerender, not even the header's rules");
  });

  test("a declared root whose host came before its template (a script first): the rules a script puts there once the page has loaded are never received", async () => {
    const r = await capture("spec-late");
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ spec-late \(1 zone, \d+ KB, [\d.]+ s\)\n/);
    assert.deepEqual(seen.app, ["GET /", "GET /spec-late"], "no prefetch, no prerender");
  });

  test("the page's attachShadow keeps its name and length, and reads as native code (a bot challenge may check them)", async () => {
    const browser = await launchBrowser({ headless: true });
    try {
      const context = await browser.newContext();
      await context.addInitScript(blockSpeculationRules);
      const page = await context.newPage();
      await page.goto(`${servers.app.url}/home`);
      const look = await page.evaluate(() => {
        const f = Element.prototype.attachShadow;
        return [f.name, f.length, Function.prototype.toString.call(f)];
      });
      assert.deepEqual(look, ["attachShadow", 1, "function () { [native code] }"]);
    } finally {
      await browser.close();
    }
  });
});

describe("capture: WebSockets, whose handshake no route of the guard sees (SECURITY.md)", () => {
  test("a WebSocket to a forbidden route is never opened, the capture going on; one to another route connects", async () => {
    const r = await capture("sockets");
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /✔ sockets \(2 zones, \d+ KB, [\d.]+ s\)\n/);
    assert.deepEqual(seen.sockets, ["GET /live"], "the server never receives the forbidden handshake");
    assert.match(r.out + r.err, /1 prefetch request to forbidden routes aborted — GET \/orders\/101\/approval\n/);
  });
});

describe("capture: what a page sends as it is left, which no route sees, and fetchLater (SECURITY.md)", () => {
  /**
   * `doc-kit capture` on a read-only project whose entries run one after the other on one page, so that each page is
   * left for the next one; `options`: more capture options.
   */
  async function leaving(plans, options = {}) {
    const folder = tempDir("doc-kit-e2e-redirects-leave-");
    try {
      project(folder, { adapter: "none" }, { capture: { readOnly: true, concurrency: 1, ...options }, plans });
      return await capture("*", { folder });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
  /** What the application received other than its pages. */
  const sent = () => seen.app.filter((r) => /^\w+ \/(orders|api)\//.test(r));

  test("a beacon, a keepalive fetch, an image sent on pagehide, unload or visibilitychange, and fetchLater: never received, with forbidden routes or read-only alone", async () => {
    const plans = `[
      { id: "leave", route: "/leave", zones: [{ text: "Leaving" }] },
      { id: "after", route: "/home", zones: [{ text: "Home page" }] },
      { id: "again", route: "/leave", zones: [{ text: "Leaving" }] },
      { id: "last", route: "/home", zones: [{ text: "Home page" }] },
    ]`;
    for (const options of [{}, { forbidden: [] }]) {
      const r = await leaving(plans, options);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /4\/4 captures taken/);
      assert.deepEqual(
        sent(),
        [],
        `nothing the pages sent as they were left, nor deferred (${JSON.stringify(options)})`,
      );
      assert.match(r.out, /Read-only: 0 write requests blocked\n/, "nothing was sent, so nothing was blocked");
    }
  });

  test("a page with handlers for being left works while it is open: its own events run them, its writes are blocked and counted", async () => {
    const r = await leaving(`[
      { id: "stays", route: "/stays", zones: [{ text: "pagehide, visibilitychange visible, fetchLater undefined" }] },
      { id: "after", route: "/home", zones: [{ text: "Home page" }] },
    ]`);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /2\/2 captures taken/);
    assert.deepEqual(sent(), [], "the writes it sent while it was open never reach the server");
    assert.match(
      r.out + r.err,
      /Read-only: 2 write requests blocked — POST \/api\/beacon-open, POST \/api\/keepalive-open\n/,
    );
  });

  for (const [name, what] of [
    ["visibility", "its visibilityState, on the document and on its prototype"],
    ["stop", "Event.prototype.stopImmediatePropagation"],
    ["call", "the call, apply and bind of the browser's own functions"],
  ])
    test(`a page that redefines ${what} still sends nothing as it is left`, async () => {
      const r = await leaving(`[
        { id: "redefined", route: "/redefined/${name}", zones: [{ text: "Redefined" }] },
        { id: "after", route: "/home", zones: [{ text: "Home page" }] },
      ]`);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /2\/2 captures taken/);
      assert.deepEqual(sent(), [], "nothing it sent as it was left");
      assert.match(r.out, /Read-only: 0 write requests blocked\n/);
    });

  test("a shared worker, whose requests no route sees, never starts: nothing it would send is received, with forbidden routes or read-only alone; a dedicated worker's writes are still blocked and counted", async () => {
    const plans = `[
      { id: "shared", route: "/shared", delay: 1000, zones: [{ text: "Shared worker" }] },
      { id: "after", route: "/home", zones: [{ text: "Home page" }] },
    ]`;
    for (const options of [{}, { forbidden: [] }]) {
      const r = await leaving(plans, options);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /2\/2 captures taken/);
      const label = JSON.stringify(options);
      assert.deepEqual(sent(), [], `nothing a worker sent reaches the server (${label})`);
      assert.ok(!seen.app.some((l) => l.startsWith("GET /worker/shared.js")), `no shared worker started (${label})`);
      const blocked = /Read-only: 2 write requests blocked — (.+)\n/.exec(r.out);
      assert.ok(blocked, r.out);
      assert.deepEqual(blocked[1].split(", ").sort(), ["POST /api/nested-save", "POST /api/worker-save"], label);
    }
  });
});

describe("capture: frames and addresses the guard answers itself", () => {
  /** A real Chromium context guarded with capture.forbidden; `seen` counted from zero. */
  async function guarded(browser, { contextOptions = {}, limits } = {}) {
    const context = await browser.newContext(contextOptions);
    const result = { blocked: [], refused: [], prefetched: [] };
    const stops = [];
    const guard = requestGuard({
      appOrigin: servers.app.url,
      forbidden: forbiddenMatchers([FORBIDDEN]),
      readOnly: false,
      result,
      onStop: (key, vars) => stops.push([key, vars]),
      ...(limits ? { limits } : {}),
    });
    await context.route("**/*", guard);
    for (const list of Object.values(seen)) list.length = 0;
    return { context, guard, result, stops };
  }

  test("a sandboxed iframe whose address is redirected shows the end of its chain; a forbidden end is still refused", async () => {
    const browser = await launchBrowser({ headless: true });
    try {
      const { context, guard, result } = await guarded(browser);
      const page = await context.newPage();
      await page.goto(`${servers.app.url}/framed`);
      const frames = page.frames().filter((f) => f.parentFrame());
      assert.equal(frames.length, 2);
      assert.equal(await frames[0].textContent("h1"), "Frame end", "the end of its chain, not a blank page");
      assert.deepEqual(
        [...seen.app].sort(),
        ["GET /frame-end", "GET /frame-forbidden", "GET /frame-redir", "GET /framed"],
        "each hop once, never the forbidden route",
      );
      assert.deepEqual(result.prefetched, ["GET /orders/9/approval"], "refused, the capture going on");
      assert.deepEqual([guard.landing(frames[0]), guard.held()], [undefined, 0], "nothing held for an iframe");
    } finally {
      await browser.close();
    }
  });

  test("the answers held for pages that cannot run the guard's script are capped together, and freed when a page closes", async () => {
    const browser = await launchBrowser({ headless: true });
    try {
      // Without JavaScript, the guard's page cannot send its frame on: what is held for it stays held.
      const { context, guard, stops } = await guarded(browser, {
        contextOptions: { javaScriptEnabled: false },
        limits: { hop: 5000, chain: 10_000, bytes: 2 ** 20, held: 1.2 * 2 ** 20 },
      });
      const first = await context.newPage();
      await first.goto(`${servers.app.url}/held`);
      assert.ok(guard.held() > 900 * 1024, String(guard.held()));
      const second = await context.newPage();
      await assert.rejects(second.goto(`${servers.app.url}/held`), /net::ERR_FAILED/);
      assert.deepEqual(stops, [["heldTooLarge", { route: "/held", mb: 1 }]]);
      await first.close();
      assert.equal(guard.held(), 0, "freed with its page");
      const third = await context.newPage();
      await third.goto(`${servers.app.url}/held`);
      assert.ok(guard.held() > 900 * 1024);
      assert.equal(stops.length, 1);
    } finally {
      await browser.close();
    }
  });

  test("an end that Chromium writes otherwise than Node.js (/end|x, /end%7Cx) is asked once, and its own answer is read", async () => {
    const r = await capture("pipe");
    assert.equal(r.code, 0, r.out + r.err);
    assert.deepEqual(seen.app, ["GET /", "GET /pipe", "GET /end|x"], "the end asked once");
    const browser = await launchBrowser({ headless: true });
    try {
      const { context, guard } = await guarded(browser);
      const page = await context.newPage();
      const response = await page.goto(`${servers.app.url}/pipe401`);
      const end = await afterRedirects(page, guard, response, { timeout: 10_000 });
      assert.equal(end.status(), 401, "the end's answer, never the guard's page");
      assert.deepEqual(seen.app, ["GET /pipe401", "GET /den|y"]);
    } finally {
      await browser.close();
    }
  });
});
