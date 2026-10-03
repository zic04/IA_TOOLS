// Coverage adapter of a `doc-kit facts` file (ARCHITECTURE.md §6.9): one item per fact, for the sources where
// being cited in the documentation means something: `env` (its name), `api` (METHOD route, in its {id}, :id and
// [id] forms), `db` (the table), `dependencies` (the direct dependencies only) and `agents` (the file).
//   coverage: [{ adapter: "facts", source: "env" }, { adapter: "facts", source: "api", family: "API routes" }]
// Missing facts/<source>.json: { available: false, reason: "noFacts" } (run `doc-kit facts` first).
// `dependencies` is searched across the whole application (§6.9: a separate front end and API, each with its own
// manifest), so the same package can be direct in more than one manifest: de-duplicated by id for coverage, so
// citing it once covers every manifest that names it.
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";

/** The first item of each distinct `id` (a name recurring across manifests counts once for coverage). */
function deduplicate(items) {
  const seen = new Set();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** Default family name of each source the adapter knows how to cite. */
const DEFAULT_FAMILY = Object.freeze({ env: "Environment variables", api: "API routes", db: "Tables", dependencies: "Dependencies", agents: "Agent instruction files" });

/** The coverage item of one fact of `source`, or null when that source has nothing worth citing (e.g. a transitive dependency). */
function itemOf(source, fact) {
  if (source === "env") return { id: fact.name, match: [fact.name] };
  if (source === "api") return { id: `${fact.method} ${fact.route}`, match: routeMatches(fact.route).map((r) => `${fact.method} ${r}`) };
  if (source === "db") return { id: fact.table, match: [fact.table] };
  if (source === "dependencies") return fact.direct ? { id: fact.name, match: [fact.name] } : null;
  if (source === "agents") return { id: fact.file, match: [fact.file] };
  return null;
}

export default {
  name: "facts",
  options: {
    source: { type: "string", minLength: 1, required: true },
    family: { type: "string", minLength: 1 },
    dir: { type: "string", minLength: 1, default: "facts" },
    exclude: { type: "array", items: { type: "string" }, default: [] },
  },
  async inventory({ options, tools }) {
    const file = `${options.dir}/${options.source}.json`;
    if (!tools.exists(file)) return { available: false, reason: "noFacts", vars: { source: options.source } };
    let data;
    try {
      data = tools.json(file);
    } catch (e) {
      return { available: false, reason: "error", vars: { error: String(e.message).split("\n")[0] } };
    }
    const items = deduplicate((Array.isArray(data.items) ? data.items : []).map((f) => itemOf(options.source, f)).filter(Boolean));
    const family = options.family || DEFAULT_FAMILY[options.source] || options.source;
    return { available: true, families: [{ name: family, items: excludeItems(items, options.exclude) }] };
  },
};
