// How far behind its latest published version a dependency is, one rule for the whole kit: the `majorsBehind` of the
// `dependencies` items (`--network`, ARCHITECTURE.md §6.9, engine/facts/network.mjs) and the outdated count of
// `quality` (§6.13). A heuristic over the version as written — its first number is its major —, not a semver or
// PEP 440 parser. The versions and ranges come from untrusted files and answers: the expressions are linear (RULES.md
// S5, test/tools/redos-worker.mjs).

/** Every expression of this module (registered in test/tools/redos-worker.mjs). */
export const VERSION_PATTERNS = Object.freeze({
  // What comes before a version's first digit ("^", "~=", "v", ">= "), and its first number.
  beforeDigits: /^[^\d]*/,
  firstNumber: /(\d+)/,
});

/** First number of a version-like string ("^2.1.0" → 2), or null. */
function majorOf(version) {
  const m = VERSION_PATTERNS.firstNumber.exec(String(version ?? "").replace(VERSION_PATTERNS.beforeDigits, ""));
  return m ? Number(m[1]) : null;
}

/**
 * The major version an item is at: its exact version's, else that of a range that names the major in use
 * ("^17.0.0", "~17.1", "~=17.0", "==17.*"); null otherwise — a lower bound alone (">=1.26") says nothing of the
 * version installed.
 * @param {{ version?: string|null, spec?: string|null }} item
 */
function currentMajor(item) {
  const spec = String(item.spec ?? "").trim();
  const namesMajor = ["^", "~", "=="].some((op) => spec.startsWith(op));
  return majorOf(item.version ?? (namesMajor ? item.spec : null));
}

/**
 * How many major versions `item` is behind `latest`: the latest major minus the current one, never negative (a latest
 * older than the version in use is 0); null when either is unknown.
 * @param {{ version?: string|null, spec?: string|null }} item
 * @param {string|null|undefined} latest
 * @returns {number|null}
 */
export function majorsBehind(item, latest) {
  const current = currentMajor(item);
  const newest = majorOf(latest);
  return current === null || newest === null ? null : Math.max(0, newest - current);
}
