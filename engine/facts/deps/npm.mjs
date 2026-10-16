// npm manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs): package.json,
// package-lock.json (v1 to v3), pnpm-lock.yaml, yarn.lock (v1 and berry).
import { readText, readJson } from "./read.mjs";

/**
 * What tells an npm package that is not from a public registry (`local: true`, never sent by network.mjs). The
 * manifests are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs).
 */
export const NPM_PATTERNS = Object.freeze({
  /** A tarball of a public npm registry; any other `resolved` (a private registry, git, a file) is local. */
  publicTarball: /^https:\/\/registry\.(?:npmjs\.org|yarnpkg\.com)\//i,
  /** yarn.lock: `resolved "<url>"` (v1) and `resolution: "<name>@<protocol>…"` (berry). */
  yarnResolved: /^\s+resolved:?\s+"?([^"\s]+)/,
  yarnResolution: /^\s+resolution:\s+"?([^"\s]+)/,
  /** A berry resolution through the configured registry ("name@npm:1.0.0", a patch of one). */
  yarnRegistryProtocol: /@(?:npm|patch):/,
  /** pnpm-lock.yaml: a resolution that is not a registry tarball (an archive URL, a git repository, a folder). */
  pnpmLocalResolution: /^\s+resolution:\s*\{[^}]*\b(?:tarball|repo|directory|commit):/,
});

/** Direct dependencies of one package.json: dependencies (dev: false) and devDependencies (dev: true). */
function fromPackageJson(abs, manifest, unreadable) {
  const pkg = readJson(abs, manifest, unreadable);
  if (pkg === null || typeof pkg !== "object") return [];
  const out = [];
  for (const [dev, deps] of [
    [false, pkg.dependencies],
    [true, pkg.devDependencies],
  ])
    for (const [name, version] of Object.entries(deps || {}))
      out.push({ name, version: String(version), ecosystem: "npm", direct: true, dev, manifest });
  return out;
}

/**
 * One package-lock.json (npm v2/v3: a flat "packages" map keyed "node_modules/<name>", whose root entry `""`
 * lists the direct dependencies and devDependencies; v1: a nested "dependencies" tree, with no such signal).
 */
function fromPackageLock(abs, manifest, unreadable) {
  const lock = readJson(abs, manifest, unreadable);
  if (lock === null || typeof lock !== "object") return [];
  const out = [];
  if (lock.packages && typeof lock.packages === "object") {
    const root = lock.packages[""] || {};
    const direct = new Set(Object.keys(root.dependencies || {}));
    const dev = new Set(Object.keys(root.devDependencies || {}));
    const seen = new Set();
    for (const [key, info] of Object.entries(lock.packages)) {
      if (key === "") continue;
      const m = /node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      // A workspace link, or a package not taken from a public registry: its name is never sent (network.mjs).
      const local =
        !!info.link || (typeof info.resolved === "string" && !NPM_PATTERNS.publicTarball.test(info.resolved));
      out.push({
        name: m[1],
        version: info.version,
        ecosystem: "npm",
        direct: direct.has(m[1]),
        dev: dev.has(m[1]) || !!info.dev,
        manifest,
        ...(info.license ? { license: info.license } : {}),
        ...(local ? { local } : {}),
      });
    }
  } else if (lock.dependencies) {
    // v1: no self-contained direct/transitive signal at this level; every entry is reported indirect.
    const seen = new Set();
    const visit = (deps) => {
      for (const [name, info] of Object.entries(deps || {})) {
        if (!seen.has(name)) {
          seen.add(name);
          out.push({ name, version: info.version, ecosystem: "npm", direct: false, dev: !!info.dev, manifest });
        }
        if (info.dependencies) visit(info.dependencies);
      }
    };
    visit(lock.dependencies);
  }
  return out;
}

/** The direct dependency and devDependency names of pnpm-lock.yaml's own root importer ("importers: . :"). */
function pnpmDirectNames(text) {
  const direct = new Set();
  const dev = new Set();
  let inImporters = false;
  let inRoot = false;
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^importers:\s*$/.test(line)) {
      inImporters = true;
      continue;
    }
    if (!inImporters) continue;
    if (/^\S/.test(line)) {
      inImporters = false;
      continue;
    }
    if (/^ {2}\.:\s*$/.test(line)) {
      inRoot = true;
      section = null;
      continue;
    }
    if (!inRoot) continue;
    if (/^ {2}\S/.test(line)) {
      inRoot = false;
      continue;
    }
    const sec = /^ {4}(dependencies|devDependencies):\s*$/.exec(line);
    if (sec) {
      section = sec[1];
      continue;
    }
    if (section) {
      const name = /^ {6}(\S+):\s*$/.exec(line);
      if (name) (section === "devDependencies" ? dev : direct).add(name[1]);
      else if (/^ {4}\S/.test(line)) section = null;
    }
  }
  return { direct, dev };
}

/** One pnpm-lock.yaml: package keys of the "packages:" section, "name@version:" (scoped names kept whole). */
function fromPnpmLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const { direct, dev } = pnpmDirectNames(text);
  const out = [];
  const seen = new Set();
  const re = /^ {2,4}'?\/?(@[^/'"\s]+\/[^@'"\s]+|[^@'"\s]+)@([^:'"\s(]+)(?:\([^)]*\))?'?"?:\s*$/;
  /** @type {{ name: string, version: string, ecosystem: string, direct: boolean, dev: boolean, manifest: string,
   *   local?: boolean }|null} */
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
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

/** The package name of a yarn specifier: "@scope/name@range", "name@npm:range", "name@range". */
function yarnSpecifierName(spec) {
  const s = spec.trim().replace(/^"|"$/g, "");
  const i = s.startsWith("@") ? s.indexOf("@", 1) : s.indexOf("@");
  return i > 0 ? s.slice(0, i) : null;
}

/** One yarn.lock (classic v1 or berry): no self-contained direct/transitive signal, so every item is `direct: false`. */
function fromYarnLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  const seen = new Set();
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    // A yarn berry workspace entry ("pkg@workspace:.") describes the project itself, not a dependency.
    if (!lines.length || /^\s/.test(lines[0]) || lines[0].includes("@workspace:")) continue;
    const versionLine = lines.find((l) => /^\s+version:?\s/.test(l));
    if (!versionLine) continue;
    const version = versionLine
      .replace(/^\s+version:?\s+/, "")
      .replace(/^"|"$/g, "")
      .trim();
    // Taken from a private registry, git, a file or a URL (v1 `resolved`, berry `resolution` other than npm/patch):
    // its name is never sent (network.mjs).
    const resolved = lines.map((l) => NPM_PATTERNS.yarnResolved.exec(l)?.[1]).find(Boolean);
    const resolution = lines.map((l) => NPM_PATTERNS.yarnResolution.exec(l)?.[1]).find(Boolean);
    const local =
      (!!resolved && !NPM_PATTERNS.publicTarball.test(resolved)) ||
      (!!resolution && !NPM_PATTERNS.yarnRegistryProtocol.test(resolution.slice(1)));
    for (const spec of lines[0].replace(/:$/, "").split(",")) {
      const name = yarnSpecifierName(spec);
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push({ name, version, ecosystem: "npm", direct: false, dev: false, manifest, ...(local ? { local } : {}) });
      }
    }
  }
  return out;
}

/** The reader of each npm manifest or lock file, by file name (lower case). */
export const NPM_READERS = Object.freeze({
  "package.json": fromPackageJson,
  "package-lock.json": fromPackageLock,
  "pnpm-lock.yaml": fromPnpmLock,
  "yarn.lock": fromYarnLock,
});
