// Shared helpers of the commands: translated messages (✖ what is wrong / → what to do), project loading,
// built site, colours (only on a terminal) and questions (readline).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createI18n, LANGUAGES } from "../engine/i18n.mjs";
import { pathToFileURL } from "node:url";
import { loadProject, readSchema } from "../engine/project/load.mjs";
import { findProject } from "../engine/project/find.mjs";
import { KitError, EXIT } from "../engine/project/errors.mjs";
import { build } from "../engine/build/build.mjs";
import { BRAND } from "../engine/brand.mjs";

/** ANSI colours, applied only when `enabled` (a terminal, without NO_COLOR). */
export function createPaint(enabled) {
  const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  return { ok: wrap(32, 39), warn: wrap(33, 39), fail: wrap(31, 39), dim: wrap(2, 22), bold: wrap(1, 22), cmd: wrap(36, 39) };
}

/**
 * Execution context of a command.
 * @param {object} globals  global options (--project, --json, --verbose, --lang)
 * @param {{ stdout?, stderr?, env?, stdin?, interactive?: boolean, signal?: AbortSignal }} [io]
 *   interactive: questions allowed (default: stdin and stdout are terminals); signal: stops long-running
 *   commands (dev) like Ctrl+C.
 */
export function createContext(globals, { stdout = process.stdout, stderr = process.stderr, env = process.env, stdin = process.stdin, interactive, signal } = {}) {
  const colour = (stream) => !!stream?.isTTY && !env.NO_COLOR && env.TERM !== "dumb";
  const ctx = {
    globals,
    env,
    stdin,
    stdout,
    signal,
    /** Questions can be asked (a person at a terminal). */
    interactive: interactive ?? !!(stdin?.isTTY && stdout?.isTTY),
    /** Colours of the standard output (no-ops when it is not a terminal). */
    paint: createPaint(colour(stdout)),
    paintErr: createPaint(colour(stderr)),
    get json() {
      return !!globals.json;
    },
    get verbose() {
      return !!globals.verbose;
    },
    language: LANGUAGES.includes(globals.lang) ? globals.lang : LANGUAGES.includes(env.DOC_KIT_LANG) ? env.DOC_KIT_LANG : "en",
    project: null,
    config: null,
    i18n: null,
    t: null,
    print(text = "") {
      stdout.write(text + "\n");
    },
    printErr(text = "") {
      stderr.write(text + "\n");
    },
    /** ✖ what is wrong, then → what to do (when the help key exists). */
    error(key, vars = {}) {
      ctx.printErr(`${ctx.paintErr.fail("✖")} ${ctx.t(`cli.${key}`, vars)}`);
      if (ctx.i18n.has(`cli.${key}.help`)) ctx.printErr(`  → ${ctx.t(`cli.${key}.help`, vars)}`);
    },
    /** Prints the warnings, then the errors, of a build or a check. */
    printProblems({ errors = [], warnings = [] }) {
      for (const w of warnings) {
        const m = describeProblem(ctx, w);
        ctx.printErr(`${ctx.paintErr.warn("⚠")} ${m.what}`);
        if (ctx.verbose && m.help) ctx.printErr(`  → ${m.help}`);
      }
      for (const e of errors) {
        const m = describeProblem(ctx, e);
        ctx.printErr(`${ctx.paintErr.fail("✖")} ${m.what}`);
        if (m.help) ctx.printErr(`  → ${m.help}`);
      }
    },
    /**
     * Messages in the project's language from the start of a command, unless --lang is given: the project (from
     * --project, or found from the current folder upwards) is located and only the `language` of its
     * doc.config.mjs is read. Nothing is reported here: without a project, or with a configuration that cannot
     * be imported or an invalid language, the language stays as it is and the command reports the problem.
     * @returns {Promise<string>} the message language
     */
    async useProjectLanguage({ from } = {}) {
      if (globals.lang) return ctx.language;
      try {
        const { configFile } = findProject({ project: globals.project, from });
        // Same URL as loadProject: the module is evaluated once.
        const raw = (await import(pathToFileURL(configFile).href)).default;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ctx.language;
        const language = raw.language === undefined ? readSchema("config").properties.language.default : raw.language;
        if (LANGUAGES.includes(language)) ctx.setLanguage(language);
      } catch {
        // reported by the command itself
      }
      return ctx.language;
    },
    /** Loads the project (once); messages switch to the project's language unless --lang is given. */
    async loadProject() {
      if (!ctx.project) {
        const r = await loadProject({ project: globals.project, env });
        ctx.project = r.project;
        ctx.config = r.config;
        if (!globals.lang) ctx.setLanguage(r.config.language);
      }
      return { project: ctx.project, config: ctx.config };
    },
    setLanguage(language) {
      ctx.language = language;
      ctx.i18n = createI18n({ language, vars: { command: BRAND.command } });
      ctx.t = ctx.i18n.t;
    },
  };
  ctx.setLanguage(ctx.language);
  return ctx;
}

/**
 * Text of a problem { kind, key, vars }: what is wrong + what to do. A validation problem starts with where it is:
 * file › entry (a capture plan entry: "id (CAPTURES[i])") › path.
 */
export function describeProblem(ctx, p) {
  const prefix = p.kind === "validate" ? "cli.validate." : "cli.build.";
  const where = p.kind === "validate" ? `${[p.file, p.entry, p.path].filter(Boolean).join(" › ")}: ` : "";
  return {
    what: where + ctx.t(prefix + p.key, p.vars),
    help: ctx.i18n.has(`${prefix}${p.key}.help`) ? ctx.t(`${prefix}${p.key}.help`, p.vars) : "",
  };
}

/** Prints a KitError (with its validation details). */
export function printKitError(ctx, e) {
  ctx.error(e.key, e.vars);
  for (const d of e.details || []) {
    const m = describeProblem(ctx, { kind: "validate", file: e.prefix, ...d });
    ctx.printErr(`✖ ${m.what}`);
    if (m.help) ctx.printErr(`  → ${m.help}`);
  }
}

/** Checks a real YYYY-MM-DD date (no February 30th). */
export function checkDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
    throw new KitError(EXIT.USAGE, "date.invalid", { date });
  return date;
}

/**
 * File of the site to open: the project's output when it exists; otherwise an in-memory draft build written
 * to a temporary file, to be removed with `release()`.
 */
export async function builtSite(ctx) {
  const { project, config } = await ctx.loadProject();
  const output = path.resolve(project.root, config.output);
  if (fs.existsSync(output)) return { file: output, release() {} };
  const r = build({ project, config, options: { draft: true } });
  if (!r.html) {
    ctx.printProblems(r);
    throw new KitError(EXIT.CHECK, "site.missing", { file: path.relative(process.cwd(), output) });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-"));
  const tmp = path.join(dir, path.basename(output));
  fs.writeFileSync(tmp, r.html);
  return { file: tmp, release: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Questions asked on the terminal (or on any readable stream: tests). Lines are queued, so answers typed or
 * piped ahead are never lost. Closing the input (Ctrl+C, Ctrl+D, end of stream) cancels: KitError
 * `prompt.cancelled` (exit code 2).
 * @returns {{ ask, choose, confirm, close }}
 */
export function createPrompter(ctx) {
  const terminal = !!(ctx.stdin?.isTTY && ctx.stdout?.isTTY);
  const rl = readline.createInterface({ input: ctx.stdin, output: terminal ? ctx.stdout : undefined, terminal });
  const queue = [];
  const waiting = [];
  let closed = false;
  rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : queue.push(line)));
  rl.on("close", () => {
    closed = true;
    while (waiting.length) waiting.shift()(null);
  });
  rl.on("SIGINT", () => rl.close());
  const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => waiting.push(r)));

  async function line(prompt) {
    if (terminal) {
      rl.setPrompt(prompt);
      rl.prompt();
    } else ctx.stdout.write(prompt);
    const answer = await nextLine();
    if (answer === null) {
      if (!terminal) ctx.stdout.write("\n");
      throw new KitError(EXIT.USAGE, "prompt.cancelled");
    }
    if (!terminal) ctx.stdout.write(answer + "\n");
    return answer.trim();
  }
  const p = ctx.paint;
  const question = (label, shown) => `${p.cmd("?")} ${p.bold(label)}${shown ? p.dim(` (${shown})`) : ""} › `;

  return {
    /** Free answer; empty = default. `check(value)` returns an i18n key (cli.*) when the value is refused. */
    async ask(label, def = "", check = () => null) {
      for (;;) {
        const value = (await line(question(label, def))) || def;
        const problem = check(value);
        if (!problem) return value;
        ctx.print(`  ${p.warn("⚠")} ${ctx.t(`cli.${problem}`, { value })}`);
      }
    },
    /** One of `choices` ([{ value, label }]), by number or by value; empty = default. */
    async choose(label, choices, def = choices[0].value) {
      ctx.print(`${p.cmd("?")} ${p.bold(label)}`);
      choices.forEach((c, i) => ctx.print(`  ${p.dim(`${i + 1})`)} ${c.label}`));
      const index = choices.findIndex((c) => c.value === def);
      for (;;) {
        const answer = (await line(`  ${p.dim(`(${index + 1})`)} › `)).toLowerCase();
        if (!answer) return def;
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
        const found = choices.find((c) => String(c.value).toLowerCase() === answer);
        if (found) return found.value;
        ctx.print(`  ${p.warn("⚠")} ${ctx.t("cli.prompt.choice", { n: choices.length })}`);
      }
    },
    /** Yes / no; empty = default. Accepts y, yes, o, oui, n, no, non. */
    async confirm(label, def = true) {
      for (;;) {
        const answer = (await line(question(label, ctx.t(def ? "cli.prompt.yesNo" : "cli.prompt.noYes")))).toLowerCase();
        if (!answer) return def;
        if (["y", "yes", "o", "oui"].includes(answer)) return true;
        if (["n", "no", "non"].includes(answer)) return false;
        ctx.print(`  ${p.warn("⚠")} ${ctx.t("cli.prompt.yesNoHelp")}`);
      }
    },
    close() {
      rl.close();
    },
  };
}

/**
 * The prompter of a run (created on first use, closed by the dispatcher at the end): answers typed or piped
 * ahead stay queued from one question to the next, even across commands (guided mode → init).
 */
export function prompterOf(ctx) {
  ctx.prompter ??= createPrompter(ctx);
  return ctx.prompter;
}

/** A path for the terminal: relative to the current folder when shorter, quoted when it contains spaces. */
export function shownPath(p, from = process.cwd()) {
  const rel = path.relative(from, p);
  const shown = !rel ? "." : rel.length < p.length && !path.isAbsolute(rel) ? rel : p;
  return /\s/.test(shown) ? `"${shown}"` : shown;
}
