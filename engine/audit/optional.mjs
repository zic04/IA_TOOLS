// Optional measures of the audit. Each one may be unavailable (module not delivered yet, no adapter, no browser):
// it then returns { measured: false, reason } and the audit marks the indicator "not measured" — never an error.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KIT_ROOT } from "../project/find.mjs";

/** Imports a module of the kit only if it exists (checks delivered by other batches). */
async function optionalModule(relative) {
  const file = path.join(KIT_ROOT, relative);
  if (!fs.existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

const isFn = (f) => typeof f === "function";

/**
 * Coverage (engine/check/coverage.mjs, when present: runCoverage({ root, config })): elements inventoried by the
 * coverage adapters and cited in the content. The result is read defensively:
 *   { adapters: [{ available, families: [{ items: [{ id, covered }] }] }] }  → counts and uncovered ids
 *   { covered|cited: number, total: number }                               → counts
 *   no available adapter, or nothing inventoried                           → not measured
 *   items may carry `plannedBy` (the page declared but not written yet whose entry cites them)  → `planned`, `plannedBy`
 * @returns {Promise<{ measured: boolean, reason?: string, error?: string, n?: number, total?: number, missing?: string[],
 *   planned?: number, plannedBy?: Record<string, string> }>}
 */
export async function measureCoverage({ project, config }) {
  if (!config.coverage?.length) return { measured: false, reason: "noAdapter" };
  let mod;
  try {
    mod = await optionalModule("engine/check/coverage.mjs");
  } catch (e) {
    return { measured: false, reason: "error", error: e.message };
  }
  if (!mod) return { measured: false, reason: "unavailable" };
  const fn = [mod.runCoverage, mod.checkCoverage, mod.coverage, mod.default].find(isFn);
  if (!fn) return { measured: false, reason: "unavailable" };
  try {
    return readCoverage(await fn({ root: project.root, config, project }));
  } catch (e) {
    return { measured: false, reason: "error", error: e.message };
  }
}

/** Normalises a coverage result (see measureCoverage). Exported for the tests. */
export function readCoverage(r) {
  if (!r || typeof r !== "object" || r.available === false) return { measured: false, reason: "noAdapter" };
  const counted = (n, total, missing = []) =>
    total > 0 ? { measured: true, n, total, missing } : { measured: false, reason: "noAdapter" };
  const groups = [r, ...(Array.isArray(r.adapters) ? r.adapters : [])].filter((g) => g && g.available !== false);
  const items = groups.flatMap((g) => (Array.isArray(g.families) ? g.families : []).flatMap((f) => f.items || []));
  if (items.length) {
    const uncovered = items.filter((i) => !(i.covered ?? i.cited));
    const out = counted(
      items.length - uncovered.length,
      items.length,
      uncovered.map((i) => String(i.id ?? "?")),
    );
    // What the plan promises: the elements cited only by the entry of a page declared but not written yet.
    const planned = uncovered.filter((i) => i.plannedBy).map((i) => [String(i.id ?? "?"), String(i.plannedBy)]);
    if (out.measured && planned.length)
      Object.assign(out, { planned: out.n + planned.length, plannedBy: Object.fromEntries(planned) });
    return out;
  }
  const covered = r.covered ?? r.cited;
  if (typeof covered === "number" && typeof r.total === "number")
    return counted(covered, r.total, Array.isArray(r.missing) ? r.missing.map(String) : []);
  return { measured: false, reason: Array.isArray(r.adapters) ? "noAdapter" : "format" };
}

/**
 * Secrets (engine/check/secrets.mjs, when present): values that must never be published, in the site and its
 * sources; session files out of place. Only where each finding is and its kind are kept (never the value).
 * @returns {Promise<{ measured: boolean, reason?: string, error?: string, findings?: Array<{ where: string, kind: string }> }>}
 */
export async function measureSecrets({ project, config, data, env = process.env }) {
  try {
    const secrets = await optionalModule("engine/check/secrets.mjs");
    const session = await optionalModule("engine/capture/session.mjs");
    if (!isFn(secrets?.checkSecrets) || !isFn(session?.sessionFile)) return { measured: false, reason: "unavailable" };
    const r = secrets.checkSecrets({
      root: project.root,
      config,
      data,
      session: session.sessionFile(project.root, config, env),
    });
    return {
      measured: true,
      findings: (r.findings || []).map((f) => ({ where: String(f.where ?? ""), kind: String(f.kind ?? "") })),
    };
  } catch (e) {
    return { measured: false, reason: "error", error: e.message };
  }
}

/**
 * Tables wider than the reading column at `width` px (engine/check/tables.mjs; needs the Playwright browser).
 * @returns {Promise<{ measured: boolean, reason?: string, error?: string, problems?: Array<{page, heading, wide, visible}> }>}
 */
/** @param {string} html */
export async function measureTables(
  html,
  { width = 1440, topOfPage } = /** @type {{ width?: number, topOfPage?: any }} */ ({}),
) {
  if (!html) return { measured: false, reason: "noSite" };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-audit-"));
  try {
    const file = path.join(dir, "site.html");
    fs.writeFileSync(file, html);
    const { checkTables } = await import(pathToFileURL(path.join(KIT_ROOT, "engine/check/tables.mjs")).href);
    const r = await checkTables({ file, width, topOfPage });
    return { measured: true, problems: r.problems };
  } catch (e) {
    return { measured: false, reason: e?.key === "browser.missing" ? "browser" : "error", error: e?.message };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
