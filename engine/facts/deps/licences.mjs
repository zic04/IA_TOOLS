// Licences (ARCHITECTURE.md §6.9): what a lock file, an installed copy of a package or its public registry says of
// its licence, kept as a short text — the licence's name or SPDX expression as its source writes it ("MIT",
// "Apache-2.0", "MIT OR GPL-3.0-or-later", "BSD 3-Clause License"), never a licence's text. Every source is
// untrusted (a lock file, a package.json under node_modules, a METADATA file, a registry's answer): a value is kept
// only through `safeLicence` — one line, 100 characters at most, the characters of a licence name, nothing a secret
// detector of the kit finds (AUDIT.md S8) — and anything else is no licence (`license` absent), never an error.
// Classifying a licence (permissive, copyleft…) is the report's job (standard/licences.json), not the readers'.
import { looksSecret } from "../../check/secrets.mjs";

/**
 * The characters of a licence name or an SPDX expression, a letter, a digit or `(` first (an expression may open
 * with one: "(MIT OR Apache-2.0)"): letters, digits, spaces, `.`, `+`, `-`, `_`, `(`, `)`, `/`, `,`, `:` ("SEE
 * LICENSE IN LICENSE.md", "GPL-2.0-only WITH Classpath-exception-2.0"). Bounded and anchored: linear (RULES.md S5,
 * test/tools/redos-worker.mjs).
 */
const LICENCE_TEXT = /^[A-Za-z0-9(][A-Za-z0-9 .+\-_()/,:]{0,99}$/;
/** A run of spaces and tabs, written as one space. */
const BLANKS = /[ \t]+/g;
/** A Python classifier of a licence: "License :: OSI Approved :: MIT License" (its last part is the licence). */
const CLASSIFIER = /^License\s*::/;

/** Every expression of this module (registered in test/tools/redos-worker.mjs, RULES.md S5). */
export const LICENCE_PATTERNS = Object.freeze({
  licenceText: LICENCE_TEXT,
  licenceBlanks: BLANKS,
  licenceClassifier: CLASSIFIER,
});

/** Texts that say "no licence given": setuptools writes UNKNOWN; npm's own word for none is UNLICENSED, kept. */
const NONE = new Set(["", "unknown", "none", "n/a", "na", "null", "undefined"]);
/** At most this many licences joined (a list of 1,000 names is no licence). */
const MAX_PARTS = 8;

/**
 * A licence as it is kept: the text trimmed, its runs of blanks one space; null when it is not a string, says none,
 * spans more than one line, is over 100 characters, holds another character than a licence name's, or looks like a
 * secret.
 * @param {unknown} value
 * @returns {string|null}
 */
export function safeLicence(value) {
  if (typeof value !== "string" || value.length > 200) return null;
  const text = value.trim().replace(BLANKS, " ");
  if (NONE.has(text.toLowerCase()) || !LICENCE_TEXT.test(text) || looksSecret(text)) return null;
  return text;
}

/** Several licences, the package's choice between them (npm's and Composer's meaning of a list): "A OR B". */
function anyOf(names) {
  const kept = [...new Set(names.map(safeLicence).filter(Boolean))].slice(0, MAX_PARTS);
  return kept.length ? safeLicence(kept.join(" OR ")) : null;
}

/**
 * The licence an npm package document gives (a package.json, a package-lock.json entry, a registry's version
 * document): `license` as a string or, as older packages write it, `{ type }`; else the legacy `licenses` list
 * (`[{ type }]` or strings), one of them.
 * @param {unknown} doc
 * @returns {string|null}
 */
export function npmLicence(doc) {
  if (!doc || typeof doc !== "object") return null;
  const one = (v) =>
    typeof v === "string" ? v : v && typeof v === "object" && typeof v.type === "string" ? v.type : null;
  const own = one(/** @type {any} */ (doc).license);
  if (own != null) return safeLicence(own);
  const list = /** @type {any} */ (doc).licenses;
  return Array.isArray(list)
    ? anyOf(
        list
          .slice(0, MAX_PARTS)
          .map(one)
          .filter((v) => v != null),
      )
    : null;
}

/**
 * The licence of a Python distribution, from the fields its METADATA file or PyPI's JSON gives: the SPDX expression
 * (`License-Expression`, PEP 639) first, else the `License` field when it is a licence's name (one short line, not
 * its whole text), else the licence classifiers (`License :: OSI Approved :: MIT License` → "MIT License"), one of
 * them.
 * @param {{ expression?: unknown, license?: unknown, classifiers?: unknown }} fields
 * @returns {string|null}
 */
export function pythonLicence({ expression, license, classifiers } = {}) {
  const fromExpression = safeLicence(expression);
  if (fromExpression) return fromExpression;
  const fromField = safeLicence(license);
  if (fromField) return fromField;
  if (!Array.isArray(classifiers)) return null;
  const leaves = classifiers
    .slice(0, 200)
    .filter((c) => typeof c === "string" && c.length <= 200 && CLASSIFIER.test(c))
    .map((c) => c.split("::").at(-1).trim())
    // "License :: OSI Approved" names no licence of its own.
    .filter((leaf) => leaf && leaf !== "OSI Approved" && leaf !== "License");
  return anyOf(leaves);
}

/** Composer's `license` (a string or a list of them, one of them). */
export function composerLicence(value) {
  return Array.isArray(value) ? anyOf(value.slice(0, MAX_PARTS)) : safeLicence(value);
}
