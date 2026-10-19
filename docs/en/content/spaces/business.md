## In short

The Product space describes **each feature** for the people who use it, decide about it or support it: no code,
no `file:line`. Three ingredients, each with its own page type: a **feature sheet** per feature, **business rules**
stated once and cited everywhere they apply, and a **roles matrix** of who can do what.

| Type | What it holds |
|---|---|
| `feature` | One feature, end to end: access, scenario, rules, limits, questions people ask |
| `business-rules` | The rules shared across features, or with no single owner |
| `roles-matrix` | Every role and what it can do, generated from the feature sheets |
| `process` | The same feature seen end to end: states, what proceeds on its own, what waits for someone |
| `release-notes` | Version history written for a business reader, never a copied commit message |

## The feature sheet

A `feature` page is a specification a product owner can check against the application. It opens with What it is
for and Who uses it, then its **user stories** (`:::story`), the main path as numbered steps, the Variants branching
from the step they come from ("4a. If …"), one **behaviour card** per behaviour (`:::behaviour`: a search, a filter,
a list, a form, a workflow…, each rubric of its kind answered), the sheet's own Business rules, its Fields and
inputs, its States, its Messages word for word, its Rights by action, its **acceptance criteria** (`:::scenario`,
Given / When / Then), and closes with Limits and Open questions. A section that does not apply says so, with its
reason ([A feature in depth](#/write/markdown~a-feature-in-depth-stories-behaviour-cards-scenarios)).

```json
{ "id": "use/orders/approval", "template": "feature", "feature": "F-01", "permissions": ["orders:write", "orders:approve"] }
```

- `feature` is a page field of `content/toc.json`, only on a page of template `feature`: the sheet's own id, in the
  form `F-01`. One sheet per id; a page typed `feature` without one only warns, but a second sheet with the same id
  fails the build.
- `permissions` feeds the roles matrix below; the sheet's "Rights by action" cites them with `[[perm …]]`.

[Example · Feature sheet](#/examples/feature) is a complete one: order approval at Acme Orders, with its stories,
its three behaviour cards, its own rule and six acceptance criteria.

## Business rules: stated once, cited everywhere

A rule is **defined once** — on the feature sheet it belongs to, or on the shared business-rules page when it
concerns more than one — as a statement followed by a "Given / When / Then" example:

```markdown
:::rule{id="BR-12" title="An order above the threshold waits for a manager"}
An order whose total is at or above the current approval threshold cannot ship until a manager of its region
approves it.

**Example.** **Given** an order of 12,000 €, **when** the buyer submits it, **then** it waits for a manager.
:::
```

Everywhere else, the rule is only **cited**: `[[rule BR-12]]`, a link chip to where it is defined. The id follows
`^[A-Z][A-Z0-9]{0,5}-\d{1,4}$`; the standard's convention is `BR-01` in English. A rule defined twice, cited by an
unknown id, or missing its `id` or `title`, each fail a strict build.

## The generated tables

Four directives build their table once every page has rendered, so a rule or a feature may be defined further down
the table of contents than the page that cites it:

| Directive | Builds |
|---|---|
| `::features{}` | Id · Feature (linked) · Summary · Who (its permissions) — one row per feature sheet |
| `::rules{}` | Id (linked) · Rule · Defined in (linked) · Cited by — one row per rule |
| `::roles{}` | One row per feature sheet, one column per distinct permission, `✔` where it unlocks the sheet |
| `::stories{}` | Id (linked) · Story · Feature (linked) · Role · Version · Criteria · Ticket — one row per user story of a feature sheet |

[Example · Business rules](#/examples/business-rules) and [Example · Roles matrix](#/examples/roles-matrix) show
both tables rendered.

## The Product board

The home of the Product space shows the **board**: the backlog of the feature sheets, read from the table of contents
and the sheets themselves ([Epics](#/write/table-of-contents~epics-the-top-of-the-backlog)). A page of any space
shows it too with `::board{}` (fr `::tableau{}`), for a project without spaces.

- **Map**: the epics in columns, with the share of their features specified; under each, its features as cards (id,
  version, who, kinds of behaviour, stories · criteria · rules, a depth gauge, the ticket); then one row of user
  stories per version — its own, else its feature's — a dot green when the story has acceptance criteria.
- **List**: Epic › Feature › Story, each level folding the next, the same columns.
- **Filters**: who (a story's role), epic, version, depth, and text (an id, a title, a story's title); the number of
  features shown is read out.
- **Depth** of a feature, from 0 to 100: the mean of its sheet written and conformant, at least one story, the share
  of its stories with acceptance criteria, at least one business rule (defined in its sheet or cited by it), and the
  share of the rubrics of its behaviour cards answered (when it has cards).
- A card opens its sheet, a story its heading; the arrow keys go from card to card. The view chosen is remembered;
  printed, the board is its list. A ticket is a link when `backlog.refs` gives its tool's address.

## Finding candidate features

```bash
doc-kit inventory --features
doc-kit inventory --features --write   # writes features.json
```

Groups what the coverage adapters already see — screen routes by their first static segment (`/orders`,
`/orders/[id]` → `orders`), API routes by their first segment after `/api`, i18n keys by their first segment — into
candidate features, each with a suggested id and the sheet that already cites it, if any. `--write` writes
`features.json` (refused if it exists, unless `--force`, which only appends new candidates); the `features`
coverage adapter then measures how many of its entries a sheet cites.

## What the code says of each behaviour

`doc-kit facts --source behaviours` reads the code of the application for how its features behave — how a list is
searched (contains, starts with, case ignored, accents, full text), filtered, sorted and paged, which fields a form
checks and how, the lists of values a screen offers, what triggers a search, the data scope of a query, the exports,
imports, notifications and scheduled jobs — whatever the stack: an array's `.filter` in the browser, Prisma, SQL,
Knex, Django, SQLAlchemy, zod, pydantic, an HTML form, an OpenAPI document. Each hint comes from one line of the code,
to be checked there: a hint is never a measure.

A feature in `features.json` can name its code: `sources` (globs relative to `app.dir`), besides its routes and API
routes, and `behaviours`, the kinds of card its sheet describes (`inventory --features` deduces them from the hints).
Then `doc-kit context <its sheet>` gives the writer that code — the handlers of its API routes and what they import
two levels deep — and a part **Behaviours to describe**: the hints, one line per field and place, and the cards to
write with their rubrics, required ones marked.

```json
[{ "id": "F-01", "title": "Track orders", "routes": ["/orders"], "sources": ["public/app.js"], "behaviours": ["search", "filter"] }]
```

## Keep the Product and Use spaces free of code

The Product and Use spaces are read without the code. A business page (`feature`, `business-rules`, `roles-matrix`,
`process`, `release-notes`) whose space is one of them — or a space of your own of one of their kinds — and that
contains a `file:line` proof gets the warning `business.technical`, "move the technical detail to its counterpart":
how the approval threshold is enforced belongs to the Develop space, behind the sheet's `counterpart`. A glossary
term's `technical` field (where it lives in the code) follows the same rule: it only shows in its tooltip when the
project has no spaces, or the current space is `admin`, `develop` or "everything"; only the Administer and Develop
exports keep it.

## Pitfalls and observed gaps

> [!WARNING] A concept page is not a feature sheet
> A page with no path and no behaviour — a catalogue, a list of settings — is not `feature`: leave it
> untyped, or type it `technical`.

> [!NOTE] One rule, one owner
> A rule that only one feature needs lives on that feature's own sheet. Move it to `business-rules` the day a
> second feature needs to cite it.

## Further reading

- [Four spaces, one source](#/spaces/overview): declaring `product`, the selector, the export.
- [Taking over a vibe-coded application](#/spaces/takeover): the Develop space, the counterpart of this one.
- [Extended Markdown](#/write/markdown~features-rules-and-roles): every directive's full syntax.
- [Example · Feature sheet](#/examples/feature), [Example · Process](#/examples/process), [Example · Release
  notes](#/examples/release-notes).
