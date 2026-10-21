// Infra adapter of Ansible, light (ARCHITECTURE.md §5, §6.9): the playbooks — YAML lists whose items have `hosts`
// and `tasks`, `roles`, `pre_tasks`, `post_tasks` or `handlers` — each play with its name (or its hosts), the
// environment its hosts say (webservers_prod, staging) or else its file's path, the names of its `vars` and
// `vars_prompt`; and the roles it plays (`roles:`, and `include_role`/`import_role` in its tasks, blocks followed),
// once per file. Never a file of a role (roles/x/tasks/main.yml is no playbook), of group_vars/ or host_vars/, of an
// inventory, never a value of a variable. Read with engine/core/yaml.mjs.
import { readYaml, at, text, items, entries, field } from "../../engine/core/yaml.mjs";
import { environmentOf, environmentOfPath } from "../../engine/facts/infra-common.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";

/** The YAML files that name hosts. */
const FILES = /\.ya?ml$/i;
const MARKER = /^ {0,40}(?:- {1,8})?hosts:/m;
/** The folders that hold no playbook: a role's, the variables of groups and hosts, an inventory, Molecule's. */
const NOT_PLAYBOOK = /(?:^|\/)(?:roles|group_vars|host_vars|inventory|inventories|molecule)\//;
/** What separates the words of a pattern of hosts ("web:&prod", "db_staging, cache"). */
const HOST_SEPARATORS = /[^A-Za-z0-9-]{1,64}/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const ANSIBLE_PATTERNS = Object.freeze({ FILES, MARKER, NOT_PLAYBOOK, HOST_SEPARATORS });

const PROVIDER = "ansible";
/** The lists of tasks of a play, the keys of a block's own tasks, the modules that play a role. */
const TASK_LISTS = ["pre_tasks", "tasks", "post_tasks", "handlers"];
const BLOCK_LISTS = ["block", "rescue", "always"];
const ROLE_MODULES = new Set([
  "include_role",
  "import_role",
  "ansible.builtin.include_role",
  "ansible.builtin.import_role",
]);
/** At most this many names per item, hosts named, levels of blocks. */
const MAX_NAMES = 64;
const MAX_HOSTS = 20;
const MAX_DEPTH = 8;

/** Whether a node is a play: a mapping with `hosts` and something to do. */
const isPlay = (n) => n?.type === "map" && field(n, "hosts") && ["roles", ...TASK_LISTS].some((k) => field(n, k));

/** The environment a pattern of hosts says (the last of its words that names one), or undefined. */
function environmentOfHosts(hosts) {
  let found;
  for (const word of hosts.split(HOST_SEPARATORS)) found = environmentOf(word) ?? environmentOfPath(word) ?? found;
  return found;
}

/** The names of a play's variables: the keys of `vars` (a mapping, or a list of them), the `vars_prompt` names. */
function variablesOf(play) {
  const vars = at(play, "vars");
  const maps = vars?.type === "seq" ? vars.items : [vars];
  const out = [];
  for (const m of maps) for (const e of entries(m)) out.push(e.key);
  for (const p of items(at(play, "vars_prompt"))) out.push(text(at(p, "name")));
  return out.filter(Boolean).slice(0, MAX_NAMES);
}

/** The roles a list of tasks plays (`include_role`, `import_role`), blocks followed, MAX_DEPTH levels at most. */
function taskRoles(list, out, depth = 0) {
  for (const task of items(list)) {
    if (task?.type !== "map") continue;
    for (const e of task.entries) {
      if (ROLE_MODULES.has(e.key)) {
        const name = text(at(e.value, "name"));
        if (name) out.push({ name, line: e.line });
      } else if (BLOCK_LISTS.includes(e.key) && depth < MAX_DEPTH) taskRoles(e.value, out, depth + 1);
    }
  }
  return out;
}

/** The roles of a play: those of `roles:` (a name, `{ role }` or `{ name }`), then those its tasks play. */
function rolesOf(play) {
  const out = [];
  for (const r of items(at(play, "roles"))) {
    const name = r?.type === "map" ? (text(at(r, "role")) ?? text(at(r, "name"))) : text(r);
    if (name) out.push({ name, line: r.line });
  }
  for (const key of TASK_LISTS) taskRoles(at(play, key), out);
  return out;
}

/** Adds the items of one play: itself, then each role it plays that the file has not named yet. */
function addPlay(out, play, file, roles) {
  const hosts = at(play, "hosts");
  const pattern = (hosts?.type === "seq" ? hosts.items.slice(0, MAX_HOSTS).map(text) : [text(hosts)])
    .filter(Boolean)
    .join(", ");
  const env = environmentOfHosts(pattern) ?? environmentOfPath(file);
  out.push({
    kind: "job",
    provider: PROVIDER,
    type: "play",
    name: text(at(play, "name")) || pattern,
    file,
    line: play.line,
    env,
    variables: variablesOf(play),
  });
  for (const role of rolesOf(play))
    if (!roles.has(role.name) && out.length < MAX_ITEMS) {
      roles.add(role.name);
      out.push({ kind: "module", provider: PROVIDER, type: "role", name: role.name, file, line: role.line, env });
    }
}

export default {
  name: "ansible",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const out = [];
    for (const [file, source] of sources) {
      if (NOT_PLAYBOOK.test(file)) continue;
      const roles = new Set();
      for (const doc of readYaml(source))
        for (const play of doc?.type === "seq" ? doc.items : []) {
          if (out.length >= MAX_ITEMS) return out.slice(0, MAX_ITEMS);
          if (isPlay(play)) addPlay(out, play, file, roles);
        }
    }
    return out.slice(0, MAX_ITEMS);
  },
};
