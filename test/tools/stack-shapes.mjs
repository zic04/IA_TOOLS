// The crafted shapes of the stack adapters' tests (stacks-growth.test.mjs), kept in one place so that the ReDoS harness
// (test/tools/redos-worker.mjs, RULES.md S5) measures every one of them on every expression of every adapter: the
// tests measure each reader on these shapes, the harness each expression. No clock here. A shape is a prefix and the
// unit repeated after it, about n characters long: [prefix, unit].

/** [prefix, unit]: the unit repeated after the prefix. */
const fill = (unit, prefix = "") => [prefix, unit];

/** Units of the front-end routers (NestJS, Angular, Vue Router, React Router), each repeated alone. */
export const FRONT_UNITS = [
  ...[" ", "\n", "x", "(", ")", "[", "{", "}", "'", '"', "`", "/*", "//", "\\", "@", ",", ":", "<", "/", "=>"],
  ...["@Get(", "@Get()\n", "@a ", "@UseGuards(", "@Controller('a')\nexport class A {\n", "@IsString() a: string;\n"],
  ...["@Roles(", "@Query('", ".setGlobalPrefix('a');", ".useGlobalGuards(", "provide: APP_GUARD, useClass: A,"],
  ...[
    "const routes = [",
    "const aRoutes: Routes = [",
    "export default [",
    "routes: [",
    "forRoot([",
    "createBrowserRouter([",
  ],
  ...["{ path: 'a', children: [", "{ path: 'a', component: A }, ", "{ path: '', component: A, children: [] }, "],
  ...["...aRoutes, ", "children: aRoutes, ", "{ loadChildren: () => import('./x').then((m) => m.M) }, "],
  ...[
    "canActivate: [",
    "meta: { roles: [",
    "beforeEnter: (",
    "import a from './x';\n",
    "import { a as aRoutes } from './x';\n",
  ],
  ...[
    "<Route ",
    '<Route path="a">',
    "</Route>",
    "<Route path={",
    "<Route element={<RequireAuth>",
    '<Route path="a/*" element={<A />} />',
  ],
  ...["<Route index element={<A />} />", "{/* <Route", "path: '"],
];

/** More shapes of the front-end routers: a prefix, then one unit repeated. */
export const FRONT_SHAPES = [
  ["const routes = [", "{"],
  ["const routes = [", " "],
  ["@Controller('a')\nexport class A {\n  @Get(", "'"],
  ['<Routes><Route path="a" element={', "<A>"],
];

const repository = "interface R extends JpaRepository<A, Long> {\n";
const controller = '@RestController\n@RequestMapping({"/a","/b","/c","/d","/e","/f","/g","/h","/i","/j"})\nclass A {\n';
/** Spring (Java and Kotlin). */
export const SPRING_SHAPES = [
  fill("@GetMapping("),
  fill(
    '@GetMapping({"/a","/b","/c","/d","/e","/f","/g","/h","/i","/j"}) @PreAuthorize("y")\nvoid a() {}\n',
    controller,
  ),
  fill("@"),
  fill("@A "),
  fill("class A "),
  fill('@RestController @RequestMapping("/a") class A {'),
  fill("/*"),
  fill("@GetMapping //"),
  fill('"'),
  fill("("),
  fill("findByAContainingIgnoreCaseOrderByBDesc(", repository),
  fill("findBy" + "A".repeat(300) + " ", repository),
  fill("@Query(x) findByA(", repository),
  fill("@NotNull @Size(min = 1, max = 2) @RequestParam("),
  fill("@Min a "),
  fill('Sort.by("a", '),
  fill("Pageable "),
  fill("PageRequest.of(1, "),
  fill("public "),
  fill(" "),
  fill('"""'),
  fill("{"),
  fill("}"),
  fill("class A "),
  fill("@RestController class A { record R(int x) {} @GetMapping void a() {} "),
  fill("@RestController class A(val x: Int)\n"),
];

const routes = '[ApiController]\n[Route("a")][Route("b")][Route("c")]\npublic class AController : ControllerBase {\n';
/** ASP.NET Core (C#). */
export const ASPNET_SHAPES = [
  fill("["),
  fill("[A]"),
  fill('[HttpGet("'),
  fill("[HttpGet("),
  fill('[HttpGet("x")][HttpPost("y")][Authorize(Roles = "A")]\npublic IActionResult A() => Ok();\n', routes),
  fill('[Route("a")]'),
  fill("class A : ControllerBase { "),
  fill("record "),
  fill("app.MapGet("),
  fill('app.MapGet("/a", h).RequireAuthorization("x").WithName("y");\n'),
  fill('var a = a.MapGroup("/a").RequireAuthorization("r");\n'),
  fill('.MapGroup("/a")'),
  fill("a.RequireAuthorization("),
  fill(".Where(o => o.a.ToLower().Contains("),
  fill(".Where(o => o.A == b && o.B > 1 && l.Contains(o.C)) "),
  fill(".OrderBy(o => o."),
  fill("EF.Functions.Like(o."),
  fill("RecurringJob.AddOrUpdate("),
  fill('.WithCronSchedule("'),
  fill('[FromQuery(Name = "page")] int p = 1, '),
  fill("[Required] a "),
  fill(".WithName<"),
  fill("= "),
  fill(" "),
  fill('@"'),
  fill('@$"'),
  fill('"""'),
  fill("public class A : ControllerBase { public enum E { X } [HttpGet] public void G() {} "),
  fill("public record R(int X);\n"),
];

/** Units of the Python, Go, Ruby and Rust adapters, each repeated alone. */
export const PY_UNITS = [
  " ",
  "\n",
  "a",
  "(",
  ")",
  "[",
  "{",
  "'",
  '"',
  "`",
  "/",
  "\\",
  ":",
  ".",
  "#",
  "*",
  ",",
  "<",
  "@",
  "|",
  "%",
];
