// `env` source (ARCHITECTURE.md §6.9): environment variable names read by the code, and the names declared by an
// example env file. Never the values; never `.env` itself (only `.env.example`, `.env.sample`, `.env.template`).
//   item: { name, files: ["path:line"], example }
// Besides the literal `process.env.X` / `os.environ[...]` forms, two indirect readings common in vibe-coded
// applications are also recognised:
//   - a pydantic settings class (`class Settings(BaseSettings):`, pydantic v1 or the `pydantic_settings` v2
//     package): one variable per field, its name the field name upper-cased and prefixed by `env_prefix` (read
//     from a nested `class Config:`, v1, or `model_config = SettingsConfigDict(...)`, v2); `Field(..., alias=…)`,
//     `validation_alias=…` and `env=…` (v1) replace the derived name outright;
//   - a Node destructuring read, `const { FOO, BAR } = process.env` (the names destructured, not any renaming
//     after `:`).
import path from "node:path";
import { listFiles } from "./common.mjs";
import { readListed } from "./code-files.mjs";
import { textIndex } from "./behaviour-common.mjs";

const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"]);
const PATTERNS = [
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g,
  /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /os\.environ\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g,
  /os\.environ\.get\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
  /os\.getenv\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
];
/**
 * `const { FOO, BAR } = process.env` (`let`/`var` too): the destructured names, never a `:` rename. The names are
 * read up to the next brace either way (an opening never closed is not read to the end from each), their blanks
 * trimmed after (RULES.md S5).
 */
const NODE_DESTRUCTURE = /(?:const|let|var)\s*\{([^{}]+)\}\s*=\s*process\.env\b/g;
const EXAMPLE_FILE = /(^|\/)\.env\.(example|sample|template)$/i;

/** A class statement with its base list and body, up to the next top-level `class` or the end of the file. */
// Its end: the next class or the end of the text — never "newlines, then the end", tested at every character.
const PY_CLASS = /class\s+(\w+)\s*\(([^)]{0,500})\)\s*:\r?\n([\s\S]*?)(?=\r?\nclass\s+\w|$)/g;
/** One field of a settings class: `name: Type` or `name: Type = <rest of the line>`; never `class Config:` or
 * `model_config = …` (no `:` type annotation immediately after the name on those lines). */
const PY_FIELD = /^[ \t]*(\w+)[ \t]*:[ \t]*[^\n=]+(?:=[ \t]*(.*))?$/gm;
/** The expressions of this source, on the application's code (test/tools/redos-worker.mjs, RULES.md S5). */
export const ENV_READ_PATTERNS = Object.freeze({
  ...Object.fromEntries(PATTERNS.map((re, i) => [`read${i}`, re])),
  NODE_DESTRUCTURE,
  PY_CLASS,
  PY_FIELD,
});

/** `env_prefix` of a pydantic settings class body: `class Config: env_prefix = "…"` (v1) or
 * `model_config = SettingsConfigDict(env_prefix="…")` (v2); "" when neither is declared. */
function pydanticEnvPrefix(body) {
  const v1 = /class\s+Config\s*:[\s\S]*?env_prefix\s*=\s*["']([^"']*)["']/.exec(body);
  if (v1) return v1[1];
  const v2 = /model_config\s*=\s*SettingsConfigDict\(([^)]*)\)/.exec(body);
  if (v2) {
    const p = /env_prefix\s*=\s*["']([^"']*)["']/.exec(v2[1]);
    if (p) return p[1];
  }
  return "";
}

/** `Field(..., alias="X")`, `validation_alias="X"` or the pydantic v1 `env="X"`: replaces the derived name. */
function pydanticFieldOverride(rest) {
  if (!rest) return null;
  for (const re of [
    /\balias\s*=\s*["']([^"']+)["']/,
    /\bvalidation_alias\s*=\s*["']([^"']+)["']/,
    /\benv\s*=\s*["']([^"']+)["']/,
  ]) {
    const m = re.exec(rest);
    if (m) return m[1];
  }
  return null;
}

/**
 * Environment variable names of the pydantic `BaseSettings` classes of a Python file (both `pydantic.BaseSettings`,
 * v1, and `pydantic_settings.BaseSettings`, v2): one per field, with the line of its declaration.
 * @returns {Array<{name: string, line: number}>}
 */
export function pydanticEnvNames(text) {
  const lineAt = textIndex(text).lineOf;
  const out = [];
  for (const m of text.matchAll(PY_CLASS)) {
    const [, , bases, body] = m;
    if (!/\bBaseSettings\b/.test(bases)) continue;
    const prefix = pydanticEnvPrefix(body);
    const bodyStart = m.index + m[0].length - body.length;
    for (const fm of body.matchAll(PY_FIELD)) {
      const [, field, rest] = fm;
      if (field === "model_config") continue;
      const override = pydanticFieldOverride(rest);
      out.push({ name: override || (prefix + field).toUpperCase(), line: lineAt(bodyStart + fm.index) });
    }
  }
  return out;
}

/**
 * The `env` source: names read by the code (`files`: "path:line", one per distinct occurrence) and names declared
 * by an example env file (`example: true`); a name that is only in an example file has an empty `files`.
 * @param {string} appDir
 * @param {Array<{ file: string, reason: string }>} [unreadable]   receives the files not read (over 512 KB: readCode)
 * @returns {Array<{name,files,example}>} sorted by name
 */
export function collectEnv(appDir, unreadable = []) {
  const byName = new Map();
  const get = (name) => byName.get(name) || byName.set(name, { name, files: new Set(), example: false }).get(name);
  const read = (rel) => readListed(appDir, rel, unreadable);
  for (const rel of listFiles(appDir).filter((f) => CODE_EXT.has(path.extname(f)))) {
    const text = read(rel);
    if (text === null) continue;
    const lineAt = textIndex(text).lineOf;
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) get(m[1]).files.add(`${rel}:${lineAt(m.index)}`);
    }
    for (const m of text.matchAll(NODE_DESTRUCTURE)) {
      const line = lineAt(m.index);
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(/[:=]/)[0].trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) get(name).files.add(`${rel}:${line}`);
      }
    }
    if (rel.endsWith(".py")) for (const f of pydanticEnvNames(text)) get(f.name).files.add(`${rel}:${f.line}`);
  }
  for (const rel of listFiles(appDir).filter((f) => EXAMPLE_FILE.test(f)))
    for (const raw of (read(rel) ?? "").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw);
      if (m) get(m[1]).example = true;
    }
  return [...byName.values()]
    .map((e) => ({ name: e.name, files: [...e.files].sort(), example: e.example }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
