## Le projet

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `kit` | texte · `"*"` | Versions du kit acceptées par le projet (plage semver) ; hors de la plage, code de sortie 3 | `"^0.3.0"` |
| `product` | objet, obligatoire | Le produit documenté | `{ name: "Acme Orders" }` |
| `product.name` | texte, obligatoire | Nom affiché dans le site, dans les messages et dans le fichier de sortie par défaut | `"Acme Orders"` |
| `product.slug` | `[a-z0-9-]` · déduit du nom | Nom court : défaut de `theme.key` et de `env.prefix` | `"acme-orders"` |
| `language` | `"en"` ou `"fr"` · `"en"` | Langue du site, des gabarits de page et des messages de la ligne de commande | `"fr"` |
| `languages` | liste de codes de langue ou `null` · `null` | Déclare la documentation comme multilingue (ARCHITECTURE.md §6.12) : au moins deux, chacune une langue parlée par le kit (`en`/`fr` actuellement, sinon `languagesUnsupported`) ; la première est la source (`language` en est alors déduite, sinon `languagesSource`). Non déclarée : le projet reste inchangé, aucun sélecteur, aucun dossier de traductions | `["fr", "en"]` |
| `output` | chemin · `dist/<nom>-Documentation.html` | Le fichier généré, relatif au projet | `"dist/acme-orders.html"` |
| `extra` | objet · `{}` | Libre : jamais lu par le kit, transmis aux scripts du projet (le script de démo reçoit toute la configuration) | `{ demoCustomer: "Northwind Bistro" }` |

Voir [Documenter en plusieurs langues](#/spaces/languages) pour `languages` et `paths.translations`.

## Les dossiers

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `paths` | objet · `{}` | Noms des dossiers, relatifs au projet | `{ content: "contenu", diagrams: "schemas" }` |
| `paths.content` | dossier · `"content"` | Pages, `toc.json`, `glossary.json`, `home.md` | `"contenu"` |
| `paths.images` | dossier · `"images"` | Captures (`<id>.webp`) et fichiers de zones (`zones/<id>.json`) | `"images"` |
| `paths.diagrams` | dossier · `"diagrams"` | Schémas SVG | `"schemas"` |
| `paths.facts` | dossier · `"facts"` | Où `doc-kit facts` écrit un fichier par source (`<source>.json`), lu par `::facts` (ARCHITECTURE.md §6.9) | `"facts"` |
| `paths.translations` | dossier · `"translations"` | Porte `translations/<langue>/`, le miroir par langue de `paths.content` (ARCHITECTURE.md §6.12) ; ne doit pas être à l'intérieur de `paths.content` | `"i18n-content"` |
| `paths.sync` | dossier · `"."` (la racine du projet) | Où vit `sync.json`, la référence de `doc-kit sync` (ARCHITECTURE.md §6.10) | `"."` |

Les noms de dossier ne peuvent pas contenir `< > : " | ? *`. Les projets anciens gardent leurs propres noms grâce à
`paths` ([Migrer un projet ancien](#/migrate/legacy-project)).

## La version documentée

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `version` | objet · `{}` | Où est lue la version affichée par le site | |
| `version.file` | chemin ou `null` · `null` | Un fichier de l'application, relatif au projet | `"../../package.json"` |
| `version.pattern` | expression régulière · `"version"\s*:\s*"([^"]+)"` | Son premier groupe est la version | `"^([\\d.]+)"` |
| `version.fallback` | texte · `"0.0.0"` | Utilisée quand le fichier manque ou que le motif ne trouve rien | `"2.4.0"` |

La version apparaît dans la barre du haut, sur la page d'accueil, dans le pied de page et dans les fichiers de zones
des nouvelles captures ; `doc-kit check images` et `doc-kit audit` la comparent à celle des captures.
`doc-kit export` la fige comme `version.fallback` dans la copie. Pour une application Python :
`file: "../../pyproject.toml"` et un motif comme `"(?:^|\\n)version\\s*=\\s*\"([^\"]+)\""` (écrit par
`doc-kit init` quand il trouve un `pyproject.toml`).

## Environnement et application

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `env` | objet · `{}` | Variables d'environnement du projet | |
| `env.prefix` | `[A-Z][A-Z0-9_]*` · le slug en majuscules | Préfixe des variables du projet : `<PREFIXE>_URL`, `_SESSION`, `_PLANS`, `_READONLY`, `_VERSION` | `"ACME"` |
| `app` | objet · `{}` | L'application documentée | |
| `app.url` | URL ou `null` · `null` | Adresse utilisée par `connect`, `capture`, `demo` et `doctor --network`, sans chemin final | `"http://localhost:3000"` |
| `app.dir` | chemin ou `null` · `null` | La racine de l'application (son code), relative au projet ; écrite par `init`. Les briefs du skill la donnent aux agents (`appDir`), et `doctor` vérifie qu'elle existe et y cherche une version qui contredit la version documentée | `"../.."` |

## La connexion

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `auth` | objet · `{}` | L'adaptateur d'authentification et ses options, côte à côte | `{ adapter: "manual", loginPattern: "/login" }` |
| `auth.adapter` | nom ou `local:<chemin>` · `"manual"` | `manual`, `none`, `nextauth`, `api-me`, ou un adaptateur du projet | `"local:adapters/sso.mjs"` |

Les autres clés de `auth` sont les options de l'adaptateur, validées par l'adaptateur lui-même. Tout adaptateur
accepte :

| Option | Défaut | Rôle |
|---|---|---|
| `start` | `"/"` | Chemin ouvert par `connect` et par la vérification de la session |
| `loginPattern` | `"login\|signin\|sign-in\|oauth\|authorize"` | Un chemin ou une requête qui y correspond est une page de connexion |
| `browser` | `"chromium"` | `"chrome"` utilise le Google Chrome installé (contrôles anti-robots) |

`nextauth` ajoute `endpoint` (défaut `/api/auth/session`) ; `api-me` ajoute `url` (défaut `/api/me`), `proof` (défaut
`id`) et `who` (défaut `name`). Voir [Les adaptateurs](#/reference/adapters).

## Suivre l'application

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `sync` | objet · `{}` | `doc-kit sync` (ARCHITECTURE.md §6.10) : ce que la documentation doit suivre après un changement de l'application | |
| `sync.labels` | liste de globs · `[]` | Fichiers de messages dont les libellés sont suivis, relatifs au projet ; défaut : les `messages` de chaque adaptateur de couverture `i18n-registry` | `["../../src/messages/*.json"]` |
| `capture.compareThreshold` | nombre de 0 à 1 · `0.005` | `capture --compare` : part de pixels différents au-delà de laquelle une capture est remplacée plutôt que gardée telle quelle | `0.01` |
| `bricks.enabled` | liste d'ids de briques ou de préréglages, ou `null` · `null` | Les briques du projet, les parties que `doc-kit bricks run` peut relancer seules (ARCHITECTURE.md §6.18) ; `null` : toutes les briques | `["facts", "doc-audit"]` |
| `bricks.disabled` | liste d'ids de briques ou de préréglages · `[]` | Briques écartées : jamais lancées, même nommées ou par un préréglage | `["facts.history"]` |

Une fois une page marquée, son pied de page affiche « Vérifiée sur la version {version} le {date} » à la prochaine
construction du site. Voir [Suivre l'application](#/reference/cli/write-check~doc-kit-sync).

## Estimer le coût des agents

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `llm` | objet · `{}` | Prix par modèle, lus par `sync --estimate` et par `brief.mjs --estimate` du skill (ARCHITECTURE.md §6.11) ; aucun prix par défaut | |
| `llm.currency` | texte ou `null` · `null` | Affichée à côté du coût estimé | `"EUR"` |
| `llm.prices` | objet · `{}` | Une entrée par modèle (`haiku`, `sonnet`, `opus`…) : `{ input, output, cacheRead? }`, par million de jetons | `{ sonnet: { input: 3, output: 15 } }` |

## Revues à la demande

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `review` | objet · `{}` | `doc-kit probe` et les `auth`/`guards` de la source de faits `api` | |
| `review.guards` | objet · `{}` | Les motifs de garde de rôle et d'utilisateur, côte à côte | `{ role: ["is_admin"] }` |
| `review.guards.role` | liste d'expressions régulières (chaînes) · `[]` | Remplace le motif intégré de garde de rôle (`admin\|role\|permission\|scope\|owner\|super\|staff`) quand elle n'est pas vide | `["is_admin"]` |
| `review.guards.user` | liste d'expressions régulières (chaînes) · `[]` | Remplace le motif intégré de garde d'utilisateur (`current_user\|authenticated\|login_required\|require_auth\|session\|token`) quand elle n'est pas vide | `["require_login"]` |
| `review.params` | objet · `{}` | Nom de paramètre de chemin → valeur d'exemple, pour que `doc-kit probe` puisse remplir une route comme `/groups/{group_id}` ; une route dont un paramètre manque ici est sautée | `{ "group_id": "g1" }` |
| `review.semgrep` | chemin ou `null` · `null` | Un dossier de règles semgrep local, relatif au projet ; sans lui, `doc-kit facts --tools` ne lance jamais semgrep (jamais `--config auto`, qui télécharge des règles) | `"security/semgrep-rules"` |

Voir [Revues de sécurité et de maintenabilité](#/spaces/reviews).

## Cartes de comportement

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `behaviours` | objet · `{}` | Les cartes de comportement des fiches de fonctionnalité (`:::comportement`, ARCHITECTURE.md §6.8a) | |
| `behaviours.file` | chemin ou `null` · `null` | Un fichier JSON des types de comportement propres au projet, relatif au projet, au format de `standard/behaviours.json` (`schemas/behaviours.schema.json`, sans `answers`) ; un type ne peut pas prendre un nom du kit | `"behaviours.json"` |
| `behaviours.strict` | oui/non · `false` | Une rubrique obligatoire omise dans une carte (`behaviour.missing`) fait échouer le build strict au lieu d'avertir | `true` |

Voir [Une fonctionnalité en profondeur](#/write/markdown~une-fonctionnalite-en-profondeur-stories-cartes-scenarios).

## Les piles

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `stacks` | objet · `{}` | Les adaptateurs de pile de `doc-kit facts` (sources `api`, `screens`, `behaviours`, `stack`) | |
| `stacks.disabled` | liste · `[]` | Les identifiants des adaptateurs de pile du kit à ne pas lancer : leurs routes, écrans et indices ne sont pas lus | `["express"]` |
| `stacks.adapters` | liste · `[]` | Les adaptateurs de pile propres au projet, chacun `"local:<chemin>"` relatif au projet (jamais un fichier de l'application), lancés après ceux du kit | `["local:adapters/cobol.mjs"]` |

Voir [Ce que le kit sait lire](#/reference/compatibility) et [Les adaptateurs](#/reference/adapters).

## L'infrastructure

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `infra` | objet · `{}` | Les adaptateurs d'infrastructure de `doc-kit facts` (source `infra`) | |
| `infra.disabled` | liste · `[]` | Les identifiants des adaptateurs d'infrastructure du kit à ne pas lancer | `["ansible"]` |
| `infra.adapters` | liste · `[]` | Les adaptateurs d'infrastructure propres au projet, chacun `"local:<chemin>"` relatif au projet (jamais un fichier de l'application), lancés après ceux du kit | `["local:adapters/nomad.mjs"]` |

## Le backlog

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `backlog` | objet · `{}` | Le backlog de la documentation : les epics, les fiches de fonctionnalité et leurs récits ([Les epics](#/write/table-of-contents~les-epics-le-haut-du-backlog)) | |
| `backlog.refs` | objet · `{}` | L'adresse d'un élément dans chaque outil, pour qu'une référence (`ref`) soit un lien : `azure`, `jira`, `github`, `gitlab`, chacune une adresse `https://` avec `{id}` (et `{repo}` pour GitHub et GitLab). Avec GitHub et GitLab à la fois, `owner/repo#42` est celui de GitHub et `group/sub/project#7` celui de GitLab. Aucun jeton : le kit n'appelle jamais un outil | `{ "azure": "https://dev.azure.com/acme/shop/_workitems/edit/{id}" }` |
| `backlog.docUrl` | texte · aucun | L'adresse du site publié (son fichier HTML), sans `#` : chaque élément exporté renvoie à sa page | `"https://docs.acme.example/Acme-Documentation.html"` |
| `backlog.idInTitle` | booléen · `true` | Le titre d'un élément exporté commence par son id (`F-01 · Suivre les commandes`) | `false` |
| `backlog.azure.process` | `agile`, `scrum`, `cmmi`, `basic` · `agile` | Le processus du projet Azure DevOps, qui donne les types d'éléments : Agile (Epic, Feature, User Story), Scrum (… Product Backlog Item), CMMI (… Requirement), Basic (Epic, Issue, Task). Seuls Agile et Scrum ont un champ Acceptance Criteria ; sinon les critères terminent la description | `"scrum"` |
| `backlog.azure.areaPath`, `backlog.azure.iterationPath` | texte · aucun | L'Area Path et l'Iteration Path de chaque élément importé (sinon la racine du projet) | `"Acme\\Equipe"` |
| `backlog.jira.types` | objet · `{}` | Le type d'un `epic`, d'une `feature` et d'une `story`, `null` pour aucun : par défaut un epic n'est pas un ticket (un label de ce qu'il contient), une fonctionnalité un Epic, un récit une Story. Un projet qui a un niveau au-dessus d'Epic le nomme | `{ "epic": "Initiative" }` |
| `backlog.github.types` | objet · `{}` | Le type d'issue (d'une organisation) d'un `epic`, d'une `feature` et d'une `story` (aucun par défaut) | `{ "feature": "Feature", "story": "Task" }` |

## Pour aller plus loin

- [La configuration](#/reference/configuration) : validation, priorités et valeurs par défaut déduites.
- [Clés de capture et de masquage](#/reference/configuration/capture).
- [Clés de couverture, de thème et de textes](#/reference/configuration/site).
