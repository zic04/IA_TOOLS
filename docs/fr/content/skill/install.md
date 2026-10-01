## L'objectif

Installez le **skill doc-kit** pour Claude Code, afin que Claude puisse construire ou maintenir un site de
documentation selon le standard : il connaît la méthode, les commandes et les règles de sécurité, et il pilote des
agents en parallèle avec des briefs tout prêts. Une fois le skill installé, demandez à Claude de « documenter cette
application » dans un dépôt : le skill commence par les questions de cadrage.

> [!RECETTE] Ce qu'il vous faut
> - Le kit installé, et `doc-kit doctor` sans ✖ ([Installer doc-kit](#/start/install)).
> - Claude Code sur la même machine.
> - Le droit d'écrire dans le dossier des skills de Claude Code (par défaut `~/.claude/skills`).

## Qui fait quoi

| Étape | Qui | Résultat |
|---|---|---|
| 1. Installer | Vous, une fois par machine et par version du kit | `~/.claude/skills/doc-kit/` |
| 2. Charger | Claude Code, au début d'une session | Le skill est disponible |
| 3. Le tenir à jour | `doc-kit doctor`, après chaque mise à jour du kit | ⚠ quand la copie est périmée |

## Étape 1 — Installer le skill

```bash
doc-kit skill install
```

```text
✔ skill Claude Code installé dans ~/.claude/skills/doc-kit (26 fichiers, kit /opt/doc-kit)
  Ouvrez une nouvelle session Claude Code pour le charger.
```

La commande copie le dossier `skill/doc-kit/` du kit dans `<dossier des skills>/doc-kit`, et remplace `{{KIT_PATH}}`
par le chemin absolu du kit dans `SKILL.md`, `references/*.md` et `scripts/*.mjs` : le skill sait où se trouvent le
kit, son standard et ses gabarits. Le dossier des skills est `--target`, sinon `$CLAUDE_CONFIG_DIR/skills`, sinon
`~/.claude/skills`.

## Étape 2 — Le charger dans Claude Code

Ouvrez une nouvelle session Claude Code. Le skill se déclenche dès que vous demandez un travail de documentation :
documenter une application, un manuel utilisateur, un guide d'administration, un guide de passation, des captures
annotées, un dossier d'architecture, des parcours de bout en bout, un diagnostic, des points d'attention, ou la mise
à jour d'un site existant, même sans nommer le kit.

## Étape 3 — Le tenir à jour

`doc-kit doctor` compare la copie installée au kit grâce à un fichier d'empreinte, `.doc-kit-skill.json` :

| État | `doctor` dit | Correction |
|---|---|---|
| À jour | ✔ skill Claude Code à jour | — |
| Absent | ⚠ skill Claude Code non installé (facultatif) | `doc-kit skill install` |
| Périmé | ⚠ le skill Claude Code installé (kit 0.1.0) est plus ancien que celui du kit | `doc-kit skill install` |
| Modifié | ⚠ le skill Claude Code installé a été modifié après son installation | `doc-kit skill install` le rétablit |
| Autre kit | ⚠ le skill Claude Code installé pointe vers un autre kit | `doc-kit skill install`, depuis le kit que vous utilisez |
| Étranger | ⚠ … existe mais n'a pas été installé par doc-kit skill install | `doc-kit skill install --force` le remplace |

## Comment savoir que ça marche

- **Fichiers** : `~/.claude/skills/doc-kit/SKILL.md` existe et mentionne le chemin de votre kit.
- **Doctor** : `doc-kit doctor` affiche ✔ pour le skill.
- **Claude Code** : dans une nouvelle session, la question « quels skills avez-vous ? » fait apparaître `doc-kit`.
- **Scripts** : `node ~/.claude/skills/doc-kit/scripts/brief.mjs --list` liste les modèles de briefs.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « … existe déjà et n'a pas été installé par cette commande » | Un dossier de skill `doc-kit` copié à la main | `--force`, après avoir vérifié que vous n'en avez pas besoin |
| « le skill du kit est introuvable » | Une copie exportée du moteur (elle n'a pas de dossier `skill/`) | Installez depuis le dépôt du kit |
| Claude n'utilise pas le skill | La session a été ouverte avant l'installation | Ouvrez une nouvelle session |

## Pièges et limites à connaître

> [!ATTENTION] Les modifications sont remplacées
> `doc-kit skill install` remplace tout le dossier `doc-kit`. Gardez les règles propres au projet dans le
> `WRITING-GUIDE.md` du projet, que le skill lit, plutôt que dans le skill installé.

> [!NOTE] Un kit par skill
> Le skill installé pointe vers un seul dossier de kit. Déplacer le kit, ou utiliser une autre copie, demande une
> nouvelle installation ; `doctor` le signale.

## Droits requis

> [!DROITS] Ce dont le skill a besoin
> - **Installation** : le droit d'écrire dans le dossier des skills ; rien d'autre n'est écrit.
> - **Au travail** : les droits que vous donnez à Claude Code dans le dépôt. Le skill ne fait jamais de commit et ne
>   lance jamais de commande git destructive ; pour les captures de production, c'est **vous** qui vous connectez
>   (`doc-kit connect`), jamais l'agent.
