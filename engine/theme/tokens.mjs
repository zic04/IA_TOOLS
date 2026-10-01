// Colour tokens of the site: default palette (default-tokens.json) + project overrides (theme.colors for the
// light theme, theme.dark for the dark one), injected before style.css as
//   :root { color-scheme: light; --brand: …; … }
//   html[data-theme="dark"] { color-scheme: dark; --brand: …; … }
// style.css contains no literal colour: only var(--…) and color-mix().
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "default-tokens.json");
let cache = null;

/** Default palette: { light, dark, roles }. */
export function loadTokens() {
  cache ??= JSON.parse(fs.readFileSync(FILE, "utf8"));
  return cache;
}

/** Known token names (without the -- prefix). */
export function tokenNames() {
  const { light, dark } = loadTokens();
  return [...new Set([...Object.keys(light), ...Object.keys(dark)])];
}

/**
 * Checks the overrides (known names; the hexadecimal format is checked by the schema).
 * @returns {Array<{path: string, key: string, vars: object}>}
 */
export function checkOverrides(theme = {}) {
  const known = tokenNames();
  const errors = [];
  for (const group of ["colors", "dark"])
    for (const name of Object.keys(theme[group] || {}))
      if (!known.includes(name)) errors.push({ path: `theme.${group}.${name}`, key: "token", vars: { name, known: known.join(", ") } });
  return errors;
}

/** Resolved tokens of one theme ("light" or "dark"), overrides included, as the CSS cascade sees them. */
export function themeTokens(theme = {}, mode = "light") {
  const { light, dark } = loadTokens();
  const base = { ...light, ...(theme.colors || {}) };
  return mode === "light" ? base : { ...base, ...dark, ...(theme.dark || {}) };
}

/** CSS of the tokens (injected before style.css). */
export function tokenStylesheet(theme = {}) {
  const { light, dark } = loadTokens();
  const l = { ...light, ...(theme.colors || {}) };
  const d = { ...dark, ...(theme.dark || {}) };
  const block = (selector, scheme, values) =>
    `${selector} {\n  color-scheme: ${scheme};\n${Object.entries(values)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join("\n")}\n}`;
  return `${block(":root", "light", l)}\n${block('html[data-theme="dark"]', "dark", d)}`;
}
