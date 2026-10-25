// Confinement to a folder (SECURITY.md): where a file really is — links and junctions followed, a short name of
// Windows (ENV~1) or another case resolved, as the system gives it (realpathSync.native) — must stay inside the
// folder read. The one helper of the readers that a link could lead out of their folder: the `sources` of a page or a
// feature (engine/sync/feature-files.mjs), the files a proof cites and the dependency files of a page (fileInside:
// engine/sync), the files the `secrets` and `security` facts scan (engine/facts/common.mjs: `git ls-files` lists a
// committed link as a file), the converted documents of the sources, the project's adapters.
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {{ realpathSync: { native: (p: string) => string }, path?: import("node:path").PlatformPath }} RealPathIo
 *   the file system, and the path rules of its system (a test gives its own, path.win32 or path.posix on any machine)
 */

/** The most links followed to judge where a missing path would lie: past them (a loop), it is outside. */
const MAX_LINKS = 32;

/**
 * The longest path a file system resolves: Windows' (32,767 UTF-16 units, which a string's length counts), past
 * POSIX's (4,096 bytes a call). A longer one is missing for fileInside, answered without the file system; so is a
 * longer `rel` as written, answered without path.resolve too (climbsOut).
 */
const MAX_PATH = 32767;

/** What brokenLinkTarget answers for a link whose target cannot be placed from its text alone (climbsAfterName). */
const UNPLACED = Symbol("unplaced");

/**
 * The real path of a file or a folder, as the system gives it, or null when there is none (missing, a broken link).
 * @param {string} p
 * @param {RealPathIo} [io]
 * @returns {string|null}
 */
export function realPathOf(p, io = fs) {
  try {
    return io.realpathSync.native((io.path ?? path).resolve(p));
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
 * @param {string} [sep]   the separator of the paths' system
 */
export const within = (p, dir, sep = path.sep) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep);

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
  return real && real !== realBase && within(real, realBase, (io.path ?? path).sep) ? real : null;
}

/**
 * @typedef {RealPathIo & { statSync: (p: string) => { isFile(): boolean },
 *   lstatSync: (p: string) => { isSymbolicLink(): boolean }, readlinkSync: (p: string) => string }} ConfineIo
 */

/**
 * The file `rel` (relative to the folder `dir`) names, for a reader that must stay in that folder — the file a proof
 * cites, a dependency of a page (engine/sync): its real path when it is a file inside `dir`, links and junctions
 * followed; "outside" when it climbs out as written (`../`, climbsOut, whatever its length), or really lies outside,
 * or would were it there (a link or a junction followed, missingOutside): never read, and whether a file outside
 * exists is never told; null when there is no such file in `dir` (missing, a folder, a broken link that stays inside,
 * a path longer than MAX_PATH). The length is checked on `rel` as written before path.resolve is given it (quadratic
 * on some shapes, climbsOut), then on the path resolved: a `rel` padded past MAX_PATH (`./` 20,000 times before
 * `lib/a.txt`) is missing too, though it names a file, which no writer of a proof does.
 * @param {string} dir
 * @param {string} rel
 * @param {ConfineIo} [io]
 * @returns {string|null}   a real path, "outside" or null
 */
export function fileInside(dir, rel, io = fs) {
  const P = io.path ?? path;
  const top = P.resolve(dir);
  if (climbsOut(top, rel, P)) return "outside";
  if (rel.length > MAX_PATH) return null;
  const abs = P.resolve(P.join(top, rel));
  if (abs.length > MAX_PATH) return null;
  const base = realPathOf(dir, io);
  if (!base) return null;
  const real = realPathOf(abs, io);
  if (!real) return missingOutside(abs, base, io, MAX_LINKS, abs === top ? -1 : top.length) ? "outside" : null;
  if (!within(real, base, P.sep)) return "outside";
  try {
    return io.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Whether `rel`, joined to the folder `top` (resolved), lies outside it as written: what path.resolve answers
 * (`P.resolve(P.join(top, rel))` neither `top` nor under it), in one pass over the parts of `rel`, where
 * path.resolve is quadratic on `a/`×n then `b/../`×n (each `..` cuts the path built so far, copied whole) and `rel`
 * comes from a page's text. A name goes down, `..` up, never above the root path.resolve gives (`\\?\` for
 * `\\?\C:\app`, a name `C:` under it), `.` and an empty part are nothing; `\` separates too under Windows' rules.
 * Out of `top`, a path may come back by its names (`../app/x` from `app` is inside): `up` counts the folders of
 * `top` it left, `off` the names it went down that are not `top`'s. A drive, a server or `\\?\` in `rel` is a name:
 * join puts `rel` under `top`.
 * @param {string} top   P.resolve(dir)
 * @param {string} rel
 * @param {import("node:path").PlatformPath} P
 */
function climbsOut(top, rel, P) {
  const root = P.resolve(top, P.sep);
  const names = top.length > root.length ? top.slice(root.length).split(P.sep) : [];
  let up = 0;
  let off = 0;
  let start = 0;
  for (let i = 0; i <= rel.length; i++) {
    if (i < rel.length && rel[i] !== "/" && rel[i] !== P.sep) continue;
    const part = rel.slice(start, i);
    start = i + 1;
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (off > 0) off--;
      else if (up < names.length) up++;
    } else if (off === 0 && up > 0 && part === names[names.length - up]) up--;
    else off++;
  }
  return up > 0;
}

/**
 * Whether the missing path `abs` would lie outside the folder whose real path is `base`: where its nearest existing
 * ancestor really is, links followed — so the answer is the same whether a file outside exists or not. A folder
 * resolves only if its parent does: the ancestors realPathOf resolves come first, the others after, and the nearest
 * is found by bisection (nearestReal). The first that does not resolve may be a link that leads nowhere (a broken
 * link, a junction to a missing folder): judged by its target as written, from the folder it is in, unless its text
 * cannot place it (climbsAfterName: outside); past MAX_LINKS of them (a loop), outside.
 * @param {string} abs
 * @param {string} base
 * @param {ConfineIo} io
 * @param {number} links   links still to follow
 * @param {number} [known]   the length of an ancestor of `abs` known to resolve to `base` (the folder read), or -1
 */
function missingOutside(abs, base, io, links, known = -1) {
  const P = io.path ?? path;
  const ends = ancestorEnds(abs, P);
  const from = known < 0 ? -1 : ends.indexOf(known);
  const { at, real } = nearestReal(abs, ends, from, from < 0 ? null : base, io);
  const p = abs.slice(0, ends[at + 1]); // the first ancestor that does not resolve
  const target = brokenLinkTarget(p, io);
  if (target === UNPLACED) return true;
  if (target) {
    if (links === 0) return true;
    const next = P.join(target, P.relative(p, abs));
    const found = realPathOf(next, io);
    return found ? !within(found, base, P.sep) : missingOutside(next, base, io, links - 1);
  }
  return !real || !within(real, base, P.sep); // nothing there, not even the root: outside
}

/**
 * Where each ancestor of the resolved path `abs` ends, from its root to `abs` itself — the paths path.dirname gives,
 * each `abs.slice(0, end)` —, found in one pass: never a string for each ancestor.
 * @param {string} abs
 * @param {import("node:path").PlatformPath} P
 * @returns {number[]}
 */
function ancestorEnds(abs, P) {
  const root = P.parse(abs).root.length;
  const ends = [root];
  for (let i = root; i < abs.length; i++) if (abs[i] === P.sep) ends.push(i);
  if (abs.length > root) ends.push(abs.length);
  return ends;
}

/**
 * The deepest ancestor of `abs` realPathOf resolves (its index in `ends`, -1 for none) and its real path, between
 * the one at `lo` (known to resolve to `real`; -1, none known) and `abs` itself, the last (known not to). From the
 * deep end first, by steps that double — a missing file in a folder that exists, the usual case, costs one call —,
 * then by halves: O(log depth) calls, where asking every ancestor, each call given the whole path, cost depth times
 * length on a deep path that untrusted text names.
 * @param {string} abs
 * @param {number[]} ends   ancestorEnds(abs)
 * @param {number} lo
 * @param {string|null} real
 * @param {RealPathIo} io
 * @returns {{ at: number, real: string|null }}
 */
function nearestReal(abs, ends, lo, real, io) {
  let hi = ends.length - 1;
  let step = 1;
  let found = false;
  while (hi - lo > 1) {
    const mid = found ? (lo + hi) >> 1 : Math.max(hi - step, lo + 1);
    const r = realPathOf(abs.slice(0, ends[mid]), io);
    if (r) {
      lo = mid;
      real = r;
      found = true;
    } else {
      hi = mid;
      step *= 2;
    }
  }
  return { at: lo, real };
}

/**
 * The target of `p` when it is a link (one realPathOf cannot follow), resolved from the real folder it is in; UNPLACED
 * when its text cannot place it (climbsAfterName); null when it is not a link, or not there.
 * @param {string} p
 * @param {ConfineIo} io
 * @returns {string|null|typeof UNPLACED}
 */
function brokenLinkTarget(p, io) {
  const P = io.path ?? path;
  try {
    if (!io.lstatSync(p).isSymbolicLink()) return null;
    const folder = realPathOf(P.dirname(p), io);
    if (!folder) return null;
    const target = io.readlinkSync(p);
    return climbsAfterName(target, P.sep) ? UNPLACED : P.resolve(folder, target);
  } catch {
    return null;
  }
}

/**
 * Whether the target of a link, as written, has a `..` after a name (`j/../x`, `/srv/app/j/../x`). Resolved from the
 * text, that `..` takes the name back, where POSIX goes up from wherever the name leads: from the target of `j` when
 * it is a link to a folder outside, so a missing file there would be judged inside while a present one is outside.
 * Such a link is outside on every system, a sound answer. The leading ones (`../../x`) go up from the link's real
 * folder, where text and disk agree. Both separators count on Windows, and a drive or a server is a name too.
 * @param {string} target
 * @param {string} sep   the separator of the system, `/` also counting
 */
function climbsAfterName(target, sep) {
  let named = false;
  let start = 0;
  for (let i = 0; i <= target.length; i++) {
    if (i < target.length && target[i] !== "/" && target[i] !== sep) continue;
    const part = target.slice(start, i);
    if (part === "..") {
      if (named) return true;
    } else if (part !== "" && part !== ".") named = true;
    start = i + 1;
  }
  return false;
}
