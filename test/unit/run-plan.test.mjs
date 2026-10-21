// How test/run.mjs runs the files (test/tools/run-plan.mjs): the files that measure time after the others, one at a
// time, one that fails run once more alone; any other failure counts at once; end-to-end files one at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPlan, testFiles } from "../tools/run-plan.mjs";

const CLOCK = "performance" + ".now()";
const TEXTS = {
  "a.test.mjs": "plain",
  "timed.test.mjs": `const t = ${CLOCK};`,
  "redos.test.mjs": 'import "../tools/redos-worker.mjs";',
  "b.test.mjs": "plain",
};
/** The plan run with exit codes given per call (by the files of the call), what was run and logged. */
function plan(codes = {}, { e2e = false, files = Object.keys(TEXTS) } = {}) {
  const calls = [];
  const logs = [];
  const seen = {};
  const code = runPlan({
    files,
    e2e,
    read: (f) => TEXTS[f],
    run: (list, options) => {
      const key = list.join(" ");
      calls.push([key, options.join(" ")]);
      const n = (seen[key] = (seen[key] ?? 0) + 1);
      const c = codes[key];
      return Array.isArray(c) ? (c[n - 1] ?? 0) : (c ?? 0);
    },
    log: (l) => logs.push(l),
  });
  return { code, calls, logs };
}

test("the others together first, then each file that measures time alone, in their order", () => {
  const r = plan();
  assert.equal(r.code, 0);
  assert.deepEqual(r.calls, [
    ["a.test.mjs b.test.mjs", ""],
    ["timed.test.mjs", ""],
    ["redos.test.mjs", ""],
  ]);
  assert.deepEqual(r.logs, []);
});

test("a file that measures time and fails once: run once more, alone, and said; passing then, the run passes", () => {
  const r = plan({ "timed.test.mjs": [1, 0] });
  assert.equal(r.code, 0);
  assert.deepEqual(
    r.calls.map((c) => c[0]),
    ["a.test.mjs b.test.mjs", "timed.test.mjs", "timed.test.mjs", "redos.test.mjs"],
  );
  assert.deepEqual(r.logs, ["↻ timed.test.mjs: a file that measures time failed; run once more, alone"]);
});

test("failing twice, it fails the run; any other failure counts at once, without a second run", () => {
  assert.equal(plan({ "redos.test.mjs": [1, 1] }).code, 1);
  const other = plan({ "a.test.mjs b.test.mjs": 1 });
  assert.equal(other.code, 1);
  assert.equal(other.calls.filter((c) => c[0] === "a.test.mjs b.test.mjs").length, 1);
  assert.equal(plan({ "a.test.mjs b.test.mjs": 1, "timed.test.mjs": [3, 3] }).code, 1, "the first failure's code");
  assert.equal(plan({ "timed.test.mjs": [3, 3] }).code, 3);
});

test("end-to-end files: all in one run, one file at a time, never a second run", () => {
  const r = plan({ "a.test.mjs timed.test.mjs redos.test.mjs b.test.mjs": 1 }, { e2e: true });
  assert.equal(r.code, 1);
  assert.deepEqual(r.calls, [["a.test.mjs timed.test.mjs redos.test.mjs b.test.mjs", "--test-concurrency=1"]]);
});

test("only files that measure time: no empty run of the others", () => {
  const r = plan({}, { files: ["timed.test.mjs"] });
  assert.deepEqual(r.calls, [["timed.test.mjs", ""]]);
});

test("the files of the arguments: a folder's *.test.mjs, sorted; one file as it is; none for what is missing", () => {
  const root = path.join("R", "test");
  const unit = path.join(root, "unit");
  const tree = { [unit]: ["b.test.mjs", "a.test.mjs", "helper.mjs", path.join("sub", "c.test.mjs")] };
  const one = path.join(unit, "security.test.mjs");
  const io = {
    root,
    exists: (p) => p in tree || p === one,
    list: (dir) => {
      if (!(dir in tree)) throw new Error(`ENOTDIR: ${dir}`); // a file listed as a folder
      return tree[dir];
    },
  };
  assert.deepEqual(testFiles(["unit"], io), [
    path.join(unit, "a.test.mjs"),
    path.join(unit, "b.test.mjs"),
    path.join(unit, "sub", "c.test.mjs"),
  ]);
  assert.deepEqual(testFiles(["unit/security.test.mjs"], io), [one]);
  assert.deepEqual(testFiles(["snapshot", "unit/gone.test.mjs"], io), [], "nothing: test/run.mjs then exits with 2");
});

test("every npm script that runs tests goes through test/run.mjs: npm run test:security measures time too", () => {
  // The security tests run the ReDoS harness: a bare `node --test` would give a noisy measure no second run.
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const tests = Object.entries(scripts).filter(([name]) => name === "test" || name.startsWith("test:"));
  assert.ok(tests.some(([name]) => name === "test:security"));
  for (const [name, command] of tests) assert.match(command, /^node test\/run\.mjs /, name);
  // One file of test/ is a plan of its own: the runner takes it as it takes a folder.
  const security = /^node test\/run\.mjs (\S+)$/.exec(scripts["test:security"])?.[1];
  assert.ok(security && fs.existsSync(path.join(root, "test", security)), "the file test:security names exists");
  assert.match(fs.readFileSync(path.join(root, "test", security), "utf8"), /redos-worker/);
});
