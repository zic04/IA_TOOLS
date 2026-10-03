// Developer overview facts: history (git), modules (import graph and cycles), table references in db, and the
// entity-relationship diagram drawn from them (::erd), and the developer views (::modules, ::hotspots, ::health).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseNumstat, historyFacts, collectHistory } from "../../engine/facts/history.mjs";
import { cyclesOf, collectModules } from "../../engine/facts/modules.mjs";
import { collectDb } from "../../engine/facts/db.mjs";
import { renderErd, erdTables } from "../../engine/build/erd.mjs";
import { systemModel, renderC4 } from "../../engine/build/c4.mjs";
import {
  limitOf,
  renderModules,
  hotspots,
  renderHotspots,
  healthRisks,
  renderHealth,
} from "../../engine/build/developer.mjs";
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
    assert.deepEqual(
      c.map((x) => [x.hash, x.author, x.files.length]),
      [
        ["c3", "Ada", 2],
        ["c2", "Bob", 2],
        ["c1", "Ada", 2],
      ],
    );
    assert.deepEqual(c[0].files[1], { path: "logo.png", added: 0, deleted: 0 });
  });

  test("historyFacts: per file commits, churn, authors, owner and share, last date; bus factor; deleted files left out", () => {
    const { items, summary } = historyFacts(parseNumstat(log), { tracked: ["src/orders.ts", "logo.png", "README.md"] });
    assert.deepEqual(items[0], {
      file: "src/orders.ts",
      commits: 3,
      churn: 116,
      authors: 2,
      owner: "Ada",
      ownerShare: 67,
      last: "2026-09-30",
    });
    assert.ok(!items.some((i) => i.file === "src/old.ts"), "a file no longer tracked");
    assert.deepEqual(summary, {
      commits: 3,
      authors: 2,
      since: "2026-08-01",
      until: "2026-09-30",
      busFactor: 1,
      files: 3,
    });
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
    assert.deepEqual(
      r.items.map((i) => i.file),
      ["src/orders.ts", "README.md"],
    );
    assert.ok(calls[0].includes("--relative") && calls[0].includes("--no-renames"));
    assert.deepEqual(
      collectHistory("/app", () => null),
      { items: [], summary: { available: false } },
    );
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
    assert.deepEqual(cyclesOf(g), [
      ["a", "b", "c"],
      ["d", "e"],
    ]);
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
      assert.deepEqual(
        items.find((i) => i.file === "py/app.py"),
        { file: "py/app.py", imports: 1, importedBy: 0, cycle: null },
      );
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
        "prisma/schema.prisma":
          'model User {\n  id Int @id\n  orders Order[]\n}\n\nmodel Order {\n  id Int @id\n  user User @relation(fields: [userId], references: [id])\n  userId Int\n  @@map("orders")\n}\n',
        "models.py":
          'class Line(Base):\n    __tablename__ = "lines"\n    id = Column(Integer)\n    order_id = Column(ForeignKey("orders.id"))\n',
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
    assert.deepEqual(
      erdTables(items).map((t) => [t.table, t.columns.length, t.references]),
      [
        ["orders", 3, ["users"]],
        ["users", 14, []],
        ["audit", 1, []],
      ],
    );
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
      const empty = await runCli(["build", "--project", dir, "--date", "2026-01-01", "--output", out], {
        stdout: { write: () => {} },
        stderr: { write: () => {} },
        env: {},
      });
      assert.equal(empty, 0);
      const db = JSON.parse(fs.readFileSync(path.join(dir, "facts", "db.json"), "utf8"));
      db.items = [
        { table: "orders", columns: ["id"], file: "x.sql", rls: false, policies: [], references: ["customers"] },
        { table: "customers", columns: ["id"], file: "x.sql", rls: false, policies: [], references: [] },
      ];
      fs.writeFileSync(path.join(dir, "facts", "db.json"), JSON.stringify(db));
      assert.equal(
        await runCli(["build", "--project", dir, "--date", "2026-01-01", "--output", out], {
          stdout: { write: () => {} },
          stderr: { write: () => {} },
          env: {},
        }),
        0,
      );
      const html = fs.readFileSync(out, "utf8");
      assert.match(html, /erd-figure/);
      assert.match(html, /Orders data · db/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the developer views: ::modules, ::hotspots, ::health (engine/build/developer.mjs)", () => {
  const t = (key, vars = {}) =>
    `${key}${
      Object.keys(vars).length
        ? `(${Object.entries(vars)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")})`
        : ""
    }`;
  const modules = {
    items: [
      { file: "src/a.ts", imports: 2, importedBy: 5, cycle: 0 },
      { file: "src/b.ts", imports: 1, importedBy: 9, cycle: 0 },
      { file: "src/c.ts", imports: 0, importedBy: 1, cycle: null },
      { file: "src/lonely.ts", imports: 0, importedBy: 0, cycle: null },
      { file: "src/main.ts", imports: 3, importedBy: 0, cycle: null },
    ],
    summary: { files: 5, edges: 6, cycles: [["src/a.ts", "src/b.ts"]], orphans: 1 },
  };
  const history = {
    items: [
      { file: "CHANGELOG.md", commits: 40, churn: 500, authors: 2, owner: "Ada", ownerShare: 90, last: "2026-10-01" },
      { file: "src/a.ts", commits: 10, churn: 200, authors: 1, owner: "Ada", ownerShare: 100, last: "2026-10-01" },
      { file: "src/b.ts", commits: 4, churn: 30, authors: 2, owner: "Bob", ownerShare: 50, last: "2026-09-01" },
      { file: "src/c.ts", commits: 2, churn: 10, authors: 1, owner: "Bob", ownerShare: 100, last: "2026-08-01" },
    ],
    summary: { available: true, commits: 56, authors: 2, since: "2026-01-01", until: "2026-10-01", busFactor: 1 },
  };
  const quality = {
    items: [
      { file: "src/a.ts", lines: 300, functions: 5, longest: 80, complexity: 20, duplicated: 0, todo: 0 },
      { file: "src/b.ts", lines: 100, functions: 2, longest: 30, complexity: 60, duplicated: 0, todo: 0 },
      { file: "src/c.ts", lines: 120, functions: 0, longest: 0, complexity: 0, duplicated: 0, todo: 0 },
    ],
    summary: {
      ratings: { duplication: "A", complexity: "D", size: "B", tests: "E" },
      tooling: { linter: true, types: false, formatter: true, ci: false },
    },
  };

  test("limitOf: a positive whole number, at most 100; anything else gives the default", () => {
    assert.equal(limitOf("5"), 5);
    assert.equal(limitOf("500"), 100);
    for (const bad of [undefined, "", "0", "-3", "many"]) assert.equal(limitOf(bad), 10);
  });

  test("::modules: the counts, each cycle, the files most depended on (limit), the orphans", () => {
    const html = renderModules(modules, { t, esc, limit: 2 });
    assert.match(html, /render\.modules\.summary\(files=5,edges=6,cycles=1,orphans=1\)/);
    assert.match(html, /<li><code>src\/a\.ts<\/code> ↔ <code>src\/b\.ts<\/code><\/li>/);
    const central = [...html.matchAll(/<tr><td><code>([^<]+)<\/code><\/td><td>(\d+)<\/td>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(central, [
      ["src/b.ts", "9"],
      ["src/a.ts", "5"],
    ]);
    assert.match(html, /<code>src\/lonely\.ts<\/code>/);
    assert.doesNotMatch(html, /src\/main\.ts/, "an entry point imports something: not an orphan, not depended on");
    assert.equal(renderModules({ items: [] }, { t, esc }), "");
  });

  test("hotspots: commits × complexity of the measured source files only; lines when no function was measured", () => {
    const list = hotspots(history, quality);
    assert.deepEqual(
      list.map((h) => [h.file, h.score]),
      [
        ["src/b.ts", 240],
        ["src/a.ts", 200],
        ["src/c.ts", 6],
      ],
      "CHANGELOG.md changes most but is not source code; src/c.ts weighs its 120 lines (3)",
    );
    const html = renderHotspots(history, quality, { t, esc, limit: 1 });
    assert.equal((html.match(/<tr><td>/g) || []).length, 1);
    assert.match(html, /<code>src\/b\.ts<\/code>.*Bob \(50 %\).*--w:100%/);
    assert.match(html, /busFactor=1\)/);
    const none = renderHotspots({ items: [], summary: { available: false, reason: "noGit" } }, quality, { t, esc });
    assert.match(none, /render\.hotspots\.noHistory\(reason=noGit\)/);
  });

  test("health risks: most severe first, one per security rule, each detector on its own source", () => {
    const facts = {
      quality,
      history,
      modules,
      security: {
        items: [
          { rule: "code.eval", file: "x.py", line: 3, severity: "high" },
          { rule: "code.eval", file: "y.py", line: 9, severity: "high" },
          { rule: "xss.innerHTML", file: "z.js", line: 1, severity: "medium" },
        ],
      },
      secrets: { items: [{ file: ".env.prod", rule: "assignment" }] },
      tests: { summary: { files: 3, tests: 10, coverage: 32 } },
      dependencies: {
        items: [
          { name: "reqeusts", exists: false },
          { name: "react", exists: true },
        ],
      },
    };
    assert.deepEqual(
      healthRisks(facts).map((r) => [r.level, r.key]),
      [
        ["high", "security"],
        ["high", "secrets"],
        ["high", "unknownPackages"],
        ["medium", "lowCoverage"],
        ["medium", "busFactor"],
        ["medium", "cycles"],
        ["medium", "rating"],
        ["medium", "rating"],
        ["low", "tooling"],
        ["low", "tooling"],
      ],
    );
    assert.deepEqual(healthRisks(facts)[0].vars, { rule: "code.eval", n: 2, where: "x.py:3" });
    assert.deepEqual(healthRisks(facts)[2].vars, { n: 1, names: "reqeusts" });
    assert.equal(healthRisks(facts, 3).length, 3);
    assert.deepEqual(healthRisks({ tests: { summary: { files: 0, tests: 0 } } }), [
      { level: "high", key: "noTests", vars: {} },
    ]);
    assert.deepEqual(healthRisks({}), [], "no facts, no risk (and no crash)");
  });

  test("::health: a card per source, 'not measured' (with the source) when it is missing; names translated", () => {
    const html = renderHealth({ quality, history, modules }, { t, esc });
    assert.equal((html.match(/class="dev-card"/g) || []).length, 7);
    for (const source of ["security", "tests", "dependencies"])
      assert.match(html, new RegExp(`render\\.health\\.notMeasured\\(source=${source}\\)`));
    assert.match(html, /render\.health\.risk\.rating\(name=render\.health\.rating\.complexity,grade=D\)/);
    assert.match(html, /class="dev-risk dev-medium"/);
    assert.match(renderHealth({}, { t, esc }), /render\.health\.noRisk/);
  });

  test("in a page: drawn from the facts; a missing facts file is facts.missing, an empty one a warning", async () => {
    const dir = demoCopy();
    const cli = (args) => runCli(args, { stdout: { write: () => {} }, stderr: { write: () => {} }, env: {} });
    try {
      const out = path.join(dir, "dist", "x.html");
      const page = path.join(dir, "content", "use", "orders.md");
      fs.appendFileSync(page, '\n\n::health{}\n\n::hotspots{limit="1"}\n\n::points-chauds{}\n\n::modules{}\n');
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 1, "no modules/history/quality: errors");
      const facts = (source, data) =>
        fs.writeFileSync(path.join(dir, "facts", `${source}.json`), JSON.stringify({ source, ...data }));
      facts("modules", modules);
      facts("history", history);
      facts("quality", quality);
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 0);
      const html = fs.readFileSync(out, "utf8");
      for (const view of ["health", "hotspots", "modules"])
        assert.match(html, new RegExp(`data-generated=\\\\?"${view}`));
      assert.match(html, /Bus factor of 1/);
      facts("modules", { items: [] });
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 0, "an empty graph is only a warning");
      assert.match(fs.readFileSync(out, "utf8"), /No module found in facts\/modules\.json yet/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("::c4: containers, database and external systems from the facts (engine/build/c4.mjs)", () => {
  const t = (key) => key;
  const dep = (name, manifest, extra = {}) => ({
    name,
    manifest,
    ecosystem: "npm",
    direct: true,
    dev: false,
    ...extra,
  });
  const facts = {
    dependencies: {
      items: [
        dep("react", "frontend/package.json"),
        dep("@stripe/stripe-js", "frontend/package.json"),
        dep("vite", "frontend/package.json", { dev: true }),
        dep("fastapi", "api/requirements.txt"),
        dep("sqlalchemy", "api/requirements.txt"),
        dep("psycopg2-binary", "api/requirements.txt"),
        dep("@aws-sdk/client-s3", "api/package.json"),
        dep("@sentry/react", "frontend/package.json", { dev: true }),
        dep("lodash", "package.json", { direct: false }),
      ],
    },
    env: {
      items: [
        { name: "VITE_POSTHOG_KEY", files: ["frontend/src/analytics.ts:1"], example: false },
        { name: "OPENAI_API_KEY", files: ["api/settings.py:3"], example: true },
        { name: "DATABASE_URL", files: ["api/settings.py:2"], example: true },
      ],
    },
    db: { items: [] },
  };

  test("a container per folder that names a framework, in reading order; dev dependencies never count", () => {
    const model = systemModel(facts);
    assert.deepEqual(
      model.containers.map((c) => [c.kind, c.tech, c.path, c.evidence]),
      [
        ["web", "React", "frontend", "react (frontend/package.json)"],
        ["api", "FastAPI", "api", "fastapi (api/requirements.txt)"],
      ],
    );
    assert.deepEqual(model.database, {
      tech: "PostgreSQL, SQLAlchemy",
      evidence: "sqlalchemy (api/requirements.txt)",
      source: "api/requirements.txt",
    });
    assert.deepEqual(
      model.externals.map((x) => [x.name, x.evidence]),
      [
        ["Stripe", "@stripe/stripe-js (frontend/package.json)"],
        ["OpenAI", "OPENAI_API_KEY (api/settings.py:3)"],
        ["AWS", "@aws-sdk/client-s3 (api/package.json)"],
        ["PostHog", "VITE_POSTHOG_KEY (frontend/src/analytics.ts:1)"],
      ],
      "a front-end prefix (VITE_) is read through; a dev-only package (@sentry/react) is no evidence",
    );
  });

  test("a full-stack framework wins over its UI library; a database named only by its variable or its tables", () => {
    const next = systemModel({
      dependencies: { items: [dep("react", "package.json"), dep("next", "package.json")] },
      env: { items: [{ name: "DATABASE_URL", files: ["lib/db.ts:2"] }] },
      db: null,
    });
    assert.deepEqual(
      next.containers.map((c) => [c.kind, c.tech, c.path]),
      [["fullstack", "Next.js", "."]],
    );
    assert.deepEqual(next.database, { tech: "", evidence: "DATABASE_URL (lib/db.ts:2)", source: "lib/db.ts" });
    const prisma = systemModel({
      dependencies: { items: [] },
      env: null,
      db: { items: [{ file: "prisma/schema.prisma" }] },
    });
    assert.equal(prisma.database.evidence, "prisma/schema.prisma");
    assert.deepEqual(systemModel({ dependencies: { items: [] } }), { containers: [], database: null, externals: [] });
  });

  test("the drawing: users → the front end → the API; each system from the container that holds its evidence", () => {
    const html = renderC4(systemModel(facts), { t, esc, title: "Shop" });
    assert.match(html, /<svg class="c4"[^>]*aria-label="Shop"/);
    assert.equal((html.match(/<g class="c4-/g) || []).length, 8, "users, 2 containers, the database, 4 systems");
    assert.equal((html.match(/class="c4-edge"/g) || []).length, 7, "users→web, web→api, 5 from a container");
    const box = (label) => {
      const m = new RegExp(`<rect x="([\\d.]+)" y="(\\d+)"[^>]*/><text class="c4-name"[^>]*>${label}<`).exec(html);
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const web = box("render\\.c4\\.kind\\.web");
    const stripe = box("Stripe");
    assert.match(
      html,
      new RegExp(`x1="${(web.x + 85).toFixed(1)}" y1="${web.y + 64}" x2="${(stripe.x + 85).toFixed(1)}"`),
    );
    assert.match(
      html,
      /<td>render\.c4\.external<\/td><td>OpenAI<\/td><td><code>OPENAI_API_KEY \(api\/settings\.py:3\)<\/code>/,
    );
    assert.equal(renderC4({ containers: [], database: null, externals: [] }, { t, esc }), "");
  });

  test("in a page: facts/dependencies.json is required; facts naming nothing give a warning and a note", async () => {
    const dir = demoCopy();
    const cli = (args) => runCli(args, { stdout: { write: () => {} }, stderr: { write: () => {} }, env: {} });
    try {
      const out = path.join(dir, "dist", "x.html");
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), '\n\n::c4{title="Acme"}\n');
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 0, "the demo names nothing: a warning");
      assert.match(fs.readFileSync(out, "utf8"), /No container, database or external system found/);
      fs.writeFileSync(path.join(dir, "facts", "dependencies.json"), JSON.stringify(facts.dependencies));
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 0);
      assert.match(fs.readFileSync(out, "utf8"), /svg class=\\"c4\\"/, "the view is in the page data");
      fs.rmSync(path.join(dir, "facts", "dependencies.json"));
      assert.equal(await cli(["build", "--project", dir, "--output", out]), 1, "facts.missing");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
