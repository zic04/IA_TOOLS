# Standard site structure

A doc-kit site serves two **spaces** (`content/toc.json`, ARCHITECTURE.md §6.1a): the **Business** space, for
people who never need to read code, and the **Takeover** space, for the developers, operators and security
people who run and evolve the application. Each space is split into **parts** (what used to be called
"sections" when only one space existed); each part has a reader in mind.

The plan is declared in `content/toc.json`. The build derives the menu, the breadcrumbs, the part views, the
space selector and the search from it.

## The two spaces

| Space (en · fr) | For whom | Answers |
|---|---|---|
| `business` | Users, key users, product owners, support | "What does it do, for whom, and under which rule?" — no code |
| `takeover` | Developers, operators, security | "How is it built, run and secured, and what should be fixed first?" |

A space only matters to a reader who must **not** see the other one: a support person reading a dossier full of
`file:line` proofs and environment variables gets lost; a developer reading only business prose cannot take the
project over. `doc-kit build` produces one HTML file with a space selector (everyone, filtered by habit) and,
with `spaces.export` (the default), one additional file per space with the other one **physically removed**
(ARCHITECTURE.md §6.1a) — the file actually handed to an audience that must not see the rest.

## Business space: Use, Features, Administer, Process

| Part (en · fr) | Short title | For whom | What it holds | Main templates |
|---|---|---|---|---|
| `use` · `utiliser` | Use | The end user | Every everyday screen, annotated | `screen` |
| `features` · `fonctionnalites` | Features | Product owners, support, key users | What each feature does, for whom, its rules, who can do what | `feature`, `business-rules`, `roles-matrix` |
| `administer` · `administrer` | Administer | The business or platform administrator | Every editor and every setting, with its mechanism; access, reference data, system; the recipes | `screen`, `editor`, `recipe` |
| `process` · `processus` | Process | Product owners, support | What happens from end to end in business terms (not code); what changed release by release | `process`, `release-notes` |

`Administer` folds what used to be two sections before spaces existed, "Configure" (the editors) and
"Administer" (access, reference data, system): both serve whoever sets the product up, whether business-wide
or platform-wide, and the distinction rarely matters enough to justify two parts. Split them again when the
product has enough rich editors to earn their own part (see "When to adapt").

Orders of magnitude observed on real, pre-spaces sites, which map onto `use` and `administer` unchanged: 10 to
45 pages in Use, 14 to 27 in Administer (18 to 52 more when Configure is kept separate). `features` and
`process` are new: no size convention yet, size them by feature count rather than by analogy.

## Takeover space: Understand, Operate, Secure, Risks, Maintain

| Part (en · fr) | Short title | For whom | What it holds | Main templates |
|---|---|---|---|---|
| `understand` · `comprendre` | Understand | Whoever takes the project over, first | The big picture, the stack, the data, what really happens end to end, why past decisions were made | `technical` (+ `technical-sub`), `journey` + `journey-step`, `code-map`, `data-model`, `adr` |
| `operate` · `exploiter` | Operate | Operators | The production setup, how to install, build, deploy, roll back, back up | `architecture` (the technical architecture document), `runbook`, `variables`, `resources` |
| `secure` · `securiser` | Secure | Security, operators | Who owns what, the secrets, the API surface and its gaps, the threats and the mitigations | `access-ownership`, `api-surface`, `threat-model` |
| `risks` · `risques` | Risks | Whoever takes the project over | The risk register: what is wrong, ranked; the fastest path from a symptom to a fix | `findings`, `troubleshooting` + `troubleshooting-area` |
| `maintain` · `maintenir` | Maintain | Whoever takes the project over, over time | What keeps the project healthy: tests, dependencies, agent instruction files, the documentation itself | `tests-quality`, `agent-instructions`, `dependencies`, and "Maintaining the docs" (`technical`) |

`technical` and `technical-sub` are generic: use them in any part for a standalone topic that no more specific
type fits (security, storage, AI, integrations). The table above shows where each type is **most often** used,
not an exclusive rule.

Orders of magnitude observed on real, pre-spaces sites: 38 to 81 pages across what is now the whole Takeover
space. The 5-part split is new: there is no per-part convention yet; a site that used to have one flat Take
over section can keep its existing groups and only add `space: "takeover"` to its one part (see "When a project
has only one space").

### Which page type, in which part

| Business | Takeover |
|---|---|
| `screen` (Use, Administer) | `technical`, `technical-sub` (Understand, or any standalone topic) |
| `editor`, `recipe` (Administer) | `journey`, `journey-step` (Understand) |
| `feature`, `business-rules`, `roles-matrix` (Features) | `code-map`, `data-model`, `adr` (Understand) |
| `process`, `release-notes` (Process) | `architecture`, `runbook`, `variables`, `resources` (Operate) |
| | `access-ownership`, `api-surface`, `threat-model` (Secure) |
| | `findings`, `troubleshooting`, `troubleshooting-area` (Risks) |
| | `tests-quality`, `agent-instructions`, `dependencies` (Maintain) |

The full purpose, required sections and length of each of the 28 types are in
[templates.md](templates.md).

## When a project has only one space

Most projects still only need one audience:

- **No `spaces` key at all** (the default): the site is exactly what it was before spaces existed — one
  undifferentiated set of parts, no space selector, no per-space export, no space badge on a page. This is the
  right choice for a small internal tool with no real takeover audience, or for a documentation project that
  only ever produces a takeover dossier and never shows it to a business reader.
- **A single-element `spaces` array** (for example `"spaces": ["takeover"]`): every part still declares that one
  space. This is worth the extra declaration only when the project wants the space texts, the badge, or an
  export that strips nothing (there is nothing else to strip) — in practice, rare; prefer leaving `spaces`
  undeclared unless a second space is coming later.
- **Both spaces**: the common case for a product documentation project that is also handed over, or for a
  "vibe-coded" application where the takeover dossier (ARCHITECTURE.md §6.9) is the main deliverable and a
  short business space explains what the product is for.

A project can also add the second space **later**: declare `spaces`, give every existing part a `space`, move
nothing. The site keeps building; only the new space selector and exports appear.

## One page, one reader (Diátaxis)

[Diátaxis](https://diataxis.fr/) sorts documentation by what the reader needs to **do** with it (learn,
accomplish a task, look something up, understand why), not by the writer's convenience. doc-kit borrows one
rule from it, the one that matters most once a business reader and a technical reader share a site: **a page
has one reader**. Never blend a business explanation and an implementation detail on the same page — not "the
approval chain skips the manager when the order is under the threshold (see `approvalService.ts:88`)" on a
page a support person reads. Split the two: a business statement (`feature`, `business-rules`) on one side, the
same subject with its proof (`technical-sub`, `api-surface`, a journey step) on the other, and link them with
`counterpart`.

## `counterpart` links

`counterpart` (a page field, with or without declared spaces) points at "the same subject, for the other
audience": `"<page id>"` or `"<page id>~<anchor>"`. A feature sheet and the technical page that implements it
point at each other and share their `F-xx` identifier; a business process and the journey that automates part
of it do the same. The site renders it as one line under the page's badges ("Same topic, for {space}: {title}
→"), and the build checks it like an internal link (unknown page: `link.counterpart`, error).

`counterpart` is **not required to be reciprocal**: a technical page often has no business equivalent (nobody
needs a business explanation of the database schema), and that is fine. Add it only where a real reader would
otherwise have to guess that the other page exists.

## The required pages of the Takeover space

These pages make a project transferable, whatever parts they are filed under. The ids below are conventions:
`doc-kit audit` finds the pages by their `template` and, for the architecture overview, operate and maintain
pages, by their id (see [maturity.md](maturity.md)). This list is unchanged by the two-space model: it was the
"Take over" section before spaces existed, and it is the Takeover space now.

| Page | Suggested id (en · fr) | Template | Usual part | Content |
|---|---|---|---|---|
| Architecture overview | `take-over/architecture` · `reprendre/architecture` | `technical` (+ sub-pages) | Understand | The big picture, the stack, the principles, the main flows |
| Technical architecture document | `take-over/technical-architecture` · `reprendre/dat` | `architecture` | Operate | The production setup, numbered flows, what the document does not show, who manages what |
| End-to-end journey | `take-over/journey-<object>` · `reprendre/parcours-<objet>` | `journey` + `journey-step` | Understand | What really happens, step by step, when someone performs the product's main action |
| Operate | `take-over/operations`, `take-over/deployment…` · `reprendre/exploitation`, `reprendre/deploiement…` | `technical`, `variables`, `resources` | Operate | Delivery, variables, resources, scheduled tasks, backups, incidents |
| Troubleshooting by symptom | `take-over/troubleshooting` · `reprendre/diagnostic` | `troubleshooting` + `troubleshooting-area` | Risks | From the symptom to the cause, the check and the fix |
| Findings | `take-over/findings` · `reprendre/points-attention` | `findings` (+ sub-pages) | Risks | The numbered findings, re-checked in the code (see [writing.md](writing.md#9-numbering-findings)); also the risk register (owner, decision, status, due date) |
| Maintaining the docs | `take-over/maintaining-docs` · `reprendre/maintenir-doc` | `technical` | Maintain | How the site is built, retaking captures, writing a page, the checks, the transfer |

Recommended extra pages, placed by subject: access and ownership, the API surface, the data model, dependencies,
agent instruction files, a code map, decision records, a threat model (all described in
[templates.md](templates.md)); appendices.

> [!NOTE] Why journeys and troubleshooting
> On the most complete site built with this method, the owner found the journey of the main business object
> more useful than all the technical pages together: it answers "what really happens when I click?".
> Troubleshooting starts from the opposite question: "it does not work, where do I start?". Both cite the
> findings by their number instead of describing them again.

## The home-page guided tours

The `journeys` array of the plan offers tours of 5 to 7 pages on the home page, in reading order. With spaces
declared, a journey's `space` defaults to the space of its first step, and the home page shows each space's own
tours under "You are reading: {space}" (ARCHITECTURE.md §6.1a).

| Rule | Example (Acme Orders) |
|---|---|
| 3 to 5 tours, one per reader | "I discover Acme Orders", "I administer the platform", "I take the project over" |
| First-person title, with an action verb | "I follow an order from end to end" |
| `description`: one sentence that promises a result | "The interface and the essential actions in fifteen minutes." |
| 5 to 7 `steps`, all existing page ids (the build checks them) | `use/start/interface` → … → `use/orders/record` |
| One tour links the screen to the backstage, across spaces | "I follow an order…" ends with `take-over/journey-order` |

`suggestions` highlights 6 or 7 pages: the richest and the most consulted. For Acme Orders: the order record,
the approval inbox, the approval chains editor, the invoices list, roles and permissions, the architecture
overview.

## Groups

A group gathers 2 to 12 pages on one topic, in the order the reader discovers them. Beyond that, split the
group: for example "Approval chains — Rules", then "Approval chains — Notifications".

| Part | Groups that worked |
|---|---|
| Use | **Getting started** first (signing in, the interface, search, the assistant, role and scope, preferences), then one group per business object (Acme Orders: Orders, Customers, Approvals, Invoices, Reporting) |
| Features | One group per family of features, or one flat group below about 20 feature sheets; **Business rules** and **Roles and permissions** as their own pages, not groups |
| Administer | One group per family of editors (Acme Orders: Approval chains, Document templates, Dashboards…); Access, Reference data, System; **Configuration recipes** last |
| Process | One group per end-to-end business process; **Release notes** last |
| Understand | **Architecture**, **End-to-end journeys**, **Decisions** |
| Operate | **The technical architecture document**, **Install and deploy**, **Backups and jobs** |
| Secure | **Ownership and secrets**, **The API surface**, **Threats** |
| Risks | **Findings**, **Troubleshooting by area** |
| Maintain | **Tests and dependencies**, **Agent instructions**, **Maintaining this documentation** |

## Sub-pages

- **Beyond about 2,000 words, split the page.** Each template sets its own limit (`maxWords`); `doc-kit audit`
  reports the pages that exceed it.
- Declare a sub-page **right after its parent**, in the same group, with `"level": 2` and an id that extends the
  parent's id (`take-over/security/sign-in`).
- The parent keeps the overview and lists its sub-pages under `## In this part`: a "Sub-page / What you will
  find there" table whose first column links to each sub-page.
- The menu, the breadcrumbs and the part view follow on their own.
- After a split, replace with a link every "below" or "above" that now points to another page, and fix the
  anchors: the build reports every anchor it can no longer find.

The effect is measurable. A site that split its long pages (security, architecture document, findings,
deployment) had 2 pages out of 170 over their limit. A site that did not had 38 out of 115, including a
findings page of about 10,800 words.

## The other files in `content/`

| File | Role |
|---|---|
| `home.md` | Home-page text, below the part cards: "How to read this site", or a diagram of how the product works |
| `<part>/index.md` | Optional introduction of a part |
| `glossary.json` | Terms underlined on hover: `{ term, pattern, def }`. Mature sites have about 60 terms; a term's `technical` field (ARCHITECTURE.md §6.8) only shows in the Takeover space |

`toc.json` and `glossary.json` are **managed centrally**. When several people or agents write in parallel, each
one proposes changes (a summary, a new term) instead of editing these files.

## When to adapt the structure

Adapt the **vocabulary**, the **parts** and the **groups** to the product. Keep the **two spaces' intent** (a
business reader never has to touch code; a takeover reader gets everything needed to run and secure the
application) and the **required Takeover pages**.

| Situation | Adaptation | Example |
|---|---|---|
| The product gives its configuration another name | Rename the part and keep its role | A product whose editors are called "studios": part `studios`, title "Administer — the studios" |
| Many rich editors, enough to crowd Administer | Split a `configure` part back out of Administer | A product with 30+ editors: `configure` (editors, recipes) and `administer` (access, reference data, system) again |
| Several editors are chained towards one goal | Add a recipes group at the end of Administer | "Configuration recipes": "Approve large orders in two steps" |
| Production has its own configuration for each use case | Add a group in Operate, with one page per case | "The production configuration", one page per business unit |
| The product has few enough features that a sheet per feature is overkill | Fold Features into Use, one `business-rules` page instead of a part | A product with 5 screens and no real "feature catalogue" |
| A cross-cutting reference (routes, URL parameters, figures and limits) | An "Appendices" page at the end of Maintain | `take-over/appendices` |

Do not drop the Takeover space "because the team knows the code", and do not file its pages under the Business
space's Administer part. The reader who takes the project over is not the business administrator.
