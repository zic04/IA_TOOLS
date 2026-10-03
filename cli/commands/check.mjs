// check [coverage|links|tables|images|secrets|all] [--width <px>] [--threshold <KB>]
//   coverage  every element inventoried by the coverage adapters is cited in the documentation
//   links     internal links (#/page, #/page~anchor) and journey steps (no browser)
//   tables    opens every page of the site and reports the tables wider than the reading column
//   images    orphan, missing and heavy images (--threshold, 200 KB), zone files without image, outdated captures
//   secrets   .env values, GUIDs, keys and tokens in the site and its sources; session files out of place
//   all       every check (default); coverage is skipped when no adapter is configured
import path from "node:path";
import { build, readProjectVersion } from "../../engine/build/build.mjs";
import { checkTables } from "../../engine/check/tables.mjs";
import { checkImages } from "../../engine/check/images.mjs";
import { checkSecrets } from "../../engine/check/secrets.mjs";
import { runCoverage } from "../../engine/check/coverage.mjs";
import { numbers } from "../../engine/build/format.mjs";
import { sessionFile } from "../../engine/capture/session.mjs";
import { builtSite } from "../common.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";

export const options = {
  width: { type: "string" },
  threshold: { type: "string" },
};

const AVAILABLE = ["coverage", "links", "tables", "images", "secrets", "all"];

export async function run({ ctx, values, positionals }) {
  const name = positionals[0] || "all";
  if (!AVAILABLE.includes(name)) throw new KitError(EXIT.USAGE, "check.unknown", { name, known: AVAILABLE.join(", ") });
  const width = values.width === undefined ? 1440 : Number(values.width);
  if (!Number.isInteger(width) || width < 320)
    throw new KitError(EXIT.USAGE, "option.value", { option: "width", value: values.width, expected: "integer ≥ 320" });
  const threshold = values.threshold === undefined ? 200 : Number(values.threshold);
  if (!(threshold > 0))
    throw new KitError(EXIT.USAGE, "option.value", {
      option: "threshold",
      value: values.threshold,
      expected: "number > 0 (KB)",
    });
  const all = name === "all";

  const result = {};
  let code = 0;
  if (name === "links" || all) {
    result.links = await checkLinksCommand(ctx);
    if (!result.links.ok) code = 1;
  }
  if (name === "images" || all) {
    result.images = await checkImagesCommand(ctx, threshold);
    if (!result.images.ok) code = 1;
  }
  if (name === "secrets" || all) {
    result.secrets = await checkSecretsCommand(ctx);
    if (!result.secrets.ok) code = 1;
  }
  if (name === "coverage" || all) {
    const { config } = await ctx.loadProject();
    if (!config.coverage.length) {
      if (!all) throw new KitError(EXIT.USAGE, "check.coverage.none");
      if (!ctx.json) ctx.print(ctx.t("cli.check.coverage.skippedNone"));
    } else {
      result.coverage = await checkCoverageCommand(ctx);
      if (result.coverage.missing) code = 1;
    }
  }
  if (name === "tables" || all) {
    result.tables = await checkTablesCommand(ctx, width);
    if (result.tables.problems.length) code = 1;
  }
  if (ctx.json) ctx.print(JSON.stringify(result, null, 2));
  return code;
}

/** Prints problems { key, vars } (key under cli.): "✖ what" (or "⚠ what"), then "→ what to do". */
function printFindings(ctx, list, mark = "✖") {
  for (const p of list) {
    ctx.printErr(`${mark} ${ctx.t(`cli.${p.key}`, p.vars)}`);
    if (ctx.i18n.has(`cli.${p.key}.help`) && (mark === "✖" || ctx.verbose))
      ctx.printErr(`  → ${ctx.t(`cli.${p.key}.help`, p.vars)}`);
  }
}

async function checkLinksCommand(ctx) {
  const { project, config } = await ctx.loadProject();
  const r = build({ project, config, options: { draft: true } });
  if (!r.html) {
    if (!ctx.json) ctx.printProblems({ errors: r.errors });
    return { ok: false, problems: r.errors };
  }
  const problems = r.warnings.filter((w) => w.kind === "link");
  if (!ctx.json) {
    ctx.printProblems({ errors: problems });
    if (problems.length) ctx.printErr(ctx.t("cli.check.links.failed", { n: problems.length }));
    else
      ctx.print(
        ctx.t("cli.check.links.ok", { pages: numbers(ctx.i18n).count("cli.build.count.pages", r.stats.pages) }),
      );
  }
  return { ok: problems.length === 0, pages: r.stats.pages, problems };
}

async function checkImagesCommand(ctx, threshold) {
  const { project, config } = await ctx.loadProject();
  const r = build({ project, config, options: { draft: true } });
  if (!r.html) {
    if (!ctx.json) ctx.printProblems({ errors: r.errors });
    return { ok: false, errors: r.errors, warnings: [] };
  }
  const version = readProjectVersion(project.root, config.version);
  const res = checkImages({ root: project.root, config, html: r.html, warnings: r.warnings, version, threshold });
  if (!ctx.json) {
    printFindings(ctx, res.warnings, "⚠");
    printFindings(ctx, res.errors, "✖");
    const { count, number } = numbers(ctx.i18n);
    const line = ctx.t("cli.check.images.summary", {
      n: res.images,
      count: number(res.images),
      cited: count("cli.check.count.cited", res.cited),
      errors: count("cli.check.count.errors", res.errors.length),
      warnings: count("cli.check.count.warnings", res.warnings.length),
    });
    if (res.errors.length) ctx.printErr(line);
    else ctx.print(line);
  }
  return { ok: res.errors.length === 0, ...res };
}

async function checkSecretsCommand(ctx) {
  const { project, config } = await ctx.loadProject();
  const r = build({ project, config, options: { draft: true } });
  const session = sessionFile(project.root, config, ctx.env);
  const res = checkSecrets({ root: project.root, config, data: r.data, session });
  if (!ctx.json) {
    const dir = path.relative(project.root, path.dirname(session)).split(path.sep).join("/") + "/";
    for (const f of res.findings) {
      if (f.kind === "sessionOutside" || f.kind === "sessionTracked") {
        ctx.error(`check.secrets.${f.kind}`, { file: f.where, dir });
        continue;
      }
      const kind = ctx.t(`cli.check.secrets.kind.${f.kind}`, { key: f.key, file: f.file, n: (f.index ?? 0) + 1 });
      ctx.printErr(`✖ ${ctx.t("cli.check.secrets.found", { where: f.where, kind, preview: f.preview })}`);
    }
    if (res.findings.some((f) => f.preview)) ctx.printErr(`  → ${ctx.t("cli.check.secrets.found.help")}`);
    if (res.findings.length) ctx.printErr(ctx.t("cli.check.secrets.failed", { n: res.findings.length }));
    else {
      const { count } = numbers(ctx.i18n);
      ctx.print(
        ctx.t("cli.check.secrets.ok", {
          files: count("cli.check.count.sourceFiles", res.files),
          places: count("cli.check.count.places", res.places),
        }),
      );
    }
  }
  return { ok: res.findings.length === 0, ...res };
}

/** Coverage report, family by family, with the missing items. */
async function checkCoverageCommand(ctx) {
  const { project, config } = await ctx.loadProject();
  const res = await runCoverage({ root: project.root, config });
  if (!ctx.json) {
    for (const a of res.adapters) {
      if (!a.available) {
        ctx.print(`⚠ ${ctx.t("cli.check.coverage.skipped", { adapter: a.adapter, reason: reasonText(ctx, a) })}`);
        continue;
      }
      for (const f of a.families) {
        const mark = f.covered === f.total ? "✔" : "✖";
        ctx.print(ctx.t("cli.check.coverage.family", { mark, name: f.name, covered: f.covered, total: f.total }));
        for (const it of f.items.filter((x) => !x.covered))
          ctx.print(
            ctx.t(
              it.label === undefined
                ? "cli.check.coverage.missing"
                : it.label === null
                  ? "cli.check.coverage.missingNoLabel"
                  : "cli.check.coverage.missingLabel",
              { id: it.id, label: it.label },
            ) + (it.plannedBy ? ctx.t("cli.check.coverage.plannedSuffix", { page: it.plannedBy }) : ""),
          );
      }
    }
    ctx.print(`\n${ctx.t("cli.check.coverage.summary", { covered: res.covered, n: res.total })}`);
    // Only the written pages cover an element; what the plan promises beyond them is said apart.
    if (res.planned > res.covered) {
      const { number } = numbers(ctx.i18n);
      ctx.print(
        ctx.t("cli.check.coverage.planned", {
          n: res.planned - res.covered,
          count: number(res.planned - res.covered),
          planned: number(res.planned),
          total: number(res.total),
        }),
      );
    }
    if (res.missing) ctx.printErr(`  → ${ctx.t("cli.check.coverage.advice")}`);
  }
  return res;
}

/** Translated reason of an adapter that is not available (cli.adapter.reason.<reason>, else the raw reason). */
export function reasonText(ctx, a) {
  const key = `cli.adapter.reason.${a.reason}`;
  return ctx.i18n.has(key) ? ctx.t(key, a.vars) : String(a.reason);
}

async function checkTablesCommand(ctx, width) {
  const site = await builtSite(ctx);
  try {
    const r = await checkTables({ file: site.file, width, topOfPage: ctx.t("cli.check.topOfPage") });
    if (!ctx.json) {
      for (const p of r.problems) ctx.printErr("✖ " + ctx.t("cli.check.tables.problem", p));
      const { count, number } = numbers(ctx.i18n);
      ctx.print(
        `\n${ctx.t("cli.check.tables.summary", { pages: count("cli.build.count.pages", r.pages), width: number(width), n: r.problems.length, count: number(r.problems.length) })}`,
      );
    }
    return r;
  } finally {
    site.release();
  }
}
