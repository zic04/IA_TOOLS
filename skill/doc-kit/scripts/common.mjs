// Shared helpers of the skill's scripts (Node >= 20, no dependency): the messages, the kit's path and its command,
// find the documentation project, load doc.config.mjs, the economy of the agents. The placeholders of the briefs and
// the filling of a template are placeholders.mjs's.
// Messages: English by default; setMessageLanguage("fr") switches them (brief.mjs speaks the project's language).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, "..");
export const WORK_DIR = ".doc-kit";
export const LANGUAGES = ["en", "fr"];
export const AGENTS_DIR = path.join(SKILL_ROOT, "agents");
/** The agent types of the economy of the agents (ARCHITECTURE.md §6.11), in a stable order. */
export const AGENT_TYPES = ["doc-kit-triage", "doc-kit-writer", "doc-kit-reviewer", "doc-kit-analyst"];

// ─── Messages (en, fr) ───────────────────────────────────────────────────────
// skill/doc-kit/i18n/<lang>.json, installed with the skill: a `common` section, then one section per script
// (brief, usage, consolidation, analysis), chosen by useMessages(). Same keys and {variables} in en and fr
// (test/unit/skill.test.mjs).
const MESSAGES = Object.fromEntries(
  LANGUAGES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, "i18n", `${l}.json`), "utf8"))]),
);
let messageLanguage = "en";
let messageSection = null;

/** Language of the messages of the scripts (en by default). */
export function setMessageLanguage(language) {
  if (LANGUAGES.includes(language)) messageLanguage = language;
  return messageLanguage;
}

/** The section of the messages of the running script (brief, usage, consolidation, analysis), on top of `common`. */
export function useMessages(section) {
  messageSection = section;
}

/** A message in the current language, with its {variables}; the English text when the key is missing. */
export function t(key, vars = {}) {
  const own = (l) => (messageSection ? MESSAGES[l][messageSection]?.[key] : undefined) ?? MESSAGES[l].common[key];
  const text = own(messageLanguage) ?? own("en") ?? key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

// Replaced whole by `doc-kit skill install` with the kit's location as a JSON string (a backquote, `${` or a quote
// in it stays a character). In the kit's own source tree the token stays, and the kit is found from this file.
const INSTALLED_KIT = "{{KIT_PATH}}";

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
  Boolean(dir) &&
  ["ARCHITECTURE.md", path.join("cli", "doc-kit.mjs"), path.join("engine", "brand.mjs")].some((f) =>
    fs.existsSync(path.join(dir, f)),
  );

/** The kit's location: the path written at install time, else the source tree that contains this skill, else a
 * `file:` dependency of the documentation project (how a project depends on the kit). */
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

/** A path of this machine with forward slashes: a backslash separates folders on Windows only (a POSIX name's own). */
const machinePath = (p, windows = process.platform === "win32") => (windows ? String(p).split("\\").join("/") : p);

/**
 * A path of this machine as it stands between bash's double quotes, `"<path>"`: forward slashes on Windows, and `"`,
 * `$`, a backquote and a backslash escaped, so that bash reads it back as the path, whatever its names hold.
 * @param {string} p  @param {boolean} [windows]
 */
export const quotedPath = (p, windows = process.platform === "win32") =>
  machinePath(p, windows).replace(/["$`\\]/g, "\\$&");

/**
 * The command that runs the kit's CLI by its path, `node "<kit>/cli/doc-kit.mjs"` (the path escaped for bash's double
 * quotes): {{KIT_CLI}} of the briefs and of the texts `skill install` writes, the only form the agents' guard lets
 * through (scripts/bash-decision.mjs). Never `npx doc-kit`: npx runs the first doc-kit of a node_modules/.bin up to
 * the root, the application's when the documentation sits inside it. "" without a kit.
 * @param {string} dir  the kit's folder
 * @param {{ windows?: boolean }} [machine]  a backslash separates folders on Windows only: elsewhere, a name holds it
 */
export function kitCommand(dir, { windows = process.platform === "win32" } = {}) {
  return dir ? `node "${quotedPath(dir, windows)}/cli/doc-kit.mjs"` : "";
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
      throw new ExitError(
        2,
        t("configUnreadable", { error: String(e?.message).split("\n")[0] }),
        t("configUnreadable_todo"),
      );
    }
    const source = fs
      .readFileSync(file, "utf8")
      .replace(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/g, (whole, names, specifier) =>
        isBareSpecifier(specifier)
          ? names
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean)
              .map(
                (n) =>
                  `const ${n
                    .split(/\s+as\s+/)
                    .pop()
                    .trim()} = (c) => c;`,
              )
              .join(" ")
          : whole,
      );
    const tmp = path.join(docDir, `.doc-kit-config-${process.pid}.mjs`);
    fs.writeFileSync(tmp, source);
    try {
      mod = await import(pathToFileURL(tmp).href);
    } catch (e2) {
      throw new ExitError(
        2,
        t("configUnreadable", { error: String(e2?.message).split("\n")[0] }),
        t("configUnreadableDeps_todo"),
      );
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

// ─── Economy of the agents (ARCHITECTURE.md §6.11) ──────────────────────────

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** A field of a `---\nkey: value\n---` front matter block at the start of `text` ("" when absent). */
function frontMatterField(text, field) {
  const m = FRONT_MATTER.exec(String(text ?? ""));
  if (!m) return "";
  const line = new RegExp(`^${field}:\\s*(\\S+)\\s*$`, "m").exec(m[1]);
  return line ? line[1] : "";
}

/** The `agent: <type>` declared by a brief template ("" when absent: not a brief launched as an agent). */
export const templateAgent = (template) => frontMatterField(template, "agent");

/**
 * The output of a brief by the size of its subject — `output-tokens: S=6000,M=12000,L=20000` in its front matter,
 * for a brief whose subject is a feature rather than pages — or null without a complete one.
 * @returns {{ S: number, M: number, L: number }|null}
 */
export function outputBySize(template) {
  const sizes = {};
  for (const part of frontMatterField(template, "output-tokens").split(",")) {
    const [size, tokens] = part.split("=");
    if (/^[SML]$/.test(size) && /^\d{1,7}$/.test(tokens ?? "")) sizes[size] = Number(tokens);
  }
  return ["S", "M", "L"].every((s) => s in sizes) ? /** @type {any} */ (sizes) : null;
}

/**
 * Model of each brief by default (ETUDE-CAPTURES.md §7, G4): the cheapest model whose quality suffices for the
 * task, instead of the agent type's own model. A brief absent here runs on its agent type's model
 * (agents/<type>.md). `llm.routing` in doc.config.mjs overrides any entry ({ "<brief>": "<model>" }).
 *   haiku   triage, translation and deepening: decisions and faithful rewriting from a single dossier
 *   sonnet  writing, updates, corrections, verification of findings, maintainability review
 *   opus    the few judgments every later page depends on (inventory, code health, security, production dossier)
 */
export const DEFAULT_ROUTING = Object.freeze({
  triage: "haiku",
  translate: "haiku",
  deepen: "haiku",
  "findings-verification": "sonnet",
  "maintainability-review": "sonnet",
  "page-corrections": "sonnet",
  "capture-plans": "sonnet",
  inventory: "opus",
  "code-health": "opus",
  "security-review": "opus",
  "production-technical": "opus",
});

/** The model a brief runs on: llm.routing, then DEFAULT_ROUTING, then its agent type's model. */
export function briefModel(name, agent, config = {}) {
  const routed = config.llm?.routing?.[name];
  if (typeof routed === "string" && routed) return routed;
  return DEFAULT_ROUTING[name] || (agent ? agentModel(agent) : "");
}

/** The `model: <name>` declared by an agent definition file (agents/<type>.md), read once per process. */
const agentModelCache = new Map();
export function agentModel(type, agentsDir = AGENTS_DIR) {
  if (!agentModelCache.has(agentsDir)) agentModelCache.set(agentsDir, new Map());
  const cache = agentModelCache.get(agentsDir);
  if (!cache.has(type)) {
    const file = path.join(agentsDir, `${type}.md`);
    cache.set(type, fs.existsSync(file) ? frontMatterField(fs.readFileSync(file, "utf8"), "model") : "");
  }
  return cache.get(type);
}

/**
 * Dynamically imports a module of the kit's engine, by path relative to the kit root. The installed skill does
 * not carry `engine/`: callers degrade gracefully (null) when the kit root is unknown or the file is missing.
 */
export async function importKitModule(kitRoot, relPath) {
  if (!kitRoot) return null;
  const file = path.join(kitRoot, ...relPath.split("/"));
  if (!fs.existsSync(file)) return null;
  try {
    return await import(pathToFileURL(file).href);
  } catch {
    return null;
  }
}

/**
 * Flattened pages of the project's table of contents (`<content>/toc.json`: id, template, file…), a byte-order
 * mark tolerated. `[]` when there is no table of contents or it cannot be parsed.
 */
export function flattenedPages(docDir, config) {
  const abs = path.join(docDir, config?.paths?.content ?? "content", "toc.json");
  if (!fs.existsSync(abs)) return [];
  let toc;
  try {
    const text = fs.readFileSync(abs, "utf8");
    toc = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return [];
  }
  const pages = [];
  for (const sec of toc?.sections || [])
    for (const g of sec.groups || []) for (const p of g.pages || []) if (p && p.id) pages.push(p);
  return pages;
}

/** The kit's page template table (engine/core/page-templates.mjs), or null when the kit's engine is unreachable. */
export async function pageTemplatesTable(kitRoot) {
  const mod = await importKitModule(kitRoot, "engine/core/page-templates.mjs");
  return mod ? mod.loadPageTemplates(kitRoot) : null;
}

/** Word limit of a type in `table` ("" table: the kit's own default, 2000). */
export const maxWordsOf = (table, type) => table?.types?.[type]?.maxWords ?? 2000;

/** Backtick-wrapped, slash-containing, whitespace-free spans of `text`: candidate cited file paths. */
export function citedPaths(text) {
  return [...new Set([...String(text ?? "").matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1]))];
}

/**
 * Parses a `pages` brief variable into page ids: one per line (bullets "- id" from a `--var pages=@file` list
 * stripped), else split on commas; blanks dropped.
 */
export function parsePageList(text) {
  const raw = String(text ?? "");
  const lines = raw.includes("\n") ? raw.split(/\r?\n/) : raw.split(",");
  return lines.map((l) => l.trim().replace(/^-\s*/, "")).filter(Boolean);
}

/**
 * Strict parseArgs, with a usage error (exit code 2) instead of a raw exception.
 * @returns {{ values: Record<string, any>, positionals: string[] }}
 */
export function parseOptions(options, usage) {
  try {
    return parseArgs({ allowPositionals: true, options });
  } catch (e) {
    throw new ExitError(2, String(e?.message ?? e), usage);
  }
}

/** Checks a language option. */
export function checkLanguage(value, label = "--lang") {
  if (value != null && !LANGUAGES.includes(value))
    throw new ExitError(2, t("language", { value }), t("language_todo", { label }));
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
