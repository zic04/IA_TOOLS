// Infra adapter of GitHub Actions (ARCHITECTURE.md §5, §6.9): each workflow of .github/workflows/ — its name (or its
// file's), its first schedule, the names of what it takes (`env`, `workflow_call` and `workflow_dispatch` inputs and
// secrets) — and each of its jobs: its id, the reusable workflow it calls (`uses`), the environment it deploys to (an
// item of its own, once per workflow; none when an expression chooses it), its container and service images, the
// names of its variables (`env` keys of the job and its steps, the secrets it reads: `${{ secrets.X }}`). Only the
// first `on.schedule` is kept. Read with engine/core/yaml.mjs; never a value of `env`, `with` or a secret, never
// `runs-on`, never a step's action.
import { readYaml, at, text, items, entries, field } from "../../engine/core/yaml.mjs";
import { environmentOf, imageOf, baseOf } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The files of the workflows. */
const FILES = /(?:^|\/)\.github\/workflows\/[^/]{1,200}\.ya?ml$/i;
/** The name of a secret after `secrets.` (read from there: sticky), and a character a name goes on with. */
const SECRET_NAME = /[A-Za-z_]\w{0,63}/y;
const NAME_CHAR = /^[\w.]$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const GITHUB_ACTIONS_PATTERNS = Object.freeze({ FILES, SECRET_NAME, NAME_CHAR });

const PROVIDER = "github-actions";
/** At most this many variable names per item (the whitelist keeps fewer), services per job. */
const MAX_NAMES = 64;
const MAX_SERVICES = 32;

/** Adds a name to a set of names, MAX_NAMES at most. */
const add = (names, name) => {
  if (typeof name === "string" && names.size < MAX_NAMES) names.add(name);
};

/** Calls `visit` on the text of every scalar under a node (the reader bounds their number and depth). */
function eachScalar(node, visit) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (n?.type === "scalar") visit(n.value);
    // Pushed last first, so that the scalars are visited in the order of the text.
    else if (n?.type === "seq") for (let k = n.items.length - 1; k >= 0; k--) stack.push(n.items[k]);
    else if (n?.type === "map") for (let k = n.entries.length - 1; k >= 0; k--) stack.push(n.entries[k].value);
  }
}

/** Adds the names of the secrets a text reads (`secrets.NAME`, never `x.secrets.NAME`). One pass. */
function secretsIn(s, names) {
  for (let i = s.indexOf("secrets."); i !== -1 && names.size < MAX_NAMES; i = s.indexOf("secrets.", i + 8)) {
    if (i > 0 && NAME_CHAR.test(s[i - 1])) continue;
    SECRET_NAME.lastIndex = i + 8;
    add(names, SECRET_NAME.exec(s)?.[0]);
  }
}

/** The names of an `env` mapping, and of the secrets its values read — never a value. */
function envNames(node, names) {
  for (const e of entries(node)) add(names, e.key);
  eachScalar(node, (s) => secretsIn(s, names));
}

/** The workflow item: its name, its first schedule, the names of what it takes. */
function workflowItem(doc, file) {
  const on = at(doc, "on");
  const names = new Set();
  envNames(at(doc, "env"), names);
  for (const trigger of ["workflow_call", "workflow_dispatch"])
    for (const e of entries(at(on, trigger, "inputs"))) add(names, e.key);
  for (const e of entries(at(on, "workflow_call", "secrets"))) add(names, e.key);
  const cron = items(at(on, "schedule"))
    .map((s) => text(at(s, "cron")))
    .find(Boolean);
  return {
    kind: "pipeline",
    provider: PROVIDER,
    type: "workflow",
    name: text(at(doc, "name")) || baseOf(file),
    file,
    line: field(doc, "name")?.line ?? doc.line,
    schedule: cron ?? undefined,
    variables: [...names],
  };
}

/** The names a job takes: its `env` and its steps', the secrets it reads anywhere, the secrets it passes on. */
function jobNames(spec) {
  const names = new Set();
  envNames(at(spec, "env"), names);
  for (const step of items(at(spec, "steps"))) envNames(at(step, "env"), names);
  for (const e of entries(at(spec, "secrets"))) add(names, e.key);
  eachScalar(spec, (s) => secretsIn(s, names));
  return [...names];
}

/** Adds the images of a job: its container (an image, or `{ image }`) and its services, MAX_SERVICES at most. */
function addImages(out, job, file, env) {
  const image = (type, name, entry) => {
    const ref = text(entry?.value);
    if (ref && out.length < MAX_ITEMS)
      out.push({ kind: "image", provider: PROVIDER, type, name, file, line: entry.line, env, ...imageOf(ref) });
  };
  const container = field(job.value, "container");
  image("container", job.key, container?.value?.type === "map" ? field(container.value, "image") : container);
  for (const service of entries(at(job.value, "services")).slice(0, MAX_SERVICES))
    image("service", service.key, service.value?.type === "map" ? field(service.value, "image") : service);
}

/** The items of a workflow: itself, then each job, the environments it deploys to (once each) and its images. */
function workflowItems(doc, file, out) {
  out.push(workflowItem(doc, file));
  const environments = new Set();
  for (const job of entries(at(doc, "jobs"))) {
    if (out.length >= MAX_ITEMS) return;
    if (job.value?.type !== "map") continue;
    const declared = field(job.value, "environment");
    const named = declared?.value?.type === "map" ? text(at(declared.value, "name")) : text(declared?.value);
    // An environment chosen when the workflow runs (`${{ inputs.target }}`) is none the file names.
    const environment = named?.includes("${{") ? undefined : named;
    const env = environmentOf(environment);
    out.push({
      kind: "job",
      provider: PROVIDER,
      type: "job",
      name: job.key,
      file,
      line: job.line,
      env,
      variables: jobNames(job.value),
      source: text(at(job.value, "uses")) ?? undefined,
    });
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
    addImages(out, job, file, env);
  }
}

export default {
  name: "github-actions",
  files: FILES,
  infra({ sources }) {
    const out = [];
    for (const [file, source] of sources) {
      if (out.length >= MAX_ITEMS) break;
      const doc = readYaml(source).find((d) => d?.type === "map");
      if (doc) workflowItems(doc, file, out);
    }
    return out.slice(0, MAX_ITEMS);
  },
};
