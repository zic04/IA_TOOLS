## En bref

Le site n'a aucune couleur à lui : chaque couleur est un **jeton** (`--brand`, `--surface`, `--text`…), avec une
valeur pour le thème clair et une pour le thème sombre. La palette par défaut est neutre (surfaces ardoise, une marque
bleue) et respecte les seuils de contraste WCAG. Un projet change les jetons qu'il veut, ajoute un logo et des icônes,
et colore ses pastilles de statut.

1. `theme.colors` change des jetons du thème clair (et la base du thème sombre) ; `theme.dark` change des jetons du
   thème sombre. Les valeurs sont hexadécimales ; un nom de jeton inconnu est une erreur de configuration.
2. `doc-kit doctor` vérifie le contraste des 16 paires texte-fond dans les deux thèmes.
3. `theme.logo` est un SVG, nettoyé avant d'être intégré dans la barre du haut et utilisé comme favicon.
4. `theme.icons` ajoute ou remplace des icônes utilisées par les sections et les encadrés.

## Les jetons

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `brand` | `#2563eb` | `#60a5fa` | Liens, éléments actifs, pastilles numérotées, boutons principaux |
| `brand-strong`, `brand-deep` | `#1d4ed8`, `#1e40af` | `#93c5fd`, `#3b82f6` | Texte de marque sur les surfaces claires, états survolés |
| `brand-soft`, `brand-line` | `#eff6ff`, `#bfdbfe` | `#172554`, `#1e3a8a` | Fonds doux et bordures des éléments de marque |
| `chrome`, `chrome-2`, `chrome-line` | `#0f172a`, `#1e293b`, `#334155` | identiques | Barre du haut, bandeau d'accueil, blocs de code, infobulles |
| `chrome-text`, `chrome-text-strong`, `brand-on-chrome` | `#cbd5e1`, `#e2e8f0`, `#93c5fd` | identiques | Texte sur le chrome |
| `bg`, `surface`, `surface-2` | `#f8fafc`, `#ffffff`, `#f1f5f9` | `#020617`, `#0f172a`, `#1e293b` | Page, cartes, surfaces secondaires |
| `line`, `line-strong` | `#e2e8f0`, `#cbd5e1` | `#1e293b`, `#334155` | Bordures |
| `text`, `text-soft`, `text-faint` | `#0f172a`, `#475569`, `#64748b` | `#f1f5f9`, `#cbd5e1`, `#94a3b8` | Texte, texte secondaire, détails |
| `ok`, `warn`, `danger`, `info`, `violet` | `#15803d`, `#b45309`, `#b91c1c`, `#1d4ed8`, `#6d28d9` | plus clairs | Encadrés, boîtes des schémas ; chacun a un fond `-soft` |
| `st-0` … `st-5` | vert, orange, rouge, bleu, violet, rose | identiques | Couleurs des pastilles de statut |

Autres jetons : `brand-glow` (voiles translucides), `hero-accent` (fin du titre d'accueil), `on-brand` et `on-chrome`
(texte sur la couleur de marque et sur le chrome), `bubble-text`, `backdrop`, `ink`, `shadow`, `print-bg`,
`print-text`. La liste complète, avec le rôle de chaque jeton, est dans `engine/theme/default-tokens.json`.

```js
theme: {
  colors: { brand: "#6d28d9", "brand-strong": "#5b21b6", "brand-soft": "#f5f3ff", "brand-line": "#ddd6fe" },
  dark: { brand: "#a78bfa", "brand-strong": "#c4b5fd", "brand-soft": "#2e1065", "brand-line": "#4c1d95" },
},
```

## Le contraste

`doc-kit doctor` calcule le contraste WCAG de ces paires, dans les deux thèmes : `text` sur `bg`, `surface` ;
`text-soft` sur `surface` ; `text-faint` sur `surface` (3:1) ; `brand-strong` sur `surface` et sur `brand-soft` ;
`on-brand` sur `brand` ; `on-chrome`, `chrome-text` et `brand-on-chrome` sur `chrome` ; `hero-accent` sur `chrome`
(3:1) ; `violet`, `warn`, `danger`, `info` et `ok` sur leur fond `-soft`. Le seuil est de 4,5:1, sauf mention
contraire.

```text
⚠ 2 paires de couleurs sous le contraste WCAG : light on-brand sur brand 3.9 < 4.5 · dark brand-strong sur brand-soft 4.1 < 4.5
  → assombrissez ou éclaircissez ces jetons dans theme.colors (clair) ou theme.dark
```

## Le logo

`theme.logo` est le chemin d'un fichier SVG. Il est vérifié avant d'être intégré ; quand une règle n'est pas
respectée, le build le signale et utilise le logo du kit à la place.

| Règle | Message quand elle n'est pas respectée |
|---|---|
| Un document `<svg>` avec un `viewBox` | `logo refusé (theme/logo.svg) : attribut viewBox absent` |
| Pas de `<script>`, pas de gestionnaire d'événement `on…`, pas de `javascript:` | `logo refusé … : contient un <script>` |
| Pas de `<foreignObject>`, `<iframe>`, `<embed>`, `<object>` | `logo refusé … : contenu embarqué` |
| Aucune référence externe : `href` seulement vers `#id` | `logo refusé … : référence externe` |

Le logo s'affiche dans la barre du haut et devient le favicon, rempli avec la couleur de marque quand il n'a pas de
`fill` à lui. Dessinez-le avec `currentColor` ou sans remplissage pour qu'il suive le thème.

## Les icônes

Les sections choisissent une icône par son nom (`"icon": "screen"`). Les icônes du kit sont des tracés au trait de
24 × 24 : `map`, `sliders`, `shield`, `code`, `search`, `sun`, `moon`, `print`, `play`, `expand`, `close`, `tip`,
`warning`, `lock`, `recipe`, `info`, `caution`, `gear`, `book`, `arrow`, `link`, `screen`, `clock`… `theme.icons`
en ajoute de nouvelles ou remplace des icônes existantes :

```js
theme: { icons: { truck: '<path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="17" r="2"/>' } },
```

Une icône qui contient un script, un gestionnaire d'événement, `javascript:`, un `<foreignObject>` ou un `<iframe>`
est une erreur de configuration. Une icône de section inconnue est un avertissement du build.

## Les pastilles de statut

`statuses` colore les pastilles `[[statut id]]` : `{ open: ["st-1", "Open"] }` donne une pastille orange au libellé
« Open ». La couleur est un nom de jeton, une couleur hexadécimale ou `var(--token)`.

## Pièges et écarts constatés

> [!ATTENTION] Changez les deux thèmes ensemble
> Une couleur de marque foncée, bien lisible sur fond blanc, peut disparaître sur le fond sombre. Fixez `theme.dark`
> pour chaque jeton de `theme.colors` que vous changez, puis lancez `doc-kit doctor` et
> `doc-kit view <page> --theme dark`.

> [!NOTE] Le choix de thème des lecteurs
> Le choix du lecteur est gardé par navigateur sous `theme.key`. Changer `theme.key` ramène tout le monde au thème du
> système.

## Pour aller plus loin

- [Les schémas](#/write/diagrams) : les classes `d-*`, dessinées avec ces jetons.
- [Clés de couverture, de thème et de textes](#/reference/configuration/site) : les clés `theme`.
- [Langues et textes](#/reference/i18n) : les textes du site.
