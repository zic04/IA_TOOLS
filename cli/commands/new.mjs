// new <page-id> --template <type> [--title "…"] [--parent <id>] [--prefill]
// Creates <content>/<page-id>.md from templates/pages/<language>/<type>.md (never overwrites: exit code 1), in the
// variant of the project's capture mode (capture.mode "none": tables instead of screenshots), and declares the page
// in the table of contents. --prefill (ARCHITECTURE.md §6.11, types variables/api-surface/data-model/dependencies/
// agent-instructions only): fills the page's main table from the facts (`doc-kit facts`) instead of leaving every
// cell a placeholder; without the facts file, exit code 1; on another type, exit code 2.
//   --parent <id>   right after the parent and its sub-pages, with level 2;
//   otherwise       at the end of the group whose pages share the longest id prefix, or of the last group of
//                   the section named by the first segment of the id.
// The entry gets title, menuTitle, a summary placeholder and template. The table of contents is edited as TEXT:
// its formatting (indentation, line endings, inline arrays) is kept, and a legacy French-keyed file
// (sommaire.json: titre, titre_menu, resume, niveau, gabarit) receives keys in the same style.
// A page already declared but not written yet is only written (its template is added to its entry if missing).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { KIT_ROOT } from "../../engine/project/find.mjs";
import { normalizeToc, LEGACY_FILES, CURRENT_FILES } from "../../engine/project/legacy.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { readSchema } from "../../engine/project/load.mjs";
import { loadPageTemplates, captureVariant } from "../../engine/build/page-templates.mjs";
import { PREFILL_SOURCES, prefillTemplate, stripPrefillMarkers } from "../../engine/context/prefill.mjs";

export const options = {
  template: { type: "string" },
  title: { type: "string" },
  parent: { type: "string" },
  prefill: { type: "boolean" },
};

/** Page ids: lower-case segments separated by "/", the first one being the section id. */
export const PAGE_ID = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)+$/;
const LEGACY_KEYS = {
  title: "titre",
  menuTitle: "titre_menu",
  level: "niveau",
  summary: "resume",
  template: "gabarit",
  groups: "groupes",
  file: "fichier",
};

// ─── JSON located as text ────────────────────────────────────────────────────

/**
 * Parses a VALID JSON text and returns its tree with the offsets of every value:
 * { type: "object", start, end, props: [{ key, keyStart, value }] } | { type: "array", start, end, items } | { type, start, end }.
 */
export function locateJson(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ws = () => {
    while (i < text.length && " \t\r\n".includes(text[i])) i++;
  };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return { type: "string", start, end: i, value: JSON.parse(text.slice(start, i)) };
  };
  function value() {
    ws();
    const start = i;
    if (text[i] === "{" || text[i] === "[") {
      const object = text[i++] === "{";
      const out = object ? { type: "object", start, props: [] } : { type: "array", start, items: [] };
      ws();
      if (text[i] === (object ? "}" : "]")) return { ...out, end: ++i };
      for (;;) {
        if (object) {
          ws();
          const k = string();
          ws();
          i++; // ":"
          out.props.push({ key: k.value, keyStart: k.start, value: value() });
        } else out.items.push(value());
        ws();
        if (text[i++] === ",") continue;
        return { ...out, end: i };
      }
    }
    if (text[i] === '"') return string();
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    i += m[0].length;
    return { type: "literal", start, end: i };
  }
  return value();
}

/** Text without its byte order mark (JSON.parse refuses it). */
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const prop = (node, ...keys) => node?.props?.find((p) => keys.includes(p.key))?.value;
/** Whitespace at the start of the line that holds `pos`, and whether `pos` is the first thing on it. */
function lineIndent(text, pos) {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  const before = text.slice(start, pos);
  const indent = /^[ \t]*/.exec(before)[0];
  return { indent, alone: indent.length === before.length };
}
/** Indentation unit of a file: the first indented line (two spaces when nothing is indented). */
const indentUnit = (text) => (/\n([ \t]+)\S/.exec(text) || [null, "  "])[1];

/** An entry formatted like its sibling: multi-line with the sibling's indentation, or inline. */
function formatEntry(entry, { sibling, indent, unit, eol }) {
  if (!sibling || sibling.includes("\n"))
    return JSON.stringify(entry, null, unit)
      .split("\n")
      .map((l, k) => (k ? indent + l : l))
      .join(eol);
  const colon = /":\s/.test(sibling) ? ": " : ":";
  const comma = /,\s/.test(sibling) ? ", " : ",";
  const pad = /^\{\s/.test(sibling) ? " " : "";
  return `{${pad}${Object.entries(entry)
    .map(([k, v]) => JSON.stringify(k) + colon + JSON.stringify(v))
    .join(comma)}${pad}}`;
}

/**
 * Inserts `entry` into the pages array `pagesNode`, after the item at `after` (-1: at the start of an empty
 * array; otherwise the index of the sibling). Returns the new text.
 */
export function insertEntry(text, pagesNode, after, entry) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const unit = indentUnit(text);
  if (!pagesNode.items.length) {
    const base = lineIndent(text, pagesNode.start).indent;
    const indent = base + unit;
    const body = formatEntry(entry, { sibling: null, indent, unit, eol });
    return text.slice(0, pagesNode.start) + `[${eol}${indent}${body}${eol}${base}]` + text.slice(pagesNode.end);
  }
  const node = pagesNode.items[after];
  const sibling = text.slice(node.start, node.end);
  const { indent, alone } = lineIndent(text, node.start);
  const body = formatEntry(entry, { sibling, indent, unit, eol });
  const insertion = alone
    ? `,${eol}${indent}${body}`
    : `, ${formatEntry(entry, { sibling: sibling.replace(/\s*\n\s*/g, " "), indent, unit, eol })}`;
  return text.slice(0, node.end) + insertion + text.slice(node.end);
}

/** Adds a property at the end of an object, in the object's style. Returns the new text. */
export function addProperty(text, objectNode, key, value) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const last = objectNode.props.at(-1);
  const own = text.slice(objectNode.start, objectNode.end);
  const colon = /":\s/.test(own) ? ": " : ":";
  const pair = JSON.stringify(key) + colon + JSON.stringify(value);
  if (!last) return text.slice(0, objectNode.start) + `{ ${pair} }` + text.slice(objectNode.end);
  const insertion = own.includes("\n") ? `,${eol}${lineIndent(text, last.keyStart).indent}${pair}` : `, ${pair}`;
  return text.slice(0, last.value.end) + insertion + text.slice(last.value.end);
}

// ─── The command ─────────────────────────────────────────────────────────────

/** "orders-export" → "Orders export". */
const humanise = (id) => {
  const s = id.split("/").at(-1).replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const commonSegments = (a, b) => {
  const x = a.split("/");
  const y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
};

/**
 * Creates a page and declares it. Pure enough to be tested: reads and writes only under `root`.
 * @param {{ root: string, config: object, id: string, template?: string, title?: string, parent?: string, summary: string, prefill?: boolean }} p
 * @returns {{ file: string, toc: string, template: string, entry: object|null, placement: object, prefilled: { rows: number, source: string }|null }}
 *   `prefilled`: null without `--prefill` (ARCHITECTURE.md §6.11)
 */
export function createPage({ root, config, id, template, title, parent, summary, prefill = false }) {
  if (!id) throw new KitError(EXIT.USAGE, "new.missingId");
  if (!PAGE_ID.test(id)) throw new KitError(EXIT.USAGE, "new.invalidId", { id });
  const table = loadPageTemplates();
  const known = Object.keys(table?.types || {}).join(", ");
  if (template !== undefined && !table?.types?.[template])
    throw new KitError(EXIT.USAGE, "new.unknownTemplate", { template, known });

  const { content } = config.paths;
  const tocRel = [CURRENT_FILES.toc, LEGACY_FILES.toc]
    .map((f) => `${content}/${f}`)
    .find((f) => fs.existsSync(path.join(root, f)));
  if (!tocRel) throw new KitError(EXIT.CHECK, "new.noToc", { file: `${content}/${CURRENT_FILES.toc}` });
  const tocAbs = path.join(root, tocRel);
  const text = fs.readFileSync(tocAbs, "utf8");
  let raw;
  try {
    raw = JSON.parse(stripBom(text));
  } catch (e) {
    throw new KitError(EXIT.CHECK, "new.invalidToc", { file: tocRel, error: e.message });
  }
  const toc = normalizeToc(raw).value;
  if (validate(toc, readSchema("toc")).errors.length || !Array.isArray(toc.sections))
    throw new KitError(EXIT.CHECK, "new.invalidToc", { file: tocRel, error: "schema" });
  const legacy =
    tocRel.endsWith(LEGACY_FILES.toc) || "titre" in raw || (raw.sections || []).some((x) => x && "titre" in x);
  const k = (key) => (legacy ? LEGACY_KEYS[key] || key : key);

  // Where every declared page is: section, group, index.
  const where = [];
  toc.sections.forEach((s, si) =>
    (s.groups || []).forEach((g, gi) => (g.pages || []).forEach((p, pi) => where.push({ p, si, gi, pi }))),
  );
  const declared = where.find((w) => w.p.id === id);
  const fileRel = `${content}/${declared?.p.file || id + ".md"}`;
  const fileAbs = path.join(root, fileRel);
  if (fs.existsSync(fileAbs)) throw new KitError(EXIT.CHECK, "new.exists", { file: fileRel });

  const tree = locateJson(text);
  const pageNode = (w) =>
    prop(prop(prop(tree, "sections").items[w.si], "groups", "groupes").items[w.gi], "pages").items[w.pi];
  let newText = text;
  let entry = null;
  let placement;
  if (declared) {
    if (declared.p.template && template && declared.p.template !== template)
      throw new KitError(EXIT.USAGE, "new.templateConflict", {
        id,
        declared: declared.p.template,
        template,
        file: tocRel,
      });
    if (!declared.p.template && !template) throw new KitError(EXIT.USAGE, "new.missingTemplate", { known });
    if (!declared.p.template) {
      newText = addProperty(text, pageNode(declared), k("template"), template);
      placement = { kind: "typed" };
    } else placement = { kind: "declared" };
    template = declared.p.template || template;
  } else {
    if (!template) throw new KitError(EXIT.USAGE, "new.missingTemplate", { known });
    const sectionId = id.split("/")[0];
    let si;
    let gi;
    let after;
    if (parent) {
      const pw = where.find((w) => w.p.id === parent);
      if (!pw) throw new KitError(EXIT.USAGE, "new.unknownParent", { parent, file: tocRel });
      if (pw.p.level === 2) throw new KitError(EXIT.USAGE, "new.parentIsSubPage", { parent });
      if (toc.sections[pw.si].id !== sectionId)
        throw new KitError(EXIT.USAGE, "new.parentSection", { parent, section: toc.sections[pw.si].id, id });
      ({ si, gi } = pw);
      const pages = toc.sections[si].groups[gi].pages;
      after = pw.pi;
      while (after + 1 < pages.length && pages[after + 1].level === 2) after++;
      placement = { kind: "after", after: pages[after].id };
    } else {
      si = toc.sections.findIndex((s) => s.id === sectionId);
      if (si < 0)
        throw new KitError(EXIT.USAGE, "new.unknownSection", {
          section: sectionId,
          file: tocRel,
          known: toc.sections.map((s) => s.id).join(", "),
        });
      const groups = toc.sections[si].groups || [];
      if (!groups.length) throw new KitError(EXIT.USAGE, "new.noGroup", { section: sectionId, file: tocRel });
      // The group whose pages share the longest prefix with the new id (more than the section), else the last.
      let best = { gi: groups.length - 1, n: 1 };
      for (const w of where.filter((x) => x.si === si)) {
        const n = commonSegments(w.p.id, id);
        if (n > best.n) best = { gi: w.gi, n };
      }
      gi = best.gi;
      after = groups[gi].pages.length - 1;
      placement = { kind: "end", group: groups[gi].title || String(gi + 1), section: sectionId };
      // The id extends a level-1 page: it may be meant as one of its sub-pages.
      const prefix = id.split("/").slice(0, -1).join("/");
      if (where.some((w) => w.p.id === prefix && w.p.level !== 2)) placement.parentHint = prefix;
    }
    const pageTitle = title || humanise(id);
    entry = {
      id,
      [k("title")]: pageTitle,
      [k("menuTitle")]: pageTitle,
      ...(parent ? { [k("level")]: 2 } : {}),
      [k("summary")]: summary,
      [k("template")]: template,
    };
    const pagesNode = prop(prop(prop(tree, "sections").items[si], "groups", "groupes").items[gi], "pages");
    newText = insertEntry(text, pagesNode, after, entry);
  }

  // The result must still be a valid table of contents, with the page where expected.
  const check = normalizeToc(JSON.parse(stripBom(newText))).value;
  const found = check.sections.flatMap((s) => s.groups.flatMap((g) => g.pages)).find((p) => p.id === id);
  if (validate(check, readSchema("toc")).errors.length || !found || found.template !== template)
    throw new KitError(EXIT.CHECK, "new.invalidToc", { file: tocRel, error: "insertion" });

  const source = path.join(KIT_ROOT, table.types[template].template.replace("{language}", config.language));
  if (!fs.existsSync(source))
    throw new KitError(EXIT.ENVIRONMENT, "new.templateFileMissing", { file: path.relative(KIT_ROOT, source) });
  fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
  // The variant of the project's capture mode (ARCHITECTURE.md §6.4): "The screen" is a table without screenshots.
  let pageText = captureVariant(fs.readFileSync(source, "utf8"), config.capture?.mode || "app");

  // --prefill (ARCHITECTURE.md §6.11): the page's main table, filled from the facts; the marker is always
  // removed, with or without --prefill (like the capture variant markers above).
  let prefilled = null;
  if (prefill) {
    const prefillSource = PREFILL_SOURCES[template];
    if (!prefillSource)
      throw new KitError(EXIT.USAGE, "new.noPrefill", { template, known: Object.keys(PREFILL_SOURCES).join(", ") });
    const factsRel = `${config.paths.facts}/${prefillSource}.json`;
    const factsAbs = path.join(root, factsRel);
    if (!fs.existsSync(factsAbs))
      throw new KitError(EXIT.CHECK, "new.noFacts", { file: factsRel, source: prefillSource });
    let facts;
    try {
      facts = JSON.parse(fs.readFileSync(factsAbs, "utf8"));
    } catch (e) {
      throw new KitError(EXIT.CHECK, "new.noFacts", { file: factsRel, source: prefillSource }, { cause: e });
    }
    const r = prefillTemplate(pageText, { source: prefillSource, items: facts.items || [], template });
    pageText = r.text;
    prefilled = { rows: r.rows, source: prefillSource };
  }
  pageText = stripPrefillMarkers(pageText);

  fs.writeFileSync(fileAbs, pageText);
  if (newText !== text) fs.writeFileSync(tocAbs, newText);
  return { file: fileRel, toc: tocRel, template, entry, placement, prefilled };
}

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  const r = createPage({
    root: project.root,
    config,
    id: positionals[0],
    template: values.template,
    title: values.title,
    parent: values.parent,
    summary: ctx.t("cli.new.summaryPlaceholder"),
    prefill: !!values.prefill,
  });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return EXIT.OK;
  }
  ctx.print(ctx.t("cli.new.created", { file: r.file, template: r.template }));
  if (r.prefilled) ctx.print(ctx.t("cli.new.prefilled", { n: r.prefilled.rows, source: r.prefilled.source }));
  const id = positionals[0];
  if (r.placement.kind === "after") ctx.print(ctx.t("cli.new.tocAfter", { toc: r.toc, id, after: r.placement.after }));
  else if (r.placement.kind === "end")
    ctx.print(ctx.t("cli.new.tocEnd", { toc: r.toc, id, group: r.placement.group, section: r.placement.section }));
  else if (r.placement.kind === "typed") ctx.print(ctx.t("cli.new.tocTyped", { toc: r.toc, id, template: r.template }));
  else ctx.print(ctx.t("cli.new.tocDeclared", { toc: r.toc, id }));
  if (r.placement.parentHint) ctx.print(ctx.t("cli.new.parentHint", { parent: r.placement.parentHint }));
  ctx.print(ctx.t("cli.new.next", { file: r.file, toc: r.toc }));
  return EXIT.OK;
}
