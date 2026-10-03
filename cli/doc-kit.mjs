#!/usr/bin/env node
// Command-line entry point: dispatches to cli/commands/<command>.mjs; without a command, the guided mode.
// Global options: --project <dir>, --json, --verbose, --lang en|fr, --profile, --help, --version.
// Exit codes: 0 OK · 1 failed check · 2 usage or configuration · 3 environment.
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createContext, printKitError, prompterOf, shownPath, absolutePath } from "./common.mjs";
import { KitError, EXIT } from "../engine/project/errors.mjs";
import { findProject } from "../engine/project/find.mjs";
import { BRAND } from "../engine/brand.mjs";
import { reloadConfig, sessionInfo, captureCount } from "../engine/dev/environment.mjs";
import { readSyncReference } from "../engine/sync/reference.mjs";
import { readProjectVersion } from "../engine/build/build.mjs";
import { languageCounts } from "../engine/build/languages.mjs";
import { createTimer, usageFolder, appendUsage } from "../engine/stats/usage.mjs";
import { syncPath } from "../engine/sync/reference.mjs";
import { WORK_DIR } from "./commands/audit.mjs";
import { readToc } from "../engine/project/toc.mjs";
import { SKILL_NAME } from "./commands/skill.mjs";

const FOLDER = path.dirname(fileURLToPath(import.meta.url));

/** Commands delivered so far: every module present in cli/commands/ (one file per command). */
export const COMMANDS = fs
  .readdirSync(path.join(FOLDER, "commands"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => f.slice(0, -4))
  .sort();
/** Commands announced but not delivered yet ({ name: "release" }); empty when every command exists. */
export const LATER = {};

const GLOBALS = {
  project: { type: "string" },
  json: { type: "boolean" },
  verbose: { type: "boolean" },
  lang: { type: "string" },
  profile: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

/**
 * Runs the CLI and returns the exit code (never calls process.exit: testable).
 * @param {string[]} argv  arguments, without "node" and the script
 * @param {{ stdout?, stderr?, env? }} [io]
 */
export async function runCli(argv, io = {}) {
  const modules = Object.fromEntries(
    await Promise.all(COMMANDS.map(async (c) => [c, await import(pathToFileURL(path.join(FOLDER, "commands", `${c}.mjs`)).href)]))
  );
  const all = { ...GLOBALS };
  for (const m of Object.values(modules)) Object.assign(all, m.options || {});

  // Message language first (to report an invalid option in the right language).
  const iLang = argv.indexOf("--lang");
  const ctx = createContext({ lang: iLang >= 0 ? argv[iLang + 1] : undefined }, io);

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: all, allowPositionals: true, strict: true }));
  } catch (e) {
    ctx.error("option.invalid", { error: e.message });
    return EXIT.USAGE;
  }
  Object.assign(ctx.globals, values);
  if (values.lang && !["en", "fr"].includes(values.lang)) {
    ctx.error("option.value", { option: "lang", value: values.lang, expected: "en | fr" });
    return EXIT.USAGE;
  }
  // Every command speaks the project's language (config.language) unless --lang is given, from its first
  // message, whether or not it loads the whole project (doctor checks it piece by piece). `init` creates a project
  // somewhere else: it keeps --lang, DOC_KIT_LANG or English (its help too).
  if ((positionals[0] === "help" ? positionals[1] : positionals[0]) !== "init") await ctx.useProjectLanguage();
  if (values.version) {
    ctx.print(ctx.t("cli.version", { name: BRAND.name, version: BRAND.version }));
    return EXIT.OK;
  }
  const [name, ...rest] = positionals;
  // Help: `--help` or `help` alone → the commands; `<command> --help` or `help <command>` → that command.
  if (values.help || name === "help") {
    const topic = name === "help" ? rest[0] : name;
    if (!topic) {
      ctx.print(ctx.t("cli.usage"));
      return EXIT.OK;
    }
    if (!modules[topic]) {
      ctx.error("command.unknown", { name: topic, available: COMMANDS.join(", ") });
      return EXIT.USAGE;
    }
    ctx.print(`${ctx.t(`cli.help.${topic}`, { work: WORK_DIR, skill: SKILL_NAME })}\n\n${ctx.t("cli.help.globals")}`);
    return EXIT.OK;
  }
  if (!name) return runSafely(ctx, () => guided({ ctx, modules, values }));
  if (!modules[name] && LATER[name]) {
    ctx.error("command.notYet", { name, batch: LATER[name], available: COMMANDS.join(", ") });
    return EXIT.USAGE;
  }
  const module = modules[name];
  if (!module) {
    ctx.error("command.unknown", { name, available: COMMANDS.join(", ") });
    return EXIT.USAGE;
  }
  // An option that belongs to another command is a usage error.
  for (const k of Object.keys(values))
    if (!(k in GLOBALS) && !(k in (module.options || {}))) {
      ctx.error("option.invalid", { error: `--${k} (${name})` });
      return EXIT.USAGE;
    }
  ctx.timer = createTimer();
  const end = ctx.timer.start(STEP_OF[name] || name);
  const code = await runSafely(ctx, () => module.run({ ctx, values, positionals: rest }));
  end({ exit: code });
  recordUsage(ctx, name);
  return code;
}

/**
 * The block each command measures (ETUDE-CAPTURES.md §6): the step a run counts under in usage/<version>.jsonl.
 * Commands absent here (dev, open, view, doctor, init, skill, stats, export, upgrade, migrate) are not recorded.
 */
export const STEP_OF = Object.freeze({
  connect: "setup",
  demo: "setup",
  capture: "capture",
  record: "capture",
  facts: "facts",
  inventory: "analysis",
  probe: "analysis",
  new: "generate",
  context: "generate",
  translate: "translate",
  sync: "update",
  changes: "update",
  build: "build",
  optimize: "build",
  check: "check",
  audit: "audit",
});

/**
 * Appends the run's spans to the project's usage/<version>.jsonl (when the project records statistics), and prints
 * them with --profile. Never fails the command: statistics are a by-product.
 */
function recordUsage(ctx, name) {
  const spans = ctx.timer.spans;
  if (ctx.globals.profile) printProfile(ctx, spans);
  if (!(name in STEP_OF) || !ctx.project?.root || !ctx.config) return;
  try {
    const dir = usageFolder(ctx.project.root, ctx.env);
    if (!dir) return;
    const version = readProjectVersion(ctx.project.root, ctx.config.version);
    const phase = name === "translate" ? "translate" : fs.existsSync(syncPath(ctx.project.root, ctx.config)) ? "update" : "create";
    // The command's own span last in time, first in the file: easier to read.
    appendUsage({ dir, version, command: name, phase, spans: [spans.at(-1), ...spans.slice(0, -1)] });
  } catch {
    // a read-only folder, a version file that cannot be read: the command's result stands
  }
}

/** --profile: the spans of the run, longest first, with their share of the command's time. */
function printProfile(ctx, spans) {
  const total = spans.at(-1)?.ms || 0;
  const rows = [...spans].sort((a, b) => b.ms - a.ms);
  ctx.printErr(`\n${ctx.t("cli.profile.title", { ms: total })}`);
  for (const s of rows) {
    const label = s.sub ? `  ${s.step} › ${s.sub}${s.part ? ` › ${s.part}` : ""}` : s.step;
    const share = total ? ` ${((s.ms / total) * 100).toFixed(0).padStart(3)} %` : "";
    ctx.printErr(`${String(s.ms).padStart(8)} ms${share}  ${label}`);
  }
}

/** Runs a command: a KitError becomes its message and exit code; any other error, an internal error. */
async function runSafely(ctx, fn) {
  try {
    return (await fn()) ?? EXIT.OK;
  } catch (e) {
    if (e instanceof KitError) {
      printKitError(ctx, e);
      if (ctx.verbose && e.cause) ctx.printErr(String(e.cause.stack || e.cause));
      return e.code;
    }
    ctx.error("internalError", { error: e.message });
    if (ctx.verbose) ctx.printErr(String(e.stack));
    return EXIT.CHECK;
  } finally {
    ctx.prompter?.close();
  }
}

// ─── Guided mode (no command) ─────────────────────────────────────────────────
// Detects where the person stands and offers the next step; runs it once confirmed. Without a terminal (CI,
// pipes), only prints the suggestion and exits with code 0.

/**
 * Where the person stands.
 * @param {{ project?: string, cwd?: string, env?: object }} p
 * @returns {Promise<{ step: "init"|"install"|"doctor"|"connect"|"capture"|"sync"|"translate"|"menu", folder: string, root?: string,
 *   config?: object, error?: KitError, session?: object }>}
 *   init: no documentation project here · install: the project's dependencies are missing (npm install) ·
 *   doctor: the configuration cannot be used · connect: no session while the app needs a sign-in ·
 *   capture: no screenshot yet · sync: the application moved on since the last check (ARCHITECTURE.md §6.10) ·
 *   translate: a declared language (§6.12) has a stale or missing file · menu: everything is in place (dev, audit, build…)
 */
export async function detectSituation({ project, cwd = process.cwd(), env = process.env } = {}) {
  let found;
  try {
    found = findProject({ project, from: cwd });
  } catch (e) {
    if (e instanceof KitError) return { step: "init", folder: path.resolve(cwd, project || ".") };
    throw e;
  }
  const root = found.root;
  let config;
  try {
    config = await reloadConfig(root, env);
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    return { step: e.key === "project.depsMissing" ? "install" : "doctor", folder: root, root, error: e };
  }
  // A documentation without screenshots (capture.mode "none") needs neither a session nor a capture.
  if (config.capture.mode === "none") return { step: "menu", folder: root, root, config };
  const session = sessionInfo({ root, config, env });
  if (session.needed && !session.exists) return { step: "connect", folder: root, root, config, session };
  if (captureCount(root, config) === 0) return { step: "capture", folder: root, root, config };
  // What the documentation must follow since the last check (ARCHITECTURE.md §6.10): no git here, only the
  // documented version against the one sync.json last saw.
  const { reference } = readSyncReference(root, config);
  if (reference && reference.app.version !== readProjectVersion(root, config.version)) return { step: "sync", folder: root, root, config };
  // Languages (ARCHITECTURE.md §6.12): a translation behind or missing, shown as "translate status".
  if (config.languages && config.languages.slice(1).some((lang) => { const c = languageCounts({ root, config, toc: safeToc(root, config), lang }); return c.stale > 0 || c.missing > 0; }))
    return { step: "translate", folder: root, root, config };
  return { step: "menu", folder: root, root, config };
}

/** A read-only table of contents for `detectSituation` (an invalid or missing one is `doctor`'s job to report,
 * not the guided mode's: a project that cannot be built never reaches this check anyway, since `doctor`/`build`
 * steps come first). */
function safeToc(root, config) {
  // The shared reader (engine/project/toc.mjs): the legacy sommaire.json and French keys are read too.
  return readToc(root, config.paths.content).toc || { sections: [] };
}

/** Commands offered once everything is in place, in this order; `translate status` only with `languages`
 * declared (ARCHITECTURE.md §6.12) — built by a function, not a constant, since it depends on the project. */
export const MENU = ["dev", "audit", "build", "doctor"];
export const menuFor = (config) => [...MENU, ...(config?.languages ? ["translate"] : [])];

async function guided({ ctx, modules, values }) {
  const s = await detectSituation({ project: values.project, env: ctx.env });
  if (s.config && !values.lang) ctx.setLanguage(s.config.language);
  const menu = menuFor(s.config);
  const command = (step) =>
    step === "init" ? `${BRAND.command} init ${shownPath(s.folder)}` : step === "install" ? "npm install" : step === "translate" ? `${BRAND.command} translate status` : `${BRAND.command} ${step}`;
  if (ctx.json) {
    ctx.print(JSON.stringify({ step: s.step, folder: s.folder, next: s.step === "menu" ? menu.map(command) : [command(s.step)] }, null, 2));
    return EXIT.OK;
  }
  const p = ctx.paint;
  ctx.print(p.bold(ctx.t("cli.guided.title", { name: BRAND.name, version: BRAND.version })));
  // The folder in full ("No documentation project in ." was ambiguous), quoted when it holds a space.
  const vars = { folder: absolutePath(s.folder), command: BRAND.command, product: s.config?.product.name ?? "" };
  ctx.print(ctx.t(`cli.guided.situation.${s.step}`, vars));
  if (s.config?.capture.mode === "none") ctx.print(p.dim(ctx.t("cli.guided.noCapture")));
  if (s.error) printKitError(ctx, s.error);
  // Production: the banner before anything that opens the application (connect, capture).
  const production = s.config?.capture.target === "production" && (s.step === "connect" || s.step === "capture");
  if (production) ctx.print(p.warn(p.bold(ctx.t("cli.guided.production", { url: s.config.app.url || "—" }))));

  if (!ctx.interactive) {
    const next = s.step === "menu" ? menu.map(command).join(" · ") : command(s.step);
    ctx.print(`
${ctx.t("cli.guided.next", { command: next })}`);
    ctx.print(p.dim(ctx.t("cli.guided.notInteractive")));
    return EXIT.OK;
  }

  const prompt = prompterOf(ctx);
  let step = s.step;
  if (s.step === "menu") {
    step = await prompt.choose(
      ctx.t("cli.guided.ask.menu"),
      [...menu.map((m) => ({ value: m, label: `${p.cmd(command(m))}  ${p.dim(ctx.t(`cli.guided.menu.${m}`))}` })), { value: "quit", label: ctx.t("cli.guided.menu.quit") }],
      "dev"
    );
    if (step === "quit") return EXIT.OK;
  } else if (!(await prompt.confirm(ctx.t(s.step === "connect" ? "cli.guided.ask.connect" : "cli.guided.ask.run", { command: command(s.step) }), true))) {
    ctx.print(ctx.t("cli.guided.later", { command: command(s.step) }));
    return EXIT.OK;
  }
  ctx.print("");
  // Only init keeps asking through the same prompter; any other step gets the terminal back (Ctrl+C stops
  // `dev`, `connect` reads its own Enter).
  if (step !== "init") {
    ctx.prompter?.close();
    ctx.prompter = null;
  }
  if (step === "install") {
    const r = spawnSync("npm", ["install"], { cwd: s.root, stdio: "inherit", shell: process.platform === "win32" });
    return r.status === 0 ? EXIT.OK : EXIT.ENVIRONMENT;
  }
  const module = modules[step];
  if (!module) {
    ctx.error("command.notYet", { name: step, batch: LATER[step] || "?", available: COMMANDS.join(", ") });
    return EXIT.USAGE;
  }
  const globals = Object.fromEntries(Object.entries(values).filter(([k]) => k in GLOBALS));
  // A production capture was confirmed right after its banner: capture does not ask a second time.
  const confirmed = production && step === "capture" ? { yes: true } : {};
  return module.run({ ctx, values: { ...globals, ...confirmed }, positionals: step === "init" ? [s.folder] : step === "translate" ? ["status"] : [] });
}

/** Is this file the program being run? Real paths: npm links the kit (symlink, Windows junction) into projects. */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
