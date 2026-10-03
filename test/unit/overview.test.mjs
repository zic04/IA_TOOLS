// Developer overview facts: history (git), modules (import graph and cycles), table references in db, and the
// entity-relationship diagram drawn from them (::erd).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseNumstat, historyFacts, collectHistory } from "../../engine/facts/history.mjs";
import { cyclesOf, collectModules } from "../../engine/facts/modules.mjs";
import { collectDb } from "../../engine/facts/db.mjs";
import { renderErd, erdTables } from "../../engine/build/erd.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

const write = (root, files) => {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

describe("history", () => {
  const log = [
    "@@c3\tAda\t2026-09-30T10:00:00+02:00",
    "5\t1\tsrc/orders.ts",
    "-\t-\tlogo.png",
    "",
    "@@c2\tBob\t2026-09-01T10:00:00+02:00",
    "10\t0\tsrc/orders.ts",
    "3\t3\tsrc/old.ts",
    "@@c1\tAda\t2026-08-01T10:00:00+02:00",
    "100\t0\tsrc/orders.ts",
    "20\t0\tREADME.md",
  ].join("\n");

  test("parseNumstat: commits, authors, dates, files (a binary counts 0 lines)", () => {
    const c = parseNumstat(log);
    assert.deepEqual(c.map((x) => [x.hash, x.author, x.files.length]), [["c3", "Ada", 2], ["c2", "Bob", 2], ["c1", "Ada", 2]]);
    assert.deepEqual(c[0].files[1], { path: "logo.png", added: 0, deleted: 0 });
  });

  test("historyFacts: per file commits, churn, authors, owner and share, last date; bus factor; deleted files left out", () => {
    const { items, summary } = historyFacts(parseNumstat(log), { tracked: ["src/orders.ts", "logo.png", "README.md"] });
    assert.deepEqual(items[0], { file: "src/orders.ts", commits: 3, churn: 116, authors: 2, owner: "Ada", ownerShare: 67, last: "2026-09-30" });
    assert.ok(!items.some((i) => i.file === "src/old.ts"), "a file no longer tracked");
    assert.deepEqual(summary, { commits: 3, authors: 2, since: "2026-08-01", until: "2026-09-30", busFactor: 1, files: 3 });
  });

  test("collectHistory: through the exec seam (hardened git); no git → available false", () => {
    const calls = [];
    const exec = (bin, args) => {
      calls.push(args);
      if (args[0] === "log") return { status: 0, stdout: log };
      if (args[0] === "ls-files") return { status: 0, stdout: "src/orders.ts\nREADME.md\n" };
      return { status: 1, stdout: "" };
    };
    const r = collectHistory("/app", exec);
    assert.equal(r.summary.available, true);
    assert.deepEqual(r.items.map((i) => i.file), ["src/orders.ts", "README.md"]);
    assert.ok(calls[0].includes("--relative") && calls[0].includes("--no-renames"));
    assert.deepEqual(collectHistory("/app", () => null), { items: [], summary: { available: false } });
  });
});

describe("modules", () => {
  test("cyclesOf: strongly connected components of more than one file, largest first", () => {
    const g = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
      ["d", new Set(["e"])],
      ["e", new Set(["d"])],
      ["f", new Set(["a"])],
    ]);
    assert.deepEqual(cyclesOf(g), [["a", "b", "c"], ["d", "e"]]);
    assert.deepEqual(cyclesOf(new Map([["x", new Set()]])), []);
  });

  test("collectModules: fan-in, fan-out, cycles, orphans; packages ignored; JS and Python", () => {
    const app = tempDir("doc-kit-modules-");
    try {
      write(app, {
        "src/a.ts": 'import { b } from "./b";\nimport React from "react";\n',
        "src/b.ts": 'import { a } from "./a";\nexport const b = 1;\n',
        "src/page.tsx": 'import { b } from "./b";\n',
        "src/lonely.js": "export const x = 1;\n",
        "py/app.py": "from .models import Order\n",
        "py/models.py": "import os\n",
        "py/__init__.py": "",
      });
      const { items, summary } = collectModules(app);
      const b = items.find((i) => i.file === "src/b.ts");
      assert.deepEqual(b, { file: "src/b.ts", imports: 1, importedBy: 2, cycle: 1 });
      assert.deepEqual(items.find((i) => i.file === "py/app.py"), { file: "py/app.py", imports: 1, importedBy: 0, cycle: null });
      assert.deepEqual(summary.cycles, [["src/a.ts", "src/b.ts"]]);
      assert.ok(summary.orphans >= 1);
      assert.equal(items[0].file, "src/b.ts", "the most depended-on file first");
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("db references and ::erd", () => {
  test("Prisma relations, SQLAlchemy ForeignKey, SQL REFERENCES", () => {
    const app = tempDir("doc-kit-db-");
    try {
      write(app, {
        "prisma/schema.prisma": "model User {\n  id Int @id\n  orders Order[]\n}\n\nmodel Order {\n  id Int @id\n  user User @relation(fields: [userId], references: [id])\n  userId Int\n  @@map(\"orders\")\n}\n",
        "models.py": 'class Line(Base):\n    __tablename__ = "lines"\n    id = Column(Integer)\n    order_id = Column(ForeignKey("orders.id"))\n',
        "db/001.sql": "CREATE TABLE invoices (id int, order_id int REFERENCES orders(id), PRIMARY KEY (id));\n",
      });
      const items = collectDb(app);
      const ref = (t) => items.find((i) => i.table === t).references;
      assert.deepEqual(ref("orders"), ["User"]);
      assert.deepEqual(ref("User"), ["orders"]);
      assert.deepEqual(ref("lines"), ["orders"]);
      assert.deepEqual(ref("invoices"), ["orders"]);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("renderErd: one box per table (merged), its columns (capped), one arrow per reference; only some tables", () => {
    const items = [
      { table: "orders", columns: ["id", "total"], references: ["users"] },
      { table: "orders", columns: ["status"], references: [] },
      { table: "users", columns: Array.from({ length: 14 }, (_, i) => `c${i}`), references: [] },
      { table: "audit", columns: ["id"], references: ["ghost"] },
    ];
    assert.deepEqual(erdTables(items).map((t) => [t.table, t.columns.length, t.references]), [["orders", 3, ["users"]], ["users", 14, []], ["audit", 1, []]]);
    const svg = renderErd(items, { esc, title: "Data", more: (n) => `+${n} more` });
    assert.equal((svg.match(/class="erd-table"/g) || []).length, 3);
    assert.equal((svg.match(/class="erd-edge"/g) || []).length, 1);
    assert.match(svg, />\+4 more</);
    assert.match(svg, /aria-label="Data"/);
    assert.equal((renderErd(items, { esc, only: ["audit"] }).match(/class="erd-table"/g) || []).length, 1);
    assert.equal(renderErd([], { esc }), "");
  });

  test("in a page: drawn from facts/db.json; no table → a warning and a note", async () => {
    const dir = demoCopy();
    try {
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), '\n\n::erd{title="Orders data"}\n');
      const out = path.join(dir, "dist", "x.html");
      const empty = await runCli(["build", "--project", dir, "--date", "2026-01-01", "--output", out], { stdout: { write: () => {} }, stderr: { write: () => {} }, env: {} });
      assert.equal(empty, 0);
      const db = JSON.parse(fs.readFileSync(path.join(dir, "facts", "db.json"), "utf8"));
      db.items = [{ table: "orders", columns: ["id"], file: "x.sql", rls: false, policies: [], references: ["customers"] }, { table: "customers", columns: ["id"], file: "x.sql", rls: false, policies: [], references: [] }];
      fs.writeFileSync(path.join(dir, "facts", "db.json"), JSON.stringify(db));
      assert.equal(await runCli(["build", "--project", dir, "--date", "2026-01-01", "--output", out], { stdout: { write: () => {} }, stderr: { write: () => {} }, env: {} }), 0);
      const html = fs.readFileSync(out, "utf8");
      assert.match(html, /erd-figure/);
      assert.match(html, /Orders data · db/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
