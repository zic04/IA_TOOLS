## The plans and the demo

| Key | Type · default | Role | Example |
|---|---|---|---|
| `capture` | object · `{}` | Everything about the captures | |
| `capture.mode` | `"app"` or `"none"` · `"app"` | `"none"` declares a documentation without screenshots: `capture` and `connect` explain it and stop (exit code 2), `doctor` and the guided mode stop asking for a session, `doc-kit new` and `doc-kit init` describe each screen with a table, and `annotated` is `n/a` in the audit | `"none"` |
| `capture.target` | `"local"`, `"demo"` or `"production"` · `"local"` | Where the screenshots are taken (with `capture.mode: "app"`). `"production"`: always read-only, a banner and a confirmation before each `capture`, `doc-kit demo` refused, `readOnly: false` refused (exit code 2) | `"production"` |
| `capture.plans` | path · `"captures/plans"` | Folder of the capture plans; `--plans` and `<PREFIX>_PLANS` win over it | `"captures/plans-prod"` |
| `capture.setup` | path or `null` · `null` | Idempotent script that prepares the demo data, run by `doc-kit demo` | `"captures/setup-demo.mjs"` |

## The browser

| Key | Type · default | Role | Example |
|---|---|---|---|
| `capture.locale` | text or `null` · from `language` | Browser locale: dates, numbers, `Accept-Language` | `"en-GB"` |
| `capture.timezone` | text · `"UTC"` | Browser time zone | `"Europe/Paris"` |
| `capture.viewports` | object · `desktop` 1600 × 1000, `mobile` 390 × 844 | Named window sizes; an entry chooses one with `context` | `{ desktop: { width: 1440, height: 900 } }` |
| `capture.webpQuality` | number 0 to 1 · `0.82` | Quality of the WebP encoding | `0.9` |
| `capture.geolocation` | `{ latitude, longitude }` or `null` · `null` | Position given to the pages, with the permission | `{ latitude: 48.85, longitude: 2.35 }` |

- Each viewport is `{ width, height }`, both at least 200. The `mobile` context also emulates a touch screen.
- Captures are taken at a device scale factor of 1, in the light colour scheme.

## What is set before each page

| Key | Type · default | Role | Example |
|---|---|---|---|
| `capture.storage` | object of texts · `{}` | `localStorage` keys set before each capture; `{version}` is replaced by the documented version | `{ theme: "light", tour: "done-{version}" }` |
| `capture.cookies` | list · `[]` | Cookies set before each capture: `name`, `value`, and any other Playwright cookie field | `[{ name: "NEXT_LOCALE", value: "en" }]` |

A cookie without `url` or `domain` is set for `app.url`. An entry's own `storage` is applied on top of
`capture.storage`, itself on top of the local storage of the session.

## Targets and maps

| Key | Type · default | Role | Example |
|---|---|---|---|
| `capture.selectors` | object · `{}` | CSS selectors of the application's containers | |
| `capture.selectors.block` | CSS selector or `null` · `null` | Containers found by the `{ block: "…" }` target | `"section.card"` |
| `capture.selectors.frame` | CSS selector or `null` · `null` | Boxes found by the `framed` option; `null`: any element with a border on its four sides | `".panel"` |
| `capture.map` | `{ x, y, z }` or `null` · `null` | Names of the URL parameters that frame a map, filled from an entry's `view` | `{ x: "mx", y: "my", z: "mz" }` |

## Safety

| Key | Type · default | Role | Example |
|---|---|---|---|
| `capture.forbidden` | list of regular expressions · `[]` | Route paths never opened: an entry is refused, a request is aborted | `["^/orders/[^/]+/approval$"]` |
| `capture.readOnly` | `"auto"`, `true` or `false` · `"auto"` | Aborts every request other than `GET`, `HEAD`, `OPTIONS`; `"auto"`: whenever a session is used, always on production | `true` |

See [Demo or production](#/capture/safety) for why both exist.

## Masking

| Key | Type · default | Role | Example |
|---|---|---|---|
| `masking` | object · `{}` | Values replaced by dots in the captures, and searched by `check secrets` | |
| `masking.env` | list of paths · `[]` | The application's local `.env` files; `init` lists the `.env` and `.env.local` it finds at the root and in the front-end folder | `["../../.env"]` |
| `masking.exclude` | regular expression or `null` · `"localhost\|127\\.0\\.0\\.1"` | Values never masked | `"localhost\|example\\.org"` |
| `masking.guid` | boolean · `true` | Masks GUIDs | `false` |
| `masking.patterns` | list of regular expressions · `[]` | More values to mask | `["ACME-\\d{6}"]` |
| `masking.allow` | list of regular expressions · `[]` | Values known to be public: never reported by `check secrets` (still masked in the captures) | `["^pk\\.acme-public-maps$"]` |

See [Masking](#/capture/masking) for the keys of a `.env` file that are considered sensitive.

## Further reading

- [Capture plans](#/capture/plans): the entries that use these settings.
- [Project, version and sign-in keys](#/reference/configuration/project): `app.url` and `auth`.
- [Coverage, theme and text keys](#/reference/configuration/site).
