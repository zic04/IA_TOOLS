// npm manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs): package.json,
// package-lock.json (v1 to v3), pnpm-lock.yaml; yarn.lock is read by deps/yarn.mjs with the helpers exported here.
import path from "node:path";
import { readText, readJson, readBeside } from "./read.mjs";
import { withVia } from "./graph.mjs";
import { workspaceFolders } from "./workspaces.mjs";
import { LOCAL_SPEC } from "../network.mjs";
import { npmLicence } from "./licences.mjs";

/**
 * What tells an npm package that is not from a public registry (`local: true`, never sent by network.mjs). The
 * manifests are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs).
 */
export const NPM_PATTERNS = Object.freeze({
  /** A tarball of a public npm registry; any other `resolved` (a private registry, git, a file) is local. */
  publicTarball: /^https:\/\/registry\.(?:npmjs\.org|yarnpkg\.com)\//i,
  /** yarn.lock: `resolved "<url>"` (v1) and `resolution: "<name>@<protocol>…"` (berry). */
  yarnResolved: /^ {2}resolved:?[ \t]+"?([^"\s]+)/,
  yarnResolution: /^ {2}resolution:[ \t]+"?([^"\s]+)/,
  /** A berry resolution through the configured registry ("name@npm:1.0.0", a patch of one). */
  yarnRegistryProtocol: /@(?:npm|patch):/,
  /** pnpm-lock.yaml: a resolution that is not a registry tarball (an archive URL, a git repository, a folder). */
  pnpmLocalResolution: /^\s+resolution:\s*\{[^}]*\b(?:tarball|repo|directory|commit):/,
  /** An exact version a package.json may pin ("1.2.3", "v1.2.3-beta.1+build"): a range is not one. */
  exactVersion: /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.]+)?$/,
  /** yarn.lock: a dependency line of a block's `dependencies:` ("    name "^1.0.0"", berry "    name: npm:^1"). */
  yarnDependency: /^ {4}"?((?:@[^/\s"]+\/)?[^@\s":]+)"?:?\s/,
  /** yarn.lock: the header of a block's own dependencies, and of any other of its fields. */
  yarnDependencies: /^ {2}(?:dependencies|optionalDependencies):\s*$/,
  yarnField: /^ {2}\S/,
  /**
   * yarn.lock: a field at two spaces as Yarn 1 writes it (`version "1.0.0"`, `resolved "<url>"`, `integrity sha512-…`,
   * `uid …`, a section of dependencies) — one space before its value, nothing after it, a word left unquoted only as
   * Yarn leaves one (a letter first, never `true` or `false`) —, a line at four spaces (a dependency), and where Yarn's
   * tokenizer breaks a line.
   */
  yarnPlainField:
    /^ {2}(?:(?:version|integrity|uid) (?:"[^"\\]*"|(?!true|false)[A-Za-z][^\s"\\,:[\]#]*)|resolved "[^"\s\\]+"|(?:dependencies|optionalDependencies):)$/,
  yarnDeeper: /^ {4}\S/,
  yarnLineBreak: /\r\n|\r|\n/,
  /**
   * yarn.lock: a block's header as Yarn 1 writes it: specifiers joined by ", ", a quoted one holding no comma, an
   * unquoted one as Yarn leaves one (a letter first, never `true` or `false`: Yarn quotes `@scope/x`, `7zip-bin`).
   */
  yarnHeader:
    /^(?:"[^"\\,]+"|(?!true|false)[A-Za-z][^\s"\\,:[\]]*)(?:, (?:"[^"\\,]+"|(?!true|false)[A-Za-z][^\s"\\,:[\]]*))*:$/,
  yarnLoneCr: /\r(?!\n)/,
  /** A spec npm reads as a URL (npa: letters, a `git+` first, then `:`), and a scoped registry spec (`@scope/x@^1`). */
  npaUrl: /^(?:git\+)?[a-z]+:/i,
  scopedSpec: /^@[a-z0-9~-][a-z0-9._~-]*\/[a-z0-9~-][a-z0-9._~-]*(?:@[^/\\]*)?$/i,
  /** A Windows 8.3 short name (`CORPOR~1`): the same folder as a long one, under another name. */
  shortName: /~\d/,
  /** pnpm-lock.yaml: its importers, one importer (".", "packages/api"), its sections, a name, a package key. */
  pnpmImporters: /^importers:\s*$/,
  pnpmImporter: /^ {2}\S[^:]*:\s*$/,
  pnpmSection: /^ {4}(dependencies|devDependencies|optionalDependencies):\s*$/,
  pnpmName: /^ {6}(\S+):\s*$/,
  pnpmPackage: /^ {2,4}'?\/?(@[^/'"\s]+\/[^@'"\s]+|[^@'"\s]+)@([^:'"\s(]+)(?:\([^)]*\))?'?"?:\s*$/,
});

/**
 * Is `resolved` a tarball of a public npm registry FOR THIS PACKAGE — its path `/<name>/-/<base>-…` (a scoped name's
 * "/" also written %2f; `<base>` the name without its scope), the name compared exactly, no ".." anywhere? The proof
 * --network needs (network.mjs): a lock entry resolved to another package's tarball (an alias, `"corp-x":
 * "npm:lodash@^4"`) proves nothing of its own name.
 * @param {string} name
 * @param {unknown} resolved
 */
function tarballOf(name, resolved) {
  const rest = tarballPath(resolved);
  return rest !== null && namesTarball(name, rest);
}

/** The path of a tarball on a public npm registry, through no ".." (`%2e` either), or null: read once a block. */
export function tarballPath(resolved) {
  if (typeof resolved !== "string") return null;
  const host = NPM_PATTERNS.publicTarball.exec(resolved);
  if (!host) return null;
  const rest = resolved.slice(host[0].length);
  return rest.includes("..") || rest.toLowerCase().includes("%2e") ? null : rest;
}

/** Whether a tarball's path (tarballPath) is `name`'s own: `<name>/-/<base>-…`, its scope's slash also `%2f`. */
export function namesTarball(name, rest) {
  const base = name.split("/").pop();
  return [name, name.replace("/", "%2f"), name.replace("/", "%2F")].some((n) => rest.startsWith(`${n}/-/${base}-`));
}

/** Is a package-lock v2/v3 entry local: a workspace link, not from a public registry, an alias (`name` another's)? */
const entryLocal = (info, name) =>
  !!info.link ||
  (typeof info.resolved === "string" && !NPM_PATTERNS.publicTarball.test(info.resolved)) ||
  (typeof info.name === "string" && info.name !== name);

/**
 * Makes the item of `name` already read local, its proof dropped (a later entry of it came from elsewhere). `byName`:
 * the items read so far, by name — one look-up, so that a lock of many duplicates stays linear.
 */
function markLocal(byName, name) {
  const item = byName.get(name);
  if (!item) return;
  item.local = true;
  delete item.public;
}

/**
 * What the entries of a lock say of each name's proof, whatever their order (npm reads a lock's keys in any order): a
 * name is proven when one entry of it is its own tarball on a public registry and every other one is too — an entry
 * with no `resolved`, or another package's tarball, disproves it; a copy bundled inside another package's tarball
 * (`inBundle`, v1 `bundled`, no `resolved` of its own) neither proves nor disproves it. Local entries are judged by
 * markLocal.
 */
function proofs() {
  /** @type {Map<string, { good: boolean, bad: boolean }>} */
  const byName = new Map();
  return {
    /** @param {string} name @param {any} info */
    judge(name, info) {
      if ((info.inBundle === true || info.bundled === true) && typeof info.resolved !== "string") return;
      let p = byName.get(name);
      if (!p) byName.set(name, (p = { good: false, bad: false }));
      if (tarballOf(name, info.resolved)) p.good = true;
      else p.bad = true;
    },
    /** @param {{ name: string, local?: boolean, public?: boolean }[]} items */
    apply(items) {
      for (const item of items) {
        const p = byName.get(item.name);
        if (!item.local && p?.good && !p.bad) item.public = true;
      }
    },
  };
}

/** Is a lock's version or a yarn range an npm alias ("npm:lodash@4.17.21": another package under this name)? */
export const npmAlias = (range) => String(range ?? "").startsWith("npm:") && String(range).slice(4).includes("@");

/** The names a package.json declares: its dependencies (and optional ones), its devDependencies. */
function declaredNames(pkg) {
  const names = (deps) => (deps && typeof deps === "object" ? Object.keys(deps) : []);
  return {
    prod: [...names(pkg?.dependencies), ...names(pkg?.optionalDependencies)],
    dev: names(pkg?.devDependencies),
  };
}

/**
 * What the package.json beside a lock file declares, with its workspace members' own (deps/workspaces.mjs): the
 * direct dependencies of a lock that has no root entry of its own (yarn.lock, package-lock.json v1). Read in that
 * folder only, each file an ordinary one (readBeside: never a link).
 */
export function declaredBeside(abs) {
  const dir = path.dirname(abs);
  const prod = new Set();
  const dev = new Set();
  const read = (file) => {
    try {
      return JSON.parse(readBeside(file, { within: dir }) ?? "null");
    } catch {
      return null;
    }
  };
  const root = read(path.join(dir, "package.json"));
  for (const pkg of [root, ...workspaceFolders(dir, root).map((f) => read(path.join(f, "package.json")))]) {
    const names = declaredNames(pkg);
    for (const n of names.prod) prod.add(n);
    for (const n of names.dev) dev.add(n);
  }
  return { prod, dev, direct: new Set([...prod, ...dev]) };
}

/** Dev only: a devDependency nowhere declared as a dependency. */
export const devOnly = (declared, name) => declared.dev.has(name) && !declared.prod.has(name);

/**
 * Direct dependencies of one package.json: dependencies and optionalDependencies (dev: false), devDependencies (dev:
 * true). `version` is
 * the version it pins, else null and `spec` keeps the range as written; a folder, a workspace, git or a URL is
 * `local` (never sent by network.mjs).
 */
function fromPackageJson(abs, manifest, unreadable) {
  const pkg = readJson(abs, manifest, unreadable);
  if (pkg === null || typeof pkg !== "object") return [];
  const out = [];
  for (const [dev, deps] of [
    [false, pkg.dependencies],
    [false, pkg.optionalDependencies],
    [true, pkg.devDependencies],
  ])
    for (const [name, raw] of Object.entries(deps || {})) {
      const spec = String(raw);
      const exact = NPM_PATTERNS.exactVersion.test(spec);
      out.push({
        name,
        version: exact ? spec.replace(/^v/, "") : null,
        ...(exact ? {} : { spec }),
        ecosystem: "npm",
        direct: true,
        dev,
        manifest,
        ...(LOCAL_SPEC.test(spec) ? { local: true } : {}),
      });
    }
  return out;
}

/** The names a lock entry depends on (its dependencies and optional ones). */
const dependsOn = (info) => [
  ...Object.keys(info?.dependencies || {}),
  ...Object.keys(info?.optionalDependencies || {}),
];

/** As in v2/v3: a package-lock v1 entry not taken from a public registry, or whose version is a folder, git, a URL or an alias. */
const v1Local = (info) =>
  (typeof info?.resolved === "string" && !NPM_PATTERNS.publicTarball.test(info.resolved)) ||
  LOCAL_SPEC.test(String(info?.version ?? "")) ||
  npmAlias(info?.version);

/**
 * Whether a package-lock v1 spec may name a folder — as npm reads one (npa) or wider: `file:` in any case, a path that
 * starts with `.`, `/`, `\`, `~` or a drive, or any spec holding a `/` or `\` that npm does not read as a URL
 * (`git+https:`, `github:`, `npm:`: letters, then `:`) or as a scoped registry spec (`@scope/x@^1`); never an
 * archive (`.tgz`, `.tar.gz`, `.tar`), which npm installs as a package.
 * @param {unknown} spec
 */
function mayBeLink(spec) {
  if (typeof spec !== "string" || !spec) return false;
  const lower = spec.toLowerCase();
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz") || lower.endsWith(".tar")) return false;
  if (lower.startsWith("file:")) return true;
  const drive = spec.length > 1 && spec[1] === ":";
  if (drive || spec[0] === "." || spec[0] === "/" || spec[0] === "\\" || spec[0] === "~") return true;
  if (NPM_PATTERNS.npaUrl.test(spec) || NPM_PATTERNS.scopedSpec.test(spec)) return false;
  return spec.includes("/") || spec.includes("\\");
}

/**
 * Where a v1 spec that may be a link points, as folder names from the lock's folder (`[]` for the folder itself, `..`
 * first for one outside it); a link back into the folder by its present name (`../app/x` from `app`) is placed in
 * it. `null` when it cannot be placed — a home folder (`~`), an absolute path, a drive: where depends on the machine
 * that installs.
 * @param {string} spec
 * @param {string[]} dirNames  the lock's folder, its names outermost first
 * @returns {string[]|null}
 */
function linkPlace(spec, dirNames) {
  const raw = (spec.toLowerCase().startsWith("file:") ? spec.slice(5) : spec).split("\\").join("/");
  if (raw[0] === "~" || raw[0] === "/" || (raw.length > 1 && raw[1] === ":")) return null;
  const names = path.posix
    .normalize(raw)
    .split("/")
    .filter((name) => name !== "" && name !== ".");
  let up = 0;
  while (names[up] === "..") up++;
  const back = dirNames.slice(dirNames.length - up);
  const home =
    up > 0 && back.length === up && back.every((name, i) => folderKey(name) === folderKey(names[up + i] ?? ""));
  return home ? names.slice(2 * up) : names;
}

/**
 * A location as a filesystem that compares names in any case, in any Unicode form, and drops their trailing dots and
 * spaces (Windows, macOS) reads it: two locations it reads alike are one folder, wherever the lock is installed.
 * @param {string} location
 */
export function folderKey(location) {
  return location
    .split("/")
    .map((part) => {
      if (part === "." || part === "..") return part;
      let end = part.length;
      while (end > 0 && (part[end - 1] === "." || part[end - 1] === " ")) end--;
      return part.slice(0, end);
    })
    .join("/")
    .normalize("NFKC")
    .toLowerCase();
}

/** The most places a v1 entry's dependencies are counted at: past it, a place the kit cannot follow — no proof. */
const MAX_PLACES = 64;

/** One package-lock v1 entry read into `state` (its item, or what a later entry of the same name says of it). */
function v1Entry(state, name, info) {
  const local = v1Local(info);
  if (!local) state.proofs.judge(name, info);
  if (state.graph.has(name)) {
    if (local) markLocal(state.byName, name); // the same name nested elsewhere, from elsewhere there
    return;
  }
  state.graph.set(name, [...Object.keys(info.requires || {}), ...Object.keys(info.dependencies || {})]);
  const item = {
    name,
    version: info.version,
    ecosystem: "npm",
    direct: state.declared.direct.has(name),
    dev: !!info.dev || devOnly(state.declared, name),
    manifest: state.manifest,
    ...(local ? { local: true } : {}),
  };
  state.out.push(item);
  state.byName.set(name, item);
}

/**
 * A package-lock.json v1: its nested "dependencies" tree, read level by level (a queue of its own: a lock thousands of
 * levels deep never exhausts the call stack), so that a package's top-level entry comes before its nested copies.
 * Each entry is counted at every folder npm 7+ may give it reading a v1 lock: below its parent's folders and — an
 * entry that may be a link (mayBeLink: its `version`, `from` or `resolved`) — below the folder each names
 * (linkPlace), 64 places at most. Folders are interned (one id a folder, reached from its parent's id by one name:
 * linear). A name that is no npm name's shape, a folder reached twice (folderKey: case, Unicode form, trailing dots and
 * spaces), a link the kit cannot place, or more places than followed, is a place npm may read otherwise than the kit:
 * the lock proves nothing. Not told: a link back into the folder under another name than it has here (a renamed
 * clone).
 */
function fromLockV1(lock, abs, manifest) {
  const dirNames = path.resolve(path.dirname(abs)).split(path.sep).filter(Boolean);
  const state = {
    declared: declaredBeside(abs),
    manifest,
    out: [],
    byName: new Map(),
    graph: new Map(),
    proofs: proofs(),
  };
  const ids = new Map();
  const step = (id, name) => {
    const key = `${id}\0${folderKey(name)}`;
    let next = ids.get(key);
    if (next === undefined) ids.set(key, (next = ids.size + 1));
    return next;
  };
  const occupied = new Set();
  let odd = false;
  const queue = [{ deps: lock.dependencies, bases: [0] }];
  for (let q = 0; q < queue.length; q++) {
    const { deps, bases } = queue[q];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, info] of Object.entries(deps)) {
      if (!npmNameShape(name)) odd = true;
      if (!info || typeof info !== "object") continue; // no package (`null`, a string): left out
      const places = new Set(bases.map((base) => name.split("/").reduce(step, step(base, "node_modules"))));
      for (const place of places) {
        if (occupied.has(place)) odd = true;
        occupied.add(place);
      }
      v1Entry(state, name, info);
      if (!info.dependencies) continue;
      // Once the lock proves nothing, its places no longer matter: its items are still read, no folder followed.
      if (!odd)
        for (const spec of [info.version, info.from, info.resolved].filter(mayBeLink)) {
          const names = linkPlace(spec, dirNames);
          if (names === null) odd = true;
          else places.add(names.reduce(step, 0));
        }
      if (places.size > MAX_PLACES) odd = true;
      queue.push({ deps: info.dependencies, bases: odd ? [] : [...places] });
    }
  }
  if (!odd) state.proofs.apply(state.out);
  return withVia(state.out, state.declared.direct, state.graph);
}

/**
 * Whether a package-lock location is written as npm writes one, read as npm resolves it: from the lock's folder
 * (`dir`), the relative path back to where it resolves must be the key itself — so no empty, `.` or `..` folder that
 * cancels out (`node_modules/x/`, `node_modules//x`, `a/../node_modules/x`), no climb past the filesystem's root, no
 * drive, absolute or UNC path (a `:`, a first `/`), no `\` —, and a key that goes out of the folder (`../shared`, as npm writes a
 * `file:` link) must not come back into it, in any case (a lock may be installed on Windows). npm resolves any other
 * spelling to a folder, its later entry replacing the earlier one: the kit, reading the key as written, could miss
 * it — such a lock proves nothing.
 * @param {string} key
 * @param {string} dir
 */
function canonicalLocation(key, dir) {
  if (key.includes("\\") || key.includes(":") || key.startsWith("/") || NPM_PATTERNS.shortName.test(key)) return false;
  const target = path.resolve(dir, key);
  if (path.relative(dir, target).split(path.sep).join("/") !== key) return false;
  const inside = (target + path.sep).toLowerCase().startsWith((path.resolve(dir) + path.sep).toLowerCase());
  return !(inside && key.split("/").includes(".."));
}

/** Whether a package-lock v1 dependency's name has an npm name's shape: `name` or `@scope/name`, no path in it. */
const npmNameShape = (name) => {
  const parts = name.split("/");
  return (
    !name.includes("\\") &&
    !name.includes(":") &&
    !NPM_PATTERNS.shortName.test(name) &&
    parts.every((part) => part !== "" && part !== "." && part !== "..") &&
    (parts.length === 1 || (parts.length === 2 && parts[0][0] === "@"))
  );
};

/**
 * A package-lock's entries, the shallower first, the root's own `node_modules/…` before a workspace's or an outside
 * folder's of the same depth (in their order otherwise): a top-level `node_modules/<name>` is the package's own entry — its version, its proof —, a nested copy npm sorts before it (a bundled one) only a later word
 * on it.
 */
const byDepth = (packages) =>
  Object.entries(packages)
    .map((entry) => ({
      entry,
      depth: entry[0].split("node_modules/").length,
      root: entry[0].startsWith("node_modules/") ? 0 : 1,
    }))
    .sort((a, b) => a.depth - b.depth || a.root - b.root)
    .map(({ entry }) => entry);

/**
 * A package-lock.json v2/v3: a flat "packages" map keyed "node_modules/<name>", whose root entry `""` and the entries
 * of the workspace members (keys without "node_modules") list the direct dependencies and devDependencies; each
 * entry's own dependencies give the chains (`via`).
 */
function fromLockPackages(packages, manifest, abs) {
  const dir = path.dirname(abs);
  const out = [];
  const byName = new Map();
  const graph = new Map();
  const declared = { prod: new Set(), dev: new Set() };
  for (const [key, info] of Object.entries(packages))
    if (!key.split("/").includes("node_modules")) {
      const names = declaredNames(info);
      for (const n of names.prod) declared.prod.add(n);
      for (const n of names.dev) declared.dev.add(n);
    }
  const direct = new Set([...declared.prod, ...declared.dev]);
  const verdicts = proofs();
  let odd = false;
  const folders = new Set();
  for (const [key, info] of byDepth(packages)) {
    if (key !== "" && !canonicalLocation(key, dir)) odd = true;
    // Two keys a case-insensitive filesystem reads as one folder (`Corp-Lib`, `corp-lib.`): the later wins there.
    const folder = folderKey(key);
    if (key !== "" && folders.has(folder)) odd = true;
    folders.add(folder);
    // An entry that is no object (`null`, a string) is no package: left out, never a crash.
    if (key === "" || !info || typeof info !== "object") continue;
    const m = /node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
    if (!m) continue;
    // A workspace link, a package not taken from a public registry, or an alias (its entry names another package:
    // `"node_modules/corp-x": { "name": "x" }`): its name is never sent (network.mjs). Otherwise its proof: its
    // `resolved` is its own tarball on a public registry, in every entry of the name (the only names --network sends).
    const local = entryLocal(info, m[1]);
    if (!local) verdicts.judge(m[1], info);
    if (graph.has(m[1])) {
      // The same name nested elsewhere (another version): taken from elsewhere there, it is local everywhere.
      if (local) markLocal(byName, m[1]);
      continue;
    }
    graph.set(m[1], dependsOn(info));
    // Its licence as the lock wrote it, through the licences' allowlist (deps/licences.mjs): a text, never an object.
    const license = npmLicence(info);
    const item = {
      name: m[1],
      version: info.version,
      ecosystem: "npm",
      direct: direct.has(m[1]),
      dev: !!info.dev || devOnly(declared, m[1]),
      manifest,
      ...(license ? { license, licenseFrom: "lock" } : {}),
      ...(local ? { local } : {}),
    };
    out.push(item);
    byName.set(m[1], item);
  }
  // A location npm resolves to a folder the kit may not tell: the lock proves nothing.
  if (!odd) verdicts.apply(out);
  return withVia(out, direct, graph);
}

/**
 * One package-lock.json. v2/v3: a flat "packages" map keyed "node_modules/<name>", whose root entry `""` and the
 * entries of the workspace members (keys without "node_modules") list the direct dependencies and devDependencies;
 * each entry's own dependencies give the chains (`via`). v1: a nested "dependencies" tree with no root entry — the
 * direct ones are those the package.json beside it (and its workspaces) declares.
 */
function fromPackageLock(abs, manifest, unreadable) {
  const lock = readJson(abs, manifest, unreadable, true);
  if (lock === null || typeof lock !== "object") return [];
  if (lock.packages && typeof lock.packages === "object") return fromLockPackages(lock.packages, manifest, abs);
  // A `packages` that is no object (`true`, a string): npm reads no such lock — nor does the kit.
  if (lock.packages) {
    unreadable.push({ file: manifest, reason: "json" });
    return [];
  }
  if (lock.dependencies) return fromLockV1(lock, abs, manifest);
  return [];
}

/** The direct dependency and devDependency names of every importer of pnpm-lock.yaml (the root ".", each member). */
function pnpmDirectNames(text) {
  const p = NPM_PATTERNS;
  const direct = new Set();
  const dev = new Set();
  let inImporters = false;
  let inImporter = false;
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (p.pnpmImporters.test(line)) {
      inImporters = true;
      continue;
    }
    if (!inImporters) continue;
    if (/^\S/.test(line)) {
      inImporters = false;
      continue;
    }
    if (p.pnpmImporter.test(line)) {
      inImporter = true;
      section = null;
      continue;
    }
    if (!inImporter) continue;
    const sec = p.pnpmSection.exec(line);
    if (sec) {
      section = sec[1];
      continue;
    }
    if (section) {
      const name = p.pnpmName.exec(line);
      if (name) (section === "devDependencies" ? dev : direct).add(name[1].replace(/^'|'$/g, ""));
      else if (/^ {4}\S/.test(line)) section = null;
    }
  }
  // A package both a dependency of one importer and a devDependency of another is not dev only.
  for (const n of direct) dev.delete(n);
  return { direct: new Set([...direct, ...dev]), dev };
}

/** One pnpm-lock.yaml: package keys of the "packages:" section, "name@version:" (scoped names kept whole). */
function fromPnpmLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const { direct, dev } = pnpmDirectNames(text);
  const out = [];
  const seen = new Set();
  /** @type {{ name: string, version: string, ecosystem: string, direct: boolean, dev: boolean, manifest: string,
   *   local?: boolean }|null} */
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = NPM_PATTERNS.pnpmPackage.exec(line);
    if (m) {
      current = null;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      current = { name: m[1], version: m[2], ecosystem: "npm", direct: direct.has(m[1]), dev: dev.has(m[1]), manifest };
      out.push(current);
    } else if (current && NPM_PATTERNS.pnpmLocalResolution.test(line)) current.local = true; // not the registry
  }
  return out;
}

/** The reader of each npm manifest or lock file, by file name (lower case). */
export const NPM_READERS = Object.freeze({
  "package.json": fromPackageJson,
  "package-lock.json": fromPackageLock,
  "pnpm-lock.yaml": fromPnpmLock,
});
