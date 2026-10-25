// sync [--since <ref>] [--apply [--labels] [--auto-intact]] [--mark <page…> | --all] [--sources <file[:lines]…>]
//      [--date YYYY-MM-DD] [--check] [--estimate]
// What the documentation must follow after a change of the application (ARCHITECTURE.md §6.10): a report by
// default, or `--mark` to record the pages checked now. Git is read-only, through the `exec` test seam
// (engine/sync/git.mjs); nothing is ever written in the application.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { checkDate } from "../common.mjs";
import { createGit } from "../../engine/sync/git.mjs";
import { isSafeRef } from "../../engine/util/safe-git.mjs";
import { readSyncReference, writeSyncReference, markPages, pageCommit } from "../../engine/sync/reference.mjs";
import { compareWithReference, writeReportFiles, checkFails } from "../../engine/sync/report.mjs";
import { applyReport, pagesToRestamp, followRewrites } from "../../engine/sync/apply.mjs";
import { estimateUpdate } from "../../engine/sync/estimate.mjs";
import { labelReader } from "../../engine/sync/labels.mjs";
import { createSyncRenderer } from "../../engine/build/sync-renderer.mjs";
import { pageDependencies } from "../../engine/sync/dependencies.mjs";
import { runCoverage, adapterTools } from "../../engine/check/coverage.mjs";
import { readToc } from "../../engine/audit/audit.mjs";
import { loadPlans } from "../../engine/capture/plans.mjs";
import { loadPageTemplates } from "../../engine/core/page-templates.mjs";
import { readProjectVersion } from "../../engine/project/version.mjs";
import { WORK_DIR } from "../registry.mjs";
import { numbers } from "../../engine/build/format.mjs";

export const options = {
  since: { type: "string" },
  apply: { type: "boolean" },
  labels: { type: "boolean" },
  mark: { type: "boolean" }, // the pages follow as positionals: sync --mark <page…>, or sync --mark --all
  all: { type: "boolean" },
  sources: { type: "string", multiple: true },
  date: { type: "string" },
  check: { type: "boolean" },
  estimate: { type: "boolean" },
  "auto-intact": { type: "boolean" },
};

/** The project's capture plan entries, loaded once; [] when there is nothing to load (capture.mode "none", or
 * no plans folder yet: a documentation without captures, or not even started). */
async function loadProjectPlans(root, config) {
  if (config.capture?.mode === "none") return [];
  const folder = path.resolve(root, config.capture?.plans || "captures/plans");
  if (!fs.existsSync(folder)) return [];
  try {
    return (await loadPlans({ folder, display: config.capture.plans })).captures;
  } catch {
    return []; // an invalid plan is capture's/check's job to report, not sync's
  }
}

/** A read-only table of contents (an invalid or missing one is a build problem, not sync's to raise again). */
function safeToc(root, config) {
  return readToc(root, config.paths.content).toc || { sections: [] };
}

export async function run({ ctx, values, positionals = [] }) {
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  if (!config.app.dir) throw new KitError(EXIT.USAGE, "sync.noApp");
  const appDir = path.resolve(root, config.app.dir);
  if (!fs.existsSync(appDir)) throw new KitError(EXIT.USAGE, "sync.noApp");
  if (values.date !== undefined) checkDate(values.date);
  // `--all` alone is accepted too (sync --all), as it was first documented.
  const pages = values.mark ? positionals : [];
  if ((values.mark || values.all) && values.since !== undefined)
    throw new KitError(EXIT.USAGE, "option.invalid", { error: "--mark/--since" });
  // --since compares with a commit, never with sync.json (edits, proofs, captures, labels): nothing to restamp from.
  if (values.apply && values.since !== undefined)
    throw new KitError(EXIT.USAGE, "option.invalid", { error: "--apply/--since" });
  if (values["auto-intact"] && !values.apply)
    throw new KitError(EXIT.USAGE, "option.invalid", { error: "--auto-intact (--apply)" });
  if (values.mark && !values.all && !pages.length) throw new KitError(EXIT.USAGE, "sync.markNothing");
  const marking = !!(values.all || values.mark);
  const onePage = marking && !values.all && pages.length === 1;
  if (values.sources?.length && !onePage) throw new KitError(EXIT.USAGE, "sync.sourcesOnePage");

  const git = createGit(ctx.exec, appDir);
  const toc = safeToc(root, config);
  const inventory = await runCoverage({ root, config });
  const plans = await loadProjectPlans(root, config);
  const version = readProjectVersion(root, config.version);
  const commit = ctx.commit(appDir);
  const date = values.date || new Date().toISOString().slice(0, 10);
  // The labels a page cites, and the rewrites of --apply --labels, read in the page as the kit's renderer renders it
  // (ARCHITECTURE.md §6.10): the engine of sync is given the renderer, as it is given exec.
  const labels = labelReader(createSyncRenderer({ root, config }));

  if (marking)
    return runMark({ ctx, root, config, toc, inventory, plans, version, commit, date, values, pages, labels });
  return runReport({ ctx, root, config, toc, inventory, plans, version, commit, appDir, git, values, labels });
}

async function runMark({ ctx, root, config, toc, inventory, plans, version, commit, date, values, pages, labels }) {
  const { reference } = readSyncReference(root, config);
  const { reference: next, warnings } = await markPages({
    root,
    config,
    toc,
    pages,
    all: !!values.all,
    sources: values.sources || [],
    date,
    commit,
    version,
    inventory,
    plans,
    reference,
    labels,
  });
  writeSyncReference(root, config, next);
  const marked = values.all ? Object.keys(next.pages) : pages;
  if (ctx.json) {
    // The warnings are in the JSON: printed as text too, they would make the output unreadable by a script.
    ctx.print(JSON.stringify({ marked, warnings }, null, 2));
    return EXIT.OK;
  }
  for (const w of warnings) ctx.print(`${ctx.paint.warn("⚠")} ${ctx.t(`cli.${w.key}`, w.vars)}`);
  ctx.print(ctx.t("cli.sync.marked", { n: marked.length }));
  return EXIT.OK;
}

async function runReport({ ctx, root, config, toc, inventory, plans, version, commit, appDir, git, values, labels }) {
  const { reference } = readSyncReference(root, config);
  const since = values.since ?? null;
  if (since !== null && !isSafeRef(since))
    throw new KitError(EXIT.USAGE, "option.invalid", { error: `--since ${since}` });
  if (!reference && !since) {
    ctx.print(ctx.t("cli.sync.noReference"));
    ctx.print(`  → ${ctx.t("cli.sync.noReference.help")}`);
    return values.check ? EXIT.CHECK : EXIT.OK;
  }

  /**
   * The report against a reference (sync.json, or the one `--apply` leaves).
   * @param {object|null} ref
   * @returns {Promise<import("../../engine/sync/report.mjs").SyncReport & { estimate?: any }>}
   */
  const compare = async (ref) => {
    const r = await compareWithReference({
      ...{ root, config, toc, reference: ref, since, git, inventory, plans, appDir, version, commit, labels },
      factsDir: config.paths.facts,
    });
    return values.estimate
      ? { ...r, estimate: await buildEstimate({ root, config, toc, report: r, inventory, plans }) }
      : r;
  };
  let report = await compare(reference);
  if (values.apply)
    report = await applyAndRestamp({
      ctx,
      root,
      config,
      toc,
      inventory,
      plans,
      version,
      commit,
      values,
      report,
      compare,
      labels,
    });

  // Each page's diff from the commit it was checked at (pageCommit), or from --since.
  const diffs = new Map();
  for (const r of report.review) {
    const refCommit = since || pageCommit(reference, r.page);
    const d =
      git && refCommit
        ? git.diff(
            refCommit,
            r.reasons.map((x) => x.path),
          )
        : null;
    if (d) diffs.set(r.page, d);
  }
  writeReportFiles({ root, report, diffs, t: ctx.t });

  if (ctx.json) ctx.print(JSON.stringify(report, null, 2));
  else printSummary(ctx, report, since);

  if (values.check) {
    const failed = checkFails(report);
    if (!ctx.json) {
      ctx.print(
        failed
          ? `${ctx.paintErr.fail("✖")} ${ctx.t("cli.sync.check.failed")}`
          : `${ctx.paint.ok("✔")} ${ctx.t("cli.sync.check.ok")}`,
      );
      if (failed) ctx.print(`  → ${ctx.t("cli.sync.check.failed.help", { work: WORK_DIR })}`);
    }
    return failed ? EXIT.CHECK : EXIT.OK;
  }
  return EXIT.OK;
}

/** The report's summary, as text: one line per category, what could not be checked, then the estimate when one was
 * asked for. */
function printSummary(ctx, report, since) {
  ctx.print(ctx.t("cli.sync.written", { folder: ".doc-kit" }));
  if (since) ctx.print(ctx.paint.dim(ctx.t("cli.sync.sinceNoInventory")));
  for (const file of report.unreadableLabels || [])
    ctx.print(`${ctx.paint.warn("⚠")} ${ctx.t("cli.sync.labelsUnreadable", { file })}`);
  const line = (key, n) => ctx.print(ctx.t(`cli.sync.summary.${key}`, { n }));
  line("proofsMoved", report.proofs.moved.length);
  line("proofsBroken", report.proofs.broken.length);
  line("labels", report.labels.length);
  line("review", report.review.length);
  line("captures", report.captures.length);
  line("new", report.new.length);
  line("removed", report.removed.length);
  line("unchanged", report.unchanged.length);
  if (report.edited.length) line("edited", report.edited.length);
  if (report.byHand?.length) line("byHand", report.byHand.length);
  line("unmarked", report.unmarked.length);
  // What could not be checked: a file outside the application, never read (sync.dependencyOutside, sync.proofOutside).
  for (const w of report.warnings || []) ctx.print(`${ctx.paint.warn("⚠")} ${ctx.t(`cli.${w.key}`, w.vars)}`);
  if (report.estimate)
    ctx.print(
      ctx.t("cli.estimate.total", { input: report.estimate.total.input, output: report.estimate.total.output }) +
        (report.estimate.total.cost !== null
          ? " · " +
            ctx.t("cli.estimate.cost", {
              cost: report.estimate.total.cost.toFixed(2),
              currency: report.estimate.currency || "",
            })
          : ""),
    );
}

/**
 * `--apply` (ARCHITECTURE.md §6.10): the mechanical fixes of the report, then the reference that follows them — the
 * pages it rewrote keep a fingerprint of their new text (followRewrites), the pages left with nothing pending are
 * restamped — and the report again, when the reference changed.
 */
async function applyAndRestamp(p) {
  const { ctx, root, config, toc, inventory, plans, version, commit, values, report, compare, labels } = p;
  const applied = applyReport({ root, config, toc, report, withLabels: !!values.labels, labels });
  const { byHand } = applied;
  if (!ctx.json) {
    for (const file of applied.changed) ctx.print(ctx.t("cli.sync.applied.file", { file }));
    for (const b of byHand) ctx.print(`${ctx.paint.warn("⚠")} ${ctx.t("cli.sync.byHand.item", b)}`);
    if (!applied.changed.length) ctx.print(ctx.t("cli.sync.applied.none"));
    else {
      const { count } = numbers(ctx.i18n);
      ctx.print(
        ctx.t("cli.sync.applied.summary", {
          proofs: count("cli.sync.count.proofs", applied.rewritten.proofs),
          labels: count("cli.sync.count.labels", applied.rewritten.labels),
          pages: count("cli.build.count.pages", applied.changed.length),
        }),
      );
    }
  }

  const autoIntact = !!values["auto-intact"];
  const { restamp, intact } = pagesToRestamp(report, { withLabels: !!values.labels, autoIntact, byHand });
  if (autoIntact && !ctx.json)
    ctx.print(ctx.t("cli.sync.autoIntact", { n: intact.length, pages: intact.join(", ") || "—" }));
  // The rewrites refused stay in the report that follows: each page to update by hand, its label still pending.
  const withByHand = (r) => (byHand.length ? { ...r, byHand } : r);
  if (!restamp.length && !applied.rewrites.length) return withByHand(report);
  const before = followRewrites(readSyncReference(root, config).reference, applied.rewrites);
  const next = restamp.length
    ? (
        await markPages({
          ...{ root, config, toc, pages: restamp, restamp: true, commit, version, inventory, plans },
          date: before?.app?.date || new Date().toISOString().slice(0, 10),
          reference: before,
          labels,
        })
      ).reference
    : before;
  if (!next) return withByHand(report);
  writeSyncReference(root, config, next);
  return withByHand(await compare(next));
}

/** engine/context/context.mjs (lot V7) is used when present, to measure a page's real context size; while it
 * is still being written, `--estimate` degrades to a crude fallback rather than failing. */
async function loadContextBuilder() {
  try {
    return await import("../../engine/context/context.mjs");
  } catch {
    return null;
  }
}

/** The estimate of the pages to review (ARCHITECTURE.md §6.11), from their context files built in memory. */
async function buildEstimate({ root, config, toc, report, inventory, plans }) {
  const templates = loadPageTemplates();
  const contextMod = await loadContextBuilder();
  const tools = adapterTools(root);
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const contexts = [];
  for (const r of report.review) {
    const entry = findEntry(toc, r.page);
    let tokens = 2000; // fallback: a page's context is usually a few thousand tokens
    if (contextMod?.buildContext) {
      const deps = await pageDependencies({
        root,
        config,
        toc,
        pageId: r.page,
        inventory,
        tools,
        factsDir: config.paths.facts,
        plans,
      });
      const built = contextMod.buildContext({
        root,
        config,
        toc,
        pageId: r.page,
        deps,
        labels: {},
        facts: {},
        glossary: [],
        templates,
        report,
        update: true,
        budget: Infinity,
        t: (k) => k,
        appDir,
      });
      tokens = built.tokens;
    }
    contexts.push({ page: r.page, tokens, template: entry?.template });
  }
  return estimateUpdate({
    contexts,
    templates,
    prices: config.llm?.prices || {},
    currency: config.llm?.currency ?? null,
  });
}

function findEntry(toc, id) {
  for (const sec of toc.sections || [])
    for (const g of sec.groups || []) for (const p of g.pages || []) if (p.id === id) return p;
  return null;
}
