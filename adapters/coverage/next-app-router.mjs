// Coverage adapter of a Next.js application (App Router): one item per route, read from the page files of the
// `app` folder (page.tsx, page.ts, page.jsx, page.js, page.mdx).
//   Route groups "(marketing)" and parallel slots "@modal" add no segment; intercepting routes "(.)photo",
//   "(..)photo", "(...)photo" and private folders "_lib" are skipped; dynamic segments "[id]", "[...slug]",
//   "[[...slug]]" are kept. A route is covered when it is cited as is, with :id, {id} or [id], or by its static
//   prefix ("/orders/" for "/orders/[id]").
//   coverage: [{ adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] }]
//   `api: true` (ARCHITECTURE.md §6.9) adds a second family, one item per route handler (GET /api/orders/[id]),
//   from the `route.ts|js` files of the same `app` folder: no change to the page family when it is left out.
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";
import { nextRouteMethods } from "../../engine/facts/api.mjs";

const PAGE = /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/;
const ROUTE_HANDLER = /(^|\/)route\.(ts|js|tsx|jsx)$/;

/** Route of a page file (path relative to the app folder), or null when the file is not a route of its own. */
export function routeOf(file) {
  const out = [];
  for (const s of file.split("/").slice(0, -1)) {
    if (/^\(\.{1,3}\)/.test(s)) return null; // intercepting route
    if (s.startsWith("_")) return null; // private folder
    if (/^\(.*\)$/.test(s) || s.startsWith("@")) continue; // route group, parallel slot
    out.push(s);
  }
  return "/" + out.join("/");
}

export default {
  name: "next-app-router",
  options: {
    app: { type: "string", minLength: 1, default: "app" },
    family: { type: "string", minLength: 1, default: "Routes" },
    exclude: { type: "array", items: { type: "string" }, default: ["^/$"] },
    api: { type: "boolean", default: false },
    apiFamily: { type: "string", minLength: 1, default: "API" },
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.app)) return { available: false, reason: "notFound", vars: { path: options.app } };
    const files = tools.walk(options.app);
    const routes = new Set(files.filter((f) => PAGE.test(f)).map(routeOf).filter((r) => r !== null));
    const items = [...routes].sort().map((id) => ({ id, match: routeMatches(id) }));
    const families = [{ name: options.family, items: excludeItems(items, options.exclude) }];
    if (options.api) {
      const apiItems = [];
      for (const f of files.filter((f) => ROUTE_HANDLER.test(f))) {
        const route = routeOf(f);
        if (route === null) continue;
        const source = tools.read(`${options.app}/${f}`);
        for (const method of nextRouteMethods(source)) apiItems.push({ id: `${method} ${route}`, match: routeMatches(route).map((r) => `${method} ${r}`) });
      }
      families.push({ name: options.apiFamily, items: excludeItems(apiItems, options.exclude) });
    }
    return { available: true, families };
  },
};
