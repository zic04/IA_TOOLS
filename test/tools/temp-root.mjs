// A temporary root of its own for one run of test/run.mjs (RULES.md M3, M4): the test processes get TMPDIR, TMP and
// TEMP pointing to a fresh folder, so every temporary folder a test makes (tempDir, os.tmpdir()) lands in it. After
// the run, whatever is left in it is a test that did not clean up: the names are printed and the run fails. The
// root is then removed, so a leak never piles up in the real temporary folder. The pure part is here, the file
// system comes in through `io` (test/unit/temp-root.test.mjs).

/** The environment the test processes get: the same one, with the three temporary-folder variables set to `root`. */
export function tempEnv(env, root) {
  return { ...env, TMPDIR: root, TMP: root, TEMP: root };
}

/**
 * Runs `run(env)` in a fresh temporary root, then lists and removes what is left.
 * @param {object} p
 * @param {Record<string,string|undefined>} p.env    the environment to start from
 * @param {boolean} [p.tolerate]  end-to-end runs: Chromium and git write in the temporary folder of the machine
 *                                and may keep files a moment; the leftovers are printed but do not fail the run
 * @param {() => string} p.make                      creates the root, returns its path
 * @param {(root: string) => string[]} p.list        names directly in the root
 * @param {(root: string) => void} p.remove          removes the root with everything in it
 * @param {(env: Record<string,string|undefined>) => number} p.run   the test run; its exit code
 * @param {(line: string) => void} p.log
 * @returns {number} the exit code: that of the run, or 1 when it passed but left something behind
 */
export function withTempRoot({ env, tolerate = false, make, list, remove, run, log }) {
  const root = make();
  let code;
  let left;
  try {
    code = run(tempEnv(env, root));
    left = list(root).sort();
  } finally {
    try {
      remove(root);
    } catch {
      /* a folder a process still holds (Windows) is left to the system */
    }
  }
  if (!left.length) return code;
  log(
    `✗ ${left.length} temporary file(s) left behind by the tests (a test must remove what it creates, even on failure):`,
  );
  for (const name of left) log(`    ${name}`);
  if (tolerate) {
    log("  (end-to-end run: tolerated, the browser may keep files)");
    return code;
  }
  return code === 0 ? 1 : code;
}
