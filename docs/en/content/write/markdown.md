## In short

Pages are **GitHub-flavoured Markdown** (tables, fenced code, task-free lists) with a few extensions, written in
`content/<page-id>.md`. The page has no `#` title: it comes from the table of contents.

1. **Blocks with a body**: `:::screen` (an annotated capture and its legend) and `:::steps` (numbered steps).
2. **One-line directives**: `::capture`, `::diagram` and `::before-after`.
3. **Callouts**: `> [!TIP]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!PERMISSIONS]`, `> [!NOTE]`, `> [!RECIPE]`, `> [!HOW]`.
4. **Inline badges**: `[[perm …]]`, `[[menu …]]`, `[[key …]]`, `[[status …]]`, `[[route …]]`, and the business space's
   `[[feature …]]`, `[[rule …]]`.
5. **Internal links**: `#/page-id` and `#/page-id~anchor`, checked by the build.
6. **Business space** (§6.8): a block with a body, `:::rule`, and generated tables, `::features`, `::rules`,
   `::roles`.
7. **Takeover space** (§6.9): `::facts` (a table from `facts/<source>.json`) and the claim badges `[[verified …]]`,
   `[[deduced …]]`, `[[unknown …]]`.

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

## Business space

The business space (ARCHITECTURE.md §6.8) describes each feature for the people who use it, decide about it or
support it: no code, no `file:line`.

| English | French | What it does |
|---|---|---|
| `:::rule{id="BR-01" title="…"}` … `:::` | `:::regle{id="RG-01" titre="…"}` … `:::` | Defines a business rule once: a statement, then a "Given / When / Then" example. Rendered as an `h3` (the id in lower case), so it is in the page outline, the search index and a link target. |
| `[[feature F-01]]` | `[[fonctionnalite F-01]]` | A link chip to the feature sheet whose `feature` field (`content/toc.json`) matches. |
| `[[rule BR-01]]` | `[[regle RG-01]]` | A link chip to where the rule is defined. |
| `::features{}` | `::fonctionnalites{}` | A table of every feature sheet: id, feature (linked), summary, who (its permissions). |
| `::rules{}` | `::regles{}` | A table of every rule: id (linked), rule, defined in (linked), cited by. |
| `::roles{}` | `::roles{}` (same spelling) | A table of every feature sheet's permissions, one row per sheet, `✔` where a permission unlocks it. |

```markdown
:::rule{id="BR-12" title="An order above the threshold waits for a manager"}
An order whose total is at or above the threshold cannot ship until a manager of its region approves it.

**Example.** **Given** an order of 12,000 €, **when** the buyer submits it, **then** it waits for a manager.
:::
```

A citation and a generated table are resolved only once every page of the build has rendered, so a rule may be
defined on a page that sits further down the table of contents than the page that cites it; the same goes for a
feature sheet. An unknown id (`feature.unknown`, `rule.unknown`) fails a strict build; a rule without both `id` and
`title` (`rule.attributes`) or defined twice (`rule.duplicate`) too.

A page declares its own feature id with the `feature` field of `content/toc.json` (only on a page of template
`feature`; one sheet per id, `feature.duplicate` otherwise). `doc-kit inventory --features [--write] [--force]`
([Commands: start and capture](#/reference/cli/start-capture~doc-kit-inventory)) suggests candidate features from
what the coverage adapters see, grouped by the first static segment of their routes, API routes or i18n keys.

A glossary term's `technical` field (where it lives in the code) is shown in its tooltip only when the project has
no spaces, or the current space is `takeover` or "everything" ([Glossary](#/write/glossary)); exports other than
`takeover` drop it.

[Example · Feature sheet](#/examples/feature), [Example · Business rules](#/examples/business-rules) and
[Example · Roles matrix](#/examples/roles-matrix) show every element of this section in a real page.

## Takeover space

The takeover space (ARCHITECTURE.md §6.9) is the dossier a team needs to take over an application: every claim is
backed by a proof (`file:line`), or marked as deduced or unknown.

| English | French | What it does |
|---|---|---|
| `::facts{source="…" columns="…"}` | `::faits{source="…" colonnes="…"}` | A table from `facts/<source>.json`, written by `doc-kit facts`: one row per item, one column per listed key (header translated when known), lists joined with commas, booleans `✔` / `—`. A caption gives the generation date and the application's commit. |
| `::erd{title="…" tables="…"}` | `::mcd{…}` | The entity-relationship diagram, drawn from `facts/db.json`: one box per table, one arrow per reference. `tables` keeps only some tables. |
| `::modules{limit="10"}` | `::modules{…}` (same spelling) | The import graph, from `facts/modules.json`: its size, each import cycle, the files most depended on (`limit` rows) and the orphan files. |
| `::hotspots{limit="10"}` | `::points-chauds{…}` | The files that change most often **and** are the most complex (commits × complexity, `facts/history.json` × `facts/quality.json`), with their main author, and the bus factor. |
| `::health{}` | `::sante{}` | The state of the application in one view: ratings, security, tests, architecture, knowledge, dependencies, tooling (a card says "not measured" when its facts are missing), then the ten main risks found in the facts. |
| `[[verified …]]` | `[[verifie …]]` | A small badge: the claim was checked directly in the code. The text after the kind is optional: a bare `[[verified]]`, or `[[verified lib/orders.ts:42]]` with its proof. |
| `[[deduced …]]` | `[[deduit …]]` | The claim follows from what was read, without a direct line-by-line check. |
| `[[unknown …]]` | `[[inconnu …]]` | Nobody could tell, inside the time available for the takeover. |

```markdown
::facts{source="api" columns="method,route,file"}

The route accepts any signed-in user, from any region ([[verified lib/orders.ts:42]]); whether every caller
actually goes through it first is [[unknown]].
```

An unknown source (`facts.missing`) or a column that none of the items has (`facts.column`) fails a strict build;
run `doc-kit facts` first. [Commands: write and check](#/reference/cli/write-check~doc-kit-facts) lists the seven
sources. The ten takeover page types ([Page templates](#/write/page-templates)) are built around these two pieces
of syntax: [Example · API surface](#/examples/api-surface), [Example · Dependencies](#/examples/dependencies) and
the other examples of the takeover space show them in a real page.

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
