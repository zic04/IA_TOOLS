# Structure type d'un site

Un site doc-kit s'adresse à deux **espaces** (`content/toc.json`, ARCHITECTURE.md §6.1a) : l'espace **Métier**,
pour les personnes qui n'ont jamais besoin de lire le code, et l'espace **Reprise**, pour les développeurs, les
exploitants et les équipes sécurité qui font tourner et évoluer l'application. Chaque espace se découpe en
**parties** (ce qu'on appelait des « sections » quand un seul espace existait) ; chaque partie a un lecteur en tête.

Le plan est déclaré dans `content/toc.json`. Le build en tire le menu, le fil d'Ariane, les vues de partie, le
sélecteur d'espace et la recherche.

## Les deux espaces

| Espace (en · fr) | Pour qui | Répond à |
|---|---|---|
| `business` | Utilisateurs, key users, product owners, support | « Que fait-elle, pour qui, sous quelle règle ? » — sans code |
| `takeover` | Développeurs, exploitants, sécurité | « Comment est-elle construite, exploitée, sécurisée, et que corriger en premier ? » |

Un espace n'a d'intérêt que pour un lecteur qui ne doit **pas** voir l'autre : une personne du support qui lit
un dossier plein de preuves `fichier:ligne` et de variables d'environnement s'y perd ; un développeur qui ne lit
que de la prose métier ne peut pas reprendre le projet. `doc-kit build` produit un fichier HTML avec un
sélecteur d'espace (tout le monde, filtré par habitude) et, avec `spaces.export` (par défaut), un fichier
supplémentaire par espace dont l'autre est **physiquement retiré** (ARCHITECTURE.md §6.1a) — le fichier
réellement remis à un public qui ne doit pas voir le reste.

## Espace Métier : Utiliser, Fonctionnalités, Administrer, Processus

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `use` · `utiliser` | Utiliser | L'utilisateur final | Chaque écran du quotidien, annoté | `screen` |
| `features` · `fonctionnalites` | Fonctionnalités | Product owners, support, key users | Ce que fait chaque fonctionnalité, pour qui, ses règles, qui peut faire quoi | `feature`, `business-rules`, `roles-matrix` |
| `administer` · `administrer` | Administrer | L'administrateur métier ou de la plateforme | Chaque éditeur et chaque réglage, avec son mécanisme ; accès, données de référence, système ; les recettes | `screen`, `editor`, `recipe` |
| `process` · `processus` | Processus | Product owners, support | Ce qui se passe de bout en bout en langage métier (jamais de code) ; ce qui a changé version après version | `process`, `release-notes` |

`Administrer` fusionne ce qui existait avant les espaces comme deux sections, « Configurer » (les éditeurs) et
« Administrer » (accès, données de référence, système) : les deux servent celui qui paramètre le produit,
que ce soit au niveau métier ou de la plateforme, et la distinction justifie rarement deux parties. Séparez-les
à nouveau quand le produit a assez d'éditeurs riches pour mériter sa propre partie (voir « Quand adapter »).

Ordres de grandeur constatés sur de vrais sites, d'avant les espaces, qui se reportent sans changement sur
`use` et `administer` : 10 à 45 pages dans Utiliser, 14 à 27 dans Administrer (18 à 52 de plus quand Configurer
reste séparé). `features` et `process` sont nouvelles : pas encore de convention de taille, dimensionnez-les
au nombre de fonctionnalités plutôt que par analogie.

## Espace Reprise : Comprendre, Exploiter, Sécuriser, Risques, Maintenir

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `understand` · `comprendre` | Comprendre | Celui qui reprend le projet, en premier | Le grand schéma, la pile, les données, ce qui se passe réellement de bout en bout, pourquoi les décisions passées ont été prises | `technical` (+ `technical-sub`), `journey` + `journey-step`, `code-map`, `data-model`, `adr` |
| `operate` · `exploiter` | Exploiter | Les exploitants | L'implantation en production, comment installer, construire, déployer, revenir en arrière, sauvegarder | `architecture` (le DAT), `runbook`, `variables`, `resources` |
| `secure` · `securiser` | Sécuriser | Sécurité, exploitants | Qui possède quoi, les secrets, la surface d'API et ses manques, les menaces et les mesures d'atténuation | `access-ownership`, `api-surface`, `threat-model` |
| `risks` · `risques` | Risques | Celui qui reprend le projet | Le registre des risques : ce qui ne va pas, classé ; le chemin le plus court du symptôme à la correction | `findings`, `troubleshooting` + `troubleshooting-area` |
| `maintain` · `maintenir` | Maintenir | Celui qui reprend le projet, dans la durée | Ce qui garde le projet en bonne santé : tests, dépendances, fichiers d'instructions des agents, la documentation elle-même | `tests-quality`, `agent-instructions`, `dependencies`, et « Maintenir la doc » (`technical`) |

`technical` et `technical-sub` sont génériques : utilisez-les dans n'importe quelle partie pour un sujet
autonome qu'aucun type plus précis ne couvre (sécurité, stockage, IA, intégrations). Le tableau ci-dessus
montre où chaque type est **le plus souvent** utilisé, pas une règle exclusive.

Ordres de grandeur constatés sur de vrais sites, d'avant les espaces : 38 à 81 pages pour ce qui forme
aujourd'hui l'espace Reprise entier. Le découpage en 5 parties est nouveau : pas encore de convention par
partie ; un site qui avait une section Reprendre unique garde ses groupes existants et ajoute simplement
`space: "takeover"` à sa partie unique (voir « Quand un projet n'a qu'un espace »).

### Quel type de page, dans quelle partie

| Métier | Reprise |
|---|---|
| `screen` (Utiliser, Administrer) | `technical`, `technical-sub` (Comprendre, ou tout sujet autonome) |
| `editor`, `recipe` (Administrer) | `journey`, `journey-step` (Comprendre) |
| `feature`, `business-rules`, `roles-matrix` (Fonctionnalités) | `code-map`, `data-model`, `adr` (Comprendre) |
| `process`, `release-notes` (Processus) | `architecture`, `runbook`, `variables`, `resources` (Exploiter) |
| | `access-ownership`, `api-surface`, `threat-model` (Sécuriser) |
| | `findings`, `troubleshooting`, `troubleshooting-area` (Risques) |
| | `tests-quality`, `agent-instructions`, `dependencies` (Maintenir) |

Le rôle complet, les sections obligatoires et la longueur des 28 types sont dans
[templates.fr.md](templates.fr.md).

## Quand un projet n'a qu'un espace

La plupart des projets n'ont encore qu'un seul public :

- **Pas de clé `spaces` du tout** (le défaut) : le site est exactement ce qu'il était avant les espaces — un
  ensemble de parties non différencié, pas de sélecteur d'espace, pas d'export par espace, pas de puce
  d'espace sur une page. C'est le bon choix pour un petit outil interne sans vrai public de reprise, ou pour un
  projet de documentation qui ne produit jamais qu'un dossier de reprise et ne le montre jamais à un lecteur
  métier.
- **Un tableau `spaces` à un seul élément** (par exemple `"spaces": ["takeover"]`) : chaque partie déclare quand
  même cet espace unique. Cela ne vaut l'effort que si le projet veut les textes d'espace, la puce, ou un export
  qui ne retire rien (il n'y a rien d'autre à retirer) — en pratique, rare ; préférez ne pas déclarer `spaces`
  tant qu'un second espace n'est pas prévu.
- **Les deux espaces** : le cas courant d'un projet de documentation produit également remis à la reprise, ou
  d'une application « vibe-codée » dont le dossier de reprise (ARCHITECTURE.md §6.9) est le livrable principal
  et où un espace métier court explique à quoi sert le produit.

Un projet peut aussi ajouter le second espace **plus tard** : déclarer `spaces`, donner un `space` à chaque
partie existante, ne rien déplacer. Le site continue de se construire ; seuls le nouveau sélecteur d'espace et
les exports apparaissent.

## Une page, un lecteur (Diátaxis)

[Diátaxis](https://diataxis.fr/) classe la documentation selon ce que le lecteur doit **faire** avec elle
(apprendre, accomplir une tâche, chercher un fait, comprendre pourquoi), pas selon la commodité de l'auteur.
doc-kit en reprend une règle, la plus importante dès qu'un lecteur métier et un lecteur technique partagent un
site : **une page a un lecteur**. Ne jamais mélanger une explication métier et un détail d'implémentation sur
la même page — pas « le circuit de validation saute le responsable quand la commande est sous le seuil (voir
`approvalService.ts:88`) » sur une page que lit une personne du support. Séparez les deux : un énoncé métier
(`feature`, `business-rules`) d'un côté, le même sujet avec sa preuve (`technical-sub`, `api-surface`, une
étape de parcours) de l'autre, reliés par `counterpart`.

## Les liens `counterpart`

`counterpart` (un champ de page, avec ou sans espaces déclarés) désigne « le même sujet, pour l'autre public » :
`"<id de page>"` ou `"<id de page>~<ancre>"`. Une fiche de fonctionnalité et la page technique qui l'implémente
se désignent l'une l'autre et partagent leur identifiant `F-xx` ; un processus métier et le parcours qui en
automatise une partie font de même. Le site l'affiche comme une ligne sous les puces de la page (« Même sujet,
pour {espace} : {titre} → »), et le build le contrôle comme un lien interne (page inconnue : `link.counterpart`,
erreur).

`counterpart` **n'a pas besoin d'être réciproque** : une page technique n'a souvent pas d'équivalent métier
(personne n'a besoin d'une explication métier du schéma de base de données), et c'est normal. N'en ajoutez un
que là où un vrai lecteur devrait sinon deviner que l'autre page existe.

## Les pages obligatoires de l'espace Reprise

Ce sont elles qui rendent un projet reprenable, quelle que soit la partie où elles sont classées. Les ids
ci-dessous sont des conventions : `doc-kit audit` trouve les pages par leur `template` et, pour l'architecture
d'ensemble, l'exploitation et la maintenance, par leur id (voir [maturity.fr.md](maturity.fr.md)). Cette liste
ne change pas avec le modèle à deux espaces : c'était la section « Reprendre » avant les espaces, c'est
l'espace Reprise maintenant.

| Page | Id conseillé (en · fr) | Gabarit | Partie habituelle | Contenu |
|---|---|---|---|---|
| Architecture d'ensemble | `take-over/architecture` · `reprendre/architecture` | `technical` (+ sous-pages) | Comprendre | Le grand schéma, la pile, les principes, les flux principaux |
| Dossier d'architecture technique (DAT) | `take-over/technical-architecture` · `reprendre/dat` | `architecture` | Exploiter | L'implantation en production, les flux numérotés, ce que le DAT ne montre pas, qui gère quoi |
| Parcours de bout en bout | `take-over/journey-<object>` · `reprendre/parcours-<objet>` | `journey` + `journey-step` | Comprendre | Ce qui se passe réellement, étape par étape, quand on fait l'action principale du produit |
| Exploiter | `take-over/operations`, `take-over/deployment…` · `reprendre/exploitation`, `reprendre/deploiement…` | `technical`, `variables`, `resources` | Exploiter | Livraison, variables, ressources, tâches planifiées, sauvegardes, incidents |
| Diagnostic par symptôme | `take-over/troubleshooting` · `reprendre/diagnostic` | `troubleshooting` + `troubleshooting-area` | Risques | Du symptôme à la cause, la vérification et la correction |
| Points d'attention | `take-over/findings` · `reprendre/points-attention` | `findings` (+ sous-pages) | Risques | Les constats numérotés, revérifiés dans le code (voir [writing.fr.md](writing.fr.md#9-la-numérotation-des-constats)) ; aussi le registre des risques (propriétaire, décision, statut, échéance) |
| Maintenir la doc | `take-over/maintaining-docs` · `reprendre/maintenir-doc` | `technical` | Maintenir | Comment le site est fabriqué, refaire des captures, écrire une page, les contrôles, le transfert |

Pages recommandées en plus, classées par sujet : accès et propriété, la surface d'API, le modèle de données,
les dépendances, les fichiers d'instructions des agents, une carte du code, des fiches de décision, un modèle
de menaces (tous décrits dans [templates.fr.md](templates.fr.md)) ; les annexes.

> [!NOTE] Pourquoi les parcours et le diagnostic
> Sur le site le plus abouti écrit avec cette méthode, le propriétaire a jugé le parcours de l'objet métier
> principal plus utile que toutes les pages techniques réunies : il répond à « que se passe-t-il vraiment
> quand je clique ? ». Le diagnostic part de la question inverse : « ça ne marche pas, par où commencer ? ».
> Les deux citent les constats par leur numéro au lieu de les redécrire.

## Les parcours guidés de l'accueil

Le tableau `journeys` du sommaire propose sur l'accueil des visites de 5 à 7 pages, dans l'ordre de lecture.
Avec des espaces déclarés, l'`space` d'un parcours vaut par défaut l'espace de sa première étape, et l'accueil
montre les parcours propres à chaque espace sous « Vous lisez : {espace} » (ARCHITECTURE.md §6.1a).

| Règle | Exemple (Acme Orders) |
|---|---|
| 3 à 5 parcours, un par lecteur | « Je découvre Acme Orders », « J'administre la plateforme », « Je reprends le projet » |
| Titre à la première personne, avec un verbe d'action | « Je suis une commande de bout en bout » |
| `description` : une phrase qui promet un résultat | « L'interface et les gestes essentiels en quinze minutes. » |
| 5 à 7 `steps`, tous des ids de page existants (le build le vérifie) | `utiliser/demarrer/interface` → … → `utiliser/commandes/fiche` |
| Un parcours relie l'écran aux coulisses, entre espaces | « Je suis une commande… » se termine par `reprendre/parcours-commande` |

`suggestions` met en avant 6 ou 7 pages : les plus riches et les plus consultées. Pour Acme Orders : la fiche
commande, la boîte des validations, l'éditeur des circuits de validation, la liste des factures, les rôles et
permissions, l'architecture d'ensemble.

## Les groupes

Un groupe rassemble 2 à 12 pages d'un même sujet, dans l'ordre où le lecteur les découvre. Au-delà, coupez le
groupe : par exemple « Circuits de validation — Les règles », puis « Circuits de validation — Les
notifications ».

| Partie | Groupes qui ont marché |
|---|---|
| Utiliser | **Prise en main** en premier (connexion, interface, recherche, assistant, rôle et périmètre, préférences), puis un groupe par objet métier (Acme Orders : Commandes, Clients, Validations, Factures, Suivi) |
| Fonctionnalités | Un groupe par famille de fonctionnalités, ou un groupe plat en dessous d'une vingtaine de fiches ; **Règles métier** et **Rôles et permissions** comme pages à part, pas comme groupes |
| Administrer | Un groupe par famille d'éditeurs (Acme Orders : Circuits de validation, Modèles de documents, Tableaux de bord…) ; Accès, Données de référence, Système ; **Recettes de configuration** en dernier |
| Processus | Un groupe par processus métier de bout en bout ; **Notes de version** en dernier |
| Comprendre | **Architecture**, **Parcours de bout en bout**, **Décisions** |
| Exploiter | **Le dossier d'architecture technique**, **Installer et déployer**, **Sauvegardes et tâches planifiées** |
| Sécuriser | **Propriété et secrets**, **La surface d'API**, **Menaces** |
| Risques | **Points d'attention**, **Diagnostic par domaine** |
| Maintenir | **Tests et dépendances**, **Instructions des agents**, **Maintenir cette documentation** |

## Les sous-pages

- **Au-delà d'environ 2 000 mots, découpez la page.** Chaque gabarit fixe sa limite (`maxWords`) ; `doc-kit
  audit` signale les pages qui la dépassent.
- Déclarez une sous-page **juste après sa parente**, dans le même groupe, avec `"level": 2` et un id qui
  prolonge celui de la parente (`reprendre/securite/connexion`).
- La parente garde la vue d'ensemble et liste ses sous-pages sous `## Dans cette partie` : un tableau
  « Sous-page / Ce que vous y trouverez » dont la première colonne est un lien vers chaque sous-page.
- Le menu, le fil d'Ariane et la vue de partie en tiennent compte seuls.
- Après un découpage, remplacez par un lien tout « ci-dessous » ou « plus haut » qui vise désormais une autre
  page, et corrigez les ancres : le build signale toute ancre devenue introuvable.

L'effet se mesure. Un site qui a découpé ses pages longues (sécurité, DAT, points d'attention, déploiement)
avait 2 pages sur 170 au-delà de leur limite. Un site qui ne l'a pas fait en avait 38 sur 115, dont une page de
points d'attention d'environ 10 800 mots.

## Les autres fichiers de `content/`

| Fichier | Rôle |
|---|---|
| `home.md` | Texte de l'accueil, sous les cartes de partie : « Comment lire ce site », ou un schéma du fonctionnement du produit |
| `<partie>/index.md` | Introduction facultative d'une partie |
| `glossary.json` | Termes soulignés au survol : `{ term, pattern, def }`. Les sites aboutis en comptent une soixantaine ; le champ `technical` d'un terme (ARCHITECTURE.md §6.8) n'apparaît que dans l'espace Reprise |

`toc.json` et `glossary.json` sont **gérés de façon centrale**. Quand plusieurs personnes ou agents rédigent en
parallèle, chacun propose ses modifications (un résumé, un nouveau terme) au lieu d'éditer ces fichiers.

## Quand adapter la structure

Adaptez le **vocabulaire**, les **parties** et les **groupes** au produit. Gardez l'**intention des deux
espaces** (un lecteur métier ne touche jamais au code ; un lecteur de reprise reçoit tout ce qu'il faut pour
exploiter et sécuriser l'application) et les **pages obligatoires de l'espace Reprise**.

| Situation | Adaptation | Exemple |
|---|---|---|
| Le produit nomme autrement sa configuration | Renommer la partie, garder son rôle | Un produit dont les éditeurs s'appellent des « studios » : partie `studios`, titre « Administrer — les studios » |
| Beaucoup d'éditeurs riches, assez pour saturer Administrer | Resortir une partie `configure` d'Administrer | Un produit à 30 éditeurs et plus : `configure` (éditeurs, recettes) et `administrer` (accès, données de référence, système) séparés à nouveau |
| Plusieurs éditeurs s'enchaînent vers un même but | Ajouter un groupe de recettes en fin d'Administrer | « Recettes de configuration » : « Valider les grosses commandes en deux temps » |
| La production a une configuration propre à chaque cas d'usage | Ajouter un groupe dans Exploiter, une page par cas | « La configuration de production », une page par entité |
| Le produit a trop peu de fonctionnalités pour qu'une fiche par fonctionnalité se justifie | Fondre Fonctionnalités dans Utiliser, une page `business-rules` au lieu d'une partie | Un produit à 5 écrans sans vrai « catalogue de fonctionnalités » |
| Une référence transverse (routes, paramètres d'URL, chiffres et limites) | Une page « Annexes » en fin de Maintenir | `reprendre/annexes` |

À ne pas faire : supprimer l'espace Reprise « parce que l'équipe connaît le code », ou ranger ses pages dans la
partie Administrer de l'espace Métier. Le lecteur qui reprend le projet n'est pas l'administrateur métier.
