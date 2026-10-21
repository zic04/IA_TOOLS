// `infra` source (ARCHITECTURE.md §6.9): what the infrastructure files of the application declare — the cloud
// resources and modules of Terraform, Bicep, ARM and CloudFormation, the workloads, services and ingresses of
// Kubernetes, OpenShift, Helm and Compose, the images of the Dockerfiles, the environments and jobs of the CI
// pipelines, the plays of Ansible — read by the infra adapters (adapters/infra/, and the project's own of
// config.infra.adapters), each from its files' texts, never run. What is kept goes through one whitelist here, the
// project's adapters included: names, types, a few settings (an image and its tag, replicas, ports, whether it runs
// as root, has TLS, is open to all), the names of the variables it takes — never a value, a secret's content or a
// credential.
//   item: { kind, provider, type, name, file, line, env?, image?, tag?, replicas?, ports?, root?, tls?, openToAll?,
//   schedule?, variables?, source?, version? }
import terraform from "../../adapters/infra/terraform.mjs";
import bicep from "../../adapters/infra/bicep.mjs";
import arm from "../../adapters/infra/arm.mjs";
import cloudformation from "../../adapters/infra/cloudformation.mjs";
import dockerfile from "../../adapters/infra/dockerfile.mjs";
import kubernetes from "../../adapters/infra/kubernetes.mjs";
import helm from "../../adapters/infra/helm.mjs";
import compose from "../../adapters/infra/compose.mjs";
import githubActions from "../../adapters/infra/github-actions.mjs";
import gitlabCi from "../../adapters/infra/gitlab-ci.mjs";
import azurePipelines from "../../adapters/infra/azure-pipelines.mjs";
import ansible from "../../adapters/infra/ansible.mjs";
import { stackSources, loadProjectAdapters } from "./stacks.mjs";
import { routeWithoutSecrets, safeField, CRON } from "./behaviour-common.mjs";
import { withoutCredentials } from "./dependencies.mjs";
import { withoutQuery } from "./infra-common.mjs";
import { oneLine } from "../core/text.mjs";

/**
 * @typedef {{ name: string, files: RegExp, marker?: RegExp, infra: (p: { sources: Map<string, string> }) => object[] }}
 *   InfraAdapter
 */

/** The kit's infra adapters, in the order of standard/adapters.json (test/unit/infra.test.mjs checks they agree). */
export const BUILT_IN_INFRA = Object.freeze([
  terraform,
  bicep,
  arm,
  cloudformation,
  dockerfile,
  kubernetes,
  helm,
  compose,
  githubActions,
  gitlabCi,
  azurePipelines,
  ansible,
]);

/** The adapters of a run: the kit's but those of config.infra.disabled, then the project's own (config.infra). */
export const loadInfra = (root, config) =>
  loadProjectAdapters({ kind: "infra", key: "infra", builtIn: BUILT_IN_INFRA, root, config });

/** The kinds of item the source keeps. */
const KINDS = new Set([
  "resource",
  "module",
  "provider",
  "variable",
  "output",
  "workload",
  "service",
  "ingress",
  "config",
  "secret",
  "job",
  "image",
  "environment",
  "pipeline",
  "volume",
]);
/** At most this many items in all, and this many ports or variables per item. */
const MAX_ITEMS = 10_000;
const MAX_LIST = 32;
/** A word of a type, a provider, an environment, a tag or a version: no blank, 200 characters at most. */
const WORD = /^[\w.:/@+-]{1,200}$/;
/** A version or a constraint of versions: ~12.1.0, >=1.2 <2, ^3, 5.x. */
const VERSION = /^[\w.~^<>=*!|, +-]{1,64}$/;
/** An image's tag as written, a placeholder of the build included (${TAG:-latest}). */
const IMAGE_TAG = /^[\w.${}:+-]{1,128}$/;
/** The name of a variable, or of a resource it takes (a ConfigMap, a Secret's name): app-settings, DB_URL. */
const VARIABLE = /^[A-Za-z_][\w.-]{0,63}$/;

/** Digits of a whole number given as text. */
const DIGITS = /^\d{1,9}$/;

/** The expressions of this module (test/tools/redos-worker.mjs, RULES.md S5). */
export const INFRA_PATTERNS = Object.freeze({ WORD, DIGITS, VERSION, IMAGE_TAG, VARIABLE });

/** Whether no secret detector of the kit finds anything in a text (a key, a token: AKIA…, ghp_…). */
const clean = (v) => withoutCredentials(v) === v;

const word = (v, max = 200) => (typeof v === "string" && v.length <= max && WORD.test(v) && clean(v) ? v : undefined);

/**
 * A name or a source as written, on one line (a YAML block scalar's newlines a space: a name never opens a line in a
 * table or a context file), but what looks like a credential or a secret taken off ("…"); undefined if none. Each
 * word is judged on its own (routeWithoutSecrets reads a path's segments): a workflow's or a play's name is often a
 * phrase ("Build and deploy to production"), which is kept, while a word that reads as a token is written "…".
 */
function named(v) {
  if (typeof v !== "string" || !v || v.length > 300) return undefined;
  const bare = withoutCredentials(oneLine(v).trim());
  if (bare === null) return "…"; // a secret a detector of the kit finds: masked whole
  return typeof bare === "string" && bare
    ? bare
        .split(" ")
        .map((w) => routeWithoutSecrets(w))
        .join(" ")
    : undefined;
}

/** A name of a variable kept: a name (VARIABLE), never one that looks like a key or a token (safeField's check). */
const variableName = (v) =>
  typeof v === "string" && VARIABLE.test(v) && safeField(v.replaceAll("-", "_").replaceAll(".", "_")) !== undefined;

/** A whole number from 0 to `max`, or undefined. */
const whole = (v, max) => {
  const n = typeof v === "string" && DIGITS.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
};

/** A text that `re` accepts whole (its blanks around it taken off) and no secret detector flags, or undefined. */
const matching = (v, re) => (typeof v === "string" && re.test(v.trim()) && clean(v.trim()) ? v.trim() : undefined);

/** A boolean, or undefined. */
const flag = (v) => (typeof v === "boolean" ? v : undefined);

/** Whole numbers from 0 to `max` of a list, MAX_LIST at most. */
const wholes = (v, max) =>
  Array.isArray(v)
    ? v
        .map((p) => whole(p, max))
        .filter((p) => p !== undefined)
        .slice(0, MAX_LIST)
    : undefined;

/**
 * An item as the source keeps it, or null: an unknown kind, no file. Every value is checked here, whoever gave it.
 * @param {any} r
 * @param {string} adapter   the adapter's name, the provider when the item names none
 */
export function keptInfra(r, adapter) {
  if (!r || typeof r !== "object" || !KINDS.has(r.kind) || typeof r.file !== "string") return null;
  const item = {
    kind: r.kind,
    provider: word(r.provider, 64) ?? adapter,
    type: word(r.type) ?? r.kind,
    name: named(r.name) ?? "—",
    file: r.file,
    line: whole(r.line, 10_000_000) ?? 1,
  };
  const optional = {
    env: word(r.env, 64),
    image: named(r.image),
    tag: matching(r.tag, IMAGE_TAG) === r.tag ? r.tag : undefined,
    replicas: whole(r.replicas, 100_000),
    ports: wholes(r.ports, 65_535),
    root: flag(r.root),
    tls: flag(r.tls),
    openToAll: flag(r.openToAll),
    schedule: matching(r.schedule, CRON),
    variables: Array.isArray(r.variables)
      ? [...new Set(r.variables.filter(variableName))].slice(0, MAX_LIST)
      : undefined,
    source: typeof r.source === "string" ? named(withoutQuery(r.source)) : undefined,
    version: matching(r.version, VERSION),
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined && !(Array.isArray(v) && !v.length)) item[k] = v;
  return item;
}

/**
 * The `infra` source: the items of every infra adapter, each through the whitelist, MAX_ITEMS at most, in file then
 * line order.
 * @param {string} appDir
 * @param {readonly InfraAdapter[]} [adapters]
 */
export function collectInfra(appDir, adapters = BUILT_IN_INFRA) {
  const items = [];
  for (const run of stackSources(appDir, /** @type {any} */ (adapters), "infra")) {
    const adapter = /** @type {InfraAdapter} */ (/** @type {unknown} */ (run.adapter));
    for (const r of adapter.infra({ sources: run.sources })) {
      if (items.length >= MAX_ITEMS) break;
      const item = keptInfra(r, adapter.name);
      if (item && run.sources.has(item.file)) items.push(item); // a file it was given, never another
    }
  }
  return items.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}
