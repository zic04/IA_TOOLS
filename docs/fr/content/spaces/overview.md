## En bref

Un **espace** est la partie de la documentation écrite pour un public. Le standard en définit deux : **business**
(« Pour le métier » — ce que fait chaque fonction, pour qui, et ses règles ; lu par les utilisateurs, les référents,
les responsables produit et le support) et **takeover** (« Pour l'équipe de reprise » — comment l'application est
construite, exploitée et sécurisée, et ce qu'il faut corriger d'abord ; lu par les développeurs, les exploitants et
la sécurité qui reprennent l'application). Une seule source, deux publics :

1. **Déclarez** `spaces` une fois dans `content/toc.json` ; chaque section nomme ensuite l'espace auquel elle
   appartient.
2. **Un seul site, filtré** : un sélecteur dans la barre du haut affiche « Tout » ou un espace à la fois ; rien
   n'est retiré, seulement masqué au choix du lecteur.
3. **Un fichier par espace, réellement séparé** : `doc-kit build` écrit aussi un export par espace, dont le contenu
   des autres espaces est **retiré**, pas seulement caché. Seul l'export convient à un public qui ne doit pas voir
   le reste.

Sans `spaces`, un projet reste exactement ce qu'il était avant que les espaces existent : pas de sélecteur, pas
d'export, les mêmes données de site.

## Déclarer les espaces

```json
{
  "spaces": ["business", { "id": "takeover", "subtitle": "Architecture, exploitation, sécurité, constats." }],
  "sections": [
    { "id": "use", "space": "business", "title": "…", "groups": [ /* … */ ] },
    { "id": "take-over", "space": "takeover", "title": "…", "groups": [ /* … */ ] }
  ],
  "journeys": [{ "title": "…", "space": "business", "steps": ["use/orders"] }]
}
```

- Chaque élément de `spaces` est un identifiant (`business`, `takeover`) ou un objet `{ id, title, shortTitle,
  subtitle, icon, for }`. `business` et `takeover` ont déjà un titre, un titre court, une icône et une ligne « for »
  en anglais et en français : ne donnez que les champs à changer. Tout autre identifiant a besoin de son propre
  `title`.
- `for` nomme les lecteurs en une ligne (« Utilisateurs, référents, responsables produit, support ») : affichée sur
  les portes d'espace de la page d'accueil et en infobulle du sélecteur.
- **Chaque section** doit nommer son `space` dès que `spaces` est déclaré. Une **page** peut remplacer l'espace de
  sa section ; la section apparaît alors dans chaque espace où elle a au moins une page, avec seulement ces pages.
  Un **parcours** prend par défaut l'espace de sa première étape.
- L'ordre de `spaces` est celui du sélecteur et des portes de la page d'accueil.

Un espace inconnu ou manquant, un espace sans titre, ou un `space` utilisé alors que `spaces` n'est pas déclaré,
arrêtent chacun le build — même en brouillon, comme un sommaire invalide. Un espace déclaré mais jamais utilisé par
une section ne fait qu'avertir.

## Lire un seul espace, ou tout

Le sélecteur (barre du haut, ou tête du menu latéral sur un écran étroit) propose « Tout » et un bouton par espace.
En choisir un filtre la navigation du haut, le menu latéral, précédent et suivant, les portes et parcours de la
page d'accueil, les suggestions de recherche et « tout imprimer » — tous réduits à cet espace. Le choix est
mémorisé (`localStorage`) et suivi par `#/@<id>` dans l'adresse ; ouvrir une page fixe l'espace courant sur le sien.

> [!NOTE] Le sélecteur filtre, il ne sépare pas
> Passer à « Métier » retire les pages de reprise du menu et de la recherche, mais le fichier HTML unique les
> contient toujours : quiconque a le fichier peut revenir en arrière, ou regarder sa source. Le sélecteur est un
> confort de lecture, pas une frontière de confidentialité. Pour cela, exportez.

## Exporter : là où la confidentialité commence vraiment

```bash
doc-kit build                      # le site complet, plus un export par espace déclaré
doc-kit build --space business     # cet export seul
doc-kit view use/orders --space business
doc-kit dev                        # sert aussi chaque export sur /space/<id>
```

Chaque export est construit à partir des mêmes pages, puis **filtré** : sections, pages, index de recherche,
suggestions et étapes de parcours hors de l'espace sont retirées (les étapes restantes d'un parcours sont
comptées, « + *n* étapes dans une autre partie de la documentation ») ; un lien vers le contenu retiré devient du
texte simple, « (voir la documentation {espace}) » ; un `counterpart` (« pendant ») hors de l'export est retiré. Le
glossaire reste entier, sauf le champ `technical` d'un terme (où il vit dans le code), que seul un export
`takeover` — ou le site complet avec « tout » ou `takeover` courant — affiche.

| Configuration | Défaut | Rôle |
|---|---|---|
| `spaces.export` | `true` | `false` : `build` écrit le site complet seul, aucun export |
| `spaces.output` | la sortie avec `-<espace>` avant son extension | Un chemin contenant `{space}`, relatif au projet |

`--space <id>` réduit aussi `view`, `open` et les serveurs supplémentaires de `dev` ; un identifiant inconnu, ou
aucun espace déclaré, est une erreur d'usage. `export --with-dist` copie les exports là où ils ont été écrits.

## `counterpart` : le même sujet, vu deux fois

Une fiche de fonctionnalité et la page technique qui documente le même mécanisme partagent leur identifiant `F-xx`
et se renvoient l'une à l'autre :

```json
{ "id": "use/orders/approval", "counterpart": "take-over/orders-api~approval-endpoint" }
```

Affiché comme une ligne sous les badges de la page, « Même sujet, pour {espace} : {titre} → » (ou « Voir aussi :
{titre} → » sans espaces, ou quand les deux pages partagent le même). C'est vérifié comme un lien interne — une
page ou une ancre inconnue fait échouer le build — mais ça n'a pas besoin d'être réciproque : une page technique
peut renvoyer à sa fiche métier sans que la fiche renvoie en retour.

## Pièges et écarts constatés

> [!ATTENTION] Un export n'est pas revérifié à part
> Les liens à l'intérieur d'un export sont valides par construction (ils viennent du contrôle du site complet) ;
> `check images` continue de s'exécuter sur le site complet, qui porte chaque page. Rien de plus à lancer par
> export.

> [!NOTE] Projets anciens
> Un projet écrit avant que les espaces existent se lit tel qu'il est : `spaces`, `space` et `counterpart` sont
> facultatifs partout. Les anciennes clés françaises `espaces`, `espace` et `pendant` se lisent de la même façon.

## Pour aller plus loin

- [Documenter chaque fonctionnalité](#/spaces/business) : l'espace métier, fonctionnalité par fonctionnalité.
- [Reprendre une application vibe-codée](#/spaces/takeover) : l'espace reprise, construit à partir du code.
- [Documenter en plusieurs langues](#/spaces/languages) : l'autre mécanisme transversal qui refaçonne le même build.
- [Sommaire, sous-pages et parcours](#/write/table-of-contents) : sections, pages et parcours en détail.
- [La configuration](#/reference/configuration) : `spaces.export` et `spaces.output`.
