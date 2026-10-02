## En bref

Le kit lit quelques variables d'environnement. Aucune n'est obligatoire : elles adaptent une exécution, un poste ou
un pipeline sans modifier `doc.config.mjs`.

- **Cinq variables de projet** existent sous deux formes : `DOC_KIT_<NOM>`, pour tout projet, et `<PREFIXE>_<NOM>`,
  pour un projet (`env.prefix`, par défaut le slug du produit en majuscules). `DOC_KIT_*` l'emporte. Une valeur vide
  compte comme absente.
- **Quatre variables changent le comportement du kit lui-même** : `DOC_KIT_LANG`, `DOC_KIT_NO_OPEN`,
  `DOC_KIT_NO_BROWSER` et `CLAUDE_CONFIG_DIR`.
- Une option de la ligne de commande l'emporte toujours sur une variable, et une variable sur le fichier de
  configuration.

> [!NOTE] Les sources de cette page
> - **Code du kit** : `engine/project/env.mjs` (les variables associées à des clés), `engine/capture/session.mjs`
>   (la session), `cli/common.mjs` (langue et couleurs), `cli/commands/*.mjs`.
> - Version vérifiée : la version du kit affichée dans la barre du haut de ce site.

## Les variables, une par une

### Variables de projet (5)

| Variable | Fixe | Valeurs | Exemple |
|---|---|---|---|
| `DOC_KIT_URL`, `<PREFIXE>_URL` | `app.url` | Une URL ; les barres obliques finales sont retirées | `ACME_URL=https://staging.example.org` |
| `DOC_KIT_PLANS`, `<PREFIXE>_PLANS` | `capture.plans` | Un dossier, relatif au projet | `ACME_PLANS=captures/plans-prod` |
| `DOC_KIT_READONLY`, `<PREFIXE>_READONLY` | `capture.readOnly` | `1`, `true`, `yes`, `oui` · `0`, `false`, `no`, `non` · `auto` | `ACME_READONLY=1` |
| `DOC_KIT_VERSION`, `<PREFIXE>_VERSION` | `version.fallback` | Une version | `ACME_VERSION=2.4.0` |
| `DOC_KIT_SESSION`, `<PREFIXE>_SESSION` | Le fichier de session | Un chemin, relatif au projet | `ACME_SESSION=.doc-kit/prod.json` |

### Comportement du kit (4)

| Variable | Lue par | Effet |
|---|---|---|
| `DOC_KIT_LANG` | Toutes les commandes | Langue des messages (`en` ou `fr`) hors d'un projet ; dans un projet, la `language` du projet l'emporte, et `--lang` l'emporte sur les deux |
| `DOC_KIT_NO_OPEN` | `dev`, `open` | N'importe quelle valeur : le navigateur n'est pas ouvert ; l'adresse est affichée |
| `DOC_KIT_NO_BROWSER` | `audit` | `1`, `true` ou `yes` : la largeur des tableaux n'est pas mesurée (aucun Chromium lancé) |
| `CLAUDE_CONFIG_DIR` | `skill install`, `doctor` | Le skill va dans `<CLAUDE_CONFIG_DIR>/skills/doc-kit` au lieu de `~/.claude/skills/doc-kit` |

### Lues dans le système (7)

| Variable | Lue par | Effet |
|---|---|---|
| `NO_COLOR`, `TERM=dumb` | Toutes les commandes | Pas de couleurs dans le terminal (il n'y en a pas non plus quand la sortie n'est pas un terminal) |
| `LANG`, `LC_ALL`, `LC_MESSAGES` | `init` | Une valeur qui commence par `fr` fait du français la langue proposée pour le site |
| `HOME`, `USERPROFILE` | `skill install` | Le dossier personnel qui contient `.claude/skills` |

### Posées par le kit pour le script de démo (3)

`doc-kit demo` lance `capture.setup` avec `DOC_KIT_PROJECT` (le dossier du projet), `DOC_KIT_URL` (`app.url`) et
`DOC_KIT_CONFIG` (la configuration, en JSON) dans son environnement, pour qu'un script qui n'exporte aucune fonction
puisse quand même les lire.

## Absentes ou sans effet

| Variable | Situation | Conséquence |
|---|---|---|
| `<PREFIXE>_READONLY` | Une valeur hors de la liste (`maybe`) | Code de sortie 2 : `ACME_READONLY : valeur « maybe » non reconnue` |
| `<PREFIXE>_READONLY` | `0` alors que `capture.target` vaut `"production"` | Code de sortie 2 : la production ne se capture qu'en lecture seule |
| `<PREFIXE>_URL` | Définie, mais `--url` donné à `connect` | L'option l'emporte |
| `<PREFIXE>_SESSION` | Désigne un fichier qui n'existe pas | `capture` s'arrête : `pas de session : …` (code de sortie 3) |
| `DOC_KIT_LANG` | Définie dans un projet | Sans effet : la `language` du projet l'emporte ; utilisez `--lang` |
| `DOC_KIT_FORBIDDEN_TERMS` | En dehors des tests du kit | Sans effet : elle ne sert qu'au test de neutralité du kit |

## À vérifier

:::etapes
1. **Dans un pipeline** : pas de `<PREFIXE>_SESSION` ni d'adresse d'application ; un pipeline construit et
   contrôle, il ne capture jamais.
2. **Sur un poste avec plusieurs environnements** : un fichier de session par environnement (`<PREFIXE>_SESSION`), et
   `<PREFIXE>_URL` défini dans le même terminal que la capture.
3. **Avant une exécution en production** : `capture.target` vaut `"production"`, donc `doc-kit capture` affiche le
   bandeau production et demande avant de commencer ; sa ligne suivante indique `lecture seule : activée`.
:::
