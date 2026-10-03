// hooks install | uninstall | status [--app <dir>]
// Local updates without CI (AUDIT.md §5): git hooks in the application's repository that refresh the facts and
// the sync report after a `git pull` (post-merge) and a branch switch (post-checkout), in the background of the
// developer's own git, never blocking it (zero tokens, no capture, no network).
// The hooks folder comes from git itself (`git rev-parse --git-path hooks`: core.hooksPath and worktrees are
// honoured). A hook that already exists is kept: the kit only adds, or removes, its own block between markers.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { shownPath } from "../common.mjs";
import { WORK_DIR } from "./audit.mjs";

export const options = {
  app: { type: "string" },
};

export const HOOKS = Object.freeze(["post-merge", "post-checkout"]);
const BEGIN = "# >>> doc-kit (do not edit this block: doc-kit hooks uninstall removes it)";
const END = "# <<< doc-kit";

/** The block the kit adds to a hook: refresh facts and sync from the documentation project, quietly, never failing. */
export function hookBlock(hook, docRel) {
  // post-checkout: only a branch switch ($3 = 1), not a file checkout.
  const guard = hook === "post-checkout" ? '[ "$3" = "1" ] && ' : "";
  const dir = docRel.split(path.sep).join("/");
  return [
    BEGIN,
    `${guard}( cd "$(git rev-parse --show-toplevel)/${dir}" && npx --no-install ${BRAND.command} facts >/dev/null 2>&1 && npx --no-install ${BRAND.command} sync >/dev/null 2>&1 ) || true`,
    END,
  ].join("\n");
}

/** A hook's text with the kit's block added (or replaced), or removed (`block` null). */
export function withBlock(text, block) {
  const re = new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}\\n?`, "g");
  const base = (text || "").replace(re, "\n").replace(/\n{3,}/g, "\n\n");
  if (!block) return base.trim() === "#!/bin/sh" ? "" : base;
  const head = base.trim() ? base.replace(/\s*$/, "\n\n") : "#!/bin/sh\n\n";
  return `${head}${block}\n`;
}

export async function run({ ctx, values, positionals }) {
  const action = positionals[0];
  if (!["install", "uninstall", "status"].includes(action))
    throw new KitError(EXIT.USAGE, "hooks.action", { action: action ?? "", command: BRAND.command });
  const { project, config } = await ctx.loadProject();
  const appDir = path.resolve(project.root, values.app || config.app?.dir || ".");
  const r = ctx.exec("git", ["rev-parse", "--show-toplevel"], { cwd: appDir });
  if (!r || r.status !== 0) throw new KitError(EXIT.ENVIRONMENT, "hooks.noRepo", { folder: appDir });
  const top = r.stdout.trim();
  const h = ctx.exec("git", ["rev-parse", "--git-path", "hooks"], { cwd: top });
  if (!h || h.status !== 0) throw new KitError(EXIT.ENVIRONMENT, "hooks.noRepo", { folder: top });
  const hooksDir = path.resolve(top, h.stdout.trim());
  const docRel = path.relative(top, project.root) || ".";
  if (docRel.startsWith("..")) throw new KitError(EXIT.USAGE, "hooks.outside", { folder: project.root, repo: top });
  // The path is written into a shell script: only plain characters, never a quote, $ or backtick.
  if (!/^[\w./ -]+$/.test(docRel.split(path.sep).join("/")))
    throw new KitError(EXIT.USAGE, "hooks.unsafePath", { folder: docRel });

  const report = [];
  for (const hook of HOOKS) {
    const file = path.join(hooksDir, hook);
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const installed = text.includes(BEGIN);
    if (action === "status") {
      report.push({ hook, installed });
      continue;
    }
    const next = withBlock(text, action === "install" ? hookBlock(hook, docRel) : null);
    if (!next) {
      if (fs.existsSync(file)) fs.rmSync(file);
    } else {
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(file, next);
      fs.chmodSync(file, 0o755);
    }
    report.push({ hook, installed: action === "install" });
  }
  if (ctx.json) {
    ctx.print(JSON.stringify({ hooks: shownPath(hooksDir), report }, null, 2));
    return EXIT.OK;
  }
  for (const x of report)
    ctx.print(
      `${x.installed ? ctx.paint.ok("✔") : ctx.paint.dim("·")} ${ctx.t(x.installed ? "cli.hooks.on" : "cli.hooks.off", { hook: x.hook, folder: shownPath(hooksDir) })}`,
    );
  if (action === "install")
    ctx.print(ctx.paint.dim(ctx.t("cli.hooks.what", { command: BRAND.command, work: WORK_DIR })));
  return EXIT.OK;
}
