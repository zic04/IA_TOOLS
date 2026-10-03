// record <route> [--id <id>] [--force]
// A capture plan entry written by doing, not by hand (ETUDE-CAPTURES.md D1): opens Playwright's recorder
// (codegen) on the application, signed in with the saved session; the person clicks, types and chooses; when the
// browser is closed, the recorded steps become captures/plans/<id>.mjs (engine/capture/record.mjs). The
// zones and the frame are then added by hand, checked with `capture <id> --preview`.
// The recorder is a normal browser, not the read-only capture: it is refused on production (capture.target), and
// the person decides what to click.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { loadAuth, sessionFile } from "../../engine/capture/session.mjs";
import { codegenToEntry, planModule } from "../../engine/capture/record.mjs";
import { forbiddenMatchers, forbiddenMatch } from "../../engine/capture/plans.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { shown } from "./connect.mjs";

export const options = {
  id: { type: "string" },
  force: { type: "boolean" },
};

/** Runs Playwright's codegen (no shell): writes the recorded JavaScript to `output`; returns the exit status. */
function runCodegen({ url, output, storage }) {
  const cli = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
  const args = [
    cli,
    "codegen",
    "--target",
    "javascript",
    "--output",
    output,
    ...(storage ? ["--load-storage", storage] : []),
    url,
  ];
  return spawnSync(process.execPath, args, { stdio: "inherit", windowsHide: false, shell: false }).status;
}

export async function run({ ctx, values, positionals }) {
  const route = positionals[0];
  if (!route || !route.startsWith("/")) throw new KitError(EXIT.USAGE, "record.route", { command: BRAND.command });
  const id =
    values.id ||
    route
      .replace(/[?#].*$/, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase() ||
    "home";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
    throw new KitError(EXIT.USAGE, "option.value", {
      option: "id",
      value: id,
      expected: "lower-case letters, digits and dashes",
    });
  const { project, config } = await ctx.loadProject();
  if (config.capture.mode === "none") throw new KitError(EXIT.USAGE, "capture.modeNone", { file: "doc.config.mjs" });
  if (config.capture.target === "production") throw new KitError(EXIT.USAGE, "record.production");
  const forbidden = forbiddenMatch(route, forbiddenMatchers(config.capture.forbidden));
  if (forbidden) throw new KitError(EXIT.USAGE, "record.forbidden", { route, pattern: forbidden });
  const url = (config.app.url || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new KitError(EXIT.USAGE, "capture.noUrl");
  const root = project.root;
  const file = path.join(root, config.capture.plans, `${id}.mjs`);
  if (fs.existsSync(file) && !values.force) throw new KitError(EXIT.CHECK, "record.exists", { file: shown(file) });

  const auth = await loadAuth(root, config);
  const session = sessionFile(root, config, ctx.env);
  const storage = !auth.adapter.none && fs.existsSync(session) ? session : null;
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-record-")), "recorded.js");
  try {
    if (!ctx.json) ctx.print(ctx.t("cli.record.open", { url: url + route }));
    (ctx.codegen || runCodegen)({ url: url + route, output, storage });
    const code = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (!code.trim()) throw new KitError(EXIT.CHECK, "record.nothing");
    const { entry, skipped } = codegenToEntry(code, { appUrl: url, id, route });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, planModule(entry, skipped));
    if (ctx.json) ctx.print(JSON.stringify({ file, entry, skipped }, null, 2));
    else {
      ctx.print(ctx.t("cli.record.written", { file: shown(file), n: (entry.actions || []).length }));
      if (skipped.length) ctx.print(ctx.t("cli.record.skipped", { n: skipped.length }));
      ctx.print(ctx.t("cli.record.next", { command: BRAND.command, id }));
    }
    return EXIT.OK;
  } finally {
    fs.rmSync(path.dirname(output), { recursive: true, force: true });
  }
}
