// No crafted file of the application blocks `facts` or `check secrets` (RULES.md S5, SECURITY.md): each scanner below
// once took four times as long, or more, for twice the input on the shape it is given here — a repeated occurrence,
// a construct left open, a long run. Each input is built at a base size, then 4 and 16 times larger (linearAt,
// test/tools/growth.mjs), no absolute time; test/tools/run-plan.mjs runs this file alone, after the others. A reader
// that gave up early would be "linear" by doing nothing: each test also checks what was read at the largest size.
// What each scanner finds on normal input stays in its functional tests (security.test.mjs, facts.test.mjs,
// reviews.test.mjs, checks.test.mjs, sync.test.mjs, capture.test.mjs, sync-imports.test.mjs).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RULES } from "../../engine/facts/security.mjs";
import { collectQuality } from "../../engine/facts/quality.mjs";
import { collectSource } from "../../engine/facts/registry.mjs";
import { pySpecifiers } from "../../engine/facts/imports.mjs";
import { scanText, GENERIC, isUrlTemplate, checkSecrets } from "../../engine/check/secrets.mjs";
import { apiPathsIn } from "../../engine/sync/api-links.mjs";
import { contentSecurityPolicy } from "../../engine/build/csp.mjs";
import { extractProofs } from "../../engine/sync/proofs.mjs";
import { shownText, rendersAsBefore } from "../../engine/sync/html-text.mjs";
import { parseEnv } from "../../engine/capture/masking.mjs";
import { linearAt } from "../tools/growth.mjs";
import { tempDir, syncLabels, KIT_ROOT } from "../tools/helpers.mjs";
import { createSyncRenderer } from "../../engine/build/sync-renderer.mjs";

/** A scanner of a text built of n units; what it gave at the largest size measured. */
const linear = (label, size, make, read) => linearAt(label, { size, make, read }).found;
/** The same, with the largest size measured: { found, n }. */
const linearN = (label, size, make, read) => linearAt(label, { size, make, read });
/** The lines a rule of the security source finds. */
const rule = (name) => {
  const found = RULES.find((r) => r.rule === name);
  return (text) => found.find(text);
};

describe("the OWASP heuristics of the security source (engine/facts/security.mjs)", () => {
  test("cors.wildcardCredentials: the same CORS configuration on every line, each pair once (no double loop)", () => {
    const line = 'app.use(cors({ origin: "*", credentials: true }));\n';
    const { found, n } = linearN(
      "cors.wildcardCredentials",
      40,
      (k) => line.repeat(k),
      rule("cors.wildcardCredentials"),
    );
    assert.equal(found.length, n, "every line holds a configuration");
  });

  test("xss.innerHTML: an assignment on every line, the line of each found by an index (no slice per match)", () => {
    const { found, n } = linearN("xss.innerHTML", 280, (k) => "el.innerHTML = x;\n".repeat(k), rule("xss.innerHTML"));
    assert.equal(found.length, n);
  });

  test("redirect.open: redirect calls never closed, the arguments of each read in a bounded window", () => {
    const found = linear("redirect.open", 230, (n) => "res.redirect(".repeat(n), rule("redirect.open"));
    assert.deepEqual(found, [], "no argument reads a request parameter");
  });

  test("sql.concat: a query built and run on every line, each run matched to the builds near it once", () => {
    const line = "q = `select ${x}`; db.query(q);\n";
    const { found, n } = linearN("sql.concat", 100, (k) => line.repeat(k), rule("sql.concat"));
    assert.equal(found.length, n);
  });

  test("jwt.noVerify: algorithm lists never closed", () => {
    const found = linear("jwt.noVerify", 230, (n) => "algorithms: [".repeat(n), rule("jwt.noVerify"));
    assert.deepEqual(found, []);
  });

  test("auth.noRateLimit: a sign-in route whose string is never closed, the word repeated", () => {
    const found = linear("auth.noRateLimit", 600, (n) => "post('" + "login".repeat(n), rule("auth.noRateLimit"));
    assert.deepEqual(found, []);
  });

  test("secret.default: a quoted value of interpolations never closed", () => {
    const value = (n) => 'password = "' + "${".repeat(n) + 'x"';
    assert.deepEqual(linear("secret.default interpolations", 2000, value, rule("secret.default")), [1]);
  });
});

describe("the db and env sources on a crafted file (engine/facts/db.mjs, env.mjs)", () => {
  /** The items of a source on an application of one file, written for each size. */
  function source(label, size, name, file, text) {
    const read = linearAt(label, {
      size,
      make: (n) => {
        const dir = tempDir();
        fs.writeFileSync(path.join(dir, file), text(n));
        return dir;
      },
      read: (dir) => collectSource(name, { appDir: dir }),
      remove: (dir) => fs.rmSync(dir, { recursive: true, force: true }),
    });
    return read.found.then((found) => found.items);
  }

  test("a SQLAlchemy model of blank lines, and classes never closed", async () => {
    const blank = (n) => "class A(Base):\n" + "\n".repeat(n) + 'x = 1\n__tablename__ = "a"\n';
    const [table] = await source("db SQLAlchemy blank lines", 1000, "db", "m.py", blank);
    assert.equal(table.table, "a");
    const annotations = (n) => 'class A(Base):\n__tablename__ = "a"\n' + "a:\r".repeat(n);
    const [annotated] = await source(
      "db SQLAlchemy annotations cut by carriage returns",
      1000,
      "db",
      "m.py",
      annotations,
    );
    assert.deepEqual([annotated.table, annotated.columns], ["a", []]);
    const open = (n) => "class A(".repeat(n) + '\n__tablename__ = "a"\n';
    assert.deepEqual(await source("db SQLAlchemy classes never closed", 1000, "db", "m.py", open), []);
  });

  test("Prisma models and SQL tables never closed", async () => {
    const models = (n) => "model A {".repeat(n);
    assert.deepEqual(await source("db Prisma models never closed", 500, "db", "schema.prisma", models), []);
    const tables = (n) => "CREATE TABLE t (".repeat(n);
    assert.deepEqual(await source("db SQL tables never closed", 500, "db", "x.sql", tables), []);
  });

  test("env: destructurings of process.env never closed", async () => {
    const opens = (n) => "const {".repeat(n) + "\nprocess.env.A;\n";
    const names = (await source("env destructurings never closed", 1000, "env", "x.js", opens)).map((i) => i.name);
    assert.deepEqual(names, ["A"]);
  });
});

describe("the secret check (engine/check/secrets.mjs)", () => {
  test("scanText: JWT-like tokens joined by dots, one token for all of them (its URL template decided once)", () => {
    const chain = (n) => Array.from({ length: n }, () => "eyJabcdefgh").join(".");
    const { found, n } = linearN("scanText JWT chain", 16, chain, (text) => scanText(text, GENERIC));
    assert.equal(found.length, Math.floor(n / 3), "a token of three parts, then the next");
    assert.ok(found.every((f) => f.kind === "jwt"));
  });

  test("isUrlTemplate: a long run of scheme characters, and many schemes in one token", () => {
    assert.equal(
      linear("isUrlTemplate dots", 1000, (n) => "a.".repeat(n), isUrlTemplate),
      false,
    );
    assert.equal(
      linear("isUrlTemplate schemes", 500, (n) => "a://".repeat(n), isUrlTemplate),
      false,
    );
    assert.equal(
      linear("isUrlTemplate schemes, a placeholder at the end", 500, (n) => "a://".repeat(n) + "{z}", isUrlTemplate),
      true,
    );
  });

  describe("the text of the built site: elements and tags never closed", () => {
    const root = tempDir();
    after(() => fs.rmSync(root, { recursive: true, force: true }));
    const config = {
      masking: { env: [], patterns: [], guid: false },
      paths: { content: "content", images: "images", translations: null, diagrams: "diagrams" },
      capture: { plans: "plans" },
    };
    /** The findings of check secrets on a site whose one page holds `html`. */
    const site = (html) =>
      checkSecrets({
        root,
        config,
        data: { pages: { p: { title: "", summary: "", html } } },
        session: path.join(root, "session.json"),
        tracked: () => false,
      }).findings;
    for (const [label, unit, size] of [
      ["<script> never closed", "<script>", 500],
      ["<style> never closed", "<style>", 500],
      ["a tag never closed", "<a ", 700],
    ])
      test(label, () => {
        assert.deepEqual(
          linear(`check secrets, ${label}`, size, (n) => unit.repeat(n), site),
          [],
        );
      });
  });
});

describe("the Content Security Policy of the built site (engine/build/csp.mjs)", () => {
  test("scripts never closed in a page: their hashes looked for up to the last </script> only", () => {
    const policy = linear("csp scripts never closed", 500, (n) => "<script>".repeat(n), contentSecurityPolicy);
    assert.match(policy, /script-src 'none'/);
    // Openings with attributes never ended, then one closing tag: each opening's attributes read 2,000 characters at
    // most, not up to the ">" of that tag.
    const opens = (n) => "<script ".repeat(n) + "</script>";
    assert.match(linear("csp openings, then one closing tag", 500, opens, contentSecurityPolicy), /script-src 'none'/);
  });
});

describe("the links of the screens to the API (engine/sync/api-links.mjs)", () => {
  test("apiPathsIn: substitutions never closed, each path read without scanning to the end of the text", () => {
    assert.deepEqual(
      linear("apiPathsIn ${ never closed", 600, (n) => '"/a/${'.repeat(n), apiPathsIn),
      [],
    );
  });

  test("apiPathsIn: a path of many slashes, its trailing ones taken off in one pass", () => {
    const found = linear("apiPathsIn slashes", 2000, (n) => '"/a' + "/".repeat(n) + 'b"', apiPathsIn);
    assert.equal(found.length, 1);
    assert.ok(found[0].startsWith("/a//") && found[0].endsWith("/b"));
  });
});

describe("the proofs of a page (engine/sync/proofs.mjs)", () => {
  test("a code span never closed, a long word in it; a line number never followed by its backtick", () => {
    assert.deepEqual(
      linear("PROOF_REF long word", 2000, (n) => "`" + "a".repeat(n), extractProofs),
      [],
    );
    assert.deepEqual(
      linear("PROOF_REF long line number", 2000, (n) => "`a.ts:" + "1".repeat(n) + "\n", extractProofs),
      [],
    );
  });

  test("badges never closed, on one line", () => {
    assert.deepEqual(
      linear("PROOF_BADGE never closed", 2000, (n) => "[[verified a".repeat(n), extractProofs),
      [],
    );
  });
});

describe("the labels of the pages (engine/sync/labels.mjs)", () => {
  // Every label is looked for in every page: each page is rendered once a run and its shown text read once, however
  // many pages the documentation has (the cache once held 256 pages, then started again, and each label read every
  // page again). A fresh reader at each size: nothing read from an earlier one.
  test("citedLabels: hundreds of labels in thousands of pages, each page rendered and read once", () => {
    const flat = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, `Label number ${i}`]));
    const body = "Click **Label number 7** on the `Orders` page, then the [link](x.md).\n\n- step\n\n    code\n";
    const { found, n } = linearN(
      "citedLabels pages",
      100,
      (k) => Array.from({ length: k }, (_, i) => ({ id: `p${i}`, markdown: `# Page ${k}-${i}\n\n${body}` })),
      (pages) => syncLabels().citedLabels(flat, pages),
    );
    assert.deepEqual(
      found.map((l) => [l.key, l.pages.length]),
      [["k7", n]],
    );
  });

  // A sync renders each page once to read what it cites, and once more for each label --apply --labels rewrites in it
  // (the page rendered after, checked against the one before): linear in the number of pages and in their size.
  test("replaceLabel: every page of a documentation rewritten and checked, linear in the number of pages", () => {
    const body = "Click **Approve**, then «Approve» in the [[menu Approve]] menu.\n\n| a | **Approve** |\n|---|---|\n";
    const { found, n } = linearN(
      "replaceLabel pages",
      100,
      (k) => Array.from({ length: k }, (_, i) => `## Step ${i}\n\n${body}`),
      (pages) => {
        const labels = syncLabels();
        return pages.filter(
          (md) => labels.citesLabel(md, "Approve") && labels.replaceLabel(md, "Approve", "Validate").n === 4,
        ).length;
      },
    );
    assert.equal(found, n);
  });

  // The kit's renderer itself (engine/build/markdown.mjs), as sync renders a page: a block directive looked for in the
  // paragraph only (startInParagraph), and a badge never looked for ahead (Marked's text stops before every "[").
  test("the kit's renderer: one paragraph of thousands of inline elements, and thousands of paragraphs", () => {
    const render = createSyncRenderer({ root: KIT_ROOT, config: {} });
    const paragraph = linear("renderer one paragraph", 1000, (k) => "**b** `c` x ".repeat(k), render);
    assert.equal(paragraph.split("<strong>").length - 1, 16000);
    const page = linear("renderer paragraphs", 400, (k) => "A *b* paragraph.\n\n".repeat(k), render);
    assert.equal(page.split("<p>").length - 1, 6400);
  });

  // A paragraph ended by a heading, a rule or a fence, with no blank line: a directive is looked for in Marked's own
  // paragraph only, line by line (it was looked for up to the next blank line, the rest of the page here).
  test("the kit's renderer: paragraphs ended by a heading, a rule or a fence, never by a blank line", () => {
    const render = createSyncRenderer({ root: KIT_ROOT, config: {} });
    for (const [label, unit, tag] of [
      ["renderer paragraphs cut by headings", (i) => `Some text.\n# Head ${i}\n`, "<h2"],
      ["renderer paragraphs cut by rules", () => "Some text.\n***\n", "<hr>"],
      ["renderer paragraphs cut by fences", () => "Some text.\n~~~\nx\n~~~\n", "<pre>"],
    ]) {
      const { found, n } = linearN(label, 300, (k) => Array.from({ length: k }, (_, i) => unit(i)).join(""), render);
      assert.equal(found.split(tag).length - 1, n, label);
    }
  });

  // One title again and again: a counter per slug (a suffix added again and again made each anchor longer than the one
  // before); a badge never closed on a line, again and again: its text never runs over the next opening.
  test("the kit's renderer: one heading repeated, and badges and claims opened on one line, never closed", () => {
    const render = createSyncRenderer({ root: KIT_ROOT, config: {} });
    const repeated = linearN(
      "renderer one heading repeated",
      100,
      (k) => "## Parameters\n\nText.\n\n".repeat(k),
      render,
    );
    assert.ok(repeated.found.includes(`id="parameters-${repeated.n}"`));
    for (const [label, unit] of [
      ["renderer badges opened", "[[menu "],
      ["renderer claims opened", "[[verified a "],
    ])
      assert.ok(linear(label, 300, (k) => unit.repeat(k), render).startsWith("<p>[["), label);
    const blanks = linear("renderer blanks after a badge's kind", 2000, (k) => "[[menu" + " ".repeat(k) + "x", render);
    assert.ok(blanks.startsWith("<p>[[menu"), "never closed: text");
  });

  test("replaceLabel, citesLabel: one page of thousands of paragraphs, rewritten and checked", () => {
    const paragraph = "Click **Approve**, then «Approve» — the `Approve` button.\n\n";
    const { found, n } = linearN(
      "replaceLabel page size",
      200,
      (k) => paragraph.repeat(k),
      (md) => {
        const labels = syncLabels();
        return labels.citesLabel(md, "Approve") ? labels.replaceLabel(md, "Approve", "Validate").n : -1;
      },
    );
    assert.equal(found, 3 * n);
  });
});

describe("a rendered page, read as a browser reads it (engine/sync/html-text.mjs)", () => {
  // Each shape once took a scanner past linear: a construct never closed, a deep nesting closed by tags that close
  // nothing, a long run of one character, a text run holding the label many times.
  test("shownText: tags, comments, quoted values and references never closed; deep nesting", () => {
    for (const [label, make] of [
      ["shownText <", (k) => "<".repeat(k)],
      ["shownText quoted value", (k) => '<a b="' + "x".repeat(k)],
      ["shownText attributes", (k) => "<a " + "b ".repeat(k)],
      ["shownText comment", (k) => "<!--" + "-".repeat(k)],
      ["shownText comments", (k) => "<!-- -->".repeat(k)],
      ["shownText comments closed by --!>", (k) => "<!-- --!>".repeat(k)],
      // A text run between each two comments, or tags: a token for each, all built and placed (the ReDoS harness's
      // "sync shownText comments" shape).
      ["shownText text between comments", (k) => "x<!-- -->".repeat(k)],
      ["shownText text between comments closed by --!>", (k) => "x<!-- --!>".repeat(k)],
      ["shownText text between tags", (k) => 'x<b a="1">'.repeat(k)],
      ["shownText end tags", (k) => "</".repeat(k)],
      ["shownText script", (k) => "<script>" + "</scrip".repeat(k)],
      ["shownText references", (k) => "&#".repeat(k)],
      ["shownText nesting", (k) => "<div>".repeat(k) + "</span>".repeat(k) + "<p>x</p>"],
      ["shownText scope", (k) => "<table>" + "<b>".repeat(k) + "</i>".repeat(k) + "<td>x</td>"],
    ]) {
      const found = linear(label, 2000, make, (html) => shownText(html).text.length);
      assert.ok(found >= 0, label);
    }
  });

  test("rendersAsBefore: a bold text run holding the label thousands of times, renamed in every other place", () => {
    const { found } = linearN(
      "rendersAsBefore places",
      500,
      (k) => [
        `<p><strong>${"Approval chain, ".repeat(k)}</strong></p>`,
        `<p><strong>${Array.from({ length: k }, (_, i) => (i % 2 ? "Approval chain history, " : "Approval chain, ")).join("")}</strong></p>`,
      ],
      ([before, after]) => rendersAsBefore(before, after, ["Approval chain"], "Approval chain history"),
    );
    assert.equal(found, true);
  });
});

describe("the .env files of the masking (engine/capture/masking.mjs)", () => {
  test("parseEnv: a value with a long run of spaces, and one cut by a carriage return", () => {
    const { found, n } = linearN("parseEnv spaces", 2000, (k) => "A=x" + " ".repeat(k) + "y", parseEnv);
    assert.equal(found.length, 1);
    assert.equal(found[0].value.length, n + 2, "the value whole, its inner blanks kept");
    assert.deepEqual(
      linear("parseEnv carriage return", 2000, (n) => "A=" + " ".repeat(n) + "x\rx", parseEnv),
      [],
    );
  });
});

describe("the local imports of Python (engine/facts/imports.mjs)", () => {
  test("pySpecifiers: blank lines, and a run of dots or of blanks after `from`", () => {
    assert.deepEqual(
      linear("pySpecifiers blank lines", 2000, (n) => "\n".repeat(n) + "x", pySpecifiers),
      [],
    );
    assert.deepEqual(
      linear("pySpecifiers dots", 2000, (n) => "from " + ".".repeat(n) + "!", pySpecifiers),
      [],
    );
    assert.deepEqual(
      linear("pySpecifiers blanks", 2000, (n) => "from" + " ".repeat(n) + "!", pySpecifiers),
      [],
    );
  });

  test("pySpecifiers: carriage returns and U+2028, where a multiline `^` also starts", () => {
    assert.deepEqual(
      linear("pySpecifiers carriage returns", 2000, (n) => "\r".repeat(n) + "x", pySpecifiers),
      [],
    );
    assert.deepEqual(
      linear("pySpecifiers U+2028", 2000, (n) => "\u2028".repeat(n) + "x", pySpecifiers),
      [],
    );
  });
});

describe("the functions of the quality source (engine/facts/quality.mjs)", () => {
  /** One file x.js holding the text, its quality item read (the scan is synchronous; its result a promise). */
  function quality(label, size, text, check) {
    const read = linearAt(label, {
      size,
      make: (n) => {
        const dir = tempDir();
        fs.writeFileSync(path.join(dir, "x.js"), text(n));
        return dir;
      },
      read: (dir) => collectQuality(dir),
      remove: (dir) => fs.rmSync(dir, { recursive: true, force: true }),
    });
    return read.found.then(({ items }) => check(items[0], read.n));
  }

  test("a function keyword followed by a long run of spaces", () =>
    quality(
      "quality function spaces",
      100,
      (n) => "function" + " ".repeat(n) + "x",
      (item) => assert.equal(item.functions, 0),
    ));

  test("a method and a type annotation followed by a long run of spaces, and many of them", async () => {
    await quality(
      "quality annotation spaces",
      2000,
      (n) => "a():" + " ".repeat(n),
      (item) => assert.equal(item.functions, 0),
    );
    await quality(
      "quality annotations",
      400,
      (n) => "a(): ".repeat(n),
      (item) => assert.equal(item.functions, 0),
    );
  });

  test("a long word: a method looked for once per word, not once per letter", () =>
    quality(
      "quality long word",
      2000,
      (n) => "a".repeat(n),
      (item) => assert.equal(item.functions, 0),
    ));

  test("many functions, the lines of each found by an index", () =>
    quality(
      "quality many functions",
      250,
      (n) => "function a() {}\n".repeat(n),
      (item, n) => assert.equal(item.functions, n),
    ));

  test("functions never closed, and functions nested: each body matched once", async () => {
    await quality(
      "quality functions never closed",
      130,
      (n) => "function a() {\n".repeat(n),
      (item, n) => assert.equal(item.functions, n),
    );
    await quality(
      "quality nested functions",
      130,
      (n) => "function a() { if (x) {}\n".repeat(n) + "}\n".repeat(n),
      (item, n) => {
        assert.equal(item.functions, n);
        assert.equal(item.complexity, n + 1, "the outer function holds every if");
        assert.equal(item.longest, n + n, "the outer function spans the file");
      },
    );
  });
});
