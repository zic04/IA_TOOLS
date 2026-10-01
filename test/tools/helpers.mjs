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

/** Embedded data of a built HTML file. */
export function dataOf(html) {
  return JSON.parse(/<script type="application\/json" id="donnees">([\s\S]*?)<\/script>/.exec(html)[1]);
}
