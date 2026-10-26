// The features of a project (ARCHITECTURE.md §6.8): features.json at the root of the documentation project, written
// by `doc-kit inventory --features --write` and completed by hand or by the skill's agents — each feature's routes,
// API routes, i18n keys, the globs of the code behind it (`sources`) and the kinds of behaviour its sheet describes
// (`behaviours`). Read once per process; a file that does not follow schemas/features.schema.json gives no feature
// and one problem, so that a writer is told instead of being given a wrong context.
import fs from "node:fs";
import path from "node:path";
import { validate } from "../project/validate.mjs";
import { KIT_ROOT } from "../project/find.mjs";

const FEATURES_FILE = "features.json";

/** The features file of a project: the `file` option of its `features` coverage adapter, else features.json. */
export function featuresFileOf(config) {
  const entry = (config?.coverage || []).find((c) => c?.adapter === "features");
  return typeof entry?.file === "string" && entry.file ? entry.file : FEATURES_FILE;
}

const cache = new Map();
let schema = null;

/**
 * The features of a project, by id, or none with the problem that prevents reading them. Read with the tools of the
 * project (projectTools, engine/check/coverage.mjs), as the `features` coverage adapter reads it: a features file in
 * the application (`file: "../app/features.json"`) is there, and read, only where it is reached through its folders,
 * never a link or a junction (SECURITY.md); one behind such a link gives no feature.
 * @param {{ exists: (p: string) => boolean, read: (p: string) => string, resolve: (p: string) => string }} tools
 * @param {string} [name] the features file, relative to the documentation project (featuresFileOf)
 * @returns {{ features: Map<string, { id: string, title?: string, routes?: string[], api?: string[], keys?: string[],
 *   sources?: string[], behaviours?: string[] }>, problem: { key: string, vars: object } | null }}
 */
export function readFeatures(tools, name = FEATURES_FILE) {
  if (!tools.exists(name)) return { features: new Map(), problem: null };
  const file = tools.resolve(name);
  let stamp;
  try {
    const stat = fs.statSync(file); // reached without a link: the tools said so
    stamp = `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return { features: new Map(), problem: null };
  }
  const cached = cache.get(file);
  if (cached && cached.stamp === stamp) return cached.value;
  let value;
  try {
    const list = JSON.parse(tools.read(name));
    schema ??= JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "features.schema.json"), "utf8"));
    const { errors } = validate(list, schema);
    value = errors.length
      ? { features: new Map(), problem: { key: "features.invalid", vars: { file: name, at: errors[0].path } } }
      : { features: new Map(list.map((f) => [f.id, f])), problem: null };
  } catch {
    value = { features: new Map(), problem: { key: "features.invalid", vars: { file: name, at: "(root)" } } };
  }
  cache.set(file, { stamp, value });
  return value;
}
