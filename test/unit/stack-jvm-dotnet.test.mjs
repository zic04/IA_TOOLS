// The stack adapters of Spring (Java, Kotlin) and of ASP.NET Core (C#), ARCHITECTURE.md §5, §6.9: the routes and
// their guards of each fixture application (test/fixtures/apps/spring-app, dotnet-app), the forms each one reads and
// those it leaves out (a comment, a constant, a client, a test), the behaviour hints, and the linearity of every
// reader and expression on crafted files (RULES.md S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import spring, { springRoutes } from "../../adapters/stack/spring.mjs";
import aspnet, { aspnetRoutes } from "../../adapters/stack/aspnet.mjs";
import { collectApi } from "../../engine/facts/api.mjs";
import { collectBehaviours } from "../../engine/facts/behaviours.mjs";
import { createSink, jsCommentRanges } from "../../engine/facts/behaviour-common.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

const APPS = path.join(KIT_ROOT, "test", "fixtures", "apps");

/** An item of the `api` source, as collectApi gives it. */
const routeOf = (framework, dir) => (method, route, file, line, auth, guards) => ({
  method,
  route,
  file: dir + file,
  line,
  framework,
  auth,
  guards,
});

/** An item of the `behaviours` source. */
const hintOf =
  (dir) =>
  (file, line, family, signal, via, extra = {}) => ({ family, signal, file: dir + file, line, via, ...extra });

/** The hints of one text read by an adapter (its comments left out, as collectBehaviours does). */
function hintsOf(adapter, file, text) {
  const sink = createSink(file, text, jsCommentRanges(text));
  adapter.behaviours(text, sink, file);
  return sink.items.map((i) => [i.line, i.family, i.signal, i.field ?? "", i.value ?? ""].join(" "));
}

/** The routes of an adapter's reader, one string each: "METHOD route line guards". */
const routesOf = (items) => items.map((r) => `${r.method} ${r.route} ${r.line} ${r.guards.join(",")}`.trim());

/** A value that looks like a key (no provider's shape), built at run time: a guard never keeps it (RULES.md S7). */
const KEY = ["k9x2Lq8Z", "t4Vm7Wp3", "Rn6Ys"].join("");

describe("Spring (Java, Kotlin)", () => {
  const app = path.join(APPS, "spring-app");
  const J = "src/main/java/com/example/shop/orders/";
  const K = "src/main/kotlin/com/example/shop/admin/";

  test("api: the controllers' mappings under their class's path, with the class's and the method's guards", () => {
    const java = routeOf("spring", J);
    const kotlin = routeOf("spring", K);
    // Left out: the commented mappings, the constant path (OrderPaths.ARCHIVE), the helper class of the same file
    // that is no controller, the Feign client (BillingClient), the controller of a test (src/test/).
    assert.deepEqual(collectApi(app, {}, [spring]), [
      kotlin("POST", "/api/admin", "AdminController.kt", 18, "role", ["RolesAllowed(ADMIN)"]),
      kotlin("GET", "/api/admin/statistics", "AdminController.kt", 12, "role", ["RolesAllowed(ADMIN)"]),
      kotlin("GET", "/api/admin/stats", "AdminController.kt", 12, "role", ["RolesAllowed(ADMIN)"]),
      kotlin("PATCH", "/api/admin/users/{id}", "AdminController.kt", 15, "role", ["RolesAllowed(ADMIN)"]),
      java("GET", "/api/orders", "OrderController.java", 23, "user", ["isAuthenticated()"]),
      java("POST", "/api/orders", "OrderController.java", 36, "role", ["isAuthenticated()", "hasRole('ADMIN')"]),
      java("DELETE", "/api/orders/{id}", "OrderController.java", 48, "role", [
        "isAuthenticated()",
        "Secured(ROLE_ADMIN)",
      ]),
      java("GET", "/api/orders/{id}", "OrderController.java", 31, "user", ["isAuthenticated()"]),
      java("PUT", "/api/orders/{id}", "OrderController.java", 42, "user", ["isAuthenticated()"]),
      java("DELETE", "/api/orders/{id}/purge", "OrderController.java", 48, "role", [
        "isAuthenticated()",
        "Secured(ROLE_ADMIN)",
      ]),
      java("GET", "/api/orders/export", "OrderController.java", 53, "user", ["isAuthenticated()"]),
      java("HEAD", "/api/orders/export", "OrderController.java", 53, "user", ["isAuthenticated()"]),
      java("ANY", "/api/orders/legacy", "OrderController.java", 58, "user", ["isAuthenticated()"]),
    ]);
  });

  test("forms: `path =` without a slash, `method =` alone, an array next to `produces`, a class per span, a constant prefix; a key in a guard masked", () => {
    const source = [
      "@Controller",
      '@RequestMapping(path = "web")',
      "class Pages {",
      "  @RequestMapping(method = [RequestMethod.POST, RequestMethod.PUT])",
      "  fun save() {}",
      '  @GetMapping(value = ["/a", "/b"], produces = ["text/html"])',
      "  fun ab() {}",
      "}",
      "@RestController",
      "class NoPrefix {",
      '  @GetMapping("health/") @PreAuthorize("hasAuthority(\'ops\')")',
      '  fun health() = "up"',
      "}",
      "@RestController @RequestMapping(Paths.BASE)",
      'class Constant { @GetMapping("/x") fun x() = 1 }',
      "@RestController",
      "class Keys {",
      `  @PostMapping("/hook") @PreAuthorize("@keys.check('${KEY}')")`,
      "  fun hook() = 1",
      "}",
      "class Later {",
      '  @GetMapping("/unclosed"',
      "}",
    ].join("\n");
    // A word of a guard that looks like a key is masked: a secret never reaches the facts (RULES.md S7).
    assert.deepEqual(routesOf(springRoutes(new Map([["A.kt", source]]))), [
      "POST /web 4",
      "PUT /web 4",
      "GET /web/a 6",
      "GET /web/b 6",
      "GET /health 11 hasAuthority('ops')",
      "POST /hook 18 @keys.check('…')",
    ]);
  });

  test("nested types: a record, an enum or a class in a controller ends at its own brace; braces in strings, text blocks, chars and comments do not count", () => {
    const java = [
      "@RestController",
      '@RequestMapping("/api/orders")',
      '@PreAuthorize("isAuthenticated()")',
      "public class OrderController {",
      '  @GetMapping("/a") public String a() { return "}"; }',
      "  public record OrderDto(String name, int qty) {}",
      '  @GetMapping("/b") public String b() { return """',
      "    text block } with { braces",
      '    """; }',
      "  enum Status { OPEN, CLOSED; String label() { return name(); } }",
      "  @PostMapping(\"/c\") public void c() { char x = '}'; }",
      "  static class CreateRequest {",
      '    @GetMapping("/never") String inner() { return null; }',
      "  }",
      "  // }",
      '  @DeleteMapping("/d") public void d() {}',
      "}",
      "class After {",
      '  @GetMapping("/never2") String x() { return null; }',
      "}",
    ].join("\n");
    assert.deepEqual(routesOf(springRoutes(new Map([["A.java", java]]))), [
      "GET /api/orders/a 5 isAuthenticated()",
      "GET /api/orders/b 7 isAuthenticated()",
      "POST /api/orders/c 11 isAuthenticated()",
      "DELETE /api/orders/d 16 isAuthenticated()",
    ]);
    const kotlin = [
      "@RestController",
      '@RequestMapping("/k")',
      "class KController @Inject constructor(private val s: S) {",
      '    @GetMapping("/a") fun a() = "}"',
      "    data class Req(val name: String)",
      '    @GetMapping("/b") fun b() = 1',
      "    enum class Kind { A, B }",
      '    @PostMapping("/c") fun c() = """ raw } """',
      "    class Inner {",
      '        @GetMapping("/never") fun n() = 1',
      "    }",
      "    companion object { const val X = 1 }",
      '    @DeleteMapping("/d") fun d() = 1',
      "}",
      "data class Top(val x: Int)",
      "",
      "@RestController",
      "class Second {",
      '    @GetMapping("/second") fun s() = 1',
      "}",
    ].join("\n");
    assert.deepEqual(routesOf(springRoutes(new Map([["A.kt", kotlin]]))), [
      "GET /k/a 4",
      "GET /k/b 6",
      "POST /k/c 8",
      "DELETE /k/d 13",
      "GET /second 19",
    ]);
  });

  test("behaviours: derived queries, paging and sorting, query parameters, Bean Validation, schedules, JPQL", () => {
    const hint = hintOf(J);
    // Left out: the derived name of a @Query method (searchByReference), a commented one, a test.
    assert.deepEqual(collectBehaviours(app, [spring]), {
      items: [
        hint("OrderController.java", 25, "search", "param", "spring", { field: "q" }),
        hint("OrderController.java", 26, "pagination", "pageSize", "spring", { field: "size", value: 20 }),
        hint("OrderController.java", 27, "pagination", "page", "spring-data"),
        hint("OrderRepository.java", 13, "search", "contains", "spring-data", { field: "customerName" }),
        hint("OrderRepository.java", 13, "search", "caseInsensitive", "spring-data", { field: "customerName" }),
        hint("OrderRepository.java", 13, "pagination", "page", "spring-data"),
        hint("OrderRepository.java", 15, "filter", "in", "spring-data", { field: "status" }),
        hint("OrderRepository.java", 15, "filter", "range", "spring-data", { field: "createdAt" }),
        hint("OrderRepository.java", 17, "pagination", "limit", "spring-data", { value: 10 }),
        hint("OrderRepository.java", 17, "sort", "orderBy", "spring-data", { field: "createdAt", value: "desc" }),
        hint("OrderRepository.java", 19, "search", "contains", "sql", { field: "reference" }),
        hint("OrderRepository.java", 19, "search", "caseInsensitive", "sql", { field: "reference" }),
        hint("OrderRequest.java", 13, "validation", "required", "bean-validation", { field: "customerName" }),
        hint("OrderRequest.java", 16, "validation", "min", "bean-validation", { field: "reference", value: 1 }),
        hint("OrderRequest.java", 16, "validation", "max", "bean-validation", { field: "reference", value: 80 }),
        hint("OrderRequest.java", 19, "validation", "min", "bean-validation", { field: "quantity", value: 1 }),
        hint("OrderRequest.java", 20, "validation", "max", "bean-validation", { field: "quantity", value: 99 }),
        hint("OrderRequest.java", 23, "validation", "email", "bean-validation", { field: "contactEmail" }),
        hint("OrderRequest.java", 26, "validation", "pattern", "bean-validation", { field: "currency" }),
        hint("OrderRequest.java", 29, "validation", "required", "bean-validation", { field: "status" }),
        hint("OrderService.java", 20, "pagination", "page", "spring-data"),
        hint("OrderService.java", 25, "pagination", "page", "spring-data"),
        hint("OrderService.java", 25, "pagination", "pageSize", "spring-data", { value: 20 }),
        hint("OrderService.java", 25, "sort", "orderBy", "spring-data", { field: "createdAt", value: "desc" }),
        hint("OrderService.java", 28, "schedule", "cron", "spring", { value: "0 0 * * * *" }),
        hint("OrderService.java", 31, "schedule", "interval", "spring", { value: 60000 }),
        hintOf(K)("AdminController.kt", 19, "filter", "param", "spring", { field: "email" }),
        hintOf(K)("AdminController.kt", 23, "validation", "required", "bean-validation", { field: "name" }),
      ],
      unreadable: [],
    });
  });

  test("derived queries: limits, And/Or, IgnoreCase and AllIgnoreCase, Is, Not, a nested property; never a call", () => {
    const repository = [
      "interface People extends CrudRepository<Person, Long> {",
      "  List<Person> findDistinctTop3ByLastnameIgnoreCaseOrderByAgeAscNameDesc(String n);",
      "  List<Person> findByTagsIsEmpty();",
      "  boolean existsByEmailAllIgnoreCase(String e);",
      "  long countByStatusNotOrStatusIsNull(Status s);",
      "  byte[] getBytes();",
      "  List<Person> findByAddress_ZipCodeStartingWith(String z);",
      '  default List<Person> named() { return repo.findByNameContaining("a"); }',
      "}",
    ].join("\n");
    assert.deepEqual(hintsOf(spring, "R.java", repository), [
      "2 pagination limit  3",
      "2 filter equals lastname ",
      "2 search caseInsensitive lastname ",
      "2 sort orderBy age asc",
      "2 sort orderBy name desc",
      "3 filter equals tags ",
      "4 filter equals email ",
      "4 search caseInsensitive email ",
      "5 filter not status ",
      "5 filter equals status ",
      "7 search startsWith address.zipCode ",
    ]);
    // Outside a repository interface, a method named like a query is no hint.
    assert.deepEqual(hintsOf(spring, "S.java", "class S { List<P> findByName(String n) { return null; } }"), []);
  });
});

describe("ASP.NET Core (C#)", () => {
  const app = path.join(APPS, "dotnet-app");
  const C = "Shop.Api/Controllers/";

  test("api: controllers (a base class's route and guard inherited) and minimal APIs under their groups", () => {
    const controller = routeOf("aspnet", C);
    const minimal = routeOf("aspnet", "Shop.Api/");
    const user = ["Authorize"];
    // Left out: the commented actions and map call, the constant template (OrderRoutes.Legacy), the abstract base
    // controller itself, the controller of the test project (Shop.Api.Tests/).
    assert.deepEqual(collectApi(app, {}, [aspnet]), [
      minimal("GET", "/", "Program.cs", 11, "none", []),
      controller("GET", "/api/Customers", "CustomersController.cs", 8, "user", user),
      controller("GET", "/api/Customers/{id}", "CustomersController.cs", 11, "none", []),
      controller("GET", "/api/Orders", "OrdersController.cs", 18, "user", user),
      controller("POST", "/api/Orders", "OrdersController.cs", 36, "role", ["Authorize", "Authorize(Roles = Admin)"]),
      controller("PUT", "/api/Orders/{id:int}", "OrdersController.cs", 40, "user", user),
      controller("DELETE", "/api/Orders/{id}", "OrdersController.cs", 43, "user", [
        "Authorize",
        "Authorize(Policy = CanDelete)",
      ]),
      controller("GET", "/api/Orders/{id}", "OrdersController.cs", 33, "user", user),
      controller("PATCH", "/api/Orders/{id}/Archive", "OrdersController.cs", 55, "user", user),
      controller("GET", "/api/Orders/export", "OrdersController.cs", 51, "user", user),
      minimal("DELETE", "/api/v2/admin/cache", "Program.cs", 23, "role", [
        "RequireAuthorization",
        "RequireAuthorization(Admin)",
      ]),
      minimal("GET", "/api/v2/products", "Program.cs", 14, "user", ["RequireAuthorization"]),
      minimal("POST", "/api/v2/products", "Program.cs", 17, "role", [
        "RequireAuthorization",
        "RequireAuthorization(Admin)",
      ]),
      minimal("PUT", "/api/v2/products/{id:int}", "Program.cs", 19, "user", ["RequireAuthorization"]),
      controller("GET", "/health", "OrdersController.cs", 46, "none", []),
      minimal("GET", "/internal/metrics", "Program.cs", 26, "none", []),
      minimal("GET", "/ping", "Program.cs", 25, "none", []),
      minimal("HEAD", "/ping", "Program.cs", 25, "none", []),
    ]);
  });

  test("forms: [controller]/[action], [Route] alone, a constant class route, no controller, open or unresolved groups; a key in a guard masked", () => {
    const source = [
      '[Route("[controller]/[action]")]',
      "public class HomeController : Controller {",
      "  public IActionResult Index() => View();",
      "  [HttpGet] public IActionResult About() => View();",
      '  [Route("contact")] public IActionResult Contact() => View();',
      "}",
      "[ApiController, Route(Routes.Base)]",
      "public class ConstController : ControllerBase {",
      '  [HttpGet("rel")] public IActionResult Rel() => Ok();',
      '  [HttpGet("/abs")] public IActionResult Abs() => Ok();',
      "}",
      "public class Plain {",
      '  [HttpGet("never")] public void X() {}',
      "}",
      "var g = app.MapGroup(prefix);",
      'g.MapGet("/x", () => 1);',
      'var open = app.MapGroup("/open");',
      "open.AllowAnonymous();",
      'open.MapPost("/y", () => 1).RequireAuthorization();',
      'var sec = app.MapGroup("/sec").RequireAuthorization(p => p.RequireRole("admin"));',
      'sec.MapGet("/z", () => 1).AllowAnonymous();',
      'sec.MapPatch("/w", () => 1);',
      `sec.MapPut("/v", () => 1).RequireAuthorization(p => p.RequireClaim("api_key", "${KEY}"));`,
    ].join("\n");
    // A word of a guard that looks like a key is masked: a secret never reaches the facts (RULES.md S7).
    const group = "RequireAuthorization(p => p.RequireRole(admin))";
    assert.deepEqual(routesOf(aspnetRoutes(new Map([["A.cs", source]]))), [
      "GET /Home/About 4",
      "ANY /Home/Contact/contact 5",
      "GET /abs 10",
      "POST /open/y 19",
      "GET /sec/z 21",
      `PATCH /sec/w 22 ${group}`,
      `PUT /sec/v 23 ${group},RequireAuthorization(p => p.RequireClaim(api_key, …))`,
    ]);
  });

  test("nested types: a class, a record or an enum in a controller ends at its own brace; braces in verbatim and raw strings do not count", () => {
    const source = [
      "namespace Shop.Api.Controllers",
      "{",
      "[ApiController]",
      '[Route("api/[controller]")]',
      "[Authorize]",
      "public class OrdersController : ControllerBase",
      "{",
      '    [HttpGet("a")] public string A() => "}";',
      "    public record OrderDto(string Name, int Qty);",
      '    [HttpGet("b")] public string B() => @"C:\\x}\\";',
      "    public enum Status { Open, Closed }",
      '    [HttpPost("c")] public string C() => """ raw } """;',
      "    public class CreateRequest",
      "    {",
      '        [HttpGet("never")] public void N() {}',
      "    }",
      "    private record struct Pair(int A) { public int B => A; }",
      '    [HttpDelete("d")] public void D() {}',
      "}",
      "}",
    ].join("\n");
    assert.deepEqual(routesOf(aspnetRoutes(new Map([["A.cs", source]]))), [
      "GET /api/Orders/a 8 Authorize",
      "GET /api/Orders/b 10 Authorize",
      "POST /api/Orders/c 12 Authorize",
      "DELETE /api/Orders/d 18 Authorize",
    ]);
  });

  test("behaviours: LINQ and EF Core, [FromQuery], DataAnnotations, Hangfire and Quartz schedules", () => {
    const hint = hintOf("Shop.Api/");
    assert.deepEqual(collectBehaviours(app, [aspnet]), {
      items: [
        hint("Controllers/OrdersController.cs", 20, "search", "param", "aspnet", { field: "q" }),
        hint("Controllers/OrdersController.cs", 21, "pagination", "page", "aspnet", { field: "page", value: 1 }),
        hint("Controllers/OrdersController.cs", 22, "pagination", "pageSize", "aspnet", {
          field: "pageSize",
          value: 20,
        }),
        hint("Controllers/OrdersController.cs", 25, "search", "contains", "linq", { field: "Customer" }),
        hint("Controllers/OrdersController.cs", 25, "search", "caseInsensitive", "linq", { field: "Customer" }),
        hint("Controllers/OrdersController.cs", 26, "filter", "range", "linq", { field: "Total" }),
        hint("Controllers/OrdersController.cs", 27, "sort", "orderBy", "linq", { field: "CreatedAt", value: "desc" }),
        hint("Controllers/OrdersController.cs", 28, "pagination", "offset", "linq"),
        hint("Controllers/OrdersController.cs", 29, "pagination", "limit", "linq", { value: 20 }),
        hint("Controllers/OrdersController.cs", 53, "search", "like", "ef-core", { field: "Reference" }),
        hint("Models/OrderDto.cs", 7, "validation", "required", "data-annotations", { field: "Customer" }),
        hint("Models/OrderDto.cs", 8, "validation", "max", "data-annotations", { field: "Customer", value: 80 }),
        hint("Models/OrderDto.cs", 8, "validation", "min", "data-annotations", { field: "Customer", value: 1 }),
        hint("Models/OrderDto.cs", 11, "validation", "max", "data-annotations", { field: "Reference", value: 20 }),
        hint("Models/OrderDto.cs", 14, "validation", "min", "data-annotations", { field: "Quantity", value: 1 }),
        hint("Models/OrderDto.cs", 14, "validation", "max", "data-annotations", { field: "Quantity", value: 99 }),
        hint("Models/OrderDto.cs", 17, "validation", "email", "data-annotations", { field: "ContactEmail" }),
        hint("Models/OrderDto.cs", 20, "validation", "pattern", "data-annotations", { field: "Currency" }),
        hint("Models/OrderDto.cs", 24, "validation", "required", "data-annotations", { field: "Name" }),
        hint("Models/OrderDto.cs", 24, "validation", "min", "data-annotations", { field: "Stock", value: 0 }),
        hint("Models/OrderDto.cs", 24, "validation", "max", "data-annotations", { field: "Stock", value: 10000 }),
        hint("Program.cs", 6, "schedule", "cron", "quartz", { value: "0 0/5 * * * ?" }),
        hint("Program.cs", 15, "search", "startsWith", "linq", { field: "Name" }),
        hint("Program.cs", 15, "sort", "orderBy", "linq", { field: "Name", value: "asc" }),
        hint("Program.cs", 15, "pagination", "limit", "linq", { value: 50 }),
        hint("Program.cs", 30, "schedule", "cron", "hangfire", { value: "0 0 * * *" }),
      ],
      unreadable: [],
    });
  });

  test("behaviours: a list's Contains, ==, a case-insensitive comparison, ILike; a Cron helper with an argument keeps no value", () => {
    const text = [
      "var q = db.Orders.Where(o => statuses.Contains(o.Status) && o.Region == region",
      "  && o.Name.Contains(term, StringComparison.OrdinalIgnoreCase));",
      "var p = db.People.Where(p => EF.Functions.ILike(p.Address.City, pattern));",
      'RecurringJob.AddOrUpdate<IReport>("report", r => r.Send(), Cron.Daily(3));',
      '// RecurringJob.AddOrUpdate("old", () => Old(), "0 0 * * *");',
    ].join("\n");
    assert.deepEqual(hintsOf(aspnet, "Q.cs", text), [
      "2 search contains Name ",
      "2 search caseInsensitive Name ",
      "1 filter equals Region ",
      "1 filter in Status ",
      "3 search like City ",
      "3 search caseInsensitive City ",
      "4 schedule cron  ",
    ]);
  });
});
