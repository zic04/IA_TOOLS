// Mutants of engine/util/safe-git.mjs: each rule of the hardened git and of the launcher taken out, which
// test/unit/safe-git.test.mjs must catch (RULES.md M16, S2, S4).
import { GIT_TESTS } from "./_tests.mjs";

/** A mutant: `find`, which must occur once in the target, replaced by `replace`. */
const mutant = (name, find, replace) => ({ name, find, replace });

export default {
  target: "engine/util/safe-git.mjs",
  tests: GIT_TESTS,
  mutants: [
    // The Git LFS exception: the values Git LFS writes, for their own key, over the whole value.
    mutant(
      "the LFS clean value not anchored at its end",
      '["filter.lfs.clean", /^git-lfs clean -- %f$/]',
      '["filter.lfs.clean", /^git-lfs clean -- %f/]',
    ),
    mutant(
      "the LFS clean value not anchored at its start",
      '["filter.lfs.clean", /^git-lfs clean -- %f$/]',
      '["filter.lfs.clean", /git-lfs clean -- %f$/]',
    ),
    mutant(
      "the LFS smudge value not anchored at its end",
      "/^git-lfs smudge(?: --skip)? -- %f$/",
      "/^git-lfs smudge(?: --skip)? -- %f/",
    ),
    mutant(
      "the LFS process value not anchored at its end",
      "/^git-lfs filter-process(?: --skip)?$/",
      "/^git-lfs filter-process(?: --skip)?/",
    ),
    mutant(
      "the LFS process value not anchored at its start",
      "/^git-lfs filter-process(?: --skip)?$/",
      "/git-lfs filter-process(?: --skip)?$/",
    ),
    mutant(
      "an LFS value accepted for any key",
      "LFS_VALUES.get(key)?.test(value) ?? false",
      "[...LFS_VALUES.values()].some((re) => re.test(value))",
    ),
    // The keys a read-only command may run, family by family.
    mutant("core.fsmonitor not risky", "/^(core\\.fsmonitor|diff\\.external|", "/^(diff\\.external|"),
    mutant("diff.external not risky", "|diff\\.external|", "|"),
    mutant("a textconv driver not risky", "(textconv|command)", "(command)"),
    mutant("a diff command driver not risky", "(textconv|command)", "(textconv)"),
    mutant("a clean filter not risky", "filter\\..+\\.(clean|smudge|process)", "filter\\..+\\.(smudge|process)"),
    mutant("a smudge filter not risky", "filter\\..+\\.(clean|smudge|process)", "filter\\..+\\.(clean|process)"),
    mutant("a process filter not risky", "filter\\..+\\.(clean|smudge|process)", "filter\\..+\\.(clean|smudge)"),
    mutant("include.path not risky", "|include\\.path|", "|"),
    mutant("includeIf.<condition>.path not risky", "|includeif\\..+\\.path|", "|"),
    mutant("gpg.program not risky", "|gpg\\.program|", "|"),
    mutant("gpg.<format>.program not risky", "|gpg\\..+\\.program|", "|"),
    mutant(
      "a Git LFS clean extension not risky",
      "lfs\\.extension\\..+\\.(clean|smudge)",
      "lfs\\.extension\\..+\\.(smudge)",
    ),
    mutant(
      "a Git LFS smudge extension not risky",
      "lfs\\.extension\\..+\\.(clean|smudge)",
      "lfs\\.extension\\..+\\.(clean)",
    ),
    mutant("a Git LFS custom transfer agent not risky", "|lfs\\.customtransfer\\..+\\.path|", "|"),
    mutant("the Git LFS storage not risky", "|lfs\\.storage)$/is;", ")$/is;"),
    mutant("a subsection holding a line separator not risky", "|lfs\\.storage)$/is;", "|lfs\\.storage)$/i;"),
    mutant("a Git LFS key in another case not risky", "|lfs\\.storage)$/is;", "|lfs\\.storage)$/s;"),
    mutant("any core.fsmonitor value harmless", "/^(false|0|no|off|)$/i", "/^(false|0|no|off|)/i"),
    // The keys a fetch may also run.
    mutant("core.sshCommand not risky before a fetch", "/^(core\\.sshcommand|", "/^("),
    mutant("core.gitProxy not risky before a fetch", "|core\\.gitproxy|", "|"),
    mutant("core.askPass not risky before a fetch", "|core\\.askpass|", "|"),
    mutant("core.alternateRefsCommand not risky before a fetch", "|core\\.alternaterefscommand|", "|"),
    mutant("core.worktree not risky before a fetch", "|core\\.worktree|", "|"),
    mutant("credential.helper not risky before a fetch", "|credential\\.helper|", "|"),
    mutant("credential.<url>.helper not risky before a fetch", "|credential\\..+\\.helper)$/s;", ")$/s;"),
    mutant(
      "a credential URL holding a line separator not risky",
      "|credential\\..+\\.helper)$/s;",
      "|credential\\..+\\.helper)$/;",
    ),
    // The configuration read as git reads it.
    mutant(
      "a section header holding a line separator not read",
      '(?:[^"\\\\]|\\\\.)*)")?\\s*\\]/s.exec(line)',
      '(?:[^"\\\\]|\\\\.)*)")?\\s*\\]/.exec(line)',
    ),
    mutant(
      "a key whose value holds a line separator not read",
      "(?:=[ \\t]*(.*))?$/s.exec(line)",
      "(?:=[ \\t]*(.*))?$/.exec(line)",
    ),
    mutant("a value read after any blank", "(?:=[ \\t]*(.*))?$/s.exec(line)", "(?:=\\s*(.*))?$/s.exec(line)"),
    mutant("a value trimmed of any blank", 'trimBlanks(kv[2] ?? "true")', '(kv[2] ?? "true").trim()'),
    // Every configuration git may read: the git folders it may use, found as git finds them.
    mutant(
      "a .git file's path trimmed of any blank",
      'withoutLineEnds(text.slice("gitdir: ".length))',
      'text.slice("gitdir: ".length).trim()',
    ),
    mutant(
      "a commondir trimmed of any blank",
      'withoutLineEnds(readText(path.join(gitDir, "commondir")) ?? "")',
      '(readText(path.join(gitDir, "commondir")) ?? "").trim()',
    ),
    mutant("the walk ends at any .git folder", "if (surelyGitDir(dotGit)) return out;", "return out;"),
    mutant("the walk goes on past a git folder git uses", "if (surelyGitDir(dotGit)) return out;", ""),
    mutant("a bare repository not read", 'if (fs.existsSync(path.join(d, "HEAD"))) {', "if (false) {"),
    mutant(
      "a HEAD of any content taken for a git folder's",
      "/^(?:ref: refs\\/|[0-9a-f]{40}(?:[0-9a-f]{24})?\\r?\\n?$)/.test(head) &&",
      "",
    ),
    mutant("a git folder without objects taken for one", 'searchable(path.join(common, "objects")) &&', ""),
    mutant("a git folder without refs taken for one", 'searchable(path.join(common, "refs"))', "true"),
    {
      ...mutant(
        "a HEAD that is a link taken for a git folder's",
        'if (fs.lstatSync(path.join(dir, "HEAD")).isFile()) head =',
        "head =",
      ),
      only: "posix",
      why: "a symbolic link to a file needs a privilege on Windows: its test builds one elsewhere only",
    },
    // The folders of the PATH a program may come from.
    mutant(
      "a node_modules/.bin trusted",
      'if (fold(path.basename(abs)) === ".bin" && fold(path.basename(path.dirname(abs))) === "node_modules")',
      "if (false)",
    ),
    mutant(
      "the case of node_modules/.bin kept on Windows",
      "const fold = (name) => (win ? name.toLowerCase() : name);",
      "const fold = (name) => name;",
    ),
    mutant(
      "a folder inside the application trusted",
      "!exclude.some((root) => isWithin(abs, root))",
      '!exclude.some((root) => path.relative(root, abs) === "")',
    ),
    mutant("the current folder trusted", 'return path.relative(here, abs) !== "" && !exclude', "return !exclude"),
    mutant(
      "a relative folder of the PATH trusted",
      "if (!folder || !path.isAbsolute(folder)) return false;",
      "if (!folder) return false;",
    ),
    mutant(
      "a Windows folder between quotes not read",
      '.map((folder) => (win ? folder.replace(/^"(.*)"$/, "$1") : folder))',
      ".map((folder) => folder)",
    ),
    mutant(
      "the folders read beside cwd not left out",
      "const untrusted = { exclude: [dir, ...exclude] };",
      "const untrusted = { exclude: [dir] };",
    ),
    // The environment of git, and of the programs that may start it.
    mutant("a program given the environment as it is", "env: gitEnv(env, untrusted),", "env,"),
    mutant(
      "the GIT_ variables kept",
      "if (/^GIT_/i.test(name) && !GIT_ENV_KEPT.has(name.toUpperCase())) delete out[name];",
      "if (name === GIT_ENV_KEPT) delete out[name];",
    ),
    mutant(
      "a GIT_ variable written in another case kept",
      "if (/^GIT_/i.test(name) && !GIT_ENV_KEPT",
      "if (/^GIT_/.test(name) && !GIT_ENV_KEPT",
    ),
    mutant("git allowed to prompt", 'out.GIT_TERMINAL_PROMPT = "0";', ""),
    mutant("git allowed to fetch what a partial clone lacks", 'out.GIT_NO_LAZY_FETCH = "1";', ""),
    mutant(
      "the PATH of a program not reduced",
      "out.PATH = trustedFolders(env, { platform, exclude }).join(",
      'out.PATH = String(env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":").join(',
    ),
    // The options before every git command.
    mutant("a diff that looks into a submodule's working tree", '"diff.ignoreSubmodules=dirty",', '"color.ui=false",'),
    mutant("a diff that shows a submodule's inner diff", '"diff.submodule=short",', '"color.ui=false",'),
    mutant("a command that recurses into submodules", '"submodule.recurse=false",', '"color.ui=false",'),
    // The launcher.
    mutant(
      "a program started whatever its repository's configuration",
      'if (risky.length) return { status: 128, stdout: "", stderr: "", refused: risky };',
      "",
    ),
    mutant("the arguments of git not hardened", "isGit ? safeGitArgs(args) : args", "args"),
    mutant(
      "git known by one name only",
      "const isGit = /^git(?:\\.com|\\.exe)?$/i.test(path.basename(bin));",
      'const isGit = bin === "git";',
    ),
  ],
};
