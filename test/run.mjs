#!/usr/bin/env node
// Runs node:test on the *.test.mjs files of the requested folders (unit, snapshot, e2e), without relying on
// the glob support of `node --test` (Node 20 and 22+ do not treat patterns the same way).
//   node test/run.mjs unit snapshot              (npm test)
//   node test/run.mjs e2e                        (npm run test:e2e)
//   node test/run.mjs unit/security.test.mjs     (npm run test:security: one file, the same plan)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runPlan, testFiles } from "./tools/run-plan.mjs";
import { withTempRoot } from "./tools/temp-root.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const folders = process.argv.slice(2).length ? process.argv.slice(2) : ["unit", "snapshot"];
const files = testFiles(folders, {
  root: ROOT,
  exists: (p) => fs.existsSync(p),
  list: (dir) => fs.readdirSync(dir, { recursive: true }).map(String),
});
if (!files.length) {
  console.error(`no test file in: ${folders.join(", ")}`);
  process.exit(2);
}
// The test processes get a temporary root of their own, and what a test leaves in it fails the run
// (test/tools/temp-root.mjs). The files that measure time run after the others, one at a time, a failure run once
// more (test/tools/run-plan.mjs).
const e2e = folders.includes("e2e");
const code = withTempRoot({
  env: process.env,
  tolerate: e2e,
  make: () => fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-run-")),
  list: (root) => fs.readdirSync(root),
  remove: (root) => fs.rmSync(root, { recursive: true, force: true }),
  log: (line) => console.log(line),
  run: (env) =>
    runPlan({
      files,
      e2e,
      read: (f) => fs.readFileSync(f, "utf8"),
      run: (list, options) =>
        spawnSync(process.execPath, ["--test", ...options, ...list], { stdio: "inherit", env }).status ?? 1,
      log: (line) => console.log(line),
    }),
});
process.exit(code);
