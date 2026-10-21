// The behaviours source and the code of a feature sheet against a crafted application, as the third review found it
// (ARCHITECTURE.md §6.9, §6.10): a secret file under another name of Windows, an OpenAPI document built to cost,
// a route of slashes, a key in a route, an escaped quote in a JSX attribute, a card written as a cron expression.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSink, safeValue, safeValues, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { schemaBehaviours } from "../../engine/facts/behaviour-schemas.mjs";
import { openapiBehaviours } from "../../engine/facts/openapi.mjs";
import { safeSources, sameRoute, apiHandlers } from "../../engine/sync/feature-files.mjs";
import { tempDir } from "../tools/helpers.mjs";

/** Whether an item has every field of `partial`. */
const has = (list, partial) =>
  list.some((it) => Object.entries(partial).every(([k, v]) => JSON.stringify(it[k]) === JSON.stringify(v)));

/** The time of `fn`, in milliseconds. */
const timed = (fn) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe("sources under another name of the system", () => {
  test("a data stream, a short name, another case, a drive: never the secret file they name", () => {
    const dir = tempDir("doc-kit-behaviours-names-");
    const app = path.join(dir, "app");
    try {
      fs.mkdirSync(path.join(app, "public"), { recursive: true });
      fs.writeFileSync(path.join(app, ".env"), "DB_PASSWORD=1");
      fs.writeFileSync(path.join(app, "server.key"), "key");
      fs.writeFileSync(path.join(app, "notes.txt"), "x");
      fs.writeFileSync(path.join(app, "public", "app.js"), "x");
      // A glob gives a pattern without a wildcard as it is written (engine/util/glob.mjs): so does this one.
      const patterns = [".env::$DATA", "server.key::$DATA", "ENV~1", "SERVER~1.KEY", ".ENV", "notes.txt:hidden", "C:x"];
      assert.deepEqual(
        safeSources(app, [...patterns, "public/app.js"], (p) => [p]),
        ["public/app.js"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("an OpenAPI document built to cost", () => {
  test("20,000 parameters to one $ref of 200,000 characters: read at once, nothing kept", () => {
    const doc = {
      paths: { "/a": { get: { parameters: Array.from({ length: 20_000 }, () => ({ $ref: "#/p" })) } } },
      p: { $ref: "#/" + "a/".repeat(100_000) },
    };
    const text = JSON.stringify(doc);
    const sink = createSink("o.json", text, []);
    const ms = timed(() => openapiBehaviours(doc, text, sink));
    assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
    assert.deepEqual(sink.items, []);
  });

  test("routes written with escaped slashes: read at once; the line of a route found after one that was not", () => {
    const routes = Array.from({ length: 20_000 }, (_, i) => `"\\/r${i}":{}`).join(",");
    const text = `{"paths":{${routes}}}`;
    const sink = createSink("o.json", text, []);
    const ms = timed(() => openapiBehaviours(JSON.parse(text), text, sink));
    assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
    const query = (name) => `{"get":{"parameters":[{"name":"${name}","in":"query"}]}}`;
    const lines = `{\n"paths": {\n"\\/a": ${query("page")},\n"/b": ${query("sort")}\n}\n}`;
    const read = createSink("o.json", lines, []);
    openapiBehaviours(JSON.parse(lines), lines, read);
    assert.ok(has(read.items, { field: "sort", line: 4 }), JSON.stringify(read.items));
  });

  test("3,500 operations sharing a body of 90,000 required names: read at once", () => {
    const requestBody = { content: { "application/json": { schema: { $ref: "#/c/B" } } } };
    const operation = { requestBody };
    const item = { get: operation, post: operation, put: operation, patch: operation, delete: operation };
    const doc = {
      paths: Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`/r${i}`, item])),
      c: { B: { properties: {}, required: Array.from({ length: 90_000 }, (_, i) => `n${i}`) } },
    };
    const text = JSON.stringify(doc);
    const ms = timed(() => openapiBehaviours(doc, text, createSink("o.json", text, [])));
    assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
  });

  test("a $ref of more than 16 keys, or to a key the object does not own, is not followed", () => {
    const deep = "#/" + Array.from({ length: 17 }, () => "a").join("/");
    let node = { name: "q", in: "query" };
    for (let i = 0; i < 17; i++) node = { a: node };
    const doc = {
      paths: { "/a": { get: { parameters: [{ $ref: deep }, { $ref: "#/__proto__" }, { $ref: "#/c/P" }] } } },
      c: { P: { name: "page", in: "query" } },
      ...node,
    };
    const sink = createSink("o.json", JSON.stringify(doc), []);
    openapiBehaviours(doc, JSON.stringify(doc), sink);
    assert.deepEqual(
      sink.items.map((i) => i.field),
      ["page"],
    );
  });
});

describe("routes", () => {
  test("a route of 80,000 slashes is compared at once; a trailing slash and a parameter's spelling do not count", () => {
    const long = "/".repeat(80_000) + "x";
    const ms = timed(() => sameRoute(long, "/x"));
    assert.ok(ms < 200, `${ms.toFixed(0)} ms`);
    assert.equal(sameRoute("/x/", "/x"), true);
    assert.equal(sameRoute("GET /orders/[id]/", "/orders/{id}"), true);
    const api = [{ method: "GET", route: long, file: "a.js" }];
    assert.ok(timed(() => apiHandlers({ api: ["/x", "GET /y"] }, api)) < 200);
  });

  test("a route holding a key, a token or a long number keeps no route, in a parameter's name too", () => {
    const sink = createSink("o.json", "", []);
    for (const route of [
      "GET /keys/AK" + "IAJ7Q2X3ZK5L9MBN4P",
      "GET /cards/4111111111111111",
      "GET /{Xk9fP2qL7mZ3vB8nR4tY}",
      "GET /hooks/:Xk9fP2qL7mZ3vB8nR4tY6uI1",
      "GET /orders/{orderId}",
      "GET /api/v1/orders/:id",
    ])
      sink.push({ family: "pagination", signal: "page", field: "page", route, via: "openapi" }, 0);
    assert.deepEqual(
      sink.items.map((i) => i.route ?? null),
      [null, null, null, null, "GET /orders/{orderId}", "GET /api/v1/orders/:id"],
    );
  });
});

describe("literals", () => {
  test("an escaped quote in a JSX expression does not hide the next fields; a backslash ends an HTML attribute", () => {
    const read = (text) => {
      const sink = createSink("x.tsx", text, jsCommentRanges(text));
      schemaBehaviours(text, "js", sink);
      return sink.items;
    };
    const jsx = '<input value={open ? \'it\\\'s\' : "x"} />\n<input name="email" required />';
    assert.ok(has(read(jsx), { signal: "required", field: "email" }), jsx);
    const html = '<input pattern="C:\\" name="folder" required>\n<input name="code" required>';
    assert.ok(has(read(html), { signal: "required", field: "folder" }), html);
    assert.ok(has(read(html), { signal: "required", field: "code" }), html);
  });

  test("a cron expression of 9 digits or more, a string of more than 200 characters, an object: never kept", () => {
    const cron = { family: "schedule", signal: "cron" };
    assert.equal(safeValue("4111 1111 1111 1111", cron), undefined);
    assert.equal(safeValue("*/5 * * * *", cron), "*/5 * * * *");
    assert.equal(safeValue("x".repeat(201), { family: "sort" }), undefined);
    assert.deepEqual(safeValues([{ toString: () => "Open" }, "a".repeat(201), "Closed"], "status"), ["Closed"]);
  });
});
