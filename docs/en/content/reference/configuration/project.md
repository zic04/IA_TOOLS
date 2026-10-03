## The project

| Key | Type · default | Role | Example |
|---|---|---|---|
| `kit` | text · `"*"` | Kit versions the project accepts (semver range); outside the range, exit code 3 | `"^0.1.0"` |
| `product` | object, required | The documented product | `{ name: "Acme Orders" }` |
| `product.name` | text, required | Name shown in the site, the messages and the default output file | `"Acme Orders"` |
| `product.slug` | `[a-z0-9-]` · from the name | Short name: default of `theme.key` and `env.prefix` | `"acme-orders"` |
| `language` | `"en"` or `"fr"` · `"en"` | Language of the site, of the page templates and of the CLI messages | `"fr"` |
| `languages` | list of language codes or `null` · `null` | Declares the documentation as multilingual (ARCHITECTURE.md §6.12): at least two, each one a language the kit speaks (currently `en`/`fr`, else `languagesUnsupported`); the first is the source (`language` is then derived from it, `languagesSource` otherwise). Not declared: the project is unaffected, no selector, no translations folder | `["en", "fr"]` |
| `output` | path · `dist/<name>-Documentation.html` | The generated file, relative to the project | `"dist/acme-orders.html"` |
| `extra` | object · `{}` | Free: never read by the kit, passed to the project's own scripts (the demo setup receives the whole configuration) | `{ demoCustomer: "Northwind Bistro" }` |

See [Documenting in multiple languages](#/spaces/languages) for `languages` and `paths.translations`.

## The folders

| Key | Type · default | Role | Example |
|---|---|---|---|
| `paths` | object · `{}` | Folder names, relative to the project | `{ content: "contenu", diagrams: "schemas" }` |
| `paths.content` | folder · `"content"` | Pages, `toc.json`, `glossary.json`, `home.md` | `"contenu"` |
| `paths.images` | folder · `"images"` | Captures (`<id>.webp`) and zone files (`zones/<id>.json`) | `"images"` |
| `paths.diagrams` | folder · `"diagrams"` | SVG diagrams | `"schemas"` |
| `paths.facts` | folder · `"facts"` | Where `doc-kit facts` writes one file per source (`<source>.json`), read by `::facts` (ARCHITECTURE.md §6.9) | `"facts"` |
| `paths.translations` | folder · `"translations"` | Holds `translations/<lang>/`, the per-language mirror of `paths.content` (ARCHITECTURE.md §6.12); must not be inside `paths.content` | `"i18n-content"` |
| `paths.sync` | folder · `"."` (the project root) | Where `sync.json`, the reference of `doc-kit sync`, lives (ARCHITECTURE.md §6.10) | `"."` |

Folder names may not contain `< > : " | ? *`. Older projects keep their own names through `paths`
([Migrate a legacy project](#/migrate/legacy-project)).

## The documented version

| Key | Type · default | Role | Example |
|---|---|---|---|
| `version` | object · `{}` | Where the version shown by the site is read | |
| `version.file` | path or `null` · `null` | A file of the application, relative to the project | `"../../package.json"` |
| `version.pattern` | regular expression · `"version"\s*:\s*"([^"]+)"` | Its first group is the version | `"^([\\d.]+)"` |
| `version.fallback` | text · `"0.0.0"` | Used when the file is missing or the pattern finds nothing | `"2.4.0"` |

The version appears in the top bar, on the home page, in the footer, in the zone files of new captures, and is
compared with them by `doc-kit check images` and `doc-kit audit`. `doc-kit export` freezes it as `version.fallback`
in the copy. For a Python application: `file: "../../pyproject.toml"` and a pattern such as
`"(?:^|\\n)version\\s*=\\s*\"([^\"]+)\""` (written by `doc-kit init` when it finds a `pyproject.toml`).

## Environment and application

| Key | Type · default | Role | Example |
|---|---|---|---|
| `env` | object · `{}` | Environment variables of the project | |
| `env.prefix` | `[A-Z][A-Z0-9_]*` · the slug in capitals | Prefix of the project's variables: `<PREFIX>_URL`, `_SESSION`, `_PLANS`, `_READONLY`, `_VERSION` | `"ACME"` |
| `app` | object · `{}` | The documented application | |
| `app.url` | URL or `null` · `null` | Address used by `connect`, `capture`, `demo` and `doctor --network`, without a trailing path | `"http://localhost:3000"` |
| `app.dir` | path or `null` · `null` | The application root (its code), relative to the project; written by `init`. The skill's briefs give it to the agents (`appDir`), and `doctor` checks that it exists and looks there for a version that contradicts the documented one | `"../.."` |

## Sign-in

| Key | Type · default | Role | Example |
|---|---|---|---|
| `auth` | object · `{}` | The authentication adapter and its options, side by side | `{ adapter: "manual", loginPattern: "/login" }` |
| `auth.adapter` | name or `local:<path>` · `"manual"` | `manual`, `none`, `nextauth`, `api-me`, or a project adapter | `"local:adapters/sso.mjs"` |

The other keys of `auth` are the options of the adapter, validated by the adapter itself. Every adapter accepts:

| Option | Default | Role |
|---|---|---|
| `start` | `"/"` | Path opened by `connect` and by the session check |
| `loginPattern` | `"login\|signin\|sign-in\|oauth\|authorize"` | A path or query matching it is a sign-in page |
| `browser` | `"chromium"` | `"chrome"` uses the installed Google Chrome (bot challenges) |

`nextauth` adds `endpoint` (default `/api/auth/session`); `api-me` adds `url` (default `/api/me`), `proof` (default
`id`) and `who` (default `name`). See [Adapters](#/reference/adapters).

## Following the application

| Key | Type · default | Role | Example |
|---|---|---|---|
| `sync` | object · `{}` | `doc-kit sync` (ARCHITECTURE.md §6.10): what the documentation must follow after a change of the application | |
| `sync.labels` | list of globs · `[]` | Message files whose labels are followed, relative to the project; default: the `messages` of every `i18n-registry` coverage adapter | `["../../src/messages/*.json"]` |
| `capture.compareThreshold` | number 0 to 1 · `0.005` | `capture --compare`: share of differing pixels above which a screenshot is replaced rather than kept as is | `0.01` |

A marked page's footer shows "Checked against version {version} on {date}" once it is built again. See
[Following the application](#/reference/cli/write-check~doc-kit-sync).

## Estimating the agents' cost

| Key | Type · default | Role | Example |
|---|---|---|---|
| `llm` | object · `{}` | Prices per model, read by `sync --estimate` and by the skill's `brief.mjs --estimate` (ARCHITECTURE.md §6.11); no default price | |
| `llm.currency` | text or `null` · `null` | Shown next to the estimated cost | `"EUR"` |
| `llm.prices` | object · `{}` | One entry per model (`haiku`, `sonnet`, `opus`…): `{ input, output, cacheRead? }`, per million tokens | `{ sonnet: { input: 3, output: 15 } }` |

## Reviews on demand

| Key | Type · default | Role | Example |
|---|---|---|---|
| `review` | object · `{}` | `doc-kit probe` and the `auth`/`guards` of the `api` facts source | |
| `review.guards` | object · `{}` | The role and user guard patterns, side by side | `{ role: ["is_admin"] }` |
| `review.guards.role` | list of regular expressions (as strings) · `[]` | Replaces the built-in role-guard pattern (`admin\|role\|permission\|scope\|owner\|super\|staff`) when not empty | `["is_admin"]` |
| `review.guards.user` | list of regular expressions (as strings) · `[]` | Replaces the built-in user-guard pattern (`current_user\|authenticated\|login_required\|require_auth\|session\|token`) when not empty | `["require_login"]` |
| `review.params` | object · `{}` | Path parameter name → example value, so `doc-kit probe` can fill a route like `/groups/{group_id}`; a route with a parameter not given here is skipped | `{ "group_id": "g1" }` |
| `review.semgrep` | path or `null` · `null` | A local semgrep rules folder, relative to the project; without it, `doc-kit facts --tools` never runs semgrep (never `--config auto`, which downloads rules) | `"security/semgrep-rules"` |

See [Security and maintainability reviews](#/spaces/reviews).

## Further reading

- [Configuration](#/reference/configuration): validation, precedence and derived defaults.
- [Capture and masking keys](#/reference/configuration/capture).
- [Coverage, theme and text keys](#/reference/configuration/site).
