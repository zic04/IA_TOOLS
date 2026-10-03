## In short

`doc.config.mjs`, at the root of a documentation project, is a JavaScript module whose default export is the
configuration. Only `product.name` is required; every other key has a neutral default.

```js
import { defineConfig } from "doc-kit/config";   // identity function: autocompletion in your editor

export default defineConfig({
  kit: "^0.3.0",
  product: { name: "Acme Orders" },
  language: "en",
  app: { url: "http://localhost:3000" },
});
```

1. **Strict validation.** An unknown key, a wrong type or a value out of range is an error, reported with its path,
   and the command exits with code 2. A close key is suggested:
   `✖ doc.config.mjs › capture.storgae: unknown key → did you mean “storage”?`
2. **Neutral defaults.** No cookie, no CSS framework selector, no brand colour and no geolocation unless you ask.
3. **Paths are relative to the project folder** (the folder of `doc.config.mjs`).
4. **Precedence**, from strongest to weakest: command-line option, `DOC_KIT_*` variable, `<PREFIX>_*` variable,
   this file, default value.

## In this part

| Sub-page | Keys |
|---|---|
| [Project, version and sign-in keys](#/reference/configuration/project) | `kit`, `product`, `language`, `languages`, `output`, `paths`, `version`, `env`, `app`, `auth`, `extra` |
| [Capture and masking keys](#/reference/configuration/capture) | `capture` and `masking` |
| [Coverage, theme and text keys](#/reference/configuration/site) | `coverage`, `theme`, `spaces`, `statuses`, `texts`, `feedback` |

The formal definition is `schemas/config.schema.json` in the kit; this reference is checked against it by the
coverage check of this site.

## Derived defaults

Some defaults are computed from other keys:

| Key | Default | For Acme Orders |
|---|---|---|
| `product.slug` | The name in lower case, without accents, `-` between words | `acme-orders` |
| `output` | `dist/<name>-Documentation.html`, spaces and reserved characters turned into `-` | `dist/Acme-Orders-Documentation.html` |
| `theme.key` | `<slug>-doc-theme` | `acme-orders-doc-theme` |
| `env.prefix` | The slug in capitals, `_` instead of `-` | `ACME_ORDERS` |
| `capture.locale` | The locale of `language` | `en-US` (`fr-FR` for `fr`) |

## Environment variables

Four keys can be set by environment variables, `DOC_KIT_<NAME>` first, then `<PREFIX>_<NAME>`:

| Variable | Key | Example |
|---|---|---|
| `URL` | `app.url` | `ACME_ORDERS_URL=https://orders.example.org` |
| `PLANS` | `capture.plans` | `ACME_ORDERS_PLANS=captures/plans-prod` |
| `READONLY` | `capture.readOnly` | `ACME_ORDERS_READONLY=1` |
| `VERSION` | `version.fallback` | `ACME_ORDERS_VERSION=2.4.0` |

`SESSION` sets the session file, and a few others change the behaviour of the kit: see
[Environment variables](#/reference/environment).

## A complete example

```js
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.3.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",
  version: { file: "../../package.json" },
  env: { prefix: "ACME" },
  app: { url: "http://localhost:3000" },
  auth: { adapter: "nextauth" },
  capture: {
    setup: "captures/setup-demo.mjs",
    cookies: [{ name: "NEXT_LOCALE", value: "en" }],
    selectors: { block: "section.card", frame: null },
    forbidden: ["^/orders/[^/]+/approval$"],
  },
  masking: { env: ["../../.env"] },
  coverage: [{ adapter: "next-app-router", app: "../../app" }],
  theme: { logo: "theme/logo.svg", colors: { brand: "#6d28d9", "brand-strong": "#5b21b6" } },
  statuses: { open: ["st-1", "Open"], paid: ["st-0", "Paid"] },
  texts: { "home.primaryAction": "Explore the editors" },
  feedback: { label: "Report a problem", url: "mailto:docs@example.org" },
});
```

More commented examples, for two fictional applications, are in `standard/config.md` of the kit.

## Pitfalls and observed gaps

> [!WARNING] The kit range
> `kit` accepts `*`, `1`, `1.2`, `^1.2.3`, `~1.2.3`, `>=1.2.3` (and `>`, `<=`, `<`, `=`), several conditions
> separated by spaces, and alternatives with `||`. When the installed kit is outside the range, **every** command
> stops with exit code 3, except `doc-kit upgrade` and `doc-kit doctor`, which are there to fix it.

> [!NOTE] The file is code
> The configuration is imported by Node: it can compute values, read a file or an environment variable. It runs on
> every command; keep it fast and free of side effects.

## Further reading

- [Environment variables](#/reference/environment): every variable the kit reads.
- [Command line](#/reference/cli): the options that win over the configuration.
- [Adapters](#/reference/adapters): the options of `auth` and `coverage` entries.
