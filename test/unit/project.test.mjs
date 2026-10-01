// Home-made validator, schemas, configuration (defaults, precedence, exit codes), semver, finding the project.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validate, closest, clone } from "../../engine/project/validate.mjs";
import { readSchema, prepareConfig, loadProject } from "../../engine/project/load.mjs";
import { completeConfig, productSlug, defineConfig } from "../../engine/project/defaults.mjs";
import { applyEnv, readEnv } from "../../engine/project/env.mjs";
import { satisfies, isValidRange } from "../../engine/project/semver.mjs";
import { findProject } from "../../engine/project/find.mjs";
import { KitError } from "../../engine/project/errors.mjs";
import { DEMO, KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const keys = (r) => r.errors.map((e) => `${e.path}:${e.key}`);

describe("validator", () => {
  test("type, enum, const, pattern, minLength, minimum, maximum", () => {
    const s = {
      type: "object",
      properties: {
        a: { type: "string", pattern: "^[a-z]+$", minLength: 2 },
        b: { enum: ["x", 1, true] },
        c: { type: "number", minimum: 0, maximum: 1 },
        d: { type: ["string", "null"] },
        e: { type: "integer" },
        f: { const: 3 },
      },
    };
    assert.deepEqual(keys(validate({ a: "ok", b: 1, c: 0.5, d: null, e: 2, f: 3 }, s)), []);
    assert.deepEqual(keys(validate({ a: "A", b: 2, c: 2, d: 1, e: 1.5, f: 4 }, s)), ["a:minLength", "a:pattern", "b:enum", "c:maximum", "d:type", "e:type", "f:enum"]);
  });

  test("required, additionalProperties false (with a suggestion), additionalProperties schema", () => {
    const s = {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" }, storage: { type: "object", additionalProperties: { type: "number" } } },
    };
    const r = validate({ storgae: {}, storage: { x: 1, y: "2" } }, s);
    assert.deepEqual(keys(r), ["name:required", "storgae:unknownClose", "storage.y:type"]);
    assert.equal(r.errors[1].vars.closest, "storage");
    assert.equal(closest("zzzzzz", ["storage"]), null);
  });

  test("items, minItems, maxItems, paths with indexes", () => {
    const s = { type: "array", minItems: 1, maxItems: 2, items: { type: "object", required: ["n"], properties: { n: { type: "integer" } } } };
    assert.deepEqual(keys(validate([{ n: 1 }, { n: "x" }, {}], s)), ["(root):maxItems", "[1].n:type", "[2].n:required"]);
    assert.deepEqual(keys(validate([], s)), ["(root):minItems"]);
  });

  test("anyOf and local $ref", () => {
    const s = { $defs: { hex: { type: "string", pattern: "^#[0-9a-f]{6}$" } }, anyOf: [{ type: "null" }, { $ref: "#/$defs/hex" }] };
    assert.deepEqual(keys(validate(null, s)), []);
    assert.deepEqual(keys(validate("#2563eb", s)), []);
    assert.deepEqual(keys(validate("red", s)), ["(root):anyOf"]);
  });

  test("defaults applied in depth, without mutating the input", () => {
    const s = {
      type: "object",
      properties: { a: { type: "object", default: {}, properties: { b: { type: "number", default: 2 } } }, c: { $ref: "#/$defs/x", default: "z" } },
      $defs: { x: { type: "string" } },
    };
    const input = {};
    assert.deepEqual(validate(input, s, { applyDefaults: true }).value, { a: { b: 2 }, c: "z" });
    assert.deepEqual(input, {});
  });

  test("clone keeps functions by reference", () => {
    const f = () => 1;
    assert.equal(clone({ a: [1, { f }] }).a[1].f, f);
  });
});

describe("content schemas", () => {
  test("toc, glossary and zones of the demo project are valid", () => {
    const read = (p) => JSON.parse(fs.readFileSync(path.join(DEMO, p), "utf8"));
    assert.deepEqual(validate(read("content/toc.json"), readSchema("toc")).errors, []);
    assert.deepEqual(validate(read("content/glossary.json"), readSchema("glossary")).errors, []);
    for (const f of fs.readdirSync(path.join(DEMO, "images/zones"))) assert.deepEqual(validate(read("images/zones/" + f), readSchema("zones")).errors, [], f);
  });

  test("toc: unknown page key, level out of range, missing title", () => {
    const toc = { title: "T", sections: [{ id: "a", title: "A", groups: [{ pages: [{ id: "a/b", level: 3, titel: "x" }] }] }] };
    assert.deepEqual(keys(validate(toc, readSchema("toc"))), [
      "sections[0].groups[0].pages[0].title:required",
      "sections[0].groups[0].pages[0].level:enum",
      "sections[0].groups[0].pages[0].titel:unknownClose",
    ]);
  });

  test("zones: version and captured optional, unknown fields tolerated", () => {
    const z = { file: "a.webp", width: 10, height: 10, zones: [{ n: 1, x: 0, y: 0, w: 1, h: 1, other: true }], future: 1 };
    assert.deepEqual(validate(z, readSchema("zones")).errors, []);
    assert.deepEqual(keys(validate({ ...z, zones: [{ n: 0, x: 0, y: 0, w: 1, h: 1, side: "top" }] }, readSchema("zones"))), ["zones[0].n:minimum", "zones[0].side:enum"]);
  });
});

describe("configuration", () => {
  test("neutral defaults and derived values", () => {
    const c = prepareConfig({ product: { name: "Acme Orders" } }, { env: {} });
    assert.equal(c.product.slug, "acme-orders");
    assert.equal(c.output, "dist/Acme-Orders-Documentation.html");
    assert.equal(c.theme.key, "acme-orders-doc-theme");
    assert.equal(c.env.prefix, "ACME_ORDERS");
    assert.equal(c.language, "en");
    assert.equal(c.capture.locale, "en-US");
    assert.equal(c.capture.timezone, "UTC");
    assert.deepEqual(c.capture.cookies, []);
    assert.deepEqual(c.capture.storage, {});
    assert.equal(c.capture.geolocation, null);
    assert.deepEqual(c.capture.selectors, { block: null, frame: null });
    assert.equal(c.capture.readOnly, "auto");
    assert.equal(c.auth.adapter, "manual");
    assert.equal(c.theme.logo, null);
    assert.deepEqual(c.theme.colors, {});
    assert.deepEqual(c.paths, { content: "content", images: "images", diagrams: "diagrams" });
    assert.equal(prepareConfig({ product: { name: "X" }, language: "fr" }, { env: {} }).capture.locale, "fr-FR");
    assert.equal(productSlug("Café Orders é"), "cafe-orders-e");
    assert.equal(completeConfig({ product: { name: "Acme" }, theme: {}, env: {}, capture: {}, language: "en" }).output, "dist/Acme-Documentation.html");
    assert.equal(defineConfig({ a: 1 }).a, 1);
  });

  test("unknown key → exit code 2 with its path; non-object config → exit code 2", () => {
    assert.throws(
      () => prepareConfig({ product: { name: "X" }, capture: { storgae: {} } }, { env: {} }),
      (e) => e instanceof KitError && e.code === 2 && e.details[0].path === "capture.storgae" && e.details[0].vars.closest === "storage"
    );
    assert.throws(() => prepareConfig(null, { env: {} }), (e) => e.code === 2 && e.key === "config.noDefaultExport");
  });

  test("checks outside the schema: version pattern, kit range, unknown token, status colour, icon", () => {
    const error = (c) => {
      try {
        prepareConfig({ product: { name: "X" }, ...c }, { env: {} });
      } catch (e) {
        return e.details.map((d) => `${d.path}:${d.key}`);
      }
      return [];
    };
    assert.deepEqual(error({ version: { pattern: "(" } }), ["version.pattern:regex"]);
    assert.deepEqual(error({ kit: "not a range" }), ["kit:range"]);
    assert.deepEqual(error({ theme: { colors: { brnd: "#000000" } } }), ["theme.colors.brnd:token"]);
    assert.deepEqual(error({ theme: { colors: { brand: "red" } } }), ["theme.colors.brand:pattern"]);
    assert.deepEqual(error({ statuses: { 0: ["red;x:y", "A"] } }), ["statuses.0[0]:status"]);
    assert.deepEqual(error({ theme: { icons: { x: '<path onload="a()"/>' } } }), ["theme.icons.x:icon"]);
  });

  test("incompatible kit → exit code 3", () => {
    assert.throws(() => prepareConfig({ product: { name: "X" }, kit: "^9.0.0" }, { env: {}, version: "0.1.0" }), (e) => e.code === 3);
  });

  test("precedence: DOC_KIT_* > <PREFIX>_* > configuration", () => {
    const base = () => prepareConfig({ product: { name: "Acme" }, app: { url: "https://config" }, version: { fallback: "1.0.0" } }, { env: {} });
    assert.equal(applyEnv(base(), {}).app.url, "https://config");
    assert.equal(applyEnv(base(), { ACME_URL: "https://prefix/" }).app.url, "https://prefix");
    assert.equal(applyEnv(base(), { ACME_URL: "https://prefix", DOC_KIT_URL: "https://kit" }).app.url, "https://kit");
    assert.equal(applyEnv(base(), { ACME_VERSION: "2.0.0" }).version.fallback, "2.0.0");
    assert.equal(applyEnv(base(), { DOC_KIT_READONLY: "no" }).capture.readOnly, false);
    assert.throws(() => applyEnv(base(), { DOC_KIT_READONLY: "maybe" }), (e) => e.code === 2);
    assert.deepEqual(readEnv("SESSION", "ACME", { ACME_SESSION: "s.json" }), { value: "s.json", variable: "ACME_SESSION" });
    assert.equal(readEnv("SESSION", "ACME", { ACME_SESSION: "" }), undefined);
  });
});

describe("semver", () => {
  const cases = [
    ["0.1.0", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["1.4.2", "^1.0.0", true],
    ["2.0.0", "^1.0.0", false],
    ["0.1.5", "~0.1.0", true],
    ["0.2.0", "~0.1.0", false],
    ["0.1.0", ">=0.1.0", true],
    ["0.0.9", ">=0.1.0", false],
    ["3.0.0", "*", true],
    ["1.2.3", "1.x", true],
    ["1.2.3", "1.2", true],
    ["1.3.0", "1.2", false],
    ["1.2.3", ">=1.0.0 <1.2.0 || ^1.2.3", true],
  ];
  for (const [v, range, expected] of cases) test(`${v} ${expected ? "∈" : "∉"} ${range}`, () => assert.equal(satisfies(v, range), expected));
  test("unreadable range", () => assert.equal(isValidRange("abc"), false));
});

describe("finding and loading the project", () => {
  test("--project, walking up, missing", () => {
    assert.equal(findProject({ project: DEMO }).root, DEMO);
    assert.equal(findProject({ from: path.join(DEMO, "content", "use") }).root, DEMO);
    const empty = tempDir();
    try {
      assert.throws(() => findProject({ project: empty }), (e) => e.code === 2 && e.key === "project.configMissing");
      assert.throws(() => findProject({ project: path.join(empty, "missing") }), (e) => e.key === "project.folderMissing");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test("loadProject: import through a file URL (works with spaces in the path), completed config", async () => {
    const { project, config } = await loadProject({ project: DEMO, env: {} });
    assert.equal(project.root, DEMO);
    assert.equal(project.kit.version, JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8")).version);
    assert.equal(config.product.slug, "acme-orders");
    assert.equal(config.output, "dist/Acme-Orders-Documentation.html");
  });
});
