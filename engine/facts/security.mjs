// `security` source (ARCHITECTURE.md §6.13): deterministic, OWASP Top 10 2021 heuristics over the application's
// own files (never a value — only where a pattern was found).
//   item: { rule, file, line, severity, owasp, sanitized? }  sanitized: true only for an xss.* finding whose
//     expression passes through a sanitizer (severity then downgraded to "low").
import fs from "node:fs";
import path from "node:path";
import { lineAt, balancedParens } from "./api.mjs";
import { appFiles } from "./common.mjs";

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
]);
const MAX_SIZE = 2 * 1024 * 1024;

/** 1-based, de-duplicated, sorted lines of every match of `re` in `text`. */
function matchLines(text, re) {
  const lines = new Set();
  for (const m of text.matchAll(re)) lines.add(lineAt(text, m.index));
  return [...lines].sort((a, b) => a - b);
}

// sql.concat: an SQL keyword together with a sign of string building (a template literal, an f-string, a `+`
// concatenation), near a call to execute/query/raw/text — same line (`conn.execute(f"SELECT … {x}")`) or a few
// lines apart (built once, assigned to a variable, executed just after: the common vibe-coded shape).
const SQL_KEYWORD = /\b(?:select|insert|update|delete)\b/i;
const STRING_BUILDING = /\$\{|\bf["']|["'`]\s*\+|\+\s*["'`]/;
const SQL_SINK_CALL = /\b(?:execute|query|raw|text)\s*\(/g;
const SQL_LINE_WINDOW = 4;

function sqlConcatLines(text) {
  const lines = text.split("\n");
  const buildLines = [];
  for (let i = 0; i < lines.length; i++)
    if (SQL_KEYWORD.test(lines[i]) && STRING_BUILDING.test(lines[i])) buildLines.push(i);
  if (!buildLines.length) return [];
  const flagged = new Set();
  for (const m of text.matchAll(SQL_SINK_CALL)) {
    const callLine = lineAt(text, m.index) - 1;
    if (buildLines.some((b) => Math.abs(b - callLine) <= SQL_LINE_WINDOW)) flagged.add(callLine + 1);
  }
  return [...flagged].sort((a, b) => a - b);
}

// code.eval: `eval(`, Python's `exec(` and `new Function(`, never a method call such as `pattern.exec(text)` (a
// regular expression, the usual JavaScript `.exec(`). A method `.exec(` / `.execSync(` is a shell call only in a
// file that loads child_process, where it is reported too, unless it follows a regular expression literal
// (`/x/g.exec(`).
const EVAL_CALL = /(?<![.\w$])(?:eval|exec)\s*\(|\bnew\s+Function\s*\(/g;
const SHELL_METHOD = /(?<!\/[dgimsuyv]*)\.exec(?:Sync)?\s*\(/g;

function codeEvalLines(text) {
  const lines = matchLines(text, EVAL_CALL);
  if (!text.includes("child_process")) return lines;
  return [...new Set([...lines, ...matchLines(text, SHELL_METHOD)])].sort((a, b) => a - b);
}

// cors.wildcardCredentials: a wildcard origin together with credentials, within the same configuration block
// (close enough in the text — a generous but simple window, ARCHITECTURE.md §6.13 is a heuristic by design).
const WILDCARD_ORIGIN =
  /\borigin\s*[:=]\s*["']\*["']|Access-Control-Allow-Origin["']?\s*,\s*["']\*["']|allow_origins\s*=\s*\[\s*["']\*["']/gi;
const CREDENTIALS_TRUE =
  /\bcredentials\s*[:=]\s*True\b|\bcredentials\s*:\s*true\b|allow_credentials\s*=\s*True\b|Access-Control-Allow-Credentials["']?\s*,\s*["']true["']/gi;
const CORS_WINDOW = 400;

function corsWildcardCredentialsLines(text) {
  const origins = [...text.matchAll(WILDCARD_ORIGIN)].map((m) => m.index);
  const creds = [...text.matchAll(CREDENTIALS_TRUE)].map((m) => m.index);
  const lines = new Set();
  for (const o of origins)
    for (const c of creds) if (Math.abs(o - c) <= CORS_WINDOW) lines.add(lineAt(text, Math.min(o, c)));
  return [...lines].sort((a, b) => a - b);
}

// redirect.open: a redirect call whose argument reads a request parameter directly.
const REDIRECT_CALL = /\b(?:res\.redirect|NextResponse\.redirect|RedirectResponse|redirect)\(/g;
const PARAM_READ = /\breq(?:uest)?\.(?:query|args|GET)\b|searchParams\.get\(|query_params\[|query_params\.get\(/;

function openRedirectLines(text) {
  const lines = new Set();
  for (const m of text.matchAll(REDIRECT_CALL)) {
    const args = balancedParens(text, m.index + m[0].length - 1);
    if (PARAM_READ.test(args)) lines.add(lineAt(text, m.index));
  }
  return [...lines].sort((a, b) => a - b);
}

// auth.noRateLimit: a sign-in route (ARCHITECTURE.md §5 LOGIN_PATTERN) declared without a nearby rate-limit
// decorator or middleware. Heuristic, severity "info".
const SIGNIN_ROUTE =
  /\b(?:get|post|put|patch|delete|route)\(\s*["'`]([^"'`]*(?:login|signin|sign-in|authorize)[^"'`]*)["'`]/gi;
const RATE_LIMIT_HINT = /rate[-_]?limit|throttle|limiter/i;
const RATE_LIMIT_WINDOW = 200;

function noRateLimitLines(text) {
  const lines = new Set();
  for (const m of text.matchAll(SIGNIN_ROUTE)) {
    const around = text.slice(Math.max(0, m.index - RATE_LIMIT_WINDOW), m.index + RATE_LIMIT_WINDOW);
    if (!RATE_LIMIT_HINT.test(around)) lines.add(lineAt(text, m.index));
  }
  return [...lines].sort((a, b) => a - b);
}

// xss.dangerouslySetInnerHTML / xss.innerHTML: downgraded (sanitized: true, severity "low") when the assigned
// expression passes through a sanitizer (sanitize…(, DOMPurify.sanitize(), looked for in a window right after
// the match — a heuristic, not a parse of the whole expression, like the rest of this file.
const SANITIZER_CALL = /\bsanitize\w*\s*\(|\bDOMPurify\.sanitize\s*\(/i;
const SANITIZER_WINDOW = 200;

/** `{ line, sanitized?, severity? }` for every match of `re`, de-duplicated by line (first match on a line wins). */
function matchFindings(text, re) {
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(re)) {
    const line = lineAt(text, m.index);
    if (seen.has(line)) continue;
    seen.add(line);
    const sanitized = SANITIZER_CALL.test(text.slice(m.index, m.index + SANITIZER_WINDOW));
    out.push(sanitized ? { line, sanitized: true, severity: "low" } : line);
  }
  return out;
}

// secret.default: a literal default for a secret, a password or an admin account in code — never the value
// itself. Excluded: a masked value meant for DISPLAY (only •, * or x characters; or a template literal whose
// interpolation slices a variable, e.g. `****${apiKey.slice(-4)}`; or a literal immediately concatenated with a
// variable slice, e.g. "****" + apiKey.slice(-4)) and a value that does not look like an actual secret (under 8
// characters, or a common placeholder word rather than a secret-looking string).
const SECRET_IDENTIFIER = /\b(?:admin[a-z_]*|password\w*|passwd\w*|secret[a-z_]*|api[_-]?key\w*|token\w*)\s*[:=]\s*/gi;
const QUOTED_VALUE = /^(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/;
const MASK_CHARS_ONLY = /^[•*x]+$/i;
const SLICE_INTERPOLATION = /\$\{[^}]*\.(?:slice|substring|substr)\(/;
const SLICE_CONCAT_AFTER = /^\s*\+\s*[\w.]+\.(?:slice|substring|substr)\(/;
const COMMON_WORDS = new Set([
  "password",
  "passwd",
  "secret",
  "secretkey",
  "admin",
  "administrator",
  "username",
  "token",
  "default",
  "changeme",
  "placeholder",
  "example",
  "test",
  "testing",
  "demo",
  "sample",
  "none",
  "null",
  "undefined",
  "true",
  "false",
  "value",
  "string",
  "text",
  "unknown",
  "todo",
  "temp",
  "temporary",
  "guest",
  "root",
  "user",
  "login",
  "key",
  "apikey",
  "required",
  "optional",
]);
/** A masked display value, never a real secret: made only of bullet, asterisk or x characters, or a slice interpolated/concatenated in. */
const isMaskedDisplay = (value, after) =>
  MASK_CHARS_ONLY.test(value) || SLICE_INTERPOLATION.test(value) || SLICE_CONCAT_AFTER.test(after);
/** At least 8 characters and not a common placeholder word: the rest look too short or too ordinary to flag. */
const looksSecret = (value) => value.length >= 8 && !COMMON_WORDS.has(value.toLowerCase());

function secretDefaultLines(text) {
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(SECRET_IDENTIFIER)) {
    const rest = text.slice(m.index + m[0].length);
    const q = QUOTED_VALUE.exec(rest);
    if (!q) continue;
    const value = q[1] ?? q[2] ?? q[3] ?? "";
    if (isMaskedDisplay(value, rest.slice(q[0].length)) || !looksSecret(value)) continue;
    const line = lineAt(text, m.index);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * Rules of the `security` source (ARCHITECTURE.md §6.13), in OWASP Top 10 2021 category order. Each rule's
 * `find(text)` returns the 1-based lines where it matched (never the matched value), or `{ line, sanitized?,
 * severity? }` to override this rule's default severity for that one finding (xss.*: a sanitized occurrence).
 */
export const RULES = Object.freeze([
  { rule: "redirect.open", owasp: "A01:2021", severity: "medium", find: openRedirectLines },
  {
    rule: "tls.disabled",
    owasp: "A02:2021",
    severity: "high",
    find: (t) =>
      matchLines(t, /\bverify\s*=\s*False\b|\brejectUnauthorized\s*:\s*false\b|NODE_TLS_REJECT_UNAUTHORIZED/g),
  },
  {
    rule: "xss.dangerouslySetInnerHTML",
    owasp: "A03:2021",
    severity: "medium",
    find: (t) => matchFindings(t, /dangerouslySetInnerHTML/g),
  },
  {
    rule: "xss.innerHTML",
    owasp: "A03:2021",
    severity: "medium",
    find: (t) => matchFindings(t, /\.innerHTML\s*=(?!=)/g),
  },
  {
    rule: "code.eval",
    owasp: "A03:2021",
    severity: "high",
    find: codeEvalLines,
  },
  { rule: "sql.concat", owasp: "A03:2021", severity: "high", find: sqlConcatLines },
  { rule: "cors.wildcardCredentials", owasp: "A05:2021", severity: "high", find: corsWildcardCredentialsLines },
  {
    rule: "debug.enabled",
    owasp: "A05:2021",
    severity: "low",
    find: (t) => matchLines(t, /\bDEBUG\s*=\s*True\b|\bdebug\s*[:=]\s*[Tt]rue\b/g),
  },
  {
    rule: "jwt.noVerify",
    owasp: "A07:2021",
    severity: "high",
    find: (t) => matchLines(t, /verify_signature["']?\s*[:=]\s*False\b|algorithms\s*[:=]\s*\[[^\]]*["']none["']/gi),
  },
  { rule: "secret.default", owasp: "A07:2021", severity: "medium", find: secretDefaultLines },
  { rule: "auth.noRateLimit", owasp: "A07:2021", severity: "info", find: noRateLimitLines },
]);

/**
 * The `security` source: deterministic OWASP Top 10 2021 heuristics (ARCHITECTURE.md §6.13), over the files
 * tracked by git (else every file but the usual build and dependency folders). Never a value.
 * @param {string} appDir
 * @param {(bin: string, args: string[], options?: object) => {status,stdout}|null} [exec]  test seam of §4
 * @returns {Array<{rule,file,line,severity,owasp}>} sorted by file, then line, then rule
 */
export function collectSecurity(appDir, exec) {
  const items = [];
  for (const rel of appFiles(appDir, { exec })) {
    if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(appDir, rel);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_SIZE) continue;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const { rule, owasp, severity, find } of RULES)
      for (const entry of find(text)) {
        const e = typeof entry === "object" ? entry : { line: entry };
        items.push({
          rule,
          file: rel,
          line: e.line,
          severity: e.severity ?? severity,
          owasp,
          ...(e.sanitized ? { sanitized: true } : {}),
        });
      }
  }
  return items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}
