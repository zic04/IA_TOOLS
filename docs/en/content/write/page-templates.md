## In short

A **page template** fixes the `##` sections of a type of page, their order and the page's maximum length. There
are **31 types**, in three families: 13 general types (no spaces needed), 5 for the business space, 13 for the
takeover space. A page declares its type in the table of contents (`"template": "screen"`); the build then checks
that its **required sections** are there, and `doc-kit audit` measures how complete it is.

1. **The source of truth** is `standard/templates.json` in the kit, plus its two fragments,
   `standard/templates/business.json` and `standard/templates/takeover.json`: the sections of each type in English
   and in French, the indexes of the required ones, `maxWords`, and a few accepted variants of headings.
2. **The ready-to-fill pages** are `templates/pages/en/<type>.md` and `templates/pages/fr/<type>.md`, with a
   guidance comment in each section.
3. **`doc-kit new <page-id> --template <type> [--prefill]`** writes the page from the template, in the project's
   language, and declares it in `content/toc.json`.

## In this part

Each type has a complete example, written for Acme Orders, in the **Examples** section of this site.

### General types

| Type | For | Required sections | `maxWords` | Example |
|---|---|---|---|---|
| `screen` | A screen and its actions | 5 of 10 | 2,500 | [screen](#/examples/screen) |
| `editor` | An editor and the mechanism it drives | 6 of 8 | 3,000 | [editor](#/examples/editor) |
| `recipe` | A goal reached by chaining several editors | 5 of 7 | 3,500 | [recipe](#/examples/recipe) |
| `technical` | A technical topic, parent or standalone | 1 of 5 | 2,000 | [technical](#/examples/technical) |
| `technical-sub` | The detail of a technical topic | none | 2,000 | [technical-sub](#/examples/technical-sub) |
| `journey` | What happens from end to end | 5 of 7 | 2,000 | [journey](#/examples/journey) |
| `journey-step` | One step of a journey, at code level | 5 of 7 | 2,200 | [journey-step](#/examples/journey-step) |
| `troubleshooting` | From the symptom to the cause | 5 of 6 | 2,000 | [troubleshooting](#/examples/troubleshooting) |
| `troubleshooting-area` | The symptoms of one area | 2 of 2 | 2,000 | [troubleshooting-area](#/examples/troubleshooting-area) |
| `findings` | The numbered findings | 2 of 6 | 2,000 | [findings](#/examples/findings) |
| `architecture` | The production setup | 5 of 7 | 2,000 | [architecture](#/examples/architecture) |
| `variables` | The environment variables | 2 of 4 | 2,200 | [variables](#/examples/variables) |
| `resources` | The deployment resources | 7 of 9 | 2,200 | [resources](#/examples/resources) |

### Business space types

| Type | For | Required sections | `maxWords` | Example |
|---|---|---|---|---|
| `feature` | One feature, end to end | 5 of 11 | 2,500 | [feature](#/examples/feature) |
| `business-rules` | Rules shared across features | 2 of 4 | 3,000 | [business-rules](#/examples/business-rules) |
| `roles-matrix` | Every role and what it can do | 3 of 5 | 2,000 | [roles-matrix](#/examples/roles-matrix) |
| `process` | The same feature, end to end | 4 of 8 | 2,200 | [process](#/examples/process) |
| `release-notes` | Version history for a business reader | 2 of 3 | 3,000 | [release-notes](#/examples/release-notes) |

### Takeover space types

| Type | For | Required sections | `maxWords` | Example |
|---|---|---|---|---|
| `access-ownership` | Who owns what | 3 of 6 | 2,200 | [access-ownership](#/examples/access-ownership) |
| `api-surface` | Every route, authentication and isolation | 3 of 5 | 3,000 | [api-surface](#/examples/api-surface) |
| `runbook` | Install, deploy, roll back, back up | 5 of 8 | 3,000 | [runbook](#/examples/runbook) |
| `data-model` | Tables, personal data, migrations | 3 of 7 | 2,500 | [data-model](#/examples/data-model) |
| `dependencies` | Direct dependencies, hallucinated packages | 3 of 6 | 2,200 | [dependencies](#/examples/dependencies) |
| `code-map` | Containers, components, integrations | 4 of 6 | 2,500 | [code-map](#/examples/code-map) |
| `tests-quality` | What is tested, tests that test nothing | 4 of 5 | 2,200 | [tests-quality](#/examples/tests-quality) |
| `agent-instructions` | The AI assistants' own instruction files | 4 of 5 | 2,500 | [agent-instructions](#/examples/agent-instructions) |
| `adr` | One reconstructed decision | 5 of 5 | 1,500 | [adr](#/examples/adr) |
| `threat-model` | The data flow diagram and STRIDE threats | 4 of 6 | 3,000 | [threat-model](#/examples/threat-model) |
| `security-review` | The access matrix, probe results, OWASP findings | 7 of 10 | 3,000 | [security-review](#/examples/security-review) |
| `maintainability-review` | Ratings, hotspots, recommendations by effort | 5 of 8 | 2,200 | [maintainability-review](#/examples/maintainability-review) |
| `documentation-cost` | Time, agents, models and tokens spent on the documentation | 3 of 5 | 1,200 | [documentation-cost](#/examples/documentation-cost) |

The sections themselves, type by type, are listed in `standard/templates.md`. The pages of this site are typed
too: the reference pages are `technical`, the how-to pages `recipe`. The business and takeover types are explained
as guides, not only as a reference table: [Documenting each feature](#/spaces/business) and
[Taking over a vibe-coded application](#/spaces/takeover).

## How a section is recognised

A required section is found when a `##` heading of the page **starts with** its label, or with one of its accepted
variants. Case, accents, the shape of the apostrophe and repeated spaces are ignored.

| Heading in the page | `screen` section found |
|---|---|
| `## What it is for` | What it is for |
| `## What this screen is for` | What it is for (accepted variant) |
| `## Step by step: approve an order` | Step by step |
| `## Pitfalls` | Pitfalls and limits (accepted variant) |
| `## Overview` | none: rename it, or the page is not conformant |

The section labels follow the **language of the project**: a French project writes `## À quoi ça sert`, and the
English labels do not count there.

## What the build and the audit do with them

- **Strict build**: a typed page that lacks a required section is an error ("required section missing for template
  “screen”: “Required permissions”"); the site is not written. With `--draft`, it is a warning.
- **Unknown type**: `"template": "screens"` is an error that lists the known types.
- **Guidance left**: an HTML comment that starts with `guidance:` (`consigne :` in French) is a warning of the build
  and blocks level 3 of the audit.
- **Length**: words are counted in the Markdown, without code, comments and markup. Beyond `maxWords` (2,000 for an
  untyped page), `doc-kit audit` counts the page as too long: split it into sub-pages.
- **Completeness**: the share of the template's sections present, averaged over the typed pages, is an indicator of
  level 4.
- **Without screenshots** (`capture.mode: "none"`): `doc-kit new` writes "The screen" of the `screen` and `editor`
  templates as a table `| Element | What it shows |`, one row per element in reading order (top to bottom, then left
  to right), the exact label in bold. The templates hold both variants between `<!-- doc-kit:capture=app -->`,
  `<!-- doc-kit:capture=none -->` and `<!-- doc-kit:end -->` markers; `new` keeps the one of the project.

## Creating a page: `doc-kit new`

```bash
doc-kit new use/orders/export --template screen --title "Exporting orders"
doc-kit new use/orders/export/columns --template technical-sub --parent use/orders/export
doc-kit new take-over/deployment/variables --template variables --prefill
```

| Option | Effect |
|---|---|
| `--template <type>` | The type; required unless the page is already declared with one |
| `--title "…"` | `title` and `menuTitle` of the entry; default: the last segment of the id, humanised |
| `--parent <id>` | Declares a sub-page (`"level": 2`) right after its parent and the parent's sub-pages |
| `--prefill` | Fills the page's main table from `doc-kit facts`, for the five takeover types built from one source: `variables` (`env`), `api-surface` (`api`), `data-model` (`db`), `dependencies` (`dependencies`), `agent-instructions` (`agents`) |

Without `--parent`, the page is added at the end of the group whose pages share the longest id prefix, or of the
last group of the section named by the first segment of the id. The table of contents is edited **as text**: its
indentation and line endings are kept, and a legacy French-keyed file receives keys in its own style. The entry's
summary is a placeholder, which `doc-kit audit` reports until you write it. An existing file is never overwritten
(exit code 1). `--prefill` needs `facts/<source>.json` to exist (`doc-kit facts` first, exit code 1 otherwise) and
a type that has one (exit code 2 otherwise); it fills the key cells and their proof, row by row, and leaves the
rest as guidance — see [Cost and speed](#/skill/cost-and-speed~starting-from-the-facts-new-prefill).

## Untyped pages

Not every page needs a type. Leave `template` out for a sub-page of a screen or of an editor, a findings sub-page,
a page of concepts, a catalogue or an appendix. `doc-kit audit` names the untyped pages that already follow a type
(all its required sections are there) and tells, for the others, the closest type and the sections it lacks.

## Pitfalls and observed gaps

> [!WARNING] A count at the start of a heading
> "The 28 variables, one by one" does not start with "The variables": the section is not found. Put counts in the
> text, not at the start of a heading.

> [!NOTE] Changing the standard
> `standard/templates.json` is read by the build: a change to a required section changes what every project must
> contain. It goes into `ARCHITECTURE.md` first, then into both languages of the standard and of the templates.

## Further reading

- [Extended Markdown](#/write/markdown): the syntax used inside the sections.
- [Table of contents, sub-pages and journeys](#/write/table-of-contents): declaring the pages and their type.
- [Audit and maturity levels](#/publish/audit): `typed`, `conformant`, `completeness` and `tooLong`.
- [The documentation standard](#/method/standard): why these sections, and the rules of writing.
