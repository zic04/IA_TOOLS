// The mutants of the kit (test/mutations/*.mjs, RULES.md M16): each one a small change to an engine file — a rule
// taken out — that its tests must catch. Read by test/tools/mutate.mjs (which runs them, `npm run mutate`) and by
// test/unit/mutations.test.mjs (which checks, in `npm test`, that every mutant still finds the code it changes).
//
// A file of test/mutations/ (one per engine module; a name starting with "_" is shared data, not a file of mutants):
//   export default { target: "engine/…/x.mjs", tests: ["test/unit/….test.mjs", …], mutants: [{ name, find, replace,
//   tests?, only? }] }
// `find` is the exact text the mutant replaces: it must occur once, and only once, in the target. `only: "posix"`: a
// rule that matters only where the filesystem is POSIX's (a backslash is a name's character, case is kept), so that
// on Windows its mutant cannot be caught — it is run on Linux and macOS only, with `why`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KIT_ROOT } from "./helpers.mjs";

export const MUTATIONS = path.join(KIT_ROOT, "test", "mutations");

/**
 * @typedef {{ name: string, find: string, replace: string, tests?: string[], only?: "posix", why?: string }} Mutant
 * @typedef {{ file: string, target: string, tests: string[], mutants: Mutant[] }} MutationFile
 */

/** Whether a mutant can be caught on this platform (`only: "posix"`: not on Windows). */
export const runsHere = (mutant, platform = process.platform) => mutant.only !== "posix" || platform !== "win32";

/**
 * Every file of mutants, its own file name kept (`file`), in the order of their names.
 * @returns {Promise<MutationFile[]>}
 */
export async function loadMutations(dir = MUTATIONS) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
    .sort();
  const out = [];
  for (const file of files) {
    const { default: spec } = await import(pathToFileURL(path.join(dir, file)).href);
    out.push({ file, ...spec });
  }
  return out;
}

/** `text` with the mutant applied, or null when its `find` does not occur exactly once. */
export function applyMutant(text, { find, replace }) {
  const parts = text.split(find);
  return parts.length === 2 ? parts.join(replace) : null;
}

/**
 * What is wrong with the files of mutants, one line each (none: every mutant can run): a target that is not an engine
 * file or does not exist, a test file that does not exist, a mutant whose `find` the target holds no or several times,
 * a mutant that changes nothing, two mutants of one file with the same name.
 * @param {MutationFile[]} files
 * @param {string} [root]
 * @returns {string[]}
 */
export function checkMutations(files, root = KIT_ROOT) {
  const problems = [];
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  for (const { file, target, tests, mutants } of files) {
    if (typeof target !== "string" || !target.startsWith("engine/") || !exists(target)) {
      problems.push(`${file}: target ${target} is no engine file`);
      continue;
    }
    if (!Array.isArray(mutants) || !mutants.length) problems.push(`${file}: no mutant`);
    const text = fs.readFileSync(path.join(root, target), "utf8");
    const names = new Set();
    for (const m of mutants ?? []) {
      const label = `${file} › ${m.name}`;
      if (names.has(m.name)) problems.push(`${label}: a name given twice`);
      names.add(m.name);
      if (typeof m.find !== "string" || !m.find || m.find === m.replace) problems.push(`${label}: changes nothing`);
      else {
        const count = text.split(m.find).length - 1;
        if (count !== 1) problems.push(`${label}: its code is found ${count} times in ${target}`);
      }
      for (const t of m.tests ?? tests ?? [])
        if (!t.startsWith("test/") || !exists(t)) problems.push(`${label}: test ${t} does not exist`);
      if (!(m.tests ?? tests)?.length) problems.push(`${label}: no test to catch it`);
      if (m.only !== undefined && (m.only !== "posix" || !m.why)) problems.push(`${label}: only "posix", with its why`);
    }
  }
  return problems;
}
