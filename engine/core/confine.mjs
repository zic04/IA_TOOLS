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

/** The most links followed to judge where a missing path would lie: past them (a loop), it is outside. */
const MAX_LINKS = 32;

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
 * Whether the path `p` is the folder `dir` or inside it, compared exactly, case included: real paths both
 * (realPathOf, whose case is the one on disk), or both as written from the same folder. path.relative ignores the
 * case on Windows, where a folder may be case-sensitive (WSL's, or one fsutil marks so): there, `APP` beside `app`
 * is another folder.
 * @param {string} p
 * @param {string} dir
 */
export const within = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

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
  return real && real !== realBase && within(real, realBase) ? real : null;
}

/**
 * @typedef {RealPathIo & { statSync: (p: string) => { isFile(): boolean },
 *   lstatSync: (p: string) => { isSymbolicLink(): boolean }, readlinkSync: (p: string) => string }} ConfineIo
 */

/**
 * The file `rel` (relative to the folder `dir`) names, for a reader that must stay in that folder — the file a proof
 * cites, a dependency of a page (engine/sync): its real path when it is a file inside `dir`, links and junctions
 * followed; "outside" when it climbs out as written (`../`), or really lies outside, or would were it there (a link
 * or a junction followed, missingOutside): never read, and whether a file outside exists is never told; null when
 * there is no such file in `dir` (missing, a folder, a broken link that stays inside).
 * @param {string} dir
 * @param {string} rel
 * @param {ConfineIo} [io]
 * @returns {string|null}   a real path, "outside" or null
 */
export function fileInside(dir, rel, io = fs) {
  const abs = path.resolve(path.join(dir, rel));
  if (!within(abs, path.resolve(dir))) return "outside";
  const base = realPathOf(dir, io);
  if (!base) return null;
  const real = realPathOf(abs, io);
  if (!real) return missingOutside(abs, base, io) ? "outside" : null;
  if (!within(real, base)) return "outside";
  try {
    return io.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Whether the missing path `abs` would lie outside the folder whose real path is `base`: where its nearest existing
 * ancestor really is, links followed — so the answer is the same whether a file outside exists or not. A link that
 * leads nowhere (a broken link, a junction to a missing folder) is judged by its target as written, from the folder it
 * is in; past MAX_LINKS of them (a loop), outside.
 * @param {string} abs
 * @param {string} base
 * @param {ConfineIo} io
 * @param {number} [links]   links still to follow
 */
function missingOutside(abs, base, io, links = MAX_LINKS) {
  for (let p = abs; ; p = path.dirname(p)) {
    const real = realPathOf(p, io);
    if (real) return !within(real, base);
    const target = brokenLinkTarget(p, io);
    if (target) return links === 0 || missingOutside(path.join(target, path.relative(p, abs)), base, io, links - 1);
    if (path.dirname(p) === p) return true; // nothing there, not even the root
  }
}

/**
 * The target of `p` when it is a link (one realPathOf cannot follow), resolved from the real folder it is in; null
 * when it is not a link, or not there.
 * @param {string} p
 * @param {ConfineIo} io
 * @returns {string|null}
 */
function brokenLinkTarget(p, io) {
  try {
    if (!io.lstatSync(p).isSymbolicLink()) return null;
    const folder = realPathOf(path.dirname(p), io);
    return folder ? path.resolve(folder, io.readlinkSync(p)) : null;
  } catch {
    return null;
  }
}
