# Structure type d'un site

Un site doc-kit s'adresse à quatre lecteurs : celui qui **utilise** l'application, celui qui la **configure**, celui qui l'**administre** et celui qui la **reprend** (développeur, exploitant, architecte). Chaque lecteur a sa section.

Le plan est déclaré dans `content/toc.json`, le sommaire. Le build en tire le menu, le fil d'Ariane, les vues de section et la recherche.

## Les quatre sections

| Id (en · fr) | Titre court | Pour qui | Ce qu'on y trouve | Gabarits dominants |
|---|---|---|---|---|
| `use` · `utiliser` | Utiliser | L'utilisateur final | Chaque écran du quotidien, annoté | `screen` |
| `configure` · `configurer` | Configurer | Celui qui paramètre le produit, l'administrateur métier | Chaque éditeur et chaque réglage, avec son mécanisme ; les recettes | `editor`, `recipe` |
| `administer` · `administrer` | Administrer | L'administrateur de la plateforme | Accès, données de référence, système, exploitation | `screen` |
| `take-over` · `reprendre` | Reprendre | Celui qui reprend le projet | Architecture, DAT, parcours de bout en bout, exploitation, diagnostic, points d'attention | `technical`, `journey`, `troubleshooting`… |

Ordres de grandeur constatés sur de vrais sites : 10 à 45 pages dans Utiliser, 18 à 52 dans Configurer, 14 à 27 dans Administrer, 38 à 81 dans Reprendre. L'équilibre reflète le produit : un produit riche en écrans métier a une grande section Utiliser ; un produit qui a peu d'écrans mais des éditeurs très riches a une grande section Configurer.

### Les champs d'une section

| Champ | Rôle | Exemple (Acme Orders) |
|---|---|---|
| `id` | Préfixe des pages, segment d'URL | `reprendre` |
| `title` | Titre complet de la vue de section | « Reprendre Acme Orders » |
| `shortTitle` | Libellé du menu | « Reprendre » |
| `icon` | Icône du menu, par son nom | l'une des icônes du site |
| `subtitle` | Une phrase sous le titre | « Le quotidien du commercial : commandes, clients, validations et factures. » |
| `highlights` | Trois points forts, affichés sur l'accueil | « La fiche commande et ses neuf onglets » |
| `featured` | `true` : section mise en avant sur l'accueil | `configurer` |
| `groups` | Liste de `{ title, pages[] }` | « Prise en main », « Commandes »… |

### Les champs d'une page

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | Oui | Chemin du fichier : `content/<id>.md`. Commence par l'id de la section. |
| `title` | Oui | Titre de la page. Le fichier Markdown n'a pas de titre `#`. |
| `menuTitle` | Non | Libellé court du menu. |
| `summary` | Oui | Une phrase, reprise par la vue de section, la recherche et les cartes de l'accueil. |
| `routes` | Non | Routes de l'application documentées par la page ; lues par le contrôle de couverture. |
| `permissions` | Non | Codes de permission requis ; affichés en tête de page. |
| `level` | Non | `2` pour une sous-page. Elle est rattachée à la dernière page de niveau 1 qui la précède dans le même groupe. |
| `template` | Non | Type de page (voir [templates.fr.md](templates.fr.md)). Le build contrôle alors ses sections obligatoires. |

Le nom du produit n'est pas déclaré dans le sommaire : il vient de `doc.config.mjs`.

## Les groupes

Un groupe rassemble 2 à 12 pages d'un même sujet, dans l'ordre où le lecteur les découvre. Au-delà, coupez le groupe : par exemple « Circuits de validation — Les règles », puis « Circuits de validation — Les notifications ».

| Section | Groupes qui ont marché |
|---|---|
| Utiliser | **Prise en main** en premier (connexion, interface, recherche, assistant, rôle et périmètre, préférences), puis un groupe par objet métier (Acme Orders : Commandes, Clients, Validations, Factures, Suivi) |
| Configurer | Un groupe par famille d'éditeurs (Acme Orders : Circuits de validation, Modèles de documents, Tableaux de bord…) ; un groupe « Comprendre » en tête quand les éditeurs partagent un mécanisme ; **Recettes de configuration** en dernier |
| Administrer | Accès, Données de référence, Système ; selon le produit : Exploitation, Analytics, IA, Retours |
| Reprendre | **Architecture**, **Parcours de bout en bout**, **Exploiter et faire évoluer** ; ajoutez « La configuration de production » quand la production a une configuration propre à chaque cas d'usage |

## Les pages obligatoires de « Reprendre »

Ce sont elles qui rendent un projet reprenable. Les ids ci-dessous sont des conventions : `doc-kit audit` trouve les pages par leur `template` et, pour l'architecture d'ensemble, l'exploitation et la maintenance, par leur id (voir [maturity.fr.md](maturity.fr.md)).

| Page | Id conseillé (en · fr) | Gabarit | Contenu |
|---|---|---|---|
| Architecture d'ensemble | `take-over/architecture` · `reprendre/architecture` | `technical` (+ sous-pages) | Le grand schéma, la pile, les principes, les flux principaux |
| Dossier d'architecture technique (DAT) | `take-over/technical-architecture` · `reprendre/dat` | `architecture` | L'implantation en production, les flux numérotés, ce que le DAT ne montre pas, qui gère quoi |
| Parcours de bout en bout | `take-over/journey-<object>` · `reprendre/parcours-<objet>` | `journey` + `journey-step` | Ce qui se passe réellement, étape par étape, quand on fait l'action principale du produit |
| Exploiter | `take-over/operations`, `take-over/deployment…` · `reprendre/exploitation`, `reprendre/deploiement…` | `technical`, `variables`, `resources` | Livraison, variables, ressources, tâches planifiées, sauvegardes, incidents |
| Diagnostic par symptôme | `take-over/troubleshooting` · `reprendre/diagnostic` | `troubleshooting` + `troubleshooting-area` | Du symptôme à la cause, la vérification, la correction |
| Points d'attention | `take-over/findings` · `reprendre/points-attention` | `findings` (+ sous-pages) | Les constats numérotés, revérifiés dans le code (voir [writing.fr.md](writing.fr.md#9-la-numérotation-des-constats)) |
| Maintenir la doc | `take-over/maintaining-docs` · `reprendre/maintenir-doc` | `technical` | Comment le site est fabriqué, refaire des captures, écrire une page, les contrôles, le transfert |

Pages recommandées en plus : base de données, stockage, sécurité, IA, intégrations, carte du code, tests et qualité ; la configuration de production par cas d'usage ; les annexes.

> [!NOTE] Pourquoi les parcours et le diagnostic
> Sur le site le plus abouti écrit avec cette méthode, le propriétaire a jugé le parcours de l'objet métier principal plus utile que toutes les pages techniques réunies : il répond à « que se passe-t-il vraiment quand je clique ? ». Le diagnostic part de la question inverse : « ça ne marche pas, par où commencer ? ». Les deux citent les constats par leur numéro au lieu de les redécrire.

## Les parcours guidés de l'accueil

Le tableau `journeys` du sommaire propose sur l'accueil des visites de 5 à 7 pages, dans l'ordre de lecture.

| Règle | Exemple (Acme Orders) |
|---|---|
| 3 à 5 parcours, un par lecteur | « Je découvre Acme Orders », « J'administre la plateforme », « Je reprends le projet » |
| Titre à la première personne, avec un verbe d'action | « Je suis une commande de bout en bout » |
| `description` : une phrase qui promet un résultat | « L'interface et les gestes essentiels en quinze minutes. » |
| 5 à 7 `steps`, tous des ids de page existants (le build le vérifie) | `utiliser/demarrer/interface` → … → `utiliser/commandes/fiche` |
| Un parcours relie l'écran aux coulisses | « Je suis une commande… » se termine par `reprendre/parcours-commande` |

`suggestions` met en avant 6 ou 7 pages : les plus riches et les plus consultées. Pour Acme Orders : la fiche commande, la boîte des validations, l'éditeur des circuits de validation, la liste des factures, les rôles et permissions, l'architecture d'ensemble.

## Les sous-pages

- **Au-delà d'environ 2 000 mots, découpez la page.** Chaque gabarit fixe sa limite (`maxWords`) ; `doc-kit audit` signale les pages qui la dépassent.
- Déclarez une sous-page **juste après sa parente**, dans le même groupe, avec `"level": 2` et un id qui prolonge celui de la parente (`reprendre/securite/connexion`).
- La parente garde la vue d'ensemble et liste ses sous-pages sous `## Dans cette partie` : un tableau « Sous-page / Ce que vous y trouverez » dont la première colonne est un lien vers chaque sous-page.
- Le menu, le fil d'Ariane et la vue de section en tiennent compte seuls.
- Après un découpage, remplacez par un lien tout « ci-dessous » ou « plus haut » qui vise désormais une autre page, et corrigez les ancres : le build signale toute ancre devenue introuvable.

L'effet se mesure. Un site qui a découpé ses pages longues (sécurité, DAT, points d'attention, déploiement) avait 2 pages sur 170 au-delà de leur limite. Un site qui ne l'a pas fait en avait 38 sur 115, dont une page de points d'attention d'environ 10 800 mots.

## Les autres fichiers de `content/`

| Fichier | Rôle |
|---|---|
| `home.md` | Texte de l'accueil, sous les cartes de section : « Comment lire ce site », ou un schéma du fonctionnement du produit |
| `<section>/index.md` | Introduction facultative d'une section |
| `glossary.json` | Termes soulignés au survol : `{ term, pattern, def }`. Les sites aboutis en comptent une soixantaine. |

`toc.json` et `glossary.json` sont **gérés de façon centrale**. Quand plusieurs personnes ou agents rédigent en parallèle, chacun propose ses modifications (un résumé, un nouveau terme) au lieu d'éditer ces fichiers.

## Quand adapter la structure

Adaptez le **vocabulaire** et les **groupes** au produit. Gardez les **quatre lecteurs** et les **pages obligatoires de Reprendre**.

| Situation | Adaptation | Exemple |
|---|---|---|
| Le produit nomme autrement sa configuration | Renommer la section, garder son rôle | Un produit dont les éditeurs s'appellent des « studios » : section `studios`, titre « Configurer — les studios », titre court « Studios » |
| Plusieurs éditeurs s'enchaînent vers un même but | Ajouter un groupe de recettes en fin de Configurer | « Recettes de configuration » : « Valider les grosses commandes en deux temps » |
| La production a une configuration propre à chaque cas d'usage | Ajouter un groupe dans Reprendre, une page par cas | « La configuration de production », une page par entité |
| Le produit n'a pas d'écran de configuration | Fusionner Configurer dans Administrer | — |
| Une référence transverse (routes, paramètres d'URL, chiffres et limites) | Une page « Annexes » en fin de Reprendre | `reprendre/annexes` |

À ne pas faire : supprimer Reprendre « parce que l'équipe connaît le code », ou ranger les pages techniques dans Administrer. Le lecteur qui reprend le projet n'est pas l'administrateur.
