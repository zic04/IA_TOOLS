// `history` source (ETUDE-CAPTURES.md, developer overview): what git says about each file of the application —
// how often it changes, how much, by how many people, who knows it best, when it last moved. Read-only git through
// the hardened `exec` seam (cli/common.mjs, engine/util/safe-git.mjs); author names only, never e-mails.
//   item: { file, commits, churn, authors, owner, ownerShare, last }
//   summary: { commits, authors, since, until, busFactor, files }
// busFactor: the fewest authors who made half of the commits on the files still tracked — 1 means one person
// holds half of the knowledge of the code.
import { gitLsFiles } from "./common.mjs";

/** Most recent commits read. */
export const HISTORY_LIMIT = 2000;
/** Files kept, the most often changed first. */
export const HISTORY_FILES = 300;

/**
 * Parses `git log --numstat --no-renames --format=@@%H%x09%an%x09%aI` output.
 * @returns {Array<{ hash, author, date, files: Array<{ path, added, deleted }> }>}
 */
export function parseNumstat(text) {
  const commits = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const [hash, author, date] = line.slice(2).split("\t");
      current = { hash, author: author || "?", date: date || "", files: [] };
      commits.push(current);
      continue;
    }
    if (!current || !line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const n = (x) => (x === "-" ? 0 : Number(x) || 0); // "-": a binary file
    current.files.push({ path: parts.slice(2).join("\t"), added: n(parts[0]), deleted: n(parts[1]) });
  }
  return commits;
}

/** Items and summary from parsed commits, limited to `tracked` files when given. */
export function historyFacts(commits, { tracked = null, limit = HISTORY_FILES } = {}) {
  const keep = tracked ? new Set(tracked) : null;
  const byFile = new Map();
  const commitsByAuthor = new Map();
  for (const c of commits) {
    let touchesTracked = false;
    for (const f of c.files) {
      if (keep && !keep.has(f.path)) continue;
      touchesTracked = true;
      const e = byFile.get(f.path) || { file: f.path, commits: 0, churn: 0, byAuthor: new Map(), last: "" };
      e.commits++;
      e.churn += f.added + f.deleted;
      e.byAuthor.set(c.author, (e.byAuthor.get(c.author) || 0) + 1);
      if (c.date > e.last) e.last = c.date;
      byFile.set(f.path, e);
    }
    if (touchesTracked) commitsByAuthor.set(c.author, (commitsByAuthor.get(c.author) || 0) + 1);
  }
  const items = [...byFile.values()]
    .map((e) => {
      const [owner, n] = [...e.byAuthor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return { file: e.file, commits: e.commits, churn: e.churn, authors: e.byAuthor.size, owner, ownerShare: Math.round((n / e.commits) * 100), last: e.last.slice(0, 10) };
    })
    .sort((a, b) => b.commits - a.commits || b.churn - a.churn || a.file.localeCompare(b.file))
    .slice(0, limit);
  const total = [...commitsByAuthor.values()].reduce((a, b) => a + b, 0);
  let busFactor = 0;
  let covered = 0;
  for (const n of [...commitsByAuthor.values()].sort((a, b) => b - a)) {
    if (covered >= total / 2) break;
    covered += n;
    busFactor++;
  }
  const dates = commits.map((c) => c.date).filter(Boolean).sort();
  return {
    items,
    summary: { commits: commits.length, authors: commitsByAuthor.size, since: (dates[0] || "").slice(0, 10), until: (dates.at(-1) || "").slice(0, 10), busFactor, files: byFile.size },
  };
}

/**
 * The `history` source. Without git, or outside a repository: no item, `summary.available` false.
 * @param {string} appDir
 * @param {Function} exec  the CLI context's exec seam
 */
export function collectHistory(appDir, exec) {
  const r = exec("git", ["log", "--numstat", "--no-renames", "--relative", `-n${HISTORY_LIMIT}`, "--format=@@%H%x09%an%x09%aI", "--", "."], { cwd: appDir });
  if (!r || r.status !== 0) return { items: [], summary: { available: false } };
  const tracked = gitLsFiles(appDir, exec);
  const { items, summary } = historyFacts(parseNumstat(r.stdout), { tracked });
  return { items, summary: { available: true, ...summary } };
}
