// The CLI's start-up (ARCHITECTURE.md §4): `--version` and `--help` run nothing of the folder they are typed in (its
// doc.config.mjs, or a parent's, is never imported for them: the language of the messages is read as text) and
// load no command module and no Playwright; `doc-kit` alone (the guided mode) loads the project like a command;
// the command line is read with the options of the command named, then of every command; `--lang=fr` is
// `--lang fr`; `--help` lists every command of cli/commands/, in its group, with every option the command declares.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runCli, menuFor } from "../../cli/doc-kit.mjs";
import { absolutePath } from "../../cli/common.mjs";
import { COMMANDS } from "../../cli/registry.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { languageInConfig } from "../../engine/project/find.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir, noExec } from "../tools/helpers.mjs";

const CLI = path.join(KIT_ROOT, "cli", "doc-kit.mjs");
const TRACE = pathToFileURL(path.join(KIT_ROOT, "test", "tools", "module-trace.mjs")).href;
const COMMAND_FILES = fs
  .readdirSync(path.join(KIT_ROOT, "cli", "commands"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => f.slice(0, -4))
  .sort();

/** Runs the CLI in this process and captures its output (no process started: RULES.md M4). */
async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: { ...env },
    exec: noExec,
  });
  return { code, out, err };
}

/**
 * A documentation project whose doc.config.mjs leaves a file behind when it runs (the proof that it was executed),
 * and declares French. Each test has its own: a module runs once per process.
 */
function trap() {
  const dir = tempDir("doc-kit-trap-");
  fs.writeFileSync(
    path.join(dir, "doc.config.mjs"),
    [
      'import fs from "node:fs";',
      'fs.writeFileSync(new URL("./ran.txt", import.meta.url), "ran");',
      'export default { language: "fr" };',
      "",
    ].join("\n"),
  );
  fs.mkdirSync(path.join(dir, "app"));
  return { dir, ran: () => fs.existsSync(path.join(dir, "ran.txt")) };
}

/** Runs `node cli/doc-kit.mjs <args>` in `cwd`: its output, and the URL of every module it loaded. */
function traced(args, cwd, trace) {
  const r = spawnSync(process.execPath, ["--import", TRACE, CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, DOC_KIT_LANG: "", DOC_KIT_MODULE_TRACE: trace },
  });
  const modules = fs.existsSync(trace) ? fs.readFileSync(trace, "utf8").split("\n").filter(Boolean) : [];
  fs.rmSync(trace, { force: true });
  return { code: r.status, out: r.stdout, err: r.stderr, modules };
}

const commandModules = (modules) => [
  ...new Set(modules.filter((u) => u.includes("/cli/commands/")).map((u) => u.slice(u.lastIndexOf("/") + 1))),
];
const playwright = (modules) => modules.filter((u) => /\/node_modules\/playwright(?:-core)?\//.test(u));

describe("--version and --help run nothing of the project", () => {
  test("with --project: its doc.config.mjs never runs for them; a command that loads the project runs it", async () => {
    const { dir, ran } = trap();
    try {
      assert.deepEqual(await cli(["--version", "--project", dir]), {
        code: 0,
        out: `${BRAND.name} ${BRAND.version}\n`,
        err: "",
      });
      const help = await cli(["--help", "--project", dir]);
      assert.equal(help.code, 0);
      assert.ok(help.out.startsWith("Usage : doc-kit [<commande>] [options]\n"), "French, read without running it");
      for (const args of [
        ["-v"],
        ["-h"],
        ...COMMANDS.flatMap((c) => [
          [c, "--help"],
          ["help", c],
        ]),
      ])
        assert.equal((await cli([...args, "--project", dir])).code, 0, args.join(" "));
      assert.equal(ran(), false, "doc.config.mjs did not run");
      // The control: a command loads the project, and runs its configuration (which lacks `product`, in French).
      const build = await cli(["build", "--project", dir]);
      assert.equal(build.code, 2);
      assert.ok(build.err.startsWith(`✖ ${path.join(dir, "doc.config.mjs")} : 1 erreur de configuration\n`), build.err);
      assert.equal(ran(), true, "build ran doc.config.mjs");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("in a sub-folder of the project, as a person types it: no doc.config.mjs run, no command module, no Playwright", () => {
    const { dir, ran } = trap();
    const trace = path.join(dir, "modules.txt");
    const cwd = path.join(dir, "app");
    try {
      const version = traced(["--version"], cwd, trace);
      assert.deepEqual([version.code, version.out], [0, `${BRAND.name} ${BRAND.version}\n`]);
      assert.ok(
        version.modules.includes(pathToFileURL(CLI).href),
        "the trace sees the modules of the CLI (the entry point)",
      );
      assert.deepEqual(commandModules(version.modules), [], "--version: no command module");
      assert.deepEqual(playwright(version.modules), [], "--version: no Playwright");
      assert.deepEqual(
        version.modules.filter((u) => /\/engine\/(?:build\/build|dev\/server)\.mjs$/.test(u)),
        [],
        "--version: neither the build engine nor the dev server",
      );
      const help = traced(["--help"], cwd, trace);
      assert.equal(help.code, 0);
      assert.ok(help.out.startsWith("Usage : doc-kit [<commande>] [options]\n"), "the project's language");
      assert.deepEqual(commandModules(help.modules), [], "--help: no command module");
      assert.deepEqual(playwright(help.modules), [], "--help: no Playwright");
      // The help of one command loads that command's module (and what it imports), no other: still no Playwright,
      // which the capture engine loads when it opens a browser.
      const build = traced(["build", "--help"], cwd, trace);
      assert.equal(build.code, 0);
      assert.deepEqual(commandModules(build.modules), ["build.mjs"]);
      assert.deepEqual(playwright(build.modules), [], "build --help: no Playwright");
      const capture = traced(["capture", "--help"], cwd, trace);
      assert.equal(capture.code, 0);
      assert.deepEqual(commandModules(capture.modules), ["capture.mjs", "connect.mjs"], "connect.mjs: its `shown`");
      assert.deepEqual(playwright(capture.modules), [], "capture --help: no Playwright");
      assert.equal(ran(), false, "doc.config.mjs did not run");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("what else reads the project", () => {
  test("doc-kit without a command (the guided mode) loads the project like a command: it runs doc.config.mjs", async () => {
    const { dir, ran } = trap();
    try {
      // Without a terminal, it only prints the next step; to tell which, it loads the configuration.
      assert.deepEqual(await cli(["--project", dir]), {
        code: 0,
        out: [
          `${BRAND.name} ${BRAND.version} — mode guidé`,
          `Projet de documentation trouvé dans ${absolutePath(dir)}, mais il n'est pas utilisable en l'état :`,
          "",
          "Étape suivante : doc-kit doctor",
          "(pas de terminal : rien n'a été lancé)",
          "",
        ].join("\n"),
        err: [
          "✖ doc.config.mjs : 1 erreur de configuration",
          "  → corrigez les clés signalées ci-dessous (voir schemas/config.schema.json dans le kit)",
          "✖ doc.config.mjs › product: clé obligatoire absente : product",
          "  → ajoutez la clé « product »",
          "",
        ].join("\n"),
      });
      assert.equal(ran(), true, "the guided mode ran doc.config.mjs");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("every step of the guided mode but npm install, and every entry of its menu, is a command of the registry", () => {
    // The guided mode imports the step's module by its name: a step outside the registry would be an internal error.
    for (const step of [...menuFor({ languages: ["en", "fr"] }), "init", "doctor", "connect", "capture", "sync"])
      assert.ok(COMMANDS.includes(step), step);
  });

  test("the language is read only in a regular file of at most 1 MB: a folder or a huge file keeps the default", async () => {
    const LIMIT = 1024 * 1024;
    const folder = tempDir();
    const huge = tempDir();
    const limit = tempDir();
    try {
      fs.mkdirSync(path.join(folder, "doc.config.mjs"));
      const text = 'export default { language: "fr" };\n//';
      // The boundary pair: exactly 1 MB is read, one byte more is not.
      fs.writeFileSync(path.join(limit, "doc.config.mjs"), text.padEnd(LIMIT, "x"));
      fs.writeFileSync(path.join(huge, "doc.config.mjs"), text.padEnd(LIMIT + 1, "x"));
      for (const dir of [folder, huge]) {
        const r = await cli(["--help", "--project", dir]);
        assert.equal(r.code, 0);
        assert.ok(r.out.startsWith("Usage: doc-kit [<command>] [options]\n"), dir);
      }
      assert.ok((await cli(["--help", "--project", limit])).out.startsWith("Usage : doc-kit [<commande>] [options]\n"));
    } finally {
      for (const dir of [folder, huge, limit]) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /** `doc-kit --help --project <a folder whose doc.config.mjs links to target>`, in a child process with a timeout:
   * a reading that never ends fails the test instead of holding up the run. */
  function helpThroughLink(target) {
    const dir = tempDir();
    try {
      fs.symlinkSync(target, path.join(dir, "doc.config.mjs"));
      const r = spawnSync(process.execPath, [CLI, "--help", "--project", dir], {
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, DOC_KIT_LANG: "" },
      });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.startsWith("Usage: doc-kit [<command>] [options]\n"), target);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // POSIX: git checks out a symbolic link as it is. /dev/zero never ends and reports a size of 0: not a regular file.
  test(
    "a doc.config.mjs that is a link to a device is never read: --help does not wait for its end",
    { skip: !fs.existsSync("/dev/zero") && "no /dev/zero on this system" },
    () => helpThroughLink("/dev/zero"),
  );

  // Linux: a /proc file is a regular file that reports a size of 0, and /proc/self/pagemap runs to hundreds of GB.
  test(
    "a doc.config.mjs that is a link to an endless regular file: no more than 1 MB is read",
    { skip: !fs.existsSync("/proc/self/pagemap") && "no /proc/self/pagemap on this system" },
    () => helpThroughLink("/proc/self/pagemap"),
  );
});
describe("the command line, read with the options of the command named, then of every command", () => {
  test("an option of another command is refused, with the command typed", async () => {
    assert.deepEqual(await cli(["build", "--tour", "3"]), {
      code: 2,
      out: "",
      err: "✖ invalid option: --tour (build)\n  → doc-kit <command> --help lists the options of a command; doc-kit --help lists the commands\n",
    });
  });

  test("an option written before the command: the command still runs", async () => {
    // `--width 10` first: the first word is "10", not a command; read again with every option, `check` runs.
    assert.deepEqual(await cli(["--width", "10", "check", "nope", "--project", DEMO]), {
      code: 2,
      out: "",
      err: "✖ unknown check: nope\n  → available checks: coverage, links, tables, images, secrets, all\n",
    });
    // `--since stats sync`: read with the options of stats (which has --since), the command found is sync, not
    // stats: read again, sync runs, with --since stats. A copy of the demo has no application beside it: sync's own
    // refusal is the proof (stats would have printed its statistics).
    const dir = demoCopy();
    try {
      assert.deepEqual(await cli(["--since", "stats", "sync", "--project", dir]), {
        code: 2,
        out: "",
        err: "✖ no application to read\n  → set app.dir in doc.config.mjs, pointing at the application's code\n",
      });
      assert.equal((await cli(["stats", "--since", "sync", "--project", dir])).code, 0, "the control: stats runs");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a name inherited by every object is an unknown command, never a command announced", async () => {
    for (const name of ["constructor", "toString", "__proto__"]) {
      const r = await cli([name]);
      assert.equal(r.code, 2, name);
      assert.ok(r.err.startsWith(`✖ unknown command: ${name}\n  → available commands: audit, backlog,`), r.err);
      assert.ok((await cli(["help", name])).err.startsWith(`✖ unknown command: ${name}\n`), name);
      // Read again with every option (`--width` is not a global one): still an unknown command.
      assert.ok((await cli(["--width", "10", name])).err.startsWith(`✖ unknown command: ${name}\n`), name);
    }
  });
});

describe("the language of a doc.config.mjs, read as text (languageInConfig)", () => {
  test("the first literal of language, or the first item of languages; the key quoted or not", () => {
    for (const [text, expected] of [
      ['export default { language: "fr" };', "fr"],
      ["export default { language: 'fr' };", "fr"],
      ['export default { "language": "fr" };', "fr"],
      ['export default { languages: ["fr", "en"] };', "fr"],
      ["export default {\n  languages: [\n    'en',\n    'fr',\n  ],\n};", "en"],
      // capture.languages is an object keyed by language: never read as the project's language.
      ['export default {\n  capture: { languages: { en: { url: "x" } } },\n  language: "fr",\n};', "fr"],
    ])
      assert.equal(languageInConfig(text), expected, text);
  });

  test("undefined when no key names a language (the schema's default applies), null when it is computed", () => {
    for (const [text, expected] of [
      ['export default { product: { name: "X" } };', undefined],
      // Minimal pairs: only the key's own name counts, and only a two-letter literal is a value.
      ['export default { sourceLanguage: "fr" };', undefined],
      ['export default { mylanguage: "fr" };', undefined],
      ['export default { language: "fra" };', null],
      ["export default { language: process.env.DOC_LANGUAGE };", null],
      ["const l = 'fr';\nexport default { languages: [l, 'en'] };", null],
    ])
      assert.equal(languageInConfig(text), expected, text);
  });
});

describe("--lang", () => {
  test("--lang=fr is --lang fr, and --lang=en is --lang en, whatever DOC_KIT_LANG says", async () => {
    const dir = tempDir();
    try {
      const expected = {
        fr: {
          err: `✖ pas de doc.config.mjs dans ${dir}\n  → indiquez le dossier du projet de documentation, ou créez-le avec doc-kit init\n`,
          usage: "Usage : doc-kit [<commande>] [options]\n",
        },
        en: {
          err: `✖ no doc.config.mjs in ${dir}\n  → point to the documentation project folder, or create one with doc-kit init\n`,
          usage: "Usage: doc-kit [<command>] [options]\n",
        },
      };
      for (const [lang, env] of [
        ["fr", { DOC_KIT_LANG: "en" }],
        ["en", { DOC_KIT_LANG: "fr" }],
      ])
        for (const form of [["--lang", lang], [`--lang=${lang}`]]) {
          const shown = `${form.join(" ")}, DOC_KIT_LANG=${env.DOC_KIT_LANG}`;
          assert.deepEqual(await cli(["build", "--project", dir, ...form], env), {
            code: 2,
            out: "",
            err: expected[lang].err,
          });
          const help = await cli(["--help", ...form], env);
          assert.equal(help.code, 0, shown);
          assert.ok(help.out.startsWith(expected[lang].usage), shown);
        }
      // An unknown language is refused alike in both forms.
      for (const form of [["--lang", "de"], ["--lang=de"]])
        assert.deepEqual(await cli(["--help", ...form]), {
          code: 2,
          out: "",
          err: "✖ --lang: invalid value “de”\n  → expected: en | fr\n",
        });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("doc-kit --help", () => {
  /** The groups of `--help`: { title: [command…] }, from the blocks whose lines all list a command. */
  function groupsOf(text) {
    const groups = {};
    for (const block of text.split("\n\n")) {
      const [title, ...lines] = block.split("\n");
      if (lines.length && lines.every((l) => /^ {2}\S/.test(l)))
        groups[title] = lines.map((l) => l.trim().split(" ")[0]);
    }
    return groups;
  }
  /** The line of a command in `--help`. */
  const lineOf = (text, command) => text.split("\n").find((l) => l.startsWith(`  ${command} `));

  const GROUPED = {
    en: {
      Start: ["init", "doctor", "connect", "demo"],
      Screenshots: ["capture", "record"],
      "Read the application": ["inputs", "facts", "inventory", "bricks", "probe"],
      "Write and review": ["dev", "new", "context", "translate", "build", "view", "open"],
      Quality: ["check", "audit", "optimize", "stats"],
      "Deliver and maintain": ["sync", "changes", "hooks", "pack", "backlog", "export", "upgrade", "skill"],
    },
    fr: {
      Démarrer: ["init", "doctor", "connect", "demo"],
      Captures: ["capture", "record"],
      "Lire l’application": ["inputs", "facts", "inventory", "bricks", "probe"],
      "Écrire et relire": ["dev", "new", "context", "translate", "build", "view", "open"],
      Qualité: ["check", "audit", "optimize", "stats"],
      "Livrer et maintenir": ["sync", "changes", "hooks", "pack", "backlog", "export", "upgrade", "skill"],
    },
  };

  test("every command of cli/commands/ appears once, in its group, in English and in French", async () => {
    assert.deepEqual(COMMANDS, COMMAND_FILES, "the registry names every module of cli/commands/, and only them");
    for (const language of ["en", "fr"]) {
      const { code, out } = await cli(["--help", "--lang", language]);
      assert.equal(code, 0);
      assert.deepEqual(groupsOf(out), GROUPED[language], language);
      assert.deepEqual(Object.values(groupsOf(out)).flat().sort(), COMMAND_FILES, `${language}: every command, once`);
      assert.equal((await cli(["help", "--lang", language])).out, out, `${language}: help alone is --help`);
      assert.doesNotMatch(out, /\{\w+\}|cli\.usage/, `${language}: no variable or key left`);
    }
  });

  test("the line of each command names every option the command declares, in English and in French", async () => {
    for (const language of ["en", "fr"]) {
      const { out } = await cli(["--help", "--lang", language]);
      for (const command of COMMAND_FILES) {
        const line = lineOf(out, command);
        assert.ok(line, `${language}: a line for ${command}`);
        const module = await import(pathToFileURL(path.join(KIT_ROOT, "cli", "commands", `${command}.mjs`)).href);
        const missing = Object.keys(module.options || {}).filter(
          (option) => !new RegExp(`--${option}(?![\\w-])`).test(line),
        );
        assert.deepEqual(missing, [], `${language} ${command}: ${line}`);
      }
    }
  });
});
