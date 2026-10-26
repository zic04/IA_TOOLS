// The read-only tools the agents' Bash guard lets through (bash-decision.mjs), and the options each may take: an
// allowlist, read word by word as getopt reads it — no shell, no eval, no regular expression, no file read — and the
// words each takes as its operands. It imports nothing.

/** Why the guard refuses a command: a message key of the skill's `guard` section (i18n/<lang>.json), its variables. */
export class Refusal extends Error {
  /** @param {string} key  @param {Record<string, string>} [vars] */
  constructor(key, vars = {}) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}

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
 * is named on the line. `operands`: the most words a tool takes from its first operand on (uniq writes to its second);
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
export const READ_ONLY = Object.freeze(
  Object.fromEntries(Object.entries(READ_ONLY_SPECS).map(([name, [spec, more]]) => [name, toolOptions(spec, more)])),
);

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
 * `+N` where the tool reads one (`plus`), no more operands than the tool may take. As GNU's getopt reads them, an
 * option may come after an operand, and after `--` every word is an operand (not for find, whose expression goes on);
 * as a getopt that stops at the first operand reads them (GNU's under POSIXLY_CORRECT), every word from the first
 * operand on is one: the operands are counted so, never fewer than GNU's reading counts (`uniq a -c` writes to `-c`).
 * Returns those words, every one from the first operand on (find's start paths among them): what the tool may read
 * as a file, by either reading (bash-decision.mjs refuses a device among them).
 * @param {string} name  @param {ReturnType<typeof toolOptions>} tool  @param {string[]} args
 * @returns {string[]}
 */
export function checkOptions(name, tool, args) {
  let first = -1; // the first operand
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--" && !tool.words) {
      if (first < 0) first = i + 1;
      break;
    }
    if (!a.startsWith("-") || a === "-") {
      // tail +1f follows the file and never ends: of the old syntax, a plain +N only.
      if (tool.plus && a.startsWith("+") && !isNumber(a)) throw new Refusal("option", { name, option: a });
      if (first < 0) first = i;
      continue;
    }
    const takes = optionTakes(name, tool, a);
    if (takes === NONE || i + 1 >= args.length) continue;
    const value = args[++i];
    if (value.startsWith("-")) throw new Refusal("optionValue", { name, option: a, value });
    if (takes === NEXT_NUMBER && !isNumber(value)) throw new Refusal("number", { name, option: a, value });
  }
  const operands = first < 0 ? [] : args.slice(first);
  if (operands.length > tool.operands) throw new Refusal("operands", { name, max: String(tool.operands) });
  return operands;
}
