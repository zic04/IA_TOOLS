## Coverage

| Key | Type · default | Role | Example |
|---|---|---|---|
| `coverage` | list · `[]` | Coverage adapters: each entry is `{ adapter, …options }` | `[{ adapter: "next-app-router", app: "../../app" }]` |

Each entry names a built-in adapter (`next-app-router`, `react-router`, `i18n-registry`, `glob`) or a project
adapter (`local:adapters/x.mjs`), with its options next to it. An unknown option is an error reported with its path
(`coverage[0].ap`). Empty: no coverage check. See [Adapters](#/reference/adapters).

## Theme

| Key | Type · default | Role | Example |
|---|---|---|---|
| `theme` | object · `{}` | Colours, logo and icons of the site | |
| `theme.key` | text or `null` · `<slug>-doc-theme` | `localStorage` key of the reader's theme choice | `"acme-doc-theme"` |
| `theme.logo` | path or `null` · the kit's logo | An SVG with a `viewBox`; also used as the favicon | `"theme/logo.svg"` |
| `theme.colors` | token → `#hex` · `{}` | Colour tokens of the light theme (and the base of the dark one) | `{ brand: "#6d28d9" }` |
| `theme.dark` | token → `#hex` · `{}` | Colour tokens of the dark theme | `{ brand: "#a78bfa" }` |
| `theme.icons` | name → SVG paths · `{}` | Icons added to the kit's set, or replacing one | `{ truck: "<path d='M3 7h11v8H3z'/>" }` |

The token names, the contrast check and the logo rules are on [Theme, colours and logo](#/reference/theme).

## Spaces

| Key | Type · default | Role | Example |
|---|---|---|---|
| `spaces` | object · `{}` | The files per space, when `content/toc.json` declares spaces; ignored otherwise | |
| `spaces.export` | boolean · `true` | `false`: `build` writes the full site alone | `false` |
| `spaces.output` | path or `null` · `null` | The file of each space, relative to the project; it must contain `{space}` (exit code 2 otherwise). Default: the output with `-<space>` before its extension | `"dist/Acme-Orders-{space}.html"` |

A space is the part of the documentation written for one audience, such as `business` or `takeover`. The site gets
a space selector, and `build` also writes one file per space, from which the other spaces are removed.

## Status badges

| Key | Type · default | Role | Example |
|---|---|---|---|
| `statuses` | id → `[colour, label]` · `{}` | Colour and label of each `[[status id]]` badge | `{ open: ["st-1", "Open"], paid: ["#15803d", "Paid"] }` |

The colour is a token name (`st-0` to `st-5`, or any token such as `danger`), a hexadecimal colour, or `var(--x)`.
An id that is not declared shows as a neutral badge with the id as its label.

## Texts

| Key | Type · default | Role | Example |
|---|---|---|---|
| `texts` | i18n key → text · `{}` | Replaces any text of the site or of the messages | `{ "home.primaryAction": "Explore the editors" }` |

A value may be a plural object, `{ one: "…", other: "…" }`. An unknown key is a build warning that suggests the
closest one. See [Languages and texts](#/reference/i18n).

## Feedback link

| Key | Type · default | Role | Example |
|---|---|---|---|
| `feedback` | `{ label, url }` or `null` · `null` | A "Report a problem" link in the footer of every page | `{ url: "mailto:docs@example.org" }` |

`url` starts with `http:`, `https:` or `mailto:`; `label` is optional (default: the text `ui.feedback` of the
site's language).

## Further reading

- [Configuration](#/reference/configuration): validation, precedence and derived defaults.
- [Project, version and sign-in keys](#/reference/configuration/project).
- [Capture and masking keys](#/reference/configuration/capture).
