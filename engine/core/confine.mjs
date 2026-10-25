// Confinement to a folder (SECURITY.md): where a file really is — links and junctions followed, a short name of
// Windows (ENV~1) or another case resolved, as the system gives it (realpathSync.native) — must stay inside the
// folder read. The one helper of the readers that a link could lead out of their folder: the `sources` of a page or a
// feature (engine/sync/feature-files.mjs), the files a proof cites and the dependency files of a page (fileInside:
// engine/sync), the files the `secrets` and `security` facts scan (engine/facts/common.mjs: `git ls-files` lists a
// committed link as a file), the converted documents of the sources, the project's adapters.
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
  return !rel || climbs(rel) ? null : real;
}

/** Whether a relative path leaves its folder: `..` first, or another drive (path.relative gives it absolute). */
const climbs = (rel) => rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);

/**
 * The file `rel` (relative to the folder `dir`) names, for a reader that must stay in that folder — the file a proof
 * cites, a dependency of a page (engine/sync): its real path when it is a file inside `dir`, links and junctions
 * followed; "outside" when it climbs out as written (`../`, even when missing) or exists but really lies outside (a
 * link or a junction followed): never read; null when there is no such file (missing, a folder, a broken link).
 * @param {string} dir
 * @param {string} rel
 * @param {RealPathIo & { statSync: (p: string) => { isFile(): boolean } }} [io]
 * @returns {string|null}   a real path, "outside" or null
 */
export function fileInside(dir, rel, io = fs) {
  const abs = path.join(dir, rel);
  if (climbs(path.relative(path.resolve(dir), path.resolve(abs)))) return "outside";
  const real = realPathOf(abs, io);
  const base = realPathOf(dir, io);
  if (!real || !base) return null;
  if (real !== base && climbs(path.relative(base, real))) return "outside";
  try {
    return io.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}
