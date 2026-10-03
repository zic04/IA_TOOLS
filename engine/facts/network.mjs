// `--network` (ARCHITECTURE.md §6.9): checks that each DIRECT dependency exists in its public registry. Only the
// package name is sent (never the version, never any file content); 8 requests at a time, 5 s each. `fetchImpl`
// is the test seam of the CLI context (`ctx.fetch`, defaulting to the global `fetch`): the tests never reach the
// network.
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

/**
 * Adds `exists` to every DIRECT dependency item (never to a transitive one): true, false, or null.
 * @param {Array<object>} items          dependencies items (engine/facts/dependencies.mjs)
 * @param {(url: string, options?: object) => Promise<Response>} fetchImpl
 * @param {{ concurrency?: number, timeoutMs?: number }} [options]
 * @returns {Promise<Array<object>>} new items; a non-direct item is returned unchanged
 */
export async function checkExistence(items, fetchImpl, { concurrency = 8, timeoutMs = 5000 } = {}) {
  const direct = items.filter((i) => i.direct);
  const results = new Map();
  const queue = [...direct];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift())
      results.set(item, await existsInRegistry(item, fetchImpl, timeoutMs));
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, direct.length) }, worker));
  return items.map((i) => (i.direct ? { ...i, exists: results.get(i) } : i));
}
