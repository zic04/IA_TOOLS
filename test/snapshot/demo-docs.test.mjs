// Snapshots of the demo project built with --date 2026-01-01, in English and in French.
// Update after an intended change of the output: UPDATE=1 npm run test:snapshot (only UPDATE=1 writes; a missing
// snapshot fails; test/tools/snapshot.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KIT_ROOT, buildDemo } from "../tools/helpers.mjs";
import { generatorTag } from "../../engine/brand.mjs";
import {
  SNAPSHOT_FILES,
  SNAPSHOT_LANGUAGES,
  compareSnapshot,
  isUpdate,
  machineTraces,
  snapshotName,
} from "../tools/snapshot.mjs";

const FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "__snapshots__");
/** The kit version changes with every release: it is not part of the snapshot. */
const stable = (html) => html.split(generatorTag()).join("<generator>");

for (const language of SNAPSHOT_LANGUAGES) {
  test(`demo project, ${language}`, async () => {
    // The content is in English: in French, the page-template check (French section titles) only warns, once
    // per required section missing across the 8 typed pages. Both languages also carry the four spaces' own
    // warning (ARCHITECTURE.md §6.1a): a link to another space, replaced by its text in that space's export.
    const r = await buildDemo({ language, draft: language === "fr" });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(
      r.warnings.map((w) => w.key),
      language === "fr"
        ? [...Array(32).fill("template.missingSection"), ...Array(4).fill("space.excludedLinks")]
        : Array(4).fill("space.excludedLinks"),
    );
    const html = stable(r.html);
    const file = path.join(FOLDER, snapshotName(language));
    const update = isUpdate(process.env);
    const verdict = compareSnapshot({
      name: path.basename(file),
      actual: html,
      expected: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null,
      update,
    });
    if (verdict.action === "write") {
      fs.mkdirSync(FOLDER, { recursive: true });
      fs.writeFileSync(file, html);
    } else if (verdict.action === "fail") assert.fail(verdict.message);
  });
}

test("the snapshots are deterministic: a second build gives the same bytes, with no trace of the machine", async () => {
  const [first, second] = [await buildDemo({ date: "2026-01-01" }), await buildDemo({ date: "2026-01-01" })];
  assert.equal(stable(first.html), stable(second.html), "two builds of the same project differ");
  const roots = [KIT_ROOT, os.tmpdir(), os.homedir(), process.cwd()];
  for (const file of SNAPSHOT_FILES) {
    const text = fs.readFileSync(path.join(FOLDER, file), "utf8");
    for (const re of machineTraces({ roots })) assert.ok(!re.test(text), `${file} holds a trace of the machine: ${re}`);
  }
});

test("no orphan: the files of __snapshots__ are exactly those the tests use", () => {
  assert.deepEqual(fs.readdirSync(FOLDER).sort(), [...SNAPSHOT_FILES].sort());
});
