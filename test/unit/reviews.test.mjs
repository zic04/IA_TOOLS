// Reviews on demand (ARCHITECTURE.md §6.13): auth/guards of the `api` source on the FastAPI, Express and Next.js
// fixtures; every rule of `security`; `quality` (functions, complexity, duplication, ratings); `probe` (refused
// outside local/demo, the expected/observed matrix with a simulated fetch, GET/HEAD only, no response body
// stored); the `review` configuration; connect --as / probe CLI wiring.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectApi, classifyAuth, resolveGuardPatterns, DEFAULT_ROLE_GUARD, DEFAULT_USER_GUARD } from "../../engine/facts/api.mjs";
import { collectSecurity, RULES } from "../../engine/facts/security.mjs";
import { collectQuality, rating } from "../../engine/facts/quality.mjs";
import {
  isLoopbackUrl,
  probeAllowed,
  cookieHeaderFromStorageState,
  routeParams,
  fillRoute,
  parseSetCookie,
  createThrottle,
  probeFetch,
  isProtectedResponse,
  runProbe,
  ProbeUnreachableError,
} from "../../engine/review/probe.mjs";
import { roleSessionFile, ROLE_PATTERN } from "../../engine/capture/session.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");
const app = (name) => path.join(APPS, name);

/** Runs the CLI and captures its output; `io` adds the test seams (fetch, exec, commit, launch). */
async function cli(args, io = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env: {}, ...io });
  return { code, out, err };
}

/**
 * A documentation project whose application is `appDir`. `overrides.app`/`.capture`/`.review` are merged (one
 * level deep) over the defaults, so that a test can set `app.url` without losing `app.dir`.
 */
function project(appDir, overrides = {}) {
  const dir = tempDir("doc-kit-reviews-");
  const config = {
    product: { name: "Acme Orders" },
    app: { dir: appDir, ...overrides.app },
    ...(overrides.capture ? { capture: overrides.capture } : {}),
    ...(overrides.review ? { review: overrides.review } : {}),
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config)};\n`);
  fs.mkdirSync(path.join(dir, "content"));
  fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  return dir;
}

describe("api: auth/guards on the enriched fixtures (ARCHITECTURE.md §6.13)", () => {
  test("FastAPI: no guard (none), Depends(get_current_user) (user), Depends(require_admin) (role)", () => {
    const items = collectApi(app("fastapi-app"));
    const byRoute = (method, route) => items.find((i) => i.method === method && i.route === route && i.framework === "fastapi");
    assert.equal(byRoute("GET", "/api/orders").auth, "none");
    assert.deepEqual(byRoute("GET", "/api/orders").guards, []);
    assert.equal(byRoute("GET", "/api/orders/{order_id}").auth, "user");
    assert.deepEqual(byRoute("GET", "/api/orders/{order_id}").guards, ["get_current_user"]);
    assert.equal(byRoute("POST", "/api/orders").auth, "role");
    assert.deepEqual(byRoute("POST", "/api/orders").guards, ["require_admin"]);
  });

  test("Express: requireSession (user), requireAdmin (role), requireAuth (unknown), no middleware (none)", () => {
    const items = collectApi(app("express-app"));
    const byRoute = (method, route) => items.find((i) => i.method === method && i.route === route && i.framework === "express");
    assert.equal(byRoute("GET", "/orders").auth, "user");
    assert.deepEqual(byRoute("GET", "/orders").guards, ["requireSession"]);
    assert.equal(byRoute("POST", "/orders").auth, "role");
    assert.deepEqual(byRoute("POST", "/orders").guards, ["requireAdmin"]);
    assert.equal(byRoute("GET", "/health").auth, "none");
    assert.equal(byRoute("GET", "/admin/stats").auth, "unknown");
    assert.deepEqual(byRoute("GET", "/admin/stats").guards, ["requireAuth"]);
  });

  test("Next.js App Router: no guard (none), a role check next to a session call (role), currentUser() alone (unknown)", () => {
    const items = collectApi(app("next-app"));
    const byRoute = (method, route) => items.find((i) => i.method === method && i.route === route && i.framework === "next-app-router");
    assert.equal(byRoute("GET", "/api/orders").auth, "none");
    assert.equal(byRoute("POST", "/api/orders").auth, "role");
    assert.ok(byRoute("POST", "/api/orders").guards.includes("getServerSession"));
    assert.ok(byRoute("POST", "/api/orders").guards.includes("role"));
    assert.equal(byRoute("GET", "/api/orders/[id]").auth, "unknown");
    assert.deepEqual(byRoute("GET", "/api/orders/[id]").guards, ["currentUser"]);
  });

  test("classifyAuth: none without a guard, role checked before user, unknown when neither pattern matches", () => {
    assert.equal(classifyAuth([]), "none");
    assert.equal(classifyAuth(["get_current_user"]), "user");
    assert.equal(classifyAuth(["require_admin"]), "role");
    assert.equal(classifyAuth(["get_current_user", "require_admin"]), "role", "role is checked first");
    assert.equal(classifyAuth(["mystery_guard"]), "unknown");
  });

  test("resolveGuardPatterns: review.guards (strings) replaces the built-in pattern; empty keeps the default", () => {
    const custom = resolveGuardPatterns({ role: ["owner_only"], user: [] });
    assert.ok(custom.role.test("owner_only"));
    assert.ok(!custom.role.test("admin"), "the built-in pattern no longer applies once a custom one is given");
    assert.equal(custom.user, DEFAULT_USER_GUARD);
    assert.equal(resolveGuardPatterns({}).role, DEFAULT_ROLE_GUARD);
  });

  test("collectApi(appDir, guards): a project-configured guard pattern changes the classification", () => {
    const items = collectApi(app("express-app"), { role: [], user: ["requireAuth"] });
    const stats = items.find((i) => i.route === "/admin/stats");
    assert.equal(stats.auth, "user", "requireAuth now matches the configured user pattern");
  });
});

describe("security: every rule, on test/fixtures/apps/security-app (ARCHITECTURE.md §6.13)", () => {
  const items = collectSecurity(app("security-app"), () => null);
  const by = (rule) => items.filter((i) => i.rule === rule);

  test("every declared rule fires exactly once, at the real code line — never on a comment", () => {
    const expected = {
      "xss.dangerouslySetInnerHTML": { file: "frontend/components/Comment.tsx", line: 3, severity: "medium", owasp: "A03:2021" },
      "xss.innerHTML": { file: "frontend/widgets/panel.js", line: 3, severity: "medium", owasp: "A03:2021" },
      "code.eval": { file: "backend/tools.py", line: 3, severity: "high", owasp: "A03:2021" },
      "sql.concat": { file: "backend/reports.py", line: 4, severity: "high", owasp: "A03:2021" },
      "tls.disabled": { file: "backend/client.py", line: 6, severity: "high", owasp: "A02:2021" },
      "cors.wildcardCredentials": { file: "backend/app.py", line: 9, severity: "high", owasp: "A05:2021" },
      "debug.enabled": { file: "backend/app.py", line: 6, severity: "low", owasp: "A05:2021" },
      "jwt.noVerify": { file: "backend/jwt_utils.py", line: 6, severity: "high", owasp: "A07:2021" },
      "secret.default": { file: "backend/settings.py", line: 2, severity: "medium", owasp: "A07:2021" },
      "redirect.open": { file: "backend/views.py", line: 6, severity: "medium", owasp: "A01:2021" },
      "auth.noRateLimit": { file: "backend/auth.py", line: 7, severity: "info", owasp: "A07:2021" },
    };
    assert.deepEqual(RULES.map((r) => r.rule).sort(), Object.keys(expected).sort(), "RULES matches the contract exactly");
    for (const [rule, exp] of Object.entries(expected)) {
      assert.equal(by(rule).length, 1, `${rule}: exactly one finding`);
      assert.deepEqual(by(rule)[0], { rule, ...exp });
    }
  });

  test("a risk-free file (backend/health.py) raises nothing", () => {
    assert.deepEqual(items.filter((i) => i.file === "backend/health.py"), []);
  });

  test("never a value: no finding ever carries the matched text, only rule/file/line/severity/owasp(/sanitized)", () => {
    for (const i of items) {
      const keys = Object.keys(i).sort();
      assert.ok(
        ["file", "line", "owasp", "rule", "severity"].every((k) => keys.includes(k)) && keys.every((k) => ["file", "line", "owasp", "rule", "severity", "sanitized"].includes(k)),
        keys.join(",")
      );
    }
  });

  test("xss.dangerouslySetInnerHTML / xss.innerHTML: sanitized: true and severity low when the expression passes through a sanitizer", () => {
    const dir = tempDir("doc-kit-security-sanitized-");
    try {
      fs.writeFileSync(
        path.join(dir, "a.tsx"),
        'export function C({ html }) {\n  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;\n}\n'
      );
      fs.writeFileSync(path.join(dir, "b.js"), "function f(el, html) {\n  el.innerHTML = DOMPurify.sanitize(html);\n}\n");
      fs.writeFileSync(path.join(dir, "c.js"), "function g(el, html) {\n  el.innerHTML = html;\n}\n"); // not sanitized: unchanged
      const found = collectSecurity(dir, () => null);
      assert.deepEqual(found.find((i) => i.file === "a.tsx"), { rule: "xss.dangerouslySetInnerHTML", file: "a.tsx", line: 2, severity: "low", owasp: "A03:2021", sanitized: true });
      assert.deepEqual(found.find((i) => i.file === "b.js"), { rule: "xss.innerHTML", file: "b.js", line: 2, severity: "low", owasp: "A03:2021", sanitized: true });
      assert.deepEqual(found.find((i) => i.file === "c.js"), { rule: "xss.innerHTML", file: "c.js", line: 2, severity: "medium", owasp: "A03:2021" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("secret.default: a display mask (bullets/asterisks/x, or a literal concatenated/interpolated with a variable slice) and a value too short or too ordinary to be a secret are excluded", () => {
    const dir = tempDir("doc-kit-security-secretdefault-");
    try {
      fs.writeFileSync(
        path.join(dir, "settings.py"),
        [
          'SECRET_DISPLAY = "********"', // 1: display mask only -> excluded
          'SECRET_HINT = "secret"', // 2: short AND a common word -> excluded
          'SECRET_KEY = "x7k9mQ2pLz4"', // 3: looks like an actual secret -> still flagged
          'TOKEN_PREFIX = "deadbeef" + real_token.slice(-4)', // 4: concatenated with a variable slice -> excluded
          "TOKEN_TEMPLATE = `deadbeef${real_token.slice(-4)}`", // 5: interpolated with a variable slice -> excluded
          'PASSWORD_DEFAULT = "changeme"', // 6: 8 chars, but a common placeholder word -> excluded
          "",
        ].join("\n")
      );
      const found = collectSecurity(dir, () => null).filter((i) => i.rule === "secret.default");
      assert.deepEqual(found, [{ rule: "secret.default", file: "settings.py", line: 3, severity: "medium", owasp: "A07:2021" }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("quality: functions, complexity, duplication, TODOs, ratings (ARCHITECTURE.md §6.13)", () => {
  function write(dir, rel, text) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  const dirs = [];
  function fixture() {
    const dir = tempDir("doc-kit-quality-");
    dirs.push(dir);
    return dir;
  }
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  test("JavaScript: a named function, an arrow function assigned to a name, and a method; complexity = 1 + branches", async () => {
    const dir = fixture();
    write(
      dir,
      "a.js",
      [
        "function plain(x) {",
        "  if (x > 0 && x < 10) return 1;", // if + && => complexity 1 + 2 = 3
        "  return 0;",
        "}",
        "",
        "const named = (x) => {",
        "  return x ? 1 : 2;", // ternary => complexity 1 + 1 = 2
        "};",
        "",
        "const obj = {",
        "  method(x) {",
        "    return x;", // no branch => complexity 1
        "  },",
        "};",
        "",
        "[1, 2].map((x) => x + 1);", // inline callback, not assigned to a name: never counted
      ].join("\n")
    );
    const { items } = await collectQuality(dir);
    const a = items.find((i) => i.file === "a.js");
    assert.equal(a.functions, 3, "plain, named, method — not the inline map callback");
    assert.equal(a.complexity, 3, "the file's worst function (plain: 1 if + 1 && = 3)");
  });

  test("a brace inside a string, a template literal's text or a comment never breaks the end-of-function detection (a real-world TSX pitfall: a 1000+-line 'function')", async () => {
    const dir = fixture();
    write(
      dir,
      "big.tsx",
      [
        "export function BigComponent(props) {", // 1
        "  const onClick = () => {", // 2 — a nested arrow-function handler
        '    console.log("clicked");', // 3
        "  };", // 4
        '  const label = "unbalanced { brace, never closed, just text";', // 5 — the pitfall: an unmatched "{" in a string
        "  // a stray closing brace in a comment too: }", // 6
        "  const greeting = `Hi ${props.name}, config: ${JSON.stringify({ a: 1, b: 2 })}`;", // 7 — ${…} is real code
        "  return <div onClick={onClick}>{greeting}</div>;", // 8 — JSX braces are real code too, already balanced
        "}", // 9
        "", // 10
        "export function after() {", // 11
        "  return 1;", // 12
        "}", // 13
      ].join("\n")
    );
    const { items } = await collectQuality(dir);
    const big = items.find((i) => i.file === "big.tsx");
    assert.equal(big.functions, 3, "BigComponent, its onClick handler, and after — found and bounded independently");
    assert.equal(big.longest, 9, "BigComponent: lines 1-9, not swallowing after() nor running to end of file");
    assert.ok(big.longest < big.lines, `longest (${big.longest}) must stay under the file's own line count (${big.lines})`);
  });

  test("Python: def, indentation-bound extent, elif/and/or branches", async () => {
    const dir = fixture();
    write(
      dir,
      "b.py",
      ["def f(x):", "    if x > 0 and x < 10:", "        return 1", "    elif x == 0 or x == -1:", "        return 0", "    return -1", "", "def g():", "    return 1", ""].join("\n")
    );
    const { items } = await collectQuality(dir);
    const b = items.find((i) => i.file === "b.py");
    assert.equal(b.functions, 2);
    assert.equal(b.complexity, 5, "f: 1 + if + and + elif + or = 5; the file keeps the worst of f and g");
  });

  test("duplication: a 6-line block repeated twice is flagged in both files; a single short block is not", async () => {
    const dir = fixture();
    const block = ["const alpha = 1;", "const bravo = 2;", "const charlie = 3;", "const delta = 4;", "const echo = 5;", "const foxtrot = 6;"].join("\n");
    write(dir, "x.js", block + "\nconst onlyHere = 7;\n");
    write(dir, "y.js", "const prelude = 0;\n" + block + "\n");
    write(dir, "z.js", "const tiny = 1;\n"); // far too short to ever duplicate
    const { items, summary } = await collectQuality(dir);
    const x = items.find((i) => i.file === "x.js");
    const y = items.find((i) => i.file === "y.js");
    const z = items.find((i) => i.file === "z.js");
    assert.equal(x.duplicated, 6);
    assert.equal(y.duplicated, 6);
    assert.equal(z.duplicated, 0);
    assert.ok(summary.duplicated >= 12);
    assert.ok(summary.duplicationRatio > 0);
  });

  test("todo: TODO, FIXME, HACK, XXX counted; a comment line excluded from duplication, not from the TODO count", async () => {
    const dir = fixture();
    write(dir, "c.js", "// TODO: refactor\nfunction f() {}\n// FIXME later\n// HACK\n// XXX\n");
    const { items } = await collectQuality(dir);
    assert.equal(items.find((i) => i.file === "c.js").todo, 4);
  });

  test("tests excluded from quality's own files, but used for the test ratio", async () => {
    const dir = fixture();
    write(dir, "src/a.js", "function f() {}\n");
    write(dir, "src/a.test.js", "test('x', () => {});\n");
    const { summary } = await collectQuality(dir);
    assert.equal(summary.files, 1, "the test file itself is excluded");
    assert.equal(summary.testRatio, 1, "1 test file / 1 source file");
  });

  test("tooling: eslint config and pyproject [tool.ruff]/[tool.mypy] detected; absent otherwise", async () => {
    const dir = fixture();
    write(dir, ".eslintrc.json", "{}");
    write(dir, "pyproject.toml", "[tool.ruff]\nline-length = 100\n[tool.mypy]\nstrict = true\n");
    write(dir, "src/a.js", "function f() {}\n");
    const { summary } = await collectQuality(dir);
    assert.equal(summary.tooling.linter, true);
    assert.equal(summary.tooling.types, true);
    assert.equal(summary.tooling.formatter, false);
    assert.equal(summary.tooling.ci, false);
  });

  test("ratings: A to E, each with its own threshold", () => {
    assert.equal(rating(0, [0.03, 0.05, 0.1, 0.2]), "A");
    assert.equal(rating(0.04, [0.03, 0.05, 0.1, 0.2]), "B");
    assert.equal(rating(0.08, [0.03, 0.05, 0.1, 0.2]), "C");
    assert.equal(rating(0.15, [0.03, 0.05, 0.1, 0.2]), "D");
    assert.equal(rating(0.5, [0.03, 0.05, 0.1, 0.2]), "E");
  });

  test("--network: direct dependencies behind their latest version, simulated fetch only", async () => {
    const dir = fixture();
    write(dir, "src/a.js", "function f() {}\n");
    const dependencies = [
      { name: "left-behind", version: "1.0.0", ecosystem: "npm", direct: true },
      { name: "up-to-date", version: "3.0.0", ecosystem: "npm", direct: true },
      { name: "transitive-old", version: "1.0.0", ecosystem: "npm", direct: false },
    ];
    const fetchImpl = async (url) => ({
      ok: true,
      json: async () => (url.includes("left-behind") ? { version: "4.0.0" } : { version: "3.0.0" }),
    });
    const { summary } = await collectQuality(dir, { fetch: fetchImpl, dependencies });
    assert.equal(summary.outdated, 1, "only left-behind (major 1 vs 4); the transitive one is never checked");
  });

  test("without --network, summary.outdated is absent", async () => {
    const dir = fixture();
    write(dir, "src/a.js", "function f() {}\n");
    const { summary } = await collectQuality(dir);
    assert.ok(!("outdated" in summary));
  });
});

describe("probe: refused outside local/demo (ARCHITECTURE.md §6.13)", () => {
  test("isLoopbackUrl: localhost, *.localhost, 127.x, [::1]; a real host is not", () => {
    assert.ok(isLoopbackUrl("http://localhost:3000"));
    assert.ok(isLoopbackUrl("http://app.localhost:3000"));
    assert.ok(isLoopbackUrl("http://127.0.0.1:3000"));
    assert.ok(isLoopbackUrl("http://[::1]:3000"));
    assert.ok(!isLoopbackUrl("https://acme-orders.example.com"));
    assert.ok(!isLoopbackUrl("not a url"));
  });

  test("probeAllowed: production never; demo always; local only when the URL is a loopback address", () => {
    assert.equal(probeAllowed({ capture: { target: "production" }, app: { url: "http://localhost:3000" } }), false);
    assert.equal(probeAllowed({ capture: { target: "demo" }, app: { url: "https://demo.example.com" } }), true);
    assert.equal(probeAllowed({ capture: { target: "local" }, app: { url: "http://localhost:3000" } }), true);
    assert.equal(probeAllowed({ capture: { target: "local" }, app: { url: "https://acme-orders.example.com" } }), false);
  });
});

describe("probe: the expected/observed matrix, with a simulated fetch (ARCHITECTURE.md §6.13)", () => {
  function fakeResponse({ status = 200, headers = {}, setCookies = [], location, body = null } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status,
      headers: {
        get: (name) => {
          const n = name.toLowerCase();
          if (n === "location") return location || null;
          return lower[n] ?? null;
        },
        getSetCookie: () => setCookies,
      },
      json: async () => {
        if (body === null) throw new Error("no body");
        return body;
      },
    };
  }

  test("none → open, 2xx with emails → probe.publicData; role → protected, 2xx to anonymous → probe.unprotected; user → protected, 401 → no finding", async () => {
    const apiItems = [
      { method: "GET", route: "/api/orders", auth: "none" },
      { method: "GET", route: "/api/admin/users", auth: "role" },
      { method: "GET", route: "/api/me", auth: "user" },
    ];
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers });
      if (url === "http://localhost:3000/") return fakeResponse({ headers: { "content-security-policy": "default-src 'self'" }, setCookies: ["sid=abc; Secure; HttpOnly; SameSite=Lax"] });
      if (url.endsWith("/api/orders")) return fakeResponse({ status: 200, body: [{ id: 1, email: "a@b.com" }] });
      if (url.endsWith("/api/admin/users")) return fakeResponse({ status: 200 });
      if (url.endsWith("/api/me")) return fakeResponse({ status: 401 });
      return fakeResponse({ status: 404 });
    };
    const result = await runProbe({ url: "http://localhost:3000", apiItems, fetch: fetchImpl, now: () => 0, sleep: async () => {} });
    assert.equal(result.identities.length, 1);
    assert.equal(result.identities[0], "anonymous");
    const byRoute = (route) => result.routes.find((r) => r.route === route);
    assert.equal(byRoute("/api/orders").expected, "open");
    assert.equal(byRoute("/api/orders").finding, "probe.publicData");
    assert.equal(byRoute("/api/admin/users").expected, "protected");
    assert.equal(byRoute("/api/admin/users").finding, "probe.unprotected");
    assert.equal(byRoute("/api/me").expected, "protected");
    assert.ok(!byRoute("/api/me").finding, "401 to anonymous is exactly what a user-guarded route must do");
    assert.deepEqual(result.cookies["/"], [{ name: "sid", secure: true, httpOnly: true, sameSite: "Lax" }]);
    assert.equal(result.headers["/"]["content-security-policy"], "default-src 'self'");
    // GET and HEAD only: never any other method, across every call this run made.
    assert.ok(calls.length > 0);
    for (const c of calls) assert.ok(["GET", "HEAD"].includes(c.method), c.method);
  });

  test("a redirect to a sign-in-looking path counts as protected; a redirect elsewhere on the same origin does not", async () => {
    assert.equal(isProtectedResponse(401, null, "http://localhost:3000"), true);
    assert.equal(isProtectedResponse(403, null, "http://localhost:3000"), true);
    assert.equal(isProtectedResponse(302, "/login", "http://localhost:3000"), true);
    assert.equal(isProtectedResponse(302, "https://idp.example.com/authorize", "http://localhost:3000"), true, "leaving the origin is a sign-in redirect too");
    assert.equal(isProtectedResponse(302, "/dashboard", "http://localhost:3000"), false);
    assert.equal(isProtectedResponse(200, null, "http://localhost:3000"), false);
  });

  test("a role with a saved session is used (its cookie reaches the request); a role never connected behaves like anonymous", async () => {
    const apiItems = [{ method: "GET", route: "/api/admin/users", auth: "role" }];
    const sessions = {
      manager: { cookies: [{ name: "sid", value: "manager-token", domain: "localhost", path: "/" }], origins: [] },
    };
    const seenCookies = [];
    const fetchImpl = async (url, init) => {
      if (url === "http://localhost:3000/") return fakeResponse({});
      seenCookies.push(init.headers.Cookie || null);
      return fakeResponse({ status: init.headers.Cookie?.includes("manager-token") ? 200 : 403 });
    };
    const result = await runProbe({ url: "http://localhost:3000", roles: ["manager", "never-connected"], sessionOf: (r) => sessions[r] || null, apiItems, fetch: fetchImpl, now: () => 0, sleep: async () => {} });
    const r = result.routes[0];
    assert.equal(r.status.manager, 200, "the saved cookie reached the request");
    assert.equal(r.status["never-connected"], 403, "no session file: behaves as anonymous (no cookie)");
    assert.ok(seenCookies.includes("sid=manager-token"));
  });

  test("a route whose parameter is not in review.params is skipped and listed, never guessed", async () => {
    const apiItems = [{ method: "GET", route: "/api/orders/{order_id}", auth: "user" }];
    const fetchImpl = async (url) => (url === "http://localhost:3000/" ? fakeResponse({}) : fakeResponse({ status: 200 }));
    const result = await runProbe({ url: "http://localhost:3000", apiItems, params: {}, fetch: fetchImpl, now: () => 0, sleep: async () => {} });
    assert.equal(result.routes.length, 0);
    assert.deepEqual(result.skipped, [{ method: "GET", route: "/api/orders/{order_id}", params: ["order_id"] }]);
  });

  test("a POST route is never probed (only GET routes are checked for access control)", async () => {
    const apiItems = [
      { method: "GET", route: "/api/orders", auth: "none" },
      { method: "POST", route: "/api/orders", auth: "role" },
    ];
    const fetchImpl = async () => fakeResponse({ status: 200 });
    const result = await runProbe({ url: "http://localhost:3000", apiItems, fetch: fetchImpl, now: () => 0, sleep: async () => {} });
    assert.deepEqual(result.routes.map((r) => r.method), ["GET"]);
  });

  test("never a response body stored: a secret marker in the body never reaches the result", async () => {
    const apiItems = [{ method: "GET", route: "/api/orders", auth: "none" }];
    const fetchImpl = async (url) => (url === "http://localhost:3000/" ? fakeResponse({}) : fakeResponse({ status: 200, body: [{ email: "x@y.com", secretMarker: "sk-TOTALLY-SECRET-12345" }] }));
    const result = await runProbe({ url: "http://localhost:3000", apiItems, fetch: fetchImpl, now: () => 0, sleep: async () => {} });
    assert.ok(!JSON.stringify(result).includes("TOTALLY-SECRET"), "the body is read only to decide publicData, never kept");
  });

  test("probeFetch: refuses any method but GET/HEAD — a safety rule, never relaxed", async () => {
    await assert.rejects(() => probeFetch(async () => fakeResponse({}), "http://localhost:3000/", { method: "POST" }), /not allowed/);
    await assert.doesNotReject(() => probeFetch(async () => fakeResponse({}), "http://localhost:3000/", { method: "HEAD" }));
  });

  test("createThrottle: never more than maxPerSecond calls, spaced evenly (a virtual clock, no real delay)", async () => {
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms) => {
      clock += ms;
    };
    const throttle = createThrottle(4, { now, sleep });
    const stamps = [];
    for (let i = 0; i < 8; i++) {
      await throttle();
      stamps.push(clock);
    }
    for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i] - stamps[i - 1] >= 250, `call ${i}: ${stamps[i] - stamps[i - 1]}ms apart`);
  });

  test("ProbeUnreachableError when the very first request (to \"/\") fails; a failure on a single route never aborts the run", async () => {
    const apiItems = [{ method: "GET", route: "/api/orders", auth: "none" }];
    const unreachable = async () => {
      throw new Error("ECONNREFUSED");
    };
    await assert.rejects(() => runProbe({ url: "http://localhost:3000", apiItems, fetch: unreachable, now: () => 0, sleep: async () => {} }), ProbeUnreachableError);

    // Calls to the sample API route happen twice before the access-control loop (its own header/CORS checks on
    // "/api/orders"): only the THIRD call to that exact URL is the actual access-control check, which fails.
    const callsByUrl = {};
    const flaky = async (url) => {
      if (url === "http://localhost:3000/") return fakeResponse({});
      callsByUrl[url] = (callsByUrl[url] || 0) + 1;
      if (callsByUrl[url] === 3) throw new Error("timeout");
      return fakeResponse({ status: 200 });
    };
    const result = await runProbe({ url: "http://localhost:3000", apiItems, fetch: flaky, now: () => 0, sleep: async () => {} });
    assert.equal(result.routes[0].status.anonymous, null, "a failed request on a route: status null, no finding guessed");
    assert.ok(!result.routes[0].finding);
  });
});

describe("probe: cookieHeaderFromStorageState, routeParams/fillRoute, parseSetCookie", () => {
  test("cookieHeaderFromStorageState: domain match (with and without a leading dot), expired cookies dropped", () => {
    const now = Date.now() / 1000;
    const state = {
      cookies: [
        { name: "a", value: "1", domain: "localhost", path: "/" },
        { name: "b", value: "2", domain: ".localhost", path: "/" },
        { name: "c", value: "3", domain: "other.example.com", path: "/" },
        { name: "expired", value: "4", domain: "localhost", path: "/", expires: now - 3600 },
      ],
    };
    assert.equal(cookieHeaderFromStorageState(state, "http://localhost:3000"), "a=1; b=2");
    assert.equal(cookieHeaderFromStorageState(null, "http://localhost:3000"), "");
    assert.equal(cookieHeaderFromStorageState({ cookies: [] }, "http://localhost:3000"), "");
  });

  test("routeParams/fillRoute: {name}, :name, [name], [...name]", () => {
    assert.deepEqual(routeParams("/groups/{group_id}/members"), ["group_id"]);
    assert.deepEqual(routeParams("/orders/:id"), ["id"]);
    assert.deepEqual(routeParams("/orders/[id]"), ["id"]);
    assert.deepEqual(routeParams("/docs/[...slug]"), ["slug"]);
    assert.equal(fillRoute("/groups/{group_id}/members", { group_id: "g1" }), "/groups/g1/members");
    assert.equal(fillRoute("/orders/[id]", { id: "42" }), "/orders/42");
  });

  test("parseSetCookie: Secure, HttpOnly, SameSite, and a cookie with none of these attributes", () => {
    assert.deepEqual(parseSetCookie("sid=abc; Secure; HttpOnly; SameSite=Strict"), { name: "sid", secure: true, httpOnly: true, sameSite: "Strict" });
    assert.deepEqual(parseSetCookie("plain=1"), { name: "plain", secure: false, httpOnly: false, sameSite: null });
  });
});

describe("review configuration (ARCHITECTURE.md §6.13)", () => {
  test("defaults: guards {role:[],user:[]}, params {}, semgrep null", () => {
    const config = prepareConfig({ product: { name: "Acme Orders" } }, { env: {} });
    assert.deepEqual(config.review, { guards: { role: [], user: [] }, params: {}, semgrep: null });
  });

  test("an unknown review key is a validation error (exit code 2)", () => {
    assert.throws(() => prepareConfig({ product: { name: "Acme Orders" }, review: { bogus: 1 } }, { env: {} }), /invalid/i);
  });
});

describe("connect --as / probe (CLI)", () => {
  let dirs = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  function mk(appDir, overrides) {
    const d = project(appDir, overrides);
    dirs.push(d);
    return d;
  }

  test("ROLE_PATTERN: letters, digits, dashes, starting with a letter", () => {
    assert.ok(ROLE_PATTERN.test("manager"));
    assert.ok(ROLE_PATTERN.test("read-only-2"));
    assert.ok(!ROLE_PATTERN.test("2fast"));
    assert.ok(!ROLE_PATTERN.test("has space"));
  });

  test("connect --as <role> targets .doc-kit/session-<role>.json, never the plain session file (via --forget: no browser needed)", async () => {
    const dir = mk(app("express-app"), { app: { url: "http://localhost:9999" } });
    const roleFile = path.join(dir, ".doc-kit", "session-manager.json");
    const plainFile = path.join(dir, ".doc-kit", "session.json");
    fs.mkdirSync(path.dirname(roleFile), { recursive: true });
    fs.writeFileSync(roleFile, "{}");
    fs.writeFileSync(plainFile, "{}");
    const r = await cli(["connect", "--forget", "--as", "manager", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.ok(!fs.existsSync(roleFile), "the role session is forgotten");
    assert.ok(fs.existsSync(plainFile), "the plain session (without --as) is untouched");
  });

  test("connect() + roleSessionFile(): a role's session is written at .doc-kit/session-<role>.json (engine, a fake browser)", async () => {
    const dir = tempDir("doc-kit-reviews-connect-");
    dirs.push(dir);
    const { connect } = await import("../../engine/capture/session.mjs");
    const file = roleSessionFile(dir, "manager");
    const auth = { adapter: { session: async () => ({ who: "manager@acme-orders.example" }), detects: false }, options: { start: "/" } };
    const fakePage = { goto: async () => {}, isClosed: () => false };
    const launch = async () => ({
      isConnected: () => true,
      newContext: async () => ({
        newPage: async () => fakePage,
        pages: () => [fakePage],
        storageState: async ({ path: p }) => fs.writeFileSync(p, JSON.stringify({ cookies: [{ name: "sid", value: "x", domain: "localhost", path: "/" }], origins: [] })),
      }),
      close: async () => {},
    });
    const result = await connect({ url: "http://localhost:9999", auth, file, headless: true, waitForUser: async () => {}, launch });
    assert.equal(result.file, file);
    assert.equal(result.who, "manager@acme-orders.example");
    assert.ok(fs.existsSync(file));
    assert.ok(!fs.existsSync(path.join(dir, ".doc-kit", "session.json")), "the plain session file was never touched");
  });

  test("probe: refused (exit code 2) with capture.target production, or a non-loopback URL without demo", async () => {
    const prodDir = mk(app("express-app"), { app: { url: "https://acme-orders.example.com" }, capture: { target: "production" } });
    const r1 = await cli(["probe", "--project", prodDir]);
    assert.equal(r1.code, 2);
    assert.match(r1.err, /local|demo|probe/i);

    const remoteDir = mk(app("express-app"), { app: { url: "https://acme-orders.example.com" } });
    const r2 = await cli(["probe", "--project", remoteDir]);
    assert.equal(r2.code, 2);
  });

  test("probe: --json writes facts/probe.json and prints the result; local URL, no facts/api.json yet → no routes, no crash", async () => {
    const dir = mk(app("express-app"), { app: { url: "http://localhost:4100" } });
    const fetchImpl = async (url, init) => ({
      status: 200,
      headers: { get: () => null, getSetCookie: () => [] },
      json: async () => ({}),
    });
    const r = await cli(["probe", "--project", dir, "--json"], { fetch: fetchImpl });
    assert.equal(r.code, 0, r.err);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.url, "http://localhost:4100");
    assert.deepEqual(parsed.routes, []);
    assert.ok(fs.existsSync(path.join(dir, "facts", "probe.json")));
  });

  test("probe --as <role> with an invalid role name → usage error (exit code 2)", async () => {
    const dir = mk(app("express-app"), { app: { url: "http://localhost:4100" } });
    const r = await cli(["probe", "--project", dir, "--as", "has space"], { fetch: async () => ({ status: 200, headers: { get: () => null, getSetCookie: () => [] } }) });
    assert.equal(r.code, 2);
  });

  test("facts --source security --source quality (CLI)", async () => {
    const dir = mk(app("security-app"));
    const r = await cli(["facts", "--project", dir, "--source", "security", "--source", "quality"], { commit: () => null, exec: () => null });
    assert.equal(r.code, 0, r.err);
    const security = JSON.parse(fs.readFileSync(path.join(dir, "facts", "security.json"), "utf8"));
    assert.equal(security.source, "security");
    assert.ok(security.items.length >= 10);
    const quality = JSON.parse(fs.readFileSync(path.join(dir, "facts", "quality.json"), "utf8"));
    assert.equal(quality.source, "quality");
    assert.ok(quality.summary.ratings);
  });

  test("facts --tools: semgrep only runs with review.semgrep configured (never --config auto)", async () => {
    const withoutSemgrep = mk(app("express-app"));
    const execCalls = [];
    const exec = (bin, args) => {
      execCalls.push({ bin, args });
      return null;
    };
    await cli(["facts", "--project", withoutSemgrep, "--source", "env", "--tools"], { commit: () => null, exec });
    assert.ok(!execCalls.some((c) => c.bin === "semgrep"), "no local rules folder: semgrep never runs");

    const semgrepDir = mk(app("express-app"), { review: { semgrep: "rules" } });
    fs.mkdirSync(path.join(semgrepDir, "rules"), { recursive: true });
    const execCalls2 = [];
    const exec2 = (bin, args) => {
      execCalls2.push({ bin, args });
      if (bin === "semgrep") return { status: 0, stdout: JSON.stringify({ results: [] }) };
      return null;
    };
    const r = await cli(["facts", "--project", semgrepDir, "--source", "env", "--tools"], { commit: () => null, exec: exec2 });
    assert.equal(r.code, 0, r.err);
    const semgrepCall = execCalls2.find((c) => c.bin === "semgrep");
    assert.ok(semgrepCall, "semgrep ran once review.semgrep was configured");
    assert.ok(!semgrepCall.args.includes("auto"), "never --config auto");
    assert.ok(fs.existsSync(path.join(semgrepDir, "facts", "tool-semgrep.json")));
  });
});
