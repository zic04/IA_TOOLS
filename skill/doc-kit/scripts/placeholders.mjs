// The placeholders of the briefs (brief.mjs, consolidation.mjs): their values, computed from doc.config.mjs and the
// project (baseVariables, appDirInfo), the --var values (readVars), and the filling of a template (fill). Node >= 20,
// no dependency; the messages are common.mjs's.
import fs from "node:fs";
import path from "node:path";
import { ExitError, SKILL_ROOT, WORK_DIR, kitCommand, kitPath, quotedPath, t } from "./common.mjs";

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

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const slash = (p) => p.replace(/\\/g, "/"); // a path the configuration writes, whatever machine it was written on

/**
 * {{scriptsDir}}: the skill's scripts folder as the briefs write it, between bash's double quotes (`node
 * "{{scriptsDir}}/analysis.mjs" check …`), escaped as the kit's path in {{KIT_CLI}} is (common.mjs quotedPath): bash,
 * then the agents' guard, read it back as the skill's folder, whatever its name holds (a quote, `$`, a backquote; a
 * backslash, which separates folders on Windows only).
 * @param {string} skillRoot  @param {{ windows?: boolean }} [machine]
 */
export function scriptsDirFor(skillRoot, { windows = process.platform === "win32" } = {}) {
  return quotedPath(`${skillRoot}/scripts`, windows);
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

/** The `features` coverage adapter's `file` option (ARCHITECTURE.md §6.8), relative to the project; "features.json" by default. */
function featuresFileOf(config) {
  const entry = (Array.isArray(config.coverage) ? config.coverage : []).find((e) => e?.adapter === "features");
  return slash(entry?.file ?? "features.json");
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
  const configured =
    typeof config.app?.dir === "string" && config.app.dir.trim() ? path.resolve(docDir, config.app.dir) : "";
  let dir = given ? path.resolve(docDir, given) : configured;
  /** @type {"given"|"config"|"git"|"parent"} */
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
    // The kit's CLI by the path the agents' guard knows (never one the documentation project names).
    KIT_CLI: kitCommand(kitPath()),
    version: readVersion(docDir, config, appDir),
    date: today(),
    contentDir,
    // Languages (ARCHITECTURE.md §6.12): translationsDir, for the `translate` brief ({{translationsDir}}/{{lang}}/…).
    translationsDir: slash(config.paths?.translations ?? "translations"),
    tocFile: `${contentDir}/toc.json`,
    glossaryFile: `${contentDir}/glossary.json`,
    imagesDir: slash(config.paths?.images ?? "images"),
    diagramsDir: slash(config.paths?.diagrams ?? "diagrams"),
    factsDir: slash(config.paths?.facts ?? "facts"),
    featuresFile: featuresFileOf(config),
    // The analyses of the features (ARCHITECTURE.md §6.11a): the skill's scripts, the project's kinds of behaviour.
    scriptsDir: scriptsDirFor(SKILL_ROOT),
    behavioursFile: typeof config.behaviours?.file === "string" ? slash(config.behaviours.file) : "",
    targetsFile: "captures/targets.mjs",
    guideFile: "WRITING-GUIDE.md",
    findingsPage: FINDINGS_PAGE[language] ?? FINDINGS_PAGE.en,
    consolidationFile: `${WORK_DIR}/consolidation.md`,
  };
  // Screenshots of the project: "none" when doc.config.mjs declares capture.mode "none" (no screenshot at all).
  vars.screenshots = config.capture?.mode === "none" ? "none" : "app";
  // The capture mode of the briefs: none, production (capture.target "production"), demo (capture.target "demo", or a
  // demo setup script); --var captureMode=… still wins.
  if (vars.screenshots === "none") vars.captureMode = "none";
  else if (config.capture?.target === "production") vars.captureMode = "production";
  else if (config.capture?.target === "demo" || config.capture?.setup) vars.captureMode = "demo";
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
      const lines = v
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      return `\n${lines.map((l) => `  ${l.startsWith("- ") ? l : `- ${l}`}`).join("\n")}`;
    }
    return v;
  });
  text = text.replace(/\n(?:[ \t]*\n){2,}/g, "\n\n");
  return { text, unfilled: [...unfilled] };
}
