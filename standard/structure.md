# Standard site structure

A doc-kit site serves four readers: the person who **uses** the application, the one who **configures** it, the one who **administers** it and the one who **takes it over** (developer, operator, architect). Each reader has a section.

The plan is declared in `content/toc.json`. The build derives the menu, the breadcrumbs, the section views and the search from it.

## The four sections

| Id (en · fr) | Short title | For whom | What it holds | Main templates |
|---|---|---|---|---|
| `use` · `utiliser` | Use | The end user | Every everyday screen, annotated | `screen` |
| `configure` · `configurer` | Configure | The person who configures the product, the business administrator | Every editor and every setting, with its mechanism; the recipes | `editor`, `recipe` |
| `administer` · `administrer` | Administer | The platform administrator | Access, reference data, system, operations | `screen` |
| `take-over` · `reprendre` | Take over | Whoever takes the project over | Architecture, technical architecture document, end-to-end journeys, operations, troubleshooting, findings | `technical`, `journey`, `troubleshooting`… |

Orders of magnitude observed on real sites: 10 to 45 pages in Use, 18 to 52 in Configure, 14 to 27 in Administer, 38 to 81 in Take over. The balance reflects the product: a product with many business screens has a large Use section; a product with few screens but rich editors has a large Configure section.

### Section fields

| Field | Role | Example (Acme Orders) |
|---|---|---|
| `id` | Page prefix and URL segment | `take-over` |
| `title` | Full title of the section view | "Taking over Acme Orders" |
| `shortTitle` | Menu label | "Take over" |
| `icon` | Menu icon, by name | one of the site's icons |
| `subtitle` | One sentence under the title | "The sales rep's daily work: orders, customers, approvals and invoices." |
| `highlights` | Three highlights, shown on the home page | "The order record and its nine tabs" |
| `featured` | `true`: the section is highlighted on the home page | `configure` |
| `groups` | List of `{ title, pages[] }` | "Getting started", "Orders"… |

### Page fields

| Field | Required | Role |
|---|---|---|
| `id` | Yes | File path: `content/<id>.md`. Starts with the section id. |
| `title` | Yes | Page title. The Markdown file has no `#` heading. |
| `menuTitle` | No | Short menu label. |
| `summary` | Yes | One sentence, used by the section view, the search and the home-page cards. |
| `routes` | No | Application routes documented by the page; read by the coverage check. |
| `permissions` | No | Required permission codes; shown at the top of the page. |
| `level` | No | `2` for a sub-page. It is attached to the last level-1 page above it in the same group. |
| `template` | No | Page type (see [templates.md](templates.md)). The build then checks its required sections. |

The product name is not declared in the plan: it comes from `doc.config.mjs`.

## Groups

A group gathers 2 to 12 pages on one topic, in the order the reader discovers them. Beyond that, split the group: for example "Approval chains — Rules", then "Approval chains — Notifications".

| Section | Groups that worked |
|---|---|
| Use | **Getting started** first (signing in, the interface, search, the assistant, role and scope, preferences), then one group per business object (Acme Orders: Orders, Customers, Approvals, Invoices, Reporting) |
| Configure | One group per family of editors (Acme Orders: Approval chains, Document templates, Dashboards…); an "Understanding" group first when the editors share a mechanism; **Configuration recipes** last |
| Administer | Access, Reference data, System; depending on the product: Operations, Analytics, AI, Feedback |
| Take over | **Architecture**, **End-to-end journeys**, **Operate and evolve**; add "The production configuration" when production has a configuration per use case |

## The required "Take over" pages

These pages make a project transferable. The ids below are conventions: `doc-kit audit` finds the pages by their `template` and, for the architecture overview, operations and maintenance pages, by their id (see [maturity.md](maturity.md)).

| Page | Suggested id (en · fr) | Template | Content |
|---|---|---|---|
| Architecture overview | `take-over/architecture` · `reprendre/architecture` | `technical` (+ sub-pages) | The big picture, the stack, the principles, the main flows |
| Technical architecture document | `take-over/technical-architecture` · `reprendre/dat` | `architecture` | The production setup, numbered flows, what the document does not show, who manages what |
| End-to-end journeys | `take-over/journey-<object>` · `reprendre/parcours-<objet>` | `journey` + `journey-step` | What really happens, step by step, when someone performs the product's main action |
| Operate | `take-over/operations`, `take-over/deployment…` · `reprendre/exploitation`, `reprendre/deploiement…` | `technical`, `variables`, `resources` | Delivery, variables, resources, scheduled tasks, backups, incidents |
| Troubleshooting by symptom | `take-over/troubleshooting` · `reprendre/diagnostic` | `troubleshooting` + `troubleshooting-area` | From the symptom to the cause, the check and the fix |
| Findings | `take-over/findings` · `reprendre/points-attention` | `findings` (+ sub-pages) | The numbered findings, re-checked in the code (see [writing.md](writing.md#9-numbering-findings)) |
| Maintaining the docs | `take-over/maintaining-docs` · `reprendre/maintenir-doc` | `technical` | How the site is built, retaking captures, writing a page, the checks, the transfer |

Recommended extra pages: database, storage, security, AI, integrations, code map, tests and quality; the production configuration per use case; appendices.

> [!NOTE] Why journeys and troubleshooting
> On the most complete site built with this method, the owner found the journey of the main business object more useful than all the technical pages together: it answers "what really happens when I click?". Troubleshooting starts from the opposite question: "it does not work, where do I start?". Both cite the findings by their number instead of describing them again.

## The home-page guided tours

The `journeys` array of the plan offers tours of 5 to 7 pages on the home page, in reading order.

| Rule | Example (Acme Orders) |
|---|---|
| 3 to 5 tours, one per reader | "I discover Acme Orders", "I administer the platform", "I take the project over" |
| First-person title, with an action verb | "I follow an order from end to end" |
| `description`: one sentence that promises a result | "The interface and the essential actions in fifteen minutes." |
| 5 to 7 `steps`, all existing page ids (the build checks them) | `use/start/interface` → … → `use/orders/record` |
| One tour links the screen to the backstage | "I follow an order…" ends with `take-over/journey-order` |

`suggestions` highlights 6 or 7 pages: the richest and the most consulted. For Acme Orders: the order record, the approval inbox, the approval chains editor, the invoices list, roles and permissions, the architecture overview.

## Sub-pages

- **Beyond about 2,000 words, split the page.** Each template sets its own limit (`maxWords`); `doc-kit audit` reports the pages that exceed it.
- Declare a sub-page **right after its parent**, in the same group, with `"level": 2` and an id that extends the parent's id (`take-over/security/sign-in`).
- The parent keeps the overview and lists its sub-pages under `## In this part`: a "Sub-page / What you will find there" table whose first column links to each sub-page.
- The menu, the breadcrumbs and the section view follow on their own.
- After a split, replace with a link every "below" or "above" that now points to another page, and fix the anchors: the build reports every anchor it can no longer find.

The effect is measurable. A site that split its long pages (security, architecture document, findings, deployment) had 2 pages out of 170 over their limit. A site that did not had 38 out of 115, including a findings page of about 10,800 words.

## The other files in `content/`

| File | Role |
|---|---|
| `home.md` | Home-page text, below the section cards: "How to read this site", or a diagram of how the product works |
| `<section>/index.md` | Optional introduction of a section |
| `glossary.json` | Terms underlined on hover: `{ term, pattern, def }`. Mature sites have about 60 terms. |

`toc.json` and `glossary.json` are **managed centrally**. When several people or agents write in parallel, each one proposes changes (a summary, a new term) instead of editing these files.

## When to adapt the structure

Adapt the **vocabulary** and the **groups** to the product. Keep the **four readers** and the **required Take over pages**.

| Situation | Adaptation | Example |
|---|---|---|
| The product gives its configuration another name | Rename the section and keep its role | A product whose editors are called "studios": section `studios`, title "Configure — the studios", short title "Studios" |
| Several editors are chained towards one goal | Add a recipes group at the end of Configure | "Configuration recipes": "Approve large orders in two steps" |
| Production has its own configuration for each use case | Add a group in Take over, with one page per case | "The production configuration", one page per business unit |
| The product has no configuration screen | Merge Configure into Administer | — |
| A cross-cutting reference (routes, URL parameters, figures and limits) | An "Appendices" page at the end of Take over | `take-over/appendices` |

Do not drop Take over "because the team knows the code", and do not file the technical pages under Administer. The reader who takes the project over is not the administrator.
