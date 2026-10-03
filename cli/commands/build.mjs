// build [--draft] [--date YYYY-MM-DD] [--output <file>] [--space <id>] (global --lang <l>, ARCHITECTURE.md §6.12)
// Builds the site (one HTML file). Strict by default: any inconsistency fails (exit code 1, nothing written).
// With spaces (ARCHITECTURE.md §6.1a): the full site and one export per space, one summary line each;
// --space <id> writes that export alone (--output then names it).
// With languages (§6.12): one multilingual file, or with --lang <l> the mono-language file of <l>.
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { declaredSpaceIds, checkSpaceOption } from "../../engine/build/spaces.mjs";
import { checkLanguageOption } from "../../engine/build/languages.mjs";
import { numbers } from "../../engine/build/format.mjs";
import { checkDate } from "../common.mjs";

export const options = {
  draft: { type: "boolean" },
  date: { type: "string" },
  output: { type: "string" },
  space: { type: "string" },
};

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (values.date !== undefined) checkDate(values.date);
  const output = values.output ? path.resolve(process.cwd(), values.output) : undefined;
  // An unknown id, or --space without spaces, is a usage error (exit code 2) before anything is built.
  const space = values.space === undefined ? undefined : checkSpaceOption({ ids: declaredSpaceIds(project.root, config), space: values.space, t: ctx.t });
  // --lang (ARCHITECTURE.md §6.12): only meaningful with `languages` declared; otherwise it only chooses the
  // messages, as before (unaffected here).
  const lang = config.languages && ctx.globals.lang ? checkLanguageOption({ languages: config.languages, lang: ctx.globals.lang, t: ctx.t }) : undefined;
  const r = build({ project, config, options: { draft: !!values.draft, date: values.date, ...(lang ? { lang } : {}), ...(space ? { space, spaceOutput: output } : { output }) } });
  const ok = !!r.html && !r.errors.length;
  // The files written: the full site and its exports, or the export of --space alone.
  const files = space ? r.sites : [{ output: r.output, html: r.html, stats: r.stats }, ...r.sites];
  if (ok) for (const f of files) write(f);

  if (ctx.json) {
    const sites = r.sites.map((s) => ({ space: s.space, output: s.output, stats: s.stats, excludedLinks: s.excludedLinks }));
    ctx.print(JSON.stringify({ ok, output: r.output, stats: r.stats, sites, languages: r.languages, errors: r.errors, warnings: r.warnings }, null, 2));
    return ok ? 0 : 1;
  }
  ctx.printProblems(r);
  if (!ok) {
    ctx.printErr("");
    ctx.error("build.failed", { n: r.errors.length });
    return 1;
  }
  const shown = (file) => {
    const inside = path.relative(project.root, file);
    return inside.startsWith("..") || path.isAbsolute(inside) ? file : inside.split(path.sep).join("/");
  };
  const lines = files.map((f) => summary(ctx, f, config, shown(f.output)));
  // One summary line per OTHER declared language, after the files (ARCHITECTURE.md §6.12): current/stale/missing,
  // read from disk whether or not that language was actually rendered (always true without --lang; with --lang,
  // true only of the requested one, but the counts themselves are disk-based either way).
  for (const l of r.languages.filter((x) => !x.source)) lines.push(ctx.t("cli.build.languages.summary", { lang: l.id, current: l.current, stale: l.stale, missing: l.missing }));
  if (r.warnings.length && lines.length) lines[lines.length - 1] += numbers(ctx.i18n).count("cli.build.warnings", r.warnings.length);
  for (const line of lines) ctx.print(line);
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
