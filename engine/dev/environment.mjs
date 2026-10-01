// Author-experience helpers shared by `doctor`, `dev`, `init` and the guided mode: what the environment and the
// project look like (Node, kit dependencies, Chromium, project dependencies, session, captures, git).
// Nothing here writes; nothing here throws for an expected situation (each helper returns a status).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { KIT_ROOT, CONFIG_FILE } from "../project/find.mjs";
import { prepareConfig } from "../project/load.mjs";
import { readEnv } from "../project/env.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { BRAND } from "../brand.mjs";

/** A folder for a message: relative to the current folder when shorter, quoted when it contains spaces. */
export function shownFolder(folder) {
  const rel = path.relative(process.cwd(), folder);
  const shown = !rel ? "." : !path.isAbsolute(rel) && rel.length < folder.length ? rel : folder;
  return /\s/.test(shown) ? `"${shown}"` : shown;
}

/** The kit's package.json. */
export function kitPackage(root = KIT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
}

/** Forward slashes (paths written into files or shown in commands that work everywhere). */
export const slash = (p) => String(p).split(path.sep).join("/");

/**
 * Installed version of a package as Node would resolve it from `from` (node_modules of the folder and of its
 * parents), or null.
 */
export function installedVersion(name, from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const f = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(f)) {
      try {
        return { version: JSON.parse(fs.readFileSync(f, "utf8")).version, folder: path.dirname(f) };
      } catch {
        return { version: null, folder: path.dirname(f) };
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** Runtime dependencies of the kit: [{ name, wanted, found }]. */
export function kitDependencies(root = KIT_ROOT) {
  const deps = kitPackage(root).dependencies || {};
  return Object.entries(deps).map(([name, wanted]) => ({ name, wanted, found: installedVersion(name, root)?.version ?? null }));
}

/** Exact command that installs the Chromium of the kit's Playwright version. */
export function chromiumInstallCommand(root = KIT_ROOT) {
  const pw = installedVersion("playwright", root);
  const cli = pw && path.join(pw.folder, "cli.js");
  return cli && fs.existsSync(cli) ? `node "${slash(cli)}" install chromium` : "npx playwright install chromium";
}

/** Chromium for Playwright: { ok, path?, command } (no browser is started). */
export async function chromiumStatus(root = KIT_ROOT) {
  const command = chromiumInstallCommand(root);
  try {
    const { chromium } = await import("playwright");
    const executable = chromium.executablePath();
    return { ok: !!executable && fs.existsSync(executable), path: executable, command };
  } catch {
    return { ok: false, path: null, command };
  }
}

/**
 * The kit package as the project resolves it (`import "doc-kit/config"` in doc.config.mjs):
 * { ok, folder, sameKit } — ok false when `npm install` was not run in the project.
 */
export function projectDependency(root) {
  try {
    const require = createRequire(path.join(root, "package.json"));
    const file = require.resolve(`${BRAND.packageName}/package.json`);
    const folder = fs.realpathSync(path.dirname(file));
    return { ok: true, folder, sameKit: folder === fs.realpathSync(KIT_ROOT) };
  } catch {
    return { ok: false, folder: null, sameKit: false };
  }
}

/** Is an import error caused by the missing kit package (npm install not run in the project)? */
export function isMissingKitPackage(error) {
  const e = error?.cause || error;
  return e?.code === "ERR_MODULE_NOT_FOUND" && new RegExp(`['"]${BRAND.packageName}(/[^'"]*)?['"]`).test(String(e.message));
}

/**
 * Imports doc.config.mjs again (fresh copy, for `dev` and `upgrade`) and returns the raw default export.
 * @throws {KitError} config.import (exit code 2), project.depsMissing (exit code 3)
 */
export async function importConfig(configFile) {
  try {
    const url = pathToFileURL(configFile).href + `?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return (await import(url)).default;
  } catch (e) {
    if (isMissingKitPackage(e)) throw new KitError(EXIT.ENVIRONMENT, "project.depsMissing", { folder: shownFolder(path.dirname(configFile)) }, { cause: e });
    throw new KitError(EXIT.USAGE, "config.import", { file: configFile, error: e.message }, { cause: e });
  }
}

/** Loads and validates the configuration again (fresh import), like loadProject. */
export async function reloadConfig(root, env = process.env) {
  const configFile = path.join(root, CONFIG_FILE);
  const raw = await importConfig(configFile);
  return prepareConfig(raw, { file: CONFIG_FILE, env });
}

/**
 * Wraps ctx.loadProject: the "package not found" import error becomes project.depsMissing (exit code 3) with
 * the command that fixes it (npm install), instead of a misleading "syntax" hint.
 */
export async function loadProjectFriendly(ctx) {
  try {
    return await ctx.loadProject();
  } catch (e) {
    if (e instanceof KitError && e.key === "config.import" && isMissingKitPackage(e)) {
      throw new KitError(EXIT.ENVIRONMENT, "project.depsMissing", { folder: shownFolder(path.dirname(path.resolve(e.vars.file))) }, { cause: e.cause });
    }
    throw e;
  }
}

/** Default session file, relative to the project (`doc-kit connect` writes it; git-ignored). */
export const DEFAULT_SESSION = ".doc-kit/session.json";

/**
 * Session of the project: DOC_KIT_SESSION or <PREFIX>_SESSION, otherwise .doc-kit/session.json.
 * @returns {{ needed: boolean, file: string, exists: boolean, ageHours?: number, expired?: boolean }}
 */
export function sessionInfo({ root, config, env = process.env, now = Date.now() }) {
  const needed = config.auth?.adapter !== "none";
  const fromEnv = readEnv("SESSION", config.env?.prefix, env);
  const file = path.resolve(root, fromEnv ? fromEnv.value : DEFAULT_SESSION);
  if (!fs.existsSync(file)) return { needed, file, exists: false };
  const ageHours = (now - fs.statSync(file).mtimeMs) / 3600000;
  // A Playwright storageState: expired when every cookie with an expiry date is past.
  let expired = false;
  try {
    const cookies = (JSON.parse(fs.readFileSync(file, "utf8")).cookies || []).filter((c) => typeof c.expires === "number" && c.expires > 0);
    expired = cookies.length > 0 && cookies.every((c) => c.expires * 1000 < now);
  } catch {
    // not JSON: nothing more to say
  }
  return { needed, file, exists: true, ageHours, expired };
}

/** Number of screenshots of the project (zone files). */
export function captureCount(root, config) {
  const dir = path.join(root, config.paths.images, "zones");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;
}

/**
 * Runs a read-only git command in `cwd`. Returns null when git is missing or the folder is not in a repository;
 * otherwise { status, stdout }.
 */
export function git(cwd, args) {
  const inside = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", windowsHide: true });
  if (inside.error || inside.status !== 0 || inside.stdout.trim() !== "true") return null;
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  if (r.error) return null;
  return { status: r.status, stdout: (r.stdout || "").trim() };
}

/**
 * Is `rel` (relative to root) ignored? With git: `git check-ignore` (every .gitignore of the repository counts);
 * otherwise the project's own .gitignore, read naively (a line equal to the folder, with or without slashes).
 * @returns {boolean|null} null: nothing to decide from (no git repository and no .gitignore)
 */
export function isIgnored(root, rel) {
  const g = git(root, ["check-ignore", "-q", "--no-index", rel]);
  if (g) return g.status === 0;
  const name = rel.replace(/\/.*$/, "");
  const lines = (file) =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
      : null;
  // The folder's own .gitignore that ignores everything (`connect` writes one in .doc-kit/).
  if (name !== rel && (lines(path.join(root, name, ".gitignore")) || []).includes("*")) return true;
  const own = lines(path.join(root, ".gitignore"));
  if (!own) return null;
  return own.some((l) => l.replace(/^\/|\/$/g, "").replace(/\/\*\*?$/, "") === name);
}

/** Is a file tracked by git? null when git cannot tell. */
export function isTracked(root, file) {
  const g = git(root, ["ls-files", "--error-unmatch", "--", path.relative(root, file)]);
  return g ? g.status === 0 : null;
}

/** Opens a URL in the default browser of the machine (DOC_KIT_NO_OPEN=1: does nothing). */
export async function openBrowser(url, env = process.env) {
  if (env.DOC_KIT_NO_OPEN) return false;
  const { spawn } = await import("node:child_process");
  const [cmd, args] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    return true;
  } catch {
    return false;
  }
}
