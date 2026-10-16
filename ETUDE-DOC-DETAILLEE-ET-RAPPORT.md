# Étude — une documentation détaillée pour chaque public, et un rapport complet sur l'application

*16 octobre 2026. Point de départ : une Product Owner trouve que la documentation produite par le kit pour son
application « ne va pas assez loin dans le détail ». Elle veut chaque fonctionnalité décrite précisément — par
exemple comment fonctionne la recherche — et une vue d'ensemble façon backlog. L'étude cherche pourquoi la
documentation reste légère, regarde ce que font les outils du marché, et propose une architecture et un plan. Elle
couvre ensuite le rapport complet sur l'application (cybersécurité, maintenabilité, indice « vibe-codé », travail à
plusieurs) et l'adaptation à toutes les piles techniques. Le plan détaillé, lot par lot, est suivi au § 6.*

---

## 1. En bref

- **Le manque de détail ne vient pas d'un seul endroit, mais de quatre à la fois** : le gabarit de la fiche
  fonctionnalité n'a pas de place pour le détail ; les consignes des agents les poussent à faire court ; les faits
  extraits du code ignorent les paramètres, la validation, la recherche, le tri et la pagination ; et le contexte
  donné au rédacteur ne suit pas le code jusqu'à la requête. Rien ne mesure la profondeur : l'audit ne regarde que
  la présence des titres.
- **Une analyse, plusieurs lecteurs.** Un agent « analyste » trace chaque fonctionnalité dans le code (écran → API →
  service → requête) et écrit une analyse avec ses preuves. Quatre rédacteurs en tirent les pages de quatre
  publics : **Utiliser** (métier), **Produit** (PO), **Administrer** (admin des applis et exploitation) et
  **Développer** (dev, reprise). La page Produit ne cite jamais de code ; la page Développer prouve chaque phrase.
- **La profondeur devient mesurable.** La fiche fonctionnalité gagne des user stories, des **cartes de
  comportement** (recherche, filtre, tri, pagination, import, export, calcul…, chacune avec ses rubriques
  obligatoires : champs cherchés, correspondance, majuscules et accents, déclenchement, résultat vide, droits…) et
  des **critères d'acceptation** au format Soit / Quand / Alors. Le build signale une rubrique oubliée ; l'audit
  calcule la profondeur de chaque fonctionnalité.
- **Un tableau qui parle tout de suite à la PO** : l'accueil de l'espace Produit est une carte des user stories (à la
  manière de Jeff Patton) ou une liste Epic › Fonctionnalité › Story, au choix, d'où un clic ouvre la fiche. Le
  backlog s'exporte vers Azure DevOps, Jira, GitHub, GitLab ou un JSON générique, sans que le kit se connecte jamais
  à ces outils. Maquette validée : <https://claude.ai/artifact/5TAHK1P6PZAGVcZfkQR4yF>.
- **Puis un rapport complet sur l'application** : bibliothèques, licences et vulnérabilités (avec un SBOM
  CycloneDX), maintenabilité, indice « vibe-codé » avec ses preuves et son niveau de confiance, et capacité à
  travailler à plusieurs en parallèle. Les notes sont calculées par le moteur à partir d'un modèle décrit en
  données ; les agents vérifient, ils ne notent jamais.
- **Tout en briques, tout adaptable.** Chaque partie est une brique qu'on relance seule (`doc-kit bricks run cyber`)
  ; un questionnaire d'entrée recense les sources (code, dépôt, infrastructure, URL, DAT, espaces collaboratifs) ;
  des adaptateurs couvrent le plus de piles possible (Java/Spring, .NET, PHP, Go, Ruby… ; Azure, Terraform,
  Kubernetes, AWS, Docker), et le kit dit clairement ce qu'il ne sait pas lire.
- **Trois défauts de confidentialité ont été trouvés et corrigés en premier** (lot 0) : des noms de paquets privés
  partaient vers npm et PyPI, osv-scanner envoyait tous les noms à osv.dev, et les sorties brutes des outils
  externes étaient stockées telles quelles.

---

## 2. Constat : pourquoi la documentation reste légère

Mesuré sur le code du kit (version 0.3.0) et sur sa documentation d'exemple.

| Niveau | Constat | Où |
|---|---|---|
| Gabarit | La fiche `feature` a 11 sections, dont 5 obligatoires ; aucune pour les champs, la validation, la recherche, le filtre, le tri, la pagination, les états, les messages, les droits par action ou les critères d'acceptation. La fiche de référence fait 564 mots. La profondeur n'existe que dans les pages `screen` : l'exemple d'écran décrit la recherche des commandes en détail, la fiche fonctionnalité correspondante n'en dit rien. | `standard/templates/business.json`, `templates/pages/en/feature.md`, `docs/en/content/examples/screen.md` |
| Consignes des agents | « Au plus 3 lectures », « une page courte et exacte vaut mieux qu'une page remplie », « signale la question technique dans ton rapport au lieu d'y répondre ». L'exigence « TRÈS détaillé » n'existe que dans `references/method.md` : aucun brief ne la porte. Aucun brief n'écrit la contrepartie technique d'une fonctionnalité. | `briefs/en/writing-batch.md`, `functional-spec.md`, `references/method.md` |
| Faits extraits | Ni paramètres de requête (la chaîne de requête est ignorée), ni schémas de validation, ni filtres, tri ou pagination, ni moteur de recherche, ni listes de valeurs, ni catalogue des droits. | `engine/sync/api-links.mjs`, `engine/facts/*` |
| Contexte du rédacteur | `features.json` n'est jamais lu pour construire le contexte ; la fermeture des imports part des seuls fichiers de route, pas des gestionnaires d'API ; un fichier partagé sans ligne citée n'apparaît que par son chemin. La logique d'une recherche n'arrive au rédacteur que par chance. | `engine/sync/dependencies.mjs`, `engine/context/context.mjs` |
| Mesure | L'audit compte une section comme présente dès que son titre existe, même vide. La méthode « sobre » de 0.2 a réduit le coût de 69 %, mais aussi les mots de 24 % et les preuves de 19 %, à conformité égale : la conformité mesure la structure, pas la profondeur. | `engine/core/page-templates.mjs`, `docs/en/content/skill/cost-and-speed.md` |

**Les publics.** Deux espaces seulement : *Métier* mélange les utilisateurs, la PO, le support et l'administrateur
fonctionnel ; *Reprise* mélange le développement, l'exploitation et la sécurité. Plusieurs règles du code sont
écrites en dur sur les identifiants `business` et `takeover`.

**Le rapport sur l'application.** Les faits existent (dépendances et fichiers de verrouillage, historique git,
graphe des imports, qualité, règles de sécurité, outils externes en option) mais rien ne les assemble. Il n'y a ni
vulnérabilités intégrées, ni licences hors npm, ni indice « vibe-codé », ni lecture de CODEOWNERS, du contenu de la
CI, des fichiers modifiés ensemble ou du facteur bus par module.

---

## 3. Le marché

### 3.1 Montrer un produit à une PO

- **La carte des user stories (Jeff Patton, 2014)** : l'épine dorsale en haut (les grandes activités dans l'ordre du
  parcours), les stories empilées dessous par priorité, et des bandes horizontales par version (la « tranche » de
  chaque livraison). Elle garde le récit qu'un backlog plat perd. C'est le format le plus parlant pour une PO : on
  lit le produit de gauche à droite, et sa profondeur de haut en bas.
- **Azure Boards** organise le travail en trois niveaux, Epic › Feature › User Story (Product Backlog Item en Scrum,
  Requirement en CMMI), avec une vue en arbre dépliable. **Jira** organise Epic › Story › Sub-task, le champ
  « Parent » remplaçant l'ancien « Epic Link ».
- **Productboard** groupe les éléments par statut ou par version, avec des couloirs par objectif ou par composant, et
  choisit les attributs affichés sur chaque carte par public.

Conclusion : le tableau du kit propose les deux vues que la PO connaît — la carte (vue d'ensemble, ateliers) et la
liste (navigation fine, export) —, avec une jauge de profondeur par fonctionnalité qui n'existe dans aucun de ces
outils, puisqu'eux ne savent pas ce que fait le code.

### 3.2 Importer un backlog dans les outils de tickets

| Outil | Import | Ce qui compte |
|---|---|---|
| Azure DevOps | CSV | La hiérarchie vient du décalage des colonnes `Title 1`, `Title 2`, `Title 3` ; une colonne « Parent » est ignorée ; les éléments importés sont créés à l'état New. |
| Jira Cloud | CSV | Colonnes `Issue ID`, `Issue Type`, `Parent` (l'Issue ID du parent) ; les parents avant les enfants ; « Epic Link » est abandonné. |
| GitLab | CSV | Colonnes `title` et `description`. |
| GitHub | Aucun import CSV natif | Passer par l'API (sous-issues) ou un outil d'import tiers : le kit produit un JSON et une procédure, sans jamais appeler l'API. |

### 3.3 Documenter du code avec l'IA

- **DeepWiki** et **Google Code Wiki** produisent un wiki navigable à partir d'un dépôt, utile pour s'orienter, mais
  sans fiche fonctionnelle ni critère d'acceptation, et sans contrôle de profondeur.
- **Swimm** garde la documentation dans le dépôt, couplée au code, et signale quand le code bouge (comme `sync` dans
  le kit).
- **Diátaxis** sépare quatre modes (tutoriels, guides pratiques, référence, explication). Il ne propose pas de
  découpage par public : c'est au projet de répartir ses lecteurs. Les quatre espaces du kit font ce découpage, et
  le gabarit de chaque page reste dans un seul mode.

Aucun outil du marché ne fait à la fois : la fiche fonctionnelle détaillée tirée du code, la mesure de sa
profondeur, le tableau PO, l'export du backlog, et un site hors ligne en un seul fichier.

---

## 4. Architecture recommandée

```
questionnaire d'entrée ─► doc-kit inputs (code ou dépôt, infra, URL, DAT, espaces collaboratifs, backlog)
                 ┌────────── briques (standard/bricks.json : graphe, état par brique) ──────────┐
code ─► adaptateurs (piles, dépendances, infra, documents) ─► faits déterministes, hors ligne par défaut
     ├─► analyse par fonctionnalité (agent analyste, preuves vérifiées) ─► digests par lecteur
     │      Utiliser · Produit · Administrer · Développer   (« Ce sujet pour : … » relie les quatre pages)
     ├─► site : tableau Produit (carte | liste) ─► fiche ; export du backlog
     └─► moteur de rapport (modèle de notation en données) ─► report.json ─► dans le site et en export
```

**Principes de code.**

- **Piloté par les données** : les publics (`standard/spaces.json`), les types de comportement
  (`standard/behaviours.json`), les briques (`standard/bricks.json`), la notation (`standard/report.json`), les
  signaux de détection et les licences sont des fichiers de données, pas des cas particuliers dans le code.
- **Nouveaux modules** plutôt que grossir les gros fichiers ; un test tient les fichiers déjà trop longs à leur
  taille actuelle.
- **Les agents ne notent jamais** : le moteur calcule, les agents vérifient (vérifié, déduit, inconnu, écarté).
- **Confidentialité** : le dossier de l'application n'est jamais exécuté, aucune donnée sensible n'est stockée, une
  seule passerelle réseau, opt-in, qui n'envoie jamais un nom privé.

**Les quatre publics.**

| Espace | Pour qui | Ce qu'on y trouve |
|---|---|---|
| Utiliser | Utilisateurs métier, support | Les écrans pas à pas, sans code |
| Produit | PO, analystes, testeurs | Le tableau, les fiches fonctionnalités (stories, comportements, règles, critères), les rôles, les processus, les notes de version |
| Administrer | Administrateurs des applis, exploitation | Paramétrage, utilisateurs et droits, déploiement, environnements, sauvegardes, supervision |
| Développer | Développeurs, reprise | Carte du code, API, données, mécanismes avec preuves, revues, rapport complet |

**La fiche fonctionnalité.** En-tête d'identité (epic, rôles, version, ticket, jauge) · À quoi ça sert · Qui
l'utilise · User stories · Parcours principal · Variantes · Comportements · Règles de gestion · Champs et saisies ·
États · Messages · Droits par action · Critères d'acceptation · Limites · Questions ouvertes. Une section qui ne
s'applique pas reste écrite : « Sans objet — raison ». Une rubrique que le code ne permet pas de trancher devient
une question ouverte pour la PO.

---

## 5. Le rapport complet sur l'application

| Domaine | Ce qui est mesuré |
|---|---|
| Cybersécurité | Chaque bibliothèque (directe et transitive), sa licence (classée : permissive, copyleft faible ou fort, inconnue), son retard, ses vulnérabilités connues (identifiant, gravité, version corrigée, chemin depuis la dépendance directe) ; secrets actuels et dans l'historique ; règles de sécurité ; routes sans authentification ; tables sans contrôle d'accès ; en-têtes et cookies observés sur une instance locale ; SBOM CycloneDX. |
| Maintenabilité | Taille, complexité, duplication, cycles, tests et couverture, code mort, suppressions de règles de lint, tendance d'une version à l'autre. |
| Indice « vibe-codé » | Empreintes de plateformes (Lovable, Bolt, Replit, v0…), commits co-signés par une IA, paquets qui n'existent pas, duplication, fichiers géants, tests absents, routes sans authentification… Un indice de 0 à 100 avec sa bande et sa confiance (haute seulement avec une preuve directe), présenté comme des signes et leurs risques, jamais comme un jugement. |
| Travail à plusieurs | Couplage entre modules, cycles, fichiers modifiés ensemble, facteur bus par module, perte de connaissance, garde-fous (CI qui lance les tests, lint, types, CODEOWNERS, hooks, bot de dépendances, gabarit de PR) ; zones indépendantes, nombre de personnes qui peuvent travailler en parallèle, et répartition suggérée. |
| Synthèse | Une note de A à E par domaine, les risques majeurs et les actions, pour les décideurs ; le détail pour les développeurs. Un signal non mesuré n'est jamais compté comme zéro. |

Sorties : une directive `::report` dans le site, et `doc-kit report` en HTML autonome, Markdown, JSON et CycloneDX,
avec un seuil de note utilisable en intégration continue.

---

## 6. Plan d'action et avancement

| Lot | Contenu | État |
|---|---|---|
| 0 | Sécurité : aucun nom de paquet privé ne part plus (`quality --network` corrigé ; workspaces, fichiers de verrouillage npm, yarn, pnpm et poetry, configurations yarn, bun, uv et Poetry, configuration de l'utilisateur) ; osv-scanner hors ligne ; sorties d'outils en liste blanche | **Fait** (commit 68b0955) |
| 0 | Maquette du tableau Produit et de la fiche, validée | **Fait** |
| 0 | Garde-fous automatiques (M1, M5, nouvelle règle M15) et agents de développement du dépôt (`kit-reviewer`, `kit-test-author`, `kit-skill-editor`) | **Fait** |
| 0 | Cette étude | **Fait** |
| 1 | Refactors sans changement de comportement (registre des faits, fraîcheur, extractions, passerelle réseau unique) | À faire |
| 2 | Briques : registre, état, relance | À faire |
| 3 | Modèle à quatre publics et migration des projets existants | À faire |
| 3b | Questionnaire d'entrée et sources (dépôts, DAT .docx/.pdf, schémas, espaces collaboratifs) | À faire |
| 4 | Fiche refaite, cartes de comportement, scénarios, user stories | À faire |
| 5 | Faits de comportement et contexte des fiches | À faire |
| 5b | Adaptateurs de piles (Java/Spring, .NET, PHP, routeurs front… puis Go, Ruby, low-code) | À faire |
| 5c | Faits d'infrastructure (Terraform, Bicep/ARM, CloudFormation, Kubernetes, Helm, OpenShift, Docker, pipelines) | À faire |
| 6 | Tableau Produit dans le site et export du backlog | À faire |
| 7 | Audit de la profondeur | À faire |
| 8 | Publics dans le site, recherche, `init` à quatre espaces | À faire |
| 9 | Skill : analyste, briefs, boucle de profondeur, rapprochement DAT ↔ code | À faire |
| 10 | Démo, documentation, pilote mesuré, **release 0.4.0** | À faire |
| 11 | Faits étendus pour le rapport (vulnérabilités, licences, garde-fous, provenance, historique) | À faire |
| 12 | Moteur de rapport | À faire |
| 13 | `doc-kit report` et ses exports (HTML, Markdown, JSON, CycloneDX) | À faire |
| 14 | Pages, briefs, préréglages, calibrage sur des projets réels, **release 0.5.0** | À faire |

---

## 7. Risques

- **Coût des agents** : l'analyse ajoute environ une unité par fonctionnalité de taille moyenne. Maîtrisé par le
  niveau de détail choisi au cadrage, des budgets de lecture par taille, des digests courts, un modèle léger pour
  l'approfondissement, et une estimation avant chaque vague ; les chiffres seront mesurés sur un pilote avant
  d'être annoncés.
- **Fausse précision** : statuts obligatoires, preuves vérifiées mécaniquement, questions ouvertes remontées à la PO
  ; dans le rapport, la confiance et le « non mesuré » sont affichés.
- **Largeur des adaptateurs** : un lecteur statique ne comprend jamais tout (routes dynamiques, méta-programmation).
  Tout ce qu'il trouve reste « déduit », la matrice de couverture dit ce qui n'est pas lu, et les agents lisent le
  reste.
- **Documents non fiables** (DAT, pages exportées) : limites contre les archives piégées, XML lu sans DTD, contenu
  traité comme des données et jamais comme des instructions.

---

## Sources

- [User story mapping (Jeff Patton) — guide](https://www.koji.so/docs/user-story-mapping)
- [Azure Boards — définir des Features et des Epics](https://learn.microsoft.com/fi-fi/azure/devops/boards/backlogs/define-features-epics?view=azure-devops)
- [Azure DevOps — importer des éléments de travail depuis un CSV](https://learn.microsoft.com/en-us/Azure/devops/boards/queries/import-work-items-from-csv?view=azure-devops)
- [Azure DevOps — hiérarchie par Title 1 / Title 2 (Microsoft Q&A)](https://learn.microsoft.com/en-in/answers/questions/5878109/parent-id-isnt-getting-applied-to-the-user-story-w)
- [Atlassian — CSV import, Parent-child mapping](https://confluence.atlassian.com/jirakb/csv-import-parent-child-mapping-1096095688.html)
- [Atlassian — garder la hiérarchie à l'import CSV dans Jira Cloud](https://support.atlassian.com/jira/kb/keep-issue-parent-child-mapping-during-csv-import-to-jira-cloud/)
- [GitLab — importer des issues depuis un CSV](https://new.docs.gitlab.com/user/project/issues/csv_import)
- [Import d'issues GitHub depuis un CSV (outil tiers)](https://github.com/aboutcode-org/github-import-issues-csv)
- [Productboard — attributs des cartes de roadmap](https://support.productboard.com/hc/en-us/articles/32868506415123)
- [Diátaxis — Canonical](https://canonical.com/blog/diataxis-a-new-foundation-for-canonical-documentation)
- [Outils de documentation de code par IA (comparatif)](https://repowise.dev/blog/comparisons/best-codebase-documentation-tools-2026)
- [osv-scanner — mode hors ligne](https://google.github.io/osv-scanner/usage/offline-mode/)
- [osv-scanner — codes de sortie et format JSON](https://google.github.io/osv-scanner/output/)
