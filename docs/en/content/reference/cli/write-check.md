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

`DOC_KIT_NO_OPEN=1` keeps the browser closed. `--json` prints `url`, `port`, `root` and the watched paths.

## doc-kit new

```text
doc-kit new <page-id> --template <type> [--title "…"] [--parent <page-id>]
```

Creates `content/<page-id>.md` from the template of the type, in the project's language, and declares the page in
the table of contents. Never overwrites a file (exit code 1).

| Option | Effect |
|---|---|
| `--template <type>` | One of the 13 types; required unless the page is already declared with one |
| `--title "…"` | Title and menu title; default: the last segment of the id, humanised |
| `--parent <page-id>` | Makes it a sub-page (`"level": 2`), right after the parent and its sub-pages |

Page ids are lower-case segments separated by `/`, the first one being the section id: `use/orders/export`.
[Page templates](#/write/page-templates~creating-a-page-doc-kit-new) gives the placement rules.

## doc-kit build

```text
doc-kit build [--draft] [--date YYYY-MM-DD] [--output <file>]
```

| Option | Effect |
|---|---|
| `--draft` | Errors become warnings; missing pages and captures are replaced by notes |
| `--date YYYY-MM-DD` | The date shown in the site (a reproducible build); an impossible date is refused (exit code 2) |
| `--output <file>` | Another output file, relative to the current folder |

Exit code 0 when the site is written, 1 when an error remains (nothing is written). See
[Build the site](#/publish/build).

## doc-kit view

```text
doc-kit view <page[~anchor]> [--theme light|dark] [--height <px>] [--tour N] [--output <file>]
```

Screenshots a page of the built site (or of a draft build when there is none) in a headless Chromium, 1,440 px wide.

| Option | Default | Effect |
|---|---|---|
| `--theme` | `light` | `light` or `dark` |
| `--height` | 900 | Window height, at least 200 |
| `--tour N` | | Opens the page's first guided tour, at step N |
| `--output` | `.doc-kit/page.png` | The PNG file |

Exit code 1 when the page raised a JavaScript error (printed after the file name).

## doc-kit open

```text
doc-kit open [page]
```

Opens the built site in the default browser, at a page when you give one (`doc-kit open use/orders`). Exit code 1
when the site is not built. With `DOC_KIT_NO_OPEN=1`, it only prints the address.

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
