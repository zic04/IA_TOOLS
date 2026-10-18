// The stack adapters and what the kit reads of an application (ARCHITECTURE.md §5, §6.9): the registry
// (standard/adapters.json) against the adapters' files, the detection of a stack, the compatibility matrix of the
// documentation, the project's own stack adapters, and the sources `api`, `screens` and `stack` they feed — with
// what is told of the code the kit does not read (inputs status, the context of a page).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { loadAdapters, adaptersOf, languageOf, detectedBy } from "../../engine/core/adapters.mjs";
import { BUILT_IN_STACKS, loadStacks } from "../../engine/facts/stacks.mjs";
import { collectApi, collectScreens } from "../../engine/facts/api.mjs";
import { collectStack } from "../../engine/facts/languages.mjs";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import { expressRoutes, EXPRESS_PATTERNS } from "../../adapters/stack/express.mjs";
import { fastapiRoutes, FASTAPI_PATTERNS } from "../../adapters/stack/fastapi.mjs";
import { nextRouteHandlers, NEXT_PATTERNS } from "../../adapters/stack/next.mjs";
import { unreadPart } from "../../engine/context/unread-section.mjs";
import factsAdapter from "../../adapters/coverage/facts.mjs";
import { adapterTools } from "../../engine/check/coverage.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { matrixPages } from "../tools/adapters-matrix.mjs";

/** Writes files (relative path → text) under a new temporary folder; returns it. */
function tree(prefix, files) {
  const dir = tempDir(prefix);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

/** A stack adapter of a test: the GET routes of `@GetMapping("…")` in .java files, guarded by `hasRole`. */
const JAVA_ROUTES = `export default {
  name: "java-routes",
  files: /\\.java$/,
  languages: ["java"],
  api({ sources }) {
    const items = [];
    for (const [file, text] of sources) {
      const m = /@GetMapping\\("([^"]{0,200})"\\)/.exec(text);
      if (m) items.push({ method: "GET", route: m[1], file, line: 1, guards: ["hasRole"] });
    }
    return items;
  },
};
`;

describe("the registry (standard/adapters.json)", () => {
  test("every adapter file of the kit has its entry, and every entry of a loaded family its file", () => {
    for (const family of ["stack", "coverage", "auth"]) {
      const files = fs
        .readdirSync(path.join(KIT_ROOT, "adapters", family))
        .filter((f) => f.endsWith(".mjs"))
        .map((f) => f.slice(0, -4))
        .sort();
      assert.deepEqual(
        adaptersOf(family)
          .map((a) => a.id)
          .sort(),
        files,
        family,
      );
    }
    assert.deepEqual(
      BUILT_IN_STACKS.map((a) => a.name),
      adaptersOf("stack").map((a) => a.id),
      "BUILT_IN_STACKS follows the registry's order",
    );
  });

  test("every adapter of the kit declares its expressions for the ReDoS harness (one *_PATTERNS of frozen RegExps)", async () => {
    for (const patterns of [NEXT_PATTERNS, EXPRESS_PATTERNS, FASTAPI_PATTERNS])
      assert.ok(Object.isFrozen(patterns) && Object.values(patterns).every((re) => re instanceof RegExp));
    for (const adapter of BUILT_IN_STACKS) {
      const mod = await import(`../../adapters/stack/${adapter.name}.mjs`);
      const declared = Object.keys(mod).filter((k) => k.endsWith("_PATTERNS"));
      assert.equal(declared.length, 1, `${adapter.name}: ${declared.join(", ")}`);
      const patterns = mod[declared[0]];
      assert.ok(Object.isFrozen(patterns) && Object.values(patterns).every((re) => re instanceof RegExp), adapter.name);
    }
  });

  test("a language by its extension, whatever its case; a file of no known language is none", () => {
    assert.equal(languageOf("src/App.TSX").id, "typescript");
    assert.equal(languageOf("api/Orders.java").id, "java");
    assert.equal(languageOf("Makefile"), null);
    assert.equal(languageOf(".env"), null);
    const ids = loadAdapters().languages.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("detection: a dependency by ecosystem and name (* for any characters), a file by its glob; three of each", () => {
    const entry = {
      id: "x",
      family: "stack",
      title: "X",
      detect: { dependencies: ["maven:org.springframework*"], files: ["**/*.msapp"] },
    };
    const dependencies = [
      { ecosystem: "maven", name: "org.springframework.boot:spring-boot-starter-web" },
      { ecosystem: "npm", name: "org.springframework.boot" },
      { ecosystem: "maven", name: "org.springframework:spring-core" },
    ];
    const files = ["a/one.msapp", "b/two.msapp", "c/three.msapp", "d/four.msapp", "e/app.ts"];
    assert.deepEqual(detectedBy(entry, { dependencies, files }), [
      "maven:org.springframework.boot:spring-boot-starter-web",
      "maven:org.springframework:spring-core",
      "a/one.msapp",
      "b/two.msapp",
      "c/three.msapp",
    ]);
    assert.deepEqual(detectedBy(entry, { dependencies: [], files: ["app.ts"] }), []);
  });

  test("the compatibility matrix of the documentation is up to date (node test/tools/adapters-matrix.mjs --write)", () => {
    for (const page of matrixPages()) assert.equal(page.current, page.expected, page.file);
  });
});

describe("the project's own stack adapters (config.stacks)", () => {
  test("disabled: the kit's adapter is not run; adapters: a local one is loaded after the kit's", async () => {
    const root = tree("doc-kit-stacks-root-", { "adapters/java-routes.mjs": JAVA_ROUTES });
    try {
      const stacks = await loadStacks(root, {
        stacks: { disabled: ["express"], adapters: ["local:adapters/java-routes.mjs"] },
      });
      assert.deepEqual(
        stacks.map((a) => a.name),
        [...BUILT_IN_STACKS.map((a) => a.name).filter((n) => n !== "express"), "java-routes"],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a local adapter outside the documentation project (the application's folder) is refused before it is loaded", async () => {
    const dir = tree("doc-kit-stacks-outside-", {
      "docs/doc.config.mjs": "export default {};\n",
      "app/evil.mjs":
        "globalThis.__docKitStackRan = true;\nexport default { name: 'evil', files: /x/, api: () => [] };\n",
    });
    try {
      const root = path.join(dir, "docs");
      await assert.rejects(
        loadStacks(root, { stacks: { adapters: ["local:../app/evil.mjs"] } }),
        (e) => e.key === "stacks.outside",
      );
      assert.equal(globalThis.__docKitStackRan, undefined, "the file was never imported");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a local adapter without `files` or without api, screens or behaviours is refused (adapter.invalid)", async () => {
    const root = tree("doc-kit-stacks-bad-", {
      "adapters/no-files.mjs": "export default { name: 'x', api: () => [] };\n",
      "adapters/no-hook.mjs": "export default { name: 'y', files: /x/ };\n",
    });
    try {
      for (const spec of ["local:adapters/no-files.mjs", "local:adapters/no-hook.mjs"])
        await assert.rejects(loadStacks(root, { stacks: { adapters: [spec] } }), (e) => e.key === "adapter.invalid");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("doc-kit facts: the routes of a local adapter in api.json (auth from its guards), its language read in stack.json", async () => {
    const dir = tree("doc-kit-stacks-cli-", {
      "doc.config.mjs":
        'export default { product: { name: "Shop" }, app: { dir: "app" }, stacks: { adapters: ["local:adapters/java-routes.mjs"] } };\n',
      "content/toc.json": JSON.stringify({ title: "Shop", sections: [] }),
      "adapters/java-routes.mjs": JAVA_ROUTES,
      "app/src/Orders.java": 'class Orders {\n  @GetMapping("/orders")\n  List<Order> all() { return null; }\n}\n',
      "app/src/test/OrdersTest.java": '@GetMapping("/never")\n',
    });
    try {
      let out = "";
      let err = "";
      const code = await runCli(["facts", "--source", "api", "--source", "stack", "--project", dir], {
        stdout: { write: (s) => (out += s) },
        stderr: { write: (s) => (err += s) },
        env: { DOC_KIT_NO_BROWSER: "1" },
        commit: () => null,
        exec: () => null,
      });
      assert.equal(code, 0, err + out);
      const api = JSON.parse(fs.readFileSync(path.join(dir, "facts", "api.json"), "utf8"));
      assert.deepEqual(api.items, [
        {
          method: "GET",
          route: "/orders",
          file: "src/Orders.java",
          line: 1,
          framework: "java-routes",
          auth: "role",
          guards: ["hasRole"],
        },
      ]);
      const stack = JSON.parse(fs.readFileSync(path.join(dir, "facts", "stack.json"), "utf8"));
      assert.deepEqual(stack.items, [{ language: "java", files: 1, lines: 4, read: true, by: ["java-routes"] }]);
      assert.deepEqual(stack.stacks, [
        { id: "java-routes", family: "stack", title: "java-routes", evidence: ["config.stacks"] },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the sources the stack adapters feed", () => {
  test("stack: the stacks and platforms found, each language measured and whether the kit reads it here", () => {
    const app = tree("doc-kit-stacks-app-", {
      "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
      "app/page.tsx": "export default function Home() {\n  return null;\n}\n",
      "server/Report.java": "class Report {}\n",
      "power/Orders.msapp": "PK",
      "tests/home.test.tsx": "never counted\n",
    });
    try {
      const { items, extra } = collectStack(app);
      assert.deepEqual(items, [
        { language: "typescript", files: 1, lines: 3, read: true, by: ["core", "next"] },
        { language: "java", files: 1, lines: 1, read: false, by: [] },
      ]);
      assert.deepEqual(
        extra.stacks.map((s) => `${s.family}:${s.id}:${s.evidence[0]}`),
        ["stack:next:npm:next", "lowcode:power-apps:power/Orders.msapp"],
      );
      assert.deepEqual(extra.summary, { files: 2, lines: 4, readLines: 3, share: 75 });
      // A kit adapter that is disabled reads nothing: its languages are read by the kit's own readers only.
      assert.deepEqual(collectStack(app, []).items[0], {
        language: "typescript",
        files: 1,
        lines: 3,
        read: true,
        by: ["core"],
      });
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("screens: the App Router's pages and the Pages Router's, their API, shell and error pages left out; no claimed access", () => {
    const app = tree("doc-kit-stacks-screens-", {
      "app/orders/[id]/page.tsx": "export default function P() {}\n",
      "app/(shop)/cart/page.tsx": "export default function P() {}\n",
      "app/_private/page.tsx": "export default function P() {}\n",
      "pages/about.tsx": "export default function P() {}\n",
      "pages/index.tsx": "export default function P() {}\n",
      "pages/_app.tsx": "export default function App() {}\n",
      "pages/404.tsx": "export default function P() {}\n",
      "pages/api/health.ts": "export default function h() {}\n",
    });
    try {
      assert.deepEqual(collectScreens(app), [
        { route: "/", file: "pages/index.tsx", line: 1, framework: "next-pages" },
        { route: "/about", file: "pages/about.tsx", line: 1, framework: "next-pages" },
        { route: "/cart", file: "app/(shop)/cart/page.tsx", line: 1, framework: "next-app-router" },
        { route: "/orders/[id]", file: "app/orders/[id]/page.tsx", line: 1, framework: "next-app-router" },
      ]);
      const guarded = {
        name: "router",
        files: /\.ts$/,
        screens: () => [{ route: "/admin", file: "r.ts", line: 3, guards: ["isAdmin"] }],
      };
      assert.deepEqual(collectScreens(tree("doc-kit-stacks-r-", { "r.ts": "x" }), {}, [guarded]), [
        { route: "/admin", file: "r.ts", line: 3, framework: "router", auth: "role", guards: ["isAdmin"] },
      ]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("api: an Express handler longer than a call's window keeps its path and middleware; a test file is never read", () => {
    const body = "  res.json(1);\n".repeat(400);
    const source = `router.post("/orders", requireAuth, async (req, res) => {\n${body}});\nrouter.get("/health", h);\n`;
    assert.deepEqual(
      expressRoutes(source, "x.js").map((r) => `${r.method} ${r.route} ${r.guards.join(",")}`),
      ["POST /orders requireAuth", "GET /health "],
    );
    const app = tree("doc-kit-stacks-express-", {
      "server.js": 'app.get("/a", h);\n',
      "server.test.js": 'app.get("/never", h);\n',
    });
    try {
      assert.deepEqual(
        collectApi(app).map((r) => `${r.method} ${r.route} ${r.framework}`),
        ["GET /a express"],
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a crafted file of 256 KB is read at once: 32,000 unclosed route calls, decorators, exports (0.3 took minutes)", () => {
    const n = 32_000;
    const cases = [
      ["express, unclosed calls", () => expressRoutes("app.get(".repeat(n), "x.js")],
      ["express, routes", () => expressRoutes('app.get("/a", h);\n'.repeat(n), "x.js")],
      ["fastapi, decorators", () => fastapiRoutes(new Map([["x.py", '@router.get("/a")\n'.repeat(n)]]))],
      ["fastapi, unclosed routers", () => fastapiRoutes(new Map([["x.py", "r = APIRouter(".repeat(n / 2)]]))],
      ["next, exports", () => nextRouteHandlers("export function GET(".repeat(n / 2))],
    ];
    for (const [name, run] of cases) {
      const start = performance.now();
      run();
      const ms = performance.now() - start;
      assert.ok(ms < 1000, `${name}: ${ms.toFixed(0)} ms`);
    }
  });

  test("behaviours: a stack adapter reads the hints of its files, outside their comments", () => {
    const adapter = {
      name: "java-hints",
      files: /\.java$/,
      behaviours(text, sink) {
        for (const m of text.matchAll(/findBy(\w{1,40})Containing/g))
          sink.push({ family: "search", signal: "contains", field: m[1].toLowerCase(), via: "spring-data" }, m.index);
      },
    };
    const app = tree("doc-kit-stacks-hints-", {
      "Repo.java":
        "interface Repo {\n  // findByLegacyContaining(q)\n  List<O> findByCustomerContaining(String q);\n}\n",
    });
    try {
      assert.deepEqual(collectBehaviours(app, [adapter]).items, [
        { family: "search", signal: "contains", file: "Repo.java", line: 3, field: "customer", via: "spring-data" },
      ]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("the facts coverage adapter cites the screens, and gives the files of api and screens items", async () => {
    const root = tree("doc-kit-stacks-cov-", {
      "facts/screens.json": JSON.stringify({
        source: "screens",
        app: "../app",
        items: [{ route: "/orders/[id]", file: "app/orders/[id]/page.tsx", line: 1 }],
      }),
    });
    try {
      const result = await factsAdapter.inventory({
        options: { source: "screens", dir: "facts", exclude: [] },
        tools: adapterTools(root),
      });
      const [item] = result.families[0].items;
      assert.equal(result.families[0].name, "Screens");
      assert.equal(item.id, "/orders/[id]");
      assert.ok(item.match.includes("/orders/:id"));
      assert.deepEqual(item.files, ["../app/app/orders/[id]/page.tsx"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("what is told of the code the kit does not read", () => {
  const t = createI18n({ language: "en" }).t;
  const items = [
    { language: "typescript", files: 4, lines: 600, read: true, by: ["core"] },
    { language: "java", files: 3, lines: 300, read: false, by: [] },
    { language: "kotlin", files: 1, lines: 100, read: false, by: [] },
  ];

  test("the context: the languages not read with their part, and the page's files in them", () => {
    const text = unreadPart({ items, files: ["src/Orders.java", "web/app.ts"], t });
    assert.match(text, /^## Code the kit does not read\n/);
    assert.match(text, /does not read the Java, Kotlin code of this application \(40 % of the lines of code\)/);
    assert.match(text, /- src\/Orders\.java\n$/);
    assert.doesNotMatch(text, /web\/app\.ts/);
    assert.equal(unreadPart({ items: [items[0]], files: [], t }), "");
  });

  test("inputs status: the part read, each language, the stacks and the low-code platforms (text and --json)", async () => {
    const dir = tree("doc-kit-stacks-status-", {
      "doc.config.mjs": 'export default { product: { name: "Shop" } };\n',
      "content/toc.json": JSON.stringify({ title: "Shop", sections: [] }),
      "facts/stack.json": JSON.stringify({
        source: "stack",
        stacks: [
          { id: "next", family: "stack", title: "Next.js", evidence: ["npm:next"] },
          { id: "power-apps", family: "lowcode", title: "Power Apps", evidence: ["app/Orders.msapp"] },
        ],
        summary: { files: 8, lines: 1000, readLines: 600, share: 60 },
        items,
      }),
    });
    const cli = async (args) => {
      let out = "";
      await runCli([...args, "--project", dir], {
        stdout: { write: (s) => (out += s) },
        stderr: { write: () => {} },
        env: {},
        commit: () => null,
        exec: () => null,
      });
      return out;
    };
    try {
      const out = await cli(["inputs"]);
      assert.match(out, /What the kit reads of the code \(facts\/stack\.json\)/);
      assert.match(out, /60 % of 1000 lines of code read by the kit/);
      assert.match(out, /✔ typescript — 600 lines, read \(core\)/);
      assert.match(out, /⚠ java — 300 lines, not read: the agents read it themselves/);
      assert.match(out, /Stacks found: Next\.js \(npm:next\)/);
      assert.match(out, /⚠ Power Apps \(app\/Orders\.msapp\): a low-code platform the kit does not read/);
      const json = JSON.parse(await cli(["inputs", "status", "--json"]));
      assert.equal(json.reading.summary.share, 60);
      fs.rmSync(path.join(dir, "facts", "stack.json"));
      assert.match(await cli(["inputs"]), /→ doc-kit facts --source stack: measure what the kit reads of the code/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
