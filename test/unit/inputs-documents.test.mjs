// The readers of the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): the safe ZIP
// reader, the linear XML reader, Word to Markdown, diagrams to components and links, and the PDF index. Every
// fixture is built here, in memory or in a temporary folder: the realistic ones with zipFolder, the malicious ones
// byte by byte (ZIP bombs, encrypted or ZIP64 entries, XXE and billion laughs). No network, no external tool.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { tempDir } from "../tools/helpers.mjs";
import { zipFolder } from "../../engine/dev/zip.mjs";
import { crc32 } from "../../engine/core/hash.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { readZipEntries, ZIP_LIMITS } from "../../engine/inputs/zip.mjs";
import { walkXml, decodeEntities, inertMarkup } from "../../engine/inputs/xml.mjs";
import { docxToMarkdown } from "../../engine/inputs/docx.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { pdfIndex } from "../../engine/inputs/pdf.mjs";
import { loadDictionary } from "../../engine/i18n.mjs";

const folders = [];
after(() => folders.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** The assertion that `fn` refuses its input with `reason` (KitError "inputs.refused", exit code CHECK). */
function refuses(fn, reason) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof KitError, `a KitError, not ${e}`);
    assert.equal(e.code, EXIT.CHECK);
    assert.equal(e.key, "inputs.refused");
    assert.deepEqual(e.vars, { reason });
    return true;
  });
}

/** A .docx built by zipFolder from parts `{ "word/document.xml": xml, … }`. */
function docx(parts) {
  const dir = tempDir("doc-kit-docx-");
  folders.push(dir);
  const src = path.join(dir, "src");
  for (const [name, text] of Object.entries(parts)) {
    fs.mkdirSync(path.dirname(path.join(src, name)), { recursive: true });
    fs.writeFileSync(path.join(src, name), text);
  }
  const file = path.join(dir, "doc.docx");
  zipFolder(src, file, "");
  return fs.readFileSync(file);
}

/**
 * A ZIP archive built byte by byte, every field overridable to make it malicious: entries `{ name, data, method,
 * flags, crc, size, compressed, body, localName }`, options `{ count, disk, zip64Locator, comment }`.
 */
function makeZip(entries, { count, disk = 0, zip64Locator = false, comment = "" } = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data ?? "");
    const method = e.method ?? 8;
    const body = e.body ?? (method === 8 ? zlib.deflateRawSync(data) : data);
    const name = Buffer.from(e.name);
    const localName = Buffer.from(e.localName ?? e.name);
    const fields = {
      flags: e.flags ?? 0,
      method,
      crc: e.crc ?? crc32(data),
      compressed: e.compressed ?? body.length,
      size: e.size ?? data.length,
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(fields.flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(fields.crc, 14);
    local.writeUInt32LE(fields.compressed, 18);
    local.writeUInt32LE(fields.size, 22);
    local.writeUInt16LE(localName.length, 26);
    chunks.push(local, localName, body);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(fields.flags, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(fields.crc, 16);
    record.writeUInt32LE(fields.compressed, 20);
    record.writeUInt32LE(fields.size, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(e.local ?? offset, 42);
    central.push(record, name);
    offset += local.length + localName.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const locator = Buffer.alloc(zip64Locator ? 20 : 0);
  if (zip64Locator) locator.writeUInt32LE(0x07064b50, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(disk, 4);
  end.writeUInt16LE(count ?? entries.length, 8);
  end.writeUInt16LE(count ?? entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...chunks, ...central, locator, end, Buffer.from(comment)]);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS = `${W} xmlns:r="urn:r" xmlns:mc="urn:mc" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:v="urn:v"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const run = (text, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (body, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${body}</w:p>`;
const cell = (body, tcPr = "") => `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ""}${body}</w:tc>`;
const documentXml = (body) => `${DECL}<w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`;

const STYLES = `${DECL}<w:styles ${W}>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="Heading2"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="TitreAnnexe"><w:name w:val="Annex title"/><w:basedOn w:val="Titre1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Listepuces"><w:name w:val="List Bullet"/>
    <w:pPr><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:style>
  <w:style w:type="character" w:styleId="Titre1Car"><w:name w:val="Titre 1 Car"/></w:style>
</w:styles>`;

const REALISTIC = documentXml(
  [
    para(run("Architecture technique"), '<w:pStyle w:val="Titre1"/>'),
    para(run("The ") + run("API", "<w:b/>") + run(" serves &lt;clients&gt; &amp; partners.")),
    para(run("1.1") + "<w:r><w:tab/><w:t>Components</w:t></w:r>", '<w:pStyle w:val="Titre2"/><w:rPr><w:b/></w:rPr>'),
    para(
      run("Front end"),
      '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
    ),
    para(run("React"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'),
    para(run("Back end"), '<w:pStyle w:val="Listepuces"/>'),
    para(run("Not a list item"), '<w:pStyle w:val="Listepuces"/><w:numPr><w:numId w:val="0"/></w:numPr>'),
    "<w:p/><w:p/><w:p></w:p>",
    para(
      run("See ") +
        '<w:hyperlink r:id="rId5">' +
        run("the wiki") +
        "</w:hyperlink>" +
        run(".") +
        '<w:r><w:br/><w:t>Second line</w:t><w:br w:type="page"/></w:r>',
    ),
    para(
      '<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="a description"/><a:graphic/></wp:inline></w:drawing></w:r>' +
        run(" Figure 1"),
    ),
    para(
      '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor/></w:drawing></mc:Choice>' +
        "<mc:Fallback><w:pict><v:rect><v:textbox><w:txbxContent>" +
        para(run("duplicate text box")) +
        "</w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback></mc:AlternateContent></w:r>",
    ),
    "<w:tbl><w:tblPr/><w:tblGrid/>",
    "<w:tr>" + cell(para(run("Component", "<w:b/>"))) + cell(para(run("Role"))) + cell(para(run("Notes"))) + "</w:tr>",
    "<w:tr>" +
      cell(para(run("API"))) +
      cell(para(run("REST | JSON")) + para(run("port 443"))) +
      cell("<w:p/>") +
      "</w:tr>",
    "<w:tr>" + cell(para(run("Database")), '<w:gridSpan w:val="2"/>') + "</w:tr>",
    "<w:tr>" +
      cell(
        para(run("Nested")) +
          "<w:tbl><w:tr>" +
          cell(para(run("inner a"))) +
          cell(para("<w:r><w:t>inner</w:t><w:br/><w:t>b</w:t></w:r>")) +
          "</w:tr></w:tbl>",
      ) +
      "</w:tr>",
    "</w:tbl>",
    para(run("Deployment"), '<w:outlineLvl w:val="2"/>'),
    para(run("Annex"), '<w:pStyle w:val="TitreAnnexe"/>'),
    para(run("Body text"), '<w:pStyle w:val="Titre1"/><w:outlineLvl w:val="9"/>'),
    para(
      run("Kept ") +
        '<w:del w:id="1"><w:r><w:delText>removed</w:delText></w:r></w:del>' +
        '<w:ins w:id="2">' +
        run("inserted") +
        "</w:ins>" +
        '<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://example.test" </w:instrText></w:r>' +
        run(", not bold", '<w:b w:val="0"/>'),
    ),
    para(run("Plain"), '<w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs>'),
  ].join("\n"),
);

const REALISTIC_MARKDOWN = `# Architecture technique

The **API** serves &lt;clients> & partners.

## 1.1 Components

- Front end
  - React
- Back end

Not a list item

See the wiki.
Second line

[image] Figure 1

[image]

| Component | Role | Notes |
| --- | --- | --- |
| API | REST \\| JSON<br>port 443 |  |
| Database |  |  |
| Nested<br>inner a<br>inner b |  |  |

### Deployment

# Annex

Body text

Kept inserted, not bold

Plain
`;

describe("Word (.docx) to Markdown", () => {
  test("a realistic document: headings, paragraphs, lists, bold, hyperlink, images, table", () => {
    const r = docxToMarkdown(docx({ "word/document.xml": REALISTIC, "word/styles.xml": STYLES }));
    assert.equal(r.markdown, REALISTIC_MARKDOWN);
    assert.deepEqual(r.headings, [
      { level: 1, text: "Architecture technique" },
      { level: 2, text: "1.1 Components" },
      { level: 3, text: "Deployment" },
      { level: 1, text: "Annex" },
    ]);
    assert.equal(r.tables, 1);
    assert.equal(r.images, 2, "a drawing and its mc:Fallback copy count once, plus the inline picture");
  });

  test("without styles.xml, a style id shaped like a heading (Heading1, titre2) still counts", () => {
    const body = [
      para(run("First"), '<w:pStyle w:val="Heading1"/>'),
      para(run("Second"), '<w:pStyle w:val="titre2"/>'),
      para(run("Deep"), '<w:pStyle w:val="Heading9"/>'),
      para(run("Title-like"), '<w:pStyle w:val="Heading10"/>'),
    ].join("");
    const r = docxToMarkdown(docx({ "word/document.xml": documentXml(body) }));
    assert.equal(r.markdown, "# First\n\n## Second\n\n###### Deep\n\nTitle-like\n");
    assert.deepEqual(
      r.headings.map((h) => h.level),
      [1, 2, 6],
    );
  });

  test("a document without word/document.xml is refused (missingPart)", () => {
    refuses(() => docxToMarkdown(docx({ "word/styles.xml": STYLES })), "missingPart");
  });

  test("an entity declared by a DTD in document.xml is never expanded", () => {
    const xml = `${DECL}<!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<w:document ${NS}><w:body>${para(run("x &xxe; y"))}</w:body></w:document>`;
    assert.equal(docxToMarkdown(docx({ "word/document.xml": xml })).markdown, "x &xxe; y\n");
  });

  test("an empty document gives an empty text", () => {
    const r = docxToMarkdown(docx({ "word/document.xml": documentXml("<w:p/>") }));
    assert.deepEqual(r, { markdown: "", headings: [], tables: 0, images: 0 });
  });
});

describe("safe ZIP reader", () => {
  const DOC = "word/document.xml";
  const xml = documentXml(para(run("Hello")));

  test("reads the entries asked for, and only them; stored and deflated; a trailing comment is fine", () => {
    const zip = makeZip(
      [
        { name: DOC, data: xml },
        { name: "word/styles.xml", data: STYLES, method: 0 },
        { name: "word/media/big.bin", data: "x", size: 1024 ** 3, compressed: 1, crc: 0 },
      ],
      { comment: "made by hand" },
    );
    const parts = readZipEntries(zip, { names: [DOC, "word/styles.xml", "absent.xml"] });
    assert.deepEqual([...parts.keys()], [DOC, "word/styles.xml"]);
    assert.equal(parts.get(DOC).toString("utf8"), xml);
    assert.equal(parts.get("word/styles.xml").toString("utf8"), STYLES);
    assert.equal(readZipEntries(zip).size, 0, "nothing asked, nothing inflated (the bogus entry is never read)");
    assert.equal(docxToMarkdown(zip).markdown, "Hello\n");
  });

  test("not a ZIP archive: refused (notZip)", () => {
    refuses(() => readZipEntries(Buffer.from("this is plain text, not an archive at all")), "notZip");
    refuses(() => readZipEntries(Buffer.alloc(0)), "notZip");
    refuses(
      () => docxToMarkdown(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(600).fill(0)])),
      "notZip",
    );
  });

  test("an encrypted entry: refused (encrypted)", () => {
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml, flags: 1 }]), { names: [DOC] }), "encrypted");
  });

  test("a compression method other than stored and deflate: refused (method)", () => {
    refuses(
      () =>
        readZipEntries(makeZip([{ name: DOC, data: xml, method: 12, body: Buffer.from("BZh9") }]), { names: [DOC] }),
      "method",
    );
  });

  test("more entries than the limit: refused before any is read (tooManyEntries)", () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({ name: `f${i}.txt`, data: "x" }));
    refuses(
      () => readZipEntries(makeZip(entries), { names: [], limits: { ...ZIP_LIMITS, maxEntries: 3 } }),
      "tooManyEntries",
    );
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml }], { count: 20000 })), "tooManyEntries");
  });

  test("an entry declaring 1 GB, or entries over the total: refused (tooLarge)", () => {
    const zip = makeZip([{ name: DOC, data: xml, size: 1024 ** 3, compressed: 10 * 1024 * 1024 }]);
    refuses(() => readZipEntries(zip, { names: [DOC] }), "tooLarge");
    const two = makeZip([
      { name: "a.xml", data: "a".repeat(3000) },
      { name: "b.xml", data: "b".repeat(3000) },
    ]);
    const limits = { ...ZIP_LIMITS, maxTotalBytes: 5000 };
    refuses(() => readZipEntries(two, { names: ["a.xml", "b.xml"], limits }), "tooLarge");
    assert.equal(readZipEntries(two, { names: ["a.xml"], limits }).size, 1, "one of them stays within the total");
  });

  test("a ZIP bomb (an entry far bigger once uncompressed): refused before it is inflated (ratio)", () => {
    const zeros = Buffer.alloc(50 * 1024 * 1024);
    const bomb = makeZip([{ name: DOC, data: zeros, body: zlib.deflateRawSync(zeros, { level: 9 }), crc: 0 }]);
    refuses(() => readZipEntries(bomb, { names: [DOC] }), "ratio");
    refuses(() => docxToMarkdown(bomb), "ratio");
    const text = Buffer.from("abc ".repeat(4000));
    const limits = { ...ZIP_LIMITS, maxRatio: 10 };
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: text }]), { names: [DOC], limits }), "ratio");
  });

  test("a size that does not match the inflated data, either way: refused (corrupt)", () => {
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml, size: 10 }]), { names: [DOC] }), "corrupt");
    refuses(
      () => readZipEntries(makeZip([{ name: DOC, data: xml, size: xml.length + 7 }]), { names: [DOC] }),
      "corrupt",
    );
    refuses(
      () => readZipEntries(makeZip([{ name: DOC, data: "abc", method: 0, size: 5 }]), { names: [DOC] }),
      "corrupt",
    );
  });

  test("a CRC-32 that does not match: refused (corrupt)", () => {
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml, crc: 0x12345678 }]), { names: [DOC] }), "corrupt");
  });

  test("data that does not inflate: refused (corrupt)", () => {
    refuses(
      () =>
        readZipEntries(makeZip([{ name: DOC, data: xml, body: Buffer.from("not deflate data") }]), { names: [DOC] }),
      "corrupt",
    );
  });

  test("ZIP64 markers: refused (zip64)", () => {
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml, size: 0xffffffff }]), { names: [DOC] }), "zip64");
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml }], { count: 0xffff })), "zip64");
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml }], { zip64Locator: true })), "zip64");
  });

  test("a local header that does not match its central record, a duplicate name, several disks: refused (corrupt)", () => {
    refuses(
      () => readZipEntries(makeZip([{ name: DOC, data: xml, localName: "word/documenX.xml" }]), { names: [DOC] }),
      "corrupt",
    );
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml, local: 1_000_000 }]), { names: [DOC] }), "corrupt");
    const twice = makeZip([
      { name: DOC, data: xml },
      { name: DOC, data: documentXml(para(run("other"))) },
    ]);
    refuses(() => readZipEntries(twice, { names: [DOC] }), "corrupt");
    refuses(() => readZipEntries(makeZip([{ name: DOC, data: xml }], { disk: 1 })), "corrupt");
  });

  test("a central directory cut short: refused (corrupt)", () => {
    const zip = makeZip([{ name: DOC, data: xml }]);
    const end = zip.length - 22;
    const broken = Buffer.from(zip);
    broken.writeUInt32LE(zip.readUInt32LE(end + 12) + 50, end + 12); // central directory size past the record
    refuses(() => readZipEntries(broken, { names: [DOC] }), "corrupt");
  });
});

describe("linear XML reader", () => {
  /** The events of a walk, as strings. */
  const events = (xml, limits) => {
    const out = [];
    walkXml(
      xml,
      {
        open: (name, attrs) =>
          out.push(
            `<${name}${Object.entries(attrs)
              .map(([k, v]) => ` ${k}=${v}`)
              .join("")}>`,
          ),
        close: (name) => out.push(`</${name}>`),
        text: (t) => out.push(t),
      },
      limits,
    );
    return out;
  };

  test("elements, attributes (either quote, > inside a value), empty elements, CDATA, comments, PIs", () => {
    const xml = `<?xml version="1.0"?><!-- head --><a x="1 &amp; 2" y='a > b'><b/>t&lt;e<![CDATA[<raw>&amp;]]><?pi x?></a>`;
    assert.deepEqual(events(xml), ["<a x=1 & 2 y=a > b>", "<b>", "</b>", "t<e", "<raw>&amp;", "</a>"]);
  });

  test("an internal DTD (XXE, billion laughs) is skipped: no entity is ever expanded", () => {
    const laughs = Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i};`.repeat(10)}">`).join("\n");
    const xml = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
  <!ENTITY lol0 "lol">
  ${laughs}
  <!-- a comment with ] and > inside -->
  <?pi with ] and > ?>
  <!ATTLIST foo a CDATA "x]>">
]>
<foo a="&lol9;">&xxe;&lol9;</foo>`;
    const start = performance.now();
    assert.deepEqual(events(xml), ["<foo a=&lol9;>", "&xxe;&lol9;", "</foo>"]);
    assert.ok(performance.now() - start < 200, "finishes at once");
  });

  test("the predefined entities and valid numeric references are decoded, anything else stays literal", () => {
    assert.equal(
      decodeEntities("&#65;&#x42;&#x1F600;&amp;&lt;&gt;&quot;&apos;&#0;&#xD800;&#x110000;&bogus;&#;&#x;& a;&amp"),
      "AB😀&<>\"'&#0;&#xD800;&#x110000;&bogus;&#;&#x;& a;&amp",
    );
    assert.equal(decodeEntities("&".repeat(10000)).length, 10000);
  });

  test("unbalanced, unterminated or malformed: refused (xml)", () => {
    for (const xml of [
      "<a><b></a></b>",
      "<a>",
      "</a>",
      "<a><!-- never closed </a>",
      '<a b="1></a>',
      "<a b=1></a>",
      "<a <b>></a>",
      "<a><![CDATA[x</a>",
      "<!DOCTYPE a [ <!ENTITY x 'never closed",
    ])
      refuses(() => events(xml), "xml");
  });

  test("deeper than maxDepth, or more elements than maxNodes: refused (xml)", () => {
    const deep = "<a>".repeat(300) + "</a>".repeat(300);
    refuses(() => events(deep), "xml");
    assert.equal(events(deep, { maxDepth: 400 }).length, 600);
    refuses(() => events(`<r>${"<x/>".repeat(10)}</r>`, { maxNodes: 5 }), "xml");
  });

  test("text from a document is made inert: no HTML tag, comment or declaration survives", () => {
    assert.equal(
      inertMarkup("a < b, <script>x</script> <!-- c --> <?php ?> <é>"),
      "a < b, &lt;script>x&lt;/script> &lt;!-- c --> &lt;?php ?> &lt;é>",
    );
  });

  test("an attribute named __proto__ never reaches the prototype", () => {
    const seen = [];
    walkXml('<a __proto__="x" b="y"/>', { open: (name, attrs) => seen.push(attrs) });
    assert.equal(Object.getPrototypeOf(seen[0]), Object.prototype);
    assert.deepEqual(Object.keys(seen[0]), ["b"]);
  });
});

describe("diagrams to components and links", () => {
  const MODEL = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="2" value="&lt;b&gt;Web&lt;/b&gt;&lt;br&gt;app" style="rounded=1;html=1;" vertex="1" parent="1">
    <mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="3" value="API &amp;amp; jobs" vertex="1" parent="1"/>
  <UserObject label="Database" id="4"><mxCell style="shape=cylinder" vertex="1" parent="1"/></UserObject>
  <mxCell id="5" value="HTTPS" edge="1" source="2" target="3" parent="1"/>
  <mxCell id="6" edge="1" source="3" target="4" parent="1"/>
  <mxCell id="7" value="SQL" style="edgeLabel" vertex="1" connectable="0" parent="6"/>
  <mxCell id="8" edge="1" source="3" parent="1"/>
  <mxCell id="9" vertex="1" parent="1"/>
</root></mxGraphModel>`;

  test("draw.io, plain: vertices by their label (HTML removed), edges with their label or label cell", () => {
    const r = diagramToMarkdown(
      `<mxfile host="x"><diagram id="p1" name="Page-1">${MODEL}</diagram></mxfile>`,
      "drawio",
    );
    assert.deepEqual(r.components, ["Web app", "API & jobs", "Database"]);
    assert.deepEqual(r.links, [
      { from: "Web app", to: "API & jobs", label: "HTTPS" },
      { from: "API & jobs", to: "Database", label: "SQL" },
    ]);
    assert.equal(
      r.markdown,
      "## Components\n\n- Web app\n- API & jobs\n- Database\n\n## Links\n\n- Web app → API & jobs (HTTPS)\n- API & jobs → Database (SQL)\n",
    );
  });

  test("draw.io, compressed pages (base64, raw deflate, URI encoding), page ids kept apart", () => {
    const page2 = `<mxGraphModel><root><mxCell id="0"/><mxCell id="2" value="Queue" vertex="1" parent="0"/>
      <mxCell id="3" value="Worker" vertex="1" parent="0"/><mxCell id="4" edge="1" source="2" target="3"/></root></mxGraphModel>`;
    const packed = zlib.deflateRawSync(Buffer.from(encodeURIComponent(page2))).toString("base64");
    const file = `<mxfile><diagram id="a" name="One">${MODEL}</diagram><diagram id="b" name="Two">${packed}</diagram></mxfile>`;
    const r = diagramToMarkdown(file, "drawio");
    assert.deepEqual(r.components, ["Web app", "API & jobs", "Database", "Queue", "Worker"]);
    assert.deepEqual(r.links.at(-1), { from: "Queue", to: "Worker" });
    assert.equal(diagramToMarkdown(MODEL, "drawio").components.length, 3, "a bare mxGraphModel");
  });

  test("draw.io that does not decode, or inflates past 16 MB: refused", () => {
    refuses(
      () => diagramToMarkdown('<mxfile><diagram name="x">not base64 at all!</diagram></mxfile>', "drawio"),
      "xml",
    );
    const notUri = zlib.deflateRawSync(Buffer.from("%E0%A4%A")).toString("base64");
    refuses(() => diagramToMarkdown(`<mxfile><diagram>${notUri}</diagram></mxfile>`, "drawio"), "xml");
    const bomb = zlib.deflateRawSync(Buffer.alloc(17 * 1024 * 1024, 65)).toString("base64");
    refuses(() => diagramToMarkdown(`<mxfile><diagram>${bomb}</diagram></mxfile>`, "drawio"), "tooLarge");
    refuses(() => diagramToMarkdown("<mxfile><diagram>", "drawio"), "xml");
  });

  test("PlantUML: declarations (aliases, [Name], quoted), links with heads, hints, labels; comments and hidden links left out", () => {
    const text = `@startuml
' a comment --> with an arrow
/' a block
   comment A --> B '/
!include https://example.test/style.puml
actor "Customer" as C
component [Web App] as web
[API Gateway] as gw
node server {
database "Orders DB" as db
}
queue Events
participant Bob
C --> web : uses
web -right-> gw : HTTPS
gw ..> db : SQL\\nwrite
db <-- Events
gw -[#red,dashed]-> Events
gw -[hidden]-> C
Bob -> Alice : hello
Order "1" *-- "many" Line : contains
@enduml
not read -> after the end`;
    const r = diagramToMarkdown(text, "puml");
    assert.deepEqual(r.components, [
      "Customer",
      "Web App",
      "API Gateway",
      "server",
      "Orders DB",
      "Events",
      "Bob",
      "Alice",
      "Order",
      "Line",
    ]);
    assert.deepEqual(r.links, [
      { from: "Customer", to: "Web App", label: "uses" },
      { from: "Web App", to: "API Gateway", label: "HTTPS" },
      { from: "API Gateway", to: "Orders DB", label: "SQL write" },
      { from: "Events", to: "Orders DB" },
      { from: "API Gateway", to: "Events" },
      { from: "Bob", to: "Alice", label: "hello" },
      { from: "Order", to: "Line", label: "contains" },
    ]);
  });

  test("C4-PlantUML macros are read like Mermaid C4", () => {
    const text = `@startuml
!include <C4/C4_Container>
Person(user, "User")
Container(api, "API", "Node.js")
Rel(user, api, "Calls", "HTTPS")
@enduml`;
    const r = diagramToMarkdown(text, "puml");
    assert.deepEqual(r.components, ["User", "API"]);
    assert.deepEqual(r.links, [{ from: "User", to: "API", label: "Calls" }]);
  });

  test("Mermaid flowchart: node shapes, edges (-->, ---, -.->, ==>, ~~~), |label| and -- label -->, &", () => {
    const text = `---
title: Shop
---
%% a comment --> with an arrow
flowchart LR
  user((Customer)) -->|browses| web[Web app]
  web --> api{{API}}
  api -- reads --> db[(Orders DB)]
  api -.-> cache([Cache]) & queue>Queue]
  queue ==> worker["Worker (jobs)"];
  worker ~~~ web
  db --- backup[/Backup/]
  subgraph Back
  end
  classDef red fill:#f00
  click api "https://example.test"`;
    const r = diagramToMarkdown(text, "mermaid");
    assert.deepEqual(r.components, [
      "Customer",
      "Web app",
      "API",
      "Orders DB",
      "Cache",
      "Queue",
      "Worker (jobs)",
      "Backup",
    ]);
    assert.deepEqual(r.links, [
      { from: "Customer", to: "Web app", label: "browses" },
      { from: "Web app", to: "API" },
      { from: "API", to: "Orders DB", label: "reads" },
      { from: "API", to: "Cache" },
      { from: "API", to: "Queue" },
      { from: "Queue", to: "Worker (jobs)" },
      { from: "Orders DB", to: "Backup" },
    ]);
    assert.deepEqual(diagramToMarkdown("graph TD; A[One] --> B[Two];", "mermaid").links, [{ from: "One", to: "Two" }]);
  });

  test("Mermaid C4: elements (boundaries are only groups) and relations (Rel_Back reversed, BiRel)", () => {
    const text = `C4Context
  title System Context
  Person(customer, "Banking Customer", "A customer of the bank")
  Enterprise_Boundary(b0, "Bank") {
    System(banking, "Internet Banking", "Lets customers view accounts")
    SystemDb_Ext(mainframe, "Mainframe")
  }
  Rel(customer, banking, "Uses")
  Rel_Back(mainframe, banking, "Reads from", "XML/HTTPS")
  BiRel(banking, mainframe, "Syncs")
  UpdateRelStyle(customer, banking, $offsetY="-40")`;
    const r = diagramToMarkdown(text, "mermaid");
    assert.deepEqual(r.components, ["Banking Customer", "Internet Banking", "Mainframe"]);
    assert.deepEqual(r.links, [
      { from: "Banking Customer", to: "Internet Banking", label: "Uses" },
      { from: "Internet Banking", to: "Mainframe", label: "Reads from" },
      { from: "Internet Banking", to: "Mainframe", label: "Syncs" },
    ]);
  });

  test("another Mermaid type gives no component and a note", () => {
    const r = diagramToMarkdown("sequenceDiagram\n  Alice->>Bob: hi", "mermaid");
    assert.deepEqual([r.components, r.links], [[], []]);
    assert.match(r.markdown, /No component found\.[\s\S]*Mermaid diagram of type “sequenceDiagram”: not read\./);
  });

  test("bounded: at most 2000 components and 5000 links, and the lists say so", () => {
    const chain = Array.from({ length: 2100 }, (_, i) => `n${i}`).join(" --> ");
    const r = diagramToMarkdown(`graph LR\n${chain}`, "mermaid");
    assert.equal(r.components.length, 2000);
    assert.match(r.markdown, /The list stops at 2000 components\./);
    const side = (p) => Array.from({ length: 80 }, (_, i) => `${p}${i}`).join(" & ");
    const wide = diagramToMarkdown(`graph LR\n${side("a")} --> ${side("b")}`, "mermaid");
    assert.equal(wide.links.length, 5000);
    assert.match(wide.markdown, /The list stops at 5000 links\./);
  });

  test("no HTML of a diagram reaches the Markdown", () => {
    const r = diagramToMarkdown('@startuml\ncomponent "<script>alert(1)</script>" as x\n@enduml', "puml");
    assert.equal(r.components[0], "<script>alert(1)</script>");
    assert.match(r.markdown, /- &lt;script>alert\(1\)&lt;\/script>/);
  });
});

describe("PDF index", () => {
  const pdf = (body) => Buffer.from(`%PDF-1.4\n%âãÏÓ\n${body}\n%%EOF\n`, "latin1");
  const MINIMAL = `1 0 obj << /Type /Catalog /Pages 2 0 R /Outlines 9 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj
4 0 obj << /Type /Page /Parent 2 0 R >> endobj
5 0 obj << /Type/Page/Parent 2 0 R >> endobj
6 0 obj << /Length 48 >> stream
BT /F1 24 Tf (<< /Type /Pages /Count 99 >>) Tj ET
endstream endobj
8 0 obj << /Title (Chapter 1) /Parent 9 0 R /Dest [3 0 R /Fit] >> endobj
10 0 obj << /Title (Architecture \\(v2\\)) /Producer (Test) /Author (Me) >> endobj
trailer << /Size 11 /Root 1 0 R /Info 10 0 R >>
startxref 0`;

  test("pages from the root of the page tree, title from the information dictionary", () => {
    assert.deepEqual(pdfIndex(pdf(MINIMAL)), { pages: 3, encrypted: false, title: "Architecture (v2)" });
  });

  test("the largest /Count of a page tree; else the linearization; else the /Type /Page dictionaries", () => {
    const tree =
      "1 0 obj << /Type /Pages /Kids [2 0 R] /Count 10 >> endobj 2 0 obj << /Type /Pages /Parent 1 0 R /Count 4 >> endobj";
    assert.equal(pdfIndex(pdf(tree)).pages, 10);
    assert.equal(pdfIndex(pdf("1 0 obj << /Linearized 1 /L 5000 /N 12 /T 400 >> endobj")).pages, 12);
    const pages =
      "1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] >> endobj 2 0 obj << /Type /Page >> endobj 3 0 obj << /Type /Page >> endobj";
    assert.equal(pdfIndex(pdf(pages)).pages, 2);
    assert.deepEqual(pdfIndex(pdf("1 0 obj << /Type /ObjStm /N 5 >> stream\nxx\nendstream endobj")), {
      pages: null,
      encrypted: false,
      title: null,
    });
  });

  test("an encrypted PDF: encrypted, and its title (ciphertext) is not read", () => {
    const body = `1 0 obj << /Type /Pages /Count 2 >> endobj
3 0 obj << /Title (x7\\223k) /Producer (y) >> endobj
4 0 obj << /Filter /Standard /V 2 /R 3 /O <0011> /U <2233> /P -1028 >> endobj
trailer << /Size 5 /Root 1 0 R /Encrypt 4 0 R /Info 3 0 R >>`;
    assert.deepEqual(pdfIndex(pdf(body)), { pages: 2, encrypted: true, title: null });
  });

  test("a title that is not plain ASCII is not read", () => {
    assert.equal(pdfIndex(pdf("1 0 obj << /Title <FEFF00410042> /Producer (x) >> endobj")).title, null);
    assert.equal(pdfIndex(pdf("1 0 obj << /Title (Caf\\351) /Producer (x) >> endobj")).title, null);
    assert.equal(pdfIndex(pdf("1 0 obj << /Title (Café) /Producer (x) >> endobj")).title, null);
  });

  test("a big file: only its first and last megabyte are read", () => {
    const head = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Pages /Count 7 >> endobj\n", "latin1");
    const middle = Buffer.from(`\n2 0 obj << /Type /Pages /Count 999 >> endobj\n${"x ".repeat(1024 * 1024)}`, "latin1");
    const tail = Buffer.from("\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF\n", "latin1");
    const filler = Buffer.alloc(1024 * 1024, 32);
    assert.deepEqual(pdfIndex(Buffer.concat([head, filler, middle, filler, tail])), {
      pages: 7,
      encrypted: true,
      title: null,
    });
  });

  test("not a PDF: refused (notPdf); a header after a little garbage is accepted", () => {
    refuses(() => pdfIndex(Buffer.from("PK\u0003\u0004 not a pdf")), "notPdf");
    refuses(() => pdfIndex(Buffer.concat([Buffer.alloc(2000, 32), Buffer.from("%PDF-1.4")])), "notPdf");
    assert.equal(pdfIndex(Buffer.from(`garbage\n%PDF-1.4\n${MINIMAL}`, "latin1")).pages, 3);
  });
});

test("every reason of a refusal has its message, in English and in French", () => {
  const reasons = ["notZip", "zip64", "encrypted", "method", "tooManyEntries", "tooLarge", "ratio", "corrupt"];
  reasons.push("missingPart", "xml", "notPdf");
  for (const language of ["en", "fr"]) {
    const dictionary = loadDictionary(language);
    for (const reason of reasons) assert.ok(dictionary[`cli.inputs.reason.${reason}`], `${language}: ${reason}`);
  }
});
