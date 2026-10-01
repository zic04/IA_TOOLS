#!/usr/bin/env node
// Command-line entry point: dispatches to cli/commands/<command>.mjs; without a command, the guided mode.
// Global options: --project <dir>, --json, --verbose, --lang en|fr, --help, --version.
// Exit codes: 0 OK · 1 failed check · 2 usage or configuration · 3 environment.
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createContext, printKitError, prompterOf, shownPath } from "./common.mjs";
import { KitError, EXIT } from "../engine/project/errors.mjs";
import { findProject } from "../engine/project/find.mjs";
import { BRAND } from "../engine/brand.mjs";
import { reloadConfig, sessionInfo, captureCount } from "../engine/dev/environment.mjs";

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
  // somewhere else: it keeps --lang, DOC_KIT_LANG or English.
  if (positionals[0] !== "init") await ctx.useProjectLanguage();
  if (values.version) {
    ctx.print(ctx.t("cli.version", { name: BRAND.name, version: BRAND.version }));
    return EXIT.OK;
  }
  const [name, ...rest] = positionals;
  if (values.help) {
    ctx.print(ctx.t("cli.usage"));
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
  return runSafely(ctx, () => module.run({ ctx, values, positionals: rest }));
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
 * @returns {Promise<{ step: "init"|"install"|"doctor"|"connect"|"capture"|"menu", folder: string, root?: string,
 *   config?: object, error?: KitError, session?: object }>}
 *   init: no documentation project here · install: the project's dependencies are missing (npm install) ·
 *   doctor: the configuration cannot be used · connect: no session while the app needs a sign-in ·
 *   capture: no screenshot yet · menu: everything is in place (dev, audit, build…)
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
  const session = sessionInfo({ root, config, env });
  if (session.needed && !session.exists) return { step: "connect", folder: root, root, config, session };
  if (captureCount(root, config) === 0) return { step: "capture", folder: root, root, config };
  return { step: "menu", folder: root, root, config };
}

/** Commands offered once everything is in place, in this order. */
export const MENU = ["dev", "audit", "build", "doctor"];

async function guided({ ctx, modules, values }) {
  const s = await detectSituation({ project: values.project, env: ctx.env });
  if (s.config && !values.lang) ctx.setLanguage(s.config.language);
  const command = (step) => (step === "init" ? `${BRAND.command} init ${shownPath(s.folder)}` : step === "install" ? "npm install" : `${BRAND.command} ${step}`);
  if (ctx.json) {
    ctx.print(JSON.stringify({ step: s.step, folder: s.folder, next: s.step === "menu" ? MENU.map(command) : [command(s.step)] }, null, 2));
    return EXIT.OK;
  }
  const p = ctx.paint;
  ctx.print(p.bold(ctx.t("cli.guided.title", { name: BRAND.name, version: BRAND.version })));
  const vars = { folder: shownPath(s.folder), command: BRAND.command, product: s.config?.product.name ?? "" };
  ctx.print(ctx.t(`cli.guided.situation.${s.step}`, vars));
  if (s.error) printKitError(ctx, s.error);

  if (!ctx.interactive) {
    const next = s.step === "menu" ? MENU.map(command).join(" · ") : command(s.step);
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
      [...MENU.map((m) => ({ value: m, label: `${p.cmd(command(m))}  ${p.dim(ctx.t(`cli.guided.menu.${m}`))}` })), { value: "quit", label: ctx.t("cli.guided.menu.quit") }],
      "dev"
    );
    if (step === "quit") return EXIT.OK;
  } else if (!(await prompt.confirm(ctx.t("cli.guided.ask.run", { command: command(s.step) }), true))) {
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
  return module.run({ ctx, values: globals, positionals: step === "init" ? [s.folder] : [] });
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
