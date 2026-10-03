// RULES.md M10 (AUDIT.md M9): a name is exported only when another file of the repository uses it. Stands in for
// knip without adding a dependency: the kit's own code is plain ES modules, so the exported declarations can be
// listed and looked for by name. Conservative: a name merely mentioned elsewhere (a test, a comment) counts as
// used. The public entry points of package.json `exports` are left out: what they export is the kit's API.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";

const FOLDERS = ["engine", "cli", "adapters", "skill", "test", "standard", "templates", "examples", "docs", "ci"];
const PUBLIC = new Set(Object.values(JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8")).exports).map((p) => path.normalize(p)));
const DECLARATION = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function sources() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(KIT_ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(rel);
      } else if (/\.(mjs|js)$/.test(e.name)) files.push(rel);
    }
  };
  for (const f of FOLDERS) if (fs.existsSync(path.join(KIT_ROOT, f))) walk(f);
  return new Map(files.map((f) => [f, fs.readFileSync(path.join(KIT_ROOT, f), "utf8")]));
}

test("every exported name is used by another file (RULES.md M10)", () => {
  const files = sources();
  const unused = [];
  for (const [file, text] of files) {
    if (file.startsWith(`test${path.sep}`) || PUBLIC.has(path.normalize(file))) continue;
    for (const [, name] of text.matchAll(DECLARATION)) {
      const word = new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
      if (![...files].some(([other, t]) => other !== file && word.test(t))) unused.push(`${file.split(path.sep).join("/")}: ${name}`);
    }
  }
  assert.deepEqual(unused, [], "exported but used nowhere else: drop the `export`, or the code if nothing uses it");
});
