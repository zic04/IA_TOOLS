// A package's identity, one rule for the whole kit: two items name the same package when their ecosystem and their
// keys are equal — an npm name as written (npm's registry tells `JSONStream` from `jsonstream`, two packages), a pip
// name as PEP 503 normalises it (case aside, runs of "-", "_", "." are one "-": `My_Lib`, `my.lib` and `my-lib` are
// one package). Used by the network gateway (one request a package), the outdated count, the page of the
// dependencies and the health view. The second net (network.mjs) compares names in any case on top: it fails closed.

/** The key of a package's name in its ecosystem. */
export const packageKey = (ecosystem, name) =>
  ecosystem === "pip"
    ? String(name)
        .toLowerCase()
        .split(/[-_.]+/)
        .join("-")
    : String(name);

/** The identity of an item: its ecosystem and its key. */
export const packageId = (item) => `${item.ecosystem}\0${packageKey(item.ecosystem, item.name)}`;

/**
 * One item a package, in their order: the first with an exact version (a lock file's), else the first (a manifest
 * names a package with a range, its lock file with the version installed).
 * @template {{ name: string, ecosystem: string, version?: string|null }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function oncePerPackage(items) {
  const byId = new Map();
  for (const item of items) {
    const id = packageId(item);
    const kept = byId.get(id);
    if (!kept || (!kept.version && item.version)) byId.set(id, item);
  }
  return [...byId.values()];
}
