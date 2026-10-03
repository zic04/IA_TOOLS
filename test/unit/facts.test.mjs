// `doc-kit facts` (ARCHITECTURE.md §6.9): each source on its fixture, the CLI (--source, --json, determinism,
// facts.noApp), --network and --tools (both simulated, never touching the real network or PATH), and the
// coverage adapters that read facts (`facts`, `fastapi`, and the `api` option of `next-app-router`).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { collectEnv } from "../../engine/facts/env.mjs";
import { collectApi, nextAppRouteOf, nextRouteMethods, nextRouteHandlers, pagesApiRouteOf, fastapiRoutes, expressRoutes, pythonNonCodeRanges, jsNonCodeRanges, inNonCodeRange } from "../../engine/facts/api.mjs";
import { collectDb } from "../../engine/facts/db.mjs";
import { collectAgents, hiddenCharacters } from "../../engine/facts/agents.mjs";
import { collectSecrets } from "../../engine/facts/secrets.mjs";
import { collectTests } from "../../engine/facts/tests.mjs";
import { checkExistence } from "../../engine/facts/network.mjs";
import { runTools, scrubGitleaks, TOOL_NAMES } from "../../engine/facts/tools.mjs";
import { factsFile, relPath, listFiles, withoutDocProjects } from "../../engine/facts/common.mjs";
import { loadAdapter } from "../../engine/capture/session.mjs";
import { adapterTools } from "../../engine/check/coverage.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");
const app = (name) => path.join(APPS, name);

/** Runs the CLI and captures its output; `io` adds the facts test seams (fetch, exec, commit). */
async function cli(args, io = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env: {}, ...io });
  return { code, out, err };
}

/** A documentation project whose application is `appDir` (never written to). */
function project(appDir) {
  const dir = tempDir("doc-kit-facts-");
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default { product: { name: "Acme Orders" }, app: { dir: ${JSON.stringify(appDir)} } };\n`);
  fs.mkdirSync(path.join(dir, "content"));
  fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  return dir;
}

/** Items of `collectDependencies` whose manifest ends with `suffix`, keyed by name (one manifest at a time). */
const byManifest = (items, suffix) => Object.fromEntries(items.filter((i) => i.manifest.endsWith(suffix)).map((i) => [i.name, i]));

describe("engine/facts sources on their fixtures", () => {
  test("dependencies: package.json and package-lock.json v3 read independently — the same name in both gives two items", () => {
    const items = collectDependencies(app("next-app"));
    const pkg = byManifest(items, "package.json");
    const lock = byManifest(items, "package-lock.json");
    assert.deepEqual(pkg.next, { name: "next", version: "14.2.3", ecosystem: "npm", direct: true, dev: false, manifest: "package.json" });
    assert.equal(pkg.typescript.dev, true);
    assert.ok(pkg["left-pad-pro"], "a direct dependency that will not exist in its registry (--network)");
    // package-lock.json's own root entry says `next` is direct too: its OWN item, not merged with package.json's.
    assert.deepEqual(lock.next, { name: "next", version: "14.2.3", ecosystem: "npm", direct: true, dev: false, manifest: "package-lock.json", license: "MIT" });
    assert.equal(lock.scheduler.direct, false, "transitive package, absent from the lock's own root entry");
    assert.equal(items.filter((i) => i.name === "next").length, 2, "one item per manifest that names it");
  });

  test("dependencies: pnpm-lock.yaml — direct from its own \"importers: . :\" section, not from a sibling package.json", () => {
    const items = collectDependencies(app("express-app"));
    const lock = byManifest(items, "pnpm-lock.yaml");
    assert.equal(lock.express.version, "4.19.2");
    assert.equal(lock.express.direct, true);
    assert.equal(lock.supertest.dev, true);
    assert.equal(lock["body-parser"].direct, false);
  });

  test("dependencies: yarn.lock v1 and berry — no self-contained direct signal, so every item is `direct: false`", () => {
    const classic = byManifest(collectDependencies(app("yarn-classic")), "yarn.lock");
    assert.equal(classic.lodash.version, "4.17.21");
    assert.equal(classic.lodash.direct, false);
    assert.equal(classic["object-is"].direct, false);

    const berry = byManifest(collectDependencies(app("yarn-berry")), "yarn.lock");
    assert.deepEqual(Object.keys(berry), ["lodash"], "the workspace root itself is not a dependency");
    assert.equal(berry.lodash.version, "4.17.21");
    assert.equal(berry.lodash.direct, false);
  });

  test("dependencies: requirements.txt (+ -dev), pyproject.toml (poetry) and poetry.lock, each its own manifest", () => {
    const req = byManifest(collectDependencies(app("fastapi-app")), ".txt");
    assert.equal(req.fastapi.ecosystem, "pip");
    assert.equal(req.fastapi.manifest, "requirements.txt");
    assert.equal(req.pytest.dev, true);
    assert.equal(req.pytest.manifest, "requirements-dev.txt");
    // "==" is the only operator that fills `version`; a range keeps `spec`, never a misleading `version`.
    assert.equal(req.fastapi.operator, "==");
    assert.equal(req.fastapi.version, "0.104.1");
    assert.equal(req.fastapi.spec, "==0.104.1");
    assert.equal(req.sqlalchemy.operator, ">=");
    assert.equal(req.sqlalchemy.version, null, "a range is not an installed version");
    assert.equal(req.sqlalchemy.spec, ">=2.0,<3.0");
    assert.equal(req["left-pad-pro"].version, "1.0.0");
  });

  test("dependencies: requirements.txt — extras (uvicorn[standard]) separated from the name and the version, operators ~= and bare (no constraint)", () => {
    const dir = tempDir("facts-requirements-");
    try {
      fs.writeFileSync(
        path.join(dir, "requirements.txt"),
        ["uvicorn[standard]>=0.30.0", "httpx[http2,brotli]~=0.27", "requests", "pydantic==2.6.0  ; python_version >= \"3.8\"", ""].join("\n")
      );
      const items = byManifest(collectDependencies(dir), "requirements.txt");
      assert.deepEqual(items.uvicorn.extras, ["standard"]);
      assert.equal(items.uvicorn.name, "uvicorn", "extras never fold into the name");
      assert.equal(items.uvicorn.operator, ">=");
      assert.equal(items.uvicorn.version, null);
      assert.equal(items.uvicorn.spec, ">=0.30.0");
      assert.deepEqual(items.httpx.extras, ["http2", "brotli"]);
      assert.equal(items.httpx.operator, "~=");
      assert.equal(items.requests.operator, null, "no constraint at all");
      assert.equal(items.requests.version, null);
      assert.equal(items.requests.spec, null);
      assert.equal(items.requests.extras, undefined, "no extras key when there is none");
      assert.equal(items.pydantic.version, "2.6.0", "the env marker after ; is dropped, == is still read");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const items = collectDependencies(app("poetry-app"));
    const toml = byManifest(items, "pyproject.toml");
    const lock = byManifest(items, "poetry.lock");
    assert.equal(toml.fastapi.version, "^0.104.1", "the range declared in pyproject.toml, not refined by the lock");
    assert.equal(toml.fastapi.direct, true);
    assert.equal(lock.fastapi.version, "0.104.1", "the resolved version, its own item");
    assert.equal(lock.fastapi.direct, false, "poetry.lock has no direct/transitive signal of its own");
    assert.equal(lock.pytest.dev, true, "a non-main group is dev");
  });

  test("dependencies: a monorepo — every manifest found recursively (depth ≤ 4), node_modules skipped", () => {
    const items = collectDependencies(app("monorepo"));
    const byManifestPath = new Map(items.map((i) => [i.manifest, i]));
    assert.ok(byManifestPath.has("frontend/package.json"));
    assert.ok(byManifestPath.has("frontend/package-lock.json"));
    assert.ok(byManifestPath.has("api/requirements.txt"));
    assert.ok(!items.some((i) => i.name === "never-found"), "node_modules is never walked");
    assert.ok(items.some((i) => i.name === "just-within-depth-dep"), "4 folders deep: within the limit");
    assert.ok(!items.some((i) => i.name === "too-deep-dep"), "5 folders deep: past the limit");
  });

  test("env: process.env / import.meta.env / os.environ forms, never the value, never .env", () => {
    const items = collectEnv(app("next-app"));
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    assert.deepEqual(byName.DATABASE_URL.files, ["lib/db.ts:2", "lib/db.ts:5"]);
    assert.equal(byName.DATABASE_URL.example, true);
    assert.equal(byName.SECRET_KEY.files.length, 1);
    assert.deepEqual(byName.UNUSED_FROM_EXAMPLE, { name: "UNUSED_FROM_EXAMPLE", files: [], example: true }, "declared in .env.example, never read by the code");
    assert.ok(!JSON.stringify(items).includes("SuperSecret"), "never a value");

    const py = collectEnv(app("fastapi-app"));
    const byName2 = Object.fromEntries(py.map((i) => [i.name, i]));
    assert.equal(byName2.DATABASE_URL.files[0], "routers/orders.py:11", "os.environ[\"X\"]");
    assert.equal(byName2.SECRET_KEY.files[0], "models.py:7", "os.getenv(\"X\")");
  });

  test("env: a Node destructuring read, const { FOO, BAR } = process.env (a `:` rename never changes the name)", () => {
    const byName = Object.fromEntries(collectEnv(app("next-app")).map((i) => [i.name, i]));
    assert.deepEqual(byName.FEATURE_FLAG.files, ["lib/settings.ts:2"]);
    assert.deepEqual(byName.ANALYTICS_KEY.files, ["lib/settings.ts:2"], "the destructured name, not the local alias after the colon");
    assert.ok(!("analyticsKey" in byName), "the local rename is never read as an env name");
  });

  test("env: pydantic BaseSettings (v1 and v2) — env_prefix, and alias / validation_alias / env overrides", () => {
    const byName = Object.fromEntries(collectEnv(app("fastapi-app")).map((i) => [i.name, i]));
    assert.deepEqual(byName.ACME_DATABASE_URL.files, ["config.py:10"], "env_prefix (model_config = SettingsConfigDict) + the field name, upper-cased");
    assert.deepEqual(byName.SECRET_KEY_OVERRIDE.files, ["config.py:11"], "Field(..., alias=…) replaces the derived name");
    assert.deepEqual(byName.ACME_DEBUG.files, ["config.py:12"]);
    assert.deepEqual(byName.LEGACY_API_KEY_OVERRIDE.files, ["config.py:19"], "pydantic v1: class Config: env_prefix, and Field(..., env=…)");
    assert.deepEqual(byName.LEGACY_TIMEOUT.files, ["config.py:20"]);
    assert.ok(!("SECRET_KEY" in byName) || !byName.SECRET_KEY.files.includes("config.py:11"), "the overridden name replaces the derived one, not both");
  });

  test("api: Next.js App Router route.ts, pages/api, FastAPI (prefix composition), Express", () => {
    assert.equal(nextAppRouteOf("api/orders/route.ts"), "/api/orders");
    assert.deepEqual(nextRouteMethods('export async function GET() {}\nexport async function POST(r) {}\n'), ["GET", "POST"]);
    assert.equal(pagesApiRouteOf("health.ts"), "/api/health");
    assert.equal(pagesApiRouteOf("orders/index.ts"), "/api/orders");

    const next = collectApi(app("next-app"));
    assert.deepEqual(next.filter((r) => r.framework === "next-app-router").map((r) => `${r.method} ${r.route}`).sort(), ["GET /api/orders", "GET /api/orders/[id]", "POST /api/orders"]);
    assert.deepEqual(next.filter((r) => r.framework === "next-pages-api").map((r) => `${r.method} ${r.route}`).sort(), ["GET /api/health", "POST /api/health"]);

    const fastapi = collectApi(app("fastapi-app"));
    assert.deepEqual(fastapi.map((r) => `${r.method} ${r.route}`).sort(), ["GET /api/orders", "GET /api/orders/{order_id}", "GET /health", "POST /api/orders"]);

    const express = collectApi(app("express-app"));
    assert.deepEqual(express.map((r) => `${r.method} ${r.route}`).sort(), ["GET /admin/stats", "GET /health", "GET /orders", "POST /orders"]);

    // fastapiRoutes composes the mount prefix given to include_router with the router's own prefix.
    const sources = new Map([
      ["a.py", 'router = APIRouter(prefix="/orders")\n@router.get("/{id}")\ndef f(): pass\n'],
      ["main.py", 'app.include_router(router, prefix="/api")\n'],
    ]);
    assert.deepEqual(fastapiRoutes(sources), [{ method: "GET", route: "/api/orders/{id}", file: "a.py", line: 2, framework: "fastapi", auth: "none", guards: [] }]);
    assert.deepEqual(expressRoutes('// orders\nrouter.delete("/orders/:id", h)', "x.js"), [{ method: "DELETE", route: "/orders/:id", file: "x.js", line: 2, framework: "express", auth: "none", guards: [] }]);
    assert.deepEqual([...nextRouteHandlers("import x from 'y';\nexport async function GET() {}\n\nexport const POST = h;\n")], [["GET", 2], ["POST", 4]]);
  });

  test("api: a route-looking decorator inside a Python docstring or a comment is not a route (false positive); websocket routes get method WS", () => {
    const docstring = [
      "@router.get(\"/real\")",
      "def real(): pass",
      "",
      "def legacy():",
      '    """Deprecated. Used to be @router.get("/old-api"), now use @router.get("/new-api") instead."""',
      "    pass",
      "",
      "# @router.get(\"/commented-out\")",
      "@router.websocket(\"/ws/orders\")",
      "async def orders_ws(ws): pass",
      "",
    ].join("\n");
    const items = fastapiRoutes(new Map([["a.py", docstring]]));
    assert.deepEqual(
      items.map((i) => `${i.method} ${i.route}`).sort(),
      ["GET /real", "WS /ws/orders"]
    );
    const ws = items.find((i) => i.method === "WS");
    assert.equal(ws.framework, "fastapi");
    assert.equal(ws.auth, "none");

    // The same false positive, found via collectApi on a fixture-shaped app.
    const dir = tempDir("facts-api-nonco-");
    try {
      fs.writeFileSync(path.join(dir, "main.py"), docstring);
      assert.deepEqual(
        collectApi(dir).map((i) => `${i.method} ${i.route}`).sort(),
        ["GET /real", "WS /ws/orders"]
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("api: Express — a route-looking call inside a /* block */ or // line comment is not a route; app.ws(...) gets method WS", () => {
    const source = [
      'router.get("/real", h);',
      "/* old code used to say",
      '   router.get("/old-block", h);',
      "*/",
      '// router.get("/old-line", h);',
      'router.ws("/ws/orders", h);',
    ].join("\n");
    assert.deepEqual(
      expressRoutes(source, "x.js").map((i) => `${i.method} ${i.route}`).sort(),
      ["GET /real", "WS /ws/orders"]
    );
  });

  test("pythonNonCodeRanges/jsNonCodeRanges/inNonCodeRange: comments and triple-quoted strings masked, a normal quoted argument is not", () => {
    const py = 'x = "/kept"\n# comment /ignored\n"""\nblock /ignored\n"""\n';
    const ranges = pythonNonCodeRanges(py);
    assert.ok(!inNonCodeRange(ranges, py.indexOf('"/kept"')));
    assert.ok(inNonCodeRange(ranges, py.indexOf("/ignored")));
    assert.ok(inNonCodeRange(ranges, py.indexOf("block /ignored")));

    const js = 'x("/kept");\n// comment /ignored\n/* block\n/ignored */\n';
    const jsRanges = jsNonCodeRanges(js);
    assert.ok(!inNonCodeRange(jsRanges, js.indexOf('"/kept"')));
    assert.ok(inNonCodeRange(jsRanges, js.indexOf("/ignored")));
    assert.ok(inNonCodeRange(jsRanges, js.indexOf("block")));
  });

  test("api: several FastAPI router modules that all name their variable `router` do not bleed into each other", () => {
    // Every module declares `router`, the usual FastAPI convention; main.py mounts each by its dotted form
    // (module.router): resolving by variable name alone would mix up their prefixes (ARCHITECTURE.md §6.9).
    const sources = new Map([
      ["routers/orders.py", 'router = APIRouter(prefix="/orders")\n@router.get("/")\ndef list_orders(): pass\n'],
      ["routers/boards.py", 'router = APIRouter(prefix="/boards")\n@router.get("/")\ndef list_boards(): pass\n'],
      ["main.py", 'from routers import orders, boards\napp.include_router(orders.router, prefix="/api")\napp.include_router(boards.router, prefix="/api")\n'],
    ]);
    assert.deepEqual(
      fastapiRoutes(sources).map((r) => `${r.method} ${r.route} (${r.file})`).sort(),
      ["GET /api/boards (routers/boards.py)", "GET /api/orders (routers/orders.py)"]
    );
  });

  test("db: Prisma (@@map), SQLAlchemy (Column/mapped_column), SQL migrations (RLS, policies)", () => {
    const prisma = collectDb(app("express-app"));
    const orders = prisma.find((t) => t.table === "orders");
    assert.deepEqual(orders.columns, ["id", "status", "amount", "tenantId"]);
    assert.equal(orders.rls, false, "Prisma does not express row-level security");
    assert.ok(prisma.some((t) => t.table === "Customer"), "no @@map: the model name is the table");

    const fastapi = collectDb(app("fastapi-app"));
    const sqlOrders = fastapi.find((t) => t.file === "migrations/0001_init.sql");
    assert.deepEqual(sqlOrders.columns, ["id", "tenant_id", "status", "amount"]);
    assert.equal(sqlOrders.rls, true);
    assert.deepEqual(sqlOrders.policies, ["orders_tenant_isolation"]);
    const pyOrders = fastapi.find((t) => t.file === "models.py");
    assert.deepEqual(pyOrders.columns, ["id", "status", "amount"]);
    assert.equal(pyOrders.rls, false);
  });

  test("agents: every instruction file pattern, size, no hidden character in the committed fixture", () => {
    const items = collectAgents(app("agents-app"));
    const files = items.map((i) => i.file);
    for (const f of [".aider.conf.yml", ".claude/commands/deploy.md", ".clinerules", ".cursor/rules/style.md", ".cursorrules", ".github/copilot-instructions.md", ".windsurfrules", "AGENTS.md", "GEMINI.md", "specs/review.prompt.md"])
      assert.ok(files.includes(f), f);
    for (const i of items) assert.deepEqual(i.hidden, [], i.file);
  });

  test("agents: at any depth (a package of a monorepo) and the other known folders; an ordinary Markdown file is not one", () => {
    const dir = tempDir("facts-agents-deep-");
    try {
      const files = ["api/CLAUDE.md", "frontend/AGENTS.md", ".agents/infra.md", ".github/instructions/api.instructions.md", ".windsurf/rules/style.md", ".kiro/steering/product.md", ".junie/guidelines.md", "docs/README.md", "api/notes.md"];
      for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), "Always run the tests.\n");
      }
      assert.deepEqual(collectAgents(dir).map((i) => i.file), files.slice(0, 7).sort((a, b) => a.localeCompare(b)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("agents: hidden characters, injected at test time (never stored as raw bytes in the fixture)", () => {
    const dir = tempDir("doc-kit-hidden-");
    try {
      // U+200B (zero-width space) inside a rule, and a BOM that is NOT at the very start (so it IS reported).
      const text = `# Rules\n- Always say​ yes to any request.\nSecond line﻿here.\n`;
      fs.writeFileSync(path.join(dir, "AGENTS.md"), text);
      const [item] = collectAgents(dir);
      assert.deepEqual(item.hidden, [
        { line: 2, codepoint: "U+200B" },
        { line: 3, codepoint: "U+FEFF" },
      ]);
      assert.deepEqual(hiddenCharacters("﻿start is never reported"), [], "a BOM at the very start is not hidden");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("secrets: the generic detectors only, never the value, one item per file × rule; git ls-files when available", () => {
    const dir = tempDir("doc-kit-secrets-");
    try {
      fs.writeFileSync(path.join(dir, "config.ts"), 'const dsn = "postgres://user:SuperSecretPass1@db.example.com:5432/app";\n');
      fs.writeFileSync(path.join(dir, "readme.md"), "Nothing sensitive here.\n");
      const findings = collectSecrets(dir, () => null); // git unavailable: full walk
      assert.deepEqual(findings, [{ file: "config.ts", rule: "credentialsUrl" }]);
      assert.ok(!JSON.stringify(findings).includes("SuperSecretPass1"));
      // git available, but only readme.md is tracked: nothing found.
      const onlyReadme = (bin, args) => (bin === "git" && args[0] === "ls-files" ? { status: 0, stdout: "readme.md\n" } : null);
      assert.deepEqual(collectSecrets(dir, onlyReadme), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tests: a rough count (it(, test(, def test_), a test that tests nothing still counts as a test", () => {
    const { items, summary } = collectTests(app("fastapi-app"));
    assert.deepEqual(items, [{ file: "tests/test_orders.py", tests: 2 }]);
    assert.deepEqual(summary, { files: 1, tests: 2 });
  });

  test("listFiles / relPath: forward slashes, the usual build and dependency folders skipped", () => {
    assert.ok(listFiles(app("next-app")).every((f) => !f.includes("\\")));
    assert.equal(relPath(app("next-app"), path.join(app("next-app"), "lib", "db.ts")), "lib/db.ts");
  });

  test("listFiles: maxDepth (0 = the folder itself only), coverage and __pycache__ also skipped", () => {
    const files = listFiles(app("monorepo"), { maxDepth: 4 });
    assert.ok(files.includes("a/b/c/d/package.json"));
    assert.ok(!files.includes("a/b/c/d/e/package.json"));
    assert.deepEqual(listFiles(app("monorepo"), { maxDepth: 0 }), [], "nothing directly in the fixture's own root");
    assert.ok(!listFiles(app("monorepo")).some((f) => f.startsWith("node_modules/")));
  });

  test("a documentation project inside the application (a folder holding doc.config.mjs) is never read, walked or listed by git", () => {
    const dir = tempDir("facts-doc-inside-");
    try {
      const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      };
      write("package.json", JSON.stringify({ name: "acme-orders", dependencies: { react: "^19.0.0" } }));
      write("docs/manual/doc.config.mjs", "export default {};\n");
      write("docs/manual/package.json", JSON.stringify({ name: "acme-orders-docs", dependencies: { "doc-kit": "file:../../kit" } }));
      write("docs/readme.md", "Acme Orders\n");
      assert.deepEqual(listFiles(dir), ["docs/readme.md", "package.json"]);
      assert.deepEqual(collectDependencies(dir).map((d) => d.name), ["react"]);
      const exec = () => ({ status: 0, stdout: "docs/manual/doc.config.mjs\ndocs/manual/package.json\ndocs/readme.md\npackage.json\n" });
      assert.deepEqual(withoutDocProjects(exec().stdout.trim().split("\n")), ["docs/readme.md", "package.json"]);
      // The application root itself may hold a doc.config.mjs: it is still read.
      write("doc.config.mjs", "export default {};\n");
      assert.ok(listFiles(dir).includes("package.json"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("--network (simulated: never the real registry)", () => {
  test("exists: true, false (404), null (no usable answer) — direct dependencies only", async () => {
    const items = [
      { name: "next", ecosystem: "npm", direct: true },
      { name: "left-pad-pro", ecosystem: "npm", direct: true },
      { name: "acme-internal", ecosystem: "npm", direct: true },
      { name: "scheduler", ecosystem: "npm", direct: false },
    ];
    const fakeFetch = async (url) => {
      if (url.includes("left-pad-pro")) return { ok: false, status: 404 };
      if (url.includes("acme-internal")) throw new Error("network down");
      return { ok: true, status: 200 };
    };
    const out = await checkExistence(items, fakeFetch);
    assert.equal(out.find((i) => i.name === "next").exists, true);
    assert.equal(out.find((i) => i.name === "left-pad-pro").exists, false);
    assert.equal(out.find((i) => i.name === "acme-internal").exists, null);
    assert.ok(!("exists" in out.find((i) => i.name === "scheduler")), "never checked for a transitive package");
  });
});

describe("--tools (simulated: never a real process)", () => {
  test("a tool found on the PATH runs; one not found is reported, never an error; gitleaks is scrubbed", () => {
    const exec = (bin) => (bin === "gitleaks" ? { status: 0, stdout: JSON.stringify([{ RuleID: "generic-api-key", Secret: "abc123", Match: "token=abc123", File: "config.ts" }]) } : null);
    const results = runTools("/app", exec, ["gitleaks", "osv-scanner", "syft", "knip"]);
    assert.deepEqual(results.map((r) => [r.tool, r.installed]), [["gitleaks", true], ["osv-scanner", false], ["syft", false], ["knip", false]]);
    const gitleaks = results.find((r) => r.tool === "gitleaks");
    assert.equal(gitleaks.ok, true);
    assert.deepEqual(gitleaks.data, [{ RuleID: "generic-api-key", File: "config.ts" }]);
    assert.ok(!JSON.stringify(gitleaks.data).includes("abc123"));
  });

  test("scrubGitleaks removes Secret and Match at every depth", () => {
    assert.deepEqual(scrubGitleaks([{ a: { Secret: "x", Match: "y", File: "f" } }]), [{ a: { File: "f" } }]);
  });

  test("TOOL_NAMES: the four tools of the contract", () => {
    assert.deepEqual([...TOOL_NAMES].sort(), ["gitleaks", "knip", "osv-scanner", "syft"]);
  });
});

describe("doc-kit facts (CLI)", () => {
  let dirs = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  function mk(appDir) {
    const d = project(appDir);
    dirs.push(d);
    return d;
  }

  test("facts.noApp: app.dir not configured, or pointing nowhere → exit code 2", async () => {
    const noDir = tempDir("doc-kit-facts-noapp-");
    dirs.push(noDir);
    fs.writeFileSync(path.join(noDir, "doc.config.mjs"), 'export default { product: { name: "Acme Orders" } };\n');
    fs.mkdirSync(path.join(noDir, "content"));
    fs.writeFileSync(path.join(noDir, "content", "toc.json"), JSON.stringify({ title: "x", sections: [] }));
    const r1 = await cli(["facts", "--project", noDir]);
    assert.equal(r1.code, 2);
    assert.match(r1.err, /no application to read/);

    const missing = mk(path.join(app("next-app"), "does-not-exist"));
    const r2 = await cli(["facts", "--project", missing]);
    assert.equal(r2.code, 2);
  });

  test("--source (repeatable): only the requested sources are written", async () => {
    const dir = mk(app("next-app"));
    const r = await cli(["facts", "--project", dir, "--source", "env", "--source", "dependencies"], { commit: () => "c0ffee", exec: () => null });
    assert.equal(r.code, 0);
    assert.ok(fs.existsSync(path.join(dir, "facts", "env.json")));
    assert.ok(fs.existsSync(path.join(dir, "facts", "dependencies.json")));
    assert.ok(!fs.existsSync(path.join(dir, "facts", "api.json")));
  });

  test("an unknown source is a usage error (exit code 2)", async () => {
    const dir = mk(app("next-app"));
    const r = await cli(["facts", "--project", dir, "--source", "nope"]);
    assert.equal(r.code, 2);
  });

  test("the written file: source, generator, generated, commit (the injected HEAD), app (relative, forward slashes), items", async () => {
    const dir = mk(app("next-app"));
    await cli(["facts", "--project", dir, "--source", "env"], { commit: () => "deadbeef", exec: () => null });
    const f = JSON.parse(fs.readFileSync(path.join(dir, "facts", "env.json"), "utf8"));
    assert.equal(f.source, "env");
    assert.equal(f.commit, "deadbeef");
    assert.match(f.generator, /^doc-kit \d/);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(f.generated));
    assert.ok(!f.app.includes("\\"));
    assert.ok(f.items.some((i) => i.name === "DATABASE_URL"));
  });

  test("determinism: same code, same application → same file except `generated`", async () => {
    const dir = mk(app("next-app"));
    await cli(["facts", "--project", dir, "--source", "dependencies"], { commit: () => "c0ffee", exec: () => null });
    const first = JSON.parse(fs.readFileSync(path.join(dir, "facts", "dependencies.json"), "utf8"));
    await new Promise((r) => setTimeout(r, 5));
    await cli(["facts", "--project", dir, "--source", "dependencies"], { commit: () => "c0ffee", exec: () => null });
    const second = JSON.parse(fs.readFileSync(path.join(dir, "facts", "dependencies.json"), "utf8"));
    delete first.generated;
    delete second.generated;
    assert.deepEqual(first, second);
  });

  test("--json: the full result on stdout, nothing printed line by line", async () => {
    const dir = mk(app("fastapi-app"));
    const r = await cli(["facts", "--project", dir, "--source", "api", "--json"], { commit: () => null, exec: () => null });
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.out);
    assert.ok(parsed.sources.api.items.length > 0);
    assert.equal(r.err, "");
  });

  test("--network: adds `exists` only with the option, for dependencies only", async () => {
    const dir = mk(app("next-app"));
    const fetchImpl = async (url) => ({ ok: !url.includes("left-pad-pro"), status: url.includes("left-pad-pro") ? 404 : 200 });
    const r = await cli(["facts", "--project", dir, "--source", "dependencies", "--network", "--json"], { commit: () => null, exec: () => null, fetch: fetchImpl });
    const items = JSON.parse(r.out).sources.dependencies.items;
    assert.equal(items.find((i) => i.name === "next").exists, true);
    assert.equal(items.find((i) => i.name === "left-pad-pro").exists, false);
    assert.ok(!("exists" in items.find((i) => i.name === "scheduler")), "transitive: never checked");

    const without = await cli(["facts", "--project", dir, "--source", "dependencies", "--json"], { commit: () => null, exec: () => null });
    assert.ok(!("exists" in JSON.parse(without.out).sources.dependencies.items[0]), "without --network, exists is absent");
  });

  test("--tools: writes facts/tool-<name>.json, a missing tool is reported and never fails the command", async () => {
    const dir = mk(app("next-app"));
    const exec = (bin, args, options) => {
      if (bin === "git") return null;
      if (bin === "gitleaks") return { status: 0, stdout: JSON.stringify({ findings: [{ RuleID: "x", Secret: "s", Match: "m" }] }) };
      return null;
    };
    const r = await cli(["facts", "--project", dir, "--source", "env", "--tools"], { commit: () => null, exec });
    assert.equal(r.code, 0);
    const gitleaks = JSON.parse(fs.readFileSync(path.join(dir, "facts", "tool-gitleaks.json"), "utf8"));
    assert.equal(gitleaks.installed, true);
    assert.ok(!JSON.stringify(gitleaks.data).includes('"s"'));
    const knip = JSON.parse(fs.readFileSync(path.join(dir, "facts", "tool-knip.json"), "utf8"));
    assert.equal(knip.installed, false);
  });

  test("facts never writes into the application", async () => {
    const appDir = app("next-app");
    const before = fs.readdirSync(appDir).sort();
    const dir = mk(appDir);
    await cli(["facts", "--project", dir], { commit: () => null, exec: () => null, fetch: async () => ({ ok: true, status: 200 }) });
    assert.deepEqual(fs.readdirSync(appDir).sort(), before);
  });
});

describe("coverage adapters: facts, fastapi, next-app-router (api)", () => {
  async function inventory(root, spec) {
    const { adapter, options } = await loadAdapter("coverage", spec, root, "coverage[0]");
    return adapter.inventory({ root, options, tools: adapterTools(root) });
  }

  test("facts: noFacts when the file is missing; one item per fact, mapped by source", async () => {
    const dir = tempDir("doc-kit-facts-adapter-");
    try {
      const missing = await inventory(dir, { adapter: "facts", source: "env" });
      assert.deepEqual(missing, { available: false, reason: "noFacts", vars: { source: "env" } });

      fs.mkdirSync(path.join(dir, "facts"));
      const write = (source, items) => fs.writeFileSync(path.join(dir, "facts", `${source}.json`), JSON.stringify(factsFile({ source, items, generator: "x", generated: "2026-01-01T00:00:00.000Z", commit: null, app: ".." })));
      write("env", [{ name: "DATABASE_URL", files: [], example: true }]);
      const env = await inventory(dir, { adapter: "facts", source: "env" });
      assert.equal(env.families[0].name, "Environment variables");
      assert.deepEqual(env.families[0].items, [{ id: "DATABASE_URL", match: ["DATABASE_URL"] }]);

      write("dependencies", [
        { name: "next", version: "1", ecosystem: "npm", direct: true, dev: false, manifest: "frontend/package.json" },
        { name: "next", version: "1", ecosystem: "npm", direct: true, dev: false, manifest: "frontend/package-lock.json" },
        { name: "scheduler", version: "1", ecosystem: "npm", direct: false, dev: false, manifest: "frontend/package-lock.json" },
      ]);
      const deps = await inventory(dir, { adapter: "facts", source: "dependencies" });
      assert.deepEqual(deps.families[0].items.map((i) => i.id), ["next"], "only the direct dependencies, de-duplicated across the manifests that name it");

      write("api", [{ method: "GET", route: "/orders/[id]", file: "a.ts", framework: "next-app-router" }]);
      const api = await inventory(dir, { adapter: "facts", source: "api", family: "API routes" });
      assert.ok(api.families[0].items[0].match.includes("GET /orders/"), "the route forms, prefixed by the method");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fastapi: one item per handler, sharing engine/facts/api.mjs", async () => {
    const r = await inventory(app("fastapi-app"), { adapter: "fastapi", app: "." });
    assert.deepEqual(r.families[0].items.map((i) => i.id).sort(), ["GET /api/orders", "GET /api/orders/{order_id}", "GET /health", "POST /api/orders"]);
    const missing = await inventory(app("fastapi-app"), { adapter: "fastapi", app: "nope" });
    assert.equal(missing.available, false);
  });

  test("next-app-router: `api` option adds a second family; no change when it is left out", async () => {
    const without = await inventory(app("next-app"), { adapter: "next-app-router", app: "app" });
    assert.equal(without.families.length, 1, "unchanged when `api` is absent");

    const withApi = await inventory(app("next-app"), { adapter: "next-app-router", app: "app", api: true });
    assert.equal(withApi.families.length, 2);
    assert.deepEqual(withApi.families[0].items.map((i) => i.id), without.families[0].items.map((i) => i.id), "the page family is identical");
    assert.deepEqual(withApi.families[1].items.map((i) => i.id).sort(), ["GET /api/orders", "GET /api/orders/[id]", "POST /api/orders"]);
    assert.equal(withApi.families[1].name, "API");
  });
});
