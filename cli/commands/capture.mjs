// capture [patterns…] [--plans <dir>] [--preview] [--no-session] [--yes] [--compare] [--stale]
// Takes the screenshots of the capture plans (headless browser: no window) and writes images/<id>.webp and
// images/zones/<id>.json. Syntax of the plans: header of engine/capture/plans.mjs.
//   capture                      every capture of the plans
//   capture "use-orders-*"       the ids matching the patterns (* = any characters)
//   capture --plans captures/plans-prod     another plans folder (relative to the project; or <PREFIX>_PLANS)
//   capture --preview            also writes .doc-kit/<id>.zones.png, the zones drawn in red, to check them
//   capture --no-session         without the saved session (public pages)
//   capture --yes                confirms a production capture in advance (required without a terminal)
//   capture --compare            only replaces an image when it really changed (ARCHITECTURE.md §6.10): below
//                                capture.compareThreshold, the file on disk is left byte for byte as it was (only
//                                its zone file is rewritten); above it, the image is replaced and
//                                .doc-kit/compare/<id>.png shows before and after side by side
//   capture --stale              only the captures listed in .doc-kit/sync-report.json (doc-kit sync); implies
//                                --compare; patterns narrow the selection further
// With a session (doc-kit connect), the session is checked first (exit code 3 when it has expired) and the run is
// read-only (capture.readOnly "auto"): every request other than GET/HEAD/OPTIONS is blocked in the browser and
// counted on the last line. With capture.mode "none" (no screenshot), it explains the mode and stops (exit code 2).
// Routes matching capture.forbidden are refused (exit code 1); during the run, a request
// that only prefetches one of them is aborted and counted, and a navigation to one stops that capture.
// With capture.target "production": always read-only, a banner "PRODUCTION — read-only · N screenshots · <url>",
// then a confirmation in a terminal (default No: a reflexive Enter never starts a production run); without a
// terminal or with --json, --yes is required (exit code 2 otherwise). Declining captures nothing (exit code 0).
import fs from "node:fs";
import path from "node:path";
import { loadPlans, selectCaptures, forbiddenMatchers, forbiddenMatch } from "../../engine/capture/plans.mjs";
import { runCaptures, summarizeRequests, readOnlyMode } from "../../engine/capture/capture.mjs";
import { loadAuth, sessionFile, refreshSession } from "../../engine/capture/session.mjs";
import { hashPlanEntry } from "../../engine/sync/hash.mjs";
import { checkLanguageOption, mergeLanguageCapture } from "../../engine/build/languages.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { shown } from "./connect.mjs";
import { prompterOf } from "../common.mjs";

export const options = {
  plans: { type: "string" },
  preview: { type: "boolean" },
  "no-session": { type: "boolean" },
  yes: { type: "boolean", short: "y" },
  compare: { type: "boolean" },
  stale: { type: "boolean" },
  trace: { type: "boolean" },
};

/** Capture ids of `.doc-kit/sync-report.json` (ARCHITECTURE.md §6.10); missing report: capture.noSyncReport. */
export function staleIds(root) {
  const file = path.join(root, ".doc-kit", "sync-report.json");
  if (!fs.existsSync(file)) throw new KitError(EXIT.USAGE, "capture.noSyncReport", { file: shown(file) });
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Set((report.captures || []).map((c) => c.id));
}

/** The production banner, in the warning colour: "PRODUCTION — read-only · N screenshots · <url>". */
export function productionBanner(ctx, { n, url }) {
  return ctx.paint.warn(ctx.paint.bold(ctx.t("cli.capture.production", { n, url })));
}

/**
 * Confirms a production run: --yes, else a question in a terminal (default No); without a terminal or with --json,
 * exit code 2. @returns {Promise<boolean>} false when the person declines
 */
async function confirmProduction(ctx, values, n) {
  if (values.yes) return true;
  if (!ctx.interactive || ctx.json) throw new KitError(EXIT.USAGE, "capture.productionConfirm", { n });
  return prompterOf(ctx).confirm(ctx.t("cli.capture.ask.production", { n }), false);
}

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  // A documentation declared without screenshots: say so rather than look for plans or a session.
  if (config.capture.mode === "none") throw new KitError(EXIT.USAGE, "capture.modeNone", { file: "doc.config.mjs" });
  const root = project.root;
  // --lang (ARCHITECTURE.md §6.12): the source language captures normally; another declared language captures
  // into <images>/<lang>/, with capture.languages.<lang> merged over the defaults.
  const lang = config.languages && ctx.globals.lang ? checkLanguageOption({ languages: config.languages, lang: ctx.globals.lang, t: ctx.t }) : null;
  const otherLang = lang && lang !== config.languages[0] ? lang : null;
  const plans = values.plans || config.capture.plans;
  const folder = path.resolve(root, plans);
  const auth = await loadAuth(root, config);
  const { captures } = await loadPlans({ folder, display: plans.split(path.sep).join("/") });
  if (!captures.length) throw new KitError(EXIT.USAGE, "capture.noCaptures", { folder: plans });
  const compare = !!values.compare || !!values.stale;
  const pool = values.stale ? captures.filter((c) => staleIds(root).has(c.id)) : captures;
  if (values.stale && !pool.length && !positionals.length) {
    ctx.print(ctx.t("cli.capture.compare.none"));
    return EXIT.OK;
  }
  const selected = selectCaptures(pool, positionals);
  if (!selected.length) throw new KitError(EXIT.USAGE, "capture.noMatch", { patterns: positionals.join(" "), n: pool.length });
  for (const e of selected)
    if (!config.capture.viewports[e.context || "desktop"])
      throw new KitError(EXIT.USAGE, "capture.context", { id: e.id, context: e.context || "desktop", known: Object.keys(config.capture.viewports).join(", ") });

  // Routes that write on the server while rendering: never opened, whatever the method.
  const forbidden = forbiddenMatchers(config.capture.forbidden);
  const refusedEntries = selected.map((e) => ({ id: e.id, route: e.route, pattern: forbiddenMatch(e.route, forbidden) })).filter((x) => x.pattern);
  if (refusedEntries.length) {
    if (ctx.json) ctx.print(JSON.stringify({ forbidden: refusedEntries }, null, 2));
    else {
      for (const r of refusedEntries) ctx.printErr(`✖ ${ctx.t("cli.capture.forbidden", r)}`);
      ctx.printErr(`  → ${ctx.t("cli.capture.forbidden.help")}`);
    }
    return EXIT.CHECK;
  }

  const url = (config.app.url || "").replace(/\/+$/, "");
  if (!url) throw new KitError(EXIT.USAGE, "capture.noUrl");
  if (!/^https?:\/\//.test(url)) throw new KitError(EXIT.USAGE, "capture.badUrl", { url });

  const file = sessionFile(root, config, ctx.env);
  const useSession = !values["no-session"] && !auth.adapter.none;
  if (useSession && !fs.existsSync(file)) throw new KitError(EXIT.ENVIRONMENT, "capture.noSession", { file: shown(file) });
  const session = useSession ? file : null;
  const readOnly = readOnlyMode(config.capture, !!session);

  // Production: the banner, then a confirmation (or --yes) before anything opens.
  if (config.capture.target === "production") {
    if (!ctx.json) ctx.print(productionBanner(ctx, { n: selected.length, url }));
    if (!(await confirmProduction(ctx, values, selected.length))) {
      ctx.print(ctx.t("cli.capture.declined"));
      return EXIT.OK;
    }
  }

  // The only exception to the read-only lock (ARCHITECTURE.md §6.3a): the declared renewal of a short-lived session,
  // sent once, before any page opens. A failure is not fatal here: the session check that follows decides.
  const refresh = config.capture.sessionRefresh;
  if (session && refresh) {
    const r = await refreshSession({ file, appUrl: url, refresh });
    const vars = { method: refresh.method || "POST", path: refresh.path, status: r.status ?? r.error ?? "?" };
    if (r.ok) {
      if (!ctx.json) ctx.print(ctx.t("cli.capture.sessionRefreshed", vars));
    } else ctx.printErr(`⚠ ${ctx.t("cli.capture.sessionRefreshFailed", vars)}`);
  }

  const imagesDir = otherLang ? path.posix.join(config.paths.images, otherLang) : undefined;
  const captureOptions = otherLang ? mergeLanguageCapture(config.capture, otherLang) : undefined;
  const compareDir = otherLang ? path.join(root, ".doc-kit", "compare", otherLang) : undefined;

  if (!ctx.json) {
    if (otherLang) ctx.print(ctx.t("cli.capture.lang", { lang: otherLang, dir: imagesDir }));
    ctx.print(
      ctx.t("cli.capture.start", {
        n: selected.length,
        url,
        session: session ? shown(file) : ctx.t("cli.capture.withoutSession"),
        readOnly: ctx.t(readOnly ? "cli.capture.on" : "cli.capture.off"),
      })
    );
    if (session && !readOnly) ctx.printErr(`⚠ ${ctx.t("cli.capture.readOnlyDisabled")}`);
  }

  // The application's commit (only when app.dir is set and git answers), written to the zone files (ARCHITECTURE.md
  // §6.10), and the before/after labels of the comparison sheet, in the project's language.
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const commit = appDir ? ctx.commit(appDir) : null;
  const labels = { before: ctx.t("cli.capture.compare.before"), after: ctx.t("cli.capture.compare.after") };

  const r = await runCaptures({
    root,
    config,
    entries: selected,
    appUrl: url,
    auth,
    session,
    readOnly,
    forbidden,
    preview: !!values.preview,
    compare,
    compareThreshold: config.capture.compareThreshold,
    commit,
    planHash: hashPlanEntry,
    labels,
    ...(imagesDir ? { imagesDir } : {}),
    ...(captureOptions ? { capture: captureOptions } : {}),
    ...(compareDir ? { compareDir } : {}),
    ...(ctx.launch ? { launch: ctx.launch } : {}),
    ...(ctx.timer ? { timer: ctx.timer } : {}),
    // --trace: a failed capture leaves its Playwright trace (ETUDE-CAPTURES.md C3).
    ...(values.trace ? { trace: path.join(root, ".doc-kit", "traces") } : {}),
    onEvent: (e) => {
      if (ctx.json) return;
      if (e.type === "ok") {
        ctx.print(ctx.t("cli.capture.ok", { id: e.id, n: e.zones, kb: Math.round(e.bytes / 1024), seconds: (e.ms / 1000).toFixed(1) }));
        if (compare && e.compared) {
          const percent = (e.compared.ratio * 100).toFixed(2);
          ctx.print(`  ${ctx.t(e.compared.changed ? "cli.capture.compare.changed" : "cli.capture.compare.unchanged", { id: e.id, percent })}`);
        }
      } else {
        ctx.printErr(`✖ ${e.id}: ${ctx.t(`cli.capture.error.${e.key}`, e.vars)}`);
        if (e.trace) ctx.printErr(`  → ${ctx.t("cli.capture.trace", { file: shown(e.trace) })}`);
      }
    },
  });
  const blocked = summarizeRequests(r.blocked);
  const refused = summarizeRequests(r.refused);
  const prefetched = summarizeRequests(r.prefetched);
  if (ctx.json) {
    ctx.print(
      JSON.stringify({ ok: r.ok, failed: r.failed, readOnly, blocked: r.blocked.length, blockedRequests: blocked, refused, prefetched: r.prefetched.length, prefetchedRequests: prefetched, expired: r.expired, compared: r.compared }, null, 2)
    );
  } else {
    ctx.print(`\n${ctx.t("cli.capture.summary", { ok: r.ok.length, n: selected.length })}` + (r.failed.length ? ` ${ctx.t("cli.capture.failures", { ids: r.failed.map((f) => f.id).join(", ") })}` : ""));
    if (compare) {
      const changed = r.compared.filter((c) => c.changed).length;
      ctx.print(ctx.t("cli.capture.compare.summary", { unchanged: r.compared.length - changed, changed, failed: r.failed.length }));
    }
    if (values.preview && r.ok.some((x) => x.zones)) ctx.print(ctx.t("cli.capture.previews", { folder: shown(path.join(root, ".doc-kit")) }));
    if (refused.length) ctx.printErr(`✖ ${ctx.t("cli.capture.refused", { n: r.refused.length, list: refused.join(", ") })}`);
    if (prefetched.length) ctx.print(ctx.t("cli.capture.prefetched", { n: r.prefetched.length, list: prefetched.join(", ") }));
    if (r.expired) ctx.error(session ? "capture.expiredDuring" : "capture.signInRequired", { id: r.expired.id, url: r.expired.url });
    ctx.print(readOnly ? ctx.t("cli.capture.readOnly", { n: r.blocked.length, list: blocked.length ? ` — ${blocked.join(", ")}` : "" }) : ctx.t("cli.capture.readOnlyOff"));
  }
  if (r.expired) return EXIT.ENVIRONMENT;
  return r.failed.length ? EXIT.CHECK : EXIT.OK;
}
