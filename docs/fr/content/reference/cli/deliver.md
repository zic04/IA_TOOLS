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

## doc-kit migrate

```text
doc-kit migrate
```

Réécrit au format courant les fichiers anciens à clés françaises d'un projet :

| Fichier ancien | Devient |
|---|---|
| `<content>/sommaire.json` | `<content>/toc.json` |
| `<content>/glossaire.json` | `<content>/glossary.json` |
| `<content>/accueil.md` | `<content>/home.md` (renommé) |
| `<images>/zones/*.json` à clés françaises | les mêmes fichiers, réécrits sur place |

Les noms de dossier sont conservés (déclarez-les dans `paths`) ; les plans de capture sont du JavaScript et ne sont
jamais réécrits ; le Markdown garde ses deux graphies. Rien n'est écrit quand le sommaire normalisé est invalide (code
de sortie 1). Voir [Migrer un projet ancien](#/migrate/legacy-project).

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
