// The PHP stack adapters (ARCHITECTURE.md §5, §6.9): Laravel (adapters/stack/laravel.mjs) and Symfony
// (adapters/stack/symfony.mjs) on their fixture applications (test/fixtures/apps/laravel-app, symfony-app) — the
// routes and their guards, what is never read (a test, a Blade view, a declaration in a comment), the behaviour hints —
// and every reader on crafted files of 200,000 characters (RULES.md S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { stackSources } from "../../engine/facts/stacks.mjs";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import { createSink, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import laravel, { LARAVEL_PATTERNS, resourceParameter } from "../../adapters/stack/laravel.mjs";
import symfony, { SYMFONY_PATTERNS } from "../../adapters/stack/symfony.mjs";
import { STACK_PHP_PATTERNS, phpScan } from "../../engine/facts/stack-php.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");
/** An api item as the adapters return it. */
const route = (method, path, file, line, guards = []) => ({ method, route: path, file, line, guards });
/** The files the kit gives an adapter in a fixture (stackSources: tests and generated files left out) and its routes. */
function readFixture(adapter, app) {
  const [{ sources }] = stackSources(path.join(APPS, app), [adapter], "api");
  return { files: [...sources.keys()], items: adapter.api({ sources }) };
}
/** The hints an adapter pushes for one text, through the sink of the kit (C-like comments dropped), by line. */
function hintsOf(adapter, file, text) {
  const sink = createSink(file, text, jsCommentRanges(text));
  adapter.behaviours(text, sink, file);
  return sink.items.sort((a, b) => a.line - b.line);
}
/** A string that looks like a key, built at run time (never a literal of the repository). */
const KEY = ["kQ9x", "Z2mP7r", "T1vB8n", "K3w4fA"].join("");

describe("Laravel (adapters/stack/laravel.mjs)", () => {
  test("the routes of the fixture: verbs, view, match, a resource, nested groups, a route's own middleware, /api", () => {
    const { files, items } = readFixture(laravel, "laravel-app");
    // A test (tests/Feature/OrderTest.php) and a Blade view are never given; every other PHP file is.
    assert.deepEqual(files, [
      "app/Console/Kernel.php",
      "app/Http/Controllers/OrderController.php",
      "app/Http/Requests/StoreOrderRequest.php",
      "app/Models/Order.php",
      "bootstrap/app.php",
      "routes/api.php",
      "routes/console.php",
      "routes/web.php",
    ]);
    const api = "routes/api.php";
    const web = "routes/web.php";
    const auth = ["auth"];
    const admin = ["auth", "can:admin"];
    assert.deepEqual(items, [
      // routes/api.php: "/api" added, a middleware chained after a closure, an apiResource and its `only`.
      route("GET", "/api/user", api, 9, ["auth:sanctum"]),
      route("POST", "/api/login", api, 13),
      route("GET", "/api/orders", api, 16, ["auth:sanctum"]),
      route("POST", "/api/orders", api, 16, ["auth:sanctum"]),
      route("GET", "/api/orders/{order}", api, 16, ["auth:sanctum"]),
      route("GET", "/api/categories/{category}", api, 17, ["auth:sanctum"]),
      // routes/web.php: the routes in comments (//, #, /* */) are not read.
      route("GET", "/", web, 8),
      route("GET", "/dashboard", web, 15, auth),
      route("GET", "/orders", web, 16, auth),
      route("GET", "/orders/create", web, 16, auth),
      route("POST", "/orders", web, 16, auth),
      route("GET", "/orders/{order}", web, 16, auth),
      route("GET", "/orders/{order}/edit", web, 16, auth),
      route("PUT", "/orders/{order}", web, 16, auth),
      route("PATCH", "/orders/{order}", web, 16, auth),
      route("GET", "/admin/reports", web, 19, admin),
      route("GET", "/admin/settings", web, 20, [...admin, "role:admin"]),
      route("POST", "/admin/settings", web, 20, [...admin, "role:admin"]),
      // withoutMiddleware(['auth']) takes the group's guard away; a rate limit is no access rule.
      route("POST", "/hooks/payment", web, 24),
      route("GET", "/shop/categories/{category}", web, 28),
    ]);
  });

  test("a routes file mounted by a group takes its prefix and middleware; resources(); nested resources; can()", () => {
    const sources = new Map([
      [
        "app/Providers/RouteServiceProvider.php",
        [
          "<?php",
          "class RouteServiceProvider",
          "{",
          "    public function boot(): void",
          "    {",
          "        Route::middleware('api')->prefix('api')->group(base_path('routes/api.php'));",
          "        Route::middleware(['web', 'auth'])->prefix('admin')->group(__DIR__ . '/../../routes/admin.php');",
          "    }",
          "}",
        ].join("\n"),
      ],
      ["routes/api.php", "<?php\nRoute::middleware('auth')->get('/me', [MeController::class, 'show']);\n"],
      [
        "routes/admin.php",
        [
          "<?php",
          "Route::resources(['photos' => PhotoController::class, 'user-profiles' => X::class], ['only' => ['index', 'show']]);",
          "Route::apiResource('photos.comments', CommentController::class)->except(['update', 'destroy']);",
          `Route::get('/hook', HookController::class)->middleware('signature:${KEY}');`,
          "Route::put('/posts/{post}', [PostController::class, 'update'])->can('update', 'post');",
        ].join("\n"),
      ],
    ]);
    const admin = "routes/admin.php";
    const auth = ["auth"];
    assert.deepEqual(laravel.api({ sources }), [
      // Mounted with the prefix "api" (Laravel 10's RouteServiceProvider): never "/api/api".
      route("GET", "/api/me", "routes/api.php", 2, auth),
      route("GET", "/admin/photos", admin, 2, auth),
      route("GET", "/admin/photos/{photo}", admin, 2, auth),
      route("GET", "/admin/user-profiles", admin, 2, auth),
      route("GET", "/admin/user-profiles/{user_profile}", admin, 2, auth),
      route("GET", "/admin/photos/{photo}/comments", admin, 3, auth),
      route("POST", "/admin/photos/{photo}/comments", admin, 3, auth),
      route("GET", "/admin/photos/{photo}/comments/{comment}", admin, 3, auth),
      // A middleware's parameter that looks like a key is never kept (RULES.md S7): its name is.
      route("GET", "/admin/hook", admin, 4, ["auth", "signature"]),
      route("PUT", "/admin/posts/{post}", admin, 5, ["auth", "can:update,post"]),
    ]);
  });

  test("routes/api.php takes bootstrap/app.php's apiPrefix; Route::group([…]) composes prefixes and middleware", () => {
    const sources = new Map([
      ["bootstrap/app.php", "<?php\nApplication::configure()->withRouting(apiPrefix: 'api/v1');\n"],
      ["routes/api.php", "<?php\nRoute::get('/ping', fn () => 'pong');\n"],
      [
        "routes/web.php",
        [
          "<?php",
          "Route::group(['prefix' => 'shop', 'middleware' => ['auth', 'verified']], function () {",
          "    Route::group(['prefix' => '/cart/', 'excluded_middleware' => 'verified'], function () {",
          "        Route::delete('/{item}', [CartController::class, 'remove'])->middleware(EnsureOwner::class);",
          "    });",
          "    Route::options('/', fn () => null);",
          "});",
          "Route::any('/fallback/{path?}', FallbackController::class);",
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(laravel.api({ sources }), [
      route("GET", "/api/v1/ping", "routes/api.php", 2),
      route("DELETE", "/shop/cart/{item}", "routes/web.php", 4, ["auth", "EnsureOwner"]),
      route("OPTIONS", "/shop", "routes/web.php", 6, ["auth", "verified"]),
      route("ANY", "/fallback/{path?}", "routes/web.php", 8),
    ]);
  });

  test("the parameter of a resource is the singular of its last segment (stack-common's singular)", () => {
    const cases = { orders: "order", categories: "category", addresses: "address", boxes: "box", statuses: "status" };
    const words = { movies: "movie", cookies: "cookie", series: "series", houses: "house", "admin/news": "news" };
    for (const [name, parameter] of Object.entries({ ...cases, ...words, "user-profiles": "user_profile" }))
      assert.equal(resourceParameter(name), parameter, name);
  });

  test("the PHP walk: //, # and /* */ are comments, an attribute's #[ and a string's // are not; brackets matched", () => {
    const text = "#[Route('/a')] // x\n$u = 'http://h'; # y\n/* z */ f([1, (2)]);";
    const { comments, closing } = phpScan(text);
    assert.deepEqual(
      comments.map(([s, e]) => text.slice(s, e)),
      ["// x", "# y", "/* z */"],
    );
    const call = text.indexOf("f(") + 1;
    assert.equal(text[closing.get(call)], ")");
    assert.equal(closing.get(call), text.length - 2);
  });

  test("the behaviour hints of the fixture: the query builder, a request, validation rules, the scheduler", () => {
    const { items } = collectBehaviours(path.join(APPS, "laravel-app"), [laravel]);
    const at = (file, line, rest) => ({ file, line, via: "laravel", ...rest });
    const kernel = "app/Console/Kernel.php";
    const ctrl = "app/Http/Controllers/OrderController.php";
    const form = "app/Http/Requests/StoreOrderRequest.php";
    assert.deepEqual(items, [
      at(kernel, 13, { family: "schedule", signal: "cron", value: "0 * * * *" }),
      at(kernel, 14, { family: "schedule", signal: "cron", value: "0 * * * 1-5" }),
      at(ctrl, 12, { family: "search", signal: "param", field: "q" }),
      // The order commented out on line 13 is not read.
      at(ctrl, 15, { family: "search", signal: "contains", field: "customer" }),
      at(ctrl, 16, { family: "filter", signal: "in", field: "status" }),
      at(ctrl, 16, { family: "filter", signal: "param", field: "statuses" }),
      at(ctrl, 17, { family: "sort", signal: "orderBy", field: "created_at", value: "desc" }),
      at(ctrl, 18, { family: "pagination", signal: "pageSize", value: 15 }),
      at(ctrl, 25, { family: "sort", signal: "orderBy", field: "created_at", value: "desc" }),
      at(ctrl, 25, { family: "pagination", signal: "limit", value: 10 }),
      at(ctrl, 31, { family: "validation", signal: "required", field: "customer" }),
      at(ctrl, 31, { family: "validation", signal: "max", field: "customer", value: 80 }),
      at(ctrl, 32, { family: "validation", signal: "required", field: "quantity" }),
      at(ctrl, 32, { family: "validation", signal: "integer", field: "quantity" }),
      at(ctrl, 32, { family: "validation", signal: "min", field: "quantity", value: 1 }),
      at(ctrl, 32, { family: "validation", signal: "max", field: "quantity", value: 9 }),
      at(ctrl, 33, { family: "values", signal: "enum", field: "status", values: ["open", "shipped"] }),
      at(form, 13, { family: "validation", signal: "optional", field: "email" }),
      at(form, 13, { family: "validation", signal: "email", field: "email" }),
      at(form, 13, { family: "validation", signal: "max", field: "email", value: 255 }),
      at(form, 14, { family: "validation", signal: "required", field: "channel" }),
      // Rule::in(['email', 'phone']) is a list of values, never an "email" rule.
      at(form, 14, { family: "values", signal: "enum", field: "channel", values: ["email", "phone"] }),
      at("routes/console.php", 5, { family: "schedule", signal: "cron", value: "0 1 * * *" }),
    ]);
  });

  test("hints: a # comment is not read, a range and a cursor, the scheduler's frequencies as cron expressions", () => {
    const text = [
      "<?php",
      "# Order::orderBy('legacy', 'asc');",
      "Order::whereBetween('total', [1, 9])->cursorPaginate(20);",
      "$schedule->command('a')->everyFiveMinutes();",
      "$schedule->command('b')->mondays()->at('9:15');",
      "$schedule->call(fn () => 1)->weekly();",
    ].join("\n");
    const at = (line, rest) => ({ file: "x.php", line, via: "laravel", ...rest });
    assert.deepEqual(hintsOf(laravel, "x.php", text), [
      at(3, { family: "filter", signal: "range", field: "total" }),
      at(3, { family: "pagination", signal: "pageSize", value: 20 }),
      at(3, { family: "pagination", signal: "cursor" }),
      at(4, { family: "schedule", signal: "cron", value: "*/5 * * * *" }),
      at(5, { family: "schedule", signal: "cron", value: "15 9 * * 1" }),
      at(6, { family: "schedule", signal: "cron", value: "0 0 * * 0" }),
    ]);
  });
});

describe("Symfony (adapters/stack/symfony.mjs)", () => {
  test("the routes of the fixture: attributes and annotations, a class's prefix, every method, the guards", () => {
    const { files, items } = readFixture(symfony, "symfony-app");
    // Only the PHP files under src/: tests/ and config/ are never given.
    assert.deepEqual(files, [
      "src/Controller/Admin/ReportController.php",
      "src/Controller/HealthController.php",
      "src/Controller/OrderController.php",
      "src/Entity/Order.php",
      "src/Repository/OrderRepository.php",
    ]);
    const reports = "src/Controller/Admin/ReportController.php";
    const orders = "src/Controller/OrderController.php";
    const user = ["ROLE_USER"];
    assert.deepEqual(items, [
      // @Route and @IsGranted read in the docblocks; a "@Route" in a // comment is not.
      route("GET", "/admin/reports/monthly", reports, 22, ["ROLE_ADMIN"]),
      route("POST", "/admin/reports/rebuild", reports, 30, ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"]),
      route("ANY", "/health", "src/Controller/HealthController.php", 10),
      route("GET", "/orders", orders, 17, user),
      route("GET", "/orders/{id}", orders, 26, user),
      route("HEAD", "/orders/{id}", orders, 26, user),
      route("GET", "/orders/{id}/edit", orders, 32, [...user, "ROLE_EDITOR"]),
      route("POST", "/orders/{id}/edit", orders, 32, [...user, "ROLE_EDITOR"]),
      // denyAccessUnlessGranted at the start of the body.
      route("DELETE", "/orders/{id}", orders, 39, [...user, "ROLE_ADMIN"]),
      // The routes in a // and a /* */ comment are not read.
      route("ANY", "/orders/export", orders, 56, user),
    ]);
  });

  test("a class's methods by default, named arguments, Security's roles, a key-like role, an attribute too far", () => {
    const text = [
      "<?php",
      "#[Route(path: '/api/items', methods: ['GET'])]",
      "#[IsGranted(attribute: 'ROLE_API')]",
      "class ItemController",
      "{",
      "    #[Route('/{id}')]",
      "    public function show(): Response {}",
      "",
      "    #[Route('/{id}', methods: 'PUT')]",
      `    #[Security("is_granted('ROLE_A') or is_granted('ROLE_B')")]`,
      "    public function update(): Response {}",
      "",
      "    #[Route('/secret')]",
      `    #[IsGranted('${KEY}')]`,
      "    public function secret(): Response {}",
      "",
      "    #[Route('/far')]",
      `    private const FILLER = '${"x".repeat(2100)}';`,
      "    public function far(): Response {}",
      "}",
    ].join("\n");
    const file = "src/Controller/ItemController.php";
    assert.deepEqual(symfony.api({ sources: new Map([[file, text]]) }), [
      route("GET", "/api/items/{id}", file, 6, ["ROLE_API"]),
      route("PUT", "/api/items/{id}", file, 9, ["ROLE_API", "ROLE_A", "ROLE_B"]),
      // A role that looks like a key is never kept (RULES.md S7): the check's name is.
      route("GET", "/api/items/secret", file, 13, ["ROLE_API", "IsGranted"]),
    ]);
  });

  test("the behaviour hints of the fixture: Doctrine, the query parameters, the Validator's constraints", () => {
    const { items } = collectBehaviours(path.join(APPS, "symfony-app"), [symfony]);
    const at = (file, line, via, rest) => ({ file, line, via, ...rest });
    const ctrl = "src/Controller/OrderController.php";
    const entity = "src/Entity/Order.php";
    const repo = "src/Repository/OrderRepository.php";
    assert.deepEqual(items, [
      at(ctrl, 20, "symfony", { family: "search", signal: "param", field: "q" }),
      at(ctrl, 21, "symfony", { family: "pagination", signal: "page", field: "page", value: 1 }),
      at(ctrl, 57, "symfony", { family: "filter", signal: "param", field: "format" }),
      at(entity, 16, "symfony", { family: "validation", signal: "required", field: "customer" }),
      at(entity, 17, "symfony", { family: "validation", signal: "min", field: "customer", value: 1 }),
      at(entity, 17, "symfony", { family: "validation", signal: "max", field: "customer", value: 80 }),
      at(entity, 21, "symfony", { family: "validation", signal: "email", field: "email" }),
      at(entity, 25, "symfony", {
        family: "values",
        signal: "enum",
        field: "status",
        values: ["open", "shipped", "cancelled"],
      }),
      at(entity, 29, "symfony", { family: "validation", signal: "min", field: "quantity", value: 1 }),
      at(entity, 29, "symfony", { family: "validation", signal: "max", field: "quantity", value: 9 }),
      at(repo, 19, "doctrine", { family: "search", signal: "like", field: "customer" }),
      at(repo, 19, "doctrine", { family: "search", signal: "caseInsensitive", field: "customer" }),
      at(repo, 20, "doctrine", { family: "filter", signal: "in", field: "status" }),
      at(repo, 23, "doctrine", { family: "sort", signal: "orderBy", field: "createdAt", value: "desc" }),
      at(repo, 24, "doctrine", { family: "pagination", signal: "offset" }),
      at(repo, 25, "doctrine", { family: "pagination", signal: "limit", value: 20 }),
      at(repo, 32, "doctrine", { family: "sort", signal: "orderBy", field: "placedAt", value: "desc" }),
    ]);
  });

  test("hints: the expression builder, a comparison, # and // comments not read, GreaterThan, Choice's choices", () => {
    const text = [
      "<?php",
      "class OrderRepository",
      "{",
      "    public function find(QueryBuilder $qb): array",
      "    {",
      "        $qb->andWhere($qb->expr()->like('o.reference', ':ref'));",
      "        $qb->andWhere('o.total >= :min');",
      "        # $qb->setMaxResults(5);",
      "        // $qb->orderBy('o.legacy', 'ASC');",
      "        return $qb->getQuery()->getResult();",
      "    }",
      "    #[Assert\\GreaterThan(0)]",
      "    private int $total = 1;",
      "    #[Assert\\Choice(choices: ['a', 'b'], message: 'Choose one.')]",
      "    private string $kind = 'a';",
      "}",
    ].join("\n");
    const at = (line, via, rest) => ({ file: "x.php", line, via, ...rest });
    assert.deepEqual(hintsOf(symfony, "x.php", text), [
      at(6, "doctrine", { family: "search", signal: "like", field: "reference" }),
      at(7, "doctrine", { family: "filter", signal: "range", field: "total" }),
      at(12, "symfony", { family: "validation", signal: "min", field: "total", value: 0 }),
      at(14, "symfony", { family: "values", signal: "enum", field: "kind", values: ["a", "b"] }),
    ]);
  });
});

describe("linearity (RULES.md S5)", () => {
  test("every expression is bounded: no unbounded quantifier", () => {
    for (const [name, re] of Object.entries({ ...STACK_PHP_PATTERNS, ...LARAVEL_PATTERNS, ...SYMFONY_PATTERNS }))
      assert.doesNotMatch(re.source.replace(/\\./g, ""), /[*+]|\{\d+,\}/, name);
  });
});
