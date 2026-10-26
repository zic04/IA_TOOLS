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
import { runTool, runTools, TOOL_NAMES } from "../../engine/facts/tools.mjs";
import { factsFile, relPath, listFiles, withoutDocProjects } from "../../engine/facts/common.mjs";
import { loadAdapter } from "../../engine/core/adapter-loader.mjs";
import { adapterTools } from "../../engine/core/project-tools.mjs";
import { routeFiles, matchRoute } from "../../engine/sync/routes.mjs";

/** A package-lock.json (v3) as npm writes it: each name's tarball from the registry given (npm's public one by default). */
function npmLock(names, registryOf = () => "https://registry.npmjs.org") {
  const packages = { "": { dependencies: Object.fromEntries(names.map((n) => [n, "*"])) } };
  for (const n of names)
    packages[`node_modules/${n}`] = {
      version: "1.0.0",
      resolved: `${registryOf(n)}/${n}/-/${n.split("/").pop()}-1.0.0.tgz`,
    };
  return JSON.stringify({ lockfileVersion: 3, packages });
}

/** A uv.lock as uv writes it: each name from PyPI's registry. */
const uvLock = (names) =>
  names
    .map((n) => `[[package]]\nname = "${n}"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\n`)
    .join("\n");

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

/**
 * A documentation project whose application is `appDir` (never written to); `allow`, the packages its configuration
 * lists for `--network` (facts.network.allow), none by default.
 */
function project(appDir, allow) {
  const dir = tempDir("doc-kit-facts-");
  const facts = allow ? `, facts: { network: { allow: ${JSON.stringify(allow)} } }` : "";
  fs.writeFileSync(
    path.join(dir, "doc.config.mjs"),
    `export default { product: { name: "Acme Orders" }, app: { dir: ${JSON.stringify(appDir)} }${facts} };\n`,
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
      licenseFrom: "lock",
      public: true, // its `resolved` is npm's public registry: the proof --network needs
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

  test("dependencies: yarn.lock v1 and berry — no root entry of their own: direct from the package.json beside them", () => {
    const classic = byManifest(collectDependencies(app("yarn-classic")), "yarn.lock");
    assert.equal(classic.lodash.version, "4.17.21");
    assert.equal(classic.lodash.direct, true, "the package.json beside it declares it");
    assert.equal(classic["object-is"].direct, false, "declared by no package.json of that folder");

    const berry = byManifest(collectDependencies(app("yarn-berry")), "yarn.lock");
    assert.deepEqual(Object.keys(berry), ["lodash"], "the workspace root itself is not a dependency");
    assert.equal(berry.lodash.version, "4.17.21");
    assert.equal(berry.lodash.direct, true);
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
    assert.equal(toml.fastapi.version, null, "a range is not an installed version");
    assert.equal(toml.fastapi.spec, "^0.104.1", "the range declared in pyproject.toml, not refined by the lock");
    assert.equal(toml.fastapi.direct, true);
    assert.equal(lock.fastapi.version, "0.104.1", "the resolved version, its own item");
    assert.equal(lock.fastapi.direct, true, "no root entry of its own: direct from the pyproject.toml beside it");
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
  function mk(appDir, allow) {
    const d = project(appDir, allow);
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
    const dir = mk(app("next-app"), ["npm:next", "npm:left-pad-pro"]);
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
    // A range that names the major in use (~=2.0) counts; a lower bound alone (>=1.26) says nothing of it.
    fs.writeFileSync(path.join(appDir, "web", "requirements.txt"), "urllib3>=1.26\nflask~=2.0\n");
    // The lock files that prove the public names (only those are ever sent); @corp/design came from its own registry.
    const corp = (n) => (n.startsWith("@corp/") ? "https://npm.corp.internal" : "https://registry.npmjs.org");
    fs.writeFileSync(path.join(appDir, "web", "package-lock.json"), npmLock(["@corp/design", "react"], corp));
    fs.writeFileSync(path.join(appDir, "web", "uv.lock"), uvLock(["urllib3", "flask"]));
    // Every name listed, the private one too: the list never lets out a name the second net keeps back.
    const dir = mk(appDir, ["npm:@corp/design", "npm:react", "pip:urllib3", "pip:flask"]);
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
          return { ok: true, status: 200, json: async () => ({ version: "19.0.0", info: { version: "3.1.0" } }) };
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
    assert.equal(
      quality.summary.outdated,
      2,
      "react ^17 → 19 and flask ~=2.0 → 3; urllib3>=1.26 not; @corp/design never asked",
    );
    assert.ok(calls.some((c) => c[0] === "osv-scanner" && c.includes("--download-offline-databases")));
  });

  test("--network: dependencies and quality ask each package once between them; the items carry latest and majorsBehind", async () => {
    const appDir = tempDir("doc-kit-facts-once-app-");
    dirs.push(appDir);
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "web", dependencies: { react: "^17.0.0", next: "^15.0.0" } }),
    );
    fs.writeFileSync(path.join(appDir, "package-lock.json"), npmLock(["react", "next"]));
    const dir = mk(appDir, ["npm:react", "npm:next"]);
    const urls = [];
    const fetch = async (url) => (
      urls.push(url),
      { ok: true, status: 200, json: async () => ({ version: url.includes("/react/") ? "19.1.0" : "15.2.0" }) }
    );
    const r = await cli(["facts", "--project", dir, "--source", "dependencies", "--source", "quality", "--network"], {
      commit: () => null,
      exec: () => null,
      fetch,
    });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(
      urls.sort(),
      ["https://registry.npmjs.org/next/latest", "https://registry.npmjs.org/react/latest"],
      "one request a package for the two sources",
    );
    const read = (source) => JSON.parse(fs.readFileSync(path.join(dir, "facts", `${source}.json`), "utf8"));
    const react = read("dependencies").items.find((i) => i.name === "react" && i.manifest === "package.json");
    assert.deepEqual([react.exists, react.latest, react.majorsBehind], [true, "19.1.0", 2]);
    assert.equal(read("quality").summary.outdated, 2, "react and next, from the lock's 1.0.0: the shared answers");
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
    // A lock as a person whose ~/.npmrc names the corp registry gets: both from npm's public registry by mistake would
    // be no proof of privacy — the declaration in ~/.npmrc still keeps @corp/design back.
    fs.writeFileSync(path.join(appDir, "package-lock.json"), npmLock(["@corp/design", "react"]));
    const dir = mk(appDir, ["npm:@corp/design", "npm:react"]);
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

  // RULES.md S7: a route segment that looks like a token (a webhook's secret path) is "…" in the coverage ids and
  // their forms, as the `api` and `screens` facts write it — never in clear in a coverage report or the audit.
  test("fastapi, next-app-router, openapi, react-router: a route segment that looks like a token is masked", async () => {
    const token = "Zq8vN3kT6wP1" + "xR4mY7bLc2Hd9sF0"; // a random token of 28 characters, written in two parts
    const dir = tempDir("doc-kit-coverage-masked-");
    try {
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
      };
      write(
        "py/main.py",
        `from fastapi import FastAPI\napp = FastAPI()\n\n@app.post("/hooks/${token}")\ndef hook():\n    return {}\n`,
      );
      write(`next/app/hooks/${token}/page.tsx`, "export default function Page() { return null; }\n");
      write(`next/app/api/hooks/${token}/route.ts`, "export async function POST() { return Response.json({}); }\n");
      write("openapi.json", JSON.stringify({ openapi: "3.0.0", paths: { [`/hooks/${token}`]: { post: {} } } }));
      write("src/App.tsx", `<Route path="/hooks/${token}" element={<Hook />} />\n`);
      const results = [
        await inventory(dir, { adapter: "fastapi", app: "py" }),
        await inventory(dir, { adapter: "next-app-router", app: "next/app", api: true, exclude: [] }),
        await inventory(dir, { adapter: "openapi", file: "openapi.json" }),
        await inventory(dir, { adapter: "react-router", file: "src/App.tsx", exclude: [] }),
      ];
      const ids = results.flatMap((r) => r.families.flatMap((f) => f.items.map((i) => i.id)));
      assert.deepEqual(ids, ["POST /hooks/…", "/hooks/…", "POST /api/hooks/…", "POST /hooks/…", "/hooks/…"]);
      assert.ok(!JSON.stringify(results).includes(token), "the token is in no id and no form of a route");
      // sync still finds the file of a masked FastAPI route (engine/sync/routes.mjs).
      const fastapi = { adapter: "fastapi", app: "py" };
      const { options } = await loadAdapter("coverage", fastapi, dir, "coverage[0]");
      const item = results[0].families[0].items[0];
      assert.deepEqual(routeFiles({ spec: fastapi, options, item, route: item.match[0], tools: adapterTools(dir) }), [
        "py/main.py",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // The same for the glob adapter, whose ids are file paths and whose forms are often routes (match: "/{path}"):
  // sync still finds the file of a masked id (engine/sync/routes.mjs).
  test("glob: a path segment that looks like a token is masked in the id and the forms; sync still finds its file", async () => {
    const token = "Zq8vN3kT6wP1" + "xR4mY7bLc2Hd9sF0"; // a random token of 28 characters, written in two parts
    const dir = tempDir("doc-kit-coverage-glob-masked-");
    try {
      for (const file of [`routes/hooks/${token}.tsx`, "routes/orders/list.tsx"]) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), "export default function Page() {}\n");
      }
      const spec = { adapter: "glob", family: "Routes", base: "routes", pattern: "**/*.tsx", match: "/{path}" };
      const r = await inventory(dir, spec);
      // The whole segment is masked, its extension with it: the forms are rendered from the masked path.
      assert.deepEqual(r.families[0].items, [
        { id: "hooks/…", match: ["/hooks/…"] },
        { id: "orders/list.tsx", match: ["/orders/list"] },
      ]);
      const named = await inventory(dir, { ...spec, match: "{dir}|{name}|{file}" });
      assert.deepEqual(named.families[0].items[0].match, ["hooks|…|…"]);
      assert.ok(!JSON.stringify([r, named]).includes(token), "the token is in no id and no form");
      const { options } = await loadAdapter("coverage", spec, dir, "coverage[0]");
      const files = (item) => routeFiles({ spec, options, item, route: item.match[0], tools: adapterTools(dir) });
      assert.deepEqual(files(r.families[0].items[0]), [`routes/hooks/${token}.tsx`]);
      assert.deepEqual(files(r.families[0].items[1]), ["routes/orders/list.tsx"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // A file's name is judged without its extension (`.tsx` reads as no word): a long ordinary name is kept, as
  // SECURITY.md says of GetUserProfileByIdV2, so two components never collapse into one id; beside it, in the same
  // folder with the same extension, a name that looks like a token is masked (a minimal pair), and so is a name whose
  // extension looks like one, or that holds a token written across its last dot.
  test("glob: a file's name is judged without its extension; two components never collapse into one id", async () => {
    const token = "Zq8vN3kT6wP1" + "xR4mY7bLc2Hd9sF0"; // a random token of 28 characters, written in two parts
    const dir = tempDir("doc-kit-coverage-glob-names-");
    try {
      for (const file of [
        "routes/OrderSummaryCard.tsx",
        "routes/NotificationPreferences.tsx",
        "routes/GetUserProfileByIdV2.tsx",
        `routes/${token}.tsx`,
        `keys/config.${token}`,
        `keys/${token.slice(0, 13)}.${token.slice(13, 26)}`,
      ]) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), "export default function Page() {}\n");
      }
      const spec = { adapter: "glob", family: "Routes", base: "routes", pattern: "*.tsx", match: "/{name}" };
      const r = await inventory(dir, spec);
      assert.deepEqual(r.families[0].items, [
        { id: "GetUserProfileByIdV2.tsx", match: ["/GetUserProfileByIdV2"] },
        { id: "NotificationPreferences.tsx", match: ["/NotificationPreferences"] },
        { id: "OrderSummaryCard.tsx", match: ["/OrderSummaryCard"] },
        { id: "…", match: ["/…"] },
      ]);
      const { options } = await loadAdapter("coverage", spec, dir, "coverage[0]");
      const items = r.families[0].items;
      const files = (route) =>
        routeFiles({ spec, options, item: matchRoute(route, items), route, tools: adapterTools(dir) });
      assert.deepEqual(files("/OrderSummaryCard"), ["routes/OrderSummaryCard.tsx"]);
      assert.deepEqual(files("/NotificationPreferences"), ["routes/NotificationPreferences.tsx"]);
      assert.deepEqual(files("/…"), [`routes/${token}.tsx`], "the masked id: the token's file alone");
      const keys = await inventory(dir, { ...spec, base: "keys", pattern: "*", match: "{file}" });
      assert.deepEqual(
        keys.families[0].items,
        [
          { id: "…", match: ["…"] },
          { id: "…", match: ["…"] },
        ],
        "a token after the last dot, or across it",
      );
      const text = JSON.stringify([r, keys]);
      assert.ok(
        ![token, token.slice(0, 13), token.slice(13, 26)].some((t) => text.includes(t)),
        "no part of the token",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // sync finds the files of a masked route through every coverage adapter that masks one (engine/sync/routes.mjs): the
  // route a page cites is the masked one ("…"), the only one the writer sees.
  test("sync: the files of a masked route, through next-app-router, fastapi, openapi, react-router and glob", async () => {
    const token = "Zq8vN3kT6wP1" + "xR4mY7bLc2Hd9sF0"; // a random token of 28 characters, written in two parts
    const dir = tempDir("doc-kit-coverage-masked-files-");
    try {
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
      };
      write(
        "py/main.py",
        `from fastapi import FastAPI\napp = FastAPI()\n\n@app.post("/hooks/${token}")\ndef hook():\n    return {}\n`,
      );
      write(`next/app/hooks/${token}/page.tsx`, "export default function Page() { return null; }\n");
      write("next/app/orders/page.tsx", "export default function Page() { return null; }\n");
      write("next/app/layout.tsx", "export default function Layout() { return null; }\n");
      write("openapi.json", JSON.stringify({ openapi: "3.0.0", paths: { [`/hooks/${token}`]: { post: {} } } }));
      write("src/App.tsx", `<Route path="/hooks/${token}" element={<Hook />} />\n`);
      const page = `next/app/hooks/${token}/page.tsx`;
      const cases = [
        [{ adapter: "next-app-router", app: "next/app" }, "/hooks/…", [page, "next/app/layout.tsx"]],
        [
          { adapter: "next-app-router", app: "next/app" },
          "/orders",
          ["next/app/orders/page.tsx", "next/app/layout.tsx"],
        ],
        [{ adapter: "fastapi", app: "py" }, "POST /hooks/…", ["py/main.py"]],
        // An operation of an OpenAPI document has no file of its own (ARCHITECTURE.md §6.10): found, and none.
        [{ adapter: "openapi", file: "openapi.json" }, "POST /hooks/…", []],
        [{ adapter: "react-router", file: "src/App.tsx", exclude: [] }, "/hooks/…", ["src/App.tsx"]],
        [
          { adapter: "glob", family: "R", base: "next/app", pattern: "**/page.tsx", match: "/{dir}" },
          "/hooks/…",
          [page],
        ],
      ];
      for (const [spec, route, expected] of cases) {
        const item = matchRoute(route, (await inventory(dir, spec)).families[0].items);
        assert.ok(item, `${spec.adapter} ${route}: an item of the inventory`);
        const { options } = await loadAdapter("coverage", spec, dir, "coverage[0]");
        const files = routeFiles({ spec, options, item, route, tools: adapterTools(dir) });
        assert.deepEqual(files, expected, `${spec.adapter} ${route}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
