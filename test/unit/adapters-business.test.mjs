// Business space coverage adapters (ARCHITECTURE.md §6.8): openapi (OpenAPI 3, Swagger 2, the YAML reason, prefix,
// exclude) and features (features.json). Same fixture pattern as test/unit/adapters.test.mjs.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadAdapter } from "../../engine/capture/session.mjs";
import { adapterTools } from "../../engine/check/coverage.mjs";
import { tempDir } from "../tools/helpers.mjs";

let root;
const write = (rel, text) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

const OPENAPI3 = {
  openapi: "3.0.0",
  paths: {
    "/orders/{id}": { get: { summary: "Read an order", parameters: [] }, put: { operationId: "updateOrder" } },
    "/orders": { get: {} },
  },
};
const SWAGGER2 = { swagger: "2.0", paths: { "/orders/{id}": { get: { summary: "Read an order (v2)" } } } };

before(() => {
  root = tempDir("doc-kit-adapters-business-");
  write("openapi.json", JSON.stringify(OPENAPI3));
  write("swagger.json", JSON.stringify(SWAGGER2));
  write("openapi.yaml", "openapi: 3.0.0\npaths: {}\n");
  write(
    "features.json",
    JSON.stringify([
      { id: "F-01", title: "Order approval", routes: ["/orders/[id]"] },
      { id: "F-02", title: "Exports" },
    ]),
  );
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

async function inventory(spec) {
  const { adapter, options } = await loadAdapter("coverage", spec, root, "coverage[0]");
  return adapter.inventory({ root, options, tools: adapterTools(root) });
}

describe("openapi", () => {
  test('OpenAPI 3: one item per operation, id "METHOD /path", label the summary or operationId', async () => {
    const r = await inventory({ adapter: "openapi", file: "openapi.json" });
    assert.equal(r.available, true);
    assert.equal(r.families[0].name, "API");
    const byId = Object.fromEntries(r.families[0].items.map((i) => [i.id, i]));
    assert.equal(byId["GET /orders/{id}"].label, "Read an order");
    assert.equal(byId["PUT /orders/{id}"].label, "updateOrder");
    assert.ok(!("label" in byId["GET /orders"]));
    assert.deepEqual(byId["GET /orders/{id}"].match, [
      "GET /orders/{id}",
      "GET /orders/:id",
      "GET /orders/[id]",
      "GET /orders/",
    ]);
  });

  test("Swagger 2: the same shape", async () => {
    const r = await inventory({ adapter: "openapi", file: "swagger.json" });
    assert.equal(r.available, true);
    assert.equal(r.families[0].items.find((i) => i.id === "GET /orders/{id}").label, "Read an order (v2)");
  });

  test('a YAML document: unavailable with reason "yaml", never parsed', async () => {
    assert.deepEqual(await inventory({ adapter: "openapi", file: "openapi.yaml" }), {
      available: false,
      reason: "yaml",
    });
  });

  test("prefix and exclude", async () => {
    const r = await inventory({
      adapter: "openapi",
      file: "openapi.json",
      prefix: "/api",
      exclude: ["^GET /api/orders$"],
    });
    const ids = r.families[0].items.map((i) => i.id);
    assert.deepEqual(ids.sort(), ["GET /api/orders/{id}", "PUT /api/orders/{id}"]);
  });

  test('a missing file: unavailable with reason "notFound"', async () => {
    assert.deepEqual(await inventory({ adapter: "openapi", file: "nope.json" }), {
      available: false,
      reason: "notFound",
      vars: { path: "nope.json" },
    });
  });
});

describe("features", () => {
  test("one item per entry of features.json, match: [id]", async () => {
    const r = await inventory({ adapter: "features" });
    assert.equal(r.families[0].name, "Features");
    assert.deepEqual(
      r.families[0].items.map((i) => ({ id: i.id, label: i.label, match: i.match })),
      [
        { id: "F-01", label: "Order approval", match: ["F-01"] },
        { id: "F-02", label: "Exports", match: ["F-02"] },
      ],
    );
  });

  test('another file, default "features.json" otherwise', async () => {
    write("other-features.json", JSON.stringify([{ id: "F-09" }]));
    const r = await inventory({ adapter: "features", file: "other-features.json" });
    assert.deepEqual(
      r.families[0].items.map((i) => i.id),
      ["F-09"],
    );
  });

  test('a missing file: unavailable with reason "notFound"', async () => {
    assert.deepEqual(await inventory({ adapter: "features", file: "nope.json" }), {
      available: false,
      reason: "notFound",
      vars: { path: "nope.json" },
    });
  });
});
