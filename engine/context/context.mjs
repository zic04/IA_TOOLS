// Agent context folder (ARCHITECTURE.md §6.11, lot V7): the one-page dossier an agent needs to write or update a
// page, built from its dependencies (engine/sync/dependencies.mjs) instead of the whole code inventory and table
// of contents an agent used to read. `buildContext` writes nothing to disk (the CLI does): given the same page
// dependencies, labels, facts and glossary, it always returns the same text.
import fs from "node:fs";
import path from "node:path";
import { sectionLabel, sectionCount } from "../build/page-templates.mjs";
import { labelKeysInCode } from "../sync/labels.mjs";
import { findPageEntry } from "../sync/dependencies.mjs";
import { escapeRegex } from "../build/text.mjs";
import { fitBudget, estimateTokens } from "./budget.mjs";

/** `use/orders` → `use__orders.md` (ARCHITECTURE.md §6.11): the context file's name, "/" replaced with "__". */
export const contextFileName = (pageId) => `${pageId.replaceAll("/", "__")}.md`;

/** A "doc:<path>" dependency (a facts file cited by `::facts`, ARCHITECTURE.md §6.10): never excerpted. */
const isDocRef = (p) => p.startsWith("doc:");
const docPath = (p) => p.slice("doc:".length);

/**
 * Line-numbered excerpts of a file's text (ARCHITECTURE.md §6.11 point 3), in reading order.
 * @param {string|null} fileText        null (file unreadable): no excerpt
 * @param {Array<[number, number]>} lines   cited ranges (1-based, inclusive): proofs and declared sources
 * @param {{ whole?: number, around?: number, head?: number, kind?: "direct"|"shared" }} [options]
 * @returns {Array<{ from: number, to: number, text: string, extent: "whole"|"range"|"head" }>}
 *   `text`: lines prefixed with their number ("42│ …"), joined with "\n". A DIRECT file (the page's own files, the
 *   server code it calls, the cited files) ≤ `whole` lines (default 400) is given whole (`extent: "whole"`): it is
 *   what the page is about. Otherwise, and for a SHARED file (layouts, clients, helpers) whatever its size, merged
 *   ±`around` (default 40) ranges around each cited line (`extent: "range"`); a direct file with no cited line gives
 *   its first `head` (default 200) lines (`extent: "head"`); a shared file with no cited line gives no excerpt at
 *   all (the caller lists its path only): it is read only if the writer needs it.
 */
export function excerpts(fileText, lines = [], { whole = 400, around = 40, head = 200, kind = "direct" } = {}) {
  if (fileText == null) return [];
  const rows = String(fileText).replace(/\r\n/g, "\n").split("\n");
  // A trailing newline at EOF produces one extra empty element: dropped, so the count matches an editor's.
  const total = rows.length && rows[rows.length - 1] === "" ? rows.length - 1 : rows.length;
  if (!total) return [];
  const slice = (from, to, extent) => ({
    from,
    to,
    extent,
    text: rows
      .slice(from - 1, to)
      .map((line, i) => `${from + i}│ ${line}`)
      .join("\n"),
  });
  if (kind === "direct" && total <= whole) return [slice(1, total, "whole")];
  if (lines.length) {
    const ranges = lines
      .map(([f, t]) => [Math.max(1, f - around), Math.min(total, t + around)])
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [f, t] of ranges) {
      const last = merged.at(-1);
      if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t);
      else merged.push([f, t]);
    }
    return merged.map(([f, t]) => slice(f, t, "range"));
  }
  return kind === "direct" ? [slice(1, Math.min(head, total), "head")] : [];
}

/** Smallest distance from a range's start to one of the cited lines, or Infinity without any (budget.mjs priority). */
function distanceFromCited(range, lines) {
  if (!lines.length) return Infinity;
  return Math.min(...lines.flatMap(([f, t]) => [Math.abs(range.from - f), Math.abs(range.from - t)]));
}

/** Reads an application (or project) file as text, or null when it does not exist. */
function readText(abs) {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** Keys of `flat` (one file's flattened messages) referenced as string literals in `text` (labelKeysInCode). */
function labelsCitedBy(text, flat) {
  const out = {};
  for (const { key } of labelKeysInCode(text)) if (key in flat) out[key] = flat[key];
  return out;
}

/**
 * Facts rows naming one of `files` (appRel) or one of `routes` (ARCHITECTURE.md §6.11 point 5).
 * @param {Record<string, object[]>} facts   { [source]: items }, engine/facts/*.json `items`
 * @param {Set<string>} files   appRel paths of the page's excerpted files (doc: refs excluded)
 * @param {string[]} routes
 * @returns {Array<{ source: string, item: object }>}
 */
export function factsFor(facts, files, routes) {
  const out = [];
  for (const [source, items] of Object.entries(facts || {}))
    for (const item of items || []) {
      const itemFiles = [item.file, ...(item.files || []).map((f) => f.split(":")[0])].filter(Boolean);
      const hit = itemFiles.some((f) => files.has(f)) || (item.route && routes.includes(item.route));
      if (hit) out.push({ source, item });
    }
  return out;
}

/** Glossary terms (ARCHITECTURE.md §6.1a) whose pattern matches the page's title/summary or one of the excerpts. */
export function glossaryFor(glossary, texts) {
  return (glossary || []).filter((g) => {
    const re = new RegExp(g.pattern || escapeRegex(g.term), "iu");
    return texts.some((t) => re.test(t));
  });
}

/**
 * Builds the context file of one page (ARCHITECTURE.md §6.11). Pure: every input is given by the caller
 * (`cli/commands/context.mjs` reads the disk); nothing is written here.
 * @param {object} p
 * @param {string} p.root            project root (the diff file of `--update` lives at <root>/.doc-kit/sync/)
 * @param {object} p.config          validated configuration (language, paths)
 * @param {object} p.toc             content/toc.json (normalised), to look up the counterpart's own title/summary
 * @param {string} p.pageId
 * @param {import("../sync/dependencies.mjs").PageDependencies} p.deps   pageDependencies() of this page
 * @param {string|null} [p.appDir]   absolute path of app.dir, to read `deps.files` (null: no excerpt possible)
 * @param {Record<string, Record<string,string>>} [p.labels]   { [projRelFile]: flattened messages }
 * @param {Record<string, object[]>} [p.facts]   { [source]: items }
 * @param {object[]} [p.glossary]     content/glossary.json
 * @param {object|null} p.templates  loadPageTemplates() result
 * @param {import("../sync/report.mjs").SyncReport|null} [p.report]   only read when `update`
 * @param {boolean} [p.update]
 * @param {number} [p.budget]        default 16000 (ARCHITECTURE.md §6.11)
 * @param {string|null} [p.product]  config.product.name, shown in the header (null: omitted)
 * @param {string|null} [p.version]  the documented version (readProjectVersion of engine/build/build.mjs), shown in the header (null: omitted)
 * @param {(key: string, vars?: object) => string} p.t   translator, already in the site's language
 * @returns {{ text: string, tokens: number, cut: Array<{ kind: string, path?: string, lines?: [number, number] }> }}
 */
export function buildContext({
  root,
  config,
  toc,
  pageId,
  deps,
  appDir,
  labels = {},
  facts = {},
  glossary = [],
  templates,
  report = null,
  update = false,
  budget = 16000,
  product = null,
  version = null,
  t,
}) {
  const page = deps.page;
  const lines = [];
  const push = (s = "") => lines.push(s);
  // A line marking what a cut removed, reused both in place of the cut part and in the end-of-file summary
  // (ARCHITECTURE.md §6.11): "lines" is already formatted ("40-57" or "—" for a whole section).
  const cutLine = (kindVar, pathVar, linesVar) =>
    t("cli.context.cut", { kind: kindVar, path: pathVar, lines: linesVar });

  // ─── 1. The page ───────────────────────────────────────────────────────────────────────────────────────────
  push(`# ${page.title || pageId} (${pageId})`);
  push("");
  const meta = [
    product ? `${t("cli.context.meta.product")}: ${product}` : null,
    version ? `${t("cli.context.meta.version")}: ${version}` : null,
    page.template ? `${t("cli.context.meta.template")}: ${page.template}` : null,
    page.space ? `${t("cli.context.meta.space")}: ${page.space}` : null,
    page.routes?.length ? `${t("cli.context.meta.routes")}: ${page.routes.join(", ")}` : null,
    page.permissions?.length ? `${t("cli.context.meta.permissions")}: ${page.permissions.join(", ")}` : null,
    `${t("cli.context.meta.file")}: ${config.paths.content}/${page.file || `${pageId}.md`}`,
  ].filter(Boolean);
  for (const m of meta) push(`- ${m}`);
  if (page.summary) push(`\n${page.summary}`);
  if (page.counterpart) {
    const targetId = page.counterpart.split("~")[0];
    const target = findPageEntry(toc, targetId);
    push(
      `\n${t("cli.context.counterpart", { id: targetId, title: target?.title || "", summary: target?.summary || "" })}`,
    );
  }
  push("");

  // ─── 2. Required sections of the template, in the site's language ────────────────────────────────────────────
  /** @type {import("./budget.mjs").BudgetPart} */
  const sectionsPart = { kind: "sections", text: "", cutLine: "" };
  if (page.template && templates?.types?.[page.template]) {
    const def = templates.types[page.template];
    const sectionLines = [`## ${t("cli.context.section.sections")}`, ""];
    for (let i = 0; i < sectionCount(templates, page.template); i++) {
      const label = sectionLabel(templates, page.template, i, config.language);
      if (!label) continue;
      sectionLines.push(
        `- ${label}${(def.required || []).includes(i) ? ` (${t("cli.context.section.required")})` : ""}`,
      );
    }
    sectionsPart.text = sectionLines.join("\n") + "\n";
  }

  // ─── 3. Files to read: direct first, each with the line ranges and the excerpts themselves ──────────────────
  const direct = deps.files.filter((f) => f.kind === "direct" && !isDocRef(f.path));
  const shared = deps.files.filter((f) => f.kind === "shared" && !isDocRef(f.path));
  /** @type {import("./budget.mjs").BudgetPart[]} */
  const fileParts = [];
  const excerptTexts = [];
  const fileHeading = (f) => `### ${f.path} (${t(`cli.context.file.${f.kind}`)})`;
  const EXTENT_KEY = { whole: "wholeFile", head: "headOnly", range: "lines" };
  for (const f of [...direct, ...shared]) {
    const text = appDir ? readText(path.join(appDir, f.path)) : null;
    // The screen's own files (reached by the page's routes, not a layout) are what the page is about: given whole
    // up to 800 lines, and the last excerpts a budget cuts.
    const own = f.kind === "direct" && f.via.includes("route");
    const items = excerpts(text, f.lines, { kind: f.kind, ...(own ? { whole: 800 } : {}) });
    if (!items.length) {
      fileParts.push({ kind: "page", text: `${fileHeading(f)}\n${t("cli.context.file.pathOnly")}\n`, cutLine: "" });
      continue;
    }
    for (const ex of items) {
      excerptTexts.push(ex.text);
      const label = t(`cli.context.file.${EXTENT_KEY[ex.extent]}`, { from: ex.from, to: ex.to });
      fileParts.push({
        kind: f.kind === "shared" ? "shared" : "excerpt",
        priority: own ? -1 : distanceFromCited(ex, f.lines),
        path: f.path,
        lines: [ex.from, ex.to],
        text: `${fileHeading(f)} — ${label}\n\`\`\`\n${ex.text}\n\`\`\`\n`,
        cutLine: `${fileHeading(f)} — ${cutLine(f.kind, f.path, `${ex.from}-${ex.to}`)}\n`,
      });
    }
  }
  const docFilesOnly = deps.files.filter((f) => isDocRef(f.path)).map((f) => docPath(f.path));
  for (const p of docFilesOnly)
    fileParts.push({
      kind: "page",
      text: `### ${p} (${t("cli.context.file.shared")})\n${t("cli.context.file.pathOnly")}\n`,
      cutLine: "",
    });

  // ─── 4. Exact labels ───────────────────────────────────────────────────────────────────────────────────────
  const citedLabels = {};
  for (const txt of excerptTexts)
    for (const flat of Object.values(labels)) Object.assign(citedLabels, labelsCitedBy(txt, flat));
  /** @type {import("./budget.mjs").BudgetPart} */
  const labelsPart = { kind: "labels", text: "", cutLine: cutLine("labels", t("cli.context.section.labels"), "—") };
  if (Object.keys(citedLabels).length)
    labelsPart.text =
      [
        `## ${t("cli.context.section.labels")}`,
        "",
        ...Object.entries(citedLabels).map(([k, v]) => `- \`${k}\`: ${v}`),
      ].join("\n") + "\n";

  // ─── 5. Facts ──────────────────────────────────────────────────────────────────────────────────────────────
  const fileSet = new Set(deps.files.filter((f) => !isDocRef(f.path)).map((f) => f.path));
  const rows = factsFor(facts, fileSet, deps.routes);
  /** @type {import("./budget.mjs").BudgetPart} */
  const factsPart = { kind: "facts", text: "", cutLine: cutLine("facts", t("cli.context.section.facts"), "—") };
  if (rows.length)
    factsPart.text =
      [
        `## ${t("cli.context.section.facts")}`,
        "",
        ...rows.map((r) => `- \`${r.source}\`: ${JSON.stringify(r.item)}`),
      ].join("\n") + "\n";

  // ─── 6. Glossary ───────────────────────────────────────────────────────────────────────────────────────────
  const terms = glossaryFor(glossary, [page.title || "", page.summary || "", ...excerptTexts]);
  let glossaryText = "";
  if (terms.length)
    glossaryText =
      [`## ${t("cli.context.section.glossary")}`, "", ...terms.map((g) => `- **${g.term}**: ${g.def}`)].join("\n") +
      "\n";

  // ─── 7. --update: the sync report's entries for this page (rendered with the same keys as .doc-kit/sync.md,
  // engine/sync/report.mjs renderReport, so an agent reads the same wording), its diff, its capture sheets ─────
  let updateText = "";
  if (update) {
    // Tolerant: a hand-written report (tests, or a report from an older/partial run) may be missing a category.
    const r = report || {};
    const proofsMoved = r.proofs?.moved || [];
    const proofsBroken = r.proofs?.broken || [];
    const rLabels = r.labels || [];
    const rReview = r.review || [];
    const rCaptures = r.captures || [];
    const rNew = r.new || [];
    const rRemoved = r.removed || [];
    const reasons = [];
    for (const m of proofsMoved.filter((x) => x.page === pageId)) reasons.push(t("cli.sync.proof.moved", m));
    for (const m of proofsBroken.filter((x) => x.page === pageId))
      reasons.push(t(`cli.sync.proof.broken.${m.reason}`, m));
    for (const m of rLabels.filter((x) => x.pages.includes(pageId)))
      reasons.push(
        t(m.new === null ? "cli.sync.label.removed" : "cli.sync.label.changed", { ...m, pages: m.pages.join(", ") }),
      );
    const review = rReview.find((x) => x.page === pageId);
    if (review)
      for (const reason of review.reasons) reasons.push(t(`cli.sync.reason.${reason.change}`, { path: reason.path }));
    for (const c of rCaptures.filter((x) => x.pages.includes(pageId)))
      reasons.push(t("cli.sync.capture.stale", { id: c.id, reasons: c.reasons.join(", ") }));
    for (const n of rNew.filter((x) => x.suggest === pageId)) reasons.push(t("cli.sync.new.item", n));
    for (const rem of rRemoved.filter((x) => x.pages.includes(pageId)))
      reasons.push(t("cli.sync.removed.item", { ...rem, pages: rem.pages.join(", ") }));
    const diffFile = path.join(root, ".doc-kit", "sync", `${pageId.replaceAll("/", "__")}.diff`);
    const diff = readText(diffFile)?.replace(/\n+$/, "") || null;
    const sheets = rCaptures.filter((x) => x.pages.includes(pageId)).map((c) => `.doc-kit/compare/${c.id}.png`);
    const updateLines = [`## ${t("cli.context.section.update")}`, ""];
    updateLines.push(reasons.length ? reasons.map((reason) => `- ${reason}`).join("\n") : t("cli.context.update.none"));
    if (diff) updateLines.push(`\n${t("cli.context.update.diff")}\n\`\`\`diff\n${diff}\n\`\`\``);
    if (sheets.length)
      updateLines.push(`\n${t("cli.context.update.sheets")}\n${sheets.map((s) => `- ${s}`).join("\n")}`);
    updateText = updateLines.join("\n") + "\n";
  }

  // ─── Assembly with the budget (page and sections never cut) ──────────────────────────────────────────────────
  const parts = /** @type {import("./budget.mjs").BudgetPart[]} */ ([
    { kind: "page", text: lines.join("\n") + "\n", cutLine: "" },
    sectionsPart,
    { kind: "page", text: `## ${t("cli.context.section.files")}\n`, cutLine: "" },
    ...fileParts,
    labelsPart,
    factsPart,
    { kind: "page", text: glossaryText, cutLine: "" },
    { kind: "page", text: updateText, cutLine: "" },
  ]).filter((p) => p.text);
  const { kept, cut } = fitBudget(parts, budget);
  const cutSummary = cut.length
    ? `\n## ${t("cli.context.section.cut")}\n\n${cut.map((c) => `- ${c.cutLine.trim()}`).join("\n")}\n`
    : "";
  const text = kept.map((p) => p.text).join("\n") + cutSummary;
  return { text, tokens: estimateTokens(text), cut };
}
