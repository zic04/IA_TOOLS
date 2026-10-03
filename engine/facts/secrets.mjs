// `secrets` source (ARCHITECTURE.md §6.9): the generic value detectors of `engine/check/secrets.mjs` (private
// keys, JWTs, connection strings, credentials in a URL, cloud keys, assignments, signed URLs), run over the
// application's own files. Never the value, never a line number: one item per file where a kind of secret was
// found (a file matched twice by the same rule is still one item).
//   item: { file, rule }
import fs from "node:fs";
import path from "node:path";
import { GENERIC, ignoreRules, scanText } from "../check/secrets.mjs";
import { appFiles } from "./common.mjs";

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
]);
const MAX_SIZE = 2 * 1024 * 1024;

/**
 * The `secrets` source: the files tracked by git (else every file but the usual build and dependency folders),
 * scanned with the kit's generic secret detectors only (no `masking` configuration applies to an arbitrary
 * application).
 * @param {string} appDir
 * @param {(bin: string, args: string[], options?: object) => {status,stdout}|null} [exec]  test seam of §4
 * @returns {Array<{file,rule}>} sorted by file then rule
 */
export function collectSecrets(appDir, exec) {
  const ignore = ignoreRules({});
  const seen = new Set();
  const items = [];
  for (const rel of appFiles(appDir, { exec })) {
    if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(appDir, rel);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_SIZE) continue;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const f of scanText(text, GENERIC, ignore)) {
      const key = `${rel}\u0000${f.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ file: rel, rule: f.kind });
    }
  }
  return items.sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
}
