// refreshSession (ARCHITECTURE.md §6.3a): the only declared exception to the read-only lock. Against a real
// local HTTP server (node:http, no browser): a renewed session is written back to the session file on 200 with a
// Set-Cookie, left untouched on a non-2xx status, and reported as a failure (not thrown) when the server is down.
// One real headless Chromium is shared for the whole file (closed in `after`), the way the e2e tests do: what we
// are testing is the real Set-Cookie → storageState pipeline, which a fake browser could not exercise honestly.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { refreshSession } from "../../engine/capture/session.mjs";
import { tempDir } from "../tools/helpers.mjs";

const REASON = "verified in the handler: it only rotates the token, no other write";
const dirs = [];
const contexts = [];
let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  await browser.close();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** refreshSession launches and closes its own browser; here it reuses the one shared browser of this file instead. */
const launch = async () => ({
  newContext: async (options) => {
    const ctx = await browser.newContext(options);
    contexts.push(ctx);
    return ctx;
  },
  close: async () => {},
});

/** A session file Playwright can load (empty cookie jar): refreshSession's starting point. */
function emptySessionFile() {
  const dir = tempDir("doc-kit-session-refresh-");
  dirs.push(dir);
  const file = path.join(dir, "session.json");
  fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
  return file;
}

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

describe("refreshSession (ARCHITECTURE.md §6.3a)", () => {
  test("POST with a JSON body → 200 + Set-Cookie: the request is correct and the new cookie is written back to the session file", async () => {
    let received = null;
    const { server, url } = await startServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received = { method: req.method, path: req.url, contentType: req.headers["content-type"], body };
        res.writeHead(200, { "Set-Cookie": "session=renewed-token; Path=/" }).end();
      });
    });
    try {
      const file = emptySessionFile();
      const r = await refreshSession({
        file,
        appUrl: url,
        refresh: { method: "POST", path: "/refresh", json: { grant: "refresh" }, reason: REASON },
        launch,
      });
      assert.deepEqual(r, { ok: true, status: 200 });
      assert.equal(received.method, "POST");
      assert.equal(received.path, "/refresh");
      assert.match(received.contentType, /application\/json/);
      assert.deepEqual(JSON.parse(received.body), { grant: "refresh" });
      const state = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(
        state.cookies.some((c) => c.name === "session" && c.value === "renewed-token"),
        JSON.stringify(state.cookies),
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("the default method is POST, without a json body", async () => {
    let received = null;
    const { server, url } = await startServer((req, res) => {
      received = { method: req.method, path: req.url };
      res.writeHead(200, { "Set-Cookie": "session=renewed-again; Path=/" }).end();
    });
    try {
      const file = emptySessionFile();
      const r = await refreshSession({ file, appUrl: url, refresh: { path: "/refresh", reason: REASON }, launch });
      assert.deepEqual(r, { ok: true, status: 200 });
      assert.equal(received.method, "POST");
      assert.equal(received.path, "/refresh");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("422 → { ok: false, status: 422 }, the session file is left untouched", async () => {
    const { server, url } = await startServer((req, res) => res.writeHead(422).end());
    try {
      const file = emptySessionFile();
      const before = fs.readFileSync(file, "utf8");
      const r = await refreshSession({ file, appUrl: url, refresh: { path: "/refresh", reason: REASON }, launch });
      assert.deepEqual(r, { ok: false, status: 422 });
      assert.equal(fs.readFileSync(file, "utf8"), before, "no write on failure");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("server down → { ok: false, error }, nothing thrown", async () => {
    const { server, url } = await startServer((req, res) => res.writeHead(200).end());
    await new Promise((r) => server.close(r)); // closed before the call: nothing listens on `url` any more
    const file = emptySessionFile();
    const r = await refreshSession({ file, appUrl: url, refresh: { path: "/refresh", reason: REASON }, launch });
    assert.equal(r.ok, false);
    assert.equal(r.status, null);
    assert.ok(r.error, "an error message is given");
  });
});
