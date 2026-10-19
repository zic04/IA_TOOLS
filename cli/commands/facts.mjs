// facts [--source <name>]... [--network] [--tools] [--json]
// Reads the application code (config.app.dir) and writes one file per source, facts/<source>.json (paths.facts,
// ARCHITECTURE.md §6.9), in the DOCUMENTATION project — never in the application. `--source` (repeatable) limits
// the sources; `--network` adds, for `dependencies`, whether each direct package exists in its registry, and for
// `quality`, direct dependencies behind their latest version (majors behind) — never for a private package (AUDIT.md
// S13: what is private is read once by privateRegistries — the application's own packages, its lock files, every
// folder down to each manifest, the user's own npm, yarn, bun, pip and uv configuration and variables);
// `--tools` also runs gitleaks, osv-scanner (offline; its database is downloaded only with --network), syft and knip
// when they are on the PATH (facts/tool-<name>.json, normalised), and semgrep when a local rules folder is configured
// (review.semgrep, ARCHITECTURE.md §6.13).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { factsFile, relPath } from "../../engine/facts/common.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { privateRegistries } from "../../engine/facts/network.mjs";
import { SOURCE_NAMES, collectSource } from "../../engine/facts/registry.mjs";
import { loadStacks } from "../../engine/facts/stacks.mjs";
import { loadInfra } from "../../engine/facts/infra.mjs";
import { runTool, runTools, TOOL_NAMES } from "../../engine/facts/tools.mjs";
import { generatorTag } from "../../engine/brand.mjs";

export const options = {
  source: { type: "string", multiple: true },
  network: { type: "boolean" },
  tools: { type: "boolean" },
};

/**
 * --tools: runs the external tools and writes one `tool-<name>.json` each; returns them keyed by tool.
 * File: { tool, generator, generated, commit, app, status: ok|findings|failed|missing, reason?, code?, truncated?,
 * items }.
 */
function writeTools({ ctx, project, config, appDir, factsDir, generated, commit, app, download }) {
  // semgrep (ARCHITECTURE.md §6.13) only with a local rules folder (review.semgrep); never --config auto.
  const semgrepDir = config.review?.semgrep ? path.resolve(project.root, config.review.semgrep) : null;
  const endTools = ctx.timer?.start("facts", { sub: "tools" });
  const results = runTools(appDir, ctx.exec, TOOL_NAMES, { download });
  endTools?.();
  if (semgrepDir) results.push(runTool("semgrep", appDir, ctx.exec, { semgrepConfig: semgrepDir }));
  const tools = {};
  for (const r of results) {
    const { tool, status, reason, code, truncated, items } = r;
    const file = { tool, generator: generatorTag(), generated, commit, app, status, reason, code, truncated, items };
    fs.writeFileSync(path.join(factsDir, `tool-${tool}.json`), JSON.stringify(file, null, 2) + "\n");
    tools[tool] = file;
    if (ctx.json) continue;
    // "ok" with items is an inventory (syft lists packages); "ok" for a finding tool means nothing found.
    const key = status === "ok" && items.length ? "listed" : status;
    const why = reason ? ctx.t(`cli.facts.tool.reason.${reason}`, { code: code ?? "" }) : "";
    ctx.print(ctx.t(`cli.facts.tool.${key}`, { tool, n: items.length, reason: why }));
    if (tool === "osv-scanner" && status === "failed" && reason !== "version" && !download)
      ctx.print(`  → ${ctx.t("cli.facts.tool.osvOffline")}`);
  }
  return tools;
}

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (!config.app.dir) throw new KitError(EXIT.USAGE, "facts.noApp");
  const appDir = path.resolve(project.root, config.app.dir);
  if (!fs.existsSync(appDir)) throw new KitError(EXIT.USAGE, "facts.noApp");

  // `sourcesExactly` (internal, from `doc-kit bricks run`, never a command-line option): exactly these sources,
  // possibly none (the external tools alone); otherwise no --source means every source.
  const requested = values.sourcesExactly ? values.source || [] : values.source?.length ? values.source : SOURCE_NAMES;
  for (const name of requested)
    if (!SOURCE_NAMES.includes(name))
      throw new KitError(EXIT.USAGE, "facts.unknownSource", { name, known: SOURCE_NAMES.join(", ") });

  const factsDir = path.join(project.root, config.paths.facts);
  fs.mkdirSync(factsDir, { recursive: true });
  const generated = new Date().toISOString();
  const commit = ctx.commit(appDir);
  const app = relPath(project.root, appDir);

  // What is private, read once before any request (AUDIT.md S13): never sent to a public registry.
  const network = values.network
    ? { registries: privateRegistries(appDir, { items: collectDependencies(appDir), env: ctx.env }) }
    : null;

  // The stack adapters of the run: the kit's but the disabled ones, then the project's own (config.stacks).
  const stacks = await loadStacks(project.root, config);
  const infra = await loadInfra(project.root, config);
  const written = {};
  for (const name of SOURCE_NAMES) {
    if (!requested.includes(name)) continue;
    const end = ctx.timer?.start("facts", { sub: name });
    const seams = { appDir, exec: ctx.exec, fetch: ctx.fetch, config, network, stacks, infra };
    let { items, extra, unreadable = [] } = await collectSource(name, seams).finally(() => end?.());
    // A file that is there but cannot be read: its facts are unknown, not empty (AUDIT.md M14).
    if (unreadable.length) extra = { ...extra, unreadable };
    const file = factsFile({ source: name, items, extra, generator: generatorTag(), generated, commit, app });
    fs.writeFileSync(path.join(factsDir, `${name}.json`), JSON.stringify(file, null, 2) + "\n");
    written[name] = file;
    if (ctx.json) continue;
    ctx.print(
      ctx.t("cli.facts.written", { source: name, n: items.length, file: `${config.paths.facts}/${name}.json` }),
    );
    for (const u of unreadable)
      ctx.print(ctx.t("cli.facts.unreadable", { file: u.file, reason: ctx.t(`cli.facts.unreadable.${u.reason}`) }));
  }

  const tools = values.tools
    ? writeTools({ ctx, project, config, appDir, factsDir, generated, commit, app, download: !!values.network })
    : undefined;

  if (ctx.json) ctx.print(JSON.stringify({ app, commit, sources: written, ...(tools ? { tools } : {}) }, null, 2));
  return EXIT.OK;
}
