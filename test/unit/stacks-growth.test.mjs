// The readers of the stacks (the adapters of adapters/stack/) stay linear on what a crafted file holds (RULES.md S5):
// each input is built at a base size, then 4 and 16 times larger (assertLinear and linearAt, test/tools/growth.mjs),
// no absolute time. test/tools/run-plan.mjs runs this file alone, after the others. Each reader is measured here on the
// shapes of test/tools/stack-shapes.mjs; each expression (every *_PATTERNS of every adapter) alone, on those shapes and
// the harness's own, by test/tools/redos-worker.mjs (stackChecks), which security.test.mjs runs. The functional tests
// of these readers (the routes, the guards, the bounds of their output) stay in stack-front.test.mjs,
// stack-jvm-dotnet.test.mjs, stack-other.test.mjs, stack-php.test.mjs, stacks.test.mjs and stacks-hardening.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSink, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { MAX_GUARDS, MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import { nestRoutes, nestBehaviours } from "../../adapters/stack/nestjs.mjs";
import { angularScreens } from "../../adapters/stack/angular.mjs";
import { vueScreens } from "../../adapters/stack/vue-router.mjs";
import { reactRouterScreens } from "../../adapters/stack/react-router.mjs";
import spring, { springRoutes } from "../../adapters/stack/spring.mjs";
import aspnet, { aspnetRoutes } from "../../adapters/stack/aspnet.mjs";
import { djangoRoutes } from "../../adapters/stack/django.mjs";
import { flaskRoutes } from "../../adapters/stack/flask.mjs";
import { goRoutes, goBehaviours } from "../../adapters/stack/go.mjs";
import { railsApi, railsBehaviours } from "../../adapters/stack/rails.mjs";
import { rustRoutes } from "../../adapters/stack/rust.mjs";
import laravel from "../../adapters/stack/laravel.mjs";
import symfony from "../../adapters/stack/symfony.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { nextRouteHandlers } from "../../adapters/stack/next.mjs";
import fs from "node:fs";
import { BUILT_IN_STACKS } from "../../engine/facts/stacks.mjs";
import { collectScreens } from "../../engine/facts/api.mjs";
import { app } from "../tools/deps-apps.mjs";
import { assertLinear, linearAt } from "../tools/growth.mjs";
import { FRONT_UNITS, SPRING_SHAPES, ASPNET_SHAPES, PY_UNITS } from "../tools/stack-shapes.mjs";

describe("the front-end routers on adversarial characters (RULES.md S5)", () => {
  /** The base size: each input is built again 4 and 16 times larger (200,000 characters). */
  const SIZE = 12_500;
  const fill = (unit, n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  // Long runs of each special character of the patterns, many unclosed calls, many matches, huge lines.
  const UNITS = FRONT_UNITS;
  /** The inputs, each one a function of the size. */
  const INPUTS = [
    ...UNITS.map((unit) => (n) => fill(unit, n)),
    (n) => "const routes = [" + fill("{", n),
    (n) => "const routes = [" + fill(" ", n) + "x",
    (n) => "@Controller('a')\nexport class A {\n  @Get(" + fill("'", n),
    (n) => '<Routes><Route path="a" element={' + fill("<A>", n),
    (n) => "x".repeat(n) + "\n" + "{ path: 'a', component: A }, ".repeat(Math.round(n / 200)),
  ];
  const READERS = [
    [
      "nestjs api",
      (s) =>
        nestRoutes(
          new Map([
            ["src/x.ts", s],
            ["src/main.ts", s],
          ]),
        ),
    ],
    ["nestjs behaviours", (s) => nestBehaviours(s, createSink("src/x.ts", s, jsCommentRanges(s)))],
    [
      "angular screens",
      (s) =>
        angularScreens(
          new Map([
            ["src/x.ts", s],
            ["src/app.routes.ts", s],
          ]),
        ),
    ],
    [
      "vue-router screens",
      (s) =>
        vueScreens(
          new Map([
            ["src/x.ts", s],
            ["src/router/index.ts", s],
          ]),
        ),
    ],
    [
      "react-router screens",
      (s) =>
        reactRouterScreens(
          new Map([
            ["src/x.tsx", s],
            ["src/App.tsx", s],
          ]),
        ),
    ],
  ];

  // stack-front.test.mjs › "every reader reads ~200,000 adversarial characters in less than a second"
  test("every reader reads adversarial characters in linear time", () => {
    for (const [name, run] of READERS)
      for (const [k, input] of INPUTS.entries())
        assertLinear(`${name}, input ${k} (${JSON.stringify(input(SIZE).slice(0, 40))}…)`, {
          size: SIZE,
          build: input,
          run,
        });
  });
});

describe("the front-end routers on the shapes that multiply (RULES.md S5)", () => {
  const list = (k, f) => Array.from({ length: k }, (_, i) => f(i)).join("");
  const fileOf = (name, text) => [name, text];

  /**
   * Reads a shape built for K (the one of the old test: K, K·step, K·step² — its text four times longer each time,
   * each file under 512 KB): the text grows as K for a step of 4 and as K² for a step of 2, so n is the text and K its
   * root in the second case (assertLinear, test/tools/growth.mjs). MAX_ITEMS items at most, MAX_GUARDS guards on
   * each; then [items, most guards on one] of the output at 16 times the base.
   */
  function grows(read, name, k0, step, build) {
    const size = step === 2 ? k0 * k0 : k0;
    const { at16 } = linearAt(`${read.name} ${name}`, {
      size,
      make: (n) => {
        const sources = new Map(build(step === 2 ? Math.round(Math.sqrt(n)) : n));
        if (n <= 16 * size)
          for (const [file, text] of sources) assert.ok(text.length < 512 * 1024, `${name}: ${file}, ${text.length}`);
        return sources;
      },
      read: (sources) => {
        const out = read(sources);
        assert.ok(out.length <= MAX_ITEMS, `${name}: ${out.length} items`);
        assert.ok(
          out.every((o) => (o.guards?.length ?? 0) <= MAX_GUARDS),
          `${name}: more than MAX_GUARDS guards`,
        );
        return out;
      },
    });
    return [at16.length, Math.max(0, ...at16.map((o) => o.guards?.length ?? 0))];
  }

  const children = (k) => list(k, (i) => `{ path: 'c${i}', component: C },\n`);
  const nested = (k, record) => `${list(k, record)}${"] }".repeat(k)}`;

  test("Angular: K guards on a parent of K children, K lazy modules of K routes, children K deep", () => {
    const one = (text) => [fileOf("src/app.routes.ts", text)];
    const guards = (k) =>
      one(
        `const routes: Routes = [{ path: 'p', canActivate: [${list(k, (i) => `g${i}, `)}], children: [${children(k)}] }];`,
      );
    const lazy = (k) => [
      fileOf(
        "src/app.routes.ts",
        `const routes: Routes = [${list(k, (i) => `{ path: 'm${i}', loadChildren: () => import('./m${i}.routes').then((m) => m.ROUTES) },\n`)}];`,
      ),
      ...Array.from({ length: k }, (_, i) =>
        fileOf(
          `src/m${i}.routes.ts`,
          `export const ROUTES: Routes = [${list(k, (j) => `{ path: 'r${j}', component: C, canActivate: [g${j}] },\n`)}];`,
        ),
      ),
    ];
    const deep = (k) =>
      one(
        `const routes: Routes = [${nested(k, (i) => `{ path: 'a${i}', component: C, canActivate: [g${i}], children: [`)}];`,
      );
    assert.deepEqual(grows(angularScreens, "guards x children", 750, 4, guards), [MAX_ITEMS, MAX_GUARDS]);
    assert.deepEqual(grows(angularScreens, "lazy x routes", 20, 2, lazy), [MAX_ITEMS, 1]);
    assert.deepEqual(grows(angularScreens, "depth", 400, 4, deep), [25, 25]);
  });

  test("Vue Router: K guards on a parent of K children, K imported arrays of K routes, children K deep", () => {
    const one = (text) => [fileOf("src/router/index.js", text)];
    const guards = (k) =>
      one(
        `const routes = [{ path: '/p', component: P, beforeEnter: [${list(k, (i) => `g${i}, `)}], children: [${children(k)}] }];`,
      );
    const imported = (k) => [
      fileOf(
        "src/router/index.js",
        `${list(k, (i) => `import { r${i}Routes } from './r${i}';\n`)}const routes = [${list(k, (i) => `...r${i}Routes, `)}];`,
      ),
      ...Array.from({ length: k }, (_, i) =>
        fileOf(
          `src/router/r${i}.js`,
          `export const r${i}Routes = [${list(k, (j) => `{ path: '/r${i}/${j}', component: C, meta: { requiresAuth: true } },\n`)}];`,
        ),
      ),
    ];
    const deep = (k) =>
      one(`const routes = [${nested(k, (i) => `{ path: 'a${i}', component: C, beforeEnter: g${i}, children: [`)}];`);
    assert.deepEqual(grows(vueScreens, "guards x children", 750, 4, guards), [MAX_ITEMS, MAX_GUARDS]);
    assert.deepEqual(grows(vueScreens, "imports x routes", 20, 2, imported), [MAX_ITEMS, 1]);
    assert.deepEqual(grows(vueScreens, "depth", 400, 4, deep), [25, 25]);
  });

  test("React Router: a guarded layout of K children, K descendant files of K routes, routes K deep", () => {
    const one = (text) => [fileOf("src/App.tsx", text)];
    const wrappers = `${list(60, (i) => `<RequireA${i}>`)}<Outlet />`;
    const guards = (k) =>
      one(
        `<Routes><Route path="/p" element={${wrappers}}>${list(k, (i) => `<Route path="c${i}" element={<C />} />\n`)}</Route></Routes>`,
      );
    const descendants = (k) => [
      fileOf(
        "src/App.tsx",
        `${list(k, (i) => `import M${i} from './M${i}';\n`)}<Routes>${list(k, (i) => `<Route path="m${i}/*" element={<RequireAuth><M${i} /></RequireAuth>} />\n`)}</Routes>`,
      ),
      ...Array.from({ length: k }, (_, i) =>
        fileOf(
          `src/M${i}.tsx`,
          `<Routes>${list(k, (j) => `<Route path="r${j}" element={<Guard${j}><C /></Guard${j}>} />\n`)}</Routes>`,
        ),
      ),
    ];
    const deep = (k) =>
      one(
        `<Routes>${list(k, (i) => `<Route path="a${i}" element={<RequireA${i}><L /></RequireA${i}>}>`)}${"</Route>".repeat(k)}</Routes>`,
      );
    assert.deepEqual(grows(reactRouterScreens, "guards x children", 750, 4, guards), [MAX_ITEMS, MAX_GUARDS]);
    assert.deepEqual(grows(reactRouterScreens, "descendants x routes", 20, 2, descendants), [MAX_ITEMS, 2]);
    assert.deepEqual(grows(reactRouterScreens, "depth", 400, 4, deep), [25, 25]);
  });

  test("NestJS: K methods of K guards each, K global guards on K routes, a class's guards on K methods", () => {
    const controller = (k, method) => `@Controller('c')\nexport class C {\n${list(k, method)}}`;
    const each = (k) => [
      fileOf(
        "src/a.controller.ts",
        controller(k, (i) => `  @Get('m${i}')\n  @UseGuards(${list(k, (j) => `G${j}, `)})\n  m${i}() {}\n`),
      ),
    ];
    const global = (k) => [
      fileOf(
        "src/app.module.ts",
        `@Module({ providers: [${list(k, (i) => `{ provide: APP_GUARD, useClass: G${i} },\n`)}] })\nexport class AppModule {}`,
      ),
      fileOf(
        "src/a.controller.ts",
        controller(k, (i) => `  @Get(['a${i}', 'b${i}'])\n  m${i}() {}\n`),
      ),
    ];
    const classGuards = `@UseGuards(${list(400, (i) => `G${i}, `)})\n`;
    const shared = (k) => [
      fileOf(
        "src/a.controller.ts",
        classGuards + controller(k, (i) => `  @Get('m${i}')\n  @Roles('r${i}')\n  m${i}() {}\n`),
      ),
    ];
    assert.deepEqual(grows(nestRoutes, "methods x guards", 30, 2, each), [120, MAX_GUARDS]);
    assert.deepEqual(grows(nestRoutes, "global guards x routes", 600, 4, global), [MAX_ITEMS, MAX_GUARDS]);
    assert.deepEqual(grows(nestRoutes, "class guards x methods", 600, 4, shared), [MAX_ITEMS, MAX_GUARDS]);
  });
});

describe("Spring and ASP.NET Core on a crafted file (RULES.md S5)", () => {
  /** The base size: each input is built again 4 and 16 times larger (200,000 characters). */
  const SIZE = 12_500;
  /** An input, a function of the size: a prefix, then a unit repeated. */
  const fill =
    (unit, prefix = "") =>
    (n) =>
      prefix + unit.repeat(Math.ceil((n - prefix.length) / unit.length));
  const never = { push() {}, full: false };
  const SPRING = SPRING_SHAPES.map(([prefix, unit]) => fill(unit, prefix));
  const ASPNET = ASPNET_SHAPES.map(([prefix, unit]) => fill(unit, prefix));
  const cases = [
    ["spring api", SPRING, (s) => springRoutes(new Map([["X.java", s]]))],
    ["spring behaviours", SPRING, (s) => spring.behaviours(s, never, "X.java")],
    ["aspnet api", ASPNET, (s) => aspnetRoutes(new Map([["X.cs", s]]))],
    ["aspnet behaviours", ASPNET, (s) => aspnet.behaviours(s, never, "X.cs")],
  ];

  // stack-jvm-dotnet.test.mjs › "every reader and every expression reads a crafted file of 200,000 characters in under a second" (the expressions: redos-worker.mjs)
  test("every reader reads a crafted file in linear time", () => {
    for (const [name, inputs, run] of cases)
      for (const input of inputs)
        assertLinear(`${name} on ${JSON.stringify(input(SIZE).slice(0, 40))}…`, { size: SIZE, build: input, run });
  });
});

describe("Spring and ASP.NET Core on the shapes that multiply (RULES.md S5)", () => {
  const repeat = (k, unit) => Array.from({ length: k }, (_, i) => unit(i)).join("");
  const java = (s) => springRoutes(new Map([["A.java", s]]));
  const cs = (s) => aspnetRoutes(new Map([["A.cs", s]]));
  /** [name, K, file of K units, reader, whether its routes' guards are cut at MAX_GUARDS] */
  const shapes = [
    [
      "spring: 50 class guards × K methods with their own guard",
      400,
      (k) =>
        '@RestController\n@RequestMapping("/api")\n' +
        repeat(50, (i) => `@PreAuthorize("hasRole('R${i}')")\n`) +
        "public class A {\n" +
        repeat(k, (i) => `  @GetMapping("/m${i}") @Secured("ROLE_${i}") public void m${i}() {}\n`) +
        "}\n",
      java,
      true,
    ],
    [
      "spring: K nested types in a controller, a method after each",
      350,
      (k) =>
        '@RestController\n@RequestMapping("/api")\npublic class A {\n' +
        repeat(k, (i) => `  record R${i}(int x) {}\n  @GetMapping("/m${i}") public void m${i}() {}\n`) +
        "}\n",
      java,
      false,
    ],
    [
      "aspnet: K nested MapGroup with RequireAuthorization × K maps",
      300,
      (k) =>
        'var g0 = app.MapGroup("/g").RequireAuthorization("p0");\n' +
        repeat(
          k,
          (i) =>
            `var g${i + 1} = g${i}.MapGroup("/g").RequireAuthorization("p${i + 1}");\ng${i + 1}.MapGet("/m", h);\n`,
        ),
      cs,
      true,
    ],
    [
      "aspnet: K controllers inheriting a base with 50 guards",
      300,
      (k) =>
        repeat(50, (i) => `[Authorize("p${i}")]\n`) +
        "public abstract class Base : ControllerBase {}\n" +
        repeat(k, (i) => `[Route("c${i}")] public class C${i}Controller : Base { [HttpGet] public void G() {} }\n`),
      cs,
      true,
    ],
    [
      "aspnet: K nested types in a controller, an action after each",
      280,
      (k) =>
        '[ApiController]\n[Route("api/[controller]")]\npublic class OrdersController : ControllerBase\n{\n' +
        repeat(
          k,
          (i) =>
            `    public record R${i}(int X);\n    public enum E${i} { A }\n    [HttpGet("m${i}")] public void M${i}() {}\n`,
        ) +
        "}\n",
      cs,
      false,
    ],
  ];

  for (const [name, k0, build, read, cut] of shapes)
    test(name, () => {
      linearAt(name, {
        size: k0,
        make: (n) => {
          const text = build(n);
          if (n <= 16 * k0)
            assert.ok(text.length < 512 * 1024, `${name}: ${text.length} characters (a file over 512 KB is not read)`);
          return text;
        },
        read: (text) => {
          const out = read(text);
          assert.ok(out.length > 0 && out.length <= MAX_ITEMS, `${name}: ${out.length} routes`);
          assert.ok(
            out.every((r) => r.guards.length <= MAX_GUARDS),
            `${name}: a route with more than ${MAX_GUARDS} guards`,
          );
          // At every size measured (K, 4K and 16K, as the old test), not at the last one only.
          if (cut)
            assert.ok(
              out.some((r) => r.guards.length === MAX_GUARDS),
              `${name}: guards not cut`,
            );
          return out;
        },
      });
    });
});

describe("Django, Flask, Go, Rails and Rust on a crafted file (RULES.md S5)", () => {
  /** The base size: each input is built again 4 and 16 times larger (200,000 characters). */
  const SIZE = 12_500;
  const repeat = (s, n) => s.repeat(Math.ceil(n / s.length));
  const UNITS = PY_UNITS;
  const READERS = {
    django: [
      (s) =>
        djangoRoutes(
          new Map([
            ["urls.py", `urlpatterns = [${s}`],
            ["views.py", s],
            ["b/urls.py", `urlpatterns = [${s}`],
          ]),
        ),
      ["path(", "re_path(r'^", "path('a/', include([", "path('a/', include('b.urls')),\n", "path('a/', views.a),\n"],
      [
        "path('a/', include(router.urls)),\n",
        "@login_required\n",
        "class A(LoginRequiredMixin, ",
        '"""',
        "from . import (",
      ],
      [
        "    permission_classes = [",
        "router.register(r'a', A)\n",
        "urlpatterns += router.urls\n",
        "@method_decorator(",
      ],
    ],
    flask: [
      (s) =>
        flaskRoutes(
          new Map([
            ["app.py", s],
            ["bp.py", s],
          ]),
        ),
      ["@bp.route(", "@bp.route('/a')\n", "@bp.get('/a')\n@login_required\n", "@a\n", "bp = Blueprint(", "def a("],
      ["app.register_blueprint(bp, url_prefix='", "@bp.before_request\ndef a():\n", "x.register_blueprint(a.b)\n"],
    ],
    go: [
      (s) => goRoutes(s, "x.go").length + goBehaviours(s, createSink("x.go", s, [])),
      [
        "r.GET(",
        'r.GET("/a", h)\n',
        'r.Use(a)\nr.GET("/a", h)\n',
        'r.Route("/a", func(r chi.Router) {',
        "r.With(a).Get(",
      ],
      ['api := r.Group("/a", m)\n', 'mux.HandleFunc("GET /a", a(b(c(d(e(f))))))\n', 'r.Mount("/a", f())\nfunc f() {'],
      ['s := r.PathPrefix("/a").Subrouter()\n', 'c.Query("', '.Order("', ".Limit(", '.Where("a LIKE ?", '],
    ],
    rails: [
      (s) => {
        const files = [
          ["config/routes.rb", s],
          ["app/controllers/a_controller.rb", `class AController < AController\n${s}`],
        ];
        return railsApi(new Map(files)).length + railsBehaviours(s, createSink("x.rb", s, []));
      },
      [
        "resources :a do\n",
        "namespace :a do\n",
        "get 'a', to: 'b#c'\n",
        "end\n",
        ",\n",
        "resources :a, only: [",
        "if a\n",
      ],
      [
        "match 'a', via: [",
        "before_action :a\nskip_before_action :a, only: [:b]\n",
        "def a\n  authorize\n",
        "class A < B\n",
      ],
      [".order(", "params[:a]", "validates :a, presence: true,\n", "validates :a, inclusion: { in: %w[", ".per("],
    ],
    rust: [
      (s) =>
        rustRoutes(
          new Map([
            ["src/main.rs", s],
            ["src/b.rs", s],
          ]),
        ),
      ['.route("/a", get(h))', 'Router::new().route("/a", get(h).post(h))\n', '#[get("/a")]\nasync fn a() {}\n', 'r#"'],
      [
        'web::scope("/a").service(',
        ".layer(a)",
        'fn a() -> Router { Router::new().nest("/a", a()) }\n',
        "'\\",
        "fn a(",
      ],
      ['.service(a)\n#[get("/a")]\nfn a() {}\n', 'web::resource("/a").route(web::get().to(h))', "cfg.service("],
    ],
  };

  for (const [name, [read, ...lists]] of Object.entries(READERS))
    test(`${name}: crafted files of 200,000 characters are each read in linear time`, () => {
      for (const unit of [...lists.flat(), ...UNITS])
        assertLinear(`${name} on ${JSON.stringify(unit)}`, { size: SIZE, build: (n) => repeat(unit, n), run: read });
    });
});

describe("Django, Flask, Go, Rails and Rust on the shapes that multiply (RULES.md S5)", () => {
  /** K lines made by `line(i)`. */
  const lines = (k, line) => Array.from({ length: k }, (_, i) => line(i)).join("");
  const one = (file, text) => new Map([[file, text]]);
  /** [shape, K, files of size K (each under 512 KB at 16 K), the reader]. */
  const SHAPES = [
    [
      "Django: K decorators on a view × K paths to it",
      500,
      (k) =>
        new Map([
          ["views.py", `${lines(k, (i) => `@g${i}\n`)}def a(request): pass\n`],
          ["urls.py", `from . import views\nurlpatterns = [\n${lines(k, (i) => `path('x${i}/', views.a),\n`)}]\n`],
        ]),
      djangoRoutes,
    ],
    [
      "Flask: a blueprint registered K times × K before_request × K routes",
      250,
      (k) =>
        one(
          "app.py",
          "bp = Blueprint('b', __name__)\n" +
            lines(k, (i) => `app.register_blueprint(bp, url_prefix='/p${i}')\n`) +
            lines(k, (i) => `@bp.before_request\ndef b${i}(): pass\n`) +
            lines(k, (i) => `@bp.route('/r${i}')\ndef f${i}(): pass\n`),
        ),
      flaskRoutes,
    ],
    [
      "Go: K nested chi Route groups, a middleware each",
      400,
      (k) =>
        one(
          "x.go",
          'import "github.com/go-chi/chi/v5"\n' +
            lines(k, (i) => `r.Route("/a", func(r chi.Router) {\nr.Use(M${i})\nr.Get("/x", h)\n`) +
            "})\n".repeat(k),
        ),
      (files) => goRoutes(files.get("x.go"), "x.go"),
    ],
    [
      "Go: a gin group of many middleware × K Use × K routes",
      500,
      (k) =>
        one(
          "x.go",
          `import "github.com/gin-gonic/gin"\napi := r.Group("/a", ${lines(900, (i) => `M${i}(), `)}h)\n` +
            lines(k, (i) => `api.Use(U${i})\napi.GET("/x${i}", h)\n`),
        ),
      (files) => goRoutes(files.get("x.go"), "x.go"),
    ],
    [
      "Rails: K before_action (and a parent's K) × K routes to K actions",
      500,
      (k) =>
        new Map([
          ["config/routes.rb", lines(k, (i) => `get 'a${i}', to: 'x#a${i}'\n`)],
          [
            "app/controllers/x_controller.rb",
            `class XController < BaseController\n${lines(k, (i) => `  before_action :g${i}\n`)}`,
          ],
          [
            "app/controllers/base_controller.rb",
            `class BaseController\n${lines(k, (i) => `  before_action :h${i}\n`)}`,
          ],
        ]),
      railsApi,
    ],
    [
      "Rust: K handlers of one name × K registrations",
      500,
      (k) =>
        one(
          "src/main.rs",
          lines(k, () => '#[get("/a")]\nasync fn a() {}\n') + lines(k, () => "App::new().service(a);\n"),
        ),
      rustRoutes,
    ],
    [
      "Rust: K nested scopes, a wrap and a route each",
      300,
      (k) =>
        one(
          "src/main.rs",
          lines(k, (i) => `web::scope("/a").wrap(W${i}).route("/x", web::get().to(h)).service(`) +
            'web::resource("/y").to(h)' +
            ")".repeat(k) +
            ";\n",
        ),
      rustRoutes,
    ],
  ];

  for (const [shape, k, make, read] of SHAPES)
    test(`${shape}: bounded output`, () => {
      linearAt(shape, {
        size: k,
        make: (size) => {
          const files = make(size);
          if (size <= 16 * k)
            for (const [file, text] of files) assert.ok(text.length < 512 * 1024, `${file}: ${text.length} characters`);
          return files;
        },
        read: (files) => {
          const items = read(files);
          assert.ok(items.length > 0 && items.length <= MAX_ITEMS, `${items.length} items`);
          assert.ok(
            items.every((it) => it.guards.length <= MAX_GUARDS),
            `a route with more than ${MAX_GUARDS} guards`,
          );
          return items;
        },
      });
    });
});

describe("Laravel and Symfony on a crafted file (RULES.md S5)", () => {
  // stack-php.test.mjs › "every reader of both adapters reads a crafted file of 200,000 characters in under a second"
  test("every reader of both adapters reads a crafted file in linear time", () => {
    /** The base size: each input is built again 4 and 16 times larger (200,000 characters). */
    const SIZE = 12_500;
    const units = [
      "Route::get(",
      "Route::group(function () {",
      "Route::prefix('a')->middleware(['b'])->group(function () {\n",
      "Route::get('/a', 'x')->middleware('auth')->name('a');\n",
      "Route::resource('as', X::class)->only([",
      "Route::group(['prefix' => 'prefix' => 'prefix' => ",
      "Route::match([",
      "->where('a', 'like', '%",
      "$request->validate([",
      "'a' => [Rule::in([",
      "'a' => 'a' => ",
      "function rules() {",
      "$schedule->command('a')->",
      "#[Route('/a')]\npublic function a() {}\n",
      "#[Route(",
      "#[",
      "#[Assert\\Length(min: 1)]\n",
      '/** @Route("/a") */\n',
      "/** @Route(",
      "function a(",
      "class A ",
      "->andWhere('o.a LIKE ",
      "->findBy([",
      "#[MapQueryParameter",
      "$this->denyAccessUnlessGranted('",
      ...["(", "[", "{", "'", '"', "#", "/*", "//", " ", "\n", "\\", "a.", "::", "->", "=>", ",", "%"],
    ];
    // Nested groups with long prefixes, then many routes: what a group passes down stays bounded.
    const deep = (n) =>
      ("Route::prefix('" + "a".repeat(290) + "')->group(function () {\n").repeat(12) +
      "Route::get('/a', 'x');\n".repeat(Math.round(n / 25));
    const inputs = [...units.map((u) => (n) => u.repeat(Math.ceil(n / u.length))), deep, (n) => "a".repeat(n)];
    for (const build of inputs)
      for (const [adapter, file] of [
        [laravel, "routes/api.php"],
        [symfony, "src/Controller/A.php"],
      ])
        assertLinear(`${adapter.name}, ${JSON.stringify(build(SIZE).slice(0, 30))}`, {
          size: SIZE,
          build,
          run: (input) => {
            adapter.api({ sources: new Map([[file, input]]) });
            adapter.behaviours(input, createSink(file, input, []), file);
          },
        });
  });
});

describe("Laravel and Symfony on cross-product shapes (RULES.md S5): bounded output", () => {
  /** A distinct name of letters for each number (aa, ab…): never random-looking, so the guards keep it. */
  const name = (i) => {
    let s = "";
    for (let n = i; s === "" || n > 0; n = Math.floor(n / 26)) s = String.fromCharCode(97 + (n % 26)) + s;
    return `n${s}`;
  };
  /**
   * `read` on the shape `build` gives at 28,000 characters, then 4 and 16 times more (assertLinear,
   * test/tools/growth.mjs); its output bounded — MAX_ITEMS routes, MAX_GUARDS guards each.
   */
  function grows(label, build, read) {
    linearAt(label, {
      size: 28_000,
      make: build,
      read: (input) => {
        const out = read(input);
        assert.ok(out.length <= MAX_ITEMS, `${label}: ${out.length} routes`);
        assert.ok(
          out.every((r) => r.guards.length <= MAX_GUARDS),
          `${label}: ${Math.max(...out.map((r) => r.guards.length))} guards`,
        );
        return out;
      },
    });
  }

  test("Symfony: K class-level guards × K methods", () => {
    const build = (size) => {
      const k = Math.floor(size / 90);
      const guards = Array.from({ length: k }, (_, i) => `#[IsGranted('ROLE_${name(i).toUpperCase()}')]\n`);
      const methods = Array.from(
        { length: k },
        (_, i) => `    #[Route('/${name(i)}')]\n    public function m${i}() {}\n`,
      );
      return `<?php\n${guards.join("")}class C\n{\n${methods.join("")}}\n`;
    };
    grows("symfony class guards", build, (text) => symfony.api({ sources: new Map([["src/C.php", text]]) }));
  });

  test("Laravel: nested groups × K middleware each, then K routes", () => {
    const build = (size) => {
      const groups = Array.from({ length: 10 }, (_, g) => {
        const middleware = Array.from({ length: 300 }, (_, i) => `'${name(g * 1000 + i)}'`).join(", ");
        return `Route::middleware([${middleware}])->group(function () {\n`;
      }).join("");
      const k = Math.floor((size - groups.length) / 30);
      const routes = Array.from({ length: k }, (_, i) => `Route::get('/${name(i)}', 'x');\n`).join("");
      return `<?php\n${groups}${routes}${"});\n".repeat(10)}`;
    };
    grows("laravel nested middleware", build, (text) => laravel.api({ sources: new Map([["routes/web.php", text]]) }));
  });

  test("Laravel: K resources with long only and except lists", () => {
    const actions = ["index", "create", "store", "show", "edit", "update", "destroy"];
    const only = Array.from({ length: 200 }, (_, i) => `'${actions[i % 7]}'`).join(", ");
    const build = (size) => {
      const line = (i) => `Route::resource('${name(i)}s', C::class)->only([${only}])->except(['destroy', 'edit']);\n`;
      return `<?php\n${Array.from({ length: Math.floor(size / line(0).length) }, (_, i) => line(i)).join("")}`;
    };
    grows("laravel resources", build, (text) => laravel.api({ sources: new Map([["routes/web.php", text]]) }));
  });

  test("Laravel: K routes files, each mounted by K groups", () => {
    const build = (size) => {
      const k = Math.floor(Math.sqrt(size / 110));
      const sources = new Map();
      for (let p = 0; p < k; p++) {
        const mounts = Array.from(
          { length: k },
          (_, j) =>
            `Route::middleware('${name(p)}')->prefix('${name(p)}')->group(base_path('routes/${name(j)}.php'));\n`,
        );
        sources.set(`app/Providers/P${p}.php`, `<?php\n${mounts.join("")}`);
      }
      for (let j = 0; j < k; j++)
        sources.set(
          `routes/${name(j)}.php`,
          `<?php\n${Array.from({ length: k }, (_, i) => `Route::get('/${name(i)}', 'x');\n`).join("")}`,
        );
      return sources;
    };
    grows("laravel mounts", build, (sources) => laravel.api({ sources }));
  });
});

describe("Express, FastAPI and Next on a crafted file (RULES.md S5)", () => {
  // stacks.test.mjs › "a crafted file of 256 KB is read at once: 32,000 unclosed route calls, decorators, exports" (was
  // under 1,000 ms each; 0.3 took minutes)
  test("unclosed route calls, decorators and exports", () => {
    const cases = [
      ["express, unclosed calls", (n) => "app.get(".repeat(n), (s) => expressRoutes(s, "x.js")],
      ["express, routes", (n) => 'app.get("/a", h);\n'.repeat(n), (s) => expressRoutes(s, "x.js")],
      ["fastapi, decorators", (n) => '@router.get("/a")\n'.repeat(n), (s) => fastapiRoutes(new Map([["x.py", s]]))],
      [
        "fastapi, unclosed routers",
        (n) => "r = APIRouter(".repeat(n / 2),
        (s) => fastapiRoutes(new Map([["x.py", s]])),
      ],
      ["next, exports", (n) => "export function GET(".repeat(n / 2), (s) => nextRouteHandlers(s)],
    ];
    for (const [name, build, run] of cases) assertLinear(name, { size: 2000, build, run });
  });
});

describe("the composition of routes across files (RULES.md S5)", () => {
  // stacks-hardening.test.mjs › "the second review" › "guards written thousands of times over compose" (500 children
  // with 6,000 copies of a guard, then 2,000 with 24,000: at most 8 times as long)
  test("a Vue route of K children, each with thousands of copies of a guard: composed in a bounded part", () => {
    const { at16 } = linearAt("vue-router screens, K children × copies of a guard", {
      size: 125,
      make: (k) => {
        const guards = [...Array.from({ length: 31 }, (_, i) => `g${i}`), ...Array(12 * k).fill("g30")].join(", ");
        return app({
          "package.json": { dependencies: { "vue-router": "4.0.0" } },
          "src/router/index.ts": `export const kidRoutes = [{ path: 'x', component: X, beforeEnter: [${guards}] }];
const routes = [{ path: '/a', component: A, children: [${"...kidRoutes, ".repeat(k)}] }];
`,
        });
      },
      read: (dir) => {
        const screens = collectScreens(dir);
        assert.ok(screens.every((x) => !x.guards || x.guards.length <= MAX_GUARDS));
        return screens;
      },
      remove: (dir) => fs.rmSync(dir, { recursive: true, force: true }),
    });
    // At 16 times (2,000 children) the file is still under the 512 KB the kit reads: it was read.
    assert.ok(at16.length >= 1);
  });

  // stacks-hardening.test.mjs › "brackets nested far deeper than routes are counted, not built" (48,000 then 192,000)
  test("an Angular route table of brackets nested far deeper than routes: counted, not built", () => {
    const angular = BUILT_IN_STACKS.find((a) => a.name === "angular");
    assertLinear("angular screens on nested brackets", {
      size: 12_000,
      build: (n) => "const routes: Routes = [{ path: 'a', component: A, canActivate: [" + "{".repeat(n),
      run: (text) => angular.screens({ sources: new Map([["src/app.routes.ts", text]]) }),
    });
  });
});
