// `doc-kit changes`: what changed in the application between the facts committed at a git reference and the
// facts on disk (engine/facts/changes.mjs, cli/commands/changes.mjs). No real git: the exec seam.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { diffFacts, diffSource, changesMarkdown, recordChanges, readChanges, renderChanges } from "../../engine/facts/changes.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

const before = {
  api: { items: [{ method: "GET", route: "/orders", auth: "user" }, { method: "POST", route: "/orders/approve", auth: "role" }] },
  db: { items: [{ table: "orders", columns: ["id", "total"], references: [] }] },
  env: { items: [{ name: "DATABASE_URL" }, { name: "OLD_FLAG" }] },
  dependencies: { items: [{ name: "next", version: "15.0.0", manifest: "package.json" }] },
  tests: { items: [], summary: { tests: 40 } },
  modules: { items: [], summary: { cycles: [] } },
};
const after = {
  api: { items: [{ method: "GET", route: "/orders", auth: "none", file: "app/orders/route.ts" }, { method: "GET", route: "/invoices", auth: "user", file: "app/invoices/route.ts" }] },
  db: { items: [{ table: "orders", columns: ["id", "total", "status"], references: [] }, { table: "orders", columns: ["id"], references: ["customers"], file: "x.sql" }, { table: "invoices", columns: ["id"] }] },
  env: { items: [{ name: "DATABASE_URL" }, { name: "STRIPE_KEY" }] },
  dependencies: { items: [{ name: "next", version: "15.1.0", manifest: "package.json" }, { name: "stripe", version: "18.0.0", manifest: "package.json" }] },
  tests: { items: [], summary: { tests: 38 } },
  modules: { items: [], summary: { cycles: [["src/a.ts", "src/b.ts"]] } },
};

describe("engine/facts/changes.mjs", () => {
  test("added, removed and changed per source; a table defined in two places is one key", () => {
    const { sources, total } = diffFacts(before, after);
    assert.deepEqual(sources.api, { added: ["GET /invoices"], removed: ["POST /orders/approve"], changed: [{ key: "GET /orders", field: "auth", before: "user", after: "none" }] });
    assert.deepEqual(sources.db.added, ["invoices"]);
    assert.deepEqual(sources.db.changed.map((c) => c.field), ["columns", "references"]);
    assert.deepEqual(sources.env, { added: ["STRIPE_KEY"], removed: ["OLD_FLAG"], changed: [] });
    assert.deepEqual(sources.dependencies.added, ["stripe (package.json)"]);
    assert.deepEqual(sources.dependencies.changed, [{ key: "next (package.json)", field: "version", before: "15.0.0", after: "15.1.0" }]);
    assert.deepEqual(sources.tests.changed, [{ key: "tests", field: "count", before: 40, after: 38 }]);
    assert.deepEqual(sources.modules.added, ["src/a.ts ⇄ src/b.ts"]);
    assert.equal(total, 3 + 3 + 2 + 2 + 1 + 1);
    assert.equal(diffSource("env", null, null), null);
    assert.deepEqual(diffFacts(after, after), { sources: {}, total: 0 });
  });

  test("changesMarkdown: a heading per source, ＋ − ～ lines; nothing changed → one sentence", () => {
    const t = (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k);
    const md = changesMarkdown(diffFacts(before, after), { t, since: "v1", until: "1.1.0" });
    assert.match(md, /^## cli\.changes\.title \{"since":"v1","until":"1\.1\.0"\}\n/);
    assert.match(md, /### cli\.changes\.source\.api\n\n- ＋ `GET \/invoices`\n- － `POST \/orders\/approve`\n- ～ `GET \/orders` · auth: user → none\n/);
    assert.match(changesMarkdown({ sources: {}, total: 0 }, { t, since: "a", until: "b" }), /cli\.changes\.none/);
  });
});

describe("doc-kit changes", () => {
  test("facts at the reference (git show) against the facts on disk: Markdown printed and written; a bad reference → 2", async () => {
    const dir = demoCopy();
    try {
      for (const [source, data] of Object.entries(after)) fs.writeFileSync(path.join(dir, "facts", `${source}.json`), JSON.stringify(data));
      const shown = [];
      const exec = (bin, args) => {
        if (bin !== "git") return null;
        if (args[0] === "rev-parse") return { status: 0, stdout: "true\n" };
        if (args[0] === "show") {
          const spec = args.at(-1);
          shown.push(spec);
          const source = /facts\/(\w+)\.json$/.exec(spec)?.[1];
          return before[source] ? { status: 0, stdout: JSON.stringify(before[source]) } : { status: 128, stdout: "" };
        }
        return { status: 1, stdout: "" };
      };
      let out = "";
      const io = { stdout: { write: (s) => (out += s) }, stderr: { write: () => {} }, env: {}, exec };
      assert.equal(await runCli(["changes", "--project", dir, "--since", "v1.0.0"], io), 0);
      assert.ok(shown.includes("v1.0.0:./facts/api.json"), shown.join(" "));
      assert.match(out, /What changed in the application since v1\.0\.0 \(documented version 1\.4\.0\)/);
      assert.match(out, /### Routes\n\n- ＋ `GET \/invoices`/);
      assert.match(fs.readFileSync(path.join(dir, ".doc-kit", "changes.md"), "utf8"), /### Environment variables/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".doc-kit", "changes.json"), "utf8")).since, "v1.0.0");
      assert.equal(await runCli(["changes", "--project", dir, "--since", "--output=/tmp/x"], io), 2);
      assert.equal(await runCli(["changes", "--project", dir], { ...io, exec: () => null }), 3, "no git");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("changes --record and ::changes", () => {
  test("recordChanges / readChanges: one file per version, most recent first; renderChanges filters by version and source", () => {
    const root = tempDir("doc-kit-changes-");
    try {
      recordChanges(root, { since: "v1.0.0", until: "1.1.0", date: "2026-09-01T00:00:00Z", ...diffFacts(before, after) });
      recordChanges(root, { since: "v1.1.0", until: "1.10.0", date: "2026-10-01T00:00:00Z", sources: {}, total: 0 });
      fs.writeFileSync(path.join(root, "changes", "broken.json"), "{");
      const records = readChanges(root);
      assert.deepEqual(records.map((r) => r.until), ["1.10.0", "1.1.0"], "numeric order of versions");
      const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const html = renderChanges(records, { t, esc });
      assert.equal((html.match(/class="changes-version"/g) || []).length, 2);
      assert.match(html, /cli\.changes\.none/, "a version without change says so");
      const only = renderChanges(records, { t, esc, version: "1.1.0", sources: ["env"] });
      assert.match(only, /<code>STRIPE_KEY<\/code>/);
      assert.doesNotMatch(only, /GET \/invoices/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("CLI --record, then ::changes in a page", async () => {
    const dir = demoCopy();
    try {
      // Only sources whose shape the demo pages' own ::facts tables accept.
      for (const source of ["api", "env", "dependencies"]) fs.writeFileSync(path.join(dir, "facts", `${source}.json`), JSON.stringify(after[source]));
      const exec = (bin, args) => {
        if (bin !== "git") return null;
        if (args[0] === "rev-parse") return { status: 0, stdout: "true\n" };
        if (args[0] === "show") {
          const source = /facts\/(\w+)\.json$/.exec(args.at(-1))?.[1];
          return ["api", "env", "dependencies"].includes(source) ? { status: 0, stdout: JSON.stringify(before[source]) } : { status: 128, stdout: "" };
        }
        return { status: 1, stdout: "" };
      };
      let err = "";
      const io = { stdout: { write: () => {} }, stderr: { write: (s) => (err += s) }, env: {}, exec };
      const fail = (code) => assert.equal(code, 0, err);
      assert.equal(await runCli(["changes", "--project", dir, "--since", "v1.0.0", "--record"], io), 0);
      assert.match(err, /recorded in changes\/1\.4\.0\.json/);
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), '\n\n::changes{sources="api,env"}\n');
      const out = path.join(dir, "dist", "x.html");
      fail(await runCli(["build", "--project", dir, "--date", "2026-01-01", "--output", out], io));
      const html = fs.readFileSync(out, "utf8");
      assert.match(html, /changes-version/);
      assert.match(html, /STRIPE_KEY/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
