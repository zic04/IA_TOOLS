## doc-kit dev

```text
doc-kit dev [--port <n>]
```

Construit le site en mode brouillon, le sert sur `http://127.0.0.1:<port>/`, ouvre votre navigateur, et reconstruit
quand `content/`, `images/`, `diagrams/`, `theme/` ou `doc.config.mjs` changent ; la page se recharge toute seule.
Les erreurs de build s'affichent dans le terminal et par-dessus la page. [[touche Ctrl+C]] l'arrête.

| Option | Défaut | Effet |
|---|---|---|
| `--port <n>` | premier port libre à partir de 4400 | `0` : n'importe quel port libre ; un port occupé arrête la commande avec le code de sortie 3 |

`DOC_KIT_NO_OPEN=1` laisse le navigateur fermé. `--json` affiche `url`, `port`, `root` et les chemins surveillés.
Avec des espaces, le fichier de chaque espace est aussi servi sur `/space/<id>`.

## doc-kit new

```text
doc-kit new <id-page> --template <type> [--title "…"] [--parent <id-page>] [--prefill]
```

Crée `content/<id-page>.md` à partir du gabarit du type, dans la langue du projet, et déclare la page dans le
sommaire. N'écrase jamais un fichier (code de sortie 1).

| Option | Effet |
|---|---|
| `--template <type>` | L'un des 13 types ; obligatoire, sauf si la page est déjà déclarée avec un type |
| `--title "…"` | Titre et titre de menu ; défaut : le dernier segment de l'id, rendu lisible |
| `--parent <id-page>` | En fait une sous-page (`"level": 2`), placée juste après le parent et ses sous-pages |
| `--prefill` | Remplit le tableau principal de la page depuis les faits (`variables`, `api-surface`, `data-model`, `dependencies` et `agent-instructions` seulement) ; les autres cellules restent des consignes à remplir |

Les ids de page sont des segments en minuscules séparés par `/`, le premier étant l'id de la section :
`utiliser/commandes/export`. [Les gabarits de page](#/write/page-templates~creer-une-page-doc-kit-new) donnent les
règles de placement. `--prefill` lit `facts/<source>.json` (`doc-kit facts`) : sans lui, code de sortie 1 ; sur un
type sans tableau à préremplir, code de sortie 2.

## doc-kit build

```text
doc-kit build [--draft] [--date AAAA-MM-JJ] [--output <fichier>] [--space <id>]
```

| Option | Effet |
|---|---|
| `--draft` | Les erreurs deviennent des avertissements ; les pages et captures manquantes sont remplacées par des notes |
| `--date AAAA-MM-JJ` | La date affichée dans le site (un build reproductible) ; une date impossible est refusée (code de sortie 2) |
| `--output <fichier>` | Un autre fichier de sortie, relatif au dossier courant |
| `--space <id>` | Seulement le fichier de cet espace ; `--output` le nomme alors. Un id inconnu, ou aucun espace déclaré : code de sortie 2 |

Code de sortie 0 quand le site est écrit, 1 quand il reste une erreur (rien n'est écrit). Avec des espaces, `build`
écrit aussi un fichier par espace (`spaces.output`), une ligne de résumé chacun. Voir
[Construire le site](#/publish/build).

## doc-kit view

```text
doc-kit view <page[~ancre]> [--theme light|dark] [--height <px>] [--full] [--tour N] [--output <fichier>] [--space <id>]
```

Fait une capture d'une page du site construit (ou d'un build brouillon quand il n'y en a pas) dans un Chromium sans
fenêtre, de 1 440 px de large.

| Option | Défaut | Effet |
|---|---|---|
| `--theme` | `light` | `light` ou `dark` |
| `--height` | 900 | Hauteur de la fenêtre, au moins 200 |
| `--full` | | La page entière en une image, depuis son haut : une longue page relue en une seule vue |
| `--tour N` | | Ouvre la première visite guidée de la page, à l'étape N |
| `--output` | `.doc-kit/page.png` | Le fichier PNG |
| `--space <id>` | | Une page du fichier de cet espace au lieu du site complet |

Code de sortie 1 quand la page a levé une erreur JavaScript (affichée après le nom du fichier).

## doc-kit open

```text
doc-kit open [page] [--space <id>]
```

Ouvre le site construit dans le navigateur par défaut, sur une page quand vous en donnez une
(`doc-kit open utiliser/commandes`) ; avec `--space <id>`, le fichier de cet espace. Code de sortie 1 quand le site
n'est pas construit. Avec `DOC_KIT_NO_OPEN=1`, la commande affiche seulement l'adresse.

## doc-kit check

```text
doc-kit check [coverage|links|tables|images|secrets|all] [--width <px>] [--threshold <Ko>]
```

| Option | Défaut | Effet |
|---|---|---|
| `--width <px>` | 1440 | Largeur de la fenêtre pour `tables`, au moins 320 |
| `--threshold <Ko>` | 200 | Taille au-delà de laquelle `images` signale une image comme lourde |

Sans nom, tous les contrôles sont lancés (`all`), et la couverture est ignorée quand aucun adaptateur n'est
configuré. Code de sortie 1 quand un contrôle échoue. Voir [Les contrôles](#/publish/checks).

## doc-kit audit

```text
doc-kit audit [--json]
```

Écrit `.doc-kit/audit.md` et `.doc-kit/audit.json`, affiche un résumé (ou, avec `--json`, le résultat complet). Code
de sortie 0 quel que soit le niveau. Voir [L'audit et les niveaux de maturité](#/publish/audit).

## doc-kit facts

```text
doc-kit facts [--source <nom>]... [--network] [--tools] [--json]
```

Lit le code de l'application (`app.dir`) et écrit un fichier par source dans `paths.facts` (`facts/<source>.json`
par défaut), dans le projet de documentation — jamais dans l'application : `dependencies`, `env`, `api`, `db`,
`agents`, `secrets` et `tests`. `::faits{source="…"}` lit ces fichiers au moment de la construction, et les types de
pages de reprise (`access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`,
`tests-quality`, `agent-instructions`, `adr`, `threat-model`) en sont écrits. Sans `app.dir`, code de sortie 2.

| Option | Effet |
|---|---|
| `--source <nom>` | Répétable : seulement ces sources (par défaut : les sept) |
| `--network` | `dependencies` : vérifie aussi si chaque paquet direct existe dans son registre (le nom seul, rien d'autre) |
| `--tools` | Lance aussi `gitleaks`, `osv-scanner`, `syft` et `knip` quand ils sont sur le PATH, chacun dans `facts/tool-<nom>.json` ; un outil absent est signalé, jamais une erreur |

Le même code, lancé sur le même commit de l'application, écrit le même fichier (son horodatage `generated` mis à
part) : `doc-kit facts` peut être committé sans risque avec les pages qu'il alimente. Voir [Exemple · Surface d'API](#/examples/api-surface)
et les autres exemples de l'espace reprise pour `::faits` en situation.

## doc-kit sync

```text
doc-kit sync [--since <réf>] [--apply [--labels]] [--mark <page…> | --mark --all] [--sources <fichier[:lignes]…>]
             [--date AAAA-MM-JJ] [--check] [--estimate]
```

Ce que la documentation doit suivre après un changement de l'application (`app.dir`) : un rapport qui compare
l'application maintenant avec la référence, `sync.json` (`paths.sync`), ou, avec `--since <réf>`, un commit git —
git n'est jamais qu'en lecture. `--mark <page…>` ou `--all` enregistrent, pour chaque page, les fichiers de
l'application dont elle dépend : ses `routes`, ses preuves `fichier:ligne`, les captures qu'elle cite, ses tableaux
`::faits`, son `counterpart` et ses `sources` (un champ de page pour une page sans rien de tout cela). Le rapport
liste ensuite les pages à relire, groupées par priorité (`direct` : un fichier de la page elle-même a changé ;
`shared` : seul un fichier qu'elle importe a changé ; `probablyIntact` : ce fichier partagé a changé, mais rien que
la page cite), les preuves `fichier:ligne` déplacées ou rompues, les libellés dont la valeur a changé
(`sync.labels`, ou les `messages` des adaptateurs `i18n-registry`), les captures devenues périmées, et les éléments
nouveaux ou disparus des adaptateurs de couverture. Il écrit `.doc-kit/sync.md`, `.doc-kit/sync-report.json` et un
`.doc-kit/sync/<page>.diff` par page à relire.

| Option | Effet |
|---|---|
| `--since <réf>` | Compare avec ce commit git plutôt qu'avec `sync.json` ; `new` et `removed` sont toujours vides (les adaptateurs ne sont pas relancés à ce commit) |
| `--apply` | Réécrit la référence `fichier:ligne` d'une preuve déplacée dans la page ; retamponne ensuite les pages inchangées |
| `--labels` | Avec `--apply` : remplace aussi l'ancienne valeur d'un libellé par la nouvelle, uniquement dans `**gras**`, les blocs de code, les badges `[[menu …]]` et les guillemets — jamais dans la prose |
| `--mark <page…>` | Enregistre ces pages comme vérifiées maintenant (les identifiants de page suivent l'option) |
| `--all` | Avec `--mark` : toutes les pages écrites |
| `--sources <fichier[:lignes]…>` | Avec `--mark` d'une seule page : dépendances déclarées, répétable |
| `--date AAAA-MM-JJ` | Date écrite par `--mark`, au lieu d'aujourd'hui (exécutions reproductibles) |
| `--check` | Code de sortie 1 si une catégorie autre que `unchanged` et `unmarked` n'est pas vide : une barrière de CI qu'un projet peut adopter page par page |
| `--estimate` | Le coût de la mise à jour des pages à relire, un agent `doc-kit-writer` par page, selon `llm.prices` |

Sans `app.dir`, code de sortie 2. Une page non encore écrite ne peut pas être marquée (code de sortie 1). Une fois
une page marquée, son pied de page affiche « Vérifiée sur la version {version} le {date} » à la prochaine
construction du site. Voir [Configuration · Le projet](#/reference/configuration/project~suivre-l-application) pour
`sync.labels` et `capture.compareThreshold`, et les [phases](#/skill/phases) du skill pour les agents qui lisent le
rapport de `sync`.

## doc-kit context

```text
doc-kit context <page…> [--budget <jetons>] [--update]
```

Écrit `.doc-kit/context/<page>.md`, un fichier par page (`/` remplacé par `__` dans le nom de fichier) : la seule
lecture dont un agent a besoin pour écrire ou mettre à jour cette page, au lieu de tout l'inventaire du code et de
la table des matières. Il est construit à partir des **dépendances** de la page (les mêmes que calcule
`doc-kit sync` : ses routes, ses preuves `fichier:ligne`, ses captures, ses tableaux `::faits`, son `counterpart` et
ses `sources` déclarées) — les fichiers directs (la route propre de la page) avant les partagés (seulement
importés) : la page elle-même, les sections requises de son gabarit, les fichiers à lire (un fichier de 150 lignes
ou moins en entier ; sinon ±40 lignes autour de chaque ligne citée ; un fichier direct sans ligne citée donne ses
80 premières lignes ; un fichier partagé sans ligne citée est listé par son seul chemin), les libellés exacts et
les lignes de faits que ces fichiers citent, et les termes du glossaire qu'ils correspondent. Une page déclarée
dans la table des matières mais pas encore écrite est acceptée (le contexte sert à l'écrire) ; une page inconnue
est refusée (code de sortie 2).

| Option | Effet |
|---|---|
| `page…` | Un ou plusieurs identifiants de page de `content/toc.json` |
| `--budget <jetons>` | Taille maximale de chaque contexte, estimée en caractères ÷ 4 (16 000 par défaut) ; la page et ses sections requises ne sont jamais coupées — les extraits partagés partent d'abord, puis les extraits les plus éloignés d'une ligne citée, puis les faits, puis les libellés ; chaque coupe laisse une ligne, reprise dans une liste finale |
| `--update` | Inclut aussi l'entrée de la page du dernier rapport `doc-kit sync` (toutes les catégories, avec leurs raisons), le diff de ses fichiers changés, et les chemins des planches avant/après de ses captures (`.doc-kit/compare/<id>.png`, jamais incluses) ; sans rapport encore (`doc-kit sync --mark`), code de sortie 2 |

`--json` donne `[{ page, file, tokens, cut: [{ kind, path?, lines? }] }]`. Un dossier de contexte tient en quelques
milliers de jetons pour une page ordinaire, contre les environ 15 000 jetons de l'inventaire et de la table des
matières qu'un agent lisait en entier auparavant : les briefs d'écriture du skill pointent vers ces fichiers plutôt
que de recopier l'inventaire. Voir les [phases](#/skill/phases) du skill pour la façon dont les agents s'en servent.

## doc-kit optimize

```text
doc-kit optimize [--threshold <Ko>] [--quality <0..1>]
```

| Option | Défaut | Effet |
|---|---|---|
| `--threshold <Ko>` | 200 | Seules les images au-delà de cette taille sont réencodées |
| `--quality <0..1>` | `0.68` | Qualité WebP du nouvel encodage |

La nouvelle image n'est gardée que si elle est au moins 20 % plus légère. L'encodage passe par Chromium, sans
dépendance native.

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : démarrer et capturer](#/reference/cli/start-capture).
- [Commandes : livrer et maintenir](#/reference/cli/deliver).
