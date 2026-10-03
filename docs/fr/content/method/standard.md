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
| `standard/structure.fr.md` | Les quatre sections, les groupes, les pages obligatoires de Reprendre, les parcours de la page d'accueil, les sous-pages | [Sommaire, sous-pages et parcours](#/write/table-of-contents) |
| `standard/templates.fr.md` et `templates.json` | Les 13 types de page généraux : rôle, sections, longueur, exemple, erreurs fréquentes | [Les gabarits de page](#/write/page-templates) |
| `standard/templates/business.json` | 5 types de plus pour l'espace métier : fiche de fonctionnalité, règles métier, matrice des rôles, processus, notes de version | [Documenter chaque fonctionnalité](#/spaces/business) |
| `standard/templates/takeover.json` | 10 types de plus pour l'espace reprise : accès et propriété, surface d'API, runbook, modèle de données, dépendances, carte du code, tests, instructions des agents, ADR, modèle de menaces | [Reprendre une application vibe-codée](#/spaces/takeover) |
| `standard/writing.fr.md` | Rien d'inventé, preuves, libellés exacts, écarts, liens, glossaire, numérotation des constats, schémas | ci-dessous |
| `standard/captures.fr.md` | Sécurité des captures en production, la session, le masquage, la qualité des zones, production ou démo | [Démo ou production : capturer sans risque](#/capture/safety) |
| `standard/quality.fr.md` | Les barrières bloquantes et les avertissements, avec la commande qui contrôle chacun | [Les contrôles](#/publish/checks) |
| `standard/maturity.fr.md` | Les niveaux 1 à 4, chacun mesurable par `doc-kit audit`, avec un exemple complet | [L'audit et les niveaux de maturité](#/publish/audit) |
| `standard/delivery.fr.md` | La liste de contrôle de la passation | [Exporter et transmettre](#/publish/export) |
| `standard/config.fr.md` | Deux configurations complètes et commentées, pour des applications fictives | [La configuration](#/reference/configuration) |

## Quatre lecteurs, quatre sections

| Section | Pour qui | Ce qu'on y trouve | Types principaux |
|---|---|---|---|
| Utiliser (`utiliser`) | L'utilisateur final | Chaque écran du quotidien, annoté | `screen` |
| Configurer (`configurer`) | L'administrateur métier | Chaque éditeur et chaque réglage, avec son mécanisme ; les recettes | `editor`, `recipe` |
| Administrer (`administrer`) | L'administrateur de la plateforme | Accès, données de référence, système, exploitation | `screen` |
| Reprendre (`reprendre`) | Celui qui reprend le projet | Architecture, parcours, exploitation, diagnostic, points d'attention | `technical`, `journey`, `troubleshooting`… |

La section Reprendre rend un projet transmissible. Ses sept pages obligatoires sont une architecture d'ensemble, un
dossier d'architecture technique (DAT), au moins un parcours de bout en bout, l'exploitation, le diagnostic par
symptôme, les points d'attention, et la façon dont la documentation elle-même est maintenue.

## Deux publics, superposés

Un projet peut aussi déclarer des **espaces** (ARCHITECTURE.md §6.1a) : `business` et `takeover`, une seule source
exportée deux fois, un fichier HTML par public, qui ne doit pas voir le reste. Les espaces sont facultatifs et se
superposent aux quatre sections ci-dessus — une section appartient toujours à un public, une page peut appartenir
à un autre — et apportent leurs propres types de page (fiches de fonctionnalité et règles métier pour `business` ;
dossiers construits à partir des faits et registre des risques pour `takeover`). [Deux espaces, une seule
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
- [Deux espaces, une seule source](#/spaces/overview) : les espaces métier et reprise, en détail.
