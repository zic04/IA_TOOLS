## En bref

Le skill applique la méthode du standard en **onze phases**, numérotées de 0 à 10. Chaque phase se termine par des
vérifications qui disent qu'elle est achevée. Claude orchestre ; des agents écrivent en parallèle à partir de
**briefs** ; la ligne de commande vérifie tout.

1. **Cadrer, mettre en place, inventorier** (phases 0 à 2) : des décisions écrites, le projet créé, le code
   inventorié.
2. **Planifier et capturer** (phases 3 et 4) : le sommaire avec un type par page, une page de référence approuvée,
   les captures prises sans risque.
3. **Écrire et consolider** (phases 5 à 8) : des lots de pages écrits en parallèle, les constats consolidés, les
   parcours, le diagnostic et les pages de production.
4. **Contrôler et livrer** (phases 9 et 10) : build strict, contrôles, audit, relecture, export, maintenance.

Le skill répond dans la langue de l'utilisateur ; le site est écrit dans la langue du projet (`language`).

## Les phases

| Phase | But | Commandes et agents | Terminée quand |
|---|---|---|---|
| 0 · Cadrage | Public, langue, sections, mode de capture, données réelles ou non, routes à ne jamais ouvrir, qui se connecte | — | Décisions écrites ; la décision du propriétaire sur les données réelles |
| 1 · Mise en place | Créer et configurer le projet | `doc-kit init`, `doc-kit doctor` | `doctor` sans erreur ; `build --draft` passe |
| 2 · Inventaire | La navigation réelle, les routes et les permissions, les pages qui écrivent pendant leur rendu | `doc-kit inventory --json` ; 1 agent en lecture seule, brief `inventory` | Inventaire enregistré ; documentation périmée signalée |
| 3 · Plan | Sommaire avec types, guide de rédaction, une page de référence | `doc-kit new`, `doc-kit check coverage` | Couverture de 100 % ; lots définis |
| 4 · Captures | Données de démo ou session de production ; un essai avec aperçus | `doc-kit demo` ou `doc-kit connect` ; `doc-kit capture --preview` | Zones justes, aucun secret, lecture seule constatée |
| 5 · Rédaction | Un agent par lot, par vagues parallèles | Brief `writing-batch` | Chaque rapport : pages, captures, constats candidats |
| 6 · Consolidation | Dédupliquer et numéroter les constats, corriger les pages | `scripts/consolidation.mjs` ; briefs `findings-verification`, `page-corrections` | Build strict au vert |
| 7 · Parcours | Parcours de bout en bout et diagnostic, en réutilisant les captures | Briefs `journey`, `troubleshooting` | Parcours guidés de l'accueil ajoutés |
| 8 · Pages de production | DAT, ressources, variables | Brief `production-technical` | Écarts consignés en constats P |
| 9 · Contrôles | Build strict, chaque contrôle, audit, relecture visuelle | `doc-kit build`, `check all`, `audit`, `view` | Niveau cible atteint (4 pour une reprise) |
| 10 · Livraison | Transmettre, puis maintenir | `doc-kit connect --forget`, `doc-kit export` | Liste de contrôle de `standard/delivery.fr.md` remplie |

## Briefs et scripts

Un **brief** est l'instruction donnée à un agent, tirée des briefs qui ont fonctionné sur de vrais projets. Le skill
les remplit à partir de `doc.config.mjs` et de quelques variables :

```bash
node <skill>/scripts/brief.mjs writing-batch --project docs/manual --var code=u1 --var pages=@.doc-kit/pages-u1.txt
```

| Brief | Phase | Écrit |
|---|---|---|
| `inventory` | 2 | Rien : l'orchestrateur enregistre son rapport |
| `writing-batch` | 5 | Ses pages, son plan de capture, ses schémas |
| `findings-verification` | 6 | Les pages des points d'attention, et elles seules |
| `page-corrections` | 6 | Les pages signalées et le glossaire |
| `journey`, `troubleshooting` | 7 | Ses pages, son schéma |
| `production-technical` | 8 | DAT, ressources, variables, schéma |

`scripts/consolidation.mjs` crée le fichier de consolidation de la phase 6 et liste les constats candidats qui citent
le même `fichier:ligne`. Les briefs remplis vont dans `.doc-kit/brief-<template>.md` ; un paramètre resté vide arrête
le script avec le code de sortie 1.

## Les règles non négociables

1. **Des captures sans risque** : en production, lecture seule et navigation uniquement ; lisez le code serveur d'une
   page de détail avant de l'ouvrir ; un refus du système de permissions n'est jamais contourné ; arrêtez-vous quand
   la session expire.
2. **Rien d'inventé** : chaque affirmation est vérifiée dans le code, avec son `fichier:ligne` ; ce qui est déduit
   est dit « déduit ».
3. **Des fichiers réservés** : un agent n'écrit que ses pages, son plan de capture et ses schémas ; le sommaire, le
   glossaire et la configuration restent à l'orchestrateur.
4. **Aucun commit**, aucune commande git destructive : c'est l'utilisateur qui commite.
5. **La session est supprimée** à la fin de la campagne, jamais copiée ni montrée.

## Pièges et écarts constatés

> [!ATTENTION] Des fichiers centraux modifiés par deux agents
> Deux agents qui modifient `toc.json` ou `glossary.json` en même temps perdent le travail de l'un d'eux. Tout passe
> par leurs rapports, et c'est l'orchestrateur qui modifie les fichiers centraux.

> [!NOTE] Des pages trop longues
> Au-delà d'environ 2 000 mots, découpez en sous-pages pendant la rédaction, pas après : les ancres et les liens sont
> alors justes dès le départ.

## Pour aller plus loin

- [Installer le skill](#/skill/install) : la commande et ses vérifications.
- [Le standard de documentation](#/method/standard) : les règles qu'appliquent les phases.
- [Démo ou production : capturer sans risque](#/capture/safety) : les règles de sécurité de la phase 4.
