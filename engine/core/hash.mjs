// Normalised hashing (ARCHITECTURE.md §6.10, §2.1): the reference, sync.json, stays stable across platforms
// (CRLF/LF) and reruns, and only changes when content that matters changes.
import fs from "node:fs";
import { createHash } from "node:crypto";

/** Bytes scanned to decide whether a file is binary (a NUL byte in them). */
const BINARY_SCAN = 8192;

/**
 * SHA-256 of text, first 16 hexadecimal characters. A leading BOM is removed, CRLF and CR normalised to LF. A
 * Buffer with a NUL byte in its first 8 KB is hashed as is (binary): line-ending normalisation would corrupt it.
 * @param {string|Buffer} text
 */
export function hashText(text) {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(String(text), "utf8");
  const binary = buf.subarray(0, BINARY_SCAN).includes(0);
  const hash = createHash("sha256");
  if (binary) hash.update(buf);
  else {
    let s = buf.toString("utf8");
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    hash.update(s.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
  }
  return hash.digest("hex").slice(0, 16);
}

/** Hash of a file, or null when it does not exist. */
export function hashFile(abs) {
  if (!fs.existsSync(abs)) return null;
  return hashText(fs.readFileSync(abs));
}

/**
 * Deterministic JSON of any value: object keys sorted recursively, `RegExp` → its source text, a function → its
 * source text, `undefined` properties omitted (a helper passing an optional argument through, e.g. `{ css,
 * caption: undefined }`).
 */
export function stableStringify(value) {
  const ser = (v) => {
    if (v === undefined) return undefined;
    if (v === null) return "null";
    if (v instanceof RegExp) return JSON.stringify(v.toString());
    if (typeof v === "function") return JSON.stringify(v.toString());
    if (Array.isArray(v)) return `[${v.map((x) => ser(x) ?? "null").join(",")}]`;
    if (typeof v === "object") {
      const keys = Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${ser(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  return ser(value) ?? "null";
}

/** Hash of a normalised capture plan entry, without its `file` (the plan file name, added when the plans are loaded). */
export const hashPlanEntry = (entry) => hashText(stableStringify({ ...entry, file: undefined }));
