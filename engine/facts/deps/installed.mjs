// Licences read offline from the installed copies of the packages (ARCHITECTURE.md §6.9), for the items of the
// `dependencies` source that have none from their lock file — npm and pip only, the other ecosystems left as they are:
//   npm  `node_modules/<name>/package.json`, in the manifest's own folder first, then in each folder above it up to
//        the application's (npm's workspaces hoist to the root): the first that exists is the copy Node would load,
//        and the only one judged;
//   pip  the `*.dist-info/METADATA` of a virtual environment, `.venv/` or `venv/` (folders only) in the same folders,
//        its site-packages `lib/python*/site-packages` (POSIX) and `Lib/site-packages` (Windows): the first of them
//        whose dist-info folders name the package (PEP 503, engine/core/packages.mjs) is the one judged.
// Everything there is untrusted data the application's installs wrote (SECURITY.md): nothing is executed, imported
// or written. A path is resolved from the application's real folder one part at a time, each link's target judged
// before it is touched: a link that stays in the application is followed (pnpm's links into `node_modules/.pnpm`), a
// link out of it is never followed, nor looked at; a folder refused so, or over its bounds, stops the search (nothing
// further up stands in for what it may hold). A package's name is only ever looked up among the entries of the
// folders listed (never a path built from it), and every read is bounded: 10,000 entries a folder listed, 4 `python*`
// folders a virtual environment, 5,000 dist-info folders a site-packages, a package.json of 1 MB, only the header of a
// METADATA (up to its first blank line, 64 KB read at most: a header cut there keeps the fields read whole). A copy
// gives its licence only when it is the item's own: its name the item's (npm's exactly, pip's as PEP 503 normalises
// it), its version the item's when the item has an exact one; the licence then goes through npmLicence or
// pythonLicence (deps/licences.mjs: a licence's name, never its text or a secret). A read error, a broken link, an
// odd shape: no licence, never an error. Each folder listed and each file read is cached for the run, so the reads
// stay bounded by the number of folders and items.
import fs from "node:fs";
import path from "node:path";
import { packageKey } from "../../core/packages.mjs";
import { decodeText } from "./read.mjs";
import { npmLicence, pythonLicence } from "./licences.mjs";

/** The largest installed package.json read (npm's own hold a few KB). */
const MAX_PACKAGE_JSON = 1024 * 1024;
/** The most bytes of a METADATA read: its header comes first, its description (often long) after a blank line. */
const MAX_HEADER = 64 * 1024;
/**
 * The bounds of the folders listed (SECURITY.md). A test gives smaller ones to reach them (and checks these values):
 * filling a folder with ten thousand entries takes longer than the rest of the tests.
 */
export const LISTING_LIMITS = Object.freeze({
  /** The most entries a folder is listed to (node_modules, a scope, a lib/, a site-packages): past them, refused. */
  entries: 10_000,
  /** The most dist-info folders a site-packages holds: past them, it gives no licence (never a partial index). */
  distInfos: 5000,
});
/** The most `python*` folders of a virtual environment's lib/ (it holds one): past them, refused. */
const MAX_PYTHONS = 4;
/** The most links followed to resolve one path: a loop of links is refused. */
const MAX_LINKS = 32;
/** The folders of a virtual environment looked for, in this order. */
const VENVS = Object.freeze([".venv", "venv"]);
const DIST_INFO = ".dist-info";

/** Whether the path `p` is the folder `root` or inside it (compared as written: nothing is touched). */
function inside(root, p) {
  const rel = path.relative(root, p);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * The parts of `p` below the application's real folder, or below the folder as it was given (a link written with
 * that path: macOS's /var for /private/var), or null when it lies out of both.
 * @returns {string[]|null}
 */
function partsInside(run, p) {
  for (const root of run.roots)
    if (inside(root, p)) {
      const rel = path.relative(root, p);
      return rel ? rel.split(path.sep) : [];
    }
  return null;
}

/**
 * The real path of `abs`, resolved from the application's real folder one part at a time: each link's target is
 * judged before it is touched. null when a part is not there (a broken link too); false when the path is refused —
 * a link out of the application (never followed), more than MAX_LINKS links (a loop), an error.
 * @param {{ root: string, roots: string[] }} run
 * @param {string} abs
 * @returns {string|null|false}
 */
function resolveInside(run, abs) {
  let parts = partsInside(run, abs);
  if (!parts) return false;
  let at = run.root;
  let links = 0;
  while (parts.length) {
    const next = path.join(at, parts[0]);
    parts = parts.slice(1);
    let st;
    try {
      st = fs.lstatSync(next);
    } catch (e) {
      return e.code === "ENOENT" || e.code === "ENOTDIR" ? null : false;
    }
    if (!st.isSymbolicLink()) {
      at = next;
      continue;
    }
    if (++links > MAX_LINKS) return false;
    let target;
    try {
      target = partsInside(run, path.resolve(path.dirname(next), fs.readlinkSync(next)));
    } catch {
      return false;
    }
    if (!target) return false; // a link out of the application: never followed
    parts = [...target, ...parts];
    at = run.root;
  }
  return at;
}

/**
 * A folder of the application, listed: its real path and the names it holds; null when it is not there or is no
 * folder; false when it is refused (resolveInside) or holds more than LISTING_LIMITS.entries. Cached for the run.
 * @returns {{ real: string, names: Set<string> }|null|false}
 */
function listing(run, abs) {
  if (run.listings.has(abs)) return run.listings.get(abs);
  const real = resolveInside(run, abs);
  const found = real === false ? false : real ? listNames(real, run.limits.entries) : null;
  run.listings.set(abs, found);
  return found;
}

/** The names a real folder holds: null when it is no folder (a file) or is gone, false past `max` or on an error. */
function listNames(real, max) {
  let dir;
  try {
    dir = fs.opendirSync(real);
  } catch (e) {
    return e.code === "ENOTDIR" || e.code === "ENOENT" ? null : false;
  }
  try {
    const names = new Set();
    for (let e = dir.readSync(); e; e = dir.readSync()) {
      if (names.size >= max) return false;
      names.add(e.name);
    }
    return { real, names };
  } catch {
    return false;
  } finally {
    dir.closeSync();
  }
}

/**
 * The path of `parts` below the folder `abs`, each looked up among the entries of the folder listed above it (a
 * name is never a path: `..` is no entry); null when one is not there, false when a folder on the way is refused.
 */
function lookUp(run, abs, parts) {
  let at = abs;
  for (const part of parts) {
    const folder = listing(run, at);
    if (!folder) return folder;
    if (!folder.names.has(part)) return null;
    at = path.join(folder.real, part);
  }
  return at;
}

/**
 * The first bytes of an ordinary file, `max` and one more at most (one more: the caller tells a file over `max`), or
 * null: never a folder, a device or a named pipe, never an error.
 * @param {string} file  a real path
 * @param {number} max
 * @returns {Buffer|null}
 */
function readStart(file, max) {
  let fd;
  try {
    if (!fs.statSync(file).isFile()) return null;
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return null;
    const buffer = Buffer.alloc(Math.min(st.size, max) + 1);
    let n = 0;
    for (;;) {
      const got = fs.readSync(fd, buffer, n, buffer.length - n, n);
      n += got;
      if (got === 0 || n >= buffer.length) return buffer.subarray(0, n);
    }
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** The folders an item's installed copy is looked for in: its manifest's, then each one above, the application's last. */
function foldersOf(root, manifest) {
  const parts = String(manifest).split("/").slice(0, -1);
  if (parts.some((p) => p === "" || p === "." || p === "..")) return [];
  return [...parts.map((_, i) => path.join(root, ...parts.slice(0, parts.length - i))), root];
}

/** What an installed package.json says of itself: `{ name, version, license }`, or null (refused, unreadable). */
function packageDoc(run, real) {
  if (run.docs.has(real)) return run.docs.get(real);
  let found = null;
  const bytes = readStart(real, MAX_PACKAGE_JSON);
  if (bytes && bytes.length <= MAX_PACKAGE_JSON) {
    try {
      const doc = JSON.parse(decodeText(bytes));
      if (doc && typeof doc === "object" && !Array.isArray(doc))
        found = { name: doc.name, version: doc.version, license: npmLicence(doc) };
    } catch {
      // not valid JSON: no licence
    }
  }
  run.docs.set(real, found);
  return found;
}

/** The licence of an npm item's installed copy: the first `node_modules/<name>` from its manifest's folder up. */
function npmCopy(run, item, folders) {
  const parts = String(item.name).split("/");
  if (parts.length > 2 || (parts.length === 2 && !parts[0].startsWith("@"))) return null; // `name`, `@scope/name`
  for (const folder of folders) {
    const dir = lookUp(run, path.join(folder, "node_modules"), parts);
    const file = dir && resolveInside(run, path.join(dir, "package.json"));
    if (file === null) continue; // not there (a broken link neither): Node looks one folder up
    // The copy Node would load, judged alone: one refused (out of the application) is never stood in for.
    if (!file) return null;
    const doc = packageDoc(run, file);
    if (!doc || doc.name !== item.name) return null;
    if (item.version && doc.version !== item.version) return null; // another copy of the package
    return doc.license;
  }
  return null;
}

/**
 * The fields of a METADATA header (an e-mail header, as Python's email parser reads it): it ends at the first blank
 * line, or at a line that is neither a field nor a continuation; a continuation line (a blank first) folds into the
 * field before it, a "\n" kept (a multi-line text, which safeLicence refuses). `cut`: the text is the start of a
 * longer header — its last line, and the field it belongs to (it may go on past the cut), are left out. One pass:
 * linear (test/unit/facts-deps-growth.test.mjs, test/tools/redos-worker.mjs). A folded field's lines are one slice of
 * the text, taken when the field ends, never added line by line: a string grown so is a chain of every line, which the
 * garbage collector copies at each pass once it outgrows the young generation — past 80,000 lines or so, about as much
 * time again as the reading, and the growth test measured the collector's jump, not the reader.
 * @param {string} text
 * @param {{ cut?: boolean }} [o]
 * @returns {{ name: string|null, version: string|null, expression: string|null, license: string|null,
 *   classifiers: string[] }}
 */
export function metadataFields(text, { cut = false } = {}) {
  const body = cut ? text.slice(0, text.lastIndexOf("\n") + 1) : text;
  /** @type {Array<[string, string]>} */
  const fields = [];
  // The last field's continuation lines: from the line break that ends its first line to the end of its last one.
  let from = 0;
  let to = 0;
  const fold = () => {
    if (to > from) fields[fields.length - 1][1] += body.slice(from, to).replaceAll("\r\n", "\n");
  };
  let ended = false;
  for (let start = 0; start < body.length && !ended;) {
    const next = body.indexOf("\n", start);
    const end = next < 0 ? body.length : next;
    const stop = end > start && body[end - 1] === "\r" ? end - 1 : end;
    const line = body.slice(start, stop);
    start = end + 1;
    const colon = line.indexOf(":");
    const field = line.slice(0, colon);
    if (line === "") ended = true;
    else if (line[0] === " " || line[0] === "\t") {
      if (fields.length) to = stop;
    } else if (colon <= 0 || field.includes(" ") || field.includes("\t")) ended = true;
    else {
      fold();
      fields.push([field.toLowerCase(), line.slice(colon + 1).trim()]);
      from = to = end;
    }
  }
  fold();
  if (cut && !ended) fields.pop();
  // A field given twice: the first, as Python's email parser gives it; the classifiers, every one.
  const first = (key) => fields.find(([k]) => k === key)?.[1] ?? null;
  return {
    name: first("name"),
    version: first("version"),
    expression: first("license-expression"),
    license: first("license"),
    classifiers: fields.filter(([k]) => k === "classifier").map(([, v]) => v),
  };
}

/** The header of a METADATA file (64 KB read at most), or null. */
function metadataOf(run, file) {
  const real = resolveInside(run, file);
  if (!real) return null;
  if (run.headers.has(real)) return run.headers.get(real);
  const bytes = readStart(real, MAX_HEADER);
  const found = bytes
    ? metadataFields(decodeText(bytes.subarray(0, MAX_HEADER)), { cut: bytes.length > MAX_HEADER })
    : null;
  run.headers.set(real, found);
  return found;
}

/**
 * The site-packages of the virtual environments of one folder, listed, in the order they are looked at; false when
 * one of them is refused (the search stops there: what it holds is unknown).
 * @returns {Array<{ real: string, names: Set<string> }>|false}
 */
function sitePackagesOf(run, folder) {
  if (!run.venvs.has(folder)) run.venvs.set(folder, venvSites(run, folder));
  return run.venvs.get(folder);
}

/** sitePackagesOf, not cached. */
function venvSites(run, folder) {
  const out = [];
  for (const name of VENVS) {
    const venv = listing(run, path.join(folder, name)); // a `.venv` file (a path to elsewhere, for some tools): null
    if (venv === false) return false;
    if (!venv) continue;
    const lib = listing(run, path.join(venv.real, "lib"));
    if (lib === false) return false;
    const pythons = lib ? [...lib.names].filter((p) => p.startsWith("python")).sort() : [];
    if (pythons.length > MAX_PYTHONS) return false;
    for (const where of [...pythons.map((p) => path.join(lib.real, p)), path.join(venv.real, "Lib")]) {
      const site = listing(run, path.join(where, "site-packages"));
      if (site === false) return false;
      if (site) out.push(site);
    }
  }
  return out;
}

/**
 * The dist-info folders of a site-packages by PEP 503 key (`My_Lib-1.0.dist-info`: my-lib), each with the version
 * its folder's name gives; false when it holds more than LISTING_LIMITS.distInfos.
 * @param {{ real: string, names: Set<string> }} site
 * @returns {Map<string, Array<{ dir: string, version: string }>>|false}
 */
function distInfos(run, site) {
  if (run.indexes.has(site.real)) return run.indexes.get(site.real);
  /** @type {Map<string, Array<{ dir: string, version: string }>>|false} */
  let index = new Map();
  let count = 0;
  for (const name of site.names) {
    if (!name.endsWith(DIST_INFO)) continue;
    if (++count > run.limits.distInfos) {
      index = false;
      break;
    }
    const stem = name.slice(0, -DIST_INFO.length);
    const dash = stem.indexOf("-");
    if (dash <= 0) continue;
    const key = packageKey("pip", stem.slice(0, dash));
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ dir: path.join(site.real, name), version: stem.slice(dash + 1) });
  }
  run.indexes.set(site.real, index);
  return index;
}

/** The licence of a pip item's installed copy: the first site-packages from its manifest's folder up that names it. */
function pipCopy(run, item, folders) {
  const key = packageKey("pip", item.name);
  for (const folder of folders) {
    const sites = sitePackagesOf(run, folder);
    if (!sites) return null;
    for (const site of sites) {
      const index = distInfos(run, site);
      if (!index) return null;
      const copies = index.get(key);
      if (!copies) continue;
      // The site-packages that names the package, judged alone: the item's own version among its copies, else the
      // only one there — one METADATA read an item at most.
      const copy = item.version
        ? copies.find((c) => c.version === item.version)
        : copies.length === 1
          ? copies[0]
          : null;
      if (!copy) return null;
      const meta = metadataOf(run, path.join(copy.dir, "METADATA"));
      if (!meta || typeof meta.name !== "string" || packageKey("pip", meta.name) !== key) return null;
      if (item.version && meta.version !== item.version) return null; // a folder's name is no proof of its version
      return pythonLicence(meta);
    }
  }
  return null;
}

const COPIES = Object.freeze({ npm: npmCopy, pip: pipCopy });

/**
 * The items, an npm or pip item without a licence given the one its installed copy names (`licenseFrom:
 * "installed"`); a lock's licence kept (`licenseFrom: "lock"`). New items, the given ones never changed.
 * @template {{ name: string, ecosystem: string, manifest: string, version?: string|null, license?: string }} T
 * @param {string} appDir
 * @param {T[]} items
 * @param {{ entries: number, distInfos: number }} [limits]  LISTING_LIMITS; a test gives smaller ones
 * @returns {T[]}
 */
export function withInstalledLicences(appDir, items, limits = LISTING_LIMITS) {
  let root;
  try {
    root = fs.realpathSync(appDir);
  } catch {
    return [...items];
  }
  const run = {
    root,
    roots: [...new Set([root, path.resolve(appDir)])],
    limits,
    listings: new Map(),
    docs: new Map(),
    headers: new Map(),
    venvs: new Map(),
    indexes: new Map(),
  };
  return items.map((item) => {
    if (item.license || !Object.hasOwn(COPIES, item.ecosystem)) return item;
    let license = null;
    try {
      license = COPIES[item.ecosystem](run, item, foldersOf(root, item.manifest));
    } catch {
      // an odd shape: no licence
    }
    return license ? { ...item, license, licenseFrom: "installed" } : item;
  });
}
