## doc-kit export

```text
doc-kit export <cible> [--with-dist] [--zip]
```

Écrit une copie autonome du projet dans `<cible>`, qui doit être un dossier nouveau ou vide (code de sortie 1 sinon).

| Option | Effet |
|---|---|
| `--with-dist` | Inclut le site construit et le fichier de chaque espace (un avertissement quand il n'est pas construit) |
| `--zip` | Écrit aussi `<cible>.zip` |

La copie contient les fichiers du projet (sans `node_modules/`, `.doc-kit/`, `.git/`, les fichiers `.env`,
`package-lock.json`, les journaux, ni `dist/` sauf avec `--with-dist`), le moteur dans `vendor/doc-kit/`, un
`package.json` qui en dépend, `EXPORT.json`, une section « Copie autonome » dans `README.md`, et la version documentée
figée comme `version.fallback`. Chaque chemin de la configuration qui pointe hors du projet est signalé. Voir
[Exporter et transmettre](#/publish/export).

## doc-kit pack

```text
doc-kit pack [--output <dossier>]
```

Écrit les fichiers dont la prochaine IA qui travaillera sur l'application a besoin, dans le projet de documentation
(par défaut : le dossier du site construit), jamais dans l'application :

| Fichier | Contenu |
|---|---|
| `llms.txt` | Le plan de la documentation ([llmstxt.org](https://llmstxt.org)) : un lien par page, avec son résumé |
| `llms-full.txt` | Toutes les pages en Markdown, dans l'ordre de lecture, sans les commentaires de consigne |
| `AGENTS.md` | L'application d'après les faits : pile technique (telle que `::c4` la voit), les `scripts` de ses `package.json` (lus, jamais exécutés), les **noms** des variables d'environnement, les tables, les routes d'API, les tests, l'outillage, les principaux risques et points chauds, les instructions d'agent déjà présentes. Les listes s'arrêtent après 40 lignes |
| `CLAUDE.md` | `@AGENTS.md` : Claude Code lit `CLAUDE.md`, les autres agents `AGENTS.md` |

Chaque fichier passe par les détecteurs de secrets de `doc-kit check secrets`. Une ligne où l'un d'eux se
déclenche est remplacée par un avis et signalée, et la commande se termine avec le code 1 : corrigez la source (une
page, un fichier de faits) et relancez-la. Relisez `AGENTS.md` avant de le copier dans le dépôt de l'application.

## doc-kit backlog export

```text
doc-kit backlog export <azure|jira|github|gitlab|json> [--output <fichier>] [--all]
```

Écrit le backlog de la documentation — ses epics, ses fiches de fonctionnalité et ses récits utilisateur, avec leurs
critères d'acceptation — au format d'import d'un outil de backlog, à côté du site construit
(`<nom>-backlog-<cible>` ; `--output` nomme le fichier, son extension remplacée). Le kit n'appelle aucun outil et
n'a besoin d'aucun jeton : c'est vous qui importez le fichier.

| Cible | Ce qu'elle écrit | Où l'importer |
|---|---|---|
| `azure` | Un fichier CSV (UTF-8, CRLF) : la hiérarchie par ses colonnes de titre (Title 1 un epic, Title 2 ses fonctionnalités, Title 3 leurs récits), les types du processus du projet (`backlog.azure.process`), la description et les critères d'acceptation en HTML, la version en étiquette. Au plus 1 000 éléments par fichier, chaque epic entier | Azure Boards › Queries › Import work items |
| `jira` | Un fichier CSV : `Work item ID`, `Work type`, `Summary`, `Description` (balisage wiki), `Parent` (un numéro du fichier, ou la clé d'un ticket déjà dans Jira), `Labels`. Par défaut une fonctionnalité est un Epic, un récit une Story, un epic un label (`backlog.jira.types`) | Paramètres de Jira › Système › Import de système externe › CSV |
| `gitlab` | Un fichier CSV : `title`, `description` (Markdown), un ticket par fonctionnalité et par récit | Issues › Import CSV d'un projet |
| `github` | GitHub n'a pas d'import : `…-github.json` (les issues dans l'ordre, avec leur parent) et `…-github.md` (comment les créer avec `gh` et faire de chacune une sous-issue de son parent) | Le CLI de GitHub |
| `json` | Tous les éléments (`schemas/backlog.schema.json`) | Tout autre outil |

- Une **erreur du backlog** (un epic déclaré deux fois, un récit sans id, un id de fonctionnalité utilisé deux
  fois…) refuse l'export : code de sortie 1, rien n'est écrit. Les autres problèmes du build, non.
- **Ce que l'outil contient déjà** — un élément dont la `ref` est de cet outil (`ADO#120`, `PROJ-7`,
  `owner/repo#42`) — est laissé de côté, sauf avec `--all`. Ses enfants le nomment : comme leur parent dans Jira et
  GitHub ; dans leur description dans Azure DevOps et GitLab, à lier après l'import.
- **Sans secret** : chaque texte passe par les détecteurs de secrets de `doc-kit check secrets` ; une ligne où l'un
  d'eux se déclenche est remplacée par un avis et signalée (code de sortie 1, le fichier est écrit).
- **Texte inerte** : une cellule qu'un tableur lirait comme une formule (commençant par `=`, `+`, `-`, `@`)
  commence par une apostrophe ; en Markdown, une mention (`@nom`) ou une référence (`#12`) n'est pas un lien —
  l'import notifierait quelqu'un ou marquerait un autre ticket — et, dans GitLab, une ligne qui commence par `/`
  n'est pas une action rapide.
- Les textes sont dans la langue de la documentation (`--lang` avec `languages`) ; chaque élément renvoie à sa
  page quand `backlog.docUrl` donne l'adresse du site publié.

## doc-kit upgrade

```text
doc-kit upgrade [--apply]
```

Amène un projet à la version installée du kit, même quand sa plage `kit` refuse cette version.

:::etapes
1. Affiche les entrées du `CHANGELOG.md` du kit entre la plage du projet et la version installée.
2. Exécute **en mémoire** les migrations du kit (`engine/migrations/<version>.mjs`) plus récentes que la version de
   base de la plage, et affiche le diff de chaque fichier qu'elles modifient, y compris `kit` porté à
   `^<version installée>`.
3. Avec `--apply`, écrit les modifications : `1 fichier mis à jour ; le projet exige désormais le kit ^0.3.0.`
:::

Sans `--apply`, rien n'est écrit : `Rien n'a été écrit (simulation). Pour appliquer : doc-kit upgrade --apply`. Code
de sortie 1 quand une migration échoue (rien n'est écrit). Voir [Passer à un kit plus récent](#/migrate/upgrade).

## doc-kit skill install

```text
doc-kit skill install [--target <dossier des skills>] [--force]
```

Installe le skill Claude Code du kit dans `<dossier des skills>/doc-kit`, où le dossier des skills est `--target`,
sinon `$CLAUDE_CONFIG_DIR/skills`, sinon `~/.claude/skills`.

| Option | Effet |
|---|---|
| `--target <dossier>` | Un autre dossier de skills |
| `--force` | Remplace un dossier `doc-kit` qui n'a pas été installé par cette commande |

Un fichier d'empreintes permet à `doc-kit doctor` de signaler une copie périmée, modifiée ou étrangère. La commande
n'écrit jamais ailleurs que dans le dossier `doc-kit`. Voir [Installer le skill](#/skill/install).

## doc-kit translate

```text
doc-kit translate status [--lang <l>] [--check]
doc-kit translate --mark <page…> [--lang <l>]
doc-kit translate --mark --all [--lang <l>]
doc-kit translate --fix-anchors [page…] [--lang <l>]
```

L'état des traductions déclarées par `languages` dans `doc.config.mjs` ; sans `languages`, code de sortie 2
(`translate.noLanguages`). Sans le `--lang` global, toutes les langues sauf la source ; `--lang <l>` limite à une
seule et refuse la source elle-même (code de sortie 2, `translate.sourceLang`).

| Forme | Effet |
|---|---|
| `status [--check]` | Liste l'état de chaque fichier traduisible (`current`, `stale`, `unmarked`, `missing`), les décomptes, puis les fichiers qui ne sont pas `current` |
| `--mark <page…>` | Enregistre l'empreinte actuelle de la source de chaque élément dans `translations/<l>/.sources.json` ; un élément est un id de page, ou un chemin relatif à `content/` dès qu'il contient un point (`home.md`, `use/index.md`, `toc.json`, `glossary.json`) |
| `--mark --all` | Marque chaque fichier dont la traduction existe déjà |
| `--fix-anchors [page…]` | Réécrit un lien `#/<cible>~<ancre>` dont l'ancre est un titre de la page cible source mais pas de la page traduite, vers le titre traduit à la même position ; sans `page…`, chaque page et introduction de section |

Codes de sortie : `status` vaut 0, ou 1 avec `--check` quand une langue listée a un fichier `stale` ou
`missing`. `--mark` vaut 1 quand le fichier traduit d'un élément manque (rien n'est écrit pour cette langue,
`translate.missingFile`), 2 sans élément ni `--all` (`translate.markNothing`). `--fix-anchors` vaut 1 quand un
lien n'a pas pu être reporté — signalé, jamais deviné — 0 sinon. Appeler `translate` sans `status`, `--mark` ni
`--fix-anchors` est aussi une erreur d'usage (code de sortie 2, `translate.usage`). Voir
[Documenter en plusieurs langues](#/spaces/languages).

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : démarrer et capturer](#/reference/cli/start-capture).
- [Commandes : rédiger et vérifier](#/reference/cli/write-check).
