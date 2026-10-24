// The stack adapters of the facts (ARCHITECTURE.md §5, §6.9): the kit's (adapters/stack/, one entry each in
// standard/adapters.json) and the project's own (config.stacks.adapters, "local:adapters/x.mjs": a file of the
// documentation project, never of the application). Each one names the files it reads (`files`, on their relative
// path; `marker`, on their text) and gives the routes (`api`), the screens (`screens`) or the behaviour hints
// (`behaviours`) of its framework; the kit gives it the files' texts, never runs anything of the application, and
// classifies the access of a route from its guards itself (engine/facts/api.mjs).
import next from "../../adapters/stack/next.mjs";
import express from "../../adapters/stack/express.mjs";
import fastapi from "../../adapters/stack/fastapi.mjs";
import nestjs from "../../adapters/stack/nestjs.mjs";
import angular from "../../adapters/stack/angular.mjs";
import vueRouter from "../../adapters/stack/vue-router.mjs";
import reactRouter from "../../adapters/stack/react-router.mjs";
import spring from "../../adapters/stack/spring.mjs";
import aspnet from "../../adapters/stack/aspnet.mjs";
import laravel from "../../adapters/stack/laravel.mjs";
import symfony from "../../adapters/stack/symfony.mjs";
import django from "../../adapters/stack/django.mjs";
import flask from "../../adapters/stack/flask.mjs";
import go from "../../adapters/stack/go.mjs";
import rails from "../../adapters/stack/rails.mjs";
import rust from "../../adapters/stack/rust.mjs";
import fs from "node:fs";
import path from "node:path";
import { loadAdapter } from "../capture/session.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { readableFiles, infraFiles, readCode } from "./code-files.mjs";
import { collectDependencies } from "./dependencies.mjs";
import { adaptersOf, detectedBy } from "../core/adapters.mjs";
import { realPathOf } from "../core/confine.mjs";

/**
 * @typedef {{ name: string, files: RegExp, marker?: RegExp, languages?: string[],
 *   api?: (p: { sources: Map<string, string> }) => object[],
 *   screens?: (p: { sources: Map<string, string> }) => object[],
 *   behaviours?: (text: string, sink: any, file: string) => void }} StackAdapter
 */

/** The kit's stack adapters, in the order of standard/adapters.json (test/unit/stacks.test.mjs checks they agree). */
export const BUILT_IN_STACKS = Object.freeze([
  next,
  express,
  fastapi,
  nestjs,
  angular,
  vueRouter,
  reactRouter,
  spring,
  aspnet,
  laravel,
  symfony,
  django,
  flask,
  go,
  rails,
  rust,
]);

/** Whether a real path is a folder or inside it. */
const within = (real, dir) => real === dir || real.startsWith(dir + path.sep);

/**
 * The stack adapters of a run: the kit's but those of `config.stacks.disabled` (an id the kit does not know is an
 * error, `stacks.unknown`), then the project's own. A project adapter is a file of the documentation project, links
 * followed, and never one of the application or of .doc-kit/ (the clones of the sources) when they sit in the
 * project: anything else is refused before it is loaded (`stacks.outside`), a file not found too
 * (`adapter.missing`), and the path loaded is the real one checked — the application is never run. A project's
 * adapter named like one of the kit's is refused (`stacks.name`).
 * @param {string} root   the documentation project
 * @param {{ app?: { dir?: string|null }, stacks?: { disabled?: string[], adapters?: string[] } }} config
 * @returns {Promise<StackAdapter[]>}
 */
export const loadStacks = (root, config) =>
  loadProjectAdapters({ kind: "stack", key: "stacks", builtIn: BUILT_IN_STACKS, root, config });

/**
 * The adapters of a family for a run (stack: config.stacks, infra: config.infra): the kit's but those of
 * `<key>.disabled` (an id the kit does not know is `stacks.unknown`), then the project's own of `<key>.adapters`,
 * each a file of the documentation project as loadStacks says.
 * @template T
 * @param {{ kind: "stack"|"infra", key: string, builtIn: readonly T[], root: string, config: any }} p
 * @returns {Promise<T[]>}
 */
export async function loadProjectAdapters({ kind, key, builtIn, root, config }) {
  const known = builtIn.map((a) => /** @type {any} */ (a).name);
  const disabled = config[key]?.disabled || [];
  for (const name of disabled)
    if (!known.includes(name))
      throw new KitError(EXIT.USAGE, "stacks.unknown", { key, kind, name, known: known.join(", ") });
  const out = builtIn.filter((a) => !disabled.includes(/** @type {any} */ (a).name));
  const base = fs.realpathSync.native(path.resolve(root));
  const app = config.app?.dir ? realPathOf(path.resolve(root, config.app.dir)) : null;
  const inside = [app, realPathOf(path.join(root, ".doc-kit"))].filter((d) => d && d !== base && within(d, base));
  for (const [i, spec] of (config[key]?.adapters || []).entries()) {
    const file = path.resolve(root, spec.slice("local:".length));
    const real = realPathOf(file);
    if (!real) throw new KitError(EXIT.USAGE, "adapter.missing", { kind, name: spec, file });
    if (!within(real, base) || inside.some((d) => within(real, d)))
      throw new KitError(EXIT.USAGE, "stacks.outside", { key, kind, name: spec });
    const { adapter } = await loadAdapter(kind, { adapter: `local:${real}` }, root, `${key}.adapters[${i}]`);
    // A project's adapter takes a name of its own: the kit's names say where an item comes from.
    if (known.includes(adapter.name))
      throw new KitError(EXIT.USAGE, "stacks.name", { key, kind, name: adapter.name, file: spec });
    out.push(adapter);
  }
  return out;
}

/**
 * The adapters of `stacks` that run on an application: a project's own always; one of the kit's when its stack is
 * detected (standard/adapters.json, `detect`) — or when the application has no dependency at all of the ecosystems
 * its `detect` names, so that nothing tells (a folder of code without its manifest). A Vite application is never
 * read as a Next.js one.
 * @param {string} appDir
 * @param {readonly StackAdapter[]} stacks
 * @param {string[]} [files]   readableFiles(appDir), when the caller has them
 */
export function runningStacks(appDir, stacks, files = readableFiles(appDir)) {
  const entries = new Map(adaptersOf("stack").map((a) => [a.id, a]));
  if (!stacks.some((a) => entries.get(a.name)?.detect)) return [...stacks];
  const dependencies = collectDependencies(appDir);
  const ecosystems = new Set(dependencies.map((d) => d.ecosystem));
  return stacks.filter((adapter) => {
    const entry = entries.get(adapter.name);
    if (!entry?.detect) return true;
    if (detectedBy(entry, { dependencies, files }).length) return true;
    const named = (entry.detect.dependencies || []).map((p) => p.slice(0, p.indexOf(":")));
    return named.length > 0 && !named.some((e) => ecosystems.has(e));
  });
}

/**
 * For each stack adapter with `hook` that runs here (runningStacks), the texts of its files (`files`, then
 * `marker`): a file over 512 KB, a test or a generated file is never given (engine/facts/code-files.mjs; for the
 * infra adapters, a test/ folder is the test environment, infraFiles).
 * @param {string} appDir
 * @param {readonly StackAdapter[]} stacks
 * @param {"api"|"screens"|"infra"} hook
 * @returns {Array<{ adapter: StackAdapter, sources: Map<string, string> }>}
 */
export function stackSources(appDir, stacks, hook) {
  const files = hook === "infra" ? infraFiles(appDir) : readableFiles(appDir);
  return (hook === "infra" ? stacks : runningStacks(appDir, stacks, files))
    .filter((adapter) => typeof adapter[hook] === "function")
    .map((adapter) => {
      const sources = new Map();
      for (const file of files) {
        if (file.search(adapter.files) === -1) continue;
        const read = readCode(appDir, file);
        if ("text" in read && (!adapter.marker || read.text.search(adapter.marker) !== -1))
          sources.set(file, read.text);
      }
      return { adapter, sources };
    });
}
