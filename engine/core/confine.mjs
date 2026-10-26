// Confinement to a folder (SECURITY.md): where a file really is — links and junctions followed, a short name of
// Windows (ENV~1) or another case resolved, as the system gives it (realpathSync.native) — must stay inside the
// folder read. The one helper of the readers that a link could lead out of their folder: the `sources` of a page or a
// feature (engine/sync/feature-files.mjs), the files a proof cites and the dependency files of a page (fileInside:
// engine/sync), the files the `secrets` and `security` facts scan (engine/facts/common.mjs: `git ls-files` lists a
// committed link as a file), the converted documents of the sources, the project's adapters; and every path in the
// application the tools of the coverage adapters and of sync are given (linkFree): a walk, a glob, a file read.
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
 * longer `rel` as written, whatever it resolves to (joinAsWritten).
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
 * Whether the path whose parts are `names` (`.` and empty ones are nothing), below the folder `top`, is reached
 * through folders only — each a folder, never a link or a junction (lstat: never followed) — and is no link itself, a
 * folder too with `folder`: the rule of the walks of the application (adapterTools.walk, listFiles), which go only
 * into an entry that is a folder, as a link to one is not. adapterTools judges by it each path it is given in the
 * application (where a walk starts, a file read, whether one exists): a junction there to a folder outside would
 * have its names listed and its files read.
 * @param {string} top
 * @param {string[]} names
 * @param {{ folder?: boolean }} [o]
 */
export function linkFree(top, names, { folder = false } = {}) {
  const parts = names.filter((x) => x && x !== ".");
  let at = top;
  for (let i = 0; i < parts.length; i++) {
    at = path.join(at, parts[i]);
    let st;
    try {
      st = fs.lstatSync(at);
    } catch {
      return false;
    }
    if (st.isSymbolicLink() || ((folder || i < parts.length - 1) && !st.isDirectory())) return false;
  }
  return true;
}

/**
 * Where the path `abs` enters the folder `dir` (both resolved): `top`, the part of `abs` that is `dir`, as `abs`
 * writes it, and `names`, its parts below ([] for the folder itself); null when `abs` does not lie in it. In it as
 * written, in any case (macOS' and Windows' folders read a name in any case; on a case-sensitive one, a sibling
 * `APP` of `app` is only judged more strictly), or through an ancestor whose real path is `dir`'s — a short name
 * (`APPLIC~1`), `/private/var` for `/var`, a link to the folder —, the first from the root. Not seen: a link of the
 * configuration's own to a folder below `dir` (its real path is that folder's, not `dir`'s).
 * @param {string} dir
 * @param {string} abs
 * @param {RealPathIo} [io]
 * @returns {{ top: string, names: string[] }|null}
 */
export function entryInto(dir, abs, io = fs) {
  const P = io.path ?? path;
  const at = (end) => ({ top: abs.slice(0, end), names: abs.slice(end).split(P.sep).filter(Boolean) });
  const n = dir.length;
  const sameStart = abs.slice(0, n).toLowerCase() === dir.toLowerCase();
  if (sameStart && (abs.length === n || abs[n] === P.sep || dir.endsWith(P.sep))) return at(n);
  const real = realPathOf(dir, io);
  if (!real) return null;
  for (const end of ancestorEnds(abs, P)) if (realPathOf(abs.slice(0, end), io) === real) return at(end);
  return null;
}

/**
 * @typedef {RealPathIo & { statSync: (p: string) => { isFile(): boolean },
 *   lstatSync: (p: string) => { isSymbolicLink(): boolean }, readlinkSync: (p: string) => string }} ConfineIo
 */

/**
 * The file `rel` (relative to the folder `dir`) names, for a reader that must stay in that folder — the file a proof
 * cites, a dependency of a page (engine/sync): its real path when it is a file inside `dir`, links and junctions
 * followed; "outside" when it climbs out as written (`../`, joinAsWritten, whatever its length), or really lies
 * outside, or would were it there (a link or a junction followed, missingOutside): never read, and whether a file
 * outside exists is never told; null when there is no such file in `dir` (missing, a folder, a broken link that stays
 * inside, a path longer than MAX_PATH). The path is joined in one pass, never by path.resolve (quadratic on some
 * shapes, joinAsWritten); its length is checked on `rel` as written, then on the path joined: a `rel` padded past
 * MAX_PATH (`./` 20,000 times before `lib/a.txt`) is missing too, though it names a file, which no writer of a proof
 * does.
 * @param {string} dir
 * @param {string} rel
 * @param {ConfineIo} [io]
 * @returns {string|null}   a real path, "outside" or null
 */
export function fileInside(dir, rel, io = fs) {
  const P = io.path ?? path;
  const top = P.resolve(dir);
  const written = joinAsWritten(top, rel, P, rel.length <= MAX_PATH);
  if (!written) return "outside";
  if (!written.names) return null; // past MAX_PATH as written
  const abs = written.root + written.names.join(P.sep);
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
 * `rel` joined to the folder `top` (resolved) as path.resolve gives it (`P.resolve(P.join(top, rel))` is
 * `root + names.join(P.sep)`), or null when that lies outside `top` as written (neither `top` nor under it): in one
 * pass over the parts of `rel`, where path.resolve is quadratic (each `..` cuts the path built so far, copied whole:
 * `a/`×n then `b/../`×n, a long name then `b/../`×n) and `rel` comes from a page's text. A name goes down, `..` up,
 * never above the root path.resolve gives (`\\?\` for `\\?\C:\app`, a name `C:` under it), `.` and an empty part are
 * nothing; `\` separates too under Windows' rules. Out of `top`, a path may come back by its names (`../app/x` from
 * `app` is inside): `depth` counts the names of the path, `same` how many of the first ones are `top`'s. A drive, a
 * server or `\\?\` in `rel` is a name: join puts `rel` under `top`. Without `keep` (a `rel` past MAX_PATH, whose path
 * is not asked), the names are counted, never kept: memory stays constant whatever the length of `rel`.
 * @param {string} top   P.resolve(dir)
 * @param {string} rel
 * @param {import("node:path").PlatformPath} P
 * @param {boolean} keep   whether to keep the names (`names` null otherwise)
 * @returns {{ root: string, names: string[]|null }|null}
 */
function joinAsWritten(top, rel, P, keep) {
  const root = P.resolve(top, P.sep);
  const own = top.length > root.length ? top.slice(root.length).split(P.sep) : [];
  const names = keep ? own.slice() : null;
  let depth = own.length;
  let same = own.length;
  let start = 0;
  for (let i = 0; i <= rel.length; i++) {
    if (i < rel.length && rel[i] !== "/" && rel[i] !== P.sep) continue;
    const part = rel.slice(start, i);
    start = i + 1;
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (depth > 0) depth--;
      if (same > depth) same = depth;
      names?.pop();
    } else {
      if (same === depth && same < own.length && part === own[same]) same++;
      depth++;
      names?.push(part);
    }
  }
  return same < own.length ? null : { root, names };
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
 * length on a deep path that untrusted text names. A folder resolves only if its parent does, but for a root: Windows'
 * realpath fails on `\\?\C:\` and resolves `\\?\C:\Users`. With none known, the bisection runs below the root, and the
 * root is asked last, alone, when nothing below it resolves: so "nothing there" is never concluded from the root.
 * A device path deeper than its root that does not resolve (`\\?\UNC\host` above `\\?\UNC\host\share`) would break
 * that order too: a link's target is given without that prefix (withoutUncPrefix), and any other form kept
 * (`\\?\GLOBALROOT\Device\…`) gives at worst a false "outside" — the bisection then finds no folder that resolves —,
 * never a path judged inside that is not.
 * @param {string} abs
 * @param {number[]} ends   ancestorEnds(abs)
 * @param {number} lo
 * @param {string|null} real
 * @param {RealPathIo} io
 * @returns {{ at: number, real: string|null }}
 */
function nearestReal(abs, ends, lo, real, io) {
  const rootUnknown = lo < 0;
  if (rootUnknown) lo = 0; // the root, asked apart below
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
  if (!rootUnknown || found) return { at: lo, real };
  const root = hi > 0 ? realPathOf(abs.slice(0, ends[0]), io) : null; // hi 0: `abs` is the root, known not to resolve
  return root ? { at: 0, real: root } : { at: -1, real: null };
}

/**
 * The target of `p` when it is a link (one realPathOf cannot follow), resolved from the real folder it is in (a share
 * under Windows' device prefix as the share it names: withoutUncPrefix); UNPLACED when its text cannot place it
 * (climbsAfterName); null when it is not a link, or not there.
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
    const target = withoutUncPrefix(io.readlinkSync(p), P.sep);
    return climbsAfterName(target, P.sep) ? UNPLACED : P.resolve(folder, target);
  } catch {
    return null;
  }
}

/**
 * A link's target written as a share under Windows' device prefix, as the share it names — the path
 * realpathSync.native gives: `\\?\UNC\host\share\x` (or `\\.\`, `UNC` in any case, either separator) is
 * `\\host\share\x`. Under that prefix, `\\?\UNC\host` does not resolve while `\\?\UNC\host\share` does: a folder
 * deeper than the root (`\\?\UNC\`) against the order nearestReal counts on. A drive's (`\\?\C:\x`) needs nothing:
 * only its root (`\\?\C:\`) does not resolve, and nearestReal asks a root apart. Any other target is kept as it is —
 * one without a server and a share too (`\\?\UNC\host`, which never resolves) —, under POSIX' rules every one.
 * @param {string} target
 * @param {string} sep   the separator of the system, `/` also counting
 */
function withoutUncPrefix(target, sep) {
  const isSep = (/** @type {string|undefined} */ c) => c === "/" || c === sep;
  const device = isSep(target[0]) && isSep(target[1]) && (target[2] === "?" || target[2] === ".") && isSep(target[3]);
  if (sep !== "\\" || !device || target.slice(4, 7).toUpperCase() !== "UNC" || !isSep(target[7])) return target;
  const share = target.slice(8);
  let i = 0;
  while (i < share.length && !isSep(share[i])) i++; // the server's name
  return i > 0 && isSep(share[i]) && i + 1 < share.length && !isSep(share[i + 1]) ? "\\\\" + share : target;
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
