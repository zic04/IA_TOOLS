// Coverage adapter of a FastAPI application: one item per route handler (GET /api/orders/{id}), sharing the
// parsers of engine/facts/api.mjs with the `api` facts source (`APIRouter(prefix)` and `include_router(prefix)`
// are resolved across every Python file of `app` before the decorators are read).
//   coverage: [{ adapter: "fastapi", app: "../../backend", exclude: ["^GET /health$"] }]
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";
import { fastapiRoutes } from "../../engine/facts/api.mjs";

export default {
  name: "fastapi",
  options: {
    app: { type: "string", minLength: 1, default: "." },
    family: { type: "string", minLength: 1, default: "API" },
    exclude: { type: "array", items: { type: "string" }, default: [] },
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.app)) return { available: false, reason: "notFound", vars: { path: options.app } };
    const files = tools.walk(options.app).filter((f) => f.endsWith(".py"));
    const sources = new Map(files.map((f) => [f, tools.read(`${options.app}/${f}`)]));
    const items = fastapiRoutes(sources).map((r) => ({ id: `${r.method} ${r.route}`, match: routeMatches(r.route).map((x) => `${r.method} ${x}`) }));
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
