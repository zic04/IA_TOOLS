# Règles du kit

*[English version](RULES.md)*

Ces règles s'appliquent à chaque modification et à chaque version. Elles viennent de l'audit du 3 octobre 2026
(AUDIT.md). Chaque problème corrigé alors a sa règle ici et, quand une machine peut le vérifier, un test qui échoue
s'il revient. Une modification qui enfreint une règle doit le justifier par écrit dans sa pull request, et la règle
ou son test est mis à jour dans la même modification.

**Ce qui les fait respecter :**
- `test/unit/security.test.mjs`, lancé par `npm test`, ou seul par `npm run test:security` ;
- `.github/workflows/ci.yml` : tests sous Linux, Windows et macOS, règles de sécurité et `npm audit` ;
- la liste de contrôle de `.github/pull_request_template.md` ;
- les consignes de relecture de `CLAUDE.md`.

## Sécurité

| # | Règle | Vérifiée par |
|---|---|---|
| S1 | **Jamais de shell.** Les processus se lancent avec `spawn`/`spawnSync` et un tableau d'arguments. Jamais `shell: true`, `exec`, `execSync`, `eval` ni `new Function`. Seule exception : `npm install` sans argument venu de l'extérieur, sous Windows. | `security.test.mjs` › règles du code |
| S2 | **git uniquement par `engine/util/safe-git.mjs`.** Utiliser `ctx.exec` (durci par `defaultExec`) ou `safeGitArgs` + `riskyGitConfig` + `resolveOnPath`. Jamais `spawnSync("git", …)` en direct. git reste en lecture : `rev-parse`, `show`, `diff`, `log`, `ls-files`, `check-ignore`. | règles du code, tests git |
| S3 | **Une référence git venue d'un fichier ou d'une option est vérifiée** avec `isSafeRef` et placée après `--end-of-options`. | `sync.test.mjs`, `security.test.mjs` |
| S4 | **Le dossier de l'application n'est pas sûr.** Les binaires sont cherchés dans le `PATH`, jamais dans le dossier lu. Rien de l'application n'est exécuté, importé ni chargé par `require`. Tout nouvel outil externe est décrit dans SECURITY.md, avec ce qu'il exécute. | relecture, SECURITY.md |
| S5 | **Toute expression qui analyse un texte non sûr reste linéaire.** Pas de quantificateurs imbriqués sur des classes qui se recouvrent, comme `(\s*x?\s*)+`. Tout nouveau détecteur, heuristique ou extracteur est ajouté à `test/tools/redos-worker.mjs`, où chaque contrôle doit finir en moins de 300 ms. | test ReDoS |
| S6 | **Captures en lecture seule.** Une requête laissée passer est un `GET`, `HEAD` ou `OPTIONS`. Chaque redirection d'une navigation est vérifiée avant d'être suivie. `capture.forbidden` est testé sur toutes les formes du chemin (`pathForms`). Toute nouvelle façon d'ouvrir une URL (fenêtre, page, action) passe par la garde. | `capture.test.mjs`, e2e `capture.test.mjs` |
| S7 | **Un secret n'est jamais stocké, affiché ni exporté.** `facts` garde les noms et les emplacements, jamais les valeurs. Les rapports montrent au plus un début masqué. Les rapports d'outils sont nettoyés (`--redact`, `scrubGitleaks`). `export` écarte, à toute profondeur, les sessions, les clés, les identifiants et les fichiers d'environnement. | `security.test.mjs` › export, `export.test.mjs` |
| S8 | **Le serveur local ne répond qu'à lui-même.** Il écoute sur `127.0.0.1` et vérifie `Host` (`isLocalHost`). Il n'a aucune route d'écriture et ne sert aucun fichier du disque. | `security.test.mjs` › serveur dev |
| S9 | **Le HTML généré échappe tout ce qu'il tire du contenu ou des données** (`esc`, et `<` échappé dans le JSON en ligne). Le HTML et le SVG bruts du contenu restent sous la responsabilité de l'auteur (SECURITY.md). | tests d'instantanés, relecture |
| S10 | **Chaîne d'approvisionnement.** Les dépendances d'exécution ont une version figée et restent au strict minimum ; toute nouvelle dépendance se justifie dans la PR. L'installation se fait par `npm ci --ignore-scripts`. Les actions CI sont épinglées par SHA. `npm audit --omit=dev --audit-level=high` reste propre. | CI › sécurité |
| S11 | **SECURITY.md dit vrai.** Chaque protection promise a un test, et chaque limite connue y est écrite. | relecture |

## Maintenabilité

| # | Règle |
|---|---|
| M1 | `engine/` n'importe jamais `cli/`, n'appelle jamais `process.exit` et n'écrit jamais dans la console. Les erreurs sont des `KitError`, avec un code de sortie et une clé i18n. |
| M2 | Chaque message existe en anglais et en français (`i18n/en`, `i18n/fr`), et le test de parité passe. |
| M3 | Chaque fonctionnalité ou correction arrive avec son test ; une correction de sécurité arrive avec le test qui l'aurait détectée. On ne saute, ne désactive ni n'affaiblit jamais un test pour passer au vert. |
| M4 | Les tests ne dépendent pas de la machine : pas de vrai réseau, pas de vrai git, pas de Chromium installé dans les tests unitaires. On utilise les points d'injection du contexte (`exec`, `fetch`, `launch`, `commit`, `chromium`). |
| M5 | Une nouvelle fonction reste sous 80 lignes environ, un fichier sous 600 environ ; au-delà, on découpe. On n'ajoute rien à `build()`, `runAudit()` ni `runCaptures()` : on en extrait une étape. |
| M6 | Un seul utilitaire par tâche. Avant d'écrire un analyseur, un lecteur de sommaire ou un appel git, on cherche celui qui existe (`engine/project`, `engine/util`). |
| M7 | Pas de délai magique : un délai ou une attente Playwright est une constante nommée, et attendre une condition vaut mieux qu'une pause fixe. |
| M8 | Les références pointent vers des documents versionnés (ARCHITECTURE.md §, RULES.md), jamais vers un document hors du dépôt. |
| M9 | Chaque modification a son entrée dans le CHANGELOG, sous `[Unreleased]`. Une version incrémente `package.json`, range les entrées sous son numéro et pose le tag `vX.Y.Z`. Les commits sont petits et disent ce qu'ils changent. |
| M10 | Pas de surface morte : un nom n'est exporté que si un autre fichier l'importe (hors points d'entrée publics de `exports` dans `package.json`). Vérifié par `test/unit/exports.test.mjs`. |
| M11 | Le JavaScript est formaté par Prettier (`npm run format`, 120 colonnes) ; `npm run format:check` passe avant chaque commit et dans la CI. Un commit qui ne fait que reformater est listé dans `.git-blame-ignore-revs`. |

## Avant chaque version

1. `npm test`, `npm run test:e2e` et `npm run test:security` passent sous Linux, Windows et macOS (la CI est verte).
2. `npm audit --omit=dev --audit-level=high` est propre, et les mises à jour de dépendances ont été lues, pas seulement acceptées.
3. Dans AUDIT.md, les points corrigés dans cette version ont leur test, et ceux qui restent ouverts y figurent toujours.
4. SECURITY.md correspond au code (protections et limites).
5. Dans le CHANGELOG, `[Unreleased]` est rangé sous le nouveau numéro, avec une section **Security** s'il y a lieu.
6. La version de `package.json` est incrémentée et le tag `vX.Y.Z` est poussé.
