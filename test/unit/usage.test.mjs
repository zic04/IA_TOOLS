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
  const r = spawnSync(process.execPath, [USAGE, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, DOC_KIT_URL: "", DOC_KIT_LANG: "" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** A minimal documentation project: just enough for loadConfig to succeed. */
function project(config = {}) {
  const docs = tempDir("doc-kit-usage-");
  fs.writeFileSync(
    path.join(docs, "doc.config.mjs"),
    `export default ${JSON.stringify({ product: { name: "Acme Orders" }, ...config }, null, 2)};\n`,
  );
  return docs;
}

describe("usage.mjs log", () => {
  test("appends one JSON line with the given fields; missing required option and a bad --tokens -> exit 2", () => {
    const docs = project({ language: "en" });
    try {
      const r = usage(
        [
          "log",
          "--project",
          docs,
          "--brief",
          "writing-batch",
          "--agent",
          "doc-kit-writer",
          "--model",
          "sonnet",
          "--tokens",
          "1200",
          "--tools",
          "8",
          "--duration",
          "9000",
          "--pages",
          "use/orders,use/settings",
          "--phase",
          "5",
        ],
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

      const badTokens = usage(
        ["log", "--project", docs, "--brief", "x", "--agent", "a", "--model", "m", "--tokens", "abc"],
        docs,
      );
      assert.equal(badTokens.code, 2);
      assert.match(badTokens.err, /--tokens must be a non-negative integer/);

      const negative = usage(
        ["log", "--project", docs, "--brief", "x", "--agent", "a", "--model", "m", "--tokens", "-5"],
        docs,
      );
      assert.equal(negative.code, 2);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("a second call appends, it never rewrites the file; French project speaks French", () => {
    const docs = project({ language: "fr" });
    try {
      usage(
        ["log", "--project", docs, "--brief", "a", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "10"],
        docs,
      );
      const r = usage(
        ["log", "--project", docs, "--brief", "b", "--agent", "doc-kit-triage", "--model", "haiku", "--tokens", "20"],
        docs,
      );
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
      assert.deepEqual(JSON.parse(j.out), {
        file: path.join(docs, ".doc-kit", "usage.jsonl"),
        entries: 0,
        total: 0,
        logged: 0,
        scanned: 0,
      });
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
      fs.writeFileSync(
        path.join(docs, "content", "toc.json"),
        JSON.stringify({ sections: [{ id: "use", groups: [{ pages: [{ id: "use/orders", template: "screen" }] }] }] }),
      );
      fs.writeFileSync(path.join(docs, "content", "use", "orders.md"), "existing content\n");

      assert.equal(
        usage(
          [
            "log",
            "--project",
            docs,
            "--brief",
            "writing-batch",
            "--agent",
            "doc-kit-writer",
            "--model",
            "sonnet",
            "--tokens",
            "9000",
            "--pages",
            "use/orders",
            "--phase",
            "5",
          ],
          docs,
        ).code,
        0,
      );
      assert.equal(
        usage(
          [
            "log",
            "--project",
            docs,
            "--brief",
            "triage",
            "--agent",
            "doc-kit-triage",
            "--model",
            "haiku",
            "--tokens",
            "400",
            "--pages",
            "use/orders",
            "--phase",
            "4",
          ],
          docs,
        ).code,
        0,
      );

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
      assert.match(
        r.out,
        /sonnet: \d+\.\d{4} EUR \(from 9000 logged token\(s\), approximate: no input\/output split\)/,
      );
      assert.match(r.out, /haiku: \d+\.\d{4} EUR \(from 400 logged token\(s\), approximate: no input\/output split\)/);
      assert.match(
        r.out,
        /Gap with a fresh estimate:\n(.*\n)*? {2}writing-batch: logged 9000 tokens, estimate ~\d+ tokens \([+-]\d+%\)/,
      );

      const j = usage(["report", "--project", docs, "--json"], docs);
      assert.deepEqual(JSON.parse(j.out), {
        file: path.join(docs, ".doc-kit", "usage.jsonl"),
        entries: 2,
        total: 9400,
        logged: 9400,
        scanned: 0,
      });
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
    }
  });

  test("without llm.prices: no cost computed, no crash", () => {
    const docs = project({ language: "en" });
    try {
      usage(
        ["log", "--project", docs, "--brief", "a", "--agent", "doc-kit-writer", "--model", "sonnet", "--tokens", "500"],
        docs,
      );
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
          JSON.stringify({
            message: {
              model: "claude-sonnet",
              usage: {
                input_tokens: 1000,
                output_tokens: 200,
                cache_read_input_tokens: 500,
                cache_creation_input_tokens: 50,
              },
            },
          }),
          "not even json",
          JSON.stringify({ message: { usage: { input_tokens: 300, output_tokens: 40 } } }),
          "",
        ].join("\n"),
      );
      fs.mkdirSync(path.join(transcripts, "sub"), { recursive: true });
      fs.writeFileSync(path.join(transcripts, "sub", "other.txt"), "ignored, not .jsonl");

      const r = usage(["scan", "--project", docs, "--transcripts", transcripts], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /scanned 1 transcript file\(s\), 2 response\(s\) over 2 usage line\(s\): 2090 tokens/);

      const lines = fs
        .readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8")
        .trim()
        .split("\n");
      assert.equal(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.source, "scan");
      assert.equal(entry.files, 1);
      assert.equal(entry.lines, 2);
      assert.equal(entry.responses, 2, "lines without a message id: one response each");
      assert.equal(entry.output_estimated, 0);
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

  test("a response over several lines, in two files, counted once; its output at least what it wrote ÷ 4", () => {
    // Claude Code writes one line per block of a response, each repeating its usage, and a partial output count
    // for a response that calls a tool (the pilot of 0.4.0: 620,529 tokens summed for 416,653 spent).
    const docs = project();
    const transcripts = tempDir("doc-kit-transcripts-");
    const line = (id, content, usage) => JSON.stringify({ type: "assistant", message: { id, content, usage } });
    const a = { input_tokens: 3, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 5 };
    const b = { input_tokens: 2, cache_creation_input_tokens: 50, cache_read_input_tokens: 1000, output_tokens: 120 };
    // The tool call's input is {"content":"y…"}: 3,990 characters and 14 of JSON (4,004), 4,044 with the thinking's 40.
    const call = [{ type: "tool_use", id: "toolu_1", name: "Write", input: { content: "y".repeat(3990) } }];
    try {
      fs.writeFileSync(
        path.join(transcripts, "agent.jsonl"),
        [line("msg_A", [{ type: "thinking", thinking: "x".repeat(40) }], a), line("msg_A", call, a)].join("\n"),
      );
      fs.mkdirSync(path.join(transcripts, "sub"));
      fs.writeFileSync(
        path.join(transcripts, "sub", "fork.jsonl"),
        // Its own response, whose recorded output is larger than what it wrote, and a copy of the other one's call.
        [line("msg_B", [{ type: "text", text: "z".repeat(400) }], b), line("msg_A", call, a)].join("\n"),
      );
      const r = usage(["scan", "--project", docs, "--transcripts", transcripts], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /scanned 2 transcript file\(s\), 2 response\(s\) over 4 usage line\(s\): 3186 tokens/);
      assert.match(r.out, /of which 1006 output token\(s\) estimated from what the responses wrote/);
      const entry = JSON.parse(fs.readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8"));
      assert.equal(entry.lines, 4);
      assert.equal(entry.responses, 2);
      assert.equal(entry.input_tokens, 5, "each response's input once");
      assert.equal(entry.cache_creation_input_tokens, 1050);
      assert.equal(entry.cache_read_input_tokens, 1000);
      assert.equal(entry.output_tokens, 1011 + 120, "⌈4,044 ÷ 4⌉ for the call, the recorded 120 for the text");
      assert.equal(entry.output_estimated, 1006);
      assert.equal(entry.tokens, 3186);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(transcripts, { recursive: true, force: true });
    }
  });

  test("each count the largest its lines give, whichever line holds it; nothing of a transcript's text kept", () => {
    const docs = project();
    const transcripts = tempDir("doc-kit-transcripts-");
    const marker = "TRANSCRIPT-TEXT-" + "7f3a"; // a text of the transcript: never in what scan writes or prints (S7)
    const line = (id, output, content = []) =>
      JSON.stringify({
        message: { id, content, usage: { input_tokens: 1, cache_read_input_tokens: 100, output_tokens: output } },
      });
    try {
      fs.writeFileSync(
        path.join(transcripts, "agent.jsonl"),
        [
          line("msg_up", 2, [{ type: "text", text: marker }]), // its count grows: a later line holds it
          line("msg_up", 300),
          line("msg_down", 300), // an earlier line holds it
          line("msg_down", 2, [{ type: "thinking", thinking: marker }]),
        ].join("\n"),
      );
      const r = usage(["scan", "--project", docs, "--transcripts", transcripts], docs);
      assert.equal(r.code, 0, r.err);
      const written = fs.readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8");
      const entry = JSON.parse(written);
      assert.equal(entry.responses, 2);
      assert.equal(entry.output_tokens, 600, "300 each, whichever of its lines gave it");
      assert.equal(entry.output_estimated, 0, "20 characters written: 5 tokens, under the 300 recorded");
      assert.equal(entry.input_tokens, 2);
      assert.equal(entry.cache_read_input_tokens, 200);
      for (const text of [written, r.out, r.err]) assert.ok(!text.includes(marker), "only counts come out");
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(transcripts, { recursive: true, force: true });
    }
  });

  test("a block copied with a signature or its keys in another order: what it wrote counts once", () => {
    const docs = project();
    const transcripts = tempDir("doc-kit-transcripts-");
    const usageOf = { input_tokens: 1, output_tokens: 1 };
    const line = (content) => JSON.stringify({ message: { id: "m1", content, usage: usageOf } });
    try {
      fs.writeFileSync(
        path.join(transcripts, "agent.jsonl"),
        [
          line([{ type: "thinking", thinking: "t".repeat(400) }]),
          line([{ thinking: "t".repeat(400), type: "thinking", signature: "sig" }]), // the same block, copied
          line([{ type: "text", text: "t".repeat(400) }]), // the same characters, another block
        ].join("\n"),
      );
      assert.equal(usage(["scan", "--project", docs, "--transcripts", transcripts], docs).code, 0);
      const entry = JSON.parse(fs.readFileSync(path.join(docs, ".doc-kit", "usage.jsonl"), "utf8"));
      assert.equal(entry.output_tokens, 200, "the thinking once (100) and the text (100)");
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(transcripts, { recursive: true, force: true });
    }
  });

  test("the same work logged then scanned: the total is the scan's, the logged floor apart, never added", () => {
    // The skill logs each agent (what Claude Code reports: its last context) and scans the transcripts at the end.
    const docs = project();
    const transcripts = tempDir("doc-kit-transcripts-");
    try {
      const log = ["log", "--project", docs, "--brief", "behaviour-analysis", "--agent", "doc-kit-analyst"];
      assert.equal(usage([...log, "--model", "sonnet", "--tokens", "70000"], docs).code, 0);
      const usageLine = { input_tokens: 10, cache_read_input_tokens: 300000, cache_creation_input_tokens: 38000 };
      fs.writeFileSync(
        path.join(transcripts, "agent.jsonl"),
        JSON.stringify({ message: { id: "m1", usage: { ...usageLine, output_tokens: 8000 } } }),
      );
      assert.equal(usage(["scan", "--project", docs, "--transcripts", transcripts], docs).code, 0);
      const r = usage(["report", "--project", docs], docs);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /total: 346010 tokens\n {2}logged by the agents: 70000 tokens — a floor of the same work/);
      const j = usage(["report", "--project", docs, "--json"], docs);
      assert.deepEqual(JSON.parse(j.out), {
        file: path.join(docs, ".doc-kit", "usage.jsonl"),
        entries: 2,
        total: 346010,
        logged: 70000,
        scanned: 346010,
      });
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
