## In short

`doc-kit check` runs the checks that the build does not make, or makes only partly. Without an argument, it runs
them all (`doc-kit check all`); the exit code is 1 as soon as one of them fails.

| Check | Question it answers | Browser |
|---|---|---|
| `coverage` | Is every route, registry entry or file of the application cited in the documentation? | no |
| `links` | Do every internal link, anchor and journey step lead somewhere? | no |
| `tables` | Does a table scroll sideways at 1,440 px? | yes |
| `images` | Are there orphan, missing, heavy or outdated images? | no |
| `secrets` | Is there a key, a token, a GUID or a value of the local `.env` in the pages or in the site? | no |

Every check works on a draft build made in memory: it can run while pages are still missing.

## Coverage

```bash
doc-kit check coverage
```

The coverage adapters of `coverage` (configuration) list what the application contains: the routes of a Next.js or
React Router application (`next-app-router`'s `api: true` option adds its route handlers as a second family),
FastAPI route handlers (`fastapi`), the operations of an OpenAPI or Swagger document (`openapi`), the entries of a
registry with their labels (`i18n-registry`), the candidate business features of `features.json` (`features`),
one item per fact read by `doc-kit facts` (`facts`, [Taking over a vibe-coded application](#/spaces/takeover)), or
the files of a folder (`glob`). An element is **covered** when one of its texts appears in a **written** page
(`content/**/*.md` and `*.json`, the `routes` of its entry in the table of contents included), ignoring case and
spaces. A route `/orders/[id]` is covered by `/orders/[id]`, `/orders/:id`, `/orders/{id}` or its static prefix
`/orders/`. Every built-in adapter and its options are listed on [Adapters](#/reference/adapters~coverage-adapters).

```text
✔ Routes: 14/14
✖ Widgets: 9/11
    missing: revenue-by-region (“Revenue by region”)
    missing: overdue-invoices (“Overdue invoices”)

23/25 elements covered.
  → cite each missing element in a page, or in the routes of the table of contents
```

While pages are still to write, the elements that only their entries cite are reported apart: they are the plan, not
yet the documentation.

```text
✖ Routes: 2/14
    missing: /orders — planned in use/orders, not written yet
    …
2/14 elements covered.
  12 more elements are cited only by the entries of pages not written yet (14/14 once they are written)
```

An adapter that cannot find its source (the application is not next to the documentation) is **skipped**, not
failed. Without any adapter, `check all` skips coverage and `check coverage` stops with exit code 2. A page
declared without its file, or that still holds template guidance, is not written yet: neither its text nor its entry
in the table of contents (title, `routes`) count, so neither the plan alone nor the examples of a fresh skeleton cover
a route of the application.
`doc-kit inventory` lists what the adapters see, covered or not; `doc-kit inventory --json` is a good start for a
table of contents. This site checks its own coverage: every configuration key, CLI option, built-in adapter and
command is cited ([Adapters](#/reference/adapters~writing-an-adapter)).

## Links

```bash
doc-kit check links
```

Every `#/page` and `#/page~anchor` link of every page, every step of the home page's journeys, and every page's
`counterpart` (`link.counterpart`: an unknown page, an unknown anchor, or a page naming itself). The strict build
blocks on the same errors; this check runs on a draft, so it can be used while pages are missing.

## Tables

```bash
doc-kit check tables --width 1280
```

Opens every page of the built site (or of a draft build) in a headless Chromium at the given width (default 1,440)
and reports the tables wider than the reading column, with the heading above them:
`use/orders › Settings reference: 1012 px for 840 px`. Fewer columns, shorter cells, or two tables.

## Images

```bash
doc-kit check images --threshold 300
```

| Finding | Level |
|---|---|
| A capture cited by a page but not found, or whose image is missing | error |
| An orphan image: in `images/` but cited by no page | error |
| A zone file whose image is missing, and that no page cites | error |
| A heavy image: above the threshold (`--threshold`, in KB, default 200) | warning |
| An outdated capture: its zone file's `version` differs from the documented version | warning |

## Secrets

```bash
doc-kit check secrets
```

The secret check searches the **text sources** (`content/`, zone files, capture plans, diagrams) and the **text of
the built site** (pages, section introductions, home page, glossary) for:

- the values of the `masking.env` files whose key looks sensitive, the GUIDs (except `00000000-0000-0000-0000-000000000000`)
  and the `masking.patterns`;
- actual secret values: a private key block with its key material, a JWT, the password of a connection string or of a
  URL, a cloud access key, the value of a key, token or password assignment, the signature of a signed URL.

A mere mention is not a secret: a placeholder (`<password>`, `****`, `${SECRET}`, `example`, `exemple`,
`motdepasse`, a variable name in capitals) is ignored. A finding shows where it is and only the first characters and
the length of the value. The check also reports a session file found outside `.doc-kit/`, and a session file tracked
by git.

Never reported either, whatever found them:

| Not a secret | Example |
|---|---|
| A local or private address, alone, with a port, or as the host of a URL without credentials | `0.0.0.0`, `127.0.0.1:8000`, `http://192.168.1.20/api` |
| A value inside a URL template, a URL with `{…}` placeholders | `https://tiles.example.org/{z}/{x}/{y}.png?key=…` |
| A value matching `masking.exclude` | `localhost` with the default |
| A value known to be public, listed in `masking.allow` | a map service's browser key |

GUIDs stay reported until `masking.allow` names them ([Masking](#/capture/masking~values-known-to-be-public));
a password in a URL stays reported, even when the host is private. With
`--json`, `secrets.ignored` counts what was set aside, by rule: `local`, `template`, `exclude`, `allow`.

## Business, takeover and spaces: checked by the build, not by `check`

These gates run inside `doc-kit build` itself (strict or `--draft`), not as a separate `doc-kit check` category —
`standard/quality.md` in the kit lists every one in full:

| Gate | Fails on |
|---|---|
| `space.*` | A section with no `space`; `space` naming an unknown or undeclared id; a space declared twice, or a custom one with no `title` — only once `spaces` is declared ([Two spaces, one source](#/spaces/overview~declaring-the-spaces)) |
| `feature.*`, `rule.*` | A `feature` id declared on the wrong template, or twice; `[[feature …]]` or `[[rule …]]` citing an unknown id; a `:::rule` with no `id` or `title`, or defined twice ([Documenting each feature](#/spaces/business)) |
| `facts.*` | `::facts{source="…"}` naming a source with no `facts/<source>.json` file, or a `columns` entry the file does not have ([Taking over a vibe-coded application](#/spaces/takeover~reading-the-code-automatically-doc-kit-facts)) |
| `business.technical` (warning) | A page whose effective space is `business` contains a `file:line` proof: move it behind the page's `counterpart` |

Fix: write or declare the missing id once, run `doc-kit facts` first, or correct the id, the column or the space
name.

## Pitfalls and observed gaps

> [!WARNING] The images are not read
> `check secrets` reads text only. A secret visible **in a screenshot** is not found: masking and a review of every
> image are the only protection ([Masking](#/capture/masking)).

> [!NOTE] In continuous integration
> `doc-kit check all` needs Chromium for the tables. Without it, run the other checks one by one, or install the
> browser in the pipeline ([Continuous integration](#/publish/ci)).

## Further reading

- [Build the site](#/publish/build): what the strict build already blocks.
- [Audit and maturity levels](#/publish/audit): the checks turned into a level.
- [Commands: write and check](#/reference/cli/write-check): the options of `check`.
- [Adapters](#/reference/adapters): every coverage adapter, built-in or your own.
- [Two spaces, one source](#/spaces/overview): the `space.*` gates, in context.
