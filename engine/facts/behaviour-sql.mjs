// Behaviour signals of SQL written in the code (ARCHITECTURE.md §6.9, source `behaviours`), whatever the language
// that holds it in a string: a search (LIKE, ILIKE, LOWER(…) LIKE, full text), its order (ORDER BY), its page
// (LIMIT, OFFSET), accents ignored (unaccent). Bounded expressions only (RULES.md S5, test/tools/redos-worker.mjs).

/** The expressions of this module, by name (the ReDoS test runs each of them). */
export const SQL_PATTERNS = Object.freeze({
  like: /\b(?:(LOWER|UPPER|unaccent)\s*\(\s*)?([A-Za-z_][\w.]{0,63})(?:\s*\))?\s+(I?LIKE)\s+(?=["'`$?:%(@]|concat\b|lower\b|upper\b)/gi,
  orderBy: /\bORDER\s+BY\s+([A-Za-z_][\w.]{0,63})(?:\s+(ASC|DESC)\b)?/gi,
  limit: /\bLIMIT\s+(\d{1,6}|\$\d{1,2}|\?|:\w{1,32}|%s|\$\{)/gi,
  offset: /\bOFFSET\s+(?:\d{1,9}|\$\d{1,2}|\?|:\w{1,32}|%s|\$\{)/gi,
  fullText:
    /\bto_tsvector\s*\(|@@\s*(?:plainto_|websearch_|phrase)?to_tsquery\s*\(|\bMATCH\s*\([^()]{0,200}\)\s*AGAINST\b/gi,
  unaccent: /\bunaccent\s*\(/gi,
});

/** SQL around a match: a statement keyword near it ("order by date" in a sentence is not SQL). */
const STATEMENT = /\b(?:select|from|where|update|delete|insert|join)\b/i;

/** Words that end a column name in the patterns above but are SQL, never a field. */
const KEYWORDS = new Set(["and", "or", "not", "where", "on", "when", "case", "select", "by", "having", "then"]);

/**
 * Every SQL behaviour signal of a text, pushed into the sink of its file (engine/facts/behaviour-common.mjs).
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function sqlBehaviours(text, sink) {
  const P = SQL_PATTERNS;
  const push = sink.push;
  // SQL written in capitals (LIKE, ORDER BY, LIMIT): a statement keyword within the 300 characters before it; in
  // lower case, where a sentence could say "order by phone", one on its own line — within 300 characters of it too, so
  // that a long line is never read once per match.
  const isSql = (m, keyword) => {
    const from = Math.max(0, m.index - 300);
    if (keyword === keyword.toUpperCase()) return STATEMENT.test(text.slice(from, m.index + m[0].length));
    const window = text.slice(from, m.index + m[0].length + 300);
    const at = m.index - from;
    const start = window.lastIndexOf("\n", at) + 1;
    const end = window.indexOf("\n", at);
    return STATEMENT.test(window.slice(start, end === -1 ? window.length : end));
  };
  // keywordOf(m): the SQL word of a match, checked by isSql; null: specific enough on its own (to_tsvector…).
  const each = (re, fn, keywordOf = (m) => m[0].slice(0, 5)) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (sink.full) return;
      const keyword = keywordOf(m);
      if (keyword === null || isSql(m, keyword)) fn(m);
    }
  };
  each(
    P.like,
    (m) => {
      const field = m[2].split(".").pop();
      if (KEYWORDS.has(field.toLowerCase())) return;
      // A "%" in the pattern right after: "contains"; a parameter whose wildcards are set elsewhere: "like".
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const signal = after.includes("%") ? "contains" : "like";
      push({ family: "search", signal, field, via: "sql" }, m.index);
      const fold = m[1]?.toLowerCase();
      if (m[3].toUpperCase() === "ILIKE" || fold === "lower" || fold === "upper")
        push({ family: "search", signal: "caseInsensitive", field, via: "sql" }, m.index);
      if (fold === "unaccent") push({ family: "search", signal: "accentsIgnored", field, via: "sql" }, m.index);
    },
    (m) => m[3],
  );
  each(P.orderBy, (m) => {
    const field = m[1].split(".").pop();
    if (!KEYWORDS.has(field.toLowerCase()))
      push({ family: "sort", signal: "orderBy", field, value: (m[2] || "asc").toLowerCase(), via: "sql" }, m.index);
  });
  each(P.limit, (m) =>
    push(
      { family: "pagination", signal: "limit", value: /^\d+$/.test(m[1]) ? Number(m[1]) : undefined, via: "sql" },
      m.index,
    ),
  );
  each(
    P.offset,
    (m) => push({ family: "pagination", signal: "offset", via: "sql" }, m.index),
    (m) => m[0].slice(0, 6),
  );
  each(
    P.fullText,
    (m) => push({ family: "search", signal: "fullText", via: "sql" }, m.index),
    () => null,
  );
  each(
    P.unaccent,
    (m) => push({ family: "search", signal: "accentsIgnored", via: "sql" }, m.index),
    () => null,
  );
}
