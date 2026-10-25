// The text a page shows, read in the HTML of the kit's renderer (ARCHITECTURE.md §6.10): the oracle of `sync`'s
// labels. A label is cited where the rendered page shows it as text (shownText), and `--apply --labels` keeps a
// rewrite only when the page renders as it did but for the label's text (rendersAsBefore). The HTML is read the way
// a browser's tokenizer reads it — text, tags and their attributes, comments, the raw text of a script — in one pass,
// each character read once, with no regular expression (RULES.md S5).
import { wholeIndexes } from "../core/text.mjs";
import { decodeEntities } from "../core/xml.mjs";

/** Elements whose content is raw text up to their closing tag, never shown as text here: a script, a style sheet, a
 * text field, a title, a frame's fallback (the raw text and escapable raw text elements of HTML). */
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);
/** Elements whose text is never shown as text (a code block, a template), counted while they are open. */
const HIDING = ["pre", "listing", "template"];
/** Inline elements: their text runs on with the text around them (`<strong>Approve</strong> all` reads
 * "Approve all"). Any other tag ends a run, as a block or a line break does on the page. */
const INLINE = new Set(
  (
    "a abbr b bdi bdo cite code data del dfn em font i img ins kbd label mark q s samp small span strike strong sub " +
    "sup time tt u var"
  ).split(" "),
);
/** The attributes whose text the site shows: an image's text, a tooltip. */
const SHOWN_ATTRIBUTES = new Set(["alt", "title"]);
/** The boundaries of HTML's scope: an end tag never closes an element opened outside one. */
const SCOPE = ["applet", "caption", "html", "table", "td", "th", "marquee", "object", "template"];
/** The start tags that close an open paragraph first (HTML: "close a p element"). */
const CLOSES_P = new Set(
  (
    "address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer form h1 h2 " +
    "h3 h4 h5 h6 header hgroup hr li listing main menu nav ol p plaintext pre search section summary table ul xmp"
  ).split(" "),
);
/** The elements that are never open: no end tag, nothing inside. */
const VOID = new Set("area base br col embed hr img input keygen link meta param source track wbr".split(" "));
/** How many readings of a text run rendersAsBefore follows at once (a label kept or renamed at each place): past them
 * a rewrite is refused, never accepted — the bound keeps it linear. */
const READINGS = 4;

/** A blank of HTML: a space, a tab, a line end, a form feed. */
export const isBlank = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
const isLetter = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

/** Whether `html` holds the ASCII letters of `name` at `at`, in any case. */
function namedAt(html, at, name) {
  for (let k = 0; k < name.length; k++) {
    const c = html[at + k];
    if (c === undefined || c.toLowerCase() !== name[k]) return false;
  }
  return true;
}

/** The end of the raw text of the element `name` opened before `from`: its closing tag, or the end of the HTML. */
function rawEnd(html, from, name) {
  for (let i = html.indexOf("</", from); i !== -1; i = html.indexOf("</", i + 2)) {
    const after = html[i + 2 + name.length];
    if (namedAt(html, i + 2, name) && (after === undefined || isBlank(after) || after === "/" || after === ">"))
      return i;
  }
  return html.length;
}

/**
 * The tag that opens at `at` (`<name` or `</name`): its name in lower case, its attributes, and its end — the HTML's
 * end when it never closes (a browser drops it then, and what follows with it). A quoted value runs to its quote: a
 * `>` in it does not end the tag.
 */
function tagAt(html, at, closing) {
  let i = at + (closing ? 2 : 1);
  const from = i;
  while (i < html.length && !isBlank(html[i]) && html[i] !== "/" && html[i] !== ">") i++;
  const tag = { type: "tag", name: html.slice(from, i).toLowerCase(), closing, attributes: [], end: html.length };
  for (;;) {
    while (i < html.length && (isBlank(html[i]) || html[i] === "/")) i++;
    if (i >= html.length) return tag;
    if (html[i] === ">") return { ...tag, end: i + 1 };
    const name = i;
    i++; // a first "=" is part of the name
    while (i < html.length && !isBlank(html[i]) && html[i] !== "/" && html[i] !== ">" && html[i] !== "=") i++;
    const value = valueAt(html, i);
    if (!value) return tag;
    tag.attributes.push([html.slice(name, i).toLowerCase(), value.text]);
    i = value.end;
  }
}

/** The value of the attribute whose name ends at `i` (`= "…"`, `= '…'`, `=x`, or none: ""), and where it ends; null
 * when its quote never closes (the tag runs to the end then). */
function valueAt(html, i) {
  let j = i;
  while (j < html.length && isBlank(html[j])) j++;
  if (html[j] !== "=") return { text: "", end: i };
  j++;
  while (j < html.length && isBlank(html[j])) j++;
  const quote = html[j];
  if (quote === '"' || quote === "'") {
    const close = html.indexOf(quote, j + 1);
    return close === -1 ? null : { text: html.slice(j + 1, close), end: close + 1 };
  }
  const start = j;
  while (j < html.length && !isBlank(html[j]) && html[j] !== ">") j++;
  return { text: html.slice(start, j), end: j };
}

/**
 * The comments of an HTML text, read in order: where the one opened at `at` ends — `<!-->` and `<!--->` are empty, any
 * other runs to its `-->` or `--!>`, else to the end. The next of each closing is kept, so that a text of many comments
 * is searched once, whichever closing they use.
 */
function commentReader(html) {
  // The next "-->" and "--!>" at or after the last search: -1 when there is none, -2 before the first search.
  const next = { "-->": -2, "--!>": -2 };
  const nextFrom = (close, from) => {
    if (next[close] !== -1 && next[close] < from) next[close] = html.indexOf(close, from);
    return next[close] === -1 ? Infinity : next[close] + close.length;
  };
  return (at) => {
    if (html.startsWith(">", at + 4)) return at + 5;
    if (html.startsWith("->", at + 4)) return at + 6;
    return Math.min(html.length, nextFrom("-->", at + 4), nextFrom("--!>", at + 4));
  };
}

/** What the `<` at `at` opens — a comment, a declaration, a tag — and where it ends; null when it is text. */
function markupAt(html, at, commentEnd) {
  const next = html[at + 1];
  if (html.startsWith("<!--", at)) return { type: "other", end: commentEnd(at) };
  const upToGreater = (from) => {
    const i = html.indexOf(">", from);
    return { type: "other", end: i === -1 ? html.length : i + 1 };
  };
  if (next === "!" || next === "?") return upToGreater(at + 2);
  if (next === "/") {
    if (isLetter(html[at + 2])) return tagAt(html, at, true);
    // `</>` and `</ x>` are dropped; a `</` at the end is text.
    return at + 2 < html.length ? upToGreater(at + 2) : null;
  }
  return isLetter(next) ? tagAt(html, at, false) : null;
}

/**
 * The HTML as a browser's tokenizer reads it: text runs, tags (name, attributes), and the rest (comments,
 * declarations, the raw text of a script or a style sheet), each with its `raw` text. A `<wbr>` (a place where a line
 * may break, which the renderer adds in long code) is no token: the text around it is one run.
 * @param {string} html
 * @returns {Array<{ type: string, raw: string, name?: string, closing?: boolean,
 *   attributes?: Array<[string, string]> }>}  type: "text", "tag" or "other"
 */
function htmlTokens(html) {
  const tokens = [];
  const commentEnd = commentReader(html);
  let run = "";
  const flush = () => {
    if (run) tokens.push({ type: "text", raw: run });
    run = "";
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      run += html.slice(i);
      break;
    }
    const markup = markupAt(html, lt, commentEnd);
    if (!markup) {
      run += html.slice(i, lt + 1);
      i = lt + 1;
      continue;
    }
    run += html.slice(i, lt);
    i = markup.end;
    if (markup.type === "tag" && markup.name === "wbr") continue;
    flush();
    const { end, ...token } = markup;
    tokens.push({ ...token, raw: html.slice(lt, end) });
    if (markup.type === "tag" && !markup.closing && (RAW.has(markup.name) || markup.name === "plaintext")) {
      const rawTo = markup.name === "plaintext" ? html.length : rawEnd(html, i, markup.name);
      if (rawTo > i) tokens.push({ type: "other", raw: html.slice(i, rawTo) });
      i = rawTo;
    }
  }
  flush();
  return tokens;
}

/** Whether a tag opens a badge of the kit's renderer (`[[menu …]]` and the others, `[[key …]]`): its text is the
 * badge's. */
const isBadge = (tag) =>
  tag.name === "kbd" ||
  (tag.name === "span" &&
    tag.attributes.some(
      ([name, value]) => name === "class" && value.split(" ").some((c) => c === "puce" || c.startsWith("ref-")),
    ));

/**
 * The elements open while the HTML is read, as a browser's tree builder keeps them, for what decides where a text
 * sits: an end tag closes its element and every one opened inside it (`</blockquote>` closes a `<pre>` left open in
 * it), unless a boundary of HTML's scope stands above it (a table, a cell) — then it closes nothing; a block's start
 * tag closes an open paragraph, an item's an open item. Void elements are never open. Each name's places in the stack
 * are kept, and how many of the open elements are bold or a badge, so that a tag costs the same whatever the depth
 * (RULES.md S5). Not followed: the formatting elements a browser opens again after a block (a `<code>` left open in
 * raw HTML), read as closed.
 */
function openElements() {
  const stack = [];
  /** @type {Map<string, number[]>} */
  const places = new Map();
  const marks = []; // for each open element: "bold", "badge" or null
  const counts = { bold: 0, badge: 0 };
  const top = (name) => places.get(name)?.at(-1) ?? -1;
  const highest = (names) => names.reduce((max, name) => Math.max(max, top(name)), -1);
  const popTo = (i) => {
    while (stack.length > i) {
      places.get(stack.pop()).pop();
      const mark = marks.pop();
      if (mark) counts[mark]--;
    }
  };
  /** Closes `name` with what was opened in it, when it is open in scope (`boundaries`, and `extra`). */
  const close = (name, extra = []) => {
    const at = top(name);
    if (at !== -1 && at >= highest([...SCOPE, ...extra])) popTo(at);
  };
  return {
    /** @param {{ name: string, closing: boolean, attributes: Array<[string, string]> }} tag */
    read(tag) {
      if (tag.closing) return close(tag.name);
      if (CLOSES_P.has(tag.name)) close("p", ["button"]);
      if (tag.name === "li") close("li", ["ol", "ul"]);
      if (VOID.has(tag.name)) return;
      (places.get(tag.name) ?? places.set(tag.name, []).get(tag.name)).push(stack.length);
      stack.push(tag.name);
      const mark = tag.name === "strong" || tag.name === "b" ? "bold" : isBadge(tag) ? "badge" : null;
      marks.push(mark);
      if (mark) counts[mark]++;
    },
    /** Where a text read now sits: "hidden" in a code block or a template, "code" in a code span, "text" elsewhere. */
    place: () => (highest(HIDING) !== -1 ? "hidden" : top("code") !== -1 ? "code" : "text"),
    /** Whether a text read now is in bold or in a badge: a context `--apply --labels` rewrites. */
    inContext: () => counts.bold + counts.badge > 0,
  };
}

/** The tokens, each text run with where it sits and whether it is in bold or a badge (openElements). */
function placed(tokens) {
  const open = openElements();
  return tokens.map((token) => {
    if (token.type === "tag") open.read(token);
    return token.type === "text" ? { ...token, place: open.place(), inContext: open.inContext() } : token;
  });
}

/** A text of the HTML with its character references read: XML's (`&amp;`, `&#39;`, `&#x2019;`, engine/core/xml.mjs)
 * and `&nbsp;`. */
const decode = (text) => decodeEntities(text.includes("&nbsp;") ? text.replaceAll("&nbsp;", "\u00a0") : text);

/** Each run of blanks (space, tab, line end, form feed) as one space, as a browser shows a text. */
export function collapse(text) {
  let out = "";
  let blank = false;
  for (const c of text) {
    if (!isBlank(c)) out += c;
    else if (!blank) out += " ";
    blank = isBlank(c);
  }
  return out;
}

/**
 * The text a page shows, read from its tokens (placed): each text run outside a code block, a template, a comment, a
 * script, a style sheet or a text field — a code span's included —, references read and blanks collapsed, a run of
 * blanks across an inline element or a comment as one too; a block or a line break as a line end; then, one per line,
 * the `alt` and `title` of its elements. `breaks`: where an inline element starts or ends; `offsets`: for each text
 * run shown, where its collapsed text starts in `text` (a blank it begins with that was merged with the one before:
 * that one's place).
 */
function readShown(tokens) {
  let text = "";
  let last = ""; // the last character of `text`: read from the text, each read would flatten it again (quadratic)
  const breaks = new Set();
  const offsets = new Map();
  const attributes = [];
  tokens.forEach((token, k) => {
    if (token.type === "tag") {
      if (INLINE.has(token.name)) breaks.add(text.length);
      else [text, last] = [text + "\n", "\n"];
      for (const [name, value] of token.attributes)
        if (SHOWN_ATTRIBUTES.has(name)) attributes.push(collapse(decode(value)));
    } else if (token.type === "text" && token.place !== "hidden") {
      const run = collapse(decode(token.raw));
      const merged = run[0] === " " && last === " ";
      offsets.set(k, text.length - (merged ? 1 : 0));
      text += merged ? run.slice(1) : run;
      if (run.length > (merged ? 1 : 0)) last = run[run.length - 1];
    }
  });
  for (const value of attributes) text += "\n" + value;
  return { text, breaks, offsets };
}

/**
 * The text a rendered page shows (ARCHITECTURE.md §6.10): its text runs outside a code block (`pre`), a template, a
 * comment, a script, a style sheet or a text field — a code span's included —, character references read and blanks
 * collapsed as a browser shows them; a block or a line break as a line end, so that a phrase never runs from one block
 * into the next; then, one per line, the alternative texts and the titles of its elements (`alt`, `title`: an image's
 * text, a tooltip). `breaks`: where an inline element starts or ends in it — a word ends there on the page whatever
 * follows (`<code>Approve</code><strong>Approve</strong>` shows two), and a phrase runs on
 * (`<strong>Approve</strong> all`).
 * @param {string} html
 * @returns {{ text: string, breaks: Set<number> }}
 */
export function shownText(html) {
  const { text, breaks } = readShown(placed(htmlTokens(html)));
  return { text, breaks };
}

/** Whether `a` holds `b.slice(from, to)` at `at`. */
function holdsAt(a, at, b, from, to) {
  if (at < 0 || at + (to - from) > a.length) return false;
  for (let k = from; k < to; k++) if (a[at + k - from] !== b[k]) return false;
  return true;
}

/**
 * The quotes of a shown text, for `inside(from, to)`: whether that part of it sits between quotes of one line — after
 * an odd number of `"` with one more after it, or between `«` and `»`, `“` and `”` with no other mark of them between.
 * Each array is built in one pass: a question costs the same whatever the text.
 */
function quotesOf(text) {
  const n = text.length;
  const straight = new Int32Array(n + 1); // the `"` before each index
  const lineStart = new Int32Array(n + 1);
  const lastMark = new Int32Array(n + 1); // the last `«`, `»`, `“` or `”` before each index, -1 when none
  lastMark[0] = -1;
  for (let i = 0; i < n; i++) {
    straight[i + 1] = straight[i] + (text[i] === '"' ? 1 : 0);
    lineStart[i + 1] = text[i] === "\n" ? i + 1 : lineStart[i];
    lastMark[i + 1] = "«»“”".includes(text[i]) ? i : lastMark[i];
  }
  const lineEnd = new Int32Array(n + 1);
  const nextMark = new Int32Array(n + 1); // the first such mark at or after each index, -1 when none
  lineEnd[n] = n;
  nextMark[n] = -1;
  for (let i = n - 1; i >= 0; i--) {
    lineEnd[i] = text[i] === "\n" ? i : lineEnd[i + 1];
    nextMark[i] = "«»“”".includes(text[i]) ? i : nextMark[i + 1];
  }
  const pairs = { "«": "»", "“": "”" };
  return {
    inside(from, to) {
      const [start, end] = [lineStart[from], lineEnd[to]];
      if ((straight[from] - straight[start]) % 2 === 1 && straight[end] - straight[to] > 0) return true;
      const [before, after] = [lastMark[from], nextMark[to]];
      return before >= start && after !== -1 && after < end && pairs[text[before]] === text[after];
    },
  };
}

/**
 * The places of a shown text where it holds `value` whole (its forms, `breaks` as word ends), for
 * `contains(from, to)`: whether one of them holds that part — there, the page already says the new value, and the
 * old one inside it is no label to rename (`Approval chain` in `Approval chain history`).
 */
function heldIn({ text, breaks }, value) {
  const ranges = [...new Set([value, value.normalize("NFC"), value.normalize("NFD")])]
    .flatMap((form) => wholeIndexes(text, form, breaks).map((i) => [i, i + form.length]))
    .sort((a, b) => a[0] - b[0]);
  const reach = [];
  for (const [, end] of ranges) reach.push(Math.max(end, reach.at(-1) ?? -1));
  return {
    contains(from, to) {
      let [lo, hi] = [0, ranges.length];
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ranges[mid][0] <= from) lo = mid + 1;
        else hi = mid;
      }
      return lo > 0 && reach[lo - 1] >= to;
    },
  };
}

/**
 * Whether the text run `after` is the run `before` with some of the places where it holds the label whole (`places`)
 * renamed `value`, each renamed one `allowed`, and the rest unchanged. Each place is kept or renamed; the readings
 * still possible are followed together, READINGS at most (a run read in more ways than that is refused: never a
 * rewrite accepted that is not one).
 */
function renamedIn(before, after, places, value, allowed) {
  let shifts = [0]; // for each reading: the index in `after` of an index of `before`, less that index
  let pos = 0;
  for (const [i, length] of places) {
    if (i < pos) continue;
    const next = [];
    for (const d of shifts) {
      if (!holdsAt(after, pos + d, before, pos, i)) continue;
      if (holdsAt(after, i + d, before, i, i + length)) next.push(d);
      if (after.startsWith(value, i + d) && allowed(i, length)) next.push(d + value.length - length);
    }
    shifts = [...new Set(next)].slice(0, READINGS);
    if (!shifts.length) return false;
    pos = i + length;
  }
  return shifts.some((d) => after.length - before.length === d && holdsAt(after, pos + d, before, pos, before.length));
}

/** Whether a code span's text `after` is `before` that held the label alone (`forms`, blanks around it aside) renamed
 * `value`: a code span is renamed only when it is the label itself. */
function codeRenamed(before, after, forms, value) {
  const lead = before.length - before.trimStart().length;
  const core = before.trim();
  const end = lead + core.length;
  return forms.includes(core) && after === before.slice(0, lead) + value + before.slice(end);
}

/**
 * Whether the page rendered `after` is the page rendered `before` with the label (`forms`: its forms as written)
 * renamed `value` in its text, and nothing else (ARCHITECTURE.md §6.10, `--apply --labels`): the same tags with the
 * same attributes (the targets of its links, its anchors, the titles of its images), the same comments and code
 * blocks — only text runs differ, as the page shows them (references read, blanks collapsed), each by the label
 * renamed in places where it is whole, in a context `--apply --labels` rewrites as the page shows it (bold, a badge,
 * between quotes of one line; a code span only when it is the label itself), never where the page already holds the
 * new value — and at least one place renamed.
 * @param {string} before   HTML
 * @param {string} after    HTML
 * @param {string[]} forms
 * @param {string} value
 */
export function rendersAsBefore(before, after, forms, value) {
  const a = placed(htmlTokens(before));
  const b = placed(htmlTokens(after));
  if (a.length !== b.length) return false;
  const shownForms = forms.map(collapse);
  const shownValue = collapse(value);
  const shown = readShown(a);
  const quotes = quotesOf(shown.text);
  const held = heldIn(shown, shownValue);
  let renamed = false;
  for (let k = 0; k < a.length; k++) {
    const [x, y] = [a[k], b[k]];
    if (x.raw === y.raw) continue;
    if (x.type !== "text" || y.type !== "text" || x.place === "hidden") return false;
    const [from, to] = [collapse(decode(x.raw)), collapse(decode(y.raw))];
    if (from === to) continue;
    const at = shown.offsets.get(k);
    const allowed = (i, length) =>
      !held.contains(at + i, at + i + length) && (x.inContext || quotes.inside(at + i, at + i + length));
    const places = shownForms
      .flatMap((f) => wholeIndexes(from, f).map((i) => [i, f.length]))
      .sort((p, q) => p[0] - q[0]);
    const ok =
      x.place === "code"
        ? codeRenamed(from, to, shownForms, shownValue)
        : renamedIn(from, to, places, shownValue, allowed);
    if (!ok) return false;
    renamed = true;
  }
  return renamed;
}
