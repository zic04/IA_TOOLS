// stats [--by step|version|command|model|phase|page|actor] [--since <version>] [--csv] [--json]
// Production statistics of the project (ETUDE-CAPTURES.md §6), read from usage/<version>.jsonl: time (and, for
// the agents, tokens) per block — capture and its parts, facts and its sources, generation, translation, update,
// build, checks — so that the slowest blocks show where to optimise.
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { USAGE_DIR, usageFolder, readUsage, summarize, usageCsv, GROUPINGS } from "../../engine/stats/usage.mjs";

export const options = {
  by: { type: "string" },
  since: { type: "string" },
  csv: { type: "boolean" },
};

/** 1234 → "1.2 s", 75_000 → "1 min 15 s", 450 → "450 ms". */
export function duration(ms) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${s} s`;
}

export async function run({ ctx, values }) {
  const by = values.by ?? "step";
  if (!GROUPINGS.includes(by))
    throw new KitError(EXIT.USAGE, "option.value", { option: "by", value: by, expected: GROUPINGS.join(" | ") });
  const { project } = await ctx.loadProject();
  const dir = usageFolder(project.root, ctx.env);
  if (!dir) {
    ctx.print(ctx.t("cli.stats.off", { folder: USAGE_DIR, command: BRAND.command }));
    return EXIT.OK;
  }
  const entries = readUsage(dir);
  if (values.csv) {
    ctx.stdout.write(usageCsv(entries));
    return EXIT.OK;
  }
  const report = summarize(entries, by, { since: values.since });
  if (ctx.json) {
    ctx.print(JSON.stringify({ by, since: values.since ?? null, ...report }, null, 2));
    return EXIT.OK;
  }
  if (!entries.length) {
    ctx.print(ctx.t("cli.stats.empty"));
    return EXIT.OK;
  }
  const p = ctx.paint;
  ctx.print(
    p.bold(
      ctx.t("cli.stats.total", {
        time: duration(report.total.ms),
        runs: report.total.runs,
        tokens: report.total.tokens.toLocaleString("en-US"),
      }),
    ),
  );
  ctx.print(p.dim(ctx.t("cli.stats.header", { by })));
  const width = Math.max(...report.groups.map((g) => g.key.length), 10);
  for (const g of report.groups) {
    const share = `${(g.share * 100).toFixed(0).padStart(3)} %`;
    const bar = "█".repeat(Math.round(g.share * 20));
    const tokens = g.tokens ? `  ${g.tokens.toLocaleString("en-US")} tok` : "";
    ctx.print(
      `${(g.key.includes(" › ") ? "  " : "") + g.key.padEnd(width)}  ${duration(g.ms).padStart(10)}  ${share}  ${String(g.count).padStart(4)}×  ${bar}${tokens}`,
    );
  }
  return EXIT.OK;
}
