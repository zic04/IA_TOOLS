// Infra adapter of GitLab CI (ARCHITECTURE.md §5, §6.9): each `.gitlab-ci.yml` (one pipeline item, with the names of
// its top-level `variables`) and the files it includes locally (`include: 'ci/x.yml'`, `{ local: … }`, a `*` in the
// file name of the last folder; transitively) when they are among the sources — never a remote, project, template or
// component include. Each job — a top-level key that is neither a keyword nor hidden (".x") — gives its stage, its
// environment (an item of its own, once per run) and its image and services, its own or those of the templates it
// `extends` (the last one named, four levels at most); the names of its `variables` and `secrets`; the project or
// file it triggers. Read with engine/core/yaml.mjs; never a value of a variable, never a script.
import { readYaml, at, text, items, entries, field } from "../../engine/core/yaml.mjs";
import { environmentOf, imageOf, folderOf, baseOf } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The YAML files: a pipeline and what it includes (a file whose keys are those of jobs). */
const FILES = /\.ya?ml$/i;
const MARKER = /^ {0,40}(?:script|stage|stages|extends|include|trigger|environment):/m;
/** What an include path starts with that its file's path does not ("./", "/"). */
const LEADING = /^\.?\/{1,8}/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const GITLAB_CI_PATTERNS = Object.freeze({ FILES, MARKER, LEADING });

const PROVIDER = "gitlab";
/** The top-level keys that are no job. */
const KEYWORDS = new Set([
  "default",
  "include",
  "stages",
  "types",
  "variables",
  "workflow",
  "image",
  "services",
  "cache",
  "before_script",
  "after_script",
  "spec",
]);
/** At most this many includes with a wildcard per run, levels of `extends`, names per item, services per job. */
const MAX_WILDCARDS = 64;
const MAX_EXTENDS = 4;
const MAX_NAMES = 64;
const MAX_SERVICES = 32;

const isRoot = (file) => baseOf(file) === ".gitlab-ci.yml" || baseOf(file) === ".gitlab-ci.yaml";

/** The names of a mapping's keys, MAX_NAMES at most. */
const keys = (node) =>
  entries(node)
    .slice(0, MAX_NAMES)
    .map((e) => e.key);

/** The local paths an `include` names (a string, `{ local }`, a list of them); a remote one is not local. */
function localIncludes(node) {
  const list = node?.type === "seq" ? node.items : [node];
  const out = [];
  for (const i of list) {
    const path = i?.type === "map" ? text(at(i, "local")) : text(i);
    if (path && !path.includes("://") && !path.split("/").includes("..")) out.push(path);
  }
  return out;
}

/**
 * The files of the sources an include path names, from the project's folder: the file itself, or those of its
 * folder whose name matches a pattern with one `*` (while the run's budget of wildcards lasts).
 */
function resolved(path, base, sources, folders, budget) {
  const rel = path.replace(LEADING, "");
  const full = base ? `${base}/${rel}` : rel;
  if (!full.includes("*")) return sources.has(full) ? [full] : [];
  const [before, after, ...more] = baseOf(full).split("*");
  if (more.length || after === undefined || folderOf(full).includes("*") || budget.wildcards-- <= 0) return [];
  return (folders.get(folderOf(full)) || []).filter((f) => {
    const name = baseOf(f);
    return name.length >= before.length + after.length && name.startsWith(before) && name.endsWith(after);
  });
}

/**
 * The files of the pipelines, each read once: every `.gitlab-ci.yml`, then what they include locally, transitively.
 * @param {Map<string, string>} sources
 * @returns {Array<{ file: string, docs: any[] }>}
 */
function pipelineFiles(sources) {
  const folders = new Map();
  for (const f of sources.keys()) {
    if (!folders.has(folderOf(f))) folders.set(folderOf(f), []);
    folders.get(folderOf(f)).push(f);
  }
  const queue = [...sources.keys()].filter(isRoot).map((file) => ({ file, base: folderOf(file) }));
  const seen = new Set(queue.map((q) => q.file));
  const budget = { wildcards: MAX_WILDCARDS };
  const out = [];
  for (let k = 0; k < queue.length; k++) {
    const { file, base } = queue[k];
    const docs = readYaml(sources.get(file) ?? "").filter((d) => d?.type === "map");
    out.push({ file, docs });
    for (const doc of docs)
      for (const path of localIncludes(at(doc, "include")))
        for (const next of resolved(path, base, sources, folders, budget))
          if (!seen.has(next)) {
            seen.add(next);
            queue.push({ file: next, base });
          }
  }
  return out;
}

/** The hidden templates (".name") of the pipelines' files: each one's entries by key (the first of a key), its file. */
function templatesOf(files) {
  const templates = new Map();
  for (const { file, docs } of files)
    for (const doc of docs)
      for (const e of entries(doc))
        if (e.key.startsWith(".") && e.value?.type === "map" && !templates.has(e.key)) {
          const index = new Map();
          for (const t of e.value.entries) if (!index.has(t.key)) index.set(t.key, t);
          templates.set(e.key, { index, file });
        }
  return templates;
}

/** The template a job or a template extends: the last one it names. */
const parentOf = (node) => text(node?.type === "seq" ? node.items[node.items.length - 1] : node);

/**
 * The entry of a key in a job, or in the templates it extends (MAX_EXTENDS levels at most), with the file it is
 * written in; undefined when none says it. Each template's entries are indexed: a lookup costs no walk.
 */
function lookup(spec, key, file, templates) {
  const own = field(spec, key);
  if (own) return { entry: own, file };
  let parent = parentOf(field(spec, "extends")?.value);
  for (let level = 0; level < MAX_EXTENDS && parent; level++) {
    const template = templates.get(parent);
    const entry = template?.index.get(key);
    if (entry) return { entry, file: template.file };
    parent = parentOf(template?.index.get("extends")?.value);
  }
  return undefined;
}

/** The name of an environment (a string, or `{ name }`). */
const environmentName = (node) => (node?.type === "map" ? text(at(node, "name")) : text(node));

/** The project or the file a trigger job starts (`trigger: group/project`, `{ project }`, `{ include }`). */
function triggered(node) {
  if (node?.type !== "map") return text(node) ?? undefined;
  return text(at(node, "project")) ?? localIncludes(at(node, "include"))[0];
}

/** Adds the image items of a job or of the defaults: its `image` (a string or `{ name }`) and its `services`. */
function addImages(out, found, services, name, env) {
  const push = (type, node, file, line) => {
    const ref = node?.type === "map" ? text(at(node, "name")) : text(node);
    if (ref && out.length < MAX_ITEMS)
      out.push({ kind: "image", provider: PROVIDER, type, name, file, line, env, ...imageOf(ref) });
  };
  if (found) push("image", found.entry.value, found.file, found.entry.line);
  for (const s of items(services?.entry.value).slice(0, MAX_SERVICES))
    push("service", s, services.file, s?.line ?? services.entry.line);
}

/** Adds the items of one job and, once per run, of its environment. */
function addJob(out, job, file, templates, environments) {
  const spec = job.value;
  const declared = lookup(spec, "environment", file, templates);
  const environment = environmentName(declared?.entry.value);
  const env = environmentOf(environment?.split("/")[0]);
  out.push({
    kind: "job",
    provider: PROVIDER,
    type: text(lookup(spec, "stage", file, templates)?.entry.value) || "job",
    name: job.key,
    file,
    line: job.line,
    env,
    variables: [...keys(at(spec, "variables")), ...keys(at(spec, "secrets"))],
    source: triggered(at(spec, "trigger")),
  });
  if (declared && environment && !environments.has(environment)) {
    environments.add(environment);
    const { file: where, entry } = declared;
    out.push({
      kind: "environment",
      provider: PROVIDER,
      type: "environment",
      name: environment,
      file: where,
      line: entry.line,
      env,
    });
  }
  addImages(out, lookup(spec, "image", file, templates), lookup(spec, "services", file, templates), job.key, env);
}

/** Adds the items of one file of a pipeline: the pipeline itself for a root, its default images, its jobs. */
function addFile(out, { file, docs }, templates, environments) {
  // A pipeline's own document: the first but a header of inputs (`spec:` alone, before `---`).
  const main = docs.find((d) => d.entries.length !== 1 || d.entries[0].key !== "spec") ?? docs[0];
  for (const doc of docs) {
    if (isRoot(file) && doc === main)
      out.push({
        kind: "pipeline",
        provider: PROVIDER,
        type: "pipeline",
        name: file,
        file,
        line: doc.line,
        variables: keys(at(doc, "variables")),
      });
    const defaults = (key) => {
      const entry = field(at(doc, "default"), key) ?? field(doc, key);
      return entry ? { entry, file } : undefined;
    };
    addImages(out, defaults("image"), defaults("services"), "default", undefined);
    for (const job of entries(doc)) {
      if (out.length >= MAX_ITEMS) return;
      if (!KEYWORDS.has(job.key) && !job.key.startsWith(".") && job.value?.type === "map")
        addJob(out, job, file, templates, environments);
    }
  }
}

export default {
  name: "gitlab-ci",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const files = pipelineFiles(sources);
    const templates = templatesOf(files);
    const environments = new Set();
    const out = [];
    for (const f of files) if (out.length < MAX_ITEMS) addFile(out, f, templates, environments);
    return out.slice(0, MAX_ITEMS);
  },
};
