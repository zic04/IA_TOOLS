// `doc-kit facts` (ARCHITECTURE.md §6.9): each source on its fixture, the CLI (--source, --json, determinism,
// facts.noApp), --network and --tools (both simulated, never touching the real network or PATH), and the
// coverage adapters that read facts (`facts`, `fastapi`, and the `api` option of `next-app-router`).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { collectEnv } from "../../engine/facts/env.mjs";
import { collectApi } from "../../engine/facts/api.mjs";
import { nextAppRouteOf, nextRouteMethods, nextRouteHandlers, pagesApiRouteOf } from "../../adapters/stack/next.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { textIndex, pyCommentRanges, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { collectDb } from "../../engine/facts/db.mjs";
import { collectAgents, hiddenCharacters } from "../../engine/facts/agents.mjs";
import { collectSecrets } from "../../engine/facts/secrets.mjs";
import { collectTests } from "../../engine/facts/tests.mjs";
import {
  checkExistence,
  privateRegistries,
  isPrivatePackage,
  createRegistryClient,
} from "../../engine/facts/network.mjs";
import { runTool, runTools, TOOL_NAMES } from "../../engine/facts/tools.mjs";
import { factsFile, relPath, listFiles, withoutDocProjects } from "../../engine/facts/common.mjs";
import { loadAdapter } from "../../engine/capture/session.mjs";
import { adapterTools } from "../../engine/check/coverage.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");
const app = (name) => path.join(APPS, name);

/** Runs the CLI and captures its output; `io` adds the facts test seams (fetch, exec, commit). */
async function cli(args, io = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
    ...io,
  });
  return { code, out, err };
}

/** A documentation project whose application is `appDir` (never written to). */
function project(appDir) {
  const dir = tempDir("doc-kit-facts-");
  fs.writeFileSync(
    path.join(dir, "doc.config.mjs"),
    `export default { product: { name: "Acme Orders" }, app: { dir: ${JSON.stringify(appDir)} } };\n`,
  );
  fs.mkdirSync(path.join(dir, "content"));
  fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
  return dir;
}

/** Items of `collectDependencies` whose manifest ends with `suffix`, keyed by name (one manifest at a time). */
const byManifest = (items, suffix) =>
  Object.fromEntries(items.filter((i) => i.manifest.endsWith(suffix)).map((i) => [i.name, i]));

describe("engine/facts sources on their fixtures", () => {
  test("dependencies: package.json and package-lock.json v3 read independently — the same name in both gives two items", () => {
    const items = collectDependencies(app("next-app"));
    const pkg = byManifest(items, "package.json");
    const lock = byManifest(items, "package-lock.json");
    assert.deepEqual(pkg.next, {
      name: "next",
      version: "14.2.3",
      ecosystem: "npm",
      direct: true,
      dev: false,
      manifest: "package.json",
    });
    assert.equal(pkg.typescript.dev, true);
    assert.ok(pkg["left-pad-pro"], "a direct dependency that will not exist in its registry (--network)");
    // package-lock.json's own root entry says `next` is direct too: its OWN item, not merged with package.json's.
    assert.deepEqual(lock.next, {
      name: "next",
      version: "14.2.3",
      ecosystem: "npm",
      direct: true,
      dev: false,
      manifest: "package-lock.json",
      license: "MIT",
    });
    assert.equal(lock.scheduler.direct, false, "transitive package, absent from the lock's own root entry");
    assert.equal(items.filter((i) => i.name === "next").length, 2, "one item per manifest that names it");
  });

  test('dependencies: pnpm-lock.yaml — direct from its own "importers: . :" section, not from a sibling package.json', () => {
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
        [
          "uvicorn[standard]>=0.30.0",
          "httpx[http2,brotli]~=0.27",
          "requests",
          'pydantic==2.6.0  ; python_version >= "3.8"',
          "",
        ].join("\n"),
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
    assert.ok(
      items.some((i) => i.name === "just-within-depth-dep"),
      "4 folders deep: within the limit",
    );
    assert.ok(!items.some((i) => i.name === "too-deep-dep"), "5 folders deep: past the limit");
  });

  test("env: process.env / import.meta.env / os.environ forms, never the value, never .env", () => {
    const items = collectEnv(app("next-app"));
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    assert.deepEqual(byName.DATABASE_URL.files, ["lib/db.ts:2", "lib/db.ts:5"]);
    assert.equal(byName.DATABASE_URL.example, true);
    assert.equal(byName.SECRET_KEY.files.length, 1);
    assert.deepEqual(
      byName.UNUSED_FROM_EXAMPLE,
      { name: "UNUSED_FROM_EXAMPLE", files: [], example: true },
      "declared in .env.example, never read by the code",
    );
    assert.ok(!JSON.stringify(items).includes("SuperSecret"), "never a value");

    const py = collectEnv(app("fastapi-app"));
    const byName2 = Object.fromEntries(py.map((i) => [i.name, i]));
    assert.equal(byName2.DATABASE_URL.files[0], "routers/orders.py:11", 'os.environ["X"]');
    assert.equal(byName2.SECRET_KEY.files[0], "models.py:7", 'os.getenv("X")');
  });

  test("env: a Node destructuring read, const { FOO, BAR } = process.env (a `:` rename never changes the name)", () => {
    const byName = Object.fromEntries(collectEnv(app("next-app")).map((i) => [i.name, i]));
    assert.deepEqual(byName.FEATURE_FLAG.files, ["lib/settings.ts:2"]);
    assert.deepEqual(
      byName.ANALYTICS_KEY.files,
      ["lib/settings.ts:2"],
      "the destructured name, not the local alias after the colon",
    );
    assert.ok(!("analyticsKey" in byName), "the local rename is never read as an env name");
  });

  test("env: pydantic BaseSettings (v1 and v2) — env_prefix, and alias / validation_alias / env overrides", () => {
    const byName = Object.fromEntries(collectEnv(app("fastapi-app")).map((i) => [i.name, i]));
    assert.deepEqual(
      byName.ACME_DATABASE_URL.files,
      ["config.py:10"],
      "env_prefix (model_config = SettingsConfigDict) + the field name, upper-cased",
    );
    assert.deepEqual(
      byName.SECRET_KEY_OVERRIDE.files,
      ["config.py:11"],
      "Field(..., alias=…) replaces the derived name",
    );
    assert.deepEqual(byName.ACME_DEBUG.files, ["config.py:12"]);
    assert.deepEqual(
      byName.LEGACY_API_KEY_OVERRIDE.files,
      ["config.py:19"],
      "pydantic v1: class Config: env_prefix, and Field(..., env=…)",
    );
    assert.deepEqual(byName.LEGACY_TIMEOUT.files, ["config.py:20"]);
    assert.ok(
      !("SECRET_KEY" in byName) || !byName.SECRET_KEY.files.includes("config.py:11"),
      "the overridden name replaces the derived one, not both",
    );
  });

  test("api: Next.js App Router route.ts, pages/api, FastAPI (prefix composition), Express", () => {
    assert.equal(nextAppRouteOf("api/orders/route.ts"), "/api/orders");
    assert.deepEqual(nextRouteMethods("export async function GET() {}\nexport async function POST(r) {}\n"), [
      "GET",
      "POST",
    ]);
    assert.equal(pagesApiRouteOf("health.ts"), "/api/health");
    assert.equal(pagesApiRouteOf("orders/index.ts"), "/api/orders");

    const next = collectApi(app("next-app"));
    assert.deepEqual(
      next
        .filter((r) => r.framework === "next-app-router")
        .map((r) => `${r.method} ${r.route}`)
        .sort(),
      ["GET /api/orders", "GET /api/orders/[id]", "POST /api/orders"],
    );
    assert.deepEqual(
      next
        .filter((r) => r.framework === "next-pages-api")
        .map((r) => `${r.method} ${r.route}`)
        .sort(),
      ["GET /api/health", "POST /api/health"],
    );

    const fastapi = collectApi(app("fastapi-app"));
    assert.deepEqual(fastapi.map((r) => `${r.method} ${r.route}`).sort(), [
      "GET /api/orders",
      "GET /api/orders/{order_id}",
      "GET /health",
      "POST /api/orders",
    ]);

    const express = collectApi(app("express-app"));
    assert.deepEqual(express.map((r) => `${r.method} ${r.route}`).sort(), [
      "GET /admin/stats",
      "GET /health",
      "GET /orders",
      "POST /orders",
    ]);

    // fastapiRoutes composes the mount prefix given to include_router with the router's own prefix.
    const sources = new Map([
      ["a.py", 'router = APIRouter(prefix="/orders")\n@router.get("/{id}")\ndef f(): pass\n'],
      ["main.py", 'app.include_router(router, prefix="/api")\n'],
    ]);
    // The extractors give the guards; collectApi classifies the access with the project's patterns.
    assert.deepEqual(fastapiRoutes(sources), [
      { method: "GET", route: "/api/orders/{id}", file: "a.py", line: 2, framework: "fastapi", guards: [] },
    ]);
    assert.deepEqual(expressRoutes('// orders\nrouter.delete("/orders/:id", h)', "x.js"), [
      { method: "DELETE", route: "/orders/:id", file: "x.js", line: 2, guards: [] },
    ]);
    assert.deepEqual(
      [...nextRouteHandlers("import x from 'y';\nexport async function GET() {}\n\nexport const POST = h;\n")],
      [
        ["GET", 2],
        ["POST", 4],
      ],
    );
  });

  test("api: a route-looking decorator inside a Python docstring or a comment is not a route (false positive); websocket routes get method WS", () => {
    const docstring = [
      '@router.get("/real")',
      "def real(): pass",
      "",
      "def legacy():",
      '    """Deprecated. Used to be @router.get("/old-api"), now use @router.get("/new-api") instead."""',
      "    pass",
      "",
      '# @router.get("/commented-out")',
      '@router.websocket("/ws/orders")',
      "async def orders_ws(ws): pass",
      "",
    ].join("\n");
    const items = fastapiRoutes(new Map([["a.py", docstring]]));
    assert.deepEqual(items.map((i) => `${i.method} ${i.route}`).sort(), ["GET /real", "WS /ws/orders"]);
    const ws = items.find((i) => i.method === "WS");
    assert.equal(ws.framework, "fastapi");
    assert.deepEqual(ws.guards, []);

    // The same false positive, found via collectApi on a fixture-shaped app.
    const dir = tempDir("facts-api-nonco-");
    try {
      fs.writeFileSync(path.join(dir, "main.py"), docstring);
      assert.deepEqual(
        collectApi(dir)
          .map((i) => `${i.method} ${i.route}`)
          .sort(),
        ["GET /real", "WS /ws/orders"],
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
      expressRoutes(source, "x.js")
        .map((i) => `${i.method} ${i.route}`)
        .sort(),
      ["GET /real", "WS /ws/orders"],
    );
  });

  test("the comments of a route reader: Python comments and docstrings masked, a normal quoted argument is not", () => {
    const py = 'x = "/kept"\n# comment /ignored\n"""\nblock /ignored\n"""\n';
    const pyIndex = textIndex(py, pyCommentRanges(py, { docstrings: true }));
    assert.ok(!pyIndex.inComment(py.indexOf('"/kept"')));
    assert.ok(pyIndex.inComment(py.indexOf("/ignored")));
    assert.ok(pyIndex.inComment(py.indexOf("block /ignored")));
    assert.ok(
      !textIndex(py, pyCommentRanges(py)).inComment(py.indexOf("block /ignored")),
      "a docstring is code by default",
    );

    const js = 'x("/kept");\n// comment /ignored\n/* block\n/ignored */\n';
    const jsIndex = textIndex(js, jsCommentRanges(js));
    assert.ok(!jsIndex.inComment(js.indexOf('"/kept"')));
    assert.ok(jsIndex.inComment(js.indexOf("/ignored")));
    assert.ok(jsIndex.inComment(js.indexOf("block")));
    assert.equal(jsIndex.lineOf(js.indexOf("block")), 3);
  });

  test("api: several FastAPI router modules that all name their variable `router` do not bleed into each other", () => {
    // Every module declares `router`, the usual FastAPI convention; main.py mounts each by its dotted form
    // (module.router): resolving by variable name alone would mix up their prefixes (ARCHITECTURE.md §6.9).
    const sources = new Map([
      ["routers/orders.py", 'router = APIRouter(prefix="/orders")\n@router.get("/")\ndef list_orders(): pass\n'],
      ["routers/boards.py", 'router = APIRouter(prefix="/boards")\n@router.get("/")\ndef list_boards(): pass\n'],
      [
        "main.py",
        'from routers import orders, boards\napp.include_router(orders.router, prefix="/api")\napp.include_router(boards.router, prefix="/api")\n',
      ],
    ]);
    assert.deepEqual(
      fastapiRoutes(sources)
        .map((r) => `${r.method} ${r.route} (${r.file})`)
        .sort(),
      ["GET /api/boards (routers/boards.py)", "GET /api/orders (routers/orders.py)"],
    );
  });

  test("db: Prisma (@@map), SQLAlchemy (Column/mapped_column), SQL migrations (RLS, policies)", () => {
    const prisma = collectDb(app("express-app"));
    const orders = prisma.find((t) => t.table === "orders");
    assert.deepEqual(orders.columns, ["id", "status", "amount", "tenantId"]);
    assert.equal(orders.rls, false, "Prisma does not express row-level security");
    assert.ok(
      prisma.some((t) => t.table === "Customer"),
      "no @@map: the model name is the table",
    );

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
    for (const f of [
      ".aider.conf.yml",
      ".claude/commands/deploy.md",
      ".clinerules",
      ".cursor/rules/style.md",
      ".cursorrules",
      ".github/copilot-instructions.md",
      ".windsurfrules",
      "AGENTS.md",
      "GEMINI.md",
      "specs/review.prompt.md",
    ])
      assert.ok(files.includes(f), f);
    for (const i of items) assert.deepEqual(i.hidden, [], i.file);
  });

  test("agents: at any depth (a package of a monorepo) and the other known folders; an ordinary Markdown file is not one", () => {
    const dir = tempDir("facts-agents-deep-");
    try {
      const files = [
        "api/CLAUDE.md",
        "frontend/AGENTS.md",
        ".agents/infra.md",
        ".github/instructions/api.instructions.md",
        ".windsurf/rules/style.md",
        ".kiro/steering/product.md",
        ".junie/guidelines.md",
        "docs/README.md",
        "api/notes.md",
      ];
      for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), "Always run the tests.\n");
      }
      assert.deepEqual(
        collectAgents(dir).map((i) => i.file),
        files.slice(0, 7).sort((a, b) => a.localeCompare(b)),
      );
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
      fs.writeFileSync(
        path.join(dir, "config.ts"),
        'const dsn = "postgres://user:SuperSecretPass1@db.example.com:5432/app";\n',
      );
      fs.writeFileSync(path.join(dir, "readme.md"), "Nothing sensitive here.\n");
      const findings = collectSecrets(dir, () => null); // git unavailable: full walk
      assert.deepEqual(findings, [{ file: "config.ts", rule: "credentialsUrl" }]);
      assert.ok(!JSON.stringify(findings).includes("SuperSecretPass1"));
      // git available, but only readme.md is tracked: nothing found.
      const onlyReadme = (bin, args) =>
        bin === "git" && args[0] === "ls-files" ? { status: 0, stdout: "readme.md\n" } : null;
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

  test("a manifest or a coverage report that is there but broken is unreadable, not empty (AUDIT.md M14)", () => {
    const dir = tempDir("facts-unreadable-");
    try {
      const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      };
      write("package.json", '{ "dependencies": { "react": "^19.0.0" }, }');
      write("api/package-lock.json", "null");
      write("api/package.json", JSON.stringify({ dependencies: { express: "^5.0.0" } }));
      const unreadable = [];
      assert.deepEqual(
        collectDependencies(dir, unreadable).map((d) => d.name),
        ["express"],
        "the readable manifests are still read",
      );
      assert.deepEqual(unreadable, [{ file: "package.json", reason: "json" }]);
      // `null` is valid JSON with no dependencies: known and empty, not unreadable.
      assert.deepEqual(collectDependencies(dir).length, 1, "without the list: same items, nothing thrown");

      write("app.test.js", "test('a', () => {});\n");
      write("coverage/coverage-summary.json", "{ not json");
      const broken = collectTests(dir);
      assert.deepEqual(broken.summary, { files: 1, tests: 1 }, "no coverage figure");
      assert.deepEqual(broken.unreadable, [{ file: "coverage/coverage-summary.json", reason: "json" }]);
      write("coverage/coverage-summary.json", JSON.stringify({ total: { lines: { pct: 42.5 } } }));
      assert.deepEqual(collectTests(dir), {
        items: [{ file: "app.test.js", tests: 1 }],
        summary: { files: 1, tests: 1, coverage: 42.5 },
        unreadable: [],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      write(
        "docs/manual/package.json",
        JSON.stringify({ name: "acme-orders-docs", dependencies: { "doc-kit": "file:../../kit" } }),
      );
      write("docs/readme.md", "Acme Orders\n");
      assert.deepEqual(listFiles(dir), ["docs/readme.md", "package.json"]);
      assert.deepEqual(
        collectDependencies(dir).map((d) => d.name),
        ["react"],
      );
      const exec = () => ({
        status: 0,
        stdout: "docs/manual/doc.config.mjs\ndocs/manual/package.json\ndocs/readme.md\npackage.json\n",
      });
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

describe("--network never sends a private package's name (AUDIT.md S13)", () => {
  test("npm scope with its own registry, local/workspace/git versions, every pip package behind a private index", async () => {
    const app = tempDir("doc-kit-network-");
    try {
      fs.writeFileSync(path.join(app, ".npmrc"), "@acme:registry=https://npm.acme.internal/\n");
      fs.writeFileSync(
        path.join(app, "requirements.txt"),
        "--extra-index-url https://pypi.acme.internal/simple\nacme-billing==1.0\n",
      );
      const registries = privateRegistries(app);
      assert.deepEqual([...registries.npmScopes], ["@acme"]);
      assert.equal(registries.pipAll, true);
      const items = [
        { name: "next", version: "15.0.0", ecosystem: "npm", direct: true },
        { name: "@acme/ui", version: "2.1.0", ecosystem: "npm", direct: true },
        { name: "@types/node", version: "22.0.0", ecosystem: "npm", direct: true },
        { name: "shared", version: "workspace:*", ecosystem: "npm", direct: true },
        { name: "tooling", version: "file:../tooling", ecosystem: "npm", direct: true },
        { name: "fork", version: "github:acme/fork", ecosystem: "npm", direct: true },
        { name: "acme-billing", version: "1.0", ecosystem: "pip", direct: true },
      ];
      const sent = [];
      const out = await checkExistence(
        items,
        async (url) => {
          sent.push(url);
          return { ok: true, status: 200 };
        },
        { registries },
      );
      assert.deepEqual(sent.sort(), ["https://registry.npmjs.org/%40types%2Fnode", "https://registry.npmjs.org/next"]);
      for (const name of ["@acme/ui", "shared", "tooling", "fork", "acme-billing"]) {
        const item = out.find((i) => i.name === name);
        assert.equal(item.private, true, name);
        assert.equal(item.exists, null, name);
      }
      // A .npmrc that replaces the default registry makes every npm package private.
      fs.writeFileSync(path.join(app, ".npmrc"), "registry=https://npm.acme.internal/\n");
      assert.equal(privateRegistries(app).npmAll, true);
      fs.writeFileSync(path.join(app, ".npmrc"), "registry=https://registry.npmjs.org/\n");
      assert.equal(privateRegistries(app).npmAll, false);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("--network: what is private is read everywhere it can be declared (AUDIT.md S13)", () => {
  /** A temporary application from `files` ({ relative path: text }); `fn(appDir)`, then removed. */
  async function withApp(files, fn) {
    const appDir = tempDir("doc-kit-network-app-");
    try {
      for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(appDir, rel)), { recursive: true });
        fs.writeFileSync(path.join(appDir, rel), text);
      }
      return await fn(appDir);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  }
  /** The URLs `--network` would request for the application's dependencies (direct ones), and the items. */
  async function sentFor(appDir, env) {
    const items = collectDependencies(appDir);
    const urls = [];
    const out = await checkExistence(
      items,
      async (url) => {
        urls.push(url);
        return { ok: true, status: 200 };
      },
      { registries: privateRegistries(appDir, { items, env }) },
    );
    return { urls, out };
  }

  test("an .npmrc of a manifest folder or of any folder above it counts; a folder outside the application never", () =>
    withApp(
      {
        "frontend/.npmrc": "@corp:registry=https://npm.corp.internal/\n",
        "frontend/packages/ui/package.json": JSON.stringify({ dependencies: { "@corp/tokens": "^1.0.0" } }),
      },
      (appDir) => {
        assert.deepEqual([...privateRegistries(appDir).npmScopes], [], "the root alone does not know the scope");
        const items = [{ manifest: "frontend/packages/ui/package.json" }];
        assert.deepEqual([...privateRegistries(appDir, { items }).npmScopes], ["@corp"], "the workspace root counts");
        const outside = [{ manifest: "../../package.json" }];
        assert.deepEqual([...privateRegistries(appDir, { items: outside }).npmScopes], [], "outside: ignored");
      },
    ));

  test("PEP 508 direct references and URL lines of a requirements file never reach PyPI", () =>
    withApp(
      {
        "requirements.txt": [
          "mylib @ file:///opt/mylib",
          "corp-sdk @ git+https://git.corp.internal/sdk.git",
          "git+https://git.corp.internal/other.git#egg=other",
          "./vendored/pkg",
          "requests==2.32.0",
        ].join("\n"),
      },
      async (appDir) => {
        const { urls } = await sentFor(appDir);
        assert.deepEqual(urls, ["https://pypi.org/pypi/requests/json"]);
      },
    ));

  test("Poetry path / git / url / private-source dependencies, and a private index, never reach PyPI", async () => {
    const pyproject = (extra = "") =>
      [
        '[tool.poetry]\nname = "acme-orders"\n',
        "[tool.poetry.dependencies]",
        'python = "^3.12"',
        'corp-path = { path = "../corp-path" }',
        'corp-git = { git = "https://git.corp.internal/x.git" }',
        'corp-url = { url = "https://files.corp.internal/x.whl" }',
        'corp-src = { version = "^1", source = "corp" }',
        'fastapi = "^0.110"',
        extra,
      ].join("\n");
    await withApp({ "pyproject.toml": pyproject() }, async (appDir) => {
      const { urls } = await sentFor(appDir);
      assert.deepEqual(urls, ["https://pypi.org/pypi/fastapi/json"]);
    });
    const source = '\n[[tool.poetry.source]]\nname = "corp"\nurl = "https://pypi.corp.internal/simple"\n';
    await withApp({ "pyproject.toml": pyproject(source) }, async (appDir) => {
      assert.deepEqual((await sentFor(appDir)).urls, [], "a private Poetry source: every pip package is private");
    });
    await withApp({ "pyproject.toml": '[[tool.uv.index]]\nurl = "https://pypi.corp/simple"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).pipAll, true, "uv index"),
    );
    await withApp({ Pipfile: '[[source]]\nurl = "https://pypi.corp/simple"\nname = "corp"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).pipAll, true, "Pipfile source"),
    );
    await withApp({ Pipfile: '[[source]]\nurl = "https://pypi.org/simple"\nname = "pypi"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).pipAll, false, "PyPI declared explicitly stays public"),
    );
  });

  test("npm workspaces: the application's own packages, links and private tarballs are never sent", () =>
    withApp(
      {
        "package.json": JSON.stringify({
          name: "acme",
          workspaces: ["packages/*"],
          dependencies: { "@acme/billing-core": "*", "acme-utils": "^1.0.0", "corp-private": "^2.0.0", next: "15.0.0" },
        }),
        "packages/billing-core/package.json": JSON.stringify({ name: "@acme/billing-core" }),
        "package-lock.json": JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { dependencies: { "@acme/billing-core": "*", "corp-private": "^2.0.0", next: "15.0.0" } },
            "node_modules/@acme/billing-core": { resolved: "packages/billing-core", link: true },
            "node_modules/corp-private": {
              version: "2.1.0",
              resolved: "https://npm.corp.internal/corp-private/-/x.tgz",
            },
            "node_modules/next": { version: "15.0.0", resolved: "https://registry.npmjs.org/next/-/next-15.0.0.tgz" },
          },
        }),
        "utils/package.json": JSON.stringify({ name: "acme-utils" }),
      },
      async (appDir) => {
        const { urls, out } = await sentFor(appDir);
        assert.deepEqual(urls, ["https://registry.npmjs.org/next", "https://registry.npmjs.org/next"]);
        for (const name of ["@acme/billing-core", "acme-utils", "corp-private"])
          assert.ok(
            out.filter((i) => i.name === name && i.direct).every((i) => i.private === true),
            name,
          );
      },
    ));

  test("yarn (.yarnrc, .yarnrc.yml) and bun (bunfig.toml) registries count like an .npmrc", async () => {
    const yml =
      "nodeLinker: node-modules\nnpmScopes:\n  corp:\n    npmRegistryServer: https://npm.corp/\n  team:\n    npmAlwaysAuth: true\nenableTelemetry: false\n";
    await withApp({ ".yarnrc.yml": yml }, (appDir) =>
      assert.deepEqual([...privateRegistries(appDir).npmScopes].sort(), ["@corp", "@team"]),
    );
    await withApp({ ".yarnrc.yml": 'npmRegistryServer: "https://npm.corp/"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).npmAll, true),
    );
    await withApp({ ".yarnrc.yml": 'npmRegistryServer: "https://registry.yarnpkg.com"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).npmAll, false),
    );
    await withApp({ ".yarnrc": '"@corp:registry" "https://npm.corp/"\nregistry "https://npm.corp/"\n' }, (appDir) => {
      const r = privateRegistries(appDir);
      assert.deepEqual([...r.npmScopes], ["@corp"]);
      assert.equal(r.npmAll, true);
    });
    await withApp(
      { "bunfig.toml": '[install]\nregistry = "https://npm.corp/"\n\n[install.scopes]\ncorp = "https://npm.corp/"\n' },
      (appDir) => {
        const r = privateRegistries(appDir);
        assert.deepEqual([...r.npmScopes], ["@corp"]);
        assert.equal(r.npmAll, true);
      },
    );
  });

  test("yarn.lock and pnpm-lock.yaml: a package taken from a private registry, git or a file is never sent", async () => {
    const pkg = JSON.stringify({ dependencies: { "@corp/ui": "^1.0.0", "corp-x": "^2.0.0", next: "15.0.0" } });
    const yarnV1 = [
      '"@corp/ui@^1.0.0":',
      '  version "1.0.0"',
      '  resolved "https://npm.corp.internal/@corp/ui/-/ui-1.0.0.tgz#abc"',
      "",
      'next@15.0.0:\n  version "15.0.0"\n  resolved "https://registry.yarnpkg.com/next/-/next-15.0.0.tgz#def"',
    ].join("\n");
    await withApp({ "package.json": pkg, "yarn.lock": yarnV1 }, async (appDir) => {
      const { urls } = await sentFor(appDir);
      assert.ok(!urls.some((u) => u.includes("corp%2Fui")), urls.join(", "));
      assert.ok(urls.includes("https://registry.npmjs.org/next"));
    });
    const berry = [
      '"corp-x@npm:^2.0.0":\n  version: 2.0.0\n  resolution: "corp-x@https://files.corp.internal/corp-x-2.0.0.tgz"',
      "",
      '"next@npm:15.0.0":\n  version: 15.0.0\n  resolution: "next@npm:15.0.0"',
    ].join("\n");
    await withApp({ "package.json": pkg, "yarn.lock": berry }, (appDir) => {
      const items = collectDependencies(appDir).filter((i) => i.manifest === "yarn.lock");
      assert.equal(items.find((i) => i.name === "corp-x").local, true);
      assert.ok(!("local" in items.find((i) => i.name === "next")), "npm: protocol: the configured registry");
    });
    const pnpm = [
      "lockfileVersion: '9.0'",
      "packages:",
      "  corp-x@2.0.0:",
      "    resolution: {tarball: https://files.corp.internal/corp-x-2.0.0.tgz}",
      "  next@15.0.0:",
      "    resolution: {integrity: sha512-abc}",
    ].join("\n");
    await withApp({ "package.json": pkg, "pnpm-lock.yaml": pnpm }, (appDir) => {
      const items = collectDependencies(appDir).filter((i) => i.manifest === "pnpm-lock.yaml");
      assert.equal(items.find((i) => i.name === "corp-x").local, true);
      assert.ok(!("local" in items.find((i) => i.name === "next")));
    });
  });

  test("a requirements line that is a local archive or a path is never read as a package name", () =>
    withApp(
      {
        "requirements.txt": [
          "corp_lib-1.0-py3-none-any.whl",
          "corp-tools-2.0.tar.gz",
          "vendor/corp-pkg",
          "mylib @ file:///opt/mylib",
          "requests==2.32.0",
        ].join("\n"),
      },
      async (appDir) => {
        const items = collectDependencies(appDir);
        assert.deepEqual(items.map((i) => i.name).sort(), ["mylib", "requests"], "a direct reference keeps its item");
        assert.deepEqual((await sentFor(appDir)).urls, ["https://pypi.org/pypi/requests/json"]);
      },
    ));

  test("on a doubt, nothing is sent: Poetry constraint lists, yarn and bun scopes in forms the reader does not follow", async () => {
    const poetry = [
      "[tool.poetry.dependencies]",
      'corp-a = [ { path = "../a", markers = "sys_platform == \'linux\'" }, { version = "^1" } ]',
      "corp-b = [",
      '  { version = "^1", source = "corp" },',
      "]",
      'fastapi = "^0.110"',
    ].join("\n");
    await withApp({ "pyproject.toml": poetry }, async (appDir) => {
      assert.deepEqual((await sentFor(appDir)).urls, ["https://pypi.org/pypi/fastapi/json"]);
    });
    await withApp({ ".yarnrc.yml": 'npmScopes: { corp: { npmRegistryServer: "https://npm.corp/" } }\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).npmAll, true, "flow style"),
    );
    await withApp({ ".yarnrc.yml": "npmScopes: # private\n  corp:\n    npmAlwaysAuth: true\n" }, (appDir) =>
      assert.equal(privateRegistries(appDir).npmAll, true, "a comment after the key"),
    );
    await withApp({ "bunfig.toml": '[install.scopes.corp]\nurl = "https://npm.corp/"\n' }, (appDir) => {
      const r = privateRegistries(appDir);
      assert.deepEqual([...r.npmScopes], ["@corp"]);
      assert.equal(r.npmAll, false);
    });
    await withApp(
      { "bunfig.toml": '[install]\nscopes = { corp = "https://npm.corp/" } # install.scopes\n' },
      (appDir) => assert.equal(privateRegistries(appDir).npmAll, true, "an inline scopes table"),
    );
  });

  test("poetry.lock [package.source] other than PyPI, and Poetry's own repositories, keep a name private", async () => {
    const pyproject = '[tool.poetry.dependencies]\npython = "^3.11"\ncorp-lib = "^1.0"\nfastapi = "^0.110"\n';
    const lock = [
      '[[package]]\nname = "corp-lib"\nversion = "1.0.0"\n',
      '[package.source]\ntype = "legacy"\nurl = "https://pypi.corp.internal/simple"\nreference = "corp"\n',
      '[[package]]\nname = "fastapi"\nversion = "0.110.0"\n',
      '[[package]]\nname = "vendored"\nversion = "1.0.0"\n\n[package.source]\ntype = "directory"\nurl = "../vendored"\n',
    ].join("\n");
    await withApp({ "pyproject.toml": pyproject, "poetry.lock": lock }, async (appDir) => {
      const items = collectDependencies(appDir).filter((i) => i.manifest === "poetry.lock");
      assert.equal(items.find((i) => i.name === "vendored").local, true);
      assert.ok(!("local" in items.find((i) => i.name === "fastapi")));
      assert.deepEqual((await sentFor(appDir)).urls, ["https://pypi.org/pypi/fastapi/json"]);
    });
    const home = tempDir("doc-kit-network-poetry-home-");
    try {
      fs.mkdirSync(path.join(home, ".config", "pypoetry"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".config", "pypoetry", "config.toml"),
        '[repositories.corp]\nurl = "https://pypi.corp.internal/simple"\n',
      );
      await withApp({}, (appDir) => {
        assert.equal(privateRegistries(appDir, { env: { HOME: home } }).pipAll, true);
        const env = { POETRY_REPOSITORIES_CORP_URL: "https://pypi.corp/simple" };
        assert.equal(privateRegistries(appDir, { env }).pipAll, true);
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("uv: an index in uv.toml (application or user) or in UV_* variables makes every pip package private", async () => {
    await withApp({ "uv.toml": 'index-url = "https://pypi.corp/simple"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).pipAll, true),
    );
    await withApp({ "uv.toml": '[[index]]\nname = "corp"\nurl = "https://pypi.corp/simple"\n' }, (appDir) =>
      assert.equal(privateRegistries(appDir).pipAll, true),
    );
    await withApp({}, (appDir) => {
      assert.equal(privateRegistries(appDir, { env: { UV_INDEX_URL: "https://pypi.corp/simple" } }).pipAll, true);
      assert.equal(privateRegistries(appDir, { env: { UV_INDEX_URL: "https://pypi.org/simple" } }).pipAll, false);
    });
  });

  test("the network gateway itself refuses a private package (defence in depth: nothing is sent)", async () => {
    const sent = [];
    const fetch = async (url) => (sent.push(url), { ok: true, status: 200, json: async () => ({ version: "2.0.0" }) });
    const registries = { npmScopes: new Set(["@corp"]), npmAll: false, pipAll: false, names: new Set() };
    const client = createRegistryClient({ fetch, registries });
    await assert.rejects(client.exists({ name: "@corp/ui", ecosystem: "npm" }), /private package/);
    await assert.rejects(client.latest({ name: "tooling", version: "file:../tooling", ecosystem: "npm" }), /private/);
    assert.deepEqual(sent, [], "a refused package sends nothing");
    assert.equal(await client.exists({ name: "next", ecosystem: "npm" }), true);
    assert.equal(await client.latest({ name: "next", ecosystem: "npm" }), "2.0.0");
    assert.deepEqual(sent, ["https://registry.npmjs.org/next", "https://registry.npmjs.org/next/latest"]);
  });

  test("the gateway's timeout covers the whole answer: a registry that trickles its body gets null, not a wait", async () => {
    const slowBody = async (url, { signal }) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve, reject) => {
          const late = setTimeout(() => resolve({ version: "9.0.0" }), 500);
          signal.addEventListener("abort", () => (clearTimeout(late), reject(new Error("aborted"))));
        }),
    });
    const none = { npmScopes: new Set(), npmAll: false, pipAll: false, names: new Set() };
    const client = createRegistryClient({ fetch: slowBody, registries: none, timeoutMs: 20 });
    const started = Date.now();
    assert.equal(await client.latest({ name: "next", ecosystem: "npm" }), null);
    assert.ok(Date.now() - started < 400, "the body is cut at the timeout");
  });

  test("an ecosystem the kit does not know is never sent", () => {
    const none = { npmScopes: new Set(), npmAll: false, pipAll: false, names: new Set() };
    assert.equal(isPrivatePackage({ name: "golang.org/x/net", ecosystem: "go" }, none), true);
    assert.equal(isPrivatePackage({ name: "next", ecosystem: "npm" }, none), false);
  });

  test("the person's own .npmrc / pip configuration and npm_config_* / PIP_* variables count too", () => {
    const appDir = tempDir("doc-kit-network-user-");
    const home = tempDir("doc-kit-network-home-");
    try {
      fs.writeFileSync(path.join(home, ".npmrc"), "@corp:registry=https://npm.corp.internal/\n");
      const fromHome = privateRegistries(appDir, { env: { HOME: home } });
      assert.deepEqual([...fromHome.npmScopes], ["@corp"]);
      assert.equal(fromHome.pipAll, false);

      fs.mkdirSync(path.join(home, "pip"));
      fs.writeFileSync(path.join(home, "pip", "pip.ini"), "[global]\nindex-url = https://pypi.corp.internal/simple\n");
      assert.equal(privateRegistries(appDir, { env: { USERPROFILE: home } }).pipAll, true);

      const fromEnv = privateRegistries(appDir, {
        env: { "npm_config_@team:registry": "https://npm.corp.internal/", PIP_EXTRA_INDEX_URL: "https://p/simple" },
      });
      assert.deepEqual([...fromEnv.npmScopes], ["@team"]);
      assert.equal(fromEnv.pipAll, true);
      assert.equal(privateRegistries(appDir, { env: { npm_config_registry: "https://npm.corp/" } }).npmAll, true);
      assert.equal(
        privateRegistries(appDir, { env: { npm_config_registry: "https://registry.npmjs.org/" } }).npmAll,
        false,
      );
      assert.equal(isPrivatePackage({ name: "@team/x", ecosystem: "npm" }, fromEnv), true);
      assert.equal(isPrivatePackage({ name: "@types/node", ecosystem: "npm" }, fromEnv), false);
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("every home is read (HOME and USERPROFILE can differ), and the files named by the environment", () => {
    const appDir = tempDir("doc-kit-network-homes-");
    const msys = tempDir("doc-kit-network-msys-");
    const windows = tempDir("doc-kit-network-win-");
    try {
      fs.writeFileSync(path.join(windows, ".npmrc"), "@corp:registry=https://npm.corp.internal/\n");
      fs.writeFileSync(
        path.join(windows, ".yarnrc.yml"),
        "npmScopes:\n  team:\n    npmRegistryServer: https://npm.corp/\n",
      );
      const both = privateRegistries(appDir, { env: { HOME: msys, USERPROFILE: windows } });
      assert.deepEqual([...both.npmScopes].sort(), ["@corp", "@team"]);

      const mac = path.join(msys, "Library", "Application Support", "pip");
      fs.mkdirSync(mac, { recursive: true });
      fs.writeFileSync(path.join(mac, "pip.conf"), "[global]\nextra-index-url = https://pypi.corp/simple\n");
      assert.equal(privateRegistries(appDir, { env: { HOME: msys } }).pipAll, true, "macOS pip configuration");

      const npmUser = path.join(windows, "custom-npmrc");
      fs.writeFileSync(npmUser, "@named:registry=https://npm.corp/\n");
      const pipFile = path.join(windows, "custom-pip.ini");
      fs.writeFileSync(pipFile, "[global]\nindex-url = https://pypi.corp/simple\n");
      const named = privateRegistries(appDir, { env: { NPM_CONFIG_USERCONFIG: npmUser, PIP_CONFIG_FILE: pipFile } });
      assert.deepEqual([...named.npmScopes], ["@named"]);
      assert.equal(named.pipAll, true);
    } finally {
      for (const d of [appDir, msys, windows]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("--tools (simulated: never a real process)", () => {
  /** An exec that answers `outputs[bin]` ({ status, stdout }) and records every call; null for any other binary. */
  function fakeExec(outputs) {
    const calls = [];
    const exec = (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === "osv-scanner" && args[0] === "--version") return outputs.osvVersion ?? null;
      return outputs[bin] ?? null;
    };
    return { exec, calls };
  }

  test("a tool found on the PATH runs; one not found is reported as missing, never an error", () => {
    const { exec } = fakeExec({ gitleaks: { status: 0, stdout: "[]" } });
    const results = runTools("/app", exec);
    assert.deepEqual(
      results.map((r) => [r.tool, r.status]),
      [
        ["gitleaks", "ok"],
        ["osv-scanner", "missing"],
        ["syft", "missing"],
        ["knip", "missing"],
      ],
    );
  });

  test("allowlist: whatever a tool adds (secret, matched line, e-mail, message) never reaches the items", () => {
    const leak = "AKIA-not-a-real-key-123";
    const { exec } = fakeExec({
      gitleaks: {
        status: 1,
        stdout: JSON.stringify([
          {
            RuleID: "generic-api-key",
            File: "/app/config.ts",
            StartLine: 3,
            Secret: leak,
            Match: `token=${leak}`,
            Line: `const token = "${leak}"`,
            Email: "dev@example.org",
            Author: "Dev",
            Message: "add key",
          },
        ]),
      },
      semgrep: {
        status: 0,
        stdout: JSON.stringify({
          results: [
            {
              check_id: "js.sql-injection",
              path: "src/db.js",
              start: { line: 9 },
              extra: { severity: "ERROR", lines: `query("${leak}")`, message: leak, metadata: { cwe: ["CWE-89"] } },
            },
          ],
        }),
      },
      knip: {
        status: 1,
        stdout: JSON.stringify({
          files: ["src/old.js"],
          issues: [{ file: "src/a.js", exports: [{ name: "unused", line: 4, pos: 10 }], dependencies: [] }],
        }),
      },
    });
    const gitleaks = runTool("gitleaks", "/app", exec);
    assert.equal(gitleaks.status, "findings", "gitleaks exits with 1 when it finds something: a result, not a failure");
    assert.deepEqual(gitleaks.items, [{ rule: "generic-api-key", file: "config.ts", line: 3 }]);
    const semgrep = runTool("semgrep", "/app", exec, { semgrepConfig: "/rules" });
    assert.deepEqual(semgrep.items, [
      { rule: "js.sql-injection", file: "src/db.js", line: 9, severity: "ERROR", cwe: "CWE-89" },
    ]);
    const knip = runTool("knip", "/app", exec);
    assert.equal(knip.status, "findings");
    assert.deepEqual(knip.items, [
      { kind: "file", file: "src/old.js" },
      { kind: "export", file: "src/a.js", name: "unused", line: 4 },
    ]);
    for (const r of [gitleaks, semgrep, knip])
      for (const forbidden of [leak, "dev@example.org", "add key", "query("])
        assert.ok(!JSON.stringify(r).includes(forbidden), `${r.tool}: ${forbidden}`);
  });

  test("osv-scanner runs OFFLINE only (v2 and v1); its database is downloaded only when asked (--network)", () => {
    const report = {
      results: [
        {
          source: { path: "/app/package-lock.json", type: "lockfile" },
          packages: [
            {
              package: { name: "lodash", version: "4.17.20", ecosystem: "npm" },
              vulnerabilities: [{ id: "GHSA-35jh-r3h4-6jhm", aliases: ["CVE-2021-23337"], details: "long text" }],
              groups: [{ ids: ["GHSA-35jh-r3h4-6jhm"], max_severity: "7.2" }],
            },
          ],
        },
      ],
    };
    const r = runTool("osv-scanner", "/app", (bin, args) =>
      args[0] === "--version"
        ? { status: 0, stdout: "osv-scanner version: 2.0.1" }
        : { status: 1, stdout: JSON.stringify(report) },
    );
    assert.equal(r.status, "findings");
    assert.deepEqual(r.items, [
      {
        id: "GHSA-35jh-r3h4-6jhm",
        aliases: ["CVE-2021-23337"],
        package: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        source: "package-lock.json",
        maxSeverity: 7.2,
      },
    ]);

    const argsOf = (version, download) => {
      const { exec, calls } = fakeExec({
        osvVersion: { status: 0, stdout: `osv-scanner version: ${version}` },
        "osv-scanner": { status: 0, stdout: "{}" },
      });
      runTool("osv-scanner", "/app", exec, { download });
      return calls.find((c) => c[0] === "osv-scanner" && c[1] !== "--version").slice(1);
    };
    const offline2 = argsOf("2.0.1", false);
    assert.deepEqual(offline2.slice(0, 4), ["scan", "source", "--recursive", "--offline"]);
    assert.ok(!offline2.includes("--download-offline-databases"));
    assert.ok(argsOf("2.0.1", true).includes("--download-offline-databases"));
    const offline1 = argsOf("1.9.2", false);
    assert.ok(offline1.includes("--experimental-offline") && offline1.includes("--recursive"));
    assert.ok(!offline1.includes("--experimental-download-offline-databases"));
    assert.ok(argsOf("1.9.2", true).includes("--experimental-download-offline-databases"));
    for (const args of [offline2, offline1])
      assert.ok(!args.some((a) => /offline-vulnerabilities/.test(a)), "never the half-offline mode");
  });

  test("exit codes per tool: osv-scanner 128 (no package) is a clean result, any unknown code is a failure", () => {
    const run = (tool, status, stdout = "") =>
      runTool(tool, "/app", (bin, args) =>
        args[0] === "--version" ? { status: 0, stdout: "osv-scanner version: 2.0.1" } : { status, stdout },
      );
    assert.deepEqual(run("osv-scanner", 128), { tool: "osv-scanner", status: "ok", items: [] });
    assert.equal(run("osv-scanner", 127).status, "failed");
    assert.equal(run("syft", 1).status, "failed");
    assert.deepEqual(run("knip", 2), { tool: "knip", status: "failed", reason: "exit", code: 2, items: [] });
    assert.equal(run("syft", 0, "not json").reason, "output");
    const syft = run(
      "syft",
      0,
      JSON.stringify({
        artifacts: [
          {
            name: "next",
            version: "15.0.0",
            type: "npm",
            purl: "pkg:npm/next@15.0.0",
            licenses: [{ value: "MIT" }],
            locations: [{ path: "/x" }],
          },
        ],
      }),
    );
    assert.deepEqual(syft.items, [
      { name: "next", version: "15.0.0", type: "npm", purl: "pkg:npm/next@15.0.0", licenses: ["MIT"] },
    ]);
  });

  test("the status comes from the items: semgrep exit 0 with a result is a finding; a 'found' code with no readable item is a failure", () => {
    const semgrep = runTool("semgrep", "/app", () => ({
      status: 0,
      stdout: JSON.stringify({ results: [{ check_id: "r", path: "a.js", start: { line: 1 } }] }),
    }));
    assert.equal(semgrep.status, "findings");
    const gitleaks = runTool("gitleaks", "/app", () => ({ status: 1, stdout: "" }));
    assert.deepEqual(gitleaks, { tool: "gitleaks", status: "failed", reason: "output", items: [] });
    assert.equal(runTool("knip", "/app", () => ({ status: 0, stdout: "" })).status, "ok");
    assert.deepEqual(
      runTool("syft", "/app", () => ({ status: null, stdout: "" })),
      {
        tool: "syft",
        status: "failed",
        reason: "interrupted",
        items: [],
      },
    );
  });

  test("osv-scanner whose version cannot be read is never run (a wrong command line could go online)", () => {
    for (const version of [
      { status: 1, stdout: "" },
      { status: 0, stdout: "dev build" },
    ]) {
      const calls = [];
      const r = runTool("osv-scanner", "/app", (bin, args) => {
        calls.push(args);
        return args[0] === "--version" ? version : { status: 0, stdout: "{}" };
      });
      assert.deepEqual(r, { tool: "osv-scanner", status: "failed", reason: "version", items: [] });
      assert.deepEqual(calls, [["--version"]], "no scan after an unreadable version");
    }
    assert.equal(runTool("osv-scanner", "/app", () => null).status, "missing");
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
    const r = await cli(["facts", "--project", dir, "--source", "env", "--source", "dependencies"], {
      commit: () => "c0ffee",
      exec: () => null,
    });
    assert.equal(r.code, 0);
    assert.ok(fs.existsSync(path.join(dir, "facts", "env.json")));
    assert.ok(fs.existsSync(path.join(dir, "facts", "dependencies.json")));
    assert.ok(!fs.existsSync(path.join(dir, "facts", "api.json")));
  });

  test("an unreadable manifest is written in `unreadable` and reported; a readable application has no such field", async () => {
    const appDir = tempDir("doc-kit-facts-broken-app-");
    dirs.push(appDir);
    fs.writeFileSync(path.join(appDir, "package.json"), "{ broken");
    const dir = mk(appDir);
    const r = await cli(["facts", "--project", dir, "--source", "dependencies"], { commit: () => "c0ffee" });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /⚠ package\.json: not valid JSON; its facts are unknown, not empty/);
    const f = JSON.parse(fs.readFileSync(path.join(dir, "facts", "dependencies.json"), "utf8"));
    assert.deepEqual(f.unreadable, [{ file: "package.json", reason: "json" }]);
    assert.deepEqual(f.items, []);

    const fine = mk(app("next-app"));
    await cli(["facts", "--project", fine, "--source", "dependencies", "--source", "tests"], {
      commit: () => "c0ffee",
    });
    for (const source of ["dependencies", "tests"])
      assert.ok(!("unreadable" in JSON.parse(fs.readFileSync(path.join(fine, "facts", `${source}.json`), "utf8"))));
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
    const r = await cli(["facts", "--project", dir, "--source", "api", "--json"], {
      commit: () => null,
      exec: () => null,
    });
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.out);
    assert.ok(parsed.sources.api.items.length > 0);
    assert.equal(r.err, "");
  });

  test("--network: adds `exists` only with the option, for dependencies only", async () => {
    const dir = mk(app("next-app"));
    const fetchImpl = async (url) => ({
      ok: !url.includes("left-pad-pro"),
      status: url.includes("left-pad-pro") ? 404 : 200,
    });
    const r = await cli(["facts", "--project", dir, "--source", "dependencies", "--network", "--json"], {
      commit: () => null,
      exec: () => null,
      fetch: fetchImpl,
    });
    const items = JSON.parse(r.out).sources.dependencies.items;
    assert.equal(items.find((i) => i.name === "next").exists, true);
    assert.equal(items.find((i) => i.name === "left-pad-pro").exists, false);
    assert.ok(!("exists" in items.find((i) => i.name === "scheduler")), "transitive: never checked");

    const without = await cli(["facts", "--project", dir, "--source", "dependencies", "--json"], {
      commit: () => null,
      exec: () => null,
    });
    assert.ok(
      !("exists" in JSON.parse(without.out).sources.dependencies.items[0]),
      "without --network, exists is absent",
    );
  });

  test("--tools: writes facts/tool-<name>.json (normalised envelope), a missing tool is reported and never fails the command", async () => {
    const dir = mk(app("next-app"));
    const calls = [];
    const exec = (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === "gitleaks")
        return {
          status: 1,
          stdout: JSON.stringify([{ RuleID: "x", File: "a.ts", StartLine: 2, Secret: "s3cr3t", Match: "m4tch" }]),
        };
      if (bin === "osv-scanner")
        return args[0] === "--version" ? { status: 0, stdout: "2.0.1" } : { status: 127, stdout: "" };
      return null;
    };
    const r = await cli(["facts", "--project", dir, "--source", "env", "--tools"], { commit: () => "c0ffee", exec });
    assert.equal(r.code, 0);
    const gitleaks = JSON.parse(fs.readFileSync(path.join(dir, "facts", "tool-gitleaks.json"), "utf8"));
    assert.equal(gitleaks.status, "findings");
    assert.equal(gitleaks.commit, "c0ffee");
    assert.deepEqual(gitleaks.items, [{ rule: "x", file: "a.ts", line: 2 }]);
    assert.ok(!JSON.stringify(gitleaks).includes("s3cr3t") && !JSON.stringify(gitleaks).includes("m4tch"));
    assert.ok(!("data" in gitleaks), "the raw report is never stored");
    const knip = JSON.parse(fs.readFileSync(path.join(dir, "facts", "tool-knip.json"), "utf8"));
    assert.equal(knip.status, "missing");
    const osv = JSON.parse(fs.readFileSync(path.join(dir, "facts", "tool-osv-scanner.json"), "utf8"));
    assert.equal(osv.status, "failed");
    assert.match(r.out, /gitleaks: ran, 1 finding/);
    assert.match(r.out, /osv-scanner runs offline only/, "without --network: how to get its database");
    const osvScan = calls.find((c) => c[0] === "osv-scanner" && c[1] === "scan");
    assert.ok(osvScan.includes("--offline") && !osvScan.includes("--download-offline-databases"));
  });

  test("--network --tools: osv-scanner may download its database; no private name ever reaches a request", async () => {
    const appDir = tempDir("doc-kit-facts-private-app-");
    dirs.push(appDir);
    fs.mkdirSync(path.join(appDir, "web"));
    fs.writeFileSync(path.join(appDir, "web", ".npmrc"), "@corp:registry=https://npm.corp.internal/\n");
    fs.writeFileSync(
      path.join(appDir, "web", "package.json"),
      JSON.stringify({ name: "web", dependencies: { "@corp/design": "^2.0.0", react: "^17.0.0" } }),
    );
    const dir = mk(appDir);
    const urls = [];
    const calls = [];
    const r = await cli(
      ["facts", "--project", dir, "--source", "dependencies", "--source", "quality", "--network", "--tools"],
      {
        commit: () => null,
        exec: (bin, args) => (
          calls.push([bin, ...args]),
          bin === "osv-scanner" && args[0] === "--version" ? { status: 0, stdout: "2.1.0" } : null
        ),
        fetch: async (url) => {
          urls.push(url);
          return { ok: true, status: 200, json: async () => ({ version: "19.0.0" }) };
        },
      },
    );
    assert.equal(r.code, 0, r.err);
    assert.ok(
      urls.some((u) => u.includes("react")),
      "the public package is checked",
    );
    assert.ok(!urls.some((u) => /corp/i.test(u)), `a private name was sent: ${urls.join(", ")}`);
    const quality = JSON.parse(fs.readFileSync(path.join(dir, "facts", "quality.json"), "utf8"));
    assert.equal(quality.summary.outdated, 1, "react 17 → 19; @corp/design never asked");
    assert.ok(calls.some((c) => c[0] === "osv-scanner" && c.includes("--download-offline-databases")));
  });

  test("--network reads the person's own configuration (ctx.env): a scope declared only in ~/.npmrc is never sent", async () => {
    const appDir = tempDir("doc-kit-facts-userconf-app-");
    const home = tempDir("doc-kit-facts-userconf-home-");
    dirs.push(appDir, home);
    fs.writeFileSync(path.join(home, ".npmrc"), "@corp:registry=https://npm.corp.internal/\n");
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "web", dependencies: { "@corp/design": "^2.0.0", react: "^17.0.0" } }),
    );
    const dir = mk(appDir);
    const urls = [];
    const r = await cli(["facts", "--project", dir, "--source", "dependencies", "--source", "quality", "--network"], {
      env: { HOME: home },
      commit: () => null,
      exec: () => null,
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ version: "19.0.0" }) };
      },
    });
    assert.equal(r.code, 0, r.err);
    assert.ok(urls.length > 0);
    assert.ok(!urls.some((u) => /corp/i.test(u)), `a private name was sent: ${urls.join(", ")}`);
  });

  test("--tools prints a count for an inventory (syft) and a translated reason for a failure", async () => {
    const dir = mk(app("next-app"));
    const exec = (bin) => {
      if (bin === "syft")
        return { status: 0, stdout: JSON.stringify({ artifacts: [{ name: "next", version: "15" }] }) };
      if (bin === "knip") return { status: 2, stdout: "" };
      return null;
    };
    const en = await cli(["facts", "--project", dir, "--source", "env", "--tools"], { commit: () => null, exec });
    assert.match(en.out, /syft: ran, 1 package listed/);
    assert.match(en.out, /knip: failed \(exit code 2\)/);
    const fr = await cli(["facts", "--project", dir, "--source", "env", "--tools", "--lang", "fr"], {
      commit: () => null,
      exec,
    });
    assert.match(fr.out, /knip : échec \(code de sortie 2\)/);
  });

  test("facts never writes into the application", async () => {
    const appDir = app("next-app");
    const before = fs.readdirSync(appDir).sort();
    const dir = mk(appDir);
    await cli(["facts", "--project", dir], {
      commit: () => null,
      exec: () => null,
      fetch: async () => ({ ok: true, status: 200 }),
    });
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
      const write = (source, items) =>
        fs.writeFileSync(
          path.join(dir, "facts", `${source}.json`),
          JSON.stringify(
            factsFile({
              source,
              items,
              generator: "x",
              generated: "2026-01-01T00:00:00.000Z",
              commit: null,
              app: "..",
            }),
          ),
        );
      write("env", [{ name: "DATABASE_URL", files: [], example: true }]);
      const env = await inventory(dir, { adapter: "facts", source: "env" });
      assert.equal(env.families[0].name, "Environment variables");
      assert.deepEqual(env.families[0].items, [{ id: "DATABASE_URL", match: ["DATABASE_URL"] }]);

      write("dependencies", [
        { name: "next", version: "1", ecosystem: "npm", direct: true, dev: false, manifest: "frontend/package.json" },
        {
          name: "next",
          version: "1",
          ecosystem: "npm",
          direct: true,
          dev: false,
          manifest: "frontend/package-lock.json",
        },
        {
          name: "scheduler",
          version: "1",
          ecosystem: "npm",
          direct: false,
          dev: false,
          manifest: "frontend/package-lock.json",
        },
      ]);
      const deps = await inventory(dir, { adapter: "facts", source: "dependencies" });
      assert.deepEqual(
        deps.families[0].items.map((i) => i.id),
        ["next"],
        "only the direct dependencies, de-duplicated across the manifests that name it",
      );

      write("api", [{ method: "GET", route: "/orders/[id]", file: "a.ts", framework: "next-app-router" }]);
      const api = await inventory(dir, { adapter: "facts", source: "api", family: "API routes" });
      assert.ok(api.families[0].items[0].match.includes("GET /orders/"), "the route forms, prefixed by the method");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fastapi: one item per handler, sharing engine/facts/api.mjs", async () => {
    const r = await inventory(app("fastapi-app"), { adapter: "fastapi", app: "." });
    assert.deepEqual(r.families[0].items.map((i) => i.id).sort(), [
      "GET /api/orders",
      "GET /api/orders/{order_id}",
      "GET /health",
      "POST /api/orders",
    ]);
    const missing = await inventory(app("fastapi-app"), { adapter: "fastapi", app: "nope" });
    assert.equal(missing.available, false);
  });

  test("next-app-router: `api` option adds a second family; no change when it is left out", async () => {
    const without = await inventory(app("next-app"), { adapter: "next-app-router", app: "app" });
    assert.equal(without.families.length, 1, "unchanged when `api` is absent");

    const withApi = await inventory(app("next-app"), { adapter: "next-app-router", app: "app", api: true });
    assert.equal(withApi.families.length, 2);
    assert.deepEqual(
      withApi.families[0].items.map((i) => i.id),
      without.families[0].items.map((i) => i.id),
      "the page family is identical",
    );
    assert.deepEqual(withApi.families[1].items.map((i) => i.id).sort(), [
      "GET /api/orders",
      "GET /api/orders/[id]",
      "POST /api/orders",
    ]);
    assert.equal(withApi.families[1].name, "API");
  });
});
