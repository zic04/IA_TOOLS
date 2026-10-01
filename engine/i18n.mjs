// Internationalisation: dictionaries i18n/<language>.json (flat keys), project overrides (config.texts),
// variables {name} and plurals { one, other… } resolved with Intl.PluralRules.
// Namespaces (ARCHITECTURE.md §6.5): ui.* and home.* (embedded in the site, used by app.js at runtime),
// template.*, render.*, callouts.* (build), cli.* (CLI messages).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../i18n");

export const LANGUAGES = ["en", "fr"];
export const LOCALES = Object.freeze({ en: "en-US", fr: "fr-FR" });
/** Namespaces embedded in the generated HTML (read at runtime by app.js). */
export const EMBEDDED_NAMESPACES = ["ui.", "home."];

const cache = new Map();

/**
 * Raw dictionary of a language (shared object: do not mutate): i18n/<language>.json merged with the
 * fragments i18n/<language>/*.json (one per feature, so that features can be written independently).
 * A key defined twice is an error.
 */
export function loadDictionary(language) {
  if (!LANGUAGES.includes(language)) throw new Error(`unsupported language: ${language}`);
  if (!cache.has(language)) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(FOLDER, `${language}.json`), "utf8"));
    const fragments = path.join(FOLDER, language);
    const files = fs.existsSync(fragments) ? fs.readdirSync(fragments).filter((f) => f.endsWith(".json")).sort() : [];
    for (const file of files) {
      const fragment = JSON.parse(fs.readFileSync(path.join(fragments, file), "utf8"));
      for (const [key, value] of Object.entries(fragment)) {
        if (key in dictionary) throw new Error(`i18n: key "${key}" defined twice (${language}/${file})`);
        dictionary[key] = value;
      }
    }
    cache.set(language, dictionary);
  }
  return cache.get(language);
}

/** Replaces {name} with vars.name; a missing variable is left as is (visible, hence fixable). */
export function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

/** Names of the variables of a text (or of all the forms of a plural), sorted. */
export function variables(value) {
  const texts = typeof value === "object" && value ? Object.values(value) : [value];
  const names = new Set();
  for (const t of texts) for (const m of String(t).matchAll(/\{(\w+)\}/g)) names.add(m[1]);
  return [...names].sort();
}

/**
 * Creates a translator.
 * @param {{ language?: "en"|"fr", overrides?: Record<string, string|object>, vars?: object }} options
 *   `vars` are default variables merged into every call (for example { command }).
 */
export function createI18n({ language = "en", overrides = {}, vars: defaults = {} } = {}) {
  const base = loadDictionary(language);
  const fallback = language === "en" ? null : loadDictionary("en");
  const keys = { ...base, ...overrides };
  const locale = LOCALES[language];
  const rules = new Intl.PluralRules(locale);
  const raw = (key) => (key in keys ? keys[key] : fallback?.[key]);

  const pick = (value, n) => (value && typeof value === "object" ? value[rules.select(Number(n ?? 0))] ?? value.other : value);

  function t(key, vars = {}) {
    const v = raw(key);
    if (v === undefined) return key;
    const all = { ...defaults, ...vars };
    return format(pick(v, all.n), all);
  }

  /** Long date of the language ("October 1, 2026", "1 octobre 2026"). `utc`: date fixed by --date. */
  function date(d, { utc = false } = {}) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", ...(utc ? { timeZone: "UTC" } : {}) }).format(d);
  }

  /** Keys whose name starts with one of the prefixes (overrides included), sorted, for embedding. */
  function subset(prefixes = EMBEDDED_NAMESPACES) {
    const all = { ...(fallback || {}), ...keys };
    return Object.fromEntries(
      Object.keys(all)
        .filter((k) => prefixes.some((p) => k.startsWith(p)))
        .sort()
        .map((k) => [k, all[k]])
    );
  }

  return { language, locale, t, date, subset, has: (key) => raw(key) !== undefined, keys };
}
