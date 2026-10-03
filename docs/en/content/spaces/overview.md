## In short

A **space** is the part of the documentation written for one audience. The standard defines two: **business** (what
each feature does, for whom, its rules — read by users, key users, product owners and support) and **takeover**
(how the application is built, run and secured, and what to fix first — read by the developers, operators and
security people who take it over). One source, two audiences:

1. **Declare** `spaces` once in `content/toc.json`; every section then names the space it belongs to.
2. **One site, filtered**: a selector in the top bar shows "Everything" or one space at a time; nothing is removed,
   only hidden by the reader's choice.
3. **One file per space, physically separated**: `doc-kit build` also writes one export per space, with every other
   space's content **removed**, not merely hidden. Only the export is fit to hand to an audience that must not see
   the rest.

Without `spaces`, a project is exactly what it was before spaces existed: no selector, no export, same site data.

## Declaring the spaces

```json
{
  "spaces": ["business", { "id": "takeover", "subtitle": "Architecture, operations, security, findings." }],
  "sections": [
    { "id": "use", "space": "business", "title": "…", "groups": [ /* … */ ] },
    { "id": "take-over", "space": "takeover", "title": "…", "groups": [ /* … */ ] }
  ],
  "journeys": [{ "title": "…", "space": "business", "steps": ["use/orders"] }]
}
```

- Each item of `spaces` is an id (`business`, `takeover`) or an object `{ id, title, shortTitle, subtitle, icon, for }`.
  `business` and `takeover` already have a title, a short title, an icon and a "for" line in English and in French:
  give only the fields you want to change. Any other id needs its own `title`.
- `for` names the readers in one line ("Users, key users, product owners, support"): shown on the home page's space
  doors and as the selector's tooltip.
- **Every section** must name its `space` as soon as `spaces` is declared. A **page** may override its section's
  space; a section then appears in every space where it has at least one page, with only those pages. A **journey**
  defaults to the space of its first step.
- The order of `spaces` is the order of the selector and of the home page doors.

An unknown or missing space, a space without a title, or a `space` used while `spaces` is not declared, each stop
the build — even a draft one, like an invalid table of contents. A space declared but never used by a section only
warns.

## Reading one space, or everything

The selector (top bar, or the head of the side menu on a narrow screen) offers "Everything" and one button per
space. Choosing one filters the top navigation, the side menu, previous and next, the home page's doors and
journeys, the search suggestions and "print everything" — all to that space. It is remembered (`localStorage`) and
followed by `#/@<id>` in the address; a page you open sets the current space to its own.

> [!NOTE] The selector filters; it does not separate
> Switching to "Business" hides the takeover pages from the menu and the search, but the single HTML file still
> contains them: anyone who has the file can switch back, or look at its source. The selector is a reading comfort,
> not a confidentiality boundary. For that, export.

## Exporting: where confidentiality actually starts

```bash
doc-kit build                 # the full site, plus one export per declared space
doc-kit build --space business   # that export alone
doc-kit view use/orders --space business
doc-kit dev                   # also serves each export at /space/<id>
```

Each export is rendered from the same pages, then **filtered**: sections, pages, search index, suggestions and
journey steps outside the space are dropped (a journey's remaining steps are counted, "+ *n* steps in another part
of the documentation"); a link into the dropped content becomes plain text, "(see the {space} documentation)"; a
`counterpart` outside the export is removed. The glossary is kept whole, except the `technical` field of a term
(where it lives in the code), which only a `takeover` export — or the full site with "everything" or `takeover`
current — shows.

| Configuration | Default | Role |
|---|---|---|
| `spaces.export` | `true` | `false`: `build` writes the full site alone, no export |
| `spaces.output` | the output with `-<space>` before its extension | A path containing `{space}`, relative to the project |

`--space <id>` also narrows `view`, `open` and `dev`'s extra servers; an unknown id, or no space declared, is a
usage error. `export --with-dist` copies the exports wherever they were written, alongside the full site.

## `counterpart`: the same subject, seen twice

A feature sheet and the technical page that documents the same mechanism share their `F-xx` identifier and point to
each other:

```json
{ "id": "use/orders/approval", "counterpart": "take-over/orders-api~approval-endpoint" }
```

Rendered as one line under the page's badges, "Same topic, for {space}: {title} →" (or "Related: {title} →" without
spaces, or when both pages share one). It is checked like an internal link — an unknown page or anchor fails the
build — but it need not be reciprocal: a technical page can point to its business sheet without the sheet pointing
back.

## Pitfalls and observed gaps

> [!WARNING] An export is not re-checked on its own
> The links inside an export are valid by construction (they come from the full site's own check); `check images`
> still runs on the full site, which holds every page. Nothing extra to run per export.

> [!NOTE] Legacy projects
> A project written before spaces existed is read as it is: `spaces`, `space` and `counterpart` are optional
> everywhere. The legacy French keys `espaces`, `espace` and `pendant` are read the same way.

## Further reading

- [Documenting each feature](#/spaces/business): the business space, feature by feature.
- [Taking over a vibe-coded application](#/spaces/takeover): the takeover space, built from the code.
- [Documenting in multiple languages](#/spaces/languages): the other cross-cutting mechanism that reshapes the same build.
- [Table of contents, sub-pages and journeys](#/write/table-of-contents): sections, pages and journeys in full.
- [Configuration](#/reference/configuration): `spaces.export` and `spaces.output`.
