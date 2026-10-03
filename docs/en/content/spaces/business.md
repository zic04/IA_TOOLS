## In short

The business space describes **each feature** for the people who use it, decide about it or support it: no code,
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

A `feature` page opens with an **access box** (fixed rows: Module, Who can use it, Prerequisites, Checked on), then
What it is for, Who uses it, the main scenario as numbered steps, Variants and exceptions branching from the step
they come from ("4a. If …"), the sheet's own Business rules, and closes with Limits and Questions people ask.

```json
{ "id": "use/orders/approval", "template": "feature", "feature": "F-01", "permissions": ["orders:write", "orders:approve"] }
```

- `feature` is a page field of `content/toc.json`, only on a page of template `feature`: the sheet's own id, in the
  form `F-01`. One sheet per id; a page typed `feature` without one only warns, but a second sheet with the same id
  fails the build.
- `permissions` feeds the access box's "Who can use it" through `[[perm …]]`, and the roles matrix below.

[Example · Feature sheet](#/examples/feature) is a complete one: order approval at Acme Orders, with its access
box, its scenario and its own rule.

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

Three directives build their table once every page has rendered, so a rule or a feature may be defined further down
the table of contents than the page that cites it:

| Directive | Builds |
|---|---|
| `::features{}` | Id · Feature (linked) · Summary · Who (its permissions) — one row per feature sheet |
| `::rules{}` | Id (linked) · Rule · Defined in (linked) · Cited by — one row per rule |
| `::roles{}` | One row per feature sheet, one column per distinct permission, `✔` where it unlocks the sheet |

[Example · Business rules](#/examples/business-rules) and [Example · Roles matrix](#/examples/roles-matrix) show
both tables rendered.

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

## Keep the business space free of code

A business page that contains a `file:line` proof gets the warning "move the technical detail to its counterpart":
how the approval threshold is enforced belongs to the takeover space, behind the sheet's `counterpart`. A glossary
term's `technical` field (where it lives in the code) follows the same rule: it only shows in its tooltip when the
project has no spaces, or the current space is `takeover` or "everything".

## Pitfalls and observed gaps

> [!WARNING] A concept page is not a feature sheet
> A page with no scenario and no access box — a catalogue, a list of settings — is not `feature`: leave it
> untyped, or type it `technical`.

> [!NOTE] One rule, one owner
> A rule that only one feature needs lives on that feature's own sheet. Move it to `business-rules` the day a
> second feature needs to cite it.

## Further reading

- [Two spaces, one source](#/spaces/overview): declaring `business`, the selector, the export.
- [Taking over a vibe-coded application](#/spaces/takeover): the counterpart of this space.
- [Extended Markdown](#/write/markdown~business-space): every directive's full syntax.
- [Example · Feature sheet](#/examples/feature), [Example · Process](#/examples/process), [Example · Release
  notes](#/examples/release-notes).
