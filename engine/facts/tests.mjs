// `tests` source (ARCHITECTURE.md §6.9): test files, a rough count of tests per file, and an existing coverage
// report when one was committed. Never runs a test: only reads files already on disk.
//   item: { file, tests }, plus summary: { files, tests, coverage? }, and `unreadable` ({ file, reason }) when a
//   coverage report is there but cannot be read (the coverage is then unknown, not absent: AUDIT.md M14), or a test
//   file is over 512 KB or cannot be read (counted in `files`, its tests unknown).
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";
import { readListed } from "./code-files.mjs";

// Exported: reused by `quality` (ARCHITECTURE.md §6.13) to exclude test files from its maintainability measures.
export const TEST_FILE =
  /(\.(test|spec)\.[^./]+$)|(^|\/)(test_[^/]+\.py|[^/]+_test\.py)$|(^|\/)tests\/.*\.(py|js|ts|jsx|tsx|mjs|cjs)$/i;
const TEST_CALL = /\bit\(|\btest\(|\bdef test_/g;

/**
 * Line coverage percentage (0-100, one decimal) from an lcov, istanbul or Cobertura report, or null. A report that
 * cannot be parsed is listed in `unreadable`.
 */
function readCoverage(appDir, unreadable) {
  const lcov = path.join(appDir, "coverage", "lcov.info");
  if (fs.existsSync(lcov)) {
    const text = fs.readFileSync(lcov, "utf8");
    const sum = (re) => [...text.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
    const found = sum(/^LF:(\d+)/gm);
    return found ? Math.round((sum(/^LH:(\d+)/gm) / found) * 1000) / 10 : null;
  }
  const summary = path.join(appDir, "coverage", "coverage-summary.json");
  if (fs.existsSync(summary)) {
    try {
      return JSON.parse(fs.readFileSync(summary, "utf8")).total?.lines?.pct ?? null;
    } catch {
      unreadable.push({ file: "coverage/coverage-summary.json", reason: "json" });
      return null;
    }
  }
  const xml = path.join(appDir, "coverage.xml");
  if (fs.existsSync(xml)) {
    const m = /line-rate="([\d.]+)"/.exec(fs.readFileSync(xml, "utf8"));
    return m ? Math.round(Number(m[1]) * 1000) / 10 : null;
  }
  return null;
}

/**
 * The `tests` source: every test file with a rough count of tests (`it(`, `test(`, `def test_`), and a summary.
 * @returns {{ items: Array<{file,tests}>, summary: {files,tests,coverage?}, unreadable: Array<{file,reason}> }}
 */
export function collectTests(appDir) {
  const items = [];
  const unreadable = [];
  let total = 0;
  const files = listFiles(appDir).filter((f) => TEST_FILE.test(f));
  for (const rel of files) {
    const text = readListed(appDir, rel, unreadable);
    if (text === null) continue;
    const n = (text.match(TEST_CALL) || []).length;
    items.push({ file: rel, tests: n });
    total += n;
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  const coverage = readCoverage(appDir, unreadable);
  return {
    items,
    summary: { files: files.length, tests: total, ...(coverage === null ? {} : { coverage }) },
    unreadable,
  };
}
