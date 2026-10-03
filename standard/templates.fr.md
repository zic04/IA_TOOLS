# Les gabarits de page

Un gabarit fixe les sections `##` d'un type de page, leur ordre et la longueur maximale de la page. Il y a 30
types : les 13 d'origine, utilisés dans l'un ou l'autre espace, et 17 ajoutés pour les deux espaces de
[structure.fr.md](structure.fr.md) — 5 pour l'espace Métier (§6.8 d'ARCHITECTURE.md), 12 pour l'espace Reprise
(§6.9, §6.13). La version lisible par la machine est [templates.json](templates.json) (les 13 types d'origine) plus
`templates/<groupe>.json` (`business.json`, `takeover.json`) ; les pages prêtes à remplir sont dans
`templates/pages/en/<type>.md` et `templates/pages/fr/<type>.md`.

Les identifiants de type sont en anglais dans tous les projets : `screen`, `editor`, `recipe`, `technical`,
`technical-sub`, `journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`,
`architecture`, `variables`, `resources` (utilisés dans l'un ou l'autre espace, surtout en Reprise) ; `feature`,
`business-rules`, `roles-matrix`, `process`, `release-notes` (espace Métier) ; `access-ownership`,
`api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`, `tests-quality`, `agent-instructions`,
`adr`, `threat-model`, `security-review`, `maintainability-review`, `documentation-cost` (espace Reprise). Les libellés de section
suivent la langue du projet.

## Comment le build s'en sert

- Une page déclare son type dans le sommaire (`content/toc.json`) : `{ "id": "utiliser/commandes/liste", …, "template": "screen" }`.
- Le build vérifie alors ses **sections obligatoires**. Une section est reconnue quand un titre `##` de la page **commence par** son libellé, ou par l'un de ses alias, sans tenir compte de la casse ni des accents. « Pas à pas : valider une commande » correspond à « Pas à pas ».
- Une section obligatoire absente est une **erreur bloquante** du build strict. Les autres sections du gabarit sont recommandées : `doc-kit audit` mesure combien sont présentes.
- `maxWords` est un **avertissement** de `doc-kit audit` : au-delà, découpez la page en sous-pages.
- `doc-kit new <page-id> --template <type>` crée la page depuis le gabarit, dans la langue du projet.
- **Variantes de capture.** Les gabarits `screen` et `editor` contiennent deux variantes de « L'écran » (et de « Ce que ça change »), entre des marqueurs `<!-- doc-kit:capture=app -->`, `<!-- doc-kit:capture=none -->` et `<!-- doc-kit:end -->`. `doc-kit new` et `doc-kit init` gardent la variante de `capture.mode` et retirent les marqueurs. Avec `capture.mode: "none"`, « L'écran » est un tableau `| Élément | Ce qu'il montre |` : une ligne par élément dans l'ordre de lecture (de haut en bas, puis de gauche à droite), le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet.
- Les consignes laissées dans une page (`<!-- consigne : … -->` en français, `<!-- guidance: … -->` en anglais) sont signalées par `doc-kit audit` et par le build strict. Écrivez la section, puis retirez sa consigne.
- Les listes de libellés `en` et `fr` ont la même longueur et le même ordre. `required` contient des positions dans ces listes : il est donc le même dans les deux langues.

Un exemple rédigé de chaque type, écrit pour Acme Orders, est indiqué sous `example` dans `templates.json`.

Légende des tableaux ci-dessous : **✱** = obligatoire.

## Vue d'ensemble

### Les 13 types d'origine (l'un ou l'autre espace, surtout Reprendre)

| Type | Partie habituelle | Sert à | Obligatoires | `maxWords` | Page d'exemple (Acme Orders) |
|---|---|---|---|---|---|
| `screen` | Utiliser, Administrer | Un écran et ses actions | 5 | 2 500 | `utiliser/commandes/liste` |
| `editor` | Administrer | Un éditeur et le mécanisme qu'il pilote | 6 | 3 000 | `administrer/validation/circuits` |
| `recipe` | Administrer | Un but atteint en enchaînant plusieurs éditeurs | 5 | 3 500 | `administrer/recettes/validation-en-deux-temps` |
| `technical` | Comprendre, ou tout sujet | Un sujet technique (page parente ou page seule) | 1 | 2 000 | `reprendre/securite` |
| `technical-sub` | Comprendre, ou tout sujet | Le détail d'un sujet technique | 0 | 2 000 | `reprendre/securite/connexion` |
| `journey` | Comprendre | Ce qui se passe de bout en bout | 5 | 2 000 | `reprendre/parcours-commande` |
| `journey-step` | Comprendre | Une étape d'un parcours | 5 | 2 200 | `reprendre/parcours-commande/validation` |
| `troubleshooting` | Risques | Du symptôme à la cause | 5 | 2 000 | `reprendre/diagnostic` |
| `troubleshooting-area` | Risques | Les symptômes d'un domaine | 2 | 2 000 | `reprendre/diagnostic/acces` |
| `findings` | Risques | Les constats numérotés, le registre des risques | 2 | 2 000 | `reprendre/points-attention` |
| `architecture` | Exploiter | L'implantation en production | 5 | 2 000 | `reprendre/dat` |
| `variables` | Exploiter | Les variables d'environnement | 2 | 2 200 | `reprendre/deploiement/variables` |
| `resources` | Exploiter | Les ressources du déploiement | 7 | 2 200 | `reprendre/deploiement/ressources` |

### Les 5 types de l'espace Métier (ARCHITECTURE.md §6.8)

| Type | Partie habituelle | Sert à | Obligatoires | `maxWords` | Page d'exemple (Acme Orders) |
|---|---|---|---|---|---|
| `feature` | Fonctionnalités | Une fonctionnalité : qui l'utilise, quand, ses règles | 5 | 2 500 | `fonctionnalites/validation-en-deux-temps` |
| `business-rules` | Fonctionnalités | Toutes les règles métier, au même endroit | 2 | 3 000 | `fonctionnalites/regles-metier` |
| `roles-matrix` | Fonctionnalités | Les rôles et ce que chacun peut faire | 3 | 2 000 | `fonctionnalites/roles` |
| `process` | Processus | Un processus métier de bout en bout | 4 | 2 200 | `processus/commande-a-encaissement` |
| `release-notes` | Processus | Ce qui a changé, version après version | 2 | 3 000 | `processus/notes-de-version` |

### Les 13 types de l'espace Reprise (ARCHITECTURE.md §6.9, §6.13, §6.14)

| Type | Partie habituelle | Sert à | Obligatoires | `maxWords` | Page d'exemple (Acme Orders) |
|---|---|---|---|---|---|
| `access-ownership` | Sécuriser | Qui possède quoi, et comment en faire la passation | 3 | 2 200 | `reprendre/acces-et-propriete` |
| `api-surface` | Sécuriser | Chaque route, son authentification, ses manques | 3 | 3 000 | `reprendre/surface-api` |
| `runbook` | Exploiter | Installer, construire, déployer, revenir en arrière, sauvegarder | 5 | 3 000 | `reprendre/manuel-exploitation` |
| `data-model` | Comprendre | Les tables, leurs données personnelles, leur conservation | 3 | 2 500 | `reprendre/modele-donnees` |
| `dependencies` | Maintenir | Les paquets utilisés, y compris ceux qui n'existent pas | 3 | 2 200 | `reprendre/dependances` |
| `code-map` | Comprendre | Conteneurs, composants, intégrations | 4 | 2 500 | `reprendre/carte-du-code` |
| `tests-quality` | Maintenir | Ce qui est réellement testé, et comment le lancer | 4 | 2 200 | `reprendre/tests-et-qualite` |
| `agent-instructions` | Maintenir | Chaque fichier d'instructions d'agent IA, règle par règle | 4 | 2 500 | `reprendre/instructions-agents` |
| `adr` | Comprendre | Une décision d'architecture reconstituée | 5 | 1 500 | `reprendre/architecture/adr-01-base-donnees` |
| `threat-model` | Sécuriser | Le schéma de flux, les menaces, les mesures d'atténuation | 4 | 3 000 | `reprendre/modele-menaces` |
| `security-review` | Sécuriser | Authentification, contrôle d'accès, constats OWASP | 7 | 3 000 | `reprendre/revue-de-securite` |
| `maintainability-review` | Maintenir | Notes, points chauds, recommandations par effort | 5 | 2 200 | `reprendre/revue-de-maintenabilite` |
| `documentation-cost` | Maintenir | Temps, agents, modèles et jetons consacrés à la documentation | 3 | 1 200 | `examples/documentation-cost` (doc du kit) |

---

## `screen` — Page d'écran

Un écran de l'application, vu par celui qui s'en sert : à quoi il sert, comment il marche, chaque élément annoté, les pièges, les droits.

| Section | | Contenu |
|---|---|---|
| À quoi ça sert | ✱ | Le besoin métier en 2 à 4 phrases ; un encadré NOTE « Où se trouve cet écran » (`[[menu …]]`, `[[route …]]`) |
| Comment ça marche | ✱ | Le mécanisme réel : serveur ou navigateur, ordre, limites ; un encadré MECANISME ; un tableau quand il y a plusieurs cas |
| L'écran | ✱ | Une capture `:::ecran` par panneau ; la légende a un élément par zone, de 1 à 3 phrases chacun. Sans captures (`capture.mode: "none"`) : un tableau `\| Élément \| Ce qu'il montre \|` par panneau, dans l'ordre de lecture |
| Chaque action | | Une `###` par action qui demande plus qu'une légende (fenêtre de dialogue, contrôle du serveur, entrée au journal d'audit) |
| Référence de chaque réglage | | `\| Réglage \| Contrôle \| Valeurs · défaut \| Effet \|` |
| Pas à pas | | `:::etapes`, la tâche la plus fréquente, titre « Pas à pas : <tâche> » |
| Cas d'usage courants | | 3 à 5 situations réelles, une ligne chacune |
| Pièges et limites à connaître | ✱ | Des encadrés ATTENTION, puis un encadré NOTE « Écarts constatés (vX.Y.Z) » |
| En production | | Ce qui est réellement paramétré en production, daté (utile sur les pages d'administration) |
| Droits requis | ✱ | Un encadré DROITS : voir, enregistrer, actions spéciales |

- **Longueur** : constatée entre 800 et 3 000 mots, médiane d'environ 1 500 ; limite 2 500.
- **Exemple** : la liste des commandes d'Acme Orders, avec cinq captures (dont quatre annotées, 21 zones en tout) ; la page des utilisateurs de l'administration, où « Chaque action » est traitée en sous-sections de « L'écran ».
- **Erreurs fréquentes** :
  - décrire l'écran sans dire d'où viennent les chiffres (« Comment ça marche » absent) ;
  - une légende qui paraphrase le libellé au lieu de donner les valeurs, le défaut et l'effet ;
  - « Pas à pas » **et** « Cas d'usage courants » qui disent la même chose : gardez l'un des deux ;
  - prendre le compteur affiché pour le total. Dans Acme Orders, « {n} commande(s) dans votre périmètre » compte les résultats filtrés, pas toutes les commandes.

## `editor` — Page d'éditeur

Un écran de configuration et, surtout, le mécanisme qu'il pilote : quand le réglage est lu, par qui, et ce qui change pour l'utilisateur final. C'est le gabarit des meilleures pages de référence.

| Section | | Contenu |
|---|---|---|
| À quoi ça sert | ✱ | Le besoin, et ce qui se passe **sans aucun réglage** ; un encadré NOTE « Où se trouve ce réglage » |
| Comment ça marche | ✱ | Un schéma SVG, un encadré MECANISME numéroté, des tableaux comparatifs (par exemple « Validation séquentielle ou parallèle ») |
| L'écran | ✱ | Une capture `:::ecran` par panneau ou par fenêtre de dialogue ; sans captures, un tableau `\| Élément \| Ce qu'il montre \|` chacun |
| Ce que ça change | | `::avant-apres`, ou une capture de l'écran utilisateur concerné ; sans captures, l'effet décrit d'après le code |
| Référence de chaque réglage | ✱ | Un tableau par groupe de réglages (`###`) ; bornes et défauts lus dans le code |
| Pas à pas | | La configuration la plus courante, jusqu'à la vérification qu'elle marche |
| Pièges et limites à connaître | ✱ | Des encadrés ATTENTION, puis un encadré NOTE « Écarts constatés » |
| Droits requis | ✱ | Voir et modifier ; exécuter ce que le réglage produit ; trace au journal d'audit |

- **Longueur** : constatée entre 800 et 3 900 mots, médiane de 1 700 à 2 300 ; limite 3 000.
- **« Ce que ça change » n'est pas obligatoire.** Sur une production capturée en lecture seule, on ne peut pas produire l'« après ». Sur un site capturé en lecture seule, 2 éditeurs sur 17 avaient cette section ; sur un site capturé sur une démo locale, presque tous l'avaient.
- **Erreurs fréquentes** :
  - typer `editor` une page de concepts ou un catalogue (par exemple la liste des widgets de tableau de bord) : elle n'a ni écran ni référence des réglages ; typez-la `technical`, ou ne la typez pas ;
  - oublier ce qui arrive aux objets **déjà existants** quand le réglage change. Dans Acme Orders : « Modifier un circuit de validation ne touche pas les commandes déjà en attente de validation » ;
  - omettre la trace d'audit des modifications.

## `recipe` — Recette de configuration

Un but concret atteint en enchaînant plusieurs éditeurs, parfois hors de l'application (base de données, infrastructure, fournisseur d'identité). Une recette renvoie aux pages d'éditeur pour le détail.

| Section | | Contenu |
|---|---|---|
| L'objectif | ✱ | Le résultat attendu ; un encadré RECETTE « Ce qu'il vous faut » |
| Qui fait quoi | | Les acteurs dans l'ordre (un schéma), ou le parcours en un coup d'œil |
| Étape 1 | ✱ | Puis `## Étape 2 — …` et ainsi de suite : une section par étape, « Étape n — verbe et objet » |
| Comment savoir que ça marche | ✱ | 4 à 6 vérifications observables |
| Erreurs fréquentes et remèdes | | `\| Symptôme \| Cause probable \| Remède \|`, avec les messages exacts |
| Pièges et limites à connaître | ✱ | Les pièges de l'enchaînement des étapes ; un encadré NOTE des écarts constatés |
| Droits requis | ✱ | Les droits de chaque acteur, y compris hors de l'application |

- **Longueur** : constatée entre 1 400 et 3 000 mots ; limite 3 500.
- **Exemple** : « Valider les grosses commandes en deux temps » dans Acme Orders : créer le groupe Finance dans le fournisseur d'identité, le faire correspondre à un rôle, ajouter un seuil de montant au circuit de validation, puis vérifier avec une commande de test (8 étapes, hors de l'application puis dans l'application).
- **Erreurs fréquentes** :
  - recopier le détail des réglages au lieu de renvoyer à la page d'éditeur ;
  - une étape sans « ce que l'on voit quand c'est réussi » ;
  - plusieurs recettes dans une page, sans objectif unique.

## `technical` — Page technique

Un sujet de la section Reprendre : sécurité, base de données, stockage, IA, intégrations, déploiement, exploitation, maintenance de la doc. C'est une page parente quand le sujet est découpé, une page seule sinon.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | La réponse courte, ou la liste numérotée des mécanismes, avec leurs noms réels |
| Dans cette partie | | Un tableau « Sous-page / Ce que vous y trouverez » ; **obligatoire dès que la page a des sous-pages** |
| Le schéma | | `::schema` et sa lecture |
| *(sections libres)* | | Un `##` par sujet, dans l'ordre où le code les enchaîne |
| Pièges et écarts constatés | | Des encadrés ATTENTION ; les écarts avec la documentation existante et avec la production ; des liens vers les constats numérotés |
| Pour aller plus loin | | 3 à 6 liens |

- **Longueur** : pages parentes constatées entre 550 et 1 850 mots ; limite 2 000. Des pages techniques jamais découpées ont atteint 5 400 mots, ce qui est trop long pour être lu.
- **Exemple** : `reprendre/securite` dans Acme Orders : « En bref » liste cinq mécanismes, tous côté serveur (la connexion par le fournisseur d'identité, le middleware, les permissions, le filtrage par périmètre, le journal d'audit), puis trois sous-pages.
- **Erreurs fréquentes** : un « En bref » qui annonce au lieu de répondre ; un sujet technique sans une seule preuve `fichier:ligne`. Sur le meilleur site, deux tiers des pages de Reprendre portent au moins une preuve.

## `technical-sub` — Sous-page technique

Le détail d'un sujet technique. Elle n'a pas d'« En bref » : la page parente le porte. Le corps est libre : un `##` par mécanisme, dans l'ordre d'exécution.

| Section | | Contenu |
|---|---|---|
| *(schéma en tête, facultatif)* | | `::schema` avant le premier titre |
| *(sections libres)* | | Un `##` par mécanisme : un tableau Valeur / Effet, `:::etapes`, des preuves |
| Pour aller plus loin | | Les pages sœurs et la page parente |

- **Longueur** : constatée entre 380 et 1 200 mots ; limite 2 000.
- **Exemple** : `reprendre/securite/connexion` dans Acme Orders : « ## Le déroulé de la connexion », « ## Le fournisseur d'identité », « ## La correspondance entre groupes et rôles », « ## La session ».
- **Erreur fréquente** : garder un « ci-dessous » qui visait la page parente avant le découpage.

## `journey` — Parcours de bout en bout

Ce qui se passe réellement, de bout en bout, quand quelqu'un fait l'action principale du produit : déclencheurs, écritures, services appelés, ce qui est automatique et ce qui attend une personne. C'est la page parente d'une suite de pages `journey-step`.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | La réponse courte ; un encadré MECANISME « Que se passe-t-il quand… ? » |
| Le schéma | ✱ | Trait plein = enchaîné ; pointillé = attend une personne ; couleur d'alerte = tâche planifiée |
| Dans cette partie | ✱ | `\| Étape \| Déclencheur \| Automatique ou humain \| Ce qui change \|` |
| Les états | | Un tableau étape × objet, avec les valeurs du code et les libellés affichés |
| Ce qui se fait tout seul, et ce qui attend quelqu'un | | Deux listes ; ce qui dépend d'un planificateur |
| Les surprises à connaître | ✱ | 6 à 10 points, chacun avec son constat et sa sous-page |
| Pour aller plus loin | ✱ | Architecture, dossier d'architecture technique (DAT), écrans, le parcours guidé de l'accueil correspondant |

- **Longueur** : constatée entre 1 450 et 1 900 mots ; limite 2 000.
- **Exemple** : `reprendre/parcours-commande` dans Acme Orders : une commande en 6 étapes (création, soumission, validation, facturation, paiement, archivage). D'autres parcours valent la peine d'être écrits pour un tel produit : la réponse de l'assistant, un nouveau compte, la relance d'une facture en retard, un chiffre d'un tableau de bord.
- **Erreurs fréquentes** : décrire l'écran au lieu du mécanisme ; redécrire un constat au lieu de citer son numéro.

## `journey-step` — Étape d'un parcours

Une étape, au niveau du code : chaque ligne d'exécution, ce qui est lu et écrit, ce que voit l'utilisateur, ce qui casse.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Déclencheur, acteur, synchrone ou non, durée, résultat |
| Ce qui se passe, pas à pas | ✱ | `:::etapes`, chaque étape avec son `fichier:ligne` |
| Ce qui est lu et écrit | | `\| Où \| Quoi \| Quand \|` |
| Les états | | `\| Statut \| Libellé affiché \| Que faire \|` |
| Ce que voit l'utilisateur | ✱ | Une capture existante, ou une description ; ce que l'écran ne montre pas |
| Quand ça se passe mal | ✱ | `\| Message \| Origine \| Reprise \|` ; ce qui reste écrit à moitié |
| Pour aller plus loin | ✱ | La page technique, l'écran, l'étape suivante |

- **Longueur** : constatée entre 1 450 et 2 100 mots ; limite 2 200.
- **Exemple** : `reprendre/parcours-commande/validation` dans Acme Orders : 11 étapes d'exécution, 4 cas de circuit de validation (aucun, unique, séquentiel, par montant), 7 messages d'erreur.
- **Erreurs fréquentes** : citer une fonction sans sa ligne ; omettre l'état laissé par un échec.

## `troubleshooting` — Diagnostic par symptôme

L'entrée « ça ne marche pas » : les vérifications qui expliquent la moitié des symptômes, puis où regarder, puis un domaine par sous-page.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Ce que propose cette partie ; un encadré MECANISME « Trois réflexes » |
| Le schéma | | Questions préalables, familles de symptômes |
| Avant tout | ✱ | « Avant tout : les vérifications qui expliquent la moitié des symptômes » : `\| Vérification \| Où regarder \| Ce qui piège \|` |
| Où regarder | ✱ | Écrans d'administration, codes du journal d'audit, préfixes des journaux du serveur, requêtes de journaux prêtes à l'emploi |
| Dans cette partie | ✱ | `\| Sous-page \| Symptômes traités \| Constats principaux \|` |
| Pour aller plus loin | ✱ | Points d'attention, parcours, exploitation |

- **Longueur** : environ 1 450 mots sur le meilleur site ; limite 2 000.
- **Exemple** : `reprendre/diagnostic` dans Acme Orders : 7 vérifications, 4 requêtes de journaux, 4 domaines (accès, validations, factures, l'assistant).
- **Erreur fréquente** : des requêtes de journaux qui n'ont jamais été exécutées. Vérifiez chaque nom de table et de colonne dans la documentation de la plateforme de journalisation, et datez la vérification.

## `troubleshooting-area` — Domaine de diagnostic

Les symptômes d'un domaine, regroupés selon le moment du parcours de l'utilisateur où ils apparaissent. Chaque symptôme a toujours les quatre mêmes rubriques.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | 3 à 5 mécanismes qui expliquent presque tout |
| *(familles de symptômes)* | | Un `##` par moment (« Se connecter », « Voir », « Agir… ») ; un `###` par symptôme, avec le message exact entre guillemets ; **Causes probables** (numérotées, avec preuve), **Vérifier**, **Corriger**, **Comprendre** |
| Pour aller plus loin | ✱ | La page parente, les parcours, les constats |

- **Longueur** : constatée entre 1 400 et 1 600 mots ; limite 2 000.
- **Exemple** : `reprendre/diagnostic/acces` dans Acme Orders : « Se connecter », « Voir », « Agir et changer les droits ».
- **Erreur fréquente** : un symptôme formulé avec le vocabulaire du code au lieu des mots de l'utilisateur.

## `findings` — Points d'attention

La liste de travail de celui qui reprend le projet : écarts, risques et dettes, revérifiés dans le code, numérotés et classés. Le nom anglais de cette page est « Findings ».

| Section | | Contenu |
|---|---|---|
| Comment lire cette page | ✱ | Périmètre, version vérifiée, sources ; le tableau des gravités avec les nombres ; la règle de numérotation |
| L'essentiel en une minute | ✱ | 4 à 6 actions prioritaires, avec les numéros des constats |
| Dans cette partie | | Une sous-page par famille : production (P), critiques (C), importants (I), mineurs (M), sans effet (R en français, N en anglais) |
| Les points déjà corrigés | | Les constats d'audits précédents vérifiés comme corrigés, avec la preuve |
| Ce qui n'a pas pu être vérifié | | Les questions à poser à l'équipe |
| La documentation existante à ne plus suivre | | `\| Document \| État \| Remplacé par \|` |

- **Longueur** : environ 1 200 mots pour la page parente ; limite 2 000. Les sous-pages n'ont pas de type.
- **Format d'un constat** :
  - critique : `## C1 — titre`, puis **Constat**, **Impact**, **Recommandation** ;
  - les autres : un tableau `\| N° \| Point \| Où \| Constat et impact \| Recommandation \|` ; les familles production et sans effet ajoutent une colonne **Gravité**.
- **Numérotation** : voir [writing.fr.md](writing.fr.md#9-la-numérotation-des-constats). Les numéros ne changent jamais.
- **Exemple** : `reprendre/points-attention` dans Acme Orders et ses six sous-pages. Le découpage compte ici : le même contenu gardé sur une seule page atteignait environ 10 800 mots.
- **Erreurs fréquentes** : renuméroter les constats (les numéros sont cités partout) ; un constat sans sa preuve `fichier:ligne` ; mélanger un défaut du code et un réglage de production.

## `architecture` — Dossier d'architecture technique (DAT)

L'implantation en production, reconstituée à partir du portail du fournisseur cloud, de l'infrastructure as code et du code. Elle ne remplace pas un dossier d'architecture validé par l'équipe d'infrastructure. Le nom anglais est « Technical architecture document ».

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | 6 à 8 puces ; un encadré NOTE « Comment lire ce dossier » (d'après le portail, infrastructure as code, déduit, à confirmer) |
| Dans cette partie | | Sous-pages : réseau et secrets ; données, sauvegarde et supervision |
| Le schéma | ✱ | `::schema`, ou l'image fournie par l'équipe d'architecture, annotée en `:::ecran` |
| Les flux numérotés | ✱ | `\| N° \| De → vers \| Protocole \| Authentification \| Données et code \|` ; un encadré NOTE « Ce que le tableau laisse ouvert » |
| Les composants | | `\| Composant \| Nom en production \| Rôle \| Pour aller plus loin \|` |
| Ce que le DAT ne montre pas | ✱ | Un encadré NOTE « À confirmer avec l'équipe d'infrastructure » |
| Qui gère quoi | ✱ | Un encadré DROITS « Responsabilités » |

- **Longueur** : constatée entre 1 750 mots (avec deux sous-pages) et 2 850 mots (sans) ; limite 2 000.
- **Exemple** : `reprendre/dat` dans Acme Orders : 15 flux, dont 3 absents ou qui ne fonctionnent pas.
- **Erreur fréquente** : présenter une valeur de l'infrastructure as code comme constatée en production.

## `variables` — Variables d'environnement

Les variables réellement déclarées sur le service de production, confrontées au code et à l'infrastructure as code. Les valeurs ne sont jamais recopiées.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Nombre, sources, références au coffre de secrets, absences qui ont un effet ; un encadré NOTE « Les sources de cette page » |
| Les variables, une par une | | Une `###` par famille ; `\| Variable \| Source \| Lue par le code \| Rôle et valeur attendue \| Remarque \|` |
| Absentes ou sans effet | | Les variables lues mais absentes ; les variables définies sans effet (peut être une sous-page) |
| À vérifier | ✱ | `:::etapes` : ce qu'il faut regarder la prochaine fois que quelqu'un ouvre le portail |

- **Longueur** : environ 1 850 mots ; limite 2 200.
- **Exemple** : `reprendre/deploiement/variables` dans Acme Orders : 28 variables, dont 7 références au coffre de secrets.
- **Erreur fréquente** : mettre le nombre dans le titre. « Les 28 variables, une par une » ne commence pas par « Les variables » : la section n'est plus reconnue. C'est pourquoi cette section n'est pas obligatoire. Le nombre va dans « En bref ».

## `resources` — Ressources du déploiement

Les ressources du déploiement de production, par famille, et ce qui se sert réellement de chacune. Le **groupe** est l'unité qui contient le déploiement : un groupe de ressources sur Azure, un projet sur Google Cloud, un compte, une pile (stack) ou un ensemble de ressources étiquetées sur AWS.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | `\| Famille \| Nombre \| Ressources \|` ; un encadré NOTE « D'où viennent ces ressources » |
| Calcul | ✱ | `\| Ressource \| Type \| Rôle \| Ce qui s'en sert \|` |
| Données | ✱ | Bases de données et stockage, y compris le stockage de l'état de l'infrastructure as code |
| Secrets | ✱ | Le coffre de secrets, ses secrets par nom |
| Réseau | | Points d'accès privés, trafic entrant et sortant |
| Supervision | ✱ | Ce que chaque outil reçoit réellement |
| Sauvegarde | ✱ | Ce qui sauvegarde chaque donnée, et ce qui ne la protège pas |
| Comparaison avec la documentation | | Les écarts avec la documentation de déploiement du dépôt |
| Ce que l'application utilise hors de ce groupe | ✱ | Identité, passerelles, registres, services internes |

- **Longueur** : environ 2 050 mots ; limite 2 200.
- **Exemple** : `reprendre/deploiement/ressources` dans Acme Orders : 24 ressources en 6 familles.
- **Erreur fréquente** : lister les ressources sans dire ce qui s'en sert. Une ressource inutilisée qui détient encore des droits est un constat (famille production).

---

# Les types de l'espace Métier (ARCHITECTURE.md §6.8)

Ces 5 types décrivent **chaque fonctionnalité** pour les personnes qui l'utilisent, en décident ou la
soutiennent : pas de code, pas de preuve `fichier:ligne` (voir « Les pages métier ne citent pas de code »
plus bas). Ils suivent la structure des cas d'utilisation de Cockburn (acteurs, déclencheur, scénario
principal, variantes numérotées) et les règles métier de RuleSpeak (un énoncé, un exemple « Étant donné /
Quand / Alors »).

## `feature` — Fiche de fonctionnalité

Une fonctionnalité, de bout en bout, pour un lecteur métier : qui l'utilise, quand elle démarre, ce qu'elle
fait pas à pas, et les règles qu'elle impose. Porte l'identifiant `feature` de la page (`toc.json`, par
exemple `"feature": "F-01"`) et, quand un pendant technique existe, son `counterpart`.

| Section | | Contenu |
|---|---|---|
| Accès | ✱ | Un tableau à deux colonnes, lignes fixes : Module · Qui peut l'utiliser (`[[droit …]]`) · Prérequis · Vérifié le (version, date) |
| À quoi ça sert | ✱ | Le besoin métier en 2 à 4 phrases ; le titre de la page en gras dans la première phrase |
| Qui l'utilise | ✱ | Une ligne par rôle : « **Rôle** : ce qu'il fait » |
| Déclencheur et prérequis | | Facultatif ; à supprimer quand le déclencheur est simplement « quelqu'un ouvre l'écran » |
| Scénario principal | ✱ | `:::etapes` ; une capture `:::ecran` ou `::capture` seulement quand elle éclaire une étape (ni l'une ni l'autre n'est obligatoire ici) |
| Variantes et exceptions | | Numérotées après l'étape dont elles bifurquent : « 3a. Si … » |
| Règles métier | ✱ | Les règles propres à cette fonctionnalité, définies avec `:::regle` ; une règle partagée est seulement citée avec `[[regle …]]` |
| Données traitées | | Les données métier lues ou modifiées, nommées comme les connaît un lecteur métier — jamais un nom de table ou de colonne |
| Notifications et effets | | Ce que la fonctionnalité déclenche au-delà de l'écran : un e-mail, une entrée ailleurs, un compteur qui change |
| Limites | | Ce que la fonctionnalité ne fait délibérément pas, en termes métier, jamais un piège de code |
| Questions fréquentes | | 2 à 5 questions réelles, chacune avec une réponse courte et directe |

- **Longueur** : limite 2 500 mots ; la plupart des fiches restent bien en dessous — une fonctionnalité qui en
  demande plus est souvent plusieurs fonctionnalités, ou relève en partie de `process`.
- **Exemple** : `fonctionnalites/validation-en-deux-temps` dans Acme Orders : qui peut relever le seuil, les
  deux étapes de validation, ce qui arrive à une commande déjà en attente quand le circuit change.
- **Erreurs fréquentes** :
  - une preuve `fichier:ligne` qui se glisse dans le texte (`business.technical`, avertissement) : déplacez-la
    vers le `counterpart` ;
  - décrire l'écran au lieu de la fonctionnalité — ce doublon relève de `screen` ou `editor`, cité par un lien,
    pas réécrit ici ;
  - une fiche de fonctionnalité sans identifiant `feature` (`feature.noId`, avertissement) : `::fonctionnalites{}`
    et `[[fonctionnalite …]]` ne la retrouvent pas.

## `business-rules` — Règles métier

Toutes les règles métier réunies au même endroit, même si la plupart sont **définies** sur la fiche de
fonctionnalité à laquelle elles appartiennent et seulement **citées** ici. Utile dès que des règles sont
partagées entre plusieurs fonctionnalités, ou dès qu'un lecteur veut la liste complète sans ouvrir chaque
fiche.

| Section | | Contenu |
|---|---|---|
| Comment lire cette page | ✱ | Où vit la définition complète d'une règle (sa fiche de fonctionnalité, ou ici quand elle n'en a pas) ; le système d'id (`RG-01`…) |
| Les règles | ✱ | `::regles{}` : chaque règle définie, où elle est définie, et les fonctionnalités qui la citent |
| Les règles par fonctionnalité | | Facultatif ; les mêmes règles regroupées par fonctionnalité plutôt que listées à plat |
| Règles retirées | | Facultatif ; une règle retirée du produit, gardée ici pour qu'une citation ailleurs reste compréhensible |

- **Longueur** : limite 3 000 mots ; un tableau généré (`::regles{}`) reste court quel que soit le nombre de
  règles.
- **Exemple** : `fonctionnalites/regles-metier` dans Acme Orders : les seuils de validation, la date limite de
  facturation, le plafond de crédit client — chacune définie une fois, citée depuis plusieurs fiches.
- **Erreur fréquente** : redéfinir ici une règle déjà définie sur une fiche de fonctionnalité (`rule.duplicate`,
  erreur) : citez-la avec `[[regle …]]` à la place.

## `roles-matrix` — Matrice des rôles

Les rôles du produit et ce que chacun peut faire, lus d'un seul coup sur toutes les fonctionnalités — la page
que le support ouvre en premier quand quelqu'un dit « je ne vois pas le bouton ».

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de rôles, et la règle qui explique l'essentiel de ce que les gens ne peuvent pas faire |
| Les rôles | ✱ | Une ligne par rôle : qui le détient, en quoi il diffère du plus proche |
| Qui peut faire quoi | ✱ | `::roles{}` : un tableau généré, lignes = fiches de fonctionnalité, colonnes = permissions |
| Responsabilités | | Facultatif ; ce dont un rôle répond au-delà de l'application elle-même |
| Comment obtenir un rôle | | Facultatif ; le processus réel : un formulaire, l'accord d'un responsable, un groupe du fournisseur d'identité |

- **Longueur** : limite 2 000 mots ; le tableau généré porte l'essentiel du contenu.
- **Exemple** : `fonctionnalites/roles` dans Acme Orders : Commercial, Validateur, Finance, Administrateur,
  chacun une colonne de `::roles{}`.
- **Erreur fréquente** : un tableau écrit à la main qui dérive des `permissions` des fiches de fonctionnalité ;
  préférez `::roles{}`, reconstruit à partir d'elles chaque fois.

## `process` — Processus

Un processus métier de bout en bout, en langage métier : qui y prend part, les étapes, ce qui est automatique
et ce qui attend une personne. L'équivalent, côté métier, d'un `journey`, sans le code.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | La réponse courte : ce qui déclenche le processus, et ce qu'il produit |
| Qui intervient | ✱ | Les rôles concernés, dans l'ordre où ils agissent |
| Les étapes | ✱ | `:::etapes`, ou un tableau ; une étape par action métier, pas par clic d'écran |
| Les états | | Les états nommés de l'objet que le processus traverse, en langage métier |
| Ce qui se fait tout seul, et ce qui attend quelqu'un | ✱ | Deux listes |
| Délais et relances | | Ce qui déclenche une relance, et après combien de temps |
| Quand ça se passe mal | | Ce que voit un rôle quand le processus ne peut pas continuer, et qui prévenir |
| Fonctionnalités concernées | | Liens vers les fiches de fonctionnalité que ce processus utilise, dans l'ordre |

- **Longueur** : limite 2 200 mots.
- **Exemple** : `processus/commande-a-encaissement` dans Acme Orders : d'une commande créée par un commercial
  jusqu'à l'encaissement enregistré par Finance, en citant `fonctionnalites/validation-en-deux-temps` et la
  fonctionnalité de facturation au passage.
- **Erreur fréquente** : décrire une seule fonctionnalité au lieu de l'enchaînement de plusieurs — un
  « processus » à une seule fonctionnalité est une page `feature` avec un meilleur titre.

## `release-notes` — Notes de version

Ce qui a changé, version après version, pour les personnes qui utilisent le produit plutôt que celles qui
l'ont construit : pas de message de commit, pas de refactorisation interne, seulement ce qu'un utilisateur ou
un administrateur remarque.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Jusqu'où remonte cette page, et où demander pour tout ce qui est plus ancien |
| Dernière version | ✱ | Ce qui a changé, en langage métier, chaque entrée nommant la fonctionnalité concernée |
| Versions précédentes | | Un sous-titre par version, la plus récente en premier |

- **Longueur** : limite 3 000 mots ; découpez en sous-page par année une fois que « Versions précédentes »
  dépasse cette limite.
- **Exemple** : `processus/notes-de-version` dans Acme Orders : « v2.4.0 — Les circuits de validation peuvent
  désormais se ramifier par montant (voir Validation en deux temps) ».
- **Erreur fréquente** : recopier le journal des modifications technique tel quel — réécrivez chaque entrée
  pour le lecteur qui ne voit jamais un commit.

**Les pages métier ne citent pas de code.** Une page dont l'espace effectif est `business` et qui contient
encore une preuve `fichier:ligne` reçoit l'avertissement `business.technical` : déplacez le détail vers le
`counterpart` de la page, la fiche technique de la même fonctionnalité.

---

# Les types de l'espace Reprise (ARCHITECTURE.md §6.9, §6.13)

Ces 13 types forment le dossier dont une équipe a besoin pour reprendre une application, surtout une
application largement écrite par des agents IA (« vibe-codée »). Chaque affirmation est appuyée par une preuve
`fichier:ligne`, ou marquée `[[deduit]]` ou `[[inconnu]]` (voir [writing.fr.md](writing.fr.md)). Les deux
derniers, `security-review` et `maintainability-review`, sont des revues optionnelles à la demande (§6.13) :
voir leurs propres gabarits (`templates/pages/<langue>/security-review.md`, `maintainability-review.md`) et
exemples travaillés pour le détail de leurs sections.

## `access-ownership` — Accès et propriété

Qui détient quoi, et les étapes concrètes pour en recevoir réellement la charge : la page par laquelle une
passation commence.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Qui contacter en premier pour quoi, et la confiance globale dans cette cartographie |
| Qui possède quoi | ✱ | Une ligne par actif : domaine, dépôt, hébergement, CI/CD, base de données, paiement, e-mail, chaque compte d'outil IA |
| Secrets et où ils vivent | | Chaque endroit où vit un secret — jamais la valeur ; recoupé avec `facts/secrets.json` |
| Comptes des outils IA | | Chaque compte d'assistant IA de codage utilisé sur ce code, qui le détient, quels accès il porte |
| Propriétaires inconnus | ✱ | Chaque actif ci-dessus dont le propriétaire est inconnu, répété ici pour qu'il ne soit pas oublié |
| Checklist de passation | | Les étapes concrètes : réinitialiser les secrets partagés, créer des comptes nominatifs, révoquer les accès de l'équipe précédente |

- **Longueur** : limite 2 200 mots.
- **Exemple** : `reprendre/acces-et-propriete` dans Acme Orders : la base de production et le fournisseur de
  paiement ont un propriétaire nommé ; la moitié des variables CI/CD n'en ont pas.
- **Erreur fréquente** : un « Propriétaire : l'équipe précédente » sans nom ni moyen de la contacter — c'est un
  propriétaire inconnu, dites-le.

## `api-surface` — Surface d'API

Chaque route exposée par l'application, avec un jugement sur son authentification, son contrôle de rôle et son
isolation par locataire — construite à partir de `::facts{source="api"}`, puis complétée à la main.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de routes, combien sont publiques, l'état global de l'isolation par locataire |
| Les routes | ✱ | `::facts{source="api"}`, complété : Méthode · Route · Authentification · Rôle · Isolation par locataire · Preuve |
| Règles d'accès à la base de données | | Les politiques de sécurité au niveau ligne qui appuient l'isolation annoncée ci-dessus, ou leur absence |
| Routes publiques | | Chaque route accessible sans authentification, et pourquoi |
| Manques | ✱ | Une route sans contrôle visible, citée comme constat numéroté |

- **Longueur** : limite 3 000 mots.
- **Exemple** : `reprendre/surface-api` dans Acme Orders : 61 routes, 3 publiques (vérification de santé,
  webhook, la page publique de suivi de commande), un manque (`C1`, une route qui fait confiance à un id de
  locataire fourni par le client).
- **Erreur fréquente** : faire confiance au nom d'une route plutôt qu'à son code — une route nommée
  `/admin/...` sans contrôle de rôle dans `api.py` est un manque, pas une garantie.

## `runbook` — Manuel d'exploitation (runbook)

Comment installer, construire, déployer, revenir en arrière et sauvegarder l'application, lu dans le pipeline
et les scripts réels, jamais de mémoire.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Les une ou deux commandes qui installent et démarrent l'application en local |
| Installation | ✱ | Commandes exactes, versions nécessaires, fichiers qu'elles lisent |
| Construction | | Facultatif ; la commande de build, ce qu'elle produit, combien de temps elle prend |
| Déploiement | ✱ | Le chemin réel de déploiement, avec le `fichier:ligne` de la définition du pipeline |
| Retour arrière | ✱ | Comment annuler un déploiement raté |
| Tâches planifiées | | Chaque tâche planifiée (cron), ce qu'elle fait, ce qui se passe quand elle échoue en silence |
| Sauvegarde et restauration | ✱ | Où sont prises les sauvegardes, à quelle fréquence, et la procédure réelle de restauration |
| Quand ça casse | | Les premières vérifications pour les incidents les plus fréquents |

- **Longueur** : limite 3 000 mots.
- **Exemple** : `reprendre/manuel-exploitation` dans Acme Orders : le pipeline déploie à chaque push sur `main`
  (`[[verifie .github/workflows/deploy.yml:1]]`) ; le retour arrière redéploie l'image précédente depuis le
  registre.
- **Erreur fréquente** : une « Sauvegarde et restauration » qui dit seulement que des sauvegardes existent —
  dites si une restauration a vraiment été testée, et quand.

## `data-model` — Modèle de données

Les tables telles que la base de données les a réellement, pas telles qu'un vieux schéma entité-association
s'en souvient, avec un œil sur les données personnelles et leur conservation.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de tables, et l'état global du traitement des données personnelles |
| Le schéma | | `::schema`, construit ou confirmé à partir de `schema.prisma`, des modèles SQLAlchemy ou des migrations |
| Tables | ✱ | Une ligne ou sous-section par table : colonnes, relations, `fichier:ligne` |
| Données personnelles | ✱ | Quelles tables et colonnes portent des données personnelles, et la base légale si elle est connue |
| Conservation | | Combien de temps chaque type de donnée personnelle est gardé, et ce qui l'applique (une tâche, rien encore) |
| Sous-traitants | | Les tiers qui reçoivent des données personnelles (un fournisseur d'e-mail, un outil d'analytics) |
| Migrations | | Comment les changements de schéma sont faits, et le retard de ceux qui restent à appliquer |

- **Longueur** : limite 2 500 mots.
- **Exemple** : `reprendre/modele-donnees` dans Acme Orders : 22 tables ; l'e-mail et l'adresse du client sont
  des données personnelles sans politique de conservation documentée (`M3`).
- **Erreur fréquente** : décrire les modèles de l'ORM au lieu de la base réelle — une migration jamais
  appliquée en production désynchronise les deux ; dites laquelle vous avez vérifiée.

## `dependencies` — Dépendances

Les paquets réellement utilisés par l'application, y compris ceux qui n'existent plus — un constat fréquent et
dangereux dans le code généré par IA (un nom de paquet halluciné, enregistré plus tard par quelqu'un d'autre :
risque de chaîne d'approvisionnement).

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de dépendances directes, et si un paquet a été vérifié auprès du registre |
| Dépendances directes | ✱ | D'après `facts/dependencies.json` ; écosystème, version, licence quand elle est connue |
| Paquets qui n'existent pas | ✱ | Chaque dépendance que `doc-kit facts --network` n'a pas trouvée dans son registre — un constat `C` chacune |
| Licences | | Les licences qui limitent la distribution ou exigent une attribution |
| Obsolètes | | Les dépendances directes en retard de plusieurs versions majeures |
| À vérifier | | Les dépendances dont le rôle dans le code n'était pas évident |

- **Longueur** : limite 2 200 mots.
- **Exemple** : `reprendre/dependances` dans Acme Orders : 84 dépendances directes ; l'une, importée une seule
  fois, n'existe pas dans le registre npm (`C2`).
- **Erreur fréquente** : passer « Paquets qui n'existent pas » parce que l'application tourne bien en local —
  un paquet halluciné ne casse qu'une installation *propre*, exactement ce qu'une reprise fait en premier.

## `code-map` — Carte du code

La forme du code en un coup d'œil : les conteneurs, avec quoi chacun est construit, comment ils s'appellent
entre eux — la carte façon C4 qu'un nouveau développeur dessine sa première semaine, déjà dessinée.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de conteneurs, et le schéma dominant (un monolithe, un front plus une API, plusieurs services) |
| Contexte | ✱ | `::schema` : l'application et les systèmes externes avec qui elle parle |
| Conteneurs | ✱ | Un par unité déployable : sa pile, son rôle, qui l'appelle |
| Composants | ✱ | À l'intérieur du ou des conteneurs principaux : les couches et le sens de leurs appels |
| Intégrations | | Chaque service externe appelé, et pour quoi |
| Code dupliqué ou mort | | Le code qui existe deux fois avec une dérive, ou que plus rien n'appelle |

- **Longueur** : limite 2 500 mots.
- **Exemple** : `reprendre/carte-du-code` dans Acme Orders : un conteneur Next.js (écrans, routes API, actions
  serveur) et un conteneur de tâches planifiées partageant la même base de données.
- **Erreur fréquente** : un schéma de composants copié d'un starter générique de framework — vérifiez chaque
  flèche contre un import ou un appel réseau réel.

## `tests-quality` — Tests et qualité

Ce qui est réellement testé, par opposition à ce que le nom d'un fichier de test promet — un écart fréquent et
coûteux dans le code généré par IA (un test qui n'affirme rien, ou qui simule ce qu'il prétend vérifier).

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de tests, et le chiffre de couverture global s'il existe |
| Ce qui est testé | ✱ | D'après `facts/tests.json` : fichiers, nombres, rapport de couverture s'il y en a |
| Parcours critiques | ✱ | Les parcours les plus importants, et si chacun a un vrai test |
| Tests qui ne testent rien | | Un test qui passe toujours, n'affirme rien, ou simule la chose même qu'il prétend vérifier |
| Comment les lancer | ✱ | La commande exacte, et ce à quoi ressemble une exécution propre |

- **Longueur** : limite 2 200 mots.
- **Exemple** : `reprendre/tests-et-qualite` dans Acme Orders : 340 tests, 61 % de couverture d'instructions ;
  la suite de tests des circuits de validation simule le service de validation lui-même, donc ne teste rien de
  la validation (`I9`).
- **Erreur fréquente** : citer un pourcentage de couverture sans avoir lancé la suite — un badge périmé dans un
  README n'est pas une mesure.

## `agent-instructions` — Fichiers d'instructions des agents

Chaque fichier d'instructions lu par un assistant IA de codage (`AGENTS.md`, `CLAUDE.md`, un fichier
`.cursorrules`…), règle par règle, confronté à ce que le code fait réellement — ces fichiers agissent comme une
spécification cachée, et dérivent souvent du code qu'ils étaient censés piloter.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de fichiers d'instructions, leur taille globale, si quelque chose de caché a été trouvé |
| Les fichiers | ✱ | `::faits{source="agents"}` : une ligne par fichier, sa taille |
| Chaque règle | ✱ | Une ligne par règle énoncée : son statut une fois vérifiée — confirmée, obsolète, contredite |
| Caractères invisibles | ✱ | Tout caractère invisible pour un relecteur humain, trouvé dans un fichier d'instructions — un piège connu d'injection de prompt |
| Ce qu'il faut garder | | Une fois chaque règle statuée, ce qu'il faut verser dans cette documentation, ce qu'il faut abandonner |

- **Longueur** : limite 2 500 mots.
- **Exemple** : `reprendre/instructions-agents` dans Acme Orders : un `CLAUDE.md`, 340 mots ; une règle
  (« toujours filtrer par locataire ») contredite par une route (`C1`, également listée sur `api-surface`).
- **Erreur fréquente** : traiter le fichier d'instructions comme de la documentation au lieu de l'auditer —
  une règle que le code ne suit plus est un constat, pas un fait.

## `adr` — Fiche de décision d'architecture (ADR)

Une décision reconstituée, dans le format ADR classique, pour un choix que le code révèle mais que personne
n'a écrit — une sous-page de la page `technical` ou `architecture` qu'elle concerne.

| Section | | Contenu |
|---|---|---|
| Statut | ✱ | Proposée, acceptée, remplacée — au mieux de ce qu'on peut dire après coup |
| Contexte | ✱ | Le problème auquel la décision répond, tel que le code et l'historique des commits le suggèrent |
| Décision | ✱ | Ce qui a été choisi |
| Conséquences | ✱ | Ce que cela a rendu plus facile, plus difficile, ou impossible par la suite |
| Comment elle a été reconstituée | ✱ | À partir de quel code, quels commits ou quelles personnes cette page est construite |

- **Longueur** : limite 1 500 mots ; une ADR qui la dépasse est en général deux décisions.
- **Exemple** : `reprendre/architecture/adr-01-base-donnees` dans Acme Orders : pourquoi une base de données
  unique et partagée sert chaque locataire (sécurité au niveau ligne, pas une base par locataire) —
  reconstituée à partir des migrations et d'une description de pull request survivante.
- **Erreur fréquente** : présenter une supposition comme la décision — dites franchement quand « Comment elle
  a été reconstituée » se résume à « déduit du code seul, personne ne l'a confirmé ».

## `threat-model` — Modèle de menaces

Les menaces STRIDE de l'application, organisées par les frontières de confiance de son schéma de flux de
données — la pièce maîtresse sécurité du dossier de reprise.

| Section | | Contenu |
|---|---|---|
| En bref | ✱ | Combien de frontières de confiance, et la confiance globale dans ce modèle |
| Le schéma de flux de données | ✱ | `::schema` : acteurs, processus, magasins de données, frontières de confiance |
| Frontières de confiance | ✱ | Chaque frontière traversée par le schéma, et ce qui est censé la garder |
| Menaces | ✱ | STRIDE, regroupées par frontière de confiance ; chacune avec une gravité et une cause |
| Mesures d'atténuation | | Ce qui garde réellement contre chaque menace aujourd'hui, avec sa preuve |
| Risques acceptés | | Une menace que le propriétaire a décidé d'accepter, avec qui a décidé et quand |

- **Longueur** : limite 3 000 mots.
- **Exemple** : `reprendre/modele-menaces` dans Acme Orders : 4 frontières de confiance ; la frontière
  navigateur-API a une menace d'altération non atténuée sur le total de la commande (`C3`, également sur
  `api-surface`).
- **Erreur fréquente** : un tableau STRIDE générique copié d'un modèle, sans frontière ni preuve — chaque ligne
  a besoin de la frontière réelle du schéma qu'elle menace.

---

## Pages sans type

Toutes les pages n'ont pas de gabarit. Ne déclarez pas `template` pour :
- une sous-page d'écran ou d'éditeur ;
- une sous-page de points d'attention (elle suit le format de constat décrit plus haut) ;
- une page de concepts, un catalogue ou une annexe.

`adr` est la seule sous-page typée, même si elle se trouve sous une page parente `technical` ou
`architecture` : chaque fiche de décision est contrôlée sur ses propres sections obligatoires, indépendamment
de sa parente.

## Variantes de titre

Le build reconnaît une section par le début de son titre. Quelques variantes sont acceptées comme **alias** (`aliases` dans `templates.json`), parce qu'elles étaient fréquentes sur de vrais sites :

| Libellé | Variantes acceptées |
|---|---|
| "What it is for" | "What it's for", "What this screen is for", "What this editor is for" |
| "Pitfalls and limits" | "Pitfalls", "Known limits" |
| « À quoi ça sert » | « À quoi sert » (« À quoi sert l'écran », « À quoi sert cet onglet ») |
| « Pièges et limites à connaître » | « Pièges et limites », « Pièges » |

Les autres variantes ne sont pas reconnues : « Référence » seule au lieu de « Référence de chaque réglage », « En bref » au lieu de « Comment lire cette page » sur une page de points d'attention, un nombre en début de titre. Avant de déclarer `template` sur une page existante, renommez le titre (et corrigez les ancres qui le visaient), ou laissez la page sans type.
