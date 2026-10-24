// Snapshots of the demo project built with --date 2026-01-01, in English and in French: the demo is written in
// English and translated into French (`languages`, ARCHITECTURE.md §6.12), each snapshot the file of one language.
// Update after an intended change of the output: UPDATE=1 npm run test:snapshot
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemo } from "../tools/helpers.mjs";
import { generatorTag } from "../../engine/brand.mjs";

const FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "__snapshots__");
/** The kit version changes with every release: it is not part of the snapshot. */
const stable = (html) => html.split(generatorTag()).join("<generator>");

for (const language of ["en", "fr"]) {
  test(`demo project, ${language}`, async () => {
    // A strict build in either language: every French page is translated and current, its sections the French
    // ones of its template. Both carry the four spaces' own warning (ARCHITECTURE.md §6.1a): a link to another
    // space, replaced by its text in that space's export.
    const r = await buildDemo({ language });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(
      r.warnings.map((w) => w.key),
      Array(4).fill("space.excludedLinks"),
    );
    const html = stable(r.html);
    const file = path.join(FOLDER, `demo-docs.${language}.html`);
    if (process.env.UPDATE || !fs.existsSync(file)) {
      fs.mkdirSync(FOLDER, { recursive: true });
      fs.writeFileSync(file, html);
    }
    const expected = fs.readFileSync(file, "utf8");
    if (html !== expected) {
      let i = 0;
      while (i < html.length && html[i] === expected[i]) i++;
      assert.fail(
        `snapshot ${path.basename(file)} differs at ${i}:\n  expected «${expected.slice(Math.max(0, i - 60), i + 60)}»\n  actual   «${html.slice(Math.max(0, i - 60), i + 60)}»\n(UPDATE=1 to accept)`,
      );
    }
  });
}
