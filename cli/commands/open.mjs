// open [page[~anchor]] — opens the built site in the default browser of the machine.
// DOC_KIT_NO_OPEN=1: only prints the address (tests, CI).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { KitError, EXIT } from "../../engine/project/errors.mjs";

export const options = {};

export async function run({ ctx, positionals }) {
  const { project, config } = await ctx.loadProject();
  const file = path.resolve(project.root, config.output);
  if (!fs.existsSync(file)) throw new KitError(EXIT.CHECK, "site.missing", { file: path.relative(process.cwd(), file) });
  const page = (positionals[0] || "").replace(/^\/+/, "");
  const url = pathToFileURL(file).href + (page ? "#/" + page : "");
  if (ctx.json) ctx.print(JSON.stringify({ url }));
  else ctx.print(ctx.t("cli.open.opening", { url }));
  if (ctx.env.DOC_KIT_NO_OPEN) return 0;
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  return 0;
}
