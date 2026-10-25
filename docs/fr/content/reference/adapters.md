## En bref

Les adaptateurs sont les points d'extension du kit. Chacun est un petit module qui exporte un objet ; la
configuration le nomme et donne ses options à côté.

1. **Les adaptateurs de couverture** (`coverage`) listent ce que contient l'application (routes, entrées de
   registre, fichiers). Le kit cherche chaque élément dans la documentation et signale ce qui n'est pas cité.
2. **Les adaptateurs d'authentification** (`auth`) reconnaissent une session ouverte, pour `connect` et avant chaque
   capture.
3. **Intégrés ou locaux.** Le kit fournit les siens de chaque sorte ; un projet ajoute les siens avec
   `adapter: "local:adapters/x.mjs"`, un chemin relatif au projet de documentation.
4. **Les adaptateurs de pile** (`stacks`) lisent les routes, les gardes, les écrans et les indices de comportement
   d'un framework, pour `doc-kit facts`. [Ce que le kit sait lire](#/reference/compatibility) les liste avec les piles
   et les langages qu'ils lisent.
5. **Les adaptateurs d'infrastructure** (`infra`) lisent ce que déclarent les fichiers d'infrastructure
   (ressources cloud, charges de travail, images, environnements, pipelines), pour `doc-kit facts` ; la même page les
   liste.
6. **Les options sont validées** comme la configuration : une option inconnue ou manquante est une erreur signalée
   avec son chemin (`coverage[0].ap`, `auth.loginPatern`), code de sortie 2.

## Les adaptateurs de couverture

| Adaptateur | Inventorie | Options (défaut) |
|---|---|---|
| `next-app-router` | Les routes d'un dossier App Router de Next.js (`page.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`) ; avec `api: true`, aussi ses gestionnaires de route (`route.ts`/`.js`), comme une seconde famille | `app` (`"app"`), `family` (`"Routes"`), `exclude` (`["^/$"]`), `api` (`false`), `apiFamily` (`"API"`) |
| `react-router` | Le `path` des routes déclarées dans des fichiers source | `file` (`"src/App.tsx"`, ou une liste), `pattern`, `prefix` (`"/"`), `family`, `exclude` (`["^/$"]`) |
| `i18n-registry` | Les ids d'un registre dans un fichier source, couverts par leur libellé dans un fichier i18n | `source`, `messages` (obligatoires), `key` (`"{id}"`), `block`, `pattern`, `flags` (`"m"`), `aliases`, `fallback`, `exclude`, `family` (`"Registry"`) |
| `glob` | Les fichiers d'un dossier, cités sous une forme que vous choisissez | `pattern` (obligatoire), `base` (`"."`), `match` (`"{name}"`), `family` (`"Files"`), `exclude` |
| `openapi` | Les opérations d'un document OpenAPI 3 ou Swagger 2, en JSON | `file` (obligatoire), `family` (`"API"`), `prefix` (`""`), `exclude` |
| `features` | Les candidates fonctionnalités métier de `features.json` ([Fonctionnalités, règles et rôles](#/write/markdown~fonctionnalites-regles-et-roles)) | `file` (`"features.json"`), `family` (`"Features"`) |
| `fastapi` | Les gestionnaires de route d'une application FastAPI (`APIRouter(prefix)` et `include_router(prefix)` composés) | `app` (`"."`), `family` (`"API"`), `exclude` |
| `facts` | Un élément par fait d'une source `doc-kit facts` : `env`, `api`, `screens`, `db`, les `dependencies` directes, ou `agents` | `source` (obligatoire), `family` (selon la source), `dir` (`"facts"`), `exclude` |

- **Next.js** : les groupes de routes `(marketing)` et les slots `@modal` n'ajoutent aucun segment ; les routes
  d'interception et les dossiers `_private` sont ignorés ; `[id]`, `[...slug]` et `[[...slug]]` sont conservés.
- **Les routes** sont couvertes telles qu'elles sont écrites, avec `:id`, `{id}` ou `[id]`, ou par leur préfixe
  statique (`/orders/` pour `/orders/[id]`).
- **Un segment qui ressemble à une clé ou à un jeton est masqué** (`…`) dans les ids et les formes de `fastapi`,
  `next-app-router`, `openapi`, `react-router` et `glob`, comme `doc-kit facts` l'écrit : le chemin secret d'un webhook
  n'apparaît jamais dans `check coverage` ni dans l'audit. Pour `glob`, chaque segment du chemin du fichier est jugé,
  son nom sans son extension (`OrderSummaryCard.tsx` et `GetUserProfileByIdV2.tsx` sont conservés). Citez la route
  masquée (`/hooks/…`) : `doc-kit sync` retrouve toujours ses fichiers. Deux limites : les noms masqués d'un même
  dossier partagent un id (`db/migrate/…` pour toutes les migrations nommées par un horodatage, `alembic/versions/…`,
  des fichiers nommés par un UUID ou un hachage, un fichier haché de `public/`), si bien qu'une page qui le cite les
  couvre tous et que `sync` les suit tous ; et un nom ordinaire qui ne se lit pas comme des mots est masqué lui aussi
  (`XMLHttpRequestInterceptor.ts`, `OrderSummary.test.tsx.snap`). Écartez ces fichiers avec `exclude` quand ils
  n'ont pas besoin de leur propre page.
- **`exclude`** contient des expressions régulières, ou des ids exacts.
- **`glob`** : `match` est un modèle où `{path}` est le chemin relatif à `base` sans extension, `{name}` le nom du
  fichier sans extension, `{dir}` son dossier et `{file}` le nom du fichier.
- **`openapi`** : l'id d'un élément est `METHODE /chemin` (p. ex. `GET /orders/{id}`), son libellé le `summary` ou
  l'`operationId` de l'opération. Le document n'est lu qu'en JSON : un fichier `.yaml` ou `.yml` répond « non
  disponible » (`yaml`), sans échouer ; servez plutôt le document en JSON (FastAPI : `/openapi.json`).
- **`features`** : un élément par entrée de `features.json` (`[{ id, title, routes?, api?, keys?, sources?, behaviours? }]`,
  `doc-kit inventory --features --write`, `schemas/features.schema.json`), couvert quand son id est cité en entier
  (`F-01` n'est pas cité par `F-010`) — en pratique sur le champ `feature` de sa fiche. `sources` (les motifs du code de la fonctionnalité, relatifs à `app.dir`) et
  `behaviours` (les types de carte que décrit sa fiche) sont lus par `doc-kit context` et `doc-kit sync`.
- **`facts`** : lit `facts/<source>.json`, écrit par `doc-kit facts` (ARCHITECTURE.md §6.9) ; un fichier manquant
  répond « indisponible » (`noFacts`), sans échouer. `dependencies` ne compte jamais que les paquets directs.

```js
coverage: [
  { adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] },
  { adapter: "i18n-registry", family: "Widgets", source: "../../src/widgets/registry.ts",
    pattern: "id: \"(?<id>[a-z0-9_]+)\"", messages: "../../src/i18n/fr.json", key: "dashboard.widget.{id}.title" },
  { adapter: "glob", family: "Spécifications", base: "../../specs", pattern: "**/*.md", match: "{name}" },
],
```

Un adaptateur dont la source est introuvable répond « indisponible » : son contrôle est **ignoré**, pas en échec, et
le rapport dit pourquoi (`introuvable : ../../app`).

## Les adaptateurs d'authentification

| Adaptateur | Connecté quand | `connect` | Options (défaut) |
|---|---|---|---|
| `manual` | La page n'est pas une page de connexion | Vous appuyez sur Entrée | — |
| `none` | Toujours : aucune session n'est utilisée | Rien à faire | — |
| `nextauth` | Le point d'accès de session renvoie un `user` | Détecte tout seul | `endpoint` (`"/api/auth/session"`) |
| `api-me` | Le point d'accès « moi » renvoie un JSON qui contient `proof` | Détecte tout seul | `url` (`"/api/me"`), `proof` (`"id"`, un chemin à points est accepté), `who` (`"name"`) |

Tout adaptateur d'authentification accepte aussi `start` (`"/"`), `loginPattern`
(`"login|signin|sign-in|oauth|authorize"`) et `browser` (`"chromium"` ou `"chrome"`).

## Les adaptateurs de pile

| Adaptateur | Lit | Dans les fichiers |
|---|---|---|
| `next` | Les gestionnaires de route de l'App Router (`route.ts`, un élément par méthode exportée) et de `pages/api`, avec les appels de session et les mots de rôle de chacun (`auth (body)`, toujours `unknown` : une recherche de session ne refuse rien à un appelant anonyme) ; les écrans de l'App Router (`page.tsx`) et du Pages Router | `app/`, `src/app/`, `pages/`, `src/pages/` |
| `express` | Express, et les routeurs écrits comme lui (Fastify, Hono, Koa) : `app.<méthode>("/chemin", …middlewares, gestionnaire)` et `router.<méthode>(…)`, `.ws(…)` ; les gardes sont les noms des middlewares | `.js`, `.ts`, `.mjs`, `.cjs` |
| `fastapi` | Les décorateurs `@router.<méthode>("/chemin")`, composés avec `APIRouter(prefix=…)` et `include_router(…, prefix=…)` ; les gardes sont les `Depends(…)` et `Security(…)` du gestionnaire, de son décorateur (`dependencies=[…]`), de son routeur et de son inclusion, hors commentaires et chaînes | `.py` |
| `nestjs` | `@Controller` et `@Get`… (`@All` : toutes les méthodes), sous `setGlobalPrefix` ; gardes `@UseGuards`, `@Roles`, `@Public`, gardes globales (`useGlobalGuards`, `APP_GUARD`) ; indices de `@Query`, class-validator, `@Cron`, `@Interval` | `.ts` |
| `angular` | Écrans des tableaux `Routes`, `children`, `loadChildren` suivis (un export, un NgModule, `'./x#M'`) ; gardes `canActivate`, `canMatch`, `canLoad`, `canActivateChild` (pour les enfants), `data.roles` | `.ts` |
| `vue-router` | Écrans de `createRouter({ routes })` et des tableaux de routes (étalés ou importés), `children` ; gardes `beforeEnter`, un drapeau meta `requires…` ou `auth`, `meta.roles`, `meta.permissions` | `.js`, `.mjs`, `.cjs`, `.ts`, `.vue` |
| `react-router` | Écrans des arbres `<Route>` (`component` et `render` de la v5 aussi), `createBrowserRouter`, `useRoutes`, `RouteObject[]`, routes descendantes `path="x/*"` ; gardes : un composant enveloppe comme `RequireAuth`, une balise du genre `<PrivateRoute>`, un `loader` nommé comme une garde | `.jsx`, `.tsx`, `.js`, `.mjs`, `.ts` |
| `spring` | `@RestController` avec `@GetMapping`… et le `@RequestMapping` de la classe (un type imbriqué ne termine pas son contrôleur) ; gardes `@PreAuthorize`, `@Secured`, `@RolesAllowed` ; indices des requêtes dérivées de Spring Data, `Pageable`, `@RequestParam`, Bean Validation, `@Scheduled`, JPQL | `.java`, `.kt` |
| `aspnet` | Contrôleurs (`[Route]`, `[HttpGet]`…, `[controller]`, `[action]`, la route et les gardes d'une classe de base) et API minimales (`MapGet`, `MapGroup`) ; gardes `[Authorize]`, `[AllowAnonymous]`, `RequireAuthorization` ; indices de LINQ, EF Core, `[FromQuery]`, DataAnnotations, Hangfire, Quartz | `.cs` |
| `laravel` | `Route::get`… (`match`, `any`, `view`), `resource`, `resources`, `apiResource` (`only`, `except`), groupes avec leur préfixe et leurs middlewares, fichiers montés par `group(base_path(…))`, `routes/api.php` sous `/api` (ou `apiPrefix`) ; gardes : les middlewares, `can` ; indices d'Eloquent, des paramètres de requête, de `validate` et des `rules()` d'un FormRequest, du planificateur | `.php` (pas `.blade.php`) |
| `symfony` | `#[Route]` et `@Route` (préfixe de classe, méthodes) ; gardes `#[IsGranted]`, `@IsGranted`, `#[Security]`, `denyAccessUnlessGranted` ; indices de Doctrine, des paramètres de requête (`$request->query`, `#[MapQueryParameter]`), `#[Assert\…]` | `src/**/*.php` |
| `django` | `path`, `re_path`, `url`, `include` (un module ou une liste), routeurs DRF, le site d'administration (`AdminSite`) ; gardes : les décorateurs de la vue, `permission_classes` (une alternative de classes, le `\|` de DRF ou le `or` de Python, est une seule garde, aussi faible que la plus faible ; une négation, `~IsAdminUser`, n'en est pas une), les mixins, `method_decorator` | `.py` |
| `flask` | `@app.route`, `@bp.get`…, blueprints répartis dans plusieurs fichiers (le `url_prefix` d'un enregistrement remplace celui du blueprint) ; gardes : les décorateurs entre la route et la fonction, `before_request`, toujours `unknown`, pour un hook `before_request` qui peut refuser une requête (un décorateur de garde sous lui, `abort(`, `raise`, `redirect(`, un `return` d'une valeur, une garde appelée) ; un hook de journalisation ou de chargement n'en est pas une ; `optional=True` (`@jwt_required (optional=True)` aussi) laisse passer les appelants anonymes | `.py` |
| `go` | net/http (motifs `GET /x`), gin, echo, chi, gorilla/mux avec leurs groupes ; gardes : les middlewares, `Use`, les enveloppes nommées comme une garde ; indices de `c.Query`, gorm `.Order`, `.Limit`, `.Offset`, SQL | `.go` |
| `rails` | `config/routes.rb` : `resources`, `resource`, `namespace`, `scope`, `member`, `collection`, `match`… ; gardes : les `before_action` du contrôleur (et de ses parents, `skip_before_action` ; un `before_action` sous `if:` ou `unless:` est `unknown`, `authenticate_user! (if)`), `load_and_authorize_resource`, `authorize` de Pundit, les blocs `authenticate` ; indices d'ActiveRecord, `validates` | `config/routes.rb`, `app/**/*.rb` |
| `rust` | actix-web (`#[get]`, `web::scope`, `web::resource`, `.configure`) et axum (`Router::route`, `nest`, `merge`) ; gardes : `wrap`, `layer`, `route_layer`, `from_fn` | `.rs` |

Le kit donne à chacun le texte de ses fichiers : jamais un test, un fichier généré ou un fichier de plus de 512 Ko. Il
classe l'accès d'une route d'après ses gardes avec `review.guards` (`none`, `user`, `role`, `unknown`) : une garde à
son nom entier, jamais à une partie d'un autre mot ([Revues](#/spaces/reviews)). Les règles globales d'un framework
ne sont pas lues (`DEFAULT_PERMISSION_CLASSES` de DRF, `SecurityFilterChain` de Spring, `FallbackPolicy` d'ASP.NET,
`FastAPI(dependencies=…)`) : une route qu'elles seules protègent sort `none`. Une route peut paraître moins protégée
qu'elle ne l'est, jamais plus, sauf dans ces cas connus, où les noms ne le disent pas et où une route peut paraître
plus protégée qu'elle ne l'est :

- une surcharge par requête qui assouplit une règle de classe : le `get_permissions()` de DRF qui renvoie
  `[AllowAny()]` sous une classe `permission_classes = [IsAdminUser]` (`role`) ;
- le `@Secured("IS_AUTHENTICATED_ANONYMOUSLY")` de Spring sur une méthode, sous un `@Secured("ROLE_ADMIN")` de
  classe (`role`) ;
- des formes d'arguments rares, comme `@jwt_required(**{"optional": True})` ou
  `@jwt_required(optional=False or True)` de Flask (`user`).

Rien de l'application n'est jamais exécuté. `stacks.disabled` en désactive un.

## Les adaptateurs d'infrastructure

| Adaptateur | Lit | Dans les fichiers |
|---|---|---|
| `terraform` | Les ressources et sources de données, les modules (leur source, leur version et le nom de leurs entrées), les providers (et les `required_providers` avec leur version), les variables et les sorties ; une règle ouverte à tous (`cidr_blocks`, `source_address_prefix`…) | `.tf` (jamais `.tfvars` ni `.tf.json`) |
| `bicep` | `resource` (existante, conditionnelle, en boucle, enfants d'un parent) avec son type, sa version et son nom ; `module` avec sa source ; le nom des `param` et des `output` ; une règle de sécurité ouverte à tous | `.bicep` (jamais `.bicepparam`) |
| `arm` | Les ressources d'un modèle de déploiement (imbriquées sur trois niveaux, noms symboliques de `languageVersion` 2.0) avec leur type, leur `apiVersion` et leur nom tel qu'écrit ; les modèles liés ; le nom des paramètres et des sorties ; une règle de sécurité ouverte à tous | `.json` dont le `$schema` nomme un modèle de déploiement (jamais un fichier de paramètres) |
| `cloudformation` | Chaque ressource (son type, son identifiant logique), les piles imbriquées et applications SAM avec leur source, le nom des variables d'une fonction, les planifications `cron(…)`, le nom des `Parameters` et des `Outputs` ; un groupe de sécurité ouvert à tous | `.yaml`, `.yml`, `.json`, `.template` qui nomment `AWSTemplateFormatVersion` ou des types `AWS::…` (jamais `cdk.out/`) |
| `dockerfile` | Chaque étape : son image de base et son étiquette, ses ports exposés, si elle tourne en root (`USER`), le nom des `ENV` et `ARG` | `Dockerfile`, `Dockerfile.*`, `Containerfile`, `*.dockerfile` |
| `kubernetes` | Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Pods et DeploymentConfigs OpenShift (réplicas, planification), l'image, les ports, le root et le nom des variables de chaque conteneur ; les Services (type, ports, `loadBalancerSourceRanges` ouverts à tous), les Ingress et les Routes OpenShift (TLS), le nom des ConfigMaps et des Secrets, les namespaces d'un environnement | `.yaml`, `.yml` avec `apiVersion` et `kind` (jamais ceux d'un chart Helm) |
| `helm` | `Chart.yaml` (nom, version, dépendances et leur dépôt) ; `values*.yaml` : image et étiquette, réplicas, ingress et son TLS, type et port du service, l'environnement d'après le nom du fichier | `Chart.yaml`, `values*.yaml` (jamais les templates) |
| `compose` | Chaque service : son image et son étiquette, ses ports côté conteneur, le root (`user`), les réplicas, le nom de ses variables d'environnement ; les volumes, réseaux, secrets et configs de premier niveau (leur nom) | `docker-compose*.yml`, `compose*.yml` (et `.yaml`) |
| `github-actions` | Chaque workflow (son nom, sa première planification `schedule`, le nom de ses entrées), chaque job (un workflow réutilisable comme source, le nom de ses `env` et de ses secrets), les environnements, les images des conteneurs et services | `.github/workflows/*.yml` |
| `gitlab-ci` | Chaque `.gitlab-ci.yml` et les fichiers qu'il inclut localement ; chaque job (étape, environnement, image et services, via `extends`), le nom des variables, les projets qu'il déclenche | `.gitlab-ci.yml` et ses inclusions locales |
| `azure-pipelines` | Chaque pipeline (sa première planification, le nom de ses variables et paramètres, son modèle `extends`), ses jobs et déploiements avec ou sans étapes, les environnements, les images des conteneurs | `azure-pipelines*.yml`, `*.azure-pipelines.yml`, `.azure-pipelines/`, `.pipelines/` |
| `ansible` | Chaque play (son nom ou ses hôtes, l'environnement de ses hôtes ou de son chemin, le nom de ses variables) et les rôles qu'il lance | Les playbooks : `.yml`, `.yaml` avec `hosts:` (jamais `roles/`, `group_vars/`, les inventaires) |

Chaque élément passe par une seule liste blanche : sa nature, son fournisseur, son type, son nom, son fichier et sa
ligne, et quand ils sont connus son environnement, son image et son étiquette, ses réplicas, ses ports, s'il tourne en
root, a du TLS, est ouvert à tous, sa planification, le nom de ses variables, sa source et sa version — jamais une
valeur, les données d'une ConfigMap ou d'un Secret, une valeur par défaut, une chaîne de connexion. Une source perd sa
requête (un jeton SAS, une signature) sauf son `ref` ; une plage d'adresses écrite comme une variable, un paramètre ou
une expression laisse « ouvert à tous » inconnu, jamais faux (ouvert quand une plage ouverte y est écrite, comme dans
une condition). Le YAML est lu par le lecteur borné du kit (aucun alias
développé, aucune balise résolue), le JSON par un parcours de 256 niveaux au plus (engine/core/json-tree.mjs). Pour
eux, un dossier nommé `test/` est
l'environnement de test (`k8s/overlays/test/`, `envs/test/`) ; `tests/`, `spec/`, `fixtures/` et le `src/test/` d'un
projet Maven ne sont jamais lus. `infra.disabled` en désactive un ;
`::facts{source="infra"}` montre ce qu'ils ont trouvé.

## Écrire un adaptateur

### Un adaptateur de couverture

```js
// adapters/screens.mjs, déclaré comme { adapter: "local:adapters/screens.mjs", folder: "../../src/screens" }
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

| Partie | Contrat |
|---|---|
| `options` | Chaque option est un petit schéma : `type`, `default`, `enum`, `pattern`, `minLength`, `items`… et `required: true` |
| `inventory()` | Reçoit `root` (le projet de documentation), les `options` validées et `tools` ; renvoie `{ available: true, families }` ou `{ available: false, reason, vars }` |
| Un élément | `{ id, label?, match: [textes], whole? }` : couvert quand l'un de ses textes apparaît dans la documentation, sans tenir compte de la casse ni des espaces ; avec `whole: true` (un id), seulement en entier — sans lettre ni chiffre juste avant ou juste après |
| `tools` | `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey` ; chaque chemin est relatif au projet de documentation |
| `reason` | `notFound`, `blockNotFound` et `error` sont traduits ; tout autre texte est affiché tel quel |

Ce site en utilise un : `docs/shared/kit-reference.mjs`, dans le dépôt du kit, liste chaque clé du schéma de
configuration, chaque option de la ligne de commande et chaque adaptateur intégré, et le contrôle de couverture
échoue quand l'un d'eux n'est pas cité dans ces pages. `doc-kit inventory` affiche ses trois familles.

### Un adaptateur d'authentification

```js
// adapters/sso.mjs, déclaré comme auth: { adapter: "local:adapters/sso.mjs", profile: "/api/profile" }
export default {
  name: "sso",
  options: { profile: { type: "string", default: "/api/profile" } },
  browser: "chromium",          // ou "chrome"
  detects: true,                // connect interroge session() au lieu d'attendre Entrée
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const me = await page.evaluate(async (u) => (await fetch(u)).ok, options.profile);
    return me ? { who: null, details: null, expires: null } : null;
  },
};
```

`session()` renvoie `null` quand la page n'est pas connectée, sinon `{ who, details, expires }` : `connect` les
affiche. Un adaptateur avec `none: true` désactive complètement la session.

### Un adaptateur de pile

```js
// adapters/cobol.mjs, déclaré par stacks: { adapters: ["local:adapters/cobol.mjs"] }
export default {
  name: "cobol",
  files: /\.cbl$/i,                       // les fichiers qu'il lit, par leur chemin dans l'application
  marker: /PROCEDURE DIVISION/,           // facultatif : un fichier dont le texte ne le contient pas n'est pas donné
  languages: ["cobol"],                   // facultatif, pour un adaptateur du projet : les langages de standard/adapters.json qu'il lit (source stack)
  api({ sources }) {                      // sources : Map(fichier → texte), sans les tests ni les fichiers de plus de 512 Ko
    const items = [];
    for (const [file, text] of sources)
      text.split("\n").forEach((line, i) => {   // une ligne à la fois : un numéro de ligne jamais recompté depuis le début (linéaire, RULES.md S5)
        const m = /^ {7}ENTRY '([A-Z-]{1,30})'/.exec(line);
        if (m) items.push({ method: "CALL", route: m[1], file, line: i + 1, guards: [] });
      });
    return items;
  },
};
```

| Partie | Contrat |
|---|---|
| `files` | Une expression sur le chemin d'un fichier dans l'application (barres obliques) : les fichiers qu'il reçoit |
| `marker` | Facultatif : une expression que le texte d'un fichier doit contenir pour être donné (un filtre peu coûteux) |
| `api({ sources, guards })` | Les routes : `{ method, route, file, line, guards }` (et `framework` s'il diffère de `name`) ; `guards` sont les motifs `review.guards` du projet (`role`, `user`, chacun avec `test(name)`), pour un adaptateur qui ne retient une chose que quand elle protège |
| `screens({ sources })` | Les écrans : `{ route, file, line }`, avec `guards` quand le routeur les déclare |
| `behaviours(text, sink, file)` | Les indices d'un fichier : `sink.push({ family, signal, field?, value?, values?, via }, index)` ; le kit ne garde qu'un champ, un nombre ou un mot court, par sa liste blanche |

Au moins un de `api`, `screens` ou `behaviours`. Toute expression qui parcourt le texte de l'application doit
rester linéaire : les fichiers ne sont pas fiables (SECURITY.md).

### Un adaptateur d'infrastructure

```js
// adapters/nomad.mjs, déclaré par infra: { adapters: ["local:adapters/nomad.mjs"] }
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

| Partie | Contrat |
|---|---|
| `files`, `marker` | Comme pour un adaptateur de pile |
| `infra({ sources })` | Les éléments : `{ kind, type, name, file, line }` et, quand ils sont connus, `provider` (par défaut le nom de l'adaptateur), `env`, `image`, `tag`, `replicas`, `ports`, `root`, `tls`, `openToAll`, `schedule`, `variables` (des noms), `source`, `version` |

`kind` vaut `resource`, `module`, `provider`, `variable`, `output`, `workload`, `service`, `ingress`, `config`,
`secret`, `job`, `image`, `environment`, `pipeline` ou `volume` ; un élément d'une autre nature, ou sans fichier, est
écarté, et tout autre champ aussi. Le nom d'un adaptateur du kit (`dockerfile`…) ne peut pas être repris.

## Pièges et écarts constatés

> [!ATTENTION] Les chemins sont relatifs au projet de documentation
> `app: "../../app"` est résolu depuis le dossier de `doc.config.mjs`, pas depuis l'application. `doc-kit doctor`
> vérifie chaque option de chemin des entrées de couverture.

> [!NOTE] Deux options de même nom
> Les options d'un adaptateur lui sont propres : `family` de `glob` et `family` de `react-router` n'entrent jamais en
> conflit.

## Pour aller plus loin

- [Les contrôles](#/publish/checks~couverture) : ce qu'affiche le contrôle de couverture.
- [Connexion et sessions](#/capture/sessions) : la règle de connexion sur laquelle reposent les adaptateurs.
- [Clés de couverture, de thème et de textes](#/reference/configuration/site) : la clé `coverage`.
