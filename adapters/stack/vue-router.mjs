// Stack adapter of Vue Router (ARCHITECTURE.md §5): the screens of `createRouter({ routes: [...] })`, of an array of
// routes (`const routes = [...]`, `RouteRecordRaw[]`, `export default [...]`) and of the arrays it mounts (`children`,
// a spread `...adminRoutes`, from this file or imported), each path composed with its parents'. A `redirect` record
// and a catch-all are no screen (their children are read). The guards are a record's `beforeEnter` and its `meta`
// (`requiresAuth: true` → "requiresAuth", `roles: ['admin']` → "roles(admin)"), inherited by its children.
// The reader of route records it shares with the Angular, React Router and NestJS adapters is
// engine/facts/stack-js.mjs.
import { routeEntry, composeScreens, routeNode, guardName, metaGuards } from "../../engine/facts/stack-js.mjs";

/** The routes of `createRouter({ routes: [` and `new VueRouter({ routes: [`. */
const ROUTES_KEY = /\broutes\s{0,20}:\s{0,20}\[/g;
/** Vue Router's catch-all, the "not found" page: `/:pathMatch(.*)*`. */
const CATCH_ALL = /\(\.\*\)/;
const MARKER = /\bpath\s{0,20}:\s{0,20}["'`]|["']vue-router["']/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const VUE_ROUTER_PATTERNS = Object.freeze({ ROUTES_KEY, CATCH_ALL, MARKER });

/**
 * A Vue Router record: its path, whether it is a screen, its guards and its children.
 * @param {import("../../engine/facts/stack-js.mjs").RouteRecord} r
 */
function vueNode(r) {
  const path = r.string("path");
  if (path === null || path === "*" || CATCH_ALL.test(path)) return null;
  const guards = [
    ...r
      .elements("beforeEnter")
      .map((e) => guardName(e, "beforeEnter"))
      .filter(Boolean),
    ...metaGuards(r.object("meta")),
  ];
  const screen = !r.has("redirect") && (r.has("component") || r.has("components"));
  return routeNode(r.at, { path, screen, guards, ...r.children() });
}

/**
 * The screens of the Vue Router of a set of files (file → text).
 * @param {Map<string, string>} sources
 */
export function vueScreens(sources) {
  const registry = new Map();
  for (const [file, text] of sources)
    registry.set(file, routeEntry(file, text, { inline: [ROUTES_KEY], toNode: vueNode }));
  return composeScreens(registry);
}

export default {
  name: "vue-router",
  files: /\.(?:js|ts|mjs|cjs|vue)$/,
  marker: MARKER,
  screens: ({ sources }) => vueScreens(sources),
};
