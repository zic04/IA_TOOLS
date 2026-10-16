// The shared repositories of the sources (ARCHITECTURE.md §6.19, `doc-kit inputs fetch`): each `code[]` entry with
// a `repo` is cloned into .doc-kit/inputs/repos/<name>, then brought up to date by later fetches. git runs with the
// user's own credentials (credential manager, SSH key): the kit never sees, asks for or stores a token, and a URL
// carrying one is refused (model.mjs). The only git commands of the kit that write (RULES.md S2), hardened:
//   - every clone is configured, from its creation (`clone --config`), so that its own fetches and checkouts never
//     run a hook (core.hooksPath to an empty folder of the kit), check out a link as a link (core.symlinks=false:
//     nothing outside the clone is ever read through one), use a transport that runs a command (protocol.ext) or a
//     local path (protocol.file), recurse into submodules, or accept a malformed object (transfer.fsckObjects);
//   - no prompt (GIT_TERMINAL_PROMPT=0: a missing credential fails instead of waiting) and no Git LFS download;
//   - the address and the branch are checked (isSafeRepoUrl, isSafeRef) and placed after --end-of-options;
//   - git itself goes through the context's `exec` (engine/util/safe-git.mjs: the binary from the PATH, a risky
//     repository configuration refused, no pager, no fsmonitor).
import fs from "node:fs";
import path from "node:path";
import { isSafeRef, parseGitConfig, riskyGitConfig } from "../util/safe-git.mjs";
import { isSafeRepoUrl, hasCredentials, repoFolder, INPUTS_DIR, NAME } from "./model.mjs";

/** A clone or an update waits at most this long (a large repository over a slow link). */
const GIT_TIMEOUT_MS = 10 * 60 * 1000;

/** The settings of every git command on a clone: written into it at its creation, given again to each update. */
function settings(hooksDir) {
  return [
    `core.hooksPath=${hooksDir}`,
    "core.symlinks=false",
    "core.fsmonitor=false",
    "protocol.ext.allow=never",
    "protocol.file.allow=never",
    "submodule.recurse=false",
    "transfer.fsckObjects=true",
  ];
}
/** The settings written into every clone (`git clone --config`): its later fetches and checkouts keep them. */
const hardening = (hooksDir) => settings(hooksDir).flatMap((setting) => ["--config", setting]);

/**
 * The arguments of the clone of one repository.
 * @param {{ repo: string, branch?: string, depth?: number }} entry
 * @param {string} dir        the folder of the clone (absolute)
 * @param {string} hooksDir   an empty folder (absolute): the only hooks folder the clone knows
 */
export function cloneArgs(entry, dir, hooksDir) {
  return [
    "clone",
    "--quiet",
    "--no-recurse-submodules",
    ...hardening(hooksDir),
    ...(entry.branch ? ["--branch", entry.branch, "--single-branch"] : []),
    ...(entry.depth ? ["--depth", String(entry.depth)] : []),
    "--end-of-options",
    entry.repo,
    dir,
  ];
}

/**
 * The arguments of the update of a clone: fetch, then check out what was fetched (the clone is the kit's). The
 * settings are given again before each command (`git -c`): a clone whose own configuration was changed since
 * still runs no hook and no transport helper.
 */
export function updateArgs(entry, hooksDir) {
  const top = settings(hooksDir).flatMap((setting) => ["-c", setting]);
  return [
    [...top, "fetch", "--quiet", "--prune", "--no-recurse-submodules", "--end-of-options", "origin"],
    [
      ...top,
      "checkout",
      "--quiet",
      "--force",
      "--detach",
      "--end-of-options",
      entry.branch ? `origin/${entry.branch}` : "origin/HEAD",
    ],
  ];
}

/** The address a clone was made from (its .git/config), or null when the folder is not a clone. */
export function cloneOrigin(dir) {
  try {
    const config = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");
    return parseGitConfig(config).find(([k]) => k === 'remote "origin".url' || k === "remote.origin.url")?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The first line of git's error output, short, without control characters (a remote server writes part of it: no
 * terminal sequence of its own reaches the screen; an address without credentials may appear there: no secret).
 */
const firstLine = (text) =>
  [...firstLineOf(text)]
    .map((c) => (c.charCodeAt(0) < 0x20 || (c.charCodeAt(0) >= 0x7f && c.charCodeAt(0) < 0xa0) ? " " : c))
    .join("");
const firstLineOf = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .find((l) => l.trim())
    ?.trim()
    .slice(0, 300) || "";

/**
 * Clones or updates the shared repositories of the sources.
 * @param {object} p
 * @param {string} p.root   the documentation project
 * @param {object} p.inputs   readInputs().inputs
 * @param {string[]} [p.names]   only these entries (default: every entry with a `repo`)
 * @param {Function} p.exec   ctx.exec: (bin, args, options) => { status, stdout, stderr, refused? } | null
 * @param {(dir: string) => string|null} p.commit   ctx.commit
 * @param {object} p.env   ctx.env (its PATH and the user's git settings)
 * @returns {Array<{ name: string, action: "clone"|"update", ok: boolean, folder: string, commit: string|null,
 *   error?: { key: string, vars: object } }>}
 */
export function fetchRepos({ root, inputs, names, exec, commit, env }) {
  const entries = (inputs.code || []).filter((c) => c.repo && (!names?.length || names.includes(c.name)));
  const hooksDir = path.resolve(root, INPUTS_DIR, "no-hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const options = {
    timeout: GIT_TIMEOUT_MS,
    env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" },
  };
  return entries.map((entry) => {
    const folder = repoFolder(entry.name);
    const dir = path.resolve(root, folder);
    const result = (action, error) => ({
      name: entry.name,
      action,
      ok: !error,
      folder,
      commit: error ? null : commit(dir),
      ...(error ? { error } : {}),
    });
    // Checked again here: an entry is never given to git unchecked, whoever wrote inputs.json; the name is also a
    // folder, removed below when it is not a clone of that address: it must be one of repos/, never a path.
    const reposRoot = path.resolve(root, INPUTS_DIR, "repos");
    const inside = path.relative(reposRoot, dir);
    if (typeof entry.name !== "string" || !NAME.test(entry.name) || inside !== entry.name)
      return result("clone", { key: "inputs.name", vars: { name: String(entry.name) } });
    if (hasCredentials(entry.repo)) return result("clone", { key: "inputs.credentials", vars: { where: entry.name } });
    if (!isSafeRepoUrl(entry.repo)) return result("clone", { key: "inputs.repoUrl", vars: { name: entry.name } });
    if (entry.branch !== undefined && !isSafeRef(entry.branch))
      return result("clone", { key: "inputs.branch", vars: { name: entry.name, branch: entry.branch } });
    // A folder that is not a clone of this address (moved repository, something else): fetched again from scratch.
    if (fs.existsSync(dir) && cloneOrigin(dir) !== entry.repo) fs.rmSync(dir, { recursive: true, force: true });
    const run = (args, cwd) => {
      const r = exec("git", args, { ...options, cwd });
      if (r === null) return { key: "inputs.noGit", vars: {} };
      if (r.refused) return { key: "inputs.gitConfig", vars: { name: entry.name, keys: r.refused.join(", "), folder } };
      if (r.status !== 0)
        return { key: "inputs.git", vars: { name: entry.name, code: r.status, error: firstLine(r.stderr) } };
      return null;
    };
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      return result("clone", run(cloneArgs(entry, dir, hooksDir), path.dirname(dir)));
    }
    // The clone's own configuration may have changed since: a key that runs a program refuses the update.
    const risky = riskyGitConfig(dir, { fetch: true });
    if (risky.length)
      return result("update", { key: "inputs.gitConfig", vars: { name: entry.name, keys: risky.join(", "), folder } });
    for (const args of updateArgs(entry, hooksDir)) {
      const error = run(args, dir);
      if (error) return result("update", error);
    }
    return result("update", null);
  });
}
