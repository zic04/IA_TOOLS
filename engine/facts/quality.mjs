// `quality` source (ARCHITECTURE.md §6.13): maintainability measures of the source files (tests, generated,
// vendored files and documentation projects excluded).
//   item: { file, lines, functions, longest, complexity, duplicated, todo }
//   summary: { files, lines, functions, duplicated, duplicationRatio, complexFunctions, complexRatio, bigFiles,
//              bigFilesRatio, testRatio, tooling: { linter, types, formatter, ci }, ratings: { duplication,
//              complexity, size, tests }, outdated? (--network) }
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lineAt } from "./api.mjs";
import { listFiles } from "./common.mjs";
import { collectTests, TEST_FILE } from "./tests.mjs";
import { closingBrace } from "../util/js-scan.mjs";

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

/** Index of the "}" matching the "{" at `openIndex`; the last index when it is never closed. */
function balancedBraces(text, openIndex) {
  const close = closingBrace(text, openIndex);
  return close < 0 ? text.length - 1 : close;
}

/** Branches + 1, over a slice of text (a function's body). */
function complexityOf(body) {
  return 1 + (body.match(BRANCH_RE) || []).length;
}

/**
 * JavaScript/TypeScript functions (ARCHITECTURE.md §6.13): named/anonymous `function`, arrow functions assigned
 * to a name (`const f = (…) => { … }`, block body only), and methods (`name(…) { … }`, control-flow keywords
 * excluded). Regex-based, not a parser: good enough for a maintainability heuristic, like the rest of the kit.
 */
function jsFunctions(text) {
  const opens = new Set();
  for (const m of text.matchAll(/\bfunction\s*\*?\s*\w*\s*\([^()]*\)\s*(?::\s*[^{;]+)?\{/g))
    opens.add(m.index + m[0].length - 1);
  for (const m of text.matchAll(/\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^()]*\)\s*(?::\s*[^{;=]+?)?=>\s*\{/g))
    opens.add(m.index + m[0].length - 1);
  for (const m of text.matchAll(
    /(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^()]*\)\s*(?::\s*[^{;]+)?\{/g,
  )) {
    if (CONTROL_KEYWORDS.has(m[1])) continue;
    opens.add(m.index + m[0].length - 1);
  }
  return [...opens].map((openIdx) => {
    const closeIdx = balancedBraces(text, openIdx);
    return {
      startLine: lineAt(text, openIdx),
      endLine: lineAt(text, closeIdx),
      complexity: complexityOf(text.slice(openIdx + 1, closeIdx)),
    };
  });
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
function functionsOf(file, text) {
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

// --network (ARCHITECTURE.md §6.13): direct dependencies behind their latest version (majors behind). Only the
// package name is sent (never a file content); the same registries as `dependencies --network` (ARCHITECTURE.md
// §6.9), but reading the latest version instead of checking mere existence.
const REGISTRY_LATEST = {
  npm: (name) => `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
  pip: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
};

/** First number of a version-like string ("^2.1.0" → 2), or null. */
function majorOf(version) {
  const m = /(\d+)/.exec(String(version ?? "").replace(/^[^\d]*/, ""));
  return m ? Number(m[1]) : null;
}

/** Latest published version of a direct dependency, or null (unknown ecosystem, 404, timeout, malformed answer). */
async function latestVersion(item, fetchImpl, timeoutMs) {
  const url = REGISTRY_LATEST[item.ecosystem]?.(item.name);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return item.ecosystem === "npm" ? data.version : data.info?.version;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Direct dependencies at least one major behind their latest published version. */
async function countOutdated(dependencies, fetchImpl, { concurrency = 8, timeoutMs = 5000 } = {}) {
  const direct = [...new Map(dependencies.filter((d) => d.direct).map((d) => [d.name, d])).values()]; // de-duplicated by name
  const queue = [...direct];
  let outdated = 0;
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const latest = await latestVersion(item, fetchImpl, timeoutMs);
      const current = majorOf(item.version);
      const latestMajor = majorOf(latest);
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
 * @param {Array<{name,version,ecosystem,direct}>} [options.dependencies]   --network: already-collected `dependencies` items
 * @returns {Promise<{ items: Array<object>, summary: object }>}
 */
export async function collectQuality(appDir, { fetch: fetchImpl, dependencies } = {}) {
  const allFiles = listFiles(appDir);
  const files = allFiles.filter((f) => CODE_EXT.test(f) && !TEST_FILE.test(f) && !GENERATED.test(f));
  const read = files.map((file) => ({ file, text: fs.readFileSync(path.join(appDir, file), "utf8") }));
  const { byFile: duplicatedByFile, eligible } = findDuplication(read);

  const items = [];
  let totalFunctions = 0;
  let complexFunctions = 0;
  let bigFiles = 0;
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
  if (fetchImpl && dependencies) summary.outdated = await countOutdated(dependencies, fetchImpl);
  return { items, summary };
}
