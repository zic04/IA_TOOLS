## In short

Pages are **GitHub-flavoured Markdown** (tables, fenced code, task-free lists) with a few extensions, written in
`content/<page-id>.md`. The page has no `#` title: it comes from the table of contents.

1. **Blocks with a body**: `:::screen` (an annotated capture and its legend) and `:::steps` (numbered steps).
2. **One-line directives**: `::capture`, `::diagram` and `::before-after`.
3. **Callouts**: `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!PERMISSIONS]`, `> [!NOTE]`, `> [!RECIPE]`, `> [!HOW]`.
4. **Inline badges**: `[[perm …]]`, `[[menu …]]`, `[[key …]]`, `[[status …]]`, `[[route …]]`.
5. **Internal links**: `#/page-id` and `#/page-id~anchor`, checked by the build.

Every extension has an English and a French spelling; both are accepted in any project, whatever its language.

## Headings, anchors and the page outline

- `##` and `###` headings appear in **On this page** and get an anchor: the heading in lower case, accents removed,
  every run of other characters replaced by `-`, at most 60 characters. "Step 2 — Install Chromium" gives
  `step-2-install-chromium`. Two identical headings get `-2` on the second one.
- A `#` heading is shown as a `##`; `####` and below have no anchor.
- Page templates recognise their sections by the **start** of the `##` headings
  ([Page templates](#/write/page-templates)).

## Annotated screen: `:::screen`

```markdown
:::screen{capture="orders-list" title="Orders · list"}
1. **Filters**: status, customer and date.
2. **Today**: the day's orders, open orders and total.
3. **New order**: creates an order.
4. **The list**: one row per order.
:::
```

`capture` is the id of a capture (`images/<id>.webp` and `images/zones/<id>.json`); `title` is shown above the image.
The numbered list is the **legend**: item *n* explains marker *n*, so the list must have **exactly** as many items as
the capture has zones, or the build fails. A paragraph before the list becomes a caption under the image. The block
gets a **Guided tour** button. Rendered: [Example · Screen page](#/examples/screen~the-screen).

## Steps: `:::steps`

```markdown
:::steps
1. Open [[menu Settings]].
2. Change the **Theme**.
3. Click **Save**.
:::
```

:::steps
1. Open [[menu Settings]].
2. Change the **Theme**.
3. Click **Save**.
:::

## Capture, diagram, before and after

| Directive | Attributes | What it shows |
|---|---|---|
| `::capture{id="…" title="…"}` | `id`, `title` (optional) | A capture **without** zones, with an **Enlarge** button |
| `::diagram{id="…" title="…"}` | `id` (file `diagrams/<id>.svg`), `title`: the caption | An SVG inlined in the page, that follows the theme |
| `::before-after{…}` | `before`, `after`, `before-label`, `after-label`, `title` | Two captures of the same size with a slider |

A capture that has zones cannot be shown with `::capture`: the build asks for a `:::screen` and its legend.

```markdown
::capture{id="orders-open" title="The list after two filters"}
::diagram{id="build" title="What the build reads and what it writes."}
::before-after{before="orders-all" after="orders-open" before-label="All" after-label="Filtered" title="Two filters"}
```

The slider moves with the mouse, the finger, or the left and right arrow keys:
[Targets and actions](#/capture/targets-actions~actions) shows one.

## Callouts

A callout is a quote whose first line starts with `[!TYPE]`; the rest of that line is the title. Without a title, the
default title of the type is used, in the language of the site.

| English | French | Default title | Use |
|---|---|---|---|
| `[!TIP]` | `[!ASTUCE]` | Tip | A useful shortcut, never an essential one |
| `[!WARNING]` | `[!ATTENTION]` | Warning | One pitfall; the title says it in one line |
| `[!CAUTION]` | `[!ERREUR]` | Blocking error | An error and its cause |
| `[!PERMISSIONS]` | `[!DROITS]` | Required permissions | Who can see, save, run |
| `[!NOTE]` | `[!NOTE]` | Good to know | Where to find a screen; observed gaps; sources |
| `[!RECIPE]` | `[!RECETTE]` | Recipe | What you need before a recipe |
| `[!HOW]` | `[!MECANISME]` | How it works | The real mechanism, often as numbered steps |

```markdown
> [!WARNING] Only one active chain per order type
> Activating a second chain deactivates the first one.
```

> [!WARNING] Only one active chain per order type
> Activating a second chain deactivates the first one.

> [!HOW]
> Without a title, the callout takes the default title of its type.

An unknown type (`[!DANGER]`) is a build warning, and the quote is shown with that word as its title.

## Badges

| English | French | Example | Rendered |
|---|---|---|---|
| `[[perm …]]` | `[[droit …]]` | `[[perm orders:approve]]` | [[perm orders:approve]] |
| `[[menu …]]` | `[[menu …]]` | `[[menu Orders › All orders]]` | [[menu Orders › All orders]] |
| `[[key …]]` | `[[touche …]]` | `[[key Ctrl+Shift+K]]` | [[key Ctrl+Shift+K]] |
| `[[status …]]` | `[[statut …]]` | `[[status open]]` | [[status open]] |
| `[[route …]]` | `[[route …]]` | `[[route /orders/[id]]]` | [[route /orders/[id]]] |

- `[[key …]]` splits on `+` and shows one key cap per key.
- `[[status x]]` is coloured when `statuses` declares `x` in `doc.config.mjs` (colour token or hexadecimal colour,
  and its label); otherwise it shows `x` in a neutral badge.
- `[[route …]]` accepts brackets inside (`/orders/[id]`). The coverage check finds a route anywhere in the text of
  the pages, in a badge or not.

## Links

- To a page: `[Capture plans](#/capture/plans)`. To a section: `[the targets](#/capture/targets-actions~targets)`.
- The build checks every link of every page: an unknown page or anchor is an error (a warning with `--draft`).
- Links in the home page and in the section introductions are not checked: keep them few.
- Ordinary links (`https://…`) open as usual; the site loads nothing by itself.

## Tables, code and the rest

- Tables are wrapped so that they scroll inside the reading column; `doc-kit check tables` reports those that scroll
  at 1,440 px. Long code in a cell gets break opportunities after `/`, `.`, `_`, `?`, `=` and `,`.
- Fenced code blocks keep their language name (`bash`, `js`, `json`…) as a class, without colouring.
- HTML comments are not displayed. The guidance comments left by a template (an HTML comment that starts with
  `guidance:`) are reported by the build and by `doc-kit audit`.
- Images in Markdown (`![…](…)`) are not embedded: use captures, so that the file stays self-contained.

## Pitfalls and observed gaps

> [!WARNING] Count the legend items
> A `:::screen` legend with one item too many or too few fails the strict build: "screen “orders-list”: 4 captured
> zone(s) but 3 item(s) in the legend". Change the legend and the plan's `zones` together.

> [!NOTE] Spelling of the attributes
> In the French spelling, the attributes are French too: `:::ecran{capture="…" titre="…"}`,
> `::avant-apres{avant="…" apres="…" libelle-avant="…" libelle-apres="…" titre="…"}`. Mixing is accepted: an English
> attribute wins over its French twin.

## Further reading

- [Page templates](#/write/page-templates): the sections each type of page must have.
- [Zones, union and legends](#/capture/zones): where the markers of a `:::screen` come from.
- [Diagrams](#/write/diagrams): drawing an SVG with the site's classes.
- [Example · Screen page](#/examples/screen): every syntax element in a real page.
