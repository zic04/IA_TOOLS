## En bref

L'espace Produit décrit **chaque fonctionnalité** pour les personnes qui l'utilisent, en décident ou la soutiennent :
aucun code, aucun `file:line`. Trois ingrédients, chacun avec son type de page : une **fiche de fonctionnalité** par
fonctionnalité, des **règles métier** énoncées une fois et citées partout où elles s'appliquent, et une **matrice
des rôles** de qui peut faire quoi.

| Type | Ce qu'il contient |
|---|---|
| `feature` | Une fonctionnalité de bout en bout : accès, scénario, règles, limites, questions fréquentes |
| `business-rules` | Les règles partagées entre fonctionnalités, ou sans propriétaire unique |
| `roles-matrix` | Chaque rôle et ce qu'il peut faire, généré à partir des fiches de fonctionnalité |
| `process` | La même fonctionnalité vue de bout en bout : états, ce qui avance seul, ce qui attend quelqu'un |
| `release-notes` | Un historique de version écrit pour un lecteur métier, jamais un message de commit copié tel quel |

## La fiche de fonctionnalité

Une page `feature` est une spécification qu'un product owner peut vérifier sur l'application. Elle ouvre par À quoi
ça sert et Qui l'utilise, puis ses **user stories** (`:::recit`), le parcours principal en étapes numérotées, les
Variantes numérotées à partir de l'étape dont elles dérivent (« 4a. Si … »), une **carte de comportement** par
comportement (`:::comportement` : une recherche, un filtre, une liste, un formulaire, un circuit…, chaque rubrique de
son type répondue), les Règles de gestion propres à la fiche, ses Champs et saisies, ses États, ses Messages mot pour
mot, ses Droits par action, ses **critères d'acceptation** (`:::scenario`, Soit / Quand / Alors), et se termine par
Limites et Questions ouvertes. Une section qui ne s'applique pas le dit, avec sa raison
([Une fonctionnalité en profondeur](#/write/markdown~une-fonctionnalite-en-profondeur-stories-cartes-scenarios)).

```json
{ "id": "use/orders/approval", "template": "feature", "feature": "F-01", "permissions": ["orders:write", "orders:approve"] }
```

- `feature` est un champ de page de `content/toc.json`, seulement sur une page de gabarit `feature` : l'identifiant
  propre de la fiche, sous la forme `F-01`. Une fiche par identifiant ; une page typée `feature` sans identifiant ne
  fait qu'avertir, mais une deuxième fiche avec le même identifiant fait échouer le build.
- `permissions` alimente la matrice des rôles ci-dessous ; les « Droits par action » de la fiche les citent avec
  `[[droit …]]`.

[Exemple · Fiche de fonctionnalité](#/examples/feature) en montre une complète : la validation des commandes
d'Acme Orders, avec ses stories, ses trois cartes de comportement, sa propre règle et six critères d'acceptation.

## Règles métier : énoncées une fois, citées partout

Une règle est **définie une seule fois** — sur la fiche de fonctionnalité à laquelle elle appartient, ou sur la
page partagée des règles métier quand elle en concerne plusieurs — comme un énoncé suivi d'un exemple « Étant
donné / Quand / Alors » :

```markdown
:::regle{id="RG-12" titre="Une commande au-dessus du seuil attend un responsable"}
Une commande dont le total atteint ou dépasse le seuil de validation ne peut pas être expédiée avant qu'un
responsable de sa région ne la valide.

**Exemple.** **Étant donné** une commande de 12 000 €, **quand** l'acheteur la soumet, **alors** elle attend un
responsable.
:::
```

Partout ailleurs, la règle n'est que **citée** : `[[regle RG-12]]`, une puce-lien vers l'endroit où elle est
définie. L'identifiant suit `^[A-Z][A-Z0-9]{0,5}-\d{1,4}$` ; la convention du standard est `RG-01` en français. Une
règle définie deux fois, citée par un identifiant inconnu, ou sans `id` ni `titre`, font chacune échouer un build
strict.

## Les tableaux générés

Quatre directives construisent leur tableau une fois que chaque page a été rendue, donc une règle ou une
fonctionnalité peut être définie plus loin dans le sommaire que la page qui la cite :

| Directive | Construit |
|---|---|
| `::fonctionnalites{}` | Id · Fonctionnalité (liée) · Résumé · Qui (ses droits) — une ligne par fiche |
| `::regles{}` | Id (lié) · Règle · Définie dans (lié) · Citée par — une ligne par règle |
| `::roles{}` | Une ligne par fiche, une colonne par droit distinct, `✔` là où il la débloque |
| `::recits{}` | Id (lié) · Récit · Fonctionnalité (liée) · Rôle · Version · Critères · Ticket — une ligne par récit utilisateur d'une fiche |

[Exemple · Règles métier](#/examples/business-rules) et [Exemple · Matrice des rôles](#/examples/roles-matrix)
montrent les deux tableaux rendus.

## Trouver les fonctionnalités candidates

```bash
doc-kit inventory --features
doc-kit inventory --features --write   # écrit features.json
```

Regroupe ce que voient déjà les adaptateurs de couverture — les routes d'écran par leur premier segment statique
(`/orders`, `/orders/[id]` → `orders`), les routes API par leur premier segment après `/api`, les clés i18n par
leur premier segment — en fonctionnalités candidates, chacune avec un identifiant suggéré et la fiche qui la cite
déjà, le cas échéant. `--write` écrit `features.json` (refusé s'il existe, sauf `--force`, qui n'ajoute que les
nouvelles candidates) ; l'adaptateur de couverture `features` mesure ensuite combien de ses entrées une fiche cite.

## Ce que le code dit de chaque comportement

`doc-kit facts --source behaviours` lit le code de l'application pour savoir comment se comportent ses
fonctionnalités — comment une liste est cherchée (contient, commence par, sans les majuscules, accents, plein texte),
filtrée, triée et paginée, quels champs un formulaire contrôle et comment, les listes de valeurs qu'un écran propose,
ce qui déclenche une recherche, la portée des données d'une requête, les exports, imports, notifications et
traitements planifiés — quelle que soit la pile : le `.filter` d'un tableau dans le navigateur, Prisma, SQL, Knex,
Django, SQLAlchemy, zod, pydantic, un formulaire HTML, un document OpenAPI. Chaque indice vient d'une ligne du code,
à vérifier sur place : un indice n'est jamais une mesure.

Une fonctionnalité de `features.json` peut nommer son code : `sources` (des motifs relatifs à `app.dir`), en plus de
ses routes et routes API, et `behaviours`, les types de carte que décrit sa fiche (`inventory --features` les déduit
des indices). `doc-kit context <sa fiche>` donne alors au rédacteur ce code — les gestionnaires de ses routes API et
ce qu'ils importent sur deux niveaux — et une partie **Comportements à décrire** : les indices, une ligne par champ et
par endroit, et les cartes à écrire avec leurs rubriques, les obligatoires marquées.

```json
[{ "id": "F-01", "title": "Suivre les commandes", "routes": ["/orders"], "sources": ["public/app.js"], "behaviours": ["search", "filter"] }]
```

## Garder les espaces Produit et Utiliser libres de code

Les espaces Produit et Utiliser se lisent sans le code. Une page métier (`feature`, `business-rules`, `roles-matrix`,
`process`, `release-notes`) dont l'espace est l'un d'eux — ou un espace propre au projet de l'un de leurs types — et
qui contient une preuve `file:line` reçoit l'avertissement `business.technical`, « déplacez le détail technique vers
son pendant » : comment le seuil de validation est appliqué appartient à l'espace Développer, derrière le
`counterpart` de la fiche. Le champ `technical` d'un terme du glossaire (où il vit dans le code) suit la même
règle : il n'apparaît dans sa bulle que si le projet n'a pas d'espaces, ou que l'espace courant est `admin`,
`develop` ou « tout » ; seuls les exports d'Administrer et de Développer le gardent.

## Pièges et écarts constatés

> [!ATTENTION] Une page de concepts n'est pas une fiche de fonctionnalité
> Une page sans parcours ni comportement — un catalogue, une liste de réglages — n'est pas `feature` :
> laissez-la sans type, ou typez-la `technical`.

> [!NOTE] Une règle, un propriétaire
> Une règle dont seule une fonctionnalité a besoin vit sur la fiche de cette fonctionnalité. Déplacez-la vers
> `business-rules` le jour où une seconde fonctionnalité a besoin de la citer.

## Pour aller plus loin

- [Quatre espaces, une seule source](#/spaces/overview) : déclarer `product`, le sélecteur, l'export.
- [Reprendre une application vibe-codée](#/spaces/takeover) : l'espace Développer, le pendant de celui-ci.
- [Le Markdown étendu](#/write/markdown~fonctionnalites-regles-et-roles) : la syntaxe complète de chaque directive.
- [Exemple · Fiche de fonctionnalité](#/examples/feature), [Exemple · Processus](#/examples/process), [Exemple ·
  Notes de version](#/examples/release-notes).
