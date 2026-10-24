// What the review of the stack contract found (ARCHITECTURE.md §5, §6.9; SECURITY.md): a project's stack adapter is
// never a file of the application nor out of the documentation project, links followed; an adapter runs where its
// stack is detected and is never given a test, a generated or a large file; a call read up to the next one (a regular
// expression literal in a handler), a FastAPI handler found after a long decorator; a "test" folder of a router is a
// route; a credential of a manifest is never kept; the Gemfile and XML readers bounded.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { tempDir } from "../tools/helpers.mjs";
import { loadStacks, stackSources, BUILT_IN_STACKS } from "../../engine/facts/stacks.mjs";
import { collectApi, collectScreens } from "../../engine/facts/api.mjs";
import { isTestFile } from "../../engine/facts/code-files.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import next from "../../adapters/stack/next.mjs";
import {
  MAX_GUARDS,
  MAX_ITEMS,
  withGuards,
  singular,
  STACK_COMMON_PATTERNS,
} from "../../engine/facts/stack-common.mjs";
import { routeWithoutSecrets } from "../../engine/facts/behaviour-common.mjs";
import spring from "../../adapters/stack/spring.mjs";
import { GENERIC } from "../../engine/check/secrets.mjs";

/** Writes files (relative path → text) under a new temporary folder; returns it. */
function tree(prefix, files) {
  const dir = tempDir(prefix);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const ADAPTER = "export default { name: 'x', files: /\\.x$/, api: () => [] };\n";
/** An adapter that says when it is imported (it must never be). */
const RUNS = (flag) => `globalThis.${flag} = true;\nexport default { name: 'evil', files: /x/, api: () => [] };\n`;

describe("a project's stack adapter: a file of the documentation project only", () => {
  test("a junction (a link on POSIX) to a folder out of the project is refused, its file never imported", async () => {
    const dir = tree("doc-kit-harden-link-", { "docs/doc.config.mjs": "", "outside/evil.mjs": RUNS("__dkLink") });
    const link = path.join(dir, "docs", "linked");
    try {
      fs.symlinkSync(path.join(dir, "outside"), link, process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(
        loadStacks(path.join(dir, "docs"), { stacks: { adapters: ["local:linked/evil.mjs"] } }),
        (e) => e.key === "stacks.outside",
      );
      assert.equal(globalThis.__dkLink, undefined);
    } finally {
      try {
        fs.unlinkSync(link);
      } catch {
        fs.rmSync(link, { force: true, recursive: false });
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the application inside the project, or .doc-kit/ (the clones of the sources): refused, never imported", async () => {
    const root = tree("doc-kit-harden-in-", {
      "app/evil.mjs": RUNS("__dkApp"),
      ".doc-kit/inputs/repos/orders/evil.mjs": RUNS("__dkClone"),
      "adapters/ok.mjs": ADAPTER,
    });
    try {
      for (const [spec, flag] of [
        ["local:app/evil.mjs", "__dkApp"],
        ["local:.doc-kit/inputs/repos/orders/evil.mjs", "__dkClone"],
      ]) {
        await assert.rejects(
          loadStacks(root, { app: { dir: "app" }, stacks: { adapters: [spec] } }),
          (e) => e.key === "stacks.outside",
          spec,
        );
        assert.equal(globalThis[flag], undefined, spec);
      }
      const stacks = await loadStacks(root, { app: { dir: "app" }, stacks: { adapters: ["local:adapters/ok.mjs"] } });
      assert.equal(stacks.at(-1).name, "x");
      // The documentation inside the application (docs/manual): its own adapters are still its own.
      const inside = await loadStacks(path.join(root, "adapters", ".."), {
        app: { dir: ".." },
        stacks: { adapters: ["local:adapters/ok.mjs"] },
      });
      assert.equal(inside.at(-1).name, "x");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a file not found is adapter.missing; an unknown id in stacks.disabled is stacks.unknown", async () => {
    const root = tree("doc-kit-harden-missing-", {});
    try {
      await assert.rejects(
        loadStacks(root, { stacks: { adapters: ["local:none.mjs"] } }),
        (e) => e.key === "adapter.missing",
      );
      await assert.rejects(loadStacks(root, { stacks: { disabled: ["expres"] } }), (e) => e.key === "stacks.unknown");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("the configuration accepts a local: path only (a kit's id or a bare path is config.invalid, exit code 2)", async () => {
    for (const adapters of [["express"], ["../x.mjs"]]) {
      const dir = tree("doc-kit-harden-schema-", {
        "doc.config.mjs": `export default { product: { name: "Shop" }, app: { dir: "app" }, stacks: { adapters: ${JSON.stringify(adapters)} } };\n`,
        "content/toc.json": JSON.stringify({ title: "Shop", sections: [] }),
        "app/a.js": "",
      });
      try {
        let err = "";
        const code = await runCli(["facts", "--source", "api", "--project", dir], {
          stdout: { write: () => {} },
          stderr: { write: (s) => (err += s) },
          env: {},
          commit: () => null,
          exec: () => null,
        });
        assert.equal(code, 2, err);
        assert.match(err, /stacks\.adapters\[0\]/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});

describe("what an adapter runs on, and is given", () => {
  test("never a file over 512 KB, a generated file, a test or a folder of dependencies", () => {
    const app = tree("doc-kit-harden-given-", {
      "src/ok.ts": "x",
      "src/big.ts": "x".repeat(600 * 1024),
      "src/bundle.min.js": "x",
      "src/types.d.ts": "x",
      "src/a.test.ts": "x",
      "dist/out.js": "x",
      "vendor/lib/a.js": "x",
    });
    try {
      const seen = { name: "probe", files: /\.(ts|js)$/, api: () => [] };
      const [{ sources }] = stackSources(app, [seen], "api");
      assert.deepEqual([...sources.keys()], ["src/ok.ts"]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a kit's adapter runs where its stack is detected: no Next.js screens in a Vite application", () => {
    const files = {
      "src/pages/Home.tsx": "export default function Home() {}\n",
      "pages/About.tsx": "export default function About() {}\n",
    };
    const vite = tree("doc-kit-harden-vite-", {
      ...files,
      "package.json": JSON.stringify({ dependencies: { react: "18.3.1" }, devDependencies: { vite: "5.4.0" } }),
    });
    const nextApp = tree("doc-kit-harden-next-", {
      ...files,
      "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
    });
    try {
      assert.deepEqual(collectScreens(vite), []);
      assert.deepEqual(
        collectScreens(nextApp).map((s) => s.route),
        ["/About"],
      );
    } finally {
      fs.rmSync(vite, { recursive: true, force: true });
      fs.rmSync(nextApp, { recursive: true, force: true });
    }
  });

  test("an item of a project adapter without its route, method or file is left out, never a crash", () => {
    const app = tree("doc-kit-harden-items-", { "a.x": "x" });
    try {
      const odd = {
        name: "odd",
        files: /\.x$/,
        api: () => [
          null,
          { method: "GET" },
          { method: "GET", route: 5, file: "a.x" },
          { method: "GET", route: "/a", file: "a.x", line: "1", guards: ["g", 3] },
        ],
      };
      assert.deepEqual(collectApi(app, {}, [odd]), [
        { method: "GET", route: "/a", file: "a.x", line: 1, framework: "odd", auth: "unknown", guards: ["g"] },
      ]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("reading routes", () => {
  test("a regular expression literal in an Express handler does not hide the next routes", () => {
    const source = [
      'router.get("/profile", requireAuth, (req, res) => res.send(name.replace(/"/g, "&quot;")));',
      'router.post("/admin/users", requireAdmin, h);',
      'router.delete("/admin/users/:id", requireAdmin, h);',
    ].join("\n");
    assert.deepEqual(
      expressRoutes(source, "x.js").map((r) => `${r.method} ${r.route} ${r.guards.join(",")}`),
      ["GET /profile requireAuth", "POST /admin/users requireAdmin", "DELETE /admin/users/:id requireAdmin"],
    );
    const many = 'router.get("/r", (req, res) => res.send(s.split(/\\(/)));\n'.repeat(1000);
    assert.equal(expressRoutes(many, "x.js").length, 1000);
  });

  test("the routers written like Express (Fastify, Hono, Koa) are read where they are the dependency", () => {
    for (const dependency of ["fastify", "hono", "@koa/router"]) {
      const app = tree("doc-kit-harden-like-", {
        "package.json": JSON.stringify({ dependencies: { [dependency]: "1.0.0" } }),
        "server.js": 'app.get("/health", h);\nrouter.post("/admin/users", requireAdmin, h);\n',
      });
      try {
        assert.deepEqual(
          collectApi(app).map((r) => `${r.method} ${r.route}`),
          ["POST /admin/users", "GET /health"],
          dependency,
        );
      } finally {
        fs.rmSync(app, { recursive: true, force: true });
      }
    }
  });

  test("a FastAPI handler after a long decorator keeps its guards; two route decorators share one handler", () => {
    const responses = `responses={${'404: {"description": "not found"}, '.repeat(60)}}`;
    const source = [
      `@router.get("/orders", ${responses})`,
      "def list_orders(user = Depends(get_current_user)):",
      "    pass",
      '@router.get("/a")',
      '@router.get("/b")',
      "def both(admin = Depends(require_admin)):",
      "    pass",
    ].join("\n");
    assert.ok(responses.length > 2000);
    assert.deepEqual(
      fastapiRoutes(new Map([["x.py", source]])).map((r) => `${r.route} ${r.guards.join(",")}`),
      ["/a require_admin", "/b require_admin", "/orders get_current_user"],
    );
  });

  test("a folder named like tests under a router is a route; elsewhere it is tests", () => {
    for (const f of [
      "app/api/test/route.ts",
      "app/api/fixtures/route.ts",
      "pages/api/e2e/run.ts",
      "app/stories/page.tsx",
      "src/app/spec/page.tsx",
    ])
      assert.equal(isTestFile(f), false, f);
    for (const f of [
      "tests/app/x.ts",
      "src/test/java/A.java",
      "app/__tests__/a.ts",
      "app/x.test.tsx",
      "spec/models/a_spec.rb",
      "orders/tests.py",
      "app/tests/utils/factories.py",
      "src/app/orders/tests/helpers.ts",
      "app/api/test/helpers.ts",
      "Orders.Tests/A.cs",
    ])
      assert.equal(isTestFile(f), true, f);
    const app = tree("doc-kit-harden-route-", {
      "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
      "app/api/test/route.ts": "export async function GET() {}\n",
    });
    try {
      assert.deepEqual(
        collectApi(app).map((r) => `${r.method} ${r.route} ${r.auth}`),
        ["GET /api/test none"],
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
    assert.equal("apps/web/app/page.tsx".search(next.files), -1);
    assert.equal("src/pages/a.tsx".search(next.files), 0);
  });
});

describe("the manifests", () => {
  test("the user and password of an address are never kept; such a package is local (never sent); a URL is no name", () => {
    const token = "gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE";
    const app = tree("doc-kit-harden-creds-", {
      "package.json": JSON.stringify({
        dependencies: { x: "git+https://user:SECRET123@github.com/a/b.git", y: token, z: "1.2.3" },
      }),
      "requirements.txt": "w @ git+https://user:SECRET123@example.com/w.git\n",
      Gemfile: 'gem "d", "https://u:SECRET123@gems.example.com"\ngem "e", "git" => "https://example.com/e.git"\n',
      "Cargo.toml": '[dependencies]\nc = { package = "https://example.com/c", version = "1" }\n',
    });
    try {
      const items = collectDependencies(app);
      const text = JSON.stringify(items);
      assert.doesNotMatch(text, /SECRET123|user:|u:SECRET/);
      assert.ok(!text.includes(token));
      const byName = Object.fromEntries(items.map((i) => [`${i.ecosystem}:${i.name}`, i]));
      // An address is no version: kept, without its user and password, as the constraint written (`spec`).
      assert.equal(byName["npm:x"].version, null);
      assert.equal(byName["npm:x"].spec, "git+https://github.com/a/b.git");
      assert.equal(byName["npm:x"].local, true);
      assert.equal(byName["npm:y"].version, null);
      assert.equal(byName["npm:y"].local, true);
      assert.equal(byName["npm:z"].version, "1.2.3");
      assert.equal(byName["npm:z"].local, undefined);
      assert.equal(byName["pip:w"].local, true);
      assert.equal(byName["rubygems:e"].local, true, '"git" => url is a git source');
      assert.ok(!items.some((i) => i.name.includes("://")));
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a Gemfile of blocks never closed: each gem in them (its growth: facts-deps-growth.test.mjs)", () => {
    const app = tree("doc-kit-harden-gem-", {});
    try {
      for (const unit of ['group :test do\n  gem "a"\n', 'if x\ngem "a"\n']) {
        fs.writeFileSync(path.join(app, "Gemfile"), unit.repeat(Math.ceil(5_000 / unit.length)));
        const items = collectDependencies(app);
        assert.equal(items[0].dev, unit.startsWith("group"));
      }
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("an XML manifest of more elements than the reader allows is unreadable (xml), never read in part", () => {
    const app = tree("doc-kit-harden-xml-", {
      "pom.xml": `<project><dependencies>${"<a/>".repeat(200_001)}</dependencies></project>`,
    });
    try {
      const unreadable = [];
      assert.deepEqual(collectDependencies(app, unreadable), []);
      assert.deepEqual(unreadable, [{ file: "pom.xml", reason: "xml" }]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("thirteen stacks, one route per declaration", () => {
  test("an application without a manifest: a decorator FastAPI and Flask both read is the framework's the file names", () => {
    const fastapiApp = tree("doc-kit-harden-owner-", {
      "main.py":
        'from fastapi import APIRouter\nrouter = APIRouter(prefix="/orders")\n@router.get("/{order_id}")\ndef one(order_id): pass\n',
    });
    const flaskApp = tree("doc-kit-harden-owner-", {
      "app.py":
        'from flask import Blueprint\nbp = Blueprint("orders", __name__, url_prefix="/orders")\n@bp.get("/<int:order_id>")\ndef one(order_id): pass\n',
    });
    try {
      assert.deepEqual(
        collectApi(fastapiApp).map((r) => `${r.framework} ${r.method} ${r.route}`),
        ["fastapi GET /orders/{order_id}"],
      );
      assert.deepEqual(
        collectApi(flaskApp).map((r) => `${r.framework} ${r.method} ${r.route}`),
        ["flask GET /orders/<int:order_id>"],
      );
    } finally {
      fs.rmSync(fastapiApp, { recursive: true, force: true });
      fs.rmSync(flaskApp, { recursive: true, force: true });
    }
  });

  test("the user guards of 0.5: an Express `auth` middleware is user; Next's auth() in a body, requireAuth, currentUser are not", () => {
    const app = tree("doc-kit-harden-guards-", {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0", next: "15.0.0" } }),
      "server.js": 'app.get("/a", auth, h);\napp.get("/b", requireAuth, h);\n',
      "app/api/c/route.ts": "export async function GET() { const s = await auth(); }\n",
      "app/api/d/route.ts": "export async function GET() { const u = await currentUser(); }\n",
    });
    try {
      assert.deepEqual(
        collectApi(app).map((r) => `${r.route} ${r.auth}`),
        // auth() in a handler's body is a lookup, which refuses an anonymous caller nothing: unknown (SECURITY.md).
        ["/a user", "/api/c unknown", "/api/d unknown", "/b unknown"],
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a route's segment shaped like a token is written …; a word with digits is kept", () => {
    const token = "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0";
    const app = tree("doc-kit-harden-mask-", {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0" } }),
      "server.js": `app.post("/hooks/${token}", h);\napp.get("/oauth2callback", h);\n`,
    });
    try {
      assert.deepEqual(
        collectApi(app).map((r) => r.route),
        ["/hooks/…", "/oauth2callback"],
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("guards composed are cut at MAX_GUARDS and kept once; the singular of a resource as the inflectors give it", () => {
    const parent = withGuards(
      Array.from({ length: 100 }, (_, i) => `p${i}`),
      [],
    );
    assert.equal(parent.length, MAX_GUARDS);
    assert.deepEqual(withGuards(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
    assert.equal(withGuards(parent, ["own"]).length, MAX_GUARDS);
    const words = {
      orders: "order",
      categories: "category",
      movies: "movie",
      cookies: "cookie",
      series: "series",
      news: "news",
      addresses: "address",
      statuses: "status",
      houses: "house",
      boxes: "box",
      people: "person",
      class: "class",
    };
    for (const [plural, one] of Object.entries(words)) assert.equal(singular(plural), one, plural);
    assert.ok(
      Object.isFrozen(STACK_COMMON_PATTERNS) &&
        Object.values(STACK_COMMON_PATTERNS).every((re) => re instanceof RegExp),
    );
  });
});

describe("the second review of the thirteen stacks", () => {
  test("guards written thousands of times over compose in a bounded part of the list (a Vue route of K children)", () => {
    // One child whose guards are 31 names then thousands of copies of the last, mounted k times under a parent.
    const app = (k, copies) => {
      const guards = [...Array.from({ length: 31 }, (_, i) => `g${i}`), ...Array(copies).fill("g30")].join(", ");
      return tree("doc-kit-harden-dup-", {
        "package.json": JSON.stringify({ dependencies: { "vue-router": "4.0.0" } }),
        "src/router/index.ts": `export const kidRoutes = [{ path: 'x', component: X, beforeEnter: [${guards}] }];\nconst routes = [{ path: '/a', component: A, children: [${"...kidRoutes, ".repeat(k)}] }];\n`,
      });
    };
    // The growth of this read is measured in stacks-growth.test.mjs; here, what it gives stays bounded.
    const large = app(2000, 24000);
    try {
      const screens = collectScreens(large);
      assert.ok(screens.length >= 1 && screens.every((x) => !x.guards || x.guards.length <= MAX_GUARDS));
    } finally {
      fs.rmSync(large, { recursive: true, force: true });
    }
    // withGuards reads a bounded part of a list: the entries it looks at are counted, whatever the list's length.
    const readsOf = (length) => {
      let reads = 0;
      const copies = new Proxy(Array(length).fill("b"), {
        get: (target, key) => {
          if (typeof key === "string" && /^\d+$/.test(key)) reads++;
          return target[key];
        },
      });
      assert.deepEqual(withGuards(["a"], copies), ["a", "b"]);
      return reads;
    };
    assert.equal(readsOf(100_000), readsOf(1_000), "the entries read do not depend on the length of the list");
    assert.ok(readsOf(100_000) > 0 && readsOf(100_000) <= 5 * MAX_GUARDS, "and they are few");
  });

  test("a project's adapter is never overruled by the kit's on the same line; the bounds hold for it too", () => {
    const app = tree("doc-kit-harden-local-", {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0" } }),
      "server.js": 'app.get("/a", h);\n',
    });
    const acme = {
      name: "acme-routes",
      files: /server\.js$/,
      api: () => [{ method: "GET", route: "/a", file: "server.js", line: 1, guards: ["acmeSession"] }],
    };
    const big = {
      name: "big",
      files: /server\.js$/,
      api: () =>
        Array.from({ length: 6000 }, (_, i) => ({
          method: "GET",
          route: `/r${i}`,
          file: "server.js",
          line: 2,
          guards: Array.from({ length: 50 }, (_, g) => `g${g}`),
        })),
    };
    try {
      assert.deepEqual(
        collectApi(app, {}, [...BUILT_IN_STACKS, acme])
          .map((r) => `${r.framework} ${r.route} ${r.guards.join(",")}`)
          .sort(),
        ["acme-routes /a acmeSession", "express /a "],
      );
      const items = collectApi(app, {}, [big]);
      assert.equal(items.length, MAX_ITEMS);
      assert.ok(items.every((i) => i.guards.length === MAX_GUARDS));
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("Rust: a handler and a configure function by their module path; two of one name are never guessed", () => {
    const app = tree("doc-kit-harden-rust-", {
      "src/users.rs":
        '#[get("/")]\nasync fn index() -> impl Responder { "" }\npub fn config(cfg: &mut web::ServiceConfig) { cfg.service(web::resource("/me").route(web::get().to(me))); }\n',
      "src/orders.rs":
        '#[get("/")]\nasync fn index() -> impl Responder { "" }\npub fn config(cfg: &mut web::ServiceConfig) { cfg.service(web::resource("/mine").route(web::get().to(mine))); }\n',
      "src/main.rs":
        'fn main() {\n  App::new()\n    .service(web::scope("/users").service(users::index).configure(users::config))\n    .service(web::scope("/orders").wrap(bearer).service(orders::index).configure(orders::config));\n}\n',
    });
    try {
      const items = collectApi(app);
      const of = (file) => items.filter((i) => i.file === file).map((i) => `${i.route} ${i.guards.join(",")}`);
      assert.ok(
        of("src/orders.rs").every((r) => r.startsWith("/orders") && r.endsWith("bearer")),
        JSON.stringify(of("src/orders.rs")),
      );
      assert.ok(
        of("src/users.rs").every((r) => r.startsWith("/users") && !r.includes("bearer")),
        JSON.stringify(of("src/users.rs")),
      );
      assert.equal(of("src/orders.rs").length, 2);
      assert.equal(of("src/users.rs").length, 2);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a route's readable segment is kept, a token's masked", () => {
    for (const route of [
      "/api/v3/WorkOrders2024Q3Summary",
      "/api/GetUserProfileByIdV2",
      "/api/v1/oauth2callback",
      "/files/{fileId}",
    ])
      assert.equal(routeWithoutSecrets(route), route);
    assert.equal(routeWithoutSecrets("/hooks/Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0"), "/hooks/…");
  });

  test('Spring: a Java text block holding \\""", an empty Kotlin raw string, a Kotlin constructor on its own line keep the controller', () => {
    const routes = (file, text) =>
      spring.api({ sources: new Map([[file, text]]) }).map((r) => `${r.method} ${r.route}`);
    const java = [
      "@RestController",
      '@RequestMapping("/a")',
      "class A {",
      '  String doc = """',
      '    a \\""" b',
      '    """;',
      '  @GetMapping("/x")',
      "  String x() { return null; }",
      "}",
    ].join("\n");
    assert.deepEqual(routes("A.java", java), ["GET /a/x"]);
    const kotlin = [
      "@RestController",
      '@RequestMapping("/k")',
      "class K",
      "@Autowired constructor(private val s: S) {",
      '  val empty = """"""',
      '  @GetMapping("/y")',
      "  fun y(): String = s.y()",
      "}",
    ].join("\n");
    assert.deepEqual(routes("K.kt", kotlin), ["GET /k/y"]);
  });
});

describe("the third review of the thirteen stacks", () => {
  /** A seeded generator (mulberry32): the same tokens on every run. */
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  test("a random token in a route is masked (2,000 of each shape, a known key always); words and parameters are kept", () => {
    const random = seeded(2026);
    const token = (alphabet, n) =>
      Array.from({ length: n }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = upper.toLowerCase();
    const digits = "0123456789";
    const shapes = [
      ["base62, 40", () => token(upper + lower + digits, 40), 2],
      ["base64url, 32", () => token(upper + lower + digits + "-_", 32), 2],
      ["a-z0-9, 32", () => token(lower + digits, 32), 2],
      ["hex, 40", () => token("0123456789abcdef", 40), 0],
      ["a Stripe secret key", () => "sk_" + "live_" + token(upper + lower + digits, 24), 0],
    ];
    for (const [name, make, allowed] of shapes) {
      let kept = 0;
      for (let i = 0; i < 2000; i++) if (routeWithoutSecrets(`/hooks/${make()}`) !== "/hooks/…") kept++;
      assert.ok(kept <= allowed, `${name}: ${kept} of 2,000 kept`);
    }
    for (const route of [
      "/blog/my-long-readable-article-title-2024",
      "/news/release-notes-2024-10-17",
      "/api/GetHTTPResponseCodesV2",
      "/api/customer-subscriptions-by-region",
      "/{someVeryLongParameterName}",
      "/^orders/(?P<order_id>[0-9]+)/items",
    ])
      assert.equal(routeWithoutSecrets(route), route);
  });

  test("the secret detectors find a Stripe secret key and a webhook secret", () => {
    const cloud = GENERIC.find((d) => d.kind === "cloudKey");
    for (const key of [
      "sk_" + "live_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd",
      "rk_" + "test_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd",
      "whsec_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9s",
    ]) {
      cloud.re.lastIndex = 0;
      assert.ok(cloud.re.test(`key = "${key}"`), key.slice(0, 8));
    }
  });

  test("a project's adapter named like one of the kit's is refused (stacks.name)", async () => {
    const root = tree("doc-kit-harden-name-", {
      "adapters/x.mjs": "export default { name: 'express', files: /x/, api: () => [] };\n",
    });
    try {
      await assert.rejects(
        loadStacks(root, { stacks: { adapters: ["local:adapters/x.mjs"] } }),
        (e) => e.key === "stacks.name",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("Rust: a handler two modules of one name could be is never given bare (no route without its scope's guards)", () => {
    const handler = '#[get("/")]\nasync fn index() -> impl Responder { "" }\n';
    const app = tree("doc-kit-harden-rust2-", {
      "src/a/handlers.rs": handler,
      "src/b/handlers.rs": handler,
      "src/main.rs":
        'fn main() {\n  App::new().service(web::scope("/orders").wrap(Auth).service(handlers::index));\n}\n',
    });
    try {
      assert.ok(
        !collectApi(app).some((i) => i.route === "/" && i.guards.length === 0),
        JSON.stringify(collectApi(app)),
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("brackets nested far deeper than routes are counted, not built (an Angular route table; its growth: stacks-growth.test.mjs)", () => {
    const angular = BUILT_IN_STACKS.find((a) => a.name === "angular");
    const sources = new Map([
      ["src/app.routes.ts", "const routes: Routes = [{ path: 'a', component: A, canActivate: [" + "{".repeat(48_000)],
    ]);
    assert.doesNotThrow(() => angular.screens({ sources }));
  });
});

describe("the fourth review of the thirteen stacks", () => {
  test("readable route segments are kept: numeronyms, short words between separators, a date, a colon, accents", () => {
    for (const seg of [
      "k8s-cluster-node-pools",
      "i18n-translation-bundles",
      "e2e-test-fixtures-cleanup",
      "a11y-accessibility-statement",
      "x509-certificate-chains",
      "documents:batchGetDocuments",
      "how-to-set-up-a-new-account",
      "faq-and-terms-of-use",
      "getUserByIdAndTenantById",
      "catégories-de-produits",
      "20240115-backup-snapshot",
      "SAMLAssertionConsumerService",
      "OAuth2PKCEAuthorizationFlow",
      "AzureADB2CUserFlows",
    ])
      assert.equal(routeWithoutSecrets(`/api/${seg}`), `/api/${seg}`, seg);
  });

  test("Rust: a handler a file brings in with use is its module's; one that stays ambiguous is given under its registration", () => {
    const handler = '#[get("/")]\nasync fn index() -> impl Responder { "" }\n';
    const app = tree("doc-kit-harden-rust3-", {
      "src/orders.rs": handler,
      "src/users.rs": handler,
      "src/a/handlers.rs": '#[get("/list")]\nasync fn show() -> impl Responder { "" }\n',
      "src/b/handlers.rs": '#[get("/list")]\nasync fn show() -> impl Responder { "" }\n',
      "src/main.rs": [
        "use crate::orders::index;",
        "fn main() {",
        '  App::new().service(web::scope("/orders").wrap(Auth).service(index))',
        '    .service(web::scope("/reports").wrap(Auth).service(handlers::show));',
        "}",
      ].join("\n"),
    });
    try {
      const items = collectApi(app);
      const orders = items.find((i) => i.file === "src/orders.rs");
      assert.ok(orders && orders.route.startsWith("/orders") && orders.guards.includes("Auth"), JSON.stringify(items));
      const reports = items.filter((i) => i.route.startsWith("/reports"));
      assert.ok(reports.length >= 1 && reports.every((i) => i.guards.includes("Auth")), JSON.stringify(items));
      // users.rs registers nowhere: its route stays bare; the registered ones are never bare.
      const registered = items.filter((i) => i.file !== "src/users.rs");
      assert.ok(
        registered.every((i) => i.guards.includes("Auth")),
        JSON.stringify(items),
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});
