## doc-kit init

```text
doc-kit init [dossier-app] [--dir <dossier>] [--name "…"] [--url <url>] [--framework next|react-router|none] [--auth <adaptateur>] [--yes]
```

Crée le projet de documentation de l'application située dans `dossier-app` (défaut : le dossier courant), dans
`<dossier-app>/docs/manual/`.

| Option | Défaut | Effet |
|---|---|---|
| `--dir <dossier>` | `docs/manual` | Le dossier du projet, relatif à l'application |
| `--name "…"` | détecté | Nom du produit ; détecté dans `package.json` (`productName`, `displayName`, `name`) ou d'après le nom du dossier |
| `--url <url>` | détectée | URL de l'application ; le port vient du script `dev`, `start` ou `serve`, de la configuration de Vite, ou du framework |
| `--framework <nom>` | détecté | `next` (App Router), `react-router` ou `none` : l'adaptateur de couverture écrit dans la configuration |
| `--auth <adaptateur>` | `manual` | `manual`, `none`, `nextauth`, `api-me` ou `local:<fichier>` |
| `--yes`, `-y` | | Aucune question : les valeurs détectées et les options telles quelles |

- **Détection** : `package.json` dans le dossier ou dans `frontend`, `front`, `web`, `client`, `ui`, `app`,
  `apps/web` ; Next.js avec `app/` ou `src/app/`, React Router, Vite, NextAuth ; un back-end Python
  (`pyproject.toml`, `requirements.txt`), dont la version est alors lue dans `pyproject.toml`.
- **Questions** (sans `--yes`) : nom, langue, URL, mode de connexion, puis un récapitulatif à confirmer. Sans
  terminal et sans `--yes`, la commande s'arrête avec le code de sortie 2.
- **Écrit** le squelette de `templates/project/common` et de `templates/project/<langue>` : configuration,
  `package.json`, `.gitignore`, `README.md`, `WRITING-GUIDE.md`, un sommaire avec des pages d'exemple réparties en
  quatre sections (Utiliser, Configurer, Administrer, Reprendre), un glossaire, un exemple de plan de capture, un
  logo. 22 fichiers.
- **Refuse** un dossier qui existe et n'est pas vide (code de sortie 1).

## doc-kit doctor

```text
doc-kit doctor [--network]
```

Une ligne par vérification, `✔` correct, `⚠` à regarder, `✖` à corriger, chaque problème suivi de sa correction.

| Groupe | Vérifications |
|---|---|
| Environnement | Version de Node ; dépendances du kit ; Chromium ; la dépendance du projet au kit ; le skill Claude Code installé ; la version du kit face à la plage `kit` du projet |
| Projet | Configuration ; sommaire ; fichier de version ; sources de la couverture ; fichiers du masquage ; dossier des plans de capture ; `.gitignore` de `.doc-kit/` et `dist/` ; session (présente, âge, suivie par git) ; contrastes du thème |
| `--network` | L'application répond à `app.url` |

Code de sortie : 3 quand l'environnement échoue, 2 quand la configuration est invalide, 1 quand une vérification du
projet échoue, 0 sinon. Les avertissements ne font jamais échouer.

## doc-kit connect

```text
doc-kit connect [--url <url>] [--forget]
```

Ouvre l'application dans une fenêtre Chromium visible ; vous vous connectez, puis vous appuyez sur Entrée (ou
l'adaptateur détecte la session). La session est enregistrée dans `.doc-kit/session.json` (ou `<PREFIXE>_SESSION`).

| Option | Effet |
|---|---|
| `--url <url>` | Une autre adresse que `app.url` |
| `--forget` | Supprime le fichier de session |

Code de sortie 3 quand l'application est injoignable, après 15 minutes sans connexion, ou quand la fenêtre est
fermée ; 2 sans terminal (avec l'adaptateur `manual`). Avec `auth.adapter: "none"`, il n'y a rien à faire.
[Connexion et sessions](#/capture/sessions) explique le reste.

## doc-kit demo

```text
doc-kit demo
```

Lance le script de `capture.setup` dans son propre processus Node, depuis le dossier du projet. Un export par défaut
est appelé avec `{ config, root, url }`. Code de sortie 0 quand le script réussit, 1 sinon, 2 sans `capture.setup`.

## doc-kit capture

```text
doc-kit capture [motifs…] [--plans <dossier>] [--preview] [--no-session]
```

Prend les captures des plans dans un Chromium sans fenêtre et écrit `images/<id>.webp` et `images/zones/<id>.json`.

| Option | Effet |
|---|---|
| `motifs…` | Seulement les ids qui correspondent à l'un des motifs (`*` des caractères quelconques, `?` un seul) |
| `--plans <dossier>` | Un autre dossier de plans, relatif au projet |
| `--preview` | Écrit aussi `.doc-kit/<id>.zones.png`, les zones dessinées en rouge |
| `--no-session` | Sans la session enregistrée |

Avec une session, la session est d'abord vérifiée et l'exécution se fait en lecture seule
(`capture.readOnly: "auto"`). Code de sortie 1 quand une route est interdite ou qu'une capture a échoué, 3 quand
l'application est injoignable ou que la session a expiré, 2 pour une erreur de plan. `--json` affiche `ok`, `failed`,
`readOnly`, `blocked`, `blockedRequests`, `refused` et `expired`. [Les plans de capture](#/capture/plans)
expliquent les plans.

## doc-kit inventory

```text
doc-kit inventory [--json]
```

Liste ce que les adaptateurs de couverture voient dans l'application, famille par famille, avec `✔` pour les éléments
déjà cités dans la documentation et `·` pour les autres. `doc-kit inventory --json > .doc-kit/inventory.json` est un
bon point de départ pour un sommaire. Code de sortie 2 quand `coverage` est vide.

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : rédiger et vérifier](#/reference/cli/write-check).
- [Commandes : livrer et maintenir](#/reference/cli/deliver).
