// RULES.md M4: no real git and no browser in a unit or snapshot test. They go through the context seams (`exec`,
// `commit`, `launch`, `chromium`); a real browser is for test/e2e/. Like layers.test.mjs, a test of the sources:
// no file of test/unit or test/snapshot imports Playwright, launches a browser or starts git, outside the explicit
// allow-list of test/tools/seams.mjs. The control proves the matcher flags what it is meant to flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { ALLOWED, RULES, seamViolations } from "../tools/seams.mjs";

/** The test files of the folders, relative to the kit, with /. */
function testSources(folders) {
  return folders.flatMap((folder) =>
    fs
      .readdirSync(path.join(KIT_ROOT, "test", folder), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".mjs") && !f.split(path.sep).includes("__snapshots__"))
      .map((f) => `test/${folder}/${f.split(path.sep).join("/")}`),
  );
}

test("positive control: the matcher flags a real git, Playwright, a launched browser and the real launcher", () => {
  const samples = {
    "a real git process": [
      'spawnSync("git", ["init"]);',
      "execFileSync('git', ['status'])",
      "await execFile(`git`, [])",
    ],
    "the real process launcher (defaultExec)": ['defaultExec("git", ["ls-files"], { cwd });'],
    "Playwright imported": [
      'import { chromium } from "playwright";',
      "const pw = await import('playwright-core');",
      'import { test } from "@playwright/test";',
    ],
    "a browser launched": [
      "browser = await chromium.launch({ headless: true });",
      "await firefox.launchPersistentContext(d)",
    ],
  };
  for (const { name } of RULES) {
    assert.ok(samples[name], `a sample for the rule “${name}”`);
    for (const sample of samples[name])
      assert.deepEqual(
        seamViolations(sample).map((v) => v.rule),
        [name],
        sample,
      );
  }
});

test("what is not a violation: a fake exec, a comment, git named in a text, a node process", () => {
  for (const text of [
    "const exec = (bin, args) => (bin === 'git' ? { status: 0, stdout: '' } : null);",
    '// spawnSync("git", ["init"]) is what the kit never does',
    ' * import { chromium } from "playwright"',
    'spawnSync(process.execPath, [SCRIPT, "check"], { encoding: "utf8" });',
    "assert.match(r.out, /playwright install chromium/);",
    "const regex = /spawn(Sync)?\\(\\s*[\"']git[\"']/;",
  ])
    assert.deepEqual(seamViolations(text), [], text);
});

test("no test of test/unit or test/snapshot starts git or loads a browser, outside the allow-list", () => {
  const found = [];
  for (const file of testSources(["unit", "snapshot"])) {
    const allowed = ALLOWED[file] || [];
    for (const { line, rule } of seamViolations(fs.readFileSync(path.join(KIT_ROOT, file), "utf8")))
      if (!allowed.includes(rule)) found.push(`${file}:${line}: ${rule}`);
  }
  assert.deepEqual(
    found,
    [],
    "go through the seams (exec, commit, launch, chromium); a real browser belongs to test/e2e/",
  );
});

test("the allow-list names files that exist and rules that exist, and every entry is still used", () => {
  const names = RULES.map((r) => r.name);
  for (const [file, rules] of Object.entries(ALLOWED)) {
    assert.ok(fs.existsSync(path.join(KIT_ROOT, file)), `${file} exists`);
    assert.ok(
      rules.every((r) => names.includes(r)),
      `${file}: known rules`,
    );
  }
  // security.test.mjs really calls the real launcher: the exemption would otherwise be dead.
  const text = fs.readFileSync(path.join(KIT_ROOT, "test/unit/security.test.mjs"), "utf8");
  assert.ok(seamViolations(text).some((v) => v.rule === "the real process launcher (defaultExec)"));
});
