// Freshness of the facts files (ARCHITECTURE.md §6.9): a facts/<source>.json records the application commit it was
// read from; it is stale when that commit is not the application's current HEAD. Read by `sync` (the report),
// `doctor` and `audit` (the informative `facts` indicator), and later by the bricks. The reports of `--tools`
// (facts/tool-*.json) are not facts sources and are left out.
import fs from "node:fs";
import path from "node:path";

/**
 * The facts files of a project: `{ file, source, commit }` each, in name order. A file that cannot be read keeps
 * its name as source and a null commit (its freshness is unknown).
 * @param {string} root
 * @param {string} factsDir   config.paths.facts, relative to root
 * @returns {Array<{ file: string, source: string, commit: string|null }>}
 */
function factsFiles(root, factsDir) {
  const dir = path.join(root, factsDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("tool-"))
    .sort()
    .map((file) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        return { file, source: j.source || file.slice(0, -5), commit: j.commit || null };
      } catch {
        return { file, source: file.slice(0, -5), commit: null };
      }
    });
}

/**
 * The sources whose recorded commit differs from `commit`, the application's current HEAD. None when `commit` is
 * unknown (no app.dir, no git): nothing can then be called stale.
 * @param {string} root
 * @param {string} factsDir
 * @param {string|null} commit
 * @returns {string[]}
 */
export function staleFacts(root, factsDir, commit) {
  if (!commit) return [];
  return factsFiles(root, factsDir)
    .filter((f) => f.commit && f.commit !== commit)
    .map((f) => f.source);
}

/** The "major.minor" of a generator tag ("doc-kit 0.4.2" → "0.4"), or null. Read on its first 64 characters. */
const kitLine = (generator) =>
  /(\d+)\.(\d+)\.\d+/
    .exec(String(generator || "").slice(0, 64))
    ?.slice(1, 3)
    .join(".") ?? null;

/**
 * The state of one facts file (`facts/<name>.json`, a source or a tool report) for the bricks (ARCHITECTURE.md
 * §6.18): `missing` (no file), `stale` (read from another commit than the application's HEAD, written by another
 * kit line — major.minor —, older than `maxAgeDays`, or unreadable), else `fresh`. An unknown HEAD (no git) cannot
 * make a file stale. `why`: the reasons, as message keys and their variables.
 * @param {string} root
 * @param {string} factsDir
 * @param {string} name   file name without .json ("dependencies", "tool-knip")
 * @param {{ commit: string|null, generator: string, now: Date, maxAgeDays?: number }} p
 * @returns {{ state: "missing"|"stale"|"fresh", why: Array<{ key: string, vars: object }> }}
 */
export function envelopeState(root, factsDir, name, { commit, generator, now, maxAgeDays }) {
  const file = `${factsDir}/${name}.json`;
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return { state: "missing", why: [{ key: "noFile", vars: { file } }] };
  let j;
  try {
    j = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    j = null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j))
    return { state: "stale", why: [{ key: "unreadable", vars: { file } }] };
  const why = [];
  const recorded = typeof j.commit === "string" ? j.commit : null;
  if (commit && recorded && recorded !== commit)
    why.push({ key: "commit", vars: { file, was: recorded.slice(0, 7), now: commit.slice(0, 7) } });
  const was = typeof j.generator === "string" ? kitLine(j.generator) : null;
  const current = kitLine(generator);
  if (was && current && was !== current) why.push({ key: "kit", vars: { file, was, now: current } });
  const generated = Date.parse(j.generated);
  if (maxAgeDays && Number.isFinite(generated)) {
    const days = Math.floor((now.getTime() - generated) / 86_400_000);
    if (days > maxAgeDays) why.push({ key: "age", vars: { file, days, max: maxAgeDays, n: days } });
  }
  return { state: why.length ? "stale" : "fresh", why };
}

/**
 * How many facts files there are, and how many are stale (the audit's informative `facts` indicator).
 * @param {string} root
 * @param {string} factsDir
 * @param {string|null} commit
 * @returns {{ files: number, stale: number }}
 */
export function factsSummary(root, factsDir, commit) {
  return { files: factsFiles(root, factsDir).length, stale: staleFacts(root, factsDir, commit).length };
}
