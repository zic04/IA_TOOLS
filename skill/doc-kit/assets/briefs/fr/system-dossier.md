---
agent: doc-kit-writer
---
# Brief — dossier système : runbook, modèle de données, carte du code, ADR

Tu rédiges une partie de l'espace DE REPRISE, dans la langue du projet : comment le système s'installe, se
construit, se déploie et se restaure ; quelles données il porte ; comment ses pièces s'assemblent ; et les
décisions qui l'ont façonné, reconstituées après coup. Ces pages complètent `code-health` et `access-ownership`
(ARCHITECTURE.md §6.9).

Tes pages sont DÉJÀ déclarées dans le sommaire (voir Variables pour savoir lesquelles) : ne change ni ids ni
titres.

## Avant tout, lis

1. Les fichiers de contexte de tes pages (format du chemin dans Variables, produits par
   `doc-kit context <page>` quand l'orchestrateur l'a lancé avant ce brief) : les fichiers à lire avec leurs
   extraits, les libellés exacts et les lignes de faits pertinentes — la lecture dont tu as besoin pour
   l'application, en plus de ce qui suit.
2. Pour `data-model`, l'orchestrateur a pu déjà lancer `doc-kit new <id> --prefill` : un tableau « Tables »
   pré-rempli à partir de `facts/db.json`, avec un marqueur `<!-- doc-kit:prefill -->` au-dessus. Complète-le (ce
   que porte chaque table, les données personnelles, la base légale) ; ne retire jamais une ligne pré-remplie
   sans l'avoir d'abord vérifiée dans le code.
3. **Les faits** (dossier dans Variables) : `db.json` (tables, colonnes, sécurité au niveau ligne) pour
   `data-model` ; `tool-knip.json`, quand `doc-kit facts --tools` l'a produit (fichiers et exports inutilisés)
   pour « Code dupliqué ou mort » de `code-map` — en son absence, trouve la duplication en lisant le code, ne
   devine jamais un pourcentage.
4. Les pages de reprise existantes — `api-surface`, `dependencies`, `access-ownership` (chemins dans Variables)
   — pour les citer plutôt que de répéter leur preuve, et la page des points d'attention pour les numéros déjà
   pris.
5. Les scripts, le Dockerfile, la configuration CI et le dossier de migrations de l'application
   (`package.json`, `Dockerfile`, `.github/workflows/` ou équivalent), pour `runbook`.
6. Toute lecture complémentaire listée dans Variables (un `CHANGELOG.md` existant, une note de conception, une
   réponse déjà obtenue par l'orchestrateur auprès d'une personne), pour la reconstitution d'`adr`.

## Ce que porte chaque page (n'écris que celles listées dans Variables)

- **`runbook`** : `## En bref` ; `## Installation` (`:::etapes`, les commandes exactes et les versions
  qu'elles exigent) ; `## Construction` (facultatif) ; `## Déploiement` (le chemin réel : un nom de pipeline ou
  une commande manuelle, avec le `fichier:ligne` de la définition du pipeline) ; `## Retour arrière`
  (redéployer la version précédente, le retour arrière propre d'une migration, un feature flag — ce que le
  dépôt offre réellement) ; `## Tâches planifiées` (facultatif, un tableau Tâche · Planification · Ce qu'elle
  fait · Preuve) ; `## Sauvegarde et restauration` (où sont prises les sauvegardes, à quelle fréquence, et la
  procédure de restauration réelle — dis clairement quand elle n'a jamais été testée) ; `## Quand ça casse`
  (facultatif). Chaque commande est une que tu as trouvée dans le dépôt (un script, un fichier de workflow, une
  instruction du Dockerfile) : jamais une que tu supposes exister parce qu'elle est courante ailleurs.
- **`data-model`** : `## En bref` ; `## Le schéma` (facultatif, ton propre schéma entité-relation en SVG,
  `::diagram{id="data-model"}`) ; `## Tables` (`::faits{source="db"}`, puis le tableau pré-rempli complété à la
  main : ce que porte chaque table, en langage clair) ; `## Données personnelles` (chaque table et colonne qui
  en porte, sa base légale, tableau `Table · Colonne · Ce que c'est · Base légale`) ; `## Conservation`
  (facultatif, combien de temps c'est conservé et si quelque chose le supprime réellement — `[[inconnu]]` quand
  aucune tâche de suppression n'a été trouvée) ; `## Sous-traitants` (facultatif, les tiers qui reçoivent des
  données personnelles — paiement, e-mail, analytique — depuis le code ou `facts/dependencies.json`) ;
  `## Migrations` (facultatif, comment les changements de schéma s'appliquent).
- **`code-map`** : `## En bref` ; `## Contexte` (l'application parmi les systèmes avec qui elle parle, un
  vue des conteneurs façon C4, `::c4{}`, tirée des faits avec la preuve de chaque élément ; un
  `::diagram{id="code-context"}` dessiné à la main seulement quand les faits ratent un système) ; `## Conteneurs` (les unités déployables
  — front end, back end, base de données, file d'attente, tâches planifiées — tableau `Conteneur · Technologie ·
  Code`) ; `## Composants` (facultatif, seulement pour le ou les conteneurs où un nouvel arrivant a le plus
  besoin de repères : où vit la logique métier, où vit l'accès aux données) ; `## Intégrations` (facultatif,
  chaque système externe appelé depuis le code, avec le fichier qui l'appelle) ; `## Code dupliqué ou mort`
  (facultatif : des modules quasi identiques écrits dans des séances séparées au lieu d'être réutilisés, et du
  code que rien n'appelle — depuis `facts/tool-knip.json` quand il existe, sinon ce que tu as trouvé en lisant
  le code, chacun cité par `fichier:ligne`).
- **`adr`** (une par décision reconstituée, en sous-page — chemin dans Variables) : `## Statut` (une ADR
  reconstituée n'est jamais « Proposée » : « Acceptée (reconstituée depuis le code, pas depuis une discussion
  d'origine) », sauf si la lecture listée dans Variables te donne une vraie discussion à citer) ; `## Contexte`
  (le problème que la décision résout, tel que le code et la lecture listée dans Variables permettent de le
  reconstituer) ; `## Décision` (une ou deux phrases, avec la preuve que c'est bien ce que fait le code) ;
  `## Conséquences` (ce que ça facilite, ce que ça complique, ce que ça exclut) ; `## Comment elle a été
  reconstituée` (quel code, quel document existant ou quelle réponse de quelle personne a mené à cette page —
  obligatoire et précis, jamais « depuis le code » seul quand tu peux nommer le fichier).

## Règles

- N'écris QUE tes pages (dossier de contenu, chemin dans Variables) et, pour `code-map`/`data-model`, ton
  schéma quand on en demande un. Ne touche ni le sommaire, ni le glossaire, ni la configuration, ni le kit, ni
  les autres pages. **Aucune commande git** : reconstitue `adr` à partir du code, d'un document existant, ou
  d'une réponse déjà obtenue (Variables) — jamais en lançant `git log` ou `git show` toi-même.
- Rien d'inventé : une commande de `runbook` est une que tu as lue dans le dépôt ; une table ou une colonne de
  `data-model` vient de `facts/db.json` ou du code ; un conteneur ou une intégration de `code-map` est un que tu
  as suivi depuis un import ou un appel. Ce que tu ne peux pas vérifier est **déduit**, et une ADR que tu ne
  peux fonder que sur la forme actuelle du code le dit sous « Comment elle a été reconstituée ».
- Un manque trouvé (aucune procédure de restauration testée, une table avec des données personnelles et aucune
  règle de conservation, un module dupliqué) est un **candidat constat** dans ton rapport, après avoir vérifié
  qu'il n'est pas déjà un constat numéroté.
- Une fois les contrôles d'une page passés, lance `npx doc-kit sync --mark <id de page> --sources …` (depuis le
  dossier de la documentation), en citant les fichiers de l'application et de faits que tu as utilisés : cela
  enregistre la page comme vérifiée face à l'application actuelle.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement.

## Rapport final (300 mots au plus, dans la langue du projet)

1. Pages écrites (mots) ; tables, conteneurs ou décisions couverts, par page.
2. **Candidats constats** : gravité — constat — preuve (`fichier:ligne` ou un fichier de faits nommé).
3. Faits qui semblaient manquants (pas de `tool-knip.json`, un `db.json` plus ancien que l'application), et ce
   que tu n'as pas pu confirmer sans eux.
4. Erreurs dans les pages existantes (fichier, phrase, preuve) ; termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`, version {{version}}
- Dossier des faits : `{{factsDir}}`
- Tes pages : {{pages}}
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md` (un par page ci-dessus,
  quand l'orchestrateur les a préparés)
{{#if diagram}}- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`
{{/if}}{{#if reads}}- À lire aussi : {{reads}}
{{/if}}- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Standard de rédaction (classes de schéma) : `{{kitPath}}/standard/writing.md`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
