// Secret check: values that must never be published, searched in the text of the built site (pages, section
// introductions, home page, glossary; their text and their HTML attribute values) and in the text sources
// (<content>/, <translations>/, the zone files of every language, capture plans, diagrams).
//   env      values of the masking.env files whose key suggests a URL, host, tenant, client, account, e-mail,
//            user or secret (the values masked in the screenshots)
//   guid     GUIDs, when masking.guid is true (the nil GUID 00000000-… is allowed)
//   pattern  the masking.patterns expressions
//   generic  actual secret VALUES only, never a mere mention: a PEM private key block holding base64 key
//            material (a "-----BEGIN PRIVATE KEY-----" line alone is documentation), a JWT, the password of a
//            connection string or of a URL, a cloud access key, the value of a key/token/password assignment, the
//            signature of a signed URL; placeholders ("<password>", "****", "${SECRET}", "example", "exemple",
//            "motdepasse", an UPPER_CASE variable name…) are not values
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
import { spawnSync } from "node:child_process";
import { sensitiveValues, GUID } from "../capture/masking.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { safeGitArgs, riskyGitConfig, resolveOnPath } from "../util/safe-git.mjs";

/** A placeholder, a variable name or a masked value: not a secret. */
export const PLACEHOLDER =
  /^(?:x+|\*+|•+|\.+|0+|_+|-+)$|example|exemple|placeholder|your|votre|changeme|masked|redacted|dummy|sample|mot[-_ ]?de[-_ ]?passe|[<>{}]|\$\(|\.\.\.|…|process\.env|import\.meta|os\.environ/i;

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

/** Does a piece of text hold a URL template, a URL with {…} placeholders (https://tiles.example.org/{z}/{x}/{y}.png)? */
export const isUrlTemplate = (text) => /[a-z][a-z0-9+.-]*:\/\/\S*\{[^{}\s]+\}/i.test(String(text));

/** The token around a match: up to white space, quotes, backticks, brackets, parentheses, pipes or angle brackets. */
function tokenAround(text, start, end) {
  const stop = /[\s"'`<>()[\]|]/;
  let a = start;
  let b = end;
  while (a > 0 && !stop.test(text[a - 1])) a--;
  while (b < text.length && !stop.test(text[b])) b++;
  return text.slice(a, b);
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
  return (value, token = value) => {
    if (isLocalAddress(value)) return "local";
    if (isUrlTemplate(token)) return "template";
    if (exclude && exclude.test(value)) return "exclude";
    if (allow.some((re) => re.test(value))) return "allow";
    return null;
  };
}
const BUILT_IN_RULES = ignoreRules();
const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
const isValue = (v) => !!v && !PLACEHOLDER.test(v) && !VARIABLE_NAME.test(v);
const looksRandom = (v) => isValue(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && new Set(v).size > 5;

/** Value detectors: `re` (group `v` = the value, else the whole match) and an optional `accept(match)`. */
export const GENERIC = Object.freeze([
  {
    kind: "privateKey",
    re: /-----BEGIN ([A-Z0-9 ]*?)PRIVATE KEY-----[ \t]*\r?\n(?<v>(?:[ \t]*(?:(?:[A-Za-z0-9+/=]+|[A-Za-z-]+:[^\n]*)[ \t]*)?\r?\n)+?)[ \t]*-----END \1PRIVATE KEY-----/g,
    accept: (m) => m.groups.v.replace(/^[A-Za-z-]+:.*$/gm, "").replace(/\s/g, "").length >= 40,
  },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    kind: "connectionString",
    re: /\b(?:AccountKey|SharedAccessKey|Password|Pwd)\s*=\s*(?<v>[^;\s"'`]{6,})/gi,
    accept: (m) => isValue(m.groups.v),
  },
  {
    kind: "credentialsUrl",
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/"'<>`]+:(?<v>[^\s@/"'`]{3,})@[^\s"'<>`]+/gi,
    accept: (m) => isValue(m.groups.v) && !/^pass(word)?$/i.test(m.groups.v),
  },
  {
    kind: "cloudKey",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    kind: "assignment",
    re: /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret|access[_-]?key)\b["']?\s*[:=]\s*["']?(?<v>[A-Za-z0-9_\-+/=.]{16,})/gi,
    accept: (m) => looksRandom(m.groups.v),
  },
  { kind: "signedUrl", re: /[?&]sig=(?<v>[A-Za-z0-9%+/=]{20,})/g },
]);

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
  for (const d of list) {
    d.re.lastIndex = 0;
    for (const m of text.matchAll(new RegExp(d.re.source, d.re.flags.includes("g") ? d.re.flags : d.re.flags + "g"))) {
      if ((d.allow && d.allow.test(m[0])) || (d.accept && !d.accept(m))) continue;
      const value = m.groups?.v ?? m[0];
      if (ignore(value.trim(), tokenAround(text, m.index, m.index + m[0].length))) continue;
      out.push({
        kind: d.kind,
        preview: redact(value.trim()),
        line: lineOf(m.index),
        ...(d.key ? { key: d.key, file: d.file } : {}),
      });
    }
  }
  return out;
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

const htmlText = (html) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<wbr\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, " ")
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
    out.push({ where: id, text: [p.titre, p.resume, htmlText(p.html), htmlAttributes(p.html)].join("\n") });
  for (const s of data.sections || [])
    out.push({
      where: s.id,
      text: [s.titre, s.sous_titre, ...(s.points || []), htmlText(s.intro_html), htmlAttributes(s.intro_html)].join(
        "\n",
      ),
    });
  out.push({
    where: "home",
    text: [data.meta?.titre, data.meta?.accroche, htmlText(data.accueil_html), htmlAttributes(data.accueil_html)].join(
      "\n",
    ),
  });
  for (const g of data.glossaire || []) out.push({ where: `glossary › ${g.terme}`, text: `${g.terme}\n${g.def}` });
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

/** Is a file tracked by git? (false when git is not available or the folder is not a repository) */
function trackedByGit(file) {
  const cwd = path.dirname(file);
  if (riskyGitConfig(cwd).length) return false;
  const bin = resolveOnPath("git", { exclude: [cwd] });
  if (!bin) return false;
  const r = spawnSync(bin, safeGitArgs(["ls-files", "--error-unmatch", "--", path.basename(file)]), {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0;
}

/**
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object|null} p.data       embedded data of the site built as a draft (null: sources only)
 * @param {string} p.session         session file (sessions elsewhere in the project are reported)
 * @param {(file: string) => boolean} [p.tracked]   git check (injectable for the tests)
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
  for (const f of walk(root, (n) => n.endsWith(".json"), skip)) {
    if (path.dirname(f) === sessionDir || fs.statSync(f).size > 5_000_000) continue;
    if (isStorageState(fs.readFileSync(f, "utf8"))) findings.push({ where: rel(f), kind: "sessionOutside" });
  }
  if (fs.existsSync(session) && tracked(session)) findings.push({ where: rel(session), kind: "sessionTracked" });
  return { findings, files: files.length, places: places.length, ignored };
}
