// Shared helpers of the tests: demo project, in-memory builds, isolated Markdown engine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareConfig } from "../../engine/project/load.mjs";
import { build } from "../../engine/build/build.mjs";
import { createMarkdownEngine } from "../../engine/build/markdown.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { icon } from "../../engine/site/icons.mjs";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEMO = path.join(KIT_ROOT, "examples", "demo-docs");

/** Configuration of the demo project (validated, completed), optionally modified first. */
export async function demoConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the demo project in memory (nothing is written in examples/). */
export async function buildDemo({ language = "en", date = "2026-01-01", draft = false, modify, root = DEMO } = {}) {
  const config = await demoConfig((c) => {
    c.language = language;
    return modify ? modify(c) : c;
  });
  return build({ project: { root }, config, options: { date, draft } });
}

/** Temporary folder (to be removed by the caller). */
export const tempDir = (prefix = "doc-kit-test-") => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** Copy of the demo project in a temporary folder. */
export function demoCopy() {
  const dir = tempDir();
  fs.cpSync(DEMO, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src) });
  return dir;
}

/** The test project with two spaces, business and takeover (ARCHITECTURE.md §6.1a). */
export const SPACES = path.join(KIT_ROOT, "test", "fixtures", "spaces");

/** Configuration of the spaces project (validated, completed), optionally modified first. */
export async function spacesConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(SPACES, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the spaces project in memory; `root`: a copy of it (spacesCopy). */
export async function buildSpaces({ language = "en", date = "2026-01-01", draft = false, modify, root = SPACES, options = {} } = {}) {
  const config = await spacesConfig((c) => {
    c.language = language;
    return modify ? modify(c) : c;
  });
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the spaces project in a temporary folder; `editToc(toc)` returns its new table of contents. */
export function spacesCopy(editToc) {
  const dir = tempDir("doc-kit-spaces-");
  fs.cpSync(SPACES, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src) });
  if (editToc) {
    const file = path.join(dir, "content", "toc.json");
    fs.writeFileSync(file, JSON.stringify(editToc(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
  }
  return dir;
}

/** The test project with two languages (ARCHITECTURE.md §6.12), a copy of SPACES with `languages: ["en","fr"]`
 * and `translations/fr/`: one page of every translation state (current, stale, unmarked, missing), a translated
 * diagram, a translated image + zones (orders-list), and a link to fix with `translate --fix-anchors`. */
export const LANGUAGES = path.join(KIT_ROOT, "test", "fixtures", "languages");

/** Configuration of the languages project (validated, completed), optionally modified first. */
export async function languagesConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(LANGUAGES, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the languages project in memory; `root`: a copy of it (languagesCopy). */
export async function buildLanguages({ date = "2026-01-01", draft = false, modify, root = LANGUAGES, options = {} } = {}) {
  const config = await languagesConfig(modify);
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the languages project in a temporary folder; `editToc(toc)` returns its new (source) table of
 * contents, `editTranslatedToc(toc)` its translated (fr) one. */
export function languagesCopy({ editToc, editTranslatedToc } = {}) {
  const dir = tempDir("doc-kit-languages-");
  fs.cpSync(LANGUAGES, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src) });
  if (editToc) {
    const file = path.join(dir, "content", "toc.json");
    fs.writeFileSync(file, JSON.stringify(editToc(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
  }
  if (editTranslatedToc) {
    const file = path.join(dir, "translations", "fr", "toc.json");
    fs.writeFileSync(file, JSON.stringify(editTranslatedToc(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
  }
  return dir;
}

/** The test project of the business space (ARCHITECTURE.md §6.8): a feature sheet, a rule cited before its own
 * definition, the generated tables, a glossary technical correspondence, and a takeover page. */
export const BUSINESS = path.join(KIT_ROOT, "test", "fixtures", "business");

/** Configuration of the business project (validated, completed), optionally modified first. */
export async function businessConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(BUSINESS, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the business project in memory; `root`: a copy of it (businessCopy). */
export async function buildBusiness({ language = "en", date = "2026-01-01", draft = false, modify, root = BUSINESS, options = {} } = {}) {
  const config = await businessConfig((c) => {
    c.language = language;
    return modify ? modify(c) : c;
  });
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the business project in a temporary folder; `editToc(toc)` returns its new table of contents. */
export function businessCopy(editToc) {
  const dir = tempDir("doc-kit-business-");
  fs.cpSync(BUSINESS, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src) });
  if (editToc) {
    const file = path.join(dir, "content", "toc.json");
    fs.writeFileSync(file, JSON.stringify(editToc(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
  }
  return dir;
}

/**
 * Isolated Markdown engine: fake screenshots and files, collected reports.
 * @param {{ captures?: object, files?: Record<string,string>, language?: string, statuses?: object }} p
 */
export function testEngine({ captures = {}, files = {}, language = "en", statuses = {} } = {}) {
  const reports = [];
  const i18n = createI18n({ language });
  const engine = createMarkdownEngine({
    captures,
    exists: (p) => p in files || Object.values(captures).some((c) => `images/${c.file}` === p),
    read: (p) => files[p],
    report: (strict, s) => reports.push({ strict, ...s }),
    t: i18n.t,
    icon,
    statuses,
  });
  return { engine, reports, render: (src, id = "page/test") => engine.render(src, id) };
}

/** Embedded data of a built HTML file; with `lang` (ARCHITECTURE.md §6.12), the slice of that OTHER language
 * (`#donnees-<lang>`) instead of the source's (`#donnees`). */
export function dataOf(html, lang) {
  const id = lang ? `donnees-${lang}` : "donnees";
  const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html);
  return JSON.parse(m[1]);
}
