// The stack adapters of Python (Django, Flask), Go, Ruby on Rails and Rust (ARCHITECTURE.md §5, §6.9): the routes and
// the guards each reads on its fixture application (test/fixtures/apps/*-app), as the kit gives them (framework, auth
// classified from the guards); what is never a route (a comment, a docstring, a test); the behaviour hints of Go and
// Rails; the cross-file readers (Python imports and modules); and the linearity of every reader and expression on
// crafted files of 200,000 characters (RULES.md S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { collectApi } from "../../engine/facts/api.mjs";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import django, { djangoRoutes, djangoViews } from "../../adapters/stack/django.mjs";
import flask, { flaskRoutes } from "../../adapters/stack/flask.mjs";
import { pyImports, pyModuleFile } from "../../engine/facts/stack-py.mjs";
import go, { goRoutes } from "../../adapters/stack/go.mjs";
import rails, { railsApi, railsRoutes } from "../../adapters/stack/rails.mjs";
import rust, { rustRoutes } from "../../adapters/stack/rust.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");

/** The api items of an adapter on its fixture, one line each: "METHOD route file:line framework auth guards". */
const rows = (adapter, app) =>
  collectApi(path.join(APPS, app), {}, [adapter]).map((r) =>
    `${r.method} ${r.route} ${r.file}:${r.line} ${r.framework} ${r.auth} ${r.guards.join(",")}`.trim(),
  );

/** The items of an adapter's routes on files given as text, one line each: "METHOD route guards". */
const short = (items) => items.map((r) => `${r.method} ${r.route} ${r.guards.join(",")}`.trim());

describe("Django", () => {
  test("the urls modules composed through include(), include([...]) and a DRF router; the guards of each view", () => {
    assert.deepEqual(rows(django, "django-app"), [
      "ANY / shop/urls.py:15 django none",
      "ANY /account/profile/ shop/urls.py:24 django user LoginRequiredMixin",
      "ANY /admin/ shop/urls.py:14 django role admin.site",
      "ANY /api/customers/ shop/api.py:7 django role IsAuthenticated,IsAdminUser",
      "ANY /api/customers/{slug}/ shop/api.py:7 django role IsAuthenticated,IsAdminUser",
      "ANY /api/orders/ shop/api.py:6 django user IsAuthenticated",
      "ANY /api/orders/{pk}/ shop/api.py:6 django user IsAuthenticated",
      "ANY /orders/ orders/urls.py:6 django user login_required",
      "ANY /orders/<int:pk>/ orders/urls.py:7 django role LoginRequiredMixin,PermissionRequiredMixin",
      "POST /orders/<int:pk>/cancel/ orders/urls.py:8 django role permission_required",
      "GET /orders/export/ orders/urls.py:9 django role staff_member_required",
      "ANY /reports/(?P<year>[0-9]{4})/ shop/urls.py:18 django none",
    ]);
  });

  test("a view's decorators, bases and class attributes; a method's are its class's only for dispatch", () => {
    const views = djangoViews(
      [
        "@api_view(['GET', 'POST'])",
        "@permission_classes([IsAdminUser])",
        "@csrf_exempt",
        "def report(request): ...",
        "@require_http_methods(['GET', 'PUT'])",
        "@user_passes_test(lambda u: u.is_staff)",
        "def edit(request): ...",
        "@method_decorator(login_required, name='dispatch')",
        "class Profile(UserPassesTestMixin, JSONResponseMixin, View):",
        '    """permission_classes = [Never]"""',
        "    @method_decorator(staff_member_required)",
        "    def dispatch(self, *args): ...",
        "    @method_decorator(never_cache)",
        "    def get(self, request): ...",
        "",
      ].join("\n"),
    );
    assert.deepEqual(Object.fromEntries([...views].map(([name, v]) => [name, [v.methods, v.guards]])), {
      report: [["GET", "POST"], ["IsAdminUser"]],
      edit: [["GET", "PUT"], ["user_passes_test"]],
      Profile: [null, ["login_required", "UserPassesTestMixin", "staff_member_required"]],
    });
  });

  test("a urls module whose view is not among the files read gives a route without guard; a cycle of includes stops", () => {
    const sources = new Map([
      ["a/urls.py", "from . import views\nurlpatterns = [path('x/', views.gone), path('b/', include('b.urls'))]\n"],
      ["b/urls.py", "urlpatterns = [path('a/', include('a.urls')), path('y/', other)]\n"],
      ["root/urls.py", "urlpatterns = [path('', include('a.urls'))]\n"],
    ]);
    assert.deepEqual(short(djangoRoutes(sources)), ["ANY /b/y/", "ANY /x/"]);
  });
});

describe("Python modules and imports (shared by Django and Flask)", () => {
  test("the names a file imports: aliases, a parenthesised list with comments, relative modules", () => {
    const text = [
      "from .orders import bp as orders_bp, other",
      "from ..core.views import (",
      "    detail,  # the detail view",
      "    List as OrderList,",
      ")",
      "from . import api",
      "import os",
      "",
    ].join("\n");
    assert.deepEqual(Object.fromEntries(pyImports(text)), {
      orders_bp: { module: ".orders", name: "bp" },
      other: { module: ".orders", name: "other" },
      detail: { module: "..core.views", name: "detail" },
      OrderList: { module: "..core.views", name: "List" },
      api: { module: ".", name: "api" },
    });
  });

  test("the file of a module: relative to its file, else from its folder up to the root, the closest first", () => {
    const files = new Set(["shop/orders/views.py", "shop/core/__init__.py", "orders/views.py", "shop/api.py"]);
    assert.equal(pyModuleFile(".views", files, "shop/orders/urls.py"), "shop/orders/views.py");
    assert.equal(pyModuleFile("..core", files, "shop/orders/urls.py"), "shop/core/__init__.py");
    assert.equal(pyModuleFile("orders.views", files, "shop/urls.py"), "shop/orders/views.py");
    assert.equal(pyModuleFile("orders.views", files, "main.py"), "orders/views.py");
    assert.equal(pyModuleFile("....far", files, "shop/urls.py"), null);
    assert.equal(pyModuleFile("missing", files, "shop/urls.py"), null);
  });
});

describe("Flask", () => {
  test("blueprints across files: a registration's prefix replaces the blueprint's own; nested blueprints; guards", () => {
    assert.deepEqual(rows(flask, "flask-app"), [
      "GET /admin/users app/admin/routes.py:12 flask role roles_required,require_staff",
      "GET /api/reports/monthly app/api.py:14 flask user jwt_required",
      "POST /api/tokens app/api.py:9 flask none",
      "GET /health app/__init__.py:16 flask none",
      "GET /shop/orders/ app/orders.py:7 flask user login_required",
      "POST /shop/orders/ app/orders.py:7 flask user login_required",
      "DELETE /shop/orders/<int:order_id> app/orders.py:26 flask none",
      "GET /shop/orders/<int:order_id> app/orders.py:19 flask none",
    ]);
  });

  test("two blueprints of the same name are told apart by the imports; one no import names keeps its own prefix", () => {
    const sources = new Map([
      [
        "a.py",
        "bp = Blueprint('a', __name__, url_prefix='/a')\n@bp.route('/x', methods=('GET', 'PUT'))\ndef x(): ...\n",
      ],
      ["b.py", "bp = Blueprint('b', __name__, url_prefix='/b')\n@bp.post('/y')\ndef y(): ...\n"],
      ["app.py", "from a import bp\napp.register_blueprint(bp, url_prefix='/one')\napp.register_blueprint(other)\n"],
    ]);
    assert.deepEqual(short(flaskRoutes(sources)), ["POST /b/y", "GET /one/x", "PUT /one/x"]);
  });
});

describe("Go", () => {
  test("net/http, gorilla/mux, gin, echo and chi: prefixes of groups, closures and mounts; the middleware as guards", () => {
    assert.deepEqual(rows(go, "go-app"), [
      "GET / internal/api/chi.go:13 chi none",
      "GET /admin internal/api/chi.go:33 chi role AdminOnly",
      "GET /admin/users internal/api/gin.go:22 gin role AuthRequired,RequireRole",
      "DELETE /admin/users/:id internal/api/gin.go:23 gin role AuthRequired,RequireRole,AuditLog",
      "GET /backoffice/stats internal/api/echo.go:14 echo unknown middleware.BasicAuth",
      "GET /health cmd/server/main.go:10 net/http none",
      "GET /invoices internal/api/chi.go:16 chi user Authenticated",
      "POST /invoices internal/api/chi.go:17 chi role Authenticated,RequireRole",
      "GET /invoices/{invoiceID} internal/api/chi.go:19 chi user Authenticated",
      "POST /login internal/api/gin.go:11 gin none",
      "GET /orders internal/api/gin.go:13 gin unknown AuthRequired",
      "POST /orders/{id}/cancel cmd/server/main.go:11 net/http unknown requireAuth",
      "GET /products internal/api/echo.go:11 echo none",
      "PUT /products/:id internal/api/echo.go:12 echo role RequireAdmin",
      "DELETE /sessions internal/api/chi.go:24 chi unknown jwtauth.Verifier",
      "ANY /static/ cmd/server/main.go:12 net/http none",
      "GET /v2/customers internal/api/gorilla.go:9 gorilla/mux user tokenMiddleware",
      "POST /v2/customers internal/api/gorilla.go:9 gorilla/mux user tokenMiddleware",
    ]);
  });

  test("an HTTP client call or a context read is no route; a group's Use after a route does not guard it", () => {
    const text = [
      'import "github.com/gin-gonic/gin"',
      'resp, _ := http.Get("https://example.test/x")',
      'user := c.Get("user")',
      'v1 := r.Group("/v1")',
      'v1.GET("/open", h)',
      "v1.Use(Auth())",
      'v1.GET("/closed", h)',
      '/* r.GET("/commented", h) */',
      "",
    ].join("\n");
    assert.deepEqual(short(goRoutes(text, "x.go")), ["GET /v1/open", "GET /v1/closed Auth"]);
  });

  test("behaviours: the query parameters, gorm's order and page, the SQL of a Where", () => {
    assert.deepEqual(collectBehaviours(path.join(APPS, "go-app"), [go]).items, [
      { family: "filter", signal: "param", file: "cmd/server/main.go", line: 18, field: "status", via: "go" },
      { family: "search", signal: "param", file: "internal/api/gin.go", line: 14, field: "q", via: "go" },
      {
        family: "pagination",
        signal: "page",
        file: "internal/api/gin.go",
        line: 15,
        field: "page",
        value: 1,
        via: "go",
      },
      {
        family: "sort",
        signal: "orderBy",
        file: "internal/api/gin.go",
        line: 17,
        field: "created_at",
        value: "desc",
        via: "gorm",
      },
      { family: "pagination", signal: "limit", file: "internal/api/gin.go", line: 17, value: 20, via: "gorm" },
      { family: "pagination", signal: "offset", file: "internal/api/gin.go", line: 17, value: 0, via: "gorm" },
      {
        family: "search",
        signal: "contains",
        file: "internal/api/gin.go",
        line: 17,
        field: "customer_name",
        via: "sql",
      },
      {
        family: "search",
        signal: "caseInsensitive",
        file: "internal/api/gin.go",
        line: 17,
        field: "customer_name",
        via: "sql",
      },
    ]);
  });
});

describe("Ruby on Rails", () => {
  test("routes.rb: resources, nesting, member and collection, namespace, scope, match, mount; the controllers' guards", () => {
    assert.deepEqual(rows(rails, "rails-app"), [
      "GET / config/routes.rb:3 rails none",
      "GET /about config/routes.rb:4 rails user authenticate_user!",
      "GET /admin config/routes.rb:21 rails role authenticate_user!,require_admin",
      "GET /admin/users config/routes.rb:19 rails role authenticate_user!,require_admin",
      "DELETE /admin/users/:id config/routes.rb:19 rails role authenticate_user!,require_admin",
      "GET /api/status config/routes.rb:25 rails none",
      "GET /api/webhooks config/routes.rb:26 rails none",
      "POST /api/webhooks config/routes.rb:26 rails none",
      "GET /orders config/routes.rb:8 rails user authenticate_user!",
      "GET /orders/:id config/routes.rb:8 rails user authenticate_user!,authorize",
      "PATCH /orders/:id config/routes.rb:8 rails user authenticate_user!,require_manager",
      "PUT /orders/:id config/routes.rb:8 rails user authenticate_user!,require_manager",
      "POST /orders/:id/cancel config/routes.rb:11 rails user authenticate_user!,require_manager",
      "GET /orders/:order_id/items config/routes.rb:9 rails user authenticate_user!,load_and_authorize_resource",
      "POST /orders/:order_id/items config/routes.rb:9 rails user authenticate_user!,load_and_authorize_resource",
      "GET /orders/export config/routes.rb:13 rails user authenticate_user!",
      "GET /profile config/routes.rb:16 rails user authenticate_user!",
      "PATCH /profile config/routes.rb:16 rails user authenticate_user!",
      "POST /profile config/routes.rb:16 rails user authenticate_user!",
      "PUT /profile config/routes.rb:16 rails user authenticate_user!",
      "GET /profile/edit config/routes.rb:16 rails user authenticate_user!",
      "GET /profile/new config/routes.rb:16 rails user authenticate_user!",
      "POST /search config/routes.rb:5 rails none",
      "ANY /sidekiq config/routes.rb:30 rails user authenticate",
    ]);
  });

  test("blocks: an if or a concern counts its end, a constraint guards, past 32 deep the walk stays balanced", () => {
    const deep = "scope 'a' do\n".repeat(40) + "end\n".repeat(40);
    const text = [
      "Rails.application.routes.draw do",
      "  if Rails.env.development?",
      "    get 'debug', to: 'debug#show'",
      "  end",
      "  concern :commentable do",
      "    resources :comments",
      "  end",
      "  constraints AdminConstraint.new do",
      "    resources :reports, only: :index",
      "  end",
      deep,
      "  get 'last', to: 'pages#last'",
      "end",
      "",
    ].join("\n");
    assert.deepEqual(short(railsRoutes(text, "config/routes.rb")), [
      "GET /debug",
      "GET /reports AdminConstraint",
      "GET /last",
    ]);
  });

  test("a controller's callbacks: a parent's, only/except, a skip, and its own parent met again (a cycle)", () => {
    const sources = new Map([
      ["config/routes.rb", "resources :notes, only: [:index, :create]\n"],
      [
        "app/controllers/notes_controller.rb",
        "class NotesController < NotesController\n  skip_before_action :login, only: :index\nend\n",
      ],
      ["app/controllers/base_controller.rb", "class BaseController\n  before_action :login\nend\n"],
    ]);
    assert.deepEqual(short(railsApi(sources)), ["GET /notes", "POST /notes"]);
    sources.set(
      "app/controllers/notes_controller.rb",
      sources.get("app/controllers/notes_controller.rb").replace(/< NotesController/, "< BaseController"),
    );
    assert.deepEqual(short(railsApi(sources)), ["GET /notes", "POST /notes login"]);
  });

  test("a nested resource's parameter is the singular of its parent (addresses, statuses, categories, houses)", () => {
    const text = ["addresses", "statuses", "categories", "houses", "people"]
      .map((name) => `resources :${name}, only: [] do\n  resources :notes, only: :index\nend\n`)
      .join("");
    assert.deepEqual(short(railsRoutes(text, "config/routes.rb")), [
      "GET /addresses/:address_id/notes",
      "GET /statuses/:status_id/notes",
      "GET /categories/:category_id/notes",
      "GET /houses/:house_id/notes",
      "GET /people/:person_id/notes",
    ]);
  });

  test("behaviours: ActiveRecord's order and page, the parameters read, a model's validations, the SQL of a where", () => {
    const at = (file, line) => ({ file: `app/${file}`, line });
    const c = (line) => at("controllers/orders_controller.rb", line);
    const m = (line) => at("models/order.rb", line);
    assert.deepEqual(collectBehaviours(path.join(APPS, "rails-app"), [rails]).items, [
      { family: "search", signal: "param", ...c(7), field: "q", via: "rails" },
      { family: "search", signal: "contains", ...c(7), field: "customer_name", via: "sql" },
      { family: "search", signal: "caseInsensitive", ...c(7), field: "customer_name", via: "sql" },
      { family: "sort", signal: "orderBy", ...c(8), field: "created_at", value: "desc", via: "activerecord" },
      { family: "pagination", signal: "pageSize", ...c(9), value: 20, via: "rails" },
      { family: "pagination", signal: "page", ...c(9), field: "page", via: "rails" },
      { family: "pagination", signal: "limit", ...c(23), value: 1000, via: "activerecord" },
      { family: "validation", signal: "required", ...m(2), field: "customer_name", via: "rails" },
      { family: "validation", signal: "max", ...m(2), field: "customer_name", value: 80, via: "rails" },
      { family: "validation", signal: "required", ...m(3), field: "email", via: "rails" },
      { family: "validation", signal: "email", ...m(3), field: "email", via: "rails" },
      {
        family: "values",
        signal: "enum",
        ...m(5),
        field: "status",
        values: ["draft", "paid", "shipped"],
        via: "rails",
      },
      { family: "validation", signal: "integer", ...m(6), field: "quantity", via: "rails" },
      { family: "validation", signal: "min", ...m(6), field: "quantity", value: 0, via: "rails" },
      { family: "validation", signal: "unique", ...m(7), field: "reference", via: "rails" },
      { family: "sort", signal: "orderBy", ...m(11), field: "created_at", value: "asc", via: "activerecord" },
      { family: "pagination", signal: "limit", ...m(11), value: 10, via: "activerecord" },
    ]);
  });
});

describe("Rust", () => {
  test("actix-web (attributes registered under a scope, resources, wraps) and axum (nest, merge, layers)", () => {
    assert.deepEqual(rows(rust, "rust-app"), [
      "GET / src/api.rs:6 axum none",
      "GET /admin/users src/admin.rs:4 actix-web none",
      "DELETE /api/invoices/{id} src/main.rs:23 actix-web unknown HttpAuthentication::bearer",
      "GET /api/invoices/{id} src/main.rs:22 actix-web unknown HttpAuthentication::bearer",
      "POST /api/orders src/main.rs:19 actix-web unknown HttpAuthentication::bearer",
      "GET /api/orders/{id} src/handlers.rs:10 actix-web unknown HttpAuthentication::bearer",
      "GET /health src/handlers.rs:3 actix-web none",
      "GET /reports src/handlers.rs:15 actix-web role AdminOnly",
      "HEAD /reports src/handlers.rs:15 actix-web role AdminOnly",
      "GET /status src/api.rs:28 axum none",
      "GET /v1/admin/stats src/api.rs:22 axum role require_admin",
      "POST /v1/login src/api.rs:18 axum none",
      "GET /v1/orders src/api.rs:14 axum user require_auth",
      "POST /v1/orders src/api.rs:14 axum user require_auth",
      "DELETE /v1/orders/:id src/api.rs:15 axum user require_auth",
      "GET /v1/orders/:id src/api.rs:15 axum user require_auth",
    ]);
  });

  test("a lifetime, a character and a raw string holding brackets do not break a chain", () => {
    const text = [
      "fn handler<'a>(s: &'a str) -> char { let _ = r#\"{ ( [\"#; '{' }",
      "pub fn app() -> Router {",
      "    Router::new()",
      '        .route("/a", get(a))',
      '        // .route("/commented", get(b))',
      "        .layer(ServiceBuilder::new().layer(TraceLayer::new_for_http()).layer(from_fn(guard)))",
      "}",
      "",
    ].join("\n");
    assert.deepEqual(short(rustRoutes(new Map([["src/lib.rs", text]]))), ["GET /a guard"]);
  });
});
