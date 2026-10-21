// Stack adapter of Django and of Django REST framework (ARCHITECTURE.md §5, §6.9): the `urlpatterns` of each urls
// module — `path("orders/<int:pk>/", views.detail)`, `re_path(r"^orders/(?P<pk>\d+)/$", …)` and the older `url(…)`,
// a pattern kept as written but for its ^ and $ anchors — composed through `include("orders.urls")` (the module
// found among the files read), `include([...])` lists and the DRF routers that `include(router.urls)` or
// `urlpatterns += router.urls` mount (`router.register(r"orders", OrderViewSet)`: "/orders/" and "/orders/{pk}/").
// The root is a urls module no other includes. A route answers every method ("ANY") unless its view is a function
// decorated with `@api_view([...])`, `@require_http_methods([...])`, `@require_GET`, `@require_POST` or
// `@require_safe`. Its guards come from its view, found by name in its module through the imports of the urls file:
// the view's decorators (`@login_required`, `@permission_required(…)`, `@staff_member_required`,
// `@permission_classes([...])`, `@method_decorator(…)` on the class or on its `dispatch`), its guard mixins
// (`LoginRequiredMixin`, `PermissionRequiredMixin`…) and its `permission_classes`; a view whose module is not among
// the files read has none. The admin site is guarded by itself ("admin.site"). A route in a comment or a docstring
// is none. The readers of Python it shares with the Flask adapter are engine/facts/stack-py.mjs.
import { textIndex, pyCommentRanges, callSpan } from "../../engine/facts/behaviour-common.mjs";
import {
  STACK_PY_PATTERNS,
  pyImports,
  pyModuleFile,
  pyGuard,
  pyJoin,
  pyCalls,
  literalOf,
} from "../../engine/facts/stack-py.mjs";
import { MAX_ITEMS, withGuards } from "../../engine/facts/stack-common.mjs";

const { LITERAL, QUOTED_WORD } = STACK_PY_PATTERNS;
const URLPATTERNS = /\burlpatterns\b/;
const PATH_CALL = /(?<![\w.])(path|re_path|url)\(/g;
const INCLUDE = /^include\s{0,20}\(/;
const ADMIN = /^[\w.]{0,64}\.site\.urls\b/;
/** A view, a module or a router: `views.detail`, `OrderList.as_view`, `router.urls`. */
const DOTTED = /^\s{0,200}([A-Za-z_]\w{0,63}(?:\.[A-Za-z_]\w{0,63}){0,5})/;
const ROUTER = /\b(\w{1,64})[ \t]{0,20}=[ \t]{0,20}(?:\w{1,64}\.)?(?:Default|Simple)Router\(/g;
const NO_TRAILING_SLASH = /\btrailing_slash\s{0,20}=\s{0,20}False\b/;
const REGISTER = /\b(\w{1,64})\.register\(/g;
/** `urlpatterns += router.urls`, `[...] + router.urls`, `urlpatterns = router.urls`. */
const MOUNTED = /(?:\+=?|\burlpatterns[ \t]{0,20}=)[ \t]{0,20}(\w{1,64})\.urls\b/g;
/** A decorator, a function or a class, with its indentation (a method's is not empty). */
const DEFINITION =
  /^([ \t]{0,200})(?:@([A-Za-z_][\w.]{0,120})|(?:async[ \t]{1,20})?(def|class)[ \t]{1,20}([A-Za-z_]\w{0,120}))/gm;
const CLASS_ATTRIBUTE = /^[ \t]{1,200}(permission_classes|lookup_field)[ \t]{0,20}=[ \t]{0,20}/gm;
const NAME = /[A-Za-z_][\w.]{0,120}/g;
const STRING = /"[^"\n]{0,500}"|'[^'\n]{0,500}'/g;
const KEYWORD_ARGUMENT = /\b\w{1,64}\s{0,20}=[^,)\]]{0,200}/g;
const GUARD_MIXIN = /(?:Required|Permission|Login|PassesTest|Staff|Superuser|Role|Group|Auth)\w{0,60}Mixin$/;
/** A word of Python that is no name of a guard. */
const KEYWORD = /^(?:True|False|None|lambda|and|or|not)$/;
/** A route translated by gettext: `path(_("orders/"), …)`. */
const TRANSLATED = /^\s{0,200}_\(/;
const AS_VIEW = /\.as_view$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const DJANGO_PATTERNS = Object.freeze({
  URLPATTERNS,
  PATH_CALL,
  INCLUDE,
  ADMIN,
  DOTTED,
  ROUTER,
  NO_TRAILING_SLASH,
  REGISTER,
  MOUNTED,
  DEFINITION,
  CLASS_ATTRIBUTE,
  NAME,
  STRING,
  KEYWORD_ARGUMENT,
  GUARD_MIXIN,
  KEYWORD,
  TRANSLATED,
  AS_VIEW,
});

/** At most this many entries read in all: urls modules that include one another many times are not read past it. */
const MAX_VISITS = 50_000;
const SAFE_METHODS = { require_GET: ["GET"], require_POST: ["POST"], require_safe: ["GET", "HEAD"] };

/** The names of a piece of code (`[IsAuthenticated, IsAdminUser]`), its strings and keyword arguments left out. */
const namesIn = (code) =>
  [...code.replace(STRING, "").replace(KEYWORD_ARGUMENT, "").matchAll(NAME)]
    .map((m) => m[0])
    .filter((n) => !KEYWORD.test(n));

/** The depth a bracket adds. */
const BRACKETS = { "(": 1, "[": 1, "{": 1, ")": -1, "]": -1, "}": -1 };

/** The index of the quote that closes the string opened at `i` (or the end of the text). */
function quoteEnd(s, i) {
  let k = i + 1;
  for (; k < s.length && s[k] !== s[i]; k++) if (s[k] === "\\") k++;
  return k;
}

/** The first two arguments of a call (top-level commas; strings and brackets followed), each with its index. */
function firstTwo(args, base) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < args.length && out.length < 2; i++) {
    const c = args[i];
    if (c === '"' || c === "'") i = quoteEnd(args, i);
    else if (c === "," && depth === 0) {
      out.push({ text: args.slice(from, i), at: base + from });
      from = i + 1;
    } else depth += BRACKETS[c] ?? 0;
  }
  if (out.length < 2 && from < args.length) out.push({ text: args.slice(from), at: base + from });
  return out;
}

/** Applies one decorator of a view: its methods, or its guards. */
function decorate(view, { name, args }) {
  const last = name.slice(name.lastIndexOf(".") + 1);
  const quoted = [...args.matchAll(QUOTED_WORD)].map((q) => q[1].toUpperCase());
  if (last === "api_view") view.methods = quoted.length ? quoted : ["GET"];
  else if (last === "require_http_methods") view.methods = quoted;
  else if (SAFE_METHODS[last]) view.methods = SAFE_METHODS[last];
  else if (last === "permission_classes") view.guards = withGuards(view.guards, namesIn(args));
  else if (last === "method_decorator") view.guards = withGuards(view.guards, namesIn(args).filter(pyGuard));
  else if (pyGuard(name)) view.guards = withGuards(view.guards, [name]);
}

/** A function or a class of a module read: its pending decorators applied; a top-level one is a view. */
function define(state, m, args) {
  const [, indent, , kind, name] = m;
  const view = { guards: [], methods: null, lookup: null };
  for (const d of state.pending) decorate(view, d);
  state.pending = [];
  if (indent) {
    // A method: a decorated `dispatch` guards its class (`@method_decorator(login_required)`).
    if (state.current && name === "dispatch") state.current.guards = withGuards(state.current.guards, view.guards);
    return;
  }
  state.current = kind === "class" ? view : null;
  if (state.current) {
    view.guards = withGuards(
      view.guards,
      namesIn(args).filter((b) => GUARD_MIXIN.test(b)),
    );
    state.classes.push({ at: m.index, view });
  }
  if (!state.views.has(name)) state.views.set(name, view);
}

/** The `permission_classes` and `lookup_field` of the classes of a module (`classes` sorted by place). */
function classAttributes(text, index, classes) {
  let k = -1;
  for (const m of text.matchAll(CLASS_ATTRIBUTE)) {
    while (k + 1 < classes.length && classes[k + 1].at < m.index) k++;
    if (k < 0 || index.inComment(m.index)) continue;
    const at = m.index + m[0].length;
    const owner = classes[k].view;
    if (m[1] === "lookup_field") owner.lookup = literalOf(LITERAL.exec(text.slice(at, at + 600))) ?? null;
    else if (text[at] === "[" || text[at] === "(")
      owner.guards = withGuards(owner.guards, namesIn(callSpan(text, at, 2000, "py").args));
  }
}

/**
 * The views of a module, by name: { guards, methods (null: every method), lookup (a viewset's `lookup_field`) }, read
 * from its top-level functions and classes (decorators, bases, `permission_classes`, a decorated `dispatch`).
 * @param {string} text
 */
export function djangoViews(text) {
  const index = textIndex(text, pyCommentRanges(text, { docstrings: true }));
  const state = { views: new Map(), classes: [], pending: [], current: null };
  DEFINITION.lastIndex = 0;
  for (let m = DEFINITION.exec(text); m; m = DEFINITION.exec(text)) {
    if (index.inComment(m.index)) continue;
    const end = m.index + m[0].length;
    const span = text[end] === "(" ? callSpan(text, end, 2000, "py") : { args: "", end };
    DEFINITION.lastIndex = Math.max(DEFINITION.lastIndex, span.end);
    if (m[2]) state.pending.push({ name: m[2], args: span.args });
    else define(state, m, span.args);
  }
  classAttributes(text, index, state.classes);
  return state.views;
}

/** What an entry's view argument names: an include (a module, a list, a router), the admin site, or a view. */
function targetOf(text, index, arg, depth) {
  const code = arg.text.trim();
  if (INCLUDE.test(code)) {
    const open = arg.at + arg.text.indexOf("(");
    const span = callSpan(text, open, 4000, "py");
    const inner = span.args.trim();
    if (inner.startsWith("["))
      return { inline: depth < 3 ? entriesOf(text, index, open + 1, span.end - 1, depth + 1) : [] };
    const module = literalOf(LITERAL.exec(inner.startsWith("(") ? inner.slice(1) : inner));
    if (module !== undefined) return { module };
    const expr = DOTTED.exec(inner)?.[1];
    return expr ? { included: expr } : {};
  }
  if (ADMIN.test(code)) return { admin: true };
  const expr = DOTTED.exec(code)?.[1];
  return expr ? { view: expr.replace(AS_VIEW, "") } : {};
}

/** The pattern of a `re_path` without its anchors. */
function unanchored(p) {
  const from = p.startsWith("^") ? p.slice(1) : p;
  return from.endsWith("$") ? from.slice(0, -1) : from;
}

/** The entries of the urlpatterns of a text between `from` and `to` (each call read once, its arguments 4,000 at most). */
function entriesOf(text, index, from, to, depth) {
  const out = [];
  const part = from === 0 && to === text.length ? text : text.slice(from, to);
  const re = new RegExp(PATH_CALL.source, "g");
  for (let m = re.exec(part); m; m = re.exec(part)) {
    const at = from + m.index;
    if (index.inComment(at)) continue;
    const open = at + m[0].length - 1;
    const span = callSpan(text, open, Math.min(4000, to - open), "py");
    re.lastIndex = Math.max(re.lastIndex, span.end - from);
    const [first, second] = firstTwo(span.args, open + 1);
    const piece = literalOf(LITERAL.exec((first?.text ?? "").replace(TRANSLATED, "")));
    if (piece === undefined || !second) continue;
    const entry = { piece: m[1] === "path" ? piece : unanchored(piece), line: index.lineOf(at) };
    out.push(Object.assign(entry, targetOf(text, index, second, depth)));
  }
  return out;
}

/** The DRF routers of a file: name → { trailing, registrations: [{ prefix, viewset, line }] }. */
function routersOf(text, index) {
  const routers = new Map();
  for (const { m, args } of pyCalls(ROUTER, text, index))
    routers.set(m[1], { trailing: !NO_TRAILING_SLASH.test(args), registrations: [] });
  for (const { m, args } of pyCalls(REGISTER, text, index)) {
    const [first, second] = firstTwo(args, 0);
    const prefix = literalOf(LITERAL.exec(first?.text ?? ""));
    const viewset = DOTTED.exec(second?.text ?? "")?.[1];
    if (routers.has(m[1]) && prefix !== undefined && viewset)
      routers.get(m[1]).registrations.push({ prefix, viewset, line: index.lineOf(m.index) });
  }
  return routers;
}

/** The readers of a set of files, each file read once: its urls, its routers, its views, its imports. */
function context(sources) {
  const cache = new Map();
  const once = (kind, file, read) => {
    const key = `${kind}:${file}`;
    if (!cache.has(key)) cache.set(key, read(sources.get(file)));
    return cache.get(key);
  };
  const indexOf = (file) => once("index", file, (t) => textIndex(t, pyCommentRanges(t, { docstrings: true })));
  const imports = (file) => once("imports", file, pyImports);
  const moduleOf = (file, expr) => {
    const [head, ...rest] = expr.split(".");
    const b = imports(file).get(head);
    return pyModuleFile(b ? [pyJoin(b.module, b.name), ...rest].join(".") : expr, sources, file);
  };
  const symbolOf = (file, expr) => {
    const parts = expr.split(".");
    const name = parts.pop();
    const b = parts.length ? null : imports(file).get(name);
    if (b) return { file: pyModuleFile(b.module, sources, file), name: b.name };
    return { file: parts.length ? moduleOf(file, parts.join(".")) : file, name };
  };
  const routers = (file) => once("routers", file, (t) => routersOf(t, indexOf(file)));
  const ctx = {
    urls: (file) =>
      once("urls", file, (t) => ({
        entries: entriesOf(t, indexOf(file), 0, t.length, 0),
        mounts: [...t.matchAll(MOUNTED)].filter((m) => !indexOf(file).inComment(m.index)).map((m) => m[1]),
      })),
    view(file, expr) {
      const s = symbolOf(file, expr);
      return s.file ? once("views", s.file, djangoViews).get(s.name) : undefined;
    },
    router(file, expr) {
      const s = symbolOf(file, expr);
      const router = s.file ? routers(s.file).get(s.name) : undefined;
      return router && { file: s.file, ...router };
    },
    /** The urls module an include names, or null. */
    included(file, e) {
      if (!("target" in e))
        e.target = e.module ? pyModuleFile(e.module, sources, file) : e.included ? moduleOf(file, e.included) : null;
      return e.target;
    },
    visits: 0,
  };
  return ctx;
}

/** Adds an item to the source (MAX_ITEMS at most), its route starting with one "/", its guards a copy. */
function add(items, method, route, file, line, guards) {
  let b = 0;
  while (route[b] === "/") b++;
  if (items.length < MAX_ITEMS) items.push({ method, route: "/" + route.slice(b), file, line, guards: [...guards] });
}

/** The two routes of each registration of a DRF router, under a prefix. */
function routerItems(ctx, router, prefix, items) {
  const slash = router.trailing ? "/" : "";
  for (const r of router.registrations) {
    if (items.length >= MAX_ITEMS) return;
    const view = ctx.view(router.file, r.viewset);
    const base = prefix + r.prefix;
    for (const route of [base + slash, `${base}/{${view?.lookup ?? "pk"}}${slash}`])
      add(items, "ANY", route, router.file, r.line, view?.guards ?? []);
  }
}

/** The items of a view: one per method it answers ("ANY" when every one). */
function viewItems(ctx, file, e, route, items) {
  const view = ctx.view(file, e.view);
  for (const method of view?.methods ?? ["ANY"]) add(items, method, route, file, e.line, view?.guards ?? []);
}

/** The items of an include: a DRF router's, or a urls module's (`stack`: those being read, no cycle, 8 deep). */
function includeItems(ctx, file, e, route, stack, items) {
  const router = e.included?.endsWith(".urls") ? ctx.router(file, e.included.slice(0, -5)) : null;
  const target = router ? null : ctx.included(file, e);
  if (router) routerItems(ctx, router, route, items);
  else if (target && !stack.includes(target) && stack.length < 8) expand(ctx, target, route, [...stack, target], items);
}

/** The items of one entry of a urls file under a prefix. */
function emit(ctx, file, e, prefix, stack, items) {
  if (items.length >= MAX_ITEMS || ++ctx.visits > MAX_VISITS) return;
  const route = prefix + e.piece;
  if (e.inline) for (const x of e.inline) emit(ctx, file, x, route, stack, items);
  else if (e.admin) add(items, "ANY", route, file, e.line, ["admin.site"]);
  else if (e.view) viewItems(ctx, file, e, route, items);
  else if (e.module || e.included) includeItems(ctx, file, e, route, stack, items);
}

/** The items of a urls file under a prefix. */
function expand(ctx, file, prefix, stack, items) {
  const { entries, mounts } = ctx.urls(file);
  for (const e of entries)
    if (items.length < MAX_ITEMS && ctx.visits < MAX_VISITS) emit(ctx, file, e, prefix, stack, items);
  for (const name of mounts.slice(0, 64)) {
    const router = ctx.router(file, name);
    if (router) routerItems(ctx, router, prefix, items);
  }
}

/** Every entry of a list, those of its `include([...])` lists too. */
const flat = (entries) => entries.flatMap((e) => [e, ...flat(e.inline || [])]);

/**
 * The Django routes of a set of Python files (file → text): { method, route, file, line, guards }, sorted by route,
 * method and file, from each root urls module (one that no other includes).
 * @param {Map<string, string>} sources
 */
export function djangoRoutes(sources) {
  const ctx = context(sources);
  const urls = [...sources.keys()].filter((f) => URLPATTERNS.test(sources.get(f)));
  const included = new Set();
  for (const f of urls) for (const e of flat(ctx.urls(f).entries)) included.add(ctx.included(f, e));
  const items = [];
  for (const f of urls) if (!included.has(f)) expand(ctx, f, "", [f], items);
  return items.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

export default {
  name: "django",
  files: /\.py$/,
  api: ({ sources }) => djangoRoutes(sources),
};
