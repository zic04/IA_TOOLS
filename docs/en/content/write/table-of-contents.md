## In short

`content/toc.json` is the plan of the site. The build derives everything from it: the menu, the sections, the
breadcrumbs, the order of the pages, the previous and next links, the home page's reading paths and the search
suggestions.

1. **Sections** are the main parts of the site (`use`, `configure`, `administer`, `take-over` in the standard).
2. **Groups** gather 2 to 12 pages of a section on one topic.
3. **Pages** are files `content/<id>.md`; a page with `"level": 2` is a **sub-page** of the level-1 page above it.
4. **Journeys** are the guided reading paths of the home page.
5. **Suggestions** are the pages offered by the search when its field is empty.

The home page is `content/home.md`; each section may have an introduction, `content/<section-id>/index.md`.

## The file

```json
{
  "title": "Acme Orders documentation",
  "tagline": "Every screen, every setting, and how they really work.",
  "sections": [
    {
      "id": "use", "title": "Using Acme Orders", "shortTitle": "Use", "icon": "screen",
      "subtitle": "The sales rep's daily work.", "highlights": ["The order record", "Approvals"], "featured": true,
      "groups": [
        { "title": "Orders", "pages": [
          { "id": "use/orders", "title": "The orders list", "menuTitle": "Orders", "summary": "Find, filter and open orders.",
            "template": "screen", "routes": ["/orders"], "permissions": ["orders:read"] },
          { "id": "use/orders/export", "title": "Exporting orders", "level": 2, "summary": "The CSV export and its columns." }
        ] }
      ]
    }
  ],
  "journeys": [{ "title": "Discover Acme Orders", "description": "The pages to read first.", "steps": ["use/orders"] }],
  "suggestions": ["use/orders"]
}
```

## Section fields

| Field | Required | Role |
|---|---|---|
| `id` | yes | The section's address (`#/use`) and the first segment of its page ids |
| `title` | yes | Title of the section's overview page and of the home-page card |
| `shortTitle` | no | Label in the top bar |
| `icon` | no | A kit icon, by name: `screen`, `book`, `sliders`, `shield`, `code`, `map`, `play`, `gear`, `info`, `tip`, `warning`, `lock`, `recipe`, `link`, `clock`, `search`… or one declared in `theme.icons` |
| `subtitle` | no | One sentence under the title |
| `highlights` | no | Three short highlights, on the home-page card |
| `featured` | no | `true`: the card is highlighted, and the home page's main button leads to this section |
| `groups` | yes | List of `{ title, pages }`; `title` is optional |

## Page fields

| Field | Required | Role |
|---|---|---|
| `id` | yes | Address of the page (`#/use/orders`) and file `content/<id>.md`; no space, `~` or `#` |
| `title` | yes | Title of the page; the Markdown file has no `#` heading |
| `menuTitle` | no | Shorter label in the menu |
| `summary` | no | One sentence, shown under the title, on the section's overview and in the search |
| `level` | no | `2` for a sub-page |
| `template` | no | The page type ([Page templates](#/write/page-templates)) |
| `routes` | no | Application routes documented here: badges at the top of the page, and text for the coverage check |
| `permissions` | no | Permission codes: badges at the top of the page |
| `file` | no | The source file, relative to `content/`, when it is not `<id>.md` |

## Sub-pages

A page with `"level": 2` belongs to the last level-1 page above it **in the same group**. In the menu, the parent
shows the number of its sub-pages, and the sub-pages appear while you read the parent or one of them. The
breadcrumbs show the parent.

Split a page into sub-pages when it goes beyond about 2,000 words: the parent keeps the short answer ("In short")
and an "In this part" table with a link to each sub-page; each sub-page holds one mechanism. Replace every "below"
and "above" that now points to another page with a link.

## Journeys: the home page's reading paths

```json
"journeys": [
  { "title": "Try it in five minutes", "description": "Install, capture, read.",
    "steps": ["start/install", "start/first-five-minutes", "start/generated-site"] }
]
```

Each journey is a card of the home page with its numbered pages. The standard recommends one journey per reader,
of 5 to 7 pages, and `doc-kit audit` expects at least 3 journeys for level 3. Every step must be a page id of the
plan: an unknown step is an error of the build ("journey “…”: unknown page …").

## Pitfalls and observed gaps

> [!WARNING] Changing an id breaks its links
> An id is an address. Renaming `use/orders` to `use/orders/list` breaks every link to it; the build lists them.
> Rename the file too (or set `file`).

> [!NOTE] `product` is deprecated
> Older plans have a `product` field. The product name now comes from `doc.config.mjs`; the build warns when both
> differ, and the configuration wins.

> [!NOTE] Legacy French keys
> A plan written before the kit (`contenu/sommaire.json` with `titre`, `groupes`, `niveau`…) is read as it is;
> `doc-kit migrate` rewrites it ([Migrate a legacy project](#/migrate/legacy-project)).

## Further reading

- [Page templates](#/write/page-templates): the `template` field and `doc-kit new`.
- [Glossary](#/write/glossary): the other central file of the content.
- [The generated site](#/start/generated-site): where each field shows up.
