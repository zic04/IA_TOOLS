// Shared helpers for brief.mjs and consolidation.mjs (Node >= 20, no dependency).
// Find the documentation project, load doc.config.mjs, compute the brief placeholders, fill a template.
// Messages: English by default; setMessageLanguage("fr") switches them (brief.mjs speaks the project's language).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, "..");
export const WORK_DIR = ".doc-kit";
export const LANGUAGES = ["en", "fr"];

// ─── Messages (en, fr) ───────────────────────────────────────────────────────
const MESSAGES = {
  en: {
    noConfigIn: "doc.config.mjs not found in {dir}",
    noConfigIn_todo: "pass the documentation folder (the one that holds doc.config.mjs) with --project <docDir>",
    noConfigUp: "no doc.config.mjs found from the current folder upwards",
    noConfigUp_todo: "run the command in the documentation folder, or add --project <docDir>",
    configUnreadable: "doc.config.mjs cannot be read: {error}",
    configUnreadable_todo: "fix the file (doc-kit doctor checks it)",
    configUnreadableDeps_todo: "run npm install in the documentation folder, or fix the file",
    configNoExport: "doc.config.mjs has no default export object",
    configNoExport_todo: "write export default { product: { name, slug }, language, app: { url } }",
    varMalformed: 'malformed --var "{raw}"',
    varMalformed_todo: "write --var key=value",
    varName: 'invalid placeholder name: "{key}"',
    varName_todo: "letters, digits, dot, dash or underscore",
    varFile: "value file not found: {file}",
    varFile_todo: "give a path from the current folder or from the documentation folder",
    language: 'unknown language: "{value}"',
    language_todo: "{label} en or {label} fr",
    unexpected: "unexpected error: {error}",
  },
  fr: {
    noConfigIn: "doc.config.mjs introuvable dans {dir}",
    noConfigIn_todo: "indiquez le dossier de la documentation (celui qui contient doc.config.mjs) avec --project <dossierDoc>",
    noConfigUp: "aucun doc.config.mjs trouvé depuis le dossier courant en remontant",
    noConfigUp_todo: "lancez la commande dans le dossier de la documentation, ou ajoutez --project <dossierDoc>",
    configUnreadable: "doc.config.mjs illisible : {error}",
    configUnreadable_todo: "corrigez le fichier (doc-kit doctor le vérifie)",
    configUnreadableDeps_todo: "lancez npm install dans le dossier de la documentation, ou corrigez le fichier",
    configNoExport: "doc.config.mjs n'exporte pas d'objet par défaut",
    configNoExport_todo: "écrivez export default { product: { name, slug }, language, app: { url } }",
    varMalformed: "--var mal formé : « {raw} »",
    varMalformed_todo: "écrivez --var clé=valeur",
    varName: "nom de paramètre invalide : « {key} »",
    varName_todo: "lettres, chiffres, point, tiret ou tiret bas",
    varFile: "fichier de valeur introuvable : {file}",
    varFile_todo: "donnez un chemin depuis le dossier courant ou depuis le dossier de la documentation",
    language: "langue inconnue : « {value} »",
    language_todo: "{label} en ou {label} fr",
    unexpected: "erreur inattendue : {error}",
  },
};
let messageLanguage = "en";
const extraMessages = { en: {}, fr: {} };

/** Language of the messages of the scripts (en by default). */
export function setMessageLanguage(language) {
  if (LANGUAGES.includes(language)) messageLanguage = language;
  return messageLanguage;
}
export const getMessageLanguage = () => messageLanguage;

/** Adds the messages of a script (same keys in en and fr). */
export function addMessages(table) {
  for (const l of LANGUAGES) Object.assign(extraMessages[l], table[l] || {});
}

/** A message in the current language, with its {variables}; the English text when the key is missing. */
export function t(key, vars = {}) {
  const text = extraMessages[messageLanguage][key] ?? MESSAGES[messageLanguage][key] ?? extraMessages.en[key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

// Replaced by `doc-kit skill install` with the kit's location. In the kit's own source tree the token stays
// as is, and the kit is found relative to this file (skill/doc-kit/scripts → kit root).
const INSTALLED_KIT = String.raw`{{KIT_PATH}}`;

/** Error message in the CLI format: "✖ what is wrong" then "→ what to do". */
export function error(what, todo) {
  console.error(`✖ ${what}`);
  if (todo) console.error(`  → ${todo}`);
}

export function warn(what, todo) {
  console.error(`⚠ ${what}`);
  if (todo) console.error(`  → ${todo}`);
}

/** An error that carries an exit code (2 usage or configuration, 3 environment). */
export class ExitError extends Error {
  constructor(code, what, todo) {
    super(what);
    this.code = code;
    this.todo = todo;
  }
}

const isKitRoot = (dir) =>
  Boolean(dir) && ["ARCHITECTURE.md", path.join("cli", "doc-kit.mjs"), path.join("engine", "brand.mjs")].some((f) => fs.existsSync(path.join(dir, f)));

/**
 * The kit's location: the path written at install time, else the source tree that contains this skill,
 * else a `file:` dependency of the documentation project (how a project depends on the kit).
 */
export function kitPath(docDir) {
  if (!INSTALLED_KIT.startsWith("{{") && isKitRoot(INSTALLED_KIT)) return INSTALLED_KIT;
  const sourceTree = path.resolve(SKILL_ROOT, "..", "..");
  if (isKitRoot(sourceTree)) return sourceTree;
  if (docDir) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(docDir, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const spec of Object.values(deps)) {
        if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
        const dir = path.resolve(docDir, spec.slice(5));
        if (isKitRoot(dir)) return dir;
      }
    } catch {
      // no package.json or unreadable: no kit found this way
    }
  }
  return "";
}

/** Documentation folder: --project, else the first folder that holds doc.config.mjs, walking up from the current one. */
export function findProject(option) {
  if (option) {
    const dir = path.resolve(option);
    if (!fs.existsSync(path.join(dir, "doc.config.mjs"))) {
      throw new ExitError(2, t("noConfigIn", { dir }), t("noConfigIn_todo"));
    }
    return dir;
  }
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "doc.config.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ExitError(2, t("noConfigUp"), t("noConfigUp_todo"));
}

const isBareSpecifier = (s) => !/^(\.{1,2}\/|\/|[A-Za-z]:[\\/]|node:|file:|data:)/.test(s);

/**
 * Loads doc.config.mjs. When the kit package is not installed in the project, its import
 * (`import { defineConfig } from "<kit>/config"`) cannot resolve: named imports from packages are then
 * replaced by identity functions, which is all a configuration file needs from them.
 */
export async function loadConfig(docDir) {
  const file = path.join(docDir, "doc.config.mjs");
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    const notFound = e?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find (package|module)/.test(String(e?.message));
    if (!notFound) {
      throw new ExitError(2, t("configUnreadable", { error: String(e?.message).split("\n")[0] }), t("configUnreadable_todo"));
    }
    const source = fs.readFileSync(file, "utf8").replace(
      /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/g,
      (whole, names, specifier) =>
        isBareSpecifier(specifier)
          ? names
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean)
              .map((n) => `const ${n.split(/\s+as\s+/).pop().trim()} = (c) => c;`)
              .join(" ")
          : whole,
    );
    const tmp = path.join(docDir, `.doc-kit-config-${process.pid}.mjs`);
    fs.writeFileSync(tmp, source);
    try {
      mod = await import(pathToFileURL(tmp).href);
    } catch (e2) {
      throw new ExitError(2, t("configUnreadable", { error: String(e2?.message).split("\n")[0] }), t("configUnreadableDeps_todo"));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  const config = typeof mod.default === "function" ? mod.default() : mod.default;
  if (!config || typeof config !== "object") {
    throw new ExitError(2, t("configNoExport"), t("configNoExport_todo"));
  }
  return config;
}

/** Application version: config.version as a string, or { file, pattern, fallback }; else the app's package.json. */
export function readVersion(docDir, config, appDir = "") {
  const v = config.version;
  if (!v) {
    try {
      return appDir ? String(JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")).version ?? "") : "";
    } catch {
      return "";
    }
  }
  if (typeof v === "string") return v;
  try {
    if (v.file && v.pattern) {
      const text = fs.readFileSync(path.resolve(docDir, v.file), "utf8");
      const m = text.match(new RegExp(v.pattern));
      if (m && m[1]) return m[1];
    }
  } catch {
    // file missing: use the fallback
  }
  return v.fallback ?? "";
}

// LANGUAGE_NAMES[language of the brief][language of the site]
const LANGUAGE_NAMES = {
  en: { en: "English", fr: "French" },
  fr: { en: "anglais", fr: "français" },
};

// Default ids of the findings page, by language of the site (overridable with extra.briefs.findingsPage).
const FINDINGS_PAGE = { en: "take-over/findings", fr: "reprendre/points-attention" };

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const slash = (p) => p.replace(/\\/g, "/");

/** First existing file among the candidates (relative to docDir), else the first candidate. */
function firstExisting(docDir, candidates) {
  return slash(candidates.find((c) => fs.existsSync(path.join(docDir, c))) ?? candidates[0]);
}

// Option of each built-in coverage adapter that points into the application (adapters/coverage/<name>.mjs of the kit).
const SOURCE_OPTIONS = ["app", "file", "source", "base"];

/** First path of the application cited by the coverage adapters (`app`, `file`, `source` or `base`), or "". */
function coverageSource(config) {
  for (const entry of Array.isArray(config.coverage) ? config.coverage : []) {
    for (const key of SOURCE_OPTIONS) {
      const value = [].concat(entry?.[key] ?? []).find((v) => typeof v === "string" && v.trim());
      if (value) return value;
    }
  }
  return "";
}

/** Is `p` strictly inside `dir`? */
const isInside = (dir, p) => {
  const r = path.relative(dir, p);
  return Boolean(r) && !r.startsWith("..") && !path.isAbsolute(r);
};

/**
 * The application folder given to the agents ({{appDir}}), and how it was found:
 *   config   app.dir of doc.config.mjs (written by `doc-kit init`: the application root);
 *   git      the documentation folder's parent or grandparent that holds .git;
 *   parent   the documentation folder's grandparent (`<app>/docs/manual` → `<app>`).
 * `given` (a --var or extra.briefs value) wins over all of them.
 * `front`: the folder with its own package.json that holds the coverage source, when it is a sub-folder of the
 * application (a separate front end: the inventory of routes does not see the back end); "" otherwise.
 * @returns {{ dir: string, from: "given"|"config"|"git"|"parent", exists: boolean, front: string, source: string }}
 */
export function appDirInfo(docDir, config, given = "") {
  const configured = typeof config.app?.dir === "string" && config.app.dir.trim() ? path.resolve(docDir, config.app.dir) : "";
  let dir = given ? path.resolve(docDir, given) : configured;
  let from = given ? "given" : "config";
  if (!dir) {
    const parent = path.dirname(docDir);
    const grandparent = path.dirname(parent);
    const git = [parent, grandparent].find((d) => fs.existsSync(path.join(d, ".git")));
    dir = git || grandparent;
    from = git ? "git" : "parent";
  }
  const source = coverageSource(config);
  let front = "";
  if (source) {
    for (let d = path.resolve(docDir, source); isInside(dir, d); d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, "package.json"))) {
        front = d;
        break;
      }
    }
  }
  return { dir, from, exists: fs.existsSync(dir), front, source };
}

/** Slug of a product name, as the kit derives product.slug when it is not given ("Acme Orders" → "acme-orders"). */
const slugOf = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Value of a kit variable, with the CLI's precedence: DOC_KIT_<NAME>, then <PREFIX>_<NAME> (empty = unset).
 */
function envValue(name, prefix, env = process.env) {
  for (const variable of [`DOC_KIT_${name}`, prefix ? `${prefix}_${name}` : null]) {
    if (variable && env[variable]) return env[variable];
  }
  return undefined;
}

/** Placeholders computed from the configuration and the project (before extra.briefs and --var). */
export function baseVariables(docDir, config, briefLanguage, env = process.env) {
  const language = typeof config.language === "string" ? config.language : briefLanguage;
  const contentDir = slash(config.paths?.content ?? "content");
  const appDir = appDirInfo(docDir, config).dir;
  const slug = config.product?.slug ?? slugOf(config.product?.name);
  // Same defaults as the kit: env.prefix is the slug in upper case; the URL may come from DOC_KIT_URL or <PREFIX>_URL.
  const envPrefix = config.env?.prefix ?? slug.toUpperCase().replace(/-/g, "_");
  const vars = {
    product: config.product?.name ?? "",
    slug,
    language,
    languageName: LANGUAGE_NAMES[briefLanguage]?.[language] ?? language,
    appUrl: String(envValue("URL", envPrefix, env) ?? config.app?.url ?? "").replace(/\/+$/, ""),
    envPrefix,
    docDir,
    appDir,
    plansDir: slash(config.capture?.plans ?? "captures/plans"),
    kitPath: kitPath(docDir),
    version: readVersion(docDir, config, appDir),
    date: today(),
    contentDir,
    tocFile: firstExisting(docDir, [`${contentDir}/toc.json`, `${contentDir}/sommaire.json`]),
    glossaryFile: firstExisting(docDir, [`${contentDir}/glossary.json`, `${contentDir}/glossaire.json`]),
    imagesDir: slash(config.paths?.images ?? "images"),
    diagramsDir: slash(config.paths?.diagrams ?? "diagrams"),
    targetsFile: firstExisting(docDir, ["captures/targets.mjs", "captures/cibles.mjs"]),
    guideFile: firstExisting(docDir, ["WRITING-GUIDE.md", "GUIDE-REDACTION.md"]),
    findingsPage: FINDINGS_PAGE[language] ?? FINDINGS_PAGE.en,
    consolidationFile: `${WORK_DIR}/consolidation.md`,
  };
  // Screenshots of the project: "none" when doc.config.mjs declares capture.mode "none" (no screenshot at all).
  vars.screenshots = config.capture?.mode === "none" ? "none" : "app";
  if (vars.screenshots === "none") vars.captureMode = "none";
  else if (config.capture?.setup) vars.captureMode = "demo";
  const extra = config.extra?.briefs;
  if (extra && typeof extra === "object") {
    for (const [k, val] of Object.entries(extra)) vars[k] = Array.isArray(val) ? val.join(", ") : String(val);
  }
  return vars;
}

/** --var key=value (a value "@path" is read from that file, looked up from the current folder, then the project). */
export function readVars(list, docDir) {
  const vars = {};
  for (const raw of list ?? []) {
    const i = raw.indexOf("=");
    if (i < 1) throw new ExitError(2, t("varMalformed", { raw }), t("varMalformed_todo"));
    const key = raw.slice(0, i).trim();
    let value = raw.slice(i + 1);
    if (!/^[\w.-]+$/.test(key)) throw new ExitError(2, t("varName", { key }), t("varName_todo"));
    if (value.startsWith("@")) {
      const candidates = [path.resolve(value.slice(1)), path.resolve(docDir, value.slice(1))];
      const found = candidates.find((f) => fs.existsSync(f));
      if (!found) throw new ExitError(2, t("varFile", { file: value.slice(1) }), t("varFile_todo"));
      value = fs.readFileSync(found, "utf8").replace(/\s+$/, "");
    }
    vars[key] = value;
  }
  return vars;
}

const RE_BLOCK = /\{\{#if\s+([^}]+?)\s*\}\}((?:(?!\{\{#if\s)[\s\S])*?)\{\{\/if\}\}/;
const RE_VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

const valueOf = (vars, key) => (vars[key] == null ? "" : String(vars[key]));
const isEmpty = (v) => v.trim() === "";

/** Placeholders used by a template (substitutions and conditions). */
export function templateVariables(template) {
  const names = new Set();
  for (const m of template.matchAll(/\{\{#if\s+([\w.-]+)/g)) names.add(m[1]);
  for (const m of template.matchAll(RE_VAR)) names.add(m[1]);
  return [...names];
}

/**
 * Fills a template: blocks {{#if key}}…{{/if}} (non-empty value), {{#if key=value}}, {{#if key!=value}}
 * (nestable), then {{key}}. Returns the text and the placeholders left unfilled (an empty placeholder
 * stays written as {{key}}; a key=value condition on an empty key is reported too).
 */
export function fill(template, vars) {
  const unfilled = new Set();
  const test = (cond) => {
    const m = cond.match(/^([\w.-]+)\s*(!=|=)\s*(.*)$/);
    if (m) {
      const v = valueOf(vars, m[1]).trim();
      if (v === "") unfilled.add(m[1]);
      return m[2] === "=" ? v === m[3].trim() : v !== m[3].trim();
    }
    return !isEmpty(valueOf(vars, cond.trim()));
  };
  let text = template;
  for (let m = RE_BLOCK.exec(text); m; m = RE_BLOCK.exec(text)) {
    text = text.slice(0, m.index) + (test(m[1]) ? m[2] : "") + text.slice(m.index + m[0].length);
  }
  text = text.replace(RE_VAR, (whole, key) => {
    const v = valueOf(vars, key);
    if (isEmpty(v)) {
      unfilled.add(key);
      return whole;
    }
    // Multi-line value (a list read with --var key=@file): an indented bullet list.
    if (v.includes("\n")) {
      const lines = v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return `\n${lines.map((l) => `  ${l.startsWith("- ") ? l : `- ${l}`}`).join("\n")}`;
    }
    return v;
  });
  text = text.replace(/\n(?:[ \t]*\n){2,}/g, "\n\n");
  return { text, unfilled: [...unfilled] };
}

/** Strict parseArgs, with a usage error (exit code 2) instead of a raw exception. */
export function parseOptions(options, usage) {
  try {
    return parseArgs({ allowPositionals: true, options });
  } catch (e) {
    throw new ExitError(2, String(e?.message ?? e), usage);
  }
}

/** Checks a language option. */
export function checkLanguage(value, label = "--lang") {
  if (value != null && !LANGUAGES.includes(value)) throw new ExitError(2, t("language", { value }), t("language_todo", { label }));
  return value;
}

/** Runs a command and turns an ExitError into a message and an exit code. */
export async function run(main) {
  try {
    process.exitCode = (await main()) ?? 0;
  } catch (e) {
    if (e instanceof ExitError) {
      error(e.message, e.todo);
      process.exitCode = e.code;
    } else {
      error(t("unexpected", { error: e?.stack ?? e }));
      process.exitCode = 2;
    }
  }
}
