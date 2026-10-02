## doc-kit init

```text
doc-kit init [dossier-app] [--dir <dossier>] [--name "…"] [--lang en|fr] [--url <url>] [--framework next|react-router|none] [--auth <adaptateur>] [--capture app|none] [--target local|demo|production] [--yes]
```

Crée le projet de documentation de l'application située dans `dossier-app` (défaut : le dossier courant), dans
`<dossier-app>/docs/manual/`. `dossier-app` est la **racine** de l'application, même quand son front-end est dans un
sous-dossier (`frontend/`, `web/`…) : il devient `app.dir`, le code que lisent les rédacteurs.

| Option | Défaut | Effet |
|---|---|---|
| `--dir <dossier>` | `docs/manual` | Le dossier du projet, relatif à l'application |
| `--name "…"` | détecté | Nom du produit : le `title` du `metadata` du layout racine Next.js, sinon `package.json` (`productName`, `displayName`, `name` sans sa portée ni son suffixe `-frontend`, `-front`, `-web`, `-ui`, `-client` ou `-app`), sinon le nom du dossier |
| `--lang en\|fr` | demandée, ou celle du système | Langue du site, et des messages de la commande ; avec `--yes`, c'est le seul moyen de la choisir |
| `--url <url>` | détectée | URL de l'application ; le port vient du script `dev`, `start` ou `serve`, de la configuration de Vite, ou du framework |
| `--framework <nom>` | détecté | `next` (App Router), `react-router` ou `none` : l'adaptateur de couverture écrit dans la configuration |
| `--auth <adaptateur>` | `manual` | `manual`, `none`, `nextauth`, `api-me` ou `local:<fichier>` |
| `--capture app\|none` | `app` | `app` : captures de l'application en marche ; `none` : aucune capture (`capture.mode: "none"`), chaque écran décrit par un tableau |
| `--target <où>` | `local`, ou `demo` pour une URL qui n'est pas locale | `local`, `demo` ou `production` (`capture.target`) ; `production` écrit `capture.readOnly: true` et, avec `--yes`, demande `--url` ; refusé avec `--capture none` |
| `--yes`, `-y` | | Aucune question : les valeurs détectées et les options telles quelles |

- **Détection** : `package.json` dans le dossier ou dans `frontend`, `front`, `web`, `client`, `ui`, `app`,
  `apps/web` ; Next.js avec `app/` ou `src/app/`, React Router, Vite, NextAuth ; un back-end Python
  (`pyproject.toml`, `requirements.txt`).
- **Version** (`version.file`) : `version.txt` ou `VERSION` à la racine de l'application, sinon le `package.json` racine
  s'il porte une `version`, sinon celui du front-end, sinon le `pyproject.toml` d'une application seulement Python.
- **Masquage** (`masking.env`) : `.env` et `.env.local` à la racine et dans le dossier du front-end, seulement les
  fichiers qui existent ; jamais `*.example`.
- **Questions** (sans `--yes`) : nom, langue, URL, où prendre les captures, mode de connexion (seulement avec des
  captures). Sans terminal et sans `--yes`, la commande s'arrête avec le code de sortie 2.
- **Où prendre les captures** : « 1) application locale ou de démo, 2) production, en lecture seule, 3) aucune
  capture ». Le choix 1 écrit `capture.target: "local"` pour une URL `localhost` ou `127.x`, `"demo"` sinon. Le
  choix 2 demande l'**adresse de la production** (jamais l'adresse locale déduite du script de développement), puis
  affiche trois rappels de sécurité : la lecture seule bloque les écritures du navigateur, **pas** une écriture faite
  par le serveur pendant qu'il affiche une page (listez ces routes dans `capture.forbidden`) ; le fichier de session
  est un secret ; les captures montrent des données réelles, ce qui relève d'une décision écrite du propriétaire. Il
  écrit `capture.target: "production"` et `capture.readOnly: true`.
- **Ensuite**, dans un terminal et avec des captures : « Ouvrir le navigateur maintenant pour vous connecter ?
  (O/n) » lance `npm install` dans le nouveau projet si besoin, puis
  `doc-kit connect` ; « Prendre une première capture de test avec
  --preview ? (O/n) » lance `doc-kit capture --preview --yes` sur le plan d'exemple. Avec `--yes`, rien ne s'ouvre :
  les étapes suivantes sont affichées. Une étape qui échoue s'arrête là avec son code de sortie ; le projet reste
  écrit.
- **Récapitulatif** : avant d'écrire quoi que ce soit, même avec `--yes`, le dossier, le nom et sa provenance,
  l'identifiant, la langue, l'URL, la version et son fichier, le mode et la cible des captures, la connexion, la source de la
  couverture, les fichiers `.env` masqués et le dossier de l'application. Pour renommer le produit ensuite :
  `product.name` dans `doc.config.mjs`, puis le titre, l'accroche et les titres de section de `content/toc.json`.
- **Écrit** le squelette de `templates/project/common` et de `templates/project/<langue>` : configuration,
  `package.json`, `.gitignore`, `README.md`, `WRITING-GUIDE.md`, un sommaire avec des pages d'exemple réparties en
  quatre sections (Utiliser, Configurer, Administrer, Reprendre), un glossaire, un exemple de plan de capture, un
  logo. 22 fichiers. Les commentaires de `doc.config.mjs` sont dans la langue du projet ; les routes d'exemple sont
  fictives (`/exemple/…`).
- **Sans captures** (`--capture none`) : pas de plan d'exemple (21 fichiers), des pages d'exemple qui décrivent chaque
  écran par un tableau `| Élément | Ce qu'il montre |`, un accueil sans l'encadré « écrans interactifs », et des
  étapes suivantes sans `connect` ni `capture`.
- **Refuse** un dossier qui existe et n'est pas vide (code de sortie 1).

## doc-kit doctor

```text
doc-kit doctor [--network]
```

Une ligne par vérification, `✔` correct, `⚠` à regarder, `✖` à corriger, chaque problème suivi de sa correction.

| Groupe | Vérifications |
|---|---|
| Environnement | Version de Node ; dépendances du kit ; Chromium ; la dépendance du projet au kit ; le skill Claude Code installé ; la version du kit face à la plage `kit` du projet |
| Projet | Configuration ; sommaire ; fichier de version (⚠ « version jamais incrémentée ? » quand il dit `0.0.0` ou `1.0.0` alors qu'un `version.txt`, `VERSION` ou `CHANGELOG.md` de l'application dit autre chose) ; dossier de l'application (`app.dir`) ; sources de la couverture ; fichiers du masquage ; dossier des plans de capture ; la cible des captures (⚠ « aucune route interdite déclarée » pour une production dont `capture.forbidden` est vide) ; `.gitignore` de `.doc-kit/` et `dist/` ; session (présente, âge, suivie par git) ; contrastes du thème. Avec `capture.mode: "none"`, ni la session, ni le dossier des plans, ni la cible ne sont vérifiés |
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
fermée ; 2 sans terminal (avec l'adaptateur `manual`). Avec `auth.adapter: "none"`, il n'y a rien à faire. Avec
`capture.mode: "none"`, la commande explique le mode et s'arrête avec le code de sortie 2 ; `--forget` supprime
toujours une session. Avec `capture.target: "production"`, une première ligne le dit : connectez-vous avec votre
propre compte, la session donne accès à la production.
[Connexion et sessions](#/capture/sessions) explique le reste.

## doc-kit demo

```text
doc-kit demo
```

Lance le script de `capture.setup` dans son propre processus Node, depuis le dossier du projet. Un export par défaut
est appelé avec `{ config, root, url }`. Code de sortie 0 quand le script réussit, 1 sinon, 2 sans `capture.setup`,
et 2 avec `capture.target: "production"` : un script de données de démo ne tourne jamais sur la production.

## doc-kit capture

```text
doc-kit capture [motifs…] [--plans <dossier>] [--preview] [--no-session] [--yes]
```

Prend les captures des plans dans un Chromium sans fenêtre et écrit `images/<id>.webp` et `images/zones/<id>.json`.
Avec `capture.mode: "none"`, la commande explique le mode et s'arrête avec le code de sortie 2.

| Option | Effet |
|---|---|
| `motifs…` | Seulement les ids qui correspondent à l'un des motifs (`*` des caractères quelconques, `?` un seul) |
| `--plans <dossier>` | Un autre dossier de plans, relatif au projet |
| `--preview` | Écrit aussi `.doc-kit/<id>.zones.png`, les zones dessinées en rouge |
| `--no-session` | Sans la session enregistrée |
| `--yes`, `-y` | Confirme d'avance une capture sur la production ; obligatoire sans terminal |

Avec `capture.target: "production"`, l'exécution est toujours en lecture seule, même sans session, et commence par
un bandeau, puis une question dont la réponse par défaut est **non** : un Entrée machinal ne lance jamais une
campagne sur la production.

```text
PRODUCTION — lecture seule · 2 captures · https://orders.acme.example
? Capturer 2 écrans sur la production maintenant ? (o/N) ›
```

Sans terminal, ou avec `--json`, `--yes` est obligatoire : sinon « capture sur la production non confirmée », code de
sortie 2. Répondre non ne capture rien (code de sortie 0).

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
bon point de départ pour un sommaire. Une page qui contient encore des consignes de gabarit ne cite encore rien : ni
son texte ni son entrée dans le sommaire ne comptent. Code de sortie 2 quand `coverage` est vide.

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : rédiger et vérifier](#/reference/cli/write-check).
- [Commandes : livrer et maintenir](#/reference/cli/deliver).
