// The one reader of a project's table of contents (AUDIT.md M4): <content>/toc.json, a byte-order mark tolerated.
// Every command reads it here; the constants below name the project's files (some modules still spell them out).
import fs from "node:fs";
import path from "node:path";

/** The table of contents, the glossary and the home page, at the root of the content folder (ARCHITECTURE.md §2.1). */
export const TOC_FILE = "toc.json";
export const GLOSSARY_FILE = "glossary.json";
export const HOME_FILE = "home.md";

/** Text without a leading byte-order mark. */
export const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/**
 * @param {string} root      project root
 * @param {string} content   config.paths.content
 * @returns {{ file: string, toc: object|null, found: boolean }}
 *   file: relative to root; toc: null when missing or unreadable
 */
export function readToc(root, content) {
  const file = `${content}/${TOC_FILE}`;
  if (!fs.existsSync(path.join(root, file))) return { file, toc: null, found: false };
  try {
    return { file, toc: JSON.parse(stripBom(fs.readFileSync(path.join(root, file), "utf8"))), found: true };
  } catch {
    return { file, toc: null, found: true };
  }
}
