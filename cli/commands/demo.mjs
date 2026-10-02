// demo — prepares the demo data before a capture run: runs the project's capture.setup script (idempotent).
// The script runs in its own Node process, from the project folder. When it exports a default function, the
// function is called with { config, root, url } (config: the validated configuration, as JSON); otherwise the
// module simply runs. The variables DOC_KIT_PROJECT, DOC_KIT_URL and DOC_KIT_CONFIG (JSON) are set too.
// Exit code: 0 when the script succeeds, 1 otherwise. Refused (exit code 2) with capture.target "production": a demo
// data script never runs against production.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { KitError, EXIT } from "../../engine/project/errors.mjs";

export const options = {};

const RUNNER = `
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
if (typeof m.default === "function")
  await m.default({ config: JSON.parse(process.env.DOC_KIT_CONFIG), root: process.env.DOC_KIT_PROJECT, url: process.env.DOC_KIT_URL || null });
`;

/** Configuration as JSON (functions and regular expressions dropped). */
const jsonConfig = (config) => JSON.stringify(config, (k, v) => (typeof v === "function" ? undefined : v instanceof RegExp ? String(v) : v));

/**
 * Runs the setup script; its output lines are passed to `line`.
 * @returns {Promise<number>} the script's exit code
 */
export function runSetup({ root, config, script, env = process.env, line = () => {} }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", RUNNER, script], {
      cwd: root,
      env: { ...env, DOC_KIT_PROJECT: root, DOC_KIT_URL: config.app.url || "", DOC_KIT_CONFIG: jsonConfig(config) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const forward = (stream, err) => {
      let rest = "";
      stream.setEncoding("utf8");
      stream.on("data", (d) => {
        const lines = (rest + d).split(/\r?\n/);
        rest = lines.pop();
        for (const l of lines) line(l, err);
      });
      stream.on("end", () => rest && line(rest, err));
    };
    forward(child.stdout, false);
    forward(child.stderr, true);
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function run({ ctx }) {
  const { project, config } = await ctx.loadProject();
  if (config.capture.target === "production") throw new KitError(EXIT.USAGE, "demo.production", { file: "doc.config.mjs", url: config.app.url || "—" });
  if (!config.capture.setup) throw new KitError(EXIT.USAGE, "demo.noSetup");
  const script = path.resolve(project.root, config.capture.setup);
  if (!fs.existsSync(script)) throw new KitError(EXIT.USAGE, "demo.missing", { file: config.capture.setup });
  if (!ctx.json) ctx.print(ctx.t("cli.demo.running", { file: config.capture.setup }));
  const code = await runSetup({
    root: project.root,
    config,
    script,
    env: { ...process.env, ...ctx.env },
    line: (l, err) => !ctx.json && (err ? ctx.printErr(`  ${l}`) : ctx.print(`  ${l}`)),
  });
  if (ctx.json) {
    ctx.print(JSON.stringify({ ok: code === 0, code }));
    return code === 0 ? EXIT.OK : EXIT.CHECK;
  }
  if (code !== 0) {
    ctx.error("demo.failed", { file: config.capture.setup, code });
    return EXIT.CHECK;
  }
  ctx.print(ctx.t("cli.demo.ok", { file: config.capture.setup }));
  return EXIT.OK;
}
