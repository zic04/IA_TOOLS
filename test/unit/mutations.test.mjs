// The kit's mutants (test/mutations/, RULES.md M16) stay runnable: each one still finds, once, the code it changes —
// a refactor that moves that code must move its mutant too — and names tests that exist. Running them is
// `npm run mutate` (test/tools/mutate.mjs), not `npm test`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadMutations, checkMutations, applyMutant, runsHere } from "../tools/mutation.mjs";
import { tempDir } from "../tools/helpers.mjs";

describe("the mutants of test/mutations", () => {
  test("every mutant finds its code once in its engine file and names tests that exist", async () => {
    const files = await loadMutations();
    assert.ok(files.length > 0, "there are mutants");
    assert.deepEqual(checkMutations(files), []);
  });
});

describe("the mutation tools (test/tools/mutation.mjs)", () => {
  test("a mutant applies when its code occurs exactly once, never otherwise", () => {
    assert.equal(applyMutant("a b c", { find: "b", replace: "x" }), "a x c");
    assert.equal(applyMutant("a b b", { find: "b", replace: "x" }), null, "twice: which one is not told");
    assert.equal(applyMutant("a c", { find: "b", replace: "x" }), null, "gone");
  });

  test("a mutant marked posix runs everywhere but on Windows; the mark needs its why", () => {
    const posix = { name: "m", find: "a", replace: "b", only: "posix", why: "a backslash is a name's character" };
    assert.deepEqual(
      ["win32", "linux", "darwin"].map((p) => runsHere(posix, p)),
      [false, true, true],
    );
    assert.equal(runsHere({ name: "m", find: "a", replace: "b" }, "win32"), true);
  });

  test("checkMutations names each problem: a target outside engine/, code gone or twice, no change, a missing test", () => {
    const root = tempDir("doc-kit-mutations-");
    try {
      fs.mkdirSync(path.join(root, "engine"), { recursive: true });
      fs.mkdirSync(path.join(root, "test", "unit"), { recursive: true });
      fs.writeFileSync(path.join(root, "engine", "x.mjs"), "const a = 1;\nconst b = 1;\n");
      fs.writeFileSync(path.join(root, "test", "unit", "x.test.mjs"), "");
      const tests = ["test/unit/x.test.mjs"];
      const problems = checkMutations(
        [
          { file: "outside.mjs", target: "cli/x.mjs", tests, mutants: [{ name: "m", find: "a", replace: "b" }] },
          {
            file: "x.mjs",
            target: "engine/x.mjs",
            tests,
            mutants: [
              { name: "fine", find: "const a = 1;", replace: "const a = 2;" },
              { name: "twice", find: "= 1;", replace: "= 2;" },
              { name: "gone", find: "const c", replace: "let c" },
              { name: "no change", find: "const a", replace: "const a" },
              { name: "no test", find: "const b = 1;", replace: "", tests: ["test/unit/missing.test.mjs"] },
              { name: "fine", find: "const b", replace: "let b" },
              { name: "posix without why", find: "b = 1", replace: "b = 2", only: "posix" },
            ],
          },
        ],
        root,
      );
      assert.deepEqual(problems, [
        "outside.mjs: target cli/x.mjs is no engine file",
        "x.mjs › twice: its code is found 2 times in engine/x.mjs",
        "x.mjs › gone: its code is found 0 times in engine/x.mjs",
        "x.mjs › no change: changes nothing",
        "x.mjs › no test: test test/unit/missing.test.mjs does not exist",
        "x.mjs › fine: a name given twice",
        'x.mjs › posix without why: only "posix", with its why',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
