## doc-kit dev

```text
doc-kit dev [--port <n>]
```

Builds the site in draft mode, serves it on `http://127.0.0.1:<port>/`, opens your browser, and rebuilds when
`content/`, `images/`, `diagrams/`, `theme/` or `doc.config.mjs` change; the page reloads by itself. Build errors are
shown in the terminal and over the page. [[key Ctrl+C]] stops it.

| Option | Default | Effect |
|---|---|---|
| `--port <n>` | first free port from 4400 | `0`: any free port; a busy port stops with exit code 3 |

`DOC_KIT_NO_OPEN=1` keeps the browser closed. `--json` prints `url`, `port`, `root` and the watched paths. With
spaces, the file of each space is also served at `/space/<id>`.

## doc-kit new

```text
doc-kit new <page-id> --template <type> [--title "…"] [--parent <page-id>] [--prefill]
```

Creates `content/<page-id>.md` from the template of the type, in the project's language, and declares the page in
the table of contents. Never overwrites a file (exit code 1).

| Option | Effect |
|---|---|
| `--template <type>` | One of the 13 types; required unless the page is already declared with one |
| `--title "…"` | Title and menu title; default: the last segment of the id, humanised |
| `--parent <page-id>` | Makes it a sub-page (`"level": 2`), right after the parent and its sub-pages |
| `--prefill` | Fills the page's main table from the facts (`variables`, `api-surface`, `data-model`, `dependencies` and `agent-instructions` only); the other cells stay guidance placeholders |

Page ids are lower-case segments separated by `/`, the first one being the section id: `use/orders/export`.
[Page templates](#/write/page-templates~creating-a-page-doc-kit-new) gives the placement rules. `--prefill` reads
`facts/<source>.json` (`doc-kit facts`): without it, exit code 1; on a type with no table to prefill, exit code 2.

## doc-kit build

```text
doc-kit build [--draft] [--date YYYY-MM-DD] [--output <file>] [--space <id>]
```

| Option | Effect |
|---|---|
| `--draft` | Errors become warnings; missing pages and captures are replaced by notes |
| `--date YYYY-MM-DD` | The date shown in the site (a reproducible build); an impossible date is refused (exit code 2) |
| `--output <file>` | Another output file, relative to the current folder |
| `--space <id>` | Only the file of that space; `--output` then names it. An unknown id, or no space declared: exit code 2 |

Exit code 0 when the site is written, 1 when an error remains (nothing is written). With spaces, `build` also writes
one file per space (`spaces.output`), one summary line each. See [Build the site](#/publish/build).

## doc-kit view

```text
doc-kit view <page[~anchor]> [--theme light|dark] [--height <px>] [--full] [--tour N] [--output <file>] [--space <id>]
```

Screenshots a page of the built site (or of a draft build when there is none) in a headless Chromium, 1,440 px wide.

| Option | Default | Effect |
|---|---|---|
| `--theme` | `light` | `light` or `dark` |
| `--height` | 900 | Window height, at least 200 |
| `--full` | | The whole page in one image, from its top: a long page reviewed in a single view |
| `--tour N` | | Opens the page's first guided tour, at step N |
| `--output` | `.doc-kit/page.png` | The PNG file |
| `--space <id>` | | A page of the file of that space instead of the full site |

Exit code 1 when the page raised a JavaScript error (printed after the file name).

## doc-kit open

```text
doc-kit open [page] [--space <id>]
```

Opens the built site in the default browser, at a page when you give one (`doc-kit open use/orders`); with
`--space <id>`, the file of that space. Exit code 1 when the site is not built. With `DOC_KIT_NO_OPEN=1`, it only
prints the address.

## doc-kit check

```text
doc-kit check [coverage|links|tables|images|secrets|all] [--width <px>] [--threshold <KB>]
```

| Option | Default | Effect |
|---|---|---|
| `--width <px>` | 1440 | Width of the window for `tables`, at least 320 |
| `--threshold <KB>` | 200 | Size above which `images` reports an image as heavy |

Without a name, every check runs (`all`), and coverage is skipped when no adapter is configured. Exit code 1 when a
check fails. See [The checks](#/publish/checks).

## doc-kit audit

```text
doc-kit audit [--json]
```

Writes `.doc-kit/audit.md` and `.doc-kit/audit.json`, prints a summary (or, with `--json`, the whole result). Exit
code 0 whatever the level. See [Audit and maturity levels](#/publish/audit).

## doc-kit facts

```text
doc-kit facts [--source <name>]... [--network] [--tools] [--json]
```

Reads the application code (`app.dir`) and writes one file per source into `paths.facts` (`facts/<source>.json` by
default), in the documentation project — never in the application: `dependencies`, `env`, `api`, `db`, `agents`,
`secrets` and `tests`. `::facts{source="…"}` reads these files at build time, and the takeover page types
(`access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`, `tests-quality`,
`agent-instructions`, `adr`, `threat-model`) are written from them. Without `app.dir`, exit code 2.

| Option | Effect |
|---|---|
| `--source <name>` | Repeatable: only these sources (default: all seven) |
| `--network` | `dependencies`: also looks up whether each direct package exists in its registry (the name only, nothing else) |
| `--tools` | Also runs `gitleaks`, `osv-scanner`, `syft` and `knip` when they are on the PATH, each into `facts/tool-<name>.json`; a missing tool is reported, never an error |

The same code, run against the same commit of the application, writes the same file (its `generated` timestamp
aside): `doc-kit facts` is safe to commit alongside the pages it feeds. See [Example · API surface](#/examples/api-surface)
and the other examples of the takeover space for `::facts` in use.

## doc-kit sync

```text
doc-kit sync [--since <ref>] [--apply [--labels]] [--mark <page…> | --mark --all] [--sources <file[:lines]…>]
             [--date YYYY-MM-DD] [--check] [--estimate]
```

What the documentation must follow after a change of the application (`app.dir`): a report comparing it now with
the reference, `sync.json` (`paths.sync`), or, with `--since <ref>`, a git commit — git is only ever read, never
written to. `--mark <page…>` or `--all` record, for each page, the application files it depends on: its `routes`,
its `file:line` proofs, the captures it cites, its `::facts` tables, its `counterpart` and its `sources` (a page
field for a page with none of the above). The report then lists the pages to review, grouped by priority
(`direct`: a file of the page itself changed; `shared`: only a file it merely imports did; `probablyIntact`: that
shared file changed, but nothing the page names), the `file:line` proofs that moved or broke, the labels whose
value changed (`sync.labels`, or the `messages` of the `i18n-registry` adapters), the screenshots gone stale, and
the elements new to or removed from the coverage adapters. It writes `.doc-kit/sync.md`, `.doc-kit/sync-report.json`
and one `.doc-kit/sync/<page>.diff` per page to review.

| Option | Effect |
|---|---|
| `--since <ref>` | Compares with this git commit instead of `sync.json`; `new` and `removed` are always empty (the adapters are not re-run at that commit) |
| `--apply` | Rewrites a moved proof's `file:line` reference in the page; then restamps the pages left unchanged |
| `--labels` | With `--apply`: also replaces a label's old value by its new one, only inside `**bold**`, code spans, `[[menu …]]` badges and quotes — never in plain prose |
| `--mark <page…>` | Records these pages as checked now (the page ids follow the option) |
| `--all` | With `--mark`: every written page |
| `--sources <file[:lines]…>` | With `--mark` of a single page: declared dependencies, repeatable |
| `--date YYYY-MM-DD` | Date written by `--mark`, instead of today's (reproducible runs) |
| `--check` | Exit code 1 when any category but `unchanged` and `unmarked` is not empty: a CI gate that a project can adopt page by page |
| `--estimate` | The cost of updating the pages to review, one `doc-kit-writer` agent per page, priced from `llm.prices` |

Without `app.dir`, exit code 2. A page not written yet cannot be marked (exit code 1). Once a page is marked, its
footer shows "Checked against version {version} on {date}" the next time the site is built. See
[Configuration · Project](#/reference/configuration/project~following-the-application) for `sync.labels` and
`capture.compareThreshold`, and the skill's [phases](#/skill/phases) for the agents that read `sync`'s report.

## doc-kit context

```text
doc-kit context <page…> [--budget <tokens>] [--update]
```

Writes `.doc-kit/context/<page>.md`, one file per page (`/` replaced with `__` in the file name): the only reading
an agent needs to write or update that page, instead of the whole code inventory and table of contents. It is
built from the page's **dependencies** (the same ones `doc-kit sync` computes: its routes, `file:line` proofs,
captures, `::facts` tables, `counterpart` and declared `sources`) — direct files (the page's own route) before
shared ones (merely imported): the page itself, the required sections of its template, the files to read (a file
of 150 lines or fewer in full; otherwise ±40 lines around each cited line; a direct file with no cited line gives
its first 80 lines; a shared file with no cited line is listed by its path alone), the exact labels and facts rows
these files reference, and the glossary terms they match. A page declared in the table of contents but not written
yet is accepted (the context serves to write it); an unknown page is refused (exit code 2).

| Option | Effect |
|---|---|
| `page…` | One or more page ids of `content/toc.json` |
| `--budget <tokens>` | Maximum size of each context, estimated as characters ÷ 4 (default 16,000); the page and its required sections are never cut — shared excerpts go first, then the excerpts farthest from a cited line, then facts, then labels; each cut leaves a one-line note, repeated in a final list |
| `--update` | Also includes the page's entry of the last `doc-kit sync` report (every category, with its reasons), the diff of its changed files, and the paths of its captures' before/after sheets (`.doc-kit/compare/<id>.png`, never inlined); without a report yet (`doc-kit sync --mark`), exit code 2 |

`--json` gives `[{ page, file, tokens, cut: [{ kind, path?, lines? }] }]`. A context folder runs to a few thousand
tokens for an ordinary page, against the roughly 15,000 tokens of the inventory and table of contents an agent read
in full before: the skill's writing briefs point to these files instead of copying the inventory. See the skill's
[phases](#/skill/phases) for how the agents use it.

## doc-kit optimize

```text
doc-kit optimize [--threshold <KB>] [--quality <0..1>]
```

| Option | Default | Effect |
|---|---|---|
| `--threshold <KB>` | 200 | Only the images above this size are re-encoded |
| `--quality <0..1>` | 0.68 | WebP quality of the new encoding |

The new image is kept only when it is at least 20 % lighter. Encoding uses Chromium, with no native dependency.

## Further reading

- [Command line](#/reference/cli): global options and exit codes.
- [Commands: start and capture](#/reference/cli/start-capture).
- [Commands: deliver and maintain](#/reference/cli/deliver).
