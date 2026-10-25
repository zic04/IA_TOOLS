// The documents of the sources (ARCHITECTURE.md §6.19, `doc-kit inputs ingest`): each `documents[]` entry with a
// `file` becomes text the documentation agents read, in .doc-kit/inputs/docs/<slug>.md, listed in index.json.
//   - Word (.docx): headings, paragraphs, lists and tables as Markdown (docx.mjs: a bounded ZIP and XML reader that
//     never expands an entity nor runs a macro); diagrams (.drawio, .puml, .mmd): their components and links as text
//     (diagrams.mjs); PDF: indexed only (pdf.mjs: its pages), the agents read the file itself page by page;
//     Markdown and text: as they are, their HTML made inert (inertMarkup); HTML: its text.
//   - Every text goes through the secret filter of the project (engine/check/secrets.mjs) before it is written.
//   - A document is data, never instructions: the text starts with a notice that says so to the agent reading it.
//   - A document declared by its address (Confluence, SharePoint…) is not fetched by the kit: the skill reads it
//     through the connectors of the session, with the user's consent; it is listed as `external`.
import fs from "node:fs";
import path from "node:path";
import { KitError } from "../project/errors.mjs";
import { BRAND } from "../brand.mjs";
import { hashText } from "../core/hash.mjs";
import { inertMarkup } from "../core/xml.mjs";
import { detectors, ignoreRules, withoutSecrets } from "../check/secrets.mjs";
import { docxToMarkdown } from "./docx.mjs";
import { diagramToMarkdown } from "./diagrams.mjs";
import { pdfIndex } from "./pdf.mjs";
import { nameOf, pageFile, DOCS_DIR, INDEX_FILE, readIndex } from "./model.mjs";

/** A document is read whole: beyond this size it is refused (the agents read big PDFs page by page instead). */
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

/** The format of a file, from its extension (null: not read by the kit). */
export function formatOf(file) {
  const name = file.toLowerCase();
  /** @type {Array<[string[], string]>} */
  const table = [
    [[".docx"], "docx"],
    [[".pdf"], "pdf"],
    [[".md", ".markdown"], "markdown"],
    [[".txt"], "text"],
    [[".html", ".htm"], "html"],
    [[".drawio", ".drawio.xml", ".dio"], "drawio"],
    [[".puml", ".plantuml", ".pu"], "puml"],
    [[".mmd", ".mermaid"], "mermaid"],
  ];
  return table.find(([exts]) => exts.some((e) => name.endsWith(e)))?.[1] ?? null;
}

/**
 * The text of an HTML page: its title and headings kept, scripts and styles dropped, read linearly; no markup of the
 * page reaches the converted Markdown, a tag written as text included (inertMarkup).
 */
export function htmlToText(html) {
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const tag = lower.slice(lt + 1, gt).split(/[\s/]/, 1)[0] || lower.slice(lt + 1, gt).slice(0, 8);
    if (tag === "script" || tag === "style" || tag === "head" || tag === "!--") {
      const end = tag === "!--" ? lower.indexOf("-->", lt) : lower.indexOf(`</${tag}`, gt);
      i = end < 0 ? html.length : lower.indexOf(">", end) + 1 || html.length;
      continue;
    }
    const level = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0;
    if (level) out += `\n\n${"#".repeat(level)} `;
    else if (["p", "div", "br", "li", "tr", "table", "ul", "ol", "section", "/p", "/div", "/tr"].includes(tag))
      out += tag === "li" ? "\n- " : "\n";
    else if (/^\/h[1-6]$/.test(tag)) out += "\n\n";
    i = gt + 1;
  }
  const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  // Decoded after the tags are gone, a tag written as text (&lt;img onerror=…&gt;) would be one again: inert, as the
  // text of a Word document is (a "<" that could open a tag is written &lt;).
  return inertMarkup(
    out
      .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => entities[m])
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

/** The text of one document, by its format: `{ body, facts }` (facts: what the index records about it). */
function convert(buf, format, t) {
  if (format === "docx") {
    const r = docxToMarkdown(buf);
    return { body: r.markdown, facts: { headings: r.headings.length, tables: r.tables, images: r.images } };
  }
  if (format === "pdf") {
    const r = pdfIndex(buf);
    return {
      body: t("cli.inputs.output.pdf", { pages: r.pages ?? "?", n: r.pages ?? "?" }),
      facts: { pages: r.pages, encrypted: r.encrypted },
    };
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  if (format === "drawio" || format === "puml" || format === "mermaid") {
    const r = diagramToMarkdown(text, format, {
      components: t("cli.inputs.diagram.components"),
      links: t("cli.inputs.diagram.links"),
      noComponent: t("cli.inputs.diagram.noComponent"),
      noLink: t("cli.inputs.diagram.noLink"),
      componentsCap: (n) => t("cli.inputs.diagram.componentsCap", { n }),
      linksCap: (n) => t("cli.inputs.diagram.linksCap", { n }),
      notRead: (type) => t("cli.inputs.diagram.notRead", { type }),
    });
    return { body: r.markdown, facts: { components: r.components.length, links: r.links.length } };
  }
  if (format === "html") return { body: htmlToText(text), facts: {} };
  // A Markdown or a text document: its text as written, but no HTML of it reaches the converted text (inertMarkup),
  // as for a Word file or an HTML page — an agent may copy it into a page.
  return { body: inertMarkup(text), facts: {} };
}

/**
 * @typedef {{ source: string, state: "ingested"|"refused"|"missing"|"external", output?: string, format?: string,
 *   removed?: number, page?: string, error?: { key: string, vars: object } }} IngestResult
 */

/**
 * One document with a file: its entry of the index (none when it is missing) and its result.
 * @returns {{ entry: object|null, result: IngestResult }}
 */
function ingestOne({ root, doc, filter, t, slugs, reserved, previous }) {
  // A document given by its address is converted from the page the skill saved for it (model.mjs pageFile).
  const source = doc.file ?? doc.url;
  const file = doc.file ?? pageFile(doc.url);
  const kind = doc.kind || "other";
  /** @returns {{ entry: object, result: IngestResult }} */
  const refused = (key, vars, more = {}) => ({
    entry: { source, kind, ...more, refused: key, ...(vars.reason ? { reason: vars.reason } : {}) },
    result: { source, state: "refused", error: { key, vars: { file: source, ...vars } } },
  });
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
    return {
      entry: null,
      result: { source, state: "missing", error: { key: "inputs.fileMissing", vars: { file: source } } },
    };
  const format = formatOf(file);
  if (!format) return refused("inputs.format", { format: path.extname(file) || file });
  if (fs.statSync(abs).size > MAX_DOCUMENT_BYTES) return refused("inputs.refused", { reason: "tooLarge" });
  const buf = fs.readFileSync(abs);
  const hash = hashText(buf);
  let converted;
  try {
    converted = convert(buf, format, t);
  } catch (e) {
    // A document past what the kit can hold in memory is refused like any other too large one.
    if (e instanceof RangeError) return refused("inputs.refused", { reason: "tooLarge" }, { format, hash });
    if (!(e instanceof KitError)) throw e;
    return refused(e.key, e.vars, { format, hash });
  }
  // Its output name stays the one it had; a new one never takes the name of another document's output.
  const before = previous?.output ? path.basename(previous.output, ".md") : null;
  const base = nameOf(path.basename(file).replace(/\.[^.]+$/, ""));
  const free = (name) => !slugs.has(name) && (!reserved.has(name) || reserved.get(name) === source);
  let slug = before && free(before) ? before : base;
  for (let n = 2; !free(slug); n++) slug = `${base}-${n}`;
  slugs.add(slug);
  const output = `${DOCS_DIR}/${slug}.md`;
  const title = doc.title || (doc.file ? path.basename(doc.file) : doc.url);
  const header = t("cli.inputs.output.header", {
    title,
    file: source,
    kind: t(`cli.inputs.kind.${kind}`),
    kit: BRAND.name,
  });
  const clean = withoutSecrets(`${header}\n\n${converted.body.trim()}\n`, filter.list, filter.notice, filter.ignore);
  fs.mkdirSync(path.join(root, DOCS_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, output), clean.text);
  const removed = clean.removed.length;
  return {
    entry: { source, kind, format, hash, output, ...converted.facts, removed },
    result: { source, state: "ingested", output, format, removed },
  };
}

/**
 * Converts the documents of the sources.
 * @param {object} p
 * @param {string} p.root   the documentation project
 * @param {object} p.inputs   readInputs().inputs
 * @param {object} p.config   the validated configuration (its `masking`, for the secret filter)
 * @param {string[]} [p.files]   only these documents (their `file` as declared)
 * @param {(key: string, vars?: object) => string} p.t   translator in the project's language (the notices)
 * @param {string} p.generator   this kit's generator tag
 * @param {Date} p.now
 * @returns {IngestResult[]}
 */
export function ingestDocuments({ root, inputs, config, files, t, generator, now }) {
  const filter = {
    list: detectors(root, config.masking),
    ignore: ignoreRules(config.masking),
    notice: (kind) => t("cli.inputs.output.secret", { kind, kit: BRAND.name }),
  };
  const previous = new Map(readIndex(root).documents.map((e) => [e.source, e]));
  const entries = [];
  /** @type {IngestResult[]} */
  const results = [];
  const asked = (doc) => !files?.length || files.includes(doc.file ?? doc.url);
  // The output names of every document already converted are taken first: a new one, wherever it is listed,
  // never takes the name of another's output, and none is ever written over.
  const reserved = new Map(
    (inputs.documents || [])
      .map((doc) => previous.get(doc.file ?? doc.url))
      .filter((e) => e?.output)
      .map((e) => [path.basename(e.output, ".md"), e.source]),
  );
  const slugs = new Set([...reserved].filter(([, source]) => !asked({ file: source })).map(([slug]) => slug));
  for (const doc of inputs.documents || []) {
    const source = doc.file ?? doc.url;
    if (!asked(doc)) {
      const kept = previous.get(source);
      if (kept) entries.push(kept); // not asked this time: its previous conversion stays listed
      continue;
    }
    if (!doc.file && !fs.existsSync(path.join(root, pageFile(doc.url)))) {
      results.push({ source, state: "external", page: pageFile(doc.url) });
      continue;
    }
    const { entry, result } = ingestOne({ root, doc, filter, t, slugs, reserved, previous: previous.get(source) });
    if (entry) entries.push(entry);
    results.push(result);
  }
  fs.mkdirSync(path.join(root, DOCS_DIR), { recursive: true });
  const index = { generator, generated: now.toISOString(), documents: entries };
  fs.writeFileSync(path.join(root, INDEX_FILE), JSON.stringify(index, null, 2) + "\n");
  return results;
}
