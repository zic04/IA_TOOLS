// export: self-contained copy (engine vendored, package.json rewritten, EXPORT.json, README section, frozen
// version, warnings for outside paths, secrets and work files left out), offline rebuild with the vendored
// engine, zip archive.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runCli } from "../../cli/doc-kit.mjs";
import { freezeFallback, closingBrace, VENDOR } from "../../cli/commands/export.mjs";
import { readZip } from "../../engine/dev/zip.mjs";
import { BRAND, generatorTag } from "../../engine/brand.mjs";
import { KIT_ROOT, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}

/** A demo project as an application repository would hold it: docs inside, version and .env outside. */
function repository() {
  const repo = tempDir("doc-kit-repo-");
  const docs = path.join(repo, "docs", "manual");
  fs.mkdirSync(path.dirname(docs), { recursive: true });
  fs.cpSync(demoCopy(), docs, { recursive: true });
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "acme-orders", version: "2.4.0" }));
  fs.writeFileSync(path.join(repo, ".env"), "ACME_API=https://api.acme.example\n");
  fs.mkdirSync(path.join(repo, "app"));
  fs.writeFileSync(
    path.join(docs, "doc.config.mjs"),
    `// Demo configuration, with paths outside the documentation folder.
export default {
  kit: "^0.1.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  version: { file: "../../package.json", pattern: "\\"version\\"\\\\s*:\\\\s*\\"([^\\"]+)\\"", fallback: "0.0.0" },
  theme: { logo: "theme/logo.svg" },
  masking: { env: ["../../.env"] },
  coverage: [{ adapter: "next-app-router", app: "../../app" }],
  statuses: { open: ["st-0", "Open"], cancelled: ["#64748b", "Cancelled"] },
};
`,
  );
  fs.writeFileSync(
    path.join(docs, "package.json"),
    JSON.stringify(
      {
        name: "acme-orders-documentation",
        private: true,
        type: "module",
        scripts: { site: "doc-kit build" },
        dependencies: { [BRAND.packageName]: "file:../../../kit" },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(docs, "package-lock.json"), "{}");
  fs.writeFileSync(path.join(docs, ".env.local"), "TOKEN=secret");
  fs.mkdirSync(path.join(docs, ".doc-kit"));
  fs.writeFileSync(path.join(docs, ".doc-kit", "session.json"), '{"cookies":[]}');
  fs.mkdirSync(path.join(docs, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(docs, "node_modules", "x", "index.js"), "");
  return { repo, docs };
}

describe("freezeFallback", () => {
  test("replaces, inserts in the version object, or adds the object; comments and nested braces kept", () => {
    assert.equal(
      freezeFallback('export default {\n  version: { file: "x", fallback: "0.0.0" }, // v\n};', "1.2.3"),
      'export default {\n  version: { file: "x", fallback: "1.2.3" }, // v\n};',
    );
    assert.equal(
      freezeFallback('export default { version: { file: "a" } };', "1.0.0"),
      'export default { version: { fallback: "1.0.0", file: "a" } };',
    );
    assert.equal(
      freezeFallback('export default defineConfig({\n  product: { name: "A" },\n});', "2.0.0"),
      'export default defineConfig({\n  version: { fallback: "2.0.0" },\n  product: { name: "A" },\n});',
    );
    const nested =
      'export default { version: { pattern: "v\\\\d{1,3}", /* } */ file: "x" }, extra: { version: { fallback: "no" } } };';
    assert.equal(
      freezeFallback(nested, "9.9.9"),
      'export default { version: { fallback: "9.9.9", pattern: "v\\\\d{1,3}", /* } */ file: "x" }, extra: { version: { fallback: "no" } } };',
    );
    assert.equal(closingBrace("{ '}' }", 0), 6);
    assert.equal(freezeFallback("module.exports = 1;", "1.0.0"), null);
  });
});

describe("export", () => {
  test("self-contained copy: content, vendored engine, package.json, EXPORT.json, README, frozen version, warnings", async () => {
    const { repo, docs } = repository();
    const target = path.join(tempDir("doc-kit-export-"), "acme docs");
    try {
      const r = await cli(["export", target, "--project", docs]);
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.err,
        /^⚠ version\.file points outside the project \(\.\.\/\.\.\/package\.json\): the copy shows the frozen version/m,
      );
      assert.match(r.err, /^⚠ masking\.env\[0\] points outside the project \(\.\.\/\.\.\/\.env\)/m);
      assert.match(
        r.err,
        /^⚠ coverage\[0\]\.app points outside the project \(\.\.\/\.\.\/app\): the coverage check cannot run in the copy\n {2}→ /m,
      );
      assert.match(r.out, /not exported: \.env\.local, package-lock\.json/);
      assert.match(r.out, /engine \d+\.\d+\.\d+ vendored \(\d+ files\) · documented version 2\.4\.0/);
      assert.match(r.out, /npm install\n {2}npm run site\n$/);

      // Left out: secrets, session, dependencies, lock file.
      for (const f of [".env.local", ".doc-kit", "node_modules", "package-lock.json"])
        assert.ok(!fs.existsSync(path.join(target, f)), f);
      for (const f of [
        "content/toc.json",
        "images/orders-list.webp",
        "images/zones/orders-list.json",
        "diagrams/flow.svg",
        "theme/logo.svg",
        ".gitignore",
      ])
        assert.ok(fs.existsSync(path.join(target, f)), f);
      // The vendored engine: what builds, nothing else.
      const vendor = path.join(target, ...VENDOR.split("/"));
      for (const f of [
        "engine/build/build.mjs",
        "cli/doc-kit.mjs",
        "i18n/en.json",
        "schemas/config.schema.json",
        "templates/project/en/doc.config.mjs",
        "templates/project/fr/doc.config.mjs",
        "standard/templates.json",
        "LICENSE",
      ])
        assert.ok(fs.existsSync(path.join(vendor, f)), f);
      for (const f of ["test", "examples", "skill", "docs", "ci", "node_modules"])
        assert.ok(!fs.existsSync(path.join(vendor, f)), f);
      const vendored = JSON.parse(fs.readFileSync(path.join(vendor, "package.json"), "utf8"));
      assert.equal(vendored.version, BRAND.version);
      assert.equal(vendored.scripts, undefined);
      assert.deepEqual(Object.keys(vendored.dependencies).sort(), ["marked", "playwright"]);

      const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
      assert.equal(pkg.dependencies[BRAND.packageName], "file:./vendor/doc-kit");
      assert.equal(pkg.scripts.site, "doc-kit build");
      const info = JSON.parse(fs.readFileSync(path.join(target, "EXPORT.json"), "utf8"));
      assert.deepEqual(info.kit, { name: BRAND.packageName, version: BRAND.version });
      assert.equal(info.source.product, "Acme Orders");
      assert.equal(info.source.version, "2.4.0");
      assert.equal(info.source.path, docs.split(path.sep).join("/"));
      assert.match(info.date, /^\d{4}-\d{2}-\d{2}T/);
      const readme = fs.readFileSync(path.join(target, "README.md"), "utf8");
      assert.match(readme, /<!-- doc-kit:export -->\n## Standalone copy\n/);
      assert.match(readme, /npm install {8}# links the vendored engine \(file:\.\/vendor\/doc-kit\)/);
      const config = fs.readFileSync(path.join(target, "doc.config.mjs"), "utf8");
      assert.match(config, /fallback: "2\.4\.0"/);
      assert.match(config, /^\/\/ Demo configuration/, "comments kept");

      // Offline rebuild with the vendored engine. `npm install` would link the engine and install its two
      // dependencies; the same links are made here by hand (no network).
      fs.mkdirSync(path.join(target, "node_modules"));
      fs.symlinkSync(vendor, path.join(target, "node_modules", BRAND.packageName), "junction");
      fs.symlinkSync(path.join(KIT_ROOT, "node_modules"), path.join(vendor, "node_modules"), "junction");
      const out = path.join(target, "dist", "site.html");
      const run = spawnSync(
        process.execPath,
        [
          path.join(vendor, "cli", "doc-kit.mjs"),
          "build",
          "--project",
          target,
          "--date",
          "2026-01-01",
          "--output",
          out,
        ],
        { encoding: "utf8" },
      );
      assert.equal(run.status, 0, run.stderr);
      const html = fs.readFileSync(out, "utf8");
      assert.ok(html.includes(`<meta name="generator" content="${generatorTag()}">`));
      assert.equal(
        dataOf(html).meta.version,
        "2.4.0",
        "frozen version, the repository's package.json being out of reach",
      );
      assert.equal(dataOf(html).meta.stats.pages, 11);
      // Same output as the kit itself on the same copy.
      const reference = await cli(["build", "--project", target, "--date", "2026-01-01", "--output", out + ".ref"]);
      assert.equal(reference.code, 0, reference.err);
      assert.equal(fs.readFileSync(out + ".ref", "utf8"), html);
    } finally {
      // The links are removed first: a cleanup never follows them into the kit.
      for (const link of [
        path.join(target, "node_modules", BRAND.packageName),
        path.join(target, ...VENDOR.split("/"), "node_modules"),
      ])
        if (fs.existsSync(link)) fs.unlinkSync(link);
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });

  test("--with-dist --zip; non-empty target → 1; no target → 2", async () => {
    const { repo, docs } = repository();
    const parent = tempDir("doc-kit-export-");
    const target = path.join(parent, "handover");
    try {
      const noDist = await cli(["export", target, "--project", docs, "--with-dist", "--json"]);
      assert.equal(noDist.code, 0);
      assert.ok(JSON.parse(noDist.out).warnings.some((w) => w.key === "export.noDist"));
      fs.rmSync(target, { recursive: true });

      assert.equal((await cli(["build", "--project", docs])).code, 0);
      const r = await cli(["export", target, "--project", docs, "--with-dist", "--zip"]);
      assert.equal(r.code, 0, r.err);
      assert.ok(fs.existsSync(path.join(target, "dist", "Acme-Orders-Documentation.html")));
      assert.match(r.out, /✔ archive .*handover\.zip \(\d+\.\d MB\)/);
      const entries = readZip(path.join(parent, "handover.zip"));
      const files = fs
        .readdirSync(target, { recursive: true })
        .map(String)
        .filter((f) => fs.statSync(path.join(target, f)).isFile());
      assert.equal(entries.length, files.length);
      assert.ok(entries.every((e) => e.name.startsWith("handover/")));
      const pkg = entries.find((e) => e.name === "handover/package.json");
      assert.equal(pkg.data.toString("utf8"), fs.readFileSync(path.join(target, "package.json"), "utf8"));

      const again = await cli(["export", target, "--project", docs]);
      assert.equal(again.code, 1);
      assert.match(again.err, /already exists and is not empty\n {2}→ choose a new or empty folder/);
      assert.equal((await cli(["export", "--project", docs])).code, 2);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
