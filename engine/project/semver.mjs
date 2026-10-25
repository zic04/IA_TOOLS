// Versions and ranges, one reading for the whole kit (RULES.md M6): npm's (the semver package, its default options).
//   versions      1.2.3, v1.2.3, 1.2.3-rc.1, 1.2.3+build.5, ordered as SemVer 2.0 §11 says (compareVersions): a
//                 pre-release before its release and after the versions below it (1.2.2 < 1.2.3-rc.1 < 1.2.3), its
//                 identifiers compared one by one (numbers by value, before words; a longer list after its own
//                 start); build metadata ignored. compareVersions also orders a partial version (1.2 as 1.2.0) and,
//                 after every version, a text that is none, in natural order: it sorts the kit's versions, the
//                 `since` of a backlog and the versions of the screenshots (the site's copy, engine/site/lib/
//                 versions.js, is kept identical by test/unit/semver.test.mjs).
//   ranges        alternatives joined by `||`, each its comparators joined by spaces: x-ranges (`*`, `""`, `1`,
//                 `1.x`, `1.2`, `1.2.*`), `^`, `~` (`~>` too), hyphen ranges (`1.2 - 2.3.4`), `<`, `<=`, `>`, `>=`, `=`
//                 before a full or partial version, a space after the operator allowed (`>= 1.2.3`); a partial
//                 version completed as npm does (`>1.2` is `>=1.3.0`, `<=1.2` is `<1.3.0-0`). Stricter than npm on
//                 what it repairs: one `v` before a version at most (npm takes `vv1`, `~=1`), build metadata after
//                 a full version only (npm drops `+b` anywhere); such a range is refused, never read otherwise.
//   pre-releases  a pre-release satisfies a range only when the alternative it satisfies names a pre-release of the
//                 same major.minor.patch (npm's `includePrerelease: false`): 1.3.0-rc.1 satisfies `^1.3.0-rc.0` and
//                 `>=1.3.0-0`, neither `^1.2.0` nor `*`. A pre-release of the kit is thus refused (exit code 3) by a
//                 project's range until `doc-kit upgrade --apply` sets it to `^<that pre-release>`, which the
//                 release accepts too.
// engine/core/versions.mjs stays apart: it reads any ecosystem's dependency versions (PEP 440, Maven…) for their major.

/** Every expression of this module (registered in test/tools/redos-worker.mjs): anchored, linear. */
export const SEMVER_PATTERNS = Object.freeze({
  // A version or a partial one, a part a number with no leading zero, x, X or *; a pre-release and build metadata
  // after the third part only, their identifiers checked by readPartial.
  partial:
    /^v?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/,
  number: /^\d+$/,
  blanks: /\s+/,
});

/** @typedef {{ release: number[], pre: string[] }} Version   pre: the pre-release identifiers, [] for a release */
/** @typedef {{ op: string, v: Version }} Comparator   op: <, <=, >, >= or = */

/** Longest first: `>=` is read before `>`. */
const OPERATORS = ["~>", ">=", "<=", "~", "^", ">", "<", "="];
const isX = (part) => part === undefined || part === "x" || part === "X" || part === "*";

/**
 * A version or a partial one: its three parts (null: x or not written, and every part after it), its pre-release
 * identifiers and whether an x was written; null when it reads as none.
 * @returns {{ parts: Array<number|null>, pre: string[], wild: boolean }|null}
 */
function readPartial(text) {
  const m = SEMVER_PATTERNS.partial.exec(String(text ?? "").trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split(".") : [];
  // An empty identifier, or a number written with a leading zero (SemVer 2.0 §9, §10), reads as no version.
  const leadingZero = (id) => id.length > 1 && id[0] === "0" && SEMVER_PATTERNS.number.test(id);
  if (pre.some((id) => !id || leadingZero(id)) || m[5]?.split(".").includes("")) return null;
  /** @type {Array<number|null>} */
  const parts = [];
  for (const p of [m[1], m[2], m[3]]) parts.push(parts.at(-1) === null || isX(p) ? null : Number(p));
  const wild = [m[1], m[2], m[3]].some((p) => p !== undefined && isX(p));
  return { parts, pre: parts[2] === null ? [] : pre, wild };
}

/** A full version (npm's: 1.2.3, v1.2.3-rc.1+b), or null. @returns {Version|null} */
function readVersion(text) {
  const p = readPartial(text);
  return p && p.parts[2] !== null ? { release: p.parts, pre: p.pre } : null;
}

const compareIdentifiers = (x, y) => {
  const nx = SEMVER_PATTERNS.number.test(x);
  const ny = SEMVER_PATTERNS.number.test(y);
  if (nx && ny) return Math.sign(Number(x) - Number(y));
  if (nx !== ny) return nx ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
};

/** SemVer 2.0 §11. @param {Version} a @param {Version} b */
function compareParsed(a, b) {
  for (let i = 0; i < 3; i++) if (a.release[i] !== b.release[i]) return a.release[i] < b.release[i] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return Math.sign(b.pre.length - a.pre.length);
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = compareIdentifiers(a.pre[i], b.pre[i]);
    if (c) return c;
  }
  return Math.sign(a.pre.length - b.pre.length);
}

/**
 * The order of two versions, -1, 0 or 1: SemVer 2.0 §11 ("1.10.0" after "1.9.2", "1.2.3-rc.1" between "1.2.2" and
 * "1.2.3"), a partial version read with zeros ("1.0" is "1.0.0"); a text that is no version after the versions, in
 * natural order ("R2" before "R10").
 */
export function compareVersions(a, b) {
  const read = (text) => {
    const p = readPartial(text);
    return p && !p.wild ? { release: p.parts.map((n) => n ?? 0), pre: p.pre } : null;
  };
  const x = read(a);
  const y = read(b);
  if (x && y) return compareParsed(x, y);
  if (x || y) return x ? -1 : 1;
  return Math.sign(String(a).localeCompare(String(b), "en", { numeric: true }));
}

/** @returns {Comparator} */
const at = (op, release, pre = []) => ({ op, v: { release, pre } });
/** Below a version and every pre-release of it (npm's `<2.0.0-0`). */
const below = (release) => at("<", release, ["0"]);

/** The upper bound of a `^` or a `~` range (its major written). @returns {Comparator} */
function upperOf(op, M, m, patch) {
  if (m === null) return below([M + 1, 0, 0]);
  if (op !== "^") return below([M, m + 1, 0]);
  // ^: below the next change of its first part that is not 0 (^0.2.3 <0.3.0-0, ^0.0.3 <0.0.4-0, ^0.0 <0.1.0-0).
  return below(M ? [M + 1, 0, 0] : m || patch === null ? [0, m + 1, 0] : [0, 0, patch + 1]);
}

/** The comparators a written one stands for, as npm expands it; null when it cannot be read. @returns {Comparator[]|null} */
function expand(word) {
  const op = OPERATORS.find((o) => word.startsWith(o)) ?? "";
  const p = readPartial(word.slice(op.length));
  if (!p) return null;
  const [M, m, patch] = p.parts;
  // `*` and its kin: any version; after < or >, none.
  if (M === null) return op === "<" || op === ">" ? [below([0, 0, 0])] : [];
  if (op === "" || op === "=") {
    if (m === null) return [at(">=", [M, 0, 0]), below([M + 1, 0, 0])];
    if (patch === null) return [at(">=", [M, m, 0]), below([M, m + 1, 0])];
    return [at("=", [M, m, patch], p.pre)];
  }
  if (op === "^" || op === "~" || op === "~>")
    return [at(">=", [M, m ?? 0, patch ?? 0], p.pre), upperOf(op, M, m, patch)];
  if (patch !== null) return [at(op, [M, m, patch], p.pre)];
  // A partial version after <, <=, >, >=: >1.2 is >=1.3.0, <=1.2 is <1.3.0-0, <1.2 is <1.2.0-0, >=1.2 is >=1.2.0.
  const next = m === null ? [M + 1, 0, 0] : [M, m + 1, 0];
  const first = [M, m ?? 0, 0];
  return [op === ">" ? at(">=", next) : op === "<=" ? below(next) : op === "<" ? below(first) : at(">=", first)];
}

/** A hyphen range: from a version, its missing parts 0, to one, its missing parts any. @returns {Comparator[]} */
function hyphen(from, to) {
  const [fM, fm, fp] = from.parts;
  const [tM, tm, tp] = to.parts;
  const lower = fM === null ? [] : [at(">=", [fM, fm ?? 0, fp ?? 0], from.pre)];
  if (tM === null) return lower;
  const upper = tm === null ? below([tM + 1, 0, 0]) : tp === null ? below([tM, tm + 1, 0]) : at("<=", to.parts, to.pre);
  return [...lower, upper];
}

/** `>=0.0.0`, which npm reads as `*` (so that it never shuts out the pre-releases of 0.0.0). */
const isAny = (c) => c.op === ">=" && !c.v.pre.length && c.v.release.every((n) => n === 0);

/** The comparators of one alternative ([]: any version); null when one cannot be read. @returns {Comparator[]|null} */
function alternative(text) {
  const words = text.split(SEMVER_PATTERNS.blanks).filter(Boolean);
  const out = [];
  if (words.length === 3 && words[1] === "-") {
    const from = readPartial(words[0]);
    const to = readPartial(words[2]);
    if (!from || !to) return null;
    out.push(...hyphen(from, to));
  } else
    for (let i = 0; i < words.length; i++) {
      // An operator written apart from its version (">= 1.2.3") is joined to it.
      const word = OPERATORS.includes(words[i]) && i + 1 < words.length ? words[i] + words[++i] : words[i];
      const comparators = expand(word);
      if (!comparators) return null;
      out.push(...comparators);
    }
  return out.filter((c) => !isAny(c));
}

/** A range read: its alternatives, each the comparators it holds; null when it cannot be read. */
function readRange(range) {
  const sets = String(range).split("||").map(alternative);
  if (sets.includes(null)) return null;
  // As npm: one alternative that allows any version makes the whole range `*`, which no pre-release satisfies.
  return sets.length > 1 && sets.some((set) => !set.length) ? [[]] : sets;
}

/** Does a version satisfy the comparators of one alternative (a pre-release: only when one names its release)? */
function allows(set, v) {
  const holds = ({ op, v: bound }) => {
    const c = compareParsed(v, bound);
    return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : op === ">=" ? c >= 0 : c === 0;
  };
  const named = (c) => c.v.pre.length > 0 && c.v.release.every((n, i) => n === v.release[i]);
  return set.every(holds) && (!v.pre.length || set.some(named));
}

/** Can the range be read? */
export function isValidRange(range) {
  return readRange(range) !== null;
}

/** Does `version` (a full one) satisfy `range`? */
export function satisfies(version, range) {
  const v = readVersion(version);
  const sets = readRange(range);
  return !!v && !!sets && sets.some((set) => allows(set, v));
}

/**
 * The lowest version a range allows (`^0.4.0 || ^0.3.0` → 0.3.0, `<1.0.0` → 0.0.0, `>1.2.3` → 1.2.4), as npm's
 * minVersion gives it — 0.0.0, else 0.0.0-0, else the lowest of the alternatives' lower bounds — except that each
 * alternative's is judged on its own (npm gives none for `>2 <1 || ^5`); null when it allows none or cannot be read.
 * @returns {string|null}
 */
export function minVersion(range) {
  const sets = readRange(range);
  if (!sets) return null;
  for (const floor of ["0.0.0", "0.0.0-0"]) if (satisfies(floor, range)) return floor;
  /** @type {Version|null} */
  let min = null;
  for (const set of sets) {
    let low = null; // the highest of its lower bounds: the lowest version it may allow
    for (const { op, v } of set) {
      if (op === "<" || op === "<=") continue;
      const [M, m, p] = v.release;
      const next = v.pre.length ? { release: v.release, pre: [...v.pre, "0"] } : { release: [M, m, p + 1], pre: [] };
      const c = op === ">" ? next : v;
      if (!low || compareParsed(c, low) > 0) low = c;
    }
    if (low && allows(set, low) && (!min || compareParsed(low, min) < 0)) min = low;
  }
  return min && min.release.join(".") + (min.pre.length ? `-${min.pre.join(".")}` : "");
}
