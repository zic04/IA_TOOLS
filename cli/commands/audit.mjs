// audit [--json]
// Measures the documentation against standard/maturity.md: the indicators, the maturity level reached (1 to 4)
// and, in priority order, what to do to reach the next level, with the page ids concerned.
//   Writes .doc-kit/audit.md (human report, in the language of the messages) and .doc-kit/audit.json.
//   Prints a compact summary (--json: the full result on stdout).
//   Exit code 0: the audit is informative. 2: the project cannot be read (configuration). 3: incompatible kit.
// The table widths are measured in the browser (every page is opened: about 0.15 s per page); without a
// browser, or with DOC_KIT_NO_BROWSER=1, `wideTables` is "not measured". Coverage is measured when the coverage
// check of the kit and an adapter are available, otherwise "not measured".
import fs from "node:fs";
import path from "node:path";
import { runAudit } from "../../engine/audit/audit.mjs";
import { measureTables } from "../../engine/audit/optional.mjs";
import { renderMarkdown, renderSummary, withTexts } from "../../engine/audit/report.mjs";
import { EXIT } from "../../engine/project/errors.mjs";

export const options = {};

/** Folder of the work files of a project (git-ignored, ARCHITECTURE.md §2.1). */
export const WORK_DIR = ".doc-kit";

export async function run({ ctx }) {
  const { project, config } = await ctx.loadProject();
  const noBrowser = /^(1|true|yes)$/i.test(ctx.env.DOC_KIT_NO_BROWSER || "");
  const tables = noBrowser
    ? null
    : async (html) => {
        if (!ctx.json) ctx.printErr(ctx.t("cli.audit.tablesProgress"));
        return measureTables(html, /** @type {any} */ ({ topOfPage: ctx.t("cli.check.topOfPage") }));
      };
  // Facts (§6.9): the application's current HEAD, read read-only, to tell a stale facts file; null without app.dir.
  const commit = config.app.dir ? ctx.commit(path.resolve(project.root, config.app.dir)) : null;
  const result = await runAudit({
    project,
    config,
    measure: /** @type {any} */ ({ tables, tablesReason: noBrowser ? "disabled" : undefined, commit }),
  });

  const dir = path.join(project.root, WORK_DIR);
  fs.mkdirSync(dir, { recursive: true });
  // Work files, never committed (same rule as the session written by `connect`), even in an older project.
  if (!fs.existsSync(path.join(dir, ".gitignore"))) fs.writeFileSync(path.join(dir, ".gitignore"), "*\n");
  const full = withTexts(result, ctx.i18n);
  const md = path.join(dir, "audit.md");
  const json = path.join(dir, "audit.json");
  fs.writeFileSync(md, renderMarkdown(result, ctx.i18n));
  fs.writeFileSync(json, JSON.stringify(full, null, 2) + "\n");

  if (ctx.json) ctx.print(JSON.stringify(full, null, 2));
  else {
    const shown = (f) => {
      const r = path.relative(process.cwd(), f);
      return (!r || r.startsWith("..") || path.isAbsolute(r) ? f : r).split(path.sep).join("/");
    };
    ctx.print(renderSummary(result, ctx.i18n, { md: shown(md), json: shown(json) }));
  }
  return EXIT.OK;
}
