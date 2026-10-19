// backlog export <azure|jira|github|gitlab|json> [--output <file>] [--all] (global --lang <l>)
// The backlog of the documentation (ARCHITECTURE.md §6.8b) in a tool's import format (engine/backlog/): Azure DevOps,
// Jira and GitLab (CSV), GitHub (the issues as JSON, and how to create them), or JSON. Built in memory and strict: an
// error of the backlog (an epic declared twice, a story without an id, a feature id used twice…) refuses the export
// (exit code 1, nothing written); the other problems of the build do not. What the tool already holds (a reference of
// that tool) is left out, unless --all. Every text goes through the secret detectors of `check secrets`: a line where
// one fires is replaced by a notice and reported (exit code 1, the files are written). No network, no token: the
// person imports the files.
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { checkLanguageOption, languageOutput } from "../../engine/build/languages.mjs";
import { EXPORTERS, exportBacklog } from "../../engine/backlog/index.mjs";
import { detectors, ignoreRules, withoutSecrets } from "../../engine/check/secrets.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { projectFile } from "../common.mjs";

export const options = {
  output: { type: "string" },
  all: { type: "boolean" },
};

/** The names of the tools, in the messages. */
const TOOLS = { azure: "Azure DevOps", jira: "Jira", github: "GitHub", gitlab: "GitLab", json: "JSON" };

/** The problems of a build that are the backlog's: an error among them refuses the export. */
const BACKLOG_PROBLEMS = ["epic.", "feature.", "story.", "scenario.", "backlog."];
const isBacklogProblem = (p) => BACKLOG_PROBLEMS.some((prefix) => String(p.key).startsWith(prefix));

/**
 * The files' path without its extension: --output (its extension dropped), else beside the built site — the site of
 * --lang <l> when given (<name>-<l>.html: <name>-<l>-backlog-<target>).
 */
function basePath(root, config, { target, output, lang }) {
  if (output) {
    const file = path.resolve(process.cwd(), output);
    return file.slice(0, file.length - path.extname(file).length);
  }
  const site = path.resolve(root, lang ? languageOutput(config.output, lang) : config.output);
  const name = path.basename(site, path.extname(site));
  return path.join(path.dirname(site), `${name}-backlog${target === "json" ? "" : `-${target}`}`);
}

export async function run({ ctx, values, positionals }) {
  const [action, target, ...rest] = positionals;
  const targets = Object.keys(EXPORTERS).join(", ");
  if (action !== "export" || !target || rest.length) throw new KitError(EXIT.USAGE, "backlog.usage", { targets });
  if (!Object.hasOwn(EXPORTERS, target ?? "")) throw new KitError(EXIT.USAGE, "backlog.target", { target, targets });
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const lang =
    config.languages && ctx.globals.lang
      ? checkLanguageOption({ languages: config.languages, lang: ctx.globals.lang, t: ctx.t })
      : undefined;
  const language = lang ?? config.language;

  // The backlog of a strict build, in memory (the exports of the spaces are not needed).
  const r = build({
    project,
    config: { ...config, spaces: { ...config.spaces, export: false } },
    options: { draft: false, ...(lang ? { lang } : {}) },
  });
  // An outline that cannot be read renders nothing: all its errors are the backlog's.
  const problems = r.backlog ? r.errors.filter(isBacklogProblem) : r.errors;
  if (problems.length) {
    ctx.printProblems({ errors: problems });
    ctx.error("backlog.refused", { n: problems.length });
    return EXIT.CHECK;
  }
  if (!r.backlog?.features.length) throw new KitError(EXIT.CHECK, "backlog.empty");

  // Every text without its secrets: a line where a detector fires is a notice.
  const { t } = createI18n({ language, overrides: config.texts });
  const list = detectors(root, config.masking);
  const ignore = ignoreRules(config.masking);
  const removed = [];
  const notice = (kind) => {
    removed.push(kind);
    return t("render.backlog.removed", { kind });
  };
  const scrub = (text) => withoutSecrets(String(text ?? ""), list, notice, ignore).text;

  const base = basePath(root, config, { target, output: values.output, lang });
  const out = exportBacklog(r.backlog, {
    target,
    all: !!values.all,
    scrub,
    t,
    options: config.backlog ?? {},
    product: config.product.name,
    language,
    base: path.basename(base),
  });
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const files = out.files.map((f) => {
    const file = base + f.suffix;
    fs.writeFileSync(file, f.content);
    return { file: projectFile(root, file), items: f.items };
  });

  if (ctx.json)
    ctx.print(
      JSON.stringify(
        { target, files, skipped: out.skipped.map((x) => x.key), toLink: out.toLink, removed: removed.length },
        null,
        2,
      ),
    );
  else {
    const tool = TOOLS[target];
    for (const f of files)
      ctx.print(ctx.t(f.items ? "cli.backlog.written" : "cli.backlog.writtenGuide", { file: f.file, n: f.items }));
    if (out.skipped.length) ctx.print(ctx.t("cli.backlog.skipped", { n: out.skipped.length, tool }));
    if (out.toLink) ctx.print(ctx.t("cli.backlog.toLink", { n: out.toLink, tool }));
    if (removed.length)
      ctx.printErr(ctx.t("cli.backlog.secrets", { n: removed.length, kinds: [...new Set(removed)].join(", ") }));
  }
  return removed.length ? EXIT.CHECK : EXIT.OK;
}
