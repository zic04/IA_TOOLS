// Safe use of git and of external tools on a folder that is not trusted (ARCHITECTURE.md §6.10, SECURITY.md
// "The application folder is not trusted"). An application handed over for a takeover comes with its own
// .git/config: a read-only command such as `git diff` or `git ls-files` can still run a program named there
// (core.fsmonitor, diff.external, a textconv driver, a clean filter, a pager). Every git command of the kit goes
// through `safeGitArgs` and is refused when `riskyGitConfig` finds such a key.
import fs from "node:fs";
import path from "node:path";

/** Options put before every git command: no file system monitor, no pager, no external diff, no textconv. */
const GIT_HARDENING = Object.freeze(["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "--no-pager"]);

/** Subcommands that accept --no-ext-diff and --no-textconv. */
const DIFF_LIKE = new Set(["diff", "show", "log"]);

/** `args` of one git command, hardened (GIT_HARDENING, then --no-ext-diff --no-textconv for diff, show, log). */
export function safeGitArgs(args) {
  const [sub, ...rest] = args;
  return [...GIT_HARDENING, sub, ...(DIFF_LIKE.has(sub) ? ["--no-ext-diff", "--no-textconv"] : []), ...rest];
}

/**
 * A git reference given by a file or an option (`sync.json` app.commit, `sync --since`): a name, a hash, or a
 * revision expression (HEAD~2, v1.0^, main@{1}). Never an option (a leading "-"), never a space, a colon or a
 * control character, which would change the meaning of the command.
 */
export function isSafeRef(ref) {
  return (
    typeof ref === "string" && ref.length > 0 && ref.length <= 256 && /^[A-Za-z0-9_][A-Za-z0-9_./@{}~^-]*$/.test(ref)
  );
}

/**
 * Keys of a git configuration whose value is a command that a read-only git command may run (a pager never runs:
 * --no-pager). The values used by Git LFS (`git-lfs clean -- %f` and the like) are allowed.
 */
const RISKY_KEY =
  /^(core\.fsmonitor|diff\.external|diff\..+\.(textconv|command)|filter\..+\.(clean|smudge|process)|include\.path|includeif\..+\.path)$/;
const LFS_FILTER = /^filter\.lfs\.(clean|smudge|process)$/;
const LFS_VALUE = /^git-lfs (clean|smudge|filter-process)\b/;

/** Pairs [key, value] of a git configuration file (simple INI reading: sections, subsections, key = value). */
export function parseGitConfig(text) {
  const out = [];
  let section = "";
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^\s+/, "");
    if (!line || line[0] === "#" || line[0] === ";") continue;
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (head) {
      section = head[1].toLowerCase() + (head[2] !== undefined ? `.${head[2]}` : "");
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(line);
    if (kv && section)
      out.push([`${section}.${kv[1].toLowerCase()}`, (kv[2] ?? "true").trim().replace(/^"(.*)"$/, "$1")]);
  }
  return out;
}

/** The repository's git folder for `dir` (walking up; a `.git` file of a worktree or submodule is followed). */
function gitDirOf(dir) {
  let d = path.resolve(dir);
  for (;;) {
    const candidate = path.join(d, ".git");
    try {
      const st = fs.statSync(candidate);
      if (st.isDirectory()) return candidate;
      if (st.isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(candidate, "utf8"));
        if (m) return path.resolve(d, m[1].trim());
      }
    } catch {
      // not here: one level up
    }
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}

const cache = new Map();

/**
 * Risky keys of the repository configuration of `dir` (its config, config.worktree and, for a worktree, the
 * common config), as "key = value" lines; [] when there is none or no repository. Memorised per git folder.
 */
export function riskyGitConfig(dir) {
  const gitDir = gitDirOf(dir);
  if (!gitDir) return [];
  if (cache.has(gitDir)) return cache.get(gitDir);
  const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
  try {
    const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    if (common) files.push(path.join(path.resolve(gitDir, common), "config"));
  } catch {
    // not a worktree
  }
  const risky = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of parseGitConfig(text)) {
      if (!RISKY_KEY.test(key)) continue;
      if (LFS_FILTER.test(key) && LFS_VALUE.test(value)) continue;
      if (key === "core.fsmonitor" && /^(false|0|no|off|)$/i.test(value)) continue;
      risky.push(`${key} = ${value}`);
    }
  }
  cache.set(gitDir, risky);
  return risky;
}

/**
 * Absolute path of a bare command name found on the PATH, relative folders, the current folder and `exclude`
 * EXCLUDED (on Windows, the system
 * otherwise runs a `git.exe` placed in the folder read before the real one). null when not found.
 */
export function resolveOnPath(bin, { env = process.env, platform = process.platform, exclude = [] } = {}) {
  if (platform === "win32" && /\.(com|exe)$/i.test(bin)) bin = bin.slice(0, -4);
  if (bin.includes("/") || bin.includes("\\")) return bin;
  const sep = platform === "win32" ? ";" : ":";
  // Windows: .com and .exe only, as the system's own lookup for a process started without a shell (a .cmd file
  // cannot be started that way).
  const exts = platform === "win32" ? [".com", ".exe"] : [""];
  const excluded = new Set([path.resolve("."), ...exclude.map((d) => path.resolve(d))]);
  for (const folder of String(env.PATH || env.Path || "").split(sep)) {
    if (!folder || !path.isAbsolute(folder) || excluded.has(path.resolve(folder))) continue;
    for (const ext of exts) {
      const file = path.join(folder, bin + ext);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // next
      }
    }
  }
  return null;
}
