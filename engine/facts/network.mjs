// `--network` (ARCHITECTURE.md §6.9): checks that each DIRECT dependency exists in its public registry. Only the
// package name is sent (never the version, never any file content); 8 requests at a time, 5 s each. `fetchImpl`
// is the test seam of the CLI context (`ctx.fetch`, defaulting to the global `fetch`): the tests never reach the
// network.
// A name is sent ONLY when a lock file proves its public registry served the package: an item its lock reader marks
// `public: true` (a package-lock.json or yarn.lock v1 tarball of npm's registry, a poetry.lock entry with no other
// source, a uv.lock entry from PyPI's registry) — the package's `registries.proven`. Any other is `unproven`, never
// sent: a manifest, pnpm-lock.yaml and a yarn berry lock write no registry, a Pipfile.lock names PyPI even for what
// Pipenv's mirror served, and a private registry may be declared where the kit never looks (a CI file, a monorepo's root).
// On top of that proof, a PRIVATE package's name is never sent (AUDIT.md S13): it would tell the public registry what
// the company builds. Every network request of the facts goes through `isPrivatePackage` first. Private when:
//   - its version is not a registry release (a folder, an archive, a workspace, a link, a git repository or a URL),
//     it is an npm alias, or a lock file took it from a source that is not a public registry (`local: true`,
//     engine/facts/deps/npm.mjs and engine/facts/deps/python.mjs);
//   - its name is one of the application's own packages (every package.json and pyproject.toml under it: npm
//     workspaces point at their siblings with plain ranges), or one a `[tool.uv.sources]` names;
//   - its npm scope has its own registry, or a registry replaces the default one (then every npm package is
//     private), in an .npmrc, a .yarnrc, a .yarnrc.yml or a bunfig.toml;
//   - a package index other than PyPI is declared (pip.conf / pip.ini, --index-url / --extra-index-url /
//     --find-links in a requirements file, Poetry, PDM and Rye sources, uv indexes and find-links, Pipfile
//     sources): then every pip package is private;
//   - an ecosystem the kit does not know.
// Where these declarations are read, and how: engine/facts/declarations.mjs.
import path from "node:path";
import { listFiles } from "./common.mjs";
import { packageKey, packageId } from "../core/packages.mjs";
import { uvSourceNames } from "./deps/python.mjs";
import {
  readIf,
  emptyRegistries,
  tomlValues,
  tomlText,
  under,
  readFolder,
  readPythonIndexes,
  readUserDeclarations,
} from "./declarations.mjs";
// ─── The network gateway ────────────────────────────────────────────────────────────────────────────────────────
// The ONLY place of the kit that builds the URL of a public registry or sends a request to one (RULES.md S12,
// checked by test/unit/security.test.mjs; the dependency readers only RECOGNISE those hosts in lock files). Every
// request the kit itself sends goes through `createRegistryClient`, which refuses a private package whatever the
// caller did: a name the filter missed upstream is a defect, never a request. The one exception is an external tool:
// with --tools --network, osv-scanner downloads its own vulnerability database (public files, no name sent).

/** Where a package is looked up: existence, and its latest published version. */
const REGISTRY = {
  npm: {
    exists: (name) => `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    latest: (name) => `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
    version: (data) => data.version,
  },
  pip: {
    exists: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    latest: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    version: (data) => data.info?.version,
  },
};

/**
 * A GET whose answer is read by `read`, within one timeout that covers the body too (a registry that trickles its
 * answer cannot hold a worker): what `read` returns, or null (no answer, a timeout, a network or parsing error).
 */
async function get(url, fetchImpl, timeoutMs, read) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await read(await fetchImpl(url, { signal: controller.signal }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The client of the public registries, for one run. A private item (isPrivatePackage) throws: callers filter them
 * out first, so reaching the gateway with one is a defect of the kit, and nothing is sent.
 * @param {{ fetch: (url: string, options?: object) => Promise<any>, registries: ReturnType<typeof privateRegistries>,
 *   timeoutMs?: number }} p
 */
export function createRegistryClient({ fetch: fetchImpl, registries, timeoutMs = 5000 }) {
  const guard = (item) => {
    if (isPrivatePackage(item, registries)) throw new Error("defect: a private package reached the network gateway");
    return REGISTRY[item.ecosystem];
  };
  return {
    /** Does the package exist: true, false (404), or null (no usable answer). */
    async exists(item) {
      const registry = guard(item);
      if (!registry) return null;
      return get(registry.exists(item.name), fetchImpl, timeoutMs, (res) =>
        res.ok ? true : res.status === 404 ? false : null,
      );
    },
    /** Its latest published version, or null (404, timeout, malformed answer). */
    async latest(item) {
      const registry = guard(item);
      if (!registry) return null;
      return get(registry.latest(item.name), fetchImpl, timeoutMs, async (res) =>
        res.ok ? (registry.version(await res.json()) ?? null) : null,
      );
    },
  };
}

/** A version that is not a registry release: local folder, workspace, link, git repository or URL. */
// Any protocol but a registry's own (npm:, patch:): file:, link:, workspace:, portal:, exec:, git:, git+ssh:, github:,
// gitlab:, https:… and a drive (C:x); a folder (./x, ../x, . or .., ~/x, and any spec holding a slash: npm reads
// "@corp/lib" or "a/b" as a folder, "user/repo" as GitHub), a scp-like git address (git@host:…), an archive (x.tgz,
// x.tar.gz, x.tar); in any case (npm reads "LIB.TGZ" as an archive too; on a doubt, never sent).
export const LOCAL_SPEC =
  /^(?:(?!npm:|patch:)[a-z][\w+.-]*:|\.|[^\\/]*[\\/]|[\w.-]+@[\w.-]+:|\S*\.(?:tgz|tar\.gz|tar)$)/i;
/** The application's files are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs). */
export const NETWORK_PATTERNS = Object.freeze({
  // A registry range or version (npm, PEP 440, Poetry, Pipenv) holds these characters only: any other ("/", ":",
  // "@", "\", "#"…) names a place, not a release — an npm alias too: npm reads every "npm:" spec as one
  // ("npm:@corp/ui@^1", "npm:corp-ui", "npm:x"), and berry's explicit "npm:^1" cannot be told apart from it.
  registryRange: /^[\w.*<>=!~^|+, \t-]*$/,
  pipDirect: /^\s*@|\s@\s|^(?:git\+|https?:|file:)/,
  // A name the public registry can hold (npm: URL-safe, no "." or "_" first, its scope likewise; PEP 508 for pip): any
  // other (`café`, `_corp`, `corp-`) a lock cannot have from there — a forged proof, never sent.
  npmName: /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i,
  pipName: /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i,
});

/** The longest name npm's registry holds. */
const NPM_NAME_MAX = 214;
/** Whether a public registry can hold `item`'s name at all. */
const registryName = (item) =>
  item.ecosystem === "npm"
    ? item.name.length <= NPM_NAME_MAX && NETWORK_PATTERNS.npmName.test(item.name)
    : NETWORK_PATTERNS.pipName.test(item.name);
/**
 * A private name compared in any case (a name private in one case is private in all: fail closed); a pip name
 * normalised as PEP 503 says (engine/core/packages.mjs).
 */
const keyOf = (ecosystem, name) => packageKey(ecosystem, name).toLowerCase();

/** Every folder from the application root down to each manifest's folder (a workspace root's .npmrc counts). */
function foldersOf(root, items) {
  const folders = new Set([root]);
  for (const i of items) {
    if (!i.manifest) continue;
    let abs = path.resolve(root, path.dirname(String(i.manifest)));
    const rel = path.relative(root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue; // outside the application: never read
    while (abs !== root && !folders.has(abs)) {
      folders.add(abs);
      abs = path.dirname(abs);
    }
  }
  return folders;
}

/**
 * Names that are never public (lower case; pip names normalised): the application's own packages (the `name` of
 * every package.json and pyproject.toml under it), and every item a lock file took from somewhere else than a
 * public registry (`local: true`).
 */
function privateNames(appDir, items, out) {
  const names = new Set();
  for (const rel of listFiles(appDir, { maxDepth: 6 })) {
    const base = rel.split("/").pop();
    if (base === "package.json") {
      try {
        const name = JSON.parse(readIf(path.join(appDir, rel)))?.name;
        if (typeof name === "string" && name) names.add(keyOf("npm", name));
      } catch {
        // A package.json that is not valid JSON (a merge left unresolved): its own name, and the places its ranges name,
        // cannot be told — while a lock beside it may still prove them. Every npm package is private, as a pyproject.toml
        // the kit cannot read makes every pip one.
        out.npmAll = true;
      }
    } else if (base === "uv.toml") {
      // Read as the folders' declarations are (an index, a source, a requirement it does not read), wherever it is.
      readPythonIndexes(readIf(path.join(appDir, rel)), out, { uvToml: true });
    } else if (base === "pyproject.toml") {
      const text = readIf(path.join(appDir, rel));
      const leaves = tomlValues(text);
      if (leaves.doubt) out.pipAll = true; // its sources cannot be told: every pip package is private
      // Its indexes, sources and requirements, as the folders' declarations are read — in a folder no item names too.
      readPythonIndexes(text, out);
      // Every package `tool.uv.sources` names, whatever the TOML form and in whichever pyproject.toml (the root of a
      // uv workspace declares the sources of its members): it comes from git, a folder, a URL, the workspace or an
      // index of its own.
      for (const name of uvSourceNames(leaves)) names.add(keyOf("pip", name));
      for (const { path: keys, value } of leaves) {
        const own =
          (keys.length === 2 && under(keys, ["project", "name"])) ||
          (keys.length === 3 && under(keys, ["tool", "poetry", "name"]));
        if (!own) continue;
        // An own name the kit does not read (a multi-line string…): which name is the application's own cannot be told.
        const name = tomlText(value);
        if (name === null) out.pipAll = true;
        else if (name) names.add(keyOf("pip", name));
      }
    }
  }
  // An item whose own fields name a place (itemPlace): its name is private in every manifest too.
  for (const i of items) if (itemPlace(i) && i.name) names.add(keyOf(i.ecosystem, i.name));
  return names;
}

/**
 * What may and may not be sent (see the header): `{ proven, npmScopes, npmAll, pipAll, names }`. `proven`: the
 * packages (packageId) a lock file proves its public registry served — an item marked `public: true` by its reader
 * (deps/npm.mjs, deps/python.mjs, deps/python-locks.mjs) that names no place; only these are ever sent. The rest is the
 * second net: what is declared private. Conservative: one folder that replaces the npm registry makes every npm
 * package private (a name is never sent on a doubt).
 * @param {string} appDir
 * @param {{ items?: Array<{ name?: string, ecosystem?: string, manifest?: string, local?: boolean, public?: boolean }>,
 *   env?: Record<string, string|undefined> }} [options]
 *   items: the `dependencies` items — the folders of their manifests (and every folder above them, up to the root)
 *   are read, and a name a lock file took from a non-public source is private everywhere.
 *   env: the environment of the person running the kit (their npm, yarn, bun and pip variables, and HOME /
 *   USERPROFILE / APPDATA / XDG_CONFIG_HOME to find their own configuration). Without it, only the application is read.
 */
export function privateRegistries(appDir, { items = [], env } = {}) {
  const out = emptyRegistries();
  const root = path.resolve(appDir);
  for (const dir of foldersOf(root, items)) readFolder(dir, out, root);
  if (env) readUserDeclarations(env, out);
  out.names = privateNames(root, items, out);
  out.proven = new Set(items.filter((i) => i.public === true && !itemPlace(i)).map(proofId));
  return out;
}

/**
 * Does an item's own fields name a place rather than a registry's release — then it is never sent, and its name is
 * private in every manifest (privateNames)? Local (its reader said so), a version or a range LOCAL_SPEC reads as a
 * place, and behind the readers an allowlist: a range (npm, pip) or a pip version holding anything but a release's
 * characters (an npm alias, `npm:…`, among them).
 * @param {{ name?: string, version?: string|null, ecosystem?: string, spec?: string|null, local?: boolean }} item
 */
function itemPlace(item) {
  if (item.local) return true;
  if (item.version && LOCAL_SPEC.test(String(item.version))) return true;
  if (item.ecosystem === "npm" && item.spec && LOCAL_SPEC.test(String(item.spec))) return true;
  const ranges = item.ecosystem === "pip" ? [item.spec, item.version] : item.ecosystem === "npm" ? [item.spec] : [];
  return ranges.some((r) => r != null && !NETWORK_PATTERNS.registryRange.test(String(r)));
}

/**
 * The identity a proof is kept by: the package's own (packageId) — an npm name as written (npm's registry tells
 * `Corp-Utils` from `corp-utils`), a pip name as PEP 503 compares it.
 */
const proofId = packageId;

/**
 * Why a dependency item is never sent, or null when it may be: "private" — its own fields name a place, or it is
 * declared private —, "unproven" — no lock file proves its public registry served the package (`registries.proven`).
 * @param {{ name: string, version?: string|null, ecosystem?: string, spec?: string|null, local?: boolean }} item
 * @param {{ npmScopes: Set<string>, npmAll: boolean, pipAll: boolean, names?: Set<string>, proven?: Set<string> }} registries
 * @returns {"private"|"unproven"|null}
 */
function privacyOf(item, registries) {
  if (itemPlace(item)) return "private";
  if (registries.names?.has(keyOf(item.ecosystem, item.name))) return "private";
  if (item.ecosystem === "npm") {
    if (registries.npmAll) return "private";
    const scope = item.name.startsWith("@") ? item.name.split("/")[0].toLowerCase() : null;
    if (scope && registries.npmScopes.has(scope)) return "private";
  } else if (item.ecosystem === "pip") {
    if (registries.pipAll || NETWORK_PATTERNS.pipDirect.test(String(item.spec || ""))) return "private";
  } else return "private"; // an ecosystem the kit does not know
  if (!registryName(item)) return "private";
  return registries.proven?.has(proofId(item)) ? null : "unproven";
}

/**
 * Is a dependency item never to be sent to a public service — private, or not proven public by a lock file? Every
 * network request of the facts checks it first (AUDIT.md S13).
 * @param {{ name: string, version?: string|null, ecosystem?: string, spec?: string|null, local?: boolean }} item
 * @param {{ npmScopes: Set<string>, npmAll: boolean, pipAll: boolean, names?: Set<string>, proven?: Set<string> }} registries
 */
export function isPrivatePackage(item, registries) {
  return privacyOf(item, registries) !== null;
}

/**
 * Adds `exists` to every DIRECT dependency item (never to a transitive one): true, false, or null.
 * @param {Array<object>} items          dependencies items (engine/facts/dependencies.mjs)
 * @param {(url: string, options?: object) => Promise<Response>} fetchImpl
 * @param {{ concurrency?: number, timeoutMs?: number, registries?: ReturnType<typeof privateRegistries> }} [options]
 *   registries: what is declared private (privateRegistries); a private item is never sent
 * @returns {Promise<Array<object>>} new items; a non-direct item is returned unchanged
 */
export async function checkExistence(
  items,
  fetchImpl,
  { concurrency = 8, timeoutMs = 5000, registries = emptyRegistries() } = {},
) {
  const isPrivate = (i) => isPrivatePackage(i, registries);
  // One request a package, however many manifests name it (a package.json and its lock file, a pyproject.toml and
  // its poetry.lock): the answer is shared.
  const keyOfItem = packageId;
  const direct = [...new Map(items.filter((i) => i.direct && !isPrivate(i)).map((i) => [keyOfItem(i), i])).values()];
  const client = createRegistryClient({ fetch: fetchImpl, registries, timeoutMs });
  const results = new Map();
  const queue = [...direct];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) results.set(keyOfItem(item), await client.exists(item));
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, direct.length) }, worker));
  return items.map((i) => {
    if (!i.direct) return i;
    const why = privacyOf(i, registries);
    if (why === null) return { ...i, exists: results.get(keyOfItem(i)) };
    return why === "private" ? { ...i, private: true, exists: null } : { ...i, unproven: true, exists: null };
  });
}
