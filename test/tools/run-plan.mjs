// How test/run.mjs runs the test files. Timing checks (RULES.md S5: a scanner of untrusted text stays linear,
// measured as the growth of its time) are skewed by the other files running at the same time, and now and then by
// the machine itself: the files that measure time run after the others, one at a time, and one that fails is run
// once more, alone. A scanner that really grows too fast fails both times; a noisy measure does not. Every other
// failure counts at once. End-to-end files share one browser per file: they all run one at a time, without a
// second run.
import path from "node:path";

/**
 * The test files the arguments name: each one a folder of test/ (its *.test.mjs files, recursively, sorted) or one
 * *.test.mjs file of it, taken as it is (npm run test:security); one that does not exist gives none.
 * @param {string[]} args
 * @param {{ root: string, exists: (p: string) => boolean, list: (dir: string) => string[] }} io
 * @returns {string[]}
 */
export function testFiles(args, { root, exists, list }) {
  return args.flatMap((arg) => {
    const target = path.join(root, arg);
    if (!exists(target)) return [];
    if (arg.endsWith(".test.mjs")) return [target];
    return list(target)
      .filter((f) => f.endsWith(".test.mjs"))
      .sort()
      .map((f) => path.join(target, f));
  });
}

/** A file that measures time: it reads the clock, or runs the ReDoS harness. */
const TIMING = /performance\.now\(|redos-worker/;

/**
 * @param {object} p
 * @param {string[]} p.files     the test files, in their order
 * @param {boolean} p.e2e        end-to-end files
 * @param {(file: string) => string} p.read    a file's text
 * @param {(files: string[], options: string[]) => number} p.run   runs node --test on files; its exit code
 * @param {(line: string) => void} p.log
 * @returns {number} the exit code: 0 when every file passed (a timing file on its second run at most)
 */
export function runPlan({ files, e2e, read, run, log }) {
  if (e2e) return run(files, ["--test-concurrency=1"]);
  const timing = files.filter((f) => TIMING.test(read(f)));
  const others = files.filter((f) => !timing.includes(f));
  let code = others.length ? run(others, []) : 0;
  for (const file of timing) {
    let status = run([file], []);
    if (status !== 0) {
      log(`↻ ${file}: a file that measures time failed; run once more, alone`);
      status = run([file], []);
    }
    if (status !== 0 && code === 0) code = status;
  }
  return code;
}
