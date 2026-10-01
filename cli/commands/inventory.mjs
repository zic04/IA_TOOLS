// inventory [--json]
// Lists what the coverage adapters (config.coverage) see in the application — routes, registry entries, files —
// and whether each element is already cited in the documentation. A starting point for the table of contents:
//   inventory --json > .doc-kit/inventory.json
import { runCoverage } from "../../engine/check/coverage.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { reasonText } from "./check.mjs";

export const options = {};

export async function run({ ctx }) {
  const { project, config } = await ctx.loadProject();
  if (!config.coverage.length) throw new KitError(EXIT.USAGE, "check.coverage.none");
  const res = await runCoverage({ root: project.root, config });
  if (ctx.json) {
    ctx.print(JSON.stringify(res, null, 2));
    return EXIT.OK;
  }
  for (const a of res.adapters) {
    if (!a.available) {
      ctx.print(`⚠ ${ctx.t("cli.check.coverage.skipped", { adapter: a.adapter, reason: reasonText(ctx, a) })}`);
      continue;
    }
    for (const f of a.families) {
      ctx.print(`\n${ctx.t("cli.inventory.family", { adapter: a.adapter, name: f.name, n: f.total, covered: f.covered })}`);
      for (const it of f.items) ctx.print(`  ${it.covered ? "✔" : "·"} ${it.id}${it.label ? ` — ${it.label}` : ""}`);
    }
  }
  ctx.print(`\n${ctx.t("cli.inventory.summary", { n: res.total, covered: res.covered })}`);
  return EXIT.OK;
}
