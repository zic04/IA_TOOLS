# Configuration examples

Two complete `doc.config.mjs` files, following §3 of the contract (`ARCHITECTURE.md`). Both applications are fictional:
- **Acme Orders**: an order-management web app built with Next.js (App Router), whose users sign in through an identity provider. Its documentation is captured **on production, read-only**.
- **Acme Deliveries**: a delivery-planning app with a React Router front end, a Python API and a map. Its documentation is captured on a **prepared local demo**, plus a few read-only production captures.

Reminders:
- Validation is **strict**: an unknown key is an error (exit code 2), reported with its path, for example `capture.storgae`.
- Precedence, from strongest to weakest: CLI option > `DOC_KIT_*` variable > `<PREFIX>_*` variable > configuration file > default value.
- The defaults are **neutral**: no cookie, no CSS framework selector, no brand colour and no geolocation are applied unless the configuration asks for them. A key you leave out takes its default value.
- Paths are relative to the documentation project folder.

## Acme Orders — production read-only, Next.js, manual sign-in

```js
// doc.config.mjs — documentation of Acme Orders, in <app>/docs/manual/
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0", // accepted kit versions; outside this range, every command stops with exit code 3
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en", // language of the site and of the CLI messages
  output: "dist/Acme-Orders-Documentation.html",
  paths: { content: "content", images: "images", diagrams: "diagrams" }, // the defaults, shown for clarity

  // Version shown in the site's banner: read in the application's code. The fallback is used when the
  // file cannot be found (for example, a copy of this folder outside the repository).
  version: {
    file: "../../package.json",
    pattern: "\"version\"\\s*:\\s*\"([^\"]+)\"",
    fallback: "2.4.0",
  },

  // Also reads ACME_URL, ACME_SESSION, ACME_PLANS, ACME_READONLY and ACME_VERSION (the fallback version).
  env: { prefix: "ACME" },

  // The captured application is PRODUCTION. Captures run there only with a session, read-only.
  app: { url: "https://orders.acme.example" },

  // "manual": `doc-kit connect` opens the app, the person signs in through the identity provider (SSO, MFA),
  // then presses Enter in the terminal. Before each capture, the session is valid if the app does not redirect
  // to a page whose URL matches loginPattern. Acme Orders has its own /login route and the identity provider
  // uses /oauth2/ and /authorize URLs.
  auth: {
    adapter: "manual",
    loginPattern: "/login|/oauth2/|/authorize|/signin",
  },

  capture: {
    // Everything is captured on production: read-only always, a banner and a confirmation before each run,
    // `doc-kit demo` refused (written by `doc-kit init --target production`).
    target: "production",
    // Acme Orders keeps its production plans apart, in case a demo is added one day.
    plans: "captures/plans-prod",
    setup: null, // no demo: everything is captured on production
    locale: "en-US",
    timezone: "America/New_York",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null, // the app does not use the position
    storage: { theme: "light", density: "comfortable" }, // localStorage set before each capture
    cookies: [{ name: "NEXT_LOCALE", value: "en" }], // the interface language is a cookie (Next.js i18n)
    selectors: { block: "section.card", frame: null }, // used by the { block } target
    map: null,
    // Routes never to open: the record of an order without an approval chain creates one while rendering
    // (app/(app)/orders/[id]/page.tsx:88-92, ensureApprovalChain) and notifies the approver. Only the three
    // records already opened during the capture run of 1 October 2026, whose chain exists, stay allowed.
    forbidden: [
      "^/orders/(?!(ord_7f3a21|ord_91bc04|ord_c2d9e8)(/|$))[^/]+",
    ],
    readOnly: true, // always on production ("auto" behaves the same there; false is refused)
  },

  // Automatic masking: GUIDs, and the values of the application's local .env whose name suggests a URL,
  // a tenant, a client, an account, a host, an e-mail address or a user. Plus the internal host names.
  masking: {
    env: ["../../.env.local"],
    exclude: "localhost|127\\.0\\.0\\.1",
    guid: true,
    patterns: ["[a-z0-9-]+\\.internal\\.acme\\.example"],
  },

  // Every app/**/page.tsx route must be cited (in toc.json "routes" or in the text of a page): 61 routes.
  coverage: [{ adapter: "next-app-router", app: "../../app" }],

  theme: {
    key: "acme-orders-doc-theme", // localStorage key of the site's light / dark theme
    logo: "theme/logo.svg",
    colors: {}, // light-theme colour tokens; empty: the kit's neutral palette
    dark: {},
    icons: {},
  },

  statuses: {}, // [[status …]]: neutral badges; Acme Orders shows its statuses as plain labels
  texts: {},
  feedback: { label: "Report a problem in this documentation", url: "https://support.acme.example/docs" },
  extra: {},
});
```

A capture run:

```bash
doc-kit connect --url https://orders.acme.example   # the person signs in (SSO + MFA), then presses Enter
doc-kit capture "prod-cf-*" --preview                # read-only, small batches
doc-kit connect --forget                             # deletes the session
```

## Acme Deliveries — local demo, React Router + Python API, a map

```js
// doc.config.mjs — documentation of Acme Deliveries, in <app>/docs/manual/
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0",
  product: { name: "Acme Deliveries", slug: "acme-deliveries" },
  language: "en",
  output: "dist/Acme-Deliveries-Documentation.html",

  version: {
    file: "../../frontend/src/lib/version.ts",
    pattern: "APP_VERSION\\s*=\\s*\"([^\"]+)\"",
    fallback: "0.9.3",
  },

  // Also reads DELIVERIES_URL, DELIVERIES_SESSION, DELIVERIES_PLANS, DELIVERIES_READONLY and DELIVERIES_VERSION.
  // Production captures: DELIVERIES_URL=https://deliveries.acme.example DELIVERIES_PLANS=captures/plans-prod, with a session.
  env: { prefix: "DELIVERIES" },

  // By default, the application running LOCALLY (front-end dev server) with the demo data. `dir` is the
  // application root, written by `doc-kit init`: the front end sits in frontend/ and the Python API in api/, and
  // the writers (and the skill's briefs) read both from there.
  app: { url: "http://localhost:5173", dir: "../.." },

  // "api-me": the session is valid when the API's "me" endpoint answers with the signed-in user (the front-end
  // dev server forwards /api to the Python API). The adapter's options go next to "adapter": `url` (default
  // "/api/me"), `proof` (field that proves the sign-in, default "id"), `who` (field shown by connect, default "name").
  auth: { adapter: "api-me", url: "/api/v1/me", proof: "id", who: "name" },

  capture: {
    target: "local", // the application running on this machine
    plans: "captures/plans",
    // Fills the development database; idempotent, so it can run before every capture run.
    // Two depots, 40 deliveries in every status, fictional drivers and customers. Run by `doc-kit demo`.
    setup: "captures/setup-demo.mjs",
    locale: null, // derived from language: en-US
    timezone: "Europe/London",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    // The driver's position in the mobile context, in the middle of the demo deliveries.
    geolocation: { latitude: 51.5072, longitude: -0.1276 },
    // The depot remembered by the app, the interface language, and the "what's new" notice marked as seen
    // for the current version ("{version}" is replaced by the application version).
    storage: { theme: "light", lang: "en", depot: "north", "whats-new-seen": "{version}" },
    cookies: [], // the interface language is in localStorage ("lang"), not in a cookie
    selectors: { block: "div.panel", frame: null },
    // Deterministic framing of a map capture: the plan's view { lon, lat, zoom } is written into these URL
    // parameters of the app (x and y in Web Mercator metres, EPSG:3857).
    map: { x: "mx", y: "my", z: "mz" },
    forbidden: [],
    readOnly: "auto",
  },

  masking: {
    env: ["../../.env"],
    exclude: "localhost|127\\.0\\.0\\.1|^db$|\\.local$",
    guid: true,
    patterns: [],
  },

  // 74 elements: 22 routes of App.tsx, 12 map layers, 25 dashboard widgets, 15 toolbar tools.
  // The English title of each layer, widget and tool (from en.json) must appear in the documentation.
  // One i18n-registry entry per registry: `source` holds the ids, `block` (optional) narrows the part of the
  // source that is read, `pattern` extracts the ids (default: every quoted string), `key` finds each label in
  // `messages`. All options: header of adapters/coverage/i18n-registry.mjs.
  coverage: [
    { adapter: "react-router", file: "../../frontend/src/App.tsx" },
    {
      adapter: "i18n-registry",
      family: "Map layers",
      source: "../../frontend/src/lib/layers.ts",
      block: "LAYER_IDS\\s*=\\s*\\[([^\\]]+)\\]",
      messages: "../../frontend/src/i18n/locales/en.json",
      key: "map.layer.{id}.title",
      aliases: { base_map: "base" }, // base_map has no label of its own: it uses the label of "base"
      exclude: ["debug"],
    },
    {
      adapter: "i18n-registry",
      family: "Dashboard widgets",
      source: "../../frontend/src/features/dashboard/registry.ts",
      pattern: "^\\s*[a-z0-9_]+: \\{ id: \"(?<id>[a-z0-9_]+)\"",
      messages: "../../frontend/src/i18n/locales/en.json",
      key: "dashboard.widget.{id}.title",
    },
    {
      adapter: "i18n-registry",
      family: "Toolbar tools",
      source: "../../frontend/src/features/map/toolbar.ts",
      block: "TOOL_IDS\\s*=\\s*\\[([^\\]]+)\\]",
      messages: "../../frontend/src/i18n/locales/en.json",
      key: "map.tool.{id}",
    },
  ],

  theme: { key: "acme-deliveries-doc-theme", logo: "theme/logo.svg", colors: {}, dark: {}, icons: {} },

  // [[status 2]]: the coloured badge of a delivery status, as the app shows it on the map.
  statuses: {
    "0": ["st-0", "0 · delivered"],
    "1": ["st-1", "1 · out for delivery"],
    "2": ["st-2", "2 · delayed"],
    "3": ["st-3", "3 · failed attempt"],
    "4": ["st-4", "4 · returned to depot"],
  },

  texts: { "home.primaryAction": "Explore the editors" },
  feedback: null,

  // Free: passed to the project's own scripts (setup-demo.mjs, capture plans).
  extra: {
    api: "http://localhost:8000/api/v1",
    demo: { depot: "north", day: "2026-09-30" },
  },
});
```

Capture runs:

```bash
doc-kit demo                                     # prepares the demo (idempotent), app running locally
doc-kit capture "map-layer-*" --preview          # demo captures

# Production configuration, read-only, separate plans (prefix prod-)
doc-kit connect --url https://deliveries.acme.example
DELIVERIES_URL=https://deliveries.acme.example DELIVERIES_PLANS=captures/plans-prod doc-kit capture "prod-*" --preview
doc-kit connect --forget
```

On Windows PowerShell, set the variables first: `$env:DELIVERIES_URL = "https://deliveries.acme.example"`.

## What sets them apart

| Key | Acme Orders | Acme Deliveries | Why |
|---|---|---|---|
| `app.url` | Production | Local | One captures production; the other a prepared demo |
| `auth.adapter` | `manual` + `loginPattern` | `api-me` | A redirect to a sign-in page, against an API that says who is signed in |
| `capture.plans` | `captures/plans-prod` | `captures/plans` | Acme Orders only has production plans |
| `capture.setup` | `null` | `captures/setup-demo.mjs` | An idempotent demo |
| `capture.cookies` | `NEXT_LOCALE=en` | — | Interface language: a cookie, against `localStorage` (`lang`) |
| `capture.geolocation` | `null` | A position | Only Acme Deliveries has a mobile context that uses the position |
| `capture.map` | `null` | `mx`, `my`, `mz` | Only Acme Deliveries has a map |
| `capture.forbidden` | Order records | — | A write by the server while rendering (`ensureApprovalChain`) |
| `coverage` | Routes `app/**/page.tsx` | Routes + i18n registries | What must be documented depends on the product |
| `statuses` | — | 5 coloured statuses | Statuses colour-coded in the application |

## Spaces, facts, sync and the agent economy

Fictional examples of the keys added by the two-space standard (ARCHITECTURE.md §6.1a, §6.9, §6.10, §6.11).
None of them has a default that changes existing behaviour: a project that does not set them keeps building
exactly as before.

```js
// content/toc.json declares the spaces; doc.config.mjs only configures their export and the facts/sync tooling.
export default defineConfig({
  // … product, language, app, capture, coverage, theme as above …

  // One export per declared space, besides the full site (default: spaces.export === true already, this line
  // is only here to show the key). {space} in the path is replaced by each space's id.
  spaces: {
    export: true,
    output: "dist/Acme-Orders-Documentation-{space}.html",
  },

  // facts/<source>.json (doc-kit facts) and sync.json (doc-kit sync) live at the project root by default;
  // an older or larger project may want them elsewhere.
  paths: { content: "content", images: "images", diagrams: "diagrams", facts: "facts", sync: "." },

  // sync --apply --labels only follows message files matched here (default: the next-app-router and
  // i18n-registry coverage adapters' own "messages" option, when they have one).
  sync: { labels: ["../../messages/en.json", "../../messages/fr.json"] },

  capture: {
    // … as above …
    // capture --compare keeps an image as is (only its zones are rewritten) below this ratio of changed
    // pixels; above it, the image is replaced. Default 0.005 (0.5 %); shown here for clarity.
    compareThreshold: 0.005,
  },

  // Prices per million tokens, read by `sync --estimate` and the skill's `brief.mjs --estimate`
  // (ARCHITECTURE.md §6.11). No default: prices change, and differ by contract. The numbers below are
  // illustrative only — read them from your own contract or the provider's current price page, never from
  // this file.
  llm: {
    currency: "EUR",
    prices: {
      haiku: { input: 1, output: 5, cacheRead: 0.1 },
      sonnet: { input: 3, output: 15, cacheRead: 0.3 },
      opus: { input: 15, output: 75, cacheRead: 1.5 },
    },
  },
});
```

| Key | Role | Default |
|---|---|---|
| `spaces.export` | Write one export per declared space, besides the full site | `true` |
| `spaces.output` | Path of each export, must contain `{space}` | the full site's output, `-{space}` inserted before its extension |
| `paths.facts` | Folder of `facts/<source>.json`, committed with the project | `"facts"` |
| `paths.sync` | Folder of `sync.json`, committed with the project | the project root (`"."`) |
| `sync.labels` | Message files `sync --apply --labels` is allowed to touch | the coverage adapters' own `messages` |
| `capture.compareThreshold` | `capture --compare`: ratio of changed pixels above which the image is replaced (0 to 1) | `0.005` |
| `llm.currency`, `llm.prices` | Per-model prices (per million tokens), for the agent cost estimates | none — no estimate without it |

## Without screenshots

When the documentation must be written without any access to the application, declare it: `doc-kit init --capture none` writes it for you.

```js
  capture: { mode: "none" }, // no screenshot: each screen is described by a table of its elements
```

`capture` and `connect` then explain the mode and stop (exit code 2), `doctor` and the guided mode stop asking for a session, `doc-kit new` writes "The screen" as a table `| Element | What it shows |`, and `doc-kit audit` counts `annotated` as `n/a` ([maturity.md](maturity.md)).

## Older projects

A project written before doc-kit, with French folder names, keeps working: declare its folders in `paths`, for example `paths: { content: "contenu", diagrams: "schemas" }`. Its French-keyed JSON files are read as they are; `doc-kit migrate` rewrites them in the current format.
