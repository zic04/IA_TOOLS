// The kinds of spaces (ARCHITECTURE.md §6.1a): standard/spaces.json, one profile per audience — use, product,
// admin, develop. A profile says what the kit does differently for the pages of a space of that kind (no code for
// the readers of the application, proofs and the takeover dossier for the developers…), so the build, the site
// and the audit read flags, never space ids. A standard space is declared by its id; a space of the project's own
// declares its `kind`.
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";

/**
 * @typedef {{ id: string, icon: string, noCode: boolean, proofs: boolean, glossaryTechnical: boolean,
 *   takeoverItems: string[], preferTypes: string[], board?: boolean }} SpaceProfile   board: its home shows the Product board
 */

const cache = new Map();

/**
 * The profiles of the kit, by id, read and checked once (a defect of the kit throws: tests catch it first).
 * @param {string} [kitRoot]
 * @returns {Map<string, SpaceProfile>}
 */
export function loadSpaceProfiles(kitRoot = KIT_ROOT) {
  return load(kitRoot).profiles;
}

/**
 * Whether a space id is one of an earlier kit's (standard/spaces.json `retired`: business, takeover).
 * @param {string} id
 * @param {string} [kitRoot]
 */
export function isRetiredSpace(id, kitRoot = KIT_ROOT) {
  return load(kitRoot).retired.includes(id);
}

/** @param {string} kitRoot @returns {{ profiles: Map<string, SpaceProfile>, retired: string[] }} */
function load(kitRoot) {
  if (cache.has(kitRoot)) return cache.get(kitRoot);
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(kitRoot, rel), "utf8"));
  const data = read("standard/spaces.json");
  const { errors } = validate(data, read("schemas/spaces.schema.json"));
  if (errors.length) throw new Error(`standard/spaces.json: ${errors.map((e) => `${e.path} ${e.key}`).join("; ")}`);
  const profiles = new Map();
  for (const p of data.profiles) {
    if (profiles.has(p.id)) throw new Error(`standard/spaces.json: profile ${p.id} declared twice`);
    profiles.set(p.id, Object.freeze({ ...p }));
  }
  const loaded = { profiles, retired: data.retired || [] };
  cache.set(kitRoot, loaded);
  return loaded;
}

/**
 * The kind of a declared space: its `kind`, else its id when it is a standard one; null when neither names a
 * profile (the build reports it: space.kind). A standard space keeps its own kind.
 * @param {string|{ id: string, kind?: string }} declared   an entry of toc.spaces
 * @returns {string|null}
 */
export function spaceKind(declared) {
  const profiles = loadSpaceProfiles();
  const s = typeof declared === "string" ? { id: declared } : declared;
  if (profiles.has(s.id)) return s.kind === undefined || s.kind === s.id ? s.id : null;
  return typeof s.kind === "string" && profiles.has(s.kind) ? s.kind : null;
}

/**
 * The spaces a table of contents declares, each with its profile (null: no valid kind), in declaration order and
 * once each; null when it declares none.
 * @param {{ spaces?: Array<string|{ id: string, kind?: string }> }} toc
 * @returns {Array<{ id: string, kind: string|null, profile: SpaceProfile|null }>|null}
 */
export function declaredSpaces(toc) {
  if (!Array.isArray(toc?.spaces)) return null;
  const profiles = loadSpaceProfiles();
  const out = [];
  for (const entry of toc.spaces) {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (typeof id !== "string" || out.some((s) => s.id === id)) continue;
    const kind = spaceKind(typeof entry === "string" ? entry : { ...entry, id });
    out.push({ id, kind, profile: kind ? profiles.get(kind) : null });
  }
  return out;
}
