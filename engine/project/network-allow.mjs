// `facts.network.allow` (ARCHITECTURE.md §3, §6.9): the packages `facts --network` may send, as the user lists them,
// one an entry — "npm:<name>" or "pip:<name>", no wildcard. Read by one rule for the validation of the configuration
// (engine/project/load.mjs) and for the network gateway (engine/facts/network.mjs), which compares a listed name as it
// compares a package (engine/core/packages.mjs: an npm name exactly, a pip name as PEP 503 normalises it).

/** The ecosystems an entry may name: the registries `--network` asks. */
export const ALLOW_ECOSYSTEMS = Object.freeze(["npm", "pip"]);

/**
 * An entry of `facts.network.allow`: `{ ecosystem, name }`, or `{ error }` — "ecosystem" (no "npm:" or "pip:" first),
 * "name" (no name after it, or one holding a blank), "wildcard" (a "*": a package is listed by its own name). The name
 * is split at the first ":" (an npm scope, `npm:@corp/ui`, holds none).
 * @param {unknown} entry
 * @returns {{ ecosystem: string, name: string, error?: undefined }|{ error: "ecosystem"|"name"|"wildcard" }}
 */
export function readAllowEntry(entry) {
  const text = typeof entry === "string" ? entry : "";
  const colon = text.indexOf(":");
  const ecosystem = colon < 0 ? "" : text.slice(0, colon);
  if (!ALLOW_ECOSYSTEMS.includes(ecosystem)) return { error: "ecosystem" };
  const name = text.slice(colon + 1);
  if (!name || /\s/.test(name)) return { error: "name" };
  if (name.includes("*")) return { error: "wildcard" };
  return { ecosystem, name };
}
