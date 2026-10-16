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
