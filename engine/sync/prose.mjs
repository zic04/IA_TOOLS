// What the site shows as text, in a page's Markdown (ARCHITECTURE.md §6.10): the page read as Marked, the kit's
// renderer, reads it — its blocks line by line (code, comments and HTML blocks, and where a paragraph ends), then its
// inline parts (code spans, comments, tags) — with what is never text blanked, so that a label there is neither cited
// nor rewritten (engine/sync/labels.mjs). Pure, and linear in the page (RULES.md S5).

/** A code fence (``` or ~~~) after its indentation; its closing line. Linear: no class overlaps the next one (RULES.md
 * S5). */
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const FENCE_END = /^[ \t]*([`~]+)[ \t\r]*$/;
/** A list item (`- `, `* `, `+ `, `1. `, `1) `) where the scan stands: its indentation, its marker, the spaces
 * after it. */
const LIST_ITEM = /([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|\r?$)/y;
/** A heading: an indented line right after it is code too. */
const HEADING = /^ {0,3}#/;
/** A thematic break or the underline of a heading: a paragraph ends there. */
const RULE = /^[ \t]*(?:[-*_=][ \t]*)+\r?$/;
/** The block tags Marked lists (CommonMark's type 6): a line that opens with one opens an HTML block, even in a
 * paragraph. */
const BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|" +
  "fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|" +
  "menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|" +
  "tr|track|ul";
const HTML_BLOCK = new RegExp(`^ {0,3}</?(?:${BLOCK_TAGS})(?: |/?>|\\r?$)`, "i");
/** A line that opens an HTML block running to its closing tag, blank lines included (CommonMark's type 1): what it holds
 * is shown as it is (`<pre>`, `<textarea>`), or never (`<script>`, `<style>`). */
const RAW_BLOCK = /^ {0,3}<(script|pre|style|textarea)(?:[\s>]|$)/i;

/** The columns of a line's indentation, a tab to the next multiple of four. */
function indentOf(line) {
  let n = 0;
  for (const ch of line)
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  return n;
}

/** The column after the blanks `ws` that start at column `col`, a tab to the next multiple of four. */
function columnAfter(ws, col) {
  for (const ch of ws) col = ch === "\t" ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * The list markers that open the rest of a line (`- `, `1. `, nested `- 1. `): the content column of the innermost
 * item, where its text starts (`at`) and where its marker ends (`marker`), and whether its text is indented code
 * (five columns after the marker or more); null on a line that opens no item.
 */
function listItemOf(rest) {
  let item = null;
  for (let at = 0, col = 0; ; at = LIST_ITEM.lastIndex) {
    LIST_ITEM.lastIndex = at;
    const m = LIST_ITEM.exec(rest);
    if (!m) break;
    const end = columnAfter(m[1], col) + m[2].length;
    const after = columnAfter(m[3], end) - end;
    col = end + (after >= 1 && after <= 4 ? after : 1);
    item = { col, at: LIST_ITEM.lastIndex, marker: LIST_ITEM.lastIndex - m[3].length, after };
    if (after >= 5 || !m[3].length) break;
  }
  return item && { ...item, code: item.after >= 5 && rest.slice(item.at).trim() !== "" };
}

/** Each character but a line end as NUL: what is blanked keeps its length (an index still points at the same one).
 * Line by line: one replacement a character grows faster than the text on a long one. */
export const blank = (s) =>
  s
    .split("\n")
    .map((line) => "\0".repeat(line.length))
    .join("\n");

/** The blockquote markers that open a line (`> > `), `max` at most: how many, and where the rest of the line starts. */
function quoteOf(line, max = Infinity) {
  let depth = 0;
  let at = 0;
  while (depth < max) {
    let i = at;
    while (i < line.length && i - at < 3 && line[i] === " ") i++;
    if (line[i] !== ">") break;
    depth++;
    at = line[i + 1] === " " || line[i + 1] === "\t" ? i + 2 : i + 1;
  }
  return { depth, at };
}

/** Whether a line holds a whole HTML tag alone (CommonMark's type 7): it opens an HTML block, out of a paragraph. */
function tagAlone(rest) {
  const lead = rest.length - rest.trimStart().length;
  if (lead > 3 || !/^<\/?[A-Za-z]/.test(rest.slice(lead, lead + 3))) return false;
  const end = tagEnd(rest, lead, rest.length, { '"': positions(rest, '"'), "'": positions(rest, "'") });
  return end !== -1 && rest.slice(end).trim() === "";
}

/**
 * A line of raw HTML from `from` on (an HTML block, or what follows a comment's `-->`): Marked lets it through as it
 * is, so a `<!--` never closed on it opens a comment the browser reads to its `-->`, else to the end. The comments
 * closed on the line are left to the inline reading.
 */
function rawFrom(s, line, from) {
  for (let i = line.indexOf("<!--", from); i !== -1;) {
    const end = line.indexOf("-->", i + 2);
    if (end === -1) {
      s.comment = true;
      return line.slice(0, i) + blank(line.slice(i));
    }
    i = line.indexOf("<!--", end + 3);
  }
  return line;
}

/** A line of an HTML block that runs to its closing tag (RAW_BLOCK), from `from` on: kept as it is, or blanked for a
 * script or a style sheet, up to that tag. */
function rawBlockLine(s, line, from) {
  const close = line.toLowerCase().indexOf(s.raw.close, from);
  const end = close === -1 ? line.length : close + s.raw.close.length;
  const text = s.raw.hidden ? line.slice(0, from) + blank(line.slice(from, end)) + line.slice(end) : line;
  if (close !== -1) {
    s.raw = null;
    s.canStartCode = true;
  }
  return { text, cut: false, cutAfter: close !== -1 };
}

/** The HTML block a line opens, as Marked's rule reads one: to its closing tag for RAW_BLOCK; else, for a block tag, or
 * out of a paragraph a whole tag alone on its line, to a blank line. Null when it opens none. */
function htmlOpening(s, line, rest, inParagraph) {
  const raw = RAW_BLOCK.exec(rest);
  if (raw) {
    s.raw = { close: `</${raw[1].toLowerCase()}>`, hidden: /^(?:script|style)$/i.test(raw[1]) };
    return { ...rawBlockLine(s, line, line.length - rest.length + raw[0].lastIndexOf("<")), cut: true };
  }
  if (!HTML_BLOCK.test(rest) && (inParagraph || !tagAlone(rest))) return null;
  s.html = true;
  return { text: rawFrom(s, line, 0), cut: true };
}

/** A line inside an HTML comment opened at the start of an earlier line: blanked up to its `-->`, if it has one. */
function commentLine(s, line) {
  const end = line.indexOf("-->");
  if (end === -1) return { text: blank(line), cut: true };
  s.comment = false;
  s.canStartCode = true;
  return { text: rawFrom(s, blank(line.slice(0, end + 3)) + line.slice(end + 3), end + 3), cut: true, cutAfter: true };
}

/** A line inside a fenced code block: blanked; the fence closes on its closing line, or with its container. */
function fenceLine(s, line) {
  const q = quoteOf(line, s.fence.depth); // a line of the code may begin with ">" too
  const rest = line.slice(q.at);
  if (q.depth < s.fence.depth || (rest.trim() !== "" && indentOf(rest) < s.fence.indent)) {
    s.fence = null; // the blockquote or the list item it sits in has ended: this line is read again
    s.canStartCode = true;
    return null;
  }
  const end = FENCE_END.exec(rest);
  const { mark, indent } = s.fence;
  // As Marked closes one: a line that starts with the opening run (``` closes ```, ```` and ```~~).
  if (end && end[1].startsWith(mark) && indentOf(rest) - indent <= 3) s.fence = null;
  s.canStartCode = !s.fence;
  return { text: blank(line), cut: true, cutAfter: !s.fence };
}

/** What opens a block on a line of text, after its list marker (`content`): a fence, an HTML comment, or neither. */
function blockOpening(s, line, { q, item, content, rel, box, inParagraph }) {
  const open = rel <= 3 ? FENCE.exec(content) : null;
  if (open && !(open[1][0] === "`" && content.slice(open[0].length).includes("`"))) {
    s.fence = { mark: open[1], depth: q.depth, indent: box };
    return { text: blank(line), cut: true };
  }
  const lead = content.length - content.trimStart().length;
  // A comment opens a block at the start of a line; in a paragraph, only at the container's first column.
  if (!content.startsWith("<!--", lead) || rel > 3 || (inParagraph && rel > 0)) return null;
  const at = q.at + (item ? item.at : 0) + lead;
  const end = line.indexOf("-->", at + 2);
  if (end !== -1) {
    s.canStartCode = true;
    return {
      text: rawFrom(s, line.slice(0, at) + blank(line.slice(at, end + 3)) + line.slice(end + 3), end + 3),
      cut: true,
      cutAfter: true,
    };
  }
  s.comment = true; // to its `-->`, else to the end: a browser hides what follows the `<!--` Marked lets through
  return { text: line.slice(0, at) + blank(line.slice(at)), cut: true };
}

/**
 * One line of the block structure, read with the state `s` of the lines before it: blanked when it is code (fenced,
 * indented) or inside an HTML comment that opens a block; `cut` when a paragraph cannot go on into it (a code span, a
 * comment or a tag of one paragraph never ends in another), `cutAfter` when none goes on after it.
 */
function blockLine(s, line) {
  if (s.comment) return commentLine(s, line);
  if (s.raw) return rawBlockLine(s, line, 0);
  const inFence = s.fence && fenceLine(s, line);
  if (inFence) return inFence;
  const q = quoteOf(line);
  const rest = line.slice(q.at);
  const deeper = q.depth > s.depth;
  s.depth = q.depth;
  if (deeper) s.canStartCode = true;
  if (rest.trim() === "") {
    s.canStartCode = true;
    s.html = false;
    if (s.emptyItem) s.listIndent = -1; // an empty list item ends at a blank line: what follows is out of the list
    return { text: line, cut: true };
  }
  if (s.html) return { text: rawFrom(s, line, 0), cut: false }; // an HTML block, to a blank line: no Markdown in it
  return textLine(s, line, q, rest, deeper);
}

/** The list item a line opens, its content column the list's now; or, after a blank line, a line less indented than
 * the list's text: out of that list (back in the item above it, or out of every one). */
function followList(s, rest, indent, afterBlank) {
  const item = listItemOf(rest);
  if (item) s.listIndent = item.col;
  else if (afterBlank && s.listIndent >= 0 && indent < s.listIndent) s.listIndent = indent > 0 ? indent : -1;
  return item;
}

/** A line that is neither blank nor in a fence, a comment or an HTML block: what it opens, or text. */
function textLine(s, line, q, rest, deeper) {
  const indent = indentOf(rest);
  if ((s.canStartCode || s.inCode) && indent >= Math.max(s.listIndent, 0) + 4) {
    s.inCode = true;
    return { text: blank(line), cut: true };
  }
  const afterBlank = s.canStartCode && !s.inCode;
  const inParagraph = !s.canStartCode;
  s.inCode = false;
  const html = htmlOpening(s, line, rest, inParagraph);
  if (html) return html;
  const item = followList(s, rest, indent, afterBlank);
  const content = item ? rest.slice(item.at) : rest;
  if (item && item.code) {
    s.inCode = true;
    return { text: line.slice(0, q.at + item.marker) + blank(line.slice(q.at + item.marker)), cut: true };
  }
  const box = item || (s.listIndent >= 0 && indent >= s.listIndent) ? s.listIndent : 0;
  const opened = blockOpening(s, line, { q, item, content, rel: item ? 0 : indent - box, box, inParagraph });
  if (opened) return opened;
  const heading = HEADING.test(content);
  const rule = RULE.test(content);
  s.emptyItem = !!item && content.trim() === "";
  s.canStartCode = heading || s.emptyItem; // an empty item: its text starts on the next line
  return { text: line, cut: !!item || heading || rule || deeper, cutAfter: heading || rule };
}

/**
 * The blocks that are never text, blanked (ARCHITECTURE.md §6.10), as Marked reads them: fenced code blocks (``` or
 * ~~~, to the closing fence of the same character and at least the same length, else to the end of the blockquote or
 * list item they sit in), indented code blocks (four columns beyond the list item they sit in, after a blank line, a
 * heading or another block, in a blockquote too), HTML comments that open a block (to their `-->`, else to the end).
 * One pass. `cuts`: where a paragraph ends, in order.
 */
function blankBlocks(markdown) {
  const lines = markdown.split("\n");
  // The state of the lines read so far: an open fence, comment or HTML block; whether an indented line would be code
  // (after a blank line, a heading or a block) or goes on with code; the content column of the list item; the
  // blockquote depth; whether the last item was empty.
  const s = {
    fence: null,
    comment: false,
    html: false,
    canStartCode: true,
    inCode: false,
    listIndent: -1,
    depth: 0,
    emptyItem: false,
    raw: null,
  };
  const cuts = [];
  let offset = 0;
  for (let n = 0; n < lines.length; n++) {
    const { text, cut, cutAfter } = blockLine(s, lines[n]);
    if (cut) cuts.push(offset);
    offset += lines[n].length + 1;
    if (cutAfter) cuts.push(offset);
    lines[n] = text;
  }
  return { text: lines.join("\n"), cuts };
}

/** The positions of `needle` in `text`, in order. */
function positions(text, needle) {
  const out = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/** The first of the sorted positions at `i` or after it, -1 when there is none (a binary search). */
function firstFrom(sorted, i) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < i) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length ? sorted[lo] : -1;
}

const SPACE = /\s/;
const TAG_NAME = /[A-Za-z0-9-]/;
const ATTRIBUTE_START = /[A-Za-z:_]/;
const ATTRIBUTE_NAME = /[\w.:-]/;
const UNQUOTED = /[^\s"'=<>`]/;

/** The end of the attribute at `i` (its spaces, its name, its value if it has one), -1 when there is none. */
function attributeEnd(text, i, limit, quotes) {
  let j = i;
  while (j < limit && SPACE.test(text[j])) j++;
  if (j === i || j >= limit || !ATTRIBUTE_START.test(text[j])) return -1;
  j++;
  while (j < limit && ATTRIBUTE_NAME.test(text[j])) j++;
  let k = j;
  while (k < limit && SPACE.test(text[k])) k++;
  if (k >= limit || text[k] !== "=") return j;
  k++;
  while (k < limit && SPACE.test(text[k])) k++;
  if (k < limit && (text[k] === '"' || text[k] === "'")) {
    const close = firstFrom(quotes[text[k]], k + 1);
    return close !== -1 && close < limit ? close + 1 : j;
  }
  let e = k;
  while (e < limit && UNQUOTED.test(text[e])) e++;
  return e > k ? e : j;
}

/**
 * The end of the HTML tag at `s`, as Marked reads one (a name, attributes, `>`), before `limit`; -1 when it is none
 * (`a <b then` is text). Each character is read once, a quoted value found in `quotes` (RULES.md S5).
 */
function tagEnd(text, s, limit, quotes) {
  const closing = text[s + 1] === "/";
  let i = s + (closing ? 3 : 2);
  while (i < limit && TAG_NAME.test(text[i])) i++;
  if (!closing)
    for (let next = attributeEnd(text, i, limit, quotes); next !== -1; next = attributeEnd(text, i, limit, quotes))
      i = next;
  while (i < limit && SPACE.test(text[i])) i++;
  if (!closing && text[i] === "/") i++;
  return i < limit && text[i] === ">" ? i + 1 : -1;
}

/** What opens an inline part: an escaped character, a run of backticks, a comment or a tag. */
const INLINE = /\\[^\n]|`+|<(?:!--|\/?[A-Za-z])/g;

/**
 * The inline parts of a text whose blocks are read (`cuts`: where its paragraphs end), from left to right, as Marked
 * reads them, the first one opened winning: the code spans (a run of backticks to the next run of the same length),
 * and what is never text — the HTML comments closed in their paragraph and the tags spread over several lines; the
 * tags on one line (`tags`), never rewritten either. A backtick or a `<` in a code span opens nothing, and one in a
 * comment or a tag is no code span.
 * @returns {{ spans: Array<[number, number, number]>, hidden: Array<[number, number]>, tags: Array<[number, number]> }}
 *   spans: [from, to, ticks]
 */
function inlineParts(text, cuts) {
  const runs = new Map(); // the start of each run of backticks, by length: where a code span may close
  for (const m of text.matchAll(/`+/g))
    (runs.get(m[0].length) ?? runs.set(m[0].length, []).get(m[0].length)).push(m.index);
  const closes = positions(text, "-->");
  const quotes = { '"': positions(text, '"'), "'": positions(text, "'") };
  /** @type {Array<[number, number, number]>} */
  const spans = [];
  /** @type {Array<[number, number]>} */
  const hidden = [];
  /** @type {Array<[number, number]>} */
  const tags = [];
  INLINE.lastIndex = 0;
  for (let m; (m = INLINE.exec(text));) {
    const [s, token] = [m.index, m[0]];
    if (token[0] === "\\") continue;
    const cut = firstFrom(cuts, s + 1);
    const limit = cut === -1 ? text.length : cut;
    let end = -1;
    if (token[0] === "`") {
      const close = firstFrom(runs.get(token.length) || [], s + token.length);
      if (close !== -1 && close < limit) spans.push([s, (end = close + token.length), token.length]);
    } else if (token === "<!--") {
      const close = firstFrom(closes, s + 2);
      if (close !== -1 && close + 3 <= limit) hidden.push([s, (end = close + 3)]);
    } else {
      end = tagEnd(text, s, limit, quotes);
      if (end !== -1) (text.slice(s, end).includes("\n") ? hidden : tags).push([s, end]);
    }
    if (end !== -1) INLINE.lastIndex = end;
  }
  return { spans, hidden, tags };
}

/** The text with the [from, to) ranges given (in order, apart) blanked. */
export function blankRanges(text, ranges) {
  let out = "";
  let last = 0;
  for (const [a, b] of ranges) {
    out += text.slice(last, a) + blank(text.slice(a, b));
    last = b;
  }
  return out + text.slice(last);
}

/** The Markdown read as Marked reads it: what is never text blanked (`prose`), its code spans and its tags on one
 * line. */
export function readMarkdown(markdown) {
  const { text, cuts } = blankBlocks(markdown);
  const { spans, hidden, tags } = inlineParts(text, cuts);
  return { prose: blankRanges(text, hidden), spans, tags };
}

/**
 * The Markdown without what the site never shows as text, blanked (each character but a line end as NUL, so that an
 * index still points at the same character): code blocks, HTML comments and tags over several lines, as Marked, the
 * kit's renderer, reads them. A label there is neither cited nor rewritten (ARCHITECTURE.md §6.10).
 */
export const proseOf = (markdown) => readMarkdown(markdown).prose;
