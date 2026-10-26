// Shared helpers of the tests: demo project, in-memory builds, isolated Markdown engine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareConfig } from "../../engine/project/load.mjs";
import { build } from "../../engine/build/build.mjs";
import { createMarkdownEngine } from "../../engine/build/markdown.mjs";
import { createSyncRenderer } from "../../engine/build/sync-renderer.mjs";
import { labelReader } from "../../engine/sync/labels.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { icon } from "../../engine/site/icons.mjs";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEMO = path.join(KIT_ROOT, "examples", "demo-docs");

/** The labels of `sync` read as the CLI reads them, through the kit's renderer (ARCHITECTURE.md §6.10), for a
 * project's configuration (its statuses, its behaviour cards); a fresh reader, its own cache. */
export const syncLabels = (config = {}, root = KIT_ROOT) => labelReader(createSyncRenderer({ root, config }));

/** Configuration of the demo project (validated, completed), optionally modified first. */
export async function demoConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the demo project in memory (nothing is written in examples/). */
export async function buildDemo({ language, date = "2026-01-01", draft = false, modify, root = DEMO } = {}) {
  const config = await demoConfig((c) => (modify ? modify(c) : c));
  // The demo is written in English and translated into French (`languages`, ARCHITECTURE.md §6.12): without
  // `language`, the bilingual site; with it, the file of that language alone (`build --lang`).
  return build({ project: { root }, config, options: { date, draft, ...(language ? { lang: language } : {}) } });
}

/**
 * The process launcher (`exec`) of a CLI run that must start nothing: every binary is absent (`null`), git included,
 * as on a machine that has none. A unit test never runs the real git of the machine, nor depends on whether the kit
 * sits in a repository (RULES.md M4); one that needs git answers gives its own fake `exec`.
 */
export const noExec = () => null;

/** Temporary folder (to be removed by the caller). */
export const tempDir = (prefix = "doc-kit-test-") => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/**
 * A shell, `bash` or `sh`, wherever the developer's machine has one, whatever shell runs the tests: the first on the
 * PATH, and on Windows Git's — beside git (Claude Code's own lookup: `<Git>/bin/bash.exe`, and `sh.exe` there too),
 * or one on the PATH outside Windows' folders, whose bash.exe starts WSL. Null when there is none: a test that fails
 * only because of the developer's shell is no test of the kit (the tests say so, t.diagnostic). bash is the shell
 * Claude Code runs an agent's Bash commands with; `sh` may be bash in POSIX mode (or dash), which reads `x=~`
 * otherwise than bash does.
 * @param {"bash"|"sh"} name
 * @returns {string|null}
 */
export function findShell(name) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const file = (/** @type {string} */ p) => fs.existsSync(p) && fs.statSync(p).isFile();
  if (process.platform !== "win32") return dirs.map((d) => path.join(d, name)).find(file) ?? null;
  for (const dir of dirs.filter((d) => file(path.join(d, "git.exe"))))
    for (const root of [path.dirname(dir), path.dirname(path.dirname(dir))])
      if (file(path.join(root, "bin", `${name}.exe`))) return path.join(root, "bin", `${name}.exe`);
  const windows = (/** @type {string} */ d) => {
    const lower = d.toLowerCase();
    return lower.includes("\\windows\\") || lower.endsWith("\\windows") || lower.includes("windowsapps");
  };
  return (
    dirs
      .filter((d) => !windows(d))
      .map((d) => path.join(d, `${name}.exe`))
      .find(file) ?? null
  );
}

/** Copies a fixture project without its build outputs, into `into` (a folder the caller owns and removes) or, without
 * it, into a new temporary folder (to be removed by the caller). Never `cpSync(demoCopy(), …)`: the inner copy
 * would be left behind; pass the destination as `into`. */
function copyProject(from, prefix, into) {
  const dir = into ?? tempDir(prefix);
  fs.cpSync(from, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.doc-kit)$/.test(src) });
  return dir;
}

/** Copy of the demo project in a temporary folder, or into `into`. */
export const demoCopy = (into) => copyProject(DEMO, "doc-kit-test-", into);

/** The test project with two spaces, use and develop (ARCHITECTURE.md §6.1a). */
export const SPACES = path.join(KIT_ROOT, "test", "fixtures", "spaces");

/** Configuration of the spaces project (validated, completed), optionally modified first. */
export async function spacesConfig(modify = (c) => c) {
  const raw = (await import(pathToFileURL(path.join(SPACES, "doc.config.mjs")).href)).default;
  return prepareConfig(modify(structuredClone(raw)), { env: {} });
}

/** Builds the spaces project in memory; `root`: a copy of it (spacesCopy). */
export async function buildSpaces({
  language = "en",
  date = "2026-01-01",
  draft = false,
  modify,
  root = SPACES,
  options = {},
} = {}) {
  const config = await spacesConfig((c) => {
    c.language = language;
    return modify ? modify(c) : c;
  });
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the spaces project in a temporary folder; `editToc(toc)` returns its new table of contents. */
export function spacesCopy(editToc, into) {
  const dir = copyProject(SPACES, "doc-kit-spaces-", into);
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
export async function buildLanguages({
  date = "2026-01-01",
  draft = false,
  modify,
  root = LANGUAGES,
  options = {},
} = {}) {
  const config = await languagesConfig(modify);
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the languages project in a temporary folder; `editToc(toc)` returns its new (source) table of
 * contents, `editTranslatedToc(toc)` its translated (fr) one. */
export function languagesCopy({ editToc, editTranslatedToc, into } = {}) {
  const dir = copyProject(LANGUAGES, "doc-kit-languages-", into);
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
export async function buildBusiness({
  language = "en",
  date = "2026-01-01",
  draft = false,
  modify,
  root = BUSINESS,
  options = {},
} = {}) {
  const config = await businessConfig((c) => {
    c.language = language;
    return modify ? modify(c) : c;
  });
  return build({ project: { root }, config, options: { date, draft, ...options } });
}

/** Copy of the business project in a temporary folder; `editToc(toc)` returns its new table of contents. */
export function businessCopy(editToc, into) {
  const dir = copyProject(BUSINESS, "doc-kit-business-", into);
  if (editToc) {
    const file = path.join(dir, "content", "toc.json");
    fs.writeFileSync(file, JSON.stringify(editToc(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2));
  }
  return dir;
}

/**
 * Isolated Markdown engine: fake screenshots and files, collected reports.
 * @param {{ captures?: object, files?: Record<string,string>, language?: string, statuses?: object, behaviours?: any }} p
 *   behaviours: the kinds of behaviour cards and the strict flag (default: the kit's kinds, not strict)
 */
export function testEngine({ captures = {}, files = {}, language = "en", statuses = {}, behaviours } = {}) {
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
    ...(behaviours ? { behaviours, locale: language } : {}),
  });
  return { engine, reports, render: (src, id = "page/test") => engine.render(src, id) };
}

/** Embedded data of a built HTML file; with `lang` (ARCHITECTURE.md §6.12), the slice of that OTHER language
 * (`#site-data-<lang>`) instead of the source's (`#site-data`). */
export function dataOf(html, lang) {
  const id = lang ? `site-data-${lang}` : "site-data";
  const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html);
  return JSON.parse(m[1]);
}
