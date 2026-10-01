## In short

A diagram is an SVG file in `diagrams/<name>.svg`, inserted in a page with `::diagram{id="name" title="…"}`. The
build inlines it in the page, so it is searchable, sharp at any zoom, and printed with the page.

1. **No colour in the file.** Shapes and text use only the site's `d-*` classes; their colours come from the theme,
   so the diagram follows the light and dark themes.
2. **900 units wide.** `viewBox="0 0 900 H"`; the diagram scales to the reading column.
3. **A caption that says how to read it.** The `title` attribute is shown under the diagram.

## The diagram

::diagram{id="classes" title="Every class of the diagrams, as the current theme draws them. Switch the theme with the button of the top bar: the drawing follows."}

## The classes

| Role | Classes | Drawn as |
|---|---|---|
| Boxes | `d-box`, `d-box-2`, `d-brand`, `d-warn`, `d-danger`, `d-info`, `d-violet` | A soft fill and a border of the colour |
| Solid fills | `d-solid`, `d-chrome` | The brand colour; the dark colour of the top bar |
| Lines | `d-line`, `d-line-brand`, `d-dashed` | Grey, brand colour, dotted grey (no fill) |
| Text | `d-title`, `d-text`, `d-small`, `d-white` | Bold 14 px, 12.5 px, 11 px, bold 13 px on the brand colour |
| Arrowheads | `d-arrow`, `d-arrow-brand` | Grey, brand colour (inside a `<marker>`) |

The legacy French names of diagrams written before the kit (`s-boite`, `s-marque`, `s-trait`, `s-titre`, `s-fleche`…)
are still styled. New diagrams use the `d-*` names.

## A minimal diagram

```xml
<svg viewBox="0 0 900 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Browser, API, database">
  <defs>
    <marker id="ab-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path class="d-arrow" d="M0 0 10 5 0 10z"/>
    </marker>
  </defs>
  <rect class="d-box" x="20" y="30" width="240" height="80" rx="10"/>
  <text class="d-title" x="140" y="76" text-anchor="middle">Browser</text>
  <rect class="d-brand" x="330" y="30" width="240" height="80" rx="10"/>
  <text class="d-title" x="450" y="76" text-anchor="middle">Orders API</text>
  <path class="d-line" d="M260 70H326" marker-end="url(#ab-arrow)"/>
</svg>
```

- **Prefix the ids** of `<marker>` elements with the diagram's own code (`ab-arrow`): several diagrams share one
  page, and two markers with the same id would mix.
- Give the `<svg>` a `role="img"` and an `aria-label` that says what it shows.
- Keep text **inside its box**: count about 7.5 units per character of `d-text`, 6.5 of `d-small`.

## Conventions that help the reader

| Convention | Meaning |
|---|---|
| Solid line (`d-line`) | Chained: happens on its own, right after |
| Dotted line (`d-dashed`) | Waits for a person |
| `d-warn` or `d-danger` box | Depends on a scheduled task, or is a known problem |
| `d-brand` box | The component the page is about |
| Numbered markers on the arrows | The numbered flows of a table under the diagram |

## Pitfalls and observed gaps

> [!WARNING] `d-white` is for `d-solid` only
> `d-white` is the colour of text **on the brand colour**: white in the light theme, dark in the dark theme. On
> `d-chrome`, which stays dark in both themes, it disappears in the dark theme. On `d-chrome`, put a `d-box` label,
> as in the diagram above.

> [!NOTE] Check both themes
> `doc-kit view write/diagrams --theme dark` screenshots the built page in the dark theme.

> [!WARNING] The SVG is inlined as it is
> Only the XML declaration (`<?xml …?>`) is removed. A script, an event handler or an external reference in a
> diagram would end up in the site: keep diagrams to shapes, lines and text.

> [!CAUTION] diagram not found
> "diagram not found: diagrams/flow.svg": the `id` of `::diagram` is the file name without `.svg`, in the
> `diagrams` folder (`paths.diagrams` in the configuration).

## Further reading

- [Extended Markdown](#/write/markdown~capture-diagram-before-and-after): the `::diagram` directive.
- [Theme, colours and logo](#/reference/theme): the colour tokens behind the classes.
- [Example · End-to-end journey](#/examples/journey): a diagram with chained, waiting and scheduled steps.
