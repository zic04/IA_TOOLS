// The part "Infrastructure" of a context file (ARCHITECTURE.md §6.11, source `infra` of §6.9), for the page types
// that declare it (`digests: ["infra"]` in standard/templates: the runbook): what the infrastructure files declare,
// grouped for the writer — the pipelines (and the environments each deploys to), then each environment with its
// entry points, what runs there and its images, its cloud resources by provider, then the scheduled jobs — each with
// the file:line to cite. Bounded: MAX_ENVS environments, MAX_LINES lines per group and names per list, MAX_NAME
// characters per name, MAX_CHARS in all, the rest counted. Every text of the facts on one line, without a backquote
// (a facts file may be edited by hand). Never a value: the facts hold names and settings.
import { deploymentModel, envLabel, settingsOf } from "../facts/deployment.mjs";
import { oneLine } from "../core/text.mjs";

const MAX_ENVS = 8;
const MAX_LINES = 12;
const MAX_NAME = 100;
/** About 4,000 tokens: an overview, never the bulk of a context file (budget.mjs cuts a digest first anyway). */
const MAX_CHARS = 16_000;

/** A text of the facts on one line, without a backquote (it would open or close a code span), MAX_NAME at most. */
function plain(s) {
  const text = oneLine(s).replaceAll("`", "'");
  return text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text;
}

/** A name of the application in a Markdown code span. */
const code = (s) => `\`${plain(s)}\``;

/**
 * @param {{ items: any[], t: (key: string, vars?: object) => string }} p   items: facts/infra.json
 * @returns {string} the part, or "" when the infrastructure facts hold nothing
 */
export function infraPart({ items, t }) {
  if (!items.length) return "";
  const model = deploymentModel(items);
  const cite = (i) => `${plain(i.file)}:${lineOf(i)}`;
  const more = (count) => t("render.c4.deployment.more", { count });
  /** The names of a list, MAX_LINES at most, the rest counted. */
  const names = (list) => [
    ...list.slice(0, MAX_LINES),
    ...(list.length > MAX_LINES ? [more(list.length - MAX_LINES)] : []),
  ];
  const out = [`## ${t("cli.context.section.infra")}`, "", t("cli.context.infra.intro")];
  /** Up to MAX_LINES lines of `list`, the rest counted. */
  const lines = (list, prefix, format) => {
    for (const i of list.slice(0, MAX_LINES)) out.push(`${prefix}- ${format(i)}`);
    if (list.length > MAX_LINES) out.push(`${prefix}- ${more(list.length - MAX_LINES)}`);
  };
  const label = (env) => plain(envLabel(env, t));
  const element = (i) => {
    const settings = settingsOf(i, t).map(plain);
    return `${code(i.name)} (${plain(i.provider)} · ${plain(i.type)}${settings.length ? `; ${settings.join(", ")}` : ""}) — ${cite(i)}`;
  };

  // The pipelines, every one: a deployment often runs on a push without naming an environment.
  const pipelines = items.filter((i) => i.kind === "pipeline");
  if (pipelines.length) {
    out.push("", t("cli.context.infra.pipelines"));
    lines(pipelines, "", (p) => {
      const envs = model.pipelines.find((m) => m.file === p.file)?.envs ?? [];
      const to = envs.length ? ` → ${names(envs.map(label)).join(", ")}` : "";
      return `${code(p.name)}${p.schedule ? ` (${code(p.schedule)})` : ""}${to} — ${cite(p)}`;
    });
  }

  if (model.environments.length) out.push("");
  for (const e of model.environments.slice(0, MAX_ENVS)) {
    const by = names(model.pipelines.filter((p) => p.envs.includes(e.env)).map((p) => `${code(p.name)} (${cite(p)})`));
    out.push(
      `- **${label(e.env)}**${by.length ? ` — ${t("cli.context.infra.deployedBy", { pipelines: by.join(", ") })}` : ""}`,
    );
    lines([...e.entries, ...e.runs, ...e.rows.filter((i) => i.kind === "image")], "  ", element);
    lines([...e.resources], "  ", ([provider, count]) =>
      t("render.c4.deployment.resources", { provider: plain(provider), count }),
    );
  }
  if (model.environments.length > MAX_ENVS) out.push(`- ${more(model.environments.length - MAX_ENVS)}`);

  const scheduled = items.filter((i) => i.kind !== "pipeline" && typeof i.schedule === "string" && i.schedule);
  if (scheduled.length) {
    out.push("", t("cli.context.infra.scheduled"));
    lines(scheduled, "", (i) => `${code(i.name)} — ${code(i.schedule)} — ${cite(i)}`);
  }
  return capped(out, t);
}

/** The line of an item: a positive whole number, 1 when the facts give none (a facts file edited by hand). */
function lineOf(i) {
  const n = Number(i.line);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Room kept for the last line of a cut digest. */
const LAST_LINE = 200;

/** The lines joined, MAX_CHARS at most in all: the lines past it dropped, and counted on a last line. */
function capped(out, t) {
  let size = 0;
  let k = 0;
  for (; k < out.length && size + out[k].length + 1 <= MAX_CHARS - LAST_LINE; k++) size += out[k].length + 1;
  if (k === out.length) return out.join("\n") + "\n";
  return [...out.slice(0, k), t("cli.context.infra.cut", { count: out.length - k })].join("\n") + "\n";
}
