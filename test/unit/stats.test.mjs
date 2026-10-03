// Production statistics (engine/stats/usage.mjs, `doc-kit stats`, --profile): spans measured per block,
// appended to usage/<version>.jsonl only when the project has a usage/ folder, grouped and exported.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createTimer,
  appendUsage,
  readUsage,
  summarize,
  usageCsv,
  compareVersions,
  usageFolder,
  usageFile,
} from "../../engine/stats/usage.mjs";
import { duration } from "../../cli/commands/stats.mjs";
import { renderUsage, costOf, USAGE_VIEWS } from "../../engine/stats/render.mjs";
import { transcriptUsage, recordAgent, projectFor } from "../../skill/doc-kit/scripts/usage-hook.mjs";
import { installHooks } from "../../cli/commands/skill.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}

describe("engine/stats/usage.mjs", () => {
  test("createTimer: start/end, time (closed even on error), add; an end called twice counts once", async () => {
    let t = 0;
    const timer = createTimer(() => t);
    const end = timer.start("capture");
    t = 40;
    const endWait = timer.start("capture", { sub: "orders", part: "wait" });
    t = 140;
    endWait();
    endWait();
    await timer.time("facts", { sub: "api" }, async () => (t = 160));
    await assert.rejects(timer.time("facts", { sub: "db" }, async () => ((t = 170), Promise.reject(new Error("x")))));
    timer.add("generate", { sub: "use/orders", model: "sonnet" }, 1234.4);
    t = 200;
    end({ exit: 0 });
    assert.deepEqual(timer.spans, [
      { step: "capture", sub: "orders", part: "wait", ms: 100 },
      { step: "facts", sub: "api", ms: 20 },
      { step: "facts", sub: "db", ms: 10 },
      { step: "generate", sub: "use/orders", model: "sonnet", ms: 1234 },
      { step: "capture", exit: 0, ms: 200 },
    ]);
  });

  test("appendUsage / readUsage: one file per version, lines appended, broken lines skipped, oldest first", () => {
    const dir = tempDir("doc-kit-usage-");
    try {
      appendUsage({
        dir,
        version: "1.4.0",
        command: "capture",
        phase: "create",
        spans: [{ step: "capture", ms: 900 }],
        date: new Date("2026-10-03T10:00:00Z"),
        run: "r1",
      });
      appendUsage({
        dir,
        version: "1.4.0",
        command: "build",
        phase: "create",
        spans: [{ step: "build", ms: 300 }],
        date: new Date("2026-10-03T09:00:00Z"),
        run: "r2",
      });
      appendUsage({
        dir,
        version: "2.0/beta",
        command: "sync",
        phase: "update",
        spans: [{ step: "update", ms: 50 }],
        date: new Date("2026-10-04T09:00:00Z"),
        run: "r3",
      });
      fs.appendFileSync(usageFile(dir, "1.4.0"), 'not json\n{"no":"ms"}\n');
      assert.deepEqual(fs.readdirSync(dir).sort(), ["1.4.0.jsonl", "2.0_beta.jsonl"]);
      const all = readUsage(dir);
      assert.deepEqual(
        all.map((e) => e.run),
        ["r2", "r1", "r3"],
      );
      assert.deepEqual(all[1], {
        at: "2026-10-03T10:00:00.000Z",
        version: "1.4.0",
        run: "r1",
        command: "capture",
        phase: "create",
        actor: "kit",
        step: "capture",
        ms: 900,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("summarize by step: totals count top-level spans only; each step's parts follow it, with their share of it", () => {
    const e = (o) => ({ run: "r", version: "1.0.0", ...o });
    const entries = [
      e({ step: "capture", ms: 1000 }),
      e({ step: "capture", sub: "a", part: "wait", ms: 600 }),
      e({ step: "capture", sub: "b", part: "wait", ms: 200 }),
      e({ step: "capture", sub: "a", part: "shot", ms: 100 }),
      e({ step: "facts", ms: 500 }),
      e({ step: "facts", sub: "api", ms: 300 }),
      e({ step: "generate", ms: 2000, actor: "agent", model: "sonnet", tokens: { in: 1000, out: 200, cacheRead: 50 } }),
    ];
    const r = summarize(entries, "step");
    assert.deepEqual(r.total, { ms: 3500, tokens: 1250, runs: 1 });
    assert.deepEqual(
      r.groups.map((g) => [g.key, g.ms, Math.round(g.share * 100)]),
      [
        ["generate", 2000, 57],
        ["capture", 1000, 29],
        ["capture › wait", 800, 80],
        ["capture › shot", 100, 10],
        ["facts", 500, 14],
        ["facts › api", 300, 60],
      ],
    );
    assert.deepEqual(
      summarize(entries, "model").groups.map((g) => g.key),
      ["sonnet", "—"],
    );
    assert.throws(() => summarize(entries, "colour"));
  });

  test("summarize --since: versions compared numerically", () => {
    const entries = ["1.9.0", "1.10.0", "2.0.0"].map((version) => ({ version, run: version, step: "build", ms: 1 }));
    assert.equal(summarize(entries, "version", { since: "1.10.0" }).total.runs, 2);
    assert.equal(compareVersions("1.10.0", "1.9.2"), 1);
    assert.equal(compareVersions("1.0", "1.0.0"), 0);
  });

  test("usageCsv: fixed columns, quoted cells", () => {
    const csv = usageCsv([
      {
        at: "t",
        version: "1",
        run: "r",
        command: "capture",
        phase: "create",
        step: "capture",
        sub: "a,b",
        part: "wait",
        ms: 5,
        pages: ["x", "y"],
      },
    ]);
    assert.equal(
      csv,
      'at,version,run,command,phase,actor,step,sub,part,ms,model,tokensIn,tokensOut,cacheRead,cacheWrite,pages\nt,1,r,capture,create,kit,capture,"a,b",wait,5,,,,,,x y\n',
    );
  });

  test("usageFolder: only when usage/ exists, and not with DOC_KIT_STATS=0", () => {
    const root = tempDir("doc-kit-usage-");
    try {
      assert.equal(usageFolder(root, {}), null);
      fs.mkdirSync(path.join(root, "usage"));
      assert.equal(usageFolder(root, {}), path.join(root, "usage"));
      assert.equal(usageFolder(root, { DOC_KIT_STATS: "0" }), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("duration: ms, s, min, h", () => {
    assert.deepEqual([450, 1234, 75_000, 3_725_000].map(duration), ["450 ms", "1.2 s", "1 min 15 s", "1 h 2 min"]);
  });
});

describe("recording by the CLI", () => {
  test("a project without usage/: nothing written; `stats` says how to turn it on", async () => {
    const dir = demoCopy();
    try {
      assert.equal((await cli(["build", "--project", dir, "--date", "2026-01-01"])).code, 0);
      assert.ok(!fs.existsSync(path.join(dir, "usage")));
      const r = await cli(["stats", "--project", dir]);
      assert.equal(r.code, 0);
      assert.match(r.out, /not recorded for this project: create the usage\/ folder/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("with usage/: each recorded command appends its spans (version, phase, exit code); stats, --json, --csv, --profile", async () => {
    const dir = demoCopy();
    try {
      fs.mkdirSync(path.join(dir, "usage"));
      const b = await cli(["build", "--project", dir, "--date", "2026-01-01", "--profile"]);
      assert.equal(b.code, 0, b.err);
      assert.match(b.err, /Profile — \d+ ms in all \(longest first\):\n +\d+ ms +100 % {2}build/);
      assert.equal((await cli(["check", "links", "--project", dir])).code, 0);
      assert.equal((await cli(["doctor", "--project", dir])).code >= 0, true); // not recorded
      const lines = fs
        .readFileSync(path.join(dir, "usage", "1.4.0.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      assert.deepEqual(
        lines.map((l) => [l.command, l.step, l.version, l.phase, l.exit]),
        [
          ["build", "build", "1.4.0", "update", 0],
          ["check", "check", "1.4.0", "update", 0],
        ],
      );
      assert.notEqual(lines[0].run, lines[1].run);

      const r = await cli(["stats", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /measured in 2 runs · 0 tokens/);
      assert.match(r.out, /^build +[\d.]+ (ms|s) +\d+ % +1×/m);
      const j = JSON.parse((await cli(["stats", "--project", dir, "--json", "--by", "command"])).out);
      assert.deepEqual(j.groups.map((g) => g.key).sort(), ["build", "check"]);
      assert.match((await cli(["stats", "--project", dir, "--csv"])).out, /^at,version,run,command/);
      assert.equal((await cli(["stats", "--project", dir, "--by", "colour"])).code, 2);

      // Turned off for one run.
      await cli(["build", "--project", dir, "--date", "2026-01-01"], { DOC_KIT_STATS: "0" });
      assert.equal(
        fs
          .readFileSync(path.join(dir, "usage", "1.4.0.jsonl"), "utf8")
          .trim()
          .split("\n").length,
        2,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("::usage (engine/stats/render.mjs)", () => {
  const entries = [
    { at: "1", version: "1.0.0", run: "r1", phase: "create", actor: "kit", step: "capture", ms: 3000 },
    {
      at: "1",
      version: "1.0.0",
      run: "r1",
      phase: "create",
      actor: "kit",
      step: "capture",
      sub: "a",
      part: "wait",
      ms: 2000,
    },
    {
      at: "2",
      version: "1.0.0",
      run: "r2",
      phase: "create",
      actor: "agent",
      step: "generate",
      ms: 60_000,
      model: "sonnet",
      tokens: { in: 1_000_000, out: 100_000 },
      pages: ["use/orders"],
    },
    {
      at: "3",
      version: "1.0.0",
      run: "r3",
      phase: "create",
      actor: "agent",
      step: "generate",
      ms: 30_000,
      model: "sonnet",
      tokens: { in: 500_000, out: 0 },
    },
    {
      at: "4",
      version: "1.1.0",
      run: "r4",
      phase: "update",
      actor: "agent",
      step: "update",
      ms: 10_000,
      model: "haiku",
      tokens: { in: 200_000, out: 0, cacheRead: 1_000_000 },
    },
    { at: "5", version: "1.1.0", run: "r5", phase: "update", actor: "human", step: "review", ms: 600_000 },
  ];
  const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  test("costOf: prices per million; cacheRead 0.1× and cacheWrite 1.25× input by default; no price → null", () => {
    assert.equal(costOf(entries[2], { sonnet: { input: 3, output: 15 } }), 4.5);
    assert.equal(costOf(entries[4], { haiku: { input: 1, output: 5 } }), 0.3);
    assert.equal(costOf({ model: "x", tokens: { cacheWrite: 1_000_000 } }, { x: { input: 2, output: 0 } }), 2.5);
    assert.equal(costOf(entries[2], {}), null);
    assert.equal(costOf(entries[0], { sonnet: { input: 3, output: 15 } }), null);
  });

  test("summary: times per actor, the number of agents and the models with their agent count, tokens, cost", () => {
    const html = renderUsage(entries, "summary", {
      t,
      esc,
      prices: { sonnet: { input: 3, output: 15 } },
      currency: "€",
    });
    assert.match(html, /render\.usage\.agents<\/td><td>3</);
    assert.match(html, /render\.usage\.modelsUsed<\/td><td>sonnet × 2, haiku × 1</);
    assert.match(html, /render\.usage\.humanTime<\/td><td>10 min 0 s</);
    assert.match(html, /render\.usage\.tokens<\/td><td>2,800,000</);
    assert.match(html, /render\.usage\.cost<\/td><td>6\.00 €</);
    assert.doesNotMatch(renderUsage(entries, "summary", { t, esc }), /render\.usage\.cost/, "no price, no cost row");
  });

  test("versions, steps (parts indented), models, slowest; every view without `view`", () => {
    const versions = renderUsage(entries, "versions", { t, esc });
    assert.match(versions, /<td>1\.0\.0<\/td><td>render\.usage\.phase\.create<\/td><td>3<\/td>/);
    assert.match(versions, /<td>1\.1\.0<\/td><td>render\.usage\.phase\.update<\/td><td>2<\/td><td>10 min 10 s<\/td>/);
    const steps = renderUsage(entries, "steps", { t, esc });
    assert.match(
      steps,
      /<tr class="usage-part"><td>↳ wait<\/td><td>2\.0 s<\/td><td><span class="usage-bar" style="--w:67%"><\/span> 67 %/,
    );
    assert.match(
      renderUsage(entries, "models", { t, esc }),
      /<td>sonnet<\/td><td>2<\/td><td>1,500,000<\/td><td>100,000<\/td>/,
    );
    assert.match(
      renderUsage(entries, "slowest", { t, esc }),
      /<td>capture › wait<\/td><td>2\.0 s<\/td><td>2\.0 s<\/td><td>1<\/td>/,
    );
    const all = renderUsage(entries, undefined, { t, esc });
    assert.deepEqual(
      [...all.matchAll(/data-view="(\w+)"/g)].map((m) => m[1]),
      [...USAGE_VIEWS],
    );
    assert.match(renderUsage([], "models", { t, esc }), /render\.usage\.noModels/);
  });

  test("in a page: tables from usage/; an unknown view is an error; no statistics → a warning and a note", async () => {
    const dir = demoCopy();
    try {
      const page = path.join(dir, "content", "use", "orders.md");
      fs.appendFileSync(page, '\n\n::usage{view="summary"}\n');
      const none = await cli(["build", "--project", dir, "--date", "2026-01-01"]);
      assert.equal(none.code, 0, none.err);
      assert.match(none.err, /::usage: no statistics yet/);
      fs.mkdirSync(path.join(dir, "usage"));
      fs.writeFileSync(path.join(dir, "usage", "1.4.0.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
      const ok = await cli([
        "build",
        "--project",
        dir,
        "--date",
        "2026-01-01",
        "--output",
        path.join(dir, "dist", "x.html"),
      ]);
      assert.equal(ok.code, 0, ok.err);
      assert.match(fs.readFileSync(path.join(dir, "dist", "x.html"), "utf8"), /data-view=\\?"summary\\?"/);
      fs.appendFileSync(page, '\n::usage{view="colour"}\n');
      const bad = await cli(["build", "--project", dir, "--date", "2026-01-01"]);
      assert.notEqual(bad.code, 0);
      assert.match(bad.err, /unknown view "colour"/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("statistics hook (skill/doc-kit/scripts/usage-hook.mjs, skill install --hooks)", () => {
  const transcript =
    [
      { timestamp: "2026-10-03T10:00:00.000Z", type: "user", message: { role: "user", content: "go" } },
      {
        timestamp: "2026-10-03T10:00:05.000Z",
        message: {
          id: "m1",
          model: "claude-sonnet-x",
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 1000,
            cache_creation_input_tokens: 50,
          },
        },
      },
      // the same message again (one line per content block): counted once
      {
        timestamp: "2026-10-03T10:00:05.500Z",
        message: { id: "m1", model: "claude-sonnet-x", usage: { input_tokens: 100, output_tokens: 20 } },
      },
      {
        timestamp: "2026-10-03T10:01:00.000Z",
        message: { id: "m2", model: "claude-sonnet-x", usage: { input_tokens: 10, output_tokens: 5 } },
      },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n") + "\nnot json\n";

  test("transcriptUsage: tokens once per message id, the model most messages name, first → last timestamp", () => {
    assert.deepEqual(transcriptUsage(transcript), {
      tokens: { in: 110, out: 25, cacheRead: 1000, cacheWrite: 50 },
      model: "claude-sonnet-x",
      ms: 60_000,
      messages: 2,
    });
    assert.deepEqual(transcriptUsage("").messages, 0);
  });

  test("recordAgent: finds the project (docs/manual below the session folder), appends one agent line; nothing without usage/", async () => {
    const app = tempDir("doc-kit-hook-");
    try {
      const docs = path.join(app, "docs", "manual");
      fs.cpSync(demoCopy(), docs, { recursive: true });
      const file = path.join(app, "agent.jsonl");
      fs.writeFileSync(file, transcript);
      const input = { cwd: app, agent_id: "a1", agent_type: "doc-kit-writer", agent_transcript_path: file };
      assert.equal(await recordAgent(input, { env: {} }), null, "no usage/ folder");
      fs.mkdirSync(path.join(docs, "usage"));
      const line = await recordAgent(input, { env: {}, now: new Date("2026-10-03T10:02:00Z") });
      assert.deepEqual(line, {
        at: "2026-10-03T10:02:00.000Z",
        version: "1.4.0",
        run: "agent-a1",
        command: "agent",
        phase: "update",
        actor: "agent",
        step: "generate",
        sub: "doc-kit-writer",
        ms: 60_000,
        model: "claude-sonnet-x",
        tokens: { in: 110, out: 25, cacheRead: 1000, cacheWrite: 50 },
      });
      assert.deepEqual(
        readUsage(path.join(docs, "usage")).map((e) => e.sub),
        ["doc-kit-writer"],
      );
      assert.equal(await recordAgent(input, { env: { DOC_KIT_STATS: "0" } }), null);
      assert.equal(
        await recordAgent({ ...input, agent_transcript_path: path.join(app, "missing.jsonl") }, { env: {} }),
        null,
      );
      assert.equal(projectFor(path.join(app, "src"), {}), null, "a folder below the app does not see docs/manual");
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("installHooks: merged with the existing settings, never twice; an invalid file is refused", () => {
    const dir = tempDir("doc-kit-hooks-");
    try {
      const file = path.join(dir, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(
        file,
        JSON.stringify({
          model: "x",
          hooks: { SubagentStop: [{ matcher: "", hooks: [{ type: "command", command: "other.sh" }] }], Stop: [] },
        }),
      );
      assert.equal(installHooks({ settingsFile: file, skillFolder: "/skills/doc-kit" }).added, true);
      assert.equal(installHooks({ settingsFile: file, skillFolder: "/skills/doc-kit" }).added, false);
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.equal(s.model, "x");
      assert.deepEqual(s.hooks.Stop, []);
      assert.deepEqual(
        s.hooks.SubagentStop.flatMap((g) => g.hooks.map((h) => h.command)),
        ["other.sh", 'node "/skills/doc-kit/scripts/usage-hook.mjs"'],
      );
      fs.writeFileSync(file, "{ broken");
      assert.throws(
        () => installHooks({ settingsFile: file, skillFolder: "/s" }),
        (e) => e.key === "skill.settingsInvalid",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
