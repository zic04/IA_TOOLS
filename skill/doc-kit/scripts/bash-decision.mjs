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
//   - read-only tools (READ_ONLY, bash-options.mjs), each with the options of its allowlist only, never a device
//     among its operands (/dev/null aside: reading /dev/zero or a terminal never ends) nor, on Windows, a network
//     path (another machine, with the user's credentials: checkPath);
//   - `cd <folder> &&` first, before them (the folder the kit reads its doc.config.mjs from); `|`, `&&`, `||` and `;`
//     between them; `>/dev/null`, `>&1` and `>&2`, alone or after a `1` or a `2` written against them, unquoted.
// What runs never depends on the folder the command runs in: a program is named by its absolute path, never a
// relative one a `cd` that fails, or a `cd` in a pipeline, would resolve elsewhere.
// Anything else is refused: an expansion ($, a backquote, a `~` that starts a word other than `~` or `~/`, a `~`
// right after `=` or `:`), any other redirection, a background job, a subshell, an unquoted wildcard, a second line,
// git, npm, a path to another program. The words are bash's to the letter, or the command is refused: a quote, a
// backslash or an empty string changes what bash makes of a word next to an operator, and the guard reads it as bash
// does or refuses it.
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
 * The state of the reading of a command: the text, the position, the word being read (null: none) and whether a
 * quote or a backslash went into it, the words of the simple command being read, the simple commands read.
 * @typedef {{ text: string, i: number, word: string|null, quoted: boolean, words: string[], segments: Array<{ argv: string[], op: string }> }} Lexer
 */

/** @param {Lexer} lex @param {string} s */
const append = (lex, s) => (lex.word = (lex.word ?? "") + s);
/** @param {Lexer} lex */
function flush(lex) {
  if (lex.word !== null) lex.words.push(lex.word);
  lex.word = null;
  lex.quoted = false;
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
  lex.quoted = true;
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
      lex.quoted = true;
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
  lex.quoted = true;
}

/** `|` or `||`; `|&` pipes the error output too (write `2>&1 |`). @param {Lexer} lex */
function pipe(lex) {
  if (lex.text[lex.i + 1] === "&") throw new Refusal("redirect");
  const op = lex.text[lex.i + 1] === "|" ? "||" : "|";
  lex.i += op.length - 1;
  endSegment(lex, op);
}

/** `&&`; `&>` and `&>>` write both outputs to a file; a lone `&` is a background job. @param {Lexer} lex */
function and(lex) {
  const next = lex.text[lex.i + 1];
  if (next === ">") throw new Refusal("redirect");
  if (next !== "&") throw new Refusal("background");
  lex.i++;
  endSegment(lex, "&&");
}

/**
 * A redirection: only to /dev/null or to the other output, after nothing (a space, an operator) or after the digit
 * `1` or `2` alone, written against it and neither quoted nor escaped: bash takes a word for the number of an output
 * only when it is digits and nothing else, as written. Of `"2">`, `'1'>`, `\2>`, `2"">` or `""2>`, bash makes the
 * argument 2 (or 1) and a redirection of the standard output (`node "2">/dev/null <script>` is `node 2 <script>`), so
 * a word quoted or escaped, even in part, before a redirection is refused, as any other word against it is.
 * @param {Lexer} lex
 */
function redirection(lex) {
  const { text, i, word } = lex;
  const output = word === null || (!lex.quoted && (word === "1" || word === "2"));
  if (text[i] === "<" || !output) throw new Refusal("redirect");
  const form = NULL_REDIRECTS.find((f) => text.startsWith(f, i));
  if (!form || !WORD_END.has(text[i + form.length])) throw new Refusal("redirect");
  lex.i = i + form.length - 1;
  lex.word = null;
}

/**
 * An unquoted `~`. At the start of a word, alone or before `/`, bash makes it the home folder (`home`; "" leaves it as
 * it is); before anything else it may be another folder (`~+` the current one, `~-` the previous one, `~user`, `~1`),
 * refused. Right after `=` or `:` bash expands it too, in a word that looks like an assignment (`x=~`, `x=a:~`), even
 * as an argument: refused, wherever that `=` or `:` stands (the guard never decides what looks like one).
 * Elsewhere it is a character. @param {Lexer} lex @param {string} home
 */
function tilde(lex, home) {
  const { text, i } = lex;
  if (lex.word === null) {
    if (text[i + 1] !== "/" && !WORD_END.has(text[i + 1])) throw new Refusal("expansion");
    if (home) lex.word = home;
    else append(lex, "~");
  } else if (text[i - 1] === "=" || text[i - 1] === ":") throw new Refusal("expansion");
  else append(lex, "~");
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
 * last). One pass, character by character. Throws a Refusal for what the guard never lets through, and for what it
 * would read otherwise than bash (test/unit/bash-guard.test.mjs compares its words with a real shell's).
 * @param {string} command
 * @param {string} home  what an unquoted `~` at the start of a word stands for ("" leaves it as is)
 * @returns {Array<{ argv: string[], op: string }>}
 */
export function splitCommand(command, home) {
  const text = String(command);
  if (text.includes("\n") || text.includes("\r")) throw new Refusal("newline");
  // bash drops a NUL from what it reads: `ls \<NUL>'; git push; ls \<NUL>'` is one ls to the guard, three commands to it.
  if (text.includes("\0")) throw new Refusal("nul");
  /** @type {Lexer} */
  const lex = { text, i: 0, word: null, quoted: false, words: [], segments: [] };
  for (; lex.i < text.length; lex.i++) {
    const c = text[lex.i];
    if (c === "#" && lex.word === null) break; // a comment, to the end
    if (HANDLERS.has(c)) HANDLERS.get(c)(lex);
    else if (FORBIDDEN.has(c)) throw new Refusal(FORBIDDEN.get(c));
    else if (c === "~") tilde(lex, home);
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

/** Windows' reserved device names: to a Windows program (rg), the last part of a path that is one, whatever its case,
 * its extension, its drive or its folder (`CON`, `nul.txt`, `C:/x/aux.md`, `COM1:`), is the device, never a file (Git
 * Bash's own tools open a file of that name). */
const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "conin$",
  "conout$",
  "clock$",
  ...[..."0123456789\u00b9\u00b2\u00b3"].flatMap((d) => [`com${d}`, `lpt${d}`]),
]);

/**
 * A path as its words give it, no file read: whether it is absolute, how many `..` it starts with, and its other parts
 * (`.` and empty parts gone, an inner `..` resolved, as path.posix.normalize reads it; past the root, `..` stays
 * there). One pass: path.posix.normalize takes a time that grows as the square of a long `../../…`. A backslash counts
 * as a slash, as Git Bash and Windows read it (on POSIX that refuses a stranger name, at most).
 * @param {string} p
 * @returns {{ absolute: boolean, up: number, parts: string[] }}
 */
function reading(p) {
  const s = p.split("\\").join("/");
  const absolute = s.startsWith("/");
  /** @type {string[]} */
  const parts = [];
  let up = 0;
  for (const part of s.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.length) parts.pop();
    else if (!absolute) up++;
  }
  return { absolute, up, parts };
}

const ROOT = { absolute: true, up: 0, parts: [] };

/**
 * The path `r` resolves to, read from the folder `from` reads (null: the folder the line started in, the root): whether
 * it is rooted (reaches the root, by being absolute or by climbing past `from`), its length, and `part(i)` its i-th
 * component — the base's parts the operand's `..` leave, then the operand's own. Nothing is copied: it costs the
 * operand's length. `dev` and the rest are compared by the caller in ASCII lower case (macOS's volume reads `/DEV` as
 * `/dev`, Git Bash `/PROC` as `/proc`).
 * @param {ReturnType<typeof reading>} r  @param {ReturnType<typeof reading>|null} from
 */
function resolve(r, from) {
  const base = from === null || r.absolute ? ROOT : from;
  const keep = Math.max(0, base.parts.length - r.up);
  const rooted =
    from === null || r.absolute ? r.absolute || r.up > 0 : base.absolute || base.up > 0 || r.up > base.parts.length;
  return {
    rooted,
    length: keep + r.parts.length,
    part: (/** @type {number} */ i) => (i < keep ? base.parts[i] : r.parts[i - keep]),
  };
}

/** Whether the resolved path is under /dev/ and not /dev/null (reading /dev/zero or a terminal never ends). */
const underDev = (/** @type {ReturnType<typeof resolve>} */ res) =>
  res.rooted &&
  asciiLower(res.part(0) ?? "") === "dev" &&
  res.length >= 2 &&
  !(res.length === 2 && res.part(1) === "null");

/** Whether the resolved path is /proc or under it. On Windows Git Bash's /proc holds /proc/sys, Windows' object
 * namespace (a way to a share: `/proc/sys/.../UNC/host/share`, `\Device\Mup`), and links back to the root that lead
 * there again (`/proc/self/root`, `/proc/<pid>/root`, `/proc/cygdrive`): every path under it is refused there. */
const underProc = (/** @type {ReturnType<typeof resolve>} */ res) =>
  res.rooted && res.length >= 1 && asciiLower(res.part(0) ?? "") === "proc";

/** A drive, the first part of a path in drive form (`C:`). @param {string|undefined} part */
const isDrive = (part) => part !== undefined && part.length === 2 && isLetter(part[0]) && part[1] === ":";
/**
 * On Windows, whether a path in drive form, or a relative one read from a cd to a drive path, names a part `proc`:
 * Git Bash reads its own folder by its Windows path as its root (`cd "C:/Program Files/Git" && cat proc/sys/…`, an
 * 8.3 short name too), so any folder named proc there may be its /proc. The guard cannot tell Git's folder from
 * another: a folder named proc is refused in such a path (at worst an over-refusal).
 * @param {ReturnType<typeof reading>} r  @param {ReturnType<typeof reading>|null} folder
 */
const procByDrive = (r, folder) =>
  r.parts.some((p) => asciiLower(p) === "proc") &&
  (isDrive(r.parts[0]) || (folder !== null && !r.absolute && isDrive(folder.parts[0])));

/** On Windows, a word in its device namespace (`\\.\`, `\\?\`, `\??\`, with either slash). @param {string} word */
const namespace = (word) => {
  const s = word.split("\\").join("/");
  return s.startsWith("//.") || s.startsWith("//?") || s.startsWith("/??/");
};

/**
 * On Windows, a word that names a network path (UNC), with either slash: `\\host\share`, `//host`, `//` (Git Bash's
 * root of the network), and the device namespace's way to one, `\\?\UNC\…`, `\\.\UNC\…`, `\??\UNC\…`. Opening it
 * contacts another machine, with the user's Windows credentials. On Linux and macOS `//x` is the root's `x`.
 * @param {string} word
 */
function networkPath(word) {
  const s = word.split("\\").join("/");
  if (!namespace(s)) return s.startsWith("//");
  const unc = asciiLower(s.slice(3, 7));
  return unc === "/unc" && (s.length === 7 || s[7] === "/");
}

/** On Windows, a word whose last part is a reserved device name (RESERVED). @param {string} word */
function reservedName(word) {
  const s = word.split("\\").join("/");
  let last = s.slice(s.lastIndexOf("/") + 1);
  if (isLetter(last[0] ?? "") && last[1] === ":") last = last.slice(2); // a drive, `C:NUL`
  let end = 0;
  while (end < last.length && last[end] !== "." && last[end] !== ":") end++; // an extension, a stream
  while (end > 0 && last[end - 1] === " ") end--; // trailing spaces
  return RESERVED.has(asciiLower(last.slice(0, end)));
}

/**
 * A read-only tool opens a path to no device, /dev/null aside: reading /dev/zero, /dev/urandom or a terminal never
 * ends, as `tail -f` does not. Under /dev/ by any spelling (`//dev/zero`, `/dev/./zero`, `/usr/../dev/zero`), or
 * climbing to it (`../../dev/zero`: past the root `..` stays there, so it reaches /dev from any folder), read from the
 * folder the line started in and from the one a first cd moved to (`cd / && cat dev/zero`; a cd that fails, then `||`,
 * runs the next command where the line started). On Windows, Git Bash's /dev as well, the device namespace and the
 * reserved names (`CON`, `NUL`, `COM1`…); and never a network path (networkPath, and Git Bash's /proc, a way to
 * Windows' object namespace, underProc). The guard reads no file: a link to a device, or to a share, is another path
 * (SECURITY.md).
 * @param {string} name  @param {string} operand  @param {{ windows: boolean, folder: ReturnType<typeof reading>|null }} opts
 */
function checkPath(name, operand, { windows, folder }) {
  if (windows && networkPath(operand)) throw new Refusal("network", { name, path: operand });
  const r = reading(operand);
  const here = resolve(r, null);
  const moved = folder === null ? null : resolve(r, folder);
  if (windows && (underProc(here) || (moved !== null && underProc(moved)) || procByDrive(r, folder)))
    throw new Refusal("network", { name, path: operand });
  const device =
    underDev(here) || (moved !== null && underDev(moved)) || (windows && (namespace(operand) || reservedName(operand)));
  if (device) throw new Refusal("device", { name, path: operand });
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
    // A folder, never an option: `cd -` goes to $OLDPWD and `cd --` home, where the guard cannot read the next paths.
    if (index !== 0 || args.length !== 1 || op !== "&&" || args[0].startsWith("-")) throw new Refusal("cd");
    // Neither a share nor Windows' device namespace is a folder to read files from (`\\.\PhysicalDrive0` is a disk).
    // A tool given no operand reads the folder itself (`cd /proc/sys/Device/Mup/host/share && ls`): checked as a path.
    const to = reading(args[0]);
    if (opts.windows && (networkPath(args[0]) || underProc(resolve(to, null)) || procByDrive(to, null)))
      throw new Refusal("network", { name, path: args[0] });
    if (opts.windows && namespace(args[0])) throw new Refusal("device", { name, path: args[0] });
  } else if (RUNNERS.has(name) || (name === "npm" && NPM_EXEC.has(args[0]))) throw new Refusal("npx");
  else if (name === "doc-kit") throw new Refusal("kitCli");
  else if (name === "node") checkNode(args, opts);
  else if (Object.hasOwn(READ_ONLY, name))
    // checkOptions returns the words the tool opens as paths (its pattern and the words it never opens left out).
    for (const operand of checkOptions(name, READ_ONLY[name], args)) checkPath(name, operand, opts);
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
    const segments = splitCommand(command, o.windows ? "" : o.home);
    // The folder a first `cd` moves to, where the commands after it read their relative paths (checkPath).
    const [name, to] = segments[0].argv;
    const folder = name === "cd" && typeof to === "string" ? reading(to) : null;
    segments.forEach((segment, index) => checkSegment(segment, index, { ...o, folder }));
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
