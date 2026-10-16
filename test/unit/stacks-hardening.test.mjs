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
import { loadStacks, stackSources } from "../../engine/facts/stacks.mjs";
import { collectApi, collectScreens } from "../../engine/facts/api.mjs";
import { isTestFile } from "../../engine/facts/code-files.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import next from "../../adapters/stack/next.mjs";

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
      assert.equal(byName["npm:x"].version, "git+https://github.com/a/b.git");
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

  test("a Gemfile of blocks never closed is read in linear time (each gem in them)", () => {
    const app = tree("doc-kit-harden-gem-", {});
    try {
      for (const unit of ['group :test do\n  gem "a"\n', 'if x\ngem "a"\n']) {
        fs.writeFileSync(path.join(app, "Gemfile"), unit.repeat(Math.ceil(512_000 / unit.length)));
        const start = performance.now();
        const items = collectDependencies(app);
        const ms = performance.now() - start;
        assert.ok(ms < 1000, `${JSON.stringify(unit)}: ${ms.toFixed(0)} ms`);
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
