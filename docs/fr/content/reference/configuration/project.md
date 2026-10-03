## Le projet

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `kit` | texte · `"*"` | Versions du kit acceptées par le projet (plage semver) ; hors de la plage, code de sortie 3 | `"^0.1.0"` |
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

## Pour aller plus loin

- [La configuration](#/reference/configuration) : validation, priorités et valeurs par défaut déduites.
- [Clés de capture et de masquage](#/reference/configuration/capture).
- [Clés de couverture, de thème et de textes](#/reference/configuration/site).
