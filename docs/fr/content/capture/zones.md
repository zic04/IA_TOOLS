## En bref

Les **zones** d'une capture sont les éléments qu'un lecteur doit comprendre, numérotés dans l'ordre de lecture. Le kit
mesure chaque zone sur la vraie page, enregistre sa boîte en pourcentages, et le site dessine une pastille dessus.
Dans la page, un bloc `:::ecran` donne la **légende** : un élément par zone, dans le même ordre.

1. Une zone est **une cible** (`button("Save")`), ou **`{ union: [cible, …] }`** : une pastille sur la boîte
   englobante de plusieurs cibles, pour les champs d'une même ligne.
2. **De 3 à 12 zones** par capture : moins n'apprend rien, plus fatigue la visite guidée. Découpez un grand écran en
   plusieurs captures, une par panneau.
3. **Légende = zones** : le build strict refuse une légende qui a un élément de trop ou de moins.

## Une capture et ses zones

L'entrée de plan de la capture ci-dessous a quatre zones. La première est une `union` de trois champs, sous une seule
pastille :

```js
zones: [
  { ...union(field("Status"), field("Customer"), field("Date")), caption: "Filtres" },   // ①
  { ...card("Today"), caption: "Aujourd'hui" },                                           // ②
  { ...button("New order"), caption: "Nouvelle commande" },                               // ③
  { css: "main table", caption: "Commandes" },                                            // ④
],
```

:::ecran{capture="orders-list" titre="Les quatre zones de la capture orders-list"}
1. **Filters** : une `union` des champs **Status**, **Customer** et **Date** : une pastille, une boîte qui contient
   les trois.
2. **Today** : `card("Today")`, le panneau encadré qui contient le texte « Today ».
3. **New order** : `button("New order")`, le bouton trouvé par son nom accessible.
4. **La liste** : un sélecteur CSS, `main table`.
:::

## Les options de zone

| Option | Valeurs · défaut | Effet |
|---|---|---|
| `caption` | texte | Écrit dans le fichier de zones comme `label` ; un aide-mémoire pour les personnes qui maintiennent le plan |
| `side` | `corner`, `right`, `bottom`, `bottom-right` · à gauche de la zone | Où se place la pastille ; `corner` est posé par le kit quand la zone touche le bord gauche |
| `margin` | px · 4 | Espace ajouté autour de la zone |

Une `union` accepte les options d'une zone ; chaque cible qu'elle contient garde ses propres options de cible
(`exact`, `within`…). `union` est refusée partout ailleurs que dans `zones`.

## Écrire la légende

- Un élément par zone, **dans l'ordre du plan**, de 1 à 3 phrases chacun.
- Commencez par le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet.
- Le texte placé avant la liste, à l'intérieur du bloc, devient une légende sous l'image.
- Une même capture peut être montrée dans plusieurs pages, chacune avec sa propre légende.

## Vérifier les zones

```bash
doc-kit capture "orders-*" --preview
```

`--preview` écrit `.doc-kit/<id>.zones.png` : l'image capturée, avec chaque zone dessinée en rouge et numérotée.
Regardez chaque aperçu avant d'écrire la légende : une zone mesurée sur le mauvais élément ne se voit que sur l'image.
Ces aperçus ne sont jamais publiés.

## Pièges et écarts constatés

> [!ATTENTION] Changez le plan et la légende ensemble
> Ajouter une zone dans le plan sans élément de légende fait échouer le build strict :
> `écran « orders-list » : 5 zone(s) capturée(s) mais 4 élément(s) dans la légende`. Avec `--draft`, c'est un
> avertissement.

> [!NOTE] Une zone introuvable
> `zone 3 (role button “New order”) introuvable — …` : l'élément n'est pas devenu visible en 8 s. Vérifiez la cible,
> le `delay`, ou les actions qui auraient dû l'afficher.

> [!NOTE] `::capture` refuse les zones
> Une capture qui a des zones se montre uniquement avec `:::ecran` ; `::capture` est fait pour les captures sans
> zones.

## Pour aller plus loin

- [Cibles et actions](#/capture/targets-actions) : chaque sorte de cible et chaque option.
- [Le Markdown étendu](#/write/markdown~ecran-annote-ecran) : la syntaxe de `:::ecran`.
- [Le site généré](#/start/generated-site) : pastilles, légende et visite guidée, telles que le lecteur les voit.
