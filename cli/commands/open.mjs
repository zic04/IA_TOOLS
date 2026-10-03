// open [page[~anchor]] [--space <id>] — opens the built site in the default browser of the machine; --space: the
// export of that space (ARCHITECTURE.md §6.1a).
// DOC_KIT_NO_OPEN=1: only prints the address (tests, CI).
// The output is reused only when it is at least as recent as every source (content, translations, images,
// diagrams, facts, doc.config.mjs): a stale dist/*.html is rebuilt as a temporary draft instead of being opened
// as is (builtSite, cli/common.mjs); never built at all is still `site.missing` (requireExisting).
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { declaredSpaceIds, checkSpaceOption } from "../../engine/build/spaces.mjs";
import { checkLanguageOption } from "../../engine/build/languages.mjs";
import { builtSite } from "../common.mjs";

export const options = {
  space: { type: "string" },
};

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  const space = values.space === undefined ? undefined : checkSpaceOption({ ids: declaredSpaceIds(project.root, config), space: values.space, t: ctx.t });
  const site = await builtSite(ctx, { space, requireExisting: true });
  // --lang (ARCHITECTURE.md §6.12): the built site is already multilingual; only the opened URL changes.
  const lang = config.languages && ctx.globals.lang ? checkLanguageOption({ languages: config.languages, lang: ctx.globals.lang, t: ctx.t }) : null;
  const page = (lang ? `${lang}/` : "") + (positionals[0] || "").replace(/^\/+/, "");
  const url = pathToFileURL(site.file).href + (page ? "#/" + page : "");
  if (ctx.json) ctx.print(JSON.stringify({ url }));
  else ctx.print(ctx.t("cli.open.opening", { url }));
  if (ctx.env.DOC_KIT_NO_OPEN) {
    site.release(); // nothing will read the temporary draft, if any: clean it up right away
    return 0;
  }
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  // A temporary draft (stale or newly built): give the external viewer time to read it before cleanup; the
  // persisted output's release() is a no-op.
  setTimeout(() => site.release(), 10000).unref();
  return 0;
}
