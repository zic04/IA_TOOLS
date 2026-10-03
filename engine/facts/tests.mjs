// `tests` source (ARCHITECTURE.md §6.9): test files, a rough count of tests per file, and an existing coverage
// report when one was committed. Never runs a test: only reads files already on disk.
//   item: { file, tests }, plus summary: { files, tests, coverage? }
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";

// Exported: reused by `quality` (ARCHITECTURE.md §6.13) to exclude test files from its maintainability measures.
export const TEST_FILE = /(\.(test|spec)\.[^./]+$)|(^|\/)(test_[^/]+\.py|[^/]+_test\.py)$|(^|\/)tests\/.*\.(py|js|ts|jsx|tsx|mjs|cjs)$/i;
const TEST_CALL = /\bit\(|\btest\(|\bdef test_/g;

/** Line coverage percentage (0-100, one decimal) from an lcov, istanbul or Cobertura report, or null. */
function readCoverage(appDir) {
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
 * @returns {{ items: Array<{file,tests}>, summary: {files,tests,coverage?} }}
 */
export function collectTests(appDir) {
  const items = [];
  let total = 0;
  for (const rel of listFiles(appDir).filter((f) => TEST_FILE.test(f))) {
    const n = (fs.readFileSync(path.join(appDir, rel), "utf8").match(TEST_CALL) || []).length;
    items.push({ file: rel, tests: n });
    total += n;
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  const coverage = readCoverage(appDir);
  return { items, summary: { files: items.length, tests: total, ...(coverage === null ? {} : { coverage }) } };
}
