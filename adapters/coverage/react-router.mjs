// Coverage adapter of a React Router application: routes declared in source files (`file`: one path or a
// list), found with `pattern` (a regular expression whose named group `path`, else its first group, is the path;
// default: path="…", path: "…" or path='…', paths containing "*" left out). A relative path ("orders/:id") is
// prefixed with `prefix` (default "/"). A route is covered when it is cited as is, with :id, {id} or [id], or by
// its static prefix.
//   coverage: [{ adapter: "react-router", file: "../../frontend/src/App.tsx", prefix: "/admin/", exclude: ["^/$", "^/admin$"] }]
import { routeMatches, excludeItems } from "../../engine/check/coverage.mjs";

export default {
  name: "react-router",
  options: {
    file: { type: ["string", "array"], items: { type: "string" }, default: "src/App.tsx" },
    pattern: { type: "string", minLength: 1, default: "\\bpath\\s*[=:]\\s*[\"'`]([^\"'`*]+)[\"'`]" },
    prefix: { type: "string", default: "/" },
    family: { type: "string", minLength: 1, default: "Routes" },
    exclude: { type: "array", items: { type: "string" }, default: ["^/$"] },
  },
  async inventory({ options, tools }) {
    const files = [].concat(options.file);
    const missing = files.find((f) => !tools.exists(f));
    if (missing) return { available: false, reason: "notFound", vars: { path: missing } };
    const re = new RegExp(options.pattern, "g");
    const prefix = options.prefix.endsWith("/") ? options.prefix : options.prefix + "/";
    const routes = new Set();
    for (const f of files)
      for (const m of tools.read(f).matchAll(re)) {
        const p = (m.groups?.path ?? m[1] ?? "").trim();
        if (!p) continue;
        routes.add(p.startsWith("/") ? p : (prefix + p).replace(/\/{2,}/g, "/"));
      }
    const items = [...routes].sort().map((id) => ({ id, match: routeMatches(id) }));
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
