// `dependencies` source (ARCHITECTURE.md §6.9): every manifest and lock file found under the application, searched
// recursively (vibe-coded applications almost always split a front end and an API into their own folders, each
// with its own manifest): package.json, package-lock.json (v2/v3), pnpm-lock.yaml, yarn.lock (v1 and berry),
// requirements*.txt, poetry.lock, pyproject.toml. Each file is read ON ITS OWN, never merged with another: an
// item keeps the `manifest` it was read from, so the same package named by two manifests (a package.json and its
// own package-lock.json, for instance) gives two items. No YAML or TOML parser is used: pnpm-lock.yaml, yarn.lock
// and poetry.lock have a predictable enough shape for small, targeted regular expressions; a lock file that does
// not match them simply contributes nothing (never an error). A manifest that cannot be read, or a package.json /
// package-lock.json that is not valid JSON, is listed in `unreadable` ({ file, reason: "read"|"json" }): its
// dependencies are unknown, which is not the same as none (AUDIT.md M14).
//   item: { name, version, ecosystem, direct, dev, manifest, license?, local? } (local: not from a public registry)
// `direct` is read from the manifest itself when it says so (package.json; a lock file's own "root" entry, when
// the format carries one: package-lock.json v2/v3, pnpm-lock.yaml); formats with no such self-contained signal
// (yarn.lock, poetry.lock) report every item as `direct: false` rather than guessing from another file.
// requirements*.txt items also carry `extras` (array, e.g. `uvicorn[standard]` → `["standard"]`, omitted when
// there is none), `operator` (the first comparison found, e.g. "==", ">=", "~=", or null) and `spec` (the
// constraint as written, e.g. ">=2.0,<3.0", or null): `version` itself is the exact pinned version from an
// `==` constraint, else null — a range is never reported as if it were an installed version.
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";

/** Manifests and lock files searched for, by file name (case-insensitive). */
const MANIFEST_NAME =
  /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml)$/i;
/** How deep under the application a manifest may sit (ARCHITECTURE.md §6.9: a separate front end and API). */
const MAX_DEPTH = 4;

/** Text of a manifest, or null when it cannot be read (then listed in `unreadable`). */
const readText = (abs, manifest, unreadable) => {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    unreadable.push({ file: manifest, reason: "read" });
    return null;
  }
};

/** Parsed JSON manifest, or null when it cannot be read or is not valid JSON (then listed in `unreadable`). */
const readJson = (abs, manifest, unreadable) => {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    unreadable.push({ file: manifest, reason: "json" });
    return null;
  }
};

/**
 * What tells a package that is not from a public registry (`local: true`, never sent by network.mjs). The manifests
 * are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs).
 */
export const DEPENDENCY_PATTERNS = Object.freeze({
  /** A tarball of a public npm registry; any other `resolved` (a private registry, git, a file) is local. */
  publicTarball: /^https:\/\/registry\.(?:npmjs\.org|yarnpkg\.com)\//i,
  /** A requirements line that is a URL or a path: it names no PyPI package. */
  urlLine: /^(?:git\+|https?:|file:|\.{0,2}[\\/])/i,
  /** A requirements line holding a path before any "@" (a direct reference keeps its name: "name @ file:///x"). */
  pathLine: /^[^@]*[\\/]/,
  /** A requirements line that is a local archive (pip installs the file; its name would be read as a package). */
  archiveLine: /\.(?:whl|zip|tgz|tar(?:\.(?:gz|bz2|xz))?)$/i,
  /** yarn.lock: `resolved "<url>"` (v1) and `resolution: "<name>@<protocol>…"` (berry). */
  yarnResolved: /^\s+resolved:?\s+"?([^"\s]+)/,
  yarnResolution: /^\s+resolution:\s+"?([^"\s]+)/,
  /** A berry resolution through the configured registry ("name@npm:1.0.0", a patch of one). */
  yarnRegistryProtocol: /@(?:npm|patch):/,
  /** poetry.lock `[package.source]`: its `type` (legacy: an index; directory, file, git, url: not an index) and `url`. */
  poetrySource: /^(type|url)\s*=\s*"([^"]*)"/,
  /** PyPI itself. */
  publicIndex: /^https?:\/\/(?:pypi\.org|files\.pythonhosted\.org)(?:\/|$)/i,
  /** pnpm-lock.yaml: a resolution that is not a registry tarball (an archive URL, a git repository, a folder). */
  pnpmLocalResolution: /^\s+resolution:\s*\{[^}]*\b(?:tarball|repo|directory|commit):/,
  /** A Poetry inline table taking the package from a folder, git or a URL. */
  inlineLocal: /\b(?:path|git|url)\s*=/,
  inlineSource: /\bsource\s*=\s*"([^"]*)"/,
  inlineVersion: /\bversion\s*=\s*"([^"]*)"/,
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
        !!info.link || (typeof info.resolved === "string" && !DEPENDENCY_PATTERNS.publicTarball.test(info.resolved));
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
    } else if (current && DEPENDENCY_PATTERNS.pnpmLocalResolution.test(line)) current.local = true; // not the registry
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
    const resolved = lines.map((l) => DEPENDENCY_PATTERNS.yarnResolved.exec(l)?.[1]).find(Boolean);
    const resolution = lines.map((l) => DEPENDENCY_PATTERNS.yarnResolution.exec(l)?.[1]).find(Boolean);
    const local =
      (!!resolved && !DEPENDENCY_PATTERNS.publicTarball.test(resolved)) ||
      (!!resolution && !DEPENDENCY_PATTERNS.yarnRegistryProtocol.test(resolution.slice(1)));
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

/**
 * One requirements*.txt (requirements.txt, requirements-dev.txt…): "name[extra1,extra2]==version" (and the other
 * PEP 508 operators, possibly several comma-separated constraints, e.g. ">=2.0,<3.0"). `name` and `extras` are
 * read apart from the version specifier (`uvicorn[standard]` is the package `uvicorn`, extra `standard`, never
 * folded into the version); `operator` is the first comparison found; `version` is the exact pinned version
 * (`==` only) or `null` for a range or an unpinned entry; `spec` keeps the constraint as written, or `null` when
 * there is none.
 */
function fromRequirements(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const dev = /dev/i.test(manifest.split("/").pop());
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").split(";")[0].trim(); // env markers (; python_version>="3.8") dropped
    if (!line || line.startsWith("-")) continue;
    // A URL, a path or a local archive: pip installs it as it is, it names no PyPI package (and its file name must
    // never be sent as one).
    const pattern = DEPENDENCY_PATTERNS;
    if (pattern.urlLine.test(line) || pattern.pathLine.test(line) || pattern.archiveLine.test(line)) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[([^\]]*)\])?\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name, extrasRaw, specRaw] = m;
    const extras = extrasRaw
      ? extrasRaw
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];
    const spec = specRaw.trim();
    const opMatch = /^(==|>=|<=|~=|!=|>|<)/.exec(spec);
    const operator = opMatch ? opMatch[1] : null;
    const pinned = /==\s*([^,\s]+)/.exec(spec);
    // PEP 508 direct reference ("name @ file:///…", "name @ git+https://…"): not from PyPI, never sent.
    const local = spec.startsWith("@");
    out.push({
      name,
      ...(extras.length ? { extras } : {}),
      operator,
      version: pinned ? pinned[1] : null,
      spec: spec || null,
      ecosystem: "pip",
      direct: true,
      dev,
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/** One pyproject.toml: [tool.poetry.dependencies] and [tool.poetry.group.<name>.dependencies] (non-main groups are dev). */
function fromPyproject(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^\[([^\]]+)\]/.exec(line);
    if (h) {
      section = h[1];
      continue;
    }
    if (section !== "tool.poetry.dependencies" && !/^tool\.poetry\.group\.[\w-]+\.dependencies$/.test(section || ""))
      continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"?([^"#,{]*)/.exec(line);
    if (!m || m[1].toLowerCase() === "python") continue;
    // An inline table: { path = … }, { git = … }, { url = … } or { source = "<private index>" } is not from PyPI.
    // A list of constraints ([ { … }, { … } ]) is read the same way; one that goes on past this line cannot be read
    // here, so it counts as local (on a doubt, the name is never sent).
    const table = line.slice(line.indexOf("=") + 1).trim();
    const inline = table.startsWith("{") || table.startsWith("[");
    const unclosed = table.startsWith("[") && !table.includes("]");
    const source = inline ? DEPENDENCY_PATTERNS.inlineSource.exec(table)?.[1] : null;
    const local =
      inline &&
      (unclosed || DEPENDENCY_PATTERNS.inlineLocal.test(table) || (!!source && source.toLowerCase() !== "pypi"));
    const version = inline ? DEPENDENCY_PATTERNS.inlineVersion.exec(table)?.[1] : m[2];
    out.push({
      name: m[1],
      version: (version || "*").trim() || "*",
      ecosystem: "pip",
      direct: true,
      dev: section !== "tool.poetry.dependencies",
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/** One poetry.lock: `[[package]]` blocks, `name`, `version` and `groups`; no self-contained direct/transitive signal. */
function fromPoetryLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  /** @type {{ name?: string, version?: string, dev?: boolean, local?: boolean }|null} */
  let current = null;
  const flush = () => {
    if (current?.name)
      out.push({
        name: current.name,
        version: current.version,
        ecosystem: "pip",
        direct: false,
        dev: !!current.dev,
        manifest,
        ...(current.local ? { local: true } : {}),
      });
  };
  let inSource = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "[[package]]") {
      flush();
      current = {};
      inSource = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("[")) {
      inSource = line === "[package.source]";
      continue;
    }
    if (inSource) {
      // [package.source]: a folder, a file, git, a URL or an index other than PyPI — its name is never sent.
      const s = DEPENDENCY_PATTERNS.poetrySource.exec(line);
      if (s?.[1] === "type" && s[2] !== "legacy") current.local = true;
      if (s?.[1] === "url" && !DEPENDENCY_PATTERNS.publicIndex.test(s[2])) current.local = true;
      continue;
    }
    const m = /^(name|version)\s*=\s*"([^"]+)"/.exec(line);
    if (m) current[m[1]] = m[2];
    const g = /^groups\s*=\s*\[([^\]]*)\]/.exec(line);
    if (g) current.dev = !/(^|["'\s,])main(["'\s,]|$)/.test(g[1]);
  }
  flush();
  return out;
}

const READER_OF = {
  "package.json": fromPackageJson,
  "package-lock.json": fromPackageLock,
  "pnpm-lock.yaml": fromPnpmLock,
  "yarn.lock": fromYarnLock,
  "poetry.lock": fromPoetryLock,
  "pyproject.toml": fromPyproject,
};

/**
 * The `dependencies` source: every manifest and lock file found under `appDir` (recursively, at most
 * {@link MAX_DEPTH} folders deep), each read independently.
 * @param {string} appDir
 * @param {Array<{ file: string, reason: "read"|"json" }>} [unreadable]  receives the manifests that could not be read
 * @returns {Array<{name,version,ecosystem,direct,dev,manifest,license?}>} sorted by manifest, then ecosystem, then name
 */
export function collectDependencies(appDir, unreadable = []) {
  const items = [];
  for (const rel of listFiles(appDir, { maxDepth: MAX_DEPTH }).filter((f) => MANIFEST_NAME.test(f.split("/").pop()))) {
    const name = rel.split("/").pop().toLowerCase();
    const reader = READER_OF[name] || (/^requirements[^/]*\.txt$/i.test(name) ? fromRequirements : null);
    if (reader) items.push(...reader(path.join(appDir, rel), rel, unreadable));
  }
  return items.sort(
    (a, b) =>
      a.manifest.localeCompare(b.manifest) || a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name),
  );
}
