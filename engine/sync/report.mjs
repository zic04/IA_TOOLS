// `doc-kit sync` report (ARCHITECTURE.md §6.10): compares the application now with the reference (sync.json)
// or with a git commit (--since), and says exactly what the documentation must follow. Pure apart from reading
// the disk and the injected `git` calls: no side effect, no network, never a write to the application.
import fs from "node:fs";
import path from "node:path";
import { hashText, hashPlanEntry } from "./hash.mjs";
import { pageDependencies, writtenPages, classifyMissingFile } from "./dependencies.mjs";
import { extractProofs, locateProof, PROOF_REF } from "./proofs.mjs";
import { flattenMessages } from "./labels.mjs";
import { generatorTag } from "../brand.mjs";
import { adapterTools, normalize, isCovered } from "../check/coverage.mjs";
import { translatableFiles, translationState, readSources } from "../build/languages.mjs";

const safeRead = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
/** A fresh (non-global) test of the PROOF_REF family, for one code span. */
const isProofSpan = (span) => new RegExp(PROOF_REF.source).test(span);

/** "/a/b/c" vs "/a/b/d" → 2 (the number of leading non-empty "/"-segments they share; a bare leading "/" is
 * never itself a shared segment, so "/orders" and "/customers" share none). */
function commonSegments(a, b) {
  const x = String(a).split("/").filter(Boolean);
  const y = String(b).split("/").filter(Boolean);
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

/** Absolute path of a dependency file ("doc:<path>" for a facts file, else relative to app.dir), or null. */
const absOf = (root, appDir, p) =>
  p.startsWith("doc:") ? path.join(root, p.slice(4)) : appDir ? path.join(appDir, p) : null;

/** The tokens a page "names" (ARCHITECTURE.md §2.6, probablyIntact): cited label values, code span contents
 * and their identifiers (proofs excluded), its routes, and the texts of [[menu/perm/route]] badges. */
function citedTokens(page, labelValues) {
  const tokens = new Set(labelValues);
  for (const m of page.markdown.matchAll(/`([^`\n]+)`/g)) {
    if (isProofSpan(m[0])) continue;
    tokens.add(m[1]);
    for (const id of m[1].matchAll(/[A-Za-z_$][\w$]{2,}/g)) tokens.add(id[0]);
  }
  for (const r of page.entry?.routes || []) tokens.add(r);
  for (const m of page.markdown.matchAll(/\[\[(?:menu|perm|droit|route)\s+([^\]]+)\]\]/g)) tokens.add(m[1].trim());
  return [...tokens].filter((t) => typeof t === "string" && t.length >= 2);
}

/**
 * Lines of the CURRENT file touched by a unified diff (`@@ -a,b +c,d @@` → [c, c+d-1], context lines included:
 * a slight over-estimate, never an under-estimate), or null without a usable diff.
 */
export function touchedLines(patch) {
  if (patch === null || patch === undefined) return null;
  const out = [];
  for (const m of String(patch).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const from = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    out.push([from, Math.max(from, from + n - 1)]);
  }
  return out;
}

/** Priority of a review page (ARCHITECTURE.md §2.6). A file the page reaches only through its proofs, whose cited
 * lines are intact (`proofsIntact`), does not count: the page says nothing about the rest of that file. */
function priorityOf({ reasons: all, page, git, refCommit, labelValues }) {
  const reasons = all.filter((r) => !r.proofsIntact);
  if (!reasons.length) return "probablyIntact";
  if (reasons.some((r) => r.kind === "direct")) return "direct";
  if (reasons.some((r) => r.change === "deleted")) return "shared";
  if (!git || !refCommit) return "shared";
  const patch = git.diff(
    refCommit,
    reasons.map((r) => r.path),
  );
  if (patch === null) return "shared";
  const changedLines = patch.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const tokens = citedTokens(page, labelValues);
  return changedLines.some((line) => tokens.some((t) => line.includes(t))) ? "shared" : "probablyIntact";
}

/** Facts files (facts/<source>.json, not tool-*) whose recorded commit differs from the application's current HEAD. */
export function staleFacts(root, factsDir, commit) {
  const dir = path.join(root, factsDir);
  if (!commit || !fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("tool-"))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (j.commit && j.commit !== commit) out.push(j.source || f.slice(0, -5));
    } catch {
      // not this report's job
    }
  }
  return out;
}

/** The content of a dependency file as it was at `since`/`refCommit` ("doc:" facts files are not versioned
 * by the application's git: read as they are now), or null when it cannot be known. */
function hashAtRef({ git, since, p, appDir, root }) {
  if (p.startsWith("doc:")) {
    const a = path.join(root, p.slice(4));
    return fs.existsSync(a) ? hashText(fs.readFileSync(a)) : null;
  }
  if (!git) return null;
  const text = git.show(since, p);
  return text === null ? null : hashText(text);
}

/** The version recorded in a capture's zone file (images/zones/<id>.json), or null. */
function readZoneVersion(root, config, id) {
  const f = path.join(root, config.paths.images, "zones", `${id}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/** Text a page "declares", for a plain citation search: its Markdown plus its table-of-contents entry (so that
 * a route cited only in `routes: […]`, never in prose, still counts — the same text coverage.mjs scans). */
const pageCiteText = (p) => `${p.markdown}\n${JSON.stringify(p.entry)}`;

/** The written page citing the closest id of the same family (longest shared "/"-prefix, at least one segment). */
function suggestFor(id, family, written) {
  let best = null;
  for (const item of family.items) {
    if (item.id === id || !item.covered) continue;
    const n = commonSegments(id, item.id);
    if (n < 1 || (best && n <= best.n)) continue;
    const page = written.find((p) => (item.match || []).some((m) => pageCiteText(p).includes(m)));
    if (page) best = { n, page: page.id };
  }
  return best?.page ?? null;
}

/** Values of every label recorded in the reference (used as part of the probablyIntact token set, §2.6). */
function allLabelValues(reference) {
  const out = [];
  for (const entries of Object.values(reference?.labels || {})) out.push(...Object.values(entries));
  return out;
}

/**
 * Compares the application now with the reference.
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {object} p.toc
 * @param {object|null} p.reference    sync.json, or null
 * @param {string|null} [p.since]      a git ref: compare with it instead of sync.json
 * @param {object|null} p.git          createGit(exec, appDir), or null (no app.dir)
 * @param {object} p.inventory         result of runCoverage({ root, config }), now
 * @param {object[]} [p.plans]         loaded capture plan entries
 * @param {string|null} p.appDir
 * @param {string} p.version           documented version, now
 * @param {string|null} p.commit       application HEAD, now
 * @param {string} p.factsDir          projRel facts folder
 * @returns {Promise<object>} SyncReport
 */
export async function compareWithReference({
  root,
  config,
  toc,
  reference,
  since = null,
  git,
  inventory,
  plans = [],
  appDir,
  version,
  commit,
  factsDir,
}) {
  const written = writtenPages({ root, config, toc });
  const writtenIds = new Set(written.map((p) => p.id));
  const byId = new Map(written.map((p) => [p.id, p]));
  const refCommit = since || reference?.app?.commit || null;
  const tools = adapterTools(root);
  const gitAvailable = !!git && git.available();

  const proofsMoved = [];
  const proofsBroken = [];
  const review = [];
  const unchanged = [];
  const capturesReasons = new Map(); // id → Set(reason)
  const capturesPages = new Map(); // id → Set(page)

  // ─── Labels: no page attribution is stored, so this is computed once, globally (never with --since) ───────
  const labelsOut = [];
  if (!since)
    for (const [file, entries] of Object.entries(reference?.labels || {})) {
      // resolve, not join: same reason as allFlatLabels (engine/sync/reference.mjs) — file may be absolute.
      const abs2 = path.resolve(root, file);
      let flatNow = {};
      try {
        flatNow = fs.existsSync(abs2) ? flattenMessages(JSON.parse(fs.readFileSync(abs2, "utf8"))) : {};
      } catch {
        flatNow = {};
      }
      for (const [key, oldValue] of Object.entries(entries)) {
        const newValue = flatNow[key] ?? null;
        if (newValue === oldValue) continue;
        const pages = written.filter((p) => p.markdown.includes(oldValue)).map((p) => p.id);
        if (pages.length) labelsOut.push({ file, key, old: oldValue, new: newValue, pages });
      }
    }
  const pagesWithLabelIssue = new Set(labelsOut.flatMap((l) => l.pages));
  const labelValues = allLabelValues(reference);

  const markedIds = since ? [...writtenIds] : Object.keys(reference?.pages || {});
  const truncated = [];

  for (const id of markedIds) {
    if (!writtenIds.has(id)) continue;
    const page = byId.get(id);
    const recorded = since ? null : reference?.pages?.[id];
    const declared = recorded?.declared || [];
    const deps = await pageDependencies({ root, config, toc, pageId: id, inventory, tools, factsDir, plans, declared });
    if (deps.truncated) truncated.push(id);

    // ─── Review: dependency hashes, against the reference OR against `since` (read via git show) ────────────
    const reasons = [];
    const recordedFiles = since
      ? Object.fromEntries(
          deps.files
            .map((f) => [f.path, hashAtRef({ git, since, p: f.path, appDir, root })])
            .filter(([, h]) => h !== null),
        )
      : recorded?.files || {};
    for (const [p, oldHash] of Object.entries(recordedFiles)) {
      const a = absOf(root, appDir, p);
      const exists = !!a && fs.existsSync(a);
      const current = deps.files.find((f) => f.path === p);
      const kind = current?.kind ?? classifyMissingFile(p, deps);
      if (!exists) reasons.push({ path: p, kind, change: "deleted" });
      else if (hashText(fs.readFileSync(a)) !== oldHash) reasons.push({ path: p, kind, change: "modified" });
    }

    // ─── Proofs: re-extracted from the current Markdown, matched against the recorded ones ───────────────────
    let hadProofIssue = false;
    const proofIssueFiles = new Set();
    const refProofs = since ? {} : reference?.proofs || {};
    const pageProofs = extractProofs(page.markdown, appDir ? { appDir } : {});
    for (const proof of pageProofs) {
      const recordedProof = refProofs[proof.ref];
      if (!recordedProof) continue;
      const proofFile = proof.path || proof.file;
      const currentAbs = appDir ? path.join(appDir, proofFile) : null;
      const renamed =
        appDir && git ? git.changed(refCommit)?.find((c) => c.status === "R" && c.from === proofFile) : null;
      const current =
        currentAbs && fs.existsSync(currentAbs)
          ? fs.readFileSync(currentAbs, "utf8")
          : renamed
            ? safeRead(path.join(appDir, renamed.path))
            : null;
      const r = locateProof({ current, renamedTo: renamed?.path ?? null, recorded: recordedProof, proof });
      if (r.status !== "intact") proofIssueFiles.add(proofFile);
      if (r.status === "moved") {
        hadProofIssue = true;
        const newRef = r.newTo !== r.newFrom ? `${r.newFile}:${r.newFrom}-${r.newTo}` : `${r.newFile}:${r.newFrom}`;
        // newFrom/newTo are extra (beyond the documented shape): apply.mjs uses them directly, rather than
        // re-parsing newRef, to rewrite the exact span (ARCHITECTURE.md §2.8).
        proofsMoved.push({
          page: id,
          ref: proof.ref,
          newRef,
          file: proof.file,
          newFile: r.newFile,
          newFrom: r.newFrom,
          newTo: r.newTo,
          text: recordedProof.text,
        });
      } else if (r.status === "broken") {
        hadProofIssue = true;
        proofsBroken.push({ page: id, ref: proof.ref, file: proof.file, text: recordedProof.text, reason: r.reason });
      }
    }

    // ─── Captures: a cited plan entry whose route's files/hash changed, or whose screenshot version is old ───
    for (const capId of deps.captures) {
      const planEntry = plans.find((p) => p.id === capId);
      const recordedCap = since ? null : reference?.captures?.[capId];
      if (!recordedCap || !planEntry) continue;
      const found = new Set();
      if (hashPlanEntry(planEntry) !== recordedCap.plan) found.add("plan");
      if (planEntry.route !== recordedCap.route) found.add("route");
      const zoneVersion = readZoneVersion(root, config, capId);
      if (zoneVersion && zoneVersion !== version) found.add("version");
      if (!found.size) continue;
      if (!capturesReasons.has(capId)) {
        capturesReasons.set(capId, new Set());
        capturesPages.set(capId, new Set());
      }
      for (const r of found) capturesReasons.get(capId).add(r);
      capturesPages.get(capId).add(id);
    }

    // A modified file the page reaches ONLY through its proofs (a menu label cited in the sidebar, a constant in a
    // config file): the change matters only if it touches the cited lines. Against sync.json the recorded proofs
    // tell (none moved or broken); with --since, the diff's hunks do. Such a reason is kept, marked proofsIntact.
    const citedLines = new Map();
    for (const proof of pageProofs) {
      const f = proof.path || proof.file;
      if (!citedLines.has(f)) citedLines.set(f, []);
      citedLines.get(f).push([proof.from, proof.to ?? proof.from]);
    }
    // A file also reached through the screen's imports or layouts (a sidebar whose menu label the page cites) is
    // direct only because of the proof: with the cited lines intact, it is judged as the shared file it otherwise is.
    for (const reason of reasons) {
      const dep = deps.files.find((f) => f.path === reason.path);
      const cited = citedLines.get(reason.path);
      if (reason.change !== "modified" || !dep || !cited || !dep.via.includes("proof")) continue;
      let intact;
      if (!since) {
        // Every proof of that file was recorded at marking time, and none of them moved or broke.
        const recordedAll = pageProofs.filter((p) => (p.path || p.file) === reason.path).every((p) => refProofs[p.ref]);
        intact = recordedAll && !proofIssueFiles.has(reason.path);
      } else {
        const touched = git ? touchedLines(git.diff(since, [reason.path])) : null;
        intact = !!touched && !cited.some(([a, b]) => touched.some(([c, d]) => a <= d && c <= b));
      }
      if (!intact) continue;
      const isLayout = dep.via.includes("layout");
      const reallyDirect = dep.via.some(
        (v) => ["api", "declared", "sources"].includes(v) || (v === "route" && !isLayout),
      );
      if (dep.via.every((v) => v === "proof")) reason.proofsIntact = true;
      else if (!reallyDirect) reason.kind = "shared";
    }

    if (reasons.length)
      review.push({ page: id, priority: priorityOf({ reasons, page, git, refCommit, labelValues }), reasons });
    else if (!hadProofIssue && !pagesWithLabelIssue.has(id)) unchanged.push(id);
  }

  const unmarked = written.filter((p) => !(reference?.pages && p.id in reference.pages)).map((p) => p.id);

  // ─── new / removed: never with --since (would need the adapters re-run at the ref) ──────────────────────
  const newItems = [];
  const removedItems = [];
  if (!since && reference) {
    const currentByKey = {};
    for (const a of inventory.adapters) for (const f of a.families || []) currentByKey[`${a.adapter}/${f.name}`] = f;
    for (const [key, family] of Object.entries(currentByKey)) {
      const oldIds = new Set(reference.inventory?.[key] || []);
      for (const item of family.items)
        if (!oldIds.has(item.id))
          newItems.push({ family: key, id: item.id, suggest: suggestFor(item.id, family, written) });
    }
    for (const [key, oldIds] of Object.entries(reference.inventory || {})) {
      const currentIds = new Set((currentByKey[key]?.items || []).map((i) => i.id));
      for (const oid of oldIds) {
        if (currentIds.has(oid)) continue;
        const pages = written.filter((p) => isCovered({ match: [oid] }, normalize(pageCiteText(p)))).map((p) => p.id);
        if (pages.length) removedItems.push({ family: key, id: oid, pages });
      }
    }
  }

  // Translations (ARCHITECTURE.md §6.12): the stale and missing files of every declared language, read from
  // translations/<lang>/.sources.json and the current content — no git, independent of --since.
  const translations = [];
  for (const lang of (config.languages || []).slice(1)) {
    const recorded = readSources(root, config.paths.translations, lang);
    for (const f of translatableFiles({ toc, root, content: config.paths.content })) {
      const srcAbs = path.join(root, config.paths.content, f.file);
      const trAbs = path.join(root, config.paths.translations, lang, f.file);
      const translatedExists = fs.existsSync(trAbs);
      const sourceText = fs.existsSync(srcAbs) ? fs.readFileSync(srcAbs, "utf8") : null;
      const state = translationState({ sourceText, translatedExists, recorded: recorded[f.file] });
      if (state === "stale" || state === "missing") translations.push({ lang, file: f.file, state });
    }
  }

  return {
    generator: generatorTag(),
    date: new Date().toISOString().slice(0, 10),
    reference: reference
      ? { commit: reference.app.commit, version: reference.app.version, date: reference.app.date }
      : null,
    since,
    current: { commit, version },
    proofs: { moved: proofsMoved, broken: proofsBroken },
    labels: labelsOut,
    review,
    captures: [...capturesReasons.entries()].map(([id, reasons]) => ({
      id,
      pages: [...capturesPages.get(id)],
      reasons: [...reasons],
    })),
    new: newItems,
    removed: removedItems,
    unchanged,
    unmarked,
    ...(config.languages ? { translations } : {}),
    facts: { stale: staleFacts(root, factsDir, commit) },
    // Extra, beyond the documented shape: pages whose import closure hit the 200-file bound (ARCHITECTURE.md §2.2),
    // and whether git could be used at all (without it, a deleted file is never detected as a rename).
    truncated,
    gitAvailable,
  };
}

/** Markdown of `.doc-kit/sync.md`: one summary line per category, then the pages to review by priority. */
export function renderReport(report, t) {
  const lines = [
    `# ${t("cli.sync.md.title")}`,
    "",
    t("cli.sync.title", { version: report.current.version, commit: report.current.commit || "—", date: report.date }),
    "",
  ];
  const cat = (key, n) => lines.push(`- ${t(`cli.sync.summary.${key}`, { n })}`);
  cat("proofsMoved", report.proofs.moved.length);
  cat("proofsBroken", report.proofs.broken.length);
  cat("labels", report.labels.length);
  cat("review", report.review.length);
  cat("captures", report.captures.length);
  cat("new", report.new.length);
  cat("removed", report.removed.length);
  cat("unchanged", report.unchanged.length);
  cat("unmarked", report.unmarked.length);
  // Translations (ARCHITECTURE.md §6.12): never affects --check (checkFails), only `translate status --check` does.
  if (report.translations?.length) {
    cat("translations", report.translations.length);
    lines.push(`  ${t("cli.sync.translations.hint")}`);
  }
  if (report.review.length) {
    lines.push("", `## ${t("cli.sync.md.reviewTitle")}`);
    for (const priority of ["direct", "shared", "probablyIntact"]) {
      const pages = report.review.filter((r) => r.priority === priority);
      if (!pages.length) continue;
      lines.push("", `### ${t(`cli.sync.priority.${priority}`)}`);
      for (const r of pages) {
        lines.push(`- ${r.page}`);
        for (const reason of r.reasons)
          lines.push(`  - ${t(`cli.sync.reason.${reason.change}`, { path: reason.path })}`);
      }
    }
  }
  lines.push("", `## ${t("cli.sync.md.detailsTitle")}`);
  for (const m of report.proofs.moved) lines.push(`- ${t("cli.sync.proof.moved", m)}`);
  for (const b of report.proofs.broken) lines.push(`- ${t(`cli.sync.proof.broken.${b.reason}`, b)}`);
  for (const l of report.labels)
    lines.push(
      `- ${t(l.new === null ? "cli.sync.label.removed" : "cli.sync.label.changed", { ...l, pages: l.pages.join(", ") })}`,
    );
  for (const c of report.captures)
    lines.push(`- ${t("cli.sync.capture.stale", { id: c.id, reasons: c.reasons.join(", ") })}`);
  for (const n of report.new) lines.push(`- ${t(n.suggest ? "cli.sync.new.item" : "cli.sync.new.noSuggest", n)}`);
  for (const r of report.removed) lines.push(`- ${t("cli.sync.removed.item", { ...r, pages: r.pages.join(", ") })}`);
  if (report.facts.stale.length)
    lines.push(`- ${t("cli.sync.factsStale", { sources: report.facts.stale.join(", ") })}`);
  for (const page of report.truncated || []) lines.push(`- ${t("cli.sync.truncated", { page })}`);
  if (!report.gitAvailable && report.review.some((r) => r.reasons.some((x) => x.change === "deleted")))
    lines.push(`- ${t("cli.sync.noGit")}`);
  return lines.join("\n") + "\n";
}

/**
 * Writes `.doc-kit/sync.md`, `.doc-kit/sync-report.json` and `.doc-kit/sync/<page>.diff` (the folder emptied
 * first). Creates `.doc-kit/.gitignore` (ignores everything) when the folder does not exist yet.
 */
export function writeReportFiles({ root, report, diffs = new Map(), t }) {
  const dir = path.join(root, ".doc-kit");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, ".gitignore"))) fs.writeFileSync(path.join(dir, ".gitignore"), "*\n");
  fs.writeFileSync(path.join(dir, "sync.md"), renderReport(report, t));
  fs.writeFileSync(path.join(dir, "sync-report.json"), JSON.stringify(report, null, 2) + "\n");
  const diffDir = path.join(dir, "sync");
  if (fs.existsSync(diffDir)) fs.rmSync(diffDir, { recursive: true, force: true });
  if (diffs.size) {
    fs.mkdirSync(diffDir, { recursive: true });
    for (const [page, text] of diffs) fs.writeFileSync(path.join(diffDir, `${page.replaceAll("/", "__")}.diff`), text);
  }
}

/** Exit code 1 (ARCHITECTURE.md §6.10, "--check") on any category but `unchanged` and `unmarked`. */
export function checkFails(report) {
  return !!(
    report.proofs.moved.length ||
    report.proofs.broken.length ||
    report.labels.length ||
    report.review.length ||
    report.captures.length ||
    report.new.length ||
    report.removed.length
  );
}
