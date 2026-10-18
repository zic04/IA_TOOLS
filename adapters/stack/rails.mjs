// Stack adapter of Ruby on Rails (ARCHITECTURE.md §5, §6.9). The routes of config/routes.rb — `get "/x", to: "c#a"`,
// `post "x" => "c#a"`, `match … via:`, `root`, `resources` (seven actions, update answering PATCH and PUT; `only:`,
// `except:`, nested blocks, `member`, `collection`, `on:`), `resource` (singular), `namespace`, `scope` (`path:`,
// `module:`), `controller`, `mount` — by a walk of its lines that counts the `do`/`end` of its blocks (32 deep at
// most). A route's guards: its controller action's (app/controllers/…_controller.rb and its parents: `before_action`
// with `only:`/`except:` and `skip_before_action`, `load_and_authorize_resource`, Pundit's `authorize`; a loader such
// as `set_*` is none) and the blocks `authenticate :user do`, `constraints AdminConstraint do` around it. The hints of
// app/: `.order`, `.limit`, `.offset`, `.per(n)`, `per_page:`, `params[:q]`, a model's `validates` and the SQL of
// `.where` (engine/facts/behaviour-sql.mjs). Not read: `devise_for`, `concern` blocks, `draw(:file)`.
import { textIndex, pyCommentRanges, paramSignal } from "../../engine/facts/behaviour-common.mjs";
import { sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { MAX_ITEMS, singular, withGuards } from "../../engine/facts/stack-common.mjs";

const ROUTES_FILE = /(?:^|\/)config\/routes\.rb$/;
const WORD = /^([a-z_]{1,40})(?![\w:])/;
const BLOCK = /\bdo(?:[ \t]{0,20}\|[^|\n]{0,200}\|)?[ \t]{0,200}$/;
const OPENER = /^(?:if|unless|case|begin|while|until|for|def|class|module)\b/;
const FIRST = /^[ \t(]{0,20}(?:["']([^"'\n]{0,300})["']|:(\w{1,64}))/;
const SYMBOL = /^[ \t(]{0,20}:(\w{1,64}[!?]?)[ \t)]{0,20}$/;
const TARGET = /(?:=>|\bto:)[ \t]{0,20}["']([\w/]{1,120})#(\w{1,64})["']/;
const CONTROLLER_ACTION = /["']([\w/]{1,120})#(\w{1,64})["']/;
const CONTROLLER = /\bcontroller:[ \t]{0,20}["':]([\w/]{1,120})/;
const ACTION = /\baction:[ \t]{0,20}["':](\w{1,64})/;
const ON = /\bon:[ \t]{0,20}:(member|collection)\b/;
const VIA = /\bvia:[ \t]{0,20}(?:\[([^\]\n]{0,200})\]|%i[[(]([^\])\n]{0,200})[\])]|:(\w{1,20}))/;
const ONLY = /\b(only|except):[ \t]{0,20}(?:\[([^\]\n]{0,300})\]|%[iw][[(]([^\])\n]{0,300})[\])]|:(\w{1,40}))/;
const PATH_OPTION = /\bpath:[ \t]{0,20}["']([^"'\n]{0,300})["']/;
const MODULE = /\bmodule:[ \t]{0,20}["':]([\w/]{1,120})/;
const PARAM = /\bparam:[ \t]{0,20}:(\w{1,64})/;
const AT = /(?:=>|\bat:)[ \t]{0,20}["']([^"'\n]{0,300})["']/;
const CONSTANT = /^[ \t(]{0,20}([A-Z][\w:]{0,120})/;
const WORDS = /\w{1,40}/g;
const CLASS_LINE = /^[ \t]{0,200}class[ \t]{1,20}([\w:]{1,200})(?:[ \t]{0,20}<[ \t]{0,20}([\w:]{1,200}))?/m;
const CALLBACK =
  /^[ \t]{0,200}(before_action|prepend_before_action|before_filter|skip_before_action|skip_before_filter|load_and_authorize_resource|authorize_resource)\b([^\n]{0,1000})/gm;
const DEF = /^[ \t]{0,200}def[ \t]{1,20}(\w{1,64}[!?]?)/gm;
const AUTHORIZE = /\bauthorize!?(?![\w?])/;
const ORDER =
  /\.(?:order|reorder)\([ \t]{0,20}(?:(\w{1,64}):[ \t]{0,20}:(asc|desc)\b|:(\w{1,64})|["'](\w{1,64})(?:[ \t]{1,20}(asc|desc|ASC|DESC))?["'])/g;
const PER = /\.per\([ \t]{0,20}(\d{1,6})[ \t]{0,20}\)|\bper_page:[ \t]{0,20}(\d{1,6})/g;
const LIMIT = /\.(limit|offset)\([ \t]{0,20}(\d{1,6})?/g;
const PARAMS = /\bparams(?:\[:(\w{1,40})\](?![ \t]{0,20}\[)|\.fetch\([ \t]{0,20}:(\w{1,40}))/g;
const VALIDATES = /^[ \t]{0,200}validates(?:_(presence|uniqueness)_of)?[ \t]{1,20}/gm;
const HASH = /\b(length|format|numericality|inclusion):[ \t]{0,20}(?:\{([^}]{0,300})\}|(true))/g;
const NUMBER =
  /\b(maximum|minimum|is|greater_than_or_equal_to|greater_than|less_than_or_equal_to|less_than):[ \t]{0,20}(\d{1,9})/g;
const RANGE = /\bin:[ \t]{0,20}(\d{1,9})\.\.\.?(\d{1,9})/;
const LIST = /\bin:[ \t]{0,20}(?:%w[[(]([^\])]{0,300})[\])]|\[([^\]]{0,300})\])/;
/** A value of a list of `inclusion: { in: […] }`: a string or a symbol. */
const LIST_VALUE = /["':](\w{1,40})/g;
const BLANKS = /\s+/;
/** A callback that loads a record or sets a value: no guard. */
const LOADER = /^(?:set|find|load|fetch|build|prepare|assign)_/;
/** A controller's class name: its suffix, and the capitals of its words (`OrderItemsController` → order_items). */
const CONTROLLER_SUFFIX = /Controller$/;
const CAMEL = /([a-z\d])([A-Z])/g;
/** The options of a validation read as a whole. */
const EMAIL = /EMAIL/i;
const PRESENCE = /\bpresence:[ \t]{0,20}true\b/;
const UNIQUENESS = /\buniqueness:[ \t]{0,20}(?:true|\{)/;
const ONLY_INTEGER = /only_integer:[ \t]{0,20}true/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const RAILS_PATTERNS = Object.freeze({
  ...{ ROUTES_FILE, WORD, BLOCK, OPENER, FIRST, SYMBOL, TARGET, CONTROLLER_ACTION, CONTROLLER, ACTION, ON, VIA },
  ...{ ONLY, PATH_OPTION, MODULE, PARAM, AT, CONSTANT, WORDS, CLASS_LINE, CALLBACK, DEF, AUTHORIZE, ORDER },
  ...{ PER, LIMIT, PARAMS, VALIDATES, HASH, NUMBER, RANGE, LIST, LIST_VALUE, BLANKS, LOADER, CONTROLLER_SUFFIX },
  ...{ CAMEL, EMAIL, PRESENCE, UNIQUENESS, ONLY_INTEGER },
});

/** At most this many callbacks read in a controller, and names in one: an action's guards cost a bounded time. */
const MAX_FILTERS = 64;
const MAX_FILTER_NAMES = 8;
/** The routes of `resources`: action, method, path after the base (":member": after the member's path). */
const PLURAL = ["index GET ", "create POST ", "new GET /new", "edit GET :member/edit", "show GET :member"]
  .concat(["update PATCH :member", "update PUT :member", "destroy DELETE :member"])
  .map((s) => s.split(" "));
/** The routes of a singular `resource`: no index, no :id. */
const SINGULAR = PLURAL.filter(([action]) => action !== "index").map(([a, m, p]) => [a, m, p.replace(":member", "")]);
const BRACKETS = { "(": 1, "[": 1, "{": 1, ")": -1, "]": -1, "}": -1 };

/** A route made of parts: one "/" between them, none at its end ("/" alone for the root). */
const joined = (...parts) => "/" + parts.join("/").split("/").filter(Boolean).join("/");
/** The words of a list option (`[:index, :show]`, `%i[index show]`, `:index`) matched by ONLY. */
const wordsOf = (m) => (m ? [...(m[2] ?? m[3] ?? m[4] ?? "").matchAll(WORDS)].map((w) => w[0]) : []);
/** The leading symbols of an argument list (`:a, :b, only: …` → a, b). */
function symbolsOf(text) {
  const symbols = text.split(",").map((part) => SYMBOL.exec(part)?.[1]);
  return symbols.includes(undefined) ? symbols.slice(0, symbols.indexOf(undefined)) : symbols;
}

/** A controller's path from its class name: `Admin::OrderItemsController` → admin/order_items. */
const controllerPath = (name) => name.replace(CONTROLLER_SUFFIX, "").split("::").map(snakeCase).join("/");
const snakeCase = (s) => s.replace(CAMEL, "$1_$2").toLowerCase();

/** A controller's parent, its callbacks in order and the actions that call `authorize` (Pundit, CanCanCan). */
function readController(text) {
  const index = textIndex(text, pyCommentRanges(text));
  const parent = CLASS_LINE.exec(text)?.[2];
  const filters = [];
  for (const m of text.matchAll(CALLBACK)) {
    if (filters.length >= MAX_FILTERS) break;
    if (index.inComment(m.index)) continue;
    const names = m[1].endsWith("authorize_resource")
      ? [m[1]]
      : symbolsOf(m[2])
          .filter((n) => !LOADER.test(n))
          .slice(0, MAX_FILTER_NAMES);
    const only = ONLY.exec(m[2]);
    const list = (kind) => only?.[1] === kind && wordsOf(only);
    filters.push({ skip: m[1].startsWith("skip_"), names, only: list("only"), except: list("except") });
  }
  const defs = [...text.matchAll(DEF)].filter((m) => !index.inComment(m.index));
  const authorized = new Map();
  for (const [k, m] of defs.entries()) {
    const body = text.slice(m.index + m[0].length, Math.min(defs[k + 1]?.index ?? text.length, m.index + 4000));
    const call = AUTHORIZE.exec(body);
    if (call) authorized.set(m[1], [call[0]]);
  }
  return { parent: parent ? controllerPath(parent) : null, filters, authorized };
}

/**
 * The guards of a controller's action (32 at most): its parents' callbacks, then its own (a skip removes one), then
 * `authorize`; each action read once (`ctx.memo`), a cycle of parents stopping at the controller met again.
 */
function actionGuards(ctx, path, action, depth = 0) {
  const key = `${path}#${action}`;
  const c = depth < 6 && !ctx.memo.has(key) ? ctx.controller(path) : null;
  if (!c) return ctx.memo.get(key) ?? [];
  ctx.memo.set(key, []);
  // A parent named inside the module of the controller (`module Admin` … `< BaseController`) is looked for there first.
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  const parent = [dir && c.parent && dir + c.parent, c.parent].find((p) => p && ctx.controller(p));
  const names = filtered(new Set(parent ? actionGuards(ctx, parent, action, depth + 1) : []), c.filters, action);
  for (const n of c.authorized.get(action) || []) names.add(n);
  ctx.memo.set(key, [...names].slice(0, 32));
  return ctx.memo.get(key);
}

/** The callback names of an action after a controller's callbacks: each adds its names, a skip removes them. */
function filtered(names, filters, action) {
  for (const f of filters) {
    if ((f.only && !f.only.includes(action)) || (f.except && f.except.includes(action))) continue;
    for (const n of f.names)
      if (f.skip) names.delete(n);
      else names.add(n);
  }
  return names;
}

/** The name a block or a statement gives first: a string or a symbol (`:admin`, `"/api"`). */
const firstOf = (rest) => ((m) => m?.[1] ?? m?.[2])(FIRST.exec(rest));

/** The contexts a block opens, by its word: each from the context around it and the rest of its statement. */
const BLOCKS = {
  namespace(rest, top) {
    const name = firstOf(rest) ?? "";
    return { ...top, prefix: joined(top.prefix, PATH_OPTION.exec(rest)?.[1] ?? name), module: `${top.module}${name}/` };
  },
  scope(rest, top) {
    const module = MODULE.exec(rest)?.[1];
    const path = FIRST.exec(rest)?.[1] ?? PATH_OPTION.exec(rest)?.[1] ?? "";
    return { ...top, prefix: joined(top.prefix, path), module: module ? `${top.module}${module}/` : top.module };
  },
  member: (rest, top) => (top.resource ? { ...top, prefix: top.resource.member, on: "member" } : { ...top }),
  collection: (rest, top) =>
    top.resource ? { ...top, prefix: top.resource.collection, on: "collection" } : { ...top },
  controller: (rest, top) => ({ ...top, controller: `${top.module}${firstOf(rest) ?? ""}` }),
  authenticate: (rest, top) => ({ ...top, guards: withGuards(top.guards, ["authenticate"]) }),
  authenticated: (rest, top) => ({ ...top, guards: withGuards(top.guards, ["authenticated"]) }),
  constraints: (rest, top) => ({ ...top, guards: withGuards(top.guards, CONSTANT.exec(rest)?.slice(1, 2) ?? []) }),
  concern: (rest, top) => ({ ...top, skip: true }),
};

/** The paths and the controller of a resource of `resources` (or `resource`, `one`) under the context `top`. */
function resourceOf(one, name, rest, top) {
  const base = joined(top.prefix, PATH_OPTION.exec(rest)?.[1] ?? name);
  const param = PARAM.exec(rest)?.[1] ?? "id";
  const controller = `${top.module}${CONTROLLER.exec(rest)?.[1] ?? (one ? `${name}s` : name)}`;
  const member = one ? base : joined(base, `:${param}`);
  return { member, collection: base, nested: one ? base : joined(base, `:${singular(name)}_${param}`), controller };
}

/** The routes of `resources :a, :b, only: […]` (or `resource :x`, `one`); the last one, for its block. */
function resources(one, rest, top, route) {
  const only = ONLY.exec(rest);
  const kept = (action) => !only || (only[1] === "only") === wordsOf(only).includes(action);
  let last = null;
  for (const name of symbolsOf(rest)) {
    last = resourceOf(one, name, rest, top);
    for (const [action, method, path] of one ? SINGULAR : PLURAL) {
      const full = path.startsWith(":member") ? last.member + path.slice(7) : last.collection + path;
      if (kept(action)) route(method, full, last.controller, action);
    }
  }
  return last;
}

/** The controller and the action of a verb's route: `to:`, `=>`, `controller:`/`action:`, else its block's. */
function targetOf(rest, top, first) {
  const target = TARGET.exec(rest);
  const named = CONTROLLER.exec(rest)?.[1] ?? target?.[1];
  const controller = named ? `${top.module}${named}` : (top.controller ?? top.resource?.controller);
  return { controller, action: ACTION.exec(rest)?.[1] ?? target?.[2] ?? first };
}

/** The methods of `match … via: [:get, :post]` ("ANY" for `via: :all` or none). */
function viaMethods(rest) {
  const via = VIA.exec(rest);
  if (!via || via[3] === "all") return ["ANY"];
  return [...(via[1] ?? via[2] ?? via[3]).matchAll(WORDS)].map((w) => w[0].toUpperCase());
}

/** The routes of `get "path"` (or a symbol, in a resource), `post`, `put`, `patch`, `delete`, `match`. */
function verbRoutes(word, rest, top, route) {
  const name = firstOf(rest);
  if (name === undefined) return;
  const on = ON.exec(rest)?.[1] ?? top.on;
  const base = top.resource && on ? top.resource[on] : top.prefix;
  const { controller, action } = targetOf(rest, top, name);
  for (const method of word === "match" ? viaMethods(rest) : [word.toUpperCase()])
    route(method, joined(base, name), controller, action);
}

/** The routes of a statement of config/routes.rb, by its word: `route(method, path, controller, action)`. */
const STATEMENTS = {
  resources: (rest, top, route) => resources(false, rest, top, route),
  resource: (rest, top, route) => resources(true, rest, top, route),
  root(rest, top, route) {
    const target = CONTROLLER_ACTION.exec(rest);
    route("GET", joined(top.prefix), target && `${top.module}${target[1]}`, target?.[2]);
  },
  mount: (rest, top, route) => route("ANY", joined(top.prefix, AT.exec(rest)?.[1] ?? ""), null, null),
};
for (const w of ["get", "post", "put", "patch", "delete", "match"])
  STATEMENTS[w] = (rest, top, route) => verbRoutes(w, rest, top, route);

/** The lines of a statement from `start`: its code outside comments, with its next lines while it ends with a comma. */
function statementAt(text, start, comments) {
  let code = "";
  let next = start;
  for (let n = 0; n < 6 && next < text.length; n++) {
    const found = text.indexOf("\n", next);
    const end = found === -1 ? text.length : found;
    code = `${code} ${text.slice(next, Math.min(comments.cutOf(next, end), next + 2000)).trim()}`.trim();
    next = end + 1;
    if (!code.endsWith(",")) break;
  }
  return { code, next };
}

/** The comments of a text, walked in order: where the code of a line ends (its comment, or its end). */
function commentsOf(ranges) {
  let r = 0;
  return {
    cutOf(start, end) {
      while (r < ranges.length && ranges[r][1] <= start) r++;
      return r < ranges.length && ranges[r][0] < end ? Math.max(start, ranges[r][0]) : end;
    },
  };
}

/** The blocks open at a place: a `do` or an `if`, `def`… pushes, an `end` pops; past 32 deep they are only counted. */
function blocks() {
  const stack = [{ prefix: "/", module: "", guards: [], resource: null, on: null, controller: null, skip: false }];
  let deeper = 0;
  return {
    top: () => stack.at(-1),
    open: (context) => (stack.length >= 32 ? deeper++ : stack.push(context)),
    close: () => (deeper ? deeper-- : stack.length > 1 && stack.pop()),
  };
}

/**
 * The routes of a config/routes.rb: { method, route, file, line, guards }.
 * @param {string} text
 * @param {string} file
 * @param {(controller: string, action: string) => string[]} [guardsOf]   the guards of a controller's action
 */
export function railsRoutes(text, file, guardsOf = () => []) {
  const ranges = pyCommentRanges(text);
  const index = textIndex(text, ranges);
  const comments = commentsOf(ranges);
  const open = blocks();
  const items = [];
  for (let start = 0; start < text.length;) {
    const at = start;
    const { code, next } = statementAt(text, start, comments);
    start = next;
    const word = WORD.exec(code)?.[1] ?? "";
    if (word === "end") {
      open.close();
      continue;
    }
    const top = open.top();
    const opens = BLOCK.test(code);
    const rest = (opens ? code.replace(BLOCK, "") : code).slice(word.length);
    const route = (method, path, controller, action) => {
      if (top.skip || items.length >= MAX_ITEMS) return;
      const guards = withGuards(top.guards, controller && action ? guardsOf(controller, action) : []);
      items.push({ method, route: path, file, line: index.lineOf(at), guards });
    };
    const resource = Object.hasOwn(STATEMENTS, word) ? STATEMENTS[word](rest, top, route) : null;
    if (resource && opens) open.open({ ...top, prefix: resource.nested, resource, on: null });
    else if (opens) open.open(Object.hasOwn(BLOCKS, word) ? BLOCKS[word](rest, top) : { ...top });
    else if (OPENER.test(code)) open.open({ ...top });
  }
  return items;
}

/**
 * The Rails routes of a set of files (config/routes.rb, the Ruby files of app/): those of each routes file, the
 * guards read in the controllers of the same application; sorted by route, method and file.
 * @param {Map<string, string>} sources
 */
export function railsApi(sources) {
  const cache = new Map();
  const items = [];
  for (const [file, text] of sources) {
    if (!ROUTES_FILE.test(file)) continue;
    const root = file.slice(0, file.length - "config/routes.rb".length);
    const controller = (path) => {
      const f = `${root}app/controllers/${path}_controller.rb`;
      if (!cache.has(f)) cache.set(f, sources.has(f) ? readController(sources.get(f)) : null);
      return cache.get(f);
    };
    const ctx = { controller, memo: new Map() };
    items.push(...railsRoutes(text, file, (path, action) => actionGuards(ctx, path, action)));
  }
  return items.sort(
    (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method) || a.file.localeCompare(b.file),
  );
}

/** A statement from `from`: up to a line end outside brackets that does not follow a comma, 1,000 characters at most. */
function statementFrom(text, from) {
  const limit = Math.min(text.length, from + 1000);
  let depth = 0;
  let last = "";
  for (let i = from; i < limit; i++) {
    const c = text[i];
    if (c === "\n" && depth <= 0 && last !== ",") return text.slice(from, i);
    depth += BRACKETS[c] ?? 0;
    if (c.trim()) last = c;
  }
  return text.slice(from, limit);
}

/** The signals of the bounds of a `length:` or `numericality:` hash. */
const BOUND = { maximum: ["max"], minimum: ["min"], is: ["min", "max"], greater_than_or_equal_to: ["min"] };
Object.assign(BOUND, { greater_than: ["min"], less_than_or_equal_to: ["max"], less_than: ["max"] });

/** The values of an `inclusion: { in: … }` hash: `%w[a b]`, `["a", "b"]`, `[:a, :b]`. */
function valuesOf(body) {
  const list = LIST.exec(body);
  if (!list) return [];
  return list[1] ? list[1].trim().split(BLANKS) : [...list[2].matchAll(LIST_VALUE)].map((v) => v[1]);
}

/** The hints of one hash of a validation (`length: { maximum: 80 }`…), through `each(signal, extra, family)`. */
function hashHints(kind, body, each) {
  if (kind === "format") return each(EMAIL.test(body) ? "email" : "pattern");
  if (kind === "inclusion") return each("enum", { values: valuesOf(body) }, "values");
  if (kind === "numericality") each(ONLY_INTEGER.test(body) ? "integer" : "type", { value: "number" });
  for (const n of body.matchAll(NUMBER)) for (const signal of BOUND[n[1]]) each(signal, { value: Number(n[2]) });
  const range = RANGE.exec(body);
  if (range) each("min", { value: Number(range[1]) });
  if (range) each("max", { value: Number(range[2]) });
}

/** The validation hints of one `validates` statement (or `validates_presence_of`…), for each of its fields. */
function validations(text, m, push) {
  const stmt = statementFrom(text, m.index + m[0].length);
  const fields = symbolsOf(stmt);
  const each = (signal, extra = {}, family = "validation") => {
    for (const field of fields) push({ family, signal, field, via: "rails", ...extra }, m.index);
  };
  if (m[1] === "presence" || PRESENCE.test(stmt)) each("required");
  if (m[1] === "uniqueness" || UNIQUENESS.test(stmt)) each("unique");
  for (const h of stmt.matchAll(HASH)) hashHints(h[1], h[2] ?? "", each);
}

/** The parameters of a request that are never a criterion: the route's own. */
const ROUTE_PARAMS = new Set(["id", "controller", "action", "format"]);

/** The hint of `.order(…)`: its field and direction. */
function orderHint(m) {
  const value = (m[2] ?? m[5] ?? "asc").toLowerCase();
  return { family: "sort", signal: "orderBy", field: m[1] ?? m[3] ?? m[4], value, via: "activerecord" };
}

/** The hint of a parameter read (`params[:q]`), but the route's own. */
const paramHint = (m, name = m[1] ?? m[2]) =>
  ROUTE_PARAMS.has(name) ? null : { ...paramSignal(name), field: name, via: "rails" };

/**
 * The hints of the expressions of app/, by expression: a signal, or null.
 * @type {Array<[RegExp, (m: RegExpMatchArray) => object|null]>}
 */
const HINTS = [
  [ORDER, orderHint],
  [PER, (m) => ({ family: "pagination", signal: "pageSize", value: Number(m[1] ?? m[2]), via: "rails" })],
  [LIMIT, (m) => ({ family: "pagination", signal: m[1], value: m[2] ? Number(m[2]) : undefined, via: "activerecord" })],
  [PARAMS, paramHint],
];

/**
 * The behaviour hints of a Ruby file of app/, pushed into the sink of its file (engine/facts/behaviour-common.mjs).
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function railsBehaviours(text, sink) {
  for (const [re, hint] of HINTS)
    for (const m of text.matchAll(re)) {
      const signal = hint(m);
      if (signal) sink.push(signal, m.index);
    }
  for (const m of text.matchAll(VALIDATES)) validations(text, m, sink.push);
  if (!sink.full) sqlBehaviours(text, sink);
}

export default {
  name: "rails",
  files: /(?:^|\/)(?:config\/routes\.rb|app\/.{1,400}\.rb)$/,
  api: ({ sources }) => railsApi(sources),
  behaviours: (text, sink) => railsBehaviours(text, sink),
};
