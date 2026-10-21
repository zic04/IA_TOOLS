// The tokens of Claude Code's transcripts (JSONL; the format is internal to Claude Code and read tolerantly), for
// `usage.mjs scan` and the statistics hook (ARCHITECTURE.md §6.11, §6.14). Claude Code writes an API response over
// several lines, one per block (its thinking, its text, each tool call), each repeating the response's usage, and
// the output count of a response that calls a tool as it stood when the response began. So a response counts once
// (its `message.id`), each count the largest its lines give, and its output at least what it wrote (characters ÷ 4,
// the kit's estimate; `output_estimated` says how much of it comes from the estimate). Only counts come out: the
// text of a transcript (prompts, tool inputs, what an agent read) is never kept, printed or written (RULES.md S7).
import crypto from "node:crypto";

/**
 * A model's name as a transcript gives it, kept only when it reads as one (letters, digits, `.` `_` `:` `@` `-`, at
 * most 100): any other text of a transcript stays out of what is written.
 * @param {unknown} value
 * @returns {string|null}
 */
export function modelName(value) {
  return typeof value === "string" && /^[\w.:@-]{1,100}$/.test(value) ? value : null;
}

/** A block's digest: what tells two copies of it apart, without keeping its text. */
const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");

/** The counts of a usage object, as the API names them. */
const USAGE_KEYS = Object.freeze([
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
]);

/** What one block of a response wrote: its text, its thinking, a tool call's input; "" for anything else. */
function written(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (typeof block.thinking === "string") return block.thinking;
  if (block.type === "tool_use" && block.input !== undefined) return JSON.stringify(block.input) ?? "";
  return "";
}

/**
 * A tally of the API responses of one or more transcripts. `add(entry, fallback)` takes one parsed line: null when it
 * holds no usage count, else whether it starts a response (`fallback` names the response of a line without a
 * `message.id`). `totals()` sums them.
 */
export function responseTally() {
  /** @type {Map<string, { usage: Record<string, number>, blocks: Set<string>, chars: number }>} */
  const responses = new Map();
  let lines = 0;
  return {
    /**
     * @param {any} entry
     * @param {string} fallback
     * @returns {{ first: boolean } | null}
     */
    add(entry, fallback) {
      const message = entry?.message;
      const usage = message?.usage;
      if (!usage || typeof usage !== "object") return null;
      const counts = USAGE_KEYS.filter((key) => typeof usage[key] === "number");
      if (!counts.length) return null;
      lines++;
      const id = typeof message.id === "string" && message.id ? message.id : fallback;
      const first = !responses.has(id);
      const response = responses.get(id) ?? { usage: {}, blocks: new Set(), chars: 0 };
      for (const key of counts) response.usage[key] = Math.max(response.usage[key] ?? 0, usage[key]);
      for (const block of Array.isArray(message.content) ? message.content : []) {
        const text = written(block);
        if (!text) continue;
        // A block written again (the same response in another file, its signature or the order of its keys aside):
        // once. Kept by its id or a digest of what it wrote, never its text.
        const key = typeof block.id === "string" ? block.id : digest(`${block.type}\0${text}`);
        if (!response.blocks.has(key)) (response.blocks.add(key), (response.chars += text.length));
      }
      responses.set(id, response);
      return { first };
    },
    /**
     * @returns {{ input_tokens: number, output_tokens: number, cache_read_input_tokens: number,
     *   cache_creation_input_tokens: number, output_estimated: number, responses: number, lines: number }}
     */
    totals() {
      const sums = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      let estimated = 0;
      for (const { usage, chars } of responses.values()) {
        for (const key of USAGE_KEYS) sums[key] += usage[key] ?? 0;
        const more = Math.ceil(chars / 4) - (usage.output_tokens ?? 0);
        if (more > 0) ((estimated += more), (sums.output_tokens += more));
      }
      return { ...sums, output_estimated: estimated, responses: responses.size, lines };
    },
  };
}
