// Read-only git access to the application (ARCHITECTURE.md §6.10, decision 1) OR the documentation project
// (ARCHITECTURE.md §6.12, `context --translate`): the same `exec` seam of the CLI context used by `facts`
// (cli/common.mjs: (bin, args, options) => { status, stdout, stderr } | null). Only `rev-parse`, `show`, `diff`
// and `log` are ever run; never a write command, never a real git process in the tests.
import path from "node:path";
import { isSafeRef } from "../util/safe-git.mjs";

/**
 * @param {Function} exec   (bin, args, options) => { status, stdout, stderr } | null
 * @param {string} dir      the folder read (cwd of every command): the application, or, for `context --translate`,
 *   the documentation project itself
 * @returns {{ available(): boolean, head(): string|null, show(ref, path): string|null,
 *   changed(ref): Array<{status: "A"|"M"|"D"|"R", path: string, from?: string}>|null, diff(ref, paths): string|null,
 *   log(path, n?): string[]|null }}
 */
export function createGit(exec, dir) {
  const cache = new Map();
  /** Runs one command, memorised for the lifetime of this instance; null on failure (no git, no repository). */
  const run = (args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const r = exec("git", args, { cwd: dir });
    const value = r && r.status === 0 ? r.stdout : null;
    cache.set(key, value);
    return value;
  };
  return {
    available: () => run(["rev-parse", "--is-inside-work-tree"])?.trim() === "true",
    head: () => run(["rev-parse", "HEAD"])?.trim() || null,
    // "./" forces git to read <ref>:<path> relative to `dir` (the `cwd` of the command): without it, the
    // <rev>:<path> object syntax is always relative to the repository's top level, which differs from `dir`
    // whenever the application sits inside a bigger repository (a monorepo).
    // A reference comes from sync.json or --since: anything that is not a plain reference (isSafeRef: an option
    // such as --output=<file>, a space, a colon) is refused, and --end-of-options keeps git from reading it as one.
    show: (ref, p) => (isSafeRef(ref) ? run(["show", "--end-of-options", `${ref}:./${p.split(path.sep).join("/")}`]) : null),
    // --relative: paths relative to `dir` too (name-status lines, and pathspecs below), for the same reason.
    changed: (ref) => {
      if (!isSafeRef(ref)) return null;
      const out = run(["diff", "--name-status", "--find-renames", "--relative", "--end-of-options", ref]);
      if (out === null) return null;
      return out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [status, ...rest] = line.split("\t");
          return status[0] === "R" ? { status: "R", path: rest[1], from: rest[0] } : { status: status[0], path: rest[0] };
        });
    },
    diff: (ref, paths) => (!isSafeRef(ref) ? null : paths.length ? run(["diff", "--relative", "--end-of-options", ref, "--", ...paths]) : ""),
    // `context --translate` (ARCHITECTURE.md §6.12): the commits of one file, most recent first, read-only, so
    // that the translator's dossier can show the diff since the commit whose content matches the recorded
    // fingerprint (findSourceCommit, engine/context/translate.mjs).
    log: (p, n = 50) => {
      const out = run(["log", "--format=%H", "-n", String(n), "--", p.split(path.sep).join("/")]);
      return out === null ? null : out.split(/\r?\n/).filter(Boolean);
    },
  };
}
