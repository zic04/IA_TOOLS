// The CLI's start-up (ARCHITECTURE.md §4): `--version` and `--help` run nothing of the folder they are typed in (its
// doc.config.mjs, or a parent's, is never imported for them: the language of the messages is read as text) and
// load no command module and no Playwright; `--lang=fr` is `--lang fr`; `--help` lists every command of
// cli/commands/, in its group, with every option the command declares.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { COMMANDS } from "../../cli/registry.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { languageInConfig } from "../../engine/project/find.mjs";
import { KIT_ROOT, tempDir, noExec } from "../tools/helpers.mjs";

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
      for (const args of [["build", "--help"], ["help", "sync"], ["-v"], ["-h"]])
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
