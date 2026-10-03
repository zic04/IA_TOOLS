// Token budget of a context file (ARCHITECTURE.md §6.11, lot V7): a rough, deterministic estimate — characters
// ÷ 4, no tokenizer dependency — and the order in which a context sheds parts when it would exceed its budget.

/** Characters ÷ 4, rounded up: close enough to decide what to cut, not an exact tokenizer count. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

/**
 * One part of a context file.
 * @typedef {object} BudgetPart
 * @property {"page"|"sections"|"shared"|"excerpt"|"facts"|"labels"} kind
 * @property {number} [priority]
 * @property {string} text
 * @property {string} cutLine
 * @property {string} [path]
 * @property {[number, number]} [lines]
 * @property {boolean} [cutDone]   set by fitBudget on a part it has already cut
 */

/**
 * Drops parts until the total fits the budget (ARCHITECTURE.md §6.11): `shared` excerpts
 * first (the longest first), then `excerpt` (direct excerpts, farthest from a cited line first — `priority` is
 * that distance), then `facts`, then `labels`; `page` and `sections` parts are never touched. A cut part keeps
 * its place (so the rest of the file stays in the same order): its `text` is replaced by its one-line `cutLine`,
 * which costs only a few tokens instead of the whole excerpt.
 * @param {BudgetPart[]} parts
 * @param {number} budget
 * @returns {{ kept: object[], cut: Array<{ kind: string, cutLine: string, path?: string, lines?: [number, number] }> }}
 *   `kept`: same length and order as `parts`, cut ones with their `text` replaced; `cut`: the bookkeeping list
 *   (each entry's `cutLine` is the text already standing in its place), in the order the parts were dropped, for
 *   the summary repeated at the end of the context file.
 */
export function fitBudget(parts, budget) {
  const kept = parts.map((p) => ({ ...p }));
  const cut = [];
  const total = () => kept.reduce((n, p) => n + estimateTokens(p.text), 0);
  const CUTTABLE = ["shared", "excerpt", "facts", "labels"];
  for (const kind of CUTTABLE) {
    if (total() <= budget) break;
    const candidates = kept.filter((p) => p.kind === kind && !p.cutDone);
    const ordered =
      kind === "shared"
        ? candidates.sort((a, b) => b.text.length - a.text.length)
        : kind === "excerpt"
          ? candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          : candidates;
    for (const p of ordered) {
      if (total() <= budget) break;
      p.text = p.cutLine;
      p.cutDone = true;
      cut.push({
        kind: p.kind,
        cutLine: p.cutLine,
        ...(p.path ? { path: p.path } : {}),
        ...(p.lines ? { lines: p.lines } : {}),
      });
    }
  }
  return { kept, cut };
}
