// The skeleton of a documentation project (`doc-kit init`, ARCHITECTURE.md §2.1): templates/project/common and
// templates/project/<language> written into an empty folder, variables filled, the capture variant of every page;
// then cut to the spaces chosen (§6.1a) — the four by default, some of them, or none (one documentation, no space).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../project/errors.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { satisfies } from "../project/semver.mjs";
import { slash } from "./environment.mjs";
import { captureVariant } from "../core/page-templates.mjs";
import { counterpartTargets } from "../core/counterparts.mjs";
import { BRAND } from "../brand.mjs";

/** The spaces of the skeleton, in their order, and the sets `init` offers (`--spaces <id,…>|none`). */
const SKELETON_SPACES = Object.freeze(["use", "product", "admin", "develop"]);
export const SPACE_PRESETS = Object.freeze({
  all: SKELETON_SPACES,
  product: Object.freeze(["use", "product"]),
  takeover: Object.freeze(["admin", "develop"]),
  use: Object.freeze(["use"]),
  none: Object.freeze([]),
});
/** The operating part of the Administer space: it goes to Develop when Develop is kept without Administer. */
const OPERATE = new Set(["operate", "exploiter"]);

/**
 * `--spaces`: "none", or ids of the skeleton's spaces separated by commas, each once.
 * @param {string} value
 * @returns {string[]} the ids, in the skeleton's order ([] for none)
 * @throws {KitError} init.spacesInvalid { value, known } (exit code 2)
 */
export function parseSpaces(value) {
  const invalid = () => new KitError(EXIT.USAGE, "init.spacesInvalid", { value, known: SKELETON_SPACES.join(", ") });
  const list = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 1 && list[0] === "none") return [];
  if (!list.length || new Set(list).size !== list.length || list.some((s) => !SKELETON_SPACES.includes(s)))
    throw invalid();
  return SKELETON_SPACES.filter((s) => list.includes(s));
}

/** The pages of a section, every group. */
const pagesOf = (sec) => (sec.groups || []).flatMap((g) => g.pages || []);

/**
 * The skeleton's table of contents for some spaces: the sections of the others left out — but for the operating
 * part of Administer, which goes to Develop when only Develop is kept —, and with them the journey steps, the
 * suggestions and the counterparts that named their pages; a journey left without a step, or of a space left out,
 * goes too. No space at all: the same pages, without `spaces` or `space`. Pure.
 * @param {any} toc   the skeleton's toc.json
 * @param {readonly string[]} spaces   ids of SKELETON_SPACES ([] for none)
 * @returns {{ toc: any, removed: any[] }}   removed: the page entries left out (their files go too)
 */
export function tailorToc(toc, spaces) {
  const t = structuredClone(toc);
  if (!spaces.length) {
    delete t.spaces;
    for (const sec of t.sections) {
      delete sec.space;
      for (const p of pagesOf(sec)) delete p.space;
    }
    for (const j of t.journeys || []) delete j.space;
    return { toc: t, removed: [] };
  }
  const keep = new Set(spaces);
  const removed = [];
  t.sections = t.sections.filter((sec) => {
    // Kept below only when Develop is.
    if (sec.space === "admin" && !keep.has("admin") && OPERATE.has(sec.id)) sec.space = "develop";
    if (keep.has(sec.space)) return true;
    removed.push(...pagesOf(sec));
    return false;
  });
  t.spaces = (t.spaces || []).filter((s) => keep.has(typeof s === "string" ? s : s.id));
  const gone = new Set(removed.map((p) => p.id));
  for (const p of t.sections.flatMap(pagesOf)) {
    if (p.counterpart === undefined) continue;
    const left = counterpartTargets(p.counterpart)
      .filter((x) => !gone.has(x.id))
      .map((x) => (x.anchor ? `${x.id}~${x.anchor}` : x.id));
    if (!left.length) delete p.counterpart;
    else p.counterpart = Array.isArray(p.counterpart) ? left : left[0];
  }
  t.journeys = (t.journeys || [])
    .map((j) => ({ ...j, steps: j.steps.filter((id) => !gone.has(id)) }))
    .filter((j) => j.steps.length && (j.space === undefined || keep.has(j.space)));
  if (t.suggestions) t.suggestions = t.suggestions.filter((id) => !gone.has(id));
  return { toc: t, removed };
}

/** Escapes a value for the file it goes into (JSON and JS strings: double-quoted escaping). */
function escapeFor(file, value) {
  return /\.(json|mjs|js)$/.test(file) ? JSON.stringify(String(value)).slice(1, -1) : String(value);
}

/** Files of the skeleton written only in capture mode "app". */
const CAPTURE_ONLY = new Set(["captures/plans/example.mjs", "captures/targets.mjs"]);

/** The skeleton's package.json without the scripts that capture (capture mode "none": `capture` refuses to run). */
function withoutCaptureScripts(text) {
  const pkg = JSON.parse(text);
  const scripts = pkg.scripts || {};
  for (const [name, script] of Object.entries(scripts)) {
    const kept = String(script)
      .split("&&")
      .map((s) => s.trim())
      .filter((s) => !/\bcapture\b/.test(s));
    if (kept.length) scripts[name] = kept.join(" && ");
    else delete scripts[name];
  }
  return JSON.stringify(pkg, null, 2) + "\n";
}

/**
 * Writes the project skeleton into `target` (must be missing or empty), cut to `spaces` when given.
 * @param {{ target: string, language: "en"|"fr", vars: Record<string,string>, raw?: string[], kitVersion?: string,
 *   mode?: "app"|"none", spaces?: readonly string[]|null }} p
 *   raw: variables inserted as they are (JavaScript literals such as {{coverage}}); mode: capture mode (§6.4
 *   variants); spaces: tailorToc's (null: the four)
 * @returns {string[]} written files, relative to target, with forward slashes, sorted
 */
export function writeSkeleton({
  target,
  language,
  vars,
  raw = ["coverage", "maskingEnv", "versionFile", "versionPattern", "readOnly"],
  kitVersion = BRAND.version,
  mode = "app",
  spaces = null,
}) {
  if (fs.existsSync(target) && fs.readdirSync(target).length)
    throw new KitError(EXIT.CHECK, "init.notEmpty", { folder: target });
  const written = [];
  for (const layer of ["common", language]) {
    const base = path.join(KIT_ROOT, "templates", "project", layer);
    for (const rel of fs.readdirSync(base, { recursive: true }).map(String).sort()) {
      const src = path.join(base, rel);
      if (fs.statSync(src).isDirectory()) continue;
      if (mode !== "app" && CAPTURE_ONLY.has(slash(rel))) continue;
      const dest = path.join(target, rel);
      let text = fs.readFileSync(src, "utf8");
      if (/\.md$/i.test(rel)) text = captureVariant(text, mode);
      if (mode === "none" && slash(rel) === "package.json") text = withoutCaptureScripts(text);
      text = text.replace(/\{\{(\w+)\}\}/g, (m, k) =>
        k in vars ? (raw.includes(k) ? vars[k] : escapeFor(rel, vars[k])) : m,
      );
      // The skeleton's kit range must accept this kit (otherwise every command would stop with exit code 3).
      text = text.replace(/^(\s*kit:\s*")([^"]*)(")/m, (m, a, range, b) =>
        satisfies(kitVersion, range) ? m : `${a}^${kitVersion}${b}`,
      );
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text);
      written.push(slash(rel));
    }
  }
  const files = new Set(written);
  if (spaces) for (const f of cutToSpaces(target, spaces)) files.delete(f);
  return [...files].sort();
}

/**
 * Rewrites the skeleton's toc.json for `spaces` and removes the files of the pages left out — only inside content/,
 * whatever a page id or `file` says — and their folders left empty, up to content/.
 * @param {string} target   the project just written
 * @param {readonly string[]} spaces
 * @returns {string[]} the files removed, relative to target, with forward slashes
 */
export function cutToSpaces(target, spaces) {
  const content = path.join(target, "content");
  const tocFile = path.join(content, "toc.json");
  // JSON.parse, not readToc: the kit's own file, written a moment ago.
  const { toc, removed } = tailorToc(JSON.parse(fs.readFileSync(tocFile, "utf8")), spaces);
  fs.writeFileSync(tocFile, jsonText(toc));
  const inside = (f) => {
    const rel = path.relative(content, path.join(target, f));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  const files = removed.map((p) => `content/${p.file || `${p.id}.md`}`).filter(inside);
  for (const f of files) {
    fs.rmSync(path.join(target, f), { force: true });
    for (let dir = path.dirname(path.join(target, f)); dir !== content; dir = path.dirname(dir))
      if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
      else break;
  }
  return files;
}

/**
 * JSON laid out as the skeleton's toc.json is (Prettier, 120 columns): an object one key per line, a list of plain
 * values on one line when that line fits, otherwise one item per line.
 * @param {any} value
 * @returns {string}
 */
export function jsonText(value) {
  const WIDTH = 120;
  // head: what precedes the value on its line (indentation and key); tail: what follows it (a comma, or nothing).
  const text = (v, indent, head, tail) => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object")) {
      const line = `[${v.map((x) => JSON.stringify(x)).join(", ")}]`;
      if (head.length + line.length + tail.length <= WIDTH) return line;
    }
    const entries = Array.isArray(v)
      ? v.map((x) => ["", x])
      : Object.entries(v).map(([k, x]) => [`${JSON.stringify(k)}: `, x]);
    if (!entries.length) return Array.isArray(v) ? "[]" : "{}";
    const pad = `${indent}  `;
    const lines = entries.map(([key, x], i) => {
      const comma = i < entries.length - 1 ? "," : "";
      return `${pad}${key}${text(x, pad, pad + key, comma)}${comma}`;
    });
    return Array.isArray(v) ? `[\n${lines.join("\n")}\n${indent}]` : `{\n${lines.join("\n")}\n${indent}}`;
  };
  return `${text(value, "", "", "")}\n`;
}
