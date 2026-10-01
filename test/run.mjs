#!/usr/bin/env node
// Runs node:test on the *.test.mjs files of the requested folders (unit, snapshot, e2e), without relying on
// the glob support of `node --test` (Node 20 and 22+ do not treat patterns the same way).
//   node test/run.mjs unit snapshot     (npm test)
//   node test/run.mjs e2e               (npm run test:e2e)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const folders = process.argv.slice(2).length ? process.argv.slice(2) : ["unit", "snapshot"];
const files = folders.flatMap((d) => {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith(".test.mjs"))
    .sort()
    .map((f) => path.join(dir, String(f)));
});
if (!files.length) {
  console.error(`no test file in: ${folders.join(", ")}`);
  process.exit(2);
}
// End-to-end tests share one browser per file: one file at a time.
const options = folders.includes("e2e") ? ["--test-concurrency=1"] : [];
const r = spawnSync(process.execPath, ["--test", ...options, ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
