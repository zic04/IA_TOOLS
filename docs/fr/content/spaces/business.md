## En bref

L'espace métier décrit **chaque fonctionnalité** pour les personnes qui l'utilisent, en décident ou la soutiennent :
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

Une page `feature` ouvre par un **encadré d'accès** (lignes fixes : Module, Qui peut l'utiliser, Prérequis, Vérifié
le), puis À quoi ça sert, Qui l'utilise, le scénario principal en étapes numérotées, Variantes et exceptions
numérotées à partir de l'étape dont elles dérivent (« 4a. Si … »), les Règles métier propres à la fiche, et se
termine par Limites et Questions fréquentes.

```json
{ "id": "use/orders/approval", "template": "feature", "feature": "F-01", "permissions": ["orders:write", "orders:approve"] }
```

- `feature` est un champ de page de `content/toc.json`, seulement sur une page de gabarit `feature` : l'identifiant
  propre de la fiche, sous la forme `F-01`. Une fiche par identifiant ; une page typée `feature` sans identifiant ne
  fait qu'avertir, mais une deuxième fiche avec le même identifiant fait échouer le build.
- `permissions` alimente « Qui peut l'utiliser » de l'encadré d'accès via `[[droit …]]`, et la matrice des rôles
  ci-dessous.

[Exemple · Fiche de fonctionnalité](#/examples/feature) en montre une complète : la validation des commandes
d'Acme Orders, avec son encadré d'accès, son scénario et sa propre règle.

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

Trois directives construisent leur tableau une fois que chaque page a été rendue, donc une règle ou une
fonctionnalité peut être définie plus loin dans le sommaire que la page qui la cite :

| Directive | Construit |
|---|---|
| `::fonctionnalites{}` | Id · Fonctionnalité (liée) · Résumé · Qui (ses droits) — une ligne par fiche |
| `::regles{}` | Id (lié) · Règle · Définie dans (lié) · Citée par — une ligne par règle |
| `::roles{}` | Une ligne par fiche, une colonne par droit distinct, `✔` là où il la débloque |

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

## Garder l'espace métier libre de code

Une page métier qui contient une preuve `file:line` reçoit l'avertissement « déplacez le détail technique vers son
pendant » : comment le seuil de validation est appliqué appartient à l'espace reprise, derrière le `counterpart`
de la fiche. Le champ `technical` d'un terme du glossaire (où il vit dans le code) suit la même règle : il
n'apparaît dans sa bulle que si le projet n'a pas d'espaces, ou que l'espace courant est `takeover` ou « tout ».

## Pièges et écarts constatés

> [!ATTENTION] Une page de concepts n'est pas une fiche de fonctionnalité
> Une page sans scénario et sans encadré d'accès — un catalogue, une liste de réglages — n'est pas `feature` :
> laissez-la sans type, ou typez-la `technical`.

> [!NOTE] Une règle, un propriétaire
> Une règle dont seule une fonctionnalité a besoin vit sur la fiche de cette fonctionnalité. Déplacez-la vers
> `business-rules` le jour où une seconde fonctionnalité a besoin de la citer.

## Pour aller plus loin

- [Deux espaces, une seule source](#/spaces/overview) : déclarer `business`, le sélecteur, l'export.
- [Reprendre une application vibe-codée](#/spaces/takeover) : le pendant de cet espace.
- [Le Markdown étendu](#/write/markdown~espace-metier) : la syntaxe complète de chaque directive.
- [Exemple · Fiche de fonctionnalité](#/examples/feature), [Exemple · Processus](#/examples/process), [Exemple ·
  Notes de version](#/examples/release-notes).
