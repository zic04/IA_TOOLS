// What the kit reads of an application (ARCHITECTURE.md §5): standard/adapters.json, read and checked once — its
// languages (by extension: which ones the kit's own sources read, `core`) and its adapters by family. The built-in
// stack, coverage and authentication adapters are the files adapters/<family>/<id>.mjs of its entries; the
// dependency readers are those of engine/facts/deps/; a low-code platform is only detected (its agents read it).
// What tells that an application uses an adapter is data (`detect`: a dependency, a file), never a branch on its id.
// Pure functions, except loadAdapters (reads the kit's file once).
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";
import { globRegex } from "./glob.mjs";

/**
 * @typedef {{ id: string, title: string, extensions: string[], core?: boolean }} Language
 * @typedef {{ dependencies?: string[], files?: string[] }} Detect
 * @typedef {{ id: string, family: "stack"|"infra"|"deps"|"lowcode"|"coverage"|"auth", title: string, languages?: string[],
 *   reads?: string[], detect?: Detect, ecosystem?: string, files?: string[] }} AdapterEntry
 * @typedef {{ languages: Language[], adapters: AdapterEntry[], byExtension: Map<string, Language> }} AdapterRegistry
 */

const cache = new Map();

/**
 * The kit's registry, read and checked once: an entry of one family and id at most, a language of each extension at
 * most, a language named by an adapter declared (a defect of the kit throws: tests catch it first).
 * @param {string} [kitRoot]
 * @returns {AdapterRegistry}
 */
export function loadAdapters(kitRoot = KIT_ROOT) {
  if (cache.has(kitRoot)) return cache.get(kitRoot);
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(kitRoot, rel), "utf8"));
  const data = read("standard/adapters.json");
  const { errors } = validate(data, read("schemas/adapters.schema.json"));
  const problems = errors.map((e) => `${e.path} ${e.key}`);
  const byExtension = new Map();
  for (const language of data.languages)
    for (const ext of language.extensions) {
      if (byExtension.has(ext)) problems.push(`${ext}: two languages`);
      byExtension.set(ext, language);
    }
  const known = new Set(data.languages.map((l) => l.id));
  const seen = new Set();
  for (const a of data.adapters) {
    if (seen.has(`${a.family}/${a.id}`)) problems.push(`${a.family}/${a.id}: twice`);
    seen.add(`${a.family}/${a.id}`);
    for (const l of a.languages || []) if (!known.has(l)) problems.push(`${a.family}/${a.id}: unknown language ${l}`);
    // Linear tests only: a glob is a path without "*", or "**/" or a folder without "*", then a file name (with "*");
    // a dependency has one "*" at most.
    for (const g of a.detect?.files || []) {
      const folder = g.slice(0, Math.max(g.lastIndexOf("/"), 0));
      if (folder !== "**" && folder.includes("*")) problems.push(`${a.family}/${a.id}: glob ${g}`);
    }
    for (const d of a.detect?.dependencies || [])
      if (d.split("*").length > 2) problems.push(`${a.family}/${a.id}: dependency ${d}`);
  }
  if (problems.length) throw new Error(`standard/adapters.json: ${problems.join("; ")}`);
  const registry = { languages: data.languages, adapters: data.adapters, byExtension };
  cache.set(kitRoot, registry);
  return registry;
}

/** The entries of one family, in the order of the registry. */
export const adaptersOf = (family, registry = loadAdapters()) => registry.adapters.filter((a) => a.family === family);

/** The language of a file by its extension (case ignored), or null: not code the kit knows. */
export function languageOf(file, registry = loadAdapters()) {
  const name = String(file).split("/").pop();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (registry.byExtension.get(name.slice(dot).toLowerCase()) ?? null) : null;
}

/**
 * A glob of `detect.files` as a test on a path: "**\/x.msapp" on the file's name alone, ".github/workflows/*.yml" on
 * its folder then its name, any other (a path without a wildcard) on the whole path — a linear test whatever the
 * path's length.
 */
function fileTest(glob) {
  if (!glob.includes("*")) return (f) => f === glob;
  const slash = glob.lastIndexOf("/");
  const folder = glob.slice(0, Math.max(slash, 0));
  const re = globRegex(glob.slice(slash + 1));
  return (f) => {
    const at = f.lastIndexOf("/");
    return (folder === "**" || f.slice(0, Math.max(at, 0)) === folder) && re.test(f.slice(at + 1));
  };
}

/** A dependency pattern ("maven:org.springframework.boot:*") as an expression on "ecosystem:name". */
const dependencyPattern = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`, "i");

/**
 * What tells that an application uses an adapter's stack or platform: the dependencies ("ecosystem:name") and the
 * files (relative to the application) its `detect` names, three of each at most. None: not detected.
 * @param {AdapterEntry} entry
 * @param {{ dependencies: Array<{ ecosystem: string, name: string }>, files: string[] }} app
 * @returns {string[]}
 */
export function detectedBy(entry, { dependencies, files }) {
  const found = [];
  const deps = (entry.detect?.dependencies || []).map(dependencyPattern);
  if (deps.length) {
    const names = new Set();
    for (const d of dependencies) {
      const key = `${d.ecosystem}:${d.name}`;
      if (!names.has(key) && deps.some((re) => re.test(key))) names.add(key);
      if (names.size === 3) break;
    }
    found.push(...names);
  }
  const globs = (entry.detect?.files || []).map(fileTest);
  if (globs.length) {
    let n = 0;
    for (const f of files)
      if (globs.some((test) => test(f))) {
        found.push(f);
        if (++n === 3) break;
      }
  }
  return found;
}
