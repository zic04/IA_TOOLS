// dev [--port <n>]
// Builds the site in draft mode, serves it on http://127.0.0.1:<port>/, opens the browser, and rebuilds when
// content/, images/, diagrams/, theme/ or doc.config.mjs change: the page reloads by itself (SSE), and build
// errors show both in the terminal and in an overlay of the page. Ctrl+C stops cleanly.
// DOC_KIT_NO_OPEN=1: the browser is not opened (tests, remote machines).
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { startDevServer, portFree, watchedPaths } from "../../engine/dev/server.mjs";
import { loadProjectFriendly, reloadConfig, openBrowser } from "../../engine/dev/environment.mjs";
import { describeProblem } from "../common.mjs";

export const options = {
  port: { type: "string" },
};

export const DEFAULT_PORT = 4400;

/** First free port from `start` (at most `tries` attempts). */
async function findPort(start, tries = 20) {
  for (let p = start; p < start + tries; p++) if (await portFree(p)) return p;
  return 0;
}

export async function run({ ctx, values }) {
  let port = DEFAULT_PORT;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new KitError(EXIT.USAGE, "option.value", { option: "port", value: values.port, expected: "0..65535" });
    if (port && !(await portFree(port))) throw new KitError(EXIT.ENVIRONMENT, "dev.portBusy", { port });
  } else port = (await findPort(DEFAULT_PORT)) || 0;

  const { project, config } = await loadProjectFriendly(ctx);
  const p = ctx.paint;
  const time = () => new Date().toTimeString().slice(0, 8);
  const describeError = (e) => {
    if (e instanceof KitError) {
      const details = (e.details || []).map((d) => describeProblem(ctx, { kind: "validate", file: e.prefix, ...d }).what);
      return {
        what: [ctx.t(`cli.${e.key}`, e.vars), ...details].join("\n"),
        help: ctx.i18n.has(`cli.${e.key}.help`) ? ctx.t(`cli.${e.key}.help`, e.vars) : "",
      };
    }
    return { what: String(e?.message || e), help: "" };
  };
  const report = (event) => {
    if (ctx.json) return;
    const when = p.dim(`[${time()}]`);
    const changed = event.changed?.length ? `${event.changed.slice(0, 3).join(", ")}${event.changed.length > 3 ? " …" : ""} — ` : "";
    if (event.type === "error") {
      const d = describeError(event.error);
      ctx.printErr(`${when} ${changed}${p.fail("✖")} ${d.what}`);
      if (d.help) ctx.printErr(`  → ${d.help}`);
      return;
    }
    if (event.ok) {
      const s = event.stats;
      ctx.print(`${when} ${changed}${p.ok("✔")} ${ctx.t("cli.dev.built", { s: (event.ms / 1000).toFixed(1), pages: s.pages, captures: s.captures, n: event.warnings.length })}`);
      if (ctx.verbose) ctx.printProblems({ warnings: event.warnings });
    } else {
      ctx.printErr(`${when} ${changed}${p.fail("✖")} ${ctx.t("cli.dev.failed", { n: event.errors.length })}`);
      ctx.printProblems({ errors: event.errors });
      ctx.printErr(`  → ${ctx.t("cli.dev.failed.help")}`);
    }
  };

  const server = await startDevServer({
    root: project.root,
    port,
    loadConfig: () => reloadConfig(project.root, ctx.env),
    describe: (problem) => describeProblem(ctx, problem),
    describeError,
    texts: {
      language: config.language,
      title: ctx.t("cli.dev.overlay.title"),
      hint: ctx.t("cli.dev.overlay.hint"),
      close: ctx.t("cli.dev.overlay.close"),
      waiting: ctx.t("cli.dev.overlay.waiting"),
    },
    onEvent: report,
  });

  const watched = watchedPaths(config);
  if (ctx.json) ctx.print(JSON.stringify({ url: server.url, port: server.port, root: project.root, watched }));
  else {
    ctx.print(`\n  ${p.bold(ctx.t("cli.dev.serving"))} ${p.cmd(server.url)}  ${p.dim(ctx.t("cli.dev.stop"))}`);
    ctx.print(`  ${p.dim(ctx.t("cli.dev.watching", { list: [...watched.folders.map((f) => f + "/"), ...watched.files].join(", "), folder: path.basename(project.root) }))}\n`);
  }
  await openBrowser(server.url, ctx.env);

  // Until Ctrl+C (SIGINT), SIGTERM or the context's signal (tests).
  await new Promise((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (ctx.signal) {
      if (ctx.signal.aborted) stop();
      else ctx.signal.addEventListener("abort", stop, { once: true });
    }
    server.stopped = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    };
  });
  server.stopped();
  await server.close();
  if (!ctx.json) ctx.print(`\n${ctx.t("cli.dev.stopped")}`);
  return EXIT.OK;
}
