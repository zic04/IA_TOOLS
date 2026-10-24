// RULES.md M5: a source file of the kit stays at 600 lines or fewer, so that new code goes into new modules. The few
// files already over the limit are held at their size (a ratchet): they may only shrink, and when one does, its
// ceiling below is lowered in the same change so it cannot grow back. Raising a ceiling is a decision written in
// the pull request (RULES.md: a broken rule says so and why).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";

const LIMIT = 600;
/** Files over the limit, held at their current number of lines. */
const CEILINGS = Object.freeze({
  "engine/site/app.js": 1344,
  "cli/commands/init.mjs": 750,
});
const ROOTS = ["engine", "cli", "adapters", "skill"];

/** The kit's own source files (.mjs, .js), relative to the kit, forward slashes. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(mjs|js)$/.test(e.name)) out.push(path.relative(KIT_ROOT, abs).split(path.sep).join("/"));
    }
  };
  for (const root of ROOTS) if (fs.existsSync(path.join(KIT_ROOT, root))) walk(path.join(KIT_ROOT, root));
  return out.sort();
}

/** Lines of a file, counted like `wc -l` (its line breaks). */
const linesOf = (rel) => (fs.readFileSync(path.join(KIT_ROOT, rel), "utf8").match(/\n/g) || []).length;

test("every source file is at most 600 lines, or held at its ceiling (RULES.md M5)", () => {
  const files = sourceFiles();
  assert.ok(files.length > 100, "the scan sees the kit's sources");
  const over = [];
  const shrunk = [];
  for (const rel of files) {
    const n = linesOf(rel);
    const ceiling = CEILINGS[rel];
    if (ceiling === undefined) {
      if (n > LIMIT) over.push(`${rel}: ${n} lines, over ${LIMIT}: move code into a new module`);
    } else if (n > ceiling) over.push(`${rel}: ${n} lines, held at ${ceiling}: move the new code into a new module`);
    else if (n < ceiling)
      shrunk.push(`${rel}: ${n} lines — ${n <= LIMIT ? "remove it from CEILINGS" : `lower its ceiling to ${n}`}`);
  }
  assert.deepEqual(over, [], "a file grew past its limit");
  assert.deepEqual(
    shrunk,
    [],
    "a held file shrank: lower its ceiling in test/unit/sizes.test.mjs so it cannot grow back",
  );
});

test("every ceiling names a file that exists and is over the limit", () => {
  for (const [rel, ceiling] of Object.entries(CEILINGS)) {
    assert.ok(fs.existsSync(path.join(KIT_ROOT, rel)), `${rel} no longer exists: remove it from CEILINGS`);
    assert.ok(ceiling > LIMIT, `${rel}: a ceiling at or under ${LIMIT} is the rule itself`);
  }
});
