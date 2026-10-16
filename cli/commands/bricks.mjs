// bricks [--json]  ·  bricks <id>  ·  bricks run [<id|preset>…] [--deps] [--stale] [--force] [--network] [--tools]
// The bricks of the project (ARCHITECTURE.md §6.18, standard/bricks.json): each part that can be run again on its
// own. With no argument, the state of every brick and why; `bricks <id>` shows one brick (what it needs, how it
// runs); `bricks run` runs the deterministic steps of the bricks named (or, with --stale, of every brick out of date)
// in the order of their needs, the facts gathered into one read of the application, and lists the steps that are
// the skill's agents'. Exit code 0; the failing step's own when a step fails; 2 for an unknown brick or nothing to run.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { loadBricks, enabledBricks, expand } from "../../engine/bricks/registry.mjs";
import { brickStatuses } from "../../engine/bricks/status.mjs";
import { planRun } from "../../engine/bricks/plan.mjs";
import { generatorTag } from "../../engine/brand.mjs";

export const options = {
  deps: { type: "boolean" },
  stale: { type: "boolean" },
  force: { type: "boolean" },
  network: { type: "boolean" },
  tools: { type: "boolean" },
};

const MARKS = { fresh: "✔", stale: "⚠", missing: "✖", volatile: "·", disabled: "–" };

/** The context of a project: the registry, its enabled bricks and their states. */
async function load(ctx) {
  const { project, config } = await ctx.loadProject();
  const registry = loadBricks();
  const enabled = enabledBricks(registry, config.bricks);
  const appDir = config.app.dir ? path.resolve(project.root, config.app.dir) : null;
  const commit = appDir && fs.existsSync(appDir) ? ctx.commit(appDir) : null;
  const statuses = brickStatuses({
    registry,
    enabled,
    root: project.root,
    factsDir: config.paths.facts,
    commit,
    generator: generatorTag(),
    now: new Date(),
  });
  return { registry, statuses, language: ctx.i18n.language === "fr" ? "fr" : "en" };
}

const reasons = (ctx, why) => why.map((w) => ctx.t(`cli.bricks.why.${w.key}`, w.vars));

/** One brick, for --json. */
function describe(ctx, s, id) {
  const b = s.registry.byId.get(id);
  const st = s.statuses.get(id);
  return {
    id,
    kind: b.kind,
    title: b.title[s.language],
    state: st.state,
    why: st.why.map((w) => ({ ...w, text: ctx.t(`cli.bricks.why.${w.key}`, w.vars) })),
    needs: b.needs,
    requires: b.requires,
    steps: b.steps,
  };
}

function list(ctx, s) {
  if (ctx.json) {
    const bricks = [...s.statuses.keys()].map((id) => describe(ctx, s, id));
    ctx.print(JSON.stringify({ bricks, presets: s.registry.presets }, null, 2));
    return EXIT.OK;
  }
  ctx.print(ctx.paint.bold(ctx.t("cli.bricks.title")));
  const width = Math.max(...[...s.statuses.keys()].map((id) => id.length));
  for (const [id, st] of s.statuses) {
    const paint = { fresh: ctx.paint.ok, stale: ctx.paint.warn, missing: ctx.paint.fail }[st.state] || ctx.paint.dim;
    const label = `${MARKS[st.state]} ${id.padEnd(width)}  ${s.registry.byId.get(id).title[s.language]}`;
    ctx.print(`${paint(label)} — ${ctx.t(`cli.bricks.state.${st.state}`)}`);
    if (st.state !== "fresh") for (const r of reasons(ctx, st.why)) ctx.print(ctx.paint.dim(`    ${r}`));
  }
  // The next command: --stale alone when some brick out of date runs without an option; otherwise, with the options
  // those bricks require (--stale alone would skip them all).
  const late = [...s.statuses]
    .filter(([, st]) => st.state === "missing" || st.state === "stale")
    .map(([id]) => s.registry.byId.get(id));
  if (late.length) {
    const needed = late.some((b) => !b.requires.length) ? [] : [...new Set(late.flatMap((b) => b.requires))];
    ctx.print(`\n→ ${ctx.t("cli.bricks.next", { options: needed.map((r) => ` --${r}`).join("") })}`);
  }
  return EXIT.OK;
}

/** A preset: the bricks it names, in run order, each with its state. */
function showPreset(ctx, s, name) {
  const members = expand(s.registry, [name]); // throws bricks.unknown with the closest id
  const ids = [...s.statuses.keys()].filter((id) => members.has(id));
  if (ctx.json) {
    ctx.print(JSON.stringify({ preset: name, bricks: ids.map((id) => describe(ctx, s, id)) }, null, 2));
    return EXIT.OK;
  }
  ctx.print(ctx.paint.bold(ctx.t("cli.bricks.show.preset", { id: name, n: ids.length })));
  for (const id of ids) {
    const st = s.statuses.get(id);
    ctx.print(`  ${MARKS[st.state]} ${id} — ${ctx.t(`cli.bricks.state.${st.state}`)}`);
  }
  return EXIT.OK;
}

function show(ctx, s, id) {
  if (!s.registry.byId.has(id)) return showPreset(ctx, s, id);
  if (ctx.json) return (ctx.print(JSON.stringify(describe(ctx, s, id), null, 2)), EXIT.OK);
  const d = describe(ctx, s, id);
  ctx.print(
    ctx.paint.bold(ctx.t("cli.bricks.show.title", { id, title: d.title, state: ctx.t(`cli.bricks.state.${d.state}`) })),
  );
  for (const w of d.why) ctx.print(`  ${w.text}`);
  if (d.needs.length) ctx.print(ctx.t("cli.bricks.show.needs", { ids: d.needs.join(", ") }));
  if (d.requires.length)
    ctx.print(ctx.t("cli.bricks.show.requires", { options: d.requires.map((r) => `--${r}`).join(", ") }));
  for (const step of d.steps)
    ctx.print(
      step.agent
        ? ctx.t("cli.bricks.show.agent", { agent: step.agent, per: step.per })
        : ctx.t("cli.bricks.show.command", {
            step: step.command + (step.source ? ` --source ${step.source}` : step.tools ? " --tools" : ""),
          }),
    );
  return EXIT.OK;
}

async function runBricks(ctx, s, names, values) {
  if (!names.length && !values.stale) throw new KitError(EXIT.USAGE, "bricks.runNothing");
  const plan = planRun({ registry: s.registry, statuses: s.statuses, names, flags: values });
  // In --json mode the commands run silently: one JSON document on stdout, the plan's.
  const child = ctx.json ? Object.create(ctx, { print: { value: () => {} } }) : ctx;
  if (!ctx.json) {
    const idle = plan.skipped.length ? "cli.bricks.run.allSkipped" : "cli.bricks.run.nothing";
    ctx.print(plan.run.length ? ctx.t("cli.bricks.run.start", { ids: plan.run.join(", ") }) : ctx.t(idle));
    for (const k of plan.skipped)
      ctx.print(
        `⚠ ${ctx.t("cli.bricks.run.skipped", { id: k.id, why: ctx.t(`cli.bricks.why.${k.why.key}`, k.why.vars) })}`,
      );
  }
  const done = [];
  // The first step that fails stops the run, with its own exit code (a KitError is rethrown, so printed as usual).
  const stop = (c, code) => {
    if (!ctx.json) ctx.printErr(`✖ ${ctx.t("cli.bricks.run.failed", { step: c.command, code })}`);
    else ctx.print(JSON.stringify({ ...plan, done, ok: false }, null, 2));
  };
  for (const c of plan.commands) {
    const mod = await import(`./${c.command}.mjs`);
    let code;
    try {
      code = (await mod.run({ ctx: child, values: c.values, positionals: [] })) ?? EXIT.OK;
    } catch (e) {
      const kit = e instanceof KitError;
      done.push({ command: c.command, code: kit ? e.code : null, key: kit ? e.key : null });
      stop(c, kit ? e.code : "—");
      throw e;
    }
    done.push({ command: c.command, code });
    if (code !== EXIT.OK) return (stop(c, code), code);
  }
  if (ctx.json) ctx.print(JSON.stringify({ ...plan, done, ok: true }, null, 2));
  else {
    for (const a of plan.agents)
      ctx.print(`→ ${ctx.t("cli.bricks.run.agent", { brick: a.brick, agent: a.agent, per: a.per })}`);
    if (plan.run.length) ctx.print(ctx.paint.ok(`✔ ${ctx.t("cli.bricks.run.done", { n: plan.run.length })}`));
  }
  return EXIT.OK;
}

export async function run({ ctx, values, positionals = [] }) {
  const s = await load(ctx);
  if (positionals[0] === "run") return runBricks(ctx, s, positionals.slice(1), values);
  if (positionals[0]) return show(ctx, s, positionals[0]);
  return list(ctx, s);
}
