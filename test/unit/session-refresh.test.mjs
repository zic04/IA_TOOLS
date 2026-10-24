// refreshSession (ARCHITECTURE.md §6.3a) through the launcher seam, no browser (RULES.md M4): the request it sends
// (method, URL, JSON body, no redirect), the session file written back only on a 2xx answer, a failure reported and
// not thrown, and the browser always closed. The real Set-Cookie → storageState pipeline, with a real Chromium, is
// test/e2e/session-refresh.test.mjs.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { refreshSession } from "../../engine/capture/session.mjs";
import { tempDir } from "../tools/helpers.mjs";

const REASON = "verified in the handler: it only rotates the token, no other write";
const APP = "http://127.0.0.1:4173";
const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** A session file in its own temporary folder. */
function sessionFile(text = JSON.stringify({ cookies: [], origins: [] })) {
  const dir = tempDir("doc-kit-session-refresh-");
  dirs.push(dir);
  const file = path.join(dir, "session.json");
  fs.writeFileSync(file, text);
  return file;
}

/**
 * A fake launcher: records the context options, the request and the closing; `answer` is the response (or the error
 * to throw) of the one request; `state` is what the context would save.
 */
function fakeLauncher({ answer, state = { cookies: [{ name: "session", value: "renewed-token" }], origins: [] } }) {
  const calls = { launch: [], context: [], fetch: [], closed: 0 };
  const launch = async (options) => {
    calls.launch.push(options);
    return {
      newContext: async (o) => {
        calls.context.push(o);
        return {
          request: {
            fetch: async (url, o2) => {
              calls.fetch.push({ url, ...o2 });
              if (answer instanceof Error) throw answer;
              return { ok: () => answer >= 200 && answer < 300, status: () => answer };
            },
          },
          storageState: async () => state,
        };
      },
      close: async () => {
        calls.closed++;
      },
    };
  };
  return { launch, calls };
}

describe("refreshSession through a fake launcher", () => {
  test("200: one request, as asked, no redirect followed; the renewed state replaces the session file", async () => {
    const file = sessionFile();
    const { launch, calls } = fakeLauncher({ answer: 200 });
    const r = await refreshSession({
      file,
      appUrl: APP,
      refresh: { method: "POST", path: "/refresh", json: { grant: "refresh" }, reason: REASON },
      launch,
    });
    assert.deepEqual(r, { ok: true, status: 200 });
    assert.equal(calls.fetch.length, 1, "exactly one request");
    assert.equal(calls.fetch[0].url, `${APP}/refresh`);
    assert.equal(calls.fetch[0].method, "POST");
    assert.deepEqual(calls.fetch[0].data, { grant: "refresh" });
    assert.equal(calls.fetch[0].maxRedirects, 0, "a redirect is never followed");
    assert.equal(calls.fetch[0].failOnStatusCode, false);
    assert.deepEqual(calls.context, [{ storageState: file }], "the context loads the session file");
    assert.deepEqual(calls.launch, [{ headless: true }]);
    assert.equal(calls.closed, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).cookies, [{ name: "session", value: "renewed-token" }]);
  });

  test("the default method is POST, and no body is sent without json", async () => {
    const { launch, calls } = fakeLauncher({ answer: 204 });
    const r = await refreshSession({
      file: sessionFile(),
      appUrl: APP,
      refresh: { path: "/refresh", reason: REASON },
      launch,
    });
    assert.deepEqual(r, { ok: true, status: 204 });
    assert.equal(calls.fetch[0].method, "POST");
    assert.ok(!("data" in calls.fetch[0]), "no body");
  });

  test("422 and a redirect answer: { ok: false, status }, the session file untouched, the browser closed", async () => {
    for (const status of [422, 302]) {
      const text = JSON.stringify({ cookies: [], origins: [], marker: status });
      const file = sessionFile(text);
      const { launch, calls } = fakeLauncher({ answer: status });
      const r = await refreshSession({ file, appUrl: APP, refresh: { path: "/refresh", reason: REASON }, launch });
      assert.deepEqual(r, { ok: false, status });
      assert.equal(fs.readFileSync(file, "utf8"), text, `no write on ${status}`);
      assert.equal(calls.closed, 1);
    }
  });

  test("a request that fails: { ok: false, status: null, error } (first line), nothing thrown, nothing written", async () => {
    const text = JSON.stringify({ cookies: [], origins: [] });
    const file = sessionFile(text);
    const { launch, calls } = fakeLauncher({ answer: new Error("connect ECONNREFUSED\n  at somewhere") });
    const r = await refreshSession({ file, appUrl: APP, refresh: { path: "/refresh", reason: REASON }, launch });
    assert.deepEqual(r, { ok: false, status: null, error: "connect ECONNREFUSED" });
    assert.equal(fs.readFileSync(file, "utf8"), text);
    assert.equal(calls.closed, 1);
  });
});
