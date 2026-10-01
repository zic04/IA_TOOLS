## En bref

Un schéma est un fichier SVG de `diagrams/<nom>.svg`, inséré dans une page avec `::schema{id="nom" titre="…"}`. Le
build l'intègre à la page : il est donc trouvé par la recherche, net à tous les niveaux de zoom, et imprimé avec la
page.

1. **Aucune couleur dans le fichier.** Les formes et le texte n'utilisent que les classes `d-*` du site ; leurs
   couleurs viennent du thème, si bien que le schéma suit les thèmes clair et sombre.
2. **900 unités de large.** `viewBox="0 0 900 H"` ; le schéma s'adapte à la colonne de lecture.
3. **Une légende qui dit comment le lire.** L'attribut `titre` est affiché sous le schéma.

## Le schéma

::schema{id="classes" titre="Chaque classe des schémas, telle que le thème courant la dessine. Changez de thème avec le bouton de la barre du haut : le dessin suit."}

## Les classes

| Rôle | Classes | Rendu |
|---|---|---|
| Boîtes | `d-box`, `d-box-2`, `d-brand`, `d-warn`, `d-danger`, `d-info`, `d-violet` | Un fond léger et une bordure de la couleur |
| Aplats | `d-solid`, `d-chrome` | La couleur de marque ; la couleur sombre de la barre du haut |
| Traits | `d-line`, `d-line-brand`, `d-dashed` | Gris, couleur de marque, gris en pointillés (sans remplissage) |
| Textes | `d-title`, `d-text`, `d-small`, `d-white` | Gras 14 px, 12,5 px, 11 px, gras 13 px sur la couleur de marque |
| Pointes de flèche | `d-arrow`, `d-arrow-brand` | Gris, couleur de marque (dans un `<marker>`) |

Les anciens noms français des schémas écrits avant le kit (`s-boite`, `s-marque`, `s-trait`, `s-titre`,
`s-fleche`…) restent stylés. Les nouveaux schémas utilisent les noms `d-*`.

## Un schéma minimal

```xml
<svg viewBox="0 0 900 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Navigateur, API, base de données">
  <defs>
    <marker id="ab-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path class="d-arrow" d="M0 0 10 5 0 10z"/>
    </marker>
  </defs>
  <rect class="d-box" x="20" y="30" width="240" height="80" rx="10"/>
  <text class="d-title" x="140" y="76" text-anchor="middle">Navigateur</text>
  <rect class="d-brand" x="330" y="30" width="240" height="80" rx="10"/>
  <text class="d-title" x="450" y="76" text-anchor="middle">API des commandes</text>
  <path class="d-line" d="M260 70H326" marker-end="url(#ab-arrow)"/>
</svg>
```

- **Préfixez les identifiants** des éléments `<marker>` par le code propre au schéma (`ab-arrow`) : plusieurs schémas
  partagent une même page, et deux marqueurs de même identifiant se mélangeraient.
- Donnez au `<svg>` un `role="img"` et un `aria-label` qui dit ce qu'il montre.
- Gardez le texte **dans sa boîte** : comptez environ 7,5 unités par caractère de `d-text`, 6,5 de `d-small`.

## Des conventions qui aident le lecteur

| Convention | Signification |
|---|---|
| Trait plein (`d-line`) | Enchaîné : se fait tout seul, juste après |
| Trait en pointillés (`d-dashed`) | Attend une personne |
| Boîte `d-warn` ou `d-danger` | Dépend d'une tâche planifiée, ou est un problème connu |
| Boîte `d-brand` | Le composant dont parle la page |
| Pastilles numérotées sur les flèches | Les flux numérotés d'un tableau placé sous le schéma |

## Pièges et écarts constatés

> [!ATTENTION] `d-white` ne va que sur `d-solid`
> `d-white` est la couleur du texte **sur la couleur de marque** : blanc dans le thème clair, sombre dans le thème
> sombre. Sur `d-chrome`, qui reste sombre dans les deux thèmes, il disparaît dans le thème sombre. Sur `d-chrome`,
> posez une étiquette `d-box`, comme dans le schéma ci-dessus.

> [!NOTE] Vérifiez les deux thèmes
> `doc-kit view write/diagrams --theme dark` capture la page construite dans le thème sombre.

> [!ATTENTION] Le SVG est intégré tel quel
> Seule la déclaration XML (`<?xml …?>`) est retirée. Un script, un gestionnaire d'événement ou une référence externe
> dans un schéma se retrouverait dans le site : limitez les schémas à des formes, des traits et du texte.

> [!ERREUR] Schéma introuvable
> « schéma introuvable : diagrams/flow.svg » : l'`id` de `::schema` est le nom du fichier sans `.svg`, dans le
> dossier `diagrams` (`paths.diagrams` dans la configuration).

## Pour aller plus loin

- [Le Markdown étendu](#/write/markdown~capture-schema-avant-et-apres) : la directive `::schema`.
- [Thème, couleurs et logo](#/reference/theme) : les jetons de couleur derrière les classes.
- [Exemple · Parcours de bout en bout : une commande](#/examples/journey) : un schéma avec des étapes enchaînées, en
  attente et planifiées.
