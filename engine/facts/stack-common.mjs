// What every stack adapter shares (ARCHITECTURE.md §5): the bounds of what it gives — the guards of one route, the
// routes of one adapter — so that a file that multiplies them (K guards on a parent of K children, K handlers of one
// name mounted K times) costs a bounded output and a bounded time; and the singular of a resource's name (a Laravel
// or Rails resource route's parameter: orders → {order}, categories → {category}, addresses → :address_id).

/** At most this many guards on one route or screen: a list composed from its parents is cut, never copied whole. */
export const MAX_GUARDS = 32;
/** At most this many routes or screens from one adapter (the rest of the application is still read by the others). */
export const MAX_ITEMS = 5000;

/** At most this many entries of each list are read when guards are composed (a list of duplicates included). */
const READ = MAX_GUARDS * 4;

/**
 * Guards composed from a parent's and a route's own: once each, in order, MAX_GUARDS at most, and READ entries of
 * each list read at most — so that composing costs a bounded time whatever the lists hold (thousands of copies of
 * one guard never reach MAX_GUARDS distinct ones) and whatever the depth.
 * @param {readonly string[]} parent
 * @param {readonly string[]} own
 * @returns {string[]}
 */
export function withGuards(parent, own) {
  const out = [];
  for (const list of [parent, own])
    for (let k = 0; k < list.length && k < READ; k++) {
      if (out.length === MAX_GUARDS) return out;
      if (!out.includes(list[k])) out.push(list[k]);
    }
  return out;
}

/** Words whose plural is not built by a rule. */
const IRREGULAR = new Map([
  ["people", "person"],
  ["children", "child"],
  ["men", "man"],
  ["women", "woman"],
  ["mice", "mouse"],
  ["geese", "goose"],
  ["feet", "foot"],
  ["teeth", "tooth"],
  ["data", "datum"],
  ["criteria", "criterion"],
  ["indices", "index"],
  ["matrices", "matrix"],
  ["movies", "movie"],
  ["cookies", "cookie"],
  ["zombies", "zombie"],
  ["series", "series"],
  ["species", "species"],
  ["news", "news"],
  ["equipment", "equipment"],
  ["information", "information"],
]);

/** The words in -us whose plural is -uses (statuses → status); any other -ses loses its s (houses → house). */
const US_PLURAL = /(?:status|bus|alias|virus|campus|bonus|census|corpus)es$/;
/** The plurals in -es of a word ending with ss, x, ch, sh or zz (addresses → address, boxes → box). */
const SIBILANT_PLURAL = /(?:ss|x|ch|sh|zz)es$/;

/**
 * The singular of an English word as Laravel's and Rails's inflectors give it for the usual names of resources: the
 * irregular words, then -ies → -y (categories), the plurals of -us and of a sibilant without -es, and any other -s
 * without it (houses, responses, orders).
 * @param {string} word
 */
export function singular(word) {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR.get(lower);
  if (irregular) return irregular;
  if (lower.endsWith("ies") && lower.length > 4) return `${word.slice(0, -3)}y`;
  if (US_PLURAL.test(lower) || SIBILANT_PLURAL.test(lower)) return word.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 1) return word.slice(0, -1);
  return word;
}

/** The expressions of this module (test/tools/redos-worker.mjs): on a word, bounded by the caller. */
export const STACK_COMMON_PATTERNS = Object.freeze({ US_PLURAL, SIBILANT_PLURAL });
