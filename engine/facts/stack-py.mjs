// The readers of Python the stack adapters of Flask and Django share (adapters/stack/flask.mjs, django.mjs;
// ARCHITECTURE.md §5, §6.9): the names a file imports from its modules, the file of a module among the sources, each
// call of an expression with its arguments read once, a literal and its value, the quoted words of a list, and
// whether a decorator may guard a view. Each adapter keeps what is its own: its routes, its blueprints or its urls
// modules, its views. Bounded expressions only (RULES.md S5, test/tools/redos-worker.mjs).
import { callSpan } from "./behaviour-common.mjs";

/** The expressions of this module, by name (test/tools/redos-worker.mjs, RULES.md S5). */
export const STACK_PY_PATTERNS = Object.freeze({
  /** A path, a prefix or a module written as a literal ("…", '…', r"…"). */
  LITERAL: /^\s{0,200}[rRuU]?(?:"([^"\n]{0,500})"|'([^'\n]{0,500})')/,
  /** A word of a list, quoted: an HTTP method of `methods=[…]`, of `@api_view([…])`. */
  QUOTED_WORD: /["']([A-Za-z_]\w{0,63})["']/g,
  /** `from <module> import `, with its leading dots (a relative module). */
  FROM_IMPORT: /^[ \t]{0,200}from[ \t]{1,20}(\.{0,4})(\w[\w.]{0,200})?[ \t]{1,20}import[ \t]{1,20}/gm,
  /** A comment after a name imported, the blanks between the words of a name imported, and one such word. */
  COMMENT: /#[^\n]{0,500}/g,
  BLANKS: /\s+/,
  WORD: /^\w{1,64}$/,
  /** The leading dots of a relative module. */
  DOTS: /^\.{0,8}/,
});
const P = STACK_PY_PATTERNS;

/** Decorators that never guard a view: its route, methods, cache, rate limit, CSRF, schema or documentation. */
const NOT_GUARDS = new Set(
  (
    "route get post put patch delete api_view require_http_methods require_GET require_POST require_safe " +
    "csrf_exempt csrf_protect ensure_csrf_cookie exempt cache_page cached memoize cache_control never_cache " +
    "vary_on_headers vary_on_cookie gzip_page condition etag last_modified sensitive_post_parameters " +
    "sensitive_variables xframe_options_exempt xframe_options_deny xframe_options_sameorigin atomic action " +
    "extend_schema extend_schema_view swagger_auto_schema swag_from doc response marshal_with marshal_list_with " +
    "expect input output arguments use_args use_kwargs validate limit limits cross_origin staticmethod classmethod " +
    "property cached_property wraps with_appcontext retry throttle_classes renderer_classes parser_classes " +
    "authentication_classes schema before_request after_request errorhandler"
  ).split(" "),
);

/**
 * Whether a decorator may guard a view: any but those of NOT_GUARDS, read on its last segment (`auth.login_required`).
 * @param {string} name
 * @returns {boolean}
 */
export const pyGuard = (name) => !NOT_GUARDS.has(name.slice(name.lastIndexOf(".") + 1));

/**
 * The module `name` of a module (`from <module> import <name>`): ".", "views" → ".views"; "a", "b" → "a.b".
 * @param {string} module
 * @param {string} name
 * @returns {string}
 */
export const pyJoin = (module, name) => (module === "" || module.endsWith(".") ? module + name : `${module}.${name}`);

/**
 * The value of a literal an expression matched — LITERAL, or an adapter's own with the same two groups (Flask's
 * URL_PREFIX) —, or undefined.
 * @param {RegExpExecArray|null} m
 * @returns {string|undefined}
 */
export const literalOf = (m) => (m ? (m[1] ?? m[2]) : undefined);

/**
 * The names a Python file imports from its modules: local name → { module, name } (`from .orders import bp as
 * orders_bp`: orders_bp → { module: ".orders", name: "bp" }). A plain `import a.b` binds no name here.
 * @param {string} text
 * @returns {Map<string, { module: string, name: string }>}
 */
export function pyImports(text) {
  const out = new Map();
  P.FROM_IMPORT.lastIndex = 0;
  for (let m = P.FROM_IMPORT.exec(text); m; m = P.FROM_IMPORT.exec(text)) {
    const at = m.index + m[0].length;
    let names = text.slice(at, at + 500).split("\n")[0];
    if (text[at] === "(") {
      const span = callSpan(text, at, 2000, "py");
      names = span.args;
      P.FROM_IMPORT.lastIndex = Math.max(P.FROM_IMPORT.lastIndex, span.end);
    }
    for (const part of names.split(",")) {
      const words = part.replace(P.COMMENT, "").trim().split(P.BLANKS);
      const local = words[1] === "as" ? words[2] : words[0];
      if (P.WORD.test(words[0]) && P.WORD.test(local || ""))
        out.set(local, { module: m[1] + (m[2] || ""), name: words[0] });
    }
  }
  return out;
}

/**
 * The file of a Python module among `files`: `.views` from `orders/urls.py` → orders/views.py (or
 * orders/views/__init__.py); `orders.views` → that path from the folder of `from` or of one of its parents (the
 * project's root: the folder of manage.py, a src/ layout), the closest first. Null when none is among `files`.
 * @param {string} module
 * @param {{ has: (file: string) => boolean }} files
 * @param {string} from
 * @returns {string|null}
 */
export function pyModuleFile(module, files, from) {
  const dots = P.DOTS.exec(module)[0].length;
  const parts = module.slice(dots).split(".").filter(Boolean);
  const dir = from.split("/").slice(0, -1);
  const bases = dots
    ? dots - 1 <= dir.length
      ? [dir.slice(0, dir.length - (dots - 1))]
      : []
    : [...dir.map((_, k) => dir.slice(0, dir.length - k)), []];
  for (const base of bases) {
    const p = [...base, ...parts].join("/");
    if (!p) continue;
    for (const f of [`${p}.py`, `${p}/__init__.py`]) if (files.has(f)) return f;
  }
  return null;
}

/**
 * Each call of `re` (a global expression ending with "(") outside the comments, with its arguments (4,000
 * characters at most; "" when it does not close): the next call is looked for after them (walked once).
 * @param {RegExp} re
 * @param {string} text
 * @param {{ inComment: (i: number) => boolean }} index
 * @returns {Generator<{ m: RegExpExecArray, args: string, end: number }>}
 */
export function* pyCalls(re, text, index) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (index.inComment(m.index)) continue;
    const span = callSpan(text, m.index + m[0].length - 1, 4000, "py");
    re.lastIndex = Math.max(re.lastIndex, span.end);
    yield { m, args: span.args, end: span.end };
  }
}
