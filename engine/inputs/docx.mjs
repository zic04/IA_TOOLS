// Word (.docx) to Markdown for the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): the
// technical architecture document a team already has becomes text the documentation agents read. Only two parts
// of the archive are read, through the bounded ZIP reader (zip.mjs) and the linear XML reader (engine/core/xml.mjs):
// word/document.xml (required) and word/styles.xml (when present). Nothing of the document is executed or
// expanded: no macro, no embedded object, no external relationship, no entity.
//   - Headings: a paragraph whose style is named "heading N" / "Titre N" (any case, with or without a space,
//     through styles.xml, its `basedOn` chain included), or a style id of that shape, or an outline level `k`
//     (level k + 1); capped at 6.
//   - Paragraphs: the text of their runs (`w:t`), tabs and line breaks; bold runs as **…**; hyperlinks as their
//     text; a numbered or bulleted paragraph as a "- " item (indented by its level); a drawing, a picture or an
//     embedded object as [image], counted.
//   - Tables: a Markdown table, its first row as header, the paragraphs of a cell joined by <br>, `|` escaped,
//     ragged rows padded, a nested table flattened into the text of its cell.
//   - Text only: a `<` that could open an HTML tag is written `&lt;` (inertMarkup), so no HTML of the document
//     reaches a page. The deleted and moved-from text of tracked changes, and the fallback copy of an
//     mc:AlternateContent, are left out.
import { KitError, EXIT } from "../project/errors.mjs";
import { readZipEntries } from "./zip.mjs";
import { walkXml, inertMarkup } from "../core/xml.mjs";

const DOCUMENT = "word/document.xml";
const STYLES = "word/styles.xml";
const MAX_LEVEL = 6;
/** How far a `basedOn` chain of styles is followed (a loop in it stops there). */
const MAX_BASED_ON = 10;
const OFF = new Set(["0", "false", "off"]);
/** Breaks that are page layout, not a line break of the text. */
const LAYOUT_BREAKS = new Set(["page", "column"]);
/** Elements counted as one image, whose content is not read. */
const IMAGES = new Set(["w:drawing", "w:pict", "w:object"]);
/** A table is at most this wide (cells of a row, spans included) and this big: beyond, the document is refused. */
const MAX_COLUMNS = 64;
const MAX_TABLE_CELLS = 200_000;
/** The Markdown of a document is at most this long (characters): beyond, it is refused rather than built. */
const MAX_MARKDOWN = 16 * 1024 * 1024;
const tooLarge = () => new KitError(EXIT.CHECK, "inputs.refused", { reason: "tooLarge" });
/** Elements whose content is not the text of the document: removed or duplicated text. */
const SKIPPED = new Set(["mc:Fallback", "w:del", "w:moveFrom"]);

/** The text of a part, without its byte order mark. */
const utf8 = (buf) => {
  const text = buf.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
/** Whitespace (tabs and line breaks included) collapsed to single spaces, trimmed. */
const squash = (s) => s.replaceAll("\t", " ").replaceAll("\n", " ").split(" ").filter(Boolean).join(" ");

/** The heading level a style name or id says ("heading 1", "Heading1", "Titre 2", any case), or null. */
function levelFromName(name) {
  const s = String(name || "")
    .toLowerCase()
    .split(" ")
    .join("");
  for (const prefix of ["heading", "titre"]) {
    const n = s.length === prefix.length + 1 && s.startsWith(prefix) ? Number(s[prefix.length]) : 0;
    if (n >= 1 && n <= 9) return Math.min(n, MAX_LEVEL);
  }
  return null;
}

/** The heading level of an outline level `w:val` (0 → 1 … 8 → 6, 9 is body text), or null. */
function outlineLevel(value) {
  if (value === null || value === undefined || value === "") return null;
  const k = Number(value);
  return Number.isInteger(k) && k >= 0 && k <= 8 ? Math.min(k + 1, MAX_LEVEL) : null;
}

/**
 * The paragraph styles of styles.xml: `id → { level, list }` (level: the heading level its name, its outline level
 * or the style it is based on gives, or null; list: it numbers its paragraphs).
 * @param {string} xml
 * @returns {Map<string, { level: number|null, list: boolean }>}
 */
function readStyles(xml) {
  const raw = new Map();
  const path = [];
  let style = null;
  walkXml(xml, {
    open(name, attrs) {
      const parent = path[path.length - 1];
      path.push(name);
      if (name === "w:style") {
        style = { name: null, outline: null, basedOn: null, list: false };
        if (attrs["w:styleId"]) raw.set(attrs["w:styleId"], style);
      } else if (!style) return;
      else if (name === "w:name") style.name = attrs["w:val"];
      else if (name === "w:basedOn") style.basedOn = attrs["w:val"];
      else if (name === "w:outlineLvl" && parent === "w:pPr") style.outline = attrs["w:val"];
      else if (name === "w:numId" && parent === "w:numPr") style.list = attrs["w:val"] !== "0";
    },
    close(name) {
      path.pop();
      if (name === "w:style") style = null;
    },
  });
  const level = (id, hops) => {
    const s = raw.get(id);
    if (!s || hops > MAX_BASED_ON) return null;
    return levelFromName(s.name) ?? outlineLevel(s.outline) ?? (s.basedOn ? level(s.basedOn, hops + 1) : null);
  };
  return new Map([...raw].map(([id, s]) => [id, { level: level(id, 0), list: s.list }]));
}

/** Adds text to the paragraph being read (bold when its run is). */
function add(s, text, bold = Boolean(s.run?.bold)) {
  if (s.para) s.para.parts.push({ text, bold });
}

/** The text of a paragraph's parts, consecutive parts of the same weight merged; bold ones as **…** if `bold`. */
function inlineText(parts, bold) {
  const groups = [];
  for (const p of parts) {
    const last = groups[groups.length - 1];
    if (last && last.bold === p.bold) last.text += p.text;
    else groups.push({ ...p });
  }
  const emphasise = (text) => {
    const core = text.trim();
    if (!core) return text;
    const lead = text.indexOf(core);
    return `${text.slice(0, lead)}**${core}**${text.slice(lead + core.length)}`;
  };
  return inertMarkup(groups.map((g) => (bold && g.bold ? emphasise(g.text) : g.text)).join(""));
}

/** The block of a paragraph outside a table: a heading, a list item or a paragraph; null when it is empty. */
function paragraphBlock(p, styles) {
  const style = p.style ? styles.get(p.style) : undefined;
  const level = p.outline !== null ? outlineLevel(p.outline) : style ? style.level : levelFromName(p.style);
  if (level) {
    const title = squash(inlineText(p.parts, false));
    return title ? { kind: "heading", level, title, text: `${"#".repeat(level)} ${title}` } : null;
  }
  const text = inlineText(p.parts, true).trim();
  if (!text) return null;
  if (!(p.numbered ?? style?.list ?? false)) return { kind: "paragraph", text };
  const indent = "  ".repeat(p.ilvl);
  return { kind: "list", text: `${indent}- ${text.split("\n").join(`\n${indent}  `)}` };
}

/** Ends the paragraph being read: into the outer paragraph, the cell of a table, or the blocks of the document. */
function endParagraph(s) {
  const p = s.para;
  s.para = s.outer.pop() ?? null;
  if (!p) return;
  if (s.para)
    s.para.parts.push({ text: " ", bold: false }); // its text is already in the outer paragraph's parts
  else if (s.cell) {
    const line = squash(inlineText(p.parts, false));
    if (line) s.cell.push(line.replaceAll("|", "\\|"));
  } else {
    const block = paragraphBlock(p, s.styles);
    if (block?.kind === "heading") s.headings.push({ level: block.level, text: block.title });
    if (block) s.blocks.push(block);
  }
}

/** A Markdown table of rows of cell texts: the first row as header, every row padded to the widest. */
function tableMarkdown(rows) {
  const kept = rows.filter((r) => r.length);
  if (!kept.length) return "";
  const width = kept.reduce((n, r) => Math.max(n, r.length), 0);
  // Padding is the one thing a table adds to its text: bounded, so a table of empty cells cannot blow it up.
  if (width * kept.length > MAX_TABLE_CELLS) throw tooLarge();
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return [line(kept[0]), `|${" --- |".repeat(width)}`, ...kept.slice(1).map(line)].join("\n");
}

/** Paragraph-level properties (`w:pPr`) of the paragraph being read. */
function paragraphProperty(s, name, attrs, parent) {
  const p = s.para;
  if (!p) return;
  const value = attrs["w:val"] ?? null;
  if (parent === "w:pPr" && name === "w:pStyle") p.style = value;
  else if (parent === "w:pPr" && name === "w:outlineLvl") p.outline = value;
  else if (parent === "w:pPr" && name === "w:numPr") p.numbered = true;
  else if (parent === "w:numPr" && name === "w:numId" && value === "0") p.numbered = false;
  else if (parent === "w:numPr" && name === "w:ilvl") p.ilvl = clamp(Number(value) || 0, 0, 8);
}

/** The content of a run (`w:r`): its text, tabs, breaks and weight. */
function runContent(s, name, attrs, parent, grand) {
  if (name === "w:b") {
    if (parent === "w:rPr" && grand === "w:r" && s.run) s.run.bold = !OFF.has(attrs["w:val"]);
    return;
  }
  if (parent !== "w:r") return;
  if (name === "w:t") s.inText = true;
  else if (name === "w:tab") add(s, "\t");
  else if (name === "w:cr" || (name === "w:br" && !LAYOUT_BREAKS.has(attrs["w:type"]))) add(s, "\n");
  else if (name === "w:noBreakHyphen") add(s, "-");
}

/** Table structure: only the outermost table is a Markdown table, a nested one is text of its cell. */
function tableOpen(s, name, attrs, parent) {
  if (name === "w:tbl" && ++s.tableDepth === 1) s.rows = [];
  if (s.tableDepth !== 1) return;
  if (name === "w:tr") {
    s.row = [];
    s.rows.push(s.row);
  } else if (name === "w:tc") {
    s.cell = [];
    s.span = 1;
  } else if (name === "w:gridSpan" && parent === "w:tcPr") s.span = clamp(Number(attrs["w:val"]) || 1, 1, 64);
}

/** Ends a cell, a row or a table. */
function tableClose(s, name) {
  if (name === "w:tbl") {
    if (--s.tableDepth > 0) return;
    const text = tableMarkdown(s.rows || []);
    if (text) {
      s.blocks.push({ kind: "table", text });
      s.tables++;
    }
    s.rows = null;
  } else if (s.tableDepth !== 1) return;
  else if (name === "w:tr") s.row = null;
  else if (name === "w:tc" && s.cell) {
    if (s.row && s.row.length < MAX_COLUMNS) {
      const span = Math.min(s.span, MAX_COLUMNS - s.row.length);
      s.row.push(s.cell.join("<br>"), ...Array(span - 1).fill(""));
    }
    s.cell = null;
  }
}

const PARAGRAPH_PROPERTIES = new Set(["w:pStyle", "w:outlineLvl", "w:numPr", "w:numId", "w:ilvl"]);
const RUN_CONTENT = new Set(["w:b", "w:t", "w:tab", "w:br", "w:cr", "w:noBreakHyphen"]);
const TABLE = new Set(["w:tbl", "w:tr", "w:tc", "w:gridSpan"]);

/** What opening an element does. */
function onOpen(s, name, attrs, parent, grand) {
  if (name === "w:p") {
    // A paragraph inside another (a text box, a frame) adds its text to the same parts: never copied level by level.
    if (s.para) s.para.parts.push({ text: " ", bold: false });
    s.outer.push(s.para);
    s.para = { parts: s.para ? s.para.parts : [], style: null, outline: null, numbered: null, ilvl: 0 };
  } else if (name === "w:r") s.run = { bold: false };
  else if (PARAGRAPH_PROPERTIES.has(name)) paragraphProperty(s, name, attrs, parent);
  else if (RUN_CONTENT.has(name)) runContent(s, name, attrs, parent, grand);
  else if (TABLE.has(name)) tableOpen(s, name, attrs, parent);
}

/** What closing an element does. */
function onClose(s, name) {
  if (name === "w:t") s.inText = false;
  else if (name === "w:r") s.run = null;
  else if (name === "w:p") endParagraph(s);
  else if (TABLE.has(name)) tableClose(s, name);
}

/** The Markdown of the blocks: list items one per line, other blocks apart; runs of blank lines collapsed. */
function assemble(blocks) {
  const text = blocks
    .map((b, i) => (i === 0 ? "" : b.kind === "list" && blocks[i - 1].kind === "list" ? "\n" : "\n\n") + b.text)
    .join("");
  const lines = text.split("\n").map((l) => l.trimEnd());
  const kept = lines.filter((l, i) => l || (i > 0 && lines[i - 1]));
  const out = kept.join("\n").trim();
  return out ? `${out}\n` : "";
}

/**
 * The Markdown of a Word document (.docx), with its headings and the number of its tables and images.
 * @param {Buffer} buf   the .docx file
 * @returns {{ markdown: string, headings: Array<{ level: number, text: string }>, tables: number, images: number }}
 * @throws {KitError} "inputs.refused", { reason }: missingPart (no word/document.xml), xml, or a reason of the ZIP
 *   reader (zip.mjs)
 */
export function docxToMarkdown(buf) {
  const parts = readZipEntries(buf, { names: [DOCUMENT, STYLES] });
  if (!parts.has(DOCUMENT)) throw new KitError(EXIT.CHECK, "inputs.refused", { reason: "missingPart" });
  const styles = parts.has(STYLES) ? readStyles(utf8(parts.get(STYLES))) : new Map();
  // path: the open elements; skipAt: the depth of the element whose content is skipped (0: none); para: the
  // paragraph being read, outer: those it interrupts; rows, row, cell, span: the outermost table being read.
  const s = {
    styles,
    path: [],
    skipAt: 0,
    blocks: [],
    headings: [],
    tables: 0,
    images: 0,
    para: null,
    outer: [],
    run: null,
    inText: false,
    tableDepth: 0,
    rows: null,
    row: null,
    cell: null,
    span: 1,
  };
  walkXml(utf8(parts.get(DOCUMENT)), {
    open(name, attrs) {
      const parent = s.path[s.path.length - 1];
      const grand = s.path[s.path.length - 2];
      s.path.push(name);
      if (s.skipAt) return;
      if (IMAGES.has(name)) {
        s.images++;
        add(s, "[image]", false);
      }
      if (IMAGES.has(name) || SKIPPED.has(name)) s.skipAt = s.path.length;
      else onOpen(s, name, attrs, parent, grand);
    },
    close(name) {
      if (!s.skipAt) onClose(s, name);
      else if (s.skipAt === s.path.length) s.skipAt = 0;
      s.path.pop();
    },
    text(t) {
      if (s.inText && !s.skipAt) add(s, t);
    },
  });
  const markdown = assemble(s.blocks);
  if (markdown.length > MAX_MARKDOWN) throw tooLarge();
  return { markdown, headings: s.headings, tables: s.tables, images: s.images };
}
