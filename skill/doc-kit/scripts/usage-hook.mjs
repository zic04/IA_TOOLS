#!/usr/bin/env node
// Claude Code hook (SubagentStop): records each AI agent's tokens, model and duration in the documentation
// project's production statistics, usage/<version>.jsonl (ARCHITECTURE.md §6.14), so that nobody has to call
// `usage.mjs log` by hand. Installed by `doc-kit skill install --hooks`.
//
// Input (stdin, from Claude Code): { session_id, agent_id, agent_type, agent_transcript_path, cwd, … }.
// The agent's transcript is read tolerantly (its format is internal to Claude Code): each API response counts
// once, its output at least what it wrote (transcript-usage.mjs); the model is the one most of those responses
// name; the duration runs from the first to the last `timestamp`. Anything unreadable is skipped.
//
// The documentation project: $DOC_KIT_PROJECT, else the first folder holding doc.config.mjs from the session's
// folder upwards, else <cwd>/docs/manual (where `doc-kit init` puts it). Nothing is written when there is no
// project or no usage/ folder. Always exits 0: a statistics hook must never block an agent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, readVersion } from "./common.mjs";
import { modelName, responseTally } from "./transcript-usage.mjs";

/**
 * Sums of a transcript (JSONL text): tokens (`outEstimated`, the part of `out` estimated from what the responses
 * wrote, only when there is one), model, duration, number of API responses.
 */
export function transcriptUsage(text) {
  const tally = responseTally();
  const models = new Map();
  let first = null;
  let last = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(e?.timestamp);
    if (Number.isFinite(at)) {
      if (first === null || at < first) first = at;
      if (last === null || at > last) last = at;
    }
    const added = tally.add(e, typeof e?.uuid === "string" && e.uuid ? e.uuid : line);
    const model = modelName(e?.message?.model);
    if (added?.first && model) models.set(model, (models.get(model) || 0) + 1);
  }
  const sums = tally.totals();
  const tokens = {
    in: sums.input_tokens,
    out: sums.output_tokens,
    cacheRead: sums.cache_read_input_tokens,
    cacheWrite: sums.cache_creation_input_tokens,
    ...(sums.output_estimated ? { outEstimated: sums.output_estimated } : {}),
  };
  const model = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { tokens, model, ms: first !== null && last !== null ? last - first : 0, messages: sums.responses };
}

/** The documentation project for a session folder, or null. */
export function projectFor(cwd, env = process.env) {
  if (env.DOC_KIT_PROJECT) {
    const dir = path.resolve(cwd || ".", env.DOC_KIT_PROJECT);
    return fs.existsSync(path.join(dir, "doc.config.mjs")) ? dir : null;
  }
  let dir = path.resolve(cwd || ".");
  for (;;) {
    if (fs.existsSync(path.join(dir, "doc.config.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const nested = path.join(path.resolve(cwd || "."), "docs", "manual");
  return fs.existsSync(path.join(nested, "doc.config.mjs")) ? nested : null;
}

/**
 * Records one agent. Returns the line written, or null (no project, no usage/, nothing measured).
 * @param {object} input  the hook's JSON input
 */
export async function recordAgent(input, { env = process.env, now = new Date() } = {}) {
  if (env.DOC_KIT_STATS === "0") return null;
  const root = projectFor(input.cwd, env);
  if (!root) return null;
  const dir = path.join(root, "usage");
  if (!fs.existsSync(dir)) return null;
  let text;
  try {
    text = fs.readFileSync(input.agent_transcript_path, "utf8");
  } catch {
    return null;
  }
  const u = transcriptUsage(text);
  if (!u.messages) return null;
  let version = "unversioned";
  let phase = "create";
  try {
    const config = await loadConfig(root);
    version = readVersion(root, config) || version;
    if (fs.existsSync(path.join(root, config.paths?.sync || ".", "sync.json"))) phase = "update";
  } catch {
    // an unreadable configuration: the line is still worth keeping
  }
  const line = {
    at: now.toISOString(),
    version,
    run: `agent-${input.agent_id || input.session_id || "unknown"}`,
    command: "agent",
    phase,
    actor: "agent",
    step: input.agent_type === "doc-kit-triage" ? "update" : "generate",
    sub: input.agent_type || "agent",
    ms: u.ms,
    model: u.model,
    tokens: u.tokens,
  };
  const file = path.join(dir, `${String(version).replace(/[^\w.+-]/g, "_")}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
  return line;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    try {
      await recordAgent(JSON.parse(raw || "{}"));
    } catch {
      // never block the agent
    }
    process.exit(0);
  });
}
