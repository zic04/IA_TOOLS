// Diagrams to text for the documents of the sources (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): the
// components and the links of a draw.io, PlantUML or Mermaid diagram, as lists the documentation agents read. A
// diagram is untrusted input (SECURITY.md): nothing in it is executed, included or fetched (`!include`, links and
// scripts are text like any other), and it is read by hand-written tokenizers, line by line, with indexOf and no
// regular expression; every scan is linear, each label read once and cut at 2000 characters, every list capped.
//   - draw.io: the cells of each page (mxCell, with their UserObject wrapper); a page held compressed is decoded
//     (base64, raw deflate capped at 16 MB for the whole file, then URI decoding). Vertices are components by their
//     label (HTML tags removed, entities decoded); edges are links, labelled by their value or their label cell.
//   - PlantUML: the elements declared by a keyword (component, node, database, actor…, `"Name" as Alias`, `[Name]`)
//     and the links `A --> B : label` (arrows of - . = with heads and direction hints), plus the C4-PlantUML macros.
//   - Mermaid: flowcharts (`graph`, `flowchart`: node shapes, `-->`, `---`, `-.->`, `==>`, `|label|`,
//     `-- label -->`, `&`) and C4 diagrams (Person, System, Container…, Rel); any other type gives a note only.
// At most 2000 components and 5000 links are kept; beyond, the lists say they stop there.
import zlib from "node:zlib";
import { KitError, EXIT } from "../project/errors.mjs";
import { walkXml, inertMarkup } from "../core/xml.mjs";
import {
  MAX_COMPONENTS,
  MAX_LINKS,
  isSpace,
  isWordChar,
  isLetter,
  skipSpaces,
  squash,
  collector,
  labelText,
  c4Element,
  c4Relation,
} from "./diagram-common.mjs";

/** Bytes a draw.io file may inflate to, all its compressed pages together. */
const MAX_INFLATED = 16 * 1024 * 1024;
const PUML_ELEMENTS = new Set([
  ...["component", "node", "database", "actor", "participant", "queue", "cloud", "rectangle", "package"],
  ...["interface", "usecase", "class", "entity", "boundary", "control", "collections", "artifact", "frame"],
  ...["folder", "storage", "agent", "card", "file", "person", "stack", "hexagon"],
]);
/** Mermaid flowchart lines that declare no node and no link. */
const MERMAID_SKIPPED = new Set(["subgraph", "end", "classDef", "class", "style", "linkStyle", "click", "direction"]);
/** Mermaid node shapes, longest opening first: [opening, closing]. */
const SHAPES = [
  ["(((", ")))"],
  ["((", "))"],
  ["([", "])"],
  ["[(", ")]"],
  ["[[", "]]"],
  ["{{", "}}"],
  ["[/", "]"],
  ["[\\", "]"],
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  [">", "]"],
];
/** The delimiters of a quoted PlantUML name: `"name"`, `[component]`, `:actor:`, `(usecase)`. */
const TOKEN_PAIRS = new Map([
  ['"', '"'],
  ["[", "]"],
  [":", ":"],
  ["(", ")"],
]);
/** Heads of a PlantUML arrow, at either end of its body. */
const PUML_HEADS = new Set(["<", ">", "*", "|", "+", "#", "^", "{", "}"]);
/** The error of a diagram that cannot be read. */
const refused = (reason = "xml") => new KitError(EXIT.CHECK, "inputs.refused", { reason });

// --- draw.io ------------------------------------------------------------------------------------------------------

/** Adds the components and links of one page's cells (`id → cell`) to the collector. */
function flushCells(cells, sink) {
  // Each label read once: an edge names its two ends, and a cell may end many edges.
  const labels = new Map();
  const name = (id) => {
    if (!labels.has(id)) labels.set(id, labelText(cells.get(id)?.value) || id);
    return labels.get(id);
  };
  const edgeLabels = new Map();
  for (const c of cells.values()) {
    if (!c.vertex) continue;
    if (cells.get(c.parent)?.edge) edgeLabels.set(c.parent, labelText(c.value));
    else sink.component(labelText(c.value));
  }
  for (const [id, c] of cells) {
    if (c.edge && c.source && c.target && cells.has(c.source) && cells.has(c.target))
      sink.link(name(c.source), name(c.target), labelText(c.value) || edgeLabels.get(id));
  }
  cells.clear();
}

/** Handlers that record the mxCell elements (and the UserObject or object that wraps one) into `cells`. */
function cellHandlers(cells) {
  let wrapper = null;
  return {
    open(name, a) {
      if (name === "UserObject" || name === "object") wrapper = { id: a.id, label: a.label ?? a.value };
      else if (name === "mxCell") {
        const id = a.id ?? wrapper?.id;
        if (id === undefined) return;
        const value = a.value ?? wrapper?.label ?? "";
        const cell = { value, vertex: a.vertex === "1", edge: a.edge === "1", source: a.source, target: a.target };
        cells.set(id, { ...cell, parent: a.parent });
      }
    },
    close(name) {
      if (name === "UserObject" || name === "object") wrapper = null;
    },
  };
}

/** The XML of a compressed draw.io page: base64, raw deflate (within `budget` bytes), then URI encoding. */
function inflatePage(data, budget) {
  let raw;
  try {
    raw = zlib.inflateRawSync(Buffer.from(data, "base64"), { maxOutputLength: Math.max(1, budget) });
  } catch (e) {
    throw refused(e?.code === "ERR_BUFFER_TOO_LARGE" ? "tooLarge" : "xml");
  }
  try {
    return { xml: decodeURIComponent(raw.toString("utf8")), bytes: raw.length };
  } catch {
    throw refused();
  }
}

/** Reads a draw.io file (mxfile with its diagram pages, or a bare mxGraphModel) into the collector. */
function readDrawio(text, sink) {
  const cells = new Map();
  const cell = cellHandlers(cells);
  const compressed = [];
  let page = null; // the text of the <diagram> being read, outside its model
  let model = 0;
  walkXml(text, {
    open(name, a) {
      if (name === "diagram") page = "";
      else if (name === "mxGraphModel") model++;
      cell.open(name, a);
    },
    close(name) {
      cell.close(name);
      if (name === "mxGraphModel") model--;
      if (name !== "diagram") return;
      if (page?.trim()) compressed.push(page.trim());
      page = null;
      flushCells(cells, sink);
    },
    text(t) {
      if (page !== null && !model) page += t;
    },
  });
  flushCells(cells, sink);
  let budget = MAX_INFLATED;
  for (const data of compressed) {
    const { xml, bytes } = inflatePage(data, budget);
    budget -= bytes;
    walkXml(xml, cellHandlers(cells));
    flushCells(cells, sink);
  }
}

// --- PlantUML -----------------------------------------------------------------------------------------------------

/**
 * The name token at `i`: `"quoted"`, `[bracketed]`, `:actor:`, `(usecase)` or a word (letters, digits, `_`, `$`,
 * and a `.` between word characters). `quoted` is true for the delimited forms. Empty text when there is none.
 */
function readToken(s, i) {
  const closing = TOKEN_PAIRS.get(s[i]);
  if (closing) {
    const close = s.indexOf(closing, i + 1);
    if (close > i + 1) return { text: s.slice(i + 1, close), quoted: true, end: close + 1 };
    return { text: "", quoted: false, end: i };
  }
  let j = i;
  while (j < s.length && (isWordChar(s[j]) || (s[j] === "." && isWordChar(s[j + 1]) && j > i))) j++;
  return { text: s.slice(i, j), quoted: false, end: j };
}

/** A declaration `keyword name [as alias]` or `[Name] as Alias`: `{ label, alias }`, or null. */
function pumlDeclaration(line) {
  let i = 0;
  while (i < line.length && !isSpace(line[i])) i++;
  const keyword = PUML_ELEMENTS.has(line.slice(0, i).toLowerCase());
  const first = readToken(line, keyword ? skipSpaces(line, i) : 0);
  if (!first.text || (!keyword && !first.quoted)) return null;
  let j = skipSpaces(line, first.end);
  if (!line.startsWith("as", j) || !isSpace(line[j + 2])) {
    // Without a keyword, only a lone `[Name]` (or `[Name] {`) declares a component; anything else is a link.
    const rest = line.slice(j);
    return keyword || !rest || rest[0] === "{" || rest[0] === "<" ? { label: first.text, alias: first.text } : null;
  }
  const second = readToken(line, skipSpaces(line, j + 2));
  if (!second.text) return { label: first.text, alias: first.text };
  return second.quoted && !first.quoted
    ? { label: second.text, alias: first.text }
    : { label: first.text, alias: second.text };
}

/** Reads the letters at `j` of a PlantUML arrow: a direction hint (`-right->`) or a head `o` / `x`. */
function arrowLetters(s, j) {
  let k = j;
  while (k < s.length && isLetter(s[k])) k++;
  const word = s.slice(j, k);
  if (s[k] === "-" || s[k] === ".") return k; // a direction hint inside the body
  return word === "o" || word === "x" ? k : -1;
}

/** The PlantUML arrow at `i`: `{ end, reversed, hidden }`, or null when there is none. */
function pumlArrow(s, i) {
  let j = i;
  let body = 0;
  let hidden = false;
  if ((s[j] === "o" || s[j] === "x") && (s[j + 1] === "-" || s[j + 1] === ".")) j++;
  while (j < s.length) {
    const c = s[j];
    if (c === "-" || c === "." || c === "=") {
      body++;
      j++;
    } else if (PUML_HEADS.has(c)) j++;
    else if (c === "[" && body) {
      const close = s.indexOf("]", j);
      if (close < 0) return null;
      hidden ||= s.slice(j, close).includes("hidden");
      j = close + 1;
    } else if (body && (s[j - 1] === "-" || s[j - 1] === ".") && isLetter(c)) {
      const k = arrowLetters(s, j);
      if (k < 0) break;
      j = k;
    } else break;
  }
  if (!body || j - i < 2) return null;
  const arrow = s.slice(i, j);
  return { end: j, reversed: arrow.startsWith("<") && !arrow.endsWith(">"), hidden };
}

/** Skips a quoted cardinality (`"1"`, `"many"`) at `i` when an arrow (or, after one, a name) follows it. */
function skipCardinality(s, i, beforeArrow) {
  if (s[i] !== '"') return i;
  const close = s.indexOf('"', i + 1);
  if (close < 0) return i;
  const next = skipSpaces(s, close + 1);
  const follows = beforeArrow ? pumlArrow(s, next) !== null : next < s.length && s[next] !== ":";
  return follows ? next : i;
}

/** A link `A --> B : label` (or `A <-- B`, `A -right-> B`, `A "1" *-- "n" B`): `{ from, to, label }`, or null. */
function pumlLink(line) {
  const left = readToken(line, 0);
  if (!left.text) return null;
  const arrow = pumlArrow(line, skipCardinality(line, skipSpaces(line, left.end), true));
  if (!arrow || arrow.hidden) return null;
  const right = readToken(line, skipCardinality(line, skipSpaces(line, arrow.end), false));
  if (!right.text) return null;
  const after = skipSpaces(line, right.end);
  const label = line[after] === ":" ? line.slice(after + 1).replaceAll("\\n", " ") : "";
  return arrow.reversed ? { from: right.text, to: left.text, label } : { from: left.text, to: right.text, label };
}

/** The lines of a PlantUML text inside @startuml … @enduml (all of it without them), comments left out. */
function pumlLines(text) {
  const lines = [];
  let inside = !text.includes("@start");
  let comment = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (comment) comment = !line.includes("'/");
    else if (line.startsWith("/'")) comment = !line.includes("'/", 2);
    else if (line.startsWith("@start")) inside = true;
    else if (line.startsWith("@end")) inside = false;
    else if (inside && line && line[0] !== "'") lines.push(line);
  }
  return lines;
}

/** Reads a PlantUML diagram: the declarations first (their aliases), then the links. */
function readPuml(text, sink) {
  const lines = pumlLines(text);
  const aliases = new Map();
  for (const line of lines) {
    if (c4Element(line, sink, aliases)) continue;
    const d = pumlDeclaration(line);
    if (!d) continue;
    const label = d.label.replaceAll("\\n", " ");
    aliases.set(d.alias, label);
    sink.component(label);
  }
  for (const line of lines) {
    if (sink.full) break;
    if (c4Relation(line, sink, aliases) || pumlDeclaration(line)) continue;
    const link = pumlLink(line);
    if (!link) continue;
    const from = aliases.get(link.from) ?? link.from;
    const to = aliases.get(link.to) ?? link.to;
    sink.component(from);
    sink.component(to);
    sink.link(from, to, link.label);
  }
}

// --- Mermaid ------------------------------------------------------------------------------------------------------

/** The node at `i` of a flowchart statement (`A`, `A[Label]`, `A((Label))`…): `{ id, label, end }`, or null. */
function mermaidNode(s, i) {
  let j = i;
  while (j < s.length && isWordChar(s[j])) j++;
  if (j === i) return null;
  const id = s.slice(i, j);
  const shape = SHAPES.find(([open]) => s.startsWith(open, j));
  let label = "";
  if (shape) {
    let from = j + shape[0].length;
    if (s[from] === '"') from = Math.max(from, s.indexOf('"', from + 1));
    const close = s.indexOf(shape[1], from);
    if (close < 0) return null;
    label = s.slice(j + shape[0].length, close).trim();
    if (label.length > 1 && label[0] === '"' && label.endsWith('"')) label = label.slice(1, -1);
    else if (label.endsWith("/") || label.endsWith("\\")) label = label.slice(0, -1);
    j = close + shape[1].length;
  }
  if (s.startsWith(":::", j)) for (j += 3; j < s.length && (isWordChar(s[j]) || s[j] === "-"); j++);
  return { id, label, end: j };
}

/** The nodes at `i` joined by `&`: `{ nodes, end }`, or null. */
function mermaidGroup(s, i) {
  const nodes = [];
  let j = i;
  for (;;) {
    const node = mermaidNode(s, skipSpaces(s, j));
    if (!node) return nodes.length ? { nodes, end: j } : null;
    nodes.push(node);
    j = skipSpaces(s, node.end);
    if (s[j] !== "&") return { nodes, end: node.end };
    j++;
  }
}

/** The run of edge characters at `i` (`-`, `.`, `=`, `~`), with an optional head at either end. */
function edgeRun(s, i) {
  let j = i;
  if (s[j] === "<" || ((s[j] === "x" || s[j] === "o") && "-=.".includes(s[j + 1] || " "))) j++;
  const start = j;
  while (j < s.length && "-.=~".includes(s[j])) j++;
  const body = s.slice(start, j);
  if (s[j] === ">" || ((s[j] === "x" || s[j] === "o") && (isSpace(s[j + 1] || " ") || s[j + 1] === "|"))) j++;
  return { body, end: j, headed: j > start + body.length };
}

/** The edge at `i` of a flowchart statement: `{ end, label, hidden }`, or null. */
function mermaidEdge(s, i) {
  const run = edgeRun(s, i);
  if (run.body.length < 2) return null;
  let end = run.end;
  let label = "";
  if (!run.headed && ["--", "==", "-."].includes(run.body) && isSpace(s[end] || "")) {
    // `-- label -->`, `== label ==>`, `-. label .->`: the label runs to the closing part of the edge.
    const close = s.indexOf(run.body === "==" ? "==" : run.body === "-." ? ".-" : "--", end);
    if (close < 0) return null;
    label = s.slice(end, close).trim();
    end = edgeRun(s, close).end;
  }
  const pipe = skipSpaces(s, end);
  if (s[pipe] === "|") {
    const close = s.indexOf("|", pipe + 1);
    if (close < 0) return null;
    label = s.slice(pipe + 1, close).trim();
    end = close + 1;
  }
  if (label.length > 1 && label[0] === '"' && label.endsWith('"')) label = label.slice(1, -1);
  return { end, label, hidden: run.body.startsWith("~") };
}

/** Reads one flowchart statement (`A[x] -->|y| B & C --> D`) into `nodes` (id → label) and `edges`. */
function mermaidStatement(s, nodes, edges) {
  let group = mermaidGroup(s, 0);
  if (!group) return;
  const note = (g) => g.nodes.forEach((n) => nodes.set(n.id, n.label || nodes.get(n.id) || ""));
  note(group);
  for (let i = group.end; edges.length <= MAX_LINKS;) {
    const edge = mermaidEdge(s, skipSpaces(s, i));
    const next = edge && mermaidGroup(s, skipSpaces(s, edge.end));
    if (!next) return;
    note(next);
    // `A & B --> C & D` links every pair: stopped as soon as the list is full, never walked to its end.
    pairs: for (const a of edge.hidden ? [] : group.nodes)
      for (const b of next.nodes) {
        if (edges.length > MAX_LINKS) break pairs;
        edges.push([a.id, b.id, edge.label]);
      }
    group = next;
    i = next.end;
  }
}

/** The statements of a line: split on `;` outside quotes and brackets. */
function statements(line) {
  const out = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quote = !quote;
    else if (quote) continue;
    else if ("[({".includes(c)) depth++;
    else if ("])}".includes(c)) depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      out.push(line.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(line.slice(start).trim());
  return out.filter(Boolean);
}

/** The lines of a Mermaid text, its front matter, directives and `%%` comments left out. */
function mermaidLines(text) {
  const lines = [];
  let front = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "---" && (front || !lines.length)) front = !front;
    else if (!front && line && !line.startsWith("%%")) lines.push(line);
  }
  return lines;
}

/** Reads a Mermaid diagram; returns a note when its type is not read (only flowcharts and C4 diagrams are). */
function readMermaid(text, sink) {
  const [header = "", ...lines] = mermaidLines(text);
  const [declaration = "", ...inline] = statements(header); // `graph TD; A --> B` on one line
  const type = squash(declaration).split(" ")[0];
  if (type.startsWith("C4")) {
    const aliases = new Map();
    for (const line of lines) c4Element(line, sink, aliases);
    for (const line of lines) if (!sink.full) c4Relation(line, sink, aliases);
    return null;
  }
  if (type !== "graph" && !type.startsWith("flowchart")) return { notRead: type };
  const nodes = new Map();
  const edges = [];
  for (const line of [...inline, ...lines]) {
    if (MERMAID_SKIPPED.has(line.split(" ")[0]) || edges.length > MAX_LINKS) continue;
    for (const st of statements(line)) mermaidStatement(st, nodes, edges);
  }
  const labels = new Map([...nodes].map(([id, label]) => [id, labelText(label) || id]));
  const name = (id) => labels.get(id) ?? id;
  for (const id of nodes.keys()) sink.component(name(id));
  for (const [a, b, label] of edges) sink.link(name(a), name(b), labelText(label));
  return null;
}

// --- Markdown -----------------------------------------------------------------------------------------------------

/** The words of the lists, in English; the caller gives those of the project's language (ingest.mjs). */
const ENGLISH = {
  components: "Components",
  links: "Links",
  noComponent: "No component found.",
  noLink: "No link found.",
  componentsCap: (n) => `The list stops at ${n} components.`,
  linksCap: (n) => `The list stops at ${n} links.`,
  notRead: (type) => `Mermaid diagram of type “${type}”: not read.`,
};

/** The Markdown of the lists: components, then links "A → B (label)", with the notes. */
function render({ components, links }, over, note, words) {
  const lines = [`## ${words.components}`, ""];
  lines.push(...(components.length ? components.map((c) => `- ${c}`) : [words.noComponent]));
  if (over.components) lines.push("", words.componentsCap(MAX_COMPONENTS));
  lines.push("", `## ${words.links}`, "");
  lines.push(...(links.length ? links.map((l) => `- ${l.from} → ${l.to}${l.label ? ` (${l.label})` : ""}`) : []));
  if (!links.length) lines.push(words.noLink);
  if (over.links) lines.push("", words.linksCap(MAX_LINKS));
  if (note) lines.push("", words.notRead(note.notRead));
  return inertMarkup(lines.join("\n")) + "\n";
}

/**
 * The components and links of a diagram, and their Markdown ("Components" and "Links" lists).
 * @param {string} text   the diagram file's text
 * @param {"drawio"|"puml"|"mermaid"} kind
 * @param {Partial<typeof ENGLISH>} [words]   the words of the lists, in the project's language
 * @returns {{ markdown: string, components: string[], links: Array<{ from: string, to: string, label?: string }> }}
 * @throws {KitError} "inputs.refused", { reason: "xml" } (a draw.io file that does not parse or decode) or
 *   { reason: "tooLarge" } (its compressed pages inflate past 16 MB)
 */
export function diagramToMarkdown(text, kind, words = {}) {
  const sink = collector();
  let note = null;
  if (kind === "drawio") readDrawio(text, sink);
  else if (kind === "puml") readPuml(text, sink);
  else if (kind === "mermaid") note = readMermaid(text, sink);
  else throw new Error(`unknown diagram kind: ${kind}`);
  const result = sink.result();
  return { markdown: render(result, sink.over, note, { ...ENGLISH, ...words }), ...result };
}
