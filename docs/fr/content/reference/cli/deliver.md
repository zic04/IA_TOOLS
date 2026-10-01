## doc-kit export

```text
doc-kit export <cible> [--with-dist] [--zip]
```

Écrit une copie autonome du projet dans `<cible>`, qui doit être un dossier nouveau ou vide (code de sortie 1 sinon).

| Option | Effet |
|---|---|
| `--with-dist` | Inclut le site construit (un avertissement quand il n'est pas construit) |
| `--zip` | Écrit aussi `<cible>.zip` |

La copie contient les fichiers du projet (sans `node_modules/`, `.doc-kit/`, `.git/`, les fichiers `.env`,
`package-lock.json`, les journaux, ni `dist/` sauf avec `--with-dist`), le moteur dans `vendor/doc-kit/`, un
`package.json` qui en dépend, `EXPORT.json`, une section « Copie autonome » dans `README.md`, et la version documentée
figée comme `version.fallback`. Chaque chemin de la configuration qui pointe hors du projet est signalé. Voir
[Exporter et transmettre](#/publish/export).

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
3. Avec `--apply`, écrit les modifications : `1 fichier mis à jour ; le projet exige désormais le kit ^0.1.0.`
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

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : démarrer et capturer](#/reference/cli/start-capture).
- [Commandes : rédiger et vérifier](#/reference/cli/write-check).
