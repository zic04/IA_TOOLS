// The documented version of a project (`config.version`): read from a file with a pattern, or the fallback.
import fs from "node:fs";
import path from "node:path";

/**
 * Documented version: version.file + version.pattern (first group), otherwise version.fallback. With `tools` (the
 * project's, projectTools of engine/check/coverage.mjs: sync, context, the CLI's own reads), a file in the application
 * (`../app/package.json`) is read only where it is reached through its folders, never a link or a junction
 * (SECURITY.md): one behind such a link gives the fallback. Without, as written.
 * @param {string} root
 * @param {{ file?: string, pattern?: string, fallback?: string }} version
 * @param {{ exists: (p: string) => boolean, read: (p: string) => string }} [tools]
 */
export function readProjectVersion(root, { file, pattern, fallback }, tools) {
  if (file) {
    const f = path.resolve(root, file);
    const read = tools ?? { exists: () => fs.existsSync(f), read: () => fs.readFileSync(f, "utf8") };
    const text = read.exists(file) ? read.read(file) : null;
    if (text !== null) {
      const m = new RegExp(pattern).exec(text);
      if (m && m[1]) return m[1];
    }
  }
  return fallback;
}
