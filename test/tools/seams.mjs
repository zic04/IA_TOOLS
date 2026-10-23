// What a unit or snapshot test must never do (RULES.md M4): start the real git of the machine, or load Playwright and
// launch a browser. They go through the context seams (`exec`, `commit`, `launch`, `chromium`); a real browser
// belongs to test/e2e/. Nor may the engine start a process itself outside its two git helpers with an `exec` seam
// (ENGINE_RULES). test/unit/seams.test.mjs scans the sources with these rules.

/** The rules: a name and the expression a line of a test source must not match. */
export const RULES = [
  {
    name: "a real git process",
    re: /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(\s*["'`]git(?:\.exe)?["'`]/,
  },
  { name: "the real process launcher (defaultExec)", re: /\bdefaultExec\s*\(/ },
  {
    name: "Playwright imported",
    // A statement, not a sample text inside a string: `import … from "playwright"`, `const x = await import("playwright")`.
    re: /^\s*(?:import\b[^'"`]*|(?:const|let|var)\s+[^=]+=\s*(?:await\s+)?(?:import|require)\s*\(\s*|(?:await\s+)?import\s*\(\s*)["'](?:playwright|playwright-core|@playwright\/test)["']/,
  },
  { name: "a browser launched", re: /\b(?:chromium|firefox|webkit)\s*\.\s*launch\w*\s*\(/ },
];

/**
 * What a source of engine/ must not do: start a process itself. The engine reaches git and the external tools through
 * the `exec` it is given (the context's `ctx.exec`, hardened by `defaultExec`; a fake in the tests), so that no unit
 * test starts the machine's git through it.
 */
export const ENGINE_RULES = [
  {
    name: "a process started by the engine itself",
    // `import … from`, `export … from` (one line or the last line of several), import(), require(); with or without
    // `node:`, any quote.
    re: /\bfrom\s*["'`](?:node:)?child_process["'`]|\b(?:import|require)\s*\(\s*["'`](?:node:)?child_process["'`]\s*\)/,
  },
];

/**
 * The files of engine/ that start a process themselves, and why. Each git helper there takes an `exec` and calls it
 * when it is given (`exec("git", …)`, checked by seams.test.mjs): its own hardened spawnSync is only the default.
 */
export const ENGINE_ALLOWED = {
  // git(), isIgnored(), isTracked(): spawnSync of git when no `exec` is given; openBrowser(): the machine's browser.
  "engine/dev/environment.mjs": ENGINE_RULES.map((r) => r.name),
  // trackedByGit(): spawnSync of git when no `exec` is given.
  "engine/check/secrets.mjs": ENGINE_RULES.map((r) => r.name),
};

/**
 * The lines of a source that break a rule (comment lines are not code).
 * @param {string} text
 * @param {{ name: string, re: RegExp }[]} [rules]   RULES (a test source) or ENGINE_RULES (a source of engine/)
 * @returns {{ line: number, rule: string }[]}
 */
export function seamViolations(text, rules = RULES) {
  const found = [];
  text.split("\n").forEach((code, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) return;
    for (const { name, re } of rules) if (re.test(code)) found.push({ line: i + 1, rule: name });
  });
  return found;
}

/**
 * The files (relative to the kit, with /) where a rule is the very thing under test, each with the rules it may break
 * and why. Anything else goes through a seam.
 */
export const ALLOWED = {
  // riskyGitConfig / defaultExec on a repository whose configuration names a program: the real launcher must refuse
  // git there (status 128, `refused`) without starting any process. The call is the thing under test. The engine's
  // own fallbacks (git, isTracked, trackedByGit without an exec) are checked there the same way, no rule needed.
  "test/unit/security.test.mjs": ["the real process launcher (defaultExec)"],
  // The samples of the positive control, written as text to be matched.
  "test/unit/seams.test.mjs": RULES.map((r) => r.name),
};
