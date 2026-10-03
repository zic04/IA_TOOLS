// Route → files, for the built-in coverage adapters, without modifying them (ARCHITECTURE.md §6.10, "Dependencies
// of a page"). Every returned path is relative to the documentation project ("projRel": consistent with the
// adapters' own options, e.g. `app: "../../app"`); the caller (engine/sync/dependencies.mjs) converts them to
// paths relative to the application with its own `appRelOf`.
import { routeOf } from "../../adapters/coverage/next-app-router.mjs";
import { fastapiRoutes } from "../facts/api.mjs";
import { normalize } from "../check/coverage.mjs";

const PAGE_FILE = /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/;
const LAYOUT_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

/** Folders of a file, from its own folder up to (and including) the root folder, deepest first. */
function foldersUpTo(file, root) {
  const parts = file.split("/").slice(0, -1);
  const out = [];
  for (let i = parts.length; i >= 0; i--) out.push([root, ...parts.slice(0, i)].filter(Boolean).join("/"));
  return out;
}

/**
 * Files of a route, for the adapter that covers it.
 * @param {object} p
 * @param {{ adapter: string }} p.spec     the configuration entry (config.coverage[i])
 * @param {object} p.options               the adapter's validated options (loadAdapter)
 * @param {object|null} p.item             the matched inventory item (may already carry `files`)
 * @param {string} p.route                 the page's route
 * @param {object} p.tools                 adapterTools(root): exists, read, walk…
 * @returns {string[]} paths relative to the documentation project
 */
export function routeFiles({ spec, options, item, route, tools }) {
  if (item?.files) return item.files;
  switch (spec.adapter) {
    case "next-app-router": {
      const pages = tools.walk(options.app).filter((f) => PAGE_FILE.test(f) && routeOf(f) === route);
      const out = new Set(pages.map((f) => `${options.app}/${f}`));
      for (const f of pages)
        for (const dir of foldersUpTo(f, options.app))
          for (const ext of LAYOUT_EXTENSIONS) {
            const rel = `${dir}/layout.${ext}`;
            if (tools.exists(rel)) out.add(rel);
          }
      return [...out];
    }
    case "react-router":
      return [].concat(options.file);
    case "fastapi": {
      const files = tools.walk(options.app).filter((f) => f.endsWith(".py"));
      const sources = new Map(files.map((f) => [f, tools.read(`${options.app}/${f}`)]));
      const matching = fastapiRoutes(sources).filter((r) => `${r.method} ${r.route}` === item?.id);
      return [...new Set(matching.map((r) => `${options.app}/${r.file}`))];
    }
    case "glob":
      return [`${options.base}/${item.id}`];
    default:
      return [];
  }
}

/** The inventory item whose `match` contains `route` (normalised comparison), else whose `id === route`, else null. */
export function matchRoute(route, items) {
  const n = normalize(route);
  return items.find((it) => (it.match || []).some((m) => normalize(m) === n)) ?? items.find((it) => it.id === route) ?? null;
}
