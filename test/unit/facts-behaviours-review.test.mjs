// The behaviours source and the code of a feature sheet, against what their review found (ARCHITECTURE.md §6.9,
// §6.10, §6.11): never a secret kept, every reader linear, a malformed document never stopping the run, comment
// markers inside strings, the cards of a feature from its own files, its sources confined to the application, its
// dependencies and the vias sync trusts, and inventory --features writing the kinds.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import {
  createSink,
  jsCommentRanges,
  pyCommentRanges,
  htmlCommentRanges,
} from "../../engine/facts/behaviour-common.mjs";
import { jsBehaviours } from "../../engine/facts/behaviour-js.mjs";
import { sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { pyBehaviours } from "../../engine/facts/behaviour-py.mjs";
import { schemaBehaviours } from "../../engine/facts/behaviour-schemas.mjs";
import { openapiBehaviours } from "../../engine/facts/openapi.mjs";
import { fastapiRoutes } from "../../engine/facts/api.mjs";
import { featuresFileOf } from "../../engine/core/features.mjs";
import { behaviourRegistry } from "../../engine/core/behaviours.mjs";
import { safeSources } from "../../engine/sync/feature-files.mjs";
import { DIRECT_VIAS } from "../../engine/sync/report.mjs";
import { pageDependencies } from "../../engine/sync/dependencies.mjs";
import { behaviourParts } from "../../engine/context/behaviours-section.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { readToc } from "../../engine/project/toc.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

/** Whether an item has every field of `partial`. */
const has = (list, partial) =>
  list.some((it) => Object.entries(partial).every(([k, v]) => JSON.stringify(it[k]) === JSON.stringify(v)));

/** The signals of one text, through the sink of a file whose comments are left out, by language. */
function read(text, language = "js", file = "x.js") {
  const sink = createSink(file, text, language === "py" ? pyCommentRanges(text) : jsCommentRanges(text));
  if (language === "js") jsBehaviours(text, sink);
  if (language === "py") pyBehaviours(text, sink);
  sqlBehaviours(text, sink);
  schemaBehaviours(text, language, sink);
  return sink.items;
}

describe("never a secret", () => {
  test("an AWS key shape or a short random-looking word as a value, a PIN as a word of the name: never kept", () => {
    const sink = createSink("x.ts", "", []);
    sink.push(
      {
        family: "values",
        signal: "enum",
        field: "Region",
        values: ["AK" + "IAJ7Q2X3ZK5L9MBN4P", "Tr0ub4dor3x", "Open"],
        via: "zod",
      },
      0,
    );
    sink.push({ family: "validation", signal: "default", field: "pinCode", value: 1234, via: "zod" }, 0);
    sink.push({ family: "validation", signal: "default", field: "user_pin", value: 1234, via: "zod" }, 0);
    sink.push({ family: "validation", signal: "default", field: "spinner", value: 3, via: "zod" }, 0);
    assert.deepEqual(
      sink.items.map((i) => i.values ?? i.value ?? null),
      [["Open"], null, null, 3],
    );
  });

  test("a default of a password, a key or a token is never kept, from zod, pydantic or OpenAPI", () => {
    const zod = read(
      'const S = z.object({ password: z.string().default("changeme"), apiKey: z.string().default("prod-master-key"), retries: z.number().default(3) });',
    );
    assert.ok(!zod.some((it) => typeof it.value === "string"), JSON.stringify(zod));
    assert.ok(has(zod, { field: "retries", signal: "default", value: 3 }));
    const py = read(
      'class Login(BaseModel):\n    admin_password: str = "letmein"\n    hint: str = Field("letmein", max_length=8)\n',
      "py",
      "x.py",
    );
    assert.ok(!py.some((it) => it.value === "letmein"), JSON.stringify(py));
    assert.ok(has(py, { field: "hint", signal: "max", value: 8 }));
    const body = { properties: { password: { type: "string", default: "changeme" } } };
    const doc = {
      paths: { "/login": { post: { requestBody: { content: { "application/json": { schema: body } } } } } },
    };
    const sink = createSink("openapi.json", "{}", []);
    openapiBehaviours(doc, "{}", sink);
    assert.ok(!sink.items.some((it) => "value" in it), JSON.stringify(sink.items));
  });

  test("a token-shaped string given as a column name is no field", () => {
    assert.ok(
      !read('knex("t").orderBy("gh' + 'p_16C7e42F292c6912E7710c838347Ae178B4a", "asc")').some((it) => it.field),
    );
  });
});

describe("linear on what a crafted file holds", () => {
  test("every reader stays linear on 200,000 characters built to make it backtrack (a quadratic one never ends)", () => {
    const n = 200_000;
    const shapes = [
      " ".repeat(n),
      "a".repeat(n),
      "a.".repeat(n / 2),
      "(".repeat(n),
      "/* ".repeat(n / 3),
      "<!--".repeat(n / 4),
      '"""'.repeat(n / 3),
      "select a from t " + "limit 1 ".repeat(n / 8),
      ".find(".repeat(n / 6),
      ".find(".repeat(2000) + "order:" + " ".repeat(n / 2) + ")".repeat(2000),
      "orderBy:" + " ".repeat(n),
      ".sort(" + " ".repeat(n),
      "a" + " ".repeat(n) + "x",
      "<select>".repeat(n / 8),
      "<input ".repeat(n / 7),
      "a__".repeat(n / 3),
      "class A(BaseModel):\n    a:" + " ".repeat(n) + "=" + "x".repeat(301),
      ".filter(".repeat(n / 8),
      "type A = '".repeat(n / 10),
      "enum A {".repeat(n / 8),
      "choices=[(".repeat(n / 10),
      "a: z.string(".repeat(n / 12),
      // Round 2 of the review: two blank runs side by side (fixed), and a generic tag.
      ".limit(" + " ".repeat(n),
      ".offset(" + " ".repeat(n),
      "schedule.every(" + " ".repeat(n),
      "type A = " + " ".repeat(n),
      "<Select<".repeat(n / 8),
    ];
    for (const text of shapes)
      for (const language of ["js", "py"]) {
        const start = Date.now();
        read(text, language, language === "py" ? "x.py" : "x.js");
        htmlCommentRanges(text);
        const ms = Date.now() - start;
        assert.ok(ms < 3000, `${language} ${JSON.stringify(text.slice(0, 30))}…: ${ms} ms`);
      }
  });

  test("fastapiRoutes: a long run of letters is read once (the router expression is anchored at a name)", () => {
    const start = Date.now();
    fastapiRoutes(new Map([["x.py", "a".repeat(200_000) + "!"]]));
    assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
  });

  test("an OpenAPI document: malformed, read as far as it goes; one schema used by every operation, stopped at the cap", () => {
    for (const doc of [
      { paths: { "/a": { get: { parameters: { name: "q" } } } } },
      { paths: { "/a": { parameters: 3, get: { requestBody: 1 } } } },
      { paths: [] },
      {
        components: { schemas: { A: { $ref: "#/components/schemas/A" } } },
        paths: {
          "/a": {
            post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/A" } } } } },
          },
        },
      },
    ])
      assert.doesNotThrow(() => openapiBehaviours(doc, JSON.stringify(doc), createSink("o.json", "{}", [])));
    const properties = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`p${i}`, { type: "string", maxLength: 9 }]),
    );
    const ref = { content: { "application/json": { schema: { $ref: "#/components/schemas/Big" } } } };
    const paths = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`/r${i}`, { post: { requestBody: ref } }]));
    const doc = { paths, components: { schemas: { Big: { properties } } } };
    const start = Date.now();
    const sink = createSink("o.json", "{}", []);
    openapiBehaviours(doc, JSON.stringify(doc), sink);
    assert.ok(Date.now() - start < 1000);
    assert.equal(sink.items.length, 300);
  });
});

describe("what is read as it is", () => {
  test("an apostrophe in a comment inside a call loses nothing; a generic tag does not hide the next fields", () => {
    const js =
      "const a = list.filter((o) => {\n  // don't show the archived ones\n  return o.status === s;\n});\nconst b = list.filter((o) => o.customer.toLowerCase().includes(q));\n";
    const items = read(js);
    assert.ok(has(items, { signal: "equals", field: "status" }));
    assert.ok(has(items, { signal: "contains", field: "customer" }));
    assert.ok(has(items, { signal: "caseInsensitive", field: "customer" }));
    const jsx = '<Select<string> name="kind" />\n<input name="email" required />\n<input name="qty" min="1" max="9" />';
    const fields = read(jsx, "js", "x.tsx");
    assert.ok(has(fields, { signal: "required", field: "email" }));
    assert.ok(has(fields, { signal: "max", field: "qty", value: 9 }));
  });

  test("an OpenAPI operation of 20,000 parameters pointing to one huge enum stops at the cap, at once", () => {
    const values = Array.from({ length: 20_000 }, (_, i) => `v${i}`);
    const parameters = Array.from({ length: 20_000 }, () => ({ $ref: "#/components/parameters/P" }));
    const doc = {
      paths: { "/a": { get: { parameters } } },
      components: { parameters: { P: { name: "status", in: "query", schema: { enum: values } } } },
    };
    const start = Date.now();
    const sink = createSink("o.json", "{}", []);
    openapiBehaviours(doc, JSON.stringify(doc), sink);
    assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
    assert.equal(sink.items.length, 300);
  });

  test("a comment marker inside a string is no comment; an HTML comment counts only in a template", () => {
    assert.deepEqual(jsCommentRanges('const a = "<!-- x"; // b\nc /* d */'), [
      [20, 24],
      [27, 34],
    ]);
    assert.deepEqual(jsCommentRanges('const t = "image/*"; o.a.includes(q); /* x */'), [[38, 45]]);
    assert.deepEqual(pyCommentRanges('s = "#1"  # real\nq = """ # not """'), [[10, 16]]);
    const dir = tempDir("doc-kit-behaviours-comments-");
    try {
      fs.writeFileSync(
        path.join(dir, "a.ts"),
        'const html = "<!--";\nconst shown = list.filter((o) => o.name.includes(q));\n',
      );
      fs.writeFileSync(
        path.join(dir, "b.ts"),
        'const accept = "image/*";\nconst shown = list.filter((o) => o.name.includes(q));\n/* end */\n',
      );
      const r = collectBehaviours(dir).items;
      assert.ok(has(r, { file: "a.ts", signal: "contains", field: "name" }));
      assert.ok(has(r, { file: "b.ts", signal: "contains", field: "name" }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a Django field over several lines read whole; an interval with its number; DRF's '-created' with its direction", () => {
    const form = read(
      "class F(forms.Form):\n    subject = forms.CharField(\n        max_length=100,\n        required=False,\n    )\n",
      "py",
      "f.py",
    );
    assert.ok(
      has(form, { field: "subject", signal: "optional" }) && !has(form, { field: "subject", signal: "required" }),
    );
    assert.ok(has(form, { field: "subject", signal: "max", value: 100 }));
    assert.ok(
      has(read("schedule.every(10).minutes.do(job)", "py", "j.py"), { signal: "interval", value: "10 minutes" }),
    );
    assert.ok(
      has(read('class V(ViewSet):\n    ordering = ["-created"]\n', "py", "v.py"), { values: ["created desc"] }),
    );
  });

  test("a field named type is a criterion; the OpenAPI and YAML documents of the tests are left out", () => {
    assert.ok(has(read("list.filter((o) => o.type === kind)"), { signal: "equals", field: "type" }));
    const dir = tempDir("doc-kit-behaviours-tests-");
    try {
      fs.mkdirSync(path.join(dir, "tests"));
      const doc = { paths: { "/a": { get: { parameters: [{ name: "q", in: "query" }] } } } };
      fs.writeFileSync(path.join(dir, "tests", "openapi.json"), JSON.stringify(doc));
      fs.writeFileSync(path.join(dir, "tests", "openapi.yaml"), "paths: {}");
      assert.deepEqual(collectBehaviours(dir), { items: [], unreadable: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the cap of 5,000 hints is told: the first file not read is listed", () => {
    const dir = tempDir("doc-kit-behaviours-cap-");
    try {
      for (let i = 0; i < 18; i++)
        fs.writeFileSync(
          path.join(dir, `f${String(i).padStart(2, "0")}.js`),
          "list.filter((o) => o.a.includes(q));\n".repeat(300),
        );
      const r = collectBehaviours(dir);
      assert.equal(r.items.length, 5000);
      assert.deepEqual(r.unreadable, [{ file: "f16.js", reason: "limit" }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the code of a feature sheet", () => {
  test("sources: never outside the application, never a folder, never a secret file", () => {
    const dir = tempDir("doc-kit-behaviours-sources-");
    try {
      fs.mkdirSync(path.join(dir, "app", "public"), { recursive: true });
      fs.writeFileSync(path.join(dir, "outside.env"), "SECRET=1");
      fs.writeFileSync(path.join(dir, "app", "public", "app.js"), "x");
      fs.writeFileSync(path.join(dir, "app", ".env"), "SECRET=1");
      fs.writeFileSync(path.join(dir, "app", "id_rsa"), "key");
      const glob = (p) => (p === "*" ? [".env", "id_rsa", "public"] : [p]);
      const patterns = ["../outside.env", "/etc/passwd", "C:/x", "public", "*", "public/app.js"];
      assert.deepEqual(safeSources(path.join(dir, "app"), patterns, glob), ["public/app.js"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sources: a link or a junction to a folder outside the application is left out", () => {
    const dir = tempDir("doc-kit-behaviours-link-");
    const app = path.join(dir, "app");
    const outside = path.join(dir, "outside");
    const linked = path.join(app, "linked");
    try {
      fs.mkdirSync(app, { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "notes.txt"), "OUTSIDE=1");
      fs.mkdirSync(path.join(app, "inside"));
      fs.writeFileSync(path.join(app, "inside", "ok.js"), "x");
      fs.symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
      assert.deepEqual(
        safeSources(app, ["linked/notes.txt", "inside/ok.js"], (p) => [p]),
        ["inside/ok.js"],
      );
    } finally {
      // The link first, on its own: removing the folder must never walk into what it points to.
      try {
        fs.unlinkSync(linked);
      } catch {
        try {
          fs.rmdirSync(linked);
        } catch {
          // not created
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sync trusts a feature's own code as direct, never its imports (DIRECT_VIAS)", () => {
    assert.ok(DIRECT_VIAS.includes("feature"));
    assert.ok(!DIRECT_VIAS.includes("feature-import"));
  });

  test("the features file is the one of the features coverage adapter", () => {
    const config = { coverage: [{ adapter: "features", file: "docs/features.json" }] };
    assert.equal(featuresFileOf(config), "docs/features.json");
    assert.equal(featuresFileOf({ coverage: [] }), "features.json");
  });

  test("the cards: from the page's own files; a declared kind in any spelling, an unknown one told", () => {
    const { registry } = behaviourRegistry();
    const t = createI18n({ language: "en" }).t;
    const deps = {
      routes: ["/orders"],
      files: [
        { path: "app/orders/page.tsx", kind: "direct", via: ["route"], lines: [] },
        { path: "app/layout.tsx", kind: "shared", via: ["layout"], lines: [] },
      ],
    };
    const items = [
      { family: "sort", signal: "orderBy", file: "app/orders/page.tsx", line: 3, field: "date", via: "orm" },
      { family: "search", signal: "contains", file: "app/layout.tsx", line: 9, field: "q", via: "array" },
      {
        family: "filter",
        signal: "param",
        file: "openapi.json",
        line: 5,
        field: "status",
        route: "GET /orders/{id}",
        via: "openapi",
      },
    ];
    const feature = { api: ["GET /orders/[id]"], behaviours: ["recherche", "serach"] };
    const parts = behaviourParts({ items, deps, sheet: true, feature, registry, language: "en", cutLine: "", t });
    assert.ok(parts.hints.text.includes("- `q`: contains — app/layout.tsx:9 (array, shared)"));
    assert.ok(
      parts.hints.text.includes("- `status`: param — openapi.json:5"),
      "whatever the spelling of its parameter",
    );
    assert.match(parts.cards.text, /\*\*Sort\*\*/);
    assert.match(parts.cards.text, /\*\*Filter\*\*/);
    // The Search card comes from features.json (written "recherche"), never from the layout's search box alone.
    assert.equal((parts.cards.text.match(/\*\*Search\*\*/g) || []).length, 1);
    assert.match(parts.cards.text, /“serach” \(the features file\): no kind of behaviour has this name/);
    const layoutOnly = behaviourParts({
      items: items.slice(1, 2),
      deps,
      sheet: true,
      registry,
      language: "en",
      cutLine: "",
      t,
    });
    assert.ok(!/\*\*Search\*\*/.test(layoutOnly.cards.text), "a layout's hint gives no card");
  });

  test("pageDependencies: its sources and the handlers of its API routes direct, what they import shared, the hints' lines", async () => {
    const base = tempDir("doc-kit-behaviours-deps-");
    try {
      fs.cpSync(path.join(KIT_ROOT, "examples", "demo-docs"), path.join(base, "demo-docs"), {
        recursive: true,
        filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src),
      });
      fs.cpSync(path.join(KIT_ROOT, "examples", "demo-app"), path.join(base, "demo-app"), { recursive: true });
      const docs = path.join(base, "demo-docs");
      const app = path.join(base, "demo-app");
      fs.mkdirSync(path.join(app, "server"));
      fs.writeFileSync(
        path.join(app, "server", "orders.js"),
        'const { find } = require("./store");\napp.get("/api/orders", (req, res) => res.json(find()));\n',
      );
      fs.writeFileSync(path.join(app, "server", "store.js"), "exports.find = () => [];\n");
      fs.writeFileSync(
        path.join(docs, "features.json"),
        JSON.stringify([{ id: "F-01", sources: ["public/app.js"], api: ["GET /api/orders"] }]),
      );
      const { config } = await loadProject({ project: docs });
      fs.mkdirSync(path.join(docs, config.paths.facts), { recursive: true });
      const api = { items: [{ method: "GET", route: "/api/orders", file: "server/orders.js", line: 2 }] };
      fs.writeFileSync(path.join(docs, config.paths.facts, "api.json"), JSON.stringify(api));
      const hints = collectBehaviours(app);
      fs.writeFileSync(path.join(docs, config.paths.facts, "behaviours.json"), JSON.stringify(hints));
      const { toc } = readToc(docs, config.paths.content);
      const deps = await pageDependencies({
        root: docs,
        config,
        toc,
        pageId: "features/track-orders",
        inventory: { adapters: [] },
        tools: {},
        factsDir: config.paths.facts,
      });
      const by = Object.fromEntries(deps.files.map((f) => [f.path, f]));
      assert.equal(by["public/app.js"].kind, "direct");
      assert.deepEqual(by["server/orders.js"], {
        path: "server/orders.js",
        kind: "direct",
        via: ["feature"],
        lines: [[2, 2]],
      });
      assert.deepEqual(by["server/store.js"].via, ["feature-import"]);
      assert.equal(by["server/store.js"].kind, "shared");
      assert.ok(
        by["public/app.js"].lines.some(([a]) => a === 26),
        "the line of a hint",
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("inventory --features --write: the kinds deduced are written with each candidate", async () => {
    const dir = tempDir("doc-kit-behaviours-inventory-");
    try {
      fs.writeFileSync(
        path.join(dir, "doc.config.mjs"),
        'export default { product: { name: "Acme" }, language: "en", app: { url: "http://x" }, auth: { adapter: "none" }, coverage: [{ adapter: "local:routes.mjs" }] };',
      );
      fs.writeFileSync(
        path.join(dir, "routes.mjs"),
        'export default { name: "routes", options: {}, async inventory() { return { available: true, families: [{ name: "Routes", items: [{ id: "/orders" }] }] }; } };',
      );
      fs.mkdirSync(path.join(dir, "content"));
      const toc = { title: "T", sections: [{ id: "s", title: "S", groups: [{ pages: [{ id: "s/p", title: "P" }] }] }] };
      fs.writeFileSync(path.join(dir, "content/toc.json"), JSON.stringify(toc));
      fs.mkdirSync(path.join(dir, "facts"));
      const hint = { family: "search", signal: "contains", file: "app/orders/page.tsx", line: 1, via: "array" };
      fs.writeFileSync(path.join(dir, "facts", "behaviours.json"), JSON.stringify({ items: [hint] }));
      const io = { stdout: { write() {} }, stderr: { write() {} }, env: {} };
      assert.equal(await runCli(["inventory", "--features", "--write", "--project", dir], io), 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "features.json"), "utf8")), [
        { id: "F-01", title: "Orders", routes: ["/orders"], behaviours: ["search"] },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
