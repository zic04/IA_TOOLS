// Scanning JavaScript/TypeScript source without a parser (AUDIT.md M4): the one brace matcher of the kit, used by
// `facts --source quality` (function bodies), `init` (the `metadata` object of a Next.js layout) and `export`
// (the `version` object of doc.config.mjs). Linear, no regular expression (RULES.md S5): the text is untrusted.
//
// Brace matching that is not fooled by a brace character that is not really a scope delimiter: one inside a
// quoted string (JSX attributes included), inside the literal text of a template literal, or inside a comment
// — each skipped as one token, never counted. A `${…}` substitution of a template literal IS real code (it can
// hold its own object literals, strings, nested template literals): scanned the same way, recursively. Without
// this, a single unmatched brace anywhere in a string, a template literal or a comment after a function's
// opening brace made the matcher run to the end of the file (a 1000+ line "function", ARCHITECTURE.md
// §6.13's real-world pitfall).

/** Index just after the quoted string starting at `i` (which points at the opening quote); backslash escapes. */
function skipString(text, i) {
  const quote = text[i];
  i++;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i++;
  }
  return text.length;
}

/** Index just after the line comment starting at `i` (pointing at the first "/"). */
function skipLineComment(text, i) {
  const nl = text.indexOf("\n", i);
  return nl === -1 ? text.length : nl + 1;
}

/** Index just after the block comment starting at `i` (pointing at the opening "/*"). */
function skipBlockComment(text, i) {
  const end = text.indexOf("*/", i + 2);
  return end === -1 ? text.length : end + 2;
}

/** Index just after the "}" matching the "{" already consumed right before `i` (a template literal's `${`
 * substitution): real code, so strings, nested template literals and comments inside it are skipped the same
 * way, and its own "{"/"}" are counted. */
function skipBraceExpression(text, i) {
  let depth = 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = skipString(text, i);
      continue;
    }
    if (c === "`") {
      i = skipTemplateLiteral(text, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i = skipLineComment(text, i);
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i = skipBlockComment(text, i);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return i;
}

/** Index just after the template literal starting at `i` (pointing at the opening backtick). */
function skipTemplateLiteral(text, i) {
  i++;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === "`") return i + 1;
    if (text[i] === "$" && text[i + 1] === "{") {
      i = skipBraceExpression(text, i + 2);
      continue;
    }
    i++;
  }
  return text.length;
}

/** Index just after the string, template literal or comment starting at `i`; `i` itself when none starts there. */
export function skipToken(text, i) {
  const c = text[i];
  if (c === '"' || c === "'") return skipString(text, i);
  if (c === "`") return skipTemplateLiteral(text, i);
  if (c === "/" && text[i + 1] === "/") return skipLineComment(text, i);
  if (c === "/" && text[i + 1] === "*") return skipBlockComment(text, i);
  return i;
}

/** Index of the "}" that closes the "{" at `open`, strings, template literals and comments skipped; -1 when none. */
export function closingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; ) {
    const end = skipToken(text, i);
    if (end > i) {
      i = end;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
    i++;
  }
  return -1;
}

/** Depth of braces at each index of a source (the depth before a "{" or "}" at that index), tokens skipped. */
export function braceDepths(text) {
  const depth = new Int32Array(text.length + 1);
  let d = 0;
  for (let i = 0; i < text.length; ) {
    const end = skipToken(text, i);
    if (end > i) {
      depth.fill(d, i, end);
      i = end;
      continue;
    }
    depth[i] = d;
    if (text[i] === "{") d++;
    else if (text[i] === "}") d--;
    i++;
  }
  depth[text.length] = d;
  return depth;
}
