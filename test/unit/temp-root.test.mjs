// How test/run.mjs finds the tests that leak (test/tools/temp-root.mjs): the test processes get a temporary root of
// their own; whatever is left in it after the run fails the run and is named, then the root is removed. The control
// runs the real thing on a real folder with a child process that leaves a file behind.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tempEnv, withTempRoot } from "../tools/temp-root.mjs";

/** withTempRoot on a fake file system; `left`: what the run leaves in the root; `code`: the run's exit code. */
function fake({ left = [], code = 0, tolerate = false, removeFails = false } = {}) {
  const logs = [];
  const seen = { env: null, removed: [] };
  const result = withTempRoot({
    env: { PATH: "/bin", TMPDIR: "/real" },
    tolerate,
    make: () => "/fresh-root",
    list: () => left,
    remove: (root) => {
      seen.removed.push(root);
      if (removeFails) throw new Error("EBUSY");
    },
    run: (env) => {
      seen.env = env;
      return code;
    },
    log: (l) => logs.push(l),
  });
  return { result, logs, ...seen };
}

test("the test processes get the fresh root as TMPDIR, TMP and TEMP; the rest of the environment is kept", () => {
  const r = fake();
  assert.deepEqual(r.env, { PATH: "/bin", TMPDIR: "/fresh-root", TMP: "/fresh-root", TEMP: "/fresh-root" });
  assert.deepEqual(tempEnv({ A: "1" }, "/r"), { A: "1", TMPDIR: "/r", TMP: "/r", TEMP: "/r" });
});

test("nothing left: the run's own exit code, the root removed, nothing printed", () => {
  for (const code of [0, 1, 3]) {
    const r = fake({ code });
    assert.equal(r.result, code);
    assert.deepEqual(r.removed, ["/fresh-root"]);
    assert.deepEqual(r.logs, []);
  }
});

test("something left: the run fails (1 when it passed, its own code otherwise), every name printed, root removed", () => {
  const r = fake({ left: ["doc-kit-test-b", "doc-kit-spaces-a"] });
  assert.equal(r.result, 1);
  assert.deepEqual(r.removed, ["/fresh-root"]);
  assert.match(r.logs[0], /^✗ 2 temporary file\(s\) left behind by the tests/);
  assert.deepEqual(r.logs.slice(1), ["    doc-kit-spaces-a", "    doc-kit-test-b"], "sorted, one per line");
  assert.equal(fake({ left: ["x"], code: 3 }).result, 3, "a failing run keeps its own code");
});

test("end-to-end runs tolerate a leftover (the browser may keep files) but print it", () => {
  const r = fake({ left: ["playwright_chromiumdev_profile-x"], tolerate: true });
  assert.equal(r.result, 0);
  assert.match(r.logs.join("\n"), /playwright_chromiumdev_profile-x[\s\S]*tolerated/);
});

test("a root that cannot be removed does not hide the verdict", () => {
  assert.equal(fake({ removeFails: true }).result, 0);
  assert.equal(fake({ removeFails: true, left: ["x"] }).result, 1);
});

test("a run that throws still removes the root", () => {
  const removed = [];
  assert.throws(
    () =>
      withTempRoot({
        env: {},
        make: () => "/r",
        list: () => [],
        remove: (root) => removed.push(root),
        run: () => {
          throw new Error("boom");
        },
        log: () => {},
      }),
    /boom/,
  );
  assert.deepEqual(removed, ["/r"]);
});

const roots = [];
after(() => {
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

test("positive control, on a real folder: a child process that leaves a folder in os.tmpdir() is caught", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-temp-root-test-"));
  roots.push(base);
  const logs = [];
  const script = 'require("fs").mkdtempSync(require("os").tmpdir() + require("path").sep + "doc-kit-leak-")';
  let root;
  const result = withTempRoot({
    env: process.env,
    make: () => (root = fs.mkdtempSync(path.join(base, "run-"))),
    list: (r) => fs.readdirSync(r),
    remove: (r) => fs.rmSync(r, { recursive: true, force: true }),
    run: (env) => spawnSync(process.execPath, ["-e", script], { env }).status ?? 1,
    log: (l) => logs.push(l),
  });
  assert.equal(result, 1);
  assert.match(logs.join("\n"), /1 temporary file\(s\) left behind[\s\S]*doc-kit-leak-/);
  assert.ok(!fs.existsSync(root), "the root is removed after the report");
  assert.deepEqual(fs.readdirSync(base), [], "and nothing reached the folder around it");
});
