// RULES.md S5 by construction, not by memory: every regular expression that engine/facts, engine/check, engine/sync
// and engine/capture/masking.mjs export — a RegExp, or a list or a map of them, a detector's `re` included — is
// measured by the ReDoS harness. The harness is read as text (running it is the security test's job): what it measures
// is what it imports by name, and the *_PATTERNS of the modules it loads for them (stackChecks: a module path quoted
// outside an import). An export is measured when each of its expressions is one of those, the same object (a map
// merged into another, as the dependency readers' are, counts). A new expression nobody registers fails here, named;
// the positive controls show that the check flags one.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KIT_ROOT } from "../tools/helpers.mjs";

/** The folders whose every module is read, and the single modules. */
const FOLDERS = ["engine/facts", "engine/check", "engine/sync"];
const MODULES = ["engine/capture/masking.mjs"];
/** The harness, by its folder and its name (a quoted path to it would make this file a timing one: run-plan.mjs). */
const HARNESS = path.join(KIT_ROOT, "test", "tools", "redos-" + "worker.mjs");

/** The expressions an exported value holds: itself, its elements or values, or their `re`. */
function expressionsOf(value) {
  if (value instanceof RegExp) return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((v) =>
    v instanceof RegExp ? [v] : v && typeof v === "object" && v.re instanceof RegExp ? [v.re] : [],
  );
}

/** The path of a module of the kit a specifier of the harness names ("../../engine/x.mjs" → "engine/x.mjs"). */
const kitPath = (specifier) => /^\.\.\/\.\.\/([\w./-]+\.mjs)$/.exec(specifier)?.[1] ?? null;
/** The static imports of a text: `import { a, b as c } from "…"`. Linear: one class between braces, one in quotes. */
const IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*"([^"\n]*)"/g;

/**
 * What a harness's text names: by module, the names it imports; and the modules it loads for their *_PATTERNS (a
 * quoted module path outside its imports).
 * @param {string} text
 */
function harnessNames(text) {
  const names = new Map();
  for (const [, list, specifier] of text.matchAll(IMPORT)) {
    const file = kitPath(specifier);
    if (!file) continue;
    const set = names.get(file) ?? names.set(file, new Set()).get(file);
    for (const part of list.split(",")) if (part.trim()) set.add(part.trim().split(/\s+/)[0]);
  }
  const patternModules = new Set();
  for (const [, specifier] of text.replace(IMPORT, "").matchAll(/"([^"\n]*)"/g))
    if (kitPath(specifier)) patternModules.add(kitPath(specifier));
  return { names, patternModules };
}

/**
 * The expressions a harness measures, from the namespaces of the modules it names.
 * @param {{ names: Map<string, Set<string>>, patternModules: Set<string> }} named   harnessNames
 * @param {(file: string) => object} namespace   a module's exports
 */
function measuredBy(named, namespace) {
  const measured = new Set();
  for (const [file, names] of named.names)
    for (const name of names) for (const re of expressionsOf(namespace(file)[name])) measured.add(re);
  for (const file of named.patternModules)
    for (const [name, value] of Object.entries(namespace(file)))
      if (name.endsWith("_PATTERNS")) for (const re of expressionsOf(value)) measured.add(re);
  return measured;
}

/**
 * The exports holding an expression the harness does not measure: "module NAME".
 * @param {Map<string, object>} scope   module path → its namespace
 * @param {Set<RegExp>} measured
 */
function unregistered(scope, measured) {
  const out = [];
  for (const [file, namespace] of scope)
    for (const [name, value] of Object.entries(namespace)) {
      const expressions = expressionsOf(value);
      if (expressions.length && !expressions.every((re) => measured.has(re))) out.push(`${file} ${name}`);
    }
  return out.sort();
}

/** Every module of a list of paths of the kit, imported: path → namespace. */
async function imported(files) {
  const modules = new Map();
  for (const file of files) modules.set(file, await import(pathToFileURL(path.join(KIT_ROOT, file)).href));
  return modules;
}

test("the check flags what the harness does not measure (positive controls)", () => {
  const shared = /s/;
  const modules = new Map([
    [
      "engine/facts/sample.mjs",
      {
        SAMPLE: /a+$/,
        MEASURED: /b/,
        DETECTORS: Object.freeze([{ kind: "k", re: /c/ }]),
        MAP_PATTERNS: Object.freeze({ d: /d/ }),
        LIST: [/e/],
        SHARED_PATTERNS: Object.freeze({ s: shared }),
        NOT_A_PATTERN: "f+",
        helper: () => /g/,
      },
    ],
    ["engine/sync/other.mjs", { OTHER_PATTERNS: Object.freeze({ h: /h/ }) }],
    ["engine/core/merged.mjs", { ALL: Object.freeze({ s: shared }) }],
  ]);
  const namespace = (file) => modules.get(file);
  const scope = new Map([...modules].filter(([file]) => !file.startsWith("engine/core/")));
  const harness = [
    'import { MEASURED, LIST as list } from "../../engine/facts/sample.mjs";',
    'import { ALL } from "../../engine/core/merged.mjs";',
    'const PATTERN_MODULES = ["../../engine/facts/sample.mjs"];',
  ].join("\n");
  // MAP_PATTERNS: its module is loaded for them; SHARED_PATTERNS: its expression is measured through another map;
  // OTHER_PATTERNS: its module is not loaded; DETECTORS and SAMPLE: imported by no one.
  assert.deepEqual(unregistered(scope, measuredBy(harnessNames(harness), namespace)), [
    "engine/facts/sample.mjs DETECTORS",
    "engine/facts/sample.mjs SAMPLE",
    "engine/sync/other.mjs OTHER_PATTERNS",
  ]);
  // A path in an import is not a module loaded for its *_PATTERNS: only the names imported are measured.
  const imports = 'import { MEASURED } from "../../engine/facts/sample.mjs";';
  assert.deepEqual(unregistered(scope, measuredBy(harnessNames(imports), namespace)), [
    "engine/facts/sample.mjs DETECTORS",
    "engine/facts/sample.mjs LIST",
    "engine/facts/sample.mjs MAP_PATTERNS",
    "engine/facts/sample.mjs SAMPLE",
    "engine/facts/sample.mjs SHARED_PATTERNS",
    "engine/sync/other.mjs OTHER_PATTERNS",
  ]);
});

test("every regular expression exported by engine/facts, engine/check, engine/sync and masking.mjs is measured", async () => {
  const files = [
    ...FOLDERS.flatMap((dir) =>
      fs
        .readdirSync(path.join(KIT_ROOT, dir), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith(".mjs"))
        .map((f) => `${dir}/${f.split(path.sep).join("/")}`),
    ),
    ...MODULES,
  ];
  const scope = await imported(files);
  assert.ok(scope.size > 60, `the scan sees the modules: ${scope.size}`);
  const named = harnessNames(fs.readFileSync(HARNESS, "utf8"));
  assert.ok(named.names.get("engine/check/secrets.mjs")?.has("GENERIC"), "the harness's imports are read");
  assert.ok(named.patternModules.has("engine/facts/stack-js.mjs"), "and the modules it loads for their *_PATTERNS");
  const harnessModules = await imported([...new Set([...named.names.keys(), ...named.patternModules])]);
  const measured = measuredBy(named, (file) => harnessModules.get(file));
  assert.deepEqual(
    unregistered(scope, measured),
    [],
    "register each in test/tools/redos-worker.mjs, with inputs that make it fail late (RULES.md S5)",
  );
});
