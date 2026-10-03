// Translated files (ARCHITECTURE.md §6.12): which files of a project are translatable, the state of each
// translation, and the fingerprints of `translations/<lang>/.sources.json`. Shared by build, sync, translate and
// the CLI, so it sits in core/ (no folder cycle, RULES.md M14).
import fs from "node:fs";
import path from "node:path";
import { hashText } from "./hash.mjs";

/**
 * The translatable files of a project, in a stable order: toc.json, glossary.json, home.md, then for each
 * section its introduction (`<section>/index.md`, ONLY when that source file exists — a section without one is
 * never translatable, no fallback either, exactly like the build itself, ARCHITECTURE.md §6.1/§6.12,
 * `introSourceMissing` in engine/build/build.mjs) and its pages (`p.file || p.id + ".md"`).
 * @param {{ toc: object, root: string, content: string }} p   `root`/`content`: the documentation project root
 *   and `config.paths.content`, used only to check whether a section's introduction source exists.
 * @returns {Array<{ file: string, kind: "toc"|"glossary"|"home"|"page", page?: string, section?: string }>}
 */
export function translatableFiles({ toc, root, content }) {
  /** @type {Array<{ file: string, kind: "toc"|"glossary"|"home"|"page", page?: string, section?: string }>} */
  const files = [
    { file: "toc.json", kind: "toc" },
    { file: "glossary.json", kind: "glossary" },
    { file: "home.md", kind: "home" },
  ];
  for (const sec of toc.sections || []) {
    const introRel = `${sec.id}/index.md`;
    if (fs.existsSync(path.join(root, content, introRel)))
      files.push({ file: introRel, kind: "page", section: sec.id });
    for (const g of sec.groups || [])
      for (const p of g.pages || []) files.push({ file: p.file || `${p.id}.md`, kind: "page", page: p.id });
  }
  return files;
}

/**
 * State of one translated file (ARCHITECTURE.md §6.12).
 * @param {{ sourceText: string|null, translatedExists: boolean, recorded: string|undefined }} p
 *   sourceText: current content of the SOURCE file (hashed to detect staleness); recorded: the fingerprint of
 *   `translations/<lang>/.sources.json` for this file, or undefined.
 * @returns {"missing"|"unmarked"|"stale"|"current"}
 */
export function translationState({ sourceText, translatedExists, recorded }) {
  if (!translatedExists) return "missing";
  if (recorded === undefined || recorded === null) return "unmarked";
  return recorded === hashText(sourceText ?? "") ? "current" : "stale";
}

/** `translations/<lang>/.sources.json`: `{ file: fingerprint }`, tolerant (missing or unreadable: `{}`). */
export function readSources(root, translationsDir, lang) {
  const file = path.join(root, translationsDir, lang, ".sources.json");
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Writes `translations/<lang>/.sources.json`: keys sorted, 2-space JSON, LF, trailing newline. */
export function writeSources(root, translationsDir, lang, map) {
  const dir = path.join(root, translationsDir, lang);
  fs.mkdirSync(dir, { recursive: true });
  const sorted = Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((k) => [k, map[k]]),
  );
  fs.writeFileSync(path.join(dir, ".sources.json"), JSON.stringify(sorted, null, 2) + "\n");
}
