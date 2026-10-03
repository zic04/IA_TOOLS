// facts [--source <name>]... [--network] [--tools] [--json]
// Reads the application code (config.app.dir) and writes one file per source, facts/<source>.json (paths.facts,
// ARCHITECTURE.md §6.9), in the DOCUMENTATION project — never in the application. `--source` (repeatable) limits
// the sources; `--network` adds, for `dependencies`, whether each direct package exists in its registry, and for
// `quality`, direct dependencies behind their latest version (majors behind); `--tools` also runs gitleaks,
// osv-scanner, syft and knip when they are on the PATH (facts/tool-<name>.json), and semgrep when a local rules
// folder is configured (review.semgrep, ARCHITECTURE.md §6.13).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { factsFile, relPath } from "../../engine/facts/common.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { collectEnv } from "../../engine/facts/env.mjs";
import { collectApi } from "../../engine/facts/api.mjs";
import { collectDb } from "../../engine/facts/db.mjs";
import { collectAgents } from "../../engine/facts/agents.mjs";
import { collectSecrets } from "../../engine/facts/secrets.mjs";
import { collectSecurity } from "../../engine/facts/security.mjs";
import { collectQuality } from "../../engine/facts/quality.mjs";
import { collectTests } from "../../engine/facts/tests.mjs";
import { checkExistence } from "../../engine/facts/network.mjs";
import { runTool, runTools, TOOL_NAMES } from "../../engine/facts/tools.mjs";
import { generatorTag } from "../../engine/brand.mjs";

export const options = {
  source: { type: "string", multiple: true },
  network: { type: "boolean" },
  tools: { type: "boolean" },
};

/** Sources of `doc-kit facts`, in the order they are written (ARCHITECTURE.md §6.9, §6.13). */
export const SOURCES = Object.freeze(["dependencies", "env", "api", "db", "agents", "secrets", "security", "quality", "tests"]);

/** Collects one source; `tests` and `quality` return an extra `summary`. */
async function collect(name, appDir, ctx, config, network) {
  switch (name) {
    case "dependencies":
      return { items: collectDependencies(appDir) };
    case "env":
      return { items: collectEnv(appDir) };
    case "api":
      return { items: collectApi(appDir, config.review?.guards) };
    case "db":
      return { items: collectDb(appDir) };
    case "agents":
      return { items: collectAgents(appDir) };
    case "secrets":
      return { items: collectSecrets(appDir, ctx.exec) };
    case "security":
      return { items: collectSecurity(appDir, ctx.exec) };
    case "quality": {
      const dependencies = collectDependencies(appDir);
      const { items, summary } = await collectQuality(appDir, { fetch: network ? ctx.fetch : undefined, dependencies });
      return { items, extra: { summary } };
    }
    case "tests": {
      const { items, summary } = collectTests(appDir);
      return { items, extra: { summary } };
    }
    default:
      return { items: [] };
  }
}

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (!config.app.dir) throw new KitError(EXIT.USAGE, "facts.noApp");
  const appDir = path.resolve(project.root, config.app.dir);
  if (!fs.existsSync(appDir)) throw new KitError(EXIT.USAGE, "facts.noApp");

  const requested = values.source?.length ? values.source : SOURCES;
  for (const name of requested) if (!SOURCES.includes(name)) throw new KitError(EXIT.USAGE, "facts.unknownSource", { name, known: SOURCES.join(", ") });

  const factsDir = path.join(project.root, config.paths.facts);
  fs.mkdirSync(factsDir, { recursive: true });
  const generated = new Date().toISOString();
  const commit = ctx.commit(appDir);
  const app = relPath(project.root, appDir);

  const written = {};
  for (const name of SOURCES) {
    if (!requested.includes(name)) continue;
    const end = ctx.timer?.start("facts", { sub: name });
    let { items, extra } = await collect(name, appDir, ctx, config, values.network).finally(() => end?.());
    if (name === "dependencies" && values.network) items = await checkExistence(items, ctx.fetch);
    const file = factsFile({ source: name, items, extra, generator: generatorTag(), generated, commit, app });
    fs.writeFileSync(path.join(factsDir, `${name}.json`), JSON.stringify(file, null, 2) + "\n");
    written[name] = file;
    if (!ctx.json) ctx.print(ctx.t("cli.facts.written", { source: name, n: items.length, file: `${config.paths.facts}/${name}.json` }));
  }

  let tools;
  if (values.tools) {
    // semgrep (ARCHITECTURE.md §6.13) only with a local rules folder (review.semgrep); never --config auto.
    const semgrepDir = config.review?.semgrep ? path.resolve(project.root, config.review.semgrep) : null;
    const endTools = ctx.timer?.start("facts", { sub: "tools" });
    const results = runTools(appDir, ctx.exec, TOOL_NAMES);
    endTools?.();
    if (semgrepDir) results.push(runTool("semgrep", appDir, ctx.exec, { semgrepConfig: semgrepDir }));
    tools = {};
    for (const r of results) {
      const file = { tool: r.tool, generator: generatorTag(), generated, installed: r.installed, ...(r.installed ? { ok: r.ok, data: r.data } : {}) };
      fs.writeFileSync(path.join(factsDir, `tool-${r.tool}.json`), JSON.stringify(file, null, 2) + "\n");
      tools[r.tool] = file;
      if (!ctx.json) ctx.print(ctx.t(r.installed ? "cli.facts.tool.ran" : "cli.facts.tool.missing", { tool: r.tool }));
    }
  }

  if (ctx.json) ctx.print(JSON.stringify({ app, commit, sources: written, ...(tools ? { tools } : {}) }, null, 2));
  return EXIT.OK;
}
