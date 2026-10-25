// Worker of the ReDoS test (test/unit/security.test.mjs): runs every expression that scans untrusted text on
// adversarial inputs and posts { start: name } before each check, then { name, ms, input, growth } after it —
// `growth`: the three slowest inputs built again 4 and 16 times longer — longer still while a step looks quadratic
// and is too short to be trusted (test/tools/growth.mjs) — each size's time against the size below (a linear
// scanner takes about four times as long, a quadratic one sixteen), with its time and its input. Last,
// { canary }: the growth of a scanner written to be quadratic, which the test must see as such. A check that never
// ends (catastrophic backtracking) is caught by the test, which terminates this worker after a timeout and names the
// last check started.
import { parentPort } from "node:worker_threads";
import fs from "node:fs";
import vm from "node:vm";
import {
  GENERIC,
  HTML_ATTRIBUTE,
  PLACEHOLDER,
  SECRET_FILE,
  SESSION_HEAD,
  startsAsSession,
  scanText,
  isUrlTemplate,
  htmlText,
} from "../../engine/check/secrets.mjs";
import { PATTERNS as AGENT_FILES } from "../../engine/facts/agents.mjs";
import { TEST_FILE } from "../../engine/facts/tests.mjs";
import { QUALITY_PATTERNS, functionsOf } from "../../engine/facts/quality.mjs";
import { IMPORT_PATTERNS, pySpecifiers } from "../../engine/facts/imports.mjs";
import { apiPathsIn } from "../../engine/sync/api-links.mjs";
import { PROOF_REF, extractProofs } from "../../engine/sync/proofs.mjs";
import { parseEnv } from "../../engine/capture/masking.mjs";
import { INLINE_SCRIPT, SCRIPT_END } from "../../engine/build/csp.mjs";
import { NETWORK_PATTERNS, LOCAL_SPEC } from "../../engine/facts/network.mjs";
import {
  DECLARATION_PATTERNS,
  READ_USER_FILE,
  requirementsIndex,
  emptyRegistries,
} from "../../engine/facts/declarations.mjs";
import { logicalLines, uvSourceNames } from "../../engine/facts/deps/python.mjs";
import { tomlString, inlineFields } from "../../engine/facts/deps/toml-values.mjs";
import { DEPENDENCY_PATTERNS } from "../../engine/facts/dependencies.mjs";
import { tomlEntries, tomlLeaves, dottedParts, tableDependencies, configLines } from "../../engine/facts/deps/read.mjs";
import { membersOf } from "../../engine/facts/deps/workspaces.mjs";
import { packageKey } from "../../engine/core/packages.mjs";
import { VERSION_PATTERNS, majorsBehind } from "../../engine/core/versions.mjs";
import { SEMVER_PATTERNS, satisfies, minVersion, compareVersions } from "../../engine/project/semver.mjs";
import { metadataFields } from "../../engine/facts/deps/installed.mjs";
import { RULES } from "../../engine/facts/security.mjs";
import { ENV_PATTERNS } from "../../engine/build/c4.mjs";
import { nextRouteHandlers, nextHandlerGuards } from "../../adapters/stack/next.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { classifyAuth, DEFAULT_ROLE_GUARD, DEFAULT_USER_GUARD } from "../../engine/facts/guards.mjs";
import { djangoViews } from "../../adapters/stack/django.mjs";
import { railsApi } from "../../adapters/stack/rails.mjs";
import { flaskRoutes } from "../../adapters/stack/flask.mjs";
import { CODE_PATTERNS } from "../../engine/facts/code-files.mjs";
import { BUILT_IN_STACKS } from "../../engine/facts/stacks.mjs";
import { BUILT_IN_INFRA } from "../../engine/facts/infra.mjs";
import { readYaml } from "../../engine/core/yaml.mjs";
import { jsonTree, withoutJsonComments } from "../../engine/core/json-tree.mjs";
import { loadAdapters, detectedBy } from "../../engine/core/adapters.mjs";
import { pydanticEnvNames, ENV_READ_PATTERNS } from "../../engine/facts/env.mjs";
import { DB_PATTERNS, DB_CLOSERS } from "../../engine/facts/db.mjs";
import { upToLast } from "../../engine/core/text.mjs";
import { parseNumstat } from "../../engine/facts/history.mjs";
import { RECORD_PATTERNS, codegenToEntry } from "../../engine/capture/record.mjs";
import { closingBrace, braceDepths } from "../../engine/util/js-scan.mjs";
import { walkXml, decodeEntities, inertMarkup } from "../../engine/core/xml.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { pdfIndex } from "../../engine/inputs/pdf.mjs";
import { htmlToText } from "../../engine/inputs/ingest.mjs";
import { isSafeRepoUrl, nameOf, hasCredentials } from "../../engine/inputs/model.mjs";
import { parseGitConfig, isLfsValue } from "../../engine/util/safe-git.mjs";
import { JS_PATTERNS, jsBehaviours } from "../../engine/facts/behaviour-js.mjs";
import { SQL_PATTERNS, sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { PY_PATTERNS, pyBehaviours } from "../../engine/facts/behaviour-py.mjs";
import { SCHEMA_PATTERNS, schemaBehaviours } from "../../engine/facts/behaviour-schemas.mjs";
import { OPENAPI_FILE, OPENAPI_YAML, openapiBehaviours } from "../../engine/facts/openapi.mjs";
import { sameRoute, apiHandlers } from "../../engine/sync/feature-files.mjs";
import { plainLines } from "../../engine/core/text.mjs";
import { isCovered } from "../../engine/check/coverage.mjs";
import { markdownText, wikiText } from "../../engine/backlog/markup.mjs";
import { csvFile } from "../../engine/backlog/csv.mjs";
import {
  createSink,
  jsCommentRanges,
  pyCommentRanges,
  htmlCommentRanges,
  CRON,
} from "../../engine/facts/behaviour-common.mjs";
import { KitError } from "../../engine/project/errors.mjs";
import { languageInConfig } from "../../engine/project/find.mjs";
import { codeInText, safeProofPath } from "../../skill/doc-kit/scripts/analysis-model.mjs";
import { modelName } from "../../skill/doc-kit/scripts/transcript-usage.mjs";
import { growthOf as measureGrowth } from "./growth.mjs";
import { FRONT_UNITS, FRONT_SHAPES, SPRING_SHAPES, ASPNET_SHAPES, PY_UNITS } from "./stack-shapes.mjs";
import { wordsOf, mentionsOf, hostsOf, tracesOf, loadTechnologies } from "../../engine/inputs/reconcile.mjs";

// Prefixes that start a match of the detectors, followed by long runs of characters that make a badly written
// expression explore an exponential (or high-polynomial) number of paths.
const PREFIXES = [
  // The declarations the stack adapters start from (adapters/stack/).
  "@Controller('",
  '@GetMapping("',
  '[HttpGet("',
  "Route::get('",
  "#[Route('",
  "urlpatterns = [path('",
  "resources :a, only: [",
  'r.GET("',
  '#[get("',
  '<Route path="',
  "{ path: '",
  // Well-formed declarations, so that the readers' deep paths run (a route table, a controller, a urls module…).
  "const routes = [{ path: 'a', component: A, canActivate: [",
  "createRouter({ routes: [{ path: '/a', children: [",
  '@RestController\n@RequestMapping("/a")\nclass A {\n  @PreAuthorize("x")\n  @GetMapping("',
  '[ApiController]\n[Route("api/[controller]")]\npublic class AController : ControllerBase {\n  [HttpGet("',
  "urlpatterns = [\n  path('a/', include('",
  "Route::prefix('a')->group(function () {\n  Route::resource('",
  'r.Route("/a", func(r chi.Router) {\n  r.Use(',
  "resources :a do\n  resources :",
  "Rails.application.routes.draw do\n  namespace :a do\n    resources :",
  "urlpatterns = [\n  path('a/', views.a),\n  path('",
  '@bp.route("/a")\n@login_required\ndef a(): pass\n@bp.route("',
  // A before_request hook's body, whose statements and calls Flask reads (adapters/stack/flask.mjs, mayDeny).
  "@bp.before_request\ndef a():\n    ",
  "class A extends AbstractController {\n  #[Route('/a', methods: ['GET'])]\n  public function a() {}\n  #[Route('",
  'var g = app.MapGroup("/a").RequireAuthorization();\ng.MapGet("',
  '<Routes>\n  <Route path="a" element={<RequireAuth><A /></RequireAuth>}>\n    <Route path="',
  'App::new().service(web::scope("/a").wrap(',
  "@acme:registry=",
  "registry=",
  '"@acme:registry" ',
  "npmRegistryServer: ",
  "npmScopes:\n  ",
  "[install.scopes]\n",
  "[[tool.poetry.source]]\nurl = ",
  'corp = { source = "',
  "corp = { version = ",
  "name @ ",
  "--index-url ",
  "a/",
  "<script>",
  "<script ",
  '<a href="',
  "<a x=",
  "",
  "{ `${",
  "{ /*",
  "await page.goto('",
  "await page.getByRole('button', { name: '",
  "await page.locator('",
  "model A {\n",
  "CREATE TABLE t (",
  'ForeignKey("',
  "REFERENCES ",
  "@@x\t",
  "-----BEGIN PRIVATE KEY-----\n",
  "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: x\n",
  "-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: x\n\n",
  // A key on one line, its line ends escaped (a JSON key file); the private lines of a PuTTY key.
  "-----BEGIN PRIVATE " + "KEY-----\\n",
  "Private-Lines: 1\n",
  "github_pat_",
  "hooks.slack.com/services/T0a1b2/B0a1b2/",
  "eyJ",
  "eyJabcdefgh.eyJ",
  "Password=",
  "https://u:",
  "?sig=",
  "&Sig=",
  "secret = ",
  "api_key: ",
  // A compound name; a quoted value (the entropy fallback).
  "DB_PASSWORD=",
  'x = "',
  // The floor (0.4.1's rules) and the connection strings: a glued name, a DSN's pair before, a value on the next
  // line, a lone password in code before a call, an index, a member.
  "PGPASSWORD=",
  "host=db password=",
  "password:\n  ",
  "Password = a.b(",
  'Password = c["',
  "f(password=",
  "verify=",
  "app.get(",
  "@app.get(",
  'router.post("/x", ',
  "res.redirect(",
  "SELECT * FROM t WHERE a = ",
  "export async function GET(",
  "class S(BaseSettings):\n",
  "dangerouslySetInnerHTML",
  "Access-Control-Allow-Origin",
  // The readers of the documents of the sources (engine/inputs/): XML, diagrams, PDF.
  "<r ",
  "<r a='",
  '<r a="',
  "<r>&",
  "<r>&#x",
  "<r><!--",
  "<r><![CDATA[",
  "<!DOCTYPE r [",
  '<!DOCTYPE r [<!ENTITY a "',
  '<mxfile><diagram name="a">',
  '<mxGraphModel><root><mxCell id="1" vertex="1" value="<',
  "@startuml\n",
  "@startuml\nA -",
  "@startuml\nA -[",
  '@startuml\ncomponent "',
  "@startuml\n[A] as ",
  "graph TD\nA",
  "graph TD\nA[",
  'graph TD\nA["',
  "graph TD\nA -- ",
  "flowchart LR\nA --> B & ",
  "C4Context\nRel(",
  'C4Context\nPerson(a, "',
  "<< /Type /Pages /Count ",
  "<< /Title (",
  "stream\n",
  // The behaviour detectors (engine/facts/behaviour-*.mjs): a filter, a query, a schema, SQL, a form.
  ".filter((o) => o.a",
  ".filter((o) => o.a.toLowerCase().trim(",
  "o.a.toLowerCase().includes(",
  ".findMany({ where: { a: { contains: ",
  "orderBy: [{ a: '",
  ".sort((a, b) => a.",
  "a: z.string().min(1).max(",
  "a: z.enum([",
  "type A = 'a' | ",
  "enum A {",
  "class A(BaseModel):\n    a: ",
  "class A(models.TextChoices):\n    A = ",
  "choices=[(",
  "a__",
  "a__icontains=",
  ".order_by(",
  "q: str = Query(",
  "request.GET.get('",
  "SELECT a FROM t WHERE a ILIKE ",
  "select a from t where LOWER(",
  "ORDER BY ",
  "LIMIT ",
  "MATCH (",
  '<input name="a" ',
  "<input onChange={(e) => ",
  "<select>",
  "<option>",
  "cron.schedule('",
  "setInterval(",
  "searchParams.get('",
  "{ a, b } = req.query",
];
const UNITS = [
  " ",
  "\t",
  "\n",
  "   \n",
  " \t\n",
  "a",
  "A1",
  "a:",
  "a-",
  "=",
  "-",
  "/",
  "'",
  '"',
  "(",
  "{",
  "a.",
  "%",
  "+",
  "_",
  "\\",
  "<",
  ">",
  "&",
  "[",
  "]",
  "|",
  ":",
  "<<",
];
const N = 3000;

/** A check of a scanner that may refuse its input (KitError): the refusal is caught, any other error is not. */
const refusing = (fn) => (s) => {
  try {
    fn(s);
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
  }
};
/** An input of the prefix and the unit, about `n` characters long. */
const built = (p, u, n) => p + u.repeat(Math.ceil(n / u.length)) + "!";
/**
 * The shapes the tests of the stack adapters measure one reader on (test/tools/stack-shapes.mjs): the stacks tests no
 * longer run each expression on them (stacks-growth.test.mjs), this harness does, on every *_PATTERNS of every adapter
 * (stackChecks). Those the product above already holds are not repeated.
 */
const STACK_SHAPES = [
  ...FRONT_UNITS.map((u) => ["", u]),
  ...FRONT_SHAPES,
  ...SPRING_SHAPES,
  ...ASPNET_SHAPES,
  ...PY_UNITS.map((u) => ["", u]),
];
/**
 * The shapes that once made a scanner of the application's files super-linear (test/unit/scanners-growth.test.mjs):
 * an occurrence repeated, a construct left open, a long run after a keyword — built longer, as the others, and given
 * to every check.
 */
const SCANNER_SHAPES = [
  ["", 'app.use(cors({ origin: "*", credentials: true }));\n'],
  ["", "el.innerHTML = x;\n"],
  ["", "res.redirect("],
  ["", "q = `select ${x}`; db.query(q);\n"],
  ["", "algorithms: ["],
  ["post('", "login"],
  ["", "eyJabcdefgh."],
  ["", "a://"],
  ["", "<script>"],
  ["", "<style>"],
  ["", "<a "],
  ["", '"/a/${'],
  ['"/a', "/"],
  ["`", "a"],
  ["`a.ts:", "1"],
  ["A=x", " "],
  ["from ", "."],
  ["from", " "],
  ["function", " "],
  ["a():", " "],
  ["", "a(): "],
  ["", "function a() {}\n"],
  ["", "function a() {\n"],
  ["", "function a() { if (x) {}\n"],
  // Line starts the multiline expressions see after a carriage return or U+2028; openings never closed of the db,
  // env and security readers; a badge never closed.
  ["", "\r"],
  ["", "\u2028"],
  ["", "${"],
  ["", "const {"],
  ["", "model A {"],
  ["", "CREATE TABLE t ("],
  ["class A(Base):\n", "\n"],
  ["", "class A("],
  ["", "[[verified a"],
  ["", "a:\r"],
  ["", "<script "],
  // Keys on one line never ended, and quoted random values one after the other (the secret detectors).
  ["", "-----BEGIN PRIVATE " + "KEY-----\\nA"],
  ["", "Private-Lines: 1\nA1"],
  ["", '"Zq8vN3kT6wP1xR4mY7bL'],
  ["", "A_KEY=Zq8vN3kT6wP1xR4mY7bL "],
  // XML elements and settings named as a secret, never closed; a value as long as the text after one; CSS
  // pseudo-classes and shell defaults after a secret's name; sums of members; JSON nested in a session's head.
  ["", "<password>A1"],
  ["<password>", "A1"],
  ["<add key='", "a"],
  ["", '<add key="ClearTextPassword" value="A1'],
  ["", "#password:-webkit-a"],
  ["", "${DB_PASSWORD:-a1b2c3d4"],
  ["o.key=", "r.C0+"],
  // Runs of name characters that never reach a separator (a name is read from the start of its run only), pairs of a
  // DSN one after the other, values ended by the commas and parentheses of code.
  ["", "a."],
  ["", "a--"],
  ["", "1.a-"],
  ["", "a=b password=c1d2e3 "],
  ["password=a", ",)"],
  ['{"cookies": [', '{"origins": ["\\"x", '],
];
/** The text of each closer of DB_CLOSERS, put after an input by the db checks. */
const CLOSER_TEXT = { prismaModel: "\n}", createTable: ");" };
const KNOWN = new Set(PREFIXES.flatMap((p) => UNITS.map((u) => JSON.stringify([p, u]))));
const SHAPES = [
  ...PREFIXES.flatMap((p) => UNITS.map((u) => [p, u])),
  ...[...STACK_SHAPES, ...SCANNER_SHAPES].filter(
    (shape) => !KNOWN.has(JSON.stringify(shape)) && KNOWN.add(JSON.stringify(shape)),
  ),
];
const INPUTS = SHAPES.map(([p, u]) => built(p, u, N));
/**
 * An OpenAPI document made of a text: one route per 16 characters, none written as in the text (each is looked for
 * in vain), each operation with a parameter to a $ref as long as the text and one to a parameter that is not a query
 * one (no signal: the cap of the sink never stops the walk), and a body shared by all, without properties but with a
 * required name per 4 characters.
 */
const openapiDoc = (s) => {
  const parameters = [{ $ref: `#/${s}` }, { $ref: "#/components/parameters/P" }];
  const requestBody = { content: { "application/json": { schema: { $ref: "#/components/schemas/B" } } } };
  const required = Array.from({ length: Math.ceil(s.length / 4) }, (_, i) => s.slice(4 * i, 4 * i + 4));
  const paths = {};
  for (let i = 0; i < s.length; i += 16)
    paths[`/${s.slice(i, i + 16)}${i}`] = { get: { parameters }, post: { parameters, requestBody } };
  return {
    paths,
    components: {
      parameters: { P: { name: "q", in: "path", schema: { $ref: `#/${s}` } } },
      schemas: { B: { properties: {}, required } },
    },
  };
};
// Inputs whose end makes a match fail late (a "!" lets a lazy group succeed early): the forms the review of the
// behaviour readers measured (a pydantic line, an order key, nested calls, SQL in lower case, a sort).
INPUTS.push(
  // A run of "x", then many routes of a table, one per 200 characters (stacks-growth.test.mjs's last front-end input).
  "x".repeat(N) + "\n" + "{ path: 'a', component: A }, ".repeat(Math.round(N / 200)),
  // A run of ":" then a "/": the shape that made a name-and-tag expression quadratic (an image reference).
  ":".repeat(N) + "/x",
  "class A(BaseModel):\n    a:" + " ".repeat(N) + "=" + "x".repeat(301),
  "order:" + " ".repeat(N),
  ".find(".repeat(200) + "order:" + " ".repeat(1000) + ")".repeat(200),
  "a" + " ".repeat(N) + "x",
  ".sort(" + " ".repeat(N),
  "select a from t ".repeat(5) + "limit 1 ".repeat(N / 8),
  "/* ".repeat(N / 3),
  '"""'.repeat(N / 3),
  "<select>".repeat(N / 8),
);

/** The names of files an infra adapter reads by convention (Terraform, Kubernetes, Compose, CI…). */
const INFRA_FILES = [
  "Dockerfile",
  "main.tf",
  "main.bicep",
  "azuredeploy.json",
  "template.yaml",
  "k8s/deployment.yaml",
  "chart/Chart.yaml",
  "chart/values.yaml",
  "docker-compose.yml",
  ".github/workflows/deploy.yml",
  ".gitlab-ci.yml",
  "azure-pipelines.yml",
  ".pipelines/build.yml",
  "network.template",
  "playbook.yml",
];

/** The names of files a stack adapter reads by convention: each reader is given the text under those it reads. */
const STACK_FILES = [
  "x.js",
  "x.ts",
  "main.ts",
  "src/app.routes.ts",
  "src/router/index.ts",
  "src/App.tsx",
  "app/a/route.ts",
  "app/a/page.tsx",
  "pages/api/a.ts",
  "pages/a.tsx",
  "X.java",
  "X.kt",
  "X.cs",
  "Program.cs",
  "routes/api.php",
  "routes/web.php",
  "src/Controller/X.php",
  "urls.py",
  "views.py",
  "app.py",
  "x.go",
  "config/routes.rb",
  "app/controllers/a_controller.rb",
  "app/models/a.rb",
  "src/main.rs",
];

/**
 * The engine modules whose every `*_PATTERNS` export is checked, whatever its name (stackChecks). Plain paths, each
 * quoted: test/unit/redos-registration.test.mjs reads them as the modules measured for their *_PATTERNS.
 */
const PATTERN_MODULES = [
  "../../engine/facts/stack-js.mjs",
  "../../engine/facts/stack-c.mjs",
  "../../engine/facts/stack-py.mjs",
  "../../engine/facts/stack-php.mjs",
  "../../engine/facts/stack-common.mjs",
  "../../engine/facts/guards.mjs",
  "../../engine/facts/infra-common.mjs",
  "../../engine/facts/infra.mjs",
  "../../engine/core/yaml.mjs",
  // The ticket references of a backlog, as written in toc.json and in the pages (engine/core/refs.mjs).
  "../../engine/core/refs.mjs",
];

/** A check of each expression of a map of them, named `label` and its key (a sticky or global one reset first). */
const patternChecks = (label, patterns) =>
  Object.entries(patterns).map(([n, re]) => [
    `${label} ${n}`,
    (s) => {
      re.lastIndex = 0;
      return re.global ? [...s.matchAll(re)].length : re.exec(s);
    },
  ]);

/**
 * The checks of the stack adapters, whatever their number: every expression of each adapter's and each shared
 * module's `*_PATTERNS` export (patternChecks), then each reader of each adapter — api and screens on the files of
 * STACK_FILES it reads, behaviours on the first of them.
 */
async function stackChecks() {
  const checks = [];
  const modules = [
    ...BUILT_IN_STACKS.map((a) => [a.name, `../../adapters/stack/${a.name}.mjs`]),
    ...BUILT_IN_INFRA.map((a) => [`infra ${a.name}`, `../../adapters/infra/${a.name}.mjs`]),
    ...PATTERN_MODULES.map((file) => [/([^/]+)\.mjs$/.exec(file)[1], file]),
  ];
  for (const [name, file] of modules) {
    const mod = await import(file);
    for (const [key, patterns] of Object.entries(mod))
      if (key.endsWith("_PATTERNS")) checks.push(...patternChecks(`stack ${name}`, patterns));
  }
  for (const adapter of BUILT_IN_STACKS) {
    const files = STACK_FILES.filter((f) => f.search(adapter.files) !== -1);
    if (!files.length) continue;
    for (const hook of ["api", "screens"])
      if (typeof adapter[hook] === "function")
        checks.push([
          `stack ${adapter.name} ${hook}`,
          (s) => adapter[hook]({ sources: new Map(files.map((f) => [f, s])) }).length,
        ]);
    if (typeof adapter.behaviours === "function")
      checks.push([
        `stack ${adapter.name} behaviours`,
        (s) => adapter.behaviours(s, createSink(files[0], s, []), files[0]),
      ]);
  }
  for (const adapter of BUILT_IN_INFRA) {
    const files = INFRA_FILES.filter((f) => f.search(adapter.files) !== -1);
    if (files.length)
      checks.push([
        `infra ${adapter.name}`,
        (s) => adapter.infra({ sources: new Map(files.map((f) => [f, s])) }).length,
      ]);
  }
  checks.push(["yaml readYaml", (s) => readYaml(s).length + readYaml(`a:\n  ${s}`).length]);
  checks.push(["json jsonTree", (s) => [jsonTree(s), jsonTree(withoutJsonComments(s))].filter(Boolean).length]);
  return checks;
}

/** The search of the site: its module run in a context of its own, as the site runs it (a script, EXT). */
const SITE_SEARCH = (() => {
  const context = { EXT: { hydrators: [], api: {} } };
  vm.runInNewContext(
    fs.readFileSync(new URL("../../engine/site/lib/search-core.js", import.meta.url), "utf8"),
    context,
  );
  return context.EXT.searchCore;
})();
/** The site's order of versions (engine/site/lib/versions.js), run as the site runs it. */
const SITE_VERSIONS = (() => {
  const context = { EXT: { hydrators: [], api: {} } };
  vm.runInNewContext(fs.readFileSync(new URL("../../engine/site/lib/versions.js", import.meta.url), "utf8"), context);
  return context.EXT.compareVersions;
})();
/** app.js's normalisation; an index entry of a text. */
const searchNorm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// "ab" and "orders" in the text: the query's two terms resolve, so the scoring runs over the whole input too.
const searchEntry = (s) => ({ a: null, nt: searchNorm(s.slice(0, 200)), np: "", nx: searchNorm(`ab orders ${s}`) });

export const CHECKS = [
  ...GENERIC.map((d) => [
    `secret detector ${d.kind}`,
    (s) => {
      d.re.lastIndex = 0;
      for (const m of s.matchAll(d.re)) d.accept?.(m);
    },
  ]),
  ...RULES.map((r) => [`OWASP heuristic ${r.rule}`, (s) => r.find(s)]),
  // A default secret's value is read whole: the text as one quoted value.
  ...RULES.filter((r) => r.rule === "secret.default").map((r) => [
    `OWASP heuristic ${r.rule} (a quoted value)`,
    (s) => r.find(`password = "${s}"`),
  ]),
  ["api nextRouteHandlers", (s) => nextRouteHandlers(s)],
  ["api nextHandlerGuards", (s) => nextHandlerGuards(s)],
  ["api expressRoutes", (s) => expressRoutes(s, "x.js")],
  ["api fastapiRoutes", (s) => fastapiRoutes(new Map([["x.py", s]]))],
  // The access of a route from its guards' names, which an adapter takes from the application (engine/facts/guards.mjs).
  [
    "api classifyAuth",
    (s) => classifyAuth([s, `${s}()`, s.toUpperCase(), `a.${s}`, `(${s}) and !(${s}) or ${s}`, `${s} (body)`]),
  ],
  // What a reader keeps of a guard the text writes: DRF's permission classes (an expression of several), Rails's
  // callbacks (a condition, a statement on several lines), Flask's decorator arguments (`@jwt_required (…)`).
  [
    "api django permission_classes",
    (s) =>
      djangoViews(`class A(APIView):\n    permission_classes = [${s}]\n@permission_classes([${s}])\ndef a(r): ...\n`)
        .size,
  ],
  [
    "api rails callbacks",
    (s) =>
      railsApi(
        new Map([
          ["config/routes.rb", "resources :a\n"],
          ["app/controllers/a_controller.rb", `class AController\n  before_action :a, ${s}\n  before_action ${s}\n`],
        ]),
      ).length,
  ],
  [
    "api flask decorators",
    (s) => flaskRoutes(new Map([["a.py", `@app.get('/a')\n@jwt_required ${s}\ndef a(): ...\n`]])).length,
  ],
  // The stack adapters (adapters/stack/) and the engine modules they share: each expression, then each reader.
  ...(await stackChecks()),
  // The paths of the application: what is a test, a generated file; which files an adapter reads; what tells a stack.
  ...Object.entries(CODE_PATTERNS).map(([name, re]) => [`code-files ${name}`, (s) => re.test(s) || re.test(`a/${s}`)]),
  ...BUILT_IN_STACKS.flatMap((a) => [
    [`stack ${a.name} files`, (s) => s.search(a.files) + `app/${s}.ts`.search(a.files)],
    ...(a.marker ? [[`stack ${a.name} marker`, (s) => s.search(a.marker)]] : []),
  ]),
  ...BUILT_IN_INFRA.flatMap((a) => [
    [`infra ${a.name} files`, (s) => s.search(a.files) + `app/${s}.yml`.search(a.files)],
    ...(a.marker ? [[`infra ${a.name} marker`, (s) => s.search(a.marker)]] : []),
  ]),
  [
    "registry detectedBy",
    (s) =>
      loadAdapters().adapters.reduce(
        (n, entry) =>
          n +
          detectedBy(entry, {
            dependencies: [
              { ecosystem: "maven", name: s },
              { ecosystem: "npm", name: s },
            ],
            files: [s, `${s}/${s}`, `a/${s}.msapp`],
          }).length,
        0,
      ),
  ],
  ["env pydanticEnvNames", (s) => pydanticEnvNames(s)],
  ...ENV_PATTERNS.map((re, i) => [`c4 environment variable ${i}`, (s) => re.test(s)]),
  // Each on the text its reader gives it: up to the last of its closers, when it has one (DB_CLOSERS) — the input as
  // it is, and with one closer after it (openings repeated, then a closer: the shape a cut leaves whole).
  ...Object.entries(DB_PATTERNS).map(([name, re]) => [
    `db ${name}`,
    (s) => {
      const texts = DB_CLOSERS[name] ? [s, s + CLOSER_TEXT[name]].map((t) => upToLast(t, DB_CLOSERS[name])) : [s];
      for (const text of texts)
        if (re.global) for (const m of text.matchAll(re)) void m;
        else re.exec(text);
    },
  ]),
  ...patternChecks("db closer", DB_CLOSERS),
  ...patternChecks("env", ENV_READ_PATTERNS),
  ["history parseNumstat", (s) => parseNumstat(s)],
  ...Object.entries(RECORD_PATTERNS).map(([name, re]) => [`record ${name}`, (s) => re.exec(s)]),
  ["record codegenToEntry", (s) => codegenToEntry(s, { appUrl: "http://a.test", id: "x" })],
  ["check secrets HTML_ATTRIBUTE", (s) => [...s.matchAll(HTML_ATTRIBUTE)].length],
  // The language of a doc.config.mjs, read as text without running it (engine/project/find.mjs): spaces around `[`.
  ["project languageInConfig", (s) => [s, `language: ${s}`, `languages: ${s}[${s}`].map(languageInConfig).length],
  // As the build runs it: up to the last "</script>"; the input as it is, and with one closing tag after it.
  [
    "csp INLINE_SCRIPT",
    (s) => [s, `${s}</script>`].reduce((n, t) => n + [...upToLast(t, SCRIPT_END).matchAll(INLINE_SCRIPT)].length, 0),
  ],
  ["csp SCRIPT_END", (s) => [...s.matchAll(SCRIPT_END)].length],
  ...Object.entries(NETWORK_PATTERNS).map(([name, re]) => [
    `network ${name}`,
    (s) => (re.global ? [...s.matchAll(re)].length : re.test(s)),
  ]),
  ["network LOCAL_SPEC", (s) => LOCAL_SPEC.test(s)],
  // The logical lines of a requirements file (deps/python.mjs): continued lines joined, pip's comments dropped.
  ["requirements logicalLines", (s) => logicalLines(`${s}\\\n${s} #${s}\n${s}\\`).length],
  // Every line break a configuration's tools read (deps/read.mjs).
  ["declarations configLines", (s) => configLines(`${s}\r${s}\r\n${s}\f`).length],
  // The readers of the person's own files, and of a requirements file's options (declarations.mjs): loops over the
  // characters of each line, and the patterns above.
  ...Object.entries(READ_USER_FILE).map(([kind, read]) => [
    `declarations ${kind}`,
    (s) => (read(`${s} = ${s}\n  ${s}:\n`, emptyRegistries()), 0),
  ]),
  ["declarations requirementsIndex", (s) => requirementsIndex(`${s}\n-e ${s} --pre ${s}\n`, "/", "/", new Set())],
  ...Object.entries(DECLARATION_PATTERNS).map(([name, re]) => [
    `declarations ${name}`,
    (s) => (re.global ? [...s.matchAll(re)].length : re.test(s)),
  ]),
  ...Object.entries(DEPENDENCY_PATTERNS).map(([name, re]) => [`dependencies ${name}`, (s) => re.exec(s)]),
  // The same with a line ending one character after the run (a CR, U+2028): "." crosses neither, so an expression
  // ending in `(.*)$` fails there — late, after every split of the run (the review of Lot 11a found `requirement`
  // cubic). Right after the run, `\s` would take the line ending itself and the match succeed at once.
  ...Object.entries(DEPENDENCY_PATTERNS).flatMap(([name, re]) =>
    [
      ["CR", "\r"],
      ["U+2028", "\u2028"],
    ].map(([label, end]) => [
      `dependencies ${name} (${label} after the run)`,
      (s) => re.exec(s.slice(0, -1) + "x" + end + "x"),
    ]),
  ),
  // The workspace patterns of a package.json against its folders (deps/workspaces.mjs): the whole text as a pattern
  // and as a folder, and its first 99 characters around one "*" (the longest segment followed).
  [
    "workspaces membersOf",
    (s) => {
      const t = s.slice(0, 99);
      const patterns = [s, `${s}/*`, `!${s}`, `${t}*`, `*${t}`, `**/${t}*`, `${t.slice(0, 49)}*${t.slice(49)}`];
      return membersOf(patterns, [[s], ["a", s], [t, "b", t], [t + t]]).length;
    },
  ],
  // A package's key (engine/core/packages.mjs): PEP 503's runs of separators.
  ["packages packageKey", (s) => packageKey("pip", s)],
  // A version's major (engine/core/versions.mjs): a manifest's version or range, a registry's latest version.
  ...Object.entries(VERSION_PATTERNS).map(([name, re]) => [`versions ${name}`, (s) => re.exec(s)]),
  ["versions majorsBehind", (s) => majorsBehind({ version: null, spec: `^${s}` }, s)],
  // The kit's versions and ranges (engine/project/semver.mjs): doc.config.mjs's `kit`, the versions of the
  // application a backlog and the screenshots give; the text as it is and after a version's start, so that the
  // pre-release and build parts run over it. The site's copy of the order likewise.
  ...Object.entries(SEMVER_PATTERNS).flatMap(([name, re]) => [
    [`semver ${name}`, (s) => re.exec(s)],
    [`semver ${name} (after a version)`, (s) => re.exec(`1.2.3-${s}`) || re.exec(`1.2.3+${s}`)],
  ]),
  ["semver satisfies", (s) => satisfies(`1.2.3-${s}`, `${s} || ^1.2.3-${s} ${s}`)],
  ["semver minVersion", (s) => minVersion(`>${s} || >=1.2.3-${s} || ${s} - ${s}`)],
  ["semver compareVersions", (s) => compareVersions(`1.2.3-${s}`, `1.2.3-${s}.1`) + compareVersions(s, `${s}1`)],
  ["site compareVersions", (s) => SITE_VERSIONS(`1.2.3-${s}`, `1.2.3-${s}.1`) + SITE_VERSIONS(s, `${s}1`)],
  // The header of an installed METADATA (deps/installed.mjs): the text as a field's value, as many folded lines, and
  // cut (its last line and field left out).
  [
    "dependencies metadataFields",
    (s) => metadataFields(`Name: x\nLicense: ${s}\nClassifier: ${s}\n`).classifiers.length,
  ],
  ["dependencies metadataFields (folded)", (s) => metadataFields(`License: a\n ${s.split("").join("\n ")}`).license],
  ["dependencies metadataFields (cut)", (s) => metadataFields(`Name: x\n${s}`, { cut: true }).name],
  // The TOML of the Python manifests and locks (deps/read.mjs): one pass, its arrays over many lines included.
  ["dependencies tomlEntries", (s) => tomlEntries(s).length],
  ["dependencies tomlEntries (an array left open)", (s) => tomlEntries(`deps = [\n${s}`).length],
  // A long table name over many distinct keys: each key is told apart from the others without the table's text.
  [
    "dependencies tomlEntries (a long header, many keys)",
    (s) =>
      tomlEntries(
        `[t${"a".repeat(s.length)}]\n${Array.from({ length: Math.ceil(s.length / 8) }, (_, i) => `k${i} = 1`).join("\n")}\n`,
      ).length,
  ],
  // The full path of each value (network.mjs reads every private declaration by it): the text as a dotted key, a
  // header and an inline table; a long dotted name's parts copied into many values (bounded at 16 parts).
  ["dependencies dottedParts", (s) => dottedParts(s).length],
  // A basic string's escapes (\uXXXX…) decoded in a quoted part, one left unfinished.
  ["dependencies dottedParts (quoted, escaped)", (s) => dottedParts(`"${s}\\u00"."\\${s}"`).length],
  // Triple quotes are one token (deps/read.mjs stepQuotes): a lone quote inside, one left open.
  [
    "dependencies tomlEntries (triple quotes)",
    (s) => tomlEntries(`a = ['''${s}''', """${s}\n${s}"""]\nb = '''${s}\n`).length,
  ],
  // Poetry's and a Pipfile's tables read by path.
  [
    "dependencies tableDependencies",
    (s) => tableDependencies(tomlEntries(`[t]\n${s} = { ${s} = [{ v = 2 }] }\n`), () => 1).length,
  ],
  // A TOML string and an inline table read as the tools read them (deps/toml-values.mjs).
  ["dependencies tomlString", (s) => tomlString(`"${s}"`)?.length ?? 0],
  ["dependencies inlineFields", (s) => inlineFields(`{ ${s} = 1, a = "${s}", "${s}" = { b = 2 } }`)?.size ?? 0],
  // A long table name (a Poetry group, a uv source) over many keys: a name over 1,000 characters is left out, so no
  // reader below builds a string from it for each key.
  [
    "dependencies tableDependencies (a long table, many keys)",
    (s) =>
      tableDependencies(
        tomlEntries(
          `[t${"a".repeat(s.length)}]\n${Array.from({ length: Math.ceil(s.length / 8) }, (_, i) => `k${i} = 1`).join("\n")}\n`,
        ),
        () => 1,
      ).length,
  ],
  [
    "dependencies uv sources (a long name, many values)",
    (s) =>
      uvSourceNames(
        tomlLeaves(
          tomlEntries(
            `[tool.uv.sources.s${"s".repeat(s.length)}]\n${Array.from({ length: Math.ceil(s.length / 8) }, (_, i) => `k${i} = 1`).join("\n")}\n`,
          ),
        ),
      ).length,
  ],
  ["dependencies tomlLeaves", (s) => tomlLeaves(tomlEntries(`[${s}]\nx = { ${s} = [{ b = 2 }] }\n`)).length],
  [
    "dependencies tomlLeaves (a long dotted name, many values)",
    (s) => tomlLeaves(tomlEntries(`[${"a.".repeat(s.length)}a]\nx = { ${"b = 1, ".repeat(s.length)} }\n`)).length,
  ],
  ["js-scan closingBrace", (s) => closingBrace(s, 0)],
  ["js-scan braceDepths", (s) => braceDepths(s)],
  // The readers of documents scan without regular expressions; they are checked as scanners, a refusal
  // ("inputs.refused") being a normal outcome on these inputs.
  ["inputs walkXml", refusing((s) => walkXml(s, { open() {}, close() {}, text() {} }))],
  ["inputs walkXml (inside a root)", refusing((s) => walkXml(`<r>${s}</r>`, {}))],
  ["inputs decodeEntities", (s) => decodeEntities(s)],
  ["inputs inertMarkup", (s) => inertMarkup(s)],
  ["inputs diagram drawio", refusing((s) => diagramToMarkdown(s, "drawio"))],
  ["inputs diagram puml", (s) => diagramToMarkdown(s, "puml")],
  ["inputs diagram mermaid", (s) => diagramToMarkdown(s, "mermaid")],
  ["inputs diagram mermaid flowchart", (s) => diagramToMarkdown(`graph TD\n${s}`, "mermaid")],
  ["inputs diagram mermaid C4", (s) => diagramToMarkdown(`C4Context\n${s}`, "mermaid")],
  ["inputs pdfIndex", (s) => pdfIndex(Buffer.from(`%PDF-1.7\n${s}`, "latin1"))],
  // An HTML document of the sources, and the addresses and names of inputs.json.
  ["inputs htmlToText", (s) => htmlToText(s)],
  ["inputs htmlToText (in a page)", (s) => htmlToText(`<html><body><h1>${s}</h1><p>${s}</p><script>${s}`)],
  ["inputs isSafeRepoUrl", (s) => isSafeRepoUrl(`https://github.com/${s}`) || isSafeRepoUrl(`git@h:${s}`)],
  ["inputs nameOf", (s) => nameOf(s)],
  ["inputs hasCredentials", (s) => hasCredentials(`https://h/x?${s}`) || hasCredentials(s)],
  // The search of the site (engine/site/lib/search-core.js, run as the site runs it): an index of the text, a query
  // with a typo (its close words), the marks.
  ["site search match", (s) => SITE_SEARCH.match([searchEntry(s)], "ab ordrs", searchNorm).found.length],
  ["site search mark", (s) => SITE_SEARCH.mark(s, ["ab", "cd"], searchNorm, (x) => x).length],
  // An id cited whole in the documentation (check coverage): every occurrence, its two neighbours.
  ["coverage isCovered whole", (s) => isCovered({ match: ["f-01"], whole: true }, `${s} f-01${s}f-01`)],
  // The backlog export: a story's HTML as lines of text, then each tool's inert markup and its CSV cells.
  ["backlog plainLines", (s) => plainLines(`<p>${s}</p><ul><li>${s}</li></ul>${s}`)],
  ["backlog markdownText", (s) => markdownText(s, { quickActions: true })],
  ["backlog wikiText", (s) => wikiText(s)],
  ["backlog csvFile", (s) => csvFile([[s, s]])],
  ["safe-git parseGitConfig", (s) => parseGitConfig(`[core] ${s}\n[a "${s}"]\n${s}`)],
  [
    "safe-git isLfsValue",
    (s) =>
      isLfsValue("filter.lfs.process", `git-lfs filter-process${s}`) ||
      isLfsValue("filter.lfs.smudge", `git-lfs smudge${s} -- %f`) ||
      isLfsValue("filter.lfs.clean", `git-lfs clean -- %f${s}`),
  ],
  // The behaviour detectors: each expression alone, then each reader as a whole (its walks and small expressions).
  ...Object.entries({ ...JS_PATTERNS, ...SQL_PATTERNS, ...PY_PATTERNS, ...SCHEMA_PATTERNS }).map(([name, re]) => [
    `behaviours ${name}`,
    (s) => (re.global ? [...s.matchAll(re)].length : re.exec(s)),
  ]),
  ["behaviours OPENAPI_FILE", (s) => OPENAPI_FILE.test(s) || OPENAPI_YAML.test(s)],
  ["behaviours openapiBehaviours", (s) => openapiBehaviours(openapiDoc(s), s, createSink("o.json", s, []))],
  ["sync sameRoute", (s) => sameRoute(s, `GET /${s}`)],
  ["sync apiHandlers", (s) => apiHandlers({ api: [s, `GET ${s}`] }, [{ method: "GET", route: s, file: "a.js" }])],
  ["behaviours jsBehaviours", (s) => jsBehaviours(s, createSink("x.js", s, []))],
  ["behaviours sqlBehaviours", (s) => sqlBehaviours(s, createSink("x.sql", s, []))],
  ["behaviours pyBehaviours", (s) => pyBehaviours(s, createSink("x.py", s, []))],
  ["behaviours schemaBehaviours js", (s) => schemaBehaviours(s, "js", createSink("x.ts", s, []))],
  ["behaviours schemaBehaviours py", (s) => schemaBehaviours(s, "py", createSink("x.py", s, []))],
  [
    "behaviours comment walks",
    (s) => jsCommentRanges(s).length + pyCommentRanges(s).length + htmlCommentRanges(s).length,
  ],
  // The texts of an analysis an agent wrote from the application code (skill/doc-kit/scripts/analysis-model.mjs).
  ["analysis codeInText", (s) => codeInText(s)],
  ["analysis safeProofPath", (s) => safeProofPath(s)],
  // The model a Claude Code transcript names (skill/doc-kit/scripts/transcript-usage.mjs).
  ["transcript modelName", (s) => modelName(s)],
  // The texts of an ingested DAT (engine/inputs/reconcile.mjs).
  ["reconcile wordsOf", (s) => wordsOf(s).length],
  ["reconcile mentionsOf", (s) => mentionsOf(s, loadTechnologies()).size],
  ["reconcile hostsOf", (s) => hostsOf(s).length],
  // An image of the facts (the application's), against every technology's images; "/x" after it, so that a run of
  // ":" before a "/" (what makes a name-and-tag expression quadratic) grows with the input.
  [
    "reconcile tracesOf",
    (s) =>
      loadTechnologies().reduce(
        (n, t) => n + tracesOf(t, { infra: [{ image: `${s}/x`, type: s, file: s }] }).length,
        0,
      ),
  ],
  // check secrets as a whole: the detectors with the token of each match and its URL template; the text of a page
  // of the built site; what is a placeholder, what is a secret file.
  ["check secrets scanText", (s) => scanText(s, GENERIC).length],
  ["check secrets isUrlTemplate", (s) => isUrlTemplate(s) || isUrlTemplate(`https://${s}`)],
  [
    "check secrets htmlText",
    (s) => htmlText(s).length + htmlText(`<p>${s}</p><script>${s}`).length + htmlText(`${s}</script></style>>`).length,
  ],
  ["check secrets PLACEHOLDER", (s) => PLACEHOLDER.test(s)],
  [
    "check secrets SECRET_FILE",
    (s) => SECRET_FILE.test(s) || SECRET_FILE.test(`.env.${s}`) || SECRET_FILE.test(`appsettings.${s}`),
  ],
  ["check secrets SESSION_HEAD", (s) => SESSION_HEAD.test(s) || SESSION_HEAD.test(`{"cookies"${s}`)],
  // A session told by its head: the other key anywhere in it, or a first item of a session's shape (a cookie's
  // strings, an origin's), on a text that starts as one.
  [
    "check secrets startsAsSession",
    (s) =>
      startsAsSession(s) ||
      startsAsSession(`{"cookies": [${s}`) ||
      startsAsSession(`{"cookies": [{"name": "${s}`) ||
      startsAsSession(`{"cookies": [{"name": "a", "value": "${s}", "domain": ${s}`) ||
      startsAsSession(`{"origins": [{"origin": "${s}", "localStorage": [${s}`),
  ],
  // The paths of the application: an agent's instructions, a test file (a long name in a folder they look for).
  ...AGENT_FILES.map((re, i) => [`agents file ${i}`, (s) => re.test(s) || re.test(`.claude/${s}`)]),
  ["tests TEST_FILE", (s) => TEST_FILE.test(s) || TEST_FILE.test(`tests/${s}`)],
  // The guards found at a handler, classified by the built-in patterns; a cron expression kept by a hint.
  ["api DEFAULT_ROLE_GUARD", (s) => DEFAULT_ROLE_GUARD.test(s)],
  ["api DEFAULT_USER_GUARD", (s) => DEFAULT_USER_GUARD.test(s) || DEFAULT_USER_GUARD.test(`auth:${s}`)],
  ["behaviours CRON", (s) => CRON.test(s)],
  // The functions of the quality source (each expression, then the reader: bodies, lines, branches); the local
  // imports of Python; the API paths of a screen; the proofs of a page; the .env files of the masking.
  ...patternChecks("quality", QUALITY_PATTERNS),
  ["quality functionsOf js", (s) => functionsOf("x.js", s).length],
  ["quality functionsOf py", (s) => functionsOf("x.py", `def a():\n${s}\n  def b():\n${s}`).length],
  ...patternChecks("imports", IMPORT_PATTERNS),
  ["imports pySpecifiers", (s) => pySpecifiers(s).length + pySpecifiers(`from ${s}`).length],
  ["sync apiPathsIn", (s) => apiPathsIn(s).length + apiPathsIn(`"/a/${s}`).length],
  ...patternChecks("sync", { PROOF_REF }),
  ["sync extractProofs", (s) => extractProofs(s).length + extractProofs(`\`${s}:1\` [[verified ${s}`).length],
  ["masking parseEnv", (s) => parseEnv(s).length + parseEnv(`A=${s}`).length],
];

const timed = (fn, input) => {
  const t = performance.now();
  fn(input);
  return performance.now() - t;
};

/**
 * The growth of a check: its three slowest built inputs (the extra inputs have no shape to build longer) built again
 * at 4N and at 16N — longer while a step looks quadratic and is too short to be trusted (test/tools/growth.mjs).
 * @returns {Array<{ ratio: number, ms: number, input: string }>}
 */
const growthOf = (fn, times) =>
  measureGrowth(fn, times, { shapes: SHAPES, inputs: INPUTS, size: N, build: built, time: timed });

for (const [name, fn] of CHECKS) {
  parentPort.postMessage({ start: name });
  const times = INPUTS.map((input) => timed(fn, input));
  const top = times.indexOf(Math.max(...times));
  // The slowest input timed again, the better kept: a pause of the collector or a busy machine is no backtracking.
  times[top] = Math.min(times[top], timed(fn, INPUTS[top]));
  parentPort.postMessage({ name, ms: times[top], input: INPUTS[top].slice(0, 60), growth: growthOf(fn, times) });
}
// The canary: a search from each character for one that is never there, quadratic with the constant of indexOf (a
// few milliseconds at 4N) — the check must see it, or it would let such a scanner through.
const canary = (s) => {
  let found = 0;
  for (let i = 0; i < s.length; i++) found += s.indexOf("\u0000", i);
  return found;
};
parentPort.postMessage({ start: "canary" });
parentPort.postMessage({
  canary: growthOf(
    canary,
    INPUTS.map((input) => timed(canary, input)),
  ),
});
parentPort.postMessage({ done: true });
