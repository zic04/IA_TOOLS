// pack [--output <dir>]
// The files the next AI working on the application needs (AUDIT.md §4), written in the documentation project
// (default: the folder of the built site), never in the application: llms.txt, llms-full.txt, AGENTS.md and
// CLAUDE.md (engine/pack/pack.mjs). Read-only on the application: its facts files, and the `scripts` of the
// package.json files of its containers (read, never run). Every file goes through the secret detectors of
// `check secrets`; a line where one fires is replaced by a notice and reported (exit code 1, the files are written).
import fs from "node:fs";
import path from "node:path";
import { readToc } from "../../engine/project/toc.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { systemModel } from "../../engine/build/c4.mjs";
import { detectors, ignoreRules } from "../../engine/check/secrets.mjs";
import { readingOrder, llmsIndex, llmsFull, agentsFile, withoutSecrets } from "../../engine/pack/pack.mjs";

export const options = {
  output: { type: "string" },
};

/** Facts files read by AGENTS.md; a missing or broken one is null. */
const SOURCES = [
  "dependencies",
  "env",
  "api",
  "db",
  "agents",
  "tests",
  "quality",
  "security",
  "secrets",
  "modules",
  "history",
];

function readFacts(root, folder) {
  return Object.fromEntries(
    SOURCES.map((source) => {
      const f = path.join(root, folder, `${source}.json`);
      try {
        return [source, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null];
      } catch {
        return [source, null];
      }
    }),
  );
}

/** The `scripts` of the application's root package.json and of each container's (read only). */
function appScripts(appDir, facts) {
  if (!appDir) return [];
  const folders = new Set([".", ...systemModel(facts).containers.map((c) => c.path)]);
  const out = [];
  for (const folder of [...folders].sort()) {
    const f = path.join(appDir, folder, "package.json");
    try {
      const scripts = JSON.parse(fs.readFileSync(f, "utf8")).scripts;
      if (scripts && typeof scripts === "object" && Object.keys(scripts).length)
        out.push({
          folder,
          entries: Object.fromEntries(Object.entries(scripts).filter(([, v]) => typeof v === "string")),
        });
    } catch {
      // no package.json there, or not valid JSON: no scripts to list
    }
  }
  return out;
}

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const { toc } = readToc(root, config.paths.content);
  if (!toc) throw new KitError(EXIT.USAGE, "pack.noToc", { file: `${config.paths.content}/toc.json` });
  const outDir = path.resolve(root, values.output || path.dirname(config.output));
  const content = path.join(root, config.paths.content);
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(content, rel), "utf8");
    } catch {
      return null;
    }
  };
  const pages = readingOrder(toc, (rel) => fs.existsSync(path.join(content, rel)));
  const facts = readFacts(root, config.paths.facts);
  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const commit = facts.dependencies?.commit ?? (appDir && fs.existsSync(appDir) ? ctx.commit(appDir) : null);
  const files = {
    "llms.txt": llmsIndex({ toc, pages, site: path.basename(config.output) }),
    "llms-full.txt": llmsFull({ toc, pages, read }),
    "AGENTS.md": agentsFile({
      product: config.product.name,
      facts,
      scripts: appScripts(appDir, facts),
      commit,
      generated: new Date().toISOString(),
      docs: "llms-full.txt",
      t: ctx.t,
    }),
    "CLAUDE.md": `@AGENTS.md\n`,
  };
  const list = detectors(root, config.masking);
  const ignore = ignoreRules(config.masking);
  const notice = (kind) => ctx.t("cli.pack.removed", { kind });
  fs.mkdirSync(outDir, { recursive: true });
  const report = [];
  for (const [name, text] of Object.entries(files)) {
    const clean = withoutSecrets(text, list, notice, ignore);
    fs.writeFileSync(path.join(outDir, name), clean.text);
    report.push({
      file: path.relative(root, path.join(outDir, name)).split(path.sep).join("/"),
      bytes: Buffer.byteLength(clean.text),
      removed: clean.removed,
    });
  }
  const removed = report.reduce((n, r) => n + r.removed.length, 0);
  if (ctx.json) ctx.print(JSON.stringify({ files: report }, null, 2));
  else {
    for (const r of report)
      ctx.print(ctx.t("cli.pack.written", { file: r.file, size: Math.max(1, Math.round(r.bytes / 1024)) }));
    for (const r of report)
      for (const x of r.removed) ctx.print(ctx.t("cli.pack.secret", { file: r.file, line: x.line, kind: x.kind }));
  }
  return removed ? EXIT.CHECK : EXIT.OK;
}
