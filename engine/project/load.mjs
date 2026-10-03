// Loading a project: find it, import doc.config.mjs, strict validation (exit code 2), defaults, kit
// compatibility (exit code 3), environment variables.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findProject, KIT_ROOT, kitVersion, CONFIG_FILE } from "./find.mjs";
import { validate } from "./validate.mjs";
import { completeConfig } from "./defaults.mjs";
import { applyEnv, readEnv } from "./env.mjs";
import { satisfies, isValidRange } from "./semver.mjs";
import { KitError, EXIT } from "./errors.mjs";
import { checkOverrides } from "../theme/tokens.mjs";
import { LANGUAGES } from "../i18n.mjs";

const schemas = new Map();

/** A JSON schema of the kit (schemas/<name>.schema.json). */
export function readSchema(name) {
  if (!schemas.has(name))
    schemas.set(name, JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", `${name}.schema.json`), "utf8")));
  return schemas.get(name);
}

/** Checks that the schema cannot express. `raw`: the object doc.config.mjs exported, before defaults (§6.12). */
function extraChecks(config, raw) {
  const errors = [];
  try {
    new RegExp(config.version.pattern);
  } catch (e) {
    errors.push({ path: "version.pattern", key: "regex", vars: { error: e.message } });
  }
  if (!isValidRange(config.kit)) errors.push({ path: "kit", key: "range", vars: { got: config.kit } });
  errors.push(...checkOverrides(config.theme));
  for (const [k, [colour]] of Object.entries(config.statuses))
    if (!/^(#[0-9a-fA-F]{3,8}|[a-z][a-z0-9-]*|var\(--[a-z0-9-]+\))$/.test(colour))
      errors.push({ path: `statuses.${k}[0]`, key: "status", vars: { got: colour } });
  for (const [name, svg] of Object.entries(config.theme.icons))
    if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe/i.test(svg))
      errors.push({ path: `theme.icons.${name}`, key: "icon", vars: { name } });
  // Production is only ever captured read-only (ARCHITECTURE.md §3, capture.target).
  if (config.capture.target === "production" && config.capture.readOnly === false)
    errors.push({ path: "capture.readOnly", key: "productionReadOnly", vars: {} });
  // One file per space (ARCHITECTURE.md §6.1a): the path of the exports names the space.
  if (typeof config.spaces.output === "string" && !config.spaces.output.includes("{space}"))
    errors.push({ path: "spaces.output", key: "spaceOutput", vars: { placeholder: "{space}" } });
  errors.push(...checkLanguages(config, raw));
  return errors;
}

/**
 * Cross-field checks of `languages` (ARCHITECTURE.md §6.12), run after the schema: the pure structural rules
 * (array of strings) are there; everything that needs the sibling `language`, the kit's own languages or
 * `paths.content` lives here, like `spaceOutput` above.
 * @param {object} config   validated and defaulted value (schema defaults already applied: `language` is never
 *   undefined here, even when doc.config.mjs did not write it)
 * @param {object} raw      the object doc.config.mjs exported, before defaults: the only way to tell "language
 *   absent" from "language explicitly set to the schema's default (en)"
 */
function checkLanguages(config, raw) {
  const errors = [];
  const langs = config.languages;
  if (langs) {
    if (langs.length < 2) errors.push({ path: "languages", key: "languagesMin", vars: {} });
    const seen = new Set();
    langs.forEach((lang, i) => {
      if (seen.has(lang)) errors.push({ path: `languages[${i}]`, key: "languagesDuplicate", vars: { lang } });
      seen.add(lang);
      if (!LANGUAGES.includes(lang))
        errors.push({
          path: `languages[${i}]`,
          key: "languagesUnsupported",
          vars: { lang, known: LANGUAGES.join(", ") },
        });
    });
    if (raw.language !== undefined && raw.language !== langs[0])
      errors.push({ path: "language", key: "languagesSource", vars: { expected: langs[0] } });
    const translations = String(config.paths.translations)
      .split(/[\\/]+/)
      .filter(Boolean);
    const content = String(config.paths.content)
      .split(/[\\/]+/)
      .filter(Boolean);
    if (content.length && content.every((seg, i) => translations[i] === seg))
      errors.push({ path: "paths.translations", key: "translationsInsideContent", vars: {} });
    for (const key of Object.keys(config.capture.languages || {}))
      if (!langs.includes(key))
        errors.push({
          path: `capture.languages.${key}`,
          key: "captureLanguageUnknown",
          vars: { key, known: langs.join(", ") },
        });
  } else {
    for (const key of Object.keys(config.capture.languages || {}))
      errors.push({ path: `capture.languages.${key}`, key: "captureLanguageUnknown", vars: { key, known: "" } });
  }
  return errors;
}

/**
 * Validates and completes a raw configuration (the object exported by doc.config.mjs).
 * @throws {KitError} exit code 2 (invalid configuration) or 3 (incompatible kit)
 */
export function prepareConfig(raw, { file = CONFIG_FILE, env = process.env, version = kitVersion() } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new KitError(EXIT.USAGE, "config.noDefaultExport", { file });
  const { value, errors } = validate(raw, readSchema("config"), { applyDefaults: true });
  if (!errors.length) errors.push(...extraChecks(value, raw));
  if (errors.length)
    throw new KitError(EXIT.USAGE, "config.invalid", { file, n: errors.length }, { details: errors, prefix: file });
  if (!satisfies(version, value.kit))
    throw new KitError(EXIT.ENVIRONMENT, "config.kitIncompatible", { range: value.kit, version });
  completeConfig(value);
  applyEnv(value, env);
  // <PREFIX>_READONLY / DOC_KIT_READONLY cannot turn read-only off on production either.
  if (value.capture.target === "production" && value.capture.readOnly === false)
    throw new KitError(EXIT.USAGE, "env.productionReadOnly", {
      variable: readEnv("READONLY", value.env.prefix, env)?.variable ?? "READONLY",
    });
  return value;
}

/**
 * Loads the project.
 * @param {{ project?: string, from?: string, env?: object }} options
 * @returns {Promise<{ project: { root: string, configFile: string, kit: { root: string, version: string } }, config: object }>}
 */
export async function loadProject({ project, from, env = process.env } = {}) {
  const { root, configFile } = findProject({ project, from });
  let mod;
  try {
    mod = await import(pathToFileURL(configFile).href);
  } catch (e) {
    throw new KitError(EXIT.USAGE, "config.import", { file: configFile, error: e.message }, { cause: e });
  }
  const version = kitVersion();
  const shown = path.relative(process.cwd(), configFile);
  const file = !shown ? CONFIG_FILE : shown.startsWith("..") || path.isAbsolute(shown) ? configFile : shown;
  const config = prepareConfig(mod.default, { file, env, version });
  return { project: { root, configFile, kit: { root: KIT_ROOT, version } }, config };
}
