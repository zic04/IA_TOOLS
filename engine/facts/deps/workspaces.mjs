// The workspace members of a package.json (`workspaces`: "packages/*", "apps/**", "services/api", "!legacy"), as the
// npm readers take their direct dependencies from them (deps/npm.mjs). The application is untrusted: the folders
// are LISTED, never resolved from a pattern — only the folders under the lock's own folder, at most three deep,
// that no facts source walks (SKIP_DIRS, vendor/, target/, dot folders) and that are not links (a link could lead
// out of the application) — and each is compared with the patterns segment by segment, in the forms npm writes: a
// folder's name, "*", "**", or one "*" inside a name ("pkg-*", "*-web"), at most 100 characters a segment; any other
// form (several "*", "?", brackets, braces) is not followed. No regular expression is built from a pattern and each
// comparison is a prefix and a suffix: linear. Bounded: 50 distinct patterns of at most 8 segments, 2,000 folders
// looked at, 200 members.
import fs from "node:fs";
import path from "node:path";
import { SKIP_DIRS } from "../common.mjs";

const MAX_PATTERNS = 50;
const MAX_SEGMENTS = 8;
const MAX_SEGMENT = 100;
const MAX_CANDIDATES = 2000;
const MAX_DEPTH = 3;
const MAX_MEMBERS = 200;
const SKIP = new Set([...SKIP_DIRS, "vendor", "target"]);
/** The characters of the glob forms the kit does not follow. */
const UNFOLLOWED = ["?", "[", "]", "{", "}"];

/**
 * A pattern's segment as the kit reads it, compiled once: `{ any }` for "**", `{ name }` for a name, `{ prefix,
 * suffix }` around its one "*" ("*" alone: both empty) — or null, a form the kit does not follow.
 * @typedef {{ any?: boolean, name?: string, prefix?: string, suffix?: string }} Segment
 * @param {string} segment
 * @returns {Segment|null}
 */
function segmentOf(segment) {
  if (segment === "**") return { any: true };
  if (segment.length > MAX_SEGMENT || UNFOLLOWED.some((c) => segment.includes(c))) return null;
  const star = segment.indexOf("*");
  if (star < 0) return { name: segment };
  if (segment.indexOf("*", star + 1) >= 0) return null;
  return { prefix: segment.slice(0, star), suffix: segment.slice(star + 1) };
}

/** Does a folder's name match one segment (a name, "prefix*suffix")? A prefix and a suffix: linear. */
function segmentMatches(segment, name) {
  if (segment.name !== undefined) return segment.name === name;
  const { prefix, suffix } = segment;
  return name.length >= prefix.length + suffix.length && name.startsWith(prefix) && name.endsWith(suffix);
}

/**
 * Does a folder (its segments) match a pattern's segments, "**" standing for any number of folders? Read from the
 * pattern's end: `next[j]` says whether the segments after the current one match the folder from its j-th folder
 * on — a table of (8 + 1) × (depth + 1) cells at most, each computed once.
 * @param {Segment[]} pattern
 * @param {string[]} segments
 */
function pathMatches(pattern, segments) {
  const n = segments.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = pattern.length - 1; i >= 0; i--) {
    const cur = new Uint8Array(n + 1);
    const p = pattern[i];
    for (let j = n; j >= 0; j--) {
      if (p.any) cur[j] = next[j] || (j < n ? cur[j + 1] : 0);
      else cur[j] = j < n && next[j + 1] && segmentMatches(p, segments[j]) ? 1 : 0;
    }
    next = cur;
  }
  return next[0] === 1;
}

/** A pattern's segments ("./packages/x/" → ["packages", "x"]), or null when it leaves the folder, is too long, or
 * holds a form the kit does not follow. "**" twice in a row is one: it matches the same folders. */
function segmentsOf(pattern) {
  const parts = pattern.split("/").filter((s) => s && s !== ".");
  if (!parts.length || parts.length > MAX_SEGMENTS || parts.includes("..") || path.isAbsolute(pattern)) return null;
  /** @type {Segment[]} */
  const segments = [];
  for (const part of parts) {
    const segment = segmentOf(part);
    if (!segment) return null;
    if (!(segment.any && segments[segments.length - 1]?.any)) segments.push(segment);
  }
  return segments;
}

/**
 * The folders (as their segments) a list of workspace patterns keeps: matched by a pattern, by none that starts
 * with "!". The same pattern written twice counts once; past 50 distinct patterns, the others are not read.
 * @param {unknown[]} patterns
 * @param {string[][]} folders
 * @returns {string[][]}
 */
export function membersOf(patterns, folders) {
  const include = [];
  const exclude = [];
  for (const pattern of [...new Set(patterns.filter((p) => typeof p === "string"))].slice(0, MAX_PATTERNS)) {
    const negated = pattern.startsWith("!");
    const segments = segmentsOf(negated ? pattern.slice(1) : pattern);
    if (segments) (negated ? exclude : include).push(segments);
  }
  if (!include.length) return [];
  return folders
    .filter((f) => include.some((p) => pathMatches(p, f)) && !exclude.some((p) => pathMatches(p, f)))
    .slice(0, MAX_MEMBERS);
}

/** The folders under `dir` a workspace may be, as their segments: listed once, bounded, never a link. */
function candidates(dir) {
  const out = [];
  const visit = (abs, segments) => {
    if (segments.length >= MAX_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_CANDIDATES) return;
      if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const sub = [...segments, e.name];
      out.push(sub);
      visit(path.join(abs, e.name), sub);
    }
  };
  visit(dir, []);
  return out;
}

/**
 * The workspace folders of a package.json read in `dir` (absolute paths).
 * @param {string} dir
 * @param {any} pkg
 * @returns {string[]}
 */
export function workspaceFolders(dir, pkg) {
  const raw = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (!Array.isArray(raw)) return [];
  return membersOf(raw, candidates(dir)).map((c) => path.join(dir, ...c));
}
