// Minimal semver ranges for the `kit` field of doc.config.mjs: *, x, 1, 1.2, 1.2.3, ^1.2.3, ~1.2.3,
// >=1.2.3, >1.2.3, <=1.2.3, <1.2.3, =1.2.3, conjunctions (space) and disjunctions (||). No pre-releases.

const parseVersion = (s) => {
  const m = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(s.trim());
  if (!m) return null;
  const n = (x) => (x === undefined || x === "x" || x === "*" ? null : Number(x));
  return [Number(m[1]), n(m[2]), n(m[3])];
};
const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

function bounds(spec) {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(spec.trim());
  if (!m) return null;
  const [, op = "", rest] = m;
  if (rest === "*" || rest === "x") return [];
  const v = parseVersion(rest);
  if (!v) return null;
  const [major, minor, patch] = v;
  const full = [major, minor ?? 0, patch ?? 0];
  switch (op) {
    case "^": {
      const upper =
        major > 0 || minor === null
          ? [major + 1, 0, 0]
          : minor > 0 || patch === null
            ? [0, minor + 1, 0]
            : [0, 0, patch + 1];
      return [
        [">=", full],
        ["<", upper],
      ];
    }
    case "~":
      return [
        [">=", full],
        ["<", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]],
      ];
    case ">=":
    case ">":
    case "<=":
    case "<":
      return [[op, full]];
    default:
      if (minor === null)
        return [
          [">=", [major, 0, 0]],
          ["<", [major + 1, 0, 0]],
        ];
      if (patch === null)
        return [
          [">=", [major, minor, 0]],
          ["<", [major, minor + 1, 0]],
        ];
      return [["=", full]];
  }
}

const test = (v, [op, b]) => {
  const c = compare(v, b);
  return { ">=": c >= 0, ">": c > 0, "<=": c <= 0, "<": c < 0, "=": c === 0 }[op];
};

/** Can the range be parsed? */
export function isValidRange(range) {
  return String(range)
    .split("||")
    .every(
      (alt) =>
        alt.trim() === "" ||
        alt
          .trim()
          .split(/\s+/)
          .every((s) => bounds(s) !== null),
    );
}

/** Does `version` satisfy `range`? */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v || !isValidRange(range)) return false;
  return String(range)
    .split("||")
    .some((alt) => {
      const specs = alt.trim() ? alt.trim().split(/\s+/) : ["*"];
      return specs.every((s) => bounds(s).every((b) => test(v, b)));
    });
}
