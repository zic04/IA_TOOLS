// The digests of facts a page type declares (ARCHITECTURE.md §6.11 point 5d; `digests` in standard/templates): one
// part of the context file per facts source, grouped for its writer (the runbook: what the infrastructure declares).
// A digest adds to the context, it never takes from it: the raw facts rows of the page's files stay as they are, so
// that a digest cut by the budget hides nothing the page would have had without it.
import { infraPart } from "./infra-section.mjs";

/** Digest name (a facts source) → its part, from the items of that source. */
export const DIGESTS = Object.freeze({ infra: infraPart });

/**
 * The text of the digest parts of a page type.
 * @param {string[]} names   digestsOf(templates, page.template)
 * @param {Record<string, any>} facts   { [source]: items }
 * @param {(key: string, vars?: object) => string} t
 * @returns {string}
 */
export function digestText(names, facts, t) {
  const texts = [];
  for (const name of names) {
    if (!Object.hasOwn(DIGESTS, name)) continue; // test/unit/deployment.test.mjs: every declared digest has its part
    const items = Array.isArray(facts[name]) ? facts[name] : [];
    const text = DIGESTS[/** @type {keyof typeof DIGESTS} */ (name)]({ items, t });
    if (text) texts.push(text);
  }
  return texts.join("\n");
}
