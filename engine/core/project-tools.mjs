// The tools of the application (ARCHITECTURE.md §5, SECURITY.md): what the coverage adapters, sync, context and the
// kit's commands are given to read the documentation project and its application — every path relative to the
// project, one in the application (`app.dir`, untrusted) reached through its folders only, never a link or a
// junction (pathJudge, engine/core/confine.mjs) —, the one rule for a write of the kit into the application
// (assertWritable), and the documented version read by it (projectVersion). In engine/core: check, capture, sync and
// build all read with them.
import fs from "node:fs";
import path from "node:path";
import { globRegex } from "./glob.mjs";
import { pathJudge } from "./confine.mjs";
import { readProjectVersion } from "../project/version.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

const SKIP = new Set(["node_modules", ".git"]);

/**
 * @typedef {import("./confine.mjs").JudgeIo & { existsSync: (p: string) => boolean,
 *   readFileSync: (p: string, encoding: "utf8") => string,
 *   readdirSync: (p: string, o: { withFileTypes: true }) => Array<{ name: string, isDirectory(): boolean,
 *   isFile(): boolean }> }} ToolsIo   what the tools ask of the file system
 */

/**
 * Tools given to the adapters; every path is relative to the project root (the documentation folder).
 *   resolve(p) · exists(p) · read(p) · json(p) · walk(dir) → relative file paths (forward slashes) ·
 *   glob(pattern, base = ".") → files of `base` matching the pattern · i18nKey(object, "a.b.c") → value
 * A walk never goes into a link or a junction. With `appDir` (the application's folder, absolute: untrusted,
 * SECURITY.md), a path that lies in it (entryInto: as written in any case, or through a folder whose real path is
 * the application's) is reached through its folders only, never a link or a junction, and is no link itself
 * (linkFree), checked before anything is asked of it: a walk starts there, a file is read or said to exist only so
 * — a junction in the application to a folder outside lists nothing, reads nothing, does not exist. Elsewhere (the
 * documentation project when it is not in the application, a folder the configuration names beside it), a path is
 * taken as written. The tools keep one judge for their life (pathJudge): no path of the application is asked of the
 * system twice, and a file or a folder their own walk listed (it went into folders only) is never judged again — an
 * adapter walks its folder then reads each file the walk listed. `io` is the file system (a test gives its own).
 * @param {string} root
 * @param {{ appDir?: string|null, io?: ToolsIo }} [o]
 */
export function adapterTools(root, { appDir = null, io = fs } = {}) {
  const P = io.path ?? path;
  const resolve = (p) => P.resolve(root, p);
  const judge = pathJudge(io);
  /** What a walk entered or listed, by absolute path: reached by the rule already, never judged again. */
  const walked = new Map();
  /** Whether `abs` is reached as the rule above says (`folder`: as a folder). */
  const reached = (abs, folder) => {
    const seen = walked.get(abs);
    if (seen === "dir" || (seen === "file" && !folder)) return true;
    const entry = appDir ? judge.entryInto(appDir, abs) : null;
    return !entry || judge.linkFree(entry.top, entry.names, { folder });
  };
  const read = (p) => {
    if (!reached(resolve(p), false))
      throw Object.assign(new Error(`ENOENT: ${p} is reached through a link in the application`), { code: "ENOENT" });
    return io.readFileSync(resolve(p), "utf8");
  };
  const walk = (dir) => {
    const base = resolve(dir);
    if (!reached(base, true) || !io.existsSync(base)) return [];
    const out = [];
    const visit = (d, rel) => {
      walked.set(d, "dir");
      for (const e of io.readdirSync(d, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) visit(P.join(d, e.name), r);
        else if (e.isFile()) {
          out.push(r);
          walked.set(P.join(d, e.name), "file");
        }
      }
    };
    visit(base, "");
    return out.sort();
  };
  return {
    resolve,
    exists: (p) => reached(resolve(p), false) && io.existsSync(resolve(p)),
    read,
    json: (p) => JSON.parse(read(p)),
    walk,
    glob: (pattern, base = ".") => {
      const re = globRegex(pattern.replace(/^\.\//, ""));
      return walk(base).filter((f) => re.test(f));
    },
    i18nKey: (object, key) => {
      if (object && Object.prototype.hasOwnProperty.call(object, key)) return object[key];
      return String(key)
        .split(".")
        .reduce((o, k) => (o == null || typeof o !== "object" ? undefined : o[k]), object);
    },
  };
}

/** The application's folder of a project (`app.dir`), absolute, or null. */
const appDirOf = (root, config) => (config.app?.dir ? path.resolve(root, config.app.dir) : null);

/**
 * The tools of a documentation project — its coverage adapters', sync's, context's, the commands' that read its
 * version: adapterTools of its root, every path in its application (`app.dir`) reached without a link.
 * @param {string} root
 * @param {{ app?: { dir?: string|null } }} config
 */
export const projectTools = (root, config) => adapterTools(root, { appDir: appDirOf(root, config) });

/**
 * The documented version of a project (`config.version`, readProjectVersion), its file read with the project's tools:
 * in the application, only where it is reached through its folders (behind a link or a junction of it: the fallback).
 * The one reader of every command (build, audit, capture, check, changes, export, sync, context, the CLI's own).
 * @param {string} root
 * @param {{ app?: { dir?: string|null }, version: { file?: string|null, pattern?: string, fallback?: string } }} config
 */
export const projectVersion = (root, config) => readProjectVersion(config.version, projectTools(root, config));

/**
 * The one rule for a write of the kit into the application (SECURITY.md): `abs` — a file, a folder with `folder` —
 * that lies in one of the folders `dirs` is written only where it is reached through its folders, none of them nor
 * itself a link or a junction, nor a file with other names (pathJudge's `writable`); otherwise KitError
 * `write.throughLink` (exit code 2), before anything is written. A path in none of them is not judged (the
 * documentation project's), unless `within`: it must lie in one.
 * @param {string[]} dirs
 * @param {string} abs
 * @param {{ folder?: boolean, within?: boolean, shown?: string, judge?: ReturnType<typeof pathJudge> }} [o]
 */
export function assertWritable(dirs, abs, { folder = false, within = false, shown = abs, judge = pathJudge() } = {}) {
  const verdicts = dirs.map((dir) => judge.writable(dir, abs, { folder }));
  if (verdicts.some((v) => v === true) || (!within && verdicts.every((v) => v === null))) return;
  throw new KitError(EXIT.USAGE, "write.throughLink", { file: shown });
}

/**
 * assertWritable for a file `p` of a documentation project (relative to it, as the configuration writes it): judged
 * when it lies in the project's application.
 * @param {string} root
 * @param {{ app?: { dir?: string|null } }} config
 * @param {string} p
 */
export function assertProjectWritable(root, config, p) {
  const appDir = appDirOf(root, config);
  if (appDir) assertWritable([appDir], path.resolve(root, p), { shown: p });
}
