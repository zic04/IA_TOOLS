// RULES.md M4: no real git and no browser in a unit or snapshot test. They go through the context seams (`exec`,
// `commit`, `launch`, `chromium`); a real browser is for test/e2e/. Like layers.test.mjs, a test of the sources:
// no file of test/unit or test/snapshot imports Playwright, launches a browser or starts git, outside the explicit
// allow-list of test/tools/seams.mjs; no file of engine/ starts a process itself, outside its two git helpers that
// take an `exec` (ENGINE_ALLOWED). The controls prove the matchers flag what they are meant to flag.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { ALLOWED, ENGINE_ALLOWED, ENGINE_RULES, RULES, seamViolations } from "../tools/seams.mjs";

/** The .mjs files of a folder of the kit (`test/unit`, `engine`), relative to the kit, with /. */
function sourcesOf(folder) {
  return fs
    .readdirSync(path.join(KIT_ROOT, folder), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".mjs") && !f.split(path.sep).includes("__snapshots__"))
    .map((f) => `${folder}/${f.split(path.sep).join("/")}`);
}

/** The test files of the folders, relative to the kit, with /. */
const testSources = (folders) => folders.flatMap((folder) => sourcesOf(`test/${folder}`));

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

describe("the engine starts no process itself, outside its two git helpers with an exec seam", () => {
  const [{ name }] = ENGINE_RULES;
  const flagged = (text) => seamViolations(text, ENGINE_RULES).map((v) => v.rule);

  test("positive control: the matcher flags every import, re-export and require of child_process", () => {
    for (const sample of [
      'import { spawnSync } from "node:child_process";',
      "import cp from 'node:child_process';",
      'import { spawn } from "child_process";',
      "import { execFile } from `node:child_process`;",
      '} from "node:child_process";',
      'export { spawn } from "node:child_process";',
      'const { spawn } = await import("node:child_process");',
      "const cp = await import('child_process');",
      "const cp = require('child_process');",
      'const cp = require("node:child_process");',
    ])
      assert.deepEqual(flagged(sample), [name], sample);
  });

  test("what is not a violation: child_process named in a text, a comment, the launcher given to a helper", () => {
    for (const text of [
      'if (!text.includes("child_process")) return lines;',
      '// import { spawnSync } from "node:child_process" is what a module of engine/ never does',
      'const r = exec("git", ["ls-files"], { cwd: dir });',
      'import { git, isTracked } from "../dev/environment.mjs";',
    ])
      assert.deepEqual(flagged(text), [], text);
  });

  test("no file of engine/ outside the allow-list starts a process", () => {
    const found = [];
    for (const file of sourcesOf("engine")) {
      const allowed = ENGINE_ALLOWED[file] || [];
      for (const { line, rule } of seamViolations(fs.readFileSync(path.join(KIT_ROOT, file), "utf8"), ENGINE_RULES))
        if (!allowed.includes(rule)) found.push(`${file}:${line}: ${rule}`);
    }
    assert.deepEqual(found, [], "take an `exec` (ctx.exec, cli/common.mjs) and call it, as engine/sync/git.mjs does");
  });

  test("every allowed file still starts a process, and calls the exec it is given for git", () => {
    for (const file of Object.keys(ENGINE_ALLOWED)) {
      const text = fs.readFileSync(path.join(KIT_ROOT, file), "utf8");
      assert.ok(seamViolations(text, ENGINE_RULES).length > 0, `${file}: the exemption is still used`);
      assert.match(text, /\bexec\("git",/, `${file}: the exec seam`);
    }
  });
});
