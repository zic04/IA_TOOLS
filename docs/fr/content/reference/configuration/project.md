## Le projet

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `kit` | texte · `"*"` | Versions du kit acceptées par le projet (plage semver) ; hors de la plage, code de sortie 3 | `"^0.1.0"` |
| `product` | objet, obligatoire | Le produit documenté | `{ name: "Acme Orders" }` |
| `product.name` | texte, obligatoire | Nom affiché dans le site, dans les messages et dans le fichier de sortie par défaut | `"Acme Orders"` |
| `product.slug` | `[a-z0-9-]` · déduit du nom | Nom court : défaut de `theme.key` et de `env.prefix` | `"acme-orders"` |
| `language` | `"en"` ou `"fr"` · `"en"` | Langue du site, des gabarits de page et des messages de la ligne de commande | `"fr"` |
| `output` | chemin · `dist/<nom>-Documentation.html` | Le fichier généré, relatif au projet | `"dist/acme-orders.html"` |
| `extra` | objet · `{}` | Libre : jamais lu par le kit, transmis aux scripts du projet (le script de démo reçoit toute la configuration) | `{ demoCustomer: "Northwind Bistro" }` |

## Les dossiers

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `paths` | objet · `{}` | Noms des dossiers, relatifs au projet | `{ content: "contenu", diagrams: "schemas" }` |
| `paths.content` | dossier · `"content"` | Pages, `toc.json`, `glossary.json`, `home.md` | `"contenu"` |
| `paths.images` | dossier · `"images"` | Captures (`<id>.webp`) et fichiers de zones (`zones/<id>.json`) | `"images"` |
| `paths.diagrams` | dossier · `"diagrams"` | Schémas SVG | `"schemas"` |

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

## Pour aller plus loin

- [La configuration](#/reference/configuration) : validation, priorités et valeurs par défaut déduites.
- [Clés de capture et de masquage](#/reference/configuration/capture).
- [Clés de couverture, de thème et de textes](#/reference/configuration/site).
