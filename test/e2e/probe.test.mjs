// `doc-kit probe` end-to-end (ARCHITECTURE.md §6.13), against a real local HTTP server (node:http, no browser):
// a protected route, an open route that leaks personal data, and a cookie set without any attribute. The CLI
// itself makes the requests (the real, uninjected `fetch`): this is the one place the kit's safety rules (GET/HEAD
// only, local/demo only) are checked against a real socket, not a simulated one.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { runCli } from "../../cli/doc-kit.mjs";
import { tempDir } from "../tools/helpers.mjs";

let server;
let port;
const methodsSeen = new Set();

/** The test server: "/" (a cookie with no attribute at all), a protected admin route, and an open route that
 * leaks a list of customers (email addresses) to anyone. */
function startServer() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      methodsSeen.add(req.method);
      const { pathname } = new URL(req.url, "http://127.0.0.1");
      if (pathname === "/") {
        res.setHeader("Set-Cookie", "session=plain-value");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (pathname === "/api/admin/users") {
        const cookie = req.headers.cookie || "";
        if (!cookie.includes("sid=secret-token")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ id: 1, name: "Admin" }]));
        return;
      }
      if (pathname === "/api/customers") {
        // An open route (no auth) that leaks personal data to anyone — exactly what probe.publicData looks for.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ id: 1, email: "client@acme-orders.example" }]));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

/** A documentation project pointing at the test server, with facts/api.json already written. */
function makeProject(url) {
  const dir = tempDir("doc-kit-probe-e2e-");
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify({ product: { name: "Acme Orders" }, app: { url } })};\n`);
  fs.mkdirSync(path.join(dir, "content"));
  fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  fs.mkdirSync(path.join(dir, "facts"));
  fs.writeFileSync(
    path.join(dir, "facts", "api.json"),
    JSON.stringify({
      source: "api",
      generator: "doc-kit 0.0.0-test",
      generated: "2026-01-01T00:00:00.000Z",
      commit: null,
      app: "..",
      items: [
        { method: "GET", route: "/api/admin/users", file: "server.js", line: 1, framework: "express", auth: "role", guards: ["requireAdmin"] },
        { method: "GET", route: "/api/customers", file: "server.js", line: 2, framework: "express", auth: "none", guards: [] },
      ],
    })
  );
  return dir;
}

async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env: {} });
  return { code, out, err };
}

before(async () => {
  server = await startServer();
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("doc-kit probe (e2e, a real local server)", () => {
  test("anonymous: the protected admin route stays protected (401, no finding); the open route leaks (probe.publicData); the cookie with no attribute is reported as such", async () => {
    const dir = makeProject(`http://127.0.0.1:${port}`);
    try {
      const r = await cli(["probe", "--project", dir, "--json"]);
      assert.equal(r.code, 0, r.err);
      const result = JSON.parse(r.out);
      assert.equal(result.identities.length, 1);
      assert.equal(result.identities[0], "anonymous");

      const admin = result.routes.find((x) => x.route === "/api/admin/users");
      assert.equal(admin.status.anonymous, 401);
      assert.ok(!admin.finding, "a role route answering 401 to anonymous is exactly what it must do");

      const customers = result.routes.find((x) => x.route === "/api/customers");
      assert.equal(customers.status.anonymous, 200);
      assert.equal(customers.finding, "probe.publicData");

      const cookie = result.cookies["/"].find((c) => c.name === "session");
      assert.deepEqual(cookie, { name: "session", secure: false, httpOnly: false, sameSite: null });

      assert.ok(fs.existsSync(path.join(dir, "facts", "probe.json")));
      const written = JSON.parse(fs.readFileSync(path.join(dir, "facts", "probe.json"), "utf8"));
      assert.deepEqual(written.routes.map((x) => x.route).sort(), ["/api/admin/users", "/api/customers"]);
      // Never a response body stored: the leaked e-mail address itself must never reach the written facts file.
      assert.ok(!JSON.stringify(written).includes("client@acme-orders.example"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--as <role>: a saved session's cookie reaches the server, and is told apart from anonymous", async () => {
    const dir = makeProject(`http://127.0.0.1:${port}`);
    try {
      const sessionDir = path.join(dir, ".doc-kit");
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, "session-manager.json"),
        JSON.stringify({ cookies: [{ name: "sid", value: "secret-token", domain: "127.0.0.1", path: "/" }], origins: [] })
      );
      const r = await cli(["probe", "--project", dir, "--as", "manager", "--json"]);
      assert.equal(r.code, 0, r.err);
      const result = JSON.parse(r.out);
      assert.deepEqual(result.identities, ["anonymous", "manager"]);
      const admin = result.routes.find((x) => x.route === "/api/admin/users");
      assert.equal(admin.status.anonymous, 401);
      assert.equal(admin.status.manager, 200, "the role's saved cookie reached the real server");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("never any method but GET or HEAD reached the real server, across both runs", () => {
    assert.deepEqual([...methodsSeen].sort(), ["GET"]);
  });
});
