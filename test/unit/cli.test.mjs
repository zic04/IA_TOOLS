// CLI: dispatching, exit codes (0 / 1 / 2 / 3), messages "✖ … / → …", build, check links, migrate, open.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { runCli, COMMANDS } from "../../cli/doc-kit.mjs";
import { createContext, builtSite } from "../../cli/common.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";

/** Runs the CLI and captures its output. */
async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: { ...env },
  });
  return { code, out, err };
}

describe("dispatching", () => {
  test("--version, --help, no command", async () => {
    assert.match((await cli(["--version"])).out, /^doc-kit \d+\.\d+\.\d+/);
    const help = await cli(["--help"]);
    assert.equal(help.code, 0);
    assert.ok(help.out.startsWith("Usage: doc-kit [<command>]"), help.out.slice(0, 60));
    assert.ok((await cli(["--help", "--lang", "fr"])).out.startsWith("Usage : doc-kit [<commande>]"));
    // No command: the guided mode; without a terminal, it only prints the next step (exit code 0).
    const guided = await cli([]);
    assert.equal(guided.code, 0);
    assert.match(guided.out, /guided mode/);
  });

  test("help of a command: <command> --help and help <command>, every option of the command, in the message language", async () => {
    const init = await cli(["init", "--help"]);
    assert.equal(init.code, 0);
    assert.match(init.out, /^Usage: doc-kit init \[app-dir\] \[options\]\n/);
    assert.match(
      init.out,
      /\n {2}--lang en\|fr +language of the site/,
      "--lang is an option of init: it sets the site's language",
    );
    assert.match(init.out, /\n {2}--capture app\|none /);
    assert.match(init.out, /\nGlobal options: --project <dir>/);
    assert.equal((await cli(["help", "init"])).out, init.out);
    assert.match((await cli(["help", "capture", "--lang", "fr"])).out, /^Usage : doc-kit capture \[motifs…\]/);
    assert.ok((await cli(["help"])).out.startsWith("Usage: doc-kit [<command>]"), "help alone: the commands");
    // Every command has its help in both languages, and it lists every option of its module.
    for (const language of ["en", "fr"])
      for (const command of COMMANDS) {
        const r = await cli([command, "--help", "--lang", language]);
        assert.equal(r.code, 0, `${language} ${command}`);
        assert.match(r.out, new RegExp(`^Usage ?: doc-kit ${command}\\b`), `${language} ${command}`);
        const module = await import(pathToFileURL(path.join(KIT_ROOT, "cli", "commands", `${command}.mjs`)).href);
        for (const option of Object.keys(module.options || {}))
          assert.ok(r.out.includes(`--${option}`), `${language} ${command} --${option}`);
        assert.doesNotMatch(r.out, /\{\w+\}/, `${language} ${command}: no variable left`);
      }
    const unknown = await cli(["help", "nope"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /^✖ unknown command: nope\n {2}→ available commands: .* \(doc-kit help <command>\)/);
  });

  test("unknown command, invalid option, option of another command → exit code 2", async () => {
    const unknown = await cli(["nope"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /^✖ unknown command: nope\n {2}→ available commands: /);
    // Every command of the contract is delivered.
    for (const c of [
      "init",
      "doctor",
      "connect",
      "demo",
      "capture",
      "build",
      "dev",
      "new",
      "check",
      "audit",
      "inventory",
      "facts",
      "view",
      "open",
      "optimize",
      "migrate",
      "export",
      "upgrade",
      "skill",
    ])
      assert.ok(unknown.err.includes(c), c);
    assert.equal((await cli(["build", "--nope"])).code, 2);
    assert.equal((await cli(["build", "--width", "10", "--project", DEMO])).code, 2);
    assert.equal((await cli(["build", "--lang", "de"])).code, 2);
  });

  test("every command speaks the project's language from its first message, unless --lang is given; not init", async () => {
    const dir = demoCopy();
    try {
      const file = path.join(dir, "doc.config.mjs");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/language:\s*"en"/, 'language: "fr"'));
      assert.match(fs.readFileSync(file, "utf8"), /language: "fr"/);
      // An error raised before the command loads the project (unknown check), and the usage.
      let r = await cli(["check", "nope", "--project", dir], { DOC_KIT_LANG: "en" });
      assert.equal(r.code, 2);
      assert.match(r.err, /^✖ contrôle inconnu : nope/);
      assert.match((await cli(["check", "nope", "--project", dir, "--lang", "en"])).err, /^✖ unknown check/);
      assert.ok((await cli(["--help", "--project", dir])).out.startsWith("Usage : doc-kit [<commande>]"));
      // init creates another project: the project around it does not choose its language.
      r = await cli(["init", dir, "--dir", "content", "--yes", "--name", "X", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /^✖ the folder .*content already exists and is not empty\n/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("project not found → exit code 2, in the requested language", async () => {
    const dir = tempDir();
    try {
      const r = await cli(["build", "--project", dir, "--lang", "fr"]);
      assert.equal(r.code, 2);
      assert.match(r.err, /^✖ pas de doc\.config\.mjs dans /);
      assert.match(r.err, /→ indiquez le dossier du projet de documentation, ou créez-le avec doc-kit init/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("build", () => {
  test("writes the site; messages in the project's language; --date makes it reproducible", async () => {
    const dir = tempDir();
    try {
      const out = path.join(dir, "site.html");
      const r = await cli(["build", "--project", DEMO, "--date", "2026-01-01", "--output", out]);
      assert.equal(r.code, 0, r.err);
      // Two spaces (ARCHITECTURE.md §6.1a): the full site, then one export per space (warnings on stderr; the
      // last export's own summary line also carries their count).
      assert.match(
        r.out,
        /^✔ .*site\.html — 0\.\d MB · 11 pages · 2 screenshots · 5 annotated elements · 1 diagram\n✔ .*site-business\.html — 0\.\d MB · 7 pages · 2 screenshots · 5 annotated elements · 0 diagrams\n✔ .*site-takeover\.html — 0\.\d MB · 4 pages · 0 screenshots · 0 annotated elements · 1 diagram · 2 warnings\n$/,
      );
      assert.match(
        r.err,
        /⚠ export “business”: 2 links to another space replaced by their text\n⚠ export “takeover”: 4 links to another space replaced by their text\n/,
      );
      // Sizes with the decimal comma of the language, each noun in the plural form of its number.
      const fr = await cli([
        "build",
        "--project",
        DEMO,
        "--date",
        "2026-01-01",
        "--output",
        out + "-fr",
        "--lang",
        "fr",
      ]);
      assert.match(
        fr.out,
        /^✔ .*site\.html-fr — 0,\d Mo · 11 pages · 2 captures · 5 éléments annotés · 1 schéma\n✔ .*site-business\.html-fr — 0,\d Mo · 7 pages · 2 captures · 5 éléments annotés · 0 schéma\n✔ .*site-takeover\.html-fr — 0,\d Mo · 4 pages · 0 capture · 0 élément annoté · 1 schéma · 2 avertissements\n$/,
      );
      const html = fs.readFileSync(out, "utf8");
      assert.match(html, /<meta name="generator" content="doc-kit \d+\.\d+\.\d+">/);
      assert.equal(dataOf(html).meta.date, "January 1, 2026");
      await cli(["build", "--project", DEMO, "--date", "2026-01-01", "--output", out + "2"]);
      assert.equal(fs.readFileSync(out + "2", "utf8"), html);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid date → exit code 2", async () => {
    const r = await cli(["build", "--project", DEMO, "--date", "2026-02-30"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /invalid date: 2026-02-30/);
  });

  test("invalid configuration → exit code 2 with the path of the key", async () => {
    const dir = demoCopy();
    try {
      fs.writeFileSync(
        path.join(dir, "doc.config.mjs"),
        'export default { product: { name: "X" }, capture: { storgae: {} } };',
      );
      const r = await cli(["build", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /doc\.config\.mjs: 1 configuration error\n/);
      assert.match(r.err, /› capture\.storgae: unknown key\n {2}→ did you mean “storage”\?/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("incompatible kit → exit code 3", async () => {
    const dir = demoCopy();
    try {
      fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'export default { kit: "^9.0.0", product: { name: "X" } };');
      assert.equal((await cli(["build", "--project", dir])).code, 3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("content error → exit code 1 and nothing written; --draft builds with warnings", async () => {
    const dir = demoCopy();
    try {
      fs.unlinkSync(path.join(dir, "content/use/settings.md"));
      const out = path.join(dir, "out.html");
      const strict = await cli(["build", "--project", dir, "--output", out]);
      assert.equal(strict.code, 1);
      // One problem per page not written yet: neither its template's sections nor the anchors that point into it.
      assert.match(
        strict.err,
        /✖ page not written yet: use\/settings \(content\/use\/settings\.md\)\n {2}→ create it from its template \(doc-kit new use\/settings\)/,
      );
      assert.doesNotMatch(strict.err, /anchor not found|required section/);
      assert.match(strict.err, /✖ 1 error — site NOT generated\./);
      assert.ok(!fs.existsSync(out));
      const draft = await cli(["build", "--project", dir, "--output", out, "--draft"]);
      assert.equal(draft.code, 0);
      assert.match(draft.err, /⚠ page not written yet: use\/settings/);
      // 3, not 1: the two spaces (ARCHITECTURE.md §6.1a) already exclude 2 cross-space links on every build of
      // this demo (see the "writes the site" test above); this page going missing adds its own warning on top.
      assert.match(draft.out, / · 3 warnings\n$/);
      assert.match(fs.readFileSync(out, "utf8"), /Page being written/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--json", async () => {
    const dir = tempDir();
    try {
      const r = await cli(["build", "--project", DEMO, "--json", "--output", path.join(dir, "x.html")]);
      const j = JSON.parse(r.out);
      assert.equal(j.ok, true);
      assert.equal(j.stats.pages, 11);
      // Two spaces (ARCHITECTURE.md §6.1a): one export per declared space, besides the full site above.
      assert.deepEqual(
        j.sites.map((s) => s.space),
        ["business", "takeover"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("check links, migrate, open", () => {
  test("check links: OK on the demo, exit code 1 on a broken link", async () => {
    assert.equal((await cli(["check", "links", "--project", DEMO])).code, 0);
    const dir = demoCopy();
    try {
      fs.appendFileSync(
        path.join(dir, "content/use/settings.md"),
        "\nSee [nowhere](#/use/nowhere) and [bad anchor](#/use/orders~nope).\n",
      );
      const r = await cli(["check", "links", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /✖ \[use\/settings\] broken link: #\/use\/nowhere/);
      assert.match(r.err, /✖ \[use\/settings\] anchor not found: #\/use\/orders~nope/);
      assert.match(r.err, /2 links in error\./);
      assert.equal((await cli(["check", "coverage", "--project", dir])).code, 2);
      assert.equal((await cli(["check", "nope", "--project", dir])).code, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("migrate on a current project: nothing to do", async () => {
    const r = await cli(["migrate", "--project", DEMO]);
    assert.equal(r.code, 0);
    assert.match(r.out, /nothing to migrate/);
  });

  test("open: prints the address (DOC_KIT_NO_OPEN), exit code 1 when the site is not built", async () => {
    const dir = demoCopy();
    try {
      assert.equal((await cli(["open", "--project", dir], { DOC_KIT_NO_OPEN: "1" })).code, 1);
      await cli(["build", "--project", dir]);
      const r = await cli(["open", "use/orders", "--project", dir], { DOC_KIT_NO_OPEN: "1" });
      assert.equal(r.code, 0);
      assert.match(r.out, /^Opening file:\/\/\/.*Acme-Orders-Documentation\.html#\/use\/orders\n$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("builtSite (view/open, cli/common.mjs): a dist/*.html older than a project source (content, images, diagrams, translations, facts, config) is rebuilt as a temporary draft, never reused stale", async () => {
    const dir = demoCopy();
    try {
      assert.equal((await cli(["build", "--project", dir])).code, 0);
      const distFile = path.join(dir, "dist", "Acme-Orders-Documentation.html");
      const builtAt = fs.statSync(distFile).mtimeMs;
      const ctx = createContext({ project: dir });
      await ctx.loadProject();

      // Unchanged since the build: the persisted dist file itself is reused, release() is a no-op.
      const fresh = await builtSite(ctx);
      assert.equal(fresh.file, distFile);
      fresh.release();
      assert.ok(fs.existsSync(distFile), "release() of the real output must never delete it");

      // A content source changed after the build: made unmistakably newer, whatever the filesystem's mtime
      // resolution.
      const page = path.join(dir, "content", "use", "orders.md");
      fs.appendFileSync(page, "\n\nSTALE-MARKER-9f3\n");
      fs.utimesSync(page, new Date(builtAt + 60000), new Date(builtAt + 60000));

      const stale = await builtSite(ctx);
      try {
        assert.notEqual(stale.file, distFile, "a fresh temporary draft, never the stale dist file");
        assert.ok(path.resolve(stale.file).startsWith(path.resolve(os.tmpdir())), stale.file);
        assert.ok(fs.readFileSync(stale.file, "utf8").includes("STALE-MARKER-9f3"), "rebuilt from the changed source");
        assert.ok(
          !fs.readFileSync(distFile, "utf8").includes("STALE-MARKER-9f3"),
          "the stale dist file on disk is untouched",
        );
      } finally {
        stale.release();
      }
      assert.ok(!fs.existsSync(stale.file), "release() removes the temporary draft");

      // requireExisting (open): a missing output is never silently drafted.
      fs.rmSync(distFile);
      await assert.rejects(
        () => builtSite(ctx, { requireExisting: true }),
        (e) => e.key === "site.missing",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("open: prints the address (DOC_KIT_NO_OPEN); a stale dist/*.html is rebuilt and opened from a temporary file instead of the stale one", async () => {
    const dir = demoCopy();
    try {
      assert.equal((await cli(["build", "--project", dir])).code, 0);
      const distFile = path.join(dir, "dist", "Acme-Orders-Documentation.html");
      const builtAt = fs.statSync(distFile).mtimeMs;
      const page = path.join(dir, "content", "use", "orders.md");
      fs.utimesSync(page, new Date(builtAt + 60000), new Date(builtAt + 60000));

      const r = await cli(["open", "use/orders", "--project", dir, "--json"], { DOC_KIT_NO_OPEN: "1" });
      assert.equal(r.code, 0, r.err);
      const opened = fileURLToPath(JSON.parse(r.out).url.split("#")[0]);
      assert.notEqual(opened, distFile);
      assert.ok(!fs.existsSync(opened), "DOC_KIT_NO_OPEN: cleaned up right away, nothing left behind");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
