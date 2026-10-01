## In short

The site has no colour of its own: every colour is a **token** (`--brand`, `--surface`, `--text`…), with one value
for the light theme and one for the dark theme. The default palette is neutral (slate surfaces, a blue brand) and
passes the WCAG contrast thresholds. A project changes the tokens it wants, adds a logo and icons, and colours its
status badges.

1. `theme.colors` changes tokens of the light theme (and the base of the dark one); `theme.dark` changes tokens of
   the dark theme. Values are hexadecimal; an unknown token name is a configuration error.
2. `doc-kit doctor` checks the contrast of the 16 text and background pairs in both themes.
3. `theme.logo` is an SVG, cleaned before it is inlined in the top bar and used as the favicon.
4. `theme.icons` adds or replaces icons used by the sections and the callouts.

## The tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `brand` | `#2563eb` | `#60a5fa` | Links, active items, markers, primary buttons |
| `brand-strong`, `brand-deep` | `#1d4ed8`, `#1e40af` | `#93c5fd`, `#3b82f6` | Brand text on light surfaces, hovered states |
| `brand-soft`, `brand-line` | `#eff6ff`, `#bfdbfe` | `#172554`, `#1e3a8a` | Soft backgrounds and borders of brand elements |
| `chrome`, `chrome-2`, `chrome-line` | `#0f172a`, `#1e293b`, `#334155` | same | Top bar, home hero, code blocks, tooltips |
| `chrome-text`, `chrome-text-strong`, `brand-on-chrome` | `#cbd5e1`, `#e2e8f0`, `#93c5fd` | same | Text on the chrome |
| `bg`, `surface`, `surface-2` | `#f8fafc`, `#ffffff`, `#f1f5f9` | `#020617`, `#0f172a`, `#1e293b` | Page, cards, secondary surfaces |
| `line`, `line-strong` | `#e2e8f0`, `#cbd5e1` | `#1e293b`, `#334155` | Borders |
| `text`, `text-soft`, `text-faint` | `#0f172a`, `#475569`, `#64748b` | `#f1f5f9`, `#cbd5e1`, `#94a3b8` | Text, secondary text, details |
| `ok`, `warn`, `danger`, `info`, `violet` | `#15803d`, `#b45309`, `#b91c1c`, `#1d4ed8`, `#6d28d9` | lighter | Callouts, diagram boxes; each has a `-soft` background |
| `st-0` … `st-5` | green, orange, red, blue, purple, pink | same | Status badge colours |

Other tokens: `brand-glow` (translucent overlays), `hero-accent` (end of the home title), `on-brand` and
`on-chrome` (text on the brand colour and on the chrome), `bubble-text`, `backdrop`, `ink`, `shadow`,
`print-bg`, `print-text`. The full list, with the role of each token, is in `engine/theme/default-tokens.json`.

```js
theme: {
  colors: { brand: "#6d28d9", "brand-strong": "#5b21b6", "brand-soft": "#f5f3ff", "brand-line": "#ddd6fe" },
  dark: { brand: "#a78bfa", "brand-strong": "#c4b5fd", "brand-soft": "#2e1065", "brand-line": "#4c1d95" },
},
```

## Contrast

`doc-kit doctor` computes the WCAG contrast of these pairs, in both themes: text on `bg`, `surface`; `text-soft` on
`surface`; `text-faint` on `surface` (3:1); `brand-strong` on `surface` and on `brand-soft`; `on-brand` on `brand`;
`on-chrome`, `chrome-text` and `brand-on-chrome` on `chrome`; `hero-accent` on `chrome` (3:1); `violet`, `warn`,
`danger`, `info` and `ok` on their `-soft` background. The threshold is 4.5:1 unless noted.

```text
⚠ 2 colour pairs below the WCAG contrast: light on-brand on brand 3.9 < 4.5 · dark brand-strong on brand-soft 4.1 < 4.5
  → darken or lighten these tokens in theme.colors (light) or theme.dark
```

## The logo

`theme.logo` is the path of an SVG file. Before it is inlined, it is checked; when a rule fails, the build reports it
and uses the kit's logo instead.

| Rule | Message when it fails |
|---|---|
| An `<svg>` document with a `viewBox` | `logo rejected (theme/logo.svg): missing viewBox attribute` |
| No `<script>`, no `on…` event handler, no `javascript:` | `logo rejected …: contains a <script>` |
| No `<foreignObject>`, `<iframe>`, `<embed>`, `<object>` | `logo rejected …: embedded content` |
| No external reference: `href` only to `#id` | `logo rejected …: external reference` |

The logo is shown in the top bar and becomes the favicon, filled with the brand colour when it has no `fill` of its
own. Draw it with `currentColor` or without fill to let it follow the theme.

## Icons

Sections choose an icon by name (`"icon": "screen"`). The kit's icons are 24 × 24 stroked paths: `map`, `sliders`,
`shield`, `code`, `search`, `sun`, `moon`, `print`, `play`, `expand`, `close`, `tip`, `warning`, `lock`,
`recipe`, `info`, `caution`, `gear`, `book`, `arrow`, `link`, `screen`, `clock`… `theme.icons` adds new ones or
replaces existing ones:

```js
theme: { icons: { truck: '<path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="17" r="2"/>' } },
```

An icon with a script, an event handler, `javascript:`, a `<foreignObject>` or an `<iframe>` is a configuration
error. An unknown section icon is a build warning.

## Status badges

`statuses` colours the `[[status id]]` badges: `{ open: ["st-1", "Open"] }` gives an orange badge labelled
"Open". The colour is a token name, a hexadecimal colour or `var(--token)`.

## Pitfalls and observed gaps

> [!WARNING] Change both themes together
> A dark brand colour that reads well on white may disappear on the dark background. Set `theme.dark` for every
> token of `theme.colors` you change, then run `doc-kit doctor` and `doc-kit view <page> --theme dark`.

> [!NOTE] The theme choice of the readers
> The reader's choice is kept per browser under `theme.key`. Changing `theme.key` resets everybody to the system
> theme.

## Further reading

- [Diagrams](#/write/diagrams): the `d-*` classes, drawn with these tokens.
- [Coverage, theme and text keys](#/reference/configuration/site): the `theme` keys.
- [Languages and texts](#/reference/i18n): the texts of the site.
