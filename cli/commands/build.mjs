// build [--draft] [--date YYYY-MM-DD] [--output <file>]
// Builds the site (one HTML file). Strict by default: any inconsistency fails (exit code 1, nothing written).
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { checkDate } from "../common.mjs";

export const options = {
  draft: { type: "boolean" },
  date: { type: "string" },
  output: { type: "string" },
};

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (values.date !== undefined) checkDate(values.date);
  const output = values.output ? path.resolve(process.cwd(), values.output) : undefined;
  const r = build({ project, config, options: { draft: !!values.draft, date: values.date, output } });
  const inside = path.relative(project.root, r.output);
  const relative = inside.startsWith("..") || path.isAbsolute(inside) ? r.output : inside.split(path.sep).join("/");
  const ok = !!r.html && !r.errors.length;
  if (ok) write(r);

  if (ctx.json) {
    ctx.print(JSON.stringify({ ok, output: r.output, stats: r.stats, errors: r.errors, warnings: r.warnings }, null, 2));
    return ok ? 0 : 1;
  }
  ctx.printProblems(r);
  if (!ok) {
    ctx.printErr("");
    ctx.error("build.failed", { n: r.errors.length });
    return 1;
  }
  const mb = (r.stats.bytes / 1024 / 1024).toFixed(1);
  ctx.print(ctx.t("cli.build.ok", { output: relative, mb, ...r.stats }) + (r.warnings.length ? ctx.t("cli.build.warnings", { n: r.warnings.length }) : ""));
  return 0;
}

function write(r) {
  fs.mkdirSync(path.dirname(r.output), { recursive: true });
  fs.writeFileSync(r.output, r.html);
}
