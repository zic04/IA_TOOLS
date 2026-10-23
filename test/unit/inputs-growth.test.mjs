// The readers of the documentation's inputs stay linear on what a hostile value or document holds (RULES.md S5): each
// input is built at a base size, then 4 and 16 times larger (assertLinear, test/tools/growth.mjs), no absolute time.
// test/tools/run-plan.mjs runs this file alone, after the others. The functional tests of these readers (what they
// find, what they refuse) stay in inputs.test.mjs, inputs-documents.test.mjs, refs.test.mjs, search-core.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { tempDir, KIT_ROOT } from "../tools/helpers.mjs";
import { zipFolder } from "../../engine/dev/zip.mjs";
import { hasCredentials, nameOf } from "../../engine/inputs/model.mjs";
import { htmlToText } from "../../engine/inputs/ingest.mjs";
import { docxToMarkdown } from "../../engine/inputs/docx.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { walkXml } from "../../engine/core/xml.mjs";
import { REFS_PATTERNS } from "../../engine/core/refs.mjs";
import { assertLinear, linearAt } from "../tools/growth.mjs";

/** A reader of text on a shape built for n units. */
const linear = (label, size, build, run) => assertLinear(label, { size, build, run });

describe("addresses and names (engine/inputs/model.mjs)", () => {
  // inputs.test.mjs › "a value carrying credentials…" (200,000 repeats, was under 1,000 ms each)
  test("hasCredentials: a hostile address and parameter names decoded in one pass", () => {
    linear(
      "hasCredentials on a hostile value",
      12_500,
      (n) => "a:/".repeat(n) + "@" + "?x=1&".repeat(n / 2),
      (value) => hasCredentials(value),
    );
    linear(
      "hasCredentials on parameter names",
      12_500,
      (n) => "?" + "%=ab&".repeat(n),
      (value) => hasCredentials(value),
    );
  });

  // inputs.test.mjs › "names: the last part of the address…" (500,000 characters, was under 200 ms)
  test("nameOf: a string of 'a-a-a…' (grown by += and read with endsWith, it was quadratic)", () => {
    linear(
      "nameOf on a-a-a…",
      15_625,
      (n) => "a-".repeat(n),
      (value) => nameOf(value),
    );
  });
});

describe("the readers of a document (engine/inputs)", () => {
  // inputs.test.mjs › "HTML: its text… linear on hostile input" (was under 1,000 ms)
  test("htmlToText: a run of '<' then an unclosed script", () => {
    linear(
      "htmlToText on a run of '<'",
      12_500,
      (n) => "<".repeat(n) + "<script" + "a".repeat(n),
      (html) => htmlToText(html),
    );
  });

  /** A .docx whose word/document.xml is `xml`, in a folder of its own: its path (assertLinear removes the folder). */
  const docx = (xml) => {
    const parts = tempDir("doc-kit-growth-docx-");
    fs.mkdirSync(path.join(parts, "word"));
    fs.writeFileSync(path.join(parts, "word", "document.xml"), xml);
    const file = path.join(parts, "doc.docx");
    zipFolder(path.join(parts, "word"), file, "word");
    return file;
  };
  const removeDocx = (file) => fs.rmSync(path.dirname(file), { recursive: true, force: true });

  // inputs.test.mjs › "a table bomb" (4,000 rows after two cells spanning 64 columns, was under 2,000 ms)
  test("docxToMarkdown: a table bomb (spans, then rows) is refused as it grows", () => {
    const wide = '<w:tc><w:tcPr><w:gridSpan w:val="64"/></w:tcPr><w:p/></w:tc>';
    const refused = assertLinear("docxToMarkdown on a table bomb", {
      size: 250,
      // Each row its own text: the archive compresses like a real document (no ratio refusal before the table is read).
      build: (n) =>
        docx(
          `<w:document xmlns:w="w"><w:body><w:tbl><w:tr>${wide}${wide}</w:tr>${Array.from(
            { length: n },
            (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>r${i * 7919}</w:t></w:r></w:p></w:tc></w:tr>`,
          ).join("")}</w:tbl></w:body></w:document>`,
        ),
      run: (file) => {
        try {
          docxToMarkdown(fs.readFileSync(file));
        } catch (e) {
          if (e.key !== "inputs.refused") throw e;
        }
      },
      cleanup: removeDocx,
    });
    assert.ok(refused.length >= 2);
  });

  // inputs.test.mjs › "paragraphs nested deep inside each other" (250 deep, 200,000 words, was under 2,000 ms)
  test("docxToMarkdown: paragraphs nested inside each other, whatever their depth", () => {
    const { found } = linearAt("docxToMarkdown on nested paragraphs", {
      size: 12_500,
      // Varied words: the archive compresses like a real document (no ratio refusal before the paragraphs are read).
      make: (n) => {
        const words = Array.from({ length: n }, (_, i) => `word${(i * 7919) % 100_003}`).join(" ");
        const depth = Math.max(1, Math.round(n / 800));
        return docx(
          `<w:document xmlns:w="w"><w:body>${"<w:p>".repeat(depth)}<w:r><w:t>${words}</w:t></w:r>${"</w:p>".repeat(depth)}</w:body></w:document>`,
        );
      },
      read: (file) => docxToMarkdown(fs.readFileSync(file)).markdown.slice(0, 14),
      remove: removeDocx,
    });
    assert.equal(found, "word0 word7919");
  });

  // inputs.test.mjs › "Mermaid groups and draw.io labels" (3,000 × 3,000 nodes, 100,000 labels, was under 2,000 ms)
  test("diagramToMarkdown: a group of N × N nodes stops at the cap of links", () => {
    const { found } = linearAt("diagramToMarkdown on a Mermaid group", {
      size: 188,
      make: (n) => {
        const group = (p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(" & ");
        return `graph TD\n${group("A")} --> ${group("B")}\n`;
      },
      read: (text) => diagramToMarkdown(text, "mermaid").links.length,
    });
    assert.ok(found <= 5000);
  });

  test("diagramToMarkdown: a draw.io label of many entities, and many edges: each label read once, and cut", () => {
    linear(
      "diagramToMarkdown on a draw.io label",
      6250,
      (n) => {
        const label = "&lt;b&gt;x&lt;/b&gt;".repeat(n);
        const edges = Array.from(
          { length: Math.round(n / 100) },
          (_, i) => `<mxCell id="e${i}" edge="1" source="a" target="b"/>`,
        ).join("");
        return `<mxfile><diagram><mxGraphModel><root><mxCell id="a" vertex="1" value="${label}"/><mxCell id="b" vertex="1" value="B"/>${edges}</root></mxGraphModel></diagram></mxfile>`;
      },
      (drawio) => diagramToMarkdown(drawio, "drawio"),
    );
  });

  // inputs-documents.test.mjs › "an internal DTD (XXE, billion laughs) is skipped" (nine levels, was under 200 ms)
  test("walkXml: a billion laughs of N levels is never expanded", () => {
    const none = { open() {}, close() {}, text() {} };
    linear(
      "walkXml on a billion laughs",
      1,
      (n) => {
        const laughs = Array.from({ length: n }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i};`.repeat(10)}">`);
        return `<?xml version="1.0"?>\n<!DOCTYPE foo [\n  <!ENTITY lol0 "lol">\n  ${laughs.join("\n")}\n]>\n<foo a="&lol${n};">&lol${n};</foo>`;
      },
      (xml) => walkXml(xml, none),
    );
  });
});

describe("the references (engine/core/refs.mjs)", () => {
  // refs.test.mjs › "linear on crafted references" (200,000 characters, every expression, was under 200 ms)
  test("every expression of REFS_PATTERNS on a crafted reference", () => {
    const shapes = {
      "a long number": (n) => `ADO#${"1".repeat(n)}`,
      "a long key": (n) => `${"A".repeat(n)}-1`,
      "a long path": (n) => `${"a/".repeat(n / 2)}#1`,
      "a long repository": (n) => `${"a".repeat(n)}#`,
    };
    for (const [name, build] of Object.entries(shapes))
      linear(
        `REFS_PATTERNS on ${name}`,
        12_500,
        build,
        (s) => void Object.values(REFS_PATTERNS).map((re) => re.exec(s)),
      );
  });
});

describe("the search of the site (engine/site/lib/search-core.js)", () => {
  /** The module, run in a context of its own, as the site runs it. */
  const context = { EXT: { hydrators: [], api: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(KIT_ROOT, "engine", "site", "lib", "search-core.js"), "utf8"), context);
  const core = context.EXT.searchCore;
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  // search-core.test.mjs › "linear on a long text" (300,000 characters, was under 2,000 ms)
  test("match: a term found once per occurrence, never from each character", () => {
    const entry = (x) => ({ p: "p", a: "a", t: "t", x, nt: "t", np: "t", nx: norm(x) });
    linearAt("search match on a long text", {
      size: 6250,
      make: (n) => [entry("ab ".repeat(n))],
      read: (index) => [core.match(index, "ab", norm), core.match(index, "abq", norm)].length,
    });
  });
});
