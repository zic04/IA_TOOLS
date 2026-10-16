// What the diagram readers of diagrams.mjs share (`doc-kit inputs ingest`, ARCHITECTURE.md §6.19): character
// classes, the collector that keeps the components and links within their limits, the text of an HTML label, and
// the C4 macros, which both Mermaid (C4Context, C4Container…) and C4-PlantUML write the same way. A diagram is
// untrusted input (SECURITY.md): everything here scans with indexOf and single passes, no regular expression.
import { decodeEntities } from "../core/xml.mjs";

export const MAX_COMPONENTS = 2000;
export const MAX_LINKS = 5000;
/** Characters kept of a name or a label. */
const MAX_NAME = 200;

/** C4 element macros (with or without the `_Ext` suffix); the boundaries only name a group. */
const C4_ELEMENTS = new Set([
  ...["Person", "System", "SystemDb", "SystemQueue", "Container", "ContainerDb", "ContainerQueue"],
  ...["Component", "ComponentDb", "ComponentQueue", "Node", "Node_L", "Node_R"],
  ...["Deployment_Node", "Deployment_Node_L", "Deployment_Node_R"],
]);
/** Tags of a draw.io HTML label that separate words. */
const BREAKING_TAGS = new Set(["br", "div", "p", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"]);

/** A space, a tab, a line break or a non-breaking space. */
export const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n" || c === " ";
const isDigit = (c) => c >= "0" && c <= "9";
/** A letter of any cased script, a digit, `_`, `$`, or any other character past ASCII but a space. */
export const isWordChar = (c) =>
  Boolean(c) &&
  !isSpace(c) &&
  (isDigit(c) || c === "_" || c === "$" || c > "\u007f" || c.toLowerCase() !== c.toUpperCase());
/** A letter of a cased script. */
export const isLetter = (c) => Boolean(c) && c.toLowerCase() !== c.toUpperCase();
/** The index of the first character at or after `i` that is not a space. */
export const skipSpaces = (s, i) => {
  while (i < s.length && isSpace(s[i])) i++;
  return i;
};

/** Whitespace collapsed to single spaces, trimmed, cut to MAX_NAME characters. */
export function squash(s) {
  let out = "";
  let space = false;
  for (const c of String(s ?? "")) {
    if (isSpace(c)) space = out.length > 0;
    else {
      out += (space ? " " : "") + c;
      space = false;
      if (out.length >= MAX_NAME) break;
    }
  }
  return out;
}

/**
 * The components and links read, without duplicates, within the limits: `component(name)`, `link(from, to,
 * label)`, `full` (no more link is kept), `over` (which list stopped), `result()`.
 */
export function collector() {
  const components = new Set();
  const links = new Map();
  const over = { components: false, links: false };
  return {
    over,
    component(name) {
      const n = squash(name);
      if (!n || components.has(n)) return;
      if (components.size >= MAX_COMPONENTS) over.components = true;
      else components.add(n);
    },
    link(from, to, label) {
      const link = { from: squash(from), to: squash(to), label: squash(label) };
      if (!link.from || !link.to) return;
      const key = JSON.stringify([link.from, link.to, link.label]);
      if (links.has(key)) return;
      if (links.size >= MAX_LINKS) over.links = true;
      else links.set(key, link.label ? link : { from: link.from, to: link.to });
    },
    get full() {
      return over.links;
    },
    result: () => ({ components: [...components], links: [...links.values()] }),
  };
}

/** The text of an HTML label: tags removed (those that separate words become a space), entities decoded. */
export function labelText(value) {
  // A label is a name: its first 2000 characters are plenty (the lists cut names at 200).
  const html = String(value ?? "").slice(0, 2000);
  let out = "";
  let i = 0;
  for (let lt = html.indexOf("<"); lt >= 0; lt = html.indexOf("<", i)) {
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    let name = "";
    for (let j = html[lt + 1] === "/" ? lt + 2 : lt + 1; j < gt && isWordChar(html[j]); j++) name += html[j];
    out += html.slice(i, lt) + (BREAKING_TAGS.has(name.toLowerCase()) ? " " : "");
    i = gt + 1;
  }
  return squash(decodeEntities((out + html.slice(i)).replaceAll("&nbsp;", " ")));
}

/** The arguments of a call whose `(` is at `open`, split on top-level commas, quotes removed. */
function callArguments(s, open) {
  const args = [];
  let quote = false;
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quote = !quote;
    else if (quote) continue;
    else if (c === "(") depth++;
    else if ((c === "," || c === ")") && depth === 0) {
      args.push(s.slice(start, i).trim());
      start = i + 1;
      if (c === ")") break;
    } else if (c === ")") depth--;
  }
  return args.map((a) => (a.length > 1 && a[0] === '"' && a.endsWith('"') ? a.slice(1, -1) : a));
}

/** A C4 macro call `Name(args…)` at the start of a line: `{ name, args }`, or null. */
function c4Call(line) {
  let i = 0;
  while (i < line.length && isWordChar(line[i])) i++;
  return i && line[i] === "(" ? { name: line.slice(0, i), args: callArguments(line, i) } : null;
}

/**
 * A C4 element (Person, System, Container…, or a boundary, which only names a group): its alias recorded, and
 * the element as a component.
 * @returns {boolean} true when the line is one
 */
export function c4Element(line, sink, aliases) {
  const call = c4Call(line);
  if (!call) return false;
  const base = call.name.endsWith("_Ext") ? call.name.slice(0, -4) : call.name;
  const element = C4_ELEMENTS.has(base);
  if (!element && !base.endsWith("Boundary")) return false;
  const [id, label] = call.args;
  if (!id) return true;
  aliases.set(id, label || id);
  if (element) sink.component(label || id);
  return true;
}

/**
 * A C4 relation (Rel, Rel_Back, BiRel, Rel_U…, RelIndex): recorded as a link between the elements' labels.
 * @returns {boolean} true when the line is one
 */
export function c4Relation(line, sink, aliases) {
  const call = c4Call(line);
  const name = call?.name ?? "";
  const relation = ["Rel", "BiRel", "RelIndex"].includes(name) || name.startsWith("Rel_") || name.startsWith("BiRel_");
  if (!relation) return false;
  const [a, b, label] = name === "RelIndex" ? call.args.slice(1) : call.args;
  if (!a || !b) return true;
  const [from, to] = name.includes("Back") ? [b, a] : [a, b];
  sink.link(aliases.get(from) ?? from, aliases.get(to) ?? to, label);
  return true;
}
