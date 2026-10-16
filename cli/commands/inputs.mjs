// inputs [status] · inputs add <code|app|document|workspace|backlog> <value> [options] · inputs fetch [<name>…] ·
// inputs ingest [<file>…]
// The sources of the documentation project (ARCHITECTURE.md §6.19, inputs.json): what the kit reads to document
// the application, besides the code of app.dir. `status` (the default) lists them and their state; `add` declares
// one; `fetch` clones or updates the shared repositories into .doc-kit/inputs/repos/ with the user's own git
// credentials; `ingest` converts the documents (Word, PDF, Markdown, text, HTML, diagrams) into text for the
// documentation agents, in .doc-kit/inputs/docs/, without a secret. A page of Confluence or SharePoint is read by
// the skill through the session's connectors, never by the kit. Exit code 0; 1 when a source could not be fetched
// or read; 2 for an invalid inputs.json or a usage error.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { readInputs, writeInputs, addInput, INPUTS_FILE } from "../../engine/inputs/model.mjs";
import { fetchRepos } from "../../engine/inputs/repos.mjs";
import { ingestDocuments } from "../../engine/inputs/ingest.mjs";
import { inputsStatus } from "../../engine/inputs/status.mjs";
import { generatorTag } from "../../engine/brand.mjs";

export const options = {
  name: { type: "string" },
  role: { type: "string" },
  branch: { type: "string" },
  depth: { type: "string" },
  env: { type: "string" },
  "read-only": { type: "boolean" },
  kind: { type: "string" },
  tool: { type: "string" },
  title: { type: "string" },
};

const KINDS = ["code", "app", "document", "workspace", "backlog"];
const MARKS = { present: "✔", fetched: "✔", fresh: "✔", stale: "⚠", notFetched: "✖", notIngested: "✖", missing: "✖" };

/** One problem of a source (not thrown: the other sources go on), with what to do. */
function printProblem(ctx, error) {
  const vars = error.vars.reason ? { ...error.vars, why: ctx.t(`cli.inputs.reason.${error.vars.reason}`) } : error.vars;
  ctx.printErr(`✖ ${ctx.t(`cli.${error.key}`, vars)}`);
  if (ctx.i18n.has(`cli.${error.key}.help`)) ctx.printErr(`  → ${ctx.t(`cli.${error.key}.help`, vars)}`);
}

function add(ctx, root, inputs, kind, value, values) {
  if (!kind || !value) throw new KitError(EXIT.USAGE, "inputs.addUsage");
  if (!KINDS.includes(kind)) throw new KitError(EXIT.USAGE, "inputs.unknownKind", { kind, kinds: KINDS.join(", ") });
  const depth = values.depth === undefined ? undefined : Number(values.depth);
  if (depth !== undefined && !(Number.isInteger(depth) && depth > 0))
    throw new KitError(EXIT.USAGE, "option.value", { option: "depth", value: values.depth, expected: "1, 2, 3…" });
  const next = addInput(inputs, kind, { value, ...values, readOnly: values["read-only"], depth });
  writeInputs(root, next);
  if (ctx.json) return (ctx.print(JSON.stringify(next, null, 2)), EXIT.OK);
  ctx.print(`${ctx.paint.ok("✔")} ${ctx.t("cli.inputs.added", { file: INPUTS_FILE, kind, value })}`);
  const last = kind === "code" ? next.code.at(-1) : null;
  if (last?.repo) ctx.print(`→ ${ctx.t("cli.inputs.next.fetch", { name: last.name })}`);
  if (kind === "document" && !/^https?:\/\//i.test(value)) ctx.print(`→ ${ctx.t("cli.inputs.next.ingest")}`);
  return EXIT.OK;
}

function fetch(ctx, root, inputs, names) {
  const results = fetchRepos({ root, inputs, names, exec: ctx.exec, commit: ctx.commit, env: ctx.env });
  if (ctx.json) ctx.print(JSON.stringify({ repos: results }, null, 2));
  else if (!results.length) ctx.print(ctx.t("cli.inputs.fetch.none"));
  for (const r of results) {
    if (r.error) {
      if (!ctx.json) printProblem(ctx, r.error);
      continue;
    }
    if (ctx.json) continue;
    const action = ctx.t(`cli.inputs.fetch.${r.action}`);
    ctx.print(
      `${ctx.paint.ok("✔")} ${ctx.t("cli.inputs.fetch.done", { name: r.name, action, folder: r.folder, commit: (r.commit || "?").slice(0, 7) })}`,
    );
    const entry = inputs.code.find((c) => c.name === r.name);
    if (entry.role === "app" || entry.role === undefined)
      ctx.print(`→ ${ctx.t("cli.inputs.next.appDir", { folder: r.folder })}`);
  }
  return results.some((r) => r.error) ? EXIT.CHECK : EXIT.OK;
}

function ingest(ctx, root, inputs, config, files) {
  const results = ingestDocuments({
    root,
    inputs,
    config,
    files,
    t: ctx.t,
    generator: generatorTag(),
    now: new Date(),
  });
  if (ctx.json) ctx.print(JSON.stringify({ documents: results }, null, 2));
  else if (!results.length) ctx.print(ctx.t("cli.inputs.ingest.none"));
  for (const r of results) {
    if (ctx.json) continue;
    if (r.error) printProblem(ctx, r.error);
    else if (r.state === "external")
      ctx.print(`· ${ctx.t("cli.inputs.ingest.external", { file: r.source, page: r.page })}`);
    else
      ctx.print(
        `${ctx.paint.ok("✔")} ${ctx.t("cli.inputs.ingest.done", { file: r.source, output: r.output })}${r.removed ? ctx.paint.warn(` ${ctx.t("cli.inputs.ingest.removed", { n: r.removed })}`) : ""}`,
      );
  }
  return results.some((r) => r.state === "refused" || r.state === "missing") ? EXIT.CHECK : EXIT.OK;
}

/** The `stack` facts of the project (facts/stack.json, ARCHITECTURE.md §6.9), or null: not collected, unreadable. */
function stackFacts(root, config) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, config.paths.facts, "stack.json"), "utf8"));
    return Array.isArray(data?.items) ? data : null;
  } catch {
    return null;
  }
}

/** What the kit reads of the code of app.dir: the part of its lines, each language, the stacks and platforms found. */
function printReading(ctx, config, stack) {
  const file = `${config.paths.facts}/stack.json`;
  ctx.print(`\n${ctx.t("cli.inputs.section.reading", { file })}`);
  if (!stack) return ctx.print(`  → ${ctx.t("cli.inputs.next.stack")}`);
  const { summary = {}, stacks = [] } = stack;
  if (summary.lines)
    ctx.print(`  ${ctx.t("cli.inputs.reading.share", { share: summary.share, lines: summary.lines })}`);
  for (const i of stack.items)
    ctx.print(
      i.read
        ? `  ${ctx.paint.ok("✔")} ${ctx.t("cli.inputs.reading.read", { language: i.language, lines: i.lines, by: i.by.join(", ") })}`
        : `  ${ctx.paint.warn("⚠")} ${ctx.t("cli.inputs.reading.unread", { language: i.language, lines: i.lines })}`,
    );
  const found = stacks.filter((x) => x.family === "stack");
  if (found.length)
    ctx.print(
      `  ${ctx.t("cli.inputs.reading.stacks", { list: found.map((x) => `${x.title} (${x.evidence[0]})`).join(" · ") })}`,
    );
  for (const x of stacks.filter((y) => y.family === "lowcode"))
    ctx.print(
      `  ${ctx.paint.warn("⚠")} ${ctx.t("cli.inputs.reading.lowcode", { title: x.title, evidence: x.evidence[0] })}`,
    );
}

function status(ctx, root, inputs, exists, config) {
  const s = inputsStatus({ root, inputs, commit: ctx.commit });
  const stack = stackFacts(root, config);
  if (ctx.json) {
    const reading = stack ? { items: stack.items, stacks: stack.stacks ?? [], summary: stack.summary ?? null } : null;
    return (ctx.print(JSON.stringify({ ...s, reading }, null, 2)), EXIT.OK);
  }
  const total = s.code.length + s.app.length + s.documents.length + s.workspaces.length + (s.backlog ? 1 : 0);
  if (!exists || !total) {
    ctx.print(ctx.t("cli.inputs.empty", { file: INPUTS_FILE }));
    printReading(ctx, config, stack);
    return EXIT.OK;
  }
  ctx.print(ctx.paint.bold(ctx.t("cli.inputs.title", { file: INPUTS_FILE })));
  const line = (state, text) => {
    const paint = { "✔": ctx.paint.ok, "⚠": ctx.paint.warn, "✖": ctx.paint.fail }[MARKS[state]] || ctx.paint.dim;
    ctx.print(`  ${paint(MARKS[state] || "·")} ${text} — ${ctx.t(`cli.inputs.state.${state}`)}`);
  };
  const section = (key, list, show) => {
    if (!list.length) return;
    ctx.print(`\n${ctx.t(`cli.inputs.section.${key}`)}`);
    for (const x of list) show(x);
  };
  section("code", s.code, (c) =>
    line(
      c.state,
      `${c.name} (${ctx.t(`cli.inputs.role.${c.role || "app"}`)}) ${c.repo ?? c.path}${c.commit ? ` @ ${c.commit.slice(0, 7)}` : ""}`,
    ),
  );
  section("app", s.app, (a) =>
    ctx.print(`  · ${a.env}: ${a.url}${a.readOnly ? ` (${ctx.t("cli.inputs.readOnly")})` : ""}`),
  );
  section("documents", s.documents, (d) =>
    line(
      d.state,
      `${d.title || d.file || d.url} (${ctx.t(`cli.inputs.kind.${d.kind || "other"}`)})${d.output ? ` → ${d.output}` : d.page ? ` → ${d.page}` : ""}`,
    ),
  );
  section("workspaces", s.workspaces, (w) => ctx.print(`  · ${w.tool}: ${w.url}`));
  if (s.backlog) section("backlog", [s.backlog], (b) => ctx.print(`  · ${b.tool}: ${b.url}`));
  const todo = [
    s.code.some((c) => c.state === "notFetched") ? `${ctx.t("cli.inputs.next.fetchAll")}` : null,
    s.documents.some((d) => d.state === "notIngested" || d.state === "stale") ? ctx.t("cli.inputs.next.ingest") : null,
  ].filter(Boolean);
  if (todo.length) ctx.print(`\n${todo.map((x) => `→ ${x}`).join("\n")}`);
  printReading(ctx, config, stack);
  return EXIT.OK;
}

export async function run({ ctx, values, positionals = [] }) {
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const { inputs, exists } = readInputs(root);
  const [sub = "status", ...rest] = positionals;
  if (sub === "add") return add(ctx, root, inputs, rest[0], rest.slice(1).join(" ") || undefined, values);
  if (sub === "fetch") return fetch(ctx, root, inputs, rest);
  if (sub === "ingest")
    return ingest(
      ctx,
      root,
      inputs,
      config,
      rest.map((f) => f.split(path.sep).join("/")),
    );
  if (sub === "status") return status(ctx, root, inputs, exists, config);
  throw new KitError(EXIT.USAGE, "inputs.unknownAction", { action: sub });
}
