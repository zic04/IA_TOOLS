## Couverture

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `coverage` | liste · `[]` | Adaptateurs de couverture : chaque entrée est `{ adapter, …options }` | `[{ adapter: "next-app-router", app: "../../app" }]` |

Chaque entrée nomme un adaptateur intégré (`next-app-router`, `react-router`, `i18n-registry`, `glob`) ou un
adaptateur du projet (`local:adapters/x.mjs`), avec ses options à côté. Une option inconnue est une erreur signalée
avec son chemin (`coverage[0].ap`). Vide : pas de contrôle de couverture. Voir [Les adaptateurs](#/reference/adapters).

## Thème

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `theme` | objet · `{}` | Couleurs, logo et icônes du site | |
| `theme.key` | texte ou `null` · `<slug>-doc-theme` | Clé de `localStorage` qui garde le choix de thème du lecteur | `"acme-doc-theme"` |
| `theme.logo` | chemin ou `null` · le logo du kit | Un SVG avec un `viewBox` ; sert aussi de favicon | `"theme/logo.svg"` |
| `theme.colors` | jeton → `#hex` · `{}` | Jetons de couleur du thème clair (et base du thème sombre) | `{ brand: "#6d28d9" }` |
| `theme.dark` | jeton → `#hex` · `{}` | Jetons de couleur du thème sombre | `{ brand: "#a78bfa" }` |
| `theme.icons` | nom → tracés SVG · `{}` | Icônes ajoutées au jeu du kit, ou qui en remplacent une | `{ truck: "<path d='M3 7h11v8H3z'/>" }` |

Les noms des jetons, le contrôle des contrastes et les règles du logo sont dans
[Thème, couleurs et logo](#/reference/theme).

## Pastilles de statut

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `statuses` | id → `[couleur, libellé]` · `{}` | Couleur et libellé de chaque pastille `[[statut id]]` | `{ open: ["st-1", "Open"], paid: ["#15803d", "Paid"] }` |

La couleur est un nom de jeton (`st-0` à `st-5`, ou tout autre jeton comme `danger`), une couleur hexadécimale, ou
`var(--x)`. Un id non déclaré s'affiche comme une pastille neutre, avec l'id pour libellé.

## Textes

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `texts` | clé i18n → texte · `{}` | Remplace n'importe quel texte du site ou des messages | `{ "home.primaryAction": "Découvrir les éditeurs" }` |

Une valeur peut être un objet de pluriel, `{ one: "…", other: "…" }`. Une clé inconnue est un avertissement du build
qui suggère la plus proche. Voir [Langues et textes](#/reference/i18n).

## Lien de signalement

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `feedback` | `{ label, url }` ou `null` · `null` | Un lien « Signaler un problème » dans le pied de chaque page | `{ url: "mailto:docs@example.org" }` |

`url` commence par `http:`, `https:` ou `mailto:` ; `label` est facultatif (défaut : le texte `ui.feedback` de la
langue du site).

## Pour aller plus loin

- [La configuration](#/reference/configuration) : validation, priorités et valeurs par défaut déduites.
- [Clés du projet, de la version et de la connexion](#/reference/configuration/project).
- [Clés de capture et de masquage](#/reference/configuration/capture).
