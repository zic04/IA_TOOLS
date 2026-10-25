// The decision of the agents' Bash guard (the hook is bash-guard.mjs, which exports nothing and always runs it; the
// tests import this module, never the hook). The application's files are data, never instructions (SECURITY.md); a
// text planted in them must not be able to make an agent run a program. So the agent's Bash runs only:
//   - the kit's CLI by its absolute path, `node "<kit>/cli/doc-kit.mjs" <command> …` (the path `skill install` writes
//     in the skill): never `npx doc-kit`, `npm exec` or a bare `doc-kit`, which run the first doc-kit found in a
//     node_modules/.bin up to the root — the application's, when the documentation sits inside it — or, with none,
//     install one from the registry; never a command the orchestrator or the user runs (DOC_KIT_REFUSED), never
//     `--plans` (capture plans are code);
//   - `node <this skill>/scripts/<script>.mjs …`, the skill's own scripts (SKILL_SCRIPTS), by their absolute path: the
//     skill's real one, or the one its hook was started from, through a link (skillFolders);
//   - on Windows, a program's path has its drive, `C:/…`: Git Bash converts its own `/c/…` (and `~`) only sometimes;
//     two paths are one file when they differ by the case of ASCII letters only (absolutePath);
//   - read-only tools (READ_ONLY, bash-options.mjs), each with the options of its allowlist only;
//   - `cd <folder> &&` first, before them (the folder the kit reads its doc.config.mjs from); `|`, `&&`, `||` and `;`
//     between them; `2>&1` and `>/dev/null`.
// What runs never depends on the folder the command runs in: a program is named by its absolute path, never a
// relative one a `cd` that fails, or a `cd` in a pipeline, would resolve elsewhere.
// Anything else is refused: an expansion ($, a backquote), a redirection to a file, a background job, a subshell, an
// unquoted wildcard, a second line, git, npm, a path to another program.
//
// The decision (bashDecision) is pure: it reads the command as bash would split it, by hand — no shell, no eval, no
// regular expression — and reads no file. Nothing of the application is read or run. The guard only ever refuses:
// what it lets through still goes through Claude Code's own permissions.
// The hook's part (guard): Claude Code's input, { tool_name, tool_input: { command } }; a refusal is exit code 2, the
// reason on stderr (Claude Code gives it to the agent), in DOC_KIT_LANG's language (English by default); it resolves
// the links of one path only, the one its hook was started from (skillFolders), never one a command writes. Only Node's
// own modules and bash-options.mjs (which imports nothing) are imported statically: the skill's others (common.mjs,
// its message files) are imported inside a try, so that one that cannot load refuses with 2.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { READ_ONLY, Refusal, checkOptions } from "./bash-options.mjs";

/** The skill's scripts an agent runs (the others are modules or hooks). */
export const SKILL_SCRIPTS = ["analysis.mjs", "brief.mjs", "consolidation.mjs", "usage.mjs"];

/** The doc-kit commands an agent never runs: they run something else (`demo` a script, `facts --tools` tools that may
 * load the application's configuration), need a person, change the user's set-up, or reach beyond the documentation
 * folder. The orchestrator runs them. (One string: a list of git-like words would read as git commands to the
 * source rules of test/unit/security.test.mjs.) */
const REFUSED_COMMANDS = "bricks connect demo dev facts hooks init inputs open probe record skill upgrade";
export const DOC_KIT_REFUSED = REFUSED_COMMANDS.split(" ");

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
  // bash drops a NUL from what it reads: `ls \<NUL>'; git push; ls \<NUL>'` is one ls to the guard, three commands to it.
  if (text.includes("\0")) throw new Refusal("nul");
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

/**
 * `s` with its ASCII capitals made small, and nothing else: NTFS gives one file to two names that differ by the case of
 * ASCII letters, but toLowerCase() folds more than it does — U+212A (the Kelvin sign) to k, U+212B (the Angstrom sign)
 * to å, which NTFS keeps apart: another folder. Any other difference of case is another path, refused.
 * @param {string} s
 */
function asciiLower(s) {
  let out = "";
  for (const c of s) out += c >= "A" && c <= "Z" ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  return out;
}

/**
 * An absolute path, in a form two paths of the same file share (on Windows, its ASCII letters in lower case); "" for
 * any other path: a relative one names a file of the folder the command runs in, which may be the application's. On
 * Windows a path needs its drive, `C:/…` or `C:\…`, which Git Bash passes to node as it is. Its own form, `/c/…` (what
 * `~` stands for there too), it converts to `C:/…` only when the word holds none of `'`, a backquote, `*`, `?`, `[`,
 * `]`, `:`, `;`, `/~` or `@@`, and never under MSYS_NO_PATHCONV: otherwise node reads `/c/…` as `C:\c\…`, another file
 * than the one the guard would have checked.
 * @param {string} p
 * @param {boolean} windows
 */
function absolutePath(p, windows) {
  if (!windows) return p.startsWith("/") ? path.posix.resolve(p) : "";
  const s = String(p).split("\\").join("/");
  if (!(isLetter(s[0] ?? "") && s[1] === ":" && s[2] === "/")) return "";
  return asciiLower(path.win32.resolve(s).split("\\").join("/"));
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
 * absolute path (the skill's folder by any of the forms opts.skillDir gives). */
function checkNode(args, opts) {
  const [script] = args;
  const target = script && !script.startsWith("-") ? absolutePath(script, opts.windows) : "";
  const is = (dirs, file) =>
    [dirs].flat().some((dir) => Boolean(target && dir) && target === absolutePath(`${dir}/${file}`, opts.windows));
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
  else if (Object.hasOwn(READ_ONLY, name)) checkOptions(name, READ_ONLY[name], args);
  else throw new Refusal("command", { name });
}

/**
 * Whether the guard lets a Bash command through. Pure: it reads no file, and the folder the command runs in plays no
 * part (every program is named by its absolute path).
 * @param {string} command
 * @param {{ skillDir: string|string[], kitDir?: string, home?: string, windows?: boolean }} opts  skillDir: the skill's
 *   folder, or the forms a command may name it by (the hook gives two, skillFolders)
 * @returns {{ allow: true } | { allow: false, key: string, vars: Record<string, string> }}
 */
export function bashDecision(command, opts) {
  const o = { kitDir: "", home: "", windows: false, ...opts };
  try {
    // On Windows, `~` stays as it is: Git Bash makes it `/c/…`, which it may pass to node unconverted (absolutePath).
    splitCommand(command, o.windows ? "" : o.home).forEach((segment, index) => checkSegment(segment, index, o));
    return { allow: true };
  } catch (e) {
    if (e instanceof Refusal) return { allow: false, key: e.key, vars: e.vars };
    throw e;
  }
}

/** What the hook says when the skill's own files cannot help it: in both languages, without them (bash-guard.mjs holds
 * the same words, for a decision that cannot load: test/unit/bash-guard.test.mjs). */
export const FAILED = {
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

/**
 * The skill's folder in the forms a command may name it by: the one node loaded it from (common.mjs SKILL_ROOT, its
 * real path: node resolves the links of a module's path), and the folder of the path the hook was started from,
 * process.argv[1], which the user's own hook configuration gives (`args: ["<skill>/scripts/bash-guard.mjs"]`, the path
 * `skill install` wrote), through a link maybe: a linked ~/.claude, macOS's temporary folder under /var (a link to
 * /private/var), a junction. That second form counts only when it leads to the first, links resolved: started any
 * other way (an import, a test), the hook has no such path or another file's, and the skill its real path alone. The
 * paths a command writes are never resolved: a folder that only looks like the skill's, or a link planted to it, is
 * another path, refused.
 * @param {string} loaded  @param {unknown} started  @param {boolean} windows
 * @returns {string[]}
 */
function skillFolders(loaded, started, windows) {
  if (typeof started !== "string" || !path.isAbsolute(started)) return [loaded];
  const configured = path.dirname(path.dirname(started));
  try {
    const real = absolutePath(fs.realpathSync(loaded), windows);
    return real && absolutePath(fs.realpathSync(configured), windows) === real ? [loaded, configured] : [loaded];
  } catch {
    return [loaded];
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
  const windows = process.platform === "win32";
  /** @type {{ allow: boolean, key?: string, vars?: Record<string, string> }} */
  const decision =
    typeof command === "string"
      ? bashDecision(command, {
          skillDir: skillFolders(common.SKILL_ROOT, process.argv[1], windows),
          kitDir,
          home: env.HOME || env.USERPROFILE || os.homedir(),
          windows,
        })
      : { allow: false, key: "input" };
  if (decision.allow) return 0;
  const vars = { cli: kitDir ? common.kitCommand(kitDir) : common.t("noKit"), ...decision.vars };
  const reason = common.t(decision.key ?? "input", vars);
  print(`✖ ${common.t("refused", { reason })}\n  → ${common.t("allowed", vars)}\n`);
  return 2;
}
