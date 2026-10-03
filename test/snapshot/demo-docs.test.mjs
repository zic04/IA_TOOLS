// Snapshots of the demo project built with --date 2026-01-01, in English and in French.
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
    // The content is in English: in French, the page-template check (French section titles) only warns, once
    // per required section missing across the 8 typed pages. Both languages also carry the two spaces' own
    // warning (ARCHITECTURE.md §6.1a): a link to another space, replaced by its text in that space's export.
    const r = await buildDemo({ language, draft: language === "fr" });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(
      r.warnings.map((w) => w.key),
      language === "fr"
        ? [...Array(26).fill("template.missingSection"), "space.excludedLinks", "space.excludedLinks"]
        : ["space.excludedLinks", "space.excludedLinks"],
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
