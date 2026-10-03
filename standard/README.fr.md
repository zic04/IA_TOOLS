# Le standard de documentation

Ce dossier est le **référentiel qualité** des sites produits avec doc-kit. Il dit ce qu'un site doit contenir, comment l'écrire, comment le contrôler et quand le remettre.

Il ne contient pas de théorie. Chaque règle vient de ce qui a marché sur de vrais sites de documentation produit, écrits et remis avec cette méthode :
- un site d'environ 170 pages, capturé **en production, en lecture seule**, avec une section « Reprendre » complète (dossier d'architecture technique, cinq parcours de bout en bout, diagnostic par symptôme, plus d'une centaine de constats numérotés) ;
- un site d'environ 115 pages, capturé sur une **démo locale préparée**, avec des éditeurs de configuration très riches et des recettes de configuration pas à pas.

Quand une règle ne vaut que pour l'une de ces deux situations (production ou démo), le texte le dit.

Les exemples portent sur un produit fictif, **Acme Orders** : une application web de gestion de commandes (commandes, clients, circuit de validation, factures, rôles, espace d'administration et assistant IA), construite avec Next.js (App Router), dont les utilisateurs se connectent par un fournisseur d'identité.

## Comment l'utiliser

| Vous voulez… | Lisez | Puis lancez |
|---|---|---|
| Démarrer un site | [structure.fr.md](structure.fr.md), [config.fr.md](config.fr.md) | `doc-kit init` |
| Écrire une page | [templates.fr.md](templates.fr.md), [writing.fr.md](writing.fr.md) | `doc-kit new <id-de-page> --template <type>` |
| Faire des captures | [captures.fr.md](captures.fr.md) | `doc-kit connect`, `doc-kit capture --preview` |
| Savoir si c'est livrable | [quality.fr.md](quality.fr.md), [maturity.fr.md](maturity.fr.md) | `doc-kit build`, `doc-kit check all`, `doc-kit audit` |
| Remettre le site | [delivery.fr.md](delivery.fr.md) | `doc-kit export <cible>` |

Les modèles de page sont dans `templates/pages/fr/` et `templates/pages/en/` ; le squelette d'un projet est dans `templates/project/`.

## Index

Chaque document existe en anglais (`.md`) et en français (`.fr.md`).

| Fichier | Contenu |
|---|---|
| [structure.fr.md](structure.fr.md) | Les deux espaces (Métier, Reprise), leurs parties, les groupes, les pages obligatoires de Reprise, `counterpart`, les parcours guidés de l'accueil, les sous-pages, quand adapter |
| [templates.fr.md](templates.fr.md) | Les 28 types de page : rôle, sections dans l'ordre, longueur, exemple, erreurs fréquentes |
| [templates.json](templates.json) | La version lisible par la machine, lue par le build et par `doc-kit audit` : sections `en` et `fr`, sections obligatoires, `maxWords`, alias |
| [writing.fr.md](writing.fr.md) | Rien d'inventé, preuves `fichier:ligne`, libellés exacts, écarts constatés, liens, glossaire, numérotation des constats, schémas |
| [captures.fr.md](captures.fr.md) | Sécurité des captures en production, la session, le masquage, la qualité des zones, production ou démo |
| [quality.fr.md](quality.fr.md) | Les barrières bloquantes et les avertissements, avec la commande qui contrôle chacun |
| [maturity.fr.md](maturity.fr.md) | Les niveaux 1 à 4, chacun mesurable par `doc-kit audit`, avec un exemple complet |
| [delivery.fr.md](delivery.fr.md) | La checklist de remise |
| [config.fr.md](config.fr.md) | Deux `doc.config.mjs` complets et commentés, pour des applications fictives |

## Les cinq règles qui comptent le plus

1. **Rien d'inventé.** Chaque libellé, défaut, borne et comportement est vérifié dans le code, avec sa preuve `fichier:ligne`.
2. **Expliquer le fonctionnement, pas seulement l'écran** : qui calcule, dans quel ordre, avec quelles limites, et ce que l'utilisateur voit changer.
3. **Décrire les écarts, ne jamais corriger l'application** depuis la documentation.
4. **La production ne s'écrit jamais** pendant une capture, et la session est supprimée à la fin.
5. **Le build strict passe** avant toute remise.

## Faire évoluer le standard

Le standard suit le contrat `ARCHITECTURE.md` (§6.4 et §7). Une modification de `templates.json` change ce que le build exige. Elle se fait, dans cet ordre :
1. dans le contrat, si elle touche au format ;
2. dans ce dossier, dans les deux langues ;
3. dans les deux modèles de page (`templates/pages/en/` et `templates/pages/fr/`) ;
4. dans `CHANGELOG.md`.
