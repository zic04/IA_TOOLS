## En bref

Un **espace** est la partie de la documentation écrite pour un public. Le standard en définit quatre, un par
public :

| Espace | Titre | Pour | Ce qu'il contient |
|---|---|---|---|
| `use` | Utiliser l'application | Utilisateurs, référents, support | Comment faire chaque tâche, écran par écran |
| `product` | Le produit | Responsables produit (PO), analystes métier, référents | Ce que fait chaque fonctionnalité, pour qui, ses règles et ses critères d'acceptation : fiches de fonctionnalité, règles métier, matrice des rôles, processus, notes de version |
| `admin` | Administrer l'application | Administrateurs de l'application, exploitants | Réglages, droits d'accès, exploitation et dossier d'architecture technique |
| `develop` | Développer l'application | Développeurs, équipe de reprise, sécurité | Comment l'application est construite et sécurisée, et ce qu'il faut corriger d'abord |

Une seule source, quatre publics :

1. **Déclarez** `spaces` une fois dans `content/toc.json` ; chaque section nomme ensuite l'espace auquel elle
   appartient.
2. **Un seul site, filtré** : un sélecteur dans la barre du haut affiche « Tout » ou un espace à la fois ; rien
   n'est retiré, seulement masqué au choix du lecteur.
3. **Un fichier par espace, réellement séparé** : `doc-kit build` écrit aussi un export par espace, dont le contenu
   des autres espaces est **retiré**, pas seulement caché. Seul l'export convient à un public qui ne doit pas voir
   le reste.

Sans `spaces`, un projet reste exactement ce qu'il était avant que les espaces existent : pas de sélecteur, pas
d'export, les mêmes données de site. Inutile de déclarer les quatre : `["use", "develop"]` convient à un outil dont
le produit et l'administration sont triviaux.

## Déclarer les espaces

```json
{
  "spaces": ["use", "product", "admin", { "id": "develop", "subtitle": "Architecture, sécurité, risques, maintenance." }],
  "sections": [
    { "id": "utiliser", "space": "use", "title": "…", "groups": [ /* … */ ] },
    { "id": "fonctionnalites", "space": "product", "title": "…", "groups": [ /* … */ ] },
    { "id": "administrer", "space": "admin", "title": "…", "groups": [ /* … */ ] },
    { "id": "exploiter", "space": "admin", "title": "…", "groups": [ /* … */ ] },
    { "id": "comprendre", "space": "develop", "title": "…", "groups": [ /* … */ ] }
  ],
  "journeys": [{ "title": "…", "space": "use", "steps": ["utiliser/commandes"] }]
}
```

- Chaque élément de `spaces` est un identifiant ou un objet `{ id, kind, title, shortTitle, subtitle, icon, for }`.
  Les quatre espaces standard ont déjà un titre, un titre court, un sous-titre et une ligne « for » en anglais et
  en français (le tableau ci-dessus ; titres courts : Utiliser, Produit, Administrer, Développer) : ne donnez que
  les champs à changer.
- `for` nomme les lecteurs en une ligne (« Utilisateurs, référents, support ») : affichée sur les portes d'espace de
  la page d'accueil et en infobulle du sélecteur.
- **Chaque section** doit nommer son `space` dès que `spaces` est déclaré. Une **page** peut remplacer l'espace de
  sa section ; la section apparaît alors dans chaque espace où elle a au moins une page, avec seulement ces pages.
  Un **parcours** prend par défaut l'espace de sa première étape.
- L'ordre de `spaces` est celui du sélecteur et des portes de la page d'accueil.

### Un espace propre au projet : `kind`

Chaque espace standard est son propre **type** (`kind`), et c'est le type, jamais l'identifiant, qui décide de ce
que fait le kit pour ses pages. Un espace propre au projet nomme le type auquel il se rattache, et a besoin de son
propre `title` (seuls les quatre identifiants standard ont des textes par défaut ; son `shortTitle` vaut par
défaut son `title`) :

```json
{ "spaces": ["use", "product", { "id": "ops", "kind": "admin", "title": "Exploitation" }, "develop"] }
```

| Type | Une page métier qui cite un `file:line` | La correspondance technique du glossaire | Pages obligatoires de la reprise que l'audit y cherche |
|---|---|---|---|
| `use` | Signalée (`business.technical`) | Masquée | Aucune |
| `product` | Signalée (`business.technical`) | Masquée | Aucune |
| `admin` | — | Affichée | Le dossier d'architecture technique (DAT), Exploiter |
| `develop` | — | Affichée | Architecture d'ensemble, parcours de bout en bout, diagnostic, points d'attention, maintenir la doc ; ses pages sont les pages de reprise, preuves `file:line` attendues |

Chaque espace prend l'icône par défaut de son type (`icon` la remplace). Un espace standard garde son propre type :
un `"kind"` sur `use`, `product`, `admin` ou `develop` qui en nomme un autre est une erreur.

Un espace inconnu ou manquant, un espace sans type valide (`space.kind`), un espace propre au projet sans titre
(`space.title`), ou un `space` utilisé alors que `spaces` n'est pas déclaré, arrêtent chacun le build — même en
brouillon, comme un sommaire invalide. Un espace déclaré mais jamais utilisé par une section ne fait qu'avertir.

## Lire un seul espace, ou tout

Le sélecteur (barre du haut, ou tête du menu latéral sur un écran étroit) propose « Tout » et un bouton par espace.
En choisir un filtre la navigation du haut, le menu latéral, précédent et suivant, les portes et parcours de la
page d'accueil, les suggestions de recherche et « tout imprimer » — tous réduits à cet espace. Le choix est
mémorisé (`localStorage`) et suivi par `#/@<id>` dans l'adresse (`#/@use`) ; ouvrir une page fixe l'espace courant
sur le sien.

> [!NOTE] Le sélecteur filtre, il ne sépare pas
> Passer à « Utiliser » retire les pages de Produit, d'Administrer et de Développer du menu et de la recherche,
> mais le fichier HTML unique les contient toujours : quiconque a le fichier peut revenir en arrière, ou regarder
> sa source. Le sélecteur est un confort de lecture, pas une frontière de confidentialité. Pour cela, exportez.

## Exporter : là où la confidentialité commence vraiment

```bash
doc-kit build                      # le site complet, plus un export par espace déclaré
doc-kit build --space use          # cet export seul
doc-kit view utiliser/commandes --space use
doc-kit dev                        # sert aussi chaque export sur /space/<id>
```

Chaque export porte l'identifiant de son espace : `dist/Acme-Orders-Documentation-use.html`, `-product.html`,
`-admin.html`, `-develop.html`. Il est construit à partir des mêmes pages, puis **filtré** : sections, pages, index
de recherche, suggestions et étapes de parcours hors de l'espace sont retirées (les étapes restantes d'un parcours
sont comptées, « + *n* étapes dans une autre partie de la documentation ») ; un lien vers le contenu retiré
devient du texte simple, « (voir la documentation {espace}) » ; les pages d'un groupe de sujet hors de l'export
quittent sa ligne. Le glossaire reste entier, sauf le champ `technical` d'un terme (où il vit dans le code) : seuls les
exports des espaces dont le type l'affiche (`admin`, `develop`) le gardent, et le site complet l'affiche quand l'un
de ces espaces est courant, en mode « tout », ou quand le projet n'a pas d'espaces.

| Configuration | Défaut | Rôle |
|---|---|---|
| `spaces.export` | `true` | `false` : `build` écrit le site complet seul, aucun export |
| `spaces.output` | la sortie avec `-<espace>` avant son extension | Un chemin contenant `{space}`, relatif au projet |

`--space <id>` réduit aussi `view`, `open` et les serveurs supplémentaires de `dev` ; un identifiant inconnu, ou
aucun espace déclaré, est une erreur d'usage. `export --with-dist` copie les exports là où ils ont été écrits.

## `counterpart` : un sujet, pour chacun de ses lecteurs

Une fiche de fonctionnalité, son écran, sa page technique et son manuel d'exploitation traitent un même sujet, chacun
pour ses lecteurs. Le `counterpart` d'une page nomme une autre page de ce sujet, ou une liste, chacune avec une ancre
quand elle commence plus bas :

```json
{ "id": "fonctionnalites/validation-commande", "counterpart": ["comprendre/api-commandes~point-validation", "exploiter/manuel"] }
```

Les pages qu'un counterpart relie, dans un sens ou dans l'autre, forment un **groupe de sujet** : déclaré une fois,
sur n'importe laquelle de ses pages, il s'affiche sur chacune. Sous les badges de la page, une ligne nomme les autres
par leur espace, « Ce sujet pour : Utiliser · **Produit** · Administrer · Développer » — la page lue marquée, les
espaces dans leur ordre, le titre d'une page à côté de son espace quand cet espace porte deux pages du groupe. Sans
espaces : « Voir aussi : {titre} · {titre} ». Chaque cible est vérifiée comme un lien interne : une page ou une ancre
inconnue, ou une page qui se cite elle-même, fait échouer le build.

## Pièges et écarts constatés

> [!ATTENTION] Un export n'est pas revérifié à part
> Les liens à l'intérieur d'un export sont valides par construction (ils viennent du contrôle du site complet) ;
> `check images` continue de s'exécuter sur le site complet, qui porte chaque page. Rien de plus à lancer par
> export.

> [!NOTE] Projets anciens
> Un projet écrit avant que les espaces existent se lit tel qu'il est : `spaces`, `space` et `counterpart` sont
> facultatifs partout. Les anciennes clés françaises `espaces`, `espace` et `pendant` se lisent de la même façon.

## Pour aller plus loin

- [Documenter chaque fonctionnalité](#/spaces/business) : l'espace Produit, fonctionnalité par fonctionnalité.
- [Reprendre une application vibe-codée](#/spaces/takeover) : le dossier de reprise, dans les espaces Développer et
  Administrer, construit à partir du code.
- [Documenter en plusieurs langues](#/spaces/languages) : l'autre mécanisme transversal qui refaçonne le même build.
- [Sommaire, sous-pages et parcours](#/write/table-of-contents) : sections, pages et parcours en détail.
- [La configuration](#/reference/configuration) : `spaces.export` et `spaces.output`.
