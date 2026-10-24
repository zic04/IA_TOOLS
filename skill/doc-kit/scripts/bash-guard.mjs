#!/usr/bin/env node
// Claude Code hook (PreToolUse, matcher Bash) of the skill's agents that have Bash — doc-kit-writer, doc-kit-analyst,
// doc-kit-reviewer: their definitions name it, `node "<skill>/scripts/bash-guard.mjs" || exit 2`, and `doc-kit skill
// install` writes the skill's path in them. The application's files are data, never instructions (SECURITY.md); a text
// planted in them must not be able to make an agent run a program. So the agent's Bash runs only:
//   - the kit's CLI by its absolute path, `node "<kit>/cli/doc-kit.mjs" <command> …` (the path `skill install` writes
//     in the skill, {{KIT_PATH}}): never `npx doc-kit`, `npm exec` or a bare `doc-kit`, which run the first doc-kit
//     found in a node_modules/.bin up to the root — the application's, when the documentation sits inside it — or, with
//     none, install one from the registry; never a command the orchestrator or the user runs (DOC_KIT_REFUSED), never
//     `--plans` (capture plans are code);
//   - `node <this skill>/scripts/<script>.mjs …`, the skill's own scripts (SKILL_SCRIPTS), by their absolute path;
//   - read-only tools (READ_ONLY), without their options that run a program or write a file;
//   - `cd <folder> &&` first, before them (the folder the kit reads its doc.config.mjs from); `|`, `&&`, `||` and `;`
//     between them; `2>&1` and `>/dev/null`.
// What runs never depends on the folder the command runs in: a program is named by its absolute path, never a
// relative one a `cd` that fails, or a `cd` in a pipeline, would resolve elsewhere.
// Anything else is refused: an expansion ($, a backquote), a redirection to a file, a background job, a subshell, an
// unquoted wildcard, a second line, git, npm, a path to another program.
//
// The decision (bashDecision) is pure: it reads the command as bash would split it, by hand — no shell, no eval, no
// regular expression — and reads no file. Nothing of the application is read or run. The hook only ever refuses: what
// it lets through still goes through Claude Code's own permissions.
// Input (stdin): { tool_name, tool_input: { command } }. Refusal: exit code 2, the reason on stderr (Claude Code
// gives it to the agent), in DOC_KIT_LANG's language (English by default). Claude Code blocks a command only on exit
// code 2, so the hook fails closed: unreadable input, a skill file that cannot load (a missing or corrupt message
// file) and an unexpected error are refused with 2, and the agents' hook command ends with `|| exit 2` for what this
// file cannot catch (no node, a missing or broken script: exit codes 127 and 1).
// Only Node's own modules are imported here: the skill's (common.mjs, its message files) are imported by the hook,
// inside a try.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The skill's scripts an agent runs (the others are modules or hooks). */
export const SKILL_SCRIPTS = ["analysis.mjs", "brief.mjs", "consolidation.mjs", "usage.mjs"];

/** The doc-kit commands an agent never runs: they run something else (`demo` a script, `facts --tools` tools that may
 * load the application's configuration), need a person, change the user's set-up, or reach beyond the documentation
 * folder. The orchestrator runs them. (One string: a list of git-like words would read as git commands to the
 * source rules of test/unit/security.test.mjs.) */
const REFUSED_COMMANDS = "bricks connect demo dev facts hooks init inputs open probe record skill upgrade";
export const DOC_KIT_REFUSED = REFUSED_COMMANDS.split(" ");

const FIND_ACTIONS = new Set([
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-delete",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);
const none = () => false;
/** The read-only tools, each with its refused options: `rg --pre` runs a program on every file, `find -exec` too. */
const READ_ONLY = Object.freeze({
  ls: none,
  pwd: none,
  cat: none,
  head: none,
  tail: none,
  wc: none,
  grep: none,
  egrep: none,
  fgrep: none,
  rg: (/** @type {string} */ a) => a.startsWith("--pre"),
  find: (/** @type {string} */ a) => FIND_ACTIONS.has(a),
  diff: none,
  du: none,
  stat: none,
  echo: none,
  basename: none,
  dirname: none,
  realpath: none,
  cut: none,
  tr: none,
});
const HELP = new Set(["--help", "-h", "--version", "-v"]);

/** What may follow a word: the end, a space, an operator. */
const WORD_END = new Set([undefined, " ", "\t", ";", "|", "&"]);
/** Inside double quotes, the characters a backslash escapes (bash). */
const ESCAPED_IN_DOUBLE = new Set(['"', "\\", "$", "`"]);
const NULL_REDIRECTS = [">&1", ">&2", ">/dev/null"];
/** Unquoted characters the guard never lets through, and why. */
const FORBIDDEN = new Map([
  ["$", "expansion"],
  ["`", "expansion"],
  ["(", "group"],
  [")", "group"],
  ["{", "group"],
  ["}", "group"],
  ["*", "glob"],
  ["?", "glob"],
  ["[", "glob"],
]);

class Refusal extends Error {
  /** @param {string} key  @param {Record<string, string>} [vars] */
  constructor(key, vars = {}) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}

/**
 * The state of the reading of a command: the text, the position, the word being read (null: none), the words of
 * the simple command being read, the simple commands read.
 * @typedef {{ text: string, i: number, word: string|null, words: string[], segments: Array<{ argv: string[], op: string }> }} Lexer
 */

/** @param {Lexer} lex @param {string} s */
const append = (lex, s) => (lex.word = (lex.word ?? "") + s);
/** @param {Lexer} lex */
function flush(lex) {
  if (lex.word !== null) lex.words.push(lex.word);
  lex.word = null;
}
/** @param {Lexer} lex @param {string} op */
function endSegment(lex, op) {
  flush(lex);
  if (!lex.words.length) throw new Refusal("empty");
  lex.segments.push({ argv: lex.words, op });
  lex.words = [];
}

/** @param {Lexer} lex */
function singleQuoted(lex) {
  const close = lex.text.indexOf("'", lex.i + 1);
  if (close < 0) throw new Refusal("quote");
  append(lex, lex.text.slice(lex.i + 1, close));
  lex.i = close;
}

/** @param {Lexer} lex */
function doubleQuoted(lex) {
  const { text } = lex;
  let value = "";
  for (let j = lex.i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '"') {
      append(lex, value);
      lex.i = j;
      return;
    }
    if (c === "$" || c === "`") throw new Refusal("expansion");
    if (c === "\\" && ESCAPED_IN_DOUBLE.has(text[j + 1])) value += text[++j];
    else value += c;
  }
  throw new Refusal("quote");
}

/** @param {Lexer} lex */
function escaped(lex) {
  if (lex.i + 1 >= lex.text.length) throw new Refusal("quote");
  append(lex, lex.text[++lex.i]);
}

/** `|` or `||`. @param {Lexer} lex */
function pipe(lex) {
  const op = lex.text[lex.i + 1] === "|" ? "||" : "|";
  lex.i += op.length - 1;
  endSegment(lex, op);
}

/** `&&`; a lone `&` is a background job. @param {Lexer} lex */
function and(lex) {
  if (lex.text[lex.i + 1] !== "&") throw new Refusal("background");
  lex.i++;
  endSegment(lex, "&&");
}

/** A redirection, after the word `1` or `2` if any: only to /dev/null or to the other output. @param {Lexer} lex */
function redirection(lex) {
  const { text, i, word } = lex;
  if (text[i] === "<" || (word !== null && word !== "1" && word !== "2")) throw new Refusal("redirect");
  const form = NULL_REDIRECTS.find((f) => text.startsWith(f, i));
  if (!form || !WORD_END.has(text[i + form.length])) throw new Refusal("redirect");
  lex.i = i + form.length - 1;
  lex.word = null;
}

/** What each special character does when it is not quoted. */
const HANDLERS = new Map([
  [" ", flush],
  ["\t", flush],
  ["'", singleQuoted],
  ['"', doubleQuoted],
  ["\\", escaped],
  ["|", pipe],
  ["&", and],
  [";", (/** @type {Lexer} */ lex) => endSegment(lex, ";")],
  [">", redirection],
  ["<", redirection],
]);

/**
 * The command as bash splits it: its simple commands, each with its words and the operator after it ("" for the
 * last). One pass, character by character. Throws a Refusal for what the guard never lets through.
 * @param {string} command
 * @param {string} home  what an unquoted `~` at the start of a word stands for ("" leaves it as is)
 * @returns {Array<{ argv: string[], op: string }>}
 */
function splitCommand(command, home) {
  const text = String(command);
  if (text.includes("\n") || text.includes("\r")) throw new Refusal("newline");
  /** @type {Lexer} */
  const lex = { text, i: 0, word: null, words: [], segments: [] };
  for (; lex.i < text.length; lex.i++) {
    const c = text[lex.i];
    if (c === "#" && lex.word === null) break; // a comment, to the end
    if (HANDLERS.has(c)) HANDLERS.get(c)(lex);
    else if (FORBIDDEN.has(c)) throw new Refusal(FORBIDDEN.get(c));
    else if (c === "~" && lex.word === null && home && (text[lex.i + 1] === "/" || WORD_END.has(text[lex.i + 1])))
      lex.word = home;
    else append(lex, c);
  }
  flush(lex);
  const last = lex.segments[lex.segments.length - 1];
  if (lex.words.length) lex.segments.push({ argv: lex.words, op: "" });
  else if (last?.op === ";") last.op = "";
  else throw new Refusal("empty");
  return lex.segments;
}

const isLetter = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");

/** A path as Windows reads it: forward slashes, and Git Bash's `/c/…` as `c:/…`. */
function windowsPath(p) {
  const s = String(p).split("\\").join("/");
  return s[0] === "/" && isLetter(s[1] ?? "") && (s.length === 2 || s[2] === "/") ? `${s[1]}:/${s.slice(3)}` : s;
}

/**
 * An absolute path, in a form two paths of the same file share (lower case on Windows); "" for any other path: a
 * relative one names a file of the folder the command runs in, which may be the application's, and on Windows a path
 * needs its drive (Git Bash reads `/x` under its own folder, not under C:).
 * @param {string} p
 * @param {boolean} windows
 */
function absolutePath(p, windows) {
  if (!windows) return p.startsWith("/") ? path.posix.resolve(p) : "";
  const s = windowsPath(p);
  if (!(isLetter(s[0] ?? "") && s[1] === ":" && s[2] === "/")) return "";
  return path.win32.resolve(s).split("\\").join("/").toLowerCase();
}

/** The kit's command line: the command first, never one of DOC_KIT_REFUSED, never `--plans`; `--help`/`--version`
 * alone are fine. */
function checkDocKit(args) {
  const [command] = args;
  if (command === undefined || (command.startsWith("-") && !args.every((a) => HELP.has(a))))
    throw new Refusal("docKitMissing");
  if (DOC_KIT_REFUSED.includes(command)) throw new Refusal("docKitCommand", { name: command });
  // Capture plans are JavaScript modules: they come from the folder the configuration names, never from another one.
  if (args.some((a) => a === "--plans" || a.startsWith("--plans="))) throw new Refusal("plans");
}

/** `node <script> …`: the kit's CLI (then checked as the kit's command line) or one of the skill's scripts, each by its
 * absolute path. */
function checkNode(args, opts) {
  const [script] = args;
  const target = script && !script.startsWith("-") ? absolutePath(script, opts.windows) : "";
  const is = (dir, file) => Boolean(target && dir) && target === absolutePath(`${dir}/${file}`, opts.windows);
  if (is(opts.kitDir, "cli/doc-kit.mjs")) return checkDocKit(args.slice(1));
  if (!SKILL_SCRIPTS.some((s) => is(opts.skillDir, `scripts/${s}`)))
    throw new Refusal("node", { scripts: SKILL_SCRIPTS.join(", ") });
}

/** What runs a package by its name: it looks in every node_modules/.bin up to the root, the application's among them,
 * and installs the package from the registry when none has it. */
const RUNNERS = new Set(["npx", "pnpx", "bunx"]);
const NPM_EXEC = new Set(["exec", "x"]);

/**
 * One simple command, the `index`-th of the line. A `cd` comes first and is followed by `&&`: after another command,
 * in a pipeline (a subshell) or after `||` (skipped), it would not move what follows.
 */
function checkSegment({ argv, op }, index, opts) {
  const [name, ...args] = argv;
  if (name === "cd") {
    if (index !== 0 || args.length !== 1 || op !== "&&") throw new Refusal("cd");
  } else if (RUNNERS.has(name) || (name === "npm" && NPM_EXEC.has(args[0]))) throw new Refusal("npx");
  else if (name === "doc-kit") throw new Refusal("kitCli");
  else if (name === "node") checkNode(args, opts);
  else if (Object.hasOwn(READ_ONLY, name)) {
    const option = args.find((a) => READ_ONLY[name](a));
    if (option !== undefined) throw new Refusal("option", { name, option });
  } else throw new Refusal("command", { name });
}

/**
 * Whether the guard lets a Bash command through. Pure: it reads no file, and the folder the command runs in plays no
 * part (every program is named by its absolute path).
 * @param {string} command
 * @param {{ skillDir: string, kitDir?: string, home?: string, windows?: boolean }} opts
 * @returns {{ allow: true } | { allow: false, key: string, vars: Record<string, string> }}
 */
export function bashDecision(command, opts) {
  const o = { kitDir: "", home: "", windows: false, ...opts };
  try {
    splitCommand(command, o.home).forEach((segment, index) => checkSegment(segment, index, o));
    return { allow: true };
  } catch (e) {
    if (e instanceof Refusal) return { allow: false, key: e.key, vars: e.vars };
    throw e;
  }
}

/** What the hook says when the skill's own files cannot help it: in both languages, without them. */
const FAILED = {
  load:
    "✖ doc-kit guard: command refused — the guard could not load its files: reinstall the skill (doc-kit skill install)\n" +
    "✖ garde de doc-kit : commande refusée — la garde n'a pas pu charger ses fichiers : réinstallez le skill (doc-kit skill install)\n",
  crash:
    "✖ doc-kit guard: command refused — an unexpected error in the guard: refused, to be safe\n" +
    "✖ garde de doc-kit : commande refusée — une erreur inattendue dans la garde : refusé, par prudence\n",
};

/**
 * The hook: reads Claude Code's input, decides, and returns the exit code (0 let through, 2 refused, with the reason
 * written by `print`). Fails closed: input it cannot read, a skill module that cannot load (`load`, common.mjs and
 * its message files) and an unexpected error all give 2.
 * @param {string} raw   the hook's input (JSON)
 * @param {{ env?: NodeJS.ProcessEnv, print?: (s: string) => void, load?: () => Promise<any> }} [io]
 * @returns {Promise<number>}
 */
export async function guard(
  raw,
  { env = process.env, print = (s) => process.stderr.write(s), load = () => import("./common.mjs") } = {},
) {
  let common;
  try {
    common = await load();
  } catch {
    print(FAILED.load);
    return 2;
  }
  try {
    return decide(raw, env, print, common);
  } catch {
    print(FAILED.crash);
    return 2;
  }
}

/** Claude Code's input, read; null when it is not JSON. */
function parsed(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The decision on Claude Code's input, with the skill's messages and the kit's path (common.mjs). */
function decide(raw, env, print, common) {
  common.useMessages("guard");
  common.setMessageLanguage("en"); // the default, whatever an earlier call chose
  common.setMessageLanguage(env.DOC_KIT_LANG);
  // The kit's path `skill install` wrote in common.mjs (or the source tree the skill sits in): never one a
  // documentation project names.
  const kitDir = common.kitPath();
  const input = parsed(raw);
  if (typeof input?.tool_name === "string" && input.tool_name !== "Bash") return 0;
  const command = input?.tool_input?.command;
  /** @type {{ allow: boolean, key?: string, vars?: Record<string, string> }} */
  const decision =
    typeof command === "string"
      ? bashDecision(command, {
          skillDir: common.SKILL_ROOT,
          kitDir,
          home: env.HOME || env.USERPROFILE || os.homedir(),
          windows: process.platform === "win32",
        })
      : { allow: false, key: "input" };
  if (decision.allow) return 0;
  const vars = { cli: kitDir ? common.kitCommand(kitDir) : common.t("noKit"), ...decision.vars };
  const reason = common.t(decision.key ?? "input", vars);
  print(`✖ ${common.t("refused", { reason })}\n  → ${common.t("allowed", vars)}\n`);
  return 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const refuse = () => {
    process.stderr.write(FAILED.crash);
    process.exit(2);
  };
  process.on("uncaughtException", refuse);
  process.on("unhandledRejection", refuse);
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("error", refuse);
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => guard(raw).then((code) => process.exit(code), refuse));
}
