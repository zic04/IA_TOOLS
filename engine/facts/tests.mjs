// `tests` source (ARCHITECTURE.md §6.9): test files, a rough count of tests per file, and an existing coverage
// report when one was committed. Never runs a test: only reads files already on disk.
//   item: { file, tests }, plus summary: { files, tests, coverage? }, and `unreadable` ({ file, reason }) when a
//   coverage report is there but cannot be read (the coverage is then unknown, not absent: AUDIT.md M14), or a test
//   file is over 512 KB or cannot be read (counted in `files`, its tests unknown).
import { listFiles, confinedReader } from "./common.mjs";
import { readListed } from "./code-files.mjs";

// Exported: reused by `quality` (ARCHITECTURE.md §6.13) to exclude test files from its maintainability measures.
export const TEST_FILE =
  /(\.(test|spec)\.[^./]+$)|(^|\/)(test_[^/]+\.py|[^/]+_test\.py)$|(^|\/)tests\/.*\.(py|js|ts|jsx|tsx|mjs|cjs)$/i;
const TEST_CALL = /\bit\(|\btest\(|\bdef test_/g;

/**
 * Line coverage percentage (0-100, one decimal) from an lcov, istanbul or Cobertura report, or null. A report that
 * cannot be parsed is listed in `unreadable`. A report is read whole, but only in the application, links followed
 * (confinedReader, SECURITY.md): one that leads out of it is not there.
 */
function readCoverage(appDir, unreadable) {
  const read = confinedReader(appDir, { maxSize: Infinity });
  const text = read("coverage/lcov.info");
  if (text !== null) {
    const sum = (re) => [...text.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
    const found = sum(/^LF:(\d+)/gm);
    return found ? Math.round((sum(/^LH:(\d+)/gm) / found) * 1000) / 10 : null;
  }
  const summary = read("coverage/coverage-summary.json");
  if (summary !== null) {
    try {
      return JSON.parse(summary).total?.lines?.pct ?? null;
    } catch {
      unreadable.push({ file: "coverage/coverage-summary.json", reason: "json" });
      return null;
    }
  }
  const xml = read("coverage.xml");
  if (xml !== null) {
    const m = /line-rate="([\d.]+)"/.exec(xml);
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
