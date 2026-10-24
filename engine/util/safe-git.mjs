// Safe use of git and of external tools on a folder that is not trusted (ARCHITECTURE.md §6.10, SECURITY.md
// "The application folder is not trusted"). An application handed over for a takeover comes with its own
// .git/config: a read-only command such as `git diff` or `git ls-files` can still run a program named there
// (core.fsmonitor, diff.external, a textconv driver, a clean filter, a pager). Every git command of the kit goes
// through `safeGitArgs` and is refused when `riskyGitConfig` finds such a key. `spawnHardened` is the one launcher
// of git and of the external tools: the binary from a trusted folder of the PATH (never the application's, the
// documentation project's or a node_modules/.bin), and, for git, a cleaned environment (`gitEnv`).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * A process launcher with the contract of the CLI context's `ctx.exec` (cli/common.mjs `defaultExec`, that is
 * `spawnHardened`): null when the binary is not on the PATH; status 128 and `refused` (the risky keys) when the
 * repository's configuration names a program. The engine's git helpers take one, so that a command goes through its
 * context and a test gives a fake.
 * @typedef {(bin: string, args: string[], options?: { cwd?: string }) =>
 *   { status: number|null, stdout: string, stderr?: string, refused?: string[] } | null} Exec
 */

/**
 * Options put before every git command: no file system monitor, no pager; and no git started in a submodule (whose own
 * configuration riskyGitConfig does not read): a diff never looks inside a submodule's working tree for changes
 * (diff.ignoreSubmodules=dirty) nor shows its inner diff (diff.submodule=short), nothing recurses into one. These
 * reach every git that git itself starts.
 */
const GIT_HARDENING = Object.freeze([
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.pager=cat",
  "-c",
  "diff.ignoreSubmodules=dirty",
  "-c",
  "diff.submodule=short",
  "-c",
  "submodule.recurse=false",
  "--no-pager",
]);

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
 * --no-pager): the file system monitor, an external diff, a diff or filter driver, an include, the program that
 * checks a signature (`git log` and `git show` check them with log.showSignature), and what Git LFS runs or writes
 * to when its filters run (an extension, a custom transfer agent, its storage). The values Git LFS writes for its
 * own filters are allowed (LFS_VALUES). `s`: a subsection may hold any character, a line separator (U+2028, U+2029)
 * included, as git reads it; `i`: Git LFS reads its keys in any case.
 */
const RISKY_KEY =
  /^(core\.fsmonitor|diff\.external|diff\..+\.(textconv|command)|filter\..+\.(clean|smudge|process)|include\.path|includeif\..+\.path|gpg\.program|gpg\..+\.program|lfs\.extension\..+\.(clean|smudge)|lfs\.customtransfer\..+\.path|lfs\.storage)$/is;
/** Keys a fetch may also run (a transport, a proxy, a prompt, a credential helper): refused for the clones of the sources. */
const FETCH_KEY =
  /^(core\.sshcommand|core\.gitproxy|core\.askpass|core\.alternaterefscommand|core\.worktree|credential\.helper|credential\..+\.helper)$/s;
/**
 * The values Git LFS writes (`git lfs install`, with `--skip-smudge` or not), each for its own key, matched over the
 * whole value: nothing before (a command, a path to another program), nothing after (`;`, `&&`, `|`, a backtick,
 * `$(`, a newline, one more word). They start `git-lfs` from the PATH, which the kit gives git without the
 * application's folders (gitEnv).
 */
const LFS_VALUES = new Map([
  ["filter.lfs.clean", /^git-lfs clean -- %f$/],
  ["filter.lfs.smudge", /^git-lfs smudge(?: --skip)? -- %f$/],
  ["filter.lfs.process", /^git-lfs filter-process(?: --skip)?$/],
]);

/** Whether `value` is one Git LFS writes for `key` (the `filter.lfs.*` keys), as the whole value. */
export const isLfsValue = (key, value) => LFS_VALUES.get(key)?.test(value) ?? false;

/** `s` without the spaces and tabs at its ends: git trims a value of these only, never of another blank. */
function trimBlanks(s) {
  let start = 0;
  let end = s.length;
  while (start < end && (s[start] === " " || s[start] === "\t")) start++;
  while (end > start && (s[end - 1] === " " || s[end - 1] === "\t")) end--;
  return s.slice(start, end);
}

/**
 * Pairs [key, value] of a git configuration file (simple INI reading: sections, subsections, key = value). `s`: a
 * value or a subsection holding a line separator (U+2028, U+2029) is read whole, as git reads it; a value keeps any
 * blank but spaces and tabs at its ends, as git keeps it.
 */
export function parseGitConfig(text) {
  const out = [];
  let section = "";
  // A carriage return is a space, as git reads it; a key may follow its section header on the same line
  // (`[core] sshCommand = …`), as git also reads it.
  for (const raw of String(text).split("\n")) {
    let line = raw.split("\r").join(" ").replace(/^\s+/, "");
    for (;;) {
      if (!line || line[0] === "#" || line[0] === ";") break;
      const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/s.exec(line);
      if (head) {
        section = head[1].toLowerCase() + (head[2] !== undefined ? `.${head[2]}` : "");
        line = line.slice(head[0].length).replace(/^\s+/, "");
        continue;
      }
      const kv = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*(?:=[ \t]*(.*))?$/s.exec(line);
      if (kv && section)
        out.push([`${section}.${kv[1].toLowerCase()}`, trimBlanks(kv[2] ?? "true").replace(/^"(.*)"$/, "$1")]);
      break;
    }
  }
  return out;
}

/** `s` without the line ends (CR, LF) at its end: all git takes off a `.git` file's path and a `commondir`. */
function withoutLineEnds(s) {
  let end = s.length;
  while (end && (s[end - 1] === "\n" || s[end - 1] === "\r")) end--;
  return s.slice(0, end);
}

/** A file's text, or null. */
function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Whether `p` exists and may be searched (git's own test of a git folder's objects and refs: access X_OK). */
function searchable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The common git folder of `gitDir`: the one its `commondir` names (a worktree), read as git reads it; else itself. */
function commonDirOf(gitDir) {
  const common = withoutLineEnds(readText(path.join(gitDir, "commondir")) ?? "");
  return common ? path.resolve(gitDir, common) : gitDir;
}

/**
 * Whether git surely takes `dir` for a git folder — its own test passes whenever this one does: a HEAD that is a file
 * (not a link) naming a branch or a commit, and the objects and refs of its common folder.
 */
function surelyGitDir(dir) {
  let head = null;
  try {
    if (fs.lstatSync(path.join(dir, "HEAD")).isFile()) head = readText(path.join(dir, "HEAD"));
  } catch {
    // no HEAD
  }
  const common = commonDirOf(dir);
  return (
    head !== null &&
    /^(?:ref: refs\/|[0-9a-f]{40}(?:[0-9a-f]{24})?\r?\n?$)/.test(head) &&
    searchable(path.join(common, "objects")) &&
    searchable(path.join(common, "refs"))
  );
}

/**
 * Every git folder git may use for `dir`, walking up as git does: at each level a `.git` folder, the folder a `.git`
 * file names (as git reads it: "gitdir: " first, then the path, only its line ends taken off) and the level itself
 * when it holds a HEAD (a bare repository). git skips a `.git` that is not a git folder and looks above it: the walk
 * stops only at the first that git surely uses, so the kit reads every configuration git could.
 * @param {string} dir
 * @returns {string[]}
 */
function gitDirsOf(dir) {
  const out = [];
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    const dotGit = path.join(d, ".git");
    let st = null;
    try {
      st = fs.statSync(dotGit);
    } catch {
      // no .git here
    }
    if (st?.isFile()) {
      const text = readText(dotGit) ?? "";
      if (text.startsWith("gitdir: ")) {
        const target = path.resolve(d, withoutLineEnds(text.slice("gitdir: ".length)));
        out.push(target);
        if (surelyGitDir(target)) return out;
      }
    } else if (st?.isDirectory()) {
      out.push(dotGit);
      if (surelyGitDir(dotGit)) return out;
    }
    if (fs.existsSync(path.join(d, "HEAD"))) {
      out.push(d);
      if (surelyGitDir(d)) return out;
    }
    if (path.dirname(d) === d) return out;
  }
}

const cache = new Map();

/**
 * Risky keys of the repository configuration of `dir` (of every git folder git may use there, gitDirsOf: its config,
 * config.worktree and, for a worktree, the common config), as "key = value" lines; [] when there is none or no
 * repository. Memorised per list of git folders. `fetch`: also the keys a fetch may run (FETCH_KEY), for a clone of
 * the sources about to be updated (never memorised: the kit checks it before each update).
 * @param {string} dir
 * @param {{ fetch?: boolean }} [o]
 */
export function riskyGitConfig(dir, { fetch = false } = {}) {
  const gitDirs = gitDirsOf(dir);
  if (!gitDirs.length) return [];
  const known = gitDirs.join("\n");
  if (!fetch && cache.has(known)) return cache.get(known);
  const files = gitDirs.flatMap((gitDir) => {
    const common = commonDirOf(gitDir);
    return [
      path.join(gitDir, "config"),
      path.join(gitDir, "config.worktree"),
      ...(common !== gitDir ? [path.join(common, "config")] : []),
    ];
  });
  const risky = [];
  // A worktree's common folder may also be met above it: each file read once.
  for (const file of new Set(files)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of parseGitConfig(text)) {
      if (!RISKY_KEY.test(key) && !(fetch && FETCH_KEY.test(key))) continue;
      if (isLfsValue(key, value)) continue;
      if (key === "core.fsmonitor" && /^(false|0|no|off|)$/i.test(value)) continue;
      risky.push(`${key} = ${value}`);
    }
  }
  if (!fetch) cache.set(known, risky);
  return risky;
}

/** Whether the folder `dir` is `root` or inside it (by their paths: links are not followed). */
export function isWithin(dir, root) {
  const rel = path.relative(path.resolve(root), path.resolve(dir));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * The folders of the PATH a program may be started from (resolveOnPath, and the PATH the kit gives a program it
 * starts): absolute; never a `node_modules/.bin` (npm puts the application's own there, and its ancestors', when the
 * kit runs as an npm script of a documentation project inside it); never the current folder, nor one of `exclude`
 * (the folders read: the application, the documentation project) or a folder inside one.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ platform?: string, exclude?: string[] }} [o]
 */
function trustedFolders(env, { platform = process.platform, exclude = [] } = {}) {
  const win = platform === "win32";
  const fold = (name) => (win ? name.toLowerCase() : name);
  const here = path.resolve(".");
  return (
    String(env.PATH || env.Path || "")
      .split(win ? ";" : ":")
      // Windows reads a folder of the PATH written between quotes as the folder itself.
      .map((folder) => (win ? folder.replace(/^"(.*)"$/, "$1") : folder))
      .filter((folder) => {
        if (!folder || !path.isAbsolute(folder)) return false;
        const abs = path.resolve(folder);
        if (fold(path.basename(abs)) === ".bin" && fold(path.basename(path.dirname(abs))) === "node_modules")
          return false;
        return path.relative(here, abs) !== "" && !exclude.some((root) => isWithin(abs, root));
      })
  );
}

/**
 * `env` with one PATH variable, whatever its case was, reduced to the trusted folders (trustedFolders).
 * @param {NodeJS.ProcessEnv} env
 * @param {{ platform?: string, exclude?: string[] }} [o]
 * @returns {NodeJS.ProcessEnv}
 */
function withTrustedPath(env, { platform = process.platform, exclude = [] } = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const out = {};
  for (const [name, value] of Object.entries(env)) if (name.toUpperCase() !== "PATH") out[name] = value;
  out.PATH = trustedFolders(env, { platform, exclude }).join(platform === "win32" ? ";" : ":");
  return out;
}

/**
 * The variables of git's own (GIT_*) that git is still given: how `inputs fetch` connects with the person's own
 * credentials (their SSH command, their askpass helper), and what the kit sets itself.
 */
const GIT_ENV_KEPT = new Set([
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_SSH_VARIANT",
  "GIT_ASKPASS",
  // Certificate authorities (files, not programs): a company's TLS proxy.
  "GIT_SSL_CAINFO",
  "GIT_SSL_CAPATH",
  "GIT_LFS_SKIP_SMUDGE",
]);

/**
 * The environment git runs with: `env` without its GIT_* variables but GIT_ENV_KEPT, in any case — they may move the
 * repository read (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES,
 * GIT_COMMON_DIR), add to the configuration read (GIT_CONFIG_COUNT with GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n,
 * GIT_CONFIG_PARAMETERS) or replace it (GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM), name a program git starts
 * (GIT_EXEC_PATH, GIT_EXTERNAL_DIFF, GIT_PAGER, GIT_PROXY_COMMAND) or allow one (GIT_ALLOW_PROTOCOL), or have git
 * write a file (GIT_TRACE…) —; its PATH reduced to the trusted folders (a filter or a helper git starts, `git-lfs`
 * included, is looked up there); never a prompt (GIT_TERMINAL_PROMPT=0); never a fetch of the objects a partial clone
 * lacks (GIT_NO_LAZY_FETCH=1: it would start the transport its configuration names). HOME, USERPROFILE,
 * XDG_CONFIG_HOME and the rest stay: the person's global configuration, their credential helper, still applies.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ platform?: string, exclude?: string[] }} [o]   the folders read (trustedFolders)
 */
export function gitEnv(env = process.env, o = {}) {
  const out = withTrustedPath(env, o);
  for (const name of Object.keys(out))
    if (/^GIT_/i.test(name) && !GIT_ENV_KEPT.has(name.toUpperCase())) delete out[name];
  out.GIT_TERMINAL_PROMPT = "0";
  out.GIT_NO_LAZY_FETCH = "1";
  return out;
}

/**
 * Starts a program on a folder that is not trusted, synchronously, never through a shell: the one launcher of git and
 * of the external tools (`defaultExec` of the CLI context is this; the engine's git helpers start it when they are
 * given no `exec`). The binary comes from a trusted folder of the PATH (trustedFolders: never `cwd`, one of `exclude`
 * or inside them, nor a node_modules/.bin). Any program is refused, with status 128 and `refused` and without starting
 * anything, when the configuration of the repository of `cwd` names a program (riskyGitConfig): git would run it, and
 * a tool may start git there itself (semgrep lists the files with `git ls-files`). The program gets the cleaned
 * environment (gitEnv: that PATH, no GIT_* variable that moves the repository or its configuration, for any git it
 * starts too); git also gets the hardened arguments (safeGitArgs).
 * @param {string} bin
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, exclude?: string[], spawn?: typeof spawnSync,
 *   [option: string]: any }} [options]   exclude: the folders read besides `cwd` (the application, the documentation
 *   project); spawn: the test seam (default: spawnSync); the other options go to it
 * @returns {{ status: number|null, stdout: string, stderr: string, refused?: string[] } | null}   null: not on the PATH
 */
export function spawnHardened(bin, args, { cwd, env = process.env, exclude = [], spawn = spawnSync, ...options } = {}) {
  const dir = cwd || process.cwd();
  const untrusted = { exclude: [dir, ...exclude] };
  const risky = riskyGitConfig(dir);
  if (risky.length) return { status: 128, stdout: "", stderr: "", refused: risky };
  // git by any name the system starts it under: git.exe, a path to it.
  const isGit = /^git(?:\.com|\.exe)?$/i.test(path.basename(bin));
  const file = resolveOnPath(bin, { env, ...untrusted });
  if (!file) return null;
  const r = spawn(file, isGit ? safeGitArgs(args) : args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
    cwd: dir,
    env: gitEnv(env, untrusted),
    shell: false,
  });
  return /** @type {NodeJS.ErrnoException|undefined} */ (r.error)?.code === "ENOENT"
    ? null
    : { status: r.status, stdout: String(r.stdout || ""), stderr: String(r.stderr || "") };
}

/**
 * Absolute path of a bare command name found in a trusted folder of the PATH (trustedFolders: relative folders, the
 * current folder, a node_modules/.bin, and `exclude` with the folders inside them EXCLUDED — on Windows, the system
 * otherwise runs a `git.exe` placed in the folder read before the real one). null when not found.
 * @param {string} bin
 * @param {{ env?: NodeJS.ProcessEnv, platform?: string, exclude?: string[] }} [o]
 */
export function resolveOnPath(bin, { env = process.env, platform = process.platform, exclude = [] } = {}) {
  if (platform === "win32" && /\.(com|exe)$/i.test(bin)) bin = bin.slice(0, -4);
  if (bin.includes("/") || bin.includes("\\")) return bin;
  // Windows: .com and .exe only, as the system's own lookup for a process started without a shell (a .cmd file
  // cannot be started that way).
  const exts = platform === "win32" ? [".com", ".exe"] : [""];
  for (const folder of trustedFolders(env, { platform, exclude })) {
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
