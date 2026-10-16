// `--network` (ARCHITECTURE.md §6.9): checks that each DIRECT dependency exists in its public registry. Only the
// package name is sent (never the version, never any file content); 8 requests at a time, 5 s each. `fetchImpl`
// is the test seam of the CLI context (`ctx.fetch`, defaulting to the global `fetch`): the tests never reach the
// network.
// A PRIVATE package's name is never sent (AUDIT.md S13): it would tell the public registry what the company
// builds. Every network request of the facts goes through `isPrivatePackage` first. A package is private when:
//   - its version is not a registry release (a folder, a workspace, a link, a git repository or a URL), or a lock
//     file took it from a source that is not a public registry (`local: true`, engine/facts/deps/npm.mjs and
//     engine/facts/deps/python.mjs);
//   - its name is one of the application's own packages (every package.json and pyproject.toml under it: npm
//     workspaces point at their siblings with plain ranges);
//   - its npm scope has its own registry, or a registry replaces the default one (then every npm package is
//     private), in an .npmrc, a .yarnrc, a .yarnrc.yml or a bunfig.toml;
//   - a package index other than PyPI is declared (pip.conf / pip.ini, --index-url / --extra-index-url in a
//     requirements file, Poetry sources, uv indexes, Pipfile sources): then every pip package is private;
//   - an ecosystem the kit does not know.
// These declarations are read in the application root and in every folder down to each manifest (a separate front
// end keeps its own .npmrc), in the person's own configuration (~/.npmrc, ~/.yarnrc(.yml), ~/.bunfig.toml, pip.conf
// / pip.ini, every home given) and in the npm_config_* / YARN_NPM_REGISTRY_SERVER / BUN_CONFIG_REGISTRY / PIP_*
// variables — where a company usually declares its private registries. Such an item gets `private: true` and
// `exists: null`. A private package declared nowhere cannot be told apart (SECURITY.md).
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";
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
export const LOCAL_SPEC = /^(?:file:|link:|workspace:|portal:|git(?:\+|:|hub:)|https?:|[\w.-]+\/[\w.-]+(?:#|$))/;
/** The application's files are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs). */
export const NETWORK_PATTERNS = Object.freeze({
  npmScope: /^[ \t]*(@[\w.-]+):registry[ \t]*=/gm,
  npmRegistry: /^[ \t]*registry[ \t]*=[ \t]*(\S+)/m,
  yarnScope: /^[ \t]*"?(@[\w.-]+):registry"?[ \t]/gm,
  yarnRegistry: /^[ \t]*"?registry"?[ \t]+"?([^"\s]+)/m,
  yarnServer: /^npmRegistryServer:[ \t]*["']?([^"'\s]+)/m,
  yamlKey: /^([ \t]*)["']?@?([\w.-]+)["']?:[ \t]*$/,
  tomlSection: /^[ \t]*\[{1,2}([^\]]+)\]{1,2}[ \t]*$/,
  tomlKey: /^[ \t]*["']?@?([\w.-]+)["']?[ \t]*=[ \t]*["']?([^"'\s]*)/,
  pipIndex: /^[ \t]*(?:--index-url|--extra-index-url|-i)\b/m,
  pipConfIndex: /^[ \t]*(?:index-url|extra-index-url|index)[ \t]*=/m,
  pipDirect: /^\s*@|\s@\s|^(?:git\+|https?:|file:)/,
  envScope: /^npm_config_(@[\w.-]+):registry$/i,
  publicNpm: /^https?:\/\/registry\.(?:npmjs\.(?:org|com)|yarnpkg\.com)\/?$/i,
  publicPip: /^https?:\/\/(?:pypi\.org|files\.pythonhosted\.org)(?:\/|$)/i,
  yarnScopesBlock: /^npmScopes:[ \t]*$/,
  yarnScopesMention: /\bnpmScopes\b/,
  bunScopesMention: /\binstall\.scopes\b/,
});
const readIf = (file) => {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
};
const isPublicNpm = (url) => NETWORK_PATTERNS.publicNpm.test(String(url));
const isPublicPip = (url) => NETWORK_PATTERNS.publicPip.test(String(url));
/** A package name compared case-insensitively; a pip name normalised as PEP 503 says (runs of -_. are one "-"). */
const keyOf = (ecosystem, name) =>
  ecosystem === "pip"
    ? String(name)
        .toLowerCase()
        .replace(/[-_.]+/g, "-")
    : String(name).toLowerCase();
const emptyRegistries = () => ({ npmScopes: new Set(), npmAll: false, pipAll: false, names: new Set() });

/** One .npmrc (`@scope:registry=…`, `registry=…`), added to `out`. */
function readNpmrc(text, out) {
  for (const m of text.matchAll(NETWORK_PATTERNS.npmScope)) out.npmScopes.add(m[1].toLowerCase());
  const registry = NETWORK_PATTERNS.npmRegistry.exec(text)?.[1];
  if (registry && !isPublicNpm(registry)) out.npmAll = true;
}

/** One .yarnrc of Yarn 1 (`registry "…"`, `"@scope:registry" "…"`), added to `out`. */
function readYarnrc(text, out) {
  for (const m of text.matchAll(NETWORK_PATTERNS.yarnScope)) out.npmScopes.add(m[1].toLowerCase());
  const registry = NETWORK_PATTERNS.yarnRegistry.exec(text)?.[1];
  if (registry && !isPublicNpm(registry)) out.npmAll = true;
}

/**
 * One .yarnrc.yml of Yarn 2+: `npmRegistryServer` at the top, and the keys of the `npmScopes` map (no "@"). A file
 * that mentions `npmScopes` in a form this reader does not follow (flow style, a comment after the key) makes every
 * npm package private: on a doubt, no name is sent.
 */
function readYarnrcYml(text, out) {
  const server = NETWORK_PATTERNS.yarnServer.exec(text)?.[1];
  if (server && !isPublicNpm(server)) out.npmAll = true;
  let inScopes = false;
  let indent = null;
  let found = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (NETWORK_PATTERNS.yarnScopesBlock.test(line)) {
      inScopes = true;
      indent = null;
      continue;
    }
    if (!inScopes) continue;
    if (!/^[ \t]/.test(line)) {
      inScopes = false;
      continue;
    }
    const key = NETWORK_PATTERNS.yamlKey.exec(line);
    if (!key) continue;
    if (indent === null) indent = key[1].length;
    if (key[1].length === indent) (out.npmScopes.add("@" + key[2].toLowerCase()), found++);
  }
  if (!found && NETWORK_PATTERNS.yarnScopesMention.test(text)) out.npmAll = true;
}

/**
 * A TOML text read line by line: `visit(section)` when a section opens, `visit(section, key, value)` for every
 * `key = value` line. Enough for bunfig.toml, pyproject.toml and Pipfile (never a full TOML parser).
 */
function eachToml(text, visit) {
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const s = NETWORK_PATTERNS.tomlSection.exec(line);
    if (s) {
      section = s[1].trim();
      visit(section);
      continue;
    }
    const k = NETWORK_PATTERNS.tomlKey.exec(line);
    if (k) visit(section, k[1], k[2]);
  }
}

/**
 * One bunfig.toml: `[install] registry`, the keys of `[install.scopes]` and the `[install.scopes.<name>]` sections,
 * added to `out`. A file that mentions `install.scopes` in a form this reader does not follow makes every npm package
 * private: on a doubt, no name is sent.
 */
function readBunfig(text, out) {
  let found = 0;
  eachToml(text, (section, key, value) => {
    if (section === "install" && key === "registry" && value && !isPublicNpm(value)) out.npmAll = true;
    if (section === "install.scopes" && key) (out.npmScopes.add("@" + key.toLowerCase()), found++);
    const own = key === undefined && section.startsWith("install.scopes.") ? section.slice(15).replace(/^@/, "") : "";
    if (own) (out.npmScopes.add("@" + own.replace(/^["']|["']$/g, "").toLowerCase()), found++);
  });
  if (!found && NETWORK_PATTERNS.bunScopesMention.test(text)) out.npmAll = true;
}

/**
 * One pyproject.toml, Pipfile or uv.toml: a package index other than PyPI (Poetry `[[tool.poetry.source]]`, uv
 * `[[tool.uv.index]]`, `[tool.uv] index-url`, uv.toml `index-url` / `[[index]]`, Pipfile `[[source]]`) makes every
 * pip package private.
 */
function readPythonIndexes(text, out, { uvToml = false } = {}) {
  eachToml(text, (section, key, value) => {
    if (key === undefined) {
      if (section === "tool.uv.index" || (uvToml && section === "index")) out.pipAll = true;
      return;
    }
    const sourceUrl = (section === "tool.poetry.source" || section === "source") && key === "url";
    const uvSection = section === "tool.uv" || (uvToml && section === "");
    const uvIndex = uvSection && /^(?:index-url|extra-index-url)$/.test(key);
    if ((sourceUrl || uvIndex) && !isPublicPip(value)) out.pipAll = true;
  });
}

/** The private declarations of one folder of the application, added to `out`. */
function readFolder(dir, out) {
  readNpmrc(readIf(path.join(dir, ".npmrc")), out);
  readYarnrc(readIf(path.join(dir, ".yarnrc")), out);
  readYarnrcYml(readIf(path.join(dir, ".yarnrc.yml")), out);
  readBunfig(readIf(path.join(dir, "bunfig.toml")), out);
  readPythonIndexes(readIf(path.join(dir, "pyproject.toml")), out);
  readPythonIndexes(readIf(path.join(dir, "Pipfile")), out);
  readPythonIndexes(readIf(path.join(dir, "uv.toml")), out, { uvToml: true });
  if (["pip.conf", "pip.ini"].some((f) => fs.existsSync(path.join(dir, f)))) out.pipAll = true;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of names)
    if (/^requirements.*\.(?:txt|in)$/i.test(f) && NETWORK_PATTERNS.pipIndex.test(readIf(path.join(dir, f))))
      out.pipAll = true;
}

/**
 * The person's own configuration files that can declare private registries (never the application's): those of
 * every home given (HOME and USERPROFILE can differ on Windows), of APPDATA and XDG_CONFIG_HOME, and the files named
 * by NPM_CONFIG_USERCONFIG and PIP_CONFIG_FILE.
 */
function userConfigFiles(env) {
  const get = (name) => Object.entries(env).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] || null;
  const files = [];
  for (const home of new Set([env.HOME, env.USERPROFILE].filter(Boolean))) {
    files.push({ kind: "npmrc", file: path.join(home, ".npmrc") });
    files.push({ kind: "yarnrc", file: path.join(home, ".yarnrc") });
    files.push({ kind: "yarnrcYml", file: path.join(home, ".yarnrc.yml") });
    files.push({ kind: "bunfig", file: path.join(home, ".bunfig.toml") });
    for (const f of [
      ".config/pip/pip.conf",
      ".pip/pip.conf",
      "pip/pip.ini",
      "Library/Application Support/pip/pip.conf",
    ])
      files.push({ kind: "pip", file: path.join(home, f) });
    files.push({ kind: "uv", file: path.join(home, ".config", "uv", "uv.toml") });
  }
  if (env.APPDATA) {
    files.push({ kind: "pip", file: path.join(env.APPDATA, "pip", "pip.ini") });
    files.push({ kind: "uv", file: path.join(env.APPDATA, "uv", "uv.toml") });
  }
  if (env.XDG_CONFIG_HOME) {
    files.push({ kind: "pip", file: path.join(env.XDG_CONFIG_HOME, "pip", "pip.conf") });
    files.push({ kind: "uv", file: path.join(env.XDG_CONFIG_HOME, "uv", "uv.toml") });
  }
  const npmUser = get("NPM_CONFIG_USERCONFIG");
  if (npmUser) files.push({ kind: "npmrc", file: npmUser });
  const pipFile = get("PIP_CONFIG_FILE");
  if (pipFile) files.push({ kind: "pip", file: pipFile });
  const uvFile = get("UV_CONFIG_FILE");
  if (uvFile) files.push({ kind: "uv", file: uvFile });
  // Poetry's own configuration (`poetry config repositories.<name> <url>`).
  const poetryDirs = [get("POETRY_CONFIG_DIR"), env.APPDATA && path.join(env.APPDATA, "pypoetry")];
  if (env.XDG_CONFIG_HOME) poetryDirs.push(path.join(env.XDG_CONFIG_HOME, "pypoetry"));
  for (const home of new Set([env.HOME, env.USERPROFILE].filter(Boolean)))
    poetryDirs.push(
      path.join(home, ".config", "pypoetry"),
      path.join(home, "Library", "Application Support", "pypoetry"),
    );
  for (const dir of poetryDirs.filter(Boolean)) files.push({ kind: "poetry", file: path.join(dir, "config.toml") });
  return files;
}

const READ_USER_FILE = {
  npmrc: readNpmrc,
  yarnrc: readYarnrc,
  yarnrcYml: readYarnrcYml,
  bunfig: readBunfig,
  pip: (text, out) => {
    if (NETWORK_PATTERNS.pipConfIndex.test(text)) out.pipAll = true;
  },
  uv: (text, out) => readPythonIndexes(text, out, { uvToml: true }),
  // A repository declared in Poetry's configuration: every pip package may come from it.
  poetry: (text, out) =>
    eachToml(text, (section, key, value) => {
      if (section.startsWith("repositories.") && key === "url" && !isPublicPip(value)) out.pipAll = true;
    }),
};

/** The environment variables of npm, yarn, bun, pip and uv that name a registry or an index, added to `out`. */
function readEnv(env, out) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    const scope = NETWORK_PATTERNS.envScope.exec(key);
    if (scope) out.npmScopes.add(scope[1].toLowerCase());
    else if (/^(?:npm_config_registry|YARN_NPM_REGISTRY_SERVER|BUN_CONFIG_REGISTRY)$/i.test(key)) {
      if (!isPublicNpm(value)) out.npmAll = true;
    } else if (/^(?:PIP_(?:EXTRA_)?INDEX_URL|UV_(?:EXTRA_)?INDEX_URL|UV_DEFAULT_INDEX|UV_INDEX)$/i.test(key)) {
      if (!isPublicPip(value)) out.pipAll = true;
    } else if (/^POETRY_REPOSITORIES_\w+_URL$/i.test(key) && !isPublicPip(value)) out.pipAll = true;
  }
}

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
function privateNames(appDir, items) {
  const names = new Set();
  for (const rel of listFiles(appDir, { maxDepth: 6 })) {
    const base = rel.split("/").pop();
    if (base === "package.json") {
      try {
        const name = JSON.parse(readIf(path.join(appDir, rel)))?.name;
        if (typeof name === "string" && name) names.add(keyOf("npm", name));
      } catch {
        // a package.json that is not valid JSON names nothing
      }
    } else if (base === "pyproject.toml")
      eachToml(readIf(path.join(appDir, rel)), (section, key, value) => {
        if ((section === "project" || section === "tool.poetry") && key === "name" && value)
          names.add(keyOf("pip", value));
      });
  }
  for (const i of items) if (i.local && i.name) names.add(keyOf(i.ecosystem, i.name));
  return names;
}

/**
 * What is declared private (see the header): `{ npmScopes, npmAll, pipAll, names }`. Conservative: one folder that
 * replaces the npm registry makes every npm package private (a name is never sent on a doubt).
 * @param {string} appDir
 * @param {{ items?: Array<{ name?: string, ecosystem?: string, manifest?: string, local?: boolean }>,
 *   env?: Record<string, string|undefined> }} [options]
 *   items: the `dependencies` items — the folders of their manifests (and every folder above them, up to the root)
 *   are read, and a name a lock file took from a non-public source is private everywhere.
 *   env: the environment of the person running the kit (their npm, yarn, bun and pip variables, and HOME /
 *   USERPROFILE / APPDATA / XDG_CONFIG_HOME to find their own configuration). Without it, only the application is read.
 */
export function privateRegistries(appDir, { items = [], env } = {}) {
  const out = emptyRegistries();
  const root = path.resolve(appDir);
  for (const dir of foldersOf(root, items)) readFolder(dir, out);
  if (env) {
    for (const { kind, file } of userConfigFiles(env)) READ_USER_FILE[kind](readIf(file), out);
    readEnv(env, out);
  }
  out.names = privateNames(root, items);
  return out;
}

/**
 * Is a dependency item private (its name must never be sent to a public service)? Every network request of the facts
 * checks it first (AUDIT.md S13).
 * @param {{ name: string, version?: string|null, ecosystem?: string, spec?: string|null, local?: boolean }} item
 * @param {{ npmScopes: Set<string>, npmAll: boolean, pipAll: boolean, names?: Set<string> }} registries
 */
export function isPrivatePackage(item, registries) {
  if (item.local) return true;
  if (item.version && LOCAL_SPEC.test(String(item.version))) return true;
  if (registries.names?.has(keyOf(item.ecosystem, item.name))) return true;
  if (item.ecosystem === "npm") {
    if (registries.npmAll) return true;
    const scope = item.name.startsWith("@") ? item.name.split("/")[0].toLowerCase() : null;
    return !!scope && registries.npmScopes.has(scope);
  }
  if (item.ecosystem === "pip") return registries.pipAll || NETWORK_PATTERNS.pipDirect.test(String(item.spec || ""));
  return true; // an ecosystem the kit does not know: never sent
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
  const direct = items.filter((i) => i.direct && !isPrivate(i));
  const client = createRegistryClient({ fetch: fetchImpl, registries, timeoutMs });
  const results = new Map();
  const queue = [...direct];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) results.set(item, await client.exists(item));
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, direct.length) }, worker));
  return items.map((i) =>
    !i.direct ? i : isPrivate(i) ? { ...i, private: true, exists: null } : { ...i, exists: results.get(i) },
  );
}
