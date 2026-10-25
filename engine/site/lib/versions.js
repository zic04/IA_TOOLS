/* A module of the site (engine/site/app.js, spliced in at its "@lib" line by the build, ARCHITECTURE.md §6.1a): it
   adds EXT.compareVersions, the kit's order of versions: engine/project/semver.mjs's compareVersions, copied
   (the site's script imports nothing; test/unit/semver.test.mjs keeps both identical on its table): SemVer 2.0 §11,
   a partial version read with zeros, a text that is no version after the versions, in natural order. */
/* global EXT */

const VERSION =
  /^v?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/;
const NUMBER = /^\d+$/;

/** A version or a partial one, its missing parts 0: { release, pre }; null for an x or a text that is none. */
function readOrdered(text) {
  const m = VERSION.exec(String(text ?? "").trim());
  if (!m || [m[1], m[2], m[3]].some((p) => p !== undefined && !NUMBER.test(p))) return null;
  const pre = m[4] ? m[4].split(".") : [];
  const leadingZero = (id) => id.length > 1 && id[0] === "0" && NUMBER.test(id);
  if (pre.some((id) => !id || leadingZero(id)) || (m[5] && m[5].split(".").includes(""))) return null;
  return { release: [m[1], m[2], m[3]].map((p) => Number(p ?? 0)), pre };
}

function compareIdentifiers(x, y) {
  const nx = NUMBER.test(x);
  const ny = NUMBER.test(y);
  if (nx && ny) return Math.sign(Number(x) - Number(y));
  if (nx !== ny) return nx ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

EXT.compareVersions = (a, b) => {
  const x = readOrdered(a);
  const y = readOrdered(b);
  if (!x || !y) return x ? -1 : y ? 1 : Math.sign(String(a).localeCompare(String(b), "en", { numeric: true }));
  for (let i = 0; i < 3; i++) if (x.release[i] !== y.release[i]) return x.release[i] < y.release[i] ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length);
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const c = compareIdentifiers(x.pre[i], y.pre[i]);
    if (c) return c;
  }
  return Math.sign(x.pre.length - y.pre.length);
};
