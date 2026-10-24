// engine/util/safe-git.mjs, rule by rule (RULES.md S2, S4; SECURITY.md "The application folder is not trusted"): the
// Git LFS exception, the keys that name a program, the configuration read as git reads it, the folders of the PATH a
// program may come from, the environment git is given, and the one launcher of git and the external tools. Each rule
// has its mutant in test/mutations/util-safe-git.mjs, which these tests must catch (RULES.md M16). No real git: the
// launcher's `spawn` seam is a fake, and the binaries it finds are empty files.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { riskyGitConfig, resolveOnPath, gitEnv, spawnHardened } from "../../engine/util/safe-git.mjs";
import { runTool } from "../../engine/facts/tools.mjs";
import { createContext, defaultExec } from "../../cli/common.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

/** The risky keys riskyGitConfig finds in a repository whose .git/config is `text` (a fresh folder each time). */
function risky(text, options) {
  const dir = tempDir("doc-kit-safe-git-");
  try {
    fs.mkdirSync(path.join(dir, ".git"));
    fs.writeFileSync(path.join(dir, ".git", "config"), text);
    return riskyGitConfig(dir, options);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The risky keys of a `[filter "lfs"]` section holding one key. */
const lfs = (key, value) => risky(`[filter "lfs"]\n\t${key} = ${value}\n`);

/** A program's file name as the system starts it without a shell (Windows: an .exe). */
const exe = (name, platform = process.platform) => (platform === "win32" ? `${name}.exe` : name);

/** Folders created under `root`, each holding an empty `name` program: { key: absolute folder }. */
function programs(root, name, folders) {
  const out = {};
  for (const [key, rel] of Object.entries(folders)) {
    out[key] = path.join(root, ...rel.split("/"));
    fs.mkdirSync(out[key], { recursive: true });
    fs.writeFileSync(path.join(out[key], exe(name)), "");
  }
  return out;
}

const PATH = (...folders) => ({ PATH: folders.join(path.delimiter) });

describe("the Git LFS exception: exactly the values Git LFS writes (SEC-01)", () => {
  test("the values `git lfs install` writes, with or without --skip, are not risky", () => {
    for (const [key, value] of [
      ["clean", "git-lfs clean -- %f"],
      ["smudge", "git-lfs smudge -- %f"],
      ["process", "git-lfs filter-process"],
      ["smudge", "git-lfs smudge --skip -- %f"],
      ["process", "git-lfs filter-process --skip"],
      ["process", '"git-lfs filter-process"'],
    ])
      assert.deepEqual(lfs(key, value), [], `${key} = ${value}`);
  });

  test("a value that only starts like one is risky: a shell metacharacter, a word before or after, another program", () => {
    for (const [why, key, value, read] of [
      ["a command after ;", "process", "git-lfs filter-process; id"],
      ["a command after &&", "process", "git-lfs filter-process && id"],
      ["a pipe", "clean", "git-lfs clean -- %f | id"],
      ["a backtick", "smudge", "git-lfs smudge -- %f`id`"],
      ["a command substitution", "smudge", "git-lfs smudge -- %f$(id)"],
      [
        "a newline (git reads \\n in a quoted value as one)",
        "process",
        '"git-lfs filter-process\\nid"',
        "git-lfs filter-process\\nid",
      ],
      ["a trailing word", "process", "git-lfs filter-process --skip id"],
      ["a word before", "process", "id; git-lfs filter-process"],
      ["a word before, another key", "clean", "id git-lfs clean -- %f"],
      ["a program of the repository", "process", "./git-lfs filter-process"],
      ["an option Git LFS does not write", "clean", "git-lfs clean --other -- %f"],
      ["another driver's value", "clean", "git-lfs filter-process"],
      // git takes only spaces and tabs off a value: another blank stays in it, and in the command it names.
      ["a no-break space before", "process", " git-lfs filter-process"],
      ["a line separator after", "process", "git-lfs filter-process "],
    ])
      assert.deepEqual(lfs(key, value), [`filter.lfs.${key} = ${read ?? value}`], why);
  });

  test("the exact values of Git LFS do not let through what git-lfs itself runs when its filters run", () => {
    const filters =
      '[filter "lfs"]\n\tclean = git-lfs clean -- %f\n\tsmudge = git-lfs smudge -- %f\n\tprocess = git-lfs filter-process\n';
    assert.deepEqual(risky(filters), []);
    assert.deepEqual(risky(`${filters}[lfs "extension.e"]\n\tclean = ./run %f\n`), [
      "lfs.extension.e.clean = ./run %f",
    ]);
  });
});

describe("riskyGitConfig: every configuration git may read, found as git finds it (S2)", () => {
  /** A folder `dir` made a git folder git surely uses (HEAD, objects, refs), with `config` when given. */
  const gitFolder = (dir, config) => {
    for (const sub of ["objects", "refs"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, "HEAD"), "ref: refs/heads/main\n");
    if (config !== undefined) fs.writeFileSync(path.join(dir, "config"), config);
  };
  const RISKY = '[filter "f"]\n\tclean = x\n';
  const FOUND = ["filter.f.clean = x"];
  /** riskyGitConfig of `rel` under a fresh folder that `build(root)` fills. */
  const riskyIn = (build, rel = ".") => {
    const root = tempDir("doc-kit-git-dirs-");
    try {
      build(root);
      return riskyGitConfig(path.join(root, rel));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  test("a .git folder git does not take for one (empty, no objects, a HEAD that names nothing) hides nothing above it", () => {
    const outer = (root) => gitFolder(path.join(root, ".git"), RISKY);
    /** A HEAD that is a link: git checks where it leads, so it does not end the walk. */
    const linkedHead = (git) => {
      gitFolder(git, "");
      fs.writeFileSync(path.join(git, "..", "head"), "ref: refs/heads/main\n");
      fs.rmSync(path.join(git, "HEAD"));
      fs.symlinkSync(path.join(git, "..", "head"), path.join(git, "HEAD"));
    };
    for (const [why, inner] of [
      ["an empty .git", (git) => fs.mkdirSync(git, { recursive: true })],
      ["no objects", (git) => (gitFolder(git, ""), fs.rmSync(path.join(git, "objects"), { recursive: true }))],
      ["no refs", (git) => (gitFolder(git, ""), fs.rmSync(path.join(git, "refs"), { recursive: true }))],
      ["a HEAD that names nothing", (git) => (gitFolder(git, ""), fs.writeFileSync(path.join(git, "HEAD"), "x\n"))],
      // A symbolic link to a file needs a privilege on Windows: built where the system makes one freely.
      ...(process.platform === "win32" ? [] : [["a HEAD that is a link", linkedHead]]),
    ])
      assert.deepEqual(
        riskyIn((root) => (outer(root), inner(path.join(root, "src", ".git"))), "src"),
        FOUND,
        why,
      );
    // The minimal pair: a git folder git surely uses ends the walk, as it ends git's (a clone of the sources, a nested
    // repository): the one above is not git's there.
    assert.deepEqual(
      riskyIn((root) => (outer(root), gitFolder(path.join(root, "src", ".git"), "")), "src"),
      [],
    );
    assert.deepEqual(
      riskyIn((root) => outer(root), "src"),
      FOUND,
      "no .git in src: the one above",
    );
  });

  test("a bare repository (the folder itself a git folder) is read", () => {
    assert.deepEqual(
      riskyIn((root) => gitFolder(root, RISKY)),
      FOUND,
    );
    assert.deepEqual(
      riskyIn((root) => gitFolder(root, "")),
      [],
    );
  });

  test("a .git file's path and a commondir are read as git reads them: only their line ends taken off", () => {
    // Two git folders whose names differ by a line separator only (U+2028): git reads the one written.
    const twins = (root, at) => {
      gitFolder(path.join(root, at), "");
      gitFolder(path.join(root, `${at} `), RISKY);
    };
    const linked = (root, text) => (twins(root, "real"), fs.writeFileSync(path.join(root, ".git"), text));
    assert.deepEqual(
      riskyIn((root) => linked(root, "gitdir: real \n")),
      FOUND,
      "a .git file",
    );
    assert.deepEqual(
      riskyIn((root) => linked(root, "gitdir: real\r\n")),
      [],
      "its line end",
    );
    /** A worktree whose commondir names the main git folder, `end` after its path. */
    const worktree = (root, end) => {
      twins(root, "main");
      const own = path.join(root, "main", "worktrees", "w");
      fs.mkdirSync(own, { recursive: true });
      fs.writeFileSync(path.join(own, "HEAD"), "ref: refs/heads/w\n");
      fs.writeFileSync(path.join(own, "commondir"), `${path.join(root, "main")}${end}`);
      fs.writeFileSync(path.join(root, ".git"), `gitdir: ${own}\n`);
    };
    assert.deepEqual(
      riskyIn((root) => worktree(root, " \n")),
      FOUND,
      "a commondir",
    );
    assert.deepEqual(
      riskyIn((root) => worktree(root, "\r\n")),
      [],
      "its line end",
    );
  });
});

describe("riskyGitConfig: every key that names a program, beside a harmless neighbour (S2)", () => {
  // [section, the key that names a program, a key of the same section that does not]
  const READ_ONLY = [
    ["[core]", "fsmonitor = x", "fsmonitor = false"],
    ["[diff]", "external = x", "renames = true"],
    ['[diff "d"]', "textconv = x", "binary = true"],
    ['[diff "d"]', "command = x", "binary = true"],
    ['[filter "f"]', "clean = x", "required = true"],
    ['[filter "f"]', "smudge = x", "required = true"],
    ['[filter "f"]', "process = x", "required = true"],
    ["[include]", "path = x", "other = x"],
    ['[includeIf "gitdir:/w/"]', "path = x", "other = x"],
    // log.showSignature has `git log` and `git show` check a signature with the program these name.
    ["[gpg]", "program = x", "format = ssh"],
    ['[gpg "ssh"]', "program = x", "allowedSignersFile = x"],
    // What git-lfs runs, or writes to, when the filters of Git LFS run.
    ['[lfs "extension.e"]', "clean = x", "priority = 0"],
    ['[lfs "extension.e"]', "smudge = x", "priority = 0"],
    ['[lfs "Extension.e"]', "clean = x", "priority = 0"],
    ['[lfs "customtransfer.t"]', "path = x", "concurrent = false"],
    ["[lfs]", "storage = x", "fetchrecentalways = false"],
  ];
  const FETCH = [
    ["[core]", "sshCommand = x", "autocrlf = false"],
    ["[core]", "gitProxy = x", "autocrlf = false"],
    ["[core]", "askPass = x", "autocrlf = false"],
    ["[core]", "alternateRefsCommand = x", "autocrlf = false"],
    ["[core]", "worktree = ../elsewhere", "autocrlf = false"],
    ["[credential]", "helper = x", "useHttpPath = true"],
    ['[credential "https://h.example"]', "helper = x", "username = u"],
  ];
  /** The key as riskyGitConfig names it: section and subsection, key in lower case. */
  const named = (section, line) => {
    const [, name, sub] = /^\[(\S+?)(?: "(.*)")?\]$/.exec(section);
    const [key, value] = line.split(" = ");
    return `${name.toLowerCase()}${sub === undefined ? "" : `.${sub}`}.${key.toLowerCase()} = ${value}`;
  };

  test("each key a read-only command may run is risky; its neighbour is not", () => {
    for (const [section, key, neighbour] of READ_ONLY) {
      assert.deepEqual(risky(`${section}\n\t${key}\n`), [named(section, key)], `${section} ${key}`);
      assert.deepEqual(risky(`${section}\n\t${neighbour}\n`), [], `${section} ${neighbour}`);
    }
  });

  test("each key a fetch may run is risky before an update of a clone, and only then", () => {
    for (const [section, key, neighbour] of FETCH) {
      assert.deepEqual(risky(`${section}\n\t${key}\n`, { fetch: true }), [named(section, key)], `${section} ${key}`);
      assert.deepEqual(risky(`${section}\n\t${key}\n`), [], `${section} ${key}, read-only`);
      assert.deepEqual(risky(`${section}\n\t${neighbour}\n`, { fetch: true }), [], `${section} ${neighbour}`);
    }
  });

  test("the configuration is read as git reads it: a line separator (U+2028) in a value or a subsection hides nothing", () => {
    // JavaScript's `.` stops at U+2028 and U+2029; git reads them as any other character of a value or a name.
    assert.deepEqual(risky(`[filter "f"]\n\tclean = id\u2028x\n`), [`filter.f.clean = id\u2028x`], "in a value");
    assert.deepEqual(risky(`[filter "a\u2028b"]\n\tclean = x\n`), [`filter.a\u2028b.clean = x`], "in a subsection");
    assert.deepEqual(
      risky(`[core]\n[filter "a\\\u2028"]\n\tclean = x\n`),
      [`filter.a\\\u2028.clean = x`],
      "escaped in a subsection: the key stays in its own section",
    );
    assert.deepEqual(
      risky(`[credential "https://a\u2028b"]\n\thelper = x\n`, { fetch: true }),
      [`credential.https://a\u2028b.helper = x`],
      "a key a fetch may run",
    );
  });
});

describe("resolveOnPath: never the application, the documentation project or a node_modules/.bin (SEC-05, S4)", () => {
  test("npm's node_modules/.bin of every ancestor and the folders inside the application or the project are left out", () => {
    const root = tempDir("doc-kit-path-");
    try {
      const app = path.join(root, "app");
      const docs = path.join(app, "docs", "manual");
      const found = programs(root, "git", {
        // npm, running a script of the documentation project, puts the node_modules/.bin of each of its folders first.
        docsBin: "app/docs/manual/node_modules/.bin",
        docsParentBin: "app/docs/node_modules/.bin",
        appBin: "app/node_modules/.bin",
        aboveBin: "node_modules/.bin",
        appTools: "app/tools",
        docsTools: "app/docs/manual/bin",
        trusted: "usr/bin",
      });
      const exclude = [app, docs];
      const all = Object.values(found);
      assert.equal(resolveOnPath("git", { env: PATH(...all), exclude }), path.join(found.trusted, exe("git")));
      for (const [name, folder] of Object.entries(found))
        if (name !== "trusted") assert.equal(resolveOnPath("git", { env: PATH(folder), exclude }), null, name);
      // The minimal pairs: a folder inside the application is the application's; outside it, a node_modules/.bin still is.
      assert.equal(
        resolveOnPath("git", { env: PATH(found.appTools), exclude: [] }),
        path.join(found.appTools, exe("git")),
      );
      assert.equal(resolveOnPath("git", { env: PATH(found.aboveBin), exclude: [] }), null);
      // Windows: the case of a folder's name does not matter (a git.exe, as Windows starts it, whatever the host).
      const upper = path.join(root, "Node_Modules", ".BIN");
      fs.mkdirSync(upper, { recursive: true });
      fs.writeFileSync(path.join(upper, exe("git", "win32")), "");
      assert.equal(resolveOnPath("git", { env: { PATH: upper }, platform: "win32", exclude: [] }), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("never the current folder nor a relative folder of the PATH (Windows looks there); a Windows folder between quotes is the folder", () => {
    const root = tempDir("doc-kit-path-");
    const before = process.cwd();
    try {
      const found = programs(root, "git", { here: ".", bin: "bin", trusted: "usr/bin" });
      process.chdir(root);
      assert.equal(resolveOnPath("git", { env: PATH(root) }), null, "the current folder");
      assert.equal(resolveOnPath("git", { env: PATH(".") }), null, ".");
      assert.equal(resolveOnPath("git", { env: PATH("bin") }), null, "a folder named from the current one");
      assert.equal(resolveOnPath("git", { env: PATH(found.bin) }), path.join(found.bin, exe("git")), "absolute");
      // Windows reads a folder of the PATH written between quotes as the folder itself; the program gets it bare.
      fs.writeFileSync(path.join(found.trusted, exe("git", "win32")), "");
      const quoted = { PATH: `"${found.trusted}"` };
      assert.equal(
        resolveOnPath("git", { env: quoted, platform: "win32" }),
        path.join(found.trusted, exe("git", "win32")),
      );
      assert.equal(gitEnv(quoted, { platform: "win32" }).PATH, found.trusted);
    } finally {
      process.chdir(before);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("the CLI's launcher leaves out the documentation project and the application of the project loaded", async () => {
    const root = tempDir("doc-kit-path-");
    try {
      const docs = demoCopy(path.join(root, "docs"));
      // demo-docs: app.dir is "../demo-app".
      const found = programs(root, "tool", { inDocs: "docs/bin", inApp: "demo-app/bin" });
      const ctx = createContext({ project: docs }, { stdout: { write() {} }, stderr: { write() {} }, env: {} });
      await ctx.loadProject();
      // A folder that exists: a program found would be started there (and fail: an empty file), never taken as absent.
      const elsewhere = path.join(root, "elsewhere");
      fs.mkdirSync(elsewhere);
      for (const [name, folder] of Object.entries(found))
        assert.equal(ctx.exec("tool", [], { cwd: elsewhere, env: PATH(folder) }), null, name);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the environment of git (SEC-08)", () => {
  const trusted = path.resolve(path.sep, "usr", "bin");
  test("no variable that moves the repository, the configuration or the programs git reads; no prompt; the person's own connection kept", () => {
    const env = {
      HOME: "/home/me",
      USERPROFILE: "C:\\Users\\me",
      XDG_CONFIG_HOME: "/home/me/.config",
      LANG: "C",
      Path: [trusted, path.resolve(path.sep, "app", "node_modules", ".bin"), "relative"].join(path.delimiter),
      GIT_DIR: "/x/.git",
      GIT_WORK_TREE: "/x",
      GIT_INDEX_FILE: "/x/index",
      GIT_OBJECT_DIRECTORY: "/x/objects",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "/x/alternates",
      GIT_COMMON_DIR: "/x/common",
      GIT_CEILING_DIRECTORIES: "/x",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.fsmonitor",
      GIT_CONFIG_VALUE_0: "x",
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor'='x'",
      GIT_CONFIG_GLOBAL: "/x/global",
      GIT_CONFIG_SYSTEM: "/x/system",
      GIT_CONFIG: "/x/config",
      GIT_EXEC_PATH: "/x/libexec",
      GIT_EXTERNAL_DIFF: "x",
      GIT_PAGER: "x",
      GIT_PROXY_COMMAND: "x",
      GIT_ALLOW_PROTOCOL: "ext",
      GIT_TEMPLATE_DIR: "/x/templates",
      GIT_TRACE: "/x/trace",
      GIT_SSL_NO_VERIFY: "1",
      GIT_TERMINAL_PROMPT: "1",
      GIT_NO_LAZY_FETCH: "0",
      git_dir: "/x/.git",
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_SSH: "ssh",
      GIT_SSH_VARIANT: "ssh",
      GIT_ASKPASS: "helper",
      GIT_SSL_CAINFO: "/etc/company-ca.pem",
      GIT_SSL_CAPATH: "/etc/ssl/certs",
      GIT_LFS_SKIP_SMUDGE: "1",
    };
    assert.deepEqual(gitEnv(env), {
      HOME: "/home/me",
      USERPROFILE: "C:\\Users\\me",
      XDG_CONFIG_HOME: "/home/me/.config",
      LANG: "C",
      PATH: trusted,
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_SSH: "ssh",
      GIT_SSH_VARIANT: "ssh",
      GIT_ASKPASS: "helper",
      GIT_SSL_CAINFO: "/etc/company-ca.pem",
      GIT_SSL_CAPATH: "/etc/ssl/certs",
      GIT_LFS_SKIP_SMUDGE: "1",
      // Never a prompt; never a fetch of the objects a partial clone lacks (its transport is the repository's).
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_LAZY_FETCH: "1",
    });
  });
});

/** What safeGitArgs puts before every git command (the global options), then the command. */
const HARDENED = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.pager=cat",
  "-c",
  "diff.ignoreSubmodules=dirty",
  "-c",
  "diff.submodule=short",
  "-c",
  "submodule.recurse=false",
  "--no-pager",
];
/** The environment git gets from an `env` holding only that PATH. */
const CLEANED = (folder) => ({ PATH: folder, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" });

describe("spawnHardened: the one launcher of git and of the external tools", () => {
  /** A fake `spawn`: every call recorded, answered with `answer`. */
  const fake = (answer = { status: 0, stdout: "out", stderr: "" }) => {
    const calls = [];
    return { calls, spawn: (file, args, options) => (calls.push({ file, args, options }), answer) };
  };

  test("git: the binary of a trusted folder, the hardened arguments, the cleaned environment, in the folder given", () => {
    const root = tempDir("doc-kit-launch-");
    try {
      const found = programs(root, "git", { appBin: "app/node_modules/.bin", trusted: "usr/bin" });
      const app = path.join(root, "app");
      const s = fake();
      const env = { ...PATH(found.appBin, found.trusted), GIT_DIR: "/x/.git", HOME: "/home/me" };
      assert.deepEqual(spawnHardened("git", ["ls-files"], { cwd: app, env, spawn: s.spawn }), {
        status: 0,
        stdout: "out",
        stderr: "",
      });
      assert.equal(s.calls.length, 1);
      const [{ file, args, options }] = s.calls;
      assert.equal(file, path.join(found.trusted, exe("git")));
      assert.deepEqual(args, [...HARDENED, "ls-files"]);
      assert.equal(options.cwd, app);
      assert.equal(options.shell, false);
      assert.deepEqual(options.env, { HOME: "/home/me", ...CLEANED(found.trusted) });
      // diff, show and log: no external diff, no textconv either.
      spawnHardened("git", ["diff", "--name-status", "HEAD"], { cwd: app, env, spawn: s.spawn });
      assert.deepEqual(s.calls[1].args, [
        ...HARDENED,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--name-status",
        "HEAD",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("git by any name the system starts it under (git.exe, a path to it) gets the hardened arguments", () => {
    const root = tempDir("doc-kit-launch-");
    try {
      const found = programs(root, "git", { trusted: "usr/bin" });
      // Each name as the host looks it up (Windows: git.exe for both, whatever the case).
      for (const name of ["git.exe", "GIT"]) fs.writeFileSync(path.join(found.trusted, exe(name)), "");
      const app = path.join(root, "app");
      fs.mkdirSync(app);
      const s = fake();
      for (const bin of ["git.exe", "GIT", path.join(found.trusted, exe("git"))])
        spawnHardened(bin, ["ls-files"], { cwd: app, env: PATH(found.trusted), spawn: s.spawn });
      assert.deepEqual(
        s.calls.map((c) => c.args),
        [0, 1, 2].map(() => [...HARDENED, "ls-files"]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("git or a tool, in a repository whose configuration names a program: refused, nothing started (a tool may start git there)", () => {
    const root = tempDir("doc-kit-launch-");
    try {
      const found = programs(root, "git", { trusted: "usr/bin" });
      fs.writeFileSync(path.join(found.trusted, exe("semgrep")), "");
      const app = path.join(root, "app");
      fs.mkdirSync(path.join(app, ".git"), { recursive: true });
      fs.writeFileSync(path.join(app, ".git", "config"), '[filter "f"]\n\tclean = x\n');
      const s = fake();
      for (const bin of ["git", "semgrep"])
        assert.deepEqual(
          spawnHardened(bin, ["--version"], { cwd: app, env: PATH(found.trusted), spawn: s.spawn }),
          { status: 128, stdout: "", stderr: "", refused: ["filter.f.clean = x"] },
          bin,
        );
      assert.deepEqual(s.calls, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("another program: the binary of a trusted folder, its arguments as given, git's cleaned environment (for any git it starts)", () => {
    const root = tempDir("doc-kit-launch-");
    try {
      const found = programs(root, "knip", { appBin: "app/node_modules/.bin", trusted: "usr/bin" });
      const app = path.join(root, "app");
      const s = fake();
      const env = { ...PATH(found.appBin, found.trusted), GIT_DIR: "/x/.git" };
      spawnHardened("knip", ["--reporter", "json"], { cwd: app, env, spawn: s.spawn });
      assert.deepEqual(
        s.calls.map(({ file, args, options }) => [file, args, options.env]),
        [[path.join(found.trusted, exe("knip")), ["--reporter", "json"], CLEANED(found.trusted)]],
      );
      // Only in the application's node_modules/.bin: not installed, nothing started.
      assert.equal(spawnHardened("knip", [], { cwd: app, env: PATH(found.appBin), spawn: s.spawn }), null);
      assert.equal(s.calls.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("the CLI's defaultExec is this launcher, the folders it is told are untrusted left out of the PATH", () => {
    const root = tempDir("doc-kit-launch-");
    try {
      const found = programs(root, "git", { inDocs: "docs/bin", trusted: "usr/bin" });
      const docs = path.join(root, "docs");
      const cwd = path.join(root, "elsewhere");
      const env = PATH(found.inDocs, found.trusted);
      const run = (untrusted) => {
        const s = fake();
        defaultExec("git", ["rev-parse", "HEAD"], { cwd, env }, { untrusted, spawn: s.spawn });
        return s.calls.map((c) => [c.file, c.options.env.PATH, c.options.env.GIT_TERMINAL_PROMPT]);
      };
      assert.deepEqual(run([docs]), [[path.join(found.trusted, exe("git")), found.trusted, "0"]]);
      assert.deepEqual(run([]), [[path.join(found.inDocs, exe("git")), env.PATH, "0"]]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the warning of a refused program (cli/common.mjs, the context's exec)", () => {
  test("once per folder for git, once per folder for the external tools, in English and French", () => {
    const refused = () => ({ status: 128, stdout: "", stderr: "", refused: ["filter.f.clean = x"] });
    /** The warnings of a run that asks git twice and two tools in one folder, then a tool in another. */
    const warnings = (lang) => {
      let err = "";
      const io = { stdout: { write() {} }, stderr: { write: (s) => (err += s) }, env: {}, exec: refused };
      const ctx = createContext({ lang }, io);
      for (const bin of ["git", "git", "knip", "syft"]) ctx.exec(bin, [], { cwd: "app" });
      ctx.exec("knip", [], { cwd: "other" });
      return err.split("\n").filter((line) => line.startsWith("⚠"));
    };
    const tools = (folder) =>
      `⚠ the external tools not run in ${folder}: its repository's configuration names a program that git could ` +
      "run, and a tool may start git there (filter.f.clean = x)";
    assert.deepEqual(warnings("en"), [
      "⚠ git not run in app: its configuration names a program that git could run (filter.f.clean = x)",
      tools("app"),
      tools("other"),
    ]);
    assert.deepEqual(warnings("fr").slice(1, 2), [
      "⚠ les outils externes ne sont pas lancés dans app : la configuration de son dépôt désigne un programme que git " +
        "pourrait exécuter, et un outil peut y lancer git (filter.f.clean = x)",
    ]);
  });
});

describe("facts --tools: a tool refused is told apart (engine/facts/tools.mjs)", () => {
  test("a tool the launcher refuses is failed with reason refused, osv-scanner at its version check too; one missing is missing", () => {
    const refused = () => ({ status: 128, stdout: "", stderr: "", refused: ["filter.f.clean = x"] });
    const app = path.resolve("no-such-folder", "app");
    assert.deepEqual(
      ["gitleaks", "osv-scanner", "syft", "knip"].map((name) => runTool(name, app, refused)),
      ["gitleaks", "osv-scanner", "syft", "knip"].map((tool) => ({
        tool,
        status: "failed",
        reason: "refused",
        items: [],
      })),
    );
    assert.deepEqual(
      runTool("knip", app, () => null),
      { tool: "knip", status: "missing", items: [] },
    );
  });
});
