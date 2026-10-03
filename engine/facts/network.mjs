// `--network` (ARCHITECTURE.md §6.9): checks that each DIRECT dependency exists in its public registry. Only the
// package name is sent (never the version, never any file content); 8 requests at a time, 5 s each. `fetchImpl`
// is the test seam of the CLI context (`ctx.fetch`, defaulting to the global `fetch`): the tests never reach the
// network.
// A PRIVATE package's name is never sent (AUDIT.md S13): it would tell the public registry what the company
// builds. A package is private when the application says so (privateRegistries): an npm scope with its own registry
// in .npmrc, every npm package when .npmrc replaces the default registry, every pip package when a private index is
// declared (pip.conf / pip.ini, or --index-url / --extra-index-url in a requirements file), and any package taken
// from a local folder, a workspace, a git repository or a URL. Such an item gets `private: true` and `exists: null`.
import fs from "node:fs";
import path from "node:path";
const REGISTRY = {
  npm: (name) => `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  pip: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
};

/** Does `name` exist in its registry: true, false (404), or null (no usable answer, e.g. a timeout). */
async function existsInRegistry(item, fetchImpl, timeoutMs) {
  const url = REGISTRY[item.ecosystem]?.(item.name);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (res.ok) return true;
    return res.status === 404 ? false : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A version that is not a registry release: local folder, workspace, link, git repository or URL. */
export const LOCAL_SPEC = /^(?:file:|link:|workspace:|portal:|git(?:\+|:|hub:)|https?:|[\w.-]+\/[\w.-]+(?:#|$))/;
/** The application's files are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs). */
export const NETWORK_PATTERNS = Object.freeze({
  npmScope: /^[ \t]*(@[\w.-]+):registry[ \t]*=/gm,
  npmRegistry: /^[ \t]*registry[ \t]*=[ \t]*(\S+)/m,
  pipIndex: /^[ \t]*(?:--index-url|--extra-index-url|-i)\b/m,
  pipDirect: /\s@\s|^(?:git\+|https?:)/,
});
const readIf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");

/**
 * What the application declares as private (see the header): `{ npmScopes, npmAll, pipAll }`.
 * @param {string} appDir
 */
export function privateRegistries(appDir) {
  const npmrc = readIf(path.join(appDir, ".npmrc"));
  const npmScopes = new Set([...npmrc.matchAll(NETWORK_PATTERNS.npmScope)].map((m) => m[1].toLowerCase()));
  const registry = NETWORK_PATTERNS.npmRegistry.exec(npmrc)?.[1];
  const npmAll = !!registry && !/^https?:\/\/registry\.npmjs\.(?:org|com)\/?$/i.test(registry);
  const requirements = fs.existsSync(appDir)
    ? fs.readdirSync(appDir).filter((f) => /^requirements.*\.(?:txt|in)$/i.test(f))
    : [];
  const pipAll =
    ["pip.conf", "pip.ini"].some((f) => fs.existsSync(path.join(appDir, f))) ||
    requirements.some((f) => NETWORK_PATTERNS.pipIndex.test(readIf(path.join(appDir, f))));
  return { npmScopes, npmAll, pipAll };
}

/** Is a dependency item private (its name must not be sent to a public registry)? */
function isPrivatePackage(item, registries) {
  if (item.version && LOCAL_SPEC.test(String(item.version))) return true;
  if (item.ecosystem === "npm") {
    if (registries.npmAll) return true;
    const scope = item.name.startsWith("@") ? item.name.split("/")[0].toLowerCase() : null;
    return !!scope && registries.npmScopes.has(scope);
  }
  if (item.ecosystem === "pip") return registries.pipAll || NETWORK_PATTERNS.pipDirect.test(String(item.spec || ""));
  return false;
}

/**
 * Adds `exists` to every DIRECT dependency item (never to a transitive one): true, false, or null.
 * @param {Array<object>} items          dependencies items (engine/facts/dependencies.mjs)
 * @param {(url: string, options?: object) => Promise<Response>} fetchImpl
 * @param {{ concurrency?: number, timeoutMs?: number, registries?: ReturnType<typeof privateRegistries> }} [options]
 *   registries: what the application declares private (privateRegistries); a private item is never sent
 * @returns {Promise<Array<object>>} new items; a non-direct item is returned unchanged
 */
export async function checkExistence(
  items,
  fetchImpl,
  { concurrency = 8, timeoutMs = 5000, registries = { npmScopes: new Set(), npmAll: false, pipAll: false } } = {},
) {
  const isPrivate = (i) => isPrivatePackage(i, registries);
  const direct = items.filter((i) => i.direct && !isPrivate(i));
  const results = new Map();
  const queue = [...direct];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift())
      results.set(item, await existsInRegistry(item, fetchImpl, timeoutMs));
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, direct.length) }, worker));
  return items.map((i) =>
    !i.direct ? i : isPrivate(i) ? { ...i, private: true, exists: null } : { ...i, exists: results.get(i) },
  );
}
