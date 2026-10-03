// `doc-kit translate status` / `--mark` (ARCHITECTURE.md §6.12): the state of the translated files of one
// language, read from disk, and recording the current fingerprint of their source. Pure apart from reading and
// writing the project's files (no network, no git): the same kind of module as engine/build/spaces.mjs.
import fs from "node:fs";
import path from "node:path";
import { translatableFiles, translationState, readSources, writeSources } from "../core/translations.mjs";
import { hashText } from "../core/hash.mjs";
import { findPageEntry } from "../sync/dependencies.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

/**
 * The state of every translatable file of one language.
 * @param {{ root: string, config: object, toc: object, lang: string }} p
 * @returns {{ id: string, counts: { current: number, stale: number, unmarked: number, missing: number },
 *   files: Array<{ file: string, page?: string, section?: string, state: string, source: string|null, recorded: string|null }> }}
 *   source/recorded: the fingerprint (hashText) of the source file now, and the one recorded in .sources.json —
 *   shown side by side so that a `stale` file's cause (the source changed) is visible without re-translating it.
 */
export function statusOf({ root, config, toc, lang }) {
  const { content, translations } = config.paths;
  const recorded = readSources(root, translations, lang);
  const counts = { current: 0, stale: 0, unmarked: 0, missing: 0 };
  const files = translatableFiles({ toc, root, content }).map((f) => {
    const srcAbs = path.join(root, content, f.file);
    const trAbs = path.join(root, translations, lang, f.file);
    const translatedExists = fs.existsSync(trAbs);
    const sourceText = fs.existsSync(srcAbs) ? fs.readFileSync(srcAbs, "utf8") : null;
    const state = translationState({ sourceText, translatedExists, recorded: recorded[f.file] });
    counts[state]++;
    return {
      file: f.file,
      ...(f.page ? { page: f.page } : {}),
      ...(f.section ? { section: f.section } : {}),
      state,
      source: sourceText === null ? null : hashText(sourceText),
      recorded: recorded[f.file] ?? null,
    };
  });
  return { id: lang, counts, files };
}

/**
 * Resolves the items of `translate --mark <item…>` to translatable files: a page id (its own file), or a path
 * relative to content/ when it contains a "." (home.md, use/index.md, toc.json, glossary.json — the section
 * introductions and the two content files have no id). A section introduction without a source file is not
 * translatable (translatableFiles): naming it is `translate.unknownItem`, like an id that names nothing.
 * @param {{ toc: object, root: string, content: string, items: string[] }} p
 * @returns {Array<{ file: string, page?: string }>}
 * @throws {KitError} translate.unknownItem { item } (exit code 2) for an id or path that names nothing translatable
 */
export function resolveItems({ toc, root, content, items }) {
  const files = translatableFiles({ toc, root, content });
  const known = new Set(files.map((f) => f.file));
  return items.map((item) => {
    if (item.includes(".")) {
      if (!known.has(item)) throw new KitError(EXIT.USAGE, "translate.unknownItem", { item });
      const entry = files.find((f) => f.file === item);
      return { file: item, ...(entry?.page ? { page: entry.page } : {}) };
    }
    const page = findPageEntry(toc, item);
    if (!page) throw new KitError(EXIT.USAGE, "translate.unknownItem", { item });
    return { file: page.file || `${page.id}.md`, page: page.id };
  });
}

/**
 * Records the current fingerprint of the source of each item in `translations/<lang>/.sources.json`.
 * @param {{ root: string, config: object, toc: object, lang: string, items: Array<{ file: string }>, all: boolean }} p
 *   `all`: every translatable file whose translation exists (items is then ignored).
 * @returns {{ written: string[], missing: string[] }}  files relative to content/
 */
export function markFiles({ root, config, toc, lang, items = [], all = false }) {
  const { content, translations } = config.paths;
  const recorded = readSources(root, translations, lang);
  const targets = all
    ? translatableFiles({ toc, root, content }).filter((f) =>
        fs.existsSync(path.join(root, translations, lang, f.file)),
      )
    : items;
  const written = [];
  const missing = [];
  for (const f of targets) {
    const srcAbs = path.join(root, content, f.file);
    const trAbs = path.join(root, translations, lang, f.file);
    if (!fs.existsSync(trAbs)) {
      missing.push(f.file);
      continue;
    }
    recorded[f.file] = hashText(fs.existsSync(srcAbs) ? fs.readFileSync(srcAbs, "utf8") : "");
    written.push(f.file);
  }
  if (written.length) writeSources(root, translations, lang, recorded);
  return { written, missing };
}
