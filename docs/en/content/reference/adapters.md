## In short

Adapters are the kit's extension points. Each one is a small module that exports an object; the configuration
names it and gives its options next to it.

1. **Coverage adapters** (`coverage`) list what the application contains (routes, registry entries, files). The kit
   searches the documentation for each element and reports what is not cited.
2. **Authentication adapters** (`auth`) recognise a signed-in session, for `connect` and before every capture.
3. **Built-in or local.** The kit ships its own of each kind; a project adds its own with
   `adapter: "local:adapters/x.mjs"`, a path relative to the documentation project.
4. **Stack adapters** (`stacks`) read the routes, guards, screens and behaviour hints of a framework, for
   `doc-kit facts`. [What the kit reads](#/reference/compatibility) lists them with the stacks and languages they read.
5. **Infra adapters** (`infra`) read what the infrastructure files declare (cloud resources, workloads, images,
   environments, pipelines), for `doc-kit facts`; the same page lists them.
6. **Options are validated** like the configuration: an unknown or missing option is an error with its path
   (`coverage[0].ap`, `auth.loginPatern`), exit code 2.

## Coverage adapters

| Adapter | Inventories | Options (default) |
|---|---|---|
| `next-app-router` | The routes of a Next.js App Router folder (`page.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`); with `api: true`, also its route handlers (`route.ts`/`.js`), as a second family | `app` (`"app"`), `family` (`"Routes"`), `exclude` (`["^/$"]`), `api` (`false`), `apiFamily` (`"API"`) |
| `react-router` | The `path` of the routes declared in source files | `file` (`"src/App.tsx"`, or a list), `pattern`, `prefix` (`"/"`), `family`, `exclude` (`["^/$"]`) |
| `i18n-registry` | The ids of a registry in a source file, covered by their label in an i18n file | `source`, `messages` (required), `key` (`"{id}"`), `block`, `pattern`, `flags` (`"m"`), `aliases`, `fallback`, `exclude`, `family` (`"Registry"`) |
| `glob` | The files of a folder, cited under a form you choose | `pattern` (required), `base` (`"."`), `match` (`"{name}"`), `family` (`"Files"`), `exclude` |
| `openapi` | The operations of an OpenAPI 3 or Swagger 2 document, in JSON | `file` (required), `family` (`"API"`), `prefix` (`""`), `exclude` |
| `features` | The candidate business features of `features.json` ([Features, rules and roles](#/write/markdown~features-rules-and-roles)) | `file` (`"features.json"`), `family` (`"Features"`) |
| `fastapi` | The route handlers of a FastAPI application (`APIRouter(prefix)` and `include_router(prefix)` composed) | `app` (`"."`), `family` (`"API"`), `exclude` |
| `facts` | One item per fact of a `doc-kit facts` source: `env`, `api`, `screens`, `db`, the direct `dependencies`, or `agents` | `source` (required), `family` (by source), `dir` (`"facts"`), `exclude` |

- **Next.js**: route groups `(marketing)` and slots `@modal` add no segment; intercepting routes and `_private`
  folders are skipped; `[id]`, `[...slug]` and `[[...slug]]` are kept.
- **Routes** are covered as written, with `:id`, `{id}` or `[id]`, or by their static prefix (`/orders/` for
  `/orders/[id]`).
- **`exclude`** holds regular expressions, or exact ids.
- **`glob`**: `match` is a template where `{path}` is the path relative to `base` without extension, `{name}` the
  file name without extension, `{dir}` its folder and `{file}` the file name.
- **`openapi`**: an item's id is `METHOD /path` (e.g. `GET /orders/{id}`), its label the operation's `summary` or
  `operationId`. The document is read as JSON only: a `.yaml` or `.yml` file answers "not available" (`yaml`),
  not failed; serve the document as JSON instead (FastAPI: `/openapi.json`).
- **`features`**: one item per entry of `features.json` (`[{ id, title, routes?, api?, keys?, sources?, behaviours? }]`,
  `doc-kit inventory --features --write`, `schemas/features.schema.json`), covered when its id is cited whole (`F-01`
  is not cited by `F-010`) — in practice on its feature sheet's `feature` field. `sources` (globs of the feature's code, relative to `app.dir`) and
  `behaviours` (the kinds of card its sheet describes) are read by `doc-kit context` and `doc-kit sync`.
- **`facts`**: reads `facts/<source>.json`, written by `doc-kit facts` (ARCHITECTURE.md §6.9); a missing file
  answers "not available" (`noFacts`), not failed. `dependencies` only ever counts the direct packages.

```js
coverage: [
  { adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] },
  { adapter: "i18n-registry", family: "Widgets", source: "../../src/widgets/registry.ts",
    pattern: "id: \"(?<id>[a-z0-9_]+)\"", messages: "../../src/i18n/en.json", key: "dashboard.widget.{id}.title" },
  { adapter: "glob", family: "Specifications", base: "../../specs", pattern: "**/*.md", match: "{name}" },
],
```

An adapter whose source cannot be found answers "not available": its check is **skipped**, not failed, and the
report says why (`not found: ../../app`).

## Authentication adapters

| Adapter | Signed in when | `connect` | Options (default) |
|---|---|---|---|
| `manual` | The page is not a sign-in page | You press Enter | — |
| `none` | Always: no session is used | Nothing to do | — |
| `nextauth` | The session endpoint answers a `user` | Detects by itself | `endpoint` (`"/api/auth/session"`) |
| `api-me` | The "me" endpoint answers JSON holding `proof` | Detects by itself | `url` (`"/api/me"`), `proof` (`"id"`, a dotted path is accepted), `who` (`"name"`) |

Every authentication adapter also accepts `start` (`"/"`), `loginPattern`
(`"login|signin|sign-in|oauth|authorize"`) and `browser` (`"chromium"` or `"chrome"`).

## Stack adapters

| Adapter | Reads | Of the files |
|---|---|---|
| `next` | The route handlers of the App Router (`route.ts`, one item per exported method) and of `pages/api`, with the session calls and role checks of each; the screens of the App Router (`page.tsx`) and of the Pages Router | `app/`, `src/app/`, `pages/`, `src/pages/` |
| `express` | Express, and the routers written like it (Fastify, Hono, Koa): `app.<method>("/path", …middleware, handler)` and `router.<method>(…)`, `.ws(…)`; the guards are the middleware's names | `.js`, `.ts`, `.mjs`, `.cjs` |
| `fastapi` | The `@router.<method>("/path")` decorators, composed with `APIRouter(prefix=…)` and `include_router(…, prefix=…)`; the guards are the `Depends(…)` | `.py` |
| `nestjs` | `@Controller` and `@Get`… (`@All`: every method), under `setGlobalPrefix`; guards `@UseGuards`, `@Roles`, `@Public`, global guards (`useGlobalGuards`, `APP_GUARD`); hints of `@Query`, class-validator, `@Cron`, `@Interval` | `.ts` |
| `angular` | Screens of the `Routes` arrays, `children`, `loadChildren` followed (an export, an NgModule, `'./x#M'`); guards `canActivate`, `canMatch`, `canLoad`, `canActivateChild` (for the children), `data.roles` | `.ts` |
| `vue-router` | Screens of `createRouter({ routes })` and of route arrays (spread or imported), `children`; guards `beforeEnter`, a `requires…` or `auth` meta flag, `meta.roles`, `meta.permissions` | `.js`, `.mjs`, `.cjs`, `.ts`, `.vue` |
| `react-router` | Screens of `<Route>` trees (v5 `component` and `render` too), `createBrowserRouter`, `useRoutes`, `RouteObject[]`, descendant `path="x/*"` routes; guards: a wrapper such as `RequireAuth`, a `<PrivateRoute>`-like tag, a guard-named `loader` | `.jsx`, `.tsx`, `.js`, `.mjs`, `.ts` |
| `spring` | `@RestController` with `@GetMapping`… and the class `@RequestMapping` (a nested type does not end its controller); guards `@PreAuthorize`, `@Secured`, `@RolesAllowed`; hints of Spring Data derived queries, `Pageable`, `@RequestParam`, Bean Validation, `@Scheduled`, JPQL | `.java`, `.kt` |
| `aspnet` | Controllers (`[Route]`, `[HttpGet]`…, `[controller]`, `[action]`, a base class's route and guards) and minimal APIs (`MapGet`, `MapGroup`); guards `[Authorize]`, `[AllowAnonymous]`, `RequireAuthorization`; hints of LINQ, EF Core, `[FromQuery]`, DataAnnotations, Hangfire, Quartz | `.cs` |
| `laravel` | `Route::get`… (`match`, `any`, `view`), `resource`, `resources`, `apiResource` (`only`, `except`), groups with their prefix and middleware, files mounted by `group(base_path(…))`, `routes/api.php` under `/api` (or `apiPrefix`); guards: the middleware, `can`; hints of Eloquent, query parameters, `validate` and FormRequest `rules()`, the scheduler | `.php` (not `.blade.php`) |
| `symfony` | `#[Route]` and `@Route` (class prefix, methods); guards `#[IsGranted]`, `@IsGranted`, `#[Security]`, `denyAccessUnlessGranted`; hints of Doctrine, query parameters (`$request->query`, `#[MapQueryParameter]`), `#[Assert\…]` | `src/**/*.php` |
| `django` | `path`, `re_path`, `url`, `include` (a module or a list), DRF routers, the admin site; guards: the view's decorators, `permission_classes`, mixins, `method_decorator` | `.py` |
| `flask` | `@app.route`, `@bp.get`…, blueprints across files (a registration's `url_prefix` replaces the blueprint's own); guards: the decorators between the route and the function, `before_request` | `.py` |
| `go` | net/http (`GET /x` patterns), gin, echo, chi, gorilla/mux with their groups; guards: the middleware, `Use`, guard-named wrappers; hints of `c.Query`, gorm `.Order`, `.Limit`, `.Offset`, SQL | `.go` |
| `rails` | `config/routes.rb`: `resources`, `resource`, `namespace`, `scope`, `member`, `collection`, `match`…; guards: the controller's `before_action` (and its parents', `skip_before_action`), `load_and_authorize_resource`, Pundit `authorize`, `authenticate` blocks; hints of ActiveRecord, `validates` | `config/routes.rb`, `app/**/*.rb` |
| `rust` | actix-web (`#[get]`, `web::scope`, `web::resource`, `.configure`) and axum (`Router::route`, `nest`, `merge`); guards: `wrap`, `layer`, `route_layer`, `from_fn` | `.rs` |

The kit gives each one the text of its files: never a test, a generated file or a file over 512 KB. It classifies
the access of a route from its guards with `review.guards` (`none`, `user`, `role`, `unknown`). Nothing of the
application is ever run. `stacks.disabled` turns one off.

## Infra adapters

| Adapter | Reads | Of the files |
|---|---|---|
| `terraform` | Resources and data sources, modules (their source, version and the names of their inputs), providers (and the `required_providers` with their version), variables and outputs; a rule open to all (`cidr_blocks`, `source_address_prefix`…) | `.tf` (never `.tfvars` nor `.tf.json`) |
| `bicep` | `resource` (existing, conditional, in a loop, a parent's children) with its type, version and name; `module` with its source; the names of `param` and `output`; a security rule open to all | `.bicep` (never `.bicepparam`) |
| `arm` | The resources of a deployment template (nested to three levels, the symbolic names of `languageVersion` 2.0) with their type, `apiVersion` and name as written; linked templates; the names of parameters and outputs; a security rule open to all | `.json` whose `$schema` names a deployment template (never a parameters file) |
| `cloudformation` | Each resource (its type, its logical id), nested stacks and SAM applications with their source, the names of a function's variables, `cron(…)` schedules, the names of `Parameters` and `Outputs`; a security group open to all | `.yaml`, `.yml`, `.json`, `.template` naming `AWSTemplateFormatVersion` or `AWS::…` types (never `cdk.out/`) |
| `dockerfile` | Each stage: its base image and tag, its exposed ports, whether it runs as root (`USER`), the names of `ENV` and `ARG` | `Dockerfile`, `Dockerfile.*`, `Containerfile`, `*.dockerfile` |
| `kubernetes` | Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Pods and OpenShift DeploymentConfigs (replicas, schedule), each container's image, ports, root and variable names; Services (type, ports, `loadBalancerSourceRanges` open to all), Ingresses and OpenShift Routes (TLS), the names of ConfigMaps and Secrets, the namespaces of an environment | `.yaml`, `.yml` with `apiVersion` and `kind` (never a Helm chart's) |
| `helm` | `Chart.yaml` (name, version, dependencies and their repository); `values*.yaml`: image and tag, replicas, ingress and its TLS, the service's type and port, the environment from the file's name | `Chart.yaml`, `values*.yaml` (never the templates) |
| `compose` | Each service: its image and tag, its container ports, root (`user`), replicas, the names of its environment variables; the top-level volumes, networks, secrets and configs (their names) | `docker-compose*.yml`, `compose*.yml` (and `.yaml`) |
| `github-actions` | Each workflow (its name, its first `schedule`, the names of its inputs), each job (a reusable workflow as its source, the names of its `env` and secrets), the environments, the images of containers and services | `.github/workflows/*.yml` |
| `gitlab-ci` | Each `.gitlab-ci.yml` and the files it includes locally; each job (stage, environment, image and services, through `extends`), the names of variables, the projects it triggers | `.gitlab-ci.yml` and its local includes |
| `azure-pipelines` | Each pipeline (its first schedule, the names of its variables and parameters, its `extends` template), its jobs and deployments with or without stages, the environments, the images of containers | `azure-pipelines*.yml`, `*.azure-pipelines.yml`, `.azure-pipelines/`, `.pipelines/` |
| `ansible` | Each play (its name or hosts, the environment of its hosts or path, the names of its variables) and the roles it runs | Playbooks: `.yml`, `.yaml` with `hosts:` (never `roles/`, `group_vars/`, inventories) |

Every item goes through one whitelist: its kind, provider, type, name, file and line, and when known its environment,
image and tag, replicas, ports, whether it runs as root, has TLS, is open to all, its schedule, the names of its
variables, its source and version — never a value, a ConfigMap's or Secret's data, a default, a connection string. A
source loses its query (a SAS token, a signature) but its `ref`; an address range written as a variable, a parameter or
an expression leaves "open to all" unknown, never false (open when an open range is written in it, as in a condition). YAML is read by the kit's bounded reader (no alias expanded,
no tag resolved), JSON by a walk of 256 levels at most (engine/core/json-tree.mjs). A folder named `test/` is the test
environment for them (`k8s/overlays/test/`, `envs/test/`); `tests/`, `spec/`, `fixtures/` and a Maven `src/test/` are
never read. `infra.disabled` turns one off;
`::facts{source="infra"}` shows what they found.

## Writing an adapter

### A coverage adapter

```js
// adapters/screens.mjs, declared as { adapter: "local:adapters/screens.mjs", folder: "../../src/screens" }
export default {
  name: "screens",
  options: {
    folder: { type: "string", minLength: 1, required: true },
    family: { type: "string", default: "Screens" },
  },
  async inventory({ root, options, tools }) {
    if (!tools.exists(options.folder)) return { available: false, reason: "notFound", vars: { path: options.folder } };
    const items = tools.glob("*.tsx", options.folder).map((f) => ({ id: f, match: [f.replace(/\.tsx$/, "")] }));
    return { available: true, families: [{ name: options.family, items }] };
  },
};
```

| Part | Contract |
|---|---|
| `options` | Each option is a small schema: `type`, `default`, `enum`, `pattern`, `minLength`, `items`… and `required: true` |
| `inventory()` | Receives `root` (the documentation project), the validated `options` and `tools`; returns `{ available: true, families }` or `{ available: false, reason, vars }` |
| An item | `{ id, label?, match: [texts], whole? }`: covered when one of its texts appears in the documentation, ignoring case and spaces; with `whole: true` (an id), only whole — no letter or digit right before or after it |
| `tools` | `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey`; every path is relative to the documentation project |
| `reason` | `notFound`, `blockNotFound` and `error` are translated; any other text is shown as it is |

This site uses one: `docs/shared/kit-reference.mjs` in the kit's repository lists every key of the configuration
schema, every CLI option and every built-in adapter, and the coverage check fails when one of them is not cited in
these pages. `doc-kit inventory` shows its three families.

### An authentication adapter

```js
// adapters/sso.mjs, declared as auth: { adapter: "local:adapters/sso.mjs", profile: "/api/profile" }
export default {
  name: "sso",
  options: { profile: { type: "string", default: "/api/profile" } },
  browser: "chromium",          // or "chrome"
  detects: true,                // connect polls session() instead of waiting for Enter
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const me = await page.evaluate(async (u) => (await fetch(u)).ok, options.profile);
    return me ? { who: null, details: null, expires: null } : null;
  },
};
```

`session()` returns `null` when the page is not signed in, otherwise `{ who, details, expires }`: `connect` prints
them. An adapter with `none: true` disables the session altogether.

### A stack adapter

```js
// adapters/cobol.mjs, declared as stacks: { adapters: ["local:adapters/cobol.mjs"] }
export default {
  name: "cobol",
  files: /\.cbl$/i,                       // the files it reads, by their path in the application
  marker: /PROCEDURE DIVISION/,           // optional: a file whose text does not hold it is not given
  languages: ["cobol"],                   // optional, for a project adapter: languages of standard/adapters.json it reads (source stack)
  api({ sources }) {                      // sources: Map(file → text), tests and files over 512 KB left out
    const items = [];
    for (const [file, text] of sources)
      text.split("\n").forEach((line, i) => {   // one line at a time: a line number never counted again from the start (linear, RULES.md S5)
        const m = /^ {7}ENTRY '([A-Z-]{1,30})'/.exec(line);
        if (m) items.push({ method: "CALL", route: m[1], file, line: i + 1, guards: [] });
      });
    return items;
  },
};
```

| Part | Contract |
|---|---|
| `files` | An expression on the path of a file in the application (forward slashes): the files it is given |
| `marker` | Optional: an expression a file's text must match to be given (a cheap filter) |
| `api({ sources })` | The routes: `{ method, route, file, line, guards }` (and `framework` when it differs from `name`) |
| `screens({ sources })` | The screens: `{ route, file, line }`, with `guards` when the router declares them |
| `behaviours(text, sink, file)` | The hints of one file: `sink.push({ family, signal, field?, value?, values?, via }, index)`; the kit keeps a field, a number or a short word only, through its whitelist |

One of `api`, `screens` or `behaviours` at least. Every expression that scans the application's text must stay
linear: the files are untrusted (SECURITY.md).

### An infra adapter

```js
// adapters/nomad.mjs, declared as infra: { adapters: ["local:adapters/nomad.mjs"] }
export default {
  name: "nomad",
  files: /\.nomad(?:\.hcl)?$/i,
  marker: /^job "/m,
  infra({ sources }) {
    const items = [];
    for (const [file, text] of sources)
      text.split("\n").forEach((line, i) => {
        const m = /^job "([\w-]{1,64})"/.exec(line);
        if (m) items.push({ kind: "job", type: "nomad-job", name: m[1], file, line: i + 1 });
      });
    return items;
  },
};
```

| Part | Contract |
|---|---|
| `files`, `marker` | As for a stack adapter |
| `infra({ sources })` | The items: `{ kind, type, name, file, line }` and, when known, `provider` (the adapter's name by default), `env`, `image`, `tag`, `replicas`, `ports`, `root`, `tls`, `openToAll`, `schedule`, `variables` (names), `source`, `version` |

`kind` is one of `resource`, `module`, `provider`, `variable`, `output`, `workload`, `service`, `ingress`, `config`,
`secret`, `job`, `image`, `environment`, `pipeline`, `volume`; an item of another kind, or without a file, is dropped,
and any other field too. The kit's own name (`dockerfile`…) cannot be taken.

## Pitfalls and observed gaps

> [!WARNING] Paths are relative to the documentation project
> `app: "../../app"` is resolved from the folder of `doc.config.mjs`, not from the application. `doc-kit doctor`
> checks every path option of the coverage entries.

> [!NOTE] Two options with the same name
> The options of an adapter are its own: `family` of `glob` and `family` of `react-router` never clash.

## Further reading

- [The checks](#/publish/checks~coverage): what the coverage check prints.
- [Connect and sessions](#/capture/sessions): the sign-in rule the adapters rely on.
- [Coverage, theme and text keys](#/reference/configuration/site): the `coverage` key.
