// The state of each brick (ARCHITECTURE.md §6.18), read from what the bricks produced — never from a state file of
// their own: `disabled` (not enabled by the project), `missing` (never produced), `stale` (produced from an older
// commit, by another kit line, too long ago, or one of its needs is not up to date), `fresh`, or `volatile` (a
// brick that runs on demand, such as the documentation audit). Each state comes with its reasons (`why`: message
// keys under cli.bricks.why, and their variables).
import { envelopeState } from "../facts/freshness.mjs";
import { topoOrder } from "./registry.mjs";

const RANK = { missing: 2, stale: 1, fresh: 0 };

/** The own state of one brick, from its freshness rule. */
function ownState(brick, p) {
  if (brick.freshness.rule === "volatile") return { state: "volatile", why: [{ key: "onDemand", vars: {} }] };
  const files = (brick.freshness.files || []).map((name) =>
    envelopeState(p.root, p.factsDir, name, {
      commit: p.commit,
      generator: p.generator,
      now: p.now,
      maxAgeDays: brick.freshness.maxAgeDays,
    }),
  );
  const worst = files.reduce((w, f) => (RANK[f.state] > RANK[w] ? f.state : w), "fresh");
  return { state: worst, why: files.filter((f) => f.state !== "fresh").flatMap((f) => f.why) };
}

/**
 * @param {object} p
 * @param {import("./registry.mjs").Registry} p.registry
 * @param {Set<string>} p.enabled      enabledBricks()
 * @param {string} p.root              the documentation project
 * @param {string} p.factsDir          config.paths.facts
 * @param {string|null} p.commit       the application's current HEAD (null: unknown)
 * @param {string} p.generator         this kit's generator tag
 * @param {Date} p.now
 * @returns {Map<string, { state: string, why: Array<{ key: string, vars: object }> }>}  in run order
 */
export function brickStatuses(p) {
  const out = new Map();
  for (const id of topoOrder(p.registry, p.registry.byId.keys())) {
    const brick = p.registry.byId.get(id);
    if (!p.enabled.has(id)) {
      out.set(id, { state: "disabled", why: [{ key: "disabled", vars: {} }] });
      continue;
    }
    const own = ownState(brick, p);
    // A brick is only as fresh as what it needs (an enabled need that is missing or stale makes it stale).
    const late = brick.needs.filter((n) => ["missing", "stale"].includes(out.get(n)?.state));
    if (own.state === "fresh" && late.length)
      out.set(id, { state: "stale", why: late.map((n) => ({ key: "needs", vars: { id: n } })) });
    else out.set(id, own);
  }
  return out;
}
