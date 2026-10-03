// Finding the project (ARCHITECTURE.md §2.2): --project <dir>, otherwise doc.config.mjs in the current folder
// or one of its parents. The kit itself is located from import.meta.url.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KitError, EXIT } from "./errors.mjs";
import { BRAND } from "../brand.mjs";

export const CONFIG_FILE = "doc.config.mjs";
export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Kit version (package.json). */
export const kitVersion = () => BRAND.version;

/**
 * @param {{ project?: string, from?: string }} options
 * @returns {{ root: string, configFile: string }}
 */
export function findProject({ project, from = process.cwd() } = {}) {
  if (project) {
    const root = path.resolve(from, project);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
      throw new KitError(EXIT.USAGE, "project.folderMissing", { folder: root });
    const configFile = path.join(root, CONFIG_FILE);
    if (!fs.existsSync(configFile)) throw new KitError(EXIT.USAGE, "project.configMissing", { folder: root });
    return { root, configFile };
  }
  let dir = path.resolve(from);
  for (;;) {
    const f = path.join(dir, CONFIG_FILE);
    if (fs.existsSync(f)) return { root: dir, configFile: f };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new KitError(EXIT.USAGE, "project.notFound", { folder: path.resolve(from) });
}
