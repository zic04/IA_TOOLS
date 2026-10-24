// Confinement to a folder (SECURITY.md): where a file really is — links and junctions followed, a short name of
// Windows (ENV~1) or another case resolved, as the system gives it (realpathSync.native) — must stay inside the
// folder read. The one helper of the readers that a link could lead out of their folder: the `sources` of a page or a
// feature (engine/sync/feature-files.mjs), the files the `secrets` and `security` facts scan (engine/facts/common.mjs:
// `git ls-files` lists a committed link as a file), the converted documents of the sources, the project's adapters.
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {{ realpathSync: { native: (p: string) => string } }} RealPathIo   the file system (a test gives its own)
 */

/**
 * The real path of a file or a folder, as the system gives it, or null when there is none (missing, a broken link).
 * @param {string} p
 * @param {RealPathIo} [io]
 * @returns {string|null}
 */
export function realPathOf(p, io = fs) {
  try {
    return io.realpathSync.native(path.resolve(p));
  } catch {
    return null;
  }
}

/**
 * The real path of `target` when it lies inside the folder whose real path is `realBase` (realPathOf), the folder
 * itself excluded; null otherwise: outside once links are followed, missing, a broken link, or no base at all.
 * @param {string|null} realBase
 * @param {string} target
 * @param {RealPathIo} [io]
 * @returns {string|null}
 */
export function realInside(realBase, target, io = fs) {
  if (!realBase) return null;
  const real = realPathOf(target, io);
  if (!real) return null;
  const rel = path.relative(realBase, real);
  const outside = !rel || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);
  return outside ? null : real;
}
