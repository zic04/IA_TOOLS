// The compatibility matrix of the kit's documentation (ARCHITECTURE.md §5), generated from standard/adapters.json:
// the section "In this part" of docs/<language>/content/reference/compatibility.md, from its heading to the next
// "## " heading. `node test/tools/adapters-matrix.mjs` checks the pages (exit code 1 when one is out of date);
// `--write` rewrites them. test/unit/stacks.test.mjs runs the check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adapterMatrix } from "../../engine/core/adapters-matrix.mjs";
import { createI18n } from "../../engine/i18n.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECTION = Object.freeze({ en: "## In this part", fr: "## Dans cette partie" });

/** Each page of the matrix: its file, its text, and the text it should have. */
export function matrixPages() {
  return Object.entries(SECTION).map(([language, heading]) => {
    const file = path.join(KIT, "docs", language, "content", "reference", "compatibility.md");
    const current = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
    const start = current.indexOf(`${heading}\n`);
    if (start === -1) throw new Error(`${file}: no "${heading}" section`);
    const body = start + heading.length + 1;
    const next = current.indexOf("\n## ", body);
    const end = next === -1 ? current.length : next + 1;
    const matrix = adapterMatrix(createI18n({ language, vars: { command: "doc-kit" } }).t);
    return { file, current, expected: `${current.slice(0, body)}\n${matrix}\n${current.slice(end)}` };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stale = matrixPages().filter((p) => p.current !== p.expected);
  if (process.argv.includes("--write")) for (const p of stale) fs.writeFileSync(p.file, p.expected);
  for (const p of stale) console.log(`${process.argv.includes("--write") ? "written" : "out of date"}: ${p.file}`);
  process.exitCode = stale.length && !process.argv.includes("--write") ? 1 : 0;
}
