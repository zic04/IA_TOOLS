// Infra adapter of the Helm charts (ARCHITECTURE.md §5, §6.9): a chart's Chart.yaml (its name and version, and the
// charts it depends on — `dependencies`, or a Helm 2 requirements.yaml beside it — with their repository and
// version), and the values files of its folder (values.yaml, values.prod.yaml, values-staging.yaml: the environment
// from the file's name) by their usual keys, at the top and one level down (a component's, `worker.image`):
// `image.repository` (after `image.registry`) and `image.tag` → an image; `replicaCount` → the replicas of a
// workload named after the chart; `ingress.enabled` and `ingress.tls` → an ingress; `service.type` and
// `service.port` → a service. Never the templates (Go templates: what they make depends on the values), never a
// values file outside a chart's folder, never a value but those keys' (an `env`, a password: not read). A tag left
// empty is left out (the templates may give it the chart's appVersion: they are not read). YAML through
// engine/core/yaml.mjs, nothing expanded.
import { readYaml, at, text, items, entries, field } from "../../engine/core/yaml.mjs";
import { environmentOfPath, bool, folderOf, baseOf } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The files read: a chart's Chart.yaml and requirements.yaml, the values files (only those of a chart's folder). */
const FILES = /(?:^|\/)(?:Chart\.yaml|requirements\.yaml|values[\w.-]{0,60}\.ya?ml)$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const HELM_PATTERNS = Object.freeze({ FILES });

/** The keys of a values block that are read, never taken for a component. */
const USUAL = new Set(["image", "replicaCount", "ingress", "service"]);

/** The charts a Chart.yaml (Helm 3) or a requirements.yaml (Helm 2) depends on: their repository and version. */
function dependencyItems(doc, file) {
  const env = environmentOfPath(file);
  return items(at(doc, "dependencies")).map((d) => ({
    kind: "module",
    provider: "helm",
    type: "dependency",
    name: text(at(d, "name")),
    source: text(at(d, "repository")),
    version: text(at(d, "version")),
    file,
    line: d?.line,
    env,
  }));
}

/** The image of a values block: its repository (after its registry) and its tag, when either is given. */
function imageItem(block, base) {
  const image = field(block, "image");
  const repository = text(at(image?.value, "repository"));
  const tag = text(at(image?.value, "tag"));
  if (!repository && !tag) return null;
  const registry = text(at(image.value, "registry"));
  return {
    ...base,
    kind: "image",
    type: "image",
    line: image.line,
    image: repository ? (registry ? `${registry}/${repository}` : repository) : undefined,
    tag: tag || undefined,
  };
}

/** The workload of a values block: its replicas (`replicaCount`). */
function workloadItem(block, base) {
  const replicas = field(block, "replicaCount");
  return text(replicas?.value)
    ? { ...base, kind: "workload", type: "release", line: replicas.line, replicas: text(replicas.value) }
    : null;
}

/** The ingress of a values block, when enabled: TLS when `tls` is a list that is not empty, or true. */
function ingressItem(block, base) {
  const ingress = field(block, "ingress");
  if (bool(at(ingress?.value, "enabled")) !== true) return null;
  const tls = at(ingress.value, "tls");
  return {
    ...base,
    kind: "ingress",
    type: "Ingress",
    line: ingress.line,
    tls: tls?.type === "seq" ? tls.items.length > 0 : bool(tls) === true,
  };
}

/** The service of a values block: its type (ClusterIP when unsaid) and its port. */
function serviceItem(block, base) {
  const service = field(block, "service");
  const type = text(at(service?.value, "type"));
  const port = text(at(service?.value, "port"));
  if (!type && !port) return null;
  return { ...base, kind: "service", type: `Service/${type ?? "ClusterIP"}`, line: service.line, ports: [port] };
}

/** The items of a values block (the file's top, or a component's mapping), named `name`. */
const blockItems = (block, base) =>
  [imageItem, workloadItem, ingressItem, serviceItem].map((read) => read(block, base)).filter(Boolean);

/** The items of a values file of the chart `chart`: its top's, then each component's (`<chart>/<key>`). */
function valuesItems(doc, chart, file) {
  const base = { provider: "helm", name: chart, file, env: environmentOfPath(file) };
  const out = blockItems(doc, base);
  for (const e of entries(doc))
    if (e.value?.type === "map" && !USUAL.has(e.key))
      for (const item of blockItems(e.value, { ...base, name: `${chart}/${e.key}` })) out.push(item);
  return out;
}

/** Adds items to `out`, MAX_ITEMS at most. */
function add(out, list) {
  for (const item of list) if (out.length < MAX_ITEMS) out.push(item);
}

export default {
  name: "helm",
  files: FILES,
  infra({ sources }) {
    const out = [];
    const charts = new Map();
    for (const [file, source] of sources) {
      if (baseOf(file) !== "Chart.yaml") continue;
      const doc = readYaml(source)[0];
      const name = text(at(doc, "name")) ?? baseOf(folderOf(file));
      charts.set(folderOf(file), name);
      const chart = { kind: "module", provider: "helm", type: "chart", name, version: text(at(doc, "version")) };
      add(out, [{ ...chart, file, line: doc?.line, env: environmentOfPath(file) }, ...dependencyItems(doc, file)]);
    }
    for (const [file, source] of sources) {
      const chart = charts.get(folderOf(file));
      if (chart === undefined || baseOf(file) === "Chart.yaml") continue;
      const doc = readYaml(source)[0];
      add(out, baseOf(file) === "requirements.yaml" ? dependencyItems(doc, file) : valuesItems(doc, chart, file));
    }
    return out;
  },
};
