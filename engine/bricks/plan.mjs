// What `doc-kit bricks run` does (ARCHITECTURE.md §6.18): which bricks run, in which order, and the commands that
// run them. Pure: the CLI executes the plan.
//   - Bricks named on the command line run, fresh or not (that is what "run again" means); `--stale` alone runs every
//     enabled brick that is missing or stale (an on-demand brick only runs when named).
//   - `--deps` adds what they need, which runs only when it is not fresh (or always with `--force`).
//   - A brick that requires an option it was not given (`--tools`, `--network`) is skipped, and says why.
//   - A brick the project disables never runs: left out of presets and of --stale and --deps, skipped (and says
//     why) when named by its id.
//   - Every `facts` step is gathered into ONE run of `doc-kit facts` (one read of the application); other commands
//     follow in brick order. Steps that are an agent's (a skill brief) are listed for the skill, never run.
import { expand, topoOrder, withNeeds } from "./registry.mjs";

/**
 * @param {object} p
 * @param {import("./registry.mjs").Registry} p.registry
 * @param {Map<string, { state: string }>} p.statuses   brickStatuses()
 * @param {string[]} p.names        bricks or presets named on the command line
 * @param {{ deps?: boolean, stale?: boolean, force?: boolean, network?: boolean, tools?: boolean }} p.flags
 * @returns {{ run: string[], skipped: Array<{ id: string, why: { key: string, vars: object } }>,
 *   commands: Array<{ command: string, values: object }>, agents: Array<{ brick: string, agent: string, per: string }> }}
 */
export function planRun({ registry, statuses, names, flags }) {
  const named = names.length ? expand(registry, names) : new Set();
  const byId = new Set(names.filter((n) => registry.byId.has(n))); // named by their own id, not through a preset
  const wanted = names.length
    ? new Set(named)
    : new Set([...statuses].filter(([, s]) => s.state === "missing" || s.state === "stale").map(([id]) => id));
  const ordered = flags.deps ? withNeeds(registry, wanted) : topoOrder(registry, wanted);
  const run = [];
  const skipped = [];
  for (const id of ordered) {
    const state = statuses.get(id)?.state;
    const brick = registry.byId.get(id);
    if (state === "disabled") {
      if (byId.has(id)) skipped.push({ id, why: { key: "disabled", vars: {} } });
      continue; // a preset member or a need the project does not enable: its own business
    }
    if (!named.has(id)) {
      if (state === "fresh" && !flags.force) continue;
    } else if (flags.stale && (state === "fresh" || state === "volatile")) continue;
    const missingOption = brick.requires.find((r) => !flags[r]);
    if (missingOption) {
      skipped.push({ id, why: { key: "requires", vars: { option: `--${missingOption}` } } });
      continue;
    }
    run.push(id);
  }
  return { run, skipped, ...commandsOf(registry, run, flags) };
}

/** The commands and agent steps of the bricks that run: the facts steps gathered into one `facts` run. */
function commandsOf(registry, run, flags) {
  const sources = [];
  let tools = false;
  const others = [];
  const agents = [];
  for (const id of run)
    for (const step of registry.byId.get(id).steps) {
      if (step.agent) agents.push({ brick: id, agent: step.agent, per: step.per });
      else if (step.command === "facts") {
        if (step.source && !sources.includes(step.source)) sources.push(step.source);
        if (step.tools) tools = true;
      } else if (!others.some((c) => c.command === step.command)) others.push({ command: step.command, values: {} });
    }
  const facts =
    sources.length || tools
      ? [{ command: "facts", values: { source: sources, sourcesExactly: true, tools, network: !!flags.network } }]
      : [];
  return { commands: [...facts, ...others], agents };
}
