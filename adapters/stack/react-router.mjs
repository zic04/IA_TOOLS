// Stack adapter of React Router (ARCHITECTURE.md §5): the screens of its JSX routes — `<Route path="/orders/:id"
// element={…} />` nested in `<Route path="/admin" element={…}>…</Route>`, `index` routes, pathless layout routes, the
// `component`/`render` forms of version 5 and the `<PrivateRoute>`-like tags written for them — and of its route
// objects (`createBrowserRouter([...])`, `useRoutes([...])`, `const routes: RouteObject[] = [...]`, their `children`,
// `Component`, `lazy`), each path composed with its parents'. A route whose path ends with "/*" mounts the JSX routes
// of the component its element names, when that component is imported from a file among the sources (descendant
// `<Routes>`). A route whose element is only a `<Navigate>` (a redirect) and the "*" route ("not found") are no
// screen. The guards are the wrapper components of an element whose name says so (`<RequireAuth>`, `<ProtectedRoute
// />` of a layout route), a route tag named so, and a `loader` named so; inherited by the children. The existing
// coverage adapter of React Router (adapters/coverage/react-router.mjs) is another thing: it cites routes in pages.
// The reader of route objects is shared with the Vue Router and Angular adapters (engine/facts/stack-js.mjs).
import { callSpan } from "../../engine/facts/behaviour-common.mjs";
import { routeEntry, composeScreens, routeNode, tokenEnd } from "../../engine/facts/stack-js.mjs";

/** An array of route objects written in a call. */
const ROUTER_CALL = /\b(?:create(?:Browser|Hash|Memory|Static)Router|useRoutes)\(\s{0,20}\[/g;
/** An opening or closing route tag: `<Route`, `</Route`, `<PrivateRoute`. */
const ROUTE_TAG = /<(\/?)((?:[A-Z][\w$]{0,40})?Route)(?![\w$])/g;
/** A component an element names: `<RequireAuth`, `<Layout.Main`. */
const ELEMENT = /<([A-Z][\w$]{0,63}(?:\.[A-Z][\w$]{0,63})?)/g;
/** A component or a tag that guards what it wraps. */
const GUARD = /Require|Protected|Private|Guard|Auth(?:enticated|orized)?(?![a-z])/;
/** A loader that guards its route (requireAuth, protectedLoader, authLoader). */
const LOADER_GUARD = /^(?:require|protect|guard)|^auth(?![a-z])|Require|Protect|Guard|Auth(?![a-z])/;
/** An attribute's value that is a string: `"/orders"`, or `{"/orders"}` read inside its braces. */
const STRING_VALUE = /^\s{0,20}["'`]([^"'`\n]{0,500})["'`]\s{0,20}$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;
/** A redirect's element: `<Navigate`, `<Router.Navigate`. */
const NAVIGATE = /(?:^|\.)Navigate$/;
/** The first character of an attribute's name, and the others (`aria-label`, `xlink:href`). */
const NAME_START = /[A-Za-z_$]/;
const NAME_CHAR = /[\w$:-]/;
const MARKER =
  /<[\w$]{0,40}Route\b|\bcreate(?:Browser|Hash|Memory|Static)Router\(|\buseRoutes\(|\bpath\s{0,20}:\s{0,20}["'`]/;
/** A tag is read on this many characters at most. */
const TAG_MAX = 4000;
/** The attributes that give a route what it shows. */
const VIEWS = ["element", "Component", "component", "render", "lazy"];

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const REACT_ROUTER_PATTERNS = Object.freeze({
  ROUTER_CALL,
  ROUTE_TAG,
  ELEMENT,
  GUARD,
  LOADER_GUARD,
  STRING_VALUE,
  IDENTIFIER,
  NAVIGATE,
  NAME_START,
  NAME_CHAR,
  MARKER,
});

const elementNames = (text) => [...text.matchAll(ELEMENT)].map((m) => m[1]);
const navigateOnly = (names) => names.length === 1 && NAVIGATE.test(names[0]);

/** The components a route path ending with "/*" mounts: the JSX routes of the files they come from. */
const descendants = (path, names) => (path?.endsWith("*") ? names.map((local) => ({ local, want: "#jsx" })) : []);

/**
 * The guards of a route: the components of its element that wrap another (all of them, for a layout route whose
 * children render inside), its tag and its loader, when their names say so.
 * @param {{ names: string[], tag: string, loader: string }} info
 * @param {boolean} layout
 */
function guardsOf(info, layout) {
  const out = (layout ? info.names : info.names.slice(0, -1)).filter((n) => GUARD.test(n));
  if (info.tag !== "Route" && GUARD.test(info.tag)) out.unshift(info.tag);
  if (IDENTIFIER.test(info.loader) && LOADER_GUARD.test(info.loader)) out.push(info.loader);
  return [...new Set(out)];
}

/**
 * A route object: null for the "*" route and a path that is not a literal.
 * @param {import("../../engine/facts/stack-js.mjs").RouteRecord} r
 */
function reactNode(r) {
  const path = r.has("path") ? r.string("path") : null;
  if ((r.has("path") && path === null) || path === "*") return null;
  const index = r.text("index", 10).trim() === "true";
  const names = elementNames(r.text("element"));
  const { children, refs } = r.children();
  const mounted = [...refs, ...descendants(path, names)];
  const shown = (r.has("element") && !navigateOnly(names)) || r.has("Component") || r.has("lazy");
  const loader = r.text("loader", 80).trim();
  return routeNode(r.at, {
    path,
    index,
    screen: shown && (path !== null || index),
    guards: guardsOf({ names, tag: "Route", loader }, children.length + mounted.length > 0),
    children,
    refs: mounted,
  });
}

/** Where the opening tag that starts before `from` ends (its ">"), braces and strings followed, TAG_MAX at most. */
function tagSpan(text, from) {
  const limit = Math.min(text.length, from + TAG_MAX);
  let depth = 0;
  for (let i = from; i < limit; i++) {
    const ch = text[i];
    const skip = depth > 0 || ch === '"' || ch === "'" ? tokenEnd(text, i, limit) : -1;
    if (skip !== -1) i = skip - 1;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0)
      return { from, to: i, end: i + 1, closed: true, selfClosing: text[i - 1] === "/" };
  }
  return { from, to: limit, end: limit, closed: false, selfClosing: false };
}

const isBlank = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

/** Reads the attribute at `i` — a name, then `="…"`, `='…'` or `={…}`, or a flag — into `attrs`; the index after it. */
function attributeAt(text, i, to, attrs) {
  let k = i;
  while (k < to && NAME_CHAR.test(text[k])) k++;
  const name = text.slice(i, k);
  let v = k;
  while (v < to && isBlank(text[v])) v++;
  if (text[v] !== "=") {
    if (!attrs.has(name)) attrs.set(name, { flag: true, text: "" });
    return k;
  }
  for (v++; v < to && isBlank(text[v]);) v++;
  if (text[v] === "{") {
    const span = callSpan(text, v, to - v);
    attrs.set(name, { flag: false, text: span.args.slice(0, 2000) });
    return span.end;
  }
  if (text[v] !== '"' && text[v] !== "'") return v;
  const end = tokenEnd(text, v, to);
  attrs.set(name, { flag: false, text: text.slice(v, end) });
  return end;
}

/** The attributes of a tag (between `from` and `to`): name → { flag, text } — a string with its quotes, an expression. */
function attributesOf(text, from, to) {
  const attrs = new Map();
  for (let i = from; i < to;)
    if (text[i] === "{") i = callSpan(text, i, to - i).end;
    else if (NAME_START.test(text[i])) i = attributeAt(text, i, to, attrs);
    else i++;
  return attrs;
}

/** A JSX route tag: its node, and what decides its guards and whether it is a screen once its children are known. */
function jsxNode(text, tag, name, at) {
  const attrs = attributesOf(text, tag.from, tag.to);
  const value = (key) => attrs.get(key)?.text ?? "";
  const path = attrs.has("path") ? (STRING_VALUE.exec(value("path"))?.[1] ?? null) : null;
  const names = elementNames(value("element"));
  const index = attrs.get("index")?.flag === true || value("index").trim() === "true";
  const node = routeNode(at, {
    path,
    index,
    skip: (attrs.has("path") && path === null) || path === "*",
    refs: descendants(path, names),
  });
  const view = VIEWS.some((k) => attrs.has(k));
  const shown = (attrs.has("element") && !navigateOnly(names)) || VIEWS.slice(1).some((k) => attrs.has(k));
  return { node, info: { names, tag: name, loader: value("loader").trim(), shown, view, open: !tag.selfClosing } };
}

/** Closes the innermost open tag of that name (and those left open inside it); a closing tag never opened is ignored. */
function closeTag(stack, counts, name) {
  if (!counts.get(name)) return;
  for (let top = stack.pop(); top; top = stack.pop()) {
    counts.set(top.name, counts.get(top.name) - 1);
    if (top.name === name) return;
  }
}

/**
 * Once the children of the tags are known: the guards of each (a layout's wrappers all count) and whether it is a
 * screen — a route of version 5 that wraps its content (`<Route path="/about"><About /></Route>`) is one too.
 */
function settle(read) {
  for (const { node, info } of read) {
    const layout = node.children.length + node.refs.length > 0;
    node.guards = guardsOf(info, layout);
    const content = info.open && !info.view && !layout && node.path !== null;
    node.screen = (info.shown || content) && (node.path !== null || node.index);
  }
}

/**
 * The JSX routes of a file, nested as written: each tag read once (TAG_MAX characters at most), outside comments.
 * @param {string} text
 * @param {string} file
 * @param {{ lineOf: (i: number) => number, inComment: (i: number) => boolean }} index
 */
function jsxRoutes(text, file, index) {
  const roots = [];
  const stack = [];
  const counts = new Map();
  const read = [];
  ROUTE_TAG.lastIndex = 0;
  for (let m = ROUTE_TAG.exec(text); m; m = ROUTE_TAG.exec(text)) {
    if (index.inComment(m.index)) continue;
    if (m[1]) {
      closeTag(stack, counts, m[2]);
      continue;
    }
    const tag = tagSpan(text, m.index + m[0].length);
    ROUTE_TAG.lastIndex = Math.max(ROUTE_TAG.lastIndex, tag.end);
    if (!tag.closed) continue;
    const { node, info } = jsxNode(text, tag, m[2], { file, line: index.lineOf(m.index) });
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    read.push({ node, info });
    if (info.open) {
      stack.push({ name: m[2], node });
      counts.set(m[2], (counts.get(m[2]) ?? 0) + 1);
    }
  }
  settle(read);
  return roots;
}

/**
 * The screens of React Router in a set of files (file → text): route objects and JSX routes.
 * @param {Map<string, string>} sources
 */
export function reactRouterScreens(sources) {
  const registry = new Map();
  for (const [file, text] of sources) {
    const entry = routeEntry(file, text, { inline: [ROUTER_CALL], toNode: reactNode });
    const jsx = jsxRoutes(text, file, entry.index);
    if (jsx.length) entry.arrays.set("#jsx", jsx);
    registry.set(file, entry);
  }
  return composeScreens(registry);
}

export default {
  name: "react-router",
  files: /\.(?:jsx|tsx|js|ts|mjs)$/,
  marker: MARKER,
  screens: ({ sources }) => reactRouterScreens(sources),
};
