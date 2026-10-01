// Coverage adapter of a Next.js application (App Router): one item per route, read from the page files of the
// `app` folder (page.tsx, page.ts, page.jsx, page.js, page.mdx).
//   Route groups "(marketing)" and parallel slots "@modal" add no segment; intercepting routes "(.)photo",
//   "(..)photo", "(...)photo" and private folders "_lib" are skipped; dynamic segments "[id]", "[...slug]",
//   "[[...slug]]" are kept. A route is covered when it is cited as is, with :id, {id} or [id], or by its static
//   prefix ("/orders/" for "/orders/[id]").
//   coverage: [{ adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] }]
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";

const PAGE = /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/;

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
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.app)) return { available: false, reason: "notFound", vars: { path: options.app } };
    const routes = new Set(
      tools
        .walk(options.app)
        .filter((f) => PAGE.test(f))
        .map(routeOf)
        .filter((r) => r !== null)
    );
    const items = [...routes].sort().map((id) => ({ id, match: routeMatches(id) }));
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
