// Finding the project (ARCHITECTURE.md §2.2): --project <dir>, otherwise doc.config.mjs in the current folder
// or one of its parents; and the language its configuration declares, read as text. The kit itself is located
// from import.meta.url.
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

// `language: "fr"`, or `languages: ["fr", …]` (its first item is the source language); the key may be quoted. One
// optional `[` between two runs of spaces, never two runs side by side: linear (test/tools/redos-worker.mjs).
const LANGUAGE_VALUE = /\blanguages?["']?\s*:\s*(?:\[\s*)?["']([a-z]{2})["']/;
const LANGUAGE_KEY = /\blanguages?["']?\s*:/;

/**
 * The language a configuration declares, read in the text of its doc.config.mjs without running it (SECURITY.md:
 * the CLI's first messages run nothing of the folder): the first value written as a literal. `undefined` when the
 * text names neither key (the schema's default applies); `null` when the value is computed (unknown until the
 * configuration is loaded).
 * @param {string} text
 * @returns {string|null|undefined}
 */
export function languageInConfig(text) {
  const m = LANGUAGE_VALUE.exec(text);
  if (m) return m[1];
  return LANGUAGE_KEY.test(text) ? null : undefined;
}
