// usage.mjs (ARCHITECTURE.md §6.11): log appends one JSON line to .doc-kit/usage.jsonl from what Claude Code
// reports when an agent ends; report totals by phase, brief, agent type, model and page, the cost (llm.prices)
// and the gap with a fresh estimate; scan is tolerant of anything in a .jsonl transcript but message.usage.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SKILL_SOURCE } from "../../cli/commands/skill.mjs";
import { tempDir } from "../tools/helpers.mjs";

const USAGE = path.join(SKILL_SOURCE, "scripts", "usage.mjs");
function usage(args, cwd) {
  const r = spawnSync(process.execPath, [USAGE, ...args], { cwd, encoding: "utf8", env: { ...process.env, DOC_KIT_URL: "", DOC_KIT_LANG: "" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** A minimal documentation project: just enough for loadConfig to succeed. */
function project(config = {}) {
  const docs = tempDir("doc-kit-usage-");
  fs.writeFileSync(path.join(docs, "doc.config.mjs"), `export default ${JSON.stringify({ product: { name: "Acme Orders" }, ...config }, null, 2)};\n`);
  return docs;
}

describe("usage.mjs log", () => {
  test("appends one JSON line with the given fields; missing required option and a bad --tokens -> exit 2", () => {
    const docs = project({ language: "en" });
    try {
      const r = usage(
        ["log", "--project", docs, "--brief", "writing-batch", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "1200", "--tools", "8", "--duration", "9000", "--pages", "use/orders,use/settings", "--phase", "5"],
        docs,
      );
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^✔ usage logged: writing-batch \(doc-kit-writer, sonnet\): 1200 tokens\n$/);
      const lines = fs
        .readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8")
        .trim()
        .split("\n");
      assert.equal(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.source, "log");
      assert.equal(entry.brief, "writing-batch");
      assert.equal(entry.agent, "doc-kit-writer");
      assert.equal(entry.model, "sonnet");
      assert.equal(entry.tokens, 1200);
      assert.equal(entry.tools, 8);
      assert.equal(entry.duration, 9000);
      assert.deepEqual(entry.pages, ["use/orders", "use/settings"]);
      assert.equal(entry.phase, "5");
      assert.ok(entry.date && !Number.isNaN(Date.parse(entry.date)));

      const missing = usage(["log", "--project", docs, "--brief", "x"], docs);
      assert.equal(missing.code, 2);
      assert.match(missing.err, /--agent is required for log/);

      const badTokens = usage(["log", "--project", docs, "--brief", "x", "--agent", "a", "--model", "m", "--tokens", "abc"], docs);
      assert.equal(badTokens.code, 2);
      assert.match(badTokens.err, /--tokens must be a non-negative integer/);

      const negative = usage(["log", "--project", docs, "--brief", "x", "--agent", "a", "--model", "m", "--tokens", "-5"], docs);
      assert.equal(negative.code, 2);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("a second call appends, it never rewrites the file; French project speaks French", () => {
    const docs = project({ language: "fr" });
    try {
      usage(["log", "--project", docs, "--brief", "a", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "10"], docs);
      const r = usage(["log", "--project", docs, "--brief", "b", "--agent", "doc-kit-triage", "--model", "haiku", "--tokens", "20"], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /consommation journalisée : b \(doc-kit-triage, haiku\) : 20 jetons/);
      const lines = fs
        .readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8")
        .trim()
        .split("\n");
      assert.equal(lines.length, 2);
      assert.equal(JSON.parse(lines[0]).brief, "a");
      assert.equal(JSON.parse(lines[1]).brief, "b");
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("unknown action -> exit 2 with usage", () => {
    const docs = project();
    try {
      const r = usage(["nope", "--project", docs], docs);
      assert.equal(r.code, 2);
      assert.match(r.err, /give one of: log, report, scan/);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });
});

describe("usage.mjs report", () => {
  test("no usage logged yet: a message, exit 0, --json gives an empty structure", () => {
    const docs = project();
    try {
      const r = usage(["report", "--project", docs], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /No usage logged yet/);
      const j = usage(["report", "--project", docs, "--json"], docs);
      assert.equal(j.code, 0, j.err);
      assert.deepEqual(JSON.parse(j.out), { file: path.join(docs, ".doc-kit", "usage.jsonl"), entries: 0, total: 0 });
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("totals by phase, brief, agent type, model and page; tokens per page; cost; gap with a fresh estimate", () => {
    const docs = project({
      language: "en",
      llm: { currency: "EUR", prices: { sonnet: { input: 3, output: 15 }, haiku: { input: 0.25, output: 1.25 } } },
    });
    try {
      fs.mkdirSync(path.join(docs, "content", "use"), { recursive: true });
      fs.writeFileSync(path.join(docs, "content", "toc.json"), JSON.stringify({ sections: [{ id: "use", groups: [{ pages: [{ id: "use/orders", template: "screen" }] }] }] }));
      fs.writeFileSync(path.join(docs, "content", "use", "orders.md"), "existing content\n");

      assert.equal(usage(["log", "--project", docs, "--brief", "writing-batch", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "9000", "--pages", "use/orders", "--phase", "5"], docs).code, 0);
      assert.equal(usage(["log", "--project", docs, "--brief", "triage", "--agent", "doc-kit-triage", "--model", "haiku", "--tokens", "400", "--pages", "use/orders", "--phase", "4"], docs).code, 0);

      const r = usage(["report", "--project", docs], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^Usage report \(2 entries\)/);
      assert.match(r.out, /total: 9400 tokens/);
      assert.match(r.out, /By phase:\n {2}5: 9000\n {2}4: 400/);
      assert.match(r.out, /By brief:\n {2}writing-batch: 9000\n {2}triage: 400/);
      assert.match(r.out, /By agent type:\n {2}doc-kit-writer: 9000\n {2}doc-kit-triage: 400/);
      assert.match(r.out, /By model:\n {2}sonnet: 9000\n {2}haiku: 400/);
      assert.match(r.out, /By page:\n {2}use\/orders: 9400/);
      assert.match(r.out, /Average tokens per page: 9400 \(1 page\(s\)\)/);
      assert.match(r.out, /sonnet: \d+\.\d{4} EUR \(from 9000 logged token\(s\), approximate: no input\/output split\)/);
      assert.match(r.out, /haiku: \d+\.\d{4} EUR \(from 400 logged token\(s\), approximate: no input\/output split\)/);
      assert.match(r.out, /Gap with a fresh estimate:\n(.*\n)*? {2}writing-batch: logged 9000 tokens, estimate ~\d+ tokens \([+-]\d+%\)/);

      const j = usage(["report", "--project", docs, "--json"], docs);
      assert.deepEqual(JSON.parse(j.out), { file: path.join(docs, ".doc-kit", "usage.jsonl"), entries: 2, total: 9400 });
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("without llm.prices: no cost computed, no crash", () => {
    const docs = project({ language: "en" });
    try {
      usage(["log", "--project", docs, "--brief", "a", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "500"], docs);
      const r = usage(["report", "--project", docs], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /not estimated: set llm\.prices in doc\.config\.mjs/);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });
});

describe("usage.mjs scan", () => {
  test("tolerant: sums message.usage fields across .jsonl files (recursively), ignores everything else; missing folder -> exit 2", () => {
    const docs = project({ llm: { currency: "EUR", prices: { sonnet: { input: 3, output: 15 } } } });
    const transcripts = tempDir("doc-kit-transcripts-");
    try {
      fs.writeFileSync(
        path.join(transcripts, "session.jsonl"),
        [
          JSON.stringify({ type: "other", note: "no usage here" }),
          JSON.stringify({ message: { model: "claude-sonnet", usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 } } }),
          "not even json",
          JSON.stringify({ message: { usage: { input_tokens: 300, output_tokens: 40 } } }),
          "",
        ].join("\n"),
      );
      fs.mkdirSync(path.join(transcripts, "sub"), { recursive: true });
      fs.writeFileSync(path.join(transcripts, "sub", "other.txt"), "ignored, not .jsonl");

      const r = usage(["scan", "--project", docs, "--transcripts", transcripts], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /scanned 1 transcript file\(s\), 2 usage line\(s\): 2090 tokens/);

      const lines = fs
        .readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8")
        .trim()
        .split("\n");
      assert.equal(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.source, "scan");
      assert.equal(entry.files, 1);
      assert.equal(entry.lines, 2);
      assert.equal(entry.input_tokens, 1300);
      assert.equal(entry.output_tokens, 240);
      assert.equal(entry.cache_read_input_tokens, 500);
      assert.equal(entry.cache_creation_input_tokens, 50);
      assert.equal(entry.tokens, 2090);
      assert.ok(!("model" in entry), "scan does not tag a model (literal contract: usage fields only)");

      // Folded into the report's totals, but not into a priced cost line (no model tag).
      const report = usage(["report", "--project", docs], docs);
      assert.match(report.out, /total: 2090 tokens/);
      assert.match(report.out, /2090 scanned token\(s\) have no model tag and are not priced/);

      const missing = usage(["scan", "--project", docs, "--transcripts", path.join(transcripts, "nope")], docs);
      assert.equal(missing.code, 2);
      assert.match(missing.err, /transcripts folder not found/);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(transcripts, { recursive: true, force: true });
    }
  });

  test("a folder with no .jsonl usage at all: reported, no entry appended", () => {
    const docs = project();
    const transcripts = tempDir("doc-kit-transcripts-");
    try {
      fs.writeFileSync(path.join(transcripts, "empty.jsonl"), JSON.stringify({ hello: "world" }) + "\n");
      const r = usage(["scan", "--project", docs, "--transcripts", transcripts], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /scanned 1 transcript file\(s\): no message\.usage found/);
      assert.ok(!fs.existsSync(path.join(docs, ".doc-kit", "usage.jsonl")));
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(transcripts, { recursive: true, force: true });
    }
  });
});
