// Shared helpers of the facts sources (ARCHITECTURE.md §6.9): walking the application's files and the envelope
// written to facts/<source>.json. Nothing here ever writes into the application: every source only reads it.
// Git (the application's HEAD) is not read here: it is read-only, through the `commit` test seam of the CLI
// context (cli/common.mjs), never executed by these pure functions.
import fs from "node:fs";
import path from "node:path";

/** Folders never walked: dependencies, version control, build and cache output. */
export const SKIP_DIRS = Object.freeze([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "coverage",
  "__pycache__",
]);

/** A path relative to `base`, forward slashes (ARCHITECTURE.md §6.9: "paths relative to the application"). */
export const relPath = (base, abs) => path.relative(base, abs).split(path.sep).join("/");

/** A folder holding this file is a documentation project of the kit, not code of the application: never read. */
const DOC_PROJECT_FILE = "doc.config.mjs";

/** The files of a list (relative, forward slashes) that do not sit in a documentation project below its root. */
export function withoutDocProjects(files) {
  const projects = files
    .filter((f) => f.endsWith("/" + DOC_PROJECT_FILE))
    .map((f) => f.slice(0, -DOC_PROJECT_FILE.length));
  return projects.length ? files.filter((f) => !projects.some((p) => f.startsWith(p))) : files;
}

/**
 * Every file under `dir`, skipping the named folders and the documentation projects below `dir` (a folder holding a
 * doc.config.mjs: the documentation often sits inside the application, e.g. docs/manual), relative to `dir`,
 * forward slashes, sorted.
 * Options `{ skip?: string[], maxDepth?: number }`: `maxDepth`: folders at most this many levels below `dir` are
 * walked (0: files directly in `dir` only); default: no limit.
 * @param {string} dir
 */
export function listFiles(
  dir,
  { skip = SKIP_DIRS, maxDepth = Infinity } = /** @type {{ skip?: string[], maxDepth?: number }} */ ({}),
) {
  const skipped = new Set(skip);
  const out = [];
  const visit = (abs, rel, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    if (rel && entries.some((e) => e.isFile() && e.name === DOC_PROJECT_FILE)) return;
    for (const e of entries) {
      if (skipped.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth < maxDepth) visit(path.join(abs, e.name), r, depth + 1);
      } else if (e.isFile()) out.push(r);
    }
  };
  if (fs.existsSync(dir)) visit(dir, "", 0);
  return out.sort();
}

/**
 * `git ls-files` of `dir` (files tracked by git, relative, forward slashes), or null when git is unavailable or
 * `dir` is not a repository. `exec`: the test seam of the CLI context (bin, args, options) => { status, stdout } |
 * null.
 */
export function gitLsFiles(dir, exec) {
  const r = exec("git", ["ls-files"], { cwd: dir });
  return r && r.status === 0
    ? withoutDocProjects(
        r.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((f) => f.split(path.sep).join("/")),
      )
    : null;
}

/**
 * Files to read for a source that must cover the whole application (ARCHITECTURE.md §6.9, `secrets`): the files
 * tracked by git when available, else every file but SKIP_DIRS.
 */
export const appFiles = (dir, { skip, exec } = /** @type {{ skip?: string[], exec?: any }} */ ({})) =>
  (exec ? gitLsFiles(dir, exec) : null) ?? listFiles(dir, { skip });

/**
 * Envelope of a facts file (ARCHITECTURE.md §6.9): `{ source, generator, generated, commit, app, items }`, same
 * for the same code and the same application, except `generated`. `extra` adds fields between `app` and `items`
 * (the `tests` source adds `summary`).
 */
export function factsFile({ source, items, extra = {}, generator, generated, commit, app }) {
  return { source, generator, generated, commit, app, ...extra, items };
}
