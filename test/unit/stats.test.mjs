// Production statistics (engine/stats/usage.mjs, `doc-kit stats`, --profile): spans measured per block,
// appended to usage/<version>.jsonl only when the project has a usage/ folder, grouped and exported.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createTimer, appendUsage, readUsage, summarize, usageCsv, compareVersions, usageFolder, usageFile } from "../../engine/stats/usage.mjs";
import { duration } from "../../cli/commands/stats.mjs";
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
      appendUsage({ dir, version: "1.4.0", command: "capture", phase: "create", spans: [{ step: "capture", ms: 900 }], date: new Date("2026-10-03T10:00:00Z"), run: "r1" });
      appendUsage({ dir, version: "1.4.0", command: "build", phase: "create", spans: [{ step: "build", ms: 300 }], date: new Date("2026-10-03T09:00:00Z"), run: "r2" });
      appendUsage({ dir, version: "2.0/beta", command: "sync", phase: "update", spans: [{ step: "update", ms: 50 }], date: new Date("2026-10-04T09:00:00Z"), run: "r3" });
      fs.appendFileSync(usageFile(dir, "1.4.0"), "not json\n{\"no\":\"ms\"}\n");
      assert.deepEqual(fs.readdirSync(dir).sort(), ["1.4.0.jsonl", "2.0_beta.jsonl"]);
      const all = readUsage(dir);
      assert.deepEqual(all.map((e) => e.run), ["r2", "r1", "r3"]);
      assert.deepEqual(all[1], { at: "2026-10-03T10:00:00.000Z", version: "1.4.0", run: "r1", command: "capture", phase: "create", actor: "kit", step: "capture", ms: 900 });
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
    assert.deepEqual(r.groups.map((g) => [g.key, g.ms, Math.round(g.share * 100)]), [
      ["generate", 2000, 57],
      ["capture", 1000, 29],
      ["capture › wait", 800, 80],
      ["capture › shot", 100, 10],
      ["facts", 500, 14],
      ["facts › api", 300, 60],
    ]);
    assert.deepEqual(summarize(entries, "model").groups.map((g) => g.key), ["sonnet", "—"]);
    assert.throws(() => summarize(entries, "colour"));
  });

  test("summarize --since: versions compared numerically", () => {
    const entries = ["1.9.0", "1.10.0", "2.0.0"].map((version) => ({ version, run: version, step: "build", ms: 1 }));
    assert.equal(summarize(entries, "version", { since: "1.10.0" }).total.runs, 2);
    assert.equal(compareVersions("1.10.0", "1.9.2"), 1);
    assert.equal(compareVersions("1.0", "1.0.0"), 0);
  });

  test("usageCsv: fixed columns, quoted cells", () => {
    const csv = usageCsv([{ at: "t", version: "1", run: "r", command: "capture", phase: "create", step: "capture", sub: "a,b", part: "wait", ms: 5, pages: ["x", "y"] }]);
    assert.equal(csv, 'at,version,run,command,phase,actor,step,sub,part,ms,model,tokensIn,tokensOut,cacheRead,cacheWrite,pages\nt,1,r,capture,create,kit,capture,"a,b",wait,5,,,,,,x y\n');
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
      const lines = fs.readFileSync(path.join(dir, "usage", "1.4.0.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.deepEqual(lines.map((l) => [l.command, l.step, l.version, l.phase, l.exit]), [
        ["build", "build", "1.4.0", "update", 0],
        ["check", "check", "1.4.0", "update", 0],
      ]);
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
      assert.equal(fs.readFileSync(path.join(dir, "usage", "1.4.0.jsonl"), "utf8").trim().split("\n").length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
