// doc-kit pack (engine/pack/pack.mjs, cli/commands/pack.mjs; AUDIT.md §4): llms.txt, llms-full.txt, AGENTS.md and
// CLAUDE.md for the next AI, written in the documentation project, never in the application, and filtered by the
// secret detectors of `check secrets`.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { readingOrder, llmsIndex, llmsFull, agentsFile, withoutSecrets } from "../../engine/pack/pack.mjs";
import { GENERIC } from "../../engine/check/secrets.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

const toc = {
  title: "Acme docs",
  tagline: "Everything about Acme",
  sections: [
    {
      id: "use",
      title: "Use",
      subtitle: "Day to day",
      groups: [
        {
          pages: [
            { id: "use/a", title: "A", summary: "First" },
            { id: "use/b", title: "B", file: "use/bee.md" },
          ],
        },
      ],
    },
  ],
};
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
    commit: () => "c0ffee1",
  });
  return { code, out, err };
}

describe("pack: the documentation for an AI", () => {
  test("reading order: the home page, each section's introduction when it exists, then its pages", () => {
    const pages = readingOrder(toc, (rel) => rel === "home.md" || rel === "use/index.md");
    assert.deepEqual(
      pages.map((p) => [p.id, p.file, p.section]),
      [
        ["", "home.md", ""],
        ["use", "use/index.md", "Use"],
        ["use/a", "use/a.md", "Use"],
        ["use/b", "use/bee.md", "Use"],
      ],
    );
    assert.deepEqual(
      readingOrder(toc, () => false).map((p) => p.id),
      ["use/a", "use/b"],
    );
  });

  test("llms.txt: the title, the tagline, one heading per section and one link per page with its summary", () => {
    const text = llmsIndex({ toc, pages: readingOrder(toc, () => false), site: "Acme.html" });
    assert.equal(
      text,
      "# Acme docs\n\n> Everything about Acme\n\n## Use\n\n- [A](Acme.html#/use/a): First\n- [B](Acme.html#/use/b)\n",
    );
  });

  test("llms-full.txt: every page's Markdown without the guidance comments; a missing file is skipped", () => {
    const files = {
      "use/a.md": "<!-- guidance: say what A is. -->\n\nA is **this**.\n<!-- note\non two lines -->\nEnd.\n",
    };
    const text = llmsFull({ toc, pages: readingOrder(toc, () => false), read: (rel) => files[rel] ?? null });
    assert.match(
      text,
      /^# Acme docs\n\n> Everything about Acme\n\n---\n\n# A \(#\/use\/a\)\n\nA is \*\*this\*\*\.\nEnd\.\n$/,
    );
    assert.doesNotMatch(text, /guidance|two lines|# B/);
  });
});

describe("pack: AGENTS.md from the facts", () => {
  const t = (key, vars = {}) =>
    key === "render.agents.pair"
      ? `${vars.label}: ${vars.value}`
      : `${key}${
          Object.keys(vars).length
            ? `(${Object.entries(vars)
                .map(([k, v]) => `${k}=${v}`)
                .join(",")})`
            : ""
        }`;
  const base = {
    product: "Acme",
    scripts: [],
    commit: "c0ffee123",
    generated: "2026-10-03T10:00:00Z",
    docs: "llms-full.txt",
    t,
  };

  test("one section per subject that has facts; names only, never a value", () => {
    const facts = {
      dependencies: { items: [{ name: "fastapi", manifest: "api/requirements.txt", direct: true, dev: false }] },
      env: {
        items: [
          { name: "OPENAI_API_KEY", files: ["api/settings.py:3"] },
          { name: "UNUSED", files: [] },
        ],
      },
      api: { items: [{ method: "GET", route: "/orders\n", file: "api/orders.py", line: 7, auth: "user" }] },
    };
    const md = agentsFile({ ...base, facts, scripts: [{ folder: "api", entries: { test: "pytest -q" } }] });
    assert.match(
      md,
      /^# render\.agents\.title\(product=Acme\)\n\n> render\.agents\.notice\(date=2026-10-03,commit=c0ffee1,docs=llms-full\.txt\)/,
    );
    assert.match(
      md,
      /## render\.agents\.stack\n\n- render\.c4\.kind\.api: FastAPI, `api`\n- OpenAI: OPENAI_API_KEY \(api\/settings\.py:3\)/,
    );
    assert.match(md, /## render\.agents\.commands\n\n- `test` \(`api`\): `pytest -q`/);
    assert.match(md, /- `OPENAI_API_KEY`: api\/settings\.py:3\n- `UNUSED`\n/);
    assert.match(
      md,
      /- GET `\/orders`: api\/orders\.py:7 · render\.agents\.auth\(auth=user\)/,
      "a route's own line breaks are folded",
    );
    for (const absent of ["data", "tests", "conventions", "hotspots", "instructions"])
      assert.doesNotMatch(md, new RegExp(`## pack\\.agents\\.${absent}\\n`));
  });

  test("a long list stops after 40 lines, with a line saying how many more", () => {
    const env = {
      items: Array.from({ length: 45 }, (_, i) => ({ name: `VAR_${String(i).padStart(2, "0")}`, files: [] })),
    };
    const md = agentsFile({ ...base, facts: { env } });
    assert.equal((md.match(/^- `VAR_/gm) || []).length, 40);
    assert.match(md, /- render\.agents\.more\(n=5\)\n/);
  });
});

describe("pack: secrets", () => {
  test("a line where a detector fires becomes a notice and is reported; the value is never kept", () => {
    const r = withoutSecrets(`one\ntoken ${JWT}\nthree`, GENERIC, (kind) => `[removed: ${kind}]`);
    assert.equal(r.text, "one\n[removed: jwt]\nthree");
    assert.deepEqual(r.removed, [{ line: 2, kind: "jwt" }]);
    assert.deepEqual(
      withoutSecrets("nothing here", GENERIC, () => "x"),
      { text: "nothing here", removed: [] },
    );
  });
});

describe("doc-kit pack (CLI)", () => {
  test("writes the four files next to the built site, reads the app's scripts, writes nothing in the application", async () => {
    const dir = demoCopy();
    const app = tempDir("doc-kit-pack-app-");
    try {
      fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
      const config = path.join(dir, "doc.config.mjs");
      const rel = path.relative(dir, app).split(path.sep).join("/");
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace(/dir: "[^"]*"/, `dir: "${rel}"`));
      const before = fs.readdirSync(app);
      const r = await cli(["pack", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      for (const f of ["llms.txt", "llms-full.txt", "AGENTS.md", "CLAUDE.md"]) {
        assert.ok(fs.existsSync(path.join(dir, "dist", f)), f);
        assert.match(r.out, new RegExp(`✔ dist/${f.replace(".", "\\.")} \\(\\d+ KB\\)`));
      }
      assert.equal(fs.readFileSync(path.join(dir, "dist", "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
      assert.match(fs.readFileSync(path.join(dir, "dist", "AGENTS.md"), "utf8"), /- `test`: `vitest run`/);
      assert.match(fs.readFileSync(path.join(dir, "dist", "llms.txt"), "utf8"), /^# .+\n\n> /);
      assert.deepEqual(fs.readdirSync(app), before, "nothing written in the application");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a secret in a page: its line is removed from llms-full.txt and reported, exit code 1; --output", async () => {
    const dir = demoCopy();
    try {
      fs.appendFileSync(path.join(dir, "content", "use", "orders.md"), `\n\nThe token is ${JWT} for now.\n`);
      const r = await cli(["pack", "--project", dir, "--output", "out"]);
      assert.equal(r.code, 1);
      const full = fs.readFileSync(path.join(dir, "out", "llms-full.txt"), "utf8");
      assert.ok(!full.includes(JWT));
      assert.match(full, /\[line removed by doc-kit pack: a possible secret \(jwt\)\]/);
      assert.match(r.out, /⚠ out\/llms-full\.txt:\d+: a possible secret \(jwt\), the line was removed/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
