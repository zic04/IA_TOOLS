// The stack adapters of NestJS and of the front-end routers — Angular, Vue Router, React Router (ARCHITECTURE.md §5,
// §6.9 sources `api`, `screens`, `behaviours`): the routes and the screens of a fixture application each, exactly,
// with their guards; what is never read (a test file, a declaration in a comment, a path that is not a literal, a
// redirect, a "not found" route); the composition of routes across files (a lazy module, an imported array, the
// descendant routes of a component); the behaviour hints of NestJS; the reader of route records the three routers
// share; and the linearity of every reader on adversarial text (RULES.md S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { collectApi, collectScreens } from "../../engine/facts/api.mjs";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import { createSink, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import nestjs, { nestRoutes } from "../../adapters/stack/nestjs.mjs";
import angular, { angularScreens } from "../../adapters/stack/angular.mjs";
import vueRouter, { vueScreens } from "../../adapters/stack/vue-router.mjs";
import { guardName, roleValues, literalTree, resolveModule, joinRoute } from "../../engine/facts/stack-js.mjs";
import reactRouter, { reactRouterScreens } from "../../adapters/stack/react-router.mjs";
import fs from "node:fs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");
const app = (name) => path.join(APPS, name);
const read = (name, file) => fs.readFileSync(path.join(app(name), file), "utf8");

/** The hints an adapter gives of one file of a fixture, through the sink the kit gives it (comments dropped). */
function hintsOf(name, file) {
  const text = read(name, file);
  const sink = createSink(file, text, jsCommentRanges(text));
  nestjs.behaviours(text, sink, file);
  return sink.items;
}

describe("NestJS (adapters/stack/nestjs.mjs)", () => {
  test("api: the controllers' routes under the global prefix; global, class and method guards; @Public has none", () => {
    const orders = "src/orders/orders.controller.ts";
    const reports = "src/reports/reports.controller.ts";
    const jwt = ["JwtAuthGuard", "AuthGuard('jwt')"];
    const route = (method, r, file, line, auth, guards) => ({
      method,
      route: r,
      file,
      line,
      framework: "nestjs",
      auth,
      guards,
    });
    assert.deepEqual(collectApi(app("nest-app"), {}, [nestjs]), [
      route("GET", "/api/health", "src/health/health.controller.ts", 7, "none", []),
      route("GET", "/api/orders", orders, 14, "user", jwt),
      route("POST", "/api/orders", orders, 24, "role", [...jwt, "RolesGuard", "Roles(admin, manager)"]),
      route("GET", "/api/orders/:id", orders, 19, "user", jwt),
      route("PUT", "/api/orders/:id", orders, 36, "user", jwt),
      route("ANY", "/api/orders/webhook", orders, 41, "none", []),
      route("DELETE", "/api/reports/:year", reports, 17, "unknown", ["JwtAuthGuard"]),
      route("GET", "/api/reports/:year", reports, 10, "role", [
        "JwtAuthGuard",
        "RolesGuard",
        "PermissionsGuard",
        "Roles(Role.Admin)",
      ]),
    ]);
  });

  test("api: paths of several values, a path that is not a literal, two global prefixes, a class that is no controller, an unclosed call", () => {
    const controller = [
      "@Controller({ path: ['shop', 'store'] })",
      "export class ShopController {",
      "  @Get(['items', 'products'])",
      "  list() {}",
      "  @Get(ITEMS_PATH)",
      "  other() {}",
      "  /*",
      "  @Post('hidden')",
      "  */",
      "}",
      "@Injectable()",
      "export class Helper {",
      "  @Get('never')",
      "  x() {}",
      "}",
      "@Controller('broken')",
      "export class Broken {",
      "  @Get(':id'",
    ].join("\n");
    const sources = new Map([
      ["a/main.ts", "app.setGlobalPrefix('api');"],
      ["b/main.ts", "// two applications, two prefixes: neither is applied\napp.setGlobalPrefix('v2');"],
      ["a/shop.controller.ts", controller],
    ]);
    assert.deepEqual(
      nestRoutes(sources).map((r) => `${r.method} ${r.route} ${r.line} ${r.guards.join(",")}`),
      ["GET /shop/items 3 ", "GET /store/items 3 ", "GET /shop/products 3 ", "GET /store/products 3 "],
    );
    // A global guard of `useGlobalGuards`, a class marked public.
    const globalGuards = new Map([
      ["main.ts", "app.useGlobalGuards(new JwtAuthGuard(reflector), new ThrottlerGuard());"],
      [
        "x.ts",
        "@Public()\n@Controller('open')\nexport class Open {\n  @Get()\n  a() {}\n}\n@Controller('closed')\nexport class Closed {\n  @Get()\n  b() {}\n}",
      ],
    ]);
    assert.deepEqual(
      nestRoutes(globalGuards).map((r) => `${r.route} ${r.guards.join(",")}`),
      ["/open ", "/closed JwtAuthGuard,ThrottlerGuard"],
    );
  });

  test("behaviours: @Query, the checks of class-validator on a DTO's fields, @Cron and @Interval; a decorator in a comment is none", () => {
    const dto = "src/orders/dto/create-order.dto.ts";
    const check = (signal, line, field, extra = {}) => ({
      family: "validation",
      signal,
      file: dto,
      line,
      field,
      ...extra,
      via: "class-validator",
    });
    assert.deepEqual(hintsOf("nest-app", dto), [
      check("min", 7, "customer", { value: 1 }),
      check("max", 7, "customer", { value: 80 }),
      check("required", 7, "customer"),
      check("email", 11, "email"),
      check("optional", 11, "email"),
      {
        family: "values",
        signal: "enum",
        file: dto,
        line: 14,
        field: "shipping",
        values: ["standard", "express"],
        via: "class-validator",
      },
      check("required", 14, "shipping"),
      check("integer", 19, "quantity"),
      check("min", 19, "quantity", { value: 1 }),
      check("max", 19, "quantity", { value: 9 }),
      check("required", 19, "quantity"),
      check("required", 22, "reference"),
    ]);
    const orders = "src/orders/orders.controller.ts";
    assert.deepEqual(hintsOf("nest-app", orders), [
      { family: "search", signal: "param", file: orders, line: 15, field: "q", via: "nestjs" },
      { family: "pagination", signal: "page", file: orders, line: 15, field: "page", via: "nestjs" },
    ]);
    const tasks = "src/tasks/tasks.service.ts";
    assert.deepEqual(hintsOf("nest-app", tasks), [
      { family: "schedule", signal: "cron", file: tasks, line: 6, value: "0 * * * *", via: "nestjs" },
      { family: "schedule", signal: "interval", file: tasks, line: 9, value: 5000, via: "nestjs" },
    ]);
    // Through the kit: the same hints, the cron expression once (the kit's own reader of JavaScript gives it first).
    const items = collectBehaviours(app("nest-app"), [nestjs]).items;
    assert.equal(items.filter((i) => i.via === "class-validator").length, 12);
    assert.deepEqual(
      items.filter((i) => i.family === "schedule").map((i) => `${i.signal} ${i.line} ${i.via}`),
      ["cron 6 js", "interval 9 nestjs"],
    );
    assert.ok(!items.some((i) => i.field === "notes"), "a check in a comment is none");
  });
});

describe("Angular (adapters/stack/angular.mjs)", () => {
  test("screens: children composed, lazy routes mounted (an export, an NgModule), guards inherited; redirects, ** and comments left out", () => {
    const routes = "src/app/app.routes.ts";
    const admin = "src/app/admin/admin.routes.ts";
    const adminGuards = ["authGuard", "roles(admin)", "roleGuard('admin')"];
    assert.deepEqual(collectScreens(app("angular-app"), {}, [angular]), [
      { route: "/", file: routes, line: 9, framework: "angular" },
      { route: "/admin", file: admin, line: 8, framework: "angular", auth: "role", guards: adminGuards },
      {
        route: "/admin/users",
        file: admin,
        line: 10,
        framework: "angular",
        auth: "role",
        guards: [...adminGuards, "canMatch"],
      },
      { route: "/login", file: routes, line: 10, framework: "angular" },
      { route: "/orders", file: routes, line: 15, framework: "angular", auth: "user", guards: ["authGuard"] },
      { route: "/orders/:id", file: routes, line: 16, framework: "angular", auth: "user", guards: ["authGuard"] },
      { route: "/reports/:year", file: "src/app/reports/reports-routing.module.ts", line: 5, framework: "angular" },
    ]);
  });

  test("screens: the old './x#XModule' form, a default export, a lazy module not among the sources, forRoot([...])", () => {
    const sources = new Map([
      [
        "src/app/app.module.ts",
        [
          "@NgModule({ imports: [RouterModule.forRoot([",
          "  { path: 'billing', loadChildren: './billing/billing.module#BillingModule' },",
          "  { path: 'help', loadChildren: () => import('./help/help.routes') },",
          "  { path: 'missing', loadChildren: () => import('./missing/missing.routes').then((m) => m.ROUTES) },",
          "  { path: 'news/:slug', component: NewsComponent, canActivate: [AuthGuard, RoleGuard] },",
          "  { path: NEWS_PATH, component: OtherComponent },",
          "])] })",
          "export class AppModule {}",
        ].join("\n"),
      ],
      [
        "src/app/billing/billing.module.ts",
        "@NgModule({ imports: [RouterModule.forChild([{ path: '', component: BillingComponent }])] })\nexport class BillingModule {}",
      ],
      ["src/app/help/help.routes.ts", "export default [{ path: 'faq', component: FaqComponent }] satisfies Routes;"],
    ]);
    assert.deepEqual(angularScreens(sources), [
      { route: "/billing", file: "src/app/billing/billing.module.ts", line: 1 },
      { route: "/help/faq", file: "src/app/help/help.routes.ts", line: 1 },
      { route: "/news/:slug", file: "src/app/app.module.ts", line: 5, guards: ["AuthGuard", "RoleGuard"] },
    ]);
  });
});

describe("Vue Router (adapters/stack/vue-router.mjs)", () => {
  test("screens: children and an imported array composed, beforeEnter and meta as guards; redirects, catch-all and comments left out", () => {
    const index = "src/router/index.ts";
    const admin = "src/router/admin.ts";
    const adminGuards = ["requiresAuth", "roles(admin)"];
    assert.deepEqual(collectScreens(app("vue-app"), {}, [vueRouter]), [
      { route: "/", file: index, line: 9, framework: "vue-router" },
      { route: "/account/profile", file: index, line: 22, framework: "vue-router" },
      {
        route: "/account/security",
        file: index,
        line: 23,
        framework: "vue-router",
        auth: "unknown",
        guards: ["requireAuth", "beforeEnter"],
      },
      { route: "/admin", file: admin, line: 4, framework: "vue-router", auth: "role", guards: adminGuards },
      { route: "/admin/users", file: admin, line: 5, framework: "vue-router", auth: "role", guards: adminGuards },
      { route: "/orders", file: index, line: 10, framework: "vue-router", auth: "unknown", guards: ["requiresAuth"] },
      {
        route: "/orders/:id",
        file: index,
        line: 12,
        framework: "vue-router",
        auth: "unknown",
        guards: ["requireAuth"],
      },
    ]);
  });

  test("screens: createRouter({ routes: [...] }), a spread of an array imported through '@/', arrays that mount each other", () => {
    const sources = new Map([
      [
        "src/router/index.js",
        "import { createRouter } from 'vue-router';\nimport { shopRoutes } from '@/router/shop';\nexport default createRouter({ routes: [{ path: '/', component: Home }, ...shopRoutes] });",
      ],
      [
        "src/router/shop.js",
        "export const shopRoutes = [{ path: '/shop', component: Shop, children: loopRoutes }];\nexport const loopRoutes = [{ path: 'again', component: Again, children: shopRoutes }];",
      ],
    ]);
    assert.deepEqual(vueScreens(sources), [
      { route: "/", file: "src/router/index.js", line: 3 },
      { route: "/shop", file: "src/router/shop.js", line: 1 },
      { route: "/shop/again", file: "src/router/shop.js", line: 2 },
    ]);
  });
});

describe("React Router (adapters/stack/react-router.mjs)", () => {
  test("screens: JSX routes nested, index and layout routes, descendant routes of another file, route objects, version 5; redirects and * left out", () => {
    const appFile = "src/App.tsx";
    const adminFile = "src/admin/AdminRoutes.tsx";
    const legacy = "src/legacy/LegacyRoutes.jsx";
    const shop = "src/router.tsx";
    const screen = (route, file, line, auth, guards) => ({
      route,
      file,
      line,
      framework: "react-router",
      ...(guards ? { auth, guards } : {}),
    });
    assert.deepEqual(collectScreens(app("react-router-app"), {}, [reactRouter]), [
      screen("/", appFile, 10),
      screen("/about", legacy, 10),
      screen("/admin", adminFile, 8, "role", ["RequireAdmin"]),
      screen("/admin/users", adminFile, 9, "role", ["RequireAdmin"]),
      screen("/billing", legacy, 9, "unknown", ["PrivateRoute"]),
      screen("/login", appFile, 28),
      screen("/orders", appFile, 11, "unknown", ["RequireAuth"]),
      screen("/orders/:id", appFile, 19, "unknown", ["RequireAuth"]),
      screen("/settings", appFile, 22, "unknown", ["ProtectedRoute"]),
      screen("/shop", shop, 11, "unknown", ["requireUser"]),
      screen("/shop/cart", shop, 12, "unknown", ["requireUser"]),
      screen("/shop/checkout", shop, 13, "unknown", ["requireUser"]),
    ]);
  });

  test("screens: useRoutes([...]) with a guarded layout, a redirect, a path that is not a literal, a tag that does not close", () => {
    const text = [
      "function App() {",
      "  return useRoutes([",
      "    { path: '/', element: <Home /> },",
      "    { path: '/team', element: <Protected><Team /></Protected>, children: [{ path: ':id', element: <Member /> }] },",
      "    { path: '/go', element: <Navigate to=\"/\" /> },",
      "    { path: 'x' + y, element: <X /> },",
      "  ]);",
      "}",
      '<Route path="/unclosed" element={<A />',
    ].join("\n");
    assert.deepEqual(reactRouterScreens(new Map([["src/main.jsx", text]])), [
      { route: "/", file: "src/main.jsx", line: 3 },
      { route: "/team", file: "src/main.jsx", line: 4, guards: ["Protected"] },
      { route: "/team/:id", file: "src/main.jsx", line: 4, guards: ["Protected"] },
    ]);
  });
});

describe("the reader of route records the routers share", () => {
  test("guard names: a name, a call with words, `new` dropped, a function in place named by its key; never a value that looks secret", () => {
    const odd = ["Qm9", "xT4", "kL2", "vR8", "pZ6"].join("");
    assert.equal(guardName("AuthGuard('jwt')"), "AuthGuard('jwt')");
    assert.equal(guardName(" new RolesGuard(reflector) "), "RolesGuard");
    assert.equal(guardName("auth.check"), "auth.check");
    assert.equal(guardName("(to) => !!to.query.ok", "beforeEnter"), "beforeEnter");
    assert.equal(guardName(`tokenGuard('${odd}')`), "tokenGuard");
    assert.equal(guardName("'a string'"), null);
    const vue = new Map([
      ["r.js", `const routes = [{ path: '/x', component: X, meta: { roles: ['admin', '${odd}'] } }];`],
    ]);
    assert.deepEqual(vueScreens(vue), [{ route: "/x", file: "r.js", line: 1, guards: ["roles(admin)"] }]);
  });

  test("roles: a long quoted value (a passphrase, a dotted key) is one value, dropped whole — never its words or segments", () => {
    // Built at run time: a passphrase of more than 64 characters, and a key of four dotted segments.
    const words = ["correct", "horse", "battery", "staple", "orbit", "lantern", "meadow", "quartz", "violet", "harbor"];
    const phrase = words.join(" ");
    const key = [0, 1, 2, 3].map((i) => ["Zx81", "qP0r", "Lm7t", "Vw2k", "Hn5y"].map((s) => s + i).join("")).join(".");
    assert.ok(phrase.length > 64 && key.length > 64);
    const vue = new Map([
      ["r.js", `const routes = [{ path: '/x', component: X, meta: { roles: ['admin', "${phrase}", \`${key}\`] } }];`],
    ]);
    assert.deepEqual(vueScreens(vue)[0].guards, ["roles(admin)"]);
    const angularRoutes = new Map([
      ["a.ts", `const routes: Routes = [{ path: 'x', component: X, data: { roles: ['${phrase}', 'admin'] } }];`],
    ]);
    assert.deepEqual(angularScreens(angularRoutes)[0].guards, ["roles(admin)"]);
    const nest = new Map([
      ["x.ts", `@Controller('x')\nexport class X {\n  @Get()\n  @Roles('${phrase}', 'admin', '${key}')\n  a() {}\n}`],
    ]);
    assert.deepEqual(nestRoutes(nest)[0].guards, ["Roles(admin)"]);
    // An unclosed string runs to the end of its line: still one value.
    assert.deepEqual(roleValues(`'admin', '${phrase}\n, Role.Manager`), ["admin", "Role.Manager"]);
    const all = JSON.stringify([vueScreens(vue), angularScreens(angularRoutes), nestRoutes(nest)]);
    for (const w of [...words, ...key.split(".")]) assert.ok(!all.includes(w), `${w} kept`);
  });

  test("a literal: its parts and keys, strings and comments skipped; modules resolved among the sources; paths joined", () => {
    const text = "[{ path: 'a' /* ] */, children: [ 'x, y', ] }, // ]\n ...rest ]";
    const tree = literalTree(text, 0);
    assert.equal(tree.parts.length, 2);
    assert.deepEqual([...tree.parts[0].node.props.keys()], ["path", "children"]);
    assert.equal(tree.parts[0].node.props.get("children").node.parts.length, 1);
    assert.equal(tree.end, text.length);
    const files = new Set(["src/app/admin/admin.routes.ts", "src/views/x/index.ts"]);
    const has = (f) => files.has(f);
    assert.equal(resolveModule("src/app/app.routes.ts", "./admin/admin.routes", has), "src/app/admin/admin.routes.ts");
    assert.equal(resolveModule("src/router/index.ts", "@/views/x", has), "src/views/x/index.ts");
    assert.equal(resolveModule("a.ts", "../x", has), null);
    assert.equal(resolveModule("src/a.ts", "lodash", has), null);
    assert.deepEqual(
      [joinRoute("/admin", "users"), joinRoute("/admin", "/abs"), joinRoute("", ""), joinRoute("/a/", "b/")],
      ["/admin/users", "/abs", "/", "/a/b"],
    );
  });
});
