## In short

A **space** is the part of the documentation written for one audience. The standard defines four, one per
audience:

| Space | Title | For | What it holds |
|---|---|---|---|
| `use` | Using the application | Users, key users, support | How to do each task, screen by screen |
| `product` | The product | Product owners, business analysts, key users | What each feature does, for whom, its rules and its acceptance criteria: feature sheets, business rules, roles matrix, process, release notes |
| `admin` | Administering the application | Application administrators, operators | Settings, access rights, operations and the technical architecture document |
| `develop` | Developing the application | Developers, takeover team, security | How the application is built and secured, and what to fix first |

One source, four audiences:

1. **Declare** `spaces` once in `content/toc.json`; every section then names the space it belongs to.
2. **One site, filtered**: a selector in the top bar shows "Everything" or one space at a time; nothing is removed,
   only hidden by the reader's choice.
3. **One file per space, physically separated**: `doc-kit build` also writes one export per space, with every other
   space's content **removed**, not merely hidden. Only the export is fit to hand to an audience that must not see
   the rest.

Without `spaces`, a project is exactly what it was before spaces existed: no selector, no export, same site data.
You need not declare all four: `["use", "develop"]` suits a tool whose product and administration are trivial.

## Declaring the spaces

```json
{
  "spaces": ["use", "product", "admin", { "id": "develop", "subtitle": "Architecture, security, risks, maintenance." }],
  "sections": [
    { "id": "use", "space": "use", "title": "…", "groups": [ /* … */ ] },
    { "id": "features", "space": "product", "title": "…", "groups": [ /* … */ ] },
    { "id": "administer", "space": "admin", "title": "…", "groups": [ /* … */ ] },
    { "id": "operate", "space": "admin", "title": "…", "groups": [ /* … */ ] },
    { "id": "understand", "space": "develop", "title": "…", "groups": [ /* … */ ] }
  ],
  "journeys": [{ "title": "…", "space": "use", "steps": ["use/orders"] }]
}
```

- Each item of `spaces` is an id or an object `{ id, kind, title, shortTitle, subtitle, icon, for }`. The four
  standard spaces already have a title, a short title, a subtitle and a "for" line in English and in French (the
  table above; short titles: Use, Product, Administer, Develop): give only the fields you want to change.
- `for` names the readers in one line ("Users, key users, support"): shown on the home page's space doors and as
  the selector's tooltip.
- **Every section** must name its `space` as soon as `spaces` is declared. A **page** may override its section's
  space; a section then appears in every space where it has at least one page, with only those pages. A **journey**
  defaults to the space of its first step.
- The order of `spaces` is the order of the selector and of the home page doors.

### A space of your own: `kind`

Each standard space is its own **kind**, and the kind, never the id, decides what the kit does for its pages. A
space of the project's own names the kind it behaves like, and needs its own `title` (only the four standard ids
have default texts; its `shortTitle` defaults to its `title`):

```json
{ "spaces": ["use", "product", { "id": "ops", "kind": "admin", "title": "Operations" }, "develop"] }
```

| Kind | A business page that cites a `file:line` | The glossary's technical correspondence | Required takeover pages the audit looks for in it |
|---|---|---|---|
| `use` | Warned (`business.technical`) | Hidden | None |
| `product` | Warned (`business.technical`) | Hidden | None |
| `admin` | — | Shown | The technical architecture document, Operate |
| `develop` | — | Shown | Architecture overview, end-to-end journey, troubleshooting, findings, maintaining the docs; its pages are the takeover pages, `file:line` proofs expected |

Every space takes its kind's default icon (`icon` overrides it). A standard space keeps its own kind: `"kind"` on
`use`, `product`, `admin` or `develop` naming another kind is an error.

An unknown or missing space, a space without a valid kind (`space.kind`), a space of your own without a title
(`space.title`), or a `space` used while `spaces` is not declared, each stop the build — even a draft one, like an
invalid table of contents. A space declared but never used by a section only warns.

## Reading one space, or everything

The selector (top bar, or the head of the side menu on a narrow screen) offers "Everything" and one button per
space. Choosing one filters the top navigation, the side menu, previous and next, the home page's doors and
journeys, the search suggestions and "print everything" — all to that space. It is remembered (`localStorage`) and
followed by `#/@<id>` in the address (`#/@use`); a page you open sets the current space to its own.

> [!NOTE] The selector filters; it does not separate
> Switching to "Use" hides the Product, Administer and Develop pages from the menu and the search, but the single
> HTML file still contains them: anyone who has the file can switch back, or look at its source. The selector is a
> reading comfort, not a confidentiality boundary. For that, export.

## Exporting: where confidentiality actually starts

```bash
doc-kit build                   # the full site, plus one export per declared space
doc-kit build --space use       # that export alone
doc-kit view use/orders --space use
doc-kit dev                     # also serves each export at /space/<id>
```

Each export is named after its space id: `dist/Acme-Orders-Documentation-use.html`, `-product.html`,
`-admin.html`, `-develop.html`. It is rendered from the same pages, then **filtered**: sections, pages, search
index, suggestions and journey steps outside the space are dropped (a journey's remaining steps are counted, "+ *n*
steps in another part of the documentation"); a link into the dropped content becomes plain text, "(see the
{space} documentation)"; the pages of a topic group outside the export leave its line. The glossary is kept whole, except the
`technical` field of a term (where it lives in the code): only the exports of the spaces whose kind shows it
(`admin`, `develop`) keep it, and the full site shows it when one of those spaces is current, in "everything" mode,
or when the project has no spaces.

| Configuration | Default | Role |
|---|---|---|
| `spaces.export` | `true` | `false`: `build` writes the full site alone, no export |
| `spaces.output` | the output with `-<space>` before its extension | A path containing `{space}`, relative to the project |

`--space <id>` also narrows `view`, `open` and `dev`'s extra servers; an unknown id, or no space declared, is a
usage error. `export --with-dist` copies the exports wherever they were written, alongside the full site.

## `counterpart`: one subject, for each of its readers

A feature sheet, its screen, its technical page and its runbook treat one subject, each for its readers. A page's
`counterpart` names another page of that subject, or a list of them, each with an anchor when it starts further
down:

```json
{ "id": "features/order-approval", "counterpart": ["understand/orders-api~approval-endpoint", "operate/runbook"] }
```

The pages a counterpart joins, either way, form a **topic group**: declared once, on any of its pages, it is shown on
each of them. Under the page's badges, one line names the others by their space, "This topic for: Use · **Product** ·
Administer · Develop" — the page being read marked, the spaces in their order, a page's title beside its space when
that space holds two pages of the group. Without spaces: "Related: {title} · {title}". Each target is checked like
an internal link: an unknown page or anchor, or a page naming itself, fails the build.

## Pitfalls and observed gaps

> [!WARNING] An export is not re-checked on its own
> The links inside an export are valid by construction (they come from the full site's own check); `check images`
> still runs on the full site, which holds every page. Nothing extra to run per export.

> [!NOTE] Projects without spaces
> A project written before spaces existed is read as it is: `spaces`, `space` and `counterpart` are optional
> everywhere.

## Further reading

- [Documenting each feature](#/spaces/business): the Product space, feature by feature.
- [Taking over a vibe-coded application](#/spaces/takeover): the takeover dossier, in the Develop and Administer
  spaces, built from the code.
- [Documenting in multiple languages](#/spaces/languages): the other cross-cutting mechanism that reshapes the same build.
- [Table of contents, sub-pages and journeys](#/write/table-of-contents): sections, pages and journeys in full.
- [Configuration](#/reference/configuration): `spaces.export` and `spaces.output`.
