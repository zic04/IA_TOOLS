// Environment variables. Precedence (ARCHITECTURE.md §3):
//   CLI option > DOC_KIT_<NAME> > <PREFIX>_<NAME> > configuration file > default.
// Mapped onto the configuration (other variables, such as SESSION, are read with readEnv):
//   URL → app.url · PLANS → capture.plans · READONLY → capture.readOnly · VERSION → version.fallback
import { KitError, EXIT } from "./errors.mjs";

export const MAPPINGS = [
  { name: "URL", path: ["app", "url"], convert: (v) => v.replace(/\/+$/, "") },
  { name: "PLANS", path: ["capture", "plans"] },
  { name: "READONLY", path: ["capture", "readOnly"], convert: readOnly },
  { name: "VERSION", path: ["version", "fallback"] },
];

function readOnly(v, variable) {
  const x = v.trim().toLowerCase();
  if (["1", "true", "yes", "oui"].includes(x)) return true;
  if (["0", "false", "no", "non"].includes(x)) return false;
  if (x === "auto") return "auto";
  throw new KitError(EXIT.USAGE, "env.value", { variable, value: v, expected: "auto | true | false" });
}

/**
 * Value of a variable: DOC_KIT_<NAME>, else <PREFIX>_<NAME>; undefined when neither is set (an empty string
 * counts as unset). Also returns the name of the variable that was used.
 */
export function readEnv(name, prefix, env = process.env) {
  for (const variable of [`DOC_KIT_${name}`, prefix ? `${prefix}_${name}` : null]) {
    if (variable && env[variable] !== undefined && env[variable] !== "") return { value: env[variable], variable };
  }
  return undefined;
}

/** Applies the environment variables to a completed configuration (mutates and returns `config`). */
export function applyEnv(config, env = process.env) {
  for (const m of MAPPINGS) {
    const found = readEnv(m.name, config.env.prefix, env);
    if (!found) continue;
    let target = config;
    for (const k of m.path.slice(0, -1)) target = target[k];
    target[m.path.at(-1)] = m.convert ? m.convert(found.value, found.variable) : found.value;
  }
  return config;
}
