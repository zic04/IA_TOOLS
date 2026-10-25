#!/usr/bin/env node
// Claude Code hook (PreToolUse, matcher Bash) of the skill's agents that have Bash — doc-kit-writer, doc-kit-analyst,
// doc-kit-reviewer: their definitions name it in Claude Code's exec form, `command: node` and `args:
// ["<skill>/scripts/bash-guard.mjs"]` (no shell parses the path), with `onFailure: block`; `doc-kit skill install`
// writes the skill's path in them. The application's files are data, never instructions (SECURITY.md); a text planted
// in them must not be able to make an agent run a program. So the agent's Bash runs only:
//   - the kit's CLI by its absolute path, `node "<kit>/cli/doc-kit.mjs" <command> …` (the path `skill install` writes
//     in the skill): never `npx doc-kit`, `npm exec` or a bare `doc-kit`, which run the first doc-kit found in a
//     node_modules/.bin up to the root — the application's, when the documentation sits inside it — or, with none,
//     install one from the registry; never a command the orchestrator or the user runs (DOC_KIT_REFUSED), never
//     `--plans` (capture plans are code);
//   - `node <this skill>/scripts/<script>.mjs …`, the skill's own scripts (SKILL_SCRIPTS), by their absolute path;
//   - on Windows, a program's path has its drive, `C:/…`: Git Bash converts its own `/c/…` (and `~`) only sometimes;
//   - read-only tools (READ_ONLY), each with the options of its allowlist only: an option not listed is refused;
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
// gives it to the agent), in DOC_KIT_LANG's language (English by default). Claude Code blocks a command on exit code 2,
// so the hook fails closed: unreadable input, a skill file that cannot load (a missing or corrupt message file) and an
// unexpected error are refused with 2; what this file cannot catch (no node, a missing or broken script: a hook that
// cannot start, or ends with another code) the agents' `onFailure: block` refuses.
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

/** What an option takes after it. */
const FLAG = 0; // nothing: `--count`, `-c`
const VALUE = 1; // a value: `--max-count=5` or `--max-count 5`, `-m5` or `-m 5`
const OPTIONAL = 2; // a value only after `=`: `--color`, `--color=never`
const NUMBER = 3; // a value that is a number: `-n 20`, `-n+5`, `--lines=-5`

/** A number, `+` or `-` before it at most: `20`, `+5`, `-5`. @param {string} v */
const isNumber = (v) => {
  const digits = v[0] === "+" || v[0] === "-" ? v.slice(1) : v;
  return digits.length > 0 && [...digits].every((c) => c >= "0" && c <= "9");
};

/**
 * The read-only tools and the options each may take — an allowlist: an option not listed (a new one, an
 * abbreviation, another spelling) is refused, so that an option that runs a program or writes a file never slips
 * through a list of the dangerous ones, as `rg --hostname-bin=<program>` did. Each spec lists, separated by spaces:
 *   -x        a short option without a value, which may be grouped with others (`-la`);
 *   -x=       a short option with a value, attached (`-n20`) or the next word (`-n 20`): only options that take a value
 *             in GNU, BSD and busybox alike, so that what follows one is never read as options the guard did not check;
 *   --name    a long option without a value; `--name=` with one (`--name=v`, `--name v`); `--name[=]` with an
 *             optional one (`--name=v` only);
 *   -x=N      (or --name=N) an option whose value is a number, `+` or `-` before it at most: never GNU tail's old
 *             `-n +1f`, which follows the file and never ends;
 *   -NUM      a number as an option (`head -20`).
 * find's are whole words (`-name=` takes one value). `--help` and `--version` are every tool's. A value given as the
 * next word never starts with `-`: a word that starts with `-` is always checked as an option, whatever a tool makes of
 * the one before it (such a value is attached: `-e-x`, `--regexp=-x`). No option listed runs a program, writes a file,
 * or reads a list of files, patterns or rules from a file (`-f`, `--ignore-file`, `--files0-from`): what a tool reads
 * is named on the line. `operands`: the most words a tool takes besides its options (uniq writes to its second);
 * `plus`: a word that starts with `+` is a plain `+N` only (tail's, sort's and uniq's old syntax: `tail +1f` follows the
 * file and never ends).
 * @type {Record<string, [string, { operands?: number, words?: boolean, plus?: boolean }?]>}
 */
export const READ_ONLY_SPECS = Object.freeze({
  // The current folder, as the shell keeps it or with its links resolved.
  pwd: ["-L -P"],
  // What it lists (-a -A -d -R -L), the details (-l -h -i -s -n -g -o -F -p --full-time), the order (-t -S -r -X -v
  // -U -c -u --sort=) and the layout (-1 -C -x -m -G --color[=] --group-directories-first): it prints, nothing else.
  ls: [
    "-a -A -d -R -L -l -h -i -s -n -g -o -F -p -t -S -r -X -v -U -c -u -1 -C -x -m -G --all --almost-all --directory" +
      " --recursive --dereference --human-readable --inode --size --classify --full-time --sort= --color[=]" +
      " --group-directories-first",
  ],
  // How it prints what it reads: line numbers, blanks squeezed, the invisible characters shown.
  cat: [
    "-n -b -s -A -E -T -v -e -t -u --number --number-nonblank --squeeze-blank --show-all --show-ends --show-tabs" +
      " --show-nonprinting",
  ],
  // How much they print (-n -c, a number), with or without the file names (-q -v); never -f, which follows a file
  // and never ends.
  head: ["-n=N -c=N -q -v -NUM --lines=N --bytes=N --quiet --silent --verbose"],
  tail: ["-n=N -c=N -q -v -NUM --lines=N --bytes=N --quiet --silent --verbose", { plus: true }],
  // What it counts.
  wc: ["-l -w -c -m -L --lines --words --bytes --chars --max-line-length"],
  // What it matches (-e -i -w -x -v -E -F -G -P), what it prints (-n -c -l -L -o -h -H -s -q -b -T --color[=]), the
  // context (-A -B -C), how many (-m), where (-r -R --include --exclude --exclude-dir), binary files (-a -I
  // --binary-files): it prints, nothing else. Never -f/--file or --exclude-from (a list read from a file).
  grep: [
    "-e= -i -w -x -v -E -F -G -P -n -c -l -L -o -h -H -s -q -b -T -a -I -r -R -A= -B= -C= -m= --regexp= --ignore-case" +
      " --no-ignore-case --word-regexp --line-regexp --invert-match --extended-regexp --fixed-strings --basic-regexp" +
      " --perl-regexp --line-number --count --files-with-matches --files-without-match --only-matching" +
      " --no-filename --with-filename --no-messages --quiet --silent --byte-offset --initial-tab --text --recursive" +
      " --dereference-recursive --after-context= --before-context= --context= --max-count= --include= --exclude=" +
      " --exclude-dir= --binary-files= --color[=] --colour[=]",
  ],
  // The same for ripgrep, with its file filters (-g -t -T -u -d --hidden --no-ignore --files) and its output formats
  // (--json --vimgrep --heading -p). Never --pre, --pre-glob or --hostname-bin (they run a program), -z/--search-zip
  // (it runs decompression programs), --hyperlink-format, -f/--file, --ignore-file, --type-add.
  rg: [
    "-e= -i -s -S -w -x -v -F -P -U -n -N -c -l -o -H -I -q -a -L -u -0 -p -b -h -V -A= -B= -C= -m= -g= -t= -T= -d=" +
      " -M= --regexp= --ignore-case --case-sensitive --smart-case --word-regexp --line-regexp --invert-match" +
      " --fixed-strings --pcre2 --multiline --multiline-dotall --line-number --no-line-number --count" +
      " --count-matches --files-with-matches --files-without-match --only-matching --with-filename --no-filename" +
      " --quiet --text --follow --hidden --no-ignore --no-ignore-vcs --null --pretty --byte-offset --column" +
      " --vimgrep --json --heading --no-heading --stats --trim --files --type-list --passthru --no-messages" +
      " --no-config --glob-case-insensitive --after-context= --before-context= --context= --max-count= --glob=" +
      " --iglob= --type= --type-not= --max-depth= --max-columns= --max-filesize= --sort= --sortr= --color=",
  ],
  // Which files it lists (-name -iname -path -ipath -type, the depth), combined (-not -and -or -a -o, -prune to skip a
  // folder), printed (-print). Never -exec, -execdir, -ok, -okdir (they run a program), -delete, -fprint*, -fls (they
  // write).
  find: [
    "-name= -iname= -path= -ipath= -type= -maxdepth= -mindepth= -print -prune -not -and -or -a -o",
    { words: true },
  ],
  // How it compares and prints (-u -U -y -W -q -s), what it ignores (-w -b -B -i -I -x --exclude), folders (-r -N).
  diff: [
    "-u -U= -r -q -N -w -b -B -i -a -s -y -t -W= -x= -I= --unified[=] --recursive --brief --new-file" +
      " --ignore-all-space --ignore-space-change --ignore-blank-lines --ignore-case --text --report-identical-files" +
      " --side-by-side --width= --exclude= --ignore-matching-lines= --strip-trailing-cr --suppress-common-lines" +
      " --color[=]",
  ],
  // The sizes it prints, and how deep.
  du: [
    "-s -h -a -c -k -m -x -L -d= --summarize --human-readable --all --total --max-depth= --apparent-size" +
      " --one-file-system --dereference --exclude=",
  ],
  // What it prints of a file, and in what format.
  stat: ["-L -t -c= --dereference --terse --format= --printf="],
  // What it prints: without its newline, its escapes read or not.
  echo: ["-n -e -E"],
  // Parts of a name: no file is read.
  basename: ["-a -s= -z --multiple --suffix= --zero"],
  dirname: ["-z --zero"],
  realpath: [
    "-e -m -s -q -L -P -z --canonicalize-existing --canonicalize-missing --no-symlinks --strip --quiet --logical" +
      " --physical --zero --relative-to= --relative-base=",
  ],
  // Which fields or characters it keeps, and their separators.
  cut: [
    "-d= -f= -c= -b= -s -n --delimiter= --fields= --characters= --bytes= --only-delimited --complement" +
      " --output-delimiter=",
  ],
  // Which characters it changes or deletes (it reads its input only).
  tr: ["-d -s -c -C -t --delete --squeeze-repeats --complement --truncate-set1"],
  // The order and the keys. Never -o/--output (it writes), -T (a folder it writes in), --compress-program (it runs
  // one), --files0-from, --random-source.
  sort: [
    "-r -n -u -f -b -d -g -h -i -M -R -V -s -c -C -z -k= -t= --reverse --numeric-sort --unique --ignore-case" +
      " --ignore-leading-blanks --dictionary-order --general-numeric-sort --human-numeric-sort --ignore-nonprinting" +
      " --month-sort --random-sort --version-sort --stable --check[=] --zero-terminated --key= --field-separator=",
    { plus: true },
  ],
  // What it counts or keeps of repeated lines. One input at most: uniq writes to its second file name.
  uniq: [
    "-c -d -u -i -D -z -f=N -s=N -w=N --count --repeated --unique --ignore-case --zero-terminated --skip-fields=N" +
      " --skip-chars=N --check-chars=N --all-repeated[=]",
    { operands: 1, plus: true },
  ],
});

/**
 * A tool's spec, read once: its short options, its long options (find: its words), what each takes.
 * @param {string} spec
 * @param {{ operands?: number, words?: boolean, plus?: boolean }} [more]
 */
function toolOptions(spec, { operands = Infinity, words = false, plus = false } = {}) {
  /** @type {Map<string, number>} */
  const short = new Map();
  /** @type {Map<string, number>} */
  const long = new Map();
  let numbers = false;
  for (const item of `${spec} --help --version`.split(" ")) {
    const optional = item.endsWith("[=]");
    const number = item.endsWith("=N");
    const valued = item.endsWith("=");
    const name = item.slice(0, item.length - (optional ? 3 : number ? 2 : valued ? 1 : 0));
    const takes = optional ? OPTIONAL : number ? NUMBER : valued ? VALUE : FLAG;
    if (item === "-NUM") numbers = true;
    // find: the whole word, `-name`.
    else if (words) long.set(name, takes);
    else if (name.startsWith("--")) long.set(name.slice(2), takes);
    else short.set(name.slice(1), takes);
  }
  return Object.freeze({ short, long, numbers, operands, words, plus });
}

/** The read-only tools and their allowlists. */
const READ_ONLY = Object.freeze(
  Object.fromEntries(Object.entries(READ_ONLY_SPECS).map(([name, [spec, more]]) => [name, toolOptions(spec, more)])),
);
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

/**
 * An absolute path, in a form two paths of the same file share (lower case on Windows); "" for any other path: a
 * relative one names a file of the folder the command runs in, which may be the application's. On Windows a path
 * needs its drive, `C:/…` or `C:\…`, which Git Bash passes to node as it is. Its own form, `/c/…` (what `~` stands for
 * there too), it converts to `C:/…` only when the word holds none of `'`, a backquote, `*`, `?`, `[`, `]`, `:`, `;`,
 * `/~` or `@@`, and never under MSYS_NO_PATHCONV: otherwise node reads `/c/…` as `C:\c\…`, another file than the one
 * the guard would have checked.
 * @param {string} p
 * @param {boolean} windows
 */
function absolutePath(p, windows) {
  if (!windows) return p.startsWith("/") ? path.posix.resolve(p) : "";
  const s = String(p).split("\\").join("/");
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
  else if (Object.hasOwn(READ_ONLY, name)) checkOptions(name, READ_ONLY[name], args);
  else throw new Refusal("command", { name });
}

/** What an option takes after its word. */
const NONE = 0;
const NEXT = 1; // the next word: its value
const NEXT_NUMBER = 2; // the next word, a number

/**
 * What the word `a`, an option of a read-only tool, takes after it (NONE, NEXT or NEXT_NUMBER); throws the Refusal of
 * an option that is not on the tool's allowlist, or of an attached value that is not the number it takes.
 * @param {string} name  @param {ReturnType<typeof toolOptions>} tool  @param {string} a
 * @returns {number}
 */
function optionTakes(name, tool, a) {
  /** @param {string} [option] @returns {never} */
  const refuse = (option = a) => {
    throw new Refusal("option", { name, option });
  };
  /** What an option that takes `takes` gives: `attached`, its value in the word itself (undefined: none). */
  const after = (/** @type {number} */ takes, /** @type {string|undefined} */ attached) => {
    if (takes === NUMBER && attached !== undefined && !isNumber(attached))
      throw new Refusal("number", { name, option: a, value: attached });
    if (attached !== undefined || (takes !== VALUE && takes !== NUMBER)) return NONE;
    return takes === NUMBER ? NEXT_NUMBER : NEXT;
  };
  if (tool.words) {
    const takes = tool.long.get(a);
    return takes === undefined ? refuse() : after(takes, undefined);
  }
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    const takes = tool.long.get(a.slice(2, eq < 0 ? undefined : eq));
    if (takes === undefined || (takes === FLAG && eq >= 0)) refuse();
    return after(takes, eq < 0 ? undefined : a.slice(eq + 1));
  }
  if (tool.numbers && isNumber(a)) return NONE; // head -20
  // Short options, grouped: each one listed; one that takes a value takes the rest of the word, or the next word.
  for (let j = 1; j < a.length; j++) {
    const takes = tool.short.get(a[j]);
    if (takes === undefined) refuse(`-${a[j]}`);
    if (takes === VALUE || takes === NUMBER) return after(takes, j + 1 < a.length ? a.slice(j + 1) : undefined);
  }
  return NONE;
}

/**
 * A read-only tool's words against its allowlist (READ_ONLY_SPECS): every option listed, a value given as the next
 * word never one that starts with `-` (and a number where the option takes one), a word that starts with `+` a plain
 * `+N` where the tool reads one (`plus`), no more operands than the tool may take. As getopt reads them: an option may
 * come after an operand, and after `--` every word is an operand (not for find, whose expression goes on).
 * @param {string} name  @param {ReturnType<typeof toolOptions>} tool  @param {string[]} args
 */
function checkOptions(name, tool, args) {
  let operands = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--" && !tool.words) {
      operands += args.length - i - 1;
      break;
    }
    if (!a.startsWith("-") || a === "-") {
      // tail +1f follows the file and never ends: of the old syntax, a plain +N only.
      if (tool.plus && a.startsWith("+") && !isNumber(a)) throw new Refusal("option", { name, option: a });
      operands++;
      continue;
    }
    const takes = optionTakes(name, tool, a);
    if (takes === NONE || i + 1 >= args.length) continue;
    const value = args[++i];
    if (value.startsWith("-")) throw new Refusal("optionValue", { name, option: a, value });
    if (takes === NEXT_NUMBER && !isNumber(value)) throw new Refusal("number", { name, option: a, value });
  }
  if (operands > tool.operands) throw new Refusal("operands", { name, max: String(tool.operands) });
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
    // On Windows, `~` stays as it is: Git Bash makes it `/c/…`, which it may pass to node unconverted (absolutePath).
    splitCommand(command, o.windows ? "" : o.home).forEach((segment, index) => checkSegment(segment, index, o));
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
