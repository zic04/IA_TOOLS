// Shared by the behaviour detectors (engine/facts/behaviour-*.mjs, ARCHITECTURE.md §6.9 source `behaviours`): the
// sink each detector pushes its signals into — which drops what sits in a comment, gives each signal its line and
// caps their number —, the literals a signal may keep, and the linear walks the detectors share (the comments of a
// file, the arguments of a call). A detector only reads the application's text; what it keeps of it is a name (a
// field, a parameter), a number, a word of a fixed list (asc, desc, email, a library) or a short list of values, each
// checked against a whitelist: never a string as written in the code, never a value for a field whose name says it is
// secret, never what looks like a key, a token or a long number (a card, a phone).
import { looksRandom, GENERIC } from "../check/secrets.mjs";

/** At most this many signals per file (engine/facts/behaviours.mjs caps the whole). */
const MAX_PER_FILE = 300;

/** A field or a parameter: an identifier, or up to three of them joined by "." (order.customer.name). */
const FIELD = /^[A-Za-z_$][\w$]{0,63}(?:\.[A-Za-z_$][\w$]{0,63}){0,2}$/;
/** A value of a list (a status, a choice): letters, digits, a few separators, 40 characters at most. */
const LIST_VALUE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-/&']{0,39}$/u;
/** An operation of an OpenAPI document: "GET /orders/{id}". */
const ROUTE = /^[A-Z]{3,7} \/[\w/{}:.*-]{0,200}$/;
/** A cron expression: digits, *, /, ",", "-", ?, L, W, # and blanks. */
export const CRON = /^[\d*/,\-?LW# ]{9,64}$/;
/** An interval of `schedule.every`: "10 minutes", "monday". */
const INTERVAL =
  /^\d{0,6} ?(?:seconds?|minutes?|hours?|days?|weeks?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
/** The name of a field whose value is never kept: a password, a secret, a key, a token, a card… */
const SECRET_NAME =
  /pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|private[-_]?key|access[-_]?key|credential|auth|signature|salt|otp|ssn|iban|card|cvv/i;
/** A PIN, as a word of the name (pin, pinCode, user_pin), never inside another word (spinner, pinned). */
const PIN = /(?:^|_)pin(?:_|$)/;
/** The words a signal may keep, by what it stands for. */
const WORDS = {
  type: new Set(["email", "url", "number", "date", "datetime-local", "tel", "search"]),
  library: new Set([
    "elasticsearch",
    "opensearch",
    "algoliasearch",
    "meilisearch",
    "typesense",
    "fuse",
    "minisearch",
    "flexsearch",
    "lunr",
    "nodemailer",
    "sendgrid",
    "resend",
    "postmark",
    "mailgun",
    "ses",
  ]),
};

/** A secret detector of the kit (an AWS key, a token of a known service…) finds something in the text. */
const detected = (s) =>
  GENERIC.some((d) => {
    d.re.lastIndex = 0;
    for (const m of s.matchAll(d.re)) if (!d.accept || d.accept(m)) return true;
    return false;
  });

/**
 * Looks like a key or a token (10 characters or more, letters and digits mixed; or what a secret detector of the kit
 * finds), or holds a long number (a card, a phone).
 */
const unsafe = (s) => (s.length >= 10 && looksRandom(s)) || (s.match(/\d/g) || []).length >= 9 || detected(s);

/** Whether a field's name says its value is a secret (its value, its values and its default are never kept). */
const secretName = (field) => {
  if (typeof field !== "string") return false;
  const name = field.slice(0, 200);
  return SECRET_NAME.test(name) || PIN.test(name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
};

/** A letter outside a–z and A–Z (é, ü, ß…): a lowercase letter, and a vowel, to the walk below. */
const isOther = (c) => c !== undefined && c.charCodeAt(0) > 127;
const isLower = (c) => (c >= "a" && c <= "z") || isOther(c);
const isUpper = (c) => c >= "A" && c <= "Z";
const isDigit = (c) => c >= "0" && c <= "9";
const isVowel = (c) => "aeiouyAEIOUY".includes(c) || isOther(c);
/** A numeronym: a letter, one to three digits, three letters at most (k8s, i18n, a11y, x509, e2e, b2c). */
const NUMERONYM = /^[A-Za-z]\d{1,3}[A-Za-z]{0,3}$/;
/** The separators of a segment: each part between them is judged alone. */
const SEPARATORS = /[-_.:]/;

/** The end of the run of letters that starts at `i`: an acronym (capitals) stops before a capital starting a word. */
function letterRunEnd(part, i) {
  let j = i;
  if (isUpper(part[j])) {
    while (j < part.length && isUpper(part[j])) j++;
    if (j < part.length && isLower(part[j]) && j - i > 1) return j - 1;
  }
  while (j < part.length && isLower(part[j])) j++;
  return j;
}

/**
 * The shape of a run of letters from `i` to `j` of a part: "acronym" (five capitals at most), "pair" (a capital and
 * one lowercase letter: By, Id), "short" (one or two lowercase letters: a word only when it is the whole part),
 * "word" (three letters or more holding a vowel, never five consonants in a row), or null: no word.
 */
function runShape(part, i, j) {
  if (!isLower(part[j - 1])) return j - i <= 5 ? "acronym" : null;
  if (j - i === 2 && isUpper(part[i])) return "pair";
  if (j - i < 3) return isUpper(part[i]) ? "pair" : "short";
  let vowel = false;
  let consonants = 0;
  for (let k = i; k < j; k++) {
    const v = isVowel(part[k]);
    vowel ||= v;
    consonants = v ? 0 : consonants + 1;
    if (consonants >= 5) return null;
  }
  return vowel ? "word" : null;
}

/**
 * What one part between separators holds — its words, pairs, acronyms and digit runs glued to letters — or null when
 * it does not read: a run of letters that is no word, a run of more than four digits, a short lowercase run that is
 * not the whole part, another character. A part of digits alone (a date, 20240115) or a numeronym is a word part.
 */
function partShape(part) {
  const shape = { words: 0, pairs: 0, acronyms: 0, glued: 0 };
  if (/^\d{1,8}$/.test(part)) return shape;
  if (NUMERONYM.test(part)) return { ...shape, words: 1 };
  for (let i = 0; i < part.length;) {
    let j = i + 1;
    if (isDigit(part[i])) {
      while (j < part.length && isDigit(part[j])) j++;
      if (j - i > 4) return null;
      shape.glued++;
    } else if (isUpper(part[i]) || isLower(part[i])) {
      j = letterRunEnd(part, i);
      const run = runShape(part, i, j);
      if (run === null || (run === "short" && (i > 0 || j < part.length))) return null;
      if (run === "word") shape.words++;
      else if (run === "pair") shape.pairs++;
      else if (run === "acronym") shape.acronyms++;
    } else return null;
    i = j;
  }
  return shape;
}

/**
 * Whether a segment reads as words (GetUserProfileByIdV2, how-to-set-up-a-new-account, documents:batchGetDocuments,
 * k8s-cluster-node-pools, catégories-de-produits), each part between separators judged alone: every part reads,
 * there are two words of three letters or more, no more capital-and-lowercase pairs than words (two at least), two
 * acronyms at most and two digit runs glued to letters. The characters of a random token break one of these rules
 * almost always; a single word of twenty letters or more (Rechtsschutzversicherungen) does not read either.
 * @param {string} seg
 */
function readable(seg) {
  const total = { words: 0, pairs: 0, acronyms: 0, glued: 0 };
  for (const part of seg.split(SEPARATORS)) {
    if (!part) continue;
    const shape = partShape(part);
    if (!shape) return false;
    for (const k of Object.keys(total)) total[k] += shape[k];
  }
  return total.words >= 2 && total.pairs <= Math.max(2, total.words) && total.acronyms <= 2 && total.glued <= 2;
}

/** A parameter of a route, a name in the code: {id}, :id, [id], <int:id>, (?P<pk>…), *rest. */
const isParameter = (seg) => "{:[<(*".includes(seg[0] ?? "");

/**
 * A route as written, but a segment that looks like a key or a token replaced by "…" — what a detector of the kit
 * finds, or 20 characters or more that do not read as words (a parameter of the route excepted) — so that a webhook's
 * secret path is never kept.
 * @param {string} route
 */
export const routeWithoutSecrets = (route) =>
  route
    .split("/")
    .map((seg) =>
      seg.length >= 10 && (detected(seg) || (seg.length >= 20 && !isParameter(seg) && !readable(seg))) ? "…" : seg,
    )
    .join("/");

/** A file's extension, after its last dot: one to eight letters or digits (tsx, md, snap; never a token's length). */
const isExtension = (ext) =>
  ext.length >= 1 && ext.length <= 8 && [...ext].every((c) => isDigit(c) || isUpper(c) || isLower(c));

/**
 * A file's path (relative, forward slashes) as routeWithoutSecrets writes a route, but its name judged without its
 * extension: `.tsx` reads as no word, so `OrderSummaryCard.tsx` would not read as a whole. A name is "…", its extension
 * with it, when the rest of it looks like a key or a token, or when a detector of the kit finds one in the whole name
 * (one written across the dot). What follows a last dot and is no extension (`config.Zq8v…`) is judged with the name.
 * @param {string} file
 */
export function fileWithoutSecrets(file) {
  const slash = file.lastIndexOf("/");
  const name = file.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 && isExtension(name.slice(dot + 1)) ? name.slice(0, dot) : name;
  const masked = (name.length >= 10 && detected(name)) || routeWithoutSecrets(stem) !== stem;
  return routeWithoutSecrets(file.slice(0, slash + 1)) + (masked ? "…" : name);
}

/** A field name kept as written, or undefined. */
export const safeField = (s) => (typeof s === "string" && FIELD.test(s) && !unsafe(s) ? s : undefined);

/**
 * An operation kept as written ("GET /orders/{id}"), unless one of its segments looks like a key, a token or a long
 * number (/keys/AKIA…, /cards/4111…) — a parameter's too ({…}, or :… which OpenAPI reads as text), checked without
 * its brackets (a "{…}" is a placeholder to the secret detectors).
 */
const safeRoute = (r) =>
  typeof r === "string" &&
  ROUTE.test(r) &&
  !detected(r) &&
  r.split(/[ /]/).every((segment) => !unsafe(segment.replace(/^[{:[]/, "").replace(/[}\]]$/, "")));

/**
 * The value a signal may keep: a number (never for a secret field, never 9 digits or more); a word of a fixed list,
 * according to the signal — asc or desc for an order, a field's type, a library, a cron expression or an interval for
 * a scheduled job —, never with 9 digits or more (a card written as a cron expression). A default is kept only as a
 * number. Undefined otherwise; a string of more than 200 characters is not even read.
 * @param {any} v
 * @param {{ family?: string, signal?: string, field?: string }} [s]   the signal the value belongs to
 */
export function safeValue(v, s = {}) {
  if (secretName(s.field)) return undefined;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) < 1e8 ? v : undefined;
  if (typeof v !== "string" || v.length > 200) return undefined;
  const t = v.trim();
  if (/^\d{1,8}$/.test(t)) return Number(t);
  if (s.signal === "default" || (t.match(/\d/g) || []).length >= 9) return undefined;
  if (s.family === "sort") return /^(?:asc|desc)$/i.test(t) ? t.toLowerCase() : undefined;
  if (s.family === "schedule") return CRON.test(t) || INTERVAL.test(t) ? t : undefined;
  if (s.signal === "type") return WORDS.type.has(t) ? t : undefined;
  if (s.signal === "engine" || s.family === "notification") return WORDS.library.has(t) ? t : undefined;
  return undefined;
}

/**
 * The values of a list that may be kept (LIST_VALUE, never unsafe), once each, 30 at most; none for a secret field.
 * An object or a string of more than 200 characters is not even read (LIST_VALUE would refuse it).
 */
export function safeValues(list, field) {
  if (secretName(field)) return [];
  const out = [];
  for (const raw of list) {
    if ((raw && typeof raw === "object") || String(raw).length > 200) continue;
    const v = String(raw).trim();
    if (LIST_VALUE.test(v) && !unsafe(v) && !out.includes(v)) out.push(v);
    if (out.length === 30) break;
  }
  return out;
}

/** The index of the first element of a sorted list of numbers greater than `n` (binary search). */
function upperBound(sorted, n) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The index of a text: the 1-based line of a character index, and whether it falls in one of `ranges` (its
 * comments) — each a binary search, so that a reader that finds many matches never walks the text again for each.
 * @param {string} text
 * @param {Array<[number, number]>} [ranges]   sorted or not
 */
export function textIndex(text, ranges = []) {
  const newlines = [];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) newlines.push(i);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const starts = sorted.map((r) => r[0]);
  return {
    /** @param {number} index */
    lineOf: (index) => upperBound(newlines, index - 1) + 1,
    /** @param {number} index */
    inComment(index) {
      const k = upperBound(starts, index) - 1;
      return k >= 0 && index < sorted[k][1];
    },
  };
}

/**
 * The sink of one file: `push(signal, index)` keeps a signal found at a character index, with its 1-based line,
 * unless the index falls in one of `ranges` (its comments) or the file already gave MAX_PER_FILE signals (`full`:
 * a detector may stop). Undefined fields of a signal are left out.
 * @param {string} file   relative to the application
 * @param {string} text
 * @param {Array<[number, number]>} ranges   sorted or not
 */
export function createSink(file, text, ranges) {
  const { lineOf, inComment } = textIndex(text, ranges);
  const items = [];
  return {
    items,
    get full() {
      return items.length >= MAX_PER_FILE;
    },
    /** @param {{ family: string, signal: string, via: string, field?: any, value?: any, values?: any[], route?: string }} s */
    push(s, index) {
      if (items.length >= MAX_PER_FILE || inComment(index)) return;
      const item = { family: s.family, signal: s.signal, file, line: lineOf(index) };
      const field = safeField(s.field);
      if (field) item.field = field;
      const value = safeValue(s.value, s);
      if (value !== undefined) item.value = value;
      if (s.values) {
        const values = safeValues(s.values, s.field);
        if (values.length) item.values = values;
      }
      if (safeRoute(s.route)) item.route = s.route;
      item.via = s.via;
      items.push(item);
    },
  };
}

/**
 * The arguments of a call whose "(" is at `open` — up to its closing parenthesis, `max` characters at most, by a
 * linear walk that follows strings and nested brackets and skips the comments of the language (`//` and `/* *\/` in
 * JavaScript, `#` in Python) — and the index after it (`open + max` when it does not close: the caller goes on from
 * there, so that a file of unclosed calls is walked once). A quoted string ends at its line (a template literal or
 * a triple-quoted string does not), so that a stray apostrophe ("don't" in JSX text) costs its line, not the call.
 * @param {string} text
 * @param {number} open
 * @param {number} [max]
 * @param {"js"|"py"} [language]
 * @returns {{ args: string, end: number, closed: boolean }}   closed: false when it does not close within `max`
 */
export function callSpan(text, open, max = 4000, language = "js") {
  let depth = 0;
  let quote = null;
  const end = Math.min(text.length, open + max);
  for (let i = open; i < end; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote || (ch === "\n" && quote !== "`")) quote = null;
      continue;
    }
    const skip = skipped(text, i, end, language);
    if (skip !== -1) i = skip;
    else if (ch === '"' || ch === "'" || (ch === "`" && language === "js")) quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return { args: text.slice(open + 1, i), end: i + 1, closed: true };
    }
  }
  return { args: "", end, closed: false };
}

/**
 * Where a comment or a triple-quoted string that starts at `i` ends (its last character, or `end`: each character is
 * walked once), or -1 when none starts there.
 * @param {string} text
 * @param {number} i
 * @param {number} end
 * @param {"js"|"py"} language
 */
function skipped(text, i, end, language) {
  const to = (from, mark) => {
    for (let k = from; k < end; k++) if (text.startsWith(mark, k)) return k + mark.length - 1;
    return end;
  };
  const ch = text[i];
  if (language === "js" && ch === "/" && text[i + 1] === "/") return to(i, "\n");
  if (language === "js" && ch === "/" && text[i + 1] === "*") return to(i + 2, "*/");
  if (language === "py" && ch === "#") return to(i, "\n");
  if (language === "py" && (ch === '"' || ch === "'") && text.startsWith(ch.repeat(3), i))
    return to(i + 3, ch.repeat(3));
  return -1;
}

/**
 * The arguments of a call (callSpan), or "" when it does not close within `max`.
 * @param {string} text
 * @param {number} open
 * @param {number} [max]
 * @param {"js"|"py"} [language]
 */
export const callArguments = (text, open, max = 4000, language = "js") => callSpan(text, open, max, language).args;

/**
 * The comments of a JavaScript or TypeScript text (// and /* … *\/), by a linear walk that skips strings and template
 * literals, so that a "/*" in "image/*" or a "//" in a URL is no comment.
 * @returns {Array<[number, number]>}
 */
export function jsCommentRanges(text) {
  const out = /** @type {Array<[number, number]>} */ ([]);
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote || (ch === "\n" && quote !== "`")) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      out.push([i, end === -1 ? text.length : end]);
      i = end === -1 ? text.length : end;
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      out.push([i, end === -1 ? text.length : end + 2]);
      i = end === -1 ? text.length : end + 1;
    }
  }
  return out;
}

/**
 * The `#` comments of a Python text, by a linear walk that skips strings (triple-quoted ones included: they may
 * hold SQL, read as code) — and, with `docstrings`, its triple-quoted strings too (a route quoted as an example in
 * a docstring is no route); with `strings`, every string (a guard named in a log message is no call of it).
 * @param {string} text
 * @param {{ docstrings?: boolean, strings?: boolean }} [options]
 * @returns {Array<[number, number]>}
 */
export function pyCommentRanges(text, { docstrings = false, strings = false } = {}) {
  const out = /** @type {Array<[number, number]>} */ ([]);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "#") {
      const end = text.indexOf("\n", i);
      out.push([i, end === -1 ? text.length : end]);
      i = end === -1 ? text.length : end;
    } else if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i);
      const start = i;
      if (triple) {
        const end = text.indexOf(ch.repeat(3), i + 3);
        const stop = end === -1 ? text.length : end + 3;
        if (docstrings || strings) out.push([i, stop]);
        i = stop - 1;
      } else {
        for (i++; i < text.length && text[i] !== ch && text[i] !== "\n"; i++) if (text[i] === "\\") i++;
        if (strings) out.push([start, i + 1]);
      }
    }
  }
  return out;
}

/** The comments of an HTML text (<!-- … -->), by a linear walk. */
export function htmlCommentRanges(text) {
  const out = /** @type {Array<[number, number]>} */ ([]);
  for (let from = 0; ;) {
    const i = text.indexOf("<!--", from);
    if (i === -1) return out;
    const end = text.indexOf("-->", i + 4);
    if (end === -1) {
      out.push([i, text.length]);
      return out;
    }
    out.push([i, end + 3]);
    from = end + 3;
  }
}

/** A query parameter's name → the signal it stands for (pagination, sort, search), else a filter on that name. */
const PARAMS = {
  pagination: {
    page: ["page", "p", "pagenumber", "pageindex", "pageno"],
    pageSize: ["pagesize", "page_size", "perpage", "per_page", "limit", "size", "take", "count"],
    offset: ["offset", "skip", "start", "from"],
    cursor: ["cursor", "after", "before", "next", "nexttoken", "continuation"],
  },
  sort: { param: ["sort", "sortby", "sort_by", "order", "orderby", "order_by", "ordering", "direction", "dir"] },
  search: { param: ["q", "query", "search", "term", "keyword", "keywords", "text", "s"] },
};

/** The signal of a query parameter read by the code (its name, compared lower-case). */
export function paramSignal(name) {
  const n = String(name).toLowerCase();
  for (const [family, signals] of Object.entries(PARAMS))
    for (const [signal, names] of Object.entries(signals)) if (names.includes(n)) return { family, signal };
  return { family: "filter", signal: "param" };
}
