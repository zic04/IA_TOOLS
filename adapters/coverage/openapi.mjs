// Coverage adapter of an OpenAPI 3 or Swagger 2 document (ARCHITECTURE.md §6.8), in JSON: one item per operation,
// id "GET /orders/{id}", label its summary or operationId, covered as is, with :id, {id} or [id], or by its static
// prefix. The kit carries no YAML parser (FastAPI serves its document as JSON at /openapi.json): a YAML file is
// reported as unavailable, not failed.
//   coverage: [{ adapter: "openapi", file: "../../openapi.json", prefix: "/api", exclude: ["^/health$"] }]
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";

/** HTTP methods an OpenAPI/Swagger path item may declare (the other keys, parameters, $ref…, are not operations). */
const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

export default {
  name: "openapi",
  options: {
    file: { type: "string", minLength: 1, required: true },
    family: { type: "string", minLength: 1, default: "API" },
    prefix: { type: "string", default: "" },
    exclude: { type: "array", items: { type: "string" }, default: [] },
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.file)) return { available: false, reason: "notFound", vars: { path: options.file } };
    if (/\.ya?ml$/i.test(options.file)) return { available: false, reason: "yaml" };
    const doc = tools.json(options.file);
    const items = [];
    for (const [route, ops] of Object.entries(doc.paths || {})) {
      const full = options.prefix + route;
      for (const [method, op] of Object.entries(ops || {})) {
        if (!METHODS.has(method.toLowerCase()) || !op || typeof op !== "object") continue;
        const verb = method.toUpperCase();
        const label = op.summary || op.operationId;
        items.push({ id: `${verb} ${full}`, ...(label ? { label } : {}), match: routeMatches(full).map((r) => `${verb} ${r}`) });
      }
    }
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
