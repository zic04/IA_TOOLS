// `sync --apply [--labels]` (ARCHITECTURE.md §6.10 §2.8): mechanical fixes only, never prose. Rewrites moved
// proofs (the exact "file:from(-to)" reference inside their code span) and, with `--labels`, replaces an old
// label value by its new one, only inside the allowed contexts (bold, a code span that is the label, badges, quotes),
// and only when the page then renders as it did but for the label (engine/sync/labels.mjs, labelReader): otherwise
// the page is left as it is, to update by hand.
import fs from "node:fs";
import path from "node:path";
import { extractProofs, rewriteProof } from "./proofs.mjs";
import { findPageEntry } from "./dependencies.mjs";
import { isEdited, pageSource } from "./reference.mjs";

/** Absolute Markdown file of a page (toc `file` override, else `<id>.md`). */
function pageFile(root, config, toc, pageId) {
  const entry = findPageEntry(toc, pageId);
  return path.join(root, config.paths.content, entry?.file || `${pageId}.md`);
}

/**
 * The pages `sync --apply` restamps (ARCHITECTURE.md §6.10): the unchanged ones, the ones whose only changes it has
 * just applied, and, with `autoIntact` (ETUDE-CAPTURES.md §7, G1), the probably intact ones — shared files whose diff
 * touches nothing the page cites, or files it reaches only through proofs that still hold. Never a page something
 * else is pending on (a broken proof, a capture, a label not applied — without `--labels`, or left to update by hand
 * —, a removed item it cites), nor one edited by hand since it was marked: that edit has not been checked. A page
 * nobody marked is never marked here, even one whose label it rewrote: it stays `unmarked`.
 * @param {object} report   a SyncReport, computed before the fixes were applied
 * @param {{ withLabels?: boolean, autoIntact?: boolean, byHand?: Array<{ page: string }> }} [o]
 *   byHand: applyReport().byHand, the label rewrites refused
 * @returns {{ restamp: string[], intact: string[] }}
 */
export function pagesToRestamp(report, { withLabels = false, autoIntact = false, byHand = [] } = {}) {
  const labelPages = report.labels.flatMap((l) => l.pages);
  const pending = new Set([
    ...report.proofs.broken.map((b) => b.page),
    ...report.captures.flatMap((c) => c.pages),
    ...(withLabels ? [] : labelPages),
    ...byHand.map((b) => b.page),
    ...(report.edited || []),
  ]);
  const anyIssue = new Set([...pending, ...report.review.map((r) => r.page), ...(report.unmarked || [])]);
  const restamp = new Set(report.unchanged);
  for (const id of [...report.proofs.moved.map((m) => m.page), ...(withLabels ? labelPages : [])])
    if (!anyIssue.has(id)) restamp.add(id);
  const removed = new Set(report.removed.flatMap((r) => r.pages));
  const intact = autoIntact
    ? report.review
        .filter((r) => r.priority === "probablyIntact" && !pending.has(r.page) && !removed.has(r.page))
        .map((r) => r.page)
    : [];
  for (const id of intact) restamp.add(id);
  return { restamp: [...restamp], intact };
}

/**
 * A page's Markdown with its changed labels rewritten, one after the other (labelReader's replaceLabel, each checked
 * on the rendered page): `n` the labels rewritten, `byHand` the ones whose rewrite the page refused.
 * @param {string} text
 * @param {Array<{ file: string, key: string, old: string, new: string }>} changes
 * @param {import("./labels.mjs").LabelReader} labels
 */
function relabel(text, changes, labels) {
  let n = 0;
  const byHand = [];
  for (const l of changes) {
    const r = labels.replaceLabel(text, l.old, l.new);
    if (r.byHand) byHand.push(l);
    if (r.n > 0) {
      text = r.text;
      n++;
    }
  }
  return { text, n, byHand };
}

/**
 * Applies the mechanical fixes of a report.
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object} p.toc
 * @param {object} p.report       a SyncReport (engine/sync/report.mjs)
 * @param {string[]} [p.pages]    limits the fix to these page ids; default: every page the report touches
 * @param {boolean} [p.withLabels]
 * @param {import("./labels.mjs").LabelReader} [p.labels]   the labels read through the kit's renderer (with withLabels)
 * @returns {{ changed: string[], rewritten: { proofs: number, labels: number },
 *   rewrites: Array<{ page: string, before: string, after: string }>,
 *   byHand: Array<{ page: string, file: string, key: string, old: string, new: string }> }}  changed: projRel Markdown
 *   files; rewrites: each page written, its Markdown before and after; byHand: the label rewrites refused, the page
 *   left as it is for them (it would render differently beyond the label)
 */
export function applyReport({ root, config, toc, report, pages, withLabels = false, labels }) {
  const changed = new Set();
  const rewrites = [];
  const byHand = [];
  let proofsRewritten = 0;
  let labelsRewritten = 0;

  const movedByPage = new Map();
  for (const m of report.proofs.moved) {
    if (pages && !pages.includes(m.page)) continue;
    (movedByPage.get(m.page) ?? movedByPage.set(m.page, []).get(m.page)).push(m);
  }
  const labelsByPage = new Map();
  if (withLabels)
    for (const l of report.labels) {
      if (l.new === null) continue; // a disappeared key is never applied
      for (const page of l.pages) {
        if (pages && !pages.includes(page)) continue;
        (labelsByPage.get(page) ?? labelsByPage.set(page, []).get(page)).push(l);
      }
    }

  const touchedPages = new Set([...movedByPage.keys(), ...labelsByPage.keys()]);
  for (const pageId of touchedPages) {
    const abs = pageFile(root, config, toc, pageId);
    if (!fs.existsSync(abs)) continue;
    const original = fs.readFileSync(abs, "utf8");
    const crlf = original.includes("\r\n");
    let text = original;

    for (const move of movedByPage.get(pageId) || []) {
      const proofs = extractProofs(text).filter((p) => p.ref === move.ref);
      if (!proofs.length) continue;
      for (const proof of proofs)
        text = rewriteProof(text, proof, { newFile: move.newFile, newFrom: move.newFrom, newTo: move.newTo });
      proofsRewritten++;
    }

    const relabelled = relabel(text, labelsByPage.get(pageId) || [], labels);
    text = relabelled.text;
    labelsRewritten += relabelled.n;
    byHand.push(...relabelled.byHand.map((l) => ({ page: pageId, file: l.file, key: l.key, old: l.old, new: l.new })));

    if (text !== original) {
      fs.writeFileSync(abs, crlf && !text.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text);
      changed.add(path.relative(root, abs).split(path.sep).join("/"));
      rewrites.push({ page: pageId, before: original, after: text });
    }
  }

  return { changed: [...changed], rewritten: { proofs: proofsRewritten, labels: labelsRewritten }, rewrites, byHand };
}

/**
 * The reference once `--apply` has rewritten pages (ARCHITECTURE.md §6.10): a rewritten page that was not edited by
 * hand records the fingerprint of what `--apply` wrote, so that its own fix never reads as an edit (`edited`); one
 * edited by hand before keeps its recorded fingerprint, and stays edited.
 * @param {object|null} reference                                   sync.json, or null
 * @param {Array<{ page: string, before: string, after: string }>} rewrites  applyReport().rewrites
 */
export function followRewrites(reference, rewrites) {
  if (!reference) return reference;
  const pages = { ...reference.pages };
  for (const { page, before, after } of rewrites)
    if (pages[page]?.source && !isEdited(pages[page], before))
      pages[page] = { ...pages[page], source: pageSource(after) };
  return { ...reference, pages };
}
