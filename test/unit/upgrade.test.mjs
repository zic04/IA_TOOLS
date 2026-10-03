// upgrade: changelog between the project's range and the kit, migrations in dry run (diff) then applied,
// `kit` bumped; the migration framework (virtual files, version order, unified diff).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { runCli } from "../../cli/doc-kit.mjs";
import { readChangelog, changesBetween, planUpgrade } from "../../cli/commands/upgrade.mjs";
import {
  rangeBase,
  compareVersions,
  listMigrations,
  pendingMigrations,
  createVirtualFiles,
  unifiedDiff,
  setKitRange,
} from "../../engine/migrations/runner.mjs";
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
  test("versions, range base, the migrations of the kit (the 0.1.0 model is a no-op)", async () => {
    assert.equal(rangeBase("^1.2.0"), "1.2.0");
    assert.equal(rangeBase("~0.1"), "0.1.0");
    assert.equal(rangeBase(">=0.2.0 <0.4.0"), "0.2.0");
    assert.equal(rangeBase("*"), null);
    assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
    const kit = listMigrations();
    assert.ok(kit.some((m) => m.version === "0.1.0"));
    const mod = await import(pathToFileURL(kit.find((m) => m.version === "0.1.0").file).href);
    const files = createVirtualFiles(demoCopyOnce());
    await mod.migrate({ files, config: {}, root: "" });
    assert.deepEqual(files.changes(), []);
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
        "+J",
        "+k",
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
});

let once = null;
function demoCopyOnce() {
  once ??= demoCopy();
  return once;
}

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
    } finally {
      fs.rmSync(kit, { recursive: true, force: true });
    }
  });
});

describe("upgrade", () => {
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
      assert.match(dry.out, /^-  kit: "\^0\.0\.1",\n\+  kit: "\^\d+\.\d+\.\d+",$/m);
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
      if (once) fs.rmSync(once, { recursive: true, force: true });
    }
  });
});
