// Infra adapter of Azure Pipelines (ARCHITECTURE.md §5, §6.9): each pipeline file — one pipeline item with its first
// schedule (`schedules[].cron`), the names of its `variables` and `parameters`, the template it `extends` — then its
// jobs, in its stages or without them (`${{ if … }}` and `${{ each … }}` blocks followed): a `job` or a `deployment`,
// with its environment (`prod.webapp` is the environment `prod`, `{ name }`; an item of its own, once per file; none
// when an expression chooses it), its container image (an alias of `resources.containers` is that resource's image)
// and the names of its variables and its stage's. A pipeline of steps alone is its pipeline item. Read with
// engine/core/yaml.mjs; never a value of a variable or a parameter, never a variable group, never `pool`.
import { readYaml, at, text, items, field } from "../../engine/core/yaml.mjs";
import { environmentOf, imageOf, baseOf } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The files of the pipelines: azure-pipelines*.yml, *.azure-pipelines.yml, and those of .azure-pipelines/ or .pipelines/. */
const FILES =
  /(?:^|\/)(?:azure-pipelines[^/]{0,100}\.ya?ml|[^/]{1,100}\.azure-pipelines\.ya?ml|\.(?:azure-)?pipelines\/(?:[\w.-]{1,100}\/){0,4}[^/]{1,200}\.ya?ml)$/i;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const AZURE_PIPELINES_PATTERNS = Object.freeze({ FILES });

const PROVIDER = "azure-devops";
/** At most this many names per item, this many levels of `${{ … }}` blocks. */
const MAX_NAMES = 64;
const MAX_DEPTH = 8;

/**
 * The names of `variables` or `parameters`: a mapping's keys, or the `name` of each item of a list — never a value,
 * never a `group` (a library's name) or a `template`.
 */
function namesOf(node) {
  const out = [];
  if (node?.type === "map") for (const e of node.entries) out.push(e.key);
  else for (const i of items(node)) if (text(at(i, "name"))) out.push(/** @type {string} */ (text(at(i, "name"))));
  return out.slice(0, MAX_NAMES);
}

/**
 * The items of a list of stages or jobs, a `${{ if … }}` or `${{ each … }}` block's own items in its place (those of
 * a mapping whose keys are expressions), MAX_DEPTH levels at most.
 */
function flat(list, out = [], depth = 0) {
  for (const i of items(list)) {
    if (i?.type === "map" && i.entries.length && i.entries.every((e) => e.key.startsWith("${{"))) {
      if (depth < MAX_DEPTH) for (const e of i.entries) flat(e.value, out, depth + 1);
    } else if (i) out.push(i);
  }
  return out;
}

/**
 * The environment of a deployment job: its name before the dot of a resource (`prod.webapp`), or `{ name }`; none
 * when an expression chooses it as the pipeline runs (`${{ parameters.env }}`, `$(env)`).
 */
function environmentOfJob(declared) {
  const name = declared?.value?.type === "map" ? text(at(declared.value, "name")) : text(declared?.value);
  return name && !name.includes("${{") && !name.includes("$(") ? name.split(".")[0] : undefined;
}

/** Adds the pipeline item and the image items of `resources.containers`; returns the aliases they declare. */
function addPipeline(out, doc, file) {
  const cron = items(at(doc, "schedules"))
    .map((s) => text(at(s, "cron")))
    .find(Boolean);
  out.push({
    kind: "pipeline",
    provider: PROVIDER,
    type: "pipeline",
    name: baseOf(file),
    file,
    line: doc.line,
    schedule: cron ?? undefined,
    variables: [...namesOf(at(doc, "variables")), ...namesOf(at(doc, "parameters"))],
    source: text(at(doc, "extends", "template")) ?? undefined,
  });
  const aliases = new Set();
  for (const c of items(at(doc, "resources", "containers"))) {
    const alias = text(at(c, "container"));
    const ref = text(at(c, "image"));
    if (alias) aliases.add(alias);
    if (ref && out.length < MAX_ITEMS)
      out.push({
        kind: "image",
        provider: PROVIDER,
        type: "container",
        name: alias ?? ref,
        file,
        line: c.line,
        ...imageOf(ref),
      });
  }
  return aliases;
}

/** The items of one job: itself, its environment (once per file, `environments`), its container's image. */
function jobItems(job, stageNames, context) {
  const { file, aliases, environments } = context;
  const deployment = field(job, "deployment");
  const name = text(deployment?.value ?? at(job, "job"));
  if (!name) return [];
  const declared = field(job, "environment");
  const environment = environmentOfJob(declared);
  const env = environmentOf(environment);
  /** @type {object[]} */
  const out = [
    {
      kind: "job",
      provider: PROVIDER,
      type: deployment ? "deployment" : "job",
      name,
      file,
      line: job.line,
      env,
      variables: [...namesOf(at(job, "variables")), ...stageNames],
    },
  ];
  if (environment && !environments.has(environment)) {
    environments.add(environment);
    out.push({
      kind: "environment",
      provider: PROVIDER,
      type: "environment",
      name: environment,
      file,
      line: declared.line,
      env,
    });
  }
  const container = field(job, "container");
  const image = container?.value?.type === "map" ? field(container.value, "image") : container;
  const ref = text(image?.value);
  if (ref && !aliases.has(ref))
    out.push({
      kind: "image",
      provider: PROVIDER,
      type: "container",
      name,
      file,
      line: image.line,
      env,
      ...imageOf(ref),
    });
  return out;
}

/** The items of one pipeline file. */
function fileItems(doc, file, out) {
  const aliases = addPipeline(out, doc, file);
  const context = { file, aliases, environments: new Set() };
  const stages = flat(at(doc, "stages"));
  const groups = stages.length
    ? stages.map((s) => ({ jobs: at(s, "jobs"), names: namesOf(at(s, "variables")) }))
    : [{ jobs: at(doc, "jobs"), names: [] }];
  for (const { jobs, names } of groups)
    for (const job of flat(jobs)) {
      if (out.length >= MAX_ITEMS) return;
      out.push(...jobItems(job, names, context));
    }
}

export default {
  name: "azure-pipelines",
  files: FILES,
  infra({ sources }) {
    const out = [];
    for (const [file, source] of sources) {
      if (out.length >= MAX_ITEMS) break;
      const doc = readYaml(source).find((d) => d?.type === "map");
      if (doc) fileItems(doc, file, out);
    }
    return out.slice(0, MAX_ITEMS);
  },
};
