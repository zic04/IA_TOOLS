// The files of the application that the proofs of an analysis name (ARCHITECTURE.md §6.11a), read only to count their
// lines: what scripts/analysis.mjs gives the check (analysis-model.mjs). The path's spelling is checked first, by the
// model; here, its real path (links followed) must stay in the application folder, and only a plain file of 8 MB at
// most is read — never a folder, a device or a named pipe (reading one could wait for ever).
import fs from "node:fs";
import path from "node:path";

/** A file of the application read for its number of lines, at most this size. */
export const MAX_PROOF_FILE = 8 * 1024 * 1024;

/**
 * @param {string} appDir   the application folder
 * @param {any} [io]   the file system: realpathSync.native, statSync, readFileSync (a test gives its own)
 * @returns {(file: string) => { count?: number, missing?: boolean, outside?: boolean }}   file: relative, forward
 *   slashes, already found safe by its spelling
 */
export function proofLines(appDir, io = fs) {
  let realApp = null;
  try {
    realApp = io.realpathSync.native(appDir);
  } catch {
    realApp = null;
  }
  const cache = new Map();
  return (file) => {
    if (cache.has(file)) return cache.get(file);
    let r;
    try {
      const real = io.realpathSync.native(path.join(appDir, ...file.split("/")));
      const inside = realApp && path.relative(realApp, real);
      if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) r = { outside: true };
      else {
        const st = io.statSync(real);
        if (!st.isFile() || st.size > MAX_PROOF_FILE) r = { missing: true };
        else {
          const text = io.readFileSync(real, "utf8");
          r = { count: text.split("\n").length - (text.endsWith("\n") ? 1 : 0) };
        }
      }
    } catch {
      r = { missing: true };
    }
    cache.set(file, r);
    return r;
  };
}
