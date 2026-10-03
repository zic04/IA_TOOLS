## En bref

```text
doc-kit [<commande>] [options]
```

Sans commande, `doc-kit` lance le [mode guidé](#/start/guided-mode). `doc-kit --help` liste les commandes,
`doc-kit --help --lang fr` les liste en français, et `doc-kit --version` affiche la version du kit.
`doc-kit <commande> --help`, ou `doc-kit help <commande>`, affiche l'usage d'une commande et chacune de ses options,
dans la langue des messages : `doc-kit init --help` montre `--lang` et `--capture` parmi les autres.

1. **Le projet** est le dossier donné par `--project`, sinon le dossier le plus proche qui contient un
   `doc.config.mjs`, en remontant depuis le dossier courant.
2. **Les messages** sont dans la langue du projet dès la première ligne, `doctor` compris ; `--lang` la change le
   temps d'une exécution. `init`, qui crée un projet ailleurs, parle `--lang`, `DOC_KIT_LANG` ou l'anglais.
3. **Chaque erreur** dit ce qui ne va pas (`✖`), puis ce qu'il faut faire (`→`).
4. **Le code de sortie** dit à un script ce qui s'est passé, de la même façon pour toutes les commandes.

## Dans cette partie

| Sous-page | Commandes |
|---|---|
| [Commandes : démarrer et capturer](#/reference/cli/start-capture) | `init`, `doctor`, `connect`, `probe`, `demo`, `capture`, `inventory` |
| [Commandes : rédiger et vérifier](#/reference/cli/write-check) | `dev`, `new`, `build`, `view`, `open`, `check`, `audit`, `optimize`, `stats` |
| [Commandes : livrer et maintenir](#/reference/cli/deliver) | `export`, `upgrade`, `migrate`, `skill install`, `translate`, `changes` |

## Les options globales

| Option | Effet |
|---|---|
| `--project <dossier>` | Le projet de documentation à traiter, au lieu de chercher `doc.config.mjs` |
| `--json` | Affiche le résultat en JSON sur la sortie standard (pour les commandes qui ont un résultat) |
| `--verbose` | Affiche aussi la correction de chaque avertissement, et la pile d'une erreur interne |
| `--lang en\|fr` | Langue des messages pour cette exécution |
| `--help`, `-h` | La liste des commandes ; après une commande (ou `doc-kit help <commande>`), son usage et ses options |
| `--profile` | Affiche le temps de chaque étape de l'exécution, de la plus longue à la plus courte |
| `--version`, `-v` | La version du kit |

Une option d'une autre commande est refusée : `doc-kit build --tour 2` s'arrête avec
`✖ option invalide : --tour (build)` et le code de sortie 2.

## Les codes de sortie

| Code | Signification | Exemples |
|---|---|---|
| **0** | OK | Le site est construit ; les contrôles passent ; l'audit s'est déroulé (quel que soit le niveau) |
| **1** | Un contrôle a échoué | Une erreur de build, un lien cassé, une route non couverte, un secret, une capture en échec, un dossier cible non vide |
| **2** | Usage ou configuration invalide | Une commande ou une option inconnue, un `doc.config.mjs` invalide, une erreur de plan, aucun projet trouvé |
| **3** | Problème d'environnement | Le kit installé hors de la plage `kit` du projet, Chromium absent, l'application injoignable, la session expirée |

## Les messages

```text
✖ la session a expiré (page de connexion : http://127.0.0.1:4173/login?next=%2Forders)
  → relancez doc-kit connect, puis la capture
```

- `✖` une erreur, `⚠` un avertissement, `✔` une réussite ; des couleurs seulement dans un terminal, et jamais avec
  `NO_COLOR`.
- Les avertissements du build affichent leur correction avec `--verbose`.
- Chaque message vient des textes du kit (clés `cli.*`), en anglais et en français.

## Toutes les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `doc-kit init [dossier-app]` | Crée le projet de documentation d'une application |
| `doc-kit doctor` | Vérifie l'environnement et le projet, avec la correction de chaque problème |
| `doc-kit connect` | Ouvre l'application pour que vous vous connectiez, puis enregistre la session |
| `doc-kit probe` | Vérifie une instance locale ou de démo en cours d'exécution, en lecture seule : en-têtes, cookies, CORS, contrôle d'accès |
| `doc-kit demo` | Lance le script des données de démo (`capture.setup`) |
| `doc-kit capture [motifs…]` | Prend les captures des plans, en lecture seule avec une session |
| `doc-kit inventory` | Liste ce que voient les adaptateurs de couverture |
| `doc-kit dev` | Construit, sert et recharge le site pendant que vous écrivez |
| `doc-kit new <id-page>` | Crée une page depuis un gabarit et la déclare |
| `doc-kit build` | Construit le site (strict par défaut) |
| `doc-kit view <page[~ancre]>` | Fait une capture d'une page du site construit |
| `doc-kit open [page]` | Ouvre le site construit dans le navigateur par défaut |
| `doc-kit check [nom]` | Lance les contrôles |
| `doc-kit audit` | Mesure le niveau de maturité |
| `doc-kit optimize` | Recompresse les captures lourdes |
| `doc-kit stats` | Temps, jetons et modèles par bloc et par version (`usage/`) |
| `doc-kit changes` | Ce qui a changé dans l'application depuis une référence git : routes, tables, variables, dépendances, constats (`--record` : gardé pour `::changes`) |
| `doc-kit hooks install` | Hooks git : faits et sync après chaque pull et changement de branche |
| `doc-kit export <cible>` | Écrit une copie autonome du projet |
| `doc-kit upgrade` | Montre les changements depuis la version du kit du projet, applique les migrations |
| `doc-kit migrate` | Réécrit au format courant les fichiers anciens à clés françaises |
| `doc-kit skill install` | Installe le skill Claude Code |
| `doc-kit translate status \| --mark <page…> \| --mark --all \| --fix-anchors [page…]` | L'état des traductions, ou leur marquage, ou la réécriture de leurs ancres |

## Ajouter une commande

Une commande est un fichier `cli/commands/<nom>.mjs` du kit, trouvé par le répartiteur au démarrage. Il exporte
`options`, au format de `util.parseArgs` de Node, et `run({ ctx, values, positionals })`, qui renvoie un code de
sortie. Les options de toutes les commandes sont réunies dans un seul analyseur : un nom d'option utilisé par deux
commandes doit avoir le même type dans les deux. Ses messages vont dans `i18n/en.json` et `i18n/fr.json` (ou dans un
fragment de `i18n/<langue>/`), sous `cli.*`.

## Pièges et écarts constatés

> [!ATTENTION] Les ids de page dans Git Bash
> Git Bash change un argument qui commence par `/` en chemin Windows. Écrivez `doc-kit view utiliser/commandes`, et
> non `doc-kit view /utiliser/commandes`.

## Pour aller plus loin

- [Le mode guidé](#/start/guided-mode) : `doc-kit` sans commande.
- [Les variables d'environnement](#/reference/environment) : ce qui se règle sans option.
- [La configuration](#/reference/configuration) : ce que les options remplacent.
