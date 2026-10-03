// The one reader of a project's table of contents (AUDIT.md M4): content/toc.json, or the legacy sommaire.json,
// a byte-order mark tolerated, legacy French keys normalised (engine/project/legacy.mjs). Every command reads it
// here, so that a legacy project is read the same way everywhere.
import fs from "node:fs";
import path from "node:path";
import { normalizeToc, LEGACY_FILES, CURRENT_FILES } from "./legacy.mjs";

/** Text without a leading byte-order mark. */
export const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/**
 * @param {string} root      project root
 * @param {string} content   config.paths.content
 * @returns {{ file: string, toc: object|null, legacy?: boolean, found: boolean }}
 *   file: relative to root (the current name when neither exists); toc: null when missing or unreadable
 */
export function readToc(root, content) {
  const rel = [CURRENT_FILES.toc, LEGACY_FILES.toc]
    .map((f) => `${content}/${f}`)
    .find((f) => fs.existsSync(path.join(root, f)));
  if (!rel) return { file: `${content}/${CURRENT_FILES.toc}`, toc: null, found: false };
  try {
    const raw = JSON.parse(stripBom(fs.readFileSync(path.join(root, rel), "utf8")));
    const n = normalizeToc(raw);
    return { file: rel, toc: n.value, legacy: n.legacy || rel.endsWith(LEGACY_FILES.toc), found: true };
  } catch {
    return { file: rel, toc: null, found: true };
  }
}
