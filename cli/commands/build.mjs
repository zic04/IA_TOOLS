// build [--draft] [--date YYYY-MM-DD] [--output <file>]
// Builds the site (one HTML file). Strict by default: any inconsistency fails (exit code 1, nothing written).
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { numbers } from "../../engine/build/format.mjs";
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
  ctx.print(summary(ctx, r, config, relative) + (r.warnings.length ? numbers(ctx.i18n).count("cli.build.warnings", r.warnings.length) : ""));
  return 0;
}

/**
 * "✔ <output> — 0,3 Mo · 81 pages · 1 schéma": sizes and counts in the language of the messages, each noun in the
 * plural form of its number. Without screenshots (capture.mode "none"), the screenshots are not counted.
 */
export function summary(ctx, r, config, output = r.output) {
  const { number, count } = numbers(ctx.i18n);
  const parts = [ctx.t("cli.build.size", { size: number(r.stats.bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }), count("cli.build.count.pages", r.stats.pages)];
  if (config.capture?.mode !== "none" || r.stats.captures) parts.push(count("cli.build.count.captures", r.stats.captures), count("cli.build.count.zones", r.stats.zones));
  parts.push(count("cli.build.count.diagrams", r.stats.diagrams));
  return ctx.t("cli.build.ok", { output, details: parts.join(" · ") });
}

function write(r) {
  fs.mkdirSync(path.dirname(r.output), { recursive: true });
  fs.writeFileSync(r.output, r.html);
}
