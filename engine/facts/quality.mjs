// `quality` source (ARCHITECTURE.md §6.13): maintainability measures of the source files (tests, generated,
// vendored files and documentation projects excluded).
//   item: { file, lines, functions, longest, complexity, duplicated, todo }
//   summary: { files, lines, functions, duplicated, duplicationRatio, complexFunctions, complexRatio, bigFiles,
//              bigFilesRatio, testRatio, tooling: { linter, types, formatter, ci }, ratings: { duplication,
//              complexity, size, tests }, outdated? (--network) }
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { textIndex } from "./behaviour-common.mjs";
import { listFiles } from "./common.mjs";
import { readListed } from "./code-files.mjs";
import { collectTests, TEST_FILE } from "./tests.mjs";
import { createRegistryClient, isPrivatePackage, privateRegistries } from "./network.mjs";
import { oncePerPackage } from "../core/packages.mjs";
import { closingBrace, closingBraces } from "../util/js-scan.mjs";

const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py)$/;
const GENERATED = /\.min\.(js|css)$|\.generated\./i;
const BIG_FILE_LINES = 500;
const COMPLEX_FUNCTION = 15;
const DUPLICATE_WINDOW = 6;
const MIN_LINE_LENGTH = 4;

const TODO_RE = /\b(?:TODO|FIXME|HACK|XXX)\b/g;
// Approximate McCabe complexity (ARCHITECTURE.md §6.13): 1 + branches. `?` excludes `?.` (optional chaining) and
// `??` (nullish coalescing); Python's conditional expression reuses `if`/`else`, already counted by `\bif\b`.
const BRANCH_RE = /\bif\b|\bfor\b|\bwhile\b|\bcase\b|\bcatch\b|\bexcept\b|\belif\b|&&|\|\||\band\b|\bor\b|\?(?!\.|\?)/g;

const CONTROL_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "else",
  "do",
  "function",
  "return",
  "new",
  "typeof",
  "delete",
  "void",
  "throw",
  "class",
  "try",
  "finally",
  "case",
  "in",
  "of",
  "instanceof",
  "export",
  "import",
  "yield",
  "await",
]);

/** Branches + 1, over a slice of text (a function's body). */
function complexityOf(body) {
  return 1 + (body.match(BRANCH_RE) || []).length;
}

/**
 * The expressions of the functions of a file (test/tools/redos-worker.mjs, RULES.md S5): no two quantifiers that
 * read the same characters side by side (`\s*\*?\s*\w*\s*` is `\s*(?:\*\s*)?(?:\w+\s*)?`, `:\s*[^{;]+` is
 * `:[^{;]+`), a type annotation of 200 characters at most, and a method looked for from the start of a word only.
 */
export const QUALITY_PATTERNS = Object.freeze({
  FUNCTION: /\bfunction\s*(?:\*\s*)?(?:\w+\s*)?\([^()]*\)\s*(?::[^{;]{1,200})?\{/g,
  ARROW: /\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^()]*\)\s*(?::[^{;=]{1,200}?)?=>\s*\{/g,
  METHOD: /\b(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^()]*\)\s*(?::[^{;]{1,200})?\{/g,
  BRANCH: BRANCH_RE,
  TODO: TODO_RE,
});
/** The scans of the bodies that are not code, all together, in times the text (jsFunctions). */
const NOT_CODE_SCAN = 8;

/**
 * JavaScript/TypeScript functions (ARCHITECTURE.md §6.13): named/anonymous `function`, arrow functions assigned
 * to a name (`const f = (…) => { … }`, block body only), and methods (`name(…) { … }`, control-flow keywords
 * excluded). Regex-based, not a parser: good enough for a maintainability heuristic, like the rest of the kit.
 * Linear (RULES.md S5): the bodies that are code are matched in one pass (closingBraces), a body's branches are a
 * difference of counts, never a scan of the body; a header in a comment or a string is matched as before
 * (closingBrace reads it as code), those scans bounded together by NOT_CODE_SCAN times the text (past it, a body
 * runs to the end of the file).
 */
function jsFunctions(text) {
  const opens = new Set();
  const { FUNCTION, ARROW, METHOD } = QUALITY_PATTERNS;
  for (const re of [FUNCTION, ARROW, METHOD])
    for (const m of text.matchAll(re)) if (!CONTROL_KEYWORDS.has(m[1])) opens.add(m.index + m[0].length - 1);
  if (!opens.size) return [];
  const { lineOf } = textIndex(text);
  const code = closingBraces(text);
  let budget = NOT_CODE_SCAN * text.length;
  const closes = [...opens].map((open) => {
    if (code.has(open)) return [open, code.get(open)];
    const limit = Math.min(text.length, open + budget);
    const close = closingBrace(text, open, limit);
    budget -= (close < 0 ? limit : close) - open;
    return [open, close];
  });
  // before[i]: the branches that start before i. A branch never holds a brace, so those of a body are the ones that
  // start in it; a body never closed ends before the last character (as the slice did): the last such body is
  // counted on its own, the others are its count plus their branches before it.
  const before = new Int32Array(text.length + 1);
  for (const m of text.matchAll(BRANCH_RE)) before[m.index + 1]++;
  for (let i = 1; i <= text.length; i++) before[i] += before[i - 1];
  const tail = closes.reduce((last, [open, close]) => (close < 0 && open > last ? open : last), -1);
  const tailBranches = tail < 0 ? 0 : complexityOf(text.slice(tail + 1, text.length - 1)) - 1;
  return closes.map(([open, close]) => ({
    startLine: lineOf(open),
    endLine: lineOf(close < 0 ? text.length - 1 : close),
    complexity: 1 + (close < 0 ? before[tail] - before[open + 1] + tailBranches : before[close] - before[open + 1]),
  }));
}

/** Python functions (`def`), by indentation: a function's body ends at the next line no more indented than it. */
function pyFunctions(text) {
  const lines = text.split("\n");
  const defRe = /^(\s*)def\s+\w+\s*\(/;
  const funcs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = defRe.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      if (lines[j].match(/^\s*/)[0].length <= indent) break;
      end = j;
    }
    funcs.push({ startLine: i + 1, endLine: end + 1, complexity: complexityOf(lines.slice(i, end + 1).join("\n")) });
  }
  return funcs;
}

/** Functions of a file, by extension. */
export function functionsOf(file, text) {
  return file.endsWith(".py") ? pyFunctions(text) : jsFunctions(text);
}

const COMMENT_LINE = /^(\/\/|#|\*|\/\*)/;

/** Normalised line (collapsed white space), or null when it is a comment or shorter than MIN_LINE_LENGTH. */
function normalisedLine(line) {
  const n = line.trim().replace(/\s+/g, " ");
  if (!n || COMMENT_LINE.test(n) || n.length < MIN_LINE_LENGTH) return null;
  return n;
}

/**
 * Duplicated lines across every file (ARCHITECTURE.md §6.13): windows of DUPLICATE_WINDOW consecutive eligible
 * (normalised, non-comment, ≥ MIN_LINE_LENGTH) lines, hashed; a window found twice or more (anywhere in the
 * project, including twice in the same file) marks all its lines duplicated.
 * @returns {{ byFile: Map<string, Set<number>>, eligible: number }}
 */
function findDuplication(files) {
  const occurrences = new Map(); // hash -> Array<{ file, lines: number[] }>
  const eligibleByFile = new Map(); // file -> Array<{ line, text }>
  let eligible = 0;
  for (const { file, text } of files) {
    const lines = text.split("\n");
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      const n = normalisedLine(lines[i]);
      if (n !== null) kept.push({ line: i + 1, text: n });
    }
    eligibleByFile.set(file, kept);
    eligible += kept.length;
    for (let i = 0; i + DUPLICATE_WINDOW <= kept.length; i++) {
      const window = kept.slice(i, i + DUPLICATE_WINDOW);
      const hash = crypto
        .createHash("sha1")
        .update(window.map((w) => w.text).join("\n"))
        .digest("hex");
      const list = occurrences.get(hash) || [];
      list.push({ file, lines: window.map((w) => w.line) });
      occurrences.set(hash, list);
    }
  }
  const byFile = new Map();
  for (const list of occurrences.values()) {
    if (list.length < 2) continue;
    for (const { file, lines } of list) {
      const set = byFile.get(file) || new Set();
      for (const l of lines) set.add(l);
      byFile.set(file, set);
    }
  }
  return { byFile, eligible };
}

const LINTER_FILES = [
  /(^|\/)\.eslintrc(\..+)?$/,
  /(^|\/)eslint\.config\.(js|mjs|cjs|ts)$/,
  /(^|\/)ruff\.toml$/,
  /(^|\/)\.ruff\.toml$/,
  /(^|\/)\.flake8$/,
  /(^|\/)\.pylintrc$/,
];
const FORMATTER_FILES = [/(^|\/)\.prettierrc(\..+)?$/, /(^|\/)prettier\.config\.(js|mjs|cjs)$/];
const CI_FILES = [
  /^\.github\/workflows\/.+\.ya?ml$/,
  /(^|\/)\.gitlab-ci\.ya?ml$/,
  /(^|\/)azure-pipelines\.ya?ml$/,
  /(^|\/)\.circleci\/config\.ya?ml$/,
];
const TYPE_FILES = [/(^|\/)mypy\.ini$/, /(^|\/)\.mypy\.ini$/, /(^|\/)pyrightconfig\.json$/];

/** Tooling found (ARCHITECTURE.md §6.13): linter, types, formatter, CI — config files, plus a few content checks. */
function detectTooling(appDir, allFiles) {
  const has = (patterns) => allFiles.some((f) => patterns.some((p) => p.test(f)));
  let linter = has(LINTER_FILES);
  let types = has(TYPE_FILES);
  let formatter = has(FORMATTER_FILES);
  const ci = has(CI_FILES);
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(appDir, f), "utf8");
    } catch {
      return "";
    }
  };
  for (const f of allFiles) {
    if (/(^|\/)package\.json$/.test(f)) {
      try {
        const pkg = JSON.parse(read(f));
        if (pkg.eslintConfig) linter = true;
        if (pkg.prettier) formatter = true;
      } catch {
        /* malformed package.json: ignored here, reported elsewhere */
      }
    }
    if (/(^|\/)pyproject\.toml$/.test(f)) {
      const text = read(f);
      if (/\[tool\.(ruff|pylint)\]/.test(text)) linter = true;
      if (/\[tool\.(mypy|pyright)\]/.test(text)) types = true;
      if (/\[tool\.black\]/.test(text)) formatter = true;
    }
    if (/(^|\/)tsconfig(\..+)?\.json$/.test(f) && /"strict"\s*:\s*true/.test(read(f))) types = true;
  }
  return { linter, types, formatter, ci };
}

// --network (ARCHITECTURE.md §6.13): direct dependencies behind their latest version (majors behind), asked to the
// public registries through the network gateway (engine/facts/network.mjs): only the name of a public package is
// sent, never a private one (AUDIT.md S13).

/** First number of a version-like string ("^2.1.0" → 2), or null. */
function majorOf(version) {
  const m = /(\d+)/.exec(String(version ?? "").replace(/^[^\d]*/, ""));
  return m ? Number(m[1]) : null;
}

/**
 * Direct, public dependencies at least one major behind their latest published version.
 * @param {Array<{ name: string, ecosystem: string, version?: string|null, spec?: string, direct?: boolean }>} dependencies
 * @param {(url: string) => Promise<any>} fetchImpl
 * @param {{ registries: ReturnType<typeof privateRegistries>, concurrency?: number }} options
 */
async function countOutdated(dependencies, fetchImpl, { registries, concurrency = 8 }) {
  const sendable = dependencies.filter((d) => d.direct && !isPrivatePackage(d, registries));
  // Once a package (PEP 503 for pip), the item with an exact version first: a lower bound alone names no major.
  const direct = oncePerPackage(sendable);
  const client = createRegistryClient({ fetch: fetchImpl, registries });
  const queue = [...direct];
  let outdated = 0;
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      // The exact version, else a range that names the major in use ("^17.0.0", "~17.1", "~=17.0", "==17.*"): a
      // lower bound alone (">=1.26") says nothing of the version installed.
      const namesMajor = ["^", "~", "=="].some((op) =>
        String(item.spec ?? "")
          .trim()
          .startsWith(op),
      );
      const current = majorOf(item.version ?? (namesMajor ? item.spec : null));
      const latestMajor = majorOf(await client.latest(item));
      if (current != null && latestMajor != null && latestMajor > current) outdated++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, direct.length) }, worker));
  return outdated;
}

/** A to E (ARCHITECTURE.md §6.13): the first threshold `ratio` (0-1) does not exceed. */
export function rating(ratio, thresholds) {
  const grades = ["A", "B", "C", "D"];
  for (let i = 0; i < thresholds.length; i++) if (ratio <= thresholds[i]) return grades[i];
  return "E";
}

/**
 * The `quality` source: functions, their length and approximate complexity, duplication and TODOs, per file; a
 * project-wide summary with A-E ratings. Tests, generated, vendored files and documentation projects excluded.
 * @param {string} appDir
 * @param {object} [options]
 * @param {(url: string) => Promise<{ok,status}>} [options.fetch]   --network: outdated direct dependencies
 * @param {Array<{name,version,ecosystem,direct,spec?}>} [options.dependencies]   --network: already-collected `dependencies` items
 * @param {ReturnType<typeof privateRegistries>} [options.registries]   --network: what is declared private; read from
 *   the application alone when absent (a private name is never sent)
 * @returns {Promise<{ items: Array<object>, summary: object, unreadable: Array<{ file: string, reason: string }> }>}
 *   unreadable: a file over 512 KB or that cannot be read (readCode): counted in `files`, not measured
 */
export async function collectQuality(appDir, { fetch: fetchImpl, dependencies, registries } = {}) {
  const allFiles = listFiles(appDir);
  const files = allFiles.filter((f) => CODE_EXT.test(f) && !TEST_FILE.test(f) && !GENERATED.test(f));
  const unreadable = [];
  const read = files
    .map((file) => ({ file, text: readListed(appDir, file, unreadable) }))
    .filter((r) => r.text !== null);
  const { byFile: duplicatedByFile, eligible } = findDuplication(read);

  const items = [];
  let totalFunctions = 0;
  let complexFunctions = 0;
  // A file over 512 KB is not read: it is a big one.
  let bigFiles = unreadable.filter((u) => u.reason === "tooLarge").length;
  let totalDuplicated = 0;
  for (const { file, text } of read) {
    const lines = text.split("\n").length;
    const functions = functionsOf(file, text);
    const longest = functions.reduce((max, f) => Math.max(max, f.endLine - f.startLine + 1), 0);
    const complexity = functions.reduce((max, f) => Math.max(max, f.complexity), 0);
    const duplicated = duplicatedByFile.get(file)?.size || 0;
    const todo = (text.match(TODO_RE) || []).length;
    items.push({ file, lines, functions: functions.length, longest, complexity, duplicated, todo });
    totalFunctions += functions.length;
    complexFunctions += functions.filter((f) => f.complexity > COMPLEX_FUNCTION).length;
    if (lines > BIG_FILE_LINES) bigFiles += 1;
    totalDuplicated += duplicated;
  }
  items.sort((a, b) => a.file.localeCompare(b.file));

  const { summary: testsSummary } = collectTests(appDir);
  const testRatio = files.length ? testsSummary.files / files.length : null;
  const duplicationRatio = eligible ? totalDuplicated / eligible : 0;
  const complexRatio = totalFunctions ? complexFunctions / totalFunctions : 0;
  const bigFilesRatio = files.length ? bigFiles / files.length : 0;
  const ratings = {
    duplication: rating(duplicationRatio, [0.03, 0.05, 0.1, 0.2]),
    complexity: rating(complexRatio, [0.01, 0.03, 0.06, 0.1]),
    size: rating(bigFilesRatio, [0.01, 0.03, 0.06, 0.1]),
    tests: testRatio === null ? "E" : rating(1 - Math.min(testRatio / 0.5, 1), [0, 0.4, 0.7, 0.9]),
  };
  const summary = {
    files: files.length,
    lines: read.reduce((a, r) => a + r.text.split("\n").length, 0),
    functions: totalFunctions,
    duplicated: totalDuplicated,
    duplicationRatio: Math.round(duplicationRatio * 1000) / 1000,
    complexFunctions,
    complexRatio: Math.round(complexRatio * 1000) / 1000,
    bigFiles,
    bigFilesRatio: Math.round(bigFilesRatio * 1000) / 1000,
    testRatio: testRatio === null ? null : Math.round(testRatio * 1000) / 1000,
    tooling: detectTooling(appDir, allFiles),
    ratings,
  };
  if (fetchImpl && dependencies)
    summary.outdated = await countOutdated(dependencies, fetchImpl, {
      registries: registries ?? privateRegistries(appDir, { items: dependencies }),
    });
  return { items, summary, unreadable };
}
