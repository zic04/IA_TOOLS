# Audit de doc-kit — maintenabilité, sécurité, fonctionnalités manquantes

*Audit du 3 octobre 2026, branche `dev/cap-0.2`, commit `d7c327a`. Lecture du code sans modification ; seuls les
tests du kit et une mesure de l'expression régulière S1 ont été exécutés.*

**Objectif retenu.** Reprendre une application « vibe codée », c'est-à-dire écrite vite avec une IA et souvent sans
documentation. Il faut en tirer une vue d'ensemble côté utilisateur (écrans, parcours, règles métier) et côté
développeur (architecture, API, base, dépendances, sécurité, dette), puis **régénérer la documentation à chaque
mise à jour ou build** de l'application.

---

## 1. Synthèse

| Axe | Note | En une phrase |
|---|---|---|
| Architecture | Bonne | Couches nettes (cli → engine → adapters), erreurs uniformes (`KitError`), contrat écrit (ARCHITECTURE.md). |
| Maintenabilité | Moyenne | Aucun lint, aucun formatage, aucun contrôle de types, aucune CI active sur le dépôt ; quelques fonctions géantes. |
| Tests | Bonne | 683 tests ; 11 échecs et 4 annulations, tous dus à l'environnement (version de Chromium), mais ils montrent que certains tests dépendent de la machine. |
| Sécurité | Moyenne | Bonnes bases (pas de shell, binding 127.0.0.1, échappement HTML) ; 1 blocage par regex confirmé, 2 contournements du « lecture seule », 1 injection d'option git. |
| Couverture de l'objectif « reprise » | Partielle | Bon socle (`facts`, `sync`, `probe`) ; il manque les diagrammes, l'historique git, les vulnérabilités intégrées et d'autres frameworks. |
| Mise à jour à chaque build | Insuffisante | `sync --check` existe, mais aucune recette CI ne se déclenche sur le code de l'application, et rien ne produit de « ce qui a changé » publié. |

**Les 5 actions les plus rentables :**

1. Corriger la regex `privateKey` qui peut bloquer le kit (S1, une ligne).
2. Activer la CI du dépôt (`.github/workflows/ci.yml`) et ajouter `tsc --noEmit` en `checkJs`, plus prettier.
3. Fermer les deux contournements de la lecture seule : redirections vers des routes interdites (S2), refs git non
   validées (S4).
4. Livrer une recette CI « à chaque build » : `facts` → `sync --check` → page « Nouveautés » → commentaire de PR
   (§ 5).
5. Ajouter au dossier de reprise un graphe de modules, un schéma entité-relation (ERD), les points chauds git et
   les vulnérabilités (§ 4).

### Suivi des corrections

| Point | Statut | Test qui l'empêche de revenir |
|---|---|---|
| S1 ReDoS `privateKey` | **Corrigé** | `security.test.mjs` › ReDoS (dans un worker, 300 ms par contrôle) |
| S2 Redirection vers une route interdite | **Corrigé** | `capture.test.mjs` › redirection serveur ; e2e `capture.test.mjs` |
| S3 Dépôt git non fiable | **Corrigé** (git durci, refusé sur une configuration à risque, binaires pris dans le `PATH`) ; limite écrite pour `knip` | `security.test.mjs` › git |
| S4 Injection d'option git | **Corrigé** | `sync.test.mjs`, `security.test.mjs` |
| S5 `export` et fichiers secrets | **Corrigé** | `security.test.mjs` › export |
| S7 DNS rebinding sur `dev` | **Corrigé** | `security.test.mjs` › serveur dev |
| S8 Formes du chemin (`%2F`, `//`) | **Corrigé** (la casse reste une limite écrite dans SECURITY.md) | `capture.test.mjs` |
| S12 `--redact` pour gitleaks | **Corrigé** | — |
| S14 Actions épinglées, `--ignore-scripts` | **Corrigé** | CI |
| M1 CI du dépôt | **Corrigé** : `.github/workflows/ci.yml` | — |
| § 4 : graphe des modules et cycles, historique git (fichiers à risque, propriétaires, bus factor), schéma entité-relation | **Fait** (`facts --source modules`, `--source history`, `::erd`) | `overview.test.mjs` |
| § 5 : « ce qui a changé » entre deux versions (`doc-kit changes`), historique par version dans le site (`--record`, `::changes`), recette CI à chaque build avec commentaire de PR, hooks git locaux (`doc-kit hooks install`) | **Fait** | `changes.test.mjs`, `hooks.test.mjs` |
| M4 Utilitaires dupliqués | **Corrigé** : un seul lecteur de sommaire (`engine/project/toc.mjs`, `safeToc` lit désormais le sommaire hérité) et un seul analyseur d'accolades JS (`engine/util/js-scan.mjs`), qui corrige `init` (commentaire bloc) et `export` (gabarit imbriqué) | `legacy.test.mjs` › lecteur unique ; `js-scan.test.mjs` ; ReDoS |
| M7 Tests liés à la machine | **Corrigé** : la détection de Chromium passe par `ctx.chromium` (seam), `doctor` et le mode guidé ne dépendent plus du navigateur installé | `doctor.test.mjs` › Chromium manquant |
| M9 Code mort | **Corrigé** : les cas cités sont supprimés, et 109 exports que rien n'importait sont redevenus internes (aucun n'était du code mort). Au lieu de knip, qui ajouterait des dizaines de dépendances à un kit qui n'en a que deux, une règle (RULES.md M10) et son test bloquent tout nouvel export inutile | `exports.test.mjs` |
| M10 Références « cadrage » | **Corrigé** : elles pointent vers ARCHITECTURE.md | — |
| M11 Délais en dur | **Corrigé** : `engine/capture/timings.mjs` ; `view` et `check tables` attendent une condition (page stable, carte de la visite visible) au lieu d'un délai fixe | e2e `site.test.mjs` › `view --tour` |
| M3 Fonctions géantes | **Corrigé** pour `build()` : 532 lignes → 51, en étapes nommées (`build-context.mjs`, `render-language.mjs`) ; aucune fonction du build au-delà de 73 lignes. Sortie identique octet pour octet sur 86 cas (fixtures, démo, projets cassés × brouillon, langues, espaces). `runAudit()` aussi : 239 lignes → 59 (`collectPages`, `readPage`, `measureIndicators`, `criteriaOf`, `spaceLevels`), les actions dans `engine/audit/actions.mjs` (un gestionnaire par critère au lieu d'un `switch` de 94 lignes) et les seuils dans `thresholds.mjs`, sortie identique sur 33 audits. `runCaptures()` enfin : ~330 lignes → 86 (dont 25 de paramètres), une capture dans `engine/capture/take.mjs` (`openRoute`, `playEntry`, `measureEntry`, `writeEntry`, `compareAndWrite`), la file de travail dans `runWorkers` ; images, fichiers de zones et rapports identiques sur la démo (capture, `--compare`, `--verify`, échec de zone, requête bloquée) | tests existants (unitaires, snapshot, e2e) |
| M2 Lint, formatage, types | **Corrigé** : formatage fait (Prettier épinglé, 120 colonnes, vérifié en CI, règle RULES.md M11, commit ignoré par `git blame`) ; ESLint fait (règles recommandées, 18 problèmes corrigés, tailles de M5 en avertissements plafonnés à 57, règle M12). contrôle des types fait (TypeScript 6 sur la JSDoc, mode non strict : 162 écarts JSDoc/code corrigés, aucun bug, règle M13). Le mode strict (≈2 700 paramètres sans type déclaré) reste une étape possible | CI › `format:check` |
| M5 i18n du skill | **Corrigé** : les messages des scripts du skill sont dans `skill/doc-kit/i18n/{en,fr}.json` (une section commune, une par script), installés avec le skill ; `consolidation.mjs`, qui n'écrivait qu'en anglais, est traduit (33 messages) | `skill.test.mjs` › parité, clés utilisées, sortie en français |
| S6, S9 à S11, S13 ; M6, M8, M12 à M14 | Ouverts | — |

Les règles qui empêchent ces problèmes de revenir sont dans [RULES.fr.md](RULES.fr.md) ([RULES.md](RULES.md) en
anglais).

---

## 2. Maintenabilité

### Chiffres

- Code : engine 12 633 lignes, cli 4 586, skill 1 624, adapters 378. Tests : 13 353 lignes, 683 tests.
- Plus gros fichiers : `engine/site/app.js` (1 252), `cli/commands/init.mjs` (723), `engine/audit/audit.mjs` (633),
  `engine/build/build.mjs` (621).
- Plus longues fonctions : `build()` `engine/build/build.mjs:97` (**525 lignes**), `createMarkdownEngine`
  `engine/build/markdown.mjs:111` (295), `runAudit` `engine/audit/audit.mjs:149` (239), `runCaptures`
  `engine/capture/capture.mjs:218` (227 lignes, une vingtaine de paramètres).

### Points forts

- Couches respectées : `engine` n'importe jamais `cli`, ne fait ni `process.exit` ni `console`.
- i18n strictement à parité : 1 378 clés en anglais comme en français, testées.
- Schémas JSON validés à l'exécution (`engine/project/validate.mjs`).
- Deux dépendances seulement, versions figées, lockfile présent.
- CHANGELOG, CONTRIBUTING, SECURITY et migrations de projet présents.

### Problèmes, par impact

| # | Problème | Où | Recommandation |
|---|---|---|---|
| M1 | **Aucune CI active sur le kit** : le workflow n'existe que comme modèle à copier. | `ci/github-actions.yml:1-3`, pas de `.github/` | Créer `.github/workflows/ci.yml` (unit, snapshot et e2e, matrice OS × Node 20/22). |
| M2 | **Ni lint, ni formatage, ni types** ; 425 balises JSDoc que rien ne vérifie ; des lignes de plus de 160 caractères. | tout le dépôt | `jsconfig.json` + `checkJs` + `tsc --noEmit` en CI ; prettier (`printWidth` 120) ; eslint minimal (`complexity`, `max-lines-per-function` en avertissement). |
| M3 | Fonctions géantes qui mélangent orchestration et logique. | voir les chiffres | Découper `build()` en étapes : sommaire → contenu → captures → rendu → espaces → assemblage. Regrouper les options de `runCaptures` en objets. |
| M4 | Petits utilitaires dupliqués dont le comportement diverge : 3 analyseurs d'accolades JS, 4 lecteurs de sommaire. `safeToc` ignore le sommaire hérité, ce qui est un bug latent. | `cli/commands/init.mjs:126`, `export.mjs:37`, `facts/quality.mjs:112` ; `cli/doc-kit.mjs:178`, `audit.mjs:99`, `context.mjs:36`, `translate.mjs:22` | Un seul `engine/project/toc.mjs` et un seul `engine/util/js-scan.mjs`. |
| M5 | Second système d'i18n caché dans les scripts du skill (~70 clés hors parité). | `skill/doc-kit/scripts/brief.mjs:64-106`, `common.mjs` | Déplacer vers `skill/doc-kit/i18n/{en,fr}.json` et étendre le test de parité. |
| M6 | Clés françaises dans le contrat de données du site (`titre`, `ordre`, `etapes`, `libelle`…). | `engine/site/app.js:9-13`, `engine/build/*` | Renommer en une seule fois, sous la protection des snapshots. |
| M7 | **Tests qui dépendent de la machine** : `doctor`, `guided mode` et `session-refresh` échouent si Chromium n'est pas dans la version attendue. | `test/unit/doctor*`, `session-refresh.test.mjs` | Injecter la détection de Chromium (un « seam » comme pour git) ; sauter proprement les tests qui lancent un navigateur. |
| M8 | Modules sans test direct. | `engine/build/text.mjs` (`esc`, `slug`, utilisés par 8 modules), `format.mjs`, `check/tables.mjs`, `cli/commands/optimize.mjs` | Tests unitaires d'échappement et d'`optimize`. |
| M9 | Code mort et sur-exporté : ~95 exports jamais importés ailleurs. | `languages.mjs:307` `closestLanguage`, `coverage.mjs:166`, `common.mjs:15,68` | Supprimer ; ajouter knip en CI. |
| M10 | Références à un document « cadrage § » absent du dépôt. | `context/budget.mjs:10`, `prefill.mjs:1,26`, `sync/proofs.mjs:1` | Pointer vers ARCHITECTURE.md ou versionner le document. |
| M11 | Délais Playwright et `waitForTimeout(350/500/900)` en dur, éparpillés. | `capture/actions.mjs`, `capture.mjs`, `session.mjs`, `view.mjs`, `check/tables.mjs` | Un module `capture/timings.mjs` avec un multiplicateur pour machines lentes ; attendre une condition plutôt qu'un délai fixe. |
| M12 | Version en retard : `[Unreleased]` fait 320 lignes, `package.json` dit toujours 0.1.0, aucun tag, et seulement 4 très gros commits. | `CHANGELOG.md:7-326` | Publier une 0.2.0 et la taguer ; faire des commits plus petits au format Conventional Commits, ce qui sert aussi `upgrade`. |
| M13 | Cycle entre dossiers : build → sync/check → build. | `engine/build`, `engine/sync`, `engine/check` | Sortir `hash.mjs`, `page-templates.mjs` et `text.mjs` dans `engine/core/`. |
| M14 | ~39 `catch { return null }` dans `facts` et `probe` : un fait manquant ne se distingue pas d'un fait vide. | `engine/facts/*`, `engine/review/probe.mjs` | Renvoyer `{ available: false, reason }`. |

---

## 3. Sécurité

Le modèle de menace de `SECURITY.md` est sérieux et honnête sur ses limites. L'audit vérifie que le code le tient.

### Ce qui est bien fait

- Les processus enfants sont lancés uniquement avec `spawnSync` et un tableau d'arguments, jamais avec `shell: true`.
- Le serveur `dev` écoute sur 127.0.0.1, ne sert aucun fichier statique et n'expose aucune route d'écriture.
- Le zip ne fait qu'écrire, donc pas de zip-slip ; les liens symboliques sont ignorés.
- Le site échappe tout ce qu'il affiche (recherche, glossaire, page introuvable), et le JSON injecté échappe `<`.
- `facts` ne stocke jamais la valeur d'un secret ni d'une variable.
- Pendant une capture, les requêtes autres que GET, HEAD et OPTIONS sont bloquées dans le navigateur, et les service
  workers aussi.

### Problèmes, par gravité

| # | Gravité | Problème | Où | Correction |
|---|---|---|---|---|
| S1 | **Haute, confirmée** | **ReDoS** : l'expression `privateKey` est exponentielle. Une ligne `BEGIN PRIVATE KEY` suivie de lignes d'espaces sans `END` prend 16 ms pour 16 lignes, 310 ms pour 18, plusieurs secondes pour 20 et plus d'une minute pour 24. Un seul fichier de l'application suffit à bloquer `facts` et `check secrets`, y compris en CI. | `engine/check/secrets.mjs:101` | Supprimer le second `[ \t]*`, ou lire le bloc PEM ligne par ligne. Ajouter un test borné dans le temps. |
| S2 | **Haute** | `capture.forbidden` est contournable par une redirection serveur : Playwright n'intercepte que la première URL de la chaîne, donc un 302 vers une route interdite qui écrit sur un simple GET est suivi. L'arrêt arrive après l'écriture. | `engine/capture/capture.mjs:99-106, 288, 356` | Pour les navigations, `route.fetch({ maxRedirects: 0 })`, puis vérifier le `Location` avant `route.fulfill`. |
| S3 | Haute (hypothèse) | Une application reprise est un dépôt **non fiable**. Un `.git/config` piégé (`core.fsmonitor`, `diff.external`, textconv) exécute du code dès `git diff` ou `git ls-files`. Sous Windows, un `git.exe` posé dans le dossier de l'application passe avant le PATH. | `cli/common.mjs:26`, `engine/facts/common.mjs:59`, `engine/sync/git.mjs:21`, `engine/facts/tools.mjs:47` | `git -C <dir>` lancé depuis un dossier neutre, avec `-c core.fsmonitor= -c core.hooksPath=/dev/null --no-ext-diff --no-textconv` ; binaires résolus en chemins absolus. Documenter ce risque dans SECURITY.md. |
| S4 | Moyenne, confirmée | **Injection d'option git** : `sync.json` (`app.commit`) et `--since` sont passés tels quels à `git diff` et `git show`. Une valeur comme `--output=~/.bashrc` écrit un fichier n'importe où. | `schemas/sync.schema.json`, `cli/commands/sync.mjs:159`, `engine/sync/git.mjs:32-45` | Valider `^[0-9a-f]{7,40}$` ou `git rev-parse --verify`, et insérer `--end-of-options`. |
| S5 | Moyenne, confirmée | `export` peut zipper le fichier de session s'il est placé ailleurs (via `DOC_KIT_SESSION`), un `.doc-kit/` dans un sous-dossier, et les fichiers `.envrc`, `*.pem` ou `.npmrc`. | `cli/commands/export.mjs:246,251` | Toujours exclure `sessionFile()` et tout `.doc-kit/` à n'importe quelle profondeur ; tester `isStorageState` ; lancer `check secrets` avant le zip. |
| S6 | Moyenne | Le masquage ne voit pas le shadow DOM, les iframes, `aria-label`, `alt`, le texte coupé entre plusieurs nœuds, ni le CSS `content`. | `engine/capture/masking.mjs:95-111` | Parcourir les `shadowRoot` et `page.frames()`, élargir les attributs masqués. |
| S7 | Moyenne | Le serveur `dev` ne vérifie pas l'en-tête `Host` : un site malveillant peut lire le brouillon et ses vraies captures par **DNS rebinding**. | `engine/dev/server.mjs:142` | N'accepter que `127.0.0.1:<port>` et `localhost:<port>`. |
| S8 | Moyenne | La comparaison des routes interdites se fait sur le `pathname` brut : `%2F`, la casse (IIS) et `//` passent. Une API sur un autre sous-domaine n'est pas protégée. | `capture.mjs:99`, `plans.mjs:219,228` | Normaliser le chemin, proposer une option insensible à la casse, accepter des origines complètes. |
| S9 | Basse | Aucune CSP dans le site généré, alors que le HTML et le SVG du contenu ne sont pas nettoyés. | `engine/site/template.html` | `<meta>` CSP : `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-…'; connect-src 'none'`. |
| S10 | Basse | Fichier de session : `chmod 600` est appliqué après l'écriture, il est sans effet sous Windows, et aucun `.gitignore` n'est écrit hors de `.doc-kit/`. | `engine/capture/session.mjs:131-140` | Créer le fichier en 0600 dès le départ ; `icacls` sous Windows, ou un avertissement. |
| S11 | Basse | `check secrets` retire les balises du site construit : les secrets placés dans `href`, `alt` ou `data-*` ne sont pas lus. Le dossier des traductions n'est pas analysé. | `engine/check/secrets.mjs:167-178` | Analyser aussi les attributs et `paths.translations`. |
| S12 | Basse | Les rapports d'outils externes ne sont qu'en partie nettoyés : `--redact` n'est pas passé à gitleaks, et `extra.lines` reste dans le rapport semgrep. | `engine/facts/tools.mjs` | Passer `--redact` et retirer `extra.lines`. |
| S13 | Basse | `facts --network` envoie les noms de paquets privés à npm et PyPI ; `probe` ignore `forbidden` et accepte n'importe quelle URL en mode `demo`. | `engine/facts/network.mjs`, `engine/review/probe.mjs:26-30` | Ignorer les paquets à portée privée ; faire respecter `forbidden` par `probe`. |
| S14 | Basse | Les modèles CI épinglent les actions par tag (`@v4`) plutôt que par SHA ; `npm install` y tourne sans `--ignore-scripts`. | `ci/*.yml` | Épingler par SHA ; `npm ci --ignore-scripts`. |

---

## 4. Ce que le kit fait déjà pour une reprise

| Côté | Ce qui existe | Commandes |
|---|---|---|
| Utilisateur | Captures annotées en lecture seule, visites guidées, 30 gabarits (fiche fonctionnalité, règles métier, matrice des rôles, processus, notes de version…), inventaire des routes regroupées en fonctionnalités. | `init`, `connect`, `capture`, `new`, `inventory --features`, `build`, `dev` |
| Développeur | Extraction statique : API (Next.js, FastAPI, Express), base (Prisma, SQLAlchemy, SQL), dépendances, variables d'environnement, secrets, OWASP, qualité (complexité, duplication, notes A–E), tests, fichiers d'agents. Outils externes facultatifs : gitleaks, osv-scanner, syft, knip, semgrep. Sonde HTTP en lecture seule. | `facts [--tools --network]`, `probe`, `new --prefill` |
| Mise à jour | Empreinte SHA-256 de chaque page et de ses dépendances (routes, preuves `file:line`, imports, appels d'API) ; rapport des écarts ; correction automatique des preuves et des libellés ; recapture des seules captures périmées ; échec en CI si la doc dérive. | `sync`, `sync --apply --labels`, `sync --check`, `capture --stale --compare`, `context --update` |
| IA | Skill Claude Code avec 17 consignes et trois agents (tri, rédaction, relecture). | `skill install` |

### Ce qu'il manque (absence vérifiée dans le code)

**Vue d'ensemble pour le développeur**

| Manque | Pourquoi c'est important pour du code vibe codé | Piste |
|---|---|---|
| **Graphe des modules et cycles d'import** | Le graphe d'imports existe déjà (`engine/sync/imports.mjs`) mais ne sert qu'à `sync`. | Générer un Mermaid (ou utiliser dependency-cruiser), plus la liste des cycles et des fichiers orphelins. |
| **Schéma entité-relation (ERD)** | Les tables sont extraites dans `facts/db.json`, mais le schéma de la page « modèle de données » se dessine à la main. | `erDiagram` Mermaid généré depuis `db.json`. |
| **Vue C4 du système** (contexte et conteneurs) | Montrer d'un coup d'œil la base, les API externes et les services. | Assembler `env`, `api`, `db` et `dependencies` en un diagramme C4 de niveaux 1 et 2. |
| **Historique git** : points chauds (complexité × fréquence de modification), propriété du code, « bus factor » | C'est le premier indicateur de risque d'une reprise ; `git log` ne sert aujourd'hui qu'aux traductions. | `facts history` : `git log --numstat`, croisé avec `quality.json`. |
| **Vulnérabilités intégrées** | osv-scanner ne tourne que s'il est installé et que `--tools` est passé. | `npm audit --json` et `pip-audit` par défaut, osv en complément. |
| **Licences hors npm**, SBOM | Rien pour Python ; syft est facultatif. | `licenses` + CycloneDX ; signaler les licences copyleft. |
| **OpenAPI** | `facts/api.json` n'a ni schéma de requête ni de réponse, et l'adaptateur OpenAPI ne lit pas le YAML. | Générer une ébauche OpenAPI depuis les routes ; lire le YAML. |
| **Autres frameworks** | Les applications vibe codées sont souvent en Vue, Nuxt, SvelteKit, Remix ou Astro côté front ; NestJS, Hono, Django ou Flask côté serveur ; Drizzle ou Supabase pour la base. Les fichiers `.vue`, `.svelte` et `.php` sont ignorés (`facts/quality.mjs:14`). | Ajouter des adaptateurs, en commençant par Nuxt/Vue, SvelteKit, Drizzle, Supabase, Django et NestJS. |
| **Fichiers pour la prochaine IA** | Le repreneur travaillera sans doute avec un agent. | Générer `AGENTS.md`, `CLAUDE.md` et `llms.txt` depuis les faits ; ajouter `doc-kit pack`, un paquet de contexte façon Repomix, filtré par `check secrets`. |
| **Synthèse « état de santé »** | `audit` mesure la maturité de la **doc**, pas la santé de l'**application**. | Une page de synthèse générée : notes, 10 risques, 10 points chauds, vulnérabilités, couverture de tests. |

**Vue d'ensemble pour l'utilisateur**

- Les visites guidées ne sont pas testées contre l'application : un sélecteur qui disparaît n'est vu qu'à la
  recapture. Idée prise à Doc Detective : rejouer les visites comme des tests.
- Aucun « avant / après » publié entre deux versions, alors que `capture --compare` a déjà les deux images.

---

## 5. Mettre la documentation à jour à chaque build : ce qui manque et la recette proposée

### Aujourd'hui

1. `facts` réécrit `facts/*.json` (sans garder de trace de la version précédente).
2. `sync` compare avec `sync.json` et écrit `.doc-kit/sync.md`, **un dossier ignoré par git**, donc jamais publié.
3. `sync --apply --labels` corrige les preuves et les libellés ; la prose reste à la main ou à l'agent, et seulement
   dans une session Claude Code interactive.
4. `sync --check` échoue en cas d'écart, **mais aucun exemple de CI ne l'appelle**. Les exemples se déclenchent
   seulement sur `docs/manual/**`, donc **un push sur le code de l'application ne déclenche rien**.
5. Les captures sont interdites en CI, ce qui est voulu puisqu'il faut une session.

### Ce qu'il faut ajouter

| Priorité | Ajout | Effet |
|---|---|---|
| 1 | **Recette CI « application »** : déclenchée sur tout push ou PR de l'application ; lance `facts`, `sync --check --json` et `build` ; publie le site comme artefact. | La doc suit chaque build. |
| 2 | **Diff des faits entre versions** : garder `facts/*.json` de la version de référence et calculer les routes, tables, variables et dépendances ajoutées ou supprimées. | Base du « ce qui a changé » côté développeur. |
| 3 | **Page « Nouveautés » générée** à partir de trois sources : le diff des faits, les commits au format Conventional Commits (façon git-cliff) et les captures avant / après. Elle remplit le gabarit `release-notes`, qui existe déjà. | Notes de version utilisateur et développeur automatiques. |
| 4 | **Commentaire de PR** avec le résumé de `sync.md` : pages à revoir, captures périmées, nouvelles routes. | Le développeur voit l'impact sur la doc avant la fusion. |
| 5 | **Hooks git** : un `doc-kit hook install` qui pose `post-merge` et `pre-push` et lance `facts` puis `sync`. Une option `--on-build` à brancher sur `npm run build`, par exemple en `postbuild`. | Mise à jour en local, sans CI. |
| 6 | **Rédaction sans session interactive** : `doc-kit update --agent`, qui appelle l'API Claude (ou Claude Code en mode headless) avec les consignes du skill, puis ouvre une PR de doc au lieu d'écrire directement. | Même la prose est mise à jour en CI ; un humain valide la PR. |
| 7 | **Captures en CI sur l'environnement de démo seulement** (`capture.target: demo` plus le script `demo`), jamais en production. | Écrans à jour sans session réelle. |

Esquisse de la recette (à placer dans le dépôt **de l'application**) :

```yaml
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read, pull-requests: write }
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>        # fetch-depth: 0 pour sync et l'historique
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@<sha>
        with: { node-version: 22 }
      - run: npm ci --ignore-scripts
        working-directory: docs/manual
      - run: npx doc-kit facts && npx doc-kit sync --json > sync.json || true
        working-directory: docs/manual
      - run: npx doc-kit build && npx doc-kit check all
        working-directory: docs/manual
      # à ajouter au kit : diff des faits, page Nouveautés, commentaire de PR
      - run: npx doc-kit sync --check     # fait échouer le build si la doc a dérivé
        working-directory: docs/manual
      - uses: actions/upload-artifact@<sha>
        with: { name: documentation, path: docs/manual/dist }
```

---

## 6. Outils du même type et idées à reprendre

Recherche faite le 3 octobre 2026. ★ marque les plus pertinents.

| Outil | Ce qu'il fait | Idée pour doc-kit |
|---|---|---|
| ★ [Google Code Wiki](https://codewiki.google) | Wiki d'un dépôt, régénéré à chaque commit ; chaque section renvoie au code ; diagrammes générés. | Lier chaque affirmation du dossier à `file:line` (déjà en partie fait avec les preuves) ; régénérer seulement les sections touchées. |
| ★ [deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open) / [DeepWiki](https://deepwiki.com) | Wiki et diagrammes Mermaid générés par IA, avec une question-réponse sur le dépôt ; auto-hébergeable avec Ollama. | Fournisseur d'IA interchangeable, y compris en local pour le code privé ; diagrammes Mermaid. |
| ★ [PocketFlow Tutorial-Codebase-Knowledge](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) | Transforme un dépôt en tutoriel par chapitres, organisé autour des abstractions centrales. | Un chapitre « Concepts clés » dans l'espace Reprise, dans l'ordre où on les apprend. |
| ★ [Repomix](https://github.com/yamadashi/repomix) / [gitingest](https://gitingest.com) | Emballe un dépôt dans un seul fichier prêt pour une IA, avec scan des secrets. | `doc-kit pack`, filtré par `check secrets`. |
| ★ [shot-scraper](https://github.com/simonw/shot-scraper) | Captures Playwright décrites en YAML, souvent lancées en CI. | Recapturer l'environnement de démo en CI. |
| ★ [Doc Detective](https://doc-detective.com) | Rejoue la doc (aller à, cliquer, saisir, capturer) contre le produit, et dit si chaque étape passe. | Rejouer les visites guidées comme des tests en CI. |
| ★ [Swimm](https://swimm.io) | Doc ancrée sur le code, avec synchronisation automatique ou alerte « périmé ». | Le modèle de `sync`, que doc-kit suit déjà ; ajouter l'ancrage par symbole, pas seulement par ligne. |
| ★ [CodeScene](https://codescene.com) / [code-maat](https://github.com/adamtornhill/code-maat) | Points chauds (complexité × fréquence de modification), propriété du code, bus factor. | `facts history`. |
| ★ [git-cliff](https://git-cliff.org) / [release-please](https://github.com/googleapis/release-please) / [changesets](https://github.com/changesets/changesets) | Changelog et version tirés des commits. | La page « Nouveautés » (§ 5, priorité 3). |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) / madge | Graphe des modules, cycles, règles de couches. | Graphe des modules dans le dossier de reprise. |
| [Mintlify Agent](https://www.mintlify.com/blog/agents-launch) / [Promptless](https://promptless.ai) / [Dosu](https://dosu.dev) | Agents qui détectent les changements visibles par l'utilisateur et ouvrent des PR de doc. | `update --agent` qui ouvre une PR (§ 5, priorité 6) ; `llms.txt`. |
| Scribe, Tango, Guidde, Supademo, Arcade | Guides pas à pas et démos interactives tirés de clics enregistrés. | Points cliquables dans les visites ; narration facultative. |
| Percy, Chromatic, Argos, Lost Pixel | Comparaison visuelle d'images en CI. | Une page avant / après pour chaque écran modifié. |
| SchemaSpy, prisma-erd-generator, dbdocs, Atlas | Schéma entité-relation et navigateur de schéma. | ERD Mermaid depuis `db.json`. |
| Structurizr (C4), arc42, log4brains (ADR) | Architecture décrite comme du code ; modèles de dossier d'architecture. | Organiser l'espace Reprise selon arc42 ; proposer des ébauches d'ADR à partir de l'historique git. |
| Backstage TechDocs | La doc publiée dans le catalogue des services. | Exporter `catalog-info.yaml` et `mkdocs.yml`. |
| SonarQube, Semgrep, OSV-Scanner, Trivy, gitleaks, TruffleHog, knip, jscpd, OpenSSF Scorecard | Qualité, failles, vulnérabilités, SBOM, secrets dans tout l'historique git, code mort, duplication, hygiène du dépôt. | Les brancher comme sources facultatives de `facts` (déjà en partie fait) ; analyser l'historique git complet, pas seulement HEAD, car les `.env` committés sont fréquents dans le code vibe codé. |

---

## 7. Feuille de route proposée

| Version | Contenu |
|---|---|
| **0.2.1 — sécurité** (quelques jours) | S1, S2, S4, S5, S7 ; durcissement git (S3) ; tests sans dépendance à la machine (M7). |
| **0.3 — hygiène** | CI du dépôt (M1), `checkJs` + prettier + eslint (M2), dédoublonnage du sommaire et du scan JS (M4), tag 0.2.0 et commits conventionnels (M12). |
| **0.4 — à chaque build** | Recette CI application, diff des faits, page « Nouveautés », commentaire de PR, `doc-kit hook install` (§ 5, priorités 1 à 5). |
| **0.5 — vue d'ensemble développeur** | Graphe des modules, ERD, C4, `facts history`, vulnérabilités et licences intégrées, synthèse « état de santé », `AGENTS.md`/`llms.txt`/`pack`. |
| **0.6 — couverture** | Adaptateurs Nuxt/Vue, SvelteKit, Drizzle, Supabase, Django, NestJS ; visites rejouées comme tests ; `update --agent` en CI. |
