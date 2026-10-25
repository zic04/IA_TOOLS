// The access of a route or a screen from the names of its guards (ARCHITECTURE.md §6.13), for the `api` and
// `screens` sources (engine/facts/api.mjs) and for an adapter that keeps a hook only when it may deny a request
// (Flask's before_request, always "unknown": HOOK_GUARD) or qualifies one it cannot read as a check of every request
// (partialGuard: Next's lookups in a body, Rails's callbacks under a condition). `auth` is "none" (no guard), "role"
// (a guard of a role, a permission or a scope, checked first), "user" (a guard of a signed-in user) or "unknown" (a
// guard that says neither). A name is read whole, or word by word, never as a part of another word: `get_session` (a
// database session), `VerifyCsrfToken` (a CSRF check) and `IsAuthenticatedOrReadOnly` (anonymous reads) name no
// user; an expression is as weak as its weakest alternative (`hasRole('ADMIN') or permitAll()`), a negation is none,
// so that a route may look less protected than it is, never more but in the known cases of SECURITY.md (what the
// names do not tell: a per-request override, a method-level rule that loosens its class's). A role word counts in
// the called name only (`admin_crud.get_db` names no role), never in a loader's (`loadRoles`). Bounded, linear
// expressions only (RULES.md S5, test/tools/redos-worker.mjs).

/** A word of a name: a run of capitals (`JWT` of `JWTAuth`), a capitalised or lower-case word, a number. */
const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g;
/**
 * The user guards known by their whole form: `auth` and `auth:<guard>` (Laravel, an Express middleware; Next's
 * `auth()` in a handler's body is a partial guard), ASP.NET's `Authorize` and `RequireAuthorization` without a policy
 * or a role, `AuthGuard(…)` (NestJS) and `authGuard` (Angular), `authenticate` and `authenticate_<scope>!` (Rails,
 * Devise).
 */
const USER_FORM = /^(?:auth(?::\w{1,40})?|authorize|requireauthorization|authguard|authenticate(?:_\w{1,40})?!?)$/i;
/**
 * Between the alternatives of an expression (Spring's `hasRole('ADMIN') or permitAll()`, DRF's `A | B`): `or` after
 * a blank or a ")" and before a blank, a "(" or a "!" (`or(permitAll())`, `or!hasRole(…)`, `or` on the next line),
 * `||`, and `|` between blanks (Laravel's `role:admin|editor` is one guard).
 */
const OR = /(?:\s{1,20}|(?<=\)))or(?:\s{1,20}|(?=[(!]))|\|\||\s{1,20}\|\s{1,20}/i;
/**
 * Between the parts an expression requires all of (`isAuthenticated() and !hasRole('BANNED')`): `and` (before a
 * blank, a "(" or a "!": `and!hasRole(…)`), `&&`, `&`.
 */
const AND = /(?:\s{1,20}|(?<=\)))and(?:\s{1,20}|(?=[(!]))|&&|\s{1,20}&\s{1,20}/gi;
/** A negation, at the start of a part: `!`, `~` (DRF), `not` before a blank or a "(". */
const NOT = /^(?:!|~|not(?:\s|\())/i;
/**
 * A negation written as a comparison (Spring's SpEL, JavaScript, Python): a part that ends with `== false`,
 * `=== false`, `eq false`, `!= true`, `!== true` or `ne true`, or starts with `false ==` or `true !=`
 * (`hasRole('ADMIN') == false`). `!= false` and `== true` are the check itself.
 */
const COMPARED =
  /(?:(?<![!=])===?|\beq)\s{0,20}false$|(?:!==?|\bne)\s{0,20}true$|^false\s{0,20}(?:===?|eq\b)|^true\s{0,20}(?:!==?|ne\b)/i;

/** The expressions of this module (test/tools/redos-worker.mjs, RULES.md S5). */
export const GUARD_PATTERNS = Object.freeze({ WORD, USER_FORM, OR, AND, NOT, COMPARED });

/**
 * The user guards known by their name (case aside), each read on the last segment of a dotted name
 * (`auth.login_required`): FastAPI's tutorial, Flask-Login, Flask-JWT-Extended, Django, DRF, Spring and Symfony
 * (`isFullyAuthenticated()`, `IS_AUTHENTICATED_FULLY`), NestJS (`AuthenticatedGuard`), Passport and Express
 * (`ensureAuthenticated`, `authenticateToken`, `verifyToken`), NextAuth (`getServerSession`), and the names that say
 * a check of a signed-in user. A session or a token alone is no user: `get_session` is a database's,
 * `tokenMiddleware` may check a CSRF token, `getSession` and `getToken` give nothing to an anonymous caller.
 */
const USER_NAMES = new Set(
  (
    "get_current_user get_current_active_user login_required fresh_login_required loginrequired " +
    "loginrequiredmixin require_login require_auth jwt_required verify_jwt_in_request token_required authenticated " +
    "isauthenticated is_authenticated isfullyauthenticated is_authenticated_fully is_authenticated_remembered " +
    "authenticatedguard ensureauthenticated authenticatetoken verifytoken verify_token getserversession"
  ).split(" "),
);
/** The words that name a role guard: a role, a permission, a scope, an owner, an administrator, the staff. */
const ROLE_WORDS = new Set(
  (
    "admin admins administrator administrators role roles permission permissions scope scopes owner owners " +
    "super superuser superusers superadmin superadmins staff"
  ).split(" "),
);
/** Spring's `@Secured(…)`: its arguments are what it requires (`Secured(IS_AUTHENTICATED_FULLY)`). */
const SECURED = "secured";
/**
 * The guard a Flask before_request hook that may deny a request gives to the routes it applies to: always
 * "unknown", whatever the project's patterns — what a hook's body lets through is not read (SECURITY.md).
 */
export const HOOK_GUARD = "before_request";
/**
 * Why an adapter qualifies a guard it found but whose check of every request it does not read: `body`, a session
 * lookup or a role word in a handler's body (Next's `auth()`, `getServerSession()`, `role`: a lookup gives an
 * anonymous caller nothing, it refuses him nothing); `if`, a callback under a condition (Rails's
 * `before_action …, unless: :public?`: it guards some requests only).
 */
const PARTIAL = Object.freeze(["body", "if"]);

/**
 * A guard an adapter found where it guards some requests only, or none the kit reads (`auth (body)`,
 * `authenticate_user! (if)`): "unknown", whatever its name and the patterns, as HOOK_GUARD.
 * @param {string} name
 * @param {"body" | "if"} why
 */
export const partialGuard = (name, why) => `${name} (${why})`;
/** @param {string} guard */
const isPartial = (guard) => PARTIAL.some((why) => guard.endsWith(` (${why})`));

/** The words of a name, in lower case: `IsAdminUser` → is, admin, user; `ROLE_ADMIN` → role, admin. */
const wordsOf = (name) => (name.match(WORD) ?? []).map((w) => w.toLowerCase());

/** Whether a guard lets anonymous callers in: `…OrReadOnly` (they read), an optional or an anonymous user. */
function letsAnonymousIn(words) {
  const n = words.length;
  const readOnly = words[n - 1] === "readonly" || (words[n - 2] === "read" && words[n - 1] === "only");
  return readOnly || words.some((w) => w === "optional" || w === "anonymous" || w === "anonymously");
}

/**
 * The first words of a loader, which names what it loads, never a guard (`loadRoles`, `fetch_permissions`; Rails's
 * `set_*`, adapters/stack/rails.mjs).
 */
const LOADERS = new Set("load fetch find set build prepare assign".split(" "));
/** The method of a guard under a condition (express-unless: `requireAdmin.unless({ path: … })` guards some paths). */
const CONDITIONAL = "unless";

/**
 * The called name of a guard: its name from after the last "." or "::" before its call, with the call
 * (`admin_crud.get_db` → get_db, `requireAdmin.unless(…)` → unless(…), `hasRole('ADMIN')` itself). A module's or an
 * object's name is no part of what the guard checks.
 * @param {string} name
 */
function calledName(name) {
  const open = name.indexOf("(");
  const head = open === -1 ? name : name.slice(0, open);
  const colons = head.lastIndexOf("::");
  return name.slice(Math.max(head.lastIndexOf(".") + 1, colons === -1 ? 0 : colons + 2));
}

/**
 * Whether a guard's called name names a role, a permission or a scope by one of its words (`hasRole('ADMIN')`,
 * `can:admin`, `ROLE_USER`, `admin_crud.require_admin`): never a module's or an object's prefix (`admin_crud.get_db`,
 * `permissions.none`), nor a loader (`loadRoles`).
 */
function roleGuard(name) {
  const words = wordsOf(calledName(name));
  return !LOADERS.has(words[0]) && words.some((w) => ROLE_WORDS.has(w));
}

/** Whether a part is a guard under a condition (`requireAdmin.unless(…)`): none, whatever the patterns. */
const conditional = (part) => calledName(part).split("(")[0].trim().toLowerCase() === CONDITIONAL;

/**
 * Whether a guard is a user guard by its whole name: its name before a call's arguments, and with them only for
 * `AuthGuard(…)` (its strategy) or `()`: `isAuthenticated()` is one, `isAuthenticated() or …` and
 * `Authorize(Policy = …)` are not (another condition opens it, a policy of the application says what it requires).
 */
function userGuard(name) {
  const open = name.indexOf("(");
  const head = (open === -1 ? name : name.slice(0, open)).trim();
  const call = open === -1 ? "" : name.slice(open).trim();
  if (head.toLowerCase() === SECURED && call.endsWith(")"))
    return call
      .slice(1, -1)
      .split(",")
      .some((a) => a.trim() && !a.includes("(") && userGuard(a.trim()));
  if (call && call !== "()" && head.toLowerCase() !== "authguard") return false;
  const last = head.split("::").pop().split(".").pop().toLowerCase();
  return USER_FORM.test(head) || USER_NAMES.has(last);
}

/** The built-in role pattern: a word of the guard names a role, a permission or a scope. */
export const DEFAULT_ROLE_GUARD = Object.freeze({ test: roleGuard });
/** The built-in user pattern: a user guard of the stacks read, by its whole name. */
export const DEFAULT_USER_GUARD = Object.freeze({ test: userGuard });

/**
 * Guard patterns to classify `auth`, from `review.guards` (ARCHITECTURE.md §6.13: regular expressions as strings;
 * a non-empty list replaces the built-in pattern, joined with "|"). `review.guards` may be undefined.
 * @param {{ role?: string[], user?: string[] }} [guards]
 * @returns {{ role: { test: (name: string) => boolean }, user: { test: (name: string) => boolean } }}
 */
export function resolveGuardPatterns(guards = {}) {
  const role = guards?.role?.length ? new RegExp(guards.role.join("|"), "i") : DEFAULT_ROLE_GUARD;
  const user = guards?.user?.length ? new RegExp(guards.user.join("|"), "i") : DEFAULT_USER_GUARD;
  return { role, user };
}

/**
 * @typedef {{ role?: { test: (name: string) => boolean }, user?: { test: (name: string) => boolean } }} GuardPatterns
 */

const BLANKS = " \t\r\n";

/**
 * A part of an expression without its outer parentheses: those that open it, and those that close what it does not
 * open (`(isAuthenticated())` → `isAuthenticated()`; a part an alternative cut out of a group). A walk.
 * @param {string} part
 */
function bare(part) {
  let b = 0;
  let e = part.length;
  while (b < e && (part[b] === "(" || BLANKS.includes(part[b]))) b++;
  let depth = 0;
  for (let i = b; i < e; i++) depth += part[i] === "(" ? 1 : part[i] === ")" ? -1 : 0;
  while (e > b && (BLANKS.includes(part[e - 1]) || (part[e - 1] === ")" && depth < 0))) {
    if (part[e - 1] === ")") depth++;
    e--;
  }
  return part.slice(b, e);
}

/**
 * The parts an alternative requires all of: cut at AND outside parentheses only, so that a part of a negated group
 * stays in it (`isAuthenticated() and !(hasRole('A') and hasRole('B'))`). One walk; a ")" that closes nothing of
 * the alternative counts for none.
 * @param {string} alt
 */
function partsOf(alt) {
  const parts = [];
  let depth = 0;
  let from = 0;
  let i = 0;
  for (const m of alt.matchAll(AND)) {
    for (; i < m.index; i++) depth = alt[i] === "(" ? depth + 1 : alt[i] === ")" ? Math.max(0, depth - 1) : depth;
    if (depth > 0) continue;
    parts.push(alt.slice(from, m.index));
    from = m.index + m[0].length;
  }
  parts.push(alt.slice(from));
  return parts;
}

/**
 * The level of one part: 0 for a negation (anyone else passes: `!…`, `… == false`), a part that lets anonymous
 * callers in and a guard under a condition (`….unless(…)`).
 */
function partLevel(part, role, user) {
  if (!part || NOT.test(part) || COMPARED.test(part) || conditional(part) || letsAnonymousIn(wordsOf(part))) return 0;
  return role.test(part) ? 2 : user.test(part) ? 1 : 0;
}

/**
 * The level of one guard: 2 a role guard, 1 a user guard, 0 neither — the weakest of its alternatives (`or`, `||`,
 * `|`), so that a check another condition opens (`hasRole('ADMIN') or permitAll()`) is no more than that condition;
 * an alternative is the strongest of the parts it requires all of (`and`, `&&`, `&`). A part that lets anonymous
 * callers in is neither, whatever the patterns, and so is a negation (`!hasRole('BANNED')`,
 * `not(has_role("banned"))`, DRF's `~IsAdminUser`: anyone else passes), the hook guard and a partial guard. The
 * alternatives are cut whatever the parentheses, the parts only outside them: however the expression is grouped,
 * the level read is never more than its own.
 */
function levelOf(guard, role, user) {
  if (guard === HOOK_GUARD || isPartial(guard)) return 0;
  let level = 2;
  for (const alt of guard.split(OR)) {
    const own = partsOf(bare(alt)).reduce((max, part) => Math.max(max, partLevel(bare(part), role, user)), 0);
    level = Math.min(level, own);
    if (level === 0) break;
  }
  return level;
}

/**
 * `auth` of a route from its `guards` (the names found at the handler), against `patterns` (resolveGuardPatterns):
 * the strongest of its guards.
 * @param {readonly string[]} guards
 * @param {GuardPatterns} [patterns]
 * @returns {"none" | "role" | "user" | "unknown"}
 */
export function classifyAuth(guards, patterns = {}) {
  if (!guards || !guards.length) return "none";
  const role = patterns.role ?? DEFAULT_ROLE_GUARD;
  const user = patterns.user ?? DEFAULT_USER_GUARD;
  const level = guards.reduce((max, g) => Math.max(max, levelOf(g, role, user)), 0);
  return level === 2 ? "role" : level === 1 ? "user" : "unknown";
}

/** No role guard at all. */
const NO_ROLE = Object.freeze({ test: () => false });

/**
 * Whether a name is a guard by its whole name: a built-in user guard, or a name the project's own patterns give
 * (`review.guards`) — never by one of its words alone (`super_log()`, `has_role(…)`, `get_user_roles()` are no
 * guard). A call in a Flask before_request hook's body is read so: whether the hook may deny a request.
 * @param {string} name
 * @param {GuardPatterns} [patterns]
 */
export function wholeNameGuard(name, patterns = {}) {
  const role = patterns.role && patterns.role !== DEFAULT_ROLE_GUARD ? patterns.role : NO_ROLE;
  return classifyAuth([name], { user: patterns.user, role }) !== "unknown";
}
