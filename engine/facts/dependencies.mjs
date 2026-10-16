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
import path from "node:path";
import { listFiles } from "./common.mjs";
import { NPM_PATTERNS, NPM_READERS } from "./deps/npm.mjs";
import { PYTHON_PATTERNS, pythonReader } from "./deps/python.mjs";

/** Manifests and lock files searched for, by file name (case-insensitive). */
const MANIFEST_NAME =
  /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|poetry\.lock|pyproject\.toml)$/i;
/** How deep under the application a manifest may sit (ARCHITECTURE.md §6.9: a separate front end and API). */
const MAX_DEPTH = 4;

/** Every expression the readers run on manifests (registered in test/tools/redos-worker.mjs, RULES.md S5). */
export const DEPENDENCY_PATTERNS = Object.freeze({ ...NPM_PATTERNS, ...PYTHON_PATTERNS });

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
    const reader = NPM_READERS[name] || pythonReader(name);
    if (reader) items.push(...reader(path.join(appDir, rel), rel, unreadable));
  }
  return items.sort(
    (a, b) =>
      a.manifest.localeCompare(b.manifest) || a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name),
  );
}
