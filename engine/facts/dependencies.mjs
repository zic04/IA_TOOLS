// `dependencies` source (ARCHITECTURE.md §6.9): every manifest and lock file found under the application, searched
// recursively (vibe-coded applications almost always split a front end and an API into their own folders, each
// with its own manifest), by ecosystem:
//   npm       package.json, package-lock.json (v1 to v3), pnpm-lock.yaml (deps/npm.mjs), yarn.lock (deps/yarn.mjs)
//   pip       requirements*.txt, pyproject.toml (PEP 621, PEP 735, Poetry), poetry.lock             (deps/python.mjs)
//             uv.lock, Pipfile, Pipfile.lock                                                         (deps/python-locks.mjs)
//   maven     pom.xml, build.gradle, build.gradle.kts, libs.versions.toml, gradle.lockfile          (deps/jvm.mjs)
//   nuget     *.csproj, *.fsproj, *.vbproj, Directory.Packages.props, packages.config,
//             packages.lock.json                                                                    (deps/dotnet.mjs)
//   composer  composer.json, composer.lock                                                          (deps/php.mjs)
//   go        go.mod                                                                                (deps/golang.mjs)
//   rubygems  Gemfile, Gemfile.lock                                                                 (deps/ruby.mjs)
//   cargo     Cargo.toml, Cargo.lock                                                                (deps/rust.mjs)
// Each file gives its OWN items, never merged with another's: an item keeps the `manifest` it was read from, so the
// same package named by two manifests (a package.json and its own package-lock.json, for instance) gives two items;
// a version another file holds (a Maven parent, a Gradle catalog alias, a Cargo workspace, a central .NET version)
// stays null. No YAML, TOML or XML library is used: pnpm-lock.yaml, yarn.lock, the TOML files, go.mod and the
// Gemfiles have a predictable enough shape for small, targeted readers (a form they do not match contributes
// nothing, never an error), and the XML files go through the bounded, DTD-free reader of the sources
// (engine/core/xml.mjs). A manifest that cannot be read, a JSON one that is not valid JSON or an XML one that is
// not well-formed is listed in `unreadable` ({ file, reason: "read"|"json"|"xml" }): its dependencies are unknown,
// which is not the same as none (AUDIT.md M14). Nothing is executed, and these readers never touch the network.
//   item: { name, version, ecosystem, direct, dev, manifest, spec?, via?, license?, licenseFrom?, local? } (local: not
//   from a public registry, or not identifiable: a folder, git, a workspace member, a private registry — its name is
//   never sent)
// `license` is a licence's name or SPDX expression, never its text (deps/licences.mjs), and `licenseFrom` says where
// it was read: "lock" — the item's own entry in package-lock.json or composer.lock —, else "installed" — the item's
// installed copy, read offline once every manifest is read (deps/installed.mjs): an npm item's
// `node_modules/<name>/package.json`, from its manifest's folder up to the application's, a pip item's
// `*.dist-info/METADATA` in a `.venv/` or `venv/` of the same folders; only a copy inside the application, of the
// item's name and, when the item has an exact one, of its version. An item no source names a licence for has neither.
// `direct` is read from the manifest itself when it says so (a manifest's own declarations; a lock file's own
// "root" entries or marks: package-lock.json v2/v3 (its root and its workspace members), pnpm-lock.yaml (every
// importer), uv.lock (the project's own packages), packages.lock.json, Gemfile.lock, go.mod's `// indirect`); a lock
// file that has none takes it from the manifest beside it, in the same folder — yarn.lock and package-lock.json v1
// from package.json (and the package.json of its workspaces, inside that folder), poetry.lock from pyproject.toml,
// Pipfile.lock from Pipfile. The others (gradle.lockfile, packages.config, composer.lock, Cargo.lock) report every
// item as `direct: false`. `dev` is a dev only dependency (a devDependency nowhere declared as a dependency).
// `via` (a transitive item of a lock file that gives each package its own dependencies: package-lock.json, yarn.lock,
// poetry.lock, uv.lock) is the shortest chain of names from a direct dependency down to its parent (deps/graph.mjs).
// `version` is the exact version the file states, else null — a range is never reported as if it were an installed
// version; `spec` keeps the constraint as written when it is not that exact version (package.json, pyproject.toml,
// Pipfile, requirements*.txt, Maven and Gradle, NuGet, Composer, Gemfile, Cargo.toml). requirements*.txt and
// PEP 621 items also carry `extras` (array, e.g. `uvicorn[standard]` → `["standard"]`, omitted when there is none),
// `operator` (the first comparison found, e.g. "==", ">=", "~=", or null) and `spec` (the constraint as written,
// e.g. ">=2.0,<3.0", or null).
import path from "node:path";
import { GENERIC } from "../check/secrets.mjs";
import { listFiles, SKIP_DIRS } from "./common.mjs";
import { NPM_PATTERNS, NPM_READERS } from "./deps/npm.mjs";
import { YARN_READERS } from "./deps/yarn.mjs";
import { PYTHON_PATTERNS, pythonReader } from "./deps/python.mjs";
import { PYTHON_LOCK_READERS } from "./deps/python-locks.mjs";
import { JVM_PATTERNS, JVM_READERS } from "./deps/jvm.mjs";
import { DOTNET_PATTERNS, dotnetReader } from "./deps/dotnet.mjs";
import { PHP_PATTERNS, PHP_READERS } from "./deps/php.mjs";
import { GO_PATTERNS, GO_READERS } from "./deps/golang.mjs";
import { RUBY_PATTERNS, RUBY_READERS } from "./deps/ruby.mjs";
import { RUST_PATTERNS, RUST_READERS } from "./deps/rust.mjs";
import { LICENCE_PATTERNS, safeLicence } from "./deps/licences.mjs";
import { withInstalledLicences } from "./deps/installed.mjs";

/** Manifests and lock files searched for, by file name (case-insensitive). */
const MANIFEST_NAME =
  /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml|uv\.lock|pipfile(?:\.lock)?|pom\.xml|build\.gradle(?:\.kts)?|libs\.versions\.toml|gradle\.lockfile|[^/]*\.(?:cs|fs|vb)proj|directory\.packages\.props|packages\.config|packages\.lock\.json|composer\.(?:json|lock)|go\.mod|gemfile(?:\.lock)?|cargo\.(?:toml|lock))$/i;
/** How deep under the application a manifest may sit (ARCHITECTURE.md §6.9: a separate front end and API). */
const MAX_DEPTH = 4;
/**
 * Folders never searched: those no facts source walks (SKIP_DIRS), the installed dependencies of PHP and Go (vendor/
 * holds the composer.json of every installed package) and the build output of Maven and Cargo (target/).
 */
const SKIP = [...SKIP_DIRS, "vendor", "target"];

/**
 * The user and password of a URL ("https://user:token@host/…"), as a manifest may name a private source or a git
 * dependency with them (bounded: linear).
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@]{1,256}@/gi;

/** A text a manifest gives an item (a version, a constraint) without a credential: a URL's user and password removed;
 * null when what is left still looks like a secret to a detector of the kit, or is over 500 characters. */
export function withoutCredentials(text) {
  if (typeof text !== "string") return text;
  if (text.length > 500) return null;
  const bare = text.replace(URL_CREDENTIALS, "$1");
  return GENERIC.some((d) => {
    d.re.lastIndex = 0;
    for (const m of bare.matchAll(d.re)) if (!d.accept || d.accept(m)) return true;
    return false;
  })
    ? null
    : bare;
}

/** Whether a version or a constraint is an address, or is not kept as written (a credential, a secret). */
const unusual = (raw, kept) => typeof raw === "string" && (raw.includes("://") || raw !== kept);

/**
 * An item as it is kept (AUDIT.md S8: a secret is never stored): its version and constraint without a credential;
 * none when its name is not a package's name (a URL, a secret). One whose version or constraint is an address, or
 * held what was removed, is `local`: not from a public registry, so its name is never sent (engine/facts/network.mjs).
 */
function kept(item) {
  if (typeof item.name !== "string" || item.name.includes("://") || withoutCredentials(item.name) !== item.name)
    return null;
  const version = withoutCredentials(item.version) ?? null;
  const out = { ...item, version };
  if ("spec" in item) out.spec = withoutCredentials(item.spec) ?? null;
  // The names an item carries besides its own (the chain that brings it in, its extras) are kept on the same terms:
  // a chain through a name that is a URL or looks like a secret is left out whole.
  const plain = (n) => typeof n === "string" && !n.includes("://") && withoutCredentials(n) === n;
  if ("via" in item && !(Array.isArray(item.via) && item.via.every(plain))) delete out.via;
  if ("extras" in item) {
    out.extras = Array.isArray(item.extras) ? item.extras.filter(plain) : [];
    if (!out.extras.length) delete out.extras;
  }
  // A licence only as a licence's name, whatever reader gave it (deps/licences.mjs): the readers' own allowlist, again.
  if ("license" in item) {
    const license = safeLicence(item.license);
    if (license) out.license = license;
    else {
      delete out.license;
      delete out.licenseFrom;
    }
  }
  if (unusual(item.version, version) || ("spec" in item && unusual(item.spec, out.spec))) out.local = true;
  if (out.local) delete out.public; // a place is never a proof
  return out;
}

/** Every expression the readers run on manifests (registered in test/tools/redos-worker.mjs, RULES.md S5). */
export const DEPENDENCY_PATTERNS = Object.freeze({
  URL_CREDENTIALS,
  ...NPM_PATTERNS,
  ...PYTHON_PATTERNS,
  ...JVM_PATTERNS,
  ...DOTNET_PATTERNS,
  ...PHP_PATTERNS,
  ...GO_PATTERNS,
  ...RUBY_PATTERNS,
  ...RUST_PATTERNS,
  ...LICENCE_PATTERNS,
});

/** The readers known by their whole file name (lower case). */
const READERS = Object.freeze({
  ...NPM_READERS,
  ...YARN_READERS,
  ...PYTHON_LOCK_READERS,
  ...JVM_READERS,
  ...PHP_READERS,
  ...GO_READERS,
  ...RUBY_READERS,
  ...RUST_READERS,
});

/**
 * The reader of a manifest or lock file, by its file name (lower case): by its whole name, or by its form
 * (requirements*.txt, a .NET project file), or null.
 * @param {string} name
 * @returns {((abs: string, manifest: string, unreadable: Array<{ file: string, reason: string }>) => Array<object>)|null}
 */
export const dependencyReader = (name) =>
  Object.hasOwn(READERS, name) ? READERS[name] : pythonReader(name) || dotnetReader(name);

/**
 * The `dependencies` source: every manifest and lock file found under `appDir` (recursively, at most
 * {@link MAX_DEPTH} folders deep), each read independently; then, for an npm or pip item its lock gives no licence,
 * the licence of its installed copy (deps/installed.mjs).
 * @param {string} appDir
 * @param {Array<{ file: string, reason: "read"|"json"|"xml" }>} [unreadable]  receives the manifests that could not
 *   be read
 * @returns {Array<{name,version,ecosystem,direct,dev,manifest,license?,licenseFrom?}>} sorted by manifest, then
 *   ecosystem, then name
 */
export function collectDependencies(appDir, unreadable = []) {
  const items = [];
  const push = (item) => {
    const k = kept(item);
    if (k) items.push(k);
  };
  for (const rel of listFiles(appDir, { maxDepth: MAX_DEPTH, skip: SKIP }).filter((f) =>
    MANIFEST_NAME.test(f.split("/").pop()),
  )) {
    const reader = dependencyReader(rel.split("/").pop().toLowerCase());
    if (reader) for (const item of reader(path.join(appDir, rel), rel, unreadable)) push(item);
  }
  items.sort(
    (a, b) =>
      a.manifest.localeCompare(b.manifest) || a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name),
  );
  return withInstalledLicences(appDir, items);
}
