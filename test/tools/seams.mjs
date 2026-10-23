// What a unit or snapshot test must never do (RULES.md M4): start the real git of the machine, or load Playwright and
// launch a browser. They go through the context seams (`exec`, `commit`, `launch`, `chromium`); a real browser
// belongs to test/e2e/. test/unit/seams.test.mjs scans the sources with these rules.

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
 * The lines of a source that break a rule (comment lines are not code).
 * @param {string} text
 * @returns {{ line: number, rule: string }[]}
 */
export function seamViolations(text) {
  const found = [];
  text.split("\n").forEach((code, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) return;
    for (const { name, re } of RULES) if (re.test(code)) found.push({ line: i + 1, rule: name });
  });
  return found;
}

/**
 * The files (relative to the kit, with /) where a rule is the very thing under test, each with the rules it may break
 * and why. Anything else goes through a seam.
 */
export const ALLOWED = {
  // riskyGitConfig / defaultExec on a repository whose configuration names a program: the real launcher must refuse
  // git there (status 128, `refused`) without starting any process. The call is the thing under test.
  "test/unit/security.test.mjs": ["the real process launcher (defaultExec)"],
  // The samples of the positive control, written as text to be matched.
  "test/unit/seams.test.mjs": RULES.map((r) => r.name),
};
