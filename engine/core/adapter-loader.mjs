// Loading an adapter by name (ARCHITECTURE.md §5): the kit's own (standard/adapters.json) or a project's
// (`local:<file>`), its shape checked and its options validated. Shared by the capture (authentication), the checks
// (coverage), the facts (stacks) and sync: it lives here, below them all, so that none of them imports the capture
// engine to read a coverage adapter.
//
// Authentication adapter: { name, options, browser: "chromium"|"chrome", detects?, none?, session(page, options,
// tools) } where session() returns null (not signed in) or { who, details, expires }. `tools` = { appUrl,
// isSignInUrl(url, appUrl, pattern) }. Every authentication adapter also accepts the common options below.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KIT_ROOT, CONFIG_FILE } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";
import { KitError, EXIT, firstLine } from "../project/errors.mjs";
import { adaptersOf } from "./adapters.mjs";

/** The kit's adapters of each family that is loaded by name (standard/adapters.json). */
const BUILT_IN = Object.freeze(
  Object.fromEntries(
    ["auth", "coverage", "stack", "infra"].map((family) => [family, adaptersOf(family).map((a) => a.id)]),
  ),
);

/** What an adapter of a family exports: the function it must have, as said by adapter.invalid. */
const METHOD = Object.freeze({
  auth: "session",
  coverage: "inventory",
  stack: "api|screens|behaviours",
  infra: "infra",
});

/**
 * Whether an adapter's default export has the shape of its family: a stack adapter has `files` (an expression on
 * the relative path of a file), a `marker` (on its text) when it has one, and one of api, screens, behaviours.
 */
function hasShape(kind, adapter) {
  if (!adapter) return false;
  if (kind !== "stack" && kind !== "infra") return typeof adapter[METHOD[kind]] === "function";
  const hooks = kind === "stack" ? ["api", "screens", "behaviours"] : ["infra"];
  return (
    adapter.files instanceof RegExp &&
    (adapter.marker === undefined || adapter.marker instanceof RegExp) &&
    hooks.some((m) => typeof adapter[m] === "function")
  );
}

export const LOGIN_PATTERN = "login|signin|sign-in|oauth|authorize";

/** Options accepted by every authentication adapter (an adapter may change their defaults). */
const COMMON_AUTH_OPTIONS = Object.freeze({
  start: { type: "string", pattern: "^/", default: "/" },
  loginPattern: { type: "string", minLength: 1, default: LOGIN_PATTERN },
  browser: { enum: ["chromium", "chrome"] },
});

/**
 * Loads an adapter and validates its options (the configuration entry minus `adapter`).
 * @param {"auth"|"coverage"|"stack"|"infra"} kind
 * @param {object} spec        configuration entry: { adapter: "name" | "local:path", ...options }
 * @param {string} root        project root (local adapters are relative to it)
 * @param {string} where       path of the entry in the configuration, for messages ("auth", "coverage[0]")
 * @returns {Promise<{ name: string, adapter: object, options: object }>}
 */
export async function loadAdapter(kind, spec, root, where) {
  const name = spec.adapter;
  let file;
  if (name.startsWith("local:")) file = path.resolve(root, name.slice(6));
  else if (BUILT_IN[kind].includes(name)) file = path.join(KIT_ROOT, "adapters", kind, `${name}.mjs`);
  else throw new KitError(EXIT.USAGE, "adapter.unknown", { kind, name, known: BUILT_IN[kind].join(", ") });
  if (!fs.existsSync(file)) throw new KitError(EXIT.USAGE, "adapter.missing", { kind, name, file });
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    throw new KitError(EXIT.USAGE, "adapter.import", { kind, name, error: firstLine(e) }, { cause: e });
  }
  const adapter = mod.default;
  if (!hasShape(kind, adapter)) throw new KitError(EXIT.USAGE, "adapter.invalid", { kind, name, method: METHOD[kind] });

  const declared = { ...(kind === "auth" ? COMMON_AUTH_OPTIONS : {}), ...(adapter.options || {}) };
  const required = [];
  const properties = { adapter: { type: "string" } };
  for (const [k, s] of Object.entries(declared)) {
    const { required: isRequired, ...schema } = s;
    if (isRequired) required.push(k);
    properties[k] = schema;
  }
  const { value, errors } = validate(
    spec,
    { type: "object", additionalProperties: false, required, properties },
    { applyDefaults: true },
  );
  if (errors.length)
    throw new KitError(
      EXIT.USAGE,
      "config.invalid",
      { file: CONFIG_FILE, n: errors.length },
      {
        details: errors.map((e) => ({ ...e, path: e.path === "(root)" ? where : `${where}.${e.path}` })),
        prefix: CONFIG_FILE,
      },
    );
  delete value.adapter;
  return { name, adapter, options: value };
}
