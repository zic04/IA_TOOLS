// Adapters (ARCHITECTURE.md §5) on small fixtures: coverage (next-app-router, react-router, i18n-registry, glob),
// loading and option validation (built-in, local, unknown, malformed), authentication adapters on fake pages.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadAdapter, isSignInUrl, LOGIN_PATTERN } from "../../engine/capture/session.mjs";
import { adapterTools, routeMatches, globRegex, isCovered, normalize } from "../../engine/check/coverage.mjs";
import { routeOf } from "../../adapters/coverage/next-app-router.mjs";
import { render } from "../../adapters/coverage/glob.mjs";
import { tempDir } from "../tools/helpers.mjs";

let root;
const write = (rel, text = "") => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

before(() => {
  root = tempDir("doc-kit-adapters-");
  // A fake application next to the documentation project (root/docs).
  for (const p of [
    "app/page.tsx",
    "app/(shop)/orders/page.tsx",
    "app/(shop)/orders/[id]/page.tsx",
    "app/(shop)/orders/[id]/edit/page.tsx",
    "app/settings/@modal/page.tsx",
    "app/settings/page.tsx",
    "app/settings/@modal/(.)photo/[id]/page.tsx",
    "app/_lib/page.tsx",
    "app/docs/[[...slug]]/page.mdx",
    "app/api/orders/route.ts",
    "app/orders/layout.tsx",
  ])
    write(p, "export default function Page() {}");
  write(
    "src/App.tsx",
    `<Routes><Route path="/" element={<Home/>}/><Route path="/orders" /><Route path="/orders/:id" />
     <Route path="/admin" element={<Admin/>}><Route path="users" /><Route path='groups/:gid' /><Route path="*" /></Route>
     { path: "/reports", element: <Reports/> }</Routes>`
  );
  write(
    "src/registry.ts",
    `export const WIDGET_IDS = ["kpi", "map_view", "legacy_chart", "hidden"];
     export const OTHER = ["not_a_widget"];`
  );
  write("src/i18n/en.json", JSON.stringify({ widget: { kpi: { title: "Key figures" }, map: { title: "Map" }, fallback: { title: "Widget" } }, "flat.key": "Flat" }));
  write("specs/orders/create.md", "# Create");
  write("specs/settings.md", "# Settings");
  write("specs/notes.txt", "x");
  write("docs/adapters/local.mjs", 'export default { name: "x", options: { level: { type: "integer", default: 1 } }, async inventory({ options }) { return { available: true, families: [{ name: "L", items: [{ id: "level-" + options.level }] }] }; } };');
  write("docs/adapters/broken.mjs", "export default { name: 'y' };");
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

const docs = () => path.join(root, "docs");
async function inventory(spec) {
  const { adapter, options } = await loadAdapter("coverage", spec, docs(), "coverage[0]");
  return adapter.inventory({ root: docs(), options, tools: adapterTools(docs()) });
}

describe("coverage adapters", () => {
  test("next-app-router: groups and slots ignored, interceptions and private folders skipped, params kept", async () => {
    assert.equal(routeOf("(shop)/orders/[id]/page.tsx"), "/orders/[id]");
    assert.equal(routeOf("settings/@modal/(.)photo/[id]/page.tsx"), null);
    assert.equal(routeOf("_lib/page.tsx"), null);
    const r = await inventory({ adapter: "next-app-router", app: "../app" });
    assert.equal(r.available, true);
    assert.deepEqual(
      r.families[0].items.map((i) => i.id),
      ["/docs/[[...slug]]", "/orders", "/orders/[id]", "/orders/[id]/edit", "/settings"]
    );
    assert.equal(r.families[0].name, "Routes");
    assert.deepEqual((await inventory({ adapter: "next-app-router", app: "../nope" })), { available: false, reason: "notFound", vars: { path: "../nope" } });
    const all = await inventory({ adapter: "next-app-router", app: "../app", exclude: [], family: "Pages" });
    assert.ok(all.families[0].items.some((i) => i.id === "/") && all.families[0].name === "Pages");
  });

  test("route forms: as is, :param, {param}, [param], static prefix", () => {
    assert.deepEqual(routeMatches("/orders"), ["/orders"]);
    assert.deepEqual(routeMatches("/orders/[id]/edit"), ["/orders/[id]/edit", "/orders/:id/edit", "/orders/{id}/edit", "/orders/"]);
    assert.deepEqual(routeMatches("/orders/:id"), ["/orders/:id", "/orders/{id}", "/orders/[id]", "/orders/"]);
    assert.deepEqual(routeMatches("/[locale]"), ["/[locale]", "/:locale", "/{locale}"]);
  });

  test("react-router: absolute and relative paths (prefix), * left out, several syntaxes", async () => {
    const r = await inventory({ adapter: "react-router", file: "../src/App.tsx", prefix: "/admin" });
    assert.deepEqual(r.families[0].items.map((i) => i.id), ["/admin", "/admin/groups/:gid", "/admin/users", "/orders", "/orders/:id", "/reports"]);
    const missing = await inventory({ adapter: "react-router", file: ["../src/App.tsx", "../src/Other.tsx"] });
    assert.equal(missing.reason, "notFound");
  });

  test("i18n-registry: block, ids, key template, aliases, fallback, exclusions, flat keys", async () => {
    const r = await inventory({
      adapter: "i18n-registry",
      family: "Widgets",
      source: "../src/registry.ts",
      block: "WIDGET_IDS\\s*=\\s*\\[([^\\]]+)\\]",
      pattern: '"(?<id>[a-z_]+)"',
      messages: "../src/i18n/en.json",
      key: "widget.{id}.title",
      aliases: { map_view: "map" },
      fallback: "widget.fallback.title",
      exclude: ["hidden"],
    });
    assert.deepEqual(r.families[0].items, [
      { id: "kpi", label: "Key figures", match: ["Key figures"] },
      { id: "map_view", label: "Map", match: ["Map"] },
      { id: "legacy_chart", label: "Widget", match: ["Widget"] },
    ]);
    const flat = await inventory({ adapter: "i18n-registry", source: "../src/registry.ts", pattern: '"(not_a_widget|kpi)"', messages: "../src/i18n/en.json", key: "flat.key" });
    assert.deepEqual(flat.families[0].items.map((i) => i.label), ["Flat", "Flat"]);
    const noLabel = await inventory({ adapter: "i18n-registry", source: "../src/registry.ts", block: "OTHER = \\[([^\\]]+)\\]", messages: "../src/i18n/en.json", key: "nope.{id}" });
    assert.deepEqual(noLabel.families[0].items, [{ id: "not_a_widget", label: null, match: [] }]);
    const noBlock = await inventory({ adapter: "i18n-registry", source: "../src/registry.ts", block: "NOPE = \\[([^\\]]+)\\]", messages: "../src/i18n/en.json" });
    assert.equal(noBlock.reason, "blockNotFound");
  });

  test("glob: pattern, match template, exclusions; glob syntax", async () => {
    const r = await inventory({ adapter: "glob", family: "Specs", base: "../specs", pattern: "**/*.md", match: "{name}", exclude: ["^settings"] });
    assert.deepEqual(r.families[0].items, [{ id: "orders/create.md", match: ["create"] }]);
    assert.equal(render("/{path}", "orders/[id].tsx"), "/orders/[id]");
    assert.equal(render("{dir}|{file}", "a/b/c.md"), "a/b|c.md");
    assert.ok(globRegex("src/**/*.{ts,tsx}").test("src/a/b/c.tsx") && globRegex("src/**/*.{ts,tsx}").test("src/c.ts") && !globRegex("src/*.ts").test("src/a/c.ts"));
  });

  test("covered: normalised text (case, non-breaking spaces), empty match never covered", () => {
    const text = normalize("See the Key figures widget and /orders/:id.");
    assert.ok(isCovered({ match: ["key figures"] }, text));
    assert.ok(isCovered({ match: ["/orders/[id]", "/orders/:id"] }, text));
    assert.ok(!isCovered({ match: [] }, text));
    assert.ok(!isCovered({ match: [""] }, text));
  });
});

describe("loading adapters", () => {
  test("local adapter with validated options and defaults", async () => {
    const r = await inventory({ adapter: "local:adapters/local.mjs", level: 3 });
    assert.equal(r.families[0].items[0].id, "level-3");
    assert.equal((await inventory({ adapter: "local:adapters/local.mjs" })).families[0].items[0].id, "level-1");
  });

  test("unknown option (with suggestion), wrong type, missing required option → exit code 2 with the path", async () => {
    await assert.rejects(loadAdapter("coverage", { adapter: "next-app-router", ap: "x" }, docs(), "coverage[1]"), (e) => e.code === 2 && e.key === "config.invalid" && e.details[0].path === "coverage[1].ap" && e.details[0].vars.closest === "app");
    await assert.rejects(loadAdapter("coverage", { adapter: "local:adapters/local.mjs", level: "high" }, docs(), "coverage[0]"), (e) => e.details[0].path === "coverage[0].level" && e.details[0].key === "type");
    await assert.rejects(loadAdapter("coverage", { adapter: "glob" }, docs(), "coverage[0]"), (e) => e.details[0].path === "coverage[0].pattern" && e.details[0].key === "required");
  });

  test("unknown, missing, malformed adapters → exit code 2", async () => {
    await assert.rejects(loadAdapter("coverage", { adapter: "nope" }, docs(), "coverage[0]"), (e) => e.code === 2 && e.key === "adapter.unknown" && /glob/.test(e.vars.known));
    await assert.rejects(loadAdapter("auth", { adapter: "local:adapters/none.mjs" }, docs(), "auth"), (e) => e.key === "adapter.missing");
    await assert.rejects(loadAdapter("coverage", { adapter: "local:adapters/broken.mjs" }, docs(), "coverage[0]"), (e) => e.key === "adapter.invalid" && e.vars.method === "inventory");
    await assert.rejects(loadAdapter("auth", { adapter: "local:adapters/local.mjs" }, docs(), "auth"), (e) => e.key === "adapter.invalid" && e.vars.method === "session");
  });

  test("authentication adapters: common options (start, loginPattern, browser) and their own", async () => {
    const manual = await loadAdapter("auth", { adapter: "manual" }, docs(), "auth");
    assert.deepEqual(manual.options, { start: "/", loginPattern: LOGIN_PATTERN });
    const me = await loadAdapter("auth", { adapter: "api-me", proof: "oid", browser: "chrome" }, docs(), "auth");
    assert.deepEqual(me.options, { start: "/", loginPattern: LOGIN_PATTERN, url: "/api/me", proof: "oid", who: "name", browser: "chrome" });
    await assert.rejects(loadAdapter("auth", { adapter: "manual", browser: "firefox" }, docs(), "auth"), (e) => e.details[0].path === "auth.browser");
    assert.equal((await loadAdapter("auth", { adapter: "none" }, docs(), "auth")).adapter.none, true);
  });
});

describe("authentication adapters on fake pages", () => {
  const appUrl = "http://127.0.0.1:4173";
  const page = (url, answer) => ({ url: () => url, evaluate: async () => answer });
  const tools = { appUrl, isSignInUrl };
  const load = async (spec) => {
    const a = await loadAdapter("auth", spec, docs(), "auth");
    return (url, answer) => a.adapter.session(page(url, answer), a.options, tools);
  };

  test("manual: signed in unless on a sign-in page or another origin", async () => {
    const s = await load({ adapter: "manual" });
    assert.deepEqual(await s(`${appUrl}/orders`), { who: null });
    assert.equal(await s(`${appUrl}/login?next=/orders`), null);
    assert.equal(await s("https://idp.example.com/authorize"), null);
    const custom = await load({ adapter: "manual", loginPattern: "^/auth/" });
    assert.deepEqual(await custom(`${appUrl}/login`), { who: null });
    assert.equal(await custom(`${appUrl}/auth/start`), null);
  });

  test("nextauth: { user, expires } → who, roles, expiry; {} → not signed in", async () => {
    const s = await load({ adapter: "nextauth" });
    assert.deepEqual(await s(`${appUrl}/`, { user: { name: "Robin Demo", roles: ["admin", "editor"] }, expires: "2026-10-02T00:00:00.000Z" }), {
      who: "Robin Demo",
      details: "admin, editor",
      expires: "2026-10-02T00:00:00.000Z",
    });
    assert.equal(await s(`${appUrl}/`, {}), null);
    assert.equal(await s(`${appUrl}/login`, { user: { name: "x" } }), null);
  });

  test("api-me: the proof field (dotted path) must be present; who field", async () => {
    const s = await load({ adapter: "api-me", proof: "user.oid", who: "user.display" });
    assert.deepEqual(await s(`${appUrl}/`, { user: { oid: "o-1", display: "Robin" } }), { who: "Robin", details: null, expires: null });
    assert.equal(await s(`${appUrl}/`, { user: { display: "Robin" } }), null);
    assert.equal(await s(`${appUrl}/`, null), null);
    const d = await load({ adapter: "api-me" });
    assert.deepEqual(await d(`${appUrl}/`, { id: 7, email: "robin@example.org" }), { who: "robin@example.org", details: null, expires: null });
  });
});
