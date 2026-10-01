// capture [patterns…] [--plans <dir>] [--preview] [--no-session]
// Takes the screenshots of the capture plans (headless browser: no window) and writes images/<id>.webp and
// images/zones/<id>.json. Syntax of the plans: header of engine/capture/plans.mjs.
//   capture                      every capture of the plans
//   capture "use-orders-*"       the ids matching the patterns (* = any characters)
//   capture --plans captures/plans-prod     another plans folder (relative to the project; or <PREFIX>_PLANS)
//   capture --preview            also writes .doc-kit/<id>.zones.png, the zones drawn in red, to check them
//   capture --no-session         without the saved session (public pages)
// With a session (doc-kit connect), the session is checked first (exit code 3 when it has expired) and the run is
// read-only (capture.readOnly "auto"): every request other than GET/HEAD/OPTIONS is blocked in the browser and
// counted on the last line. Routes matching capture.forbidden are refused (exit code 1); during the run, a request
// that only prefetches one of them is aborted and counted, and a navigation to one stops that capture.
import fs from "node:fs";
import path from "node:path";
import { loadPlans, selectCaptures, forbiddenMatchers, forbiddenMatch } from "../../engine/capture/plans.mjs";
import { runCaptures, summarizeRequests } from "../../engine/capture/capture.mjs";
import { loadAuth, sessionFile } from "../../engine/capture/session.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { shown } from "./connect.mjs";

export const options = {
  plans: { type: "string" },
  preview: { type: "boolean" },
  "no-session": { type: "boolean" },
};

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const plans = values.plans || config.capture.plans;
  const folder = path.resolve(root, plans);
  const auth = await loadAuth(root, config);
  const { captures } = await loadPlans({ folder, display: plans.split(path.sep).join("/") });
  if (!captures.length) throw new KitError(EXIT.USAGE, "capture.noCaptures", { folder: plans });
  const selected = selectCaptures(captures, positionals);
  if (!selected.length) throw new KitError(EXIT.USAGE, "capture.noMatch", { patterns: positionals.join(" "), n: captures.length });
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
  const readOnly = config.capture.readOnly === "auto" ? !!session : config.capture.readOnly;

  if (!ctx.json) {
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
    onEvent: (e) => {
      if (ctx.json) return;
      if (e.type === "ok") ctx.print(ctx.t("cli.capture.ok", { id: e.id, n: e.zones, kb: Math.round(e.bytes / 1024), seconds: (e.ms / 1000).toFixed(1) }));
      else ctx.printErr(`✖ ${e.id}: ${ctx.t(`cli.capture.error.${e.key}`, e.vars)}`);
    },
  });
  const blocked = summarizeRequests(r.blocked);
  const refused = summarizeRequests(r.refused);
  const prefetched = summarizeRequests(r.prefetched);
  if (ctx.json) {
    ctx.print(
      JSON.stringify({ ok: r.ok, failed: r.failed, readOnly, blocked: r.blocked.length, blockedRequests: blocked, refused, prefetched: r.prefetched.length, prefetchedRequests: prefetched, expired: r.expired }, null, 2)
    );
  } else {
    ctx.print(`\n${ctx.t("cli.capture.summary", { ok: r.ok.length, n: selected.length })}` + (r.failed.length ? ` ${ctx.t("cli.capture.failures", { ids: r.failed.map((f) => f.id).join(", ") })}` : ""));
    if (values.preview && r.ok.some((x) => x.zones)) ctx.print(ctx.t("cli.capture.previews", { folder: shown(path.join(root, ".doc-kit")) }));
    if (refused.length) ctx.printErr(`✖ ${ctx.t("cli.capture.refused", { n: r.refused.length, list: refused.join(", ") })}`);
    if (prefetched.length) ctx.print(ctx.t("cli.capture.prefetched", { n: r.prefetched.length, list: prefetched.join(", ") }));
    if (r.expired) ctx.error(session ? "capture.expiredDuring" : "capture.signInRequired", { id: r.expired.id, url: r.expired.url });
    ctx.print(readOnly ? ctx.t("cli.capture.readOnly", { n: r.blocked.length, list: blocked.length ? ` — ${blocked.join(", ")}` : "" }) : ctx.t("cli.capture.readOnlyOff"));
  }
  if (r.expired) return EXIT.ENVIRONMENT;
  return r.failed.length ? EXIT.CHECK : EXIT.OK;
}
