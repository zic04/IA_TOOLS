// changes [--since <git ref>] [--output <file>] [--record] [--json]
// What changed in the application since a reference (AUDIT.md §5): the facts files (doc-kit facts) as committed at
// <ref> (default HEAD) against the ones on disk now — routes, tables, environment variables, dependencies, security
// findings, secrets, import cycles, tests. Writes .doc-kit/changes.md (ready for a pull request comment or the
// release notes) and .doc-kit/changes.json; prints the Markdown. Read-only git, in the documentation project.
// --record also keeps them in changes/<documented version>.json (committed), which ::changes renders in the site.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { createGit } from "../../engine/sync/git.mjs";
import { isSafeRef } from "../../engine/util/safe-git.mjs";
import { diffFacts, changesMarkdown, recordChanges, DIFFS } from "../../engine/facts/changes.mjs";
import { readProjectVersion } from "../../engine/project/version.mjs";
import { WORK_DIR } from "./audit.mjs";

export const options = {
  since: { type: "string" },
  output: { type: "string" },
  record: { type: "boolean" },
};

const SOURCES = [...Object.keys(DIFFS), "tests", "modules"];

export async function run({ ctx, values }) {
  const since = values.since ?? "HEAD";
  if (!isSafeRef(since)) throw new KitError(EXIT.USAGE, "option.invalid", { error: `--since ${since}` });
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const git = createGit(ctx.exec, root);
  if (!git.available()) throw new KitError(EXIT.ENVIRONMENT, "changes.noGit", { folder: root });
  const factsRel = path.relative(root, path.resolve(root, config.paths.facts)).split(path.sep).join("/") || ".";
  const parse = (text) => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  };
  const before = {};
  const after = {};
  for (const source of SOURCES) {
    before[source] = parse(git.show(since, `${factsRel}/${source}.json`));
    const file = path.join(root, config.paths.facts, `${source}.json`);
    after[source] = fs.existsSync(file) ? parse(fs.readFileSync(file, "utf8")) : null;
  }
  const changes = diffFacts(before, after);
  const until = readProjectVersion(root, config.version);
  const markdown = changesMarkdown(changes, { t: ctx.t, since, until });
  const work = path.join(root, WORK_DIR);
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, "changes.json"), JSON.stringify({ since, until, ...changes }, null, 2) + "\n");
  const output = values.output ? path.resolve(process.cwd(), values.output) : path.join(work, "changes.md");
  fs.writeFileSync(output, markdown + "\n");
  if (values.record) {
    const file = recordChanges(root, { since, until, date: new Date().toISOString(), ...changes });
    if (!ctx.json)
      ctx.printErr(ctx.t("cli.changes.recorded", { file: path.relative(root, file).split(path.sep).join("/") }));
  }
  if (ctx.json) ctx.print(JSON.stringify({ since, until, ...changes }, null, 2));
  else ctx.print(markdown);
  return EXIT.OK;
}
