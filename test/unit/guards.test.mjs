// A public route is never reported as protected (SECURITY.md, ARCHITECTURE.md §6.13): a guard is a user or a role
// guard by its whole name, never by a part of another word (`get_session`, `VerifyCsrfToken`), and a guard that lets
// anonymous callers in (`…OrReadOnly`) is neither; FastAPI's decorator dependencies and `Security(…)` are guards;
// a Flask `before_request` hook gives `before_request`, always unknown, when it may deny a request, else nothing.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "../tools/helpers.mjs";
import { classifyAuth, resolveGuardPatterns, GUARD_PATTERNS } from "../../engine/facts/guards.mjs";
import { collectApi } from "../../engine/facts/api.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { flaskRoutes } from "../../adapters/stack/flask.mjs";
import next from "../../adapters/stack/next.mjs";
import { djangoRoutes } from "../../adapters/stack/django.mjs";
import { railsApi } from "../../adapters/stack/rails.mjs";

/** [a guard's name, the class it gives alone, why]. */
const TABLE = [
  // Never a user or a role guard: a part of another word, a check of something else, or anonymous callers let in.
  ["get_session", "unknown", "the database session of FastAPI's tutorial (SQLModel), no signed-in user"],
  ["get_db", "unknown", "a database session"],
  ["getSession", "unknown", "a session of any kind: a cookie's or a database's as well as a user's"],
  ["scoped_session", "unknown", "SQLAlchemy's session: 'scope' inside another word names no role"],
  ["VerifyCsrfToken", "unknown", "Laravel's CSRF check: a token, not a user"],
  ["csrf_protect", "unknown", "a CSRF check"],
  ["tokenMiddleware", "unknown", "a token of any kind: a CSRF token, an API key"],
  ["IsAuthenticatedOrReadOnly", "unknown", "DRF: anonymous callers read"],
  ["IsOwnerOrReadOnly", "unknown", "DRF's tutorial: anonymous callers read, so its owner is no role"],
  ["DjangoModelPermissionsOrAnonReadOnly", "unknown", "DRF: anonymous callers read, so its permissions are no role"],
  ["get_current_user_optional", "unknown", "an optional user: anonymous callers pass"],
  ["log_request", "unknown", "a logging hook"],
  ["currentUser", "unknown", "a lookup of the user (Clerk's currentUser()), not a check"],
  ["passport.authenticate", "unknown", "Passport's sign-in step (a /login route) as well as a check"],
  ["Authorize(Policy = CanDelete)", "unknown", "a policy of the application: what it requires is not read"],
  ["isAuthenticated() or hasIpAddress('10.0.0.0/8')", "unknown", "Spring: a check that another condition opens"],
  // The user guards of each stack, by their whole name.
  ["get_current_user", "user", "FastAPI's tutorial"],
  ["get_current_active_user", "user", "FastAPI's tutorial"],
  ["login_required", "user", "Flask-Login, Django"],
  ["auth.login_required", "user", "Flask-HTTPAuth: a module's decorator, read on its last segment"],
  ["jwt_required", "user", "Flask-JWT-Extended"],
  ["verify_jwt_in_request", "user", "Flask-JWT-Extended, called in a before_request hook"],
  ["require_login", "user", "a guard that says so"],
  ["require_auth", "user", "a guard that says so"],
  ["LoginRequiredMixin", "user", "Django"],
  ["IsAuthenticated", "user", "DRF"],
  ["isAuthenticated()", "user", "Spring's @PreAuthorize"],
  ["authenticate_user!", "user", "Rails (Devise)"],
  ["authenticate", "user", "Rails"],
  ["auth", "user", "Laravel, an Express middleware, Next's auth()"],
  ["auth:sanctum", "user", "Laravel"],
  ["Authorize", "user", "ASP.NET's [Authorize]"],
  ["RequireAuthorization", "user", "ASP.NET's minimal APIs"],
  ["AuthGuard('jwt')", "user", "NestJS"],
  ["authGuard", "user", "Angular"],
  ["getServerSession", "user", "NextAuth"],
  ["ensureAuthenticated", "user", "Passport's guide"],
  ["verifyToken", "user", "an Express JWT middleware"],
  ["authenticateToken", "user", "an Express JWT middleware"],
  ["Authenticated", "user", "a Go middleware"],
  ["isFullyAuthenticated()", "user", "Spring's @PreAuthorize"],
  ["Secured(IS_AUTHENTICATED_FULLY)", "user", "Spring's @Secured: what its argument requires"],
  ["IS_AUTHENTICATED_FULLY", "user", "Symfony"],
  ["IS_AUTHENTICATED_REMEMBERED", "user", "Symfony"],
  ["AuthenticatedGuard", "user", "NestJS's session guard"],
  ["isAuthenticated() or hasRole('ADMIN')", "user", "the weakest of its alternatives"],
  ["IS_AUTHENTICATED_ANONYMOUSLY", "unknown", "Symfony: anonymous callers pass"],
  ["Secured(IS_AUTHENTICATED_ANONYMOUSLY)", "unknown", "Spring: anonymous callers pass"],
  ["getToken", "unknown", "NextAuth's getToken: a lookup that gives nothing to an anonymous caller, as getSession"],
  ["hasRole('ADMIN') or permitAll()", "unknown", "Spring: permitAll() opens what hasRole closes"],
  ["hasRole('ADMIN') || permitAll()", "unknown", "the same with ||"],
  ["hasRole('ADMIN') OR permitAll()", "unknown", "the same in capitals"],
  ['!hasRole("BANNED")', "unknown", "a negation: anyone else passes"],
  ['not has_role("banned")', "unknown", "a negation in Python"],
  ['(!hasRole("BANNED"))', "unknown", "a negation in parentheses"],
  ['not(has_role("banned"))', "unknown", "a negation called as a function"],
  ['isAuthenticated() and !hasRole("BANNED")', "user", "a user guard and a negation: the user guard alone"],
  ['isAuthenticated() and not(hasRole("BANNED"))', "user", "the same in Python's words"],
  ["isAuthenticated() and hasRole('ADMIN')", "role", "both required: the stronger"],
  ["isAuthenticated() && hasRole('ADMIN')", "role", "the same with &&"],
  ["not (isAuthenticated() and hasRole('ADMIN'))", "unknown", "a negation of both: anonymous callers pass"],
  ["isAuthenticated() and !(hasRole('A') and hasRole('B'))", "user", "a negated group stays negated"],
  ["(isAuthenticated() and !hasRole('BANNED')) or hasRole('ADMIN')", "user", "a group, then an alternative"],
  ["!(hasRole('A') or hasRole('B'))", "unknown", "a negation of alternatives"],
  ["hasRole('ADMIN') or (isAuthenticated())", "user", "an alternative in parentheses"],
  ['hasRole("ADMIN") or(permitAll())', "unknown", "an alternative right after or("],
  ['hasRole("ADMIN")\nor permitAll()', "unknown", "an alternative on the next line"],
  ["hasRole('ADMIN')or(permitAll())", "unknown", "or between parentheses, no blank"],
  // The role guards: a word of the name names a role, a permission, a scope.
  ["hasRole('ADMIN') or hasRole('STAFF')", "role", "Spring: a role either way"],
  ["hasRole('ADMIN') OR hasRole('STAFF')", "role", "the same in capitals"],
  ["superadmins", "role", "a plural of a role word"],
  ["administrators_only", "role", "a plural of a role word"],
  ["require_admin", "role", "FastAPI"],
  ["roles_required", "role", "Flask-Security"],
  ["permission_required", "role", "Django"],
  ["staff_member_required", "role", "Django's admin"],
  ["IsAdminUser", "role", "DRF"],
  ["hasRole('ADMIN')", "role", "Spring"],
  ["hasAuthority('SCOPE_orders')", "role", "Spring: a scope"],
  ["Authorize(Roles = Admin)", "role", "ASP.NET"],
  ["can:admin", "role", "Laravel"],
  ["ROLE_ADMIN", "role", "Symfony"],
  ["RolesGuard", "role", "NestJS"],
];

describe("a guard is a user or a role guard by its whole name (SECURITY.md)", () => {
  for (const [name, expected, why] of TABLE)
    test(`${name.replace("\n", "\\n")} → ${expected}: ${why}`, () => assert.equal(classifyAuth([name]), expected, why));

  test("under patterns that match every name, a negation, an alternative that opens, a lookup stay unknown", () => {
    const all = resolveGuardPatterns({ user: ["."], role: ["."] });
    for (const name of [
      '!hasRole("BANNED")',
      '(!hasRole("BANNED"))',
      'not(has_role("banned"))',
      "not (isAuthenticated() and hasRole('ADMIN'))",
      "IsAuthenticatedOrReadOnly",
      "jwt_required(optional=True)",
    ])
      assert.equal(classifyAuth([name], all), "unknown", name);
  });

  test("a guard that lets anonymous callers in leaves the route to the others; no pattern makes it one", () => {
    assert.equal(classifyAuth(["IsAuthenticatedOrReadOnly", "IsAuthenticated"]), "user");
    assert.equal(classifyAuth(["IsOwnerOrReadOnly", "IsAuthenticated"]), "user");
    assert.equal(classifyAuth(["IsOwnerOrReadOnly", "IsAdminUser"]), "role");
    const project = resolveGuardPatterns({ role: ["Admin"], user: ["IsAuthenticated", "Jwt"] });
    assert.equal(classifyAuth(["IsAuthenticatedOrReadOnly"], project), "unknown");
    assert.equal(classifyAuth(["IsAdminOrReadOnly"], project), "unknown");
    assert.equal(classifyAuth(["OptionalJwtAuthGuard"], project), "unknown");
    assert.equal(classifyAuth(["JwtAuthGuard"], project), "user", "the project's pattern still applies");
  });

  test("the words of a name split at separators and case changes; the whole forms are anchored", () => {
    const words = (s) => s.match(GUARD_PATTERNS.WORD);
    assert.deepEqual(words("IsAdminUser"), ["Is", "Admin", "User"]);
    assert.deepEqual(words("JWTAuthGuard"), ["JWT", "Auth", "Guard"]);
    assert.deepEqual(words("ROLE_SUPER_ADMIN"), ["ROLE", "SUPER", "ADMIN"]);
    assert.deepEqual(words("can:edit-posts2"), ["can", "edit", "posts", "2"]);
    assert.ok(GUARD_PATTERNS.USER_FORM.test("authenticate_admin!"));
    assert.ok(!GUARD_PATTERNS.USER_FORM.test("passport.authenticate"));
    assert.ok(!GUARD_PATTERNS.USER_FORM.test("authorized"));
    assert.ok(Object.isFrozen(GUARD_PATTERNS));
  });

  /**
   * [a name whose role word is in a module's or an object's prefix, or in what it loads, its class, a real role
   * guard beside it, why]: a role word counts on the called name only, the last segment of a dotted name.
   */
  const PREFIXED = [
    ["admin_crud.get_db", "unknown", "admin_crud.require_admin", "FastAPI: Depends(admin_crud.get_db), a session"],
    ["admin_bp.paginate()", "unknown", "admin_bp.roles_required('editor')", "Flask: a decorator of a blueprint"],
    ["permissions.none", "unknown", "permissions.IsAdminUser", "Express: a module's middleware that lets all in"],
    ["Admin::Pagination", "unknown", "Admin::RequireAdmin", "Ruby, PHP: a namespace"],
    ["requireAdmin.unless", "unknown", "requireAdmin", "express-unless: a guard under a condition"],
    ["requireAdmin.unless({ path: ['/admin/login'] })", "unknown", "requireAdmin()", "the same, its arguments read"],
    ["loadRoles", "unknown", "requireRoles", "a loader names what it loads, no guard"],
    ["fetch_permissions", "unknown", "check_permissions", "a loader, in snake case"],
  ];
  for (const [name, expected, real, why] of PREFIXED)
    test(`${name} → ${expected}, ${real} → role: ${why}`, () => {
      assert.equal(classifyAuth([name]), expected, why);
      assert.equal(classifyAuth([real]), "role", `${real} still names a role`);
    });

  test("a conditional guard (requireAdmin.unless) is unknown whatever the project's patterns", () => {
    const project = resolveGuardPatterns({ role: ["requireAdmin"] });
    assert.equal(classifyAuth(["requireAdmin.unless"], project), "unknown");
    assert.equal(classifyAuth(["requireAdmin"], project), "role");
  });

  /**
   * Minimal pairs: [a negation not at the start of its part (a comparison with false, `and!`), its class, the same
   * check that guards, its class]. A negation is none, whatever the patterns.
   */
  const NEGATED = [
    ["hasRole('ADMIN') == false", "unknown", "hasRole('ADMIN') == true", "role"],
    ["hasRole('ADMIN') === false", "unknown", "hasRole('ADMIN') !== false", "role"],
    ["hasRole('ADMIN') != true", "unknown", "hasRole('ADMIN') != false", "role"],
    ["hasRole('ADMIN')!==true", "unknown", "hasRole('ADMIN')===true", "role"],
    ["hasRole('ADMIN') eq false", "unknown", "hasRole('ADMIN') eq true", "role"],
    ["hasRole('ADMIN') ne true", "unknown", "hasRole('ADMIN') ne false", "role"],
    ["false == hasRole('ADMIN')", "unknown", "true == hasRole('ADMIN')", "role"],
    ["(has_role('admin') == False)", "unknown", "(has_role('admin') == True)", "role"],
    ["permitAll() and!hasRole('BANNED')", "unknown", "permitAll() and hasRole('ADMIN')", "role"],
    ["permitAll() &&!hasRole('BANNED')", "unknown", "permitAll() && hasRole('ADMIN')", "role"],
    ["isAuthenticated() and!hasRole('BANNED')", "user", "isAuthenticated() and hasRole('ADMIN')", "role"],
    ["hasRole('ADMIN') or!hasRole('BANNED')", "unknown", "hasRole('ADMIN') or hasRole('STAFF')", "role"],
  ];
  for (const [negated, level, guarding, expected] of NEGATED)
    test(`${negated} → ${level}, ${guarding} → ${expected}: a negation not at the start`, () => {
      assert.equal(classifyAuth([negated]), level, negated);
      assert.equal(classifyAuth([guarding]), expected, guarding);
    });

  test("a negation not at the start is none under patterns that match every name", () => {
    const all = resolveGuardPatterns({ role: ["."], user: ["."] });
    // permitAll() alone is a guard to such patterns: the rows that hold nothing but a negation and an alternative.
    for (const [negated, level] of NEGATED)
      if (level === "unknown" && !negated.startsWith("permitAll")) assert.equal(classifyAuth([negated], all), level);
  });

  test("a name of any length is read in one pass (no part of it is ever a guard)", () => {
    assert.equal(classifyAuth(["get_" + "x".repeat(100_000) + "_session"]), "unknown");
    assert.equal(classifyAuth(["A".repeat(100_000) + "a"]), "unknown");
  });
});

describe("FastAPI: the dependencies of a route's decorator and Security(…) are its guards", () => {
  const ADMIN = [
    "from typing import Annotated",
    "from fastapi import APIRouter, Depends, Security",
    "from app.deps import get_current_user, get_session, require_admin",
    "",
    'router = APIRouter(prefix="/admin")',
    "",
    "",
    '@router.get("/stats", dependencies=[Depends(require_admin)])',
    "async def stats():",
    "    return {}",
    "",
    "",
    '@router.get("/me")',
    'async def me(user=Security(get_current_user, scopes=["me"])):',
    "    return user",
    "",
    "",
    '@router.delete("/orders/{order_id}", dependencies=[Security(require_admin, scopes=["orders"])])',
    "async def delete_order(order_id: int, session=Depends(get_session)):",
    "    return None",
    "",
    "",
    '@router.get("/catalogue")',
    "async def catalogue(session: Annotated[object, Depends(get_session)]):",
    "    return []",
    "",
  ].join("\n");

  test("the decorator's dependencies=[Depends(…)] and Security(…), after the signature's", () => {
    assert.deepEqual(
      fastapiRoutes(new Map([["app/routers/admin.py", ADMIN]])).map((r) => `${r.method} ${r.route} ${r.guards}`),
      [
        "GET /admin/catalogue get_session",
        "GET /admin/me get_current_user",
        "DELETE /admin/orders/{order_id} get_session,require_admin",
        "GET /admin/stats require_admin",
      ],
    );
  });

  /** "METHOD route auth" of each route of a set of files (file → its lines). */
  const access = (files) =>
    fastapiRoutes(new Map(Object.entries(files).map(([f, lines]) => [f, lines.join("\n")]))).map(
      (r) => `${r.method} ${r.route} ${classifyAuth(r.guards)}`,
    );
  const HEAD = ["from fastapi import APIRouter, Depends", "router = APIRouter()", ""];
  /**
   * [the lines of a route, its class, why]: a `Depends(…)` in a comment or a string is no guard, each beside the
   * same dependency in code, which guards.
   */
  const COMMENTED = [
    [['@router.get(\n    "/stats",\n    # dependencies=[Depends(require_admin)],\n)', "def stats(): ..."], "none"],
    [['@router.get(\n    "/stats",\n    dependencies=[Depends(require_admin)],\n)', "def stats(): ..."], "role"],
    [['@router.get("/stats", description="Admins: see Depends(require_admin)")', "def stats(): ..."], "none"],
    [
      ['@router.get("/stats", description="Admins", dependencies=[Depends(require_admin)])', "def stats(): ..."],
      "role",
    ],
    [['@router.get("/stats", summary="""Depends(require_admin)""")', "def stats(): ..."], "none"],
    [['@router.get("/me")', "def me(\n    # user=Depends(get_current_user),\n):", "    ..."], "none"],
    [['@router.get("/me")', "def me(\n    user=Depends(get_current_user),\n):", "    ..."], "user"],
    [['@router.get("/me")', 'def me(note: str = "Depends(get_current_user)"):', "    ..."], "none"],
  ];
  for (const [route, expected] of COMMENTED)
    test(`${route.join(" ").replace(/\n\s*/g, " ")} → ${expected}`, () => {
      const [, method, path] = /@router\.(\w+)\(\s*"([^"]+)"/.exec(route[0]);
      assert.deepEqual(access({ "app/a.py": [...HEAD, ...route] }), [`${method.toUpperCase()} ${path} ${expected}`]);
    });

  test("a Depends(…) commented out in an APIRouter(…) or an include_router(…) is no guard; in code it guards", () => {
    const router = (deps) => ["from fastapi import APIRouter", `router = APIRouter(\n    prefix="/a",\n${deps}\n)`];
    const route = ['@router.get("/x")', "def x(): ..."];
    assert.deepEqual(access({ "a.py": [...router("    # dependencies=[Depends(require_admin)],"), ...route] }), [
      "GET /a/x none",
    ]);
    assert.deepEqual(access({ "a.py": [...router("    dependencies=[Depends(require_admin)],"), ...route] }), [
      "GET /a/x role",
    ]);
    const mount = (deps) => [`app.include_router(\n    a.router,\n${deps}\n)`];
    const files = (deps) => ({ "a.py": ["router = APIRouter()", ...route], "main.py": mount(deps) });
    assert.deepEqual(access(files("    # dependencies=[Depends(get_current_user)],")), ["GET /x none"]);
    assert.deepEqual(access(files("    dependencies=[Depends(get_current_user)],")), ["GET /x user"]);
    assert.deepEqual(access(files('    tags=["Depends(get_current_user)"],')), ["GET /x none"]);
  });

  test("an APIRouter(…) or an include_router(…) in a comment or a docstring is none; in code it guards", () => {
    const route = ['@router.get("/public")', "def public(): ..."];
    const real = "router = APIRouter(dependencies=[Depends(get_current_user)])";
    /** [the lines that declare the router, the class of /public]: a copy after the real call is none, the real one guards. */
    const ROUTERS = [
      [["router = APIRouter()", `# ${real}`], "none"],
      [["router = APIRouter()", real], "user"],
      [["router = APIRouter()", '"""', real.replace("get_current_user", "require_admin"), '"""'], "none"],
      [["router = APIRouter()", real.replace("get_current_user", "require_admin")], "role"],
      [["router = APIRouter()", `x = 1  # ${real}`], "none"],
    ];
    for (const [lines, expected] of ROUTERS)
      assert.deepEqual(access({ "a.py": [...lines, ...route] }), [`GET /public ${expected}`], lines.join(" / "));
    const mount = (line) => ({ "a.py": ["router = APIRouter()", ...route], "main.py": [line] });
    const include = "app.include_router(a.router, dependencies=[Depends(require_admin)])";
    assert.deepEqual(access(mount(`# ${include}`)), ["GET /public none"]);
    assert.deepEqual(access(mount(include)), ["GET /public role"]);
    assert.deepEqual(access(mount(`def f():\n    """${include}"""`)), ["GET /public none"]);
    // A commented call before the real one: the real one is read still.
    assert.deepEqual(access(mount(`# app.include_router(a.router, prefix="/old\n${include}`)), ["GET /public role"]);
  });

  test("an admin route is role, a database session alone is no user", () => {
    const dir = tempDir("doc-kit-guards-fastapi-");
    try {
      fs.mkdirSync(path.join(dir, "app", "routers"), { recursive: true });
      fs.writeFileSync(path.join(dir, "requirements.txt"), "fastapi==0.115.0\n");
      fs.writeFileSync(path.join(dir, "app", "routers", "admin.py"), ADMIN);
      assert.deepEqual(
        collectApi(dir).map((r) => `${r.method} ${r.route} ${r.auth}`),
        [
          "GET /admin/catalogue unknown",
          "GET /admin/me user",
          "DELETE /admin/orders/{order_id} role",
          "GET /admin/stats role",
        ],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Flask: a before_request hook that may deny a request is before_request, never more than unknown", () => {
  const blueprint = (name, hook) =>
    [
      "from flask import Blueprint, abort, g",
      "",
      `bp = Blueprint("${name}", __name__, url_prefix="/${name}")`,
      "",
      "",
      ...hook,
      "",
      "",
      '@bp.route("/x")',
      "def x():",
      "    return []",
      "",
    ].join("\n");
  const sources = new Map([
    [
      "app/__init__.py",
      [
        "import logging",
        "from flask import Flask, request",
        "",
        "app = Flask(__name__)",
        "",
        "",
        "@app.before_request",
        "def log_request():",
        '    logging.info("%s %s", request.method, request.path)',
        "",
        "",
        '@app.route("/health")',
        "def health():",
        '    return "ok"',
        "",
      ].join("\n"),
    ],
    // It may deny: it aborts.
    [
      "app/admin.py",
      blueprint("admin", [
        "@bp.before_request",
        "def require_login():",
        "    if not current_user.is_authenticated:",
        "        abort(401)",
      ]),
    ],
    // It may deny: it calls a guard (the comment does not count).
    [
      "app/api.py",
      blueprint("api", [
        "@bp.before_request",
        "def check():",
        "    # login_required() is not used here",
        "    verify_jwt_in_request()",
      ]),
    ],
    // It may deny: a guard decorator under before_request.
    ["app/account.py", blueprint("account", ["@bp.before_request", "@login_required", "def before():", "    pass"])],
    // A timing hook, then a function whose own decorator calls a guard: that one is not the hook's.
    [
      "app/reports.py",
      blueprint("reports", [
        "@bp.before_request",
        "def timing():",
        "    g.started = 1",
        "",
        "",
        "@bp.route('/y')",
        "@jwt_required()",
        "def y():",
        "    return []",
      ]),
    ],
  ]);

  test("@jwt_required(optional=True) lets anonymous callers in: no user, unlike @jwt_required()", () => {
    const api = [
      "@app.get('/feed')",
      "@jwt_required(optional=True)",
      "def feed(): ...",
      "@app.get('/inbox')",
      "@jwt_required()",
      "def inbox(): ...",
      "@app.get('/drafts')",
      "@jwt_required(locations=['cookies'], optional = True)",
      "def drafts(): ...",
      // As Black writes a long call: its arguments on lines of their own.
      "@app.get('/news')",
      "@jwt_required(",
      "    optional=True,",
      ")",
      "def news(): ...",
      // A blank between the name and its arguments is still Python: they are read.
      "@app.get('/spaced')",
      "@jwt_required (optional=True)",
      "def spaced(): ...",
      "@app.get('/tabbed')",
      "@jwt_required\t()",
      "def tabbed(): ...",
      // optional=False, its blanks aside, requires a user; an optional=True in a comment is no argument.
      "@app.get('/required')",
      "@jwt_required(optional = False)",
      "def required(): ...",
      "@app.get('/commented')",
      "@jwt_required(",
      "    # optional=True,",
      ")",
      "def commented(): ...",
    ].join("\n");
    const items = flaskRoutes(new Map([["app.py", api]]));
    assert.deepEqual(
      items.map((r) => `${r.route} ${r.guards} ${classifyAuth(r.guards)}`),
      [
        "/commented jwt_required user",
        "/drafts jwt_required(optional=True) unknown",
        "/feed jwt_required(optional=True) unknown",
        "/inbox jwt_required user",
        "/news jwt_required(optional=True) unknown",
        "/required jwt_required user",
        "/spaced jwt_required(optional=True) unknown",
        "/tabbed jwt_required user",
      ],
    );
  });

  /** The guards and the class of the /x route of a blueprint whose before_request hook is `hook` (its lines). */
  const guarded = (hook, patterns = {}) => {
    const [r] = flaskRoutes(new Map([["app/bp.py", blueprint("bp", ["@bp.before_request", ...hook])]]), patterns);
    return `${r.guards} ${classifyAuth(r.guards, patterns)}`;
  };

  const MAY = "before_request unknown";
  /**
   * [the hook's lines, the /x route's guards and class, why]: a hook that may deny a request gives before_request,
   * always unknown; one that may deny nothing gives none. Never user nor role, whatever its name or its body.
   */
  const HOOKS = [
    // It may deny: a guard called by its whole name, a decorator under the hook, abort, raise, redirect, a return.
    [["def check():", "    verify_jwt_in_request()"], MAY, "a guard called"],
    [["def check():", "    verify_jwt_in_request(optional=True)"], MAY, "an optional user: no more than unknown"],
    [["def check():", "    verify_jwt_in_request(True)"], MAY, "optional by its first argument"],
    [["def check():", "    jwt_required()"], MAY, "a decorator called as a statement: no more than unknown"],
    [["def check():", "    auth.login_required()"], MAY, "the same, Flask-HTTPAuth's"],
    [["@jwt_required()", "def before():", "    pass"], MAY, "a guard decorator under the hook"],
    [["@jwt_required(optional=True)", "def before():", "    pass"], MAY, "an optional one"],
    [["@auth.login_required", "def before():", "    pass"], MAY, "Flask-HTTPAuth's"],
    [["@roles_required('admin')", "def before():", "    pass"], MAY, "a role decorator: no more than unknown"],
    [["def require_login():", "    if not current_user.is_authenticated:", "        abort(401)"], MAY, "it aborts"],
    [["def check():", "    raise Unauthorized()"], MAY, "it raises"],
    [["def check():", '    return jsonify(error="no"), 401'], MAY, "it returns an answer"],
    [["def check():", '    return redirect(url_for("auth.login"))'], MAY, "it redirects"],
    [["def load_user():", "    g.user = get_current_user()"], MAY, "a guard's whole name: it may deny"],
    [
      ["def admin_gate():", '    if request.path.startswith("/admin"):', "        abort(403)"],
      MAY,
      "a guard under a condition: its routes are all unknown",
    ],
    [
      [
        "def require_login():",
        '    allowed_routes = ["login", "register"]',
        '    if request.endpoint not in allowed_routes and "username" not in session:',
        '        return redirect("/login")',
      ],
      MAY,
      "an exemption by a positive condition: never user",
    ],
    [
      [
        "def check():",
        '    if request.endpoint == "bp.login":',
        "        return  # public page",
        "    verify_jwt_in_request()",
      ],
      MAY,
      "an exemption, a comment after its return",
    ],
    [
      ["def check():", '    if request.endpoint == "bp.login": return', "    verify_jwt_in_request()"],
      MAY,
      "an exemption on one line",
    ],
    // It may deny nothing: it logs, loads, reads a role, does nothing; a guard named in a string or a docstring.
    [["def log_request():", '    logging.info("%s", request.path)'], " none", "a logging hook"],
    [["def log_admin_access():", '    logging.info("x")'], " none", "a role word in a logging hook's name"],
    [["def timing():", "    g.started = time.time()"], " none", "a timing hook"],
    [["def require_login():", "    return None"], " none", "named as a guard, it does nothing"],
    [["def require_admin():", "    pass"], " none", "a role word in a name guards nothing"],
    [["def check():", "    return"], " none", "a bare return lets the request go on"],
    [["def authenticate():", "    g.user = load_user_from_cookie()"], " none", "it loads a user only"],
    [["def load_permissions():", "    g.permissions = load()"], " none", "it loads the permissions"],
    [["def load_user_roles():", "    g.roles = get_user_roles()"], " none", "it loads the roles"],
    [["def flags():", '    g.is_admin = current_user.has_role("admin")'], " none", "it reads a role"],
    [["def flags():", "    g.all = Role.query.all()"], " none", "a query of a table named Role"],
    [["def audit():", "    super_log()"], " none", "a word of a name is no guard called"],
    [["def audit():", '    logging.info("skipped require_admin() and abort(403)")'], " none", "in a string"],
    [["def audit():", '    """', "    verify_jwt_in_request()", '    """'], " none", "in a docstring"],
    [["def audit():", "    # abort(403)", "    pass"], " none", "in a comment"],
    [
      ["def admin_gate():", '    if request.path.startswith("/admin"):', "        require_admin()"],
      " none",
      "a helper of the application is not read: less protected than it is, never more",
    ],
  ];
  for (const [hook, expected, why] of HOOKS)
    test(`hook ${hook.at(-1).trim()} → ${expected}: ${why}`, () => assert.equal(guarded(hook), expected, why));

  test("every hook of the table, under patterns that match every name, is never user nor role", () => {
    const all = resolveGuardPatterns({ user: ["."], role: ["."] });
    for (const [hook] of HOOKS) {
      const got = guarded(hook, all);
      assert.ok(got === MAY || got === " none", `${hook.join(" / ")} → ${got}`);
    }
  });

  test("the project's patterns (review.guards) make a call one that may deny, never the hook a user or a role", () => {
    const key = ["def check_api_key():", '    if request.headers.get("X-Key") != KEY:', "        abort(401)"];
    assert.equal(guarded(key), MAY);
    assert.equal(guarded(key, resolveGuardPatterns({ user: ["check_api_key"] })), MAY, "its name changes nothing");
    const tenant = ["def tenant_gate():", "    ensure_tenant()"];
    assert.equal(guarded(tenant), " none", "a name no pattern knows: it may deny nothing the kit can see");
    assert.equal(guarded(tenant, resolveGuardPatterns({ role: ["ensure_tenant"] })), MAY, "the project's guard");
    const project = resolveGuardPatterns({ role: ["before_request", "before"], user: ["request"] });
    assert.equal(classifyAuth(["before_request"], project), "unknown", "no pattern makes the hook more");
    const dir = tempDir("doc-kit-guards-flask-");
    try {
      fs.writeFileSync(path.join(dir, "requirements.txt"), "flask==3.0.0\n");
      fs.writeFileSync(path.join(dir, "app.py"), blueprint("bp", ["@bp.before_request", ...tenant]));
      assert.deepEqual(
        collectApi(dir, { role: ["ensure_tenant", "before_request"] }).map((r) => `${r.route} ${r.guards} ${r.auth}`),
        ["/bp/x before_request unknown"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("many hooks that may deny give before_request once, after the route's own guards", () => {
    const hooks = Array.from({ length: 40 }, (_, i) => `@bp.before_request\ndef h${i}(): abort(401)\n`);
    const text = blueprint("bp", [...hooks, "@bp.route('/y')", "@login_required", "def y(): ..."]);
    assert.deepEqual(
      flaskRoutes(new Map([["app/bp.py", text]])).map((r) => `${r.route} ${r.guards} ${classifyAuth(r.guards)}`),
      ["/bp/x before_request unknown", "/bp/y login_required,before_request user"],
    );
  });

  test("a hook of an application factory: its body is the block under its def, at any indentation", () => {
    const factory = [
      "def create_app():",
      "    app = Flask(__name__)",
      "",
      "    @app.before_request",
      "    def check():",
      "        verify_jwt_in_request()",
      "",
      "    @app.route('/x')",
      "    def x():",
      "        return []",
      "",
      "    @app.before_request",
      "    def timing():",
      "        g.started = 1",
      "    abort(403)",
      "    return app",
      "",
    ].join("\n");
    assert.deepEqual(
      flaskRoutes(new Map([["app/__init__.py", factory]])).map((r) => `${r.route} ${r.guards}`),
      ["/x before_request"],
      "the factory's abort(403), after the timing hook's block, is not the hook's",
    );
  });

  test("a logging or a timing hook is no guard; a hook that may deny is before_request, wherever it is", () => {
    assert.deepEqual(
      flaskRoutes(sources).map((r) => `${r.method} ${r.route} ${r.guards}`),
      [
        "GET /account/x before_request",
        "GET /admin/x before_request",
        "GET /api/x before_request",
        "GET /health ",
        "GET /reports/x ",
        "GET /reports/y jwt_required",
      ],
    );
  });
});

describe("Next, DRF, Rails: a lookup in a body, an alternative, a condition is never more than unknown", () => {
  const ALL = resolveGuardPatterns({ user: ["."], role: ["."] });

  /** "METHOD route auth" of Next's route handlers (file → text). */
  const nextAccess = (files, patterns = {}) =>
    next
      .api({ sources: new Map(Object.entries(files)) })
      .map((r) => `${r.method} ${r.route} ${classifyAuth(r.guards, patterns)}`);
  /**
   * [the body of a handler, its class]: a session lookup or a role word in a handler's body is no check the kit
   * reads (a lookup gives an anonymous caller nothing, it does not refuse him): unknown, whatever the route returns
   * and whatever the patterns; without it, none.
   */
  const NEXT = [
    ["const session = await auth();\n  return Response.json({ me: session?.user ?? null });", "unknown"],
    ["return Response.json({ me: null });", "none"],
    ["const session = await getServerSession(authOptions);\n  return Response.json(session);", "unknown"],
    [
      "const session = await getServerSession(authOptions);\n  if (!session) return new Response(null, { status: 401 });",
      "unknown",
    ],
    ["const rows = await db.role.findMany();\n  return Response.json(rows);", "unknown"],
    ["const rows = await db.order.findMany();\n  return Response.json(rows);", "none"],
    ["if (!user.isAdmin) return new Response(null, { status: 403 });\n  return Response.json([]);", "unknown"],
  ];
  for (const [body, expected] of NEXT)
    test(`Next: ${body.split("\n")[0]} → ${expected}, whatever the patterns`, () => {
      const files = { "app/api/me/route.ts": `export async function GET() {\n  ${body}\n}\n` };
      assert.deepEqual(nextAccess(files), [`GET /api/me ${expected}`]);
      assert.deepEqual(nextAccess(files, ALL), [`GET /api/me ${expected}`]);
    });

  test("Next: NextAuth's auth(…) wrapper of an export and a pages/api session lookup are unknown, never user", () => {
    const files = {
      "app/api/me/route.ts": "export const GET = auth(function GET(req) {\n  return Response.json(req.auth);\n});\n",
      "pages/api/role.ts":
        "export default async function handler(req, res) {\n  const s = await getServerSession(req, res, o);\n  res.json(s?.role);\n}\n",
    };
    assert.deepEqual(nextAccess(files), ["GET /api/me unknown", "ALL /api/role unknown"]);
    assert.deepEqual(nextAccess(files, ALL), ["GET /api/me unknown", "ALL /api/role unknown"]);
  });

  /** The guards and the class of the route of a DRF view whose class body is `line`. */
  const drf = (line) => {
    const sources = new Map([
      ["shop/urls.py", "from . import views\nurlpatterns = [path('x/', views.X.as_view())]\n"],
      ["shop/views.py", `class X(APIView):\n    ${line}\n`],
    ]);
    return djangoRoutes(sources).map((r) => `${r.guards.join(",")} ${classifyAuth(r.guards)}`)[0];
  };
  /**
   * [the permission_classes of a view, its guards and class]: an alternative (`|`, `or`, and Python's `and`, which
   * gives one of its operands) is as weak as its weakest, a negation (`~`, `not`) is none; `&` and the list require
   * all.
   */
  const DRF = [
    ["[IsAuthenticated | ReadOnly]", "IsAuthenticated | ReadOnly unknown"],
    ["[IsAuthenticated, ReadOnly]", "IsAuthenticated,ReadOnly user"],
    ["[IsAdminUser | AllowAny]", "IsAdminUser | AllowAny unknown"],
    ["[IsAdminUser, AllowAny]", "IsAdminUser,AllowAny role"],
    ["[IsAdminUser|AllowAny]", "IsAdminUser | AllowAny unknown"],
    ["[IsAuthenticated | IsAdminUser]", "IsAuthenticated | IsAdminUser user"],
    ["[IsAdminUser | IsStaffUser]", "IsAdminUser | IsStaffUser role"],
    ["[IsAuthenticated & IsAdminUser]", "IsAuthenticated & IsAdminUser role"],
    ["[(IsAdminUser & IsStaffUser) | AllowAny]", "(IsAdminUser & IsStaffUser) | AllowAny unknown"],
    ["[~IsAdminUser]", "~IsAdminUser unknown"],
    ["[IsAuthenticated, ~IsAdminUser]", "IsAuthenticated,~IsAdminUser user"],
    ["[IsAuthenticated or ReadOnly]", "IsAuthenticated | ReadOnly unknown"],
    ["[IsAdminUser and AllowAny]", "IsAdminUser | AllowAny unknown"],
    ["[not IsAdminUser]", "~IsAdminUser unknown"],
    ["(\n        IsAuthenticated\n        | ReadOnly,\n    )", "IsAuthenticated | ReadOnly unknown"],
    ["[permissions.IsAdminUser | permissions.AllowAny]", "IsAdminUser | AllowAny unknown"],
    // DRF's module `permissions` names no role: a class is read by its own name.
    ["[permissions.AllowAny]", "AllowAny unknown"],
    ["[permissions.IsAuthenticated]", "IsAuthenticated user"],
    ["[permissions.IsAdminUser]", "IsAdminUser role"],
    ["[\n        IsAuthenticated,  # | AllowAny\n    ]", "IsAuthenticated user"],
    // A "#" in a string is no comment; a name that is a key of every object is a name.
    ['[HasScope("read#write"), IsAuthenticated]', "HasScope,IsAuthenticated role"],
    ["[constructor | IsAuthenticated, toString]", "constructor | IsAuthenticated,toString unknown"],
  ];
  for (const [classes, expected] of DRF)
    test(`DRF: permission_classes = ${classes.replace(/\n\s*/g, " ")} → ${expected}`, () =>
      assert.equal(drf(`permission_classes = ${classes}`), expected));

  test("DRF: @permission_classes([…]) of a function view reads its alternatives as well", () => {
    const view = (classes) =>
      new Map([
        ["shop/urls.py", "from . import views\nurlpatterns = [path('y/', views.y)]\n"],
        ["shop/views.py", `@api_view(["GET"])\n@permission_classes([${classes}])\ndef y(request): ...\n`],
      ]);
    const auth = (classes) =>
      djangoRoutes(view(classes)).map((r) => `${r.method} ${r.route} ${classifyAuth(r.guards)}`);
    assert.deepEqual(auth("IsAuthenticated | ReadOnly"), ["GET /y/ unknown"]);
    assert.deepEqual(auth("IsAuthenticated"), ["GET /y/ user"]);
  });

  /** "METHOD route auth" of the index and destroy actions of a controller whose callbacks are `callbacks`. */
  const rails = (callbacks) => {
    const sources = new Map([
      ["config/routes.rb", "resources :listings, only: [:index, :destroy]\n"],
      [
        "app/controllers/listings_controller.rb",
        `class ListingsController < ApplicationController\n  ${callbacks}\n\n  def index; end\nend\n`,
      ],
    ]);
    return railsApi(sources).map((r) => `${r.method} ${r.route} ${classifyAuth(r.guards)}`);
  };
  /**
   * [a controller's callbacks, the class of index, of destroy]: a callback under a condition (`if:`, `unless:`,
   * on one line or several) guards some requests only: unknown; `only:` on the next line is still read.
   */
  const RAILS = [
    ["before_action :authenticate_user!", "user", "user"],
    ["before_action :authenticate_user!, unless: :public_listing?", "unknown", "unknown"],
    ["before_action :authenticate_user!, if: -> { request.format.json? }", "unknown", "unknown"],
    ["before_action :authenticate_user!, :if => :api_request?", "unknown", "unknown"],
    ["before_action :authenticate_user!,\n                unless: :public_listing?", "unknown", "unknown"],
    ["before_action :require_admin, unless: :public_listing?, only: :destroy", "none", "unknown"],
    ["before_action :require_admin, only: [:destroy]", "none", "role"],
    ["before_action :require_admin,\n                only: [:destroy]", "none", "role"],
    ["before_action :authenticate_user!\n  skip_before_action :authenticate_user!, only: :index", "none", "user"],
    ["before_action :authenticate_user!\n  skip_before_action :authenticate_user!, if: :public?", "unknown", "unknown"],
    ["skip_before_action :authenticate_user!, if: :public_listing?", "none", "none"],
  ];
  for (const [callbacks, index, destroy] of RAILS)
    test(`Rails: ${callbacks.replace(/\n\s*/g, " ")} → index ${index}, destroy ${destroy}`, () =>
      assert.deepEqual(rails(callbacks), [`GET /listings ${index}`, `DELETE /listings/:id ${destroy}`]));

  /** "METHOD route [guards] auth" of index and destroy, the parent's callbacks then the child's. */
  const inherited = (parent, child) =>
    railsApi(
      new Map([
        ["config/routes.rb", "resources :listings, only: [:index, :destroy]\n"],
        ["app/controllers/application_controller.rb", `class ApplicationController < Base\n  ${parent}\nend\n`],
        [
          "app/controllers/listings_controller.rb",
          `class ListingsController < ApplicationController\n  ${child}\nend\n`,
        ],
      ]),
    ).map((r) => `${r.method} ${r.route} [${r.guards}] ${classifyAuth(r.guards)}`);
  /**
   * [the parent's callback, the child's, index, destroy]: a callback declared again replaces the one of the same name
   * (ActiveSupport's remove_duplicates), its condition and its `only:` with it; another name adds to it.
   */
  const REDECLARED = [
    [
      "before_action :authenticate_user!",
      "before_action :authenticate_user!, unless: :public_listing?",
      "[authenticate_user! (if)] unknown",
      "[authenticate_user! (if)] unknown",
    ],
    [
      "before_action :authenticate_user!",
      "before_action :authenticate_user!, only: :destroy",
      "[] none",
      "[authenticate_user!] user",
    ],
    [
      "before_action :authenticate_user!, only: :destroy",
      "before_action :authenticate_user!",
      "[authenticate_user!] user",
      "[authenticate_user!] user",
    ],
    [
      "before_action :authenticate_user!",
      "before_action :require_admin, only: :destroy",
      "[authenticate_user!] user",
      "[authenticate_user!,require_admin] role",
    ],
    [
      "before_action :authenticate_user!\n  before_action :authenticate_user!, except: :index",
      "",
      "[] none",
      "[authenticate_user!] user",
    ],
  ];
  for (const [parent, child, index, destroy] of REDECLARED)
    test(`Rails: ${parent.replace(/\n\s*/g, " ")}, then ${child || "nothing"} → index ${index}, destroy ${destroy}`, () =>
      assert.deepEqual(inherited(parent, child), [`GET /listings ${index}`, `DELETE /listings/:id ${destroy}`]));
});
