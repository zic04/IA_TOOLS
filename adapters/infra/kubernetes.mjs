// Infra adapter of the Kubernetes and OpenShift manifests (ARCHITECTURE.md §5, §6.9): every document of a YAML file
// that declares an `apiVersion` and a `kind` — the workloads (Deployment, StatefulSet, DaemonSet, ReplicaSet, Pod,
// OpenShift's DeploymentConfig) and the jobs (Job, CronJob) with their replicas and schedule, and an image item per
// container (its image and tag, its ports, whether it runs as root, the names of its variables — never a value);
// the Services (their type, ports, whether they are open to all), the Ingresses and OpenShift Routes (TLS); the
// names of the ConfigMaps and Secrets, never their data; a Namespace whose name says an environment. The objects of
// a `List` and of an OpenShift `Template` are read the same way (a Template's parameters never). A Helm chart's files
// are Go templates, never read here (adapters/infra/helm.mjs reads the chart): a file under a folder that holds a
// Chart.yaml, or of a templates/ folder when it holds "{{". Kustomize's kustomization.yaml is not read (its kind is
// none of these); its patches are, as the manifests they are. YAML through engine/core/yaml.mjs, nothing expanded.
import { readYaml, at, text, items } from "../../engine/core/yaml.mjs";
import { environmentOfPath, openToAll, imageOf, bool, folderOf, baseOf } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The files read: YAML whose text has a top-level `apiVersion:` (a manifest; a chart's Chart.yaml too). */
const FILES = /\.ya?ml$/i;
const MARKER = /^apiVersion:/m;
/** A user id (`runAsUser`). */
const UID = /^\d{1,10}$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const KUBERNETES_PATTERNS = Object.freeze({ FILES, MARKER, UID });

/** Where the pod's spec sits in a workload of each kind. */
const POD_SPEC = new Map([
  ["Deployment", ["spec", "template", "spec"]],
  ["StatefulSet", ["spec", "template", "spec"]],
  ["DaemonSet", ["spec", "template", "spec"]],
  ["ReplicaSet", ["spec", "template", "spec"]],
  ["DeploymentConfig", ["spec", "template", "spec"]],
  ["Job", ["spec", "template", "spec"]],
  ["CronJob", ["spec", "jobTemplate", "spec", "template", "spec"]],
  ["Pod", ["spec"]],
]);

/**
 * Whether a container runs as root, from its securityContext and its pod's: true when privileged, as user 0 or with
 * runAsNonRoot false; false as another user or with runAsNonRoot true; undefined when neither says (the container's
 * setting before the pod's).
 * @param {any} pod         the pod's securityContext node
 * @param {any} container   the container's securityContext node
 */
export function runsAsRoot(pod, container) {
  if (bool(at(container, "privileged")) === true) return true;
  const user = text(at(container, "runAsUser")) ?? text(at(pod, "runAsUser"));
  if (user !== null && UID.test(user)) return Number(user) === 0;
  const nonRoot = bool(at(container, "runAsNonRoot")) ?? bool(at(pod, "runAsNonRoot"));
  return nonRoot === undefined ? undefined : !nonRoot;
}

/** The names of a container's variables: its `env` entries', and the ConfigMaps and Secrets of its `envFrom`. */
function variablesOf(container) {
  const names = items(at(container, "env")).map((e) => text(at(e, "name")));
  for (const e of items(at(container, "envFrom")))
    names.push(text(at(e, "configMapRef", "name")) ?? text(at(e, "secretRef", "name")));
  return names.filter(Boolean);
}

/** The image item of a container of a workload. */
function containerItem(c, type, podContext, workload) {
  const ref = text(at(c, "image"));
  return {
    kind: "image",
    provider: workload.provider,
    type,
    name: `${workload.name ?? "—"}/${text(at(c, "name")) ?? "—"}`,
    file: workload.file,
    line: c?.line ?? workload.line,
    env: workload.env,
    ...(ref ? imageOf(ref) : {}),
    ports: items(at(c, "ports")).map((p) => text(at(p, "containerPort"))),
    root: runsAsRoot(podContext, at(c, "securityContext")),
    variables: variablesOf(c),
  };
}

/** A workload or a job, then an image item per container of its pod (its init containers too). */
function workloadItems(doc, kind, base) {
  const pod = at(doc, ...POD_SPEC.get(kind));
  const workload = {
    ...base,
    kind: kind === "Job" || kind === "CronJob" ? "job" : "workload",
    provider: kind === "DeploymentConfig" ? "openshift" : "kubernetes",
    replicas: text(at(doc, "spec", "replicas")),
    schedule: kind === "CronJob" ? text(at(doc, "spec", "schedule")) : undefined,
  };
  const out = [workload];
  const context = at(pod, "securityContext");
  for (const [key, type] of [
    ["initContainers", "init-container"],
    ["containers", "container"],
  ])
    for (const c of items(at(pod, key))) out.push(containerItem(c, type, context, workload));
  return out;
}

/** A Service: its type, its ports, open to all when one of its loadBalancerSourceRanges is. */
function serviceItem(doc, base) {
  const ranges = at(doc, "spec", "loadBalancerSourceRanges");
  return {
    ...base,
    kind: "service",
    type: `Service/${text(at(doc, "spec", "type")) ?? "ClusterIP"}`,
    ports: items(at(doc, "spec", "ports")).map((p) => text(at(p, "port"))),
    openToAll: ranges ? items(ranges).some((r) => openToAll(text(r))) : undefined,
  };
}

/** The items of one manifest: none when its kind is none of those read. */
function manifestItems(doc, file) {
  const kind = text(at(doc, "kind"));
  const name = text(at(doc, "metadata", "name"));
  const namespace = text(at(doc, "metadata", "namespace"));
  const env = (namespace && environmentOfPath(namespace)) || environmentOfPath(file);
  const base = { provider: "kubernetes", type: kind, name, file, line: doc.line, env };
  if (POD_SPEC.has(kind)) return workloadItems(doc, kind, base);
  if (kind === "Service") return [serviceItem(doc, base)];
  if (kind === "Ingress") return [{ ...base, kind: "ingress", tls: items(at(doc, "spec", "tls")).length > 0 }];
  if (kind === "Route")
    return [{ ...base, kind: "ingress", provider: "openshift", tls: at(doc, "spec", "tls") !== undefined }];
  if (kind === "ConfigMap") return [{ ...base, kind: "config" }];
  if (kind === "Secret") return [{ ...base, kind: "secret" }];
  const named = kind === "Namespace" && name ? environmentOfPath(name) : undefined;
  return named ? [{ ...base, kind: "environment", env: named }] : [];
}

/** The manifests of a text: its documents, and the objects of a `List` (`items`) or an OpenShift `Template`. */
function manifestsOf(source) {
  const out = [];
  for (const doc of readYaml(source)) {
    const kind = text(at(doc, "kind"));
    if (kind === "List" || kind === "Template")
      for (const d of items(at(doc, kind === "List" ? "items" : "objects"))) out.push(d);
    else out.push(doc);
  }
  return out.filter((d) => d?.type === "map" && text(at(d, "apiVersion")) && text(at(d, "kind")));
}

/** The folders of the Helm charts among the files: those that hold a Chart.yaml ("" for the root). */
function chartFolders(files) {
  const out = new Set();
  for (const f of files) if (baseOf(f) === "Chart.yaml") out.add(folderOf(f));
  return out;
}

/**
 * Whether a file belongs to a Helm chart (under a folder of `charts`) or is a Go template (in a templates/ folder,
 * holding "{{"): never read as a manifest.
 * @param {string} file
 * @param {string} source
 * @param {Set<string>} charts
 */
export function isTemplate(file, source, charts) {
  const parts = file.split("/");
  let folder = "";
  for (let k = 0; k < parts.length; k++) {
    if (charts.has(folder)) return true;
    if (k === parts.length - 1) break;
    folder = folder ? `${folder}/${parts[k]}` : parts[k];
  }
  return parts.slice(0, -1).includes("templates") && source.includes("{{");
}

export default {
  name: "kubernetes",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const charts = chartFolders(sources.keys());
    const out = [];
    for (const [file, source] of sources) {
      if (isTemplate(file, source, charts)) continue;
      for (const doc of manifestsOf(source))
        for (const item of manifestItems(doc, file)) {
          if (out.length >= MAX_ITEMS) return out;
          out.push(item);
        }
    }
    return out;
  },
};
