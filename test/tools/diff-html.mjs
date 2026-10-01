#!/usr/bin/env node
// Byte comparison of two built sites, ignoring what a kit build legitimately adds to an older build:
// the <meta name="generator"> tag, and the `meta.generator` and `i18n` members of the embedded data.
//   node test/tools/diff-html.mjs <reference.html> <candidate.html>
// Exit code 0 when identical, 1 otherwise (the first difference is printed with some context).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** HTML without the generator tag and without the data members added by the kit. */
export function withoutKitAdditions(html) {
  // The data is re-serialised exactly as the build serialises it (JSON.stringify, "<" escaped).
  return html
    .replace(/<meta name="generator" content="[^"]*">/, "")
    .replace(/(<script type="application\/json" id="donnees">)([\s\S]*?)(<\/script>)/, (m, open, json, close) => {
      const data = JSON.parse(json);
      if (data.meta) delete data.meta.generator;
      delete data.i18n;
      return open + JSON.stringify(data).replace(/</g, "\\u003c") + close;
    });
}

/** { identical, position, reference, candidate }: first difference and 80 characters around it. */
export function diffHtml(a, b) {
  const x = withoutKitAdditions(a);
  const y = withoutKitAdditions(b);
  if (x === y) return { identical: true };
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return { identical: false, position: i, reference: x.slice(Math.max(0, i - 80), i + 80), candidate: y.slice(Math.max(0, i - 80), i + 80) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error("usage: node test/tools/diff-html.mjs <reference.html> <candidate.html>");
    process.exit(2);
  }
  const r = diffHtml(fs.readFileSync(a, "utf8"), fs.readFileSync(b, "utf8"));
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.identical ? 0 : 1;
}
