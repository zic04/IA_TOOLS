// The facts sources (ARCHITECTURE.md §6.9, §6.13), in the order `doc-kit facts` writes them: one entry per source,
// with the function that collects it. The CLI (cli/commands/facts.mjs) and, later, the bricks read this list; a new
// source is one entry here (and its module), never a new branch in a command.
// `collect` receives the seams of the run: the application folder, `exec` (external programs, git), `fetch` (only
// with --network), the configuration, `network` — null, or `{ registries, answers }`: what is private and never sent
// (AUDIT.md S13, engine/facts/network.mjs), and the registries' answers of the run, by package, shared by the sources
// (one request a package between `dependencies` and `quality`) — and `stacks` and `infra`, the stack and infra
// adapters of the run (engine/facts/stacks.mjs, infra.mjs; the kit's when not given).
import { collectDependencies } from "./dependencies.mjs";
import { collectEnv } from "./env.mjs";
import { collectApi, collectScreens } from "./api.mjs";
import { collectStack } from "./languages.mjs";
import { collectDb } from "./db.mjs";
import { collectInfra } from "./infra.mjs";
import { collectBehaviours } from "./behaviours.mjs";
import { collectAgents } from "./agents.mjs";
import { collectSecrets } from "./secrets.mjs";
import { collectSecurity } from "./security.mjs";
import { collectQuality } from "./quality.mjs";
import { collectTests } from "./tests.mjs";
import { collectModules } from "./modules.mjs";
import { collectHistory } from "./history.mjs";
import { checkExistence } from "./network.mjs";

/**
 * @typedef {{ appDir: string,
 *   exec: (bin: string, args: string[], options?: any) => ({ status: any, stdout: any, stderr?: any }|null),
 *   fetch?: (url: string, options?: any) => Promise<any>, config: any,
 *   network: { registries: ReturnType<typeof import("./network.mjs").privateRegistries>,
 *     answers?: Map<string, Promise<any>> }|null,
 *   stacks?: readonly import("./stacks.mjs").StackAdapter[], infra?: readonly import("./infra.mjs").InfraAdapter[] }} Seams
 * @typedef {{ items: Array<object>, extra?: object, unreadable?: Array<{ file: string, reason: string }> }} Collected
 */

/** The items of a reader that lists in `unreadable` the files it does not read (over 512 KB: readCode), with them. */
const withUnreadable = (collect) => {
  const unreadable = [];
  return { items: collect(unreadable), unreadable };
};

/** @type {ReadonlyArray<{ name: string, collect: (seams: Seams) => Collected|Promise<Collected> }>} */
const FACT_SOURCES = Object.freeze([
  {
    name: "dependencies",
    async collect({ appDir, fetch, network }) {
      const unreadable = [];
      const items = collectDependencies(appDir, unreadable);
      // --network: what each direct, public dependency's registry says of it (never a private name).
      return {
        items: network
          ? await checkExistence(items, fetch, { registries: network.registries, answers: network.answers })
          : items,
        unreadable,
      };
    },
  },
  { name: "stack", collect: ({ appDir, stacks }) => collectStack(appDir, stacks) },
  { name: "env", collect: ({ appDir }) => withUnreadable((unreadable) => collectEnv(appDir, unreadable)) },
  {
    name: "api",
    collect: ({ appDir, config, stacks }) => ({ items: collectApi(appDir, config.review?.guards, stacks) }),
  },
  {
    name: "screens",
    collect: ({ appDir, config, stacks }) => ({ items: collectScreens(appDir, config.review?.guards, stacks) }),
  },
  { name: "db", collect: ({ appDir }) => withUnreadable((unreadable) => collectDb(appDir, unreadable)) },
  { name: "infra", collect: ({ appDir, infra }) => ({ items: collectInfra(appDir, infra) }) },
  { name: "behaviours", collect: ({ appDir, stacks }) => collectBehaviours(appDir, stacks) },
  { name: "agents", collect: ({ appDir }) => withUnreadable((unreadable) => collectAgents(appDir, unreadable)) },
  { name: "secrets", collect: ({ appDir, exec }) => ({ items: collectSecrets(appDir, exec) }) },
  { name: "security", collect: ({ appDir, exec }) => ({ items: collectSecurity(appDir, exec) }) },
  {
    name: "quality",
    async collect({ appDir, fetch, network }) {
      const { items, summary, unreadable } = await collectQuality(appDir, {
        fetch: network ? fetch : undefined,
        dependencies: collectDependencies(appDir),
        registries: network?.registries,
        answers: network?.answers,
      });
      return { items, extra: { summary }, unreadable };
    },
  },
  {
    name: "tests",
    collect({ appDir }) {
      const { items, summary, unreadable } = collectTests(appDir);
      return { items, extra: { summary }, unreadable };
    },
  },
  {
    name: "modules",
    collect({ appDir }) {
      const { items, summary } = collectModules(appDir);
      return { items, extra: { summary } };
    },
  },
  {
    name: "history",
    collect({ appDir, exec }) {
      const { items, summary } = collectHistory(appDir, exec);
      return { items, extra: { summary } };
    },
  },
]);

/** The names of the facts sources, in the order they are written. */
export const SOURCE_NAMES = Object.freeze(FACT_SOURCES.map((s) => s.name));

/**
 * Collects one source.
 * @param {string} name   one of SOURCE_NAMES
 * @param {Seams} seams
 * @returns {Promise<Collected>}
 */
export async function collectSource(name, seams) {
  const source = FACT_SOURCES.find((s) => s.name === name);
  if (!source) throw new Error(`unknown facts source: ${name}`); // a defect: the CLI checks the names first
  return source.collect(seams);
}
