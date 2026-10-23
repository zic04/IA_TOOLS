// Scanning TOML text one character at a time (engine/facts/deps/read.mjs reads TOML with it): its quoted strings,
// and the values that run over several lines — arrays and inline tables, followed to where they close, and what no
// TOML value holds a doubt. No regular expression: the manifests are untrusted (RULES.md S5); each character is
// read once.

/**
 * Steps over one character of a text read for its quoted strings (" or ', and the triple """ and ''' of TOML,
 * Groovy and Kotlin, one token each), from the quote `state.quote` it is in: the index of the last character this step
 * read, and the new quote in `state`. A backslash escapes the next character in "…" and """…""". Linear: each character
 * is read once.
 * @param {string} text
 * @param {number} i
 * @param {{ quote: string }} state
 * @returns {number}
 */
export function stepQuotes(text, i, state) {
  const c = text[i];
  const { quote } = state;
  if (quote) {
    if (c === "\\" && quote[0] === '"') return i + 1;
    if (c !== quote[0]) return i;
    if (quote.length === 1) {
      state.quote = "";
      return i;
    }
    // A triple string ends at a run of 3 to 5 of its quotes: TOML lets one or two of them end its text.
    let run = 1;
    while (run < 5 && text[i + run] === c) run++;
    if (run >= 3) state.quote = "";
    return i + run - 1;
  }
  if (c !== '"' && c !== "'") return i;
  state.quote = text.startsWith(c + c + c, i) ? c + c + c : c;
  return i + state.quote.length - 1;
}

/** The bare words TOML reads as a value (a number or a date starts with a digit or a sign). */
const BARE_VALUES = new Set(["true", "false", "inf", "nan"]);
/** A character of a bare word, a number or a date (`upload-time`, `1_000`, `1979-05-27T07:32:00Z`, `+inf`). */
const wordChar = (c) =>
  (c >= "a" && c <= "z") ||
  (c >= "A" && c <= "Z") ||
  (c >= "0" && c <= "9") ||
  c === "_" ||
  c === "-" ||
  c === "+" ||
  c === "." ||
  c === ":";

/** What a backslash escapes in a TOML basic string (TOML 1.1's `\e` and `\xHH` included, which uv reads). */
const ESCAPES = new Set(["b", "t", "n", "f", "r", "e", '"', "\\", "u", "U", "x"]);

/**
 * @typedef {{ depth: number, quote: string, doubt?: boolean, frames: Array<{ array: boolean, key: boolean }>,
 *   ended?: boolean, bare?: boolean }} FollowedEntry
 *   `ended`: a value was read whole at the top level (what follows it but a comment is no TOML); `bare`: that value was
 *   a number or a date, which a time may follow after a blank (`1979-05-27 07:32:00`).
 */

/**
 * Follows `chunk` on from the state of `entry` (the arrays and inline tables it is in, the quote it is in): true when
 * they are closed again. A comment ends the chunk. What no TOML value holds is a doubt — the tool refuses the file,
 * where the kit, counting brackets, would read on: a bare word that is no value (`[[package]]` or `name = …` inside an
 * array), an `=` in an array, a table or an array where an inline table expects its key, a bracket closing another kind,
 * an escape a basic string does not know, a value followed by more than a comment (`"a" b`).
 * @param {FollowedEntry} entry
 * @param {string} chunk
 */
export function follow(entry, chunk) {
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    if (entry.quote || c === '"' || c === "'") i = quoteStep(entry, chunk, i);
    else if (c === "#")
      break; // a comment: the rest of the line
    else i = valueStep(entry, chunk, i);
  }
  // A one-line string ends with its line (TOML has no longer one): left open, the text is not TOML.
  if (entry.quote.length === 1) {
    entry.quote = "";
    entry.doubt = true;
  }
  if (entry.depth < 0) entry.doubt = true;
  return entry.depth <= 0 && !entry.quote;
}

/**
 * One character of a string, or the quote that opens one (stepQuotes): an escape a basic string does not know is a
 * doubt (a backslash that ends a line, or before blanks, continues a multi-line one); a string at the top level is a
 * value, and one after a value is no TOML. The index of the last character read.
 * @param {FollowedEntry} entry
 * @param {string} chunk
 * @param {number} i
 */
function quoteStep(entry, chunk, i) {
  const opening = !entry.quote;
  if (opening && !entry.frames.length && entry.ended) entry.doubt = true;
  if (entry.quote[0] === '"' && chunk[i] === "\\") {
    const next = chunk[i + 1];
    const continued = entry.quote.length === 3 && (next === undefined || next === " " || next === "\t");
    if (!continued && !ESCAPES.has(next)) entry.doubt = true;
  }
  const at = stepQuotes(chunk, i, entry);
  if (!opening && !entry.quote && !entry.frames.length) {
    entry.ended = true;
    entry.bare = false;
  }
  return at;
}

/**
 * One character outside strings, read into `entry`: a bracket opens or closes an array or an inline table; inside one,
 * what follows is judged (wordStep), at the top level what follows a value (topStep). The index of the last character
 * read.
 * @param {FollowedEntry} entry
 * @param {string} chunk
 * @param {number} i
 */
function valueStep(entry, chunk, i) {
  const c = chunk[i];
  const top = entry.frames.at(-1);
  if (c === "[" || c === "{") {
    // A table or an array where an inline table expects its key, or after a value.
    if (top ? !top.array && top.key : entry.ended) entry.doubt = true;
    entry.frames.push({ array: c === "[", key: c === "{" });
    entry.depth++;
  } else if (c === "]" || c === "}") {
    if (top && top.array !== (c === "]")) entry.doubt = true; // a bracket closing another kind
    entry.frames.pop();
    entry.depth--;
    if (!entry.frames.length) {
      entry.ended = true;
      entry.bare = false;
    }
  } else if (top) return wordStep(entry, chunk, i, top);
  else return topStep(entry, chunk, i);
  return i;
}

/**
 * A character at the top level of a value, outside strings and brackets: a blank, or one bare value (a number, a date,
 * `true`…) — a time after a date (`1979-05-27 07:32:00`) apart, anything after a value is no TOML, nor is a character
 * no value starts with. The index of the last character read.
 * @param {FollowedEntry} entry
 * @param {string} chunk
 * @param {number} i
 */
function topStep(entry, chunk, i) {
  const c = chunk[i];
  if (c === " " || c === "\t") return i;
  if (!wordChar(c)) {
    entry.doubt = true;
    return i;
  }
  let end = i;
  while (end < chunk.length && wordChar(chunk[end])) end++;
  const digit = (c >= "0" && c <= "9") || c === "+" || c === "-";
  if (entry.ended && !(entry.bare && digit)) entry.doubt = true;
  entry.ended = true;
  entry.bare = digit;
  return end - 1;
}

/**
 * Inside an array or an inline table: an `=` (in an array, or a second one in a pair: a doubt), a comma (an inline
 * table's next key), or a word — where a value is expected, only one TOML reads as a value. The index of the last
 * character read.
 * @param {{ doubt?: boolean }} entry
 * @param {string} chunk
 * @param {number} i
 * @param {{ array: boolean, key: boolean }} top
 */
function wordStep(entry, chunk, i, top) {
  const c = chunk[i];
  if (c === "=") {
    if (top.array || !top.key) entry.doubt = true;
    top.key = false;
  } else if (c === ",") top.key = !top.array;
  else if (wordChar(c) && (i === 0 || !wordChar(chunk[i - 1]))) {
    let end = i;
    while (end < chunk.length && wordChar(chunk[end])) end++;
    const letter = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
    if ((top.array || !top.key) && letter && !BARE_VALUES.has(chunk.slice(i, end))) entry.doubt = true;
    return end - 1;
  }
  return i;
}

/** Whether a line holds a character TOML refuses anywhere: a control character but a tab, DEL. One pass: linear. */
export function hasControl(line) {
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    if ((code < 0x20 && code !== 9) || code === 0x7f) return true;
  }
  return false;
}
