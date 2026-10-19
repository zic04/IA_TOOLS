// Worker of the ReDoS test (test/unit/security.test.mjs): runs every expression that scans untrusted text on
// adversarial inputs and posts { start: name } before each check, then { name, ms, input, growth } after it —
// `growth`: the three slowest inputs built again 4 and 16 times longer, each size's time against the size below
// (a linear scanner takes about four times as long, a quadratic one sixteen), with its time and its input. Last,
// { canary }: the growth of a scanner written to be quadratic, which the test must see as such. A check that never
// ends (catastrophic backtracking) is caught by the test, which terminates this worker after a timeout and names the
// last check started.
import { parentPort } from "node:worker_threads";
import { GENERIC, HTML_ATTRIBUTE } from "../../engine/check/secrets.mjs";
import { INLINE_SCRIPT } from "../../engine/build/csp.mjs";
import { NETWORK_PATTERNS, LOCAL_SPEC } from "../../engine/facts/network.mjs";
import { DEPENDENCY_PATTERNS } from "../../engine/facts/dependencies.mjs";
import { RULES } from "../../engine/facts/security.mjs";
import { ENV_PATTERNS } from "../../engine/build/c4.mjs";
import { nextRouteHandlers, nextHandlerGuards } from "../../adapters/stack/next.mjs";
import { expressRoutes } from "../../adapters/stack/express.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { CODE_PATTERNS } from "../../engine/facts/code-files.mjs";
import { BUILT_IN_STACKS } from "../../engine/facts/stacks.mjs";
import { BUILT_IN_INFRA } from "../../engine/facts/infra.mjs";
import { readYaml } from "../../engine/core/yaml.mjs";
import { jsonTree, withoutJsonComments } from "../../engine/core/json-tree.mjs";
import { loadAdapters, detectedBy } from "../../engine/core/adapters.mjs";
import { pydanticEnvNames } from "../../engine/facts/env.mjs";
import { DB_PATTERNS } from "../../engine/facts/db.mjs";
import { parseNumstat } from "../../engine/facts/history.mjs";
import { RECORD_PATTERNS, codegenToEntry } from "../../engine/capture/record.mjs";
import { closingBrace, braceDepths } from "../../engine/util/js-scan.mjs";
import { walkXml, decodeEntities, inertMarkup } from "../../engine/core/xml.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { pdfIndex } from "../../engine/inputs/pdf.mjs";
import { htmlToText } from "../../engine/inputs/ingest.mjs";
import { isSafeRepoUrl, nameOf, hasCredentials } from "../../engine/inputs/model.mjs";
import { parseGitConfig } from "../../engine/util/safe-git.mjs";
import { JS_PATTERNS, jsBehaviours } from "../../engine/facts/behaviour-js.mjs";
import { SQL_PATTERNS, sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { PY_PATTERNS, pyBehaviours } from "../../engine/facts/behaviour-py.mjs";
import { SCHEMA_PATTERNS, schemaBehaviours } from "../../engine/facts/behaviour-schemas.mjs";
import { OPENAPI_FILE, OPENAPI_YAML, openapiBehaviours } from "../../engine/facts/openapi.mjs";
import { sameRoute, apiHandlers } from "../../engine/sync/feature-files.mjs";
import {
  createSink,
  jsCommentRanges,
  pyCommentRanges,
  htmlCommentRanges,
} from "../../engine/facts/behaviour-common.mjs";
import { KitError } from "../../engine/project/errors.mjs";

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
  "eyJ",
  "eyJabcdefgh.eyJ",
  "Password=",
  "https://u:",
  "?sig=",
  "secret = ",
  "api_key: ",
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
const SHAPES = PREFIXES.flatMap((p) => UNITS.map((u) => [p, u]));
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
 * The checks of the stack adapters, whatever their number: every expression of each adapter's and each shared
 * module's `*_PATTERNS` export (a sticky or global one reset first), then each reader of each adapter — api and
 * screens on the files of STACK_FILES it reads, behaviours on the first of them.
 */
async function stackChecks() {
  const checks = [];
  const modules = [
    ...BUILT_IN_STACKS.map((a) => [a.name, `../../adapters/stack/${a.name}.mjs`]),
    ...["js", "c", "py", "php", "common"].map((x) => [`stack-${x}`, `../../engine/facts/stack-${x}.mjs`]),
    ["infra-common", "../../engine/facts/infra-common.mjs"],
    ...BUILT_IN_INFRA.map((a) => [`infra ${a.name}`, `../../adapters/infra/${a.name}.mjs`]),
    ["infra", "../../engine/facts/infra.mjs"],
    ["yaml", "../../engine/core/yaml.mjs"],
  ];
  for (const [name, file] of modules) {
    const mod = await import(file);
    for (const [key, patterns] of Object.entries(mod))
      if (key.endsWith("_PATTERNS"))
        for (const [n, re] of Object.entries(patterns))
          checks.push([
            `stack ${name} ${n}`,
            (s) => {
              re.lastIndex = 0;
              return re.global ? [...s.matchAll(re)].length : re.exec(s);
            },
          ]);
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

export const CHECKS = [
  ...GENERIC.map((d) => [
    `secret detector ${d.kind}`,
    (s) => {
      d.re.lastIndex = 0;
      for (const m of s.matchAll(d.re)) d.accept?.(m);
    },
  ]),
  ...RULES.map((r) => [`OWASP heuristic ${r.rule}`, (s) => r.find(s)]),
  ["api nextRouteHandlers", (s) => nextRouteHandlers(s)],
  ["api nextHandlerGuards", (s) => nextHandlerGuards(s)],
  ["api expressRoutes", (s) => expressRoutes(s, "x.js")],
  ["api fastapiRoutes", (s) => fastapiRoutes(new Map([["x.py", s]]))],
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
  ...Object.entries(DB_PATTERNS).map(([name, re]) => [
    `db ${name}`,
    (s) => {
      if (re.global) for (const m of s.matchAll(re)) void m;
      else re.exec(s);
    },
  ]),
  ["history parseNumstat", (s) => parseNumstat(s)],
  ...Object.entries(RECORD_PATTERNS).map(([name, re]) => [`record ${name}`, (s) => re.exec(s)]),
  ["record codegenToEntry", (s) => codegenToEntry(s, { appUrl: "http://a.test", id: "x" })],
  ["check secrets HTML_ATTRIBUTE", (s) => [...s.matchAll(HTML_ATTRIBUTE)].length],
  ["csp INLINE_SCRIPT", (s) => [...s.matchAll(INLINE_SCRIPT)].length],
  ...Object.entries(NETWORK_PATTERNS).map(([name, re]) => [
    `network ${name}`,
    (s) => (re.global ? [...s.matchAll(re)].length : re.test(s)),
  ]),
  ["network LOCAL_SPEC", (s) => LOCAL_SPEC.test(s)],
  ...Object.entries(DEPENDENCY_PATTERNS).map(([name, re]) => [`dependencies ${name}`, (s) => re.exec(s)]),
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
  ["safe-git parseGitConfig", (s) => parseGitConfig(`[core] ${s}\n[a "${s}"]\n${s}`)],
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
];

const timed = (fn, input) => {
  const t = performance.now();
  fn(input);
  return performance.now() - t;
};
/** The better of two runs: a pause of the collector during one of them is not taken for growth. */
const best = (fn, input) => Math.min(timed(fn, input), timed(fn, input));

/**
 * The growth of a check: its three slowest built inputs (the extra inputs have no shape to build longer) built again
 * at 4N and at 16N, each size's time against the size below.
 * @returns {Array<{ ratio: number, ms: number, input: string }>}
 */
function growthOf(fn, times) {
  const order = times.map((ms, i) => i).sort((a, b) => times[b] - times[a]);
  const steps = [];
  for (const i of order.slice(0, 3).filter((k) => k < SHAPES.length)) {
    const [p, u] = SHAPES[i];
    let before = times[i];
    for (const n of [4 * N, 16 * N]) {
      const long = built(p, u, n);
      const ms = best(fn, long);
      steps.push({ ratio: ms / Math.max(before, 0.05), ms, input: long.slice(0, 60) });
      before = ms;
    }
  }
  return steps;
}

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
