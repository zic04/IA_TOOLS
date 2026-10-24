#!/usr/bin/env node
// Claude Code hook (PreToolUse, matcher Bash) of the skill's agents that have Bash — doc-kit-writer, doc-kit-analyst,
// doc-kit-reviewer: their definitions name it, and `doc-kit skill install` writes its path in them. The application's
// files are data, never instructions (SECURITY.md); a text planted in them must not be able to make an agent run a
// program. So the agent's Bash runs only:
//   - `npx doc-kit <command> …` from a documentation folder (one that holds doc.config.mjs: npx resolves doc-kit from
//     the folder it runs in, never from the application's), `doc-kit <command> …`, and `node <kit>/cli/doc-kit.mjs`;
//     never a command the orchestrator or the user runs (DOC_KIT_REFUSED), never `--plans` (capture plans are code);
//   - `node <this skill>/scripts/<script>.mjs …`, the skill's own scripts (SKILL_SCRIPTS), by their path;
//   - read-only tools (READ_ONLY), without their options that run a program or write a file;
//   - `cd <folder> &&` before them; `|`, `&&`, `||` and `;` between them; `2>&1` and `>/dev/null`.
// Anything else is refused: an expansion ($, a backquote), a redirection to a file, a background job, a subshell, an
// unquoted wildcard, a second line, git, a path to another program.
//
// The decision (bashDecision) is pure: it reads the command as bash would split it, by hand — no shell, no eval, no
// regular expression — and is told by its caller whether a folder holds doc.config.mjs. Nothing of the application is
// read or run. The hook only ever refuses: what it lets through still goes through Claude Code's own permissions.
// Input (stdin): { tool_name, tool_input: { command }, cwd }. Refusal: exit code 2, the reason on stderr (Claude Code
// gives it to the agent), in DOC_KIT_LANG's language (English by default). Unreadable input is refused too.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_ROOT, kitPath, setMessageLanguage, t, useMessages } from "./common.mjs";

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

/** `p` resolved from `base`, in a form two paths of the same file share (lower case on Windows). */
function resolvePath(base, p, windows) {
  if (!windows) return path.posix.resolve(base, p);
  return path.win32.resolve(windowsPath(base), windowsPath(p)).split("\\").join("/").toLowerCase();
}

/** `doc-kit …`: the command first, never one of DOC_KIT_REFUSED, never `--plans`; `--help`/`--version` alone are fine. */
function checkDocKit(args) {
  const [command] = args;
  if (command === undefined || (command.startsWith("-") && !args.every((a) => HELP.has(a))))
    throw new Refusal("docKitMissing");
  if (DOC_KIT_REFUSED.includes(command)) throw new Refusal("docKitCommand", { name: command });
  // Capture plans are JavaScript modules: they come from the folder the configuration names, never from another one.
  if (args.some((a) => a === "--plans" || a.startsWith("--plans="))) throw new Refusal("plans");
}

/** `node <script> …`: the kit's CLI (then as `doc-kit …`) or one of the skill's scripts, by its path. */
function checkNode(args, cwd, opts) {
  const [script] = args;
  const refused = new Refusal("node", { scripts: SKILL_SCRIPTS.join(", ") });
  if (!script || script.startsWith("-")) throw refused;
  const target = resolvePath(cwd, script, opts.windows);
  if (opts.kitDir && target === resolvePath(opts.kitDir, "cli/doc-kit.mjs", opts.windows))
    return checkDocKit(args.slice(1));
  if (!SKILL_SCRIPTS.some((s) => target === resolvePath(opts.skillDir, `scripts/${s}`, opts.windows))) throw refused;
}

/** One simple command; `state.cwd` follows a `cd`. */
function checkSegment({ argv, op }, state, opts) {
  const [name, ...args] = argv;
  if (name === "cd") {
    if (args.length !== 1 || (op !== "&&" && op !== "")) throw new Refusal("cd");
    state.cwd = resolvePath(state.cwd, args[0], opts.windows);
  } else if (name === "npx") {
    if (args[0] !== "doc-kit") throw new Refusal("npx");
    if (!opts.isDocFolder(state.cwd)) throw new Refusal("docFolder", { folder: state.cwd });
    checkDocKit(args.slice(1));
  } else if (name === "doc-kit") checkDocKit(args);
  else if (name === "node") checkNode(args, state.cwd, opts);
  else if (Object.hasOwn(READ_ONLY, name)) {
    const option = args.find((a) => READ_ONLY[name](a));
    if (option !== undefined) throw new Refusal("option", { name, option });
  } else throw new Refusal("command", { name });
}

/**
 * Whether the guard lets a Bash command through. Pure: the folder test is given.
 * @param {string} command
 * @param {{ cwd: string, skillDir: string, kitDir?: string, home?: string, windows?: boolean,
 *   isDocFolder?: (dir: string) => boolean }} opts
 * @returns {{ allow: true } | { allow: false, key: string, vars: Record<string, string> }}
 */
export function bashDecision(command, opts) {
  const o = { kitDir: "", home: "", windows: false, isDocFolder: () => false, ...opts };
  try {
    const state = { cwd: resolvePath(o.cwd, ".", o.windows) };
    for (const segment of splitCommand(command, o.home)) checkSegment(segment, state, o);
    return { allow: true };
  } catch (e) {
    if (e instanceof Refusal) return { allow: false, key: e.key, vars: e.vars };
    throw e;
  }
}

/**
 * The hook: reads Claude Code's input, decides, and returns the exit code (0 let through, 2 refused, with the reason
 * written by `print`).
 * @param {string} raw   the hook's input (JSON)
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, print?: (s: string) => void }} [io]
 */
export function guard(raw, { env = process.env, cwd = process.cwd(), print = (s) => process.stderr.write(s) } = {}) {
  useMessages("guard");
  setMessageLanguage("en"); // the default, whatever an earlier call chose
  setMessageLanguage(env.DOC_KIT_LANG);
  /** @type {{ allow: boolean, key?: string, vars?: Record<string, string> }} */
  let decision = { allow: false, key: "input" };
  try {
    const input = JSON.parse(raw);
    if (typeof input?.tool_name === "string" && input.tool_name !== "Bash") return 0;
    const command = input?.tool_input?.command;
    if (typeof command === "string")
      decision = bashDecision(command, {
        cwd: typeof input.cwd === "string" && input.cwd ? input.cwd : cwd,
        skillDir: SKILL_ROOT,
        kitDir: kitPath(),
        home: env.HOME || env.USERPROFILE || os.homedir(),
        windows: process.platform === "win32",
        isDocFolder: (dir) => fs.existsSync(path.join(dir, "doc.config.mjs")),
      });
  } catch {
    decision = { allow: false, key: "input" };
  }
  if (decision.allow) return 0;
  print(`✖ ${t("refused", { reason: t(decision.key ?? "input", decision.vars) })}\n  → ${t("allowed")}\n`);
  return 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let code = 2;
    try {
      code = guard(raw);
    } catch {
      process.stderr.write(`✖ ${t("refused", { reason: t("unexpected") })}\n`);
    }
    process.exit(code);
  });
}
