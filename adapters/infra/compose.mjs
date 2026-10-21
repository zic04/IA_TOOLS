// Infra adapter of Docker Compose (ARCHITECTURE.md §5, §6.9): the services of a Compose file (docker-compose.yml,
// compose.yaml and their variants — docker-compose.prod.yml says its environment), each a workload with its image
// and tag (none when it is only built), the container side of its ports, whether it runs as root (`user`,
// `privileged`), its replicas (`deploy.replicas`) and the names of its environment variables — never their values
// (an `env_file` is a file, no variable); and the names of its top-level volumes, networks, secrets and configs,
// never what they hold. The extension fields (`x-…`) and the merge keys (`<<: *base`) are not followed; a Compose
// file of the format 1 (services at the top, no `services:`) is not read. YAML through engine/core/yaml.mjs.
import { readYaml, at, text, items, entries } from "../../engine/core/yaml.mjs";
import { environmentOfPath, imageOf, bool } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The files read: docker-compose*.yml, compose*.yaml (never composer.yml), with a top-level `services:`. */
const FILES = /(?:^|\/)(?:docker-)?compose(?:[.-][\w.-]{0,60})?\.ya?ml$/i;
const MARKER = /^services:/m;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const COMPOSE_PATTERNS = Object.freeze({ FILES, MARKER });

/** The top-level keys whose entries are kept by name: [key, kind, type]. */
const NAMED = [
  ["volumes", "volume", "compose-volume"],
  ["networks", "volume", "compose-network"],
  ["secrets", "secret", "compose-secret"],
  ["configs", "config", "compose-config"],
];

/**
 * The container side of a port of the short syntax ("8080:80" → "80", "127.0.0.1:9229:9229/tcp" → "9229", a range
 * "3000-3005" → its first port), as text.
 * @param {string} spec
 */
export function containerPort(spec) {
  const slash = spec.indexOf("/");
  const bare = slash === -1 ? spec : spec.slice(0, slash);
  const last = bare.slice(bare.lastIndexOf(":") + 1).trim();
  const dash = last.indexOf("-");
  return dash === -1 ? last : last.slice(0, dash);
}

/** A port of `ports`: the short syntax's container side, the long syntax's `target`. */
const portOf = (p) => (p?.type === "map" ? text(at(p, "target")) : text(p) === null ? null : containerPort(text(p)));

/**
 * Whether a service runs as root: true when privileged or its `user` is root or 0 (`root:root`, `0:0`), false for
 * another user, undefined when unsaid or given by a variable (`${UID}`).
 * @param {any} service
 */
export function rootOf(service) {
  if (bool(at(service, "privileged")) === true) return true;
  const user = text(at(service, "user"));
  if (!user) return undefined;
  const name = user.slice(0, user.indexOf(":") === -1 ? user.length : user.indexOf(":")).trim();
  if (name === "root" || name === "0") return true;
  return name.startsWith("$") ? undefined : false;
}

/** The names of a service's environment variables: a mapping's keys, or a list's "NAME=value" names. */
function variablesOf(environment) {
  if (environment?.type === "map") return environment.entries.map((e) => e.key);
  return items(environment)
    .map(text)
    .filter(Boolean)
    .map((t) => t.slice(0, t.indexOf("=") === -1 ? t.length : t.indexOf("=")).trim());
}

/** The workload of a service of `services`. */
function serviceItem({ key, line, value }, file, env) {
  const ref = text(at(value, "image"));
  return {
    kind: "workload",
    provider: "docker",
    type: "compose-service",
    name: key,
    file,
    line,
    env,
    ...(ref ? imageOf(ref) : {}),
    ports: items(at(value, "ports")).map(portOf),
    root: rootOf(value),
    replicas: text(at(value, "deploy", "replicas")),
    variables: variablesOf(at(value, "environment")),
  };
}

/** The items of one Compose document: its services, then its volumes, networks, secrets and configs by name. */
function documentItems(doc, file, env) {
  const out = [];
  for (const e of entries(at(doc, "services"))) if (e.key !== "<<") out.push(serviceItem(e, file, env));
  for (const [key, kind, type] of NAMED)
    for (const e of entries(at(doc, key)))
      if (e.key !== "<<") out.push({ kind, provider: "docker", type, name: e.key, file, line: e.line, env });
  return out;
}

export default {
  name: "compose",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const out = [];
    for (const [file, source] of sources) {
      const env = environmentOfPath(file);
      for (const doc of readYaml(source))
        for (const item of documentItems(doc, file, env)) {
          if (out.length >= MAX_ITEMS) return out;
          out.push(item);
        }
    }
    return out;
  },
};
