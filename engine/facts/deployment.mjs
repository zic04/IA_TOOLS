// The deployment model of the application (ARCHITECTURE.md §6.9, source `infra`): what the infrastructure facts tell
// of where it runs — one entry per environment the files name (a path's envs/prod/, a namespace, a values.prod.yaml, a
// pipeline's environment) with its entry points (ingresses, services), its workloads and jobs, its rows, and a count of
// its cloud resources by provider; the pipelines and the environments they deploy to. Read by the deployment view
// (engine/build/c4-deployment.mjs) and by the context of a runbook (engine/context/infra-section.mjs). Pure.
import { baseOf } from "./infra-common.mjs";

/** The environments in the order a reader expects them, from production down; any other after, by name. */
const ENV_ORDER = ["production", "preprod", "staging", "uat", "qa", "test", "development", "sandbox", "demo", "local"];
/** The key of the column of the items whose files name no environment. */
const NO_ENV = "";
/** What a column shows, in this order: the entry points, then what runs. */
const ENTRY = new Set(["ingress", "service"]);
const RUNS = new Set(["workload", "job"]);
/** The providers of the CI pipelines: their jobs are the pipeline's, never a column's. */
const CI = new Set(["github-actions", "gitlab", "azure-devops"]);
/** The kinds the table lists (a variable, an output, a provider, a volume tells nothing of where the application runs). */
const LISTED = new Set(["ingress", "service", "workload", "job", "image", "resource", "module", "config", "secret"]);

/**
 * @typedef {{ kind: string, provider: string, type: string, name: string, file: string, line: number, env?: string,
 *   image?: string, tag?: string, replicas?: number, ports?: number[], root?: boolean, tls?: boolean,
 *   openToAll?: boolean, schedule?: string }} InfraItem
 * @typedef {{ env: string, entries: InfraItem[], runs: InfraItem[], resources: Map<string, number>,
 *   rows: InfraItem[] }} Environment
 * @typedef {{ name: string, file: string, line: number, envs: string[] }} Pipeline
 * @typedef {{ environments: Environment[], pipelines: Pipeline[] }} DeploymentModel
 */

const rank = (/** @type {string} */ env) =>
  env === NO_ENV ? 1e6 : ENV_ORDER.includes(env) ? ENV_ORDER.indexOf(env) : 100;

/**
 * The deployment model of the application, from the items of facts/infra.json.
 * @param {InfraItem[]} items
 * @returns {DeploymentModel}
 */
export function deploymentModel(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {Map<string, Environment>} */
  const envs = new Map();
  const at = (env) => {
    if (!envs.has(env)) envs.set(env, { env, entries: [], runs: [], resources: new Map(), rows: [] });
    return /** @type {Environment} */ (envs.get(env));
  };
  /** @type {Map<string, Pipeline>} */
  const pipelines = new Map();
  for (const i of list) {
    if (i.kind === "pipeline") pipelines.set(i.file, { name: i.name, file: i.file, line: i.line, envs: [] });
  }
  for (const i of list) {
    const ci = CI.has(i.provider);
    if (i.kind === "environment") {
      // A pipeline deploys to it (a file a pipeline includes counts as one of its own), or a namespace names it.
      if (ci && i.env) {
        if (!pipelines.has(i.file)) pipelines.set(i.file, { name: baseOf(i.file), file: i.file, line: 1, envs: [] });
        const p = /** @type {Pipeline} */ (pipelines.get(i.file));
        if (!p.envs.includes(i.env)) p.envs.push(i.env);
      }
      if (i.env) at(i.env);
      continue;
    }
    if (ci || !LISTED.has(i.kind)) continue;
    const e = at(i.env ?? NO_ENV);
    e.rows.push(i);
    if (ENTRY.has(i.kind)) e.entries.push(i);
    else if (RUNS.has(i.kind)) e.runs.push(i);
    else if (i.kind === "resource") e.resources.set(i.provider, (e.resources.get(i.provider) ?? 0) + 1);
  }
  const environments = [...envs.values()].sort((a, b) => rank(a.env) - rank(b.env) || a.env.localeCompare(b.env));
  return { environments, pipelines: [...pipelines.values()].filter((p) => p.envs.length) };
}

/** The name of an environment as the reader reads it. */
export const envLabel = (env, t) =>
  env === NO_ENV
    ? t("render.c4.deployment.noEnv")
    : ENV_ORDER.includes(env)
      ? t(`render.c4.deployment.env.${env}`)
      : env;

/** The settings of an element, as short phrases: replicas, image and tag, ports, root, TLS, open to all, schedule. */
export function settingsOf(i, t) {
  const k = (key, vars) => t(`render.c4.deployment.flag.${key}`, vars);
  return [
    i.replicas !== undefined ? k("replicas", { n: i.replicas }) : null,
    i.image ? k("image", { image: i.tag ? `${i.image}:${i.tag}` : i.image }) : null,
    // An image run without a tag pulls `latest`; a Dockerfile's stage may start from an earlier stage, which has none.
    i.image && !i.tag && i.type !== "stage" ? k("noTag") : null,
    i.ports?.length ? k("ports", { ports: i.ports.join(", ") }) : null,
    i.root === true ? k("root") : null,
    i.tls === true ? k("tls") : i.tls === false ? k("noTls") : null,
    i.openToAll === true ? k("open") : null,
    i.schedule ? k("schedule", { cron: i.schedule }) : null,
  ].filter(Boolean);
}
