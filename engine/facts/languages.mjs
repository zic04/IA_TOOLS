// `stack` source (ARCHITECTURE.md §6.9): what the application is made of, and what the kit reads of it. The stacks
// and low-code platforms it uses (standard/adapters.json, `detect`: a dependency, a file), with what tells it; and,
// for each language of its code (by extension, tests and generated files left out), its files and lines and whether
// the kit reads it — by its own sources (`core`: JavaScript, TypeScript, Python, HTML, SQL) or by a stack adapter
// of a stack detected here (Spring reads Java where Spring is used). The code the kit does not read is told, so
// that its agents read it themselves and a report lowers its confidence (`summary.share`: the part of the lines
// read, in percent).
//   item: { language, files, lines, read, by } — by: "core" and the ids of the stack adapters that read it.
//   extra: { stacks: [{ id, family, title, evidence }], summary: { files, lines, readLines, share } }
import { loadAdapters, adaptersOf, languageOf, detectedBy } from "../core/adapters.mjs";
import { collectDependencies } from "./dependencies.mjs";
import { readableFiles, readCode } from "./code-files.mjs";
import { BUILT_IN_STACKS } from "./stacks.mjs";

/** The number of lines of a text (a last line without its newline counts). */
function lineCount(text) {
  let n = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return text && !text.endsWith("\n") ? n + 1 : n;
}

/**
 * The stacks and platforms detected: each entry of the registry of family stack or lowcode with what tells it, then
 * each project adapter (config.stacks.adapters), which is there because the project declared it.
 */
function detectedStacks(appDir, files, stacks) {
  const dependencies = collectDependencies(appDir);
  const out = [];
  for (const entry of [...adaptersOf("stack"), ...adaptersOf("lowcode")]) {
    const evidence = detectedBy(entry, { dependencies, files });
    if (evidence.length) out.push({ id: entry.id, family: entry.family, title: entry.title, evidence });
  }
  const builtIn = new Set(adaptersOf("stack").map((a) => a.id));
  for (const a of stacks)
    if (!builtIn.has(a.name)) out.push({ id: a.name, family: "stack", title: a.name, evidence: ["config.stacks"] });
  return out;
}

/**
 * The `stack` source.
 * @param {string} appDir
 * @param {readonly import("./stacks.mjs").StackAdapter[]} [stacks]   the adapters run (a disabled one reads nothing)
 */
export function collectStack(appDir, stacks = BUILT_IN_STACKS) {
  const registry = loadAdapters();
  const files = readableFiles(appDir);
  const detected = detectedStacks(appDir, files, stacks);
  const run = new Set(stacks.map((a) => a.name));
  // The languages each detected stack reads: the registry's for a kit adapter, its own for a project adapter.
  const readers = new Map();
  for (const d of detected.filter((s) => s.family === "stack" && run.has(s.id))) {
    const entry = registry.adapters.find((a) => a.family === "stack" && a.id === d.id);
    const languages = entry?.languages ?? stacks.find((a) => a.name === d.id)?.languages ?? [];
    for (const l of languages) readers.set(l, [...(readers.get(l) || []), d.id]);
  }
  const measured = new Map();
  for (const file of files) {
    const language = languageOf(file, registry);
    if (!language) continue;
    const read = readCode(appDir, file);
    if (!("text" in read)) continue;
    const m = measured.get(language.id) || { files: 0, lines: 0 };
    measured.set(language.id, { files: m.files + 1, lines: m.lines + lineCount(read.text) });
  }
  const items = [];
  for (const language of registry.languages) {
    const m = measured.get(language.id);
    if (!m) continue;
    const by = [...(language.core ? ["core"] : []), ...(readers.get(language.id) || [])];
    items.push({ language: language.id, files: m.files, lines: m.lines, read: by.length > 0, by });
  }
  items.sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language));
  const lines = items.reduce((n, i) => n + i.lines, 0);
  const readLines = items.reduce((n, i) => n + (i.read ? i.lines : 0), 0);
  const summary = {
    files: items.reduce((n, i) => n + i.files, 0),
    lines,
    readLines,
    share: lines ? Math.round((100 * readLines) / lines) : null,
  };
  return { items, extra: { stacks: detected, summary } };
}
