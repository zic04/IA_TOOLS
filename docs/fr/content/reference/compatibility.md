## En bref

Le kit lit une application sans jamais exécuter son code. Ce qu'il sait lire dépend de la pile.

1. **Les piles.** Un adaptateur de pile connaît un framework : ses routes d'API et leurs gardes, ses écrans, ses
   indices de comportement. Les lecteurs du kit lisent en plus tout fichier JavaScript, TypeScript, Python, HTML et SQL.
2. **Les dépendances.** Les manifestes et fichiers de verrouillage de chaque écosystème, lus hors ligne.
3. **Le low-code.** Une plateforme est détectée et nommée. Le kit ne la lit pas : ses agents lisent l'export.
4. **Ce qui n'est pas lu est signalé.** `doc-kit facts --source stack` mesure chaque langage du code, et si le kit
   le lit ici. `doc-kit inputs status` affiche la part lue. Le contexte d'une page dit à l'agent quel code lire
   lui-même.

## Dans cette partie

### Piles

Un adaptateur de pile lit les routes de l'API, leurs gardes, les écrans ou les indices de comportement d'un framework (`doc-kit facts` : sources `api`, `screens`, `behaviours`). Il compte comme lecteur d'un langage dès que l'application utilise sa pile : une des dépendances ou un des fichiers de la troisième colonne.

| Pile | Langages | Détectée par | Ce que le kit lit |
|---|---|---|---|
| Next.js | JavaScript, TypeScript | `npm:next` | routes de l'API, gardes, écrans |
| Express, Fastify, Hono, Koa | JavaScript, TypeScript | `npm:express`, `npm:fastify`, `npm:hono`, `npm:koa-router`, `npm:@koa/router` | routes de l'API, gardes |
| FastAPI | Python | `pip:fastapi` | routes de l'API, gardes |
| NestJS | TypeScript | `npm:@nestjs/core`, `npm:@nestjs/common`, `**/nest-cli.json` | routes de l'API, gardes, indices de comportement |
| Angular router | TypeScript | `npm:@angular/router`, `**/angular.json` | écrans, gardes |
| Vue Router | JavaScript, TypeScript | `npm:vue-router` | écrans, gardes |
| React Router | JavaScript, TypeScript | `npm:react-router`, `npm:react-router-dom` | écrans, gardes |
| Spring (Spring MVC, Spring Data) | Java, Kotlin | `maven:org.springframework.boot:*`, `maven:org.springframework:*` | routes de l'API, gardes, indices de comportement |
| ASP.NET Core | C# | `nuget:Microsoft.AspNetCore*`, `nuget:Swashbuckle.AspNetCore*`, `**/appsettings.json`, `**/launchSettings.json` | routes de l'API, gardes, indices de comportement |
| Laravel | PHP | `composer:laravel/framework`, `**/artisan` | routes de l'API, gardes, indices de comportement |
| Symfony | PHP | `composer:symfony/framework-bundle`, `**/symfony.lock`, `config/bundles.php` | routes de l'API, gardes, indices de comportement |
| Django, Django REST framework | Python | `pip:django`, `pip:djangorestframework`, `**/manage.py` | routes de l'API, gardes |
| Flask | Python | `pip:flask`, `pip:apiflask` | routes de l'API, gardes |
| Go: net/http, gin, echo, chi, gorilla/mux | Go | `go:github.com/gin-gonic/gin`, `go:github.com/labstack/echo*`, `go:github.com/go-chi/chi*`, `go:github.com/gorilla/mux`, `**/go.mod` | routes de l'API, gardes, indices de comportement |
| Ruby on Rails | Ruby | `rubygems:rails`, `rubygems:railties` | routes de l'API, gardes, indices de comportement |
| Rust: actix-web, axum | Rust | `cargo:actix-web`, `cargo:axum` | routes de l'API, gardes |

### Dépendances

Chaque manifeste et fichier de verrouillage ci-dessous est lu seul, à quatre dossiers de profondeur au plus (source `dependencies`). Avec `--network`, seuls les noms publics de npm et de PyPI partent vers leur registre ; les autres écosystèmes sont lus hors ligne.

| Écosystème | Fichiers |
|---|---|
| npm, pnpm, Yarn (`npm`) | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` |
| pip, Poetry (`pip`) | `requirements*.txt`, `poetry.lock`, `pyproject.toml` |
| Maven, Gradle (`maven`) | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradle.lockfile`, `libs.versions.toml` |
| NuGet (`nuget`) | `*.csproj`, `*.fsproj`, `*.vbproj`, `packages.lock.json`, `packages.config`, `Directory.Packages.props` |
| Composer (`composer`) | `composer.json`, `composer.lock` |
| Go modules (`go`) | `go.mod` |
| Bundler (`rubygems`) | `Gemfile`, `Gemfile.lock` |
| Cargo (`cargo`) | `Cargo.toml`, `Cargo.lock` |

### Plateformes low-code

Détectées, jamais lues : `doc-kit inputs status` et les faits le disent, et les agents lisent eux-mêmes l'export (une application Power Apps décompressée, un module OutSystems, un projet Salesforce…).

| Plateforme | Détectée par |
|---|---|
| Power Apps | `**/*.msapp`, `**/CanvasManifest.json`, `**/*.pa.yaml`, `**/*.fx.yaml` |
| Power Platform (solution) | `**/Solution.xml`, `**/solution.xml`, `**/customizations.xml` |
| OutSystems | `**/*.oml`, `**/*.oap`, `**/*.osp` |
| Mendix | `**/*.mpr`, `**/*.mpk` |
| Salesforce (Apex, Lightning) | `sfdx-project.json`, `**/sfdx-project.json`, `**/*.trigger` |

### Langages

Chaque langage du code, et ce qui le lit. Un langage que rien ne lit ici est mesuré (ses fichiers et ses lignes, source `stack`) et signalé aux agents, qui lisent eux-mêmes ce code.

| Langage | Extensions | Lu par |
|---|---|---|
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.svelte` | les lecteurs du kit, Next.js, Express, Fastify, Hono, Koa, Vue Router, React Router |
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | les lecteurs du kit, Next.js, Express, Fastify, Hono, Koa, NestJS, Angular router, Vue Router, React Router |
| Python | `.py` | les lecteurs du kit, FastAPI, Django, Django REST framework, Flask |
| HTML | `.html`, `.htm` | les lecteurs du kit |
| SQL | `.sql` | les lecteurs du kit |
| Java | `.java` | Spring (Spring MVC, Spring Data) |
| Kotlin | `.kt`, `.kts` | Spring (Spring MVC, Spring Data) |
| Groovy | `.groovy` | non lu : les agents le lisent |
| Scala | `.scala` | non lu : les agents le lisent |
| C# | `.cs`, `.cshtml`, `.razor` | ASP.NET Core |
| F# | `.fs` | non lu : les agents le lisent |
| Visual Basic | `.vb` | non lu : les agents le lisent |
| PHP | `.php` | Laravel, Symfony |
| Go | `.go` | Go: net/http, gin, echo, chi, gorilla/mux |
| Ruby | `.rb`, `.erb` | Ruby on Rails |
| Rust | `.rs` | Rust: actix-web, axum |
| Swift | `.swift` | non lu : les agents le lisent |
| Dart | `.dart` | non lu : les agents le lisent |
| Elixir | `.ex`, `.exs` | non lu : les agents le lisent |
| C | `.c`, `.h` | non lu : les agents le lisent |
| C++ | `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh` | non lu : les agents le lisent |
| Objective-C | `.m`, `.mm` | non lu : les agents le lisent |
| Apex | `.cls`, `.trigger` | non lu : les agents le lisent |
| Lua | `.lua` | non lu : les agents le lisent |
| Perl | `.pl`, `.pm` | non lu : les agents le lisent |
| COBOL | `.cbl`, `.cob`, `.cpy` | non lu : les agents le lisent |

## Pièges et écarts constatés

- **Une pile compte une fois détectée.** Spring ne compte comme lecteur du Java que là où Spring est une dépendance
  (ou qu'un fichier le nomme). Un code Java que rien ne lit reste « non lu », même si le kit a des adaptateurs pour
  d'autres frameworks Java.
- **La lecture statique a ses limites.** Une route construite à l'exécution, un décorateur produit par une macro, une
  table de routes lue en base ne sont pas vus. Les faits sont des indices à vérifier dans le code, jamais une mesure.
- **Un projet ajoute sa propre pile.** `stacks.adapters: ["local:adapters/x.mjs"]` dans `doc.config.mjs`
  ([Les adaptateurs](#/reference/adapters)). `stacks.disabled` désactive l'un de ceux du kit.

## Pour aller plus loin

- [Les adaptateurs](#/reference/adapters) : les adaptateurs de pile, de couverture et de connexion, et comment en
  écrire un.
- [Le dossier de reprise](#/spaces/takeover) : ce que les faits apportent à l'espace Développer.
