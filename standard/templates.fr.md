# Les gabarits de page

Un gabarit fixe les sections `##` d'un type de page, leur ordre et la longueur maximale de la page. Il y a 13 types. La version lisible par la machine est [templates.json](templates.json) ; les pages prêtes à remplir sont dans `templates/pages/en/<type>.md` et `templates/pages/fr/<type>.md`.

Les identifiants de type sont en anglais dans tous les projets : `screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`. Les libellés de section suivent la langue du projet.

## Comment le build s'en sert

- Une page déclare son type dans le sommaire (`content/toc.json`) : `{ "id": "utiliser/commandes/liste", …, "template": "screen" }`.
- Le build vérifie alors ses **sections obligatoires**. Une section est reconnue quand un titre `##` de la page **commence par** son libellé, ou par l'un de ses alias, sans tenir compte de la casse ni des accents. « Pas à pas : valider une commande » correspond à « Pas à pas ».
- Une section obligatoire absente est une **erreur bloquante** du build strict. Les autres sections du gabarit sont recommandées : `doc-kit audit` mesure combien sont présentes.
- `maxWords` est un **avertissement** de `doc-kit audit` : au-delà, découpez la page en sous-pages.
- `doc-kit new <page-id> --template <type>` crée la page depuis le gabarit, dans la langue du projet.
- Les consignes laissées dans une page (`<!-- consigne : … -->` en français, `<!-- guidance: … -->` en anglais) sont signalées par `doc-kit audit` et par le build strict. Écrivez la section, puis retirez sa consigne.
- Les listes de libellés `en` et `fr` ont la même longueur et le même ordre. `required` contient des positions dans ces listes : il est donc le même dans les deux langues.

Un exemple rédigé de chaque type, écrit pour Acme Orders, est indiqué sous `example` dans `templates.json`.

Légende des tableaux ci-dessous : **✱** = obligatoire.

## Vue d'ensemble

| Type | Section | Sert à | Obligatoires | `maxWords` | Page d'exemple (Acme Orders) |
|---|---|---|---|---|---|
| `screen` | Utiliser, Administrer | Un écran et ses actions | 5 | 2 500 | `utiliser/commandes/liste` |
| `editor` | Configurer | Un éditeur et le mécanisme qu'il pilote | 6 | 3 000 | `configurer/validation/circuits` |
| `recipe` | Configurer | Un but atteint en enchaînant plusieurs éditeurs | 5 | 3 500 | `configurer/recettes/validation-en-deux-temps` |
| `technical` | Reprendre | Un sujet technique (page parente ou page seule) | 1 | 2 000 | `reprendre/securite` |
| `technical-sub` | Reprendre | Le détail d'un sujet technique | 0 | 2 000 | `reprendre/securite/connexion` |
| `journey` | Reprendre | Ce qui se passe de bout en bout | 5 | 2 000 | `reprendre/parcours-commande` |
| `journey-step` | Reprendre | Une étape d'un parcours | 5 | 2 200 | `reprendre/parcours-commande/validation` |
| `troubleshooting` | Reprendre | Du symptôme à la cause | 5 | 2 000 | `reprendre/diagnostic` |
| `troubleshooting-area` | Reprendre | Les symptômes d'un domaine | 2 | 2 000 | `reprendre/diagnostic/acces` |
| `findings` | Reprendre | Les constats numérotés | 2 | 2 000 | `reprendre/points-attention` |
| `architecture` | Reprendre | L'implantation en production | 5 | 2 000 | `reprendre/dat` |
| `variables` | Reprendre | Les variables d'environnement | 2 | 2 200 | `reprendre/deploiement/variables` |
| `resources` | Reprendre | Les ressources du déploiement | 7 | 2 200 | `reprendre/deploiement/ressources` |

---

## `screen` — Page d'écran

Un écran de l'application, vu par celui qui s'en sert : à quoi il sert, comment il marche, chaque élément annoté, les pièges, les droits.

| Section | | Contenu |
|---|---|---|
| À quoi ça sert | ✱ | Le besoin métier en 2 à 4 phrases ; un encadré NOTE « Où se trouve cet écran » (`[[menu …]]`, `[[route …]]`) |
| Comment ça marche | ✱ | Le mécanisme réel : serveur ou navigateur, ordre, limites ; un encadré MECANISME ; un tableau quand il y a plusieurs cas |
| L'écran | ✱ | Une capture `:::ecran` par panneau ; la légende a un élément par zone, de 1 à 3 phrases chacun |
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
| L'écran | ✱ | Une capture `:::ecran` par panneau ou par fenêtre de dialogue |
| Ce que ça change | | `::avant-apres`, ou une capture de l'écran utilisateur concerné |
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

## Pages sans type

Toutes les pages n'ont pas de gabarit. Ne déclarez pas `template` pour :
- une sous-page d'écran ou d'éditeur ;
- une sous-page de points d'attention (elle suit le format de constat décrit plus haut) ;
- une page de concepts, un catalogue ou une annexe.

## Variantes de titre

Le build reconnaît une section par le début de son titre. Quelques variantes sont acceptées comme **alias** (`aliases` dans `templates.json`), parce qu'elles étaient fréquentes sur de vrais sites :

| Libellé | Variantes acceptées |
|---|---|
| "What it is for" | "What it's for", "What this screen is for", "What this editor is for" |
| "Pitfalls and limits" | "Pitfalls", "Known limits" |
| « À quoi ça sert » | « À quoi sert » (« À quoi sert l'écran », « À quoi sert cet onglet ») |
| « Pièges et limites à connaître » | « Pièges et limites », « Pièges » |

Les autres variantes ne sont pas reconnues : « Référence » seule au lieu de « Référence de chaque réglage », « En bref » au lieu de « Comment lire cette page » sur une page de points d'attention, un nombre en début de titre. Avant de déclarer `template` sur une page existante, renommez le titre (et corrigez les ancres qui le visaient), ou laissez la page sans type.
