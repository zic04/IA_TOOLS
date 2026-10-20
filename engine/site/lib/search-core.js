/* The search of the site, its pure part (ARCHITECTURE.md §6.1a, "Search"): what an entry of the index matches and how
   well — a term in the title before one in the text, at the start of a word before one inside it — the close words
   of a term the index does not hold (a typo: "ordrs" finds "orders"), and the marks of the terms found. The dialog,
   its keys and its spaces stay app.js's. A module of the site (engine/site/app.js, spliced in at its "@lib" line by
   the build, ARCHITECTURE.md §6.1a): it adds EXT.searchCore; the texts come normalised by app.js's `norm`. */
/* global EXT */

/** A letter or a digit, of any script. */
const WORD_CHAR = /^[\p{L}\p{N}]$/u;
const isWordChar = (ch) => ch !== undefined && WORD_CHAR.test(ch);

/** The terms of a query: its words of two characters or more, normalised. */
const termsOf = (q, norm) =>
  norm(q)
    .split(/\s+/)
    .filter((x) => x.length > 1);

/** How a term appears in a text: 0 absent, 1 inside a word, 2 at the start of one. */
function hit(text, term) {
  let found = 0;
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + 1)) {
    if (!isWordChar(text[i - 1])) return 2;
    found = 1;
  }
  return found;
}

/** Occurrences of a term in a text, at most four, one more when one starts a word. */
function occurrences(text, term) {
  let n = 0;
  let start = false;
  for (let i = text.indexOf(term); i >= 0 && n < 4; i = text.indexOf(term, i + 1)) {
    n++;
    start = start || !isWordChar(text[i - 1]);
  }
  return n + (start ? 1 : 0);
}

/** The score of one term in an entry: its title first, then its page's title, then its text. */
function termScore(e, term) {
  const inTitle = hit(e.nt, term);
  const inPage = hit(e.np, term);
  return (inTitle === 2 ? 12 : inTitle ? 8 : 0) + (inPage === 2 ? 4 : inPage ? 3 : 0) + occurrences(e.nx, term);
}

/**
 * The edits between two words (insert, delete, replace, swap two neighbours), or Infinity beyond `max`: the
 * comparison stops as soon as every way is beyond it.
 */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let before = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, before[j - 2] + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return Infinity;
    [before, prev] = [prev, row];
  }
  return prev[b.length] <= max ? prev[b.length] : Infinity;
}

/** The words of an index (three letters or more), once per index. */
const vocabularies = new WeakMap();
function vocabularyOf(index) {
  if (!vocabularies.has(index)) {
    const words = new Set();
    for (const e of index)
      for (const w of `${e.nt} ${e.np} ${e.nx}`.split(/[^\p{L}\p{N}]+/u)) if (w.length > 2) words.add(w);
    vocabularies.set(index, [...words]);
  }
  return vocabularies.get(index);
}

/**
 * The close words of a term no entry holds: one edit for 4 to 7 letters, two from 8, a whole word or its start; the
 * 8 closest — fewer edits first, a whole word before a start, then the order of the index.
 */
function closeWords(index, term) {
  const max = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0;
  if (!max) return [];
  const candidates = [];
  vocabularyOf(index).forEach((w, i) => {
    const whole = distance(term, w, max);
    const start = w.length > term.length ? distance(term, w.slice(0, term.length), max) : Infinity;
    const d = Math.min(whole, start);
    if (d <= max) candidates.push({ w, d, start: whole > d ? 1 : 0, i });
  });
  candidates.sort((a, b) => a.d - b.d || a.start - b.start || a.i - b.i);
  return candidates.slice(0, 8).map((c) => c.w);
}

/**
 * The entries a query matches, best first: each term (or, for a term no entry holds, one of its close words) in the
 * entry; a page entry slightly before its sections. `fuzzy`: the close words used.
 * @param {Array<{ a: string|null, nt: string, np: string, nx: string }>} index   the prepared index (app.js)
 * @param {string} q
 * @param {(s: string) => string} norm
 * @returns {{ found: Array<{ e: object, score: number, terms: string[] }>, fuzzy: string[] }}
 */
function match(index, q, norm) {
  const groups = termsOf(q, norm).map((term) => {
    const exact = index.some((e) => e.nt.includes(term) || e.np.includes(term) || e.nx.includes(term));
    return exact ? { words: [term], close: false } : { words: closeWords(index, term), close: true };
  });
  if (!groups.length || groups.some((g) => !g.words.length)) return { found: [], fuzzy: [] };
  const found = [];
  for (const e of index) {
    const all = `${e.nt} ${e.np} ${e.nx}`;
    let score = e.a ? 0 : 2;
    const terms = [];
    for (const g of groups) {
      const present = g.words.filter((w) => all.includes(w));
      if (!present.length) {
        score = -1;
        break;
      }
      const best = Math.max(...present.map((w) => termScore(e, w)));
      score += g.close ? Math.ceil(best / 2) : best;
      terms.push(...present);
    }
    if (score >= 0) found.push({ e, score, terms });
  }
  found.sort((a, b) => b.score - a.score);
  return { found, fuzzy: groups.filter((g) => g.close).flatMap((g) => g.words) };
}

/** A text with the terms found in it marked (<mark>), escaped. */
function mark(text, terms, norm, esc) {
  const n = norm(text);
  const ranges = [];
  for (const term of terms)
    for (let i = n.indexOf(term); i >= 0 && term; i = n.indexOf(term, i + term.length))
      ranges.push([i, i + term.length]);
  if (!ranges.length) return esc(text);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  let out = "";
  let pos = 0;
  for (const [a, b] of merged) {
    out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>";
    pos = b;
  }
  return out + esc(text.slice(pos));
}

EXT.searchCore = { match, mark };
