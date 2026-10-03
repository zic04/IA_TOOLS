// `sync --apply [--labels]` (ARCHITECTURE.md §6.10 §2.8): mechanical fixes only, never prose. Rewrites moved
// proofs (the exact "file:from(-to)" reference inside their code span) and, with `--labels`, replaces an old
// label value by its new one, only inside the five allowed contexts (bold, code spans, badges, quotes).
import fs from "node:fs";
import path from "node:path";
import { extractProofs, rewriteProof } from "./proofs.mjs";
import { replaceLabel } from "./labels.mjs";
import { findPageEntry } from "./dependencies.mjs";

/** Absolute Markdown file of a page (toc `file` override, else `<id>.md`). */
function pageFile(root, config, toc, pageId) {
  const entry = findPageEntry(toc, pageId);
  return path.join(root, config.paths.content, entry?.file || `${pageId}.md`);
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
 * @returns {{ changed: string[], rewritten: { proofs: number, labels: number } }}  changed: projRel Markdown files
 */
export function applyReport({ root, config, toc, report, pages, withLabels = false }) {
  const changed = new Set();
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

    for (const l of labelsByPage.get(pageId) || []) {
      const r = replaceLabel(text, l.old, l.new);
      if (r.n > 0) {
        text = r.text;
        labelsRewritten++;
      }
    }

    if (text !== original) {
      fs.writeFileSync(abs, crlf && !text.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text);
      changed.add(path.relative(root, abs).split(path.sep).join("/"));
    }
  }

  return { changed: [...changed], rewritten: { proofs: proofsRewritten, labels: labelsRewritten } };
}
