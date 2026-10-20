# Structure type d'un site

Un site doc-kit s'adresse à quatre **espaces**, un par public (`content/toc.json`, ARCHITECTURE.md §6.1a) :
**Utiliser**, pour les personnes qui se servent de l'application au quotidien ; **Produit**, pour les product
owners et les analystes métier qui décident de ce qu'elle fait ; **Administrer**, pour les administrateurs de
l'application et ses exploitants ; **Développer**, pour les développeurs, l'équipe qui reprend l'application et
la sécurité. Chaque espace se découpe en **parties** (les `sections` de `content/toc.json`) ; chaque partie a
un lecteur en tête.

Le plan est déclaré dans `content/toc.json`. Le build en tire le menu, le fil d'Ariane, les vues de partie, le
sélecteur d'espace et la recherche.

## Les quatre espaces

| Espace | Pour qui | Répond à | Code |
|---|---|---|---|
| `use` | Utilisateurs, référents, support | « Comment je fais ceci, sur quel écran ? » | Jamais |
| `product` | Product owners, analystes métier, référents | « Que fait chaque fonctionnalité, pour qui, sous quelle règle, et comment sait-on qu'elle marche ? » | Jamais |
| `admin` | Administrateurs de l'application, exploitants | « Comment est-elle paramétrée, qui a le droit de faire quoi, comment tourne-t-elle en production ? » | Sa configuration et son infrastructure |
| `develop` | Développeurs, équipe de reprise, sécurité | « Comment est-elle construite et sécurisée, et que corriger en premier ? » | Avec des preuves `fichier:ligne` |

Chaque espace standard est son propre **type** (`standard/spaces.json`), et le type décide de ce que fait le kit
pour ses pages : pas de code dans Utiliser et Produit (une page métier qui cite un fichier est signalée), des
preuves `fichier:ligne` attendues dans Développer, la correspondance technique du glossaire montrée dans
Administrer et Développer, et l'endroit où l'audit cherche les pages obligatoires de la reprise (plus bas). Un
espace propre au projet déclare le type auquel il se rattache : `{ "id": "ops", "kind": "admin", "title":
"Exploitation" }`.

Un espace n'a d'intérêt que pour un lecteur qui ne doit **pas** voir les autres : une personne du support qui lit
un dossier plein de preuves `fichier:ligne` et de variables d'environnement s'y perd ; une PO a besoin des
règles et des critères d'acceptation, pas de chaque champ de chaque écran ; un développeur qui ne lit que de la
prose métier ne peut pas reprendre le projet. `doc-kit build` produit un fichier HTML avec un sélecteur
d'espace (tout le monde, filtré par habitude) et, avec `spaces.export` (par défaut), un fichier supplémentaire
par espace dont les autres sont **physiquement retirés** (ARCHITECTURE.md §6.1a) — le fichier réellement remis
à un public qui ne doit pas voir le reste.

## Espace Utiliser

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `use` · `utiliser` | Utiliser | L'utilisateur final | La prise en main, puis chaque écran du quotidien, annoté | `screen` |

Ordres de grandeur constatés sur de vrais sites : 10 à 45 pages.

## Espace Produit : Fonctionnalités, Processus

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `features` · `fonctionnalites` | Fonctionnalités | Product owners, analystes métier, référents | Ce que fait chaque fonctionnalité, pour qui, ses règles, qui peut faire quoi | `feature`, `business-rules`, `roles-matrix` |
| `process` · `processus` | Processus | Product owners, support | Ce qui se passe de bout en bout en langage métier (jamais de code) ; ce qui a changé version après version | `process`, `release-notes` |

Pas encore de convention de taille : dimensionnez Fonctionnalités au nombre de fonctionnalités plutôt que par
analogie.

## Espace Administrer : Administrer, Exploiter

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `administer` · `administrer` | Administrer | L'administrateur de l'application | Chaque éditeur et chaque réglage, avec son mécanisme ; accès, données de référence, système ; les recettes | `screen`, `editor`, `recipe` |
| `operate` · `exploiter` | Exploiter | Les exploitants | L'implantation en production, comment installer, construire, déployer, revenir en arrière, sauvegarder ; qui possède quoi | `architecture` (le DAT), `runbook`, `variables`, `resources`, `access-ownership` |

`Administrer` fusionne « Configurer » (les éditeurs) et « Administrer » (accès, données de référence,
système) : les deux servent celui qui paramètre le produit, et la distinction justifie rarement deux parties.
Séparez-les à nouveau quand le produit a assez d'éditeurs riches pour mériter sa propre partie (voir « Quand
adapter »). Ordres de grandeur constatés sur de vrais sites : 14 à 27 pages dans Administrer (18 à 52 de plus
quand Configurer reste séparé).

## Espace Développer : Comprendre, Sécuriser, Risques, Maintenir

| Partie (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `understand` · `comprendre` | Comprendre | Celui qui reprend le projet, en premier | Le grand schéma, la pile, les données, ce qui se passe réellement de bout en bout, pourquoi les décisions passées ont été prises | `technical` (+ `technical-sub`), `journey` + `journey-step`, `code-map`, `data-model`, `adr` |
| `secure` · `securiser` | Sécuriser | Sécurité | Les secrets, la surface d'API et ses manques, les menaces et les mesures d'atténuation | `api-surface`, `threat-model` |
| `risks` · `risques` | Risques | Celui qui reprend le projet | Le registre des risques : ce qui ne va pas, classé ; le chemin le plus court du symptôme à la correction | `findings`, `troubleshooting` + `troubleshooting-area` |
| `maintain` · `maintenir` | Maintenir | Celui qui reprend le projet, dans la durée | Ce qui garde le projet en bonne santé : tests, dépendances, fichiers d'instructions des agents, la documentation elle-même | `tests-quality`, `agent-instructions`, `dependencies`, et « Maintenir la doc » (`technical`) |

`technical` et `technical-sub` sont génériques : utilisez-les dans n'importe quelle partie pour un sujet
autonome qu'aucun type plus précis ne couvre (sécurité, stockage, IA, intégrations). Les tableaux montrent où
chaque type est **le plus souvent** utilisé, pas une règle exclusive. Ordres de grandeur constatés sur de vrais
sites : 38 à 81 pages pour Exploiter et l'espace Développer réunis.

### Quel type de page, dans quel espace

| Utiliser | Produit | Administrer | Développer |
|---|---|---|---|
| `screen` | `feature`, `business-rules`, `roles-matrix` (Fonctionnalités) | `screen`, `editor`, `recipe` (Administrer) | `technical`, `technical-sub`, `journey`, `journey-step`, `code-map`, `data-model`, `adr` (Comprendre) |
| | `process`, `release-notes` (Processus) | `architecture`, `runbook`, `variables`, `resources`, `access-ownership` (Exploiter) | `api-surface`, `threat-model` (Sécuriser) |
| | | | `findings`, `troubleshooting`, `troubleshooting-area` (Risques) |
| | | | `tests-quality`, `agent-instructions`, `dependencies` (Maintenir) |

Le rôle complet, les sections obligatoires et la longueur des 31 types sont dans
[templates.fr.md](templates.fr.md).

## Quand un projet a besoin de moins d'espaces

- **Pas de clé `spaces` du tout** : un ensemble de parties non différencié, pas de sélecteur d'espace, pas
  d'export par espace, pas de puce d'espace sur une page. Le bon choix pour un petit outil interne à un seul
  public.
- **Une partie des quatre** : ne déclarez que les espaces pour lesquels le projet a des lecteurs —
  `["use", "develop"]` pour un outil dont le produit et l'administration sont triviaux, `["product", "develop"]`
  pour un dossier remis avec ses fiches de fonctionnalités. L'audit cherche alors les pages obligatoires de la
  reprise dans les espaces déclarés (plus bas).
- **Les quatre** : le cas courant d'un projet de documentation produit également remis à la reprise, ou d'une
  application « vibe-codée » dont le dossier de reprise (ARCHITECTURE.md §6.9) est le livrable principal.

Un projet peut ajouter un espace **plus tard** : le déclarer et donner leur `space` à ses parties.

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

`counterpart` (un champ de page, avec ou sans espaces déclarés) désigne « le même sujet, pour d'autres
lecteurs » : une page, `"<id de page>"` ou `"<id de page>~<ancre>"`, ou une liste. Une fiche de fonctionnalité,
son écran, la page technique qui l'implémente et son manuel d'exploitation partagent leur identifiant `F-xx` ; un
processus métier et le parcours qui en automatise une partie font de même. Les pages qu'un counterpart relie, dans
un sens ou dans l'autre, forment un **groupe de sujet** : déclaré une fois, sur n'importe laquelle de ses pages, il
s'affiche sur chacune, comme une ligne sous les puces de la page (« Ce sujet pour : Utiliser · **Produit** ·
Développer », la page lue marquée), et le build contrôle chaque cible comme un lien interne (page inconnue, ou la
page elle-même : `link.counterpart`, erreur).

Une page **n'a pas besoin d'entrer dans un groupe** : une page technique n'a souvent pas d'équivalent métier
(personne n'a besoin d'une explication métier du schéma de base de données), et c'est normal. N'ajoutez un
counterpart que là où un vrai lecteur devrait sinon deviner que l'autre page existe — et une seule fois : chaque
page du groupe l'affiche.

## Les pages obligatoires de la reprise

Ce sont elles qui rendent un projet reprenable, quelle que soit la partie où elles sont classées. Les ids
ci-dessous sont des conventions : `doc-kit audit` trouve les pages par leur `template` et, pour l'architecture
d'ensemble, l'exploitation et la maintenance, par leur id (voir [maturity.fr.md](maturity.fr.md)). Deux d'entre
elles vivent dans l'espace Administrer (le DAT et Exploiter), les cinq autres dans l'espace Développer : avec des
espaces déclarés, l'audit cherche chaque page dans les espaces dont le type la porte, et la suggère dans la
première partie de cet espace.

| Page | Id conseillé (en · fr) | Gabarit | Partie habituelle | Contenu |
|---|---|---|---|---|
| Architecture d'ensemble | `understand/architecture` · `comprendre/architecture` | `technical` (+ sous-pages) | Comprendre | Le grand schéma, la pile, les principes, les flux principaux |
| Dossier d'architecture technique (DAT) | `operate/technical-architecture` · `exploiter/dat` | `architecture` | Exploiter (Administrer) | L'implantation en production, les flux numérotés, ce que le DAT ne montre pas, qui gère quoi |
| Parcours de bout en bout | `understand/journey-<object>` · `comprendre/parcours-<objet>` | `journey` + `journey-step` | Comprendre | Ce qui se passe réellement, étape par étape, quand on fait l'action principale du produit |
| Exploiter | `operate/operations`, `operate/deployment…` · `exploiter/exploitation`, `exploiter/deploiement…` | `technical`, `variables`, `resources` | Exploiter (Administrer) | Livraison, variables, ressources, tâches planifiées, sauvegardes, incidents |
| Diagnostic par symptôme | `risks/troubleshooting` · `risques/diagnostic` | `troubleshooting` + `troubleshooting-area` | Risques | Du symptôme à la cause, la vérification et la correction |
| Points d'attention | `risks/findings` · `risques/points-attention` | `findings` (+ sous-pages) | Risques | Les constats numérotés, revérifiés dans le code (voir [writing.fr.md](writing.fr.md#9-la-numérotation-des-constats)) ; aussi le registre des risques (propriétaire, décision, statut, échéance) |
| Maintenir la doc | `maintain/maintaining-docs` · `maintenir/maintenir-doc` | `technical` | Maintenir | Comment le site est fabriqué, refaire des captures, écrire une page, les contrôles, le transfert |

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
| Un parcours relie l'écran aux coulisses, entre espaces | « Je suis une commande… » se termine par `comprendre/parcours-commande` |

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
  prolonge celui de la parente (`securiser/securite/connexion`).
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
| `glossary.json` | Termes soulignés au survol : `{ term, pattern, def }`. Les sites aboutis en comptent une soixantaine ; le champ `technical` d'un terme (ARCHITECTURE.md §6.8) n'apparaît que dans les espaces Administrer et Développer |

`toc.json` et `glossary.json` sont **gérés de façon centrale**. Quand plusieurs personnes ou agents rédigent en
parallèle, chacun propose ses modifications (un résumé, un nouveau terme) au lieu d'éditer ces fichiers.

## Quand adapter la structure

Adaptez le **vocabulaire**, les **parties** et les **groupes** au produit. Gardez l'**intention des
espaces** (un lecteur d'Utiliser ou de Produit ne touche jamais au code ; un lecteur de Développer reçoit tout ce
qu'il faut pour reprendre l'application et la sécuriser) et les **pages obligatoires de la reprise**.

| Situation | Adaptation | Exemple |
|---|---|---|
| Le produit nomme autrement sa configuration | Renommer la partie, garder son rôle | Un produit dont les éditeurs s'appellent des « studios » : partie `studios`, titre « Administrer — les studios » |
| Beaucoup d'éditeurs riches, assez pour saturer Administrer | Resortir une partie `configure` d'Administrer | Un produit à 30 éditeurs et plus : `configure` (éditeurs, recettes) et `administrer` (accès, données de référence, système) séparés à nouveau |
| Plusieurs éditeurs s'enchaînent vers un même but | Ajouter un groupe de recettes en fin d'Administrer | « Recettes de configuration » : « Valider les grosses commandes en deux temps » |
| La production a une configuration propre à chaque cas d'usage | Ajouter un groupe dans Exploiter, une page par cas | « La configuration de production », une page par entité |
| Le produit a trop peu de fonctionnalités pour qu'une fiche par fonctionnalité se justifie | Fondre Fonctionnalités dans Utiliser, une page `business-rules` au lieu d'une partie | Un produit à 5 écrans sans vrai « catalogue de fonctionnalités » |
| Une référence transverse (routes, paramètres d'URL, chiffres et limites) | Une page « Annexes » en fin de Maintenir | `maintenir/annexes` |

À ne pas faire : supprimer l'espace Développer « parce que l'équipe connaît le code », ou ranger ses pages dans
l'espace Administrer. Le lecteur qui reprend le projet n'est pas l'administrateur de l'application.
