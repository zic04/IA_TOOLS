// Secret check: values that must never be published, searched in the text of the built site (pages, section
// introductions, home page, glossary; their text and their HTML attribute values) and in the text sources
// (<content>/, <translations>/, the zone files of every language, capture plans, diagrams).
//   env      values of the masking.env files whose key suggests a URL, host, tenant, client, account, e-mail,
//            user or secret (the values masked in the screenshots)
//   guid     GUIDs, when masking.guid is true (the nil GUID 00000000-… is allowed)
//   pattern  the masking.patterns expressions
//   generic  actual secret VALUES only, never a mere mention: a private key holding key material (PEM, escaped in
//            a JSON file, PGP, PuTTY; a "-----BEGIN PRIVATE KEY-----" line alone is documentation), a JWT, the
//            password of a connection string or of a URL, a cloud or service token, the value of an assignment to a
//            secret's name (SECRET_KEY, DB_PASSWORD…: any value of 8 characters or more, assignedPassword), the
//            signature of a signed URL, and last a random-looking value under any name (entropy); placeholders
//            ("<password>", "****", "${SECRET}", "example", "exemple", "motdepasse", "change-me", an UPPER_CASE
//            variable name…) and references written as code ($DB_PASSWORD, config.password, getPassword()) are not
//            values (engine/check/secret-values.mjs: GENERIC, re-exported here)
// Never reported (ignoreRules), whatever the detector:
//   local      an address that means nothing outside the machine or the private network: 0.0.0.0, ::, loopback
//              (localhost, 127.x, ::1), private and link-local ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x),
//              alone, with a port, or as the host of a URL without credentials;
//   template   a match inside a URL template, a URL with {…} placeholders (map tiles: https://…/{z}/{x}/{y}.png);
//   exclude    a value matching masking.exclude;
//   allow      a value matching one of masking.allow: values known to be public (a documented public API key).
// GUIDs stay reported (when masking.guid): only their owner knows whether one is public (masking.allow).
// Also: a session file (storageState) outside the session folder, or a session file tracked by git.
// Findings never print the value itself: only its first characters and its length.
import fs from "node:fs";
import path from "node:path";
import { sensitiveValues, GUID } from "../capture/masking.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { spawnHardened } from "../util/safe-git.mjs";
import { upToLast } from "../core/text.mjs";
import { PLACEHOLDER, GENERIC, looksRandom, highEntropy } from "./secret-values.mjs";

export { PLACEHOLDER, GENERIC, looksRandom, highEntropy };

/** Hosts that mean nothing outside the machine or the private network. */
const LOCAL_HOST =
  /^(?:0\.0\.0\.0|::|::1|localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})$/i;

/**
 * Is a value a local address: 0.0.0.0, ::, loopback, a private or link-local IPv4 address, alone, with a port or a
 * path (a CIDR range), or as the host of a URL without credentials?
 */
export function isLocalAddress(value) {
  const v = String(value).trim();
  const url = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]*)/i.exec(v);
  let host = url ? url[1] : v.split(/[/?#\s]/)[0];
  if (!host || host.includes("@")) return false;
  host = host.replace(/^\[([^\]]*)\](?::\d{1,5})?$/, "$1");
  return LOCAL_HOST.test(host) || LOCAL_HOST.test(host.replace(/:\d{1,5}$/, ""));
}

/** A URL's scheme and "://": 32 characters at most, so that a long run of them is not read again from each letter. */
const URL_SCHEME = /[a-z][a-z0-9+.-]{0,31}:\/\//gi;
const URL_PLACEHOLDER = /\{[^{}\s]+\}/;
const BLANK = /\s/g;

/**
 * Does a piece of text hold a URL template, a URL with {…} placeholders (https://tiles.example.org/{z}/{x}/{y}.png)?
 * The rest of a word is searched once, after its first "://" (one after it in the same word reads less of it).
 */
export function isUrlTemplate(text) {
  const s = String(text);
  const scheme = new RegExp(URL_SCHEME.source, URL_SCHEME.flags);
  for (let m = scheme.exec(s); m; m = scheme.exec(s)) {
    const start = m.index + m[0].length;
    BLANK.lastIndex = start;
    const end = BLANK.exec(s)?.index ?? s.length;
    if (URL_PLACEHOLDER.test(s.slice(start, end))) return true;
    scheme.lastIndex = end;
  }
  return false;
}

/** What ends a token: white space, quotes, backticks, brackets, parentheses, pipes or angle brackets. */
const TOKEN_STOP = /[\s"'`<>()[\]|]/;

/** The token around a match: up to a TOKEN_STOP character on each side. */
function tokenAround(text, start, end) {
  let a = start;
  let b = end;
  while (a > 0 && !TOKEN_STOP.test(text[a - 1])) a--;
  while (b < text.length && !TOKEN_STOP.test(text[b])) b++;
  return { from: a, to: b, text: text.slice(a, b) };
}

/**
 * Compiles masking.allow (JavaScript regular expressions, case-sensitive, searched in the value).
 * @throws {KitError} exit code 2 on an invalid expression
 */
function allowMatchers(patterns = []) {
  return patterns.map((p, i) => {
    try {
      return new RegExp(p);
    } catch (e) {
      throw new KitError(
        EXIT.USAGE,
        "config.invalid",
        { file: "doc.config.mjs", n: 1 },
        {
          details: [{ path: `masking.allow[${i}]`, key: "regex", vars: { error: e.message } }],
          prefix: "doc.config.mjs",
        },
      );
    }
  });
}

/**
 * Why a match is not a secret, or null when it must be reported (rules at the top of this file).
 * @param {{ exclude?: string|null, allow?: string[] }} [masking]
 * @returns {(value: string, token?: string) => "local"|"template"|"exclude"|"allow"|null}
 */
export function ignoreRules(masking = {}) {
  const exclude = masking.exclude ? new RegExp(masking.exclude, "i") : null;
  const allow = allowMatchers(masking.allow || []);
  // The matches of one token come one after the other (scanText gives them the same string): decided once.
  let lastToken = null;
  let lastTemplate = false;
  const isTemplate = (t) => (t === lastToken ? lastTemplate : ((lastToken = t), (lastTemplate = isUrlTemplate(t))));
  return (value, token = value) => {
    if (isLocalAddress(value)) return "local";
    if (isTemplate(token)) return "template";
    if (exclude && exclude.test(value)) return "exclude";
    if (allow.some((re) => re.test(value))) return "allow";
    return null;
  };
}
const BUILT_IN_RULES = ignoreRules();
/**
 * Files never exported nor read for a page, at any depth: environment files, keys and certificates (`*.p8` too),
 * tool credentials (`.htpasswd`, a Google OAuth `client_secret*.json`, a `kubeconfig`), Terraform state and variables
 * (`*.tfvars`), PuTTY keys, VPN profiles, encrypted files, the settings of an environment (appsettings.*.json, and
 * its `.bak` copy).
 */
export const SECRET_FILE =
  /^(\.env(\..*)?|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|credentials(\.json)?|client_secret(_[\w.-]+)?\.json|kubeconfig(\.ya?ml)?|appsettings\..+\.json(\.bak)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p8|p12|pfx|jks|keystore|kdbx|ppk|ovpn|gpg|kubeconfig|tfvars|tfvars\.json|tfstate|tfstate\.backup))$/i;

/**
 * Whether a value detector of GENERIC finds something in a short text from an untrusted source (a version, a
 * licence, a hint read in the code): the one test of the readers that keep such a text only when it holds no secret.
 * @param {string} text
 */
export const looksSecret = (text) =>
  GENERIC.some((d) => {
    d.re.lastIndex = 0;
    for (const m of text.matchAll(d.re)) if (!d.accept || d.accept(m)) return true;
    return false;
  });

/** First characters and length of a value, never the value itself. */
export function redact(value) {
  const v = String(value);
  return `${v.slice(0, Math.min(4, Math.floor(v.length / 4)))}… (${v.length})`;
}

/**
 * Detectors of a project.
 * @returns {Array<{ kind: string, re: RegExp, key?: string, file?: string, allow?: RegExp, index?: number }>}
 */
export function detectors(root, masking) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** @type {Array<{ kind: string, re: RegExp, key?: string, file?: string, allow?: RegExp, index?: number }>} */
  const list = sensitiveValues(root, masking).map((v) => ({
    kind: "env",
    key: v.key,
    file: v.file,
    re: new RegExp(escape(v.value), "gi"),
  }));
  if (masking.guid) list.push({ kind: "guid", re: new RegExp(GUID, "g"), allow: /^0{8}-0{4}-0{4}-0{4}-0{12}$/ });
  masking.patterns.forEach((p, i) => list.push({ kind: "pattern", index: i, re: new RegExp(p, "g") }));
  return [...list, ...GENERIC];
}

/**
 * Findings in a text: { kind, preview, line, key?, file? }.
 * @param {(value: string, token: string) => string|null} [ignore]   ignoreRules(masking); by default the built-in
 *   rules only (local addresses, URL templates)
 */
export function scanText(text, list, ignore = BUILT_IN_RULES) {
  const out = [];
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lines.push(i + 1);
  const lineOf = (index) => {
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  // The last token found: a match inside it with no stop character has the same one (not walked again, the same
  // string given to `ignore`), so that many matches in one long token cost its length once.
  let token = { from: 0, to: -1, text: "", whole: false };
  const tokenOf = (m) => {
    const end = m.index + m[0].length;
    const whole = !TOKEN_STOP.test(m[0]);
    if (!(whole && token.whole && m.index >= token.from && end <= token.to))
      token = { ...tokenAround(text, m.index, end), whole };
    return token.text;
  };
  // A fallback detector (entropy) runs last and only reports a line no other detector reported: one finding per
  // secret, under its most precise kind.
  const reported = new Set();
  for (const d of [...list.filter((x) => !x.fallback), ...list.filter((x) => x.fallback)]) {
    d.re.lastIndex = 0;
    for (const m of text.matchAll(new RegExp(d.re.source, d.re.flags.includes("g") ? d.re.flags : d.re.flags + "g"))) {
      if ((d.allow && d.allow.test(m[0])) || (d.accept && !d.accept(m))) continue;
      const line = lineOf(m.index);
      if (d.fallback && reported.has(line)) continue;
      const value = m.groups?.v ?? m[0];
      if (ignore(value.trim(), tokenOf(m))) continue;
      if (!d.fallback) reported.add(line);
      out.push({
        kind: d.kind,
        preview: redact(value.trim()),
        line,
        ...(d.key ? { key: d.key, file: d.file } : {}),
      });
    }
  }
  return out;
}

/**
 * The text with every line where a secret detector fires replaced by a notice (the value is never kept). Shared by
 * every writer of a file read by people or agents (`pack`, reports): one filter, the same detectors.
 * @param {string} text
 * @param {object[]} detectorList   detectors()
 * @param {(kind: string) => string} notice   the replacement line, from the kind of secret
 * @param {(value: string, token: string) => string|null} [ignore]   ignoreRules(config.masking)
 * @returns {{ text: string, removed: Array<{ line: number, kind: string }> }}
 */
export function withoutSecrets(text, detectorList, notice, ignore = undefined) {
  const found = scanText(text, detectorList, ignore);
  if (!found.length) return { text, removed: [] };
  const byLine = new Map(found.map((f) => [f.line, f.kind]));
  const lines = text.split("\n").map((l, i) => (byLine.has(i + 1) ? notice(byLine.get(i + 1)) : l));
  return {
    text: lines.join("\n"),
    removed: [...byLine].map(([line, kind]) => ({ line, kind })).sort((a, b) => a.line - b.line),
  };
}

// The build breaks long code spans with <wbr> (after "/", ".", "?", "="…): removed without a space, so that a URL
// of the site reads as in its source (its value, and the URL template around a match).
/**
 * The attribute values of an HTML text (`href`, `title`, `alt`, `aria-*`, `data-*`, `placeholder`, `value`…): a secret
 * there is in the site even though no reader sees it on the page. Embedded files (`data:` URIs) are left out.
 * Linear: a name, `=`, then one quoted value with no nested quantifier (RULES.md S5).
 */
export const HTML_ATTRIBUTE = /\s([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const htmlAttributes = (html) =>
  [...String(html || "").matchAll(HTML_ATTRIBUTE)]
    .map((m) => m[2] ?? m[3] ?? "")
    .filter((v) => v && !/^data:/i.test(v))
    .join("\n");

/**
 * `html` with every match of `re` replaced by " ", searched only up to the end of the last `close` (upToLast): every
 * match ends with one, so an element or a tag left open is not read to the end of the text again from each opening.
 */
function blankClosed(html, re, close) {
  const closed = upToLast(html, close);
  return closed.replace(re, " ") + html.slice(closed.length);
}

/** The text of a page's HTML: scripts, styles and tags blanked, entities decoded (RULES.md S5: linear). */
export const htmlText = (html) =>
  blankClosed(
    blankClosed(
      blankClosed(String(html || ""), /<script[\s\S]*?<\/script>/gi, /<\/script>/gi),
      /<style[\s\S]*?<\/style>/gi,
      /<\/style>/gi,
    ).replace(/<wbr\s*\/?>/gi, ""),
    /<[^>]+>/g,
    />/g,
  )
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Texts of a built site (its embedded data), by place: pages, section introductions, home page, glossary. */
function siteTexts(data) {
  if (!data) return [];
  const out = [];
  for (const [id, p] of Object.entries(data.pages || {}))
    out.push({ where: id, text: [p.title, p.summary, htmlText(p.html), htmlAttributes(p.html)].join("\n") });
  for (const s of data.sections || [])
    out.push({
      where: s.id,
      text: [s.title, s.subtitle, ...(s.highlights || []), htmlText(s.introHtml), htmlAttributes(s.introHtml)].join(
        "\n",
      ),
    });
  out.push({
    where: "home",
    text: [data.meta?.title, data.meta?.tagline, htmlText(data.homeHtml), htmlAttributes(data.homeHtml)].join("\n"),
  });
  for (const g of data.glossary || []) out.push({ where: `glossary › ${g.term}`, text: `${g.term}\n${g.def}` });
  return out;
}

const walk = (dir, filter, skip = new Set(["node_modules", ".git"])) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (skip.has(d.name)) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, filter, skip) : d.isFile() && filter(d.name) ? [p] : [];
  });
};

/** Is this JSON text a Playwright storageState (a sign-in session)? */
export function isStorageState(text) {
  try {
    const j = JSON.parse(text);
    return !!j && Array.isArray(j.cookies) && Array.isArray(j.origins);
  } catch {
    return false;
  }
}

/**
 * How a storageState starts: an object whose first key, "cookies" or "origins", holds an array (`\s` takes a byte
 * order mark too). Linear: anchored, blanks between fixed characters.
 */
export const SESSION_HEAD = /^\s*\{\s*"(cookies|origins)"\s*:\s*\[\s*/;
/** The other key of a storageState, holding an array, anywhere in the head. */
const SESSION_OTHER_KEY = { cookies: /"origins"\s*:\s*\[/, origins: /"cookies"\s*:\s*\[/ };
/** A JSON string. Linear: a character or an escape, never both. */
const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`;
/** The first item of a storageState's list as Playwright writes it: a cookie (name, value, domain), an origin. */
const SESSION_ITEM = {
  cookies: new RegExp(
    String.raw`^\{\s*"name"\s*:\s*${JSON_STRING}\s*,\s*"value"\s*:\s*${JSON_STRING}\s*,\s*"domain"\s*:`,
  ),
  origins: new RegExp(String.raw`^\{\s*"origin"\s*:\s*${JSON_STRING}\s*,\s*"localStorage"\s*:\s*\[`),
};
/** What is read of a file to tell a session: a session of local storage can weigh megabytes. */
const SESSION_HEAD_BYTES = 64 * 1024;

/**
 * Does a text start as a storageState (SESSION_HEAD), with a session's other key in it or a first item of a
 * session's shape (a cookie: `name`, `value`, `domain`; an origin: `origin`, `localStorage`)? A data file whose first
 * key is merely "cookies" or "origins" (`{"cookies": [{"id": 1, "flavour": …}]}`) is not one.
 * @param {string} head
 */
export function startsAsSession(head) {
  const m = SESSION_HEAD.exec(head);
  if (!m) return false;
  const first = /** @type {"cookies"|"origins"} */ (m[1]);
  return SESSION_OTHER_KEY[first].test(head) || SESSION_ITEM[first].test(head.slice(m[0].length));
}

/**
 * Is a file a browser session (a storageState), whatever its size? Only its first 64 KB are read: a file that fits
 * in them is parsed, a longer one is a session when it starts as one (startsAsSession). False when it cannot be read.
 * @param {string} file
 */
export function isSessionFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(SESSION_HEAD_BYTES + 1);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const text = head.toString("utf8", 0, n);
    return n <= SESSION_HEAD_BYTES ? isStorageState(text) : startsAsSession(text);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Is a file tracked by git? (false when git is not available, refused, or the folder is not a repository)
 * @param {string} file
 * @param {{ exec?: import("../util/safe-git.mjs").Exec }} [o]   exec: the launcher of the context (`ctx.exec`),
 *   called as exec("git", args, { cwd }); without it, the kit's own hardened launcher (`spawnHardened`)
 */
export function trackedByGit(file, { exec } = {}) {
  const cwd = path.dirname(file);
  const args = ["ls-files", "--error-unmatch", "--", path.basename(file)];
  // null: git missing; a refused git answers status 128.
  if (exec) return exec("git", args, { cwd })?.status === 0;
  return spawnHardened("git", args, { cwd })?.status === 0;
}

/**
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object|null} p.data       embedded data of the site built as a draft (null: sources only)
 * @param {string} p.session         session file (sessions elsewhere in the project are reported)
 * @param {(file: string) => boolean} [p.tracked]   git check: by default `trackedByGit` starting git itself; a
 *   command passes one built on its context's launcher, (file) => trackedByGit(file, { exec: ctx.exec })
 * @returns {{ findings: object[], files: number, places: number, ignored: object }}
 *   each finding: { where, kind, preview, line?, key?, file? } or { where, kind: "sessionOutside" | "sessionTracked" };
 *   ignored: the matches that are not secrets, counted by rule ({ local?, template?, exclude?, allow? })
 * @throws {KitError} exit code 2: invalid masking.allow expression
 */
export function checkSecrets({ root, config, data, session, tracked = trackedByGit }) {
  const list = detectors(root, config.masking);
  const rules = ignoreRules(config.masking);
  const ignored = {};
  const ignore = (value, token) => {
    const why = rules(value, token);
    if (why) ignored[why] = (ignored[why] || 0) + 1;
    return why;
  };
  const findings = [];
  const rel = (f) => path.relative(root, f).split(path.sep).join("/");
  const sources = [
    ...walk(path.join(root, config.paths.content), (n) => /\.(md|json)$/i.test(n)),
    // Zone files of every language: <images>/zones and <images>/<lang>/zones.
    ...walk(path.join(root, config.paths.images), (n) => n.endsWith(".json")),
    // Translated pages, table of contents and glossary (ARCHITECTURE.md §6.12).
    ...(config.paths.translations
      ? walk(path.join(root, config.paths.translations), (n) => /\.(md|json)$/i.test(n))
      : []),
    ...walk(path.join(root, config.capture.plans), (n) => /\.(mjs|js|json)$/i.test(n)),
    ...walk(path.join(root, config.paths.diagrams), (n) => n.endsWith(".svg")),
  ];
  const files = [...new Set(sources)];
  for (const f of files)
    for (const x of scanText(fs.readFileSync(f, "utf8"), list, ignore))
      findings.push({ where: `${rel(f)}:${x.line}`, ...x });
  const places = siteTexts(data);
  for (const p of places)
    for (const x of scanText(p.text, list, ignore))
      findings.push({ ...x, where: `site › ${p.where}`, line: undefined });

  const sessionDir = path.dirname(session);
  const skip = new Set(["node_modules", ".git", "dist"]);
  for (const f of walk(root, (n) => n.endsWith(".json"), skip))
    if (path.dirname(f) !== sessionDir && isSessionFile(f)) findings.push({ where: rel(f), kind: "sessionOutside" });
  if (fs.existsSync(session) && tracked(session)) findings.push({ where: rel(session), kind: "sessionTracked" });
  return { findings, files: files.length, places: places.length, ignored };
}
