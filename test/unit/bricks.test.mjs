// The bricks (ARCHITECTURE.md §6.18): the registry (standard/bricks.json), the state of each brick read from what it
// produced, the plan of `doc-kit bricks run`, and the command itself on a temporary project (fake git and fake
// external tools: nothing outside the temporary folders is read or run).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { loadBricks, expand, enabledBricks, topoOrder, withNeeds } from "../../engine/bricks/registry.mjs";
import { brickStatuses } from "../../engine/bricks/status.mjs";
import { planRun } from "../../engine/bricks/plan.mjs";
import { envelopeState } from "../../engine/facts/freshness.mjs";
import { SOURCE_NAMES } from "../../engine/facts/registry.mjs";

const NOW = new Date("2026-10-16T12:00:00Z");
const GEN = "doc-kit 0.4.0";

/** A synthetic registry: `bricks` as [id, needs, extra] — for the rules that the kit's own registry cannot show. */
function registryOf(bricks, presets = {}) {
  const list = bricks.map(([id, needs = [], extra = {}]) => ({
    id,
    kind: "facts",
    title: { en: id, fr: id },
    needs,
    requires: [],
    steps: [{ command: "facts", source: id }],
    freshness: { rule: "envelope", files: [id] },
    ...extra,
  }));
  return { bricks: list, byId: new Map(list.map((b) => [b.id, b])), presets };
}
const statesOf = (entries) => new Map(entries.map(([id, state]) => [id, { state, why: [] }]));

describe("registry (standard/bricks.json)", () => {
  test("loads; every facts source has its brick, and no facts brick names an unknown source", () => {
    const r = loadBricks();
    const facts = r.bricks.filter((b) => b.kind === "facts" && b.steps.some((s) => s.source));
    assert.deepEqual(facts.map((b) => b.steps[0].source).sort(), [...SOURCE_NAMES].sort());
    for (const b of facts) assert.equal(b.id, `facts.${b.steps[0].source}`);
    for (const b of r.bricks) assert.ok(b.title.en && b.title.fr, `${b.id}: a title in both languages`);
  });

  test("presets expand (nested ones included); an unknown name is a usage error with the closest id", () => {
    const r = loadBricks();
    const full = expand(r, ["full"]);
    assert.ok(full.has("facts.api") && full.has("facts.tools") && full.has("doc-audit"));
    assert.deepEqual([...expand(r, ["facts.env"])], ["facts.env"]);
    assert.throws(
      () => expand(r, ["facts.apii"]),
      (e) => e.key === "bricks.unknown" && e.code === 2 && e.vars.closest === "facts.api",
    );
  });

  test("enabled: every brick by default; bricks.enabled (ids or presets) minus bricks.disabled", () => {
    const r = loadBricks();
    assert.equal(enabledBricks(r).size, r.bricks.length);
    const on = enabledBricks(r, { enabled: ["facts"], disabled: ["facts.history"] });
    assert.ok(on.has("facts.api") && !on.has("facts.history") && !on.has("doc-audit"));
  });

  test("a name of Object.prototype is not a preset: bricks.unknown", () => {
    const r = loadBricks();
    for (const name of ["constructor", "__proto__", "toString"])
      assert.throws(
        () => expand(r, [name]),
        (e) => e.key === "bricks.unknown" && e.code === 2,
        name,
      );
  });

  test("a typo in bricks.enabled / bricks.disabled names doc.config.mjs and lists the valid names", () => {
    const r = loadBricks();
    for (const field of ["enabled", "disabled"])
      assert.throws(
        () => enabledBricks(r, { [field]: ["facts.histry"] }),
        (e) =>
          e.key === "bricks.config" &&
          e.code === 2 &&
          e.vars.field === field &&
          e.vars.closest === "facts.history" &&
          e.vars.ids.includes("doc-audit") &&
          e.vars.ids.includes("full"),
      );
  });

  describe("a defect of the registry is refused when it is loaded", () => {
    const roots = [];
    after(() => {
      for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
    });
    const brick = (id, more = {}) => ({
      id,
      kind: "facts",
      title: { en: id, fr: id },
      steps: [{ command: "facts", source: id }],
      freshness: { rule: "envelope", files: [id] },
      ...more,
    });
    /** A kit folder with only the registry and its schema. */
    const kitWith = (data) => {
      const root = tempDir("doc-kit-bricks-kit-");
      roots.push(root);
      fs.mkdirSync(path.join(root, "standard"));
      fs.mkdirSync(path.join(root, "schemas"));
      fs.copyFileSync(
        path.join(KIT_ROOT, "schemas", "bricks.schema.json"),
        path.join(root, "schemas", "bricks.schema.json"),
      );
      fs.writeFileSync(
        path.join(root, "standard", "bricks.json"),
        JSON.stringify({ version: 1, presets: {}, ...data }),
      );
      return root;
    };
    const cases = [
      [
        "against the schema (maxAgeDays below 1)",
        { bricks: [brick("a", { freshness: { rule: "envelope", files: ["a"], maxAgeDays: 0 } })] },
        /maxAgeDays|anyOf|minimum/,
      ],
      ["a brick declared twice", { bricks: [brick("a"), brick("a")] }, /brick a declared twice/],
      ["a need that does not exist", { bricks: [brick("a", { needs: ["zz"] })] }, /a needs unknown zz/],
      [
        "a facts step with no source and no tools",
        { bricks: [brick("a", { steps: [{ command: "facts" }] })] },
        /names no source and no tools/,
      ],
      [
        "a preset name that is not an id",
        { presets: { "Full-Set": ["a"] }, bricks: [brick("a")] },
        /preset name Full-Set/,
      ],
      [
        "a preset with the id of a brick",
        { presets: { a: ["a"] }, bricks: [brick("a")] },
        /preset a has the id of a brick/,
      ],
      [
        "a preset that names an unknown brick",
        { presets: { all: ["a", "zz"] }, bricks: [brick("a")] },
        /preset all: unknown zz/,
      ],
      [
        "a cycle of needs",
        { bricks: [brick("a", { needs: ["b"] }), brick("b", { needs: ["a"] })] },
        /a cycle of needs/,
      ],
    ];
    for (const [what, data, error] of cases) test(what, () => assert.throws(() => loadBricks(kitWith(data)), error));

    test("a valid registry loads, and a preset may name another preset", () => {
      const r = loadBricks(kitWith({ presets: { one: ["a"], both: ["one", "b"] }, bricks: [brick("a"), brick("b")] }));
      assert.deepEqual([...expand(r, ["both"])].sort(), ["a", "b"]);
    });
  });

  test("needs come first; a cycle of needs is refused and named", () => {
    const r = registryOf([["c", ["b"]], ["b", ["a"]], ["a"]]);
    assert.deepEqual(topoOrder(r, ["a", "b", "c"]), ["a", "b", "c"]);
    assert.deepEqual(withNeeds(r, ["c"]), ["a", "b", "c"]);
    const cyclic = registryOf([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    assert.throws(() => topoOrder(cyclic, ["a", "b"]), /a cycle of needs: a → b → a/);
  });
});

describe("state of a brick, read from what it produced", () => {
  const root = tempDir("doc-kit-bricks-state-");
  after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, json) => {
    fs.mkdirSync(path.join(root, "facts"), { recursive: true });
    fs.writeFileSync(path.join(root, "facts", `${name}.json`), typeof json === "string" ? json : JSON.stringify(json));
  };
  const state = (name, more = {}) =>
    envelopeState(root, "facts", name, { commit: "c0ffee1234", generator: GEN, now: NOW, ...more });

  test("missing, unreadable, another commit, another kit line, too old — and fresh", () => {
    assert.equal(state("api").state, "missing");
    write("api", "{ broken");
    assert.deepEqual(state("api"), { state: "stale", why: [{ key: "unreadable", vars: { file: "facts/api.json" } }] });
    write("api", { commit: "deadbeef99", generator: "doc-kit 0.4.1", generated: "2026-10-15T00:00:00Z" });
    assert.deepEqual(
      state("api").why.map((w) => w.key),
      ["commit"],
    );
    write("api", { commit: "c0ffee1234", generator: "doc-kit 0.3.0", generated: "2026-10-15T00:00:00Z" });
    assert.deepEqual(state("api").why, [{ key: "kit", vars: { file: "facts/api.json", was: "0.3", now: "0.4" } }]);
    write("api", { commit: "c0ffee1234", generator: "doc-kit 0.4.9", generated: "2026-09-01T00:00:00Z" });
    assert.equal(state("api").state, "fresh", "a patch release and no age limit: fresh");
    assert.equal(state("api", { maxAgeDays: 30 }).why[0].key, "age");
    assert.equal(state("api", { commit: null }).state, "fresh", "an unknown HEAD cannot make a file stale");
  });

  test("a file that is JSON but not an object is unreadable; a commit or generator that is not a string is ignored", () => {
    for (const text of ["[]", "42", "null", '"text"']) {
      write("odd", text);
      assert.deepEqual(state("odd").why, [{ key: "unreadable", vars: { file: "facts/odd.json" } }], text);
    }
    write("odd", { commit: 12345678, generator: { name: "x" }, generated: "2026-10-16T00:00:00Z" });
    assert.deepEqual(state("odd"), { state: "fresh", why: [] });
    write("odd", { commit: "c0ffee1234", generator: `doc-kit ${"9".repeat(100)}.1.2 0.3.0` });
    assert.equal(state("odd").state, "fresh", "the kit line is read on the first 64 characters only");
  });

  test("a brick is only as fresh as what it needs; a disabled brick says so", () => {
    write("a", { commit: "c0ffee1234", generator: GEN, generated: "2026-10-16T00:00:00Z" });
    const r = registryOf([["a"], ["b", ["a"]], ["c", ["missing-one"]], ["missing-one"]]);
    write("b", { commit: "c0ffee1234", generator: GEN, generated: "2026-10-16T00:00:00Z" });
    write("c", { commit: "c0ffee1234", generator: GEN, generated: "2026-10-16T00:00:00Z" });
    const p = { registry: r, root, factsDir: "facts", commit: "c0ffee1234", generator: GEN, now: NOW };
    const all = brickStatuses({ ...p, enabled: new Set(["a", "b", "c", "missing-one"]) });
    assert.equal(all.get("b").state, "fresh");
    assert.deepEqual(all.get("c"), { state: "stale", why: [{ key: "needs", vars: { id: "missing-one" } }] });
    const some = brickStatuses({ ...p, enabled: new Set(["a", "b"]) });
    assert.equal(some.get("c").state, "disabled");
  });
});

describe("plan of `bricks run`", () => {
  const r = registryOf(
    [
      ["a"],
      ["b", ["a"]],
      ["t", [], { requires: ["tools"], steps: [{ command: "facts", tools: true }] }],
      ["audit", [], { kind: "report", steps: [{ command: "audit" }], freshness: { rule: "volatile" } }],
      ["s", [], { steps: [{ agent: "security-review", per: "page" }] }],
    ],
    { all: ["a", "b", "t", "audit"] },
  );

  test("named bricks run, fresh or not; --deps adds what is not fresh (all of it with --force)", () => {
    const statuses = statesOf([
      ["a", "fresh"],
      ["b", "fresh"],
      ["t", "missing"],
      ["audit", "volatile"],
      ["s", "fresh"],
    ]);
    assert.deepEqual(planRun({ registry: r, statuses, names: ["b"], flags: {} }).run, ["b"]);
    assert.deepEqual(planRun({ registry: r, statuses, names: ["b"], flags: { deps: true } }).run, ["b"]);
    assert.deepEqual(planRun({ registry: r, statuses, names: ["b"], flags: { deps: true, force: true } }).run, [
      "a",
      "b",
    ]);
    const staleA = statesOf([
      ["a", "stale"],
      ["b", "fresh"],
    ]);
    assert.deepEqual(planRun({ registry: r, statuses: staleA, names: ["b"], flags: { deps: true } }).run, ["a", "b"]);
  });

  test("--stale alone: every brick missing or out of date (never an on-demand one); a missing option skips, and says so", () => {
    const statuses = statesOf([
      ["a", "stale"],
      ["b", "fresh"],
      ["t", "missing"],
      ["audit", "volatile"],
      ["s", "fresh"],
    ]);
    const plan = planRun({ registry: r, statuses, names: [], flags: { stale: true } });
    assert.deepEqual(plan.run, ["a"]);
    assert.deepEqual(plan.skipped, [{ id: "t", why: { key: "requires", vars: { option: "--tools" } } }]);
    assert.deepEqual(planRun({ registry: r, statuses, names: [], flags: { stale: true, tools: true } }).run, [
      "a",
      "t",
    ]);
  });

  test("the facts steps are gathered into ONE facts run; other commands follow; agent steps are listed, never run", () => {
    const statuses = statesOf([
      ["a", "stale"],
      ["b", "stale"],
      ["t", "stale"],
      ["audit", "volatile"],
      ["s", "stale"],
    ]);
    const plan = planRun({ registry: r, statuses, names: ["all", "s"], flags: { tools: true, network: true } });
    assert.deepEqual(plan.commands, [
      { command: "facts", values: { source: ["a", "b"], sourcesExactly: true, tools: true, network: true } },
      { command: "audit", values: {} },
    ]);
    assert.deepEqual(plan.agents, [{ brick: "s", agent: "security-review", per: "page" }]);
    const toolsOnly = planRun({ registry: r, statuses, names: ["t"], flags: { tools: true } });
    assert.deepEqual(toolsOnly.commands, [
      { command: "facts", values: { source: [], sourcesExactly: true, tools: true, network: false } },
    ]);
    const noToolsBrick = planRun({ registry: r, statuses, names: ["a"], flags: { tools: true } });
    assert.deepEqual(
      noToolsBrick.commands,
      [{ command: "facts", values: { source: ["a"], sourcesExactly: true, tools: false, network: false } }],
      "--tools is not passed through when no brick that runs has a tools step",
    );
  });

  test("a disabled brick never runs: left out of presets, --stale and --deps; skipped with its reason when named", () => {
    const statuses = statesOf([
      ["a", "disabled"],
      ["b", "stale"],
      ["t", "missing"],
      ["audit", "volatile"],
      ["s", "fresh"],
    ]);
    const preset = planRun({ registry: r, statuses, names: ["all"], flags: { tools: true } });
    assert.deepEqual(preset.run, ["b", "t", "audit"]);
    assert.deepEqual(preset.skipped, [], "a preset member the project disables is left out silently");
    const named = planRun({ registry: r, statuses, names: ["a", "b"], flags: {} });
    assert.deepEqual(named.run, ["b"]);
    assert.deepEqual(named.skipped, [{ id: "a", why: { key: "disabled", vars: {} } }]);
    const deps = planRun({ registry: r, statuses, names: ["b"], flags: { deps: true, force: true } });
    assert.deepEqual(deps.run, ["b"], "a disabled need is not run, even with --force");
    assert.deepEqual(planRun({ registry: r, statuses, names: [], flags: { stale: true, tools: true } }).run, [
      "b",
      "t",
    ]);
  });

  test("--stale with names: only those of them missing or stale; --force without --deps adds nothing", () => {
    const statuses = statesOf([
      ["a", "fresh"],
      ["b", "stale"],
      ["t", "missing"],
      ["audit", "volatile"],
      ["s", "fresh"],
    ]);
    const plan = planRun({ registry: r, statuses, names: ["a", "b", "audit"], flags: { stale: true } });
    assert.deepEqual(plan.run, ["b"]);
    assert.deepEqual(planRun({ registry: r, statuses, names: ["b"], flags: { force: true } }).run, ["b"]);
  });
});

describe("doc-kit bricks (CLI)", () => {
  const dirs = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  /**
   * A documentation project whose application is a small Node app (in the temporary folder).
   * @param {{ bricks?: object, noApp?: boolean }} [o]   config.bricks; noApp: app.dir names a folder that is not there
   */
  function project({ bricks, noApp = false } = {}) {
    const app = tempDir("doc-kit-bricks-app-");
    const dir = tempDir("doc-kit-bricks-");
    dirs.push(app, dir);
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "shop", dependencies: { next: "15.0.0" } }),
    );
    fs.writeFileSync(path.join(app, "page.js"), "const k = process.env.API_KEY;\n");
    const config = { product: { name: "Shop" }, app: { dir: noApp ? path.join(app, "gone") : app }, bricks };
    fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config)};\n`);
    fs.mkdirSync(path.join(dir, "content"));
    fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Shop", sections: [] }));
    return dir;
  }
  async function cli(args, io = {}) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: { DOC_KIT_NO_BROWSER: "1" },
      commit: () => "c0ffee1234",
      exec: () => null,
      ...io,
    });
    return { code, out, err };
  }
  const factsFiles = (dir) =>
    fs.existsSync(path.join(dir, "facts")) ? fs.readdirSync(path.join(dir, "facts")).sort() : [];

  test("the state of every brick, and in --json the same with the reasons", async () => {
    const dir = project();
    const r = await cli(["bricks", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /facts\.api\s+API routes — never produced/);
    assert.match(r.out, /doc-kit bricks run --stale/);
    const json = JSON.parse((await cli(["bricks", "--project", dir, "--json"])).out);
    const api = json.bricks.find((b) => b.id === "facts.api");
    assert.equal(api.state, "missing");
    assert.equal(api.why[0].text, "no facts/api.json");
    assert.ok(json.presets.full);
  });

  test("run: only the bricks named are read (one facts run), and they are then up to date", async () => {
    const dir = project();
    const r = await cli(["bricks", "run", "facts.env", "facts.dependencies", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(factsFiles(dir), ["dependencies.json", "env.json"]);
    const json = JSON.parse((await cli(["bricks", "--project", dir, "--json"])).out);
    assert.equal(json.bricks.find((b) => b.id === "facts.env").state, "fresh");
    assert.equal(json.bricks.find((b) => b.id === "facts.api").state, "missing");
  });

  test("run --stale: what is out of date; then nothing; a brick that needs --tools is skipped without it", async () => {
    const dir = project();
    const first = await cli(["bricks", "run", "--stale", "--project", dir]);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /facts\.tools skipped: needs the option --tools/);
    assert.ok(factsFiles(dir).includes("api.json") && factsFiles(dir).includes("history.json"));
    assert.ok(!factsFiles(dir).some((f) => f.startsWith("tool-")), "no tool run without --tools");
    const again = await cli(["bricks", "run", "--stale", "--project", dir]);
    assert.match(again.out, /Nothing run: every brick to run was skipped/, "only facts.tools is left, and skipped");
    const hint = await cli(["bricks", "--project", dir]);
    assert.match(hint.out, /bricks run --stale --tools$/m, "the next command names the option the brick left requires");
    const fresh = await cli(["bricks", "--project", project()]);
    assert.match(fresh.out, /bricks run --stale$/m, "--stale alone while some brick out of date needs no option");
    const moved = await cli(["bricks", "--project", dir, "--json"], { commit: () => "feedbeef77" });
    assert.ok(
      JSON.parse(moved.out)
        .bricks.filter((b) => b.kind === "facts" && b.id !== "facts.tools")
        .every((b) => b.state === "stale"),
    );
  });

  test("run facts.tools --tools: the external tools alone, no facts source read again", async () => {
    const dir = project();
    const r = await cli(["bricks", "run", "facts.tools", "--tools", "--project", dir, "--json"]);
    assert.equal(r.code, 0, r.err);
    const plan = JSON.parse(r.out);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.run, ["facts.tools"]);
    assert.deepEqual(factsFiles(dir), [
      "tool-gitleaks.json",
      "tool-knip.json",
      "tool-osv-scanner.json",
      "tool-syft.json",
    ]);
  });

  test("an unknown brick, or nothing named without --stale, is a usage error (exit code 2)", async () => {
    const dir = project();
    const unknown = await cli(["bricks", "run", "facts.apii", "--project", dir]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /unknown brick or preset: “facts\.apii”/);
    assert.match(unknown.err, /the closest is “facts\.api”/);
    assert.equal((await cli(["bricks", "run", "--project", dir])).code, 2);
    assert.equal((await cli(["bricks", "nope", "--project", dir])).code, 2);
  });

  test("bricks <id>: one brick, what it needs and how it runs (text and --json)", async () => {
    const dir = project();
    const r = await cli(["bricks", "facts.tools", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /facts\.tools — .+: never produced/);
    assert.match(r.out, /requires the option\(s\): --tools/);
    assert.match(r.out, /step: doc-kit facts --tools/);
    const json = JSON.parse((await cli(["bricks", "facts.api", "--project", dir, "--json"])).out);
    assert.equal(json.id, "facts.api");
    assert.equal(json.state, "missing");
    assert.deepEqual(json.steps, [{ command: "facts", source: "api" }]);
  });

  test("bricks <preset>: the bricks of the preset and their states (text and --json)", async () => {
    const dir = project();
    const r = await cli(["bricks", "full", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /full — preset of \d+ bricks/);
    assert.match(r.out, /doc-audit — on demand/);
    const json = JSON.parse((await cli(["bricks", "facts", "--project", dir, "--json"])).out);
    assert.equal(json.preset, "facts");
    assert.deepEqual(json.bricks.map((b) => b.id).sort(), SOURCE_NAMES.map((n) => `facts.${n}`).sort());
  });

  test("run doc-audit: the audit runs in the same process (text, and --json with one document)", async () => {
    const dir = project();
    const r = await cli(["bricks", "run", "doc-audit", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Running: doc-audit/);
    assert.match(r.out, /1 brick run/);
    const json = await cli(["bricks", "run", "doc-audit", "--project", dir, "--json"]);
    assert.equal(json.code, 0, json.err);
    const plan = JSON.parse(json.out);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.done, [{ command: "audit", code: 0 }]);
  });

  test("a step that fails stops the run with its own exit code; --json: the plan with ok false", async () => {
    const dir = project({ noApp: true });
    const r = await cli(["bricks", "run", "facts.env", "doc-audit", "--project", dir]);
    assert.equal(r.code, 2);
    assert.match(r.err, /stopped: .*facts ended with exit code 2/);
    const json = await cli(["bricks", "run", "facts.env", "doc-audit", "--project", dir, "--json"]);
    assert.equal(json.code, 2);
    const plan = JSON.parse(json.out);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.done, [{ command: "facts", code: 2, key: "facts.noApp" }]);
  });

  test("an error that is not the kit's stops the run too: recorded without a code, the plan with ok false", async () => {
    const dir = project();
    let calls = 0;
    // The first read of HEAD (the bricks' states) answers; the second, inside the facts step, fails.
    const commit = () => {
      if (++calls > 1) throw new Error("disk gone");
      return "c0ffee1234";
    };
    const r = await cli(["bricks", "run", "facts.env", "--project", dir, "--json"], { commit });
    assert.equal(r.code, 1);
    const plan = JSON.parse(r.out);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.done, [{ command: "facts", code: null, key: null }]);
    assert.match(r.err, /disk gone/);
  });

  test("the internal sourcesExactly value is not an option of facts", async () => {
    const dir = project();
    const r = await cli(["facts", "--sourcesExactly", "--project", dir]);
    assert.equal(r.code, 2);
    assert.deepEqual(factsFiles(dir), []);
  });

  test("bricks.disabled: the brick is disabled, left out of its preset, skipped when named", async () => {
    const dir = project({ bricks: { disabled: ["facts.history"] } });
    const json = JSON.parse((await cli(["bricks", "--project", dir, "--json"])).out);
    assert.equal(json.bricks.find((b) => b.id === "facts.history").state, "disabled");
    const named = await cli(["bricks", "run", "facts.history", "--project", dir]);
    assert.equal(named.code, 0, named.err);
    assert.match(named.out, /Nothing run: every brick to run was skipped/);
    assert.match(named.out, /facts\.history skipped: left out by bricks in doc\.config\.mjs/);
    const preset = await cli(["bricks", "run", "facts", "--project", dir]);
    assert.equal(preset.code, 0, preset.err);
    assert.ok(factsFiles(dir).includes("api.json") && !factsFiles(dir).includes("history.json"));
  });

  test("bricks.enabled: only those bricks; a typo there is a configuration error naming doc.config.mjs", async () => {
    const dir = project({ bricks: { enabled: ["facts.env"] } });
    const json = JSON.parse((await cli(["bricks", "--project", dir, "--json"])).out);
    assert.deepEqual(
      json.bricks.filter((b) => b.state !== "disabled").map((b) => b.id),
      ["facts.env"],
    );
    const typo = await cli(["bricks", "--project", project({ bricks: { enabled: ["facts.histry"] } })]);
    assert.equal(typo.code, 2);
    assert.match(typo.err, /doc\.config\.mjs: bricks\.enabled names an unknown brick or preset: “facts\.histry”/);
    assert.match(typo.err, /the closest is “facts\.history”; the bricks and presets are: .*doc-audit/);
  });

  test("French: states and reasons in French", async () => {
    const dir = project();
    const r = await cli(["bricks", "--project", dir, "--lang", "fr"]);
    assert.match(r.out, /Briques du projet/);
    assert.match(r.out, /facts\.api\s+Routes de l'API — jamais produite/);
    assert.match(r.out, /pas de facts\/api\.json/);
  });
});

test("standard/bricks.json is valid against its schema (the kit's own registry)", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "bricks.schema.json"), "utf8"));
  assert.equal(schema.properties.version.const, 1);
  assert.ok(loadBricks().bricks.length >= 13);
});
