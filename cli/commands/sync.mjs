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
import { readSyncReference, writeSyncReference, markPages } from "../../engine/sync/reference.mjs";
import { compareWithReference, writeReportFiles, checkFails } from "../../engine/sync/report.mjs";
import { applyReport } from "../../engine/sync/apply.mjs";
import { estimateUpdate } from "../../engine/sync/estimate.mjs";
import { pageDependencies } from "../../engine/sync/dependencies.mjs";
import { runCoverage, adapterTools } from "../../engine/check/coverage.mjs";
import { readToc } from "../../engine/audit/audit.mjs";
import { loadPlans } from "../../engine/capture/plans.mjs";
import { loadPageTemplates } from "../../engine/build/page-templates.mjs";
import { readProjectVersion } from "../../engine/build/build.mjs";
import { WORK_DIR } from "./audit.mjs";

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

  if (marking) return runMark({ ctx, root, config, toc, inventory, plans, version, commit, date, values, pages });
  return runReport({ ctx, root, config, toc, inventory, plans, version, commit, appDir, git, values });
}

async function runMark({ ctx, root, config, toc, inventory, plans, version, commit, date, values, pages }) {
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

async function runReport({ ctx, root, config, toc, inventory, plans, version, commit, appDir, git, values }) {
  const { reference } = readSyncReference(root, config);
  const since = values.since ?? null;
  if (since !== null && !isSafeRef(since))
    throw new KitError(EXIT.USAGE, "option.invalid", { error: `--since ${since}` });
  if (!reference && !since) {
    ctx.print(ctx.t("cli.sync.noReference"));
    ctx.print(`  → ${ctx.t("cli.sync.noReference.help")}`);
    return values.check ? EXIT.CHECK : EXIT.OK;
  }

  let report = await compareWithReference({
    root,
    config,
    toc,
    reference,
    since,
    git,
    inventory,
    plans,
    appDir,
    version,
    commit,
    factsDir: config.paths.facts,
  });

  if (values.estimate) report.estimate = await buildEstimate({ root, config, toc, report, inventory, plans });

  if (values.apply) {
    const applied = applyReport({ root, config, toc, report, withLabels: !!values.labels });
    if (!ctx.json) {
      for (const file of applied.changed) ctx.print(ctx.t("cli.sync.applied.file", { file }));
      if (!applied.changed.length) ctx.print(ctx.t("cli.sync.applied.none"));
      else
        ctx.print(
          ctx.t("cli.sync.applied.summary", {
            proofs: applied.rewritten.proofs,
            labels: applied.rewritten.labels,
            pages: applied.changed.length,
          }),
        );
    }

    const anyIssue = new Set([
      ...report.review.map((r) => r.page),
      ...report.proofs.broken.map((b) => b.page),
      ...report.captures.flatMap((c) => c.pages),
      ...(!values.labels ? report.labels.flatMap((l) => l.pages) : []),
    ]);
    const touched = new Set([
      ...report.proofs.moved.map((m) => m.page),
      ...(values.labels ? report.labels.flatMap((l) => l.pages) : []),
    ]);
    const restamp = new Set(report.unchanged);
    for (const id of touched) if (!anyIssue.has(id)) restamp.add(id);
    // --auto-intact (ETUDE-CAPTURES.md §7, G1): a page whose only changes are "probably intact" — shared files
    // whose diff touches nothing the page cites, or files it reaches only through proofs that still hold — is
    // marked without asking an agent, unless something else is pending on it (broken proof, capture, label,
    // removed item it cites).
    const intact = [];
    if (values["auto-intact"]) {
      const pending = new Set([
        ...report.proofs.broken.map((b) => b.page),
        ...report.captures.flatMap((c) => c.pages),
        ...report.removed.flatMap((r) => r.pages),
        ...(!values.labels ? report.labels.flatMap((l) => l.pages) : []),
      ]);
      for (const r of report.review) if (r.priority === "probablyIntact" && !pending.has(r.page)) intact.push(r.page);
      for (const id of intact) restamp.add(id);
      if (!ctx.json) ctx.print(ctx.t("cli.sync.autoIntact", { n: intact.length, pages: intact.join(", ") || "—" }));
    }
    if (restamp.size) {
      const { reference: before } = readSyncReference(root, config);
      const { reference: next } = await markPages({
        root,
        config,
        toc,
        pages: [...restamp],
        date: before?.app?.date || new Date().toISOString().slice(0, 10),
        commit,
        version,
        inventory,
        plans,
        reference: before,
      });
      writeSyncReference(root, config, next);
      report = await compareWithReference({
        root,
        config,
        toc,
        reference: next,
        since,
        git,
        inventory,
        plans,
        appDir,
        version,
        commit,
        factsDir: config.paths.facts,
      });
      if (values.estimate) report.estimate = await buildEstimate({ root, config, toc, report, inventory, plans });
    }
  }

  const diffs = new Map();
  const refCommit = since || reference?.app?.commit || null;
  if (git && refCommit)
    for (const r of report.review) {
      const d = git.diff(
        refCommit,
        r.reasons.map((x) => x.path),
      );
      if (d) diffs.set(r.page, d);
    }
  writeReportFiles({ root, report, diffs, t: ctx.t });

  if (ctx.json) {
    ctx.print(JSON.stringify(report, null, 2));
  } else {
    ctx.print(ctx.t("cli.sync.written", { folder: ".doc-kit" }));
    if (since) ctx.print(ctx.paint.dim(ctx.t("cli.sync.sinceNoInventory")));
    const line = (key, n) => ctx.print(ctx.t(`cli.sync.summary.${key}`, { n }));
    line("proofsMoved", report.proofs.moved.length);
    line("proofsBroken", report.proofs.broken.length);
    line("labels", report.labels.length);
    line("review", report.review.length);
    line("captures", report.captures.length);
    line("new", report.new.length);
    line("removed", report.removed.length);
    line("unchanged", report.unchanged.length);
    line("unmarked", report.unmarked.length);
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
