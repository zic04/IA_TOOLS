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
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.svelte` | les lecteurs du kit, Next.js, Express, Fastify, Hono, Koa |
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | les lecteurs du kit, Next.js, Express, Fastify, Hono, Koa |
| Python | `.py` | les lecteurs du kit, FastAPI |
| HTML | `.html`, `.htm` | les lecteurs du kit |
| SQL | `.sql` | les lecteurs du kit |
| Java | `.java` | non lu : les agents le lisent |
| Kotlin | `.kt`, `.kts` | non lu : les agents le lisent |
| Groovy | `.groovy` | non lu : les agents le lisent |
| Scala | `.scala` | non lu : les agents le lisent |
| C# | `.cs`, `.cshtml`, `.razor` | non lu : les agents le lisent |
| F# | `.fs` | non lu : les agents le lisent |
| Visual Basic | `.vb` | non lu : les agents le lisent |
| PHP | `.php` | non lu : les agents le lisent |
| Go | `.go` | non lu : les agents le lisent |
| Ruby | `.rb`, `.erb` | non lu : les agents le lisent |
| Rust | `.rs` | non lu : les agents le lisent |
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
