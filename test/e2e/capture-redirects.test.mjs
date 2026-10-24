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
//   - with capture.forbidden declared, a page of a local application still reaches its API on another local port.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { tempDir } from "../tools/helpers.mjs";

const FORBIDDEN = "^/orders/\\d+/approval$";
/** Requests each server received ("GET /path"), in order, and the cookies the identity provider received. */
const seen = { app: [], idp: [], api: [] };
const idpCookies = [];
const servers = {};
let dir;

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
    if (p === "/calls")
      return page(
        res,
        `<h1>Calls</h1><p id="api">pending</p><script>
          fetch(${JSON.stringify(`${servers.api.url}/api/ping`)})
            .then((r) => r.text()).then((t) => (document.getElementById("api").textContent = "api " + t))
            .catch(() => (document.getElementById("api").textContent = "api failed"));
        </script>`,
      );
    if (/^\/orders\/\d+\/approval$/.test(p)) return page(res, "<h1>Approved</h1>");
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
  const config = {
    product: { name: "Acme Orders" },
    app: { url: servers.app.url },
    auth: { adapter: "none" },
    capture: { plans: "captures/plans", forbidden: [FORBIDDEN] },
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  fs.mkdirSync(path.join(dir, "content"));
  fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  fs.mkdirSync(path.join(dir, "captures", "plans"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "captures", "plans", "redirects.mjs"),
    `export const CAPTURES = [
      { id: "round-trip", route: "/start" },
      { id: "sign-in", route: "/sso", zones: [{ text: "Home page" }] },
      { id: "stateful", route: "/flip", zones: [{ text: "Next page" }] },
      { id: "local-api", route: "/calls", zones: [{ text: "api pong" }] },
    ];`,
  );
});

after(async () => {
  for (const s of Object.values(servers)) await new Promise((r) => s.server.close(r));
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** Runs `doc-kit capture <id>` on the project, the requests of the servers counted from zero. Each capture first opens
 * the start page "/" (to write its localStorage), then its route. */
async function capture(id) {
  for (const list of [...Object.values(seen), idpCookies]) list.length = 0;
  let out = "";
  let err = "";
  const code = await runCli(["capture", id, "--project", dir], {
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
