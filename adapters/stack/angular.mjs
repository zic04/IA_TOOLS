// Stack adapter of the Angular router (ARCHITECTURE.md §5): the screens of its arrays of routes (`const routes: Routes
// = [...]`, `RouterModule.forRoot([...])`, `forChild`, `provideRouter`), their `children` composed with their parents'
// paths, and the lazy ones mounted where `loadChildren` loads them — `() => import('./admin/admin.routes').then(m =>
// m.ADMIN_ROUTES)`, a default export, an NgModule (the routes of its routing module), the old `'./x#XModule'` form —
// when the file imported is among the sources. A record with `component` or `loadComponent` is a screen; a
// `redirectTo`, the `**` "not found" record and a custom `matcher` are not. The guards are `canActivate`, `canMatch`,
// `canLoad` (of the record and of its parents) and `canActivateChild` (of its parents), and the roles of its `data`.
// Angular paths start without "/": the screens are given with one. The reader of route records is shared with the
// Vue Router, React Router and NestJS adapters (engine/facts/stack-js.mjs).
import { routeEntry, composeScreens, routeNode, guardName, metaGuards } from "../../engine/facts/stack-js.mjs";

/** An array of routes written in a call: `RouterModule.forRoot([`, `forChild([`, `provideRouter([`. */
const INLINE = /\b(?:forRoot|forChild|provideRouter)\(\s{0,20}\[/g;
/** The module a `loadChildren` loads, and the export its `then` takes. */
const LAZY_IMPORT = /\bimport\(\s{0,20}["'`]([^"'`\n]{1,300})["'`]\s{0,20}\)/;
const LAZY_EXPORT =
  /\.then\(\s{0,20}\(?\s{0,20}[A-Za-z_$][\w$]{0,63}\s{0,20}\)?\s{0,20}=>\s{0,20}[A-Za-z_$][\w$]{0,63}\.([A-Za-z_$][\w$]{0,63})/;
/** The form of Angular 7 and before: `loadChildren: './admin/admin.module#AdminModule'`. */
const LEGACY_LAZY = /^["']([^"'#\n]{1,300})#([A-Za-z_$][\w$]{0,63})["']/;
const MARKER = /@angular\/router|\bRouterModule\b|@NgModule\b|\bRoutes\b|\bloadChildren\b/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const ANGULAR_PATTERNS = Object.freeze({ INLINE, LAZY_IMPORT, LAZY_EXPORT, LEGACY_LAZY, MARKER });

/** The module a `loadChildren` value mounts: { module, name, routesOf }, or null. */
function lazyRef(text) {
  if (!text) return null;
  const legacy = LEGACY_LAZY.exec(text);
  if (legacy) return { module: legacy[1], name: legacy[2], routesOf: true };
  const spec = LAZY_IMPORT.exec(text);
  return spec ? { module: spec[1], name: LAZY_EXPORT.exec(text)?.[1] ?? "default", routesOf: true } : null;
}

/**
 * An Angular route record: null for a redirect, a custom matcher, the "not found" record and a path that is not a
 * literal (its children are not read either).
 * @param {import("../../engine/facts/stack-js.mjs").RouteRecord} r
 */
function angularNode(r) {
  if (r.has("redirectTo") || r.has("matcher")) return null;
  const path = r.has("path") ? r.string("path") : "";
  if (path === null || path === "**") return null;
  const names = (key) =>
    r
      .elements(key)
      .map((e) => guardName(e, key))
      .filter(Boolean);
  const { children, refs } = r.children();
  const lazy = lazyRef(r.text("loadChildren", 1000));
  return routeNode(r.at, {
    path,
    screen: r.has("component") || r.has("loadComponent"),
    guards: [...names("canActivate"), ...names("canMatch"), ...names("canLoad"), ...metaGuards(r.object("data"))],
    childGuards: names("canActivateChild"),
    children,
    refs: lazy ? [...refs, lazy] : refs,
  });
}

/**
 * The screens of the Angular router of a set of TypeScript files (file → text).
 * @param {Map<string, string>} sources
 */
export function angularScreens(sources) {
  const registry = new Map();
  for (const [file, text] of sources)
    registry.set(file, routeEntry(file, text, { inline: [INLINE], toNode: angularNode }));
  return composeScreens(registry);
}

export default {
  name: "angular",
  files: /\.ts$/,
  marker: MARKER,
  screens: ({ sources }) => angularScreens(sources),
};
