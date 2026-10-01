## In short

`doc-kit build` turns the project into one HTML file, `dist/<Product>-Documentation.html`. It is **strict** by
default: any inconsistency is an error, and **nothing is written** while an error remains.

1. **Strict build** (`doc-kit build`): the gate before any delivery. Exit code 0 when the site is written, 1 when an
   error remains.
2. **Draft build** (`doc-kit build --draft`): the same errors become warnings; a declared page without its file is
   replaced by a "Page being written" note, and a missing capture by a "Screenshot to produce" box.
3. **While writing** (`doc-kit dev`): a draft build in memory, served on `http://127.0.0.1:4400/` and rebuilt on every
   save, with the errors shown both in the terminal and over the page.
4. **To look at a page** without a browser at hand (`doc-kit view`): a screenshot of a page of the built site, in the
   light or dark theme, or at a step of a guided tour.

## The diagram

::diagram{id="build" title="The build reads the project's sources and the kit's site template, checks them, and writes one file. A single error and nothing is written."}

## What blocks the strict build

| Error | Example of message |
|---|---|
| A declared page without its file | `missing page: content/use/orders.md` |
| A capture cited but not found, or its image missing | `[use/orders] screenshot not found: “orders-list”` |
| A legend that does not match its zones | `[use/orders] screen “orders-list”: 4 captured zone(s) but 3 item(s) in the legend` |
| A capture with zones shown by `::capture` | `[use/orders] “orders-list” has zones: use :::screen with a legend` |
| A diagram not found | `[maintain/architecture] diagram not found: diagrams/flow.svg` |
| A broken link or anchor | `[use/orders] broken link: #/use/order` |
| A journey step that is not a page | `journey “Discover”: unknown page use/order` |
| A required section missing | `[use/orders] required section missing for template “screen”: “Required permissions”` |
| An invalid table of contents, glossary or zone file | the file and the path of the error |

The table of contents must be valid even for a draft: without a readable plan, nothing can be built.
Warnings (an unknown callout type, guidance left in a page, an unknown text key, an unknown section icon) never
block.

## Options

| Option | Effect |
|---|---|
| `--draft` | Errors become warnings; missing pages and captures are replaced by notes |
| `--date YYYY-MM-DD` | The date written in the site, instead of today: two builds of the same sources are then identical |
| `--output <file>` | Another output file, relative to the current folder; default: `output` of the configuration |
| `--json` | The result as JSON: `ok`, `output`, `stats`, `errors`, `warnings` |

A successful build prints its size and figures:

```text
✔ dist/Acme-Orders-Documentation.html — 4.2 MB · 92 pages · 124 screenshots · 611 annotated elements · 9 diagrams
```

The site shows the **documented version**, read in `version.file` with `version.pattern` (first group), or
`version.fallback` when the file cannot be found. The date is written in the language of the site.

## Writing with `doc-kit dev`

```bash
doc-kit dev            # first free port from 4400, and opens your browser
doc-kit dev --port 0   # any free port
```

The server watches `content/`, `images/`, `diagrams/`, `theme/` and `doc.config.mjs`. After each change, it rebuilds
in draft mode, and the page reloads by itself; a build error is printed in the terminal and shown over the page,
which keeps the last successful build. Nothing is written to disk. [[key Ctrl+C]] stops it. With
`DOC_KIT_NO_OPEN=1`, the browser is not opened (a remote machine, a script).

## Screenshots of the built site: `doc-kit view`

```bash
doc-kit view use/orders                          # .doc-kit/page.png, light theme, 1440 × 900
doc-kit view "use/orders~the-screen" --theme dark --height 1100
doc-kit view use/orders --tour 3 --output orders-tour.png
```

| Option | Effect |
|---|---|
| `--theme light\|dark` | The theme of the screenshot |
| `--height <px>` | Height of the window (width 1,440); default 900 |
| `--tour N` | Opens the first guided tour of the page and moves to step N |
| `--output <file>` | Where to write the PNG; default `.doc-kit/page.png` |

`view` uses the built site when it exists, otherwise a draft build in a temporary file. A JavaScript error of the page
is printed and gives exit code 1. In Git Bash, do not start the page id with `/`: the shell would turn it into a
Windows path.

`doc-kit open [page]` opens the built site in your default browser, at a page when you give one.

## Pitfalls and observed gaps

> [!WARNING] A heavy file
> Every image is embedded. `doc-kit check images` reports images above 200 KB, and `doc-kit optimize` recompresses
> them: only above the threshold (`--threshold`, in KB, default 200), at `--quality` (default 0.68), and keeps the
> new image only when it saves at least 20 %. Interface captures usually stay below the threshold and keep their
> sharpness.

> [!NOTE] Reproducible builds
> With `--date`, the build is deterministic: the same sources and the same kit give the same file. This is what the
> equivalence check of a migration relies on ([Migrate a legacy project](#/migrate/legacy-project)).

## Further reading

- [The checks](#/publish/checks): what the build does not check.
- [Audit and maturity levels](#/publish/audit): how complete the site is.
- [Commands: write and check](#/reference/cli/write-check): every option of `dev`, `build`, `view`, `open` and `optimize`.
