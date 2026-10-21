// What the infra adapters share (adapters/infra/, ARCHITECTURE.md §5): the environment a file is for, from its path
// (envs/prod/main.tf, values.staging.yaml, deployment-dev.yaml), and whether an address range is open to all
// (0.0.0.0/0, ::/0, "*", Azure's "Internet"), an image reference's name and tag, a YAML boolean. Pure.
import { text } from "../core/yaml.mjs";

/** The usual names of environments, each to the one name the facts give it. */
const ENVIRONMENTS = Object.freeze({
  prod: "production",
  production: "production",
  prd: "production",
  live: "production",
  staging: "staging",
  stage: "staging",
  stg: "staging",
  preprod: "preprod",
  "pre-prod": "preprod",
  uat: "uat",
  qa: "qa",
  test: "test",
  testing: "test",
  dev: "development",
  development: "development",
  local: "local",
  sandbox: "sandbox",
  demo: "demo",
});

/** The separators of the words of a path. */
const PATH_WORDS = /[/._-]/;

/** The expressions of this module (test/tools/redos-worker.mjs, RULES.md S5). */
export const INFRA_COMMON_PATTERNS = Object.freeze({ PATH_WORDS });

/**
 * The environment a name says (`prod`, `Production`, `staging`…), one of the facts' names, or undefined.
 * @param {unknown} name
 */
export const environmentOf = (name) =>
  typeof name === "string" && name.length <= 64
    ? ENVIRONMENTS[/** @type {keyof ENVIRONMENTS} */ (name.toLowerCase())]
    : undefined;

/**
 * The environment a file is for, from the words of its path (the last one found: envs/prod/eu/main.tf is production),
 * or undefined.
 * @param {string} file
 */
export function environmentOfPath(file) {
  let found;
  for (const w of file.split(PATH_WORDS)) found = environmentOf(w) ?? found;
  return found;
}

/** A file's folder ("" at the root) and its name, from its path in the application (forward slashes). */
export const folderOf = (file) => file.slice(0, Math.max(0, file.lastIndexOf("/")));
export const baseOf = (file) => file.slice(file.lastIndexOf("/") + 1);

/** The address ranges that let anyone in. */
const OPEN = new Set(["0.0.0.0/0", "::/0", "*", "internet", "any"]);

/**
 * Whether an address range (a CIDR, an Azure service tag) is open to all.
 * @param {unknown} range
 */
export const openToAll = (range) => typeof range === "string" && OPEN.has(range.trim().toLowerCase());

/** Whether the text after an image reference's last "@" is a digest: `<algorithm>:<hex>` (32 digits at least), or a placeholder. */
function isDigest(s) {
  if (s.startsWith("${") && s.endsWith("}")) return true;
  const colon = s.indexOf(":");
  if (colon < 1 || s.length - colon - 1 < 32) return false;
  for (let i = colon + 1; i < s.length; i++) if (!"0123456789abcdefABCDEF".includes(s[i])) return false;
  return true;
}

/**
 * An image reference's name and tag: the tag after the first ":" past the last "/" (a registry's host:port is no
 * tag), outside a `${…}` placeholder; a digest (`@sha256:…`) taken off; no tag when it names none (`latest` is then
 * pulled). An image reference holds no other "@": one ends the credentials of a registry (`user:password@host/app`),
 * which are taken off with all before them. One pass.
 * @param {string} ref
 * @returns {{ image: string, tag?: string }}
 */
export function imageOf(ref) {
  const digest = ref.lastIndexOf("@");
  const named = digest !== -1 && isDigest(ref.slice(digest + 1)) ? ref.slice(0, digest) : ref;
  const bare = named.slice(named.lastIndexOf("@") + 1);
  let colon = -1;
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const c = bare[i];
    if (c === "$" && bare[i + 1] === "{") {
      depth++;
      i++;
    } else if (c === "}" && depth) depth--;
    else if (!depth && c === "/") colon = -1;
    else if (!depth && c === ":" && colon === -1) colon = i;
  }
  return colon === -1 ? { image: bare } : { image: bare.slice(0, colon), tag: bare.slice(colon + 1) };
}

/**
 * A source (a module's, a linked template's) without what its query may carry — a SAS token, a presigned URL's
 * signature, an S3 or GCS source's credentials — but its `ref` (a git source's tag or branch).
 * @param {string} value
 */
export function withoutQuery(value) {
  const q = value.indexOf("?");
  if (q === -1) return value;
  const ref = value
    .slice(q + 1)
    .split("&")
    .find((p) => p.startsWith("ref="));
  return value.slice(0, q) + (ref ? `?${ref}` : "");
}

/** A YAML boolean (`true`, `yes`, `on` and their opposites, any case), or undefined. */
export function bool(n) {
  const t = text(n)?.toLowerCase();
  return t === "true" || t === "yes" || t === "on"
    ? true
    : t === "false" || t === "no" || t === "off"
      ? false
      : undefined;
}
