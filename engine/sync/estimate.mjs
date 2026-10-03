// Economy of the agents (ARCHITECTURE.md §6.11): the estimate of `sync --estimate` and of the skill's
// `brief.mjs --estimate` (lot V7-agents), one `doc-kit-writer` agent per page to review.
import { maxWordsOf, DEFAULT_MAX_WORDS } from "../build/page-templates.mjs";

/** Fixed overhead of a brief (rules, safety, syntax, standard: ARCHITECTURE.md §8), in tokens. */
const BRIEF_TOKENS = 1800;

/**
 * @param {object} p
 * @param {Array<{ page: string, tokens: number, template?: string }>} p.contexts
 * @param {object} p.templates   loadPageTemplates() result (for maxWords)
 * @param {object} [p.prices]    config.llm.prices: { sonnet: { input, output, cacheRead? }, … }
 * @param {string|null} [p.currency]
 * @returns {{ agents: Array<{ page: string, agent: string, model: string, input: number, output: number, cost: number|null }>,
 *   total: { input: number, output: number, cost: number|null }, currency: string|null }}
 */
export function estimateUpdate({ contexts, templates, prices = {}, currency = null }) {
  const price = prices.sonnet;
  const agents = contexts.map(({ page, tokens, template }) => {
    const maxWords = template ? maxWordsOf(templates, template) : DEFAULT_MAX_WORDS;
    const input = tokens + BRIEF_TOKENS;
    const output = Math.round(0.3 * 1.4 * maxWords);
    const cost = price ? (input / 1e6) * price.input + (output / 1e6) * price.output : null;
    return { page, agent: "doc-kit-writer", model: "sonnet", input, output, cost };
  });
  const total = agents.reduce(
    (t, a) => ({
      input: t.input + a.input,
      output: t.output + a.output,
      cost: t.cost === null || a.cost === null ? null : t.cost + a.cost,
    }),
    { input: 0, output: 0, cost: price ? 0 : null },
  );
  return { agents, total, currency };
}
