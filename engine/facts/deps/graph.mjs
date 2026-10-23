// The way a transitive dependency comes in (`via`, engine/facts/dependencies.mjs): from the lock files that give
// each package its own dependencies (package-lock.json v1 to v3, yarn.lock, poetry.lock, uv.lock), the shortest chain
// of names from a direct dependency down to the package's parent. Breadth first, each name visited once: linear in
// the size of the graph, whatever its cycles.

/** The longest chain kept: a deeper one is left out (its `via` would tell more noise than path). */
const MAX_VIA = 12;

/**
 * For every package reached from a direct one, the chain of names that brings it in, the direct dependency first
 * and its own parent last; a direct package, or one reached by no direct one, has none.
 * @param {Iterable<string>} direct           the direct dependencies' names
 * @param {Map<string, Iterable<string>>} graph  each package's own dependencies, by name
 * @returns {Map<string, string[]>}
 */
export function viaChains(direct, graph) {
  const roots = new Set(direct);
  const chains = new Map();
  /** @type {Array<[string, string[]]>} each name with the chain that reached it */
  const queue = [...roots].map((name) => [name, []]);
  const seen = new Set(roots);
  // A list of children shared by several names (the names of one yarn.lock header) is walked once: after the first
  // walk — the shallowest, breadth first — every child in it is seen.
  const walked = new Set();
  for (let i = 0; i < queue.length; i++) {
    const [name, before] = queue[i];
    const chain = [...before, name];
    if (chain.length > MAX_VIA) continue;
    const children = graph.get(name);
    if (!children || walked.has(children)) continue;
    walked.add(children);
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      chains.set(child, chain);
      queue.push([child, chain]);
    }
  }
  return chains;
}

/**
 * The items with their `via` (a transitive item reached from a direct name), the others unchanged. `key` gives the
 * name an item is known by in `direct` and `graph` (PyPI compares names case and separators aside).
 */
export function withVia(items, direct, graph, key = (name) => name) {
  const chains = viaChains(direct, graph);
  return items.map((item) =>
    !item.direct && chains.has(key(item.name)) ? { ...item, via: chains.get(key(item.name)) } : item,
  );
}
