// `behaviours` facts source (ARCHITECTURE.md §6.9) and the context of a feature sheet (§6.8a, §6.10, §6.11): the
// hints read in the code of every stack of test/fixtures/apps/behaviours-app (Next.js and Prisma, zod, Express and
// Knex, SQL, Django and DRF, FastAPI and SQLAlchemy, pydantic, OpenAPI), what is never read (tests, comments, YAML,
// large files) or kept (a random-looking value, a sentence that looks like SQL), the code of a feature sheet in
// features.json, its "Behaviours to describe" in the context, and the kinds inventory --features suggests.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import { safeValue, safeValues, safeField, createSink, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import { readFeatures } from "../../engine/core/features.mjs";
import { adapterTools } from "../../engine/core/project-tools.mjs";
import { kindsOfHints } from "../../engine/core/behaviours.mjs";
import { apiHandlers, behaviourLines, candidateKinds } from "../../engine/sync/feature-files.mjs";
import { candidateFeatures, mergeFeatures } from "../../cli/commands/inventory.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const APP = path.join(KIT_ROOT, "test", "fixtures", "apps", "behaviours-app");
const { items, unreadable } = collectBehaviours(APP);

/** Whether an item has every field of `partial`. */
const has = (list, partial) =>
  list.some((it) => Object.entries(partial).every(([k, v]) => JSON.stringify(it[k]) === JSON.stringify(v)));
const assertHas = (partial) => assert.ok(has(items, partial), JSON.stringify(partial));

describe("the behaviours source on every stack of the fixture", () => {
  test("in the browser: an array search, case ignored, a delay, the events, a select's options, an input's minimum", () => {
    const page = { file: "app/orders/page.tsx" };
    assertHas({ ...page, family: "search", signal: "contains", field: "customer", via: "array", line: 10 });
    assertHas({ ...page, family: "search", signal: "caseInsensitive", field: "customer" });
    assertHas({ ...page, family: "trigger", signal: "debounce", value: 300 });
    assertHas({ ...page, family: "trigger", signal: "change", via: "jsx" });
    assertHas({ ...page, family: "trigger", signal: "submit", via: "jsx" });
    assertHas({ ...page, family: "values", signal: "options", field: "status", values: ["All", "Open", "Shipped"] });
    assertHas({ ...page, family: "validation", signal: "min", field: "q", value: 2 });
    assertHas({ ...page, family: "search", signal: "param", field: "q" });
  });

  test("Prisma: contains and insensitive, a filter in a list, the order, the page, the reader's own items", () => {
    const route = { file: "app/api/orders/route.ts", via: "orm" };
    assertHas({ ...route, family: "search", signal: "contains", field: "customer" });
    assertHas({ ...route, family: "search", signal: "caseInsensitive" });
    assertHas({ ...route, family: "filter", signal: "in", field: "status" });
    assertHas({ ...route, family: "sort", signal: "orderBy", field: "createdAt", value: "desc" });
    assertHas({ ...route, family: "pagination", signal: "limit", value: 20 });
    assertHas({ ...route, family: "pagination", signal: "offset" });
    assertHas({ file: "app/api/orders/route.ts", family: "scope", signal: "owner", field: "userId" });
    assertHas({ file: "app/api/orders/route.ts", family: "pagination", signal: "page", field: "page", via: "query" });
  });

  test("zod and TypeScript: required, bounds, email, optional and default, the values of an enum and of a union", () => {
    const f = { file: "lib/schemas.ts" };
    assertHas({ ...f, family: "validation", signal: "required", field: "name" });
    assertHas({ ...f, family: "validation", signal: "min", field: "name", value: 1 });
    assertHas({ ...f, family: "validation", signal: "max", field: "name", value: 80 });
    assertHas({ ...f, family: "validation", signal: "email", field: "email" });
    assertHas({ ...f, family: "validation", signal: "optional", field: "email" });
    assertHas({ ...f, family: "validation", signal: "default", field: "quantity", value: 1 });
    assertHas({ ...f, family: "values", signal: "enum", field: "status", values: ["Open", "Shipped", "Cancelled"] });
    assertHas({ ...f, family: "values", signal: "union", field: "Channel", values: ["web", "phone", "store"] });
    assertHas({ ...f, family: "values", signal: "enum", field: "Priority", values: ["LOW", "HIGH"] });
  });

  test("Express and Knex, SQL: the parameters, ILIKE, the order, the limit, an export, an email, a cron job, full text", () => {
    const e = { file: "server/express.js" };
    assertHas({ ...e, family: "pagination", signal: "pageSize", field: "pageSize" });
    assertHas({ ...e, family: "sort", signal: "param", field: "sort" });
    assertHas({ ...e, family: "search", signal: "contains", field: "name", via: "knex" });
    assertHas({ ...e, family: "search", signal: "caseInsensitive", field: "name", via: "knex" });
    assertHas({ ...e, family: "sort", signal: "orderBy", field: "name", value: "asc" });
    assertHas({ ...e, family: "pagination", signal: "limit", value: 50 });
    assertHas({ ...e, family: "export", signal: "csv" });
    assertHas({ ...e, family: "notification", signal: "email", value: "nodemailer" });
    assertHas({ ...e, family: "schedule", signal: "cron", value: "0 2 * * *" });
    const s = { file: "server/sql.ts", via: "sql" };
    assertHas({ ...s, family: "search", signal: "contains", field: "customer", line: 3 });
    assertHas({ ...s, family: "search", signal: "caseInsensitive", field: "customer" });
    assertHas({ ...s, family: "sort", signal: "orderBy", field: "created_at", value: "desc" });
    assertHas({ ...s, family: "pagination", signal: "offset" });
    assertHas({ ...s, family: "search", signal: "fullText", line: 6 });
  });

  test("Django and DRF: icontains on a related field, the order, the page size, the search and order fields, the scope, an email", () => {
    const v = { file: "backend/views.py" };
    assertHas({ ...v, family: "search", signal: "contains", field: "customer__name", via: "django" });
    assertHas({ ...v, family: "search", signal: "caseInsensitive", field: "customer__name" });
    assertHas({ ...v, family: "sort", signal: "orderBy", field: "created", value: "desc" });
    assertHas({ ...v, family: "pagination", signal: "pageSize", value: 25 });
    assertHas({ ...v, family: "pagination", signal: "pageSize", value: 50 });
    assertHas({ ...v, family: "search", signal: "fields", values: ["customer__name", "reference"], via: "drf" });
    assertHas({ ...v, family: "sort", signal: "fields", values: ["created", "total"] });
    assertHas({ ...v, family: "scope", signal: "owner", field: "owner" });
    assertHas({ ...v, family: "notification", signal: "email" });
    assertHas({ file: "backend/forms.py", family: "validation", signal: "optional", field: "subject" });
    assertHas({ file: "backend/forms.py", family: "validation", signal: "max", field: "subject", value: 100 });
    assertHas({ file: "backend/forms.py", family: "validation", signal: "email", field: "email" });
  });

  test("FastAPI, SQLAlchemy and pydantic: the parameters and their defaults, ilike, the order, the checks, the values", () => {
    const a = { file: "backend/api.py" };
    assertHas({ ...a, family: "pagination", signal: "page", field: "page", value: 1, via: "fastapi" });
    assertHas({ ...a, family: "pagination", signal: "pageSize", field: "limit", value: 20 });
    assertHas({ ...a, family: "search", signal: "contains", field: "customer", via: "sqlalchemy" });
    assertHas({ ...a, family: "sort", signal: "orderBy", field: "created", value: "desc" });
    assertHas({ ...a, family: "validation", signal: "required", field: "name", via: "pydantic" });
    assertHas({ ...a, family: "validation", signal: "max", field: "name", value: 80 });
    assertHas({ ...a, family: "validation", signal: "optional", field: "email" });
    assertHas({ ...a, family: "validation", signal: "email", field: "email" });
    assertHas({ ...a, family: "values", signal: "enum", field: "channel", values: ["web", "phone"] });
    assertHas({ ...a, family: "validation", signal: "max", field: "quantity", value: 99 });
    assertHas({ ...a, family: "values", signal: "enum", field: "Status", values: ["open", "closed"] });
  });

  test("OpenAPI: the query parameters of an operation, their values and bounds, the properties of its body, with the operation", () => {
    const o = { file: "openapi.json", via: "openapi" };
    assertHas({ ...o, family: "search", signal: "param", field: "q", route: "GET /orders" });
    assertHas({ ...o, family: "validation", signal: "max", field: "q", value: 100 });
    assertHas({ ...o, family: "pagination", signal: "page", field: "page", value: 1 });
    assertHas({ ...o, family: "values", signal: "enum", field: "status", values: ["open", "closed"] });
    assertHas({ ...o, family: "validation", signal: "required", field: "name", route: "POST /orders" });
    assertHas({ ...o, family: "validation", signal: "email", field: "email", route: "POST /orders" });
  });

  test("never read: a test, a comment, a YAML document; never kept: a random-looking value, a sentence that reads like SQL", () => {
    assert.ok(!items.some((it) => it.file.includes(".test.")), "a test file");
    assert.ok(
      !items.some(
        (it) =>
          ["hidden", "secret", "secret__name", "reference"].includes(it.field) &&
          it.family === "search" &&
          it.via !== "drf",
      ),
      "a comment",
    );
    assert.deepEqual(unreadable, [{ file: "openapi.yaml", reason: "yaml" }]);
    assertHas({ file: "lib/schemas.ts", field: "Region", values: ["North", "South"] });
    assert.ok(!items.some((it) => it.file === "server/sql.ts" && it.line === 7), "Would you like to order by phone?");
  });

  test("items: their fields in a fixed order, sorted by file then line, deterministic", () => {
    for (const it of items) {
      const keys = Object.keys(it);
      const order = ["family", "signal", "file", "line", "field", "value", "values", "route", "via"];
      assert.deepEqual(
        keys,
        order.filter((k) => keys.includes(k)),
        JSON.stringify(it),
      );
    }
    const sorted = [...items].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
    assert.deepEqual(
      items.map((i) => `${i.file}:${i.line}`),
      sorted.map((i) => `${i.file}:${i.line}`),
    );
    assert.deepEqual(collectBehaviours(APP).items, items);
  });

  test("the demo application: what the sheet Track orders says the code does", () => {
    const demo = collectBehaviours(path.join(KIT_ROOT, "examples", "demo-app")).items;
    const app = (partial) => assert.ok(has(demo, { file: "public/app.js", ...partial }), JSON.stringify(partial));
    app({ family: "search", signal: "contains", field: "customer" });
    app({ family: "search", signal: "caseInsensitive", field: "customer" });
    app({ family: "trigger", signal: "trim" });
    app({ family: "trigger", signal: "input" });
    app({ family: "filter", signal: "equals", field: "status" });
    assert.ok(
      has(demo, { file: "public/orders.html", field: "status", values: ["All", "Open", "Shipped", "Cancelled"] }),
    );
    // Neither accents ignored, nor an order, nor a page: the sheet says n/a.
    assert.ok(!demo.some((it) => it.signal === "accentsIgnored" || it.family === "sort" || it.family === "pagination"));
  });
});

describe("the literals kept, the limits", () => {
  test("a field, a number, a word of a fixed list by signal; never a string as written, a secret field's value, a long number", () => {
    assert.equal(safeField("order.customer.name"), "order.customer.name");
    assert.equal(safeField("address2"), "address2");
    assert.equal(safeField("a b"), undefined);
    assert.equal(safeField("gh" + "p_16C7e42F292c6912E7710c838347Ae178B4a"), undefined, "a token-shaped name");
    assert.equal(safeValue("20"), 20);
    assert.equal(safeValue("desc", { family: "sort" }), "desc");
    assert.equal(safeValue("desc", { family: "filter" }), undefined, "a word kept only where it means something");
    assert.equal(safeValue("0 2 * * *", { family: "schedule" }), "0 2 * * *");
    assert.equal(safeValue("0 2 * * *", { family: "validation", signal: "default" }), undefined);
    assert.equal(safeValue("10 minutes", { family: "schedule" }), "10 minutes");
    assert.equal(safeValue("email", { signal: "type" }), "email");
    assert.equal(safeValue("nodemailer", { family: "notification" }), "nodemailer");
    // A default is a number or nothing; a secret field keeps no value at all.
    assert.equal(safeValue("changeme", { signal: "default", field: "name" }), undefined);
    assert.equal(safeValue(8, { signal: "default", field: "admin_password" }), undefined);
    assert.equal(safeValue(3, { signal: "default", field: "quantity" }), 3);
    assert.equal(safeValue("4111 1111 1111 1111"), undefined);
    assert.equal(safeValue(612345678), undefined, "nine digits: a phone, an account");
    assert.equal(safeValue("sk_" + "live_51H8kQ2eZvKYlo2C0aBc"), undefined);
    assert.equal(safeValue("Hello, world: a sentence"), undefined);
    assert.deepEqual(safeValues(["Line 2", "06 12 34 56 78", "4111 1111 1111 1111"]), ["Line 2"]);
    assert.deepEqual(safeValues(["a", "b"], "apiToken"), [], "a secret field's list");
    assert.deepEqual(
      safeValues(["Open", "Open", "gh" + "p_16C7e42F292c6912E7710c838347Ae178B4a", "x".repeat(41), "Cancelled"]),
      ["Open", "Cancelled"],
    );
    assert.deepEqual(paramSignal("per_page"), { family: "pagination", signal: "pageSize" });
    assert.deepEqual(paramSignal("customer"), { family: "filter", signal: "param" });
  });

  test("a comment drops its signal; at most 300 signals per file; a file over 512 KB is listed, not read", () => {
    const text = "a /* b */ c";
    const sink = createSink("x.js", text, [[2, 9]]);
    sink.push({ family: "search", signal: "contains", via: "js" }, 4);
    sink.push({ family: "search", signal: "contains", via: "js" }, 10);
    assert.deepEqual(
      sink.items.map((i) => i.line),
      [1],
    );
    const dir = tempDir("doc-kit-behaviours-");
    try {
      fs.writeFileSync(path.join(dir, "many.js"), "list.filter((o) => o.a.includes(q));\n".repeat(400));
      fs.writeFileSync(path.join(dir, "big.js"), "x".repeat(600 * 1024));
      const r = collectBehaviours(dir);
      assert.equal(r.items.filter((i) => i.file === "many.js").length, 300);
      assert.deepEqual(r.unreadable, [{ file: "big.js", reason: "tooLarge" }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the code of a feature sheet (features.json, engine/sync/feature-files.mjs)", () => {
  test("readFeatures: by id; a file that does not follow the schema gives none, and says where", () => {
    const dir = tempDir("doc-kit-features-");
    try {
      assert.deepEqual(readFeatures(adapterTools(dir)), { features: new Map(), problem: null });
      fs.writeFileSync(
        path.join(dir, "features.json"),
        JSON.stringify([{ id: "F-01", sources: ["lib/**"], behaviours: ["search"] }]),
      );
      assert.deepEqual(readFeatures(adapterTools(dir)).features.get("F-01").sources, ["lib/**"]);
      fs.writeFileSync(path.join(dir, "features.json"), JSON.stringify([{ id: "F-02", behaviours: ["Search!"] }]));
      // A new modification time: the cache reads the file again.
      const later = new Date(Date.now() + 5000);
      fs.utimesSync(path.join(dir, "features.json"), later, later);
      const r = readFeatures(adapterTools(dir));
      assert.equal(r.features.size, 0);
      assert.equal(r.problem.key, "features.invalid");
      assert.match(r.problem.vars.at, /behaviours/);
      fs.writeFileSync(path.join(dir, "features.json"), "{ not json");
      assert.deepEqual(readFeatures(adapterTools(dir)).problem, {
        key: "features.invalid",
        vars: { file: "features.json", at: "(root)" },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("apiHandlers: a method and a route, whatever the spelling of its parameters; a route alone names every method", () => {
    const api = [
      { method: "GET", route: "/api/orders/[id]", file: "a.ts", line: 3 },
      { method: "DELETE", route: "/api/orders/[id]", file: "a.ts", line: 9 },
      { method: "GET", route: "/api/users", file: "b.ts", line: 1 },
    ];
    assert.deepEqual(
      apiHandlers({ api: ["GET /api/orders/{id}"] }, api).map((h) => h.line),
      [3],
    );
    assert.deepEqual(
      apiHandlers({ api: ["/api/orders/:id"] }, api).map((h) => h.line),
      [3, 9],
    );
    assert.deepEqual(apiHandlers({}, api), []);
  });

  test("behaviourLines, candidateKinds, kindsOfHints: a type or an optional field alone is no form", () => {
    const hints = [
      { family: "search", file: "app/orders/page.tsx", line: 4 },
      { family: "validation", signal: "type", file: "app/orders/page.tsx", line: 9 },
      { family: "sort", file: "server/orders.ts", line: 2 },
      { family: "validation", signal: "required", file: "app/users/page.tsx", line: 1 },
    ];
    assert.deepEqual([...behaviourLines(hints, ["app/orders/page.tsx"])], [["app/orders/page.tsx", [4, 9]]]);
    const api = [{ method: "GET", route: "/api/orders", file: "server/orders.ts" }];
    assert.deepEqual(candidateKinds({ segment: "orders", api: ["GET /api/orders"] }, hints, api), ["search", "sort"]);
    assert.deepEqual(kindsOfHints(hints), ["search", "sort", "form"]);
  });

  test("inventory --features: each candidate gets the kinds its code points to, kept by --write and --force", () => {
    const adapters = [{ available: true, families: [{ items: [{ id: "/orders" }, { id: "/users" }] }] }];
    const hints = { items: [{ family: "filter", file: "app/orders/page.tsx", line: 1 }], api: [] };
    const [orders, users] = candidateFeatures(adapters, [], hints);
    assert.deepEqual(orders.behaviours, ["filter"]);
    assert.ok(!("behaviours" in users), "no hint: no field");
    assert.deepEqual(mergeFeatures([], [orders])[0].behaviours, ["filter"]);
  });
});

describe("the context of a feature sheet: Behaviours to describe", () => {
  /** The demo projects, copied: the facts written, a features.json naming the sheet's code. */
  async function demo(language) {
    const base = tempDir("doc-kit-behaviours-ctx-");
    fs.cpSync(path.join(KIT_ROOT, "examples", "demo-docs"), path.join(base, "demo-docs"), {
      recursive: true,
      filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src),
    });
    fs.cpSync(path.join(KIT_ROOT, "examples", "demo-app"), path.join(base, "demo-app"), { recursive: true });
    const docs = path.join(base, "demo-docs");
    if (language === "fr") {
      const config = path.join(docs, "doc.config.mjs");
      // The demo is written in English and translated (`languages`): a French project of one language here.
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace(/languages: \["en", "fr"\]/, 'language: "fr"'));
    }
    fs.writeFileSync(
      path.join(docs, "features.json"),
      JSON.stringify([
        { id: "F-01", title: "Track orders", sources: ["public/app.js", "public/orders.html"], behaviours: ["search"] },
      ]),
    );
    // The seams of the CLI context: no git, no program run (RULES.md M4).
    const io = { stdout: { write() {} }, stderr: { write() {} }, env: {}, commit: () => "c0ffee", exec: () => null };
    const cli = (args) => runCli([...args, "--project", docs], io);
    assert.equal(await cli(["facts", "--source", "behaviours"]), 0);
    assert.equal(await cli(["context", "features/track-orders"]), 0);
    return { base, text: fs.readFileSync(path.join(docs, ".doc-kit", "context", "features__track-orders.md"), "utf8") };
  }

  test("the hints of its code, one line per field and place, and the cards to write with their rubrics", async () => {
    const { base, text } = await demo("en");
    try {
      assert.match(text, /## Behaviours to describe/);
      assert.match(text, /- `customer`: contains, caseInsensitive — public\/app\.js:26 \(array\)/);
      assert.match(text, /- `status`: options \[All, Open, Shipped, Cancelled\] — public\/orders\.html:21 \(html\)/);
      // Each rubric with the id an analysis gives it: the analyst needs no other file (the kind is already its id).
      assert.match(
        text,
        /- \*\*Search\*\* \(`:::behaviour\{kind="search"\}`\): Where\* `where`, Fields searched\* `fields`, /,
      );
      assert.match(text, /Matching\* `match`, .*Combined filters `filters`/);
      assert.match(text, /- \*\*Filter\*\* \(`:::behaviour\{kind="filter"\}`\)/);
      assert.ok(!/\*\*Form\*\*/.test(text), "a date field's type is no form");
      // The sheet's own code, whole, from features.json: its sources.
      assert.match(text, /### public\/app\.js \(direct\)/);
      // Never repeated as raw facts rows.
      assert.ok(!text.includes("`behaviours`: {"));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("in French: the French spelling of the cards, the rubrics in French", async () => {
    const { base, text } = await demo("fr");
    try {
      assert.match(text, /## Comportements à décrire/);
      // The French spelling for the page, the kind's id for the analysis.
      assert.match(
        text,
        /- \*\*Recherche\*\* \(`:::comportement\{type="recherche"\}` = `search`\): Où\* `where`, Champs cherchés\* `fields`/,
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
