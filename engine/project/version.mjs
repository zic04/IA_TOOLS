// The documented version of a project (`config.version`): read from a file with a pattern, or the fallback.
import fs from "node:fs";
import path from "node:path";

/** Documented version: version.file + version.pattern (first group), otherwise version.fallback. */
export function readProjectVersion(root, { file, pattern, fallback }) {
  if (file) {
    const f = path.resolve(root, file);
    if (fs.existsSync(f)) {
      const m = new RegExp(pattern).exec(fs.readFileSync(f, "utf8"));
      if (m && m[1]) return m[1];
    }
  }
  return fallback;
}
