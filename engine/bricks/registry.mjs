// The registry of the bricks (ARCHITECTURE.md §6.18): standard/bricks.json, validated once, and the bricks a
// project enables (`bricks.enabled` / `bricks.disabled` in doc.config.mjs). A brick is a part of the documentation
// project that can be run again on its own; the registry is data, so a new brick is one entry, never a new branch.
// The graph of `needs` has no cycle (checked here, with the cycle named).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, closest } from "../project/validate.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * @typedef {{ command?: "inputs"|"facts"|"audit", action?: "fetch"|"ingest", source?: string, tools?: boolean,
 *   agent?: string, per?: string }} Step
 * @typedef {{ id: string, kind: string, title: { en: string, fr: string }, needs: string[], requires: string[],
 *   steps: Step[], freshness: { rule: "envelope"|"inputs"|"volatile", files?: string[], maxAgeDays?: number,
 *   part?: "repos"|"docs" } }} Brick
 * @typedef {{ bricks: Brick[], byId: Map<string, Brick>, presets: Record<string, string[]> }} Registry
 */

/** The name of a preset, like a brick id without its dot. */
const PRESET_NAME = /^[a-z][a-z0-9-]*$/;

/** The registry, read and checked once per kit folder (a defect of the kit throws: tests catch it first). */
const cache = new Map();

/**
 * @param {string} [kitRoot]
 * @returns {Registry}
 */
export function loadBricks(kitRoot = KIT_ROOT) {
  if (cache.has(kitRoot)) return cache.get(kitRoot);
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(kitRoot, rel), "utf8"));
  const data = read("standard/bricks.json");
  const { errors } = validate(data, read("schemas/bricks.schema.json"));
  if (errors.length) throw new Error(`standard/bricks.json: ${errors.map((e) => `${e.path} ${e.key}`).join("; ")}`);
  const bricks = data.bricks.map((b) => ({ needs: [], requires: [], ...b }));
  const byId = new Map();
  for (const b of bricks) {
    if (byId.has(b.id)) throw new Error(`standard/bricks.json: brick ${b.id} declared twice`);
    byId.set(b.id, b);
  }
  for (const b of bricks) {
    for (const n of b.needs) if (!byId.has(n)) throw new Error(`standard/bricks.json: ${b.id} needs unknown ${n}`);
    for (const step of b.steps)
      if (step.command === "facts" && !step.source && !step.tools)
        throw new Error(`standard/bricks.json: ${b.id}: a facts step names no source and no tools`);
      else if ((step.command === "inputs") !== (step.action !== undefined))
        throw new Error(`standard/bricks.json: ${b.id}: an action belongs to an inputs step, and only to it`);
  }
  for (const [name, list] of Object.entries(data.presets)) {
    if (!PRESET_NAME.test(name)) throw new Error(`standard/bricks.json: preset name ${name}`);
    if (byId.has(name)) throw new Error(`standard/bricks.json: preset ${name} has the id of a brick`);
    for (const id of list)
      if (!byId.has(id) && !Object.hasOwn(data.presets, id))
        throw new Error(`standard/bricks.json: preset ${name}: unknown ${id}`);
  }
  const registry = { bricks, byId, presets: data.presets };
  topoOrder(
    registry,
    bricks.map((b) => b.id),
  ); // throws on a cycle
  cache.set(kitRoot, registry);
  return registry;
}

/**
 * Brick ids (and preset names, expanded) as a set of brick ids. An unknown name is a usage error that suggests the
 * closest one (`bricks.unknown`, exit code 2).
 * @param {Registry} registry
 * @param {string[]} names
 * @returns {Set<string>}
 */
export function expand(registry, names) {
  const out = new Set();
  const visit = (name, seen) => {
    if (registry.byId.has(name)) return void out.add(name);
    if (Object.hasOwn(registry.presets, name)) {
      if (seen.has(name)) return; // a preset that names itself, through another: already expanded
      for (const x of registry.presets[name]) visit(x, new Set([...seen, name]));
      return;
    }
    const known = [...registry.byId.keys(), ...Object.keys(registry.presets)];
    throw new KitError(EXIT.USAGE, "bricks.unknown", { id: name, closest: closest(name, known) || "—" });
  };
  for (const n of names) visit(n, new Set());
  return out;
}

/**
 * The bricks a project enables: `bricks.enabled` (ids or presets; null: every brick) minus `bricks.disabled`. An
 * unknown name there is a configuration error that names doc.config.mjs and lists the valid names (`bricks.config`).
 * @param {Registry} registry
 * @param {{ enabled?: string[]|null, disabled?: string[] }} [config]   config.bricks
 * @returns {Set<string>}
 */
export function enabledBricks(registry, config = {}) {
  const names = (/** @type {"enabled"|"disabled"} */ field) => {
    try {
      return expand(registry, config[field] || []);
    } catch (e) {
      if (!(e instanceof KitError)) throw e;
      const ids = [...registry.byId.keys(), ...Object.keys(registry.presets)].join(", ");
      throw new KitError(EXIT.USAGE, "bricks.config", { field, id: e.vars.id, closest: e.vars.closest, ids });
    }
  };
  const on = config.enabled ? names("enabled") : new Set(registry.byId.keys());
  for (const id of names("disabled")) on.delete(id);
  return on;
}

/**
 * The given bricks in an order where every brick comes after the bricks it needs (Kahn). A cycle throws, named.
 * @param {Registry} registry
 * @param {Iterable<string>} ids
 * @returns {string[]}
 */
export function topoOrder(registry, ids) {
  const wanted = new Set(ids);
  const order = [];
  const state = new Map(); // id → "visiting" | "done"
  const visit = (id, chain) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") throw new Error(`bricks: a cycle of needs: ${[...chain, id].join(" → ")}`);
    state.set(id, "visiting");
    for (const n of registry.byId.get(id)?.needs || []) visit(n, [...chain, id]);
    state.set(id, "done");
    if (wanted.has(id)) order.push(id);
  };
  for (const id of registry.bricks.map((b) => b.id)) if (wanted.has(id)) visit(id, []);
  return order;
}

/**
 * The bricks `ids` need, recursively (ids included), in run order.
 * @param {Registry} registry
 * @param {Iterable<string>} ids
 */
export function withNeeds(registry, ids) {
  const all = new Set();
  const add = (id) => {
    if (all.has(id)) return;
    all.add(id);
    for (const n of registry.byId.get(id)?.needs || []) add(n);
  };
  for (const id of ids) add(id);
  return topoOrder(registry, all);
}
