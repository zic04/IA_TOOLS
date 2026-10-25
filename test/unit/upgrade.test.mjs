// upgrade: changelog between the project's range and the kit, migrations in dry run (diff) then applied,
// `kit` bumped; the migration framework (virtual files, version order, unified diff).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { runCli } from "../../cli/doc-kit.mjs";
import { readChangelog, changesBetween, planUpgrade, migrationFailure } from "../../cli/commands/upgrade.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import {
  listMigrations,
  pendingMigrations,
  createVirtualFiles,
  unifiedDiff,
  setKitRange,
} from "../../engine/migrations/runner.mjs";
import { compareVersions, satisfies } from "../../engine/project/semver.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { KIT_ROOT, demoCopy, tempDir } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}
const setRange = (dir, range) => {
  const f = path.join(dir, "doc.config.mjs");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/kit: "[^"]*"/, `kit: "${range}"`));
};

describe("migration framework", () => {
  test("the migrations of the kit, in version order (the 0.1.0 model is a no-op)", async () => {
    assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
    const kit = listMigrations();
    assert.ok(kit.some((m) => m.version === "0.1.0"));
    const mod = await import(pathToFileURL(kit.find((m) => m.version === "0.1.0").file).href);
    const files = createVirtualFiles(demoCopyOnce());
    await mod.migrate({ files, config: {}, root: "" });
    assert.deepEqual(files.changes(), []);
  });

  test("the migrations to run start after the lowest version the range allows, not the first one written", () => {
    const folder = tempDir("doc-kit-migrations-");
    try {
      for (const v of ["0.2.0", "0.3.0", "0.3.1", "0.4.0", "0.10.0"])
        fs.writeFileSync(path.join(folder, `${v}.mjs`), "");
      const pending = (range, kit = "0.4.0") => pendingMigrations(range, kit, folder).map((m) => m.version);
      assert.deepEqual(pending("^0.4.0 || ^0.3.0"), ["0.3.1", "0.4.0"], "the 0.3 to 0.4 migrations run");
      assert.deepEqual(pending("<1.0.0"), ["0.2.0", "0.3.0", "0.3.1", "0.4.0"], "every one up to the kit");
      assert.deepEqual(pending(">=0.2.0 <0.4.0"), ["0.3.0", "0.3.1", "0.4.0"]);
      assert.deepEqual(pending(">0.3.0"), ["0.4.0"], ">0.3.0 allows 0.3.1 first");
      assert.deepEqual(pending("^0.4.0"), [], "a project at the kit's version: none");
      assert.deepEqual(pending("^0.3.0", "0.10.0"), ["0.3.1", "0.4.0", "0.10.0"], "0.10.0 after 0.4.0");
      assert.deepEqual(pending("*"), ["0.2.0", "0.3.0", "0.3.1", "0.4.0"]);
      assert.deepEqual(pending(">2.0.0 <1.0.0"), ["0.2.0", "0.3.0", "0.3.1", "0.4.0"], "a range that allows none: all");
      // A pre-release of the kit runs the migrations up to it, not its release's.
      assert.deepEqual(pending("^0.3.0", "0.4.0-rc.1"), ["0.3.1"]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  test("virtual files: nothing on disk until apply; list, remove, diff", () => {
    const dir = tempDir();
    try {
      fs.mkdirSync(path.join(dir, "content"));
      fs.writeFileSync(path.join(dir, "content", "a.md"), "one\ntwo\nthree\n");
      const files = createVirtualFiles(dir);
      files.write("content/a.md", "one\n2\nthree\n");
      files.write("content/b.md", "new\n");
      files.remove("content/a.md");
      assert.equal(files.exists("content/a.md"), false);
      assert.deepEqual(files.list("content"), ["content/b.md"]);
      assert.equal(fs.readFileSync(path.join(dir, "content", "a.md"), "utf8"), "one\ntwo\nthree\n", "untouched");
      assert.deepEqual(
        files.changes().map((c) => c.file),
        ["content/a.md", "content/b.md"],
      );
      files.apply();
      assert.ok(!fs.existsSync(path.join(dir, "content", "a.md")));
      assert.equal(fs.readFileSync(path.join(dir, "content", "b.md"), "utf8"), "new\n");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unified diff and kit range", () => {
    const letters = "abcdefghijklmn".split("");
    const before = letters.join("\n");
    const after = letters.map((l) => (l === "c" || l === "m" ? l.toUpperCase() : l)).join("\n");
    assert.equal(
      unifiedDiff("x.txt", before, after),
      [
        "--- a/x.txt",
        "+++ b/x.txt",
        "@@ -1,6 +1,6 @@",
        " a",
        " b",
        "-c",
        "+C",
        " d",
        " e",
        " f",
        "@@ -10,5 +10,5 @@",
        " j",
        " k",
        " l",
        "-m",
        "+M",
        " n",
        "\\ No newline at end of file",
      ].join("\n"),
    );
    // Changes at most 6 lines apart share one hunk; an added last line.
    assert.equal(
      unifiedDiff("y", "a\nb\nc\nd\ne\nf\ng\nh\ni\nj", "a\nb\nC\nd\ne\nf\ng\nh\ni\nJ\nk"),
      [
        "--- a/y",
        "+++ b/y",
        "@@ -1,10 +1,11 @@",
        " a",
        " b",
        "-c",
        "+C",
        " d",
        " e",
        " f",
        " g",
        " h",
        " i",
        "-j",
        "\\ No newline at end of file",
        "+J",
        "+k",
        "\\ No newline at end of file",
      ].join("\n"),
    );
    assert.equal(unifiedDiff("x", "same", "same"), "");
    assert.equal(
      setKitRange('export default { kit: "^0.0.1", product: {} };', "^0.1.0"),
      'export default { kit: "^0.1.0", product: {} };',
    );
    assert.equal(
      setKitRange("export default defineConfig({ product: {} });", "^0.1.0"),
      'export default defineConfig({\n  kit: "^0.1.0", product: {} });',
    );
  });

  test("unified diff: a patch that applies, its last line and the missing line break as diff -u writes them", () => {
    // GNU diff -u's own text: no phantom empty line after a text that ends with a line break.
    assert.equal(
      unifiedDiff("f", "one\ntwo\nthree\n", "one\n2\nthree\n"),
      ["--- a/f", "+++ b/f", "@@ -1,3 +1,3 @@", " one", "-two", "+2", " three"].join("\n"),
    );
    // A line break added at the end changes the last line.
    assert.equal(
      unifiedDiff("f", "a\nb", "a\nb\n"),
      ["--- a/f", "+++ b/f", "@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+b"].join("\n"),
    );
    assert.equal(
      unifiedDiff("f", null, "x\ny\n"),
      ["--- /dev/null", "+++ b/f", "@@ -0,0 +1,2 @@", "+x", "+y"].join("\n"),
    );
    const pairs = [
      ["one\ntwo\nthree\n", "one\n2\nthree\n"],
      ["a\nb", "a\nb\n"],
      ["a\nb\n", "a\nb"],
      ["a\nb", "a\nc"],
      ["a\nb\nc\n", "a\nb\n"],
      ["", "x\n"],
      ["\n", "\n\n"],
      [null, "x"],
      ["x\ny\n", null],
      ["x", null],
    ];
    for (const [before, after] of pairs)
      assert.equal(applyPatch(before, unifiedDiff("f", before, after)), after ?? "", JSON.stringify([before, after]));
    // Any two texts of a few lines, with or without a last line break (a seeded generator: the same texts each run).
    let seed = 7;
    const random = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
    const text = () =>
      Array.from({ length: random(9) }, () => ["a", "b", "c", ""][random(4)]).join("\n") + ["", "\n"][random(2)];
    for (let i = 0; i < 400; i++) {
      const before = text();
      const after = text();
      if (before !== after) assert.equal(applyPatch(before, unifiedDiff("f", before, after, random(4))), after);
    }
  });
});

/**
 * A unified diff applied to a text as `patch` applies one, strictly: every context and removed line must be the
 * text's own, with or without its line break, and each hunk's header must give its place and its counts.
 */
function applyPatch(text, patch) {
  const source = (text ?? "").match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const lines = patch.split("\n");
  assert.match(lines[0], /^--- (a\/|\/dev\/null)/);
  assert.match(lines[1], /^\+\+\+ (b\/|\/dev\/null)/);
  const out = [];
  let at = 0;
  for (let i = 2; i < lines.length;) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[i++]);
    assert.ok(h, `a hunk header: ${lines[i - 1]}`);
    const [oldStart, oldCount, newStart, newCount] = [h[1], h[2] ?? "1", h[3], h[4] ?? "1"].map(Number);
    const first = oldCount ? oldStart - 1 : oldStart;
    assert.ok(first >= at, "hunks in order");
    while (at < first) out.push(source[at++]);
    assert.equal(out.length, newCount ? newStart - 1 : newStart, "the hunk's new start");
    const seen = [0, 0];
    while (i < lines.length && !lines[i].startsWith("@@")) {
      const line = lines[i++];
      const end = lines[i] === "\\ No newline at end of file" ? (i++, "") : "\n";
      assert.ok([" ", "-", "+"].includes(line[0]), `a hunk line: ${JSON.stringify(line)}`);
      if (line[0] !== "+") {
        assert.equal(source[at++], line.slice(1) + end, "a context or removed line is the text's");
        seen[0]++;
      }
      if (line[0] !== "-") {
        out.push(line.slice(1) + end);
        seen[1]++;
      }
    }
    assert.deepEqual(seen, [oldCount, newCount], "the hunk's counts");
  }
  while (at < source.length) out.push(source[at++]);
  return out.join("");
}

let once = null;
function demoCopyOnce() {
  once ??= demoCopy();
  return once;
}
after(() => {
  if (once) fs.rmSync(once, { recursive: true, force: true });
});

describe("changelog", () => {
  test("entries between the project's range and the kit; missing CHANGELOG.md → null", () => {
    const kit = tempDir();
    try {
      assert.equal(readChangelog(kit), null);
      fs.writeFileSync(
        path.join(kit, "CHANGELOG.md"),
        "# Changelog\n\n## [Unreleased]\n- next\n\n## [0.3.0] - 2026-12-01\n- three\n\n## 0.2.0\n- two\n\n## [0.1.0] - 2026-10-01\n- one\n",
      );
      const entries = readChangelog(kit);
      assert.deepEqual(
        entries.map((e) => e.version),
        ["0.3.0", "0.2.0", "0.1.0"],
      );
      assert.deepEqual(
        changesBetween(entries, "^0.1.0", "0.3.0").map((e) => [e.version, e.body]),
        [
          ["0.3.0", "- three"],
          ["0.2.0", "- two"],
        ],
      );
      assert.deepEqual(
        changesBetween(entries, "^0.1.0", "0.2.0").map((e) => e.version),
        ["0.2.0"],
      );
      // From the lowest version the range allows, not the first one written (VER-01).
      assert.deepEqual(
        changesBetween(entries, "^0.3.0 || ^0.1.0", "0.3.0").map((e) => e.version),
        ["0.3.0", "0.2.0"],
      );
      assert.deepEqual(
        changesBetween(entries, "<1.0.0", "0.3.0").map((e) => e.version),
        ["0.3.0", "0.2.0", "0.1.0"],
      );
    } finally {
      fs.rmSync(kit, { recursive: true, force: true });
    }
  });
});

describe("upgrade", () => {
  test("a pre-release of the kit: --apply writes a range that names it, which its release accepts too", async () => {
    const dir = demoCopy();
    try {
      setRange(dir, "^0.4.1");
      const configFile = path.join(dir, "doc.config.mjs");
      const raw = { kit: "^0.4.1" };
      const plan = await planUpgrade({
        root: dir,
        configFile,
        raw,
        apply: true,
        kitVersion: "0.5.0-rc.1",
        kitRoot: dir,
      });
      assert.equal(plan.compatible, false, "a range written for releases refuses it");
      assert.equal(plan.applied, true);
      assert.match(fs.readFileSync(configFile, "utf8"), /kit: "\^0\.5\.0-rc\.1"/);
      assert.ok(satisfies("0.5.0-rc.1", plan.newRange) && satisfies("0.5.0", plan.newRange), plan.newRange);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a migration of a later kit: dry run shows the diff, --apply writes it and bumps kit", async () => {
    const dir = demoCopy();
    const migrations = tempDir("doc-kit-migrations-");
    try {
      fs.writeFileSync(
        path.join(migrations, "0.2.0.mjs"),
        `export const version = "0.2.0";
export async function migrate({ files }) {
  const toc = JSON.parse(files.read("content/toc.json"));
  toc.tagline = toc.tagline + " (migrated)";
  files.write("content/toc.json", JSON.stringify(toc, null, 2) + "\\n");
}
`,
      );
      fs.writeFileSync(
        path.join(migrations, "0.9.0.mjs"),
        'export const version = "0.9.0"; export async function migrate() { throw new Error("too new"); }',
      );
      setRange(dir, "^0.1.0");
      const configFile = path.join(dir, "doc.config.mjs");
      const raw = { kit: "^0.1.0" };
      const plan = await planUpgrade({
        root: dir,
        configFile,
        raw,
        kitVersion: "0.3.0",
        migrationsFolder: migrations,
        kitRoot: dir,
      });
      assert.equal(plan.compatible, false);
      assert.equal(plan.changelog, null);
      assert.deepEqual(plan.migrations, [{ version: "0.2.0" }]);
      assert.deepEqual(
        plan.diffs.map((d) => d.file),
        ["content/toc.json", "doc.config.mjs"],
      );
      assert.match(plan.diffs[1].diff, /^- {2}kit: "\^0\.1\.0",\n\+ {2}kit: "\^0\.3\.0",$/m);
      assert.equal(plan.applied, false);
      assert.match(fs.readFileSync(configFile, "utf8"), /kit: "\^0\.1\.0"/, "dry run: nothing written");

      const applied = await planUpgrade({
        root: dir,
        configFile,
        raw,
        apply: true,
        kitVersion: "0.3.0",
        migrationsFolder: migrations,
        kitRoot: dir,
      });
      assert.equal(applied.applied, true);
      assert.match(fs.readFileSync(configFile, "utf8"), /kit: "\^0\.3\.0"/);
      assert.match(JSON.parse(fs.readFileSync(path.join(dir, "content", "toc.json"), "utf8")).tagline, /\(migrated\)$/);
      assert.equal(pendingMigrations("^0.3.0", "0.3.0", migrations).length, 0, "nothing left to run");

      // A failing migration: nothing written, exit code 1 through the CLI path.
      const failing = await planUpgrade({
        root: dir,
        configFile,
        raw: { kit: "^0.3.0" },
        apply: true,
        kitVersion: "0.9.0",
        migrationsFolder: migrations,
        kitRoot: dir,
      });
      assert.equal(failing.error.version, "0.9.0");
      assert.equal(failing.applied, false);
      assert.match(fs.readFileSync(configFile, "utf8"), /kit: "\^0\.3\.0"/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(migrations, { recursive: true, force: true });
    }
  });

  test("a migration that refuses a project (a KitError): its own message and help, in en and fr; nothing written", async () => {
    const dir = demoCopy();
    const migrations = tempDir("doc-kit-migrations-");
    try {
      const errors = pathToFileURL(path.join(KIT_ROOT, "engine", "project", "errors.mjs")).href;
      fs.writeFileSync(
        path.join(migrations, "0.4.0.mjs"),
        `import { KitError, EXIT } from ${JSON.stringify(errors)};
export const version = "0.4.0";
export async function migrate() { throw new KitError(EXIT.CHECK, "new.noToc", { file: "content/toc.json" }); }
`,
      );
      const plan = await planUpgrade({
        root: dir,
        configFile: path.join(dir, "doc.config.mjs"),
        raw: { kit: "^0.3.0" },
        apply: true,
        kitVersion: "0.4.0",
        migrationsFolder: migrations,
        kitRoot: dir,
      });
      assert.equal(plan.applied, false);
      const failure = migrationFailure(plan.migrations[0]);
      assert.deepEqual(failure, {
        key: "new.noToc",
        vars: { file: "content/toc.json", version: "0.4.0" },
      });
      for (const [language, text, help] of [
        ["en", /^table of contents not found: content\/toc\.json/, /doc-kit init/],
        ["fr", /^sommaire introuvable : content\/toc\.json/, /doc-kit init/],
      ]) {
        const { t } = createI18n({ language });
        assert.match(t(`cli.${failure.key}`, failure.vars), text, language);
        assert.match(t(`cli.${failure.key}.help`, { command: "doc-kit" }), help, language);
      }
      assert.equal(migrationFailure({ version: "0.4.0" }), null, "a migration that ran");
      assert.deepEqual(migrationFailure({ version: "0.9.0", error: "too new" }), {
        key: "upgrade.migrationFailed",
        vars: { version: "0.9.0", error: "too new" },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(migrations, { recursive: true, force: true });
    }
  });

  test("CLI: an incompatible project is upgraded (dry run, then --apply), and builds again", async () => {
    const dir = demoCopy();
    try {
      setRange(dir, "^0.0.1");
      assert.equal((await cli(["build", "--project", dir])).code, 3);
      const dry = await cli(["upgrade", "--project", dir]);
      assert.equal(dry.code, 0, dry.err);
      assert.match(
        dry.out,
        new RegExp(
          `^Project range \\^0\\.0\\.1 \\(doc\\.config\\.mjs\\) · installed kit ${BRAND.version.replace(/\./g, "\\.")}$`,
          "m",
        ),
      );
      assert.match(dry.out, /^⚠ the project requires \^0\.0\.1: kit .* is refused until the upgrade is applied$/m);
      if (!fs.existsSync(path.join(KIT_ROOT, "CHANGELOG.md"))) assert.match(dry.out, /^⚠ no CHANGELOG\.md in the kit/m);
      assert.match(dry.out, /✔ 0\.1\.0 — baseline of the project format \(no change\)/);
      assert.match(dry.out, /^- {2}kit: "\^0\.0\.1",\n\+ {2}kit: "\^\d+\.\d+\.\d+",$/m);
      assert.match(dry.out, /Nothing written \(dry run\)\. To apply: doc-kit upgrade --apply\n$/);
      const apply = await cli(["upgrade", "--apply", "--project", dir]);
      assert.equal(apply.code, 0);
      assert.match(apply.out, /1 file updated; the project now requires kit \^/);
      // In a new process (this one keeps the configuration module it already imported).
      const rebuilt = spawnSync(
        process.execPath,
        [path.join(KIT_ROOT, "cli", "doc-kit.mjs"), "build", "--project", dir, "--output", path.join(dir, "x.html")],
        { encoding: "utf8" },
      );
      assert.equal(rebuilt.status, 0, rebuilt.stderr);
      const again = await cli(["upgrade", "--project", dir, "--lang", "fr"]);
      assert.match(again.out, /le projet est à jour/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
