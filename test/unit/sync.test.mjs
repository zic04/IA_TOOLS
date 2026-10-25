// `doc-kit sync` (ARCHITECTURE.md §6.10): hashing, route → files, dependencies of a page, proofs, labels,
// marking, the report (review/unchanged/proofs/labels/captures/new/removed/unmarked), --apply, the CLI, --check
// and --estimate. git is read only, reached through the `exec` test seam (engine/sync/git.mjs): never a real
// git process, never a repository created by the tests.
import { test, describe, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir, noExec } from "../tools/helpers.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { runCoverage, adapterTools } from "../../engine/check/coverage.mjs";
import { hashText, hashPlanEntry, stableStringify, hashFile } from "../../engine/core/hash.mjs";
import { createGit } from "../../engine/sync/git.mjs";
import { routeFiles, matchRoute } from "../../engine/sync/routes.mjs";
import { resolveImports } from "../../engine/facts/imports.mjs";
import { pageDependencies, writtenPages, captureIds } from "../../engine/sync/dependencies.mjs";
import { extractProofs, recordProof, locateProof, rewriteProof, PROOF_REF } from "../../engine/sync/proofs.mjs";
import { citedLabels, replaceLabel, flattenMessages, labelFiles } from "../../engine/sync/labels.mjs";
import { readSyncReference, writeSyncReference, markPages } from "../../engine/sync/reference.mjs";
import { compareWithReference, renderReport, writeReportFiles, checkFails } from "../../engine/sync/report.mjs";
import { applyReport } from "../../engine/sync/apply.mjs";
import { estimateUpdate } from "../../engine/sync/estimate.mjs";
import { loadPageTemplates } from "../../engine/core/page-templates.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { readSchema } from "../../engine/project/load.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { PROOF } from "../../engine/audit/audit.mjs";
import { fileInside } from "../../engine/core/confine.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures");

/** A fresh copy of sync-docs + sync-app, side by side (doc.config.mjs's app.dir: "../sync-app"). */
function syncFixtureCopy() {
  const dir = tempDir("doc-kit-sync-");
  fs.cpSync(path.join(FIXTURES, "sync-docs"), path.join(dir, "sync-docs"), { recursive: true });
  fs.cpSync(path.join(FIXTURES, "sync-app"), path.join(dir, "sync-app"), { recursive: true });
  return {
    root: path.join(dir, "sync-docs"),
    appDir: path.join(dir, "sync-app"),
    release: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Loaded, validated configuration of a (copied) sync-docs project. */
async function syncConfig(root) {
  const mod = await import(pathToFileURL(path.join(root, "doc.config.mjs")).href);
  return prepareConfig(mod.default, { env: {} });
}

const readToc = (root, config) =>
  JSON.parse(fs.readFileSync(path.join(root, config.paths.content, "toc.json"), "utf8"));

/** Runs the CLI and captures its output; `io` adds the test seams (exec, commit). */
async function cli(args, io = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
    exec: noExec,
    ...io,
  });
  return { code, out, err };
}

/** A fake `exec` seam (ARCHITECTURE.md §4 "Test seams"): never a real git process. */
function fakeExec({ rev = "c0ffee", changed = [], diffs = {}, showFiles = {} } = {}) {
  return (bin, args) => {
    if (bin !== "git") return null;
    if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n" };
    if (args[0] === "rev-parse") return { status: 0, stdout: rev + "\n" };
    if (args[0] === "show") {
      const [ref, file] = args.at(-1).split(":");
      const key = `${ref}:${file.replace(/^\.\//, "")}`;
      return key in showFiles ? { status: 0, stdout: showFiles[key] } : { status: 1, stdout: "" };
    }
    if (args[0] === "diff" && args[1] === "--name-status") return { status: 0, stdout: changed.join("\n") };
    if (args[0] === "diff") {
      const ref = args[3]; // ["diff", "--relative", "--end-of-options", ref, "--", …paths]
      return { status: 0, stdout: diffs[ref] || "" };
    }
    return { status: 1, stdout: "" };
  };
}

describe("engine/core/hash.mjs", () => {
  test("hashText: BOM removed, CRLF/CR normalised to LF, 16 hex characters", () => {
    const a = hashText("line1\nline2\n");
    const b = hashText("line1\r\nline2\r\n");
    const c = hashText("﻿line1\nline2\n");
    assert.equal(a, b);
    assert.equal(a, c);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.notEqual(hashText("line1\nline2\n"), hashText("line1\nline2 \n"), "a trailing space changes the hash");
  });

  test("hashText: a binary buffer (NUL in the first 8 KB) is hashed as is", () => {
    const bin = Buffer.concat([Buffer.from("PNG"), Buffer.from([0]), Buffer.from("\r\nrest")]);
    const h1 = hashText(bin);
    const h2 = hashText(Buffer.concat([Buffer.from("PNG"), Buffer.from([0]), Buffer.from("\r\nrest")]));
    assert.equal(h1, h2);
  });

  test("hashFile: null when the file does not exist", () => {
    const dir = tempDir();
    try {
      assert.equal(hashFile(path.join(dir, "nope.txt")), null);
      fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
      assert.equal(hashFile(path.join(dir, "a.txt")), hashText("hello\n"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stableStringify: sorted keys, RegExp and function as their source, undefined omitted", () => {
    assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
    assert.ok(stableStringify({ re: /x/i }).includes("/x/i"));
    assert.ok(stableStringify({ fn: () => 1 }).includes("=>"));
    assert.equal(stableStringify({ a: 1, b: undefined }), stableStringify({ a: 1 }));
  });

  test("hashPlanEntry: stable across key order, ignores `file`", () => {
    const e1 = { id: "x", route: "/x", file: "a.mjs" };
    const e2 = { file: "b.mjs", route: "/x", id: "x" };
    assert.equal(hashPlanEntry(e1), hashPlanEntry(e2));
    assert.notEqual(hashPlanEntry(e1), hashPlanEntry({ ...e1, route: "/y" }));
  });
});

describe("engine/sync/git.mjs (read-only exec seam)", () => {
  test("head, show, changed (incl. rename), diff; every call goes through exec, never a real process", () => {
    const calls = [];
    const exec = (bin, args, options) => {
      calls.push([bin, args]);
      return fakeExec({
        rev: "abc123",
        changed: ["M\tfoo.ts", "R100\told.ts\tnew.ts"],
        diffs: { abc123: "@@ -1 +1 @@\n-old\n+new\n" },
        showFiles: { "abc123:foo.ts": "hello\n" },
      })(bin, args, options);
    };
    const git = createGit(exec, "/app");
    assert.equal(git.available(), true);
    assert.equal(git.head(), "abc123");
    assert.equal(git.show("abc123", "foo.ts"), "hello\n");
    assert.equal(git.show("abc123", "missing.ts"), null);
    assert.deepEqual(git.changed("abc123"), [
      { status: "M", path: "foo.ts" },
      { status: "R", path: "new.ts", from: "old.ts" },
    ]);
    assert.match(git.diff("abc123", ["foo.ts"]), /\+new/);
    assert.equal(git.diff("abc123", []), "");
    // Never a write command.
    assert.ok(!calls.some(([, args]) => ["commit", "add", "checkout", "stash", "reset", "push"].includes(args[0])));
  });

  test("relative to `dir`, not to the repository root (a monorepo: app.dir sits below the top level)", () => {
    // `<rev>:<path>` is always relative to the repository's top level unless "./" is prepended; `--relative`
    // does the same for `diff --name-status` and for a pathspec-limited `diff`.
    const calls = [];
    const exec = (bin, args) => {
      calls.push(args);
      return { status: 0, stdout: "" };
    };
    const git = createGit(exec, "/repo/app");
    git.show("abc123", "lib/orders.ts");
    assert.deepEqual(calls.at(-1), ["show", "--end-of-options", "abc123:./lib/orders.ts"]);
    git.changed("abc123");
    assert.ok(calls.at(-1).includes("--relative"), calls.at(-1).join(" "));
    git.diff("abc123", ["lib/orders.ts"]);
    assert.deepEqual(calls.at(-1), ["diff", "--relative", "--end-of-options", "abc123", "--", "lib/orders.ts"]);
  });

  test("a reference that is not one (an option, a space, a colon) is refused before git runs (SECURITY.md)", () => {
    const calls = [];
    const git = createGit((bin, args) => (calls.push(args), { status: 0, stdout: "x" }), "/app");
    for (const ref of ["--output=/tmp/pwned", "-p", "a b", "HEAD:secret", "", null]) {
      assert.equal(git.show(ref, "f.ts"), null, String(ref));
      assert.equal(git.changed(ref), null, String(ref));
      assert.equal(git.diff(ref, ["f.ts"]), null, String(ref));
    }
    assert.deepEqual(calls, []);
    for (const ref of ["abc123", "HEAD~2", "v1.0^", "main@{1}", "origin/main", "release-1.2"])
      assert.notEqual(git.diff(ref, ["f.ts"]), null, ref);
  });

  test("no git / not a repository: every call degrades to null, never throws", () => {
    const git = createGit(() => null, "/app");
    assert.equal(git.available(), false);
    assert.equal(git.head(), null);
    assert.equal(git.show("x", "f"), null);
    assert.equal(git.changed("x"), null);
  });
});

describe("engine/sync/routes.mjs", () => {
  let fx;
  before(async () => {
    fx = syncFixtureCopy();
  });
  after(() => fx.release());

  test("next-app-router: page + layout files for /orders and /orders/[id]", async () => {
    const config = await syncConfig(fx.root);
    const tools = adapterTools(fx.root);
    const spec = config.coverage[0];
    const files1 = routeFiles({
      spec,
      options: { app: "../sync-app/app", family: "Routes", exclude: ["^/$"], api: false, apiFamily: "API" },
      item: { id: "/orders" },
      route: "/orders",
      tools,
    });
    assert.deepEqual(files1.sort(), ["../sync-app/app/layout.tsx", "../sync-app/app/orders/page.tsx"]);
    const files2 = routeFiles({
      spec,
      options: { app: "../sync-app/app" },
      item: { id: "/orders/[id]" },
      route: "/orders/[id]",
      tools,
    });
    assert.deepEqual(files2.sort(), ["../sync-app/app/layout.tsx", "../sync-app/app/orders/[id]/page.tsx"]);
  });

  test("react-router: the routes file itself ([].concat(options.file))", () => {
    const tools = adapterTools(fx.root);
    assert.deepEqual(
      routeFiles({
        spec: { adapter: "react-router" },
        options: { file: "src/App.tsx" },
        item: { id: "/x" },
        route: "/x",
        tools,
      }),
      ["src/App.tsx"],
    );
    assert.deepEqual(
      routeFiles({
        spec: { adapter: "react-router" },
        options: { file: ["a.tsx", "b.tsx"] },
        item: { id: "/x" },
        route: "/x",
        tools,
      }),
      ["a.tsx", "b.tsx"],
    );
  });

  test("fastapi: the file of the decorator matching the item's id", async () => {
    const tools = adapterTools(fx.root);
    const files = routeFiles({
      spec: { adapter: "fastapi" },
      options: { app: "../sync-app/backend" },
      item: { id: "GET /api/orders/{id}" },
      route: "/api/orders/{id}",
      tools,
    });
    assert.deepEqual(files, ["../sync-app/backend/api/orders.py"]);
  });

  test("glob: the file itself", () => {
    const tools = adapterTools(fx.root);
    assert.deepEqual(
      routeFiles({
        spec: { adapter: "glob" },
        options: { base: "public" },
        item: { id: "orders.html" },
        route: "/orders",
        tools,
      }),
      ["public/orders.html"],
    );
  });

  test("an item with `files` already wins over derivation; an unknown adapter gives []", () => {
    const tools = adapterTools(fx.root);
    assert.deepEqual(
      routeFiles({
        spec: { adapter: "next-app-router" },
        options: {},
        item: { id: "/x", files: ["a.ts"] },
        route: "/x",
        tools,
      }),
      ["a.ts"],
    );
    assert.deepEqual(
      routeFiles({ spec: { adapter: "openapi" }, options: {}, item: { id: "/x" }, route: "/x", tools }),
      [],
    );
    assert.deepEqual(
      routeFiles({ spec: { adapter: "i18n-registry" }, options: {}, item: { id: "/x" }, route: "/x", tools }),
      [],
    );
  });

  test("matchRoute: normalised comparison, else id equality, else null", () => {
    const items = [{ id: "/orders/[id]", match: ["/orders/[id]", "/orders/:id", "/orders/"] }];
    assert.equal(matchRoute("/orders/42", items), null, "a concrete id is not matched by the static prefix alone here");
    assert.equal(matchRoute("/orders/", items).id, "/orders/[id]");
    assert.equal(matchRoute("/nope", items), null);
    assert.equal(matchRoute("/orders/[id]", [{ id: "/orders/[id]", match: [] }]).id, "/orders/[id]");
  });
});

describe("engine/facts/imports.mjs", () => {
  let fx;
  before(() => {
    fx = syncFixtureCopy();
  });
  after(() => fx.release());

  test("closure from the orders page: @/ alias, relative ../../.., ignored extensions and packages", () => {
    const { files, truncated } = resolveImports({
      appDir: fx.appDir,
      files: ["app/orders/page.tsx", "app/layout.tsx"],
    });
    assert.equal(truncated, false);
    assert.ok(files.has("app/orders/page.tsx"));
    assert.ok(files.has("components/order-table.tsx"), "@/components/order-table resolved via tsconfig baseUrl/paths");
    assert.ok(files.has("lib/orders.ts"), "components/order-table.tsx → @/lib/orders");
    assert.ok(!files.has("app/orders/orders.css"), "a .css import is ignored");
  });

  test("relative ../../../lib/orders from app/orders/[id]/page.tsx", () => {
    const { files } = resolveImports({ appDir: fx.appDir, files: ["app/orders/[id]/page.tsx"] });
    assert.ok(files.has("lib/orders.ts"));
  });

  test("Python: relative `from .deps import db`, absolute, package ignored, index/__init__", () => {
    const { files } = resolveImports({ appDir: fx.appDir, files: ["backend/api/orders.py"] });
    assert.ok(files.has("backend/api/deps.py"));
  });

  test("maxDepth and maxFiles bound the closure; a file outside app.dir is ignored", () => {
    const dir = tempDir("doc-kit-imports-");
    try {
      // a → b → c → d → e (depth chain)
      fs.writeFileSync(path.join(dir, "a.mjs"), 'import "./b.mjs";\n');
      fs.writeFileSync(path.join(dir, "b.mjs"), 'import "./c.mjs";\n');
      fs.writeFileSync(path.join(dir, "c.mjs"), 'import "./d.mjs";\n');
      fs.writeFileSync(path.join(dir, "d.mjs"), 'import "./e.mjs";\n');
      fs.writeFileSync(path.join(dir, "e.mjs"), "export default 1;\n");
      const { files } = resolveImports({ appDir: dir, files: ["a.mjs"], maxDepth: 2 });
      assert.ok(files.has("c.mjs") && !files.has("d.mjs"), [...files].join(","));
      fs.writeFileSync(path.join(dir, "escape.mjs"), "export default 1;\n");
      fs.writeFileSync(path.join(dir, "inside.mjs"), 'import "../escape.mjs";\n');
      const r2 = resolveImports({ appDir: path.join(dir), files: ["inside.mjs"] });
      assert.ok(!r2.files.has("../escape.mjs") && ![...r2.files].some((f) => f.includes("..")));
      // maxFiles: a hub importing many files
      const many = Array.from({ length: 10 }, (_, i) => `m${i}.mjs`);
      for (const m of many) fs.writeFileSync(path.join(dir, m), "export default 1;\n");
      fs.writeFileSync(path.join(dir, "hub.mjs"), many.map((m) => `import "./${m}";`).join("\n") + "\n");
      const r3 = resolveImports({ appDir: dir, files: ["hub.mjs"], maxFiles: 5 });
      assert.equal(r3.truncated, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("jsonc tsconfig (comments, trailing comma) is tolerated", () => {
    const dir = tempDir("doc-kit-jsonc-");
    try {
      fs.writeFileSync(
        path.join(dir, "tsconfig.json"),
        '{\n  // a comment\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": { "@/*": ["./src/*"], },\n  },\n}\n',
      );
      fs.mkdirSync(path.join(dir, "src"));
      fs.writeFileSync(path.join(dir, "src", "x.ts"), "export const x = 1;\n");
      fs.writeFileSync(path.join(dir, "a.ts"), 'import { x } from "@/x";\n');
      const { files } = resolveImports({ appDir: dir, files: ["a.ts"] });
      assert.ok(files.has("src/x.ts"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("engine/sync/dependencies.mjs", () => {
  let fx;
  let config;
  let toc;
  let inventory;
  before(async () => {
    fx = syncFixtureCopy();
    config = await syncConfig(fx.root);
    toc = readToc(fx.root, config);
    inventory = await runCoverage({ root: fx.root, config });
  });
  after(() => fx.release());

  test("use/orders: direct page, shared layout, direct proof (lib/orders.ts), shared import (order-table.tsx)", async () => {
    const deps = await pageDependencies({
      root: fx.root,
      config,
      toc,
      pageId: "use/orders",
      inventory,
      tools: adapterTools(fx.root),
      factsDir: config.paths.facts,
    });
    const byPath = Object.fromEntries(deps.files.map((f) => [f.path, f]));
    assert.equal(byPath["app/orders/page.tsx"].kind, "direct");
    assert.equal(
      byPath["app/layout.tsx"].kind,
      "shared",
      "a layout is always shared (ARCHITECTURE.md §2.3), even though it is in R",
    );
    assert.ok(byPath["app/layout.tsx"].via.includes("layout"));
    assert.equal(
      byPath["lib/orders.ts"].kind,
      "direct",
      "direct via the proof even though it sits outside app/orders/",
    );
    assert.ok(byPath["lib/orders.ts"].via.includes("proof") && byPath["lib/orders.ts"].via.includes("import"));
    assert.equal(byPath["components/order-table.tsx"].kind, "shared");
    assert.ok(!byPath["app/orders/orders.css"], "a stylesheet import is never a dependency");
    assert.deepEqual(
      deps.proofs.map((p) => p.ref),
      ["lib/orders.ts:42"],
    );
    assert.equal(deps.truncated, false);
  });

  test("its topic group: the files of the other pages, declared on them alone (one level, never direct)", async () => {
    const depsOf = async (tocOf) =>
      pageDependencies({
        root: fx.root,
        config,
        toc: tocOf,
        pageId: "use/orders",
        inventory,
        tools: adapterTools(fx.root),
        factsDir: config.paths.facts,
      });
    const viaGroup = (deps) => deps.files.filter((f) => f.via.includes("counterpart"));
    assert.deepEqual(viaGroup(await depsOf(toc)), [], "no group: no file of another page");
    // The orders API names use/orders as its counterpart: use/orders follows the API page's files.
    const grouped = structuredClone(toc);
    const pages = grouped.sections.flatMap((s) => s.groups).flatMap((g) => g.pages);
    pages.find((p) => p.id === "take-over/orders-api").counterpart = ["use/orders"];
    const files = viaGroup(await depsOf(grouped));
    assert.ok(files.length > 0, "the API page's files");
    assert.ok(
      files.every((f) => f.kind !== "direct" || f.via.length > 1),
      "never direct through the group alone",
    );
  });

  test("use/orders/detail: page+layout direct, lib/orders.ts shared (reached only by import, no proof here)", async () => {
    const deps = await pageDependencies({
      root: fx.root,
      config,
      toc,
      pageId: "use/orders/detail",
      inventory,
      tools: adapterTools(fx.root),
      factsDir: config.paths.facts,
    });
    const byPath = Object.fromEntries(deps.files.map((f) => [f.path, f]));
    assert.equal(byPath["app/orders/[id]/page.tsx"].kind, "direct");
    assert.equal(byPath["lib/orders.ts"].kind, "shared");
  });

  test("take-over/orders-api: `sources` glob (direct) + ::facts table (shared, doc: prefix)", async () => {
    const deps = await pageDependencies({
      root: fx.root,
      config,
      toc,
      pageId: "take-over/orders-api",
      inventory,
      tools: adapterTools(fx.root),
      factsDir: config.paths.facts,
    });
    const byPath = Object.fromEntries(deps.files.map((f) => [f.path, f]));
    assert.equal(byPath["backend/api/orders.py"].kind, "direct");
    assert.equal(byPath["backend/api/deps.py"].kind, "direct");
    assert.equal(byPath[`doc:${config.paths.facts}/api.json`].kind, "shared");
    assert.deepEqual(deps.factsSources, ["api"]);
  });

  test('captureIds: :::screen{capture="…"} and ::capture{id="…"}, English and French', () => {
    assert.deepEqual(captureIds('Before.\n:::screen{capture="orders-list" title="x"}\nBody\n:::\n'), ["orders-list"]);
    assert.deepEqual(captureIds(':::ecran{capture="x" titre="y"}\n:::\n::capture{id="y" titre="z"}\n'), ["x", "y"]);
  });

  test("writtenPages: a page with guidance left is not written; declared-but-missing is not written either", () => {
    const written = writtenPages({ root: fx.root, config, toc });
    assert.deepEqual(written.map((p) => p.id).sort(), ["take-over/orders-api", "use/orders", "use/orders/detail"]);
  });
});

describe("engine/sync/proofs.mjs", () => {
  test("extractProofs: single line, range, Dockerfile/Makefile, a URL is ignored; parity with PROOF", () => {
    const md = "`lib/orders.ts:42` and `api.py:7-12` and `Dockerfile:3` and `https://host.example.org:443/x` and ``.";
    const proofs = extractProofs(md);
    assert.deepEqual(
      proofs.map((p) => p.ref),
      ["lib/orders.ts:42", "api.py:7-12", "Dockerfile:3"],
    );
    assert.equal(proofs[1].from, 7);
    assert.equal(proofs[1].to, 12);
    assert.equal(proofs[0].to, undefined);
    // Every PROOF_REF match is a PROOF match too (the same file family).
    for (const m of md.matchAll(new RegExp(PROOF_REF.source, "g"))) assert.ok(PROOF.test(m[0]), m[0]);
  });

  test("extractProofs: a badge shown in a code span is not a proof; the file is the last word before :line", () => {
    const md = "Write `[[verified lib/orders.ts:42]]` to mark a claim; see `the handler lib/orders.ts:7`.";
    const proofs = extractProofs(md);
    assert.deepEqual(
      proofs.map((p) => [p.ref, p.file]),
      [["lib/orders.ts:7", "lib/orders.ts"]],
    );
    assert.ok(proofs[0].span.includes(proofs[0].file), "the file stays a substring of its span (rewriteProof)");
  });

  test("resolveProofFile / extractProofs({ appDir }): as written, else the one file ending with it; two candidates are never guessed", () => {
    const dir = tempDir("sync-proof-paths-");
    try {
      for (const f of [
        "api/app/routers/tokens.py",
        "api/app/models/token.py",
        "api/app/schemas/token.py",
        "web/components/tokens-table.tsx",
        "node_modules/x/tokens-table.tsx",
        "docs/manual/doc.config.mjs",
        "docs/manual/tokens-table.tsx",
      ]) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), "line 1\nline 2\n");
      }
      const proofs = extractProofs(
        "`api/app/routers/tokens.py:2` `tokens.py:1` `tokens-table.tsx:2` `schemas/token.py:1` `token.py:1` `missing.ts:1`",
        { appDir: dir },
      );
      assert.deepEqual(
        proofs.map((p) => p.path),
        [
          "api/app/routers/tokens.py",
          "api/app/routers/tokens.py",
          "web/components/tokens-table.tsx",
          "api/app/schemas/token.py",
          null,
          null,
        ],
      );
      assert.ok(recordProof(dir, proofs[2]), "recorded through its resolved path");
      assert.equal(recordProof(dir, proofs[4]), null, "ambiguous: not recorded");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("recordProof: null when the file is missing or `from` is beyond the last line", () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, "a.ts"), "l1\nl2\nl3\n");
      assert.deepEqual(recordProof(dir, { file: "a.ts", from: 2, to: undefined }), {
        hash: hashText("l2"),
        text: "l2",
      });
      assert.equal(recordProof(dir, { file: "a.ts", from: 99 }), null);
      assert.equal(recordProof(dir, { file: "missing.ts", from: 1 }), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("locateProof: intact, moved (unique match), ambiguous, text not found, file deleted, renamed", () => {
    const recorded = { hash: hashText("if (x) {"), text: "if (x) {" };
    const proof = { file: "a.ts", from: 5, to: undefined };
    assert.equal(
      locateProof({ current: "l1\nl2\nl3\nl4\nif (x) {\nl6\n", renamedTo: null, recorded, proof }).status,
      "intact",
    );
    const moved = locateProof({ current: "if (x) {\nl2\n", renamedTo: null, recorded, proof });
    assert.deepEqual(moved, { status: "moved", newFile: "a.ts", newFrom: 1, newTo: 1 });
    const ambiguous = locateProof({ current: "if (x) {\nif (x) {\n", renamedTo: null, recorded, proof });
    assert.deepEqual(ambiguous, { status: "broken", reason: "ambiguous" });
    const notFound = locateProof({ current: "nothing here\n", renamedTo: null, recorded, proof });
    assert.deepEqual(notFound, { status: "broken", reason: "textNotFound" });
    assert.deepEqual(locateProof({ current: null, renamedTo: null, recorded, proof }), {
      status: "broken",
      reason: "fileDeleted",
    });
    const renamed = locateProof({ current: "pad\nif (x) {\n", renamedTo: "b.ts", recorded, proof });
    assert.equal(renamed.newFile, "b.ts");
    assert.deepEqual(
      locateProof({ current: "\n", renamedTo: null, recorded: { hash: "x", text: "" }, proof }),
      { status: "broken", reason: "textNotFound" },
      "a blank cited line is always broken",
    );
  });

  test("rewriteProof: only the file:from(-to) part changes, every occurrence of the span, range length kept", () => {
    const md = "See `lib/orders.ts:42` and again `lib/orders.ts:42` but not `other.ts:42`.";
    const proof = extractProofs(md)[0];
    const out = rewriteProof(md, proof, { newFile: "lib/orders.ts", newFrom: 50, newTo: 50 });
    assert.equal(out, "See `lib/orders.ts:50` and again `lib/orders.ts:50` but not `other.ts:42`.");
    const ranged = extractProofs("`a.py:7-12`")[0];
    const out2 = rewriteProof("`a.py:7-12`", ranged, { newFile: "b.py", newFrom: 20, newTo: 25 });
    assert.equal(out2, "`b.py:20-25`");
  });
});

describe("engine/sync/labels.mjs", () => {
  test("flattenMessages: nested → dotted keys, strings only", () => {
    assert.deepEqual(flattenMessages({ orders: { approve: "Approve", count: 3 }, flat: "x" }), {
      "orders.approve": "Approve",
      flat: "x",
    });
  });

  test("citedLabels: 2+ chars, verbatim, by at least one page; a one-character value is ignored", () => {
    const pages = [
      { id: "use/orders", markdown: "Click **Approve** to continue." },
      { id: "use/other", markdown: "Nothing here." },
    ];
    const cited = citedLabels({ "orders.approve": "Approve", "orders.x": "A", "orders.unused": "Reject" }, pages);
    assert.deepEqual(cited, [{ key: "orders.approve", value: "Approve", pages: ["use/orders"] }]);
  });

  test("replaceLabel: bold, code span, [[menu …]], quotes — never in plain prose", () => {
    const md =
      'Approve is not touched here. **Approve** and `Approve` and [[menu Approve]] and "Approve" and «Approve».';
    const { text, n } = replaceLabel(md, "Approve", "Validate");
    assert.equal(n, 5);
    assert.ok(text.startsWith("Approve is not touched here."), "plain prose is never rewritten");
    assert.ok(
      text.includes("**Validate**") &&
        text.includes("`Validate`") &&
        text.includes("[[menu Validate]]") &&
        text.includes('"Validate"') &&
        text.includes("«Validate»"),
    );
  });

  test("labelFiles: config.sync.labels glob (literal '../' prefix supported); else the i18n-registry adapters", async () => {
    const fx = syncFixtureCopy();
    try {
      const config = await syncConfig(fx.root);
      assert.deepEqual(labelFiles(fx.root, config), ["../sync-app/messages/en.json"]);
      const configNoSync = { ...config, sync: { labels: [] }, coverage: config.coverage };
      assert.deepEqual(labelFiles(fx.root, configNoSync), ["../sync-app/messages/en.json"]);
    } finally {
      fx.release();
    }
  });
});

describe("engine/sync/reference.mjs: markPages + writeSyncReference/readSyncReference", () => {
  let fx;
  let config;
  let toc;
  let inventory;
  before(async () => {
    fx = syncFixtureCopy();
    config = await syncConfig(fx.root);
    toc = readToc(fx.root, config);
    inventory = await runCoverage({ root: fx.root, config });
  });
  after(() => fx.release());

  test("marks every written page; the file conforms to the schema, keys sorted, declared accumulated", async () => {
    const { reference, warnings } = await markPages({
      root: fx.root,
      config,
      toc,
      all: true,
      date: "2026-10-02",
      commit: "c0ffee",
      version: "1.4.0",
      inventory,
      plans: [],
    });
    assert.deepEqual(Object.keys(reference.pages).sort(), ["take-over/orders-api", "use/orders", "use/orders/detail"]);
    assert.deepEqual(warnings, []);
    const file = writeSyncReference(fx.root, config, reference);
    assert.ok(fs.existsSync(file));
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(Object.keys(raw), ["generator", "app", "pages", "proofs", "labels", "inventory", "captures"]);
    assert.deepEqual(Object.keys(raw.pages), Object.keys(raw.pages).slice().sort(), "pages sorted");
    assert.deepEqual(Object.keys(raw.inventory), Object.keys(raw.inventory).slice().sort(), "inventory sorted");
    assert.deepEqual(validate(raw, readSchema("sync")).errors, []);
    const { reference: reread } = readSyncReference(fx.root, config);
    assert.deepEqual(reread.pages["use/orders"].files, reference.pages["use/orders"].files);

    // --sources accumulates onto the page it marks.
    const { reference: ref2 } = await markPages({
      root: fx.root,
      config,
      toc,
      pages: ["use/orders"],
      sources: ["extra.txt:1-3"],
      date: "2026-10-03",
      commit: "c0ffee",
      version: "1.4.0",
      inventory,
      plans: [],
      reference,
    });
    assert.deepEqual(ref2.pages["use/orders"].declared, ["extra.txt:1-3"]);
    assert.deepEqual(
      ref2.pages["use/orders/detail"],
      reference.pages["use/orders/detail"],
      "an untouched page is kept exactly as it was",
    );
  });

  test("a page not written yet is refused (sync.unwritten, exit code 1 at the CLI)", async () => {
    await assert.rejects(
      () =>
        markPages({
          root: fx.root,
          config,
          toc,
          pages: ["use/nope"],
          date: "2026-10-02",
          commit: null,
          version: "1.0.0",
          inventory,
          plans: [],
        }),
      (e) => e.key === "sync.unwritten",
    );
  });

  test("a proof whose file does not exist is not recorded and is reported as a warning", async () => {
    const brokenToc = JSON.parse(JSON.stringify(toc));
    const page = brokenToc.sections[0].groups[0].pages[0];
    page.id = "use/orders"; // unchanged, but we'll temporarily break the app side instead
    const noAppDir = { ...config, app: { ...config.app, dir: "../does-not-exist" } };
    const { warnings } = await markPages({
      root: fx.root,
      config: noAppDir,
      toc,
      pages: ["use/orders"],
      date: "2026-10-02",
      commit: null,
      version: "1.0.0",
      inventory,
      plans: [],
    });
    assert.ok(warnings.some((w) => w.key === "sync.proofUnresolved" && w.vars.page === "use/orders"));
  });
});

describe("engine/sync/report.mjs: compareWithReference", () => {
  // Each scenario gets its OWN fresh copy and its OWN reference: these tests mutate the application, and must
  // never see another scenario's mutations.
  async function freshSetup() {
    const fx = syncFixtureCopy();
    const config = await syncConfig(fx.root);
    const toc = readToc(fx.root, config);
    const inventory = await runCoverage({ root: fx.root, config });
    const { reference } = await markPages({
      root: fx.root,
      config,
      toc,
      all: true,
      date: "2026-10-02",
      commit: "c0ffee",
      version: "1.0.0",
      inventory,
      plans: [],
    });
    const compare = (overrides = {}) =>
      compareWithReference({
        root: fx.root,
        config,
        toc,
        reference,
        since: null,
        git: createGit(() => null, fx.appDir),
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
        ...overrides,
      });
    return { fx, config, toc, inventory, reference, compare };
  }

  test("(a) nothing changed → everything unchanged", async () => {
    const { fx, compare } = await freshSetup();
    try {
      const r = await compare();
      assert.deepEqual(r.unchanged.sort(), ["take-over/orders-api", "use/orders", "use/orders/detail"]);
      assert.equal(r.review.length, 0);
      assert.equal(checkFails(r), false);
    } finally {
      fx.release();
    }
  });

  test("(b) a line inserted before line 42 → proof moved + review (direct for use/orders, shared for detail)", async () => {
    const { fx, compare } = await freshSetup();
    try {
      const file = path.join(fx.appDir, "lib/orders.ts");
      const text = fs
        .readFileSync(file, "utf8")
        .replace("export function checkOrder(order) {", "export function checkOrder(order) {\n  // inserted");
      fs.writeFileSync(file, text);
      const r = await compare();
      assert.equal(r.proofs.moved.length, 1);
      assert.equal(r.proofs.moved[0].page, "use/orders");
      assert.equal(r.proofs.moved[0].newRef, "lib/orders.ts:43");
      const byPage = Object.fromEntries(r.review.map((x) => [x.page, x]));
      assert.equal(byPage["use/orders"].priority, "direct");
      assert.equal(byPage["use/orders/detail"].priority, "shared");
      assert.equal(checkFails(r), true);
    } finally {
      fx.release();
    }
  });

  test("(c) line 42 removed entirely → proof broken (textNotFound)", async () => {
    const { fx, compare } = await freshSetup();
    try {
      const file = path.join(fx.appDir, "lib/orders.ts");
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.splice(41, 1); // remove the 42nd line (the proof's line, 1-indexed)
      fs.writeFileSync(file, lines.join("\n"));
      const r = await compare();
      assert.equal(r.proofs.broken.length, 1);
      assert.equal(r.proofs.broken[0].reason, "textNotFound");
    } finally {
      fx.release();
    }
  });

  test("(d) a label's value changes → labels entry, citing page listed", async () => {
    const { fx, compare } = await freshSetup();
    try {
      const file = path.join(fx.appDir, "messages/en.json");
      fs.writeFileSync(file, JSON.stringify({ orders: { approve: "Validate", new: "New order" } }));
      const r = await compare();
      assert.equal(r.labels.length, 1);
      assert.deepEqual(r.labels[0], {
        file: "../sync-app/messages/en.json",
        key: "orders.approve",
        old: "Approve",
        new: "Validate",
        pages: ["use/orders"],
      });
    } finally {
      fx.release();
    }
  });

  test("(e) a new route appears: /customers shares no segment with existing routes → suggest null; /orders/new → suggest use/orders", async () => {
    const { fx, config, compare } = await freshSetup();
    try {
      fs.mkdirSync(path.join(fx.appDir, "app/customers"), { recursive: true });
      fs.writeFileSync(
        path.join(fx.appDir, "app/customers/page.tsx"),
        "export default function C() { return null; }\n",
      );
      const inv1 = await runCoverage({ root: fx.root, config });
      const r1 = await compare({ inventory: inv1 });
      const customers = r1.new.find((n) => n.id === "/customers");
      assert.equal(customers.suggest, null);

      fs.mkdirSync(path.join(fx.appDir, "app/orders/new"), { recursive: true });
      fs.writeFileSync(
        path.join(fx.appDir, "app/orders/new/page.tsx"),
        "export default function N() { return null; }\n",
      );
      const inv2 = await runCoverage({ root: fx.root, config });
      const r2 = await compare({ inventory: inv2 });
      const ordersNew = r2.new.find((n) => n.id === "/orders/new");
      assert.equal(ordersNew.suggest, "use/orders");
    } finally {
      fx.release();
    }
  });

  test("(f) a route disappears but is still cited (toc.routes) → removed, listing the citing page", async () => {
    const { fx, config, compare } = await freshSetup();
    try {
      fs.rmSync(path.join(fx.appDir, "app/orders/[id]"), { recursive: true, force: true });
      const inv = await runCoverage({ root: fx.root, config });
      const r = await compare({ inventory: inv });
      const removed = r.removed.find((x) => x.id === "/orders/[id]");
      assert.ok(removed, JSON.stringify(r.removed));
      assert.ok(removed.pages.includes("use/orders/detail"));
    } finally {
      fx.release();
    }
  });

  test("(g) a shared file changes: a git diff with no cited token → probablyIntact; with one → shared; no git → shared", async () => {
    const { fx, compare } = await freshSetup();
    try {
      fs.writeFileSync(
        path.join(fx.appDir, "app/layout.tsx"),
        'export default function RootLayout({ children }) {\n  return <html><body className="updated">{children}</body></html>;\n}\n',
      );
      const noToken = await compare({
        git: createGit(
          fakeExec({ diffs: { c0ffee: '@@ -1 +1 @@\n-old\n+<html><body className="updated">\n' } }),
          fx.appDir,
        ),
      });
      const p1 = noToken.review.find((r) => r.page === "use/orders");
      assert.equal(p1.priority, "probablyIntact");

      const withToken = await compare({
        git: createGit(fakeExec({ diffs: { c0ffee: "@@ -1 +1 @@\n-old\n+totally /orders unrelated\n" } }), fx.appDir),
      });
      const p2 = withToken.review.find((r) => r.page === "use/orders");
      assert.equal(p2.priority, "shared", "the page's own route is a cited token");

      const noGit = await compare({ git: null });
      const p3 = noGit.review.find((r) => r.page === "use/orders");
      assert.equal(p3.priority, "shared", "without git, never probablyIntact");
    } finally {
      fx.release();
    }
  });

  test("(h) unmarked: a written page absent from the reference", async () => {
    const { fx, config, toc, inventory, reference } = await freshSetup();
    try {
      const r = await compareWithReference({
        root: fx.root,
        config,
        toc,
        reference: { ...reference, pages: {} },
        since: null,
        git: null,
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
      });
      assert.deepEqual(r.unmarked.sort(), ["take-over/orders-api", "use/orders", "use/orders/detail"]);
      assert.equal(checkFails(r), false, "unmarked never fails --check");
    } finally {
      fx.release();
    }
  });

  test("renderReport + writeReportFiles: writes sync.md, sync-report.json, a .gitignore under .doc-kit", async () => {
    const { fx, compare } = await freshSetup();
    try {
      const r = await compare();
      const t = createI18n({ language: "en" }).t;
      const md = renderReport(r, t);
      assert.match(md, /Following the application/);
      writeReportFiles({ root: fx.root, report: r, diffs: new Map(), t });
      assert.ok(fs.existsSync(path.join(fx.root, ".doc-kit", "sync.md")));
      assert.ok(fs.existsSync(path.join(fx.root, ".doc-kit", "sync-report.json")));
      assert.equal(fs.readFileSync(path.join(fx.root, ".doc-kit", ".gitignore"), "utf8"), "*\n");
    } finally {
      fx.release();
    }
  });
});

describe("engine/sync/apply.mjs", () => {
  test("rewrites every occurrence of a moved proof; --labels replaces only in allowed contexts; restores CRLF; counts", async () => {
    const fx = syncFixtureCopy();
    try {
      const config = await syncConfig(fx.root);
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const { reference } = await markPages({
        root: fx.root,
        config,
        toc,
        all: true,
        date: "2026-10-02",
        commit: "c0ffee",
        version: "1.0.0",
        inventory,
        plans: [],
      });

      const file = path.join(fx.appDir, "lib/orders.ts");
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, "utf8")
          .replace("export function checkOrder(order) {", "export function checkOrder(order) {\n  // inserted"),
      );
      const messages = path.join(fx.appDir, "messages/en.json");
      fs.writeFileSync(messages, JSON.stringify({ orders: { approve: "Validate", new: "New order" } }));

      const report = await compareWithReference({
        root: fx.root,
        config,
        toc,
        reference,
        since: null,
        git: null,
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
      });
      const applied = applyReport({ root: fx.root, config, toc, report, withLabels: true });
      assert.ok(applied.changed.includes("content/use/orders.md"));
      assert.equal(applied.rewritten.proofs, 1);
      assert.equal(applied.rewritten.labels, 1);
      const text = fs.readFileSync(path.join(fx.root, "content/use/orders.md"), "utf8");
      assert.match(text, /lib\/orders\.ts:43/);
      assert.match(text, /\*\*Validate\*\*/);
      assert.doesNotMatch(text, /\*\*Approve\*\*/);

      const report2 = await compareWithReference({
        root: fx.root,
        config,
        toc,
        reference,
        since: null,
        git: null,
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
      });
      assert.equal(report2.proofs.moved.length, 0, "the report, recomputed after writing, shows no more moved proof");
    } finally {
      fx.release();
    }
  });

  test("without --labels, a label change is listed but never applied", async () => {
    const fx = syncFixtureCopy();
    try {
      const config = await syncConfig(fx.root);
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const { reference } = await markPages({
        root: fx.root,
        config,
        toc,
        all: true,
        date: "2026-10-02",
        commit: "c0ffee",
        version: "1.0.0",
        inventory,
        plans: [],
      });
      fs.writeFileSync(
        path.join(fx.appDir, "messages/en.json"),
        JSON.stringify({ orders: { approve: "Validate", new: "New order" } }),
      );
      const report = await compareWithReference({
        root: fx.root,
        config,
        toc,
        reference,
        since: null,
        git: null,
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
      });
      const applied = applyReport({ root: fx.root, config, toc, report, withLabels: false });
      assert.deepEqual(applied.changed, []);
      assert.equal(applied.rewritten.labels, 0);
    } finally {
      fx.release();
    }
  });
});

describe("CLI `sync`", () => {
  test("no sync.json → message, exit code 0 (1 with --check)", async () => {
    const fx = syncFixtureCopy();
    try {
      const r = await cli(["sync", "--project", fx.root]);
      assert.equal(r.code, 0);
      assert.match(r.out, /no sync\.json yet/);
      const r2 = await cli(["sync", "--check", "--project", fx.root]);
      assert.equal(r2.code, 1);
    } finally {
      fx.release();
    }
  });

  test("--mark --all --date, then a report shows unchanged; --json shape", async () => {
    const fx = syncFixtureCopy();
    try {
      const mark = await cli(["sync", "--all", "--date", "2026-10-02", "--project", fx.root], {
        commit: () => "c0ffee",
      });
      assert.equal(mark.code, 0, mark.err);
      assert.match(mark.out, /3 pages marked as checked/);
      const raw = JSON.parse(fs.readFileSync(path.join(fx.root, "sync.json"), "utf8"));
      assert.equal(raw.app.date, "2026-10-02");

      const report = await cli(["sync", "--json", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(report.code, 0);
      const j = JSON.parse(report.out);
      assert.deepEqual(j.unchanged.sort(), ["take-over/orders-api", "use/orders", "use/orders/detail"]);
      assert.equal(j.review.length, 0);

      const check = await cli(["sync", "--check", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(check.code, 0);
    } finally {
      fx.release();
    }
  });

  test("--mark is a switch: --mark --all, --mark <page…> as positionals; --mark alone → sync.markNothing, exit code 2", async () => {
    const fx = syncFixtureCopy();
    try {
      const all = await cli(["sync", "--mark", "--all", "--date", "2026-10-02", "--json", "--project", fx.root], {
        commit: () => "c0ffee",
      });
      assert.equal(all.code, 0, all.err);
      assert.equal(JSON.parse(all.out).marked.length, 3);
      fs.rmSync(path.join(fx.root, "sync.json"));
      const two = await cli(["sync", "--mark", "use/orders", "use/orders/detail", "--json", "--project", fx.root], {
        commit: () => "c0ffee",
      });
      assert.equal(two.code, 0, two.err);
      assert.deepEqual(JSON.parse(two.out).marked, ["use/orders", "use/orders/detail"]);
      assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(fx.root, "sync.json"), "utf8")).pages).sort(), [
        "use/orders",
        "use/orders/detail",
      ]);
      const none = await cli(["sync", "--mark", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(none.code, 2);
      assert.match(none.err, /--mark/);
    } finally {
      fx.release();
    }
  });

  test("--sources with more than one page (or --all) → sync.sourcesOnePage, exit code 2", async () => {
    const fx = syncFixtureCopy();
    try {
      const r = await cli(["sync", "--all", "--sources", "x.txt", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(r.code, 2);
      assert.match(r.err, /--sources/);
    } finally {
      fx.release();
    }
  });

  test("--mark and --since together → usage error", async () => {
    const fx = syncFixtureCopy();
    try {
      const r = await cli(["sync", "--mark", "use/orders", "--since", "HEAD", "--project", fx.root]);
      assert.equal(r.code, 2);
    } finally {
      fx.release();
    }
  });

  test("--since with a fake exec: review + an informational line, new/removed always empty", async () => {
    const fx = syncFixtureCopy();
    try {
      const exec = fakeExec({
        rev: "beforecommit",
        showFiles: {
          "beforecommit:app/layout.tsx": "export default function L({children}) { return <html>{children}</html>; }\n",
        },
      });
      const r = await cli(["sync", "--since", "beforecommit", "--project", fx.root], { exec, commit: () => "c0ffee" });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /never reports new or removed/);
      const j = await cli(["sync", "--since", "beforecommit", "--json", "--project", fx.root], {
        exec,
        commit: () => "c0ffee",
      });
      const data = JSON.parse(j.out);
      assert.deepEqual(data.new, []);
      assert.deepEqual(data.removed, []);
      assert.equal(data.since, "beforecommit");
    } finally {
      fx.release();
    }
  });

  test("--apply --labels via the CLI: rewrites the files, prints them, then a fresh report", async () => {
    const fx = syncFixtureCopy();
    try {
      await cli(["sync", "--all", "--date", "2026-10-02", "--project", fx.root], { commit: () => "c0ffee" });
      fs.writeFileSync(
        path.join(fx.appDir, "messages/en.json"),
        JSON.stringify({ orders: { approve: "Validate", new: "New order" } }),
      );
      const r = await cli(["sync", "--apply", "--labels", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /content\/use\/orders\.md/);
      assert.match(fs.readFileSync(path.join(fx.root, "content/use/orders.md"), "utf8"), /Validate/);
    } finally {
      fx.release();
    }
  });

  test("--apply --auto-intact: a probably intact page is marked without an agent; without --apply → exit code 2", async () => {
    const fx = syncFixtureCopy();
    try {
      await cli(["sync", "--all", "--date", "2026-10-02", "--project", fx.root], { commit: () => "c0ffee" });
      fs.writeFileSync(
        path.join(fx.appDir, "app/layout.tsx"),
        'export default function RootLayout({ children }) {\n  return <html><body className="updated">{children}</body></html>;\n}\n',
      );
      const exec = fakeExec({ diffs: { c0ffee: '@@ -1 +1 @@\n-old\n+<html><body className="updated">\n' } });
      const before = JSON.parse(
        (await cli(["sync", "--json", "--project", fx.root], { exec, commit: () => "c0ffee" })).out,
      );
      assert.ok(
        before.review.some((r) => r.page === "use/orders" && r.priority === "probablyIntact"),
        JSON.stringify(before.review),
      );
      assert.equal(
        (await cli(["sync", "--auto-intact", "--project", fx.root], { exec, commit: () => "c0ffee" })).code,
        2,
      );
      const r = await cli(["sync", "--apply", "--auto-intact", "--project", fx.root], { exec, commit: () => "c0ffee" });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /2 pages probably intact marked without an agent: .*use\/orders/);
      const after = JSON.parse(
        (await cli(["sync", "--json", "--project", fx.root], { exec, commit: () => "c0ffee" })).out,
      );
      assert.ok(!after.review.some((x) => x.page === "use/orders"), JSON.stringify(after.review));
      assert.ok(after.unchanged.includes("use/orders"));
    } finally {
      fx.release();
    }
  });

  test("sync.noApp when app.dir is missing or does not exist", async () => {
    const dir = tempDir("doc-kit-sync-noapp-");
    try {
      fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'export default { product: { name: "Acme Orders" } };\n');
      fs.mkdirSync(path.join(dir, "content"));
      fs.writeFileSync(path.join(dir, "content/toc.json"), JSON.stringify({ title: "X", sections: [] }));
      const r = await cli(["sync", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /no application to read/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("engine/sync/estimate.mjs", () => {
  test("totals, cost null without prices, cost computed with llm.prices.sonnet", () => {
    const templates = loadPageTemplates();
    const contexts = [{ page: "use/orders", tokens: 1000, template: "screen" }];
    const noPrices = estimateUpdate({ contexts, templates });
    assert.equal(noPrices.agents[0].cost, null);
    assert.equal(noPrices.total.cost, null);
    assert.equal(noPrices.agents[0].input, 1000 + 1800);
    assert.equal(noPrices.agents[0].output, Math.round(0.3 * 1.4 * 2500));

    const priced = estimateUpdate({
      contexts,
      templates,
      prices: { sonnet: { input: 3, output: 15 } },
      currency: "EUR",
    });
    assert.ok(priced.agents[0].cost > 0);
    assert.equal(priced.total.cost, priced.agents[0].cost);
    assert.equal(priced.currency, "EUR");
  });
});

describe("engine/sync/api-links.mjs (the server code behind a screen)", () => {
  test("apiPathsIn: quoted and template literals starting with /, two segments at least, query dropped, ${…} kept as a parameter", async () => {
    const { apiPathsIn } = await import("../../engine/sync/api-links.mjs");
    const src =
      'api.get("/admin/groups"); api.put(`/admin/groups/${id}/members`, b); api.get(`/admin/groups/search?q=${q}`); go("/login"); x = "/";';
    assert.deepEqual(apiPathsIn(src), ["/admin/groups", "/admin/groups/:param/members", "/admin/groups/search"]);
    // A nested template glued to a segment ends the path there; one that forms a whole segment is a parameter.
    assert.deepEqual(apiPathsIn('api.get(`/chat/feedback/list${f === "all" ? "" : `?vote=${f}`}`)'), [
      "/chat/feedback/list",
    ]);
    assert.deepEqual(apiPathsIn("fetch(`/orders/${o.id}/lines/${n}`)"), ["/orders/:param/lines/:param"]);
  });

  test("pathMatchesRoute: the written segments are the route's last ones (a client prefix such as /api is allowed); parameters match any segment", async () => {
    const { pathMatchesRoute } = await import("../../engine/sync/api-links.mjs");
    assert.ok(pathMatchesRoute("/admin/groups", "/api/admin/groups"));
    assert.ok(pathMatchesRoute("/admin/groups/${id}/members", "/api/admin/groups/{group_id}/members"));
    assert.ok(pathMatchesRoute("/orders/${id}", "/orders/[id]"));
    assert.ok(!pathMatchesRoute("/admin/groups", "/api/admin/groups/{group_id}"), "a different length of tail");
    assert.ok(!pathMatchesRoute("/admin/users", "/api/admin/groups"));
    assert.ok(!pathMatchesRoute("/a/b/c/d", "/b/c/d"), "longer than the route");
  });

  test("apiRoutesCalledBy: the facts/api.json items named by the page's own files, each once", async () => {
    const { apiRoutesCalledBy } = await import("../../engine/sync/api-links.mjs");
    const items = [
      { method: "GET", route: "/api/orders", file: "api/routers/orders.py", line: 10 },
      { method: "POST", route: "/api/orders/{order_id}/approve", file: "api/routers/orders.py", line: 40 },
      { method: "GET", route: "/api/users", file: "api/routers/users.py", line: 5 },
    ];
    const texts = ['fetch("/api/orders")', "post(`/orders/${o.id}/approve`)"];
    assert.deepEqual(
      apiRoutesCalledBy(texts, items).map((i) => `${i.method} ${i.route}`),
      ["GET /api/orders", "POST /api/orders/{order_id}/approve"],
    );
    assert.deepEqual(apiRoutesCalledBy(texts, undefined), []);
  });
});

describe("engine/sync/report.mjs: a file reached only through the page's proofs", () => {
  test("touchedLines: the current file's lines of each hunk (context included); null without a diff", async () => {
    const { touchedLines } = await import("../../engine/sync/report.mjs");
    const patch = "diff --git a/x b/x\n@@ -7,7 +7,7 @@ import x\n-a\n+b\n@@ -53,78 +53,146 @@ const y\n@@ -10 +12 @@\n";
    assert.deepEqual(touchedLines(patch), [
      [7, 13],
      [53, 198],
      [12, 12],
    ]);
    assert.deepEqual(touchedLines(""), []);
    assert.equal(touchedLines(null), null);
  });

  test("its cited lines intact: through its proofs only → probablyIntact; through its topic group too → shared", async () => {
    // ARCHITECTURE.md §6.10 (review): reached ONLY through proofs, the reason is kept (proofsIntact) and ignored by
    // the priority; reached another way too (imports, layouts, its topic group), the file is judged as the shared
    // file it otherwise is (the demo's secure/api-surface in the cycle of test/e2e/sync.test.mjs).
    const review = async (grouped) => {
      const fx = syncFixtureCopy();
      try {
        const tocFile = path.join(fx.root, "content", "toc.json");
        const raw = JSON.parse(fs.readFileSync(tocFile, "utf8"));
        if (grouped) raw.sections[1].groups[0].pages[0].counterpart = "use/orders";
        fs.writeFileSync(tocFile, JSON.stringify(raw, null, 2));
        const page = path.join(fx.root, "content", "take-over", "orders-api.md");
        fs.appendFileSync(page, "\nThe orders screen calls it [[verified app/orders/page.tsx:1]].\n");
        const config = await syncConfig(fx.root);
        const toc = readToc(fx.root, config);
        const inventory = await runCoverage({ root: fx.root, config });
        const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", inventory, plans: [] };
        const { reference } = await markPages({ root: fx.root, config, toc, all: true, ...at });
        // A line added at the end of the file: its cited line 1 is intact.
        fs.appendFileSync(path.join(fx.appDir, "app", "orders", "page.tsx"), "// one more line\n");
        const r = await compareWithReference({
          root: fx.root,
          config,
          toc,
          reference,
          since: null,
          git: createGit(() => null, fx.appDir),
          inventory,
          plans: [],
          appDir: fx.appDir,
          version: "1.0.0",
          commit: "c0ffee",
          factsDir: config.paths.facts,
        });
        const entry = r.review.find((x) => x.page === "take-over/orders-api");
        return { priority: entry?.priority, reason: entry?.reasons.find((x) => x.path === "app/orders/page.tsx") };
      } finally {
        fx.release();
      }
    };
    const alone = await review(false);
    assert.equal(alone.priority, "probablyIntact");
    assert.equal(alone.reason?.proofsIntact, true);
    const grouped = await review(true);
    assert.equal(grouped.priority, "shared", "reached through its topic group too");
    assert.equal(grouped.reason?.kind, "shared");
    assert.ok(!grouped.reason.proofsIntact);
  });
});

// SECURITY.md: `::facts{source}` names a facts file by a plain name (a-z, 0-9, -), as the build reads it
// (engine/build/fact-directives.mjs). A source written as a path (`../../outside`) is no dependency: never read nor
// hashed outside the project, nor read from an older sync.json that recorded one.
describe("engine/sync: a ::facts source that is no plain name is never read", () => {
  test("pageDependencies, markPages and the report never read doc:facts/../../outside.json", async () => {
    const fx = syncFixtureCopy();
    try {
      const config = await syncConfig(fx.root);
      const page = path.join(fx.root, config.paths.content, "take-over", "orders-api.md");
      fs.appendFileSync(page, '\n::facts{source="../../outside"}\n::facts{source="a/b"}\n');
      // facts/../../outside.json, from the project: the folder that holds the project and the application.
      const ref = `doc:${config.paths.facts}/../../outside.json`;
      fs.writeFileSync(path.join(fx.root, config.paths.facts, "..", "..", "outside.json"), '{ "items": [] }\n');
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const deps = await pageDependencies({
        root: fx.root,
        config,
        toc,
        pageId: "take-over/orders-api",
        inventory,
        tools: adapterTools(fx.root),
        factsDir: config.paths.facts,
      });
      assert.deepEqual(deps.factsSources, ["api"]);
      assert.deepEqual(
        deps.files.filter((f) => f.path.startsWith("doc:")).map((f) => f.path),
        [`doc:${config.paths.facts}/api.json`],
      );
      const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", inventory, plans: [] };
      const { reference } = await markPages({ root: fx.root, config, toc, all: true, ...at });
      assert.deepEqual(
        Object.keys(reference.pages["take-over/orders-api"].files).filter((p) => p.startsWith("doc:")),
        [`doc:${config.paths.facts}/api.json`],
      );
      // An older sync.json that recorded it, with another hash: never read (a "modified" would mean read), gone.
      reference.pages["take-over/orders-api"].files[ref] = "0".repeat(64);
      const r = await compareWithReference({
        root: fx.root,
        config,
        toc,
        reference,
        since: null,
        git: createGit(() => null, fx.appDir),
        inventory,
        plans: [],
        appDir: fx.appDir,
        version: "1.0.0",
        commit: "c0ffee",
        factsDir: config.paths.facts,
      });
      const reasons = r.review.find((x) => x.page === "take-over/orders-api")?.reasons ?? [];
      assert.deepEqual(
        reasons.filter((x) => x.path === ref).map((x) => x.change),
        ["deleted"],
      );
    } finally {
      fx.release();
    }
  });
});

// SECURITY.md, confinement: a proof is recorded (the hash of its lines and its first line's text, in sync.json) only
// from a file that really is in the application, links and junctions followed. One cited through a junction to a folder
// outside, or by `../`, is never read: not recorded, its reason given, no dependency of the page.
describe("engine/sync: a proof outside the application is never read", () => {
  test("markPages: a proof through a junction or ../ puts no outside text in sync.json; the proof beside is recorded", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const junction = path.join(fx.appDir, "j");
    try {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "util.js"), 'export const leaked = "of the operator";\n');
      fs.symlinkSync(outside, junction, "junction");
      const config = await syncConfig(fx.root);
      const page = path.join(fx.root, config.paths.content, "take-over", "orders-api.md");
      // j/missing.js:1 next to j/util.js:1: the same reason whether the file outside exists or not.
      fs.appendFileSync(page, "\nSee `j/util.js:1`, `j/missing.js:1`, `../outside/util.js:1` and `lib/orders.ts:1`.\n");
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", inventory, plans: [] };
      const { reference, warnings } = await markPages({
        root: fx.root,
        config,
        toc,
        pages: ["take-over/orders-api"],
        ...at,
      });
      assert.deepEqual(reference.proofs["lib/orders.ts:1"], {
        hash: hashText("export const threshold = 10000;"),
        text: "export const threshold = 10000;",
      });
      for (const ref of ["j/util.js:1", "j/missing.js:1", "../outside/util.js:1"]) {
        assert.equal(reference.proofs[ref], undefined, `${ref}: not recorded`);
        assert.ok(
          warnings.some(
            (w) => w.key === "sync.proofOutside" && w.vars.ref === ref && w.vars.page === "take-over/orders-api",
          ),
          `${ref}: its reason given`,
        );
      }
      assert.ok(
        !warnings.some((w) => w.key === "sync.proofUnresolved" && w.vars.ref.startsWith("j/")),
        "never missing",
      );
      assert.ok(!JSON.stringify(reference).includes("of the operator"), "no outside text in sync.json");
      const files = Object.keys(reference.pages["take-over/orders-api"].files);
      assert.ok(files.includes("lib/orders.ts") && !files.some((f) => /util\.js|^j\//.test(f)), files.join(", "));
    } finally {
      // The junction first, on its own: removing the folder must never walk into what it points to.
      try {
        fs.unlinkSync(junction);
      } catch {
        if (fs.existsSync(junction)) fs.rmdirSync(junction);
      }
      fx.release();
    }
  });

  // An older sync.json (0.4.1) recorded such a proof, and hashed its file as a dependency of the page: the report
  // reads neither again. The outside line moves after marking: read, it would come back as a moved proof.
  test("sync and --check: a proof an older sync.json recorded through a junction or ../ is never read; the proof beside is", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const junction = path.join(fx.appDir, "j");
    const id = "take-over/orders-api";
    const line = 'export const leaked = "of the operator";';
    try {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "util.js"), line + "\n");
      fs.symlinkSync(outside, junction, "junction");
      const config = await syncConfig(fx.root);
      const page = path.join(fx.root, config.paths.content, "take-over", "orders-api.md");
      // j/missing.js:1 next to j/util.js:1: never `fileDeleted` for the one whose file outside does not exist.
      fs.appendFileSync(page, "\nSee `j/util.js:1`, `j/missing.js:1`, `../outside/util.js:1` and `lib/orders.ts:1`.\n");
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", inventory, plans: [] };
      const { reference } = await markPages({ root: fx.root, config, toc, all: true, ...at });
      const refs = ["j/util.js:1", "j/missing.js:1", "../outside/util.js:1"];
      for (const ref of refs) reference.proofs[ref] = { hash: hashText(line), text: line };
      for (const f of ["j/util.js", "../outside/util.js"]) reference.pages[id].files[f] = hashText(line + "\n");
      writeSyncReference(fx.root, config, reference);
      // After marking: the outside line and the line of the proof beside both move one line down.
      fs.writeFileSync(path.join(outside, "util.js"), "// moved\n" + line + "\n");
      const orders = path.join(fx.appDir, "lib", "orders.ts");
      fs.writeFileSync(orders, "// moved\n" + fs.readFileSync(orders, "utf8"));

      const json = await cli(["sync", "--json", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(json.code, 0, json.err);
      const report = JSON.parse(json.out);
      assert.deepEqual(
        report.proofs.moved.filter((m) => m.page === id).map((m) => [m.ref, m.newRef]),
        [["lib/orders.ts:1", "lib/orders.ts:2"]],
        "the proof beside is compared",
      );
      assert.deepEqual(
        report.proofs.broken.filter((b) => b.page === id),
        [],
      );
      for (const ref of refs)
        assert.ok(
          report.warnings.some((w) => w.key === "sync.proofOutside" && w.vars.ref === ref && w.vars.page === id),
          `${ref}: its reason given`,
        );
      // Its file, recorded as a dependency, is never hashed again, nor counted deleted (dependencyFile): said so.
      const reasons = report.review.find((r) => r.page === id)?.reasons ?? [];
      assert.deepEqual(
        reasons.filter((r) => r.path.includes("util.js")),
        [],
      );
      assert.deepEqual(
        report.warnings
          .filter((w) => w.key === "sync.dependencyOutside" && w.vars.page === id)
          .map((w) => w.vars.path)
          .sort(),
        ["../outside/util.js", "j/util.js"],
      );
      const check = await cli(["sync", "--check", "--project", fx.root], { commit: () => "c0ffee" });
      assert.equal(check.code, 1, "a moved proof and a page to review");
      assert.match(check.out, /proof not recorded: \.\.\/outside\/util\.js:1 \(its file is outside the application/);
      const written = ["sync.md", "sync-report.json"].map((f) =>
        fs.readFileSync(path.join(fx.root, ".doc-kit", f), "utf8"),
      );
      assert.ok(!written.some((t) => t.includes("of the operator")), "no outside text in the report files");
    } finally {
      // The junction first, on its own: removing the folder must never walk into what it points to.
      try {
        fs.unlinkSync(junction);
      } catch {
        if (fs.existsSync(junction)) fs.rmdirSync(junction);
      }
      fx.release();
    }
  });

  // git reports the cited file renamed (`R100 old.js → j/util.js`) to a path through a junction out: the new file is
  // read only where it really is in the application (proofFile), never through the junction. Read, its line, one
  // line down, would come back as a proof moved to j/util.js:2.
  test("sync: a proof whose file git reports renamed through a junction out is never read there", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const junction = path.join(fx.appDir, "j");
    const id = "take-over/orders-api";
    const line = 'export const leaked = "of the operator";';
    try {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "util.js"), "// moved\n" + line + "\n");
      fs.symlinkSync(outside, junction, "junction");
      const config = await syncConfig(fx.root);
      fs.appendFileSync(path.join(fx.root, config.paths.content, "take-over", "orders-api.md"), "\nSee `old.js:1`.\n");
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", inventory, plans: [] };
      const reference = structuredClone((await markPages({ root: fx.root, config, toc, all: true, ...at })).reference);
      reference.proofs["old.js:1"] = { hash: hashText(line), text: line };
      const git = createGit(fakeExec({ changed: ["R100\told.js\tj/util.js"] }), fx.appDir);
      const { result, reads } = await readsIn(outside, () =>
        compareWithReference({
          root: fx.root,
          config,
          toc,
          reference,
          since: null,
          git,
          inventory,
          plans: [],
          appDir: fx.appDir,
          version: "1.0.0",
          commit: "c0ffee",
          factsDir: config.paths.facts,
        }),
      );
      assert.deepEqual(reads, [], "nothing outside the application is read");
      assert.deepEqual(
        result.proofs.moved.filter((m) => m.page === id),
        [],
      );
      assert.deepEqual(
        result.proofs.broken.filter((b) => b.page === id).map((b) => [b.ref, b.reason]),
        [["old.js:1", "fileDeleted"]],
      );
      assert.ok(!JSON.stringify(result).includes("j/util.js:2"), "never moved through the junction");
    } finally {
      unlinkJunction(junction);
      fx.release();
    }
  });

  // resolveProofFile's early "outside": a proof as written through a junction out is no file of the application, and
  // is never looked for by its end (a whole-segment suffix) among the files inside — present outside or missing there,
  // the same answer; nor does it become the proof's path, a dependency of the page.
  test("extractProofs with appDir: a proof through a junction out resolves to no file, never to a file inside that ends like it", () => {
    const dir = tempDir("doc-kit-proof-suffix-");
    const app = path.join(dir, "app");
    const outside = path.join(dir, "outside");
    const junction = path.join(app, "j");
    try {
      fs.mkdirSync(path.join(app, "sub", "j"), { recursive: true });
      fs.mkdirSync(path.join(app, "sub", "k"), { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "x.js"), "outside\n");
      for (const f of ["j/x.js", "j/y.js", "k/w.js"]) fs.writeFileSync(path.join(app, "sub", f), "inside\n");
      fs.symlinkSync(outside, junction, "junction");
      const proofs = extractProofs("See `j/x.js:1`, `j/y.js:1` and `k/w.js:1`.", { appDir: app });
      assert.deepEqual(
        proofs.map((p) => [p.ref, p.path]),
        [
          ["j/x.js:1", null],
          ["j/y.js:1", null],
          ["k/w.js:1", "sub/k/w.js"],
        ],
        "a short path is still found by its end inside; one through the junction out never is",
      );
    } finally {
      unlinkJunction(junction);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Runs `fn` with fs.readFileSync spied on (restored after, on every path): its result, and every file read whose real
 * path lies in `folder` — the proof that nothing outside the application is read.
 * @template T
 * @param {string} folder
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, reads: string[] }>}
 */
async function readsIn(folder, fn) {
  const base = fs.realpathSync.native(folder);
  const reads = [];
  const original = fs.readFileSync;
  const spy = mock.method(fs, "readFileSync", function (p, ...rest) {
    if (typeof p === "string" || p instanceof URL || Buffer.isBuffer(p)) {
      let real = null;
      try {
        real = fs.realpathSync.native(p);
      } catch {
        // missing: nothing read there
      }
      if (real && (real === base || real.startsWith(base + path.sep))) reads.push(path.relative(base, real));
    }
    return original.call(this, p, ...rest);
  });
  try {
    return { result: await fn(), reads };
  } finally {
    spy.mock.restore();
  }
}

/** Removes a junction (or a link) on its own: removing the folder must never walk into what it points to. */
function unlinkJunction(junction) {
  try {
    fs.unlinkSync(junction);
  } catch {
    if (fs.existsSync(junction)) fs.rmdirSync(junction);
  }
}

// SECURITY.md, confinement: a dependency file of a page (declared by --mark --sources or in sync.json, the `file` of a
// facts/api.json item, a route file) is read and hashed only where it really is in the application, links and
// junctions followed — at marking and in the report alike (dependencyFile). One outside is never read, hashed nor
// recorded; it is said so (sync.dependencyOutside), and never counts as deleted: `--check` agrees with the marking.
describe("engine/sync: a dependency file outside the application is never read", () => {
  const at = { date: "2026-10-02", commit: "c0ffee", version: "1.0.0", plans: [] };
  const report = async (fx, config, toc, inventory, reference, extra = {}) =>
    compareWithReference({
      root: fx.root,
      config,
      toc,
      reference,
      since: null,
      git: createGit(() => null, fx.appDir),
      inventory,
      plans: [],
      appDir: fx.appDir,
      version: "1.0.0",
      commit: "c0ffee",
      factsDir: config.paths.facts,
      ...extra,
    });
  const outsideWarnings = (warnings, page) =>
    warnings
      .filter((w) => w.key === "sync.dependencyOutside" && w.vars.page === page)
      .map((w) => w.vars.path)
      .sort();

  test("fileInside (engine/core/confine.mjs): a file of the folder, or outside as written or once links are followed", () => {
    const dir = tempDir("doc-kit-inside-");
    const app = path.join(dir, "app");
    // A junction out, one in, and two that lead nowhere: one to a folder outside that is missing, one inside.
    const junctions = ["j", "in", "gone-out", "gone-in"].map((n) => path.join(app, n));
    const alias = path.join(dir, "alias"); // beside the application, a junction back to it
    try {
      fs.mkdirSync(path.join(app, "lib"), { recursive: true });
      fs.mkdirSync(path.join(dir, "outside"));
      fs.writeFileSync(path.join(app, "lib", "a.ts"), "export const a = 1;\n");
      fs.writeFileSync(path.join(dir, "outside", "b.ts"), "export const b = 1;\n");
      fs.symlinkSync(path.join(dir, "outside"), junctions[0], "junction");
      fs.symlinkSync(path.join(app, "lib"), junctions[1], "junction");
      fs.symlinkSync(path.join(dir, "gone"), junctions[2], "junction");
      fs.symlinkSync(path.join(app, "lib", "gone"), junctions[3], "junction");
      fs.symlinkSync(app, alias, "junction");
      const real = fs.realpathSync.native(path.join(app, "lib", "a.ts"));
      // Minimal pairs: the same file, or the same name, one step apart.
      assert.equal(fileInside(app, "lib/a.ts"), real);
      assert.equal(fileInside(app, "lib/../lib/a.ts"), real, "a .. that stays inside");
      assert.equal(fileInside(app, "in/a.ts"), real, "a junction to a folder inside");
      assert.equal(fileInside(app, "j/b.ts"), "outside", "a junction to a folder outside");
      assert.equal(fileInside(app, "../outside/b.ts"), "outside", "climbs out, the file exists");
      assert.equal(fileInside(app, "../outside/missing.ts"), "outside", "climbs out, even missing");
      assert.equal(fileInside(app, "../alias/lib/a.ts"), "outside", "climbs out as written, even back in by a link");
      assert.equal(fileInside(app, "lib/missing.ts"), null, "missing inside");
      assert.equal(fileInside(app, "lib"), null, "a folder");
      assert.equal(fileInside(app, "j"), "outside", "a folder outside");
      // Whether a file outside exists is never told (SECURITY.md): missing through the junction out is outside too.
      assert.equal(fileInside(app, "j/missing.ts"), "outside", "a junction to a folder outside, the file missing");
      assert.equal(fileInside(app, "j/deeper/missing.ts"), "outside", "missing two levels down");
      assert.equal(fileInside(app, "in/missing.ts"), null, "a junction to a folder inside, the file missing");
      // A junction that leads nowhere: judged by where its target, as written, lies.
      assert.equal(fileInside(app, "gone-out/x.ts"), "outside", "under a broken junction out");
      assert.equal(fileInside(app, "gone-out"), "outside", "a broken junction out");
      assert.equal(fileInside(app, "gone-in/x.ts"), null, "under a broken junction inside");
      assert.equal(fileInside(app, "gone-in"), null, "a broken junction inside");
    } finally {
      for (const j of [...junctions, alias]) unlinkJunction(j);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // A file link needs a privilege on Windows (developer mode), and a sibling folder that differs from the application's
  // by its case only needs a case-sensitive folder (WSL's, or one fsutil marks so): a fake file system checks both on
  // every system — never a silent skip.
  test("fileInside on a fake file system: a broken file link judged by its target, a loop never followed, another case another folder", () => {
    const srv = path.resolve("/srv");
    const app = path.join(srv, "app");
    const at = (...parts) => path.join(app, ...parts);
    const upper = path.join(srv, "APP"); // beside app, in a case-sensitive folder: another folder
    /** What realpathSync.native gives (links resolved, the case on disk); a path it does not know does not exist. */
    const real = {
      [srv]: srv,
      [app]: app,
      [at("lib")]: at("lib"),
      [at("a.txt")]: at("a.txt"),
      [upper]: upper,
      [path.join(upper, "secret.txt")]: path.join(upper, "secret.txt"),
      [at("up")]: upper, // a junction to APP
      [at("up", "secret.txt")]: path.join(upper, "secret.txt"),
      [path.join(srv, "x")]: path.join(srv, "x"),
      [path.join(srv, "x", "y")]: path.join(srv, "x", "y"),
      [at("out")]: path.join(srv, "x", "y"), // a junction to a folder outside
    };
    /** The links, their targets as written; those that lead nowhere are not in `real`. */
    const links = {
      [at("up")]: upper,
      [at("out")]: path.join(srv, "x", "y"),
      [at("broken-out.txt")]: "../outside/missing.txt",
      [at("broken-in.txt")]: "lib/missing.txt",
      [at("out", "broken.txt")]: "../z/missing.txt", // from /srv/x/y, not from app/out: /srv/x/z
      [at("nowhere.txt")]: path.resolve("/nowhere/missing.txt"), // no part of it exists, not even the root
      [at("loop-a")]: at("loop-b"),
      [at("loop-b")]: at("loop-a"),
    };
    const missing = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
    const io = {
      realpathSync: {
        native: (p) => {
          if (Object.hasOwn(real, p)) return real[p];
          throw missing(p);
        },
      },
      statSync: (p) => ({ isFile: () => p.endsWith(".txt") }),
      lstatSync: (p) => {
        if (!Object.hasOwn(real, p) && !Object.hasOwn(links, p)) throw missing(p);
        return { isSymbolicLink: () => Object.hasOwn(links, p) };
      },
      readlinkSync: (p) => {
        if (Object.hasOwn(links, p)) return links[p];
        throw Object.assign(new Error(`EINVAL: ${p}`), { code: "EINVAL" });
      },
    };
    assert.equal(fileInside(app, "a.txt", io), at("a.txt"));
    // Minimal pairs: a broken link out, and one inside.
    assert.equal(fileInside(app, "broken-out.txt", io), "outside", "a broken file link out");
    assert.equal(fileInside(app, "broken-in.txt", io), null, "a broken file link inside");
    // A broken link's target is read from the folder the link really is in: as written from app/out, it would be
    // app/z/missing.txt, inside.
    assert.equal(fileInside(app, "out/broken.txt", io), "outside", "a broken link in a folder outside");
    assert.equal(fileInside(app, "nowhere.txt", io), "outside", "a broken link to where nothing exists");
    assert.equal(fileInside(app, "loop-a", io), "outside", "a loop of links: never followed");
    // Another case is another folder (compared exactly, as realpathSync.native gives the case on disk).
    assert.equal(fileInside(app, "../APP/secret.txt", io), "outside", "a sibling in another case, as written");
    assert.equal(fileInside(app, "../APP/missing.txt", io), "outside", "the same, missing");
    assert.equal(fileInside(app, "up/secret.txt", io), "outside", "through a junction to it");
    assert.equal(fileInside(app, "up/missing.txt", io), "outside", "the same, missing");
  });

  test("sync --mark <page> --sources ../shared/money.ts, then --check: exit code 0 and the warning; never read nor recorded", async () => {
    const fx = syncFixtureCopy();
    const shared = path.join(path.dirname(fx.appDir), "shared");
    const id = "take-over/orders-api";
    try {
      fs.mkdirSync(shared);
      fs.writeFileSync(path.join(shared, "money.ts"), 'export const leaked = "of the operator";\n');
      const io = { commit: () => "c0ffee" };
      const run = (...args) => cli([...args, "--project", fx.root], io);
      const { result, reads } = await readsIn(shared, async () => ({
        all: await run("sync", "--mark", "--all", "--date", "2026-10-02"),
        mark: await run("sync", "--mark", id, "--sources", "../shared/money.ts", "--date", "2026-10-02"),
        check: await run("sync", "--check"),
        json: await run("sync", "--json"),
      }));
      assert.deepEqual(reads, [], "nothing outside the application is read");
      assert.equal(result.mark.code, 0, result.mark.err);
      assert.match(result.mark.out, /\[take-over\/orders-api\] dependency not followed: \.\.\/shared\/money\.ts \(/);
      const config = await syncConfig(fx.root);
      const { reference } = readSyncReference(fx.root, config);
      assert.ok(!Object.keys(reference.pages[id].files).some((f) => f.includes("money")), "no hash recorded");
      assert.ok(!JSON.stringify(reference).includes("of the operator"), "no outside text in sync.json");
      assert.equal(result.check.code, 0, result.check.out);
      assert.match(result.check.out, /dependency not followed: \.\.\/shared\/money\.ts \(/);
      assert.doesNotMatch(result.check.out, /deleted/);
      const r = JSON.parse(result.json.out);
      assert.deepEqual(r.review, [], "never a deleted file");
      assert.ok(r.unchanged.includes(id), r.unchanged.join(", "));
      assert.deepEqual(outsideWarnings(r.warnings, id), ["../shared/money.ts"]);
      // In French too.
      const fr = createI18n({ language: "fr" }).t("cli.sync.dependencyOutside", {
        page: id,
        path: "../shared/money.ts",
      });
      assert.match(fr, /^\[take-over\/orders-api\] dépendance non suivie : \.\.\/shared\/money\.ts \(/);
    } finally {
      fx.release();
    }
  });

  test("a declared entry outside (../ or a junction), an older sync.json's hash too: never read, never deleted", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const junction = path.join(fx.appDir, "j");
    const id = "take-over/orders-api";
    // A minimal pair through the junction: j/util.js exists outside, j/missing.js does not — the same answer for both,
    // so the report never tells whether a file of the operator exists (`deleted` for one, the warning for the other).
    const declared = ["../outside/util.js", "j/missing.js", "j/util.js"];
    try {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "util.js"), 'export const leaked = "of the operator";\n');
      fs.symlinkSync(outside, junction, "junction");
      const config = await syncConfig(fx.root);
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const older = { app: { commit: "c0ffee", version: "1.0.0", date: "2026-10-01" }, pages: { [id]: { declared } } };
      const { result, reads } = await readsIn(outside, async () => {
        const marked = await markPages({ root: fx.root, config, toc, pages: [id], inventory, reference: older, ...at });
        // An older sync.json (0.4.1) hashed them: the report never reads them again, nor calls them deleted.
        const ref = structuredClone(marked.reference);
        for (const f of declared) ref.pages[id].files[f] = hashText("export const leaked = 1;\n");
        return { marked, after: await report(fx, config, toc, inventory, ref) };
      });
      assert.deepEqual(reads, [], "nothing outside the application is read");
      const { reference, warnings } = result.marked;
      assert.deepEqual(outsideWarnings(warnings, id), declared);
      assert.ok(!Object.keys(reference.pages[id].files).some((f) => f.includes("util.js")), "no hash recorded");
      assert.ok(Object.keys(reference.pages[id].files).includes("backend/api/orders.py"), "the files beside are");
      assert.ok(!JSON.stringify(reference).includes("of the operator"), "no outside text in sync.json");
      assert.deepEqual(result.after.review, [], "never a deleted file");
      assert.ok(result.after.unchanged.includes(id));
      assert.deepEqual(outsideWarnings(result.after.warnings, id), declared);
    } finally {
      unlinkJunction(junction);
      fx.release();
    }
  });

  test("the `file` of a facts/api.json item outside: never read at marking, nor shown by git with --since", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const id = "use/orders/detail";
    try {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "util.js"), 'export const leaked = "of the operator";\n');
      const config = await syncConfig(fx.root);
      const apiFile = path.join(fx.root, config.paths.facts, "api.json");
      const api = JSON.parse(fs.readFileSync(apiFile, "utf8"));
      for (const item of api.items) item.file = "../outside/util.js";
      fs.writeFileSync(apiFile, JSON.stringify(api));
      // The detail screen calls the API: its handler, outside, becomes a dependency of the page.
      fs.appendFileSync(path.join(fx.appDir, "app", "orders", "[id]", "page.tsx"), "fetch(`/api/orders/1`);\n");
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const shown = [];
      const exec = (bin, args) => {
        if (args[0] === "show") shown.push(args.at(-1));
        return fakeExec({ showFiles: { "c0ffee:../outside/util.js": "export const leaked = 1;\n" } })(bin, args);
      };
      const { result, reads } = await readsIn(outside, async () => {
        const marked = await markPages({ root: fx.root, config, toc, all: true, inventory, reference: null, ...at });
        return {
          marked,
          now: await report(fx, config, toc, inventory, marked.reference),
          since: await report(fx, config, toc, inventory, marked.reference, {
            since: "c0ffee",
            git: createGit(exec, fx.appDir),
          }),
        };
      });
      assert.deepEqual(reads, [], "nothing outside the application is read");
      const { reference, warnings } = result.marked;
      assert.deepEqual(outsideWarnings(warnings, id), ["../outside/util.js"]);
      assert.ok(!Object.keys(reference.pages[id].files).some((f) => f.includes("util.js")), "no hash recorded");
      assert.ok(!result.now.review.some((r) => r.page === id), JSON.stringify(result.now.review));
      assert.ok(result.now.unchanged.includes(id));
      assert.deepEqual(outsideWarnings(result.now.warnings, id), ["../outside/util.js"]);
      assert.ok(!shown.some((s) => s.includes("outside")), `never shown by git: ${shown.join(", ")}`);
      const reasons = result.since.review.find((r) => r.page === id)?.reasons ?? [];
      assert.ok(!reasons.some((r) => r.path.includes("util.js")), JSON.stringify(reasons));
      assert.deepEqual(outsideWarnings(result.since.warnings, id), ["../outside/util.js"]);
    } finally {
      fx.release();
    }
  });

  // Through a junction out, the file present or missing there: the same answer, so neither the marking nor `--since`
  // (a `git show` of the missing file) tells whether a file of the operator exists.
  test("the `file` of a facts/api.json item through a junction, present or missing: never shown by git with --since", async () => {
    const id = "use/orders/detail";
    for (const file of ["j/util.js", "j/missing.js"]) {
      const fx = syncFixtureCopy();
      const outside = path.join(path.dirname(fx.appDir), "outside");
      const junction = path.join(fx.appDir, "j");
      try {
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(outside, "util.js"), 'export const leaked = "of the operator";\n');
        fs.symlinkSync(outside, junction, "junction");
        const config = await syncConfig(fx.root);
        const apiFile = path.join(fx.root, config.paths.facts, "api.json");
        const api = JSON.parse(fs.readFileSync(apiFile, "utf8"));
        for (const item of api.items) item.file = file;
        fs.writeFileSync(apiFile, JSON.stringify(api));
        fs.appendFileSync(path.join(fx.appDir, "app", "orders", "[id]", "page.tsx"), "fetch(`/api/orders/1`);\n");
        const toc = readToc(fx.root, config);
        const inventory = await runCoverage({ root: fx.root, config });
        const shown = [];
        const exec = (bin, args) => {
          if (args[0] === "show") shown.push(args.at(-1));
          return fakeExec({ showFiles: { [`c0ffee:${file}`]: "export const leaked = 1;\n" } })(bin, args);
        };
        const { result, reads } = await readsIn(outside, async () => {
          const marked = await markPages({ root: fx.root, config, toc, all: true, inventory, reference: null, ...at });
          const since = { since: "c0ffee", git: createGit(exec, fx.appDir) };
          return { marked, since: await report(fx, config, toc, inventory, marked.reference, since) };
        });
        assert.ok(!shown.some((s) => s.includes("j/")), `${file}: never shown by git: ${shown.join(", ")}`);
        assert.deepEqual(reads, [], `${file}: nothing outside the application is read`);
        assert.deepEqual(outsideWarnings(result.marked.warnings, id), [file], file);
        const reasons = result.since.review.find((r) => r.page === id)?.reasons ?? [];
        assert.ok(!reasons.some((r) => r.path.startsWith("j/")), JSON.stringify(reasons));
        assert.deepEqual(outsideWarnings(result.since.warnings, id), [file], file);
      } finally {
        unlinkJunction(junction);
        fx.release();
      }
    }
  });

  test("a routes folder that is a junction: its files never read (nor for the API paths they call), the pages unchanged", async () => {
    const fx = syncFixtureCopy();
    const outside = path.join(path.dirname(fx.appDir), "outside");
    const junction = path.join(fx.appDir, "app");
    try {
      fs.mkdirSync(outside);
      fs.renameSync(junction, path.join(outside, "app"));
      fs.appendFileSync(
        path.join(outside, "app", "orders", "page.tsx"),
        "\n// of the operator\nfetch(`/api/orders/1`);\n",
      );
      fs.symlinkSync(path.join(outside, "app"), junction, "junction");
      const config = await syncConfig(fx.root);
      const toc = readToc(fx.root, config);
      const inventory = await runCoverage({ root: fx.root, config });
      const { result, reads } = await readsIn(outside, async () => {
        const marked = await markPages({ root: fx.root, config, toc, all: true, inventory, reference: null, ...at });
        return { marked, after: await report(fx, config, toc, inventory, marked.reference) };
      });
      assert.deepEqual(reads, [], "nothing outside the application is read");
      const { reference, warnings } = result.marked;
      const expected = {
        "use/orders": ["app/layout.tsx", "app/orders/page.tsx"],
        "use/orders/detail": ["app/layout.tsx", "app/orders/[id]/page.tsx"],
      };
      for (const [id, files] of Object.entries(expected)) {
        assert.deepEqual(outsideWarnings(warnings, id), files, id);
        assert.ok(!Object.keys(reference.pages[id].files).some((f) => f.startsWith("app/")), `${id}: no hash recorded`);
        assert.ok(!result.after.review.some((r) => r.page === id), JSON.stringify(result.after.review));
        assert.ok(result.after.unchanged.includes(id), `${id} unchanged`);
        assert.deepEqual(outsideWarnings(result.after.warnings, id), files, id);
      }
      assert.ok(!JSON.stringify(reference).includes("of the operator"), "no outside text in sync.json");
    } finally {
      unlinkJunction(junction);
      fx.release();
    }
  });
});

describe("a verified claim badge is a proof (sync and audit)", () => {
  test("extractProofs: [[verified file:line]] and [[verifie …]] are proofs, in order; one shown in a code span is not", async () => {
    const md =
      "Approved by a manager [[verified lib/orders.ts:42]]; see `api/x.py:7`. Syntax: `[[verified a.ts:4]]`. Seuil [[verifie lib/config.ts:3-5 seuil par défaut]].";
    const proofs = extractProofs(md);
    assert.deepEqual(
      proofs.map((p) => p.ref),
      ["lib/orders.ts:42", "api/x.py:7", "lib/config.ts:3-5"],
    );
    assert.equal(proofs[0].span, "[[verified lib/orders.ts:42]]");
    assert.equal(
      rewriteProof(md, proofs[0], { newFile: "lib/orders.ts", newFrom: 57, newTo: 57 }).includes(
        "[[verified lib/orders.ts:57]]",
      ),
      true,
    );
    assert.ok(PROOF.test("[[verified lib/orders.ts:42]]") && PROOF.test("[[verifie seuil lib/c.ts:3]]"));
    assert.ok(!PROOF.test("[[verified the manager approves]]"), "a badge without a source is a claim, not a proof");
  });
});
