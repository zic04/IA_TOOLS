// The sources of a documentation project (ARCHITECTURE.md §6.19): `inputs.json` at the project's root, written by
// `doc-kit init` and `doc-kit inputs add` (data, not code: doc.config.mjs is never rewritten). It names the code
// (local folders, or shared repositories fetched with the user's own git credentials), the application online by
// environment, the documents a team already has (a technical architecture document, specifications, as files or
// links), its collaborative spaces and its backlog. It never holds a secret: a URL with credentials is refused.
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { isSafeRef } from "../util/safe-git.mjs";
import { hashText } from "../core/hash.mjs";
import { GENERIC, scanText, looksRandom } from "../check/secrets.mjs";

export const INPUTS_FILE = "inputs.json";
/** Where the kit keeps what it fetches and converts (the work folder, never committed). */
export const INPUTS_DIR = path.join(".doc-kit", "inputs");

const SCHEMA = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "inputs.schema.json"), "utf8"));
const ORDER = ["code", "app", "documents", "workspaces", "backlog"];

// A repository address: https without credentials, ssh, or the scp-like form (git@host:path). Never an option
// (a leading "-"), never a transport helper ("ext::…"), never a space or a control character (RULES.md S2).
// A user and a host start with a letter or a digit: never a "-" that ssh would read as an option.
const HTTPS_REPO = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d{1,5})?\/[^\s?#@]+$/;
const SSH_REPO = /^ssh:\/\/(?:[A-Za-z0-9][A-Za-z0-9._-]*@)?[A-Za-z0-9][A-Za-z0-9.-]*(?::\d{1,5})?\/[^\s]+$/;
const SCP_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*:[^\s-][^\s]*$/;

/**
 * Query, fragment and path (`;name=value`) parameters whose value is a secret, by the end of their normalised name
 * (lower case, without `-`, `_`, `.`, percent-encoding or invisible characters: `accessToken`, `private_token`,
 * `X-Amz-Signature`, `jsessionid`).
 */
const SECRET_ENDINGS = [
  ...["token", "secret", "password", "passwd", "pwd", "pass", "signature", "sig", "apikey", "accesskey"],
  ...["privatekey", "credential", "credentials", "bearer", "jwt", "sessionid"],
];
/**
 * Name endings that are often ordinary (`?key=ENG`, `?code=FR`, `?auth=sso`) and often not (`subscription-key`,
 * `authkey`, `license_key`): a secret when the value looks generated.
 */
const AMBIGUOUS = ["key", "code", "auth"];
/** A value that is a switch or a small number (`?showPassword=false`, `?pageToken=2`): never a secret. */
const TRIVIAL = new Set(["true", "false", "yes", "no", "on", "off", "null", "none"]);
const trivial = (value) => {
  const v = value.toLowerCase();
  if (TRIVIAL.has(v)) return true;
  if (v.length > 4) return false;
  for (const ch of v) if (ch < "0" || ch > "9") return false;
  return true;
};

const HEX = "0123456789abcdef";
/** A parameter name as it is compared: `%XX` decoded, lower case, letters and digits only (one pass, no exception). */
function paramName(raw) {
  const name = raw.toLowerCase();
  let out = "";
  for (let i = 0; i < name.length; i++) {
    let ch = name[i];
    if (ch === "%" && HEX.includes(name[i + 1] ?? "x") && HEX.includes(name[i + 2] ?? "x")) {
      ch = String.fromCharCode(parseInt(name.slice(i + 1, i + 3), 16)).toLowerCase();
      i += 2;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) out += ch;
  }
  return out;
}

/** Transports where a user is only a name (`ssh://git@host`): a password there is still a credential. */
const USER_ONLY = new Set(["ssh", "git+ssh", "ssh+git"]);
const isSchemeChar = (c) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "+" || c === "." || c === "-";
const isBlank = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";

/**
 * The user-infos of every address in a text: after each `scheme:` followed by any number of slashes (`https:/`,
 * `https://`, `https:////`, read as browsers and git read them), up to the end of its authority. Linear: the scans
 * of two addresses never overlap.
 * @returns {Array<{ scheme: string, user: string }>}
 */
function userInfos(v) {
  const out = [];
  for (let i = v.indexOf(":/"); i > 0; i = v.indexOf(":/", i + 2)) {
    let s = i;
    while (s > 0 && isSchemeChar(v[s - 1])) s--;
    // A scheme starts with a letter: `1https://` is the address `https://` after a stray character.
    while (s < i && !((v[s] >= "a" && v[s] <= "z") || (v[s] >= "A" && v[s] <= "Z"))) s++;
    const scheme = v.slice(s, i).toLowerCase();
    if (!scheme) continue;
    // An address given as a parameter's value (`?redirect_uri=https://app&login_hint=jo@x`) ends at the next "&".
    const nested = s > 0 && v[s - 1] === "=";
    let a = i + 1;
    while (v[a] === "/") a++;
    let end = a;
    // The last "@" of the authority, noted on the way (never searched back through the whole text).
    let at = -1;
    for (; end < v.length && !"/?#".includes(v[end]) && !isBlank(v[end]) && !(nested && v[end] === "&"); end++)
      if (v[end] === "@") at = end;
    if (at >= a) out.push({ scheme, user: v.slice(a, at) });
  }
  return out;
}

/** What the WHATWG reader of browsers sees in an address (`https:u:pw@host` included), or nothing. */
function parsedUser(v) {
  try {
    const u = new URL(v);
    return u.username || u.password ? { scheme: u.protocol.slice(0, -1), password: !!u.password } : null;
  } catch {
    return null;
  }
}

/** Whether a query, a fragment or a path parameter (`;name=value`) of an address is a secret with a value. */
function secretParameter(v) {
  for (const pair of v.split(/[?#&;]/).slice(1)) {
    const eq = pair.indexOf("=");
    if (eq <= 0 || eq === pair.length - 1) continue;
    const name = paramName(pair.slice(0, eq));
    const value = pair.slice(eq + 1);
    if (trivial(value)) continue;
    if (SECRET_ENDINGS.some((end) => name.endsWith(end))) return true;
    if (AMBIGUOUS.some((end) => name.endsWith(end)) && looksRandom(value) && value.length >= 16) return true;
  }
  return false;
}

/**
 * Whether a value of inputs.json (an address, a path, a title) carries credentials or a secret: a user in any
 * address it holds (any scheme but ssh, where a password only: a token is often given as a user), whatever the
 * slashes after the scheme, as the WHATWG reader of browsers reads it too; a password in `user:password@host:path`;
 * a secret parameter (`?private_token=`, `;jsessionid=`); or what the secret detectors of `check secrets` find.
 * Backslashes count as slashes; spaces, quotes and angle brackets around it change nothing. Such a value is refused
 * before anything shows it (RULES.md S7).
 * @param {unknown} value
 */
export function hasCredentials(value) {
  const v = String(value ?? "")
    .trim()
    .split("\\")
    .join("/");
  for (const { scheme, user } of userInfos(v)) if (user.includes(":") || !USER_ONLY.has(scheme)) return true;
  // The WHATWG reader, whatever the blanks (it reads `https://user:my pw@host` as a user and a password; free text
  // without a scheme does not parse).
  const parsed = parsedUser(v);
  if (parsed && (parsed.password || !USER_ONLY.has(parsed.scheme))) return true;
  let blank = false;
  for (const ch of v) if (isBlank(ch)) blank = true;
  if (!blank) {
    // git@host:path with a password (`user:pw@host:path`); a Windows drive (`C:/…/spec@v2.docx`) is a path. Free
    // text (a title) is left to the other rules: an address never holds a space.
    const rest = v.length > 2 && v[1] === ":" && v[2] === "/" ? v.slice(2) : v;
    const at = rest.indexOf("@");
    const user = at > 0 ? rest.slice(0, at) : "";
    if (user.includes(":") && !user.includes("/")) return true;
  }
  return secretParameter(v) || scanText(v, GENERIC).length > 0;
}

/** Every text of the entries of inputs.json, with where it is: the credential check reads them all. */
function addresses(data) {
  const out = [];
  const fields = (where, x) => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) if (typeof v === "string") out.push([`${where}.${k}`, v]);
  };
  for (const key of ["code", "app", "documents", "workspaces"])
    if (Array.isArray(data?.[key])) data[key].forEach((x, i) => fields(`${key}[${i}]`, x));
  fields("backlog", data?.backlog);
  return out;
}

/**
 * Whether a repository address is one the kit may give git: https (no `user@`, no token), ssh, or git@host:path.
 * @param {unknown} url
 */
export function isSafeRepoUrl(url) {
  if (typeof url !== "string" || url.length > 2048 || url.includes("::")) return false;
  for (let i = 0; i < url.length; i++) if (url.charCodeAt(i) < 0x20 || url.charCodeAt(i) === 0x7f) return false;
  return HTTPS_REPO.test(url) || SSH_REPO.test(url) || SCP_REPO.test(url);
}

/** The id of a source from an address or a path: its last part, without .git, as lower-case letters and dashes. */
export function nameOf(value) {
  const last =
    String(value)
      .split(/[\\/:]/)
      .filter(Boolean)
      .pop() || "code";
  const base = last.endsWith(".git") ? last.slice(0, -4) : last;
  let out = "";
  for (const ch of base.toLowerCase()) out += /[a-z0-9]/.test(ch) ? ch : out.endsWith("-") ? "" : "-";
  out = out.replace(/^-+|-+$/g, "").slice(0, 63);
  return out || "code";
}

/** Where the converted documents and their index are written (relative to the project, forward slashes). */
export const DOCS_DIR = path.join(INPUTS_DIR, "docs").split(path.sep).join("/");
export const INDEX_FILE = `${DOCS_DIR}/index.json`;

/** The index of the converted documents (`doc-kit inputs ingest`), or an empty one. */
export function readIndex(root) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, INDEX_FILE), "utf8"));
    return Array.isArray(data?.documents) ? data : { documents: [] };
  } catch {
    return { documents: [] };
  }
}

/**
 * Where the skill saves a page it read through the session's connectors (a document given by its `url`), for
 * `inputs ingest` to convert it like a file: `.doc-kit/inputs/pages/<name>-<hash>.md`.
 */
export const pageFile = (url) =>
  `${path.join(INPUTS_DIR, "pages").split(path.sep).join("/")}/${nameOf(url)}-${hashText(String(url)).slice(0, 8)}.md`;

/** The pattern of a source's name (schemas/inputs.schema.json): also a folder name, never a path. */
export const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The folder a repository of the sources is fetched into, relative to the project. */
export const repoFolder = (name) => path.join(INPUTS_DIR, "repos", name).split(path.sep).join("/");

/** The problems of the schema, without the values they would show (a value is named by its path, never shown). */
const unshown = (errors) => errors.map((e) => ({ ...e, vars: { ...e.vars, got: "…" } }));

/** Problems a schema cannot see: unique names and environments, safe addresses and branches. */
function semanticProblems(inputs) {
  const problems = [];
  const seen = new Set();
  for (const c of inputs.code || []) {
    if (seen.has(c.name)) problems.push({ key: "inputs.duplicate", vars: { name: c.name } });
    seen.add(c.name);
    if (c.repo !== undefined && !isSafeRepoUrl(c.repo))
      problems.push({ key: "inputs.repoUrl", vars: { name: c.name } });
    if (c.branch !== undefined && !isSafeRef(c.branch))
      problems.push({ key: "inputs.branch", vars: { name: c.name, branch: c.branch } });
  }
  const envs = new Set();
  for (const a of inputs.app || []) {
    if (envs.has(a.env)) problems.push({ key: "inputs.duplicate", vars: { name: a.env } });
    envs.add(a.env);
  }
  return problems;
}

/**
 * The sources of a project, checked: `{ inputs, exists }` (an empty object when the file is absent).
 * @param {string} root   the documentation project
 * @throws {KitError} inputs.invalid (not JSON, or against the schema, with details), inputs.duplicate,
 *   inputs.repoUrl, inputs.branch
 */
export function readInputs(root) {
  const file = path.join(root, INPUTS_FILE);
  if (!fs.existsSync(file)) return { inputs: {}, exists: false };
  let data;
  try {
    const text = fs.readFileSync(file, "utf8");
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new KitError(EXIT.USAGE, "inputs.invalid", { file: INPUTS_FILE, error: `: ${e.message}` });
  }
  // Before the schema, whose details would show the value: an address with credentials is named, never shown.
  const leak = addresses(data).find(([, v]) => hasCredentials(v));
  if (leak) throw new KitError(EXIT.USAGE, "inputs.credentials", { where: `${INPUTS_FILE}: ${leak[0]}` });
  const { errors } = validate(data, SCHEMA);
  if (errors.length)
    throw new KitError(EXIT.USAGE, "inputs.invalid", { file: INPUTS_FILE, error: "" }, { details: unshown(errors) });
  const [problem] = semanticProblems(data);
  if (problem) throw new KitError(EXIT.USAGE, problem.key, problem.vars);
  return { inputs: data, exists: true };
}

/** Writes the sources: the five lists in their order, 2-space JSON, a final newline. */
export function writeInputs(root, inputs) {
  const ordered = Object.fromEntries(ORDER.filter((k) => inputs[k] !== undefined).map((k) => [k, inputs[k]]));
  fs.writeFileSync(path.join(root, INPUTS_FILE), JSON.stringify(ordered, null, 2) + "\n");
}

/** The tool behind a link, from its host (`table`: [suffix, tool]), else "other". */
function toolOf(url, table) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const hit = table.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`) || host.includes(suffix));
  return hit ? hit[1] : "other";
}
const WORKSPACE_HOSTS = [
  ["atlassian.net", "confluence"],
  ["sharepoint.com", "sharepoint"],
  ["teams.microsoft.com", "teams"],
  ["notion.so", "notion"],
  ["notion.site", "notion"],
  ["drive.google.com", "drive"],
  ["docs.google.com", "drive"],
];
const BACKLOG_HOSTS = [
  ["dev.azure.com", "azure"],
  ["visualstudio.com", "azure"],
  ["atlassian.net", "jira"],
  ["github.com", "github"],
  ["gitlab", "gitlab"],
];

const isWeb = (v) => /^https?:\/\//i.test(String(v));
const slashes = (v) => String(v).split(path.sep).join("/");
const titleOf = (o) => (o.title ? { title: o.title } : {});

/** The entry of each kind of source, from the value and the options of `inputs add`. */
const ENTRY = {
  code(o) {
    // A repository by its form (an address, ssh, git@host:path); anything else is a folder.
    const repo = isWeb(o.value) || o.value.startsWith("ssh://") || (o.value.includes("@") && !o.value.includes("\\"));
    const where = repo
      ? { repo: o.value, ...(o.branch ? { branch: o.branch } : {}), ...(o.depth ? { depth: o.depth } : {}) }
      : { path: slashes(o.value) };
    return { name: o.name || nameOf(o.value), ...where, role: o.role || "app", ...titleOf(o) };
  },
  app: (o) => ({ env: o.env || "prod", url: o.value, ...(o.readOnly ? { readOnly: true } : {}) }),
  document: (o) => ({
    ...(isWeb(o.value) ? { url: o.value } : { file: slashes(o.value) }),
    kind: o.kind || "other",
    ...titleOf(o),
  }),
  workspace: (o) => ({ tool: o.tool || toolOf(o.value, WORKSPACE_HOSTS), url: o.value, ...titleOf(o) }),
  backlog: (o) => ({ tool: o.tool || toolOf(o.value, BACKLOG_HOSTS), url: o.value }),
};
/** The list of inputs.json each kind goes to (the backlog is one object). */
const LIST = { code: "code", app: "app", document: "documents", workspace: "workspaces" };

/**
 * One source added (a copy of `inputs`), checked like the whole file.
 * @param {object} inputs
 * @param {string} kind   code, app, document, workspace or backlog
 * @param {{ value: string, name?: string, role?: string, branch?: string, depth?: number, env?: string,
 *   readOnly?: boolean, kind?: string, tool?: string, title?: string }} o
 *   value: a folder or a repository (code), an address (app, workspace, backlog), a file or an address (document)
 * @returns {object}
 * @throws {KitError} inputs.unknownKind, inputs.entry (against the schema), and those of readInputs
 */
export function addInput(inputs, kind, o) {
  if (!Object.hasOwn(ENTRY, kind))
    throw new KitError(EXIT.USAGE, "inputs.unknownKind", { kind, kinds: Object.keys(ENTRY).join(", ") });
  if (hasCredentials(o.value)) throw new KitError(EXIT.USAGE, "inputs.credentials", { where: kind });
  const next = structuredClone(inputs);
  const entry = ENTRY[kind](o);
  // The entry as it would be written, every field of it (a title, a path rewritten with slashes): checked too.
  if (Object.values(entry).some((v) => typeof v === "string" && hasCredentials(v)))
    throw new KitError(EXIT.USAGE, "inputs.credentials", { where: kind });
  if (kind === "backlog") next.backlog = entry;
  else (next[LIST[kind]] ??= []).push(entry);
  const { errors } = validate(next, SCHEMA);
  if (errors.length) throw new KitError(EXIT.USAGE, "inputs.entry", { kind }, { details: unshown(errors) });
  const [problem] = semanticProblems(next);
  if (problem) throw new KitError(EXIT.USAGE, problem.key, problem.vars);
  return next;
}
