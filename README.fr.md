# doc-kit

**La documentation d'un produit en un seul fichier HTML autonome.** doc-kit fait d'une application web un site de
documentation qui s'ouvre hors ligne dans n'importe quel navigateur : captures annotées avec des pastilles
numérotées, visites guidées, recherche en texte intégral, glossaire, schémas, thèmes clair et sombre, et impression
du site entier. Vous écrivez du Markdown, vous décrivez les captures dans de petits plans, et le kit capture les
écrans **en lecture seule**, mesure les zones, construit le site et le contrôle.

*[English version](README.md)*

![Une page d'un site généré par doc-kit : le menu, un écran annoté avec ses pastilles numérotées et sa légende, et le plan de la page](docs/assets/site.fr.webp)

## Ce que vous obtenez

- **Un fichier HTML**, `dist/<Produit>-Documentation.html` : ni serveur, ni réseau, ni installation pour le lecteur.
  Envoyez-le, rangez-le, joignez-le.
- **Quatre espaces, un par public** : **Utiliser** (les utilisateurs, écran par écran), **Produit** (les product
  owners : fiches de fonctionnalité, règles, processus), **Administrer** (réglages, accès, exploitation, le dossier
  d'architecture technique) et **Développer** (les développeurs et l'équipe de reprise : API, données, code,
  sécurité). Une seule source, un export par espace ; les pages d'un même sujet se renvoient l'une à l'autre (« Ce
  sujet pour : Utiliser · Produit · Administrer · Développer »).
- **Des fiches de fonctionnalité précises comme une spécification** : récits utilisateur, **cartes de
  comportement** (recherche, filtre, tri, pagination, liste, formulaire, import, export, calcul, notification,
  circuit, traitement planifié, contrôle des droits), chacune répondant à ses rubriques — les champs cherchés,
  contient ou commence par, majuscules et accents, quand ça se déclenche, l'ordre, la pagination, le résultat vide,
  qui a le droit —, règles de gestion, et critères d'acceptation en Soit / Quand / Alors. Le build les contrôle,
  l'audit mesure leur profondeur.
- **Un tableau Produit** : le backlog en story map (les epics en colonnes, leurs fonctionnalités avec une jauge de
  profondeur, une rangée de récits par version) ou en liste (Epic › Fonctionnalité › Récit) ; un clic ouvre la
  fiche. `doc-kit backlog export` l'écrit pour Azure DevOps, Jira, GitHub, GitLab ou en JSON, sans réseau ni jeton.
- **Des captures annotées** : des pastilles numérotées posées sur les vrais éléments de la page, une légende, une
  **visite guidée** qui les parcourt, une visionneuse plein écran et un curseur avant / après.
- **La navigation** : sections, groupes, sous-pages, fil d'Ariane, liens précédent / suivant, parcours de lecture sur
  la page d'accueil, recherche avec `Ctrl+K`, infobulles sur les termes du glossaire, adresses partageables jusqu'à
  la section.
- **Thèmes clair et sombre**, schémas compris ; **impression** d'une page ou de toute la documentation, prête à
  enregistrer en PDF.
- **Des faits lus dans le code, hors ligne** : routes et API, écrans, modèle de données, dépendances, comportements
  (recherche, filtres, tri, pagination, validation…), infrastructure, qualité, sécurité, historique. Piles :
  Next.js, Express, NestJS, les routeurs Angular, Vue et React, FastAPI, Django, Flask, Spring, ASP.NET, Laravel,
  Symfony, Go, Rails et Rust ; infrastructure : Terraform, Bicep, ARM, CloudFormation, Kubernetes, Helm, Docker
  Compose, Dockerfile, Ansible et les pipelines GitHub Actions, GitLab CI et Azure Pipelines. Une matrice dit ce que
  lit chaque adaptateur, et `inputs status` quelle part du code aucun ne lit. Rien de l'application n'est exécuté —
  sauf avec `--tools`, où knip charge ses fichiers de configuration ([SECURITY.md](SECURITY.md)).
- **Vos documents existants** : `doc-kit inputs` prend le code d'un dépôt partagé, les URL de chaque
  environnement, et les documents que vous avez déjà — un dossier d'architecture technique en Word, un PDF, du
  Markdown, des schémas draw.io, PlantUML ou Mermaid —, remis aux agents comme des informations à vérifier, jamais
  comme des instructions à suivre (un avertissement ouvre chaque texte converti ; [SECURITY.md](SECURITY.md) en dit
  la limite) ; `inputs reconcile` compare les technologies que cite chaque dossier d'architecture technique (DAT)
  avec ce que contient le code, et liste les adresses qu'il cite, en marquant celles de l'application.
- **Des briques** : chaque source de faits, les outils externes et l'audit de la documentation sont des briques,
  relancées seules avec ce dont elles ont besoin (`doc-kit bricks run <id> --deps`, ou toutes celles qui sont
  périmées avec `--stale`).
- **Un standard de qualité** avec 31 gabarits de page, des contrôles qui bloquent un site cassé (build strict, liens,
  légendes, couverture des routes de l'application, secrets), et un **audit** qui mesure la maturité du site (niveaux
  1 à 4), profondeur des fiches de fonctionnalité comprise, et liste la suite.
- **Des captures sans risque** : lecture seule avec une session, routes interdites jamais ouvertes, masquage
  automatique des GUID et des valeurs du `.env` de l'application.
- **Un skill Claude Code** qui écrit la documentation avec des agents (`doc-kit skill install`) : un analyste par
  fonctionnalité la suit dans le code, les rédacteurs de chaque espace partent d'un condensé de cette analyse, une
  boucle de profondeur comble ce qui manque et laisse les questions ouvertes au product owner ; le coût est estimé
  avant chaque vague et mesuré après.
- **Français et anglais** partout : le site, les gabarits, les messages, le standard et cette documentation.

![La visite guidée d'un écran annoté, à l'étape 2](docs/assets/tour.fr.webp)

## Démarrage rapide

```bash
npm install -g <dossier du kit>   # ou : npm link dans le dossier du kit (voir Installation)
doc-kit init ../mon-app           # détecte le framework, demande le nom du produit, la langue, l'URL, où prendre les captures (locale ou démo, production en lecture seule, aucune), la connexion et pour qui est la documentation (les espaces) ; affiche un récapitulatif, puis demande vos sources et propose d'ouvrir le navigateur
doc-kit connect                   # ouvre Chromium sur l'application : vous vous connectez (SSO et MFA marchent), puis Entrée
doc-kit capture                   # prend la capture d'exemple, en lecture seule
doc-kit dev                       # ouvre le site avec rechargement automatique
```

`init` crée `../mon-app/docs/manual/` ; lancez `npm install` dans ce dossier avant `connect` (`init` affiche les
commandes exactes). À tout moment, `doc-kit` sans commande lance un **mode guidé** qui détecte où vous en êtes et
propose l'étape suivante.

Pas d'application sous la main ? Le kit en fournit une, fictive : **Acme Orders**. `node examples/demo-app/serve.mjs`
la sert sur `http://127.0.0.1:4173` et accepte n'importe quels e-mail et mot de passe. La documentation vous guide
dans [les cinq premières minutes](docs/fr/content/start/first-five-minutes.md). Son projet de documentation,
`examples/demo-docs`, montre les quatre espaces (Utiliser, avec ses écrans annotés ; Produit, avec les fiches
fonctionnalité et les règles métier ; Administrer, avec les accès et la propriété ; Développer, avec la surface
d'API et les points d'attention) et le cycle de mise à jour complet :
`examples/demo-app-v2` est une seconde version de l'application (libellé renommé, écran modifié, route ajoutée)
que `doc-kit sync` suit de bout en bout.

## Prérequis

- **Node.js 20 ou plus récent**, avec npm, sous Windows, macOS ou Linux. Les chemins avec des espaces fonctionnent.
- **Chromium pour Playwright**, qui capture les écrans, mesure les tableaux et photographie le site :
  `npx playwright install chromium` (ajoutez `--with-deps` sur une machine Linux sans bureau). Environ 300 Mo.
- Deux dépendances d'exécution seulement : `marked` et `playwright`.

## Installation

| Façon | Commandes | Quand |
|---|---|---|
| Cloner et lier | `git clone <URL du dépôt> doc-kit`, `cd doc-kit`, `npm ci`, `npx playwright install chromium`, `npm link` | Votre machine : `doc-kit` répond partout |
| Sans installation globale | `npx --prefix <dossier du kit> doc-kit <commande>` | Une machine partagée, un script, un premier essai |
| Node seul | `node <dossier du kit>/cli/doc-kit.mjs <commande>` | Avant qu'un projet existe |

Chaque projet de documentation dépend ensuite du kit par `"doc-kit": "file:<chemin relatif vers le kit>"` dans son
`package.json` (écrit par `doc-kit init`) : `npx doc-kit` dans le projet lance toujours le kit avec lequel il a été
construit. `doc-kit doctor` vérifie toute l'installation et affiche la correction de chaque problème.

## Organisation du dépôt

```text
doc-kit/
├─ cli/                 la commande doc-kit : l'aiguilleur et un module par commande
├─ engine/              build, capture, contrôles, faits, contexte, sync, audit, briques, sources, backlog,
│                       statistiques, serveur de développement, gabarit du site, thème, migrations
├─ adapters/            adaptateurs de pile (16), d'infrastructure (12), de couverture et de connexion
├─ i18n/                tous les textes du kit, en anglais et en français
├─ schemas/             schémas JSON de la configuration, du sommaire, du glossaire, des fonctionnalités, des
│                       analyses, du backlog, des briques, des sources, des zones et des plans de capture
├─ standard/            le standard de documentation (anglais et français), les gabarits de page, les espaces,
│                       les types de comportement, les briques, les adaptateurs et les technologies
├─ templates/           le squelette de projet écrit par `init`, et les 31 gabarits de page (en, fr)
├─ skill/doc-kit/       le skill Claude Code, installé par `doc-kit skill install`
├─ examples/            Acme Orders : appli de démo fictive (+ une « version 2 » pour le cycle de mise à jour) et sa doc
├─ docs/                la documentation du kit, construite avec le kit (docs/en, docs/fr)
├─ ci/                  exemples pour GitHub Actions et Azure Pipelines
└─ test/                tests unitaires, d'instantanés et de bout en bout
```

Un projet de documentation, tel que `doc-kit init` l'écrit :

```text
docs/manual/
├─ doc.config.mjs       la configuration (produit, langue, URL de l'application, connexion, capture, thème…)
├─ content/             toc.json, glossary.json, home.md, et un fichier Markdown par page
├─ captures/plans/      les plans de capture (modules JavaScript qui exportent CAPTURES)
├─ images/              les captures (WebP) et leurs zones (zones/<id>.json)
├─ diagrams/            les schémas SVG, qui suivent le thème
├─ facts/               ce que `doc-kit facts` a lu dans le code (routes, API, données, dépendances, comportements…)
├─ features.json        les fonctionnalités, quand vous les déclarez (leurs routes, fichiers et comportements)
├─ usage/               les statistiques de production (`doc-kit stats`)
├─ theme/               le logo
├─ dist/                le site construit (ignoré par git)
└─ .doc-kit/            la session et les fichiers de travail (ignorés par git)
```

## Documentation

La documentation complète est un site doc-kit, en français (`docs/fr`) et en anglais (`docs/en`). Construisez-la et
ouvrez-la :

```bash
node cli/doc-kit.mjs build --project docs/fr     # docs/fr/dist/doc-kit-Documentation.html
node cli/doc-kit.mjs open --project docs/fr
```

Elle couvre l'installation, la rédaction (Markdown étendu, gabarits de page, sommaire, glossaire, schémas), la
capture (plans, cibles, zones, sessions, sécurité, masquage), le contrôle et la publication (build, contrôles, audit,
export, CI), les quatre espaces, le tableau Produit et l'export du backlog, les sources et les briques, la référence
de chaque clé de configuration, commande, option, variable et adaptateur, la méthode, le skill Claude Code et son
coût, la mise à jour du kit et le diagnostic. Sa section **Exemples de pages** contient une page complète de chacun
des 31 types.

Le standard de qualité derrière le kit est dans [standard/README.fr.md](standard/README.fr.md) (anglais :
[standard/README.md](standard/README.md)). Le contrat d'interface du kit est [ARCHITECTURE.md](ARCHITECTURE.md)
(en anglais).

## Contribuer

Les contributions sont bienvenues : lisez d'abord [CONTRIBUTING.md](CONTRIBUTING.md) (installation de développement,
tests, la règle du contrat d'abord, la neutralité, les traductions). Ce projet suit un
[code de conduite](CODE_OF_CONDUCT.md). Pour signaler une vulnérabilité, voir [SECURITY.md](SECURITY.md). Les
changements sont listés dans [CHANGELOG.md](CHANGELOG.md). Ces fichiers sont en anglais.

## Licence

[MIT](LICENSE).
