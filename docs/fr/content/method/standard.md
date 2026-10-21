## En bref

Le kit est livré avec un **standard de documentation**, dans `standard/` (anglais en `.md`, français en `.fr.md`). Il
dit ce qu'un site doit contenir, comment l'écrire, comment capturer sans risque, comment le contrôler et quand il est
prêt à être transmis. Il ne contient pas de théorie : chaque règle vient de sites de documentation construits et
transmis avec cette méthode, l'un d'environ 170 pages capturé en lecture seule en production, l'autre d'environ
115 pages capturé sur une démo préparée.

Les cinq règles qui comptent le plus :

1. **Rien d'inventé.** Chaque libellé, défaut, borne et comportement est vérifié dans le code, avec sa preuve
   `fichier:ligne`.
2. **Expliquer le fonctionnement, pas seulement l'écran** : qui calcule, dans quel ordre, avec quelles limites, et ce
   que l'utilisateur voit changer.
3. **Décrire les écarts, ne jamais corriger l'application** depuis la documentation.
4. **La production ne s'écrit jamais** pendant une capture, et la session est supprimée à la fin.
5. **Le build strict passe** avant toute remise.

## Dans cette partie

| Document | Ce qu'il contient | Dans ce site |
|---|---|---|
| `standard/structure.fr.md` | Les quatre espaces et leurs parties, les groupes, les pages obligatoires de la reprise, les parcours de la page d'accueil, les sous-pages | [Sommaire, sous-pages et parcours](#/write/table-of-contents) |
| `standard/templates.fr.md` et `templates.json` | Les 31 types de page : rôle, sections, longueur, exemple, erreurs fréquentes (`templates.json` contient les 13 généraux) | [Les gabarits de page](#/write/page-templates) |
| `standard/templates/business.json` | 5 types de plus pour l'espace Produit : fiche de fonctionnalité, règles métier, matrice des rôles, processus, notes de version | [Documenter chaque fonctionnalité](#/spaces/business) |
| `standard/templates/takeover.json` | 13 types de plus pour le dossier de reprise, dans l'espace Développer (accès et propriété et manuel d'exploitation dans l'espace Administrer) : accès et propriété, surface d'API, runbook, modèle de données, dépendances, carte du code, tests, instructions des agents, ADR, modèle de menaces, revue de sécurité, revue de maintenabilité, coût de la documentation | [Reprendre une application vibe-codée](#/spaces/takeover) |
| `standard/writing.fr.md` | Rien d'inventé, preuves, libellés exacts, écarts, liens, glossaire, numérotation des constats, schémas | ci-dessous |
| `standard/captures.fr.md` | Sécurité des captures en production, la session, le masquage, la qualité des zones, production ou démo | [Démo ou production : capturer sans risque](#/capture/safety) |
| `standard/quality.fr.md` | Les barrières bloquantes et les avertissements, avec la commande qui contrôle chacun | [Les contrôles](#/publish/checks) |
| `standard/maturity.fr.md` | Les niveaux 1 à 4, chacun mesurable par `doc-kit audit`, avec un exemple complet | [L'audit et les niveaux de maturité](#/publish/audit) |
| `standard/delivery.fr.md` | La liste de contrôle de la passation | [Exporter et transmettre](#/publish/export) |
| `standard/config.fr.md` | Deux configurations complètes et commentées, pour des applications fictives | [La configuration](#/reference/configuration) |

## Quatre lecteurs, quatre espaces

| Espace | Pour qui | Parties | Types principaux |
|---|---|---|---|
| Utiliser (`use`) | Utilisateurs, référents, support | Utiliser | `screen` |
| Produit (`product`) | Responsables produit (PO), analystes métier, référents | Fonctionnalités, Processus | `feature`, `business-rules`, `roles-matrix`, `process`, `release-notes` |
| Administrer (`admin`) | Administrateurs de l'application, exploitants | Administrer, Exploiter | `screen`, `editor`, `recipe` ; `architecture`, `runbook`, `variables`, `resources`, `access-ownership` |
| Développer (`develop`) | Développeurs, équipe de reprise, sécurité | Comprendre, Sécuriser, Risques, Maintenir | `technical`, `journey`, `troubleshooting`, `findings`… |

Sept pages obligatoires rendent un projet transmissible : une architecture d'ensemble, au moins un parcours de bout
en bout, le diagnostic par symptôme, les points d'attention et la façon dont la documentation elle-même est
maintenue, dans l'espace Développer ; le dossier d'architecture technique (DAT) et l'exploitation, dans l'espace
Administrer.

## Une seule source, un fichier par public

Les espaces se déclarent dans `content/toc.json` (ARCHITECTURE.md §6.1a) : une seule source, exportée une fois par
espace, un fichier HTML par public qui ne doit pas voir le reste. Ils sont facultatifs — un petit outil à un seul
public n'en déclare aucun, et un projet ne déclare que les espaces pour lesquels il a des lecteurs. Chaque espace
standard est son propre type : pas de code dans Utiliser et Produit, des preuves `file:line` dans Développer, la
correspondance technique du glossaire dans Administrer et Développer. [Quatre espaces, une seule
source](#/spaces/overview) explique le mécanisme ; [Documenter chaque fonctionnalité](#/spaces/business) et
[Reprendre une application vibe-codée](#/spaces/takeover) l'appliquent.

## Règles de rédaction

| Règle | En pratique |
|---|---|
| Sources de vérité | Un libellé dans le fichier de traduction, une valeur par défaut dans les composants, une borne dans le schéma de validation, un comportement dans les services, un fait de production sur un écran consulté en lecture seule, **daté** |
| La preuve `fichier:ligne` | `lib/services/orderService.ts:43-50` à la première citation, puis `orderService.ts:161` |
| Déduit, à confirmer | Dites-le : « déduit de … », « à confirmer avec l'équipe d'infrastructure » |
| Les libellés exacts, en gras | **Submit for approval**, avec la casse et les caractères de l'écran |
| Écarts constatés | Dans un encadré `> [!NOTE] Écarts constatés (v2.4.0)`, chacun avec sa preuve ; jamais corrigés depuis la documentation |
| Constats | Numérotés par famille : C critique, I important, M mineur, P production, R sans effet (N en anglais) ; un numéro ne change jamais |
| Liens | Seulement vers des ids du sommaire ; pas de « ci-dessous » ni de « plus haut » d'une page à l'autre |

## La méthode, pas à pas

Le standard s'applique par phases : cadrer le travail, mettre en place le projet (`init`, `doctor`), inventorier le
code, planifier le site et écrire une page de référence, capturer, écrire par lots, consolider les constats, écrire
les parcours et le diagnostic, puis les pages techniques de production, contrôler, et enfin livrer. Le
[skill Claude Code](#/skill/phases) mène ces phases avec des agents en parallèle, chacun briefé à partir du
[contexte](#/skill/cost-and-speed) propre à une page plutôt que de tout l'inventaire ; une équipe peut suivre les
phases à la main. Après la livraison, [suivre l'évolution de l'application](#/publish/sync) dit exactement quoi
revoir, plutôt que de tout relire.

## Pièges et écarts constatés

> [!ATTENTION] Une documentation existante périmée
> Un document des rôles aux décomptes faux, un inventaire des écrans tiré d'une maquette : ne recopiez jamais la
> documentation existante ; revérifiez tout dans le code, et listez ce qu'il faut cesser de suivre dans la page des
> points d'attention.

> [!NOTE] Faire évoluer le standard
> `standard/templates.json` est lu par le build : le modifier change ce que chaque projet doit contenir. La
> modification va d'abord dans `ARCHITECTURE.md`, puis dans les deux langues du standard et des gabarits de page,
> puis dans `CHANGELOG.md`.

## Pour aller plus loin

- [Exemples de pages](#/examples/screen) : une page de chaque type, écrite selon le standard.
- [L'audit et les niveaux de maturité](#/publish/audit) : le standard, mesuré.
- [Les phases du skill](#/skill/phases) : la méthode, menée par Claude Code.
- [Quatre espaces, une seule source](#/spaces/overview) : les quatre espaces, en détail.
