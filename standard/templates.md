# Page templates

A template sets the `##` sections of a page type, their order and the page's maximum length. There are 30
types: the 13 original ones, used in either space, and 17 added for the two spaces of
[structure.md](structure.md) — 5 for the Business space (§6.8 of ARCHITECTURE.md), 12 for the Takeover space
(§6.9, §6.13). The machine-readable version is [templates.json](templates.json) (the 13 original types) plus
`templates/<group>.json` (`business.json`, `takeover.json`); the ready-to-fill pages are in
`templates/pages/en/<type>.md` and `templates/pages/fr/<type>.md`.

The type ids are English in every project: `screen`, `editor`, `recipe`, `technical`, `technical-sub`,
`journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`,
`resources` (used in either space, mostly Take over); `feature`, `business-rules`, `roles-matrix`, `process`,
`release-notes` (Business space); `access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`,
`code-map`, `tests-quality`, `agent-instructions`, `adr`, `threat-model`, `security-review`,
`maintainability-review` (Takeover space). The section labels follow the language of the project.

## How the build uses them

- A page declares its type in `content/toc.json`: `{ "id": "use/orders/list", …, "template": "screen" }`.
- The build then checks its **required sections**. A section is found when a `##` heading of the page **starts with** its label, or with one of its aliases, ignoring case and accents. "Step by step: approve an order" matches "Step by step".
- A missing required section is a **blocking error** of the strict build. The other sections of the template are recommended: `doc-kit audit` measures how many are present.
- `maxWords` is a `doc-kit audit` **warning**: beyond it, split the page into sub-pages.
- `doc-kit new <page-id> --template <type>` creates the page from the template, in the language of the project and in the variant of its capture mode.
- **Capture variants.** The `screen` and `editor` templates hold two variants of "The screen" (and of "What it changes"), between `<!-- doc-kit:capture=app -->`, `<!-- doc-kit:capture=none -->` and `<!-- doc-kit:end -->` markers. `doc-kit new` and `doc-kit init` keep the variant of `capture.mode` and remove the markers. With `capture.mode: "none"`, "The screen" is a table `| Element | What it shows |`: one row per element in reading order (top to bottom, then left to right), the exact label in bold, then its role, values, default and effect.
- The guidance left in a page (`<!-- guidance: … -->` in English, `<!-- consigne : … -->` in French) is reported by `doc-kit audit` and by the strict build. Write the section, then remove its guidance.
- The `en` and `fr` label lists have the same length and the same order. `required` holds positions in these lists, so it is the same in both languages.

A worked example of each type, written for Acme Orders, is listed under `example` in `templates.json`.

Legend of the tables below: **✱** = required.

## Overview

### The 13 original types (either space, mostly Take over)

| Type | Usual part | Purpose | Required | `maxWords` | Example page (Acme Orders) |
|---|---|---|---|---|---|
| `screen` | Use, Administer | A screen and its actions | 5 | 2,500 | `use/orders/list` |
| `editor` | Administer | An editor and the mechanism it drives | 6 | 3,000 | `administer/approvals/approval-chains` |
| `recipe` | Administer | A goal reached by chaining several editors | 5 | 3,500 | `administer/recipes/two-step-approval` |
| `technical` | Understand, or any topic | A technical topic (parent or standalone page) | 1 | 2,000 | `take-over/security` |
| `technical-sub` | Understand, or any topic | The detail of a technical topic | 0 | 2,000 | `take-over/security/sign-in` |
| `journey` | Understand | What happens from end to end | 5 | 2,000 | `take-over/journey-order` |
| `journey-step` | Understand | One step of a journey | 5 | 2,200 | `take-over/journey-order/approval` |
| `troubleshooting` | Risks | From the symptom to the cause | 5 | 2,000 | `take-over/troubleshooting` |
| `troubleshooting-area` | Risks | The symptoms of one area | 2 | 2,000 | `take-over/troubleshooting/access` |
| `findings` | Risks | The numbered findings, the risk register | 2 | 2,000 | `take-over/findings` |
| `architecture` | Operate | The production setup | 5 | 2,000 | `take-over/technical-architecture` |
| `variables` | Operate | The environment variables | 2 | 2,200 | `take-over/deployment/variables` |
| `resources` | Operate | The deployment resources | 7 | 2,200 | `take-over/deployment/resources` |

### The 5 Business space types (ARCHITECTURE.md §6.8)

| Type | Usual part | Purpose | Required | `maxWords` | Example page (Acme Orders) |
|---|---|---|---|---|---|
| `feature` | Features | One feature: who uses it, when, its rules | 5 | 2,500 | `features/two-step-approval` |
| `business-rules` | Features | Every business rule, in one place | 2 | 3,000 | `features/business-rules` |
| `roles-matrix` | Features | The roles and what each one can do | 3 | 2,000 | `features/roles` |
| `process` | Process | An end-to-end business process | 4 | 2,200 | `process/order-to-cash` |
| `release-notes` | Process | What changed, version by version | 2 | 3,000 | `process/release-notes` |

### The 12 Takeover space types (ARCHITECTURE.md §6.9, §6.13)

| Type | Usual part | Purpose | Required | `maxWords` | Example page (Acme Orders) |
|---|---|---|---|---|---|
| `access-ownership` | Secure | Who owns what, and how to hand it over | 3 | 2,200 | `take-over/access-ownership` |
| `api-surface` | Secure | Every route, its authentication and its gaps | 3 | 3,000 | `take-over/api-surface` |
| `runbook` | Operate | Install, build, deploy, roll back, back up | 5 | 3,000 | `take-over/runbook` |
| `data-model` | Understand | The tables, their personal data, their retention | 3 | 2,500 | `take-over/data-model` |
| `dependencies` | Maintain | The packages used, including the ones that do not exist | 3 | 2,200 | `take-over/dependencies` |
| `code-map` | Understand | Containers, components, integrations | 4 | 2,500 | `take-over/code-map` |
| `tests-quality` | Maintain | What is actually tested, and how to run it | 4 | 2,200 | `take-over/tests-quality` |
| `agent-instructions` | Maintain | Every AI agent instruction file, rule by rule | 4 | 2,500 | `take-over/agent-instructions` |
| `adr` | Understand | One reconstructed architecture decision | 5 | 1,500 | `take-over/architecture/adr-01-database` |
| `threat-model` | Secure | The data flow diagram, the threats, the mitigations | 4 | 3,000 | `take-over/threat-model` |
| `security-review` | Secure | Authentication, access control, OWASP findings | 7 | 3,000 | `take-over/security-review` |
| `maintainability-review` | Maintain | Ratings, hotspots, recommendations by effort | 5 | 2,200 | `take-over/maintainability-review` |

---

## `screen` — Screen page

A screen of the application, seen by the person who uses it: what it is for, how it works, every element annotated, the pitfalls, the permissions.

| Section | | Content |
|---|---|---|
| What it is for | ✱ | The business need in 2 to 4 sentences; a NOTE box "Where to find this screen" (`[[menu …]]`, `[[route …]]`) |
| How it works | ✱ | The real mechanism: server or browser, order, limits; a HOW box; a table when there are several cases |
| The screen | ✱ | One `:::screen` capture per panel; the legend has one item per zone, 1 to 3 sentences each. Without screenshots (`capture.mode: "none"`): one table `\| Element \| What it shows \|` per panel, in reading order |
| Each action | | One `###` per action that needs more than a legend (dialog, server check, audit entry) |
| Settings reference | | `\| Setting \| Control \| Values · default \| Effect \|` |
| Step by step | | `:::steps`, the most frequent task, heading "Step by step: <task>" |
| Common use cases | | 3 to 5 real situations, one line each |
| Pitfalls and limits | ✱ | WARNING boxes, then a NOTE box "Observed gaps (vX.Y.Z)" |
| In production | | What is actually configured in production, dated (useful on administration pages) |
| Required permissions | ✱ | A PERMISSIONS box: view, save, special actions |

- **Length**: observed between 800 and 3,000 words, median about 1,500; limit 2,500.
- **Example**: the orders list of Acme Orders, with five captures (four of them annotated, 21 zones in all); the users page of the administration area, where "Each action" is written as subsections of "The screen".
- **Common mistakes**:
  - describing the screen without saying where the figures come from ("How it works" missing);
  - a legend that paraphrases the label instead of giving the values, the default and the effect;
  - "Step by step" **and** "Common use cases" saying the same thing: keep one of the two;
  - taking the displayed counter for the total. In Acme Orders, "{n} order(s) in your scope" counts the filtered results, not every order.

## `editor` — Editor page

A configuration screen and, above all, the mechanism it drives: when the setting is read, by whom, and what changes for the end user. This is the template of the best reference pages.

| Section | | Content |
|---|---|---|
| What it is for | ✱ | The need, and what happens **with no setting at all**; a NOTE box "Where to find this setting" |
| How it works | ✱ | An SVG diagram, a numbered HOW box, comparison tables (for example "Sequential or parallel approval") |
| The screen | ✱ | One `:::screen` capture per panel or dialog; without screenshots, one table `\| Element \| What it shows \|` each |
| What it changes | | `::before-after`, or a capture of the user screen it affects; without screenshots, the effect described from the code |
| Settings reference | ✱ | One table per group of settings (`###`); bounds and defaults read in the code |
| Step by step | | The most common configuration, up to the check that it works |
| Pitfalls and limits | ✱ | WARNING boxes, then a NOTE box "Observed gaps" |
| Required permissions | ✱ | View and edit; run what the setting produces; audit trail |

- **Length**: observed between 800 and 3,900 words, median 1,700 to 2,300; limit 3,000.
- **"What it changes" is not required.** On a production captured read-only, the "after" cannot be produced. On a site captured read-only, 2 editors out of 17 had this section; on a site captured on a local demo, almost all of them did.
- **Common mistakes**:
  - typing as `editor` a page of concepts or a catalogue (for example the list of dashboard widgets): it has no screen and no settings reference; type it `technical`, or leave it untyped;
  - forgetting what happens to **existing** objects when the setting changes. In Acme Orders: "Editing an approval chain does not affect the orders already pending approval";
  - leaving out the audit trail of the changes.

## `recipe` — Configuration recipe

A concrete goal reached by chaining several editors, sometimes outside the application (database, infrastructure, identity provider). A recipe links to the editor pages for the detail.

| Section | | Content |
|---|---|---|
| The goal | ✱ | The expected result; a RECIPE box "What you need" |
| Who does what | | The actors in order (a diagram), or the journey at a glance |
| Step 1 | ✱ | Then `## Step 2 — …` and so on: one section per step, "Step n — verb and object" |
| How to check it works | ✱ | 4 to 6 observable checks |
| Common errors and fixes | | `\| Symptom \| Likely cause \| Fix \|`, with the exact messages |
| Pitfalls and limits | ✱ | The pitfalls of the chain of steps; a NOTE box of observed gaps |
| Required permissions | ✱ | The permissions of each actor, including outside the application |

- **Length**: observed between 1,400 and 3,000 words; limit 3,500.
- **Example**: "Approve large orders in two steps" in Acme Orders: create the Finance group in the identity provider, map it to a role, add an amount threshold to the approval chain, then check with a test order (8 steps, outside then inside the application).
- **Common mistakes**:
  - copying the detail of the settings instead of linking to the editor page;
  - a step without "what you see when it worked";
  - several recipes in one page, with no single goal.

## `technical` — Technical page

A topic of the Take over section: security, database, storage, AI, integrations, deployment, operations, maintaining the docs. It is a parent page when the topic is split, a standalone page otherwise.

| Section | | Content |
|---|---|---|
| In short | ✱ | The short answer, or the numbered list of the mechanisms, with their real names |
| In this part | | A "Sub-page / What you will find there" table; **required as soon as the page has sub-pages** |
| The diagram | | `::diagram` and how to read it |
| *(free sections)* | | One `##` per topic, in the order in which the code chains them |
| Pitfalls and observed gaps | | WARNING boxes; gaps with the existing documentation and with production; links to the numbered findings |
| Further reading | | 3 to 6 links |

- **Length**: parent pages observed between 550 and 1,850 words; limit 2,000. Technical pages that were never split reached 5,400 words, which is too long to be read.
- **Example**: `take-over/security` in Acme Orders: "In short" lists five mechanisms, all on the server side (sign-in through the identity provider, the middleware, permissions, scope filtering, the audit log), then three sub-pages.
- **Common mistakes**: an "In short" that announces instead of answering; a technical topic without a single `file:line` proof. On the best site, two thirds of the Take over pages carry at least one proof.

## `technical-sub` — Technical sub-page

The detail of a technical topic. It has no "In short": the parent carries it. The body is free: one `##` per mechanism, in execution order.

| Section | | Content |
|---|---|---|
| *(diagram first, optional)* | | `::diagram` before the first heading |
| *(free sections)* | | One `##` per mechanism: a Value / Effect table, `:::steps`, proofs |
| Further reading | | The sibling pages and the parent |

- **Length**: observed between 380 and 1,200 words; limit 2,000.
- **Example**: `take-over/security/sign-in` in Acme Orders: "## The sign-in flow", "## The identity provider", "## Mapping groups to roles", "## The session".
- **Common mistake**: keeping a "below" that pointed to the parent page before the split.

## `journey` — End-to-end journey

What really happens, from end to end, when someone performs the product's main action: triggers, writes, services called, what is automatic and what waits for a person. It is the parent of a series of `journey-step` pages.

| Section | | Content |
|---|---|---|
| In short | ✱ | The short answer; a HOW box "What happens when…?" |
| The diagram | ✱ | Solid line = chained; dotted line = waits for a person; alert colour = scheduled task |
| In this part | ✱ | `\| Step \| Trigger \| Automatic or human \| What changes \|` |
| The states | | A step × object table, with the code values and the displayed labels |
| What happens on its own, and what waits for someone | | Two lists; what depends on a scheduler |
| Surprises to know about | ✱ | 6 to 10 items, each with its finding and its sub-page |
| Further reading | ✱ | Architecture, technical architecture document, screens, the matching home-page tour |

- **Length**: observed between 1,450 and 1,900 words; limit 2,000.
- **Example**: `take-over/journey-order` in Acme Orders: an order in 6 steps (creation, submission, approval, invoicing, payment, archiving). Other journeys worth writing for such a product: the assistant's answer, a new account, an overdue-invoice reminder, a figure on a dashboard.
- **Common mistakes**: describing the screen instead of the mechanism; describing a finding again instead of citing its number.

## `journey-step` — Journey step

One step, at code level: each line of execution, what is read and written, what the user sees, what breaks.

| Section | | Content |
|---|---|---|
| In short | ✱ | Trigger, actor, synchronous or not, duration, result |
| What happens, step by step | ✱ | `:::steps`, each step with its `file:line` |
| What is read and written | | `\| Where \| What \| When \|` |
| The states | | `\| Status \| Displayed label \| What to do \|` |
| What the user sees | ✱ | An existing capture, or a description; what the screen does not show |
| When things go wrong | ✱ | `\| Message \| Origin \| Recovery \|`; what is left half-written |
| Further reading | ✱ | The technical page, the screen, the next step |

- **Length**: observed between 1,450 and 2,100 words; limit 2,200.
- **Example**: `take-over/journey-order/approval` in Acme Orders: 11 execution steps, 4 cases of approval chain (none, single, sequential, by amount), 7 error messages.
- **Common mistakes**: citing a function without its line; leaving out the state left by a failure.

## `troubleshooting` — Troubleshooting by symptom

The "it does not work" entry point: the checks that explain half of the symptoms, then where to look, then one area per sub-page.

| Section | | Content |
|---|---|---|
| In short | ✱ | What this part offers; a HOW box "Three reflexes" |
| The diagram | | Preliminary questions, families of symptoms |
| First of all | ✱ | "First of all: the checks that explain half the symptoms": `\| Check \| Where to look \| What is misleading \|` |
| Where to look | ✱ | Administration screens, audit-log codes, server log prefixes, ready-to-use log queries |
| In this part | ✱ | `\| Sub-page \| Symptoms covered \| Main findings \|` |
| Further reading | ✱ | Findings, journeys, operations |

- **Length**: about 1,450 words on the best site; limit 2,000.
- **Example**: `take-over/troubleshooting` in Acme Orders: 7 checks, 4 log queries, 4 areas (access, approvals, invoices, the assistant).
- **Common mistake**: log queries that were never run. Check every table and column name against the documentation of the logging platform, and date the check.

## `troubleshooting-area` — Troubleshooting area

The symptoms of one area, grouped by the moment of the user's journey when they appear. Each symptom always has the same four entries.

| Section | | Content |
|---|---|---|
| In short | ✱ | 3 to 5 mechanisms that explain almost everything |
| *(families of symptoms)* | | One `##` per moment ("Signing in", "Seeing", "Acting…"); one `###` per symptom, with the exact message in quotes; **Likely causes** (numbered, with proof), **Check**, **Fix**, **Understand** |
| Further reading | ✱ | The parent page, the journeys, the findings |

- **Length**: observed between 1,400 and 1,600 words; limit 2,000.
- **Example**: `take-over/troubleshooting/access` in Acme Orders: "Signing in", "Seeing", "Acting and changing permissions".
- **Common mistake**: a symptom written in the vocabulary of the code instead of the user's words.

## `findings` — Findings

The work list of whoever takes the project over: gaps, risks and debts, re-checked in the code, numbered and ranked. The French name of this page is "Points d'attention".

| Section | | Content |
|---|---|---|
| How to read this page | ✱ | Scope, version checked, sources; the severity table with counts; the numbering rule |
| The essentials in one minute | ✱ | 4 to 6 priority actions, with the numbers of the findings |
| In this part | | One sub-page per family: production (P), critical (C), important (I), minor (M), no effect (N in English, R in French) |
| Findings already fixed | | Findings of earlier audits checked as fixed, with the proof |
| What could not be checked | | The questions to ask the team |
| Existing documentation to stop following | | `\| Document \| State \| Replaced by \|` |

- **Length**: about 1,200 words for the parent page; limit 2,000. The sub-pages are untyped.
- **Format of a finding**:
  - critical: `## C1 — title`, then **Finding**, **Impact**, **Recommendation**;
  - the others: a table `\| No. \| Point \| Where \| Finding and impact \| Recommendation \|`; the production and no-effect families add a **Severity** column.
- **Numbering**: see [writing.md](writing.md#9-numbering-findings). Numbers never change.
- **Example**: `take-over/findings` in Acme Orders and its six sub-pages. Splitting matters here: the same content kept on a single page reached about 10,800 words.
- **Common mistakes**: renumbering the findings (the numbers are cited everywhere); a finding without its `file:line` proof; mixing a defect of the code with a production setting.

## `architecture` — Technical architecture document

The production setup, rebuilt from the cloud console, the infrastructure as code and the code. It does not replace an architecture document validated by the infrastructure team. The French name is "Dossier d'architecture technique (DAT)".

| Section | | Content |
|---|---|---|
| In short | ✱ | 6 to 8 bullets; a NOTE box "How to read this document" (from the console, infrastructure as code, inferred, to be confirmed) |
| In this part | | Sub-pages: network and secrets; data, backup and monitoring |
| The diagram | ✱ | `::diagram`, or the image supplied by the architecture team, annotated as a `:::screen` |
| Numbered flows | ✱ | `\| No. \| From → to \| Protocol \| Authentication \| Data and code \|`; a NOTE box "What the table leaves open" |
| Components | | `\| Component \| Production name \| Role \| Further reading \|` |
| What this document does not show | ✱ | A NOTE box "To confirm with the infrastructure team" |
| Who manages what | ✱ | A PERMISSIONS box "Responsibilities" |

- **Length**: observed between 1,750 words (with two sub-pages) and 2,850 words (without); limit 2,000.
- **Example**: `take-over/technical-architecture` in Acme Orders: 15 flows, 3 of which are missing or do not work.
- **Common mistake**: presenting a value from the infrastructure as code as observed in production.

## `variables` — Environment variables

The variables actually declared on the production service, compared with the code and with the infrastructure as code. Values are never copied.

| Section | | Content |
|---|---|---|
| In short | ✱ | Count, sources, references to the secret vault, missing variables that have an effect; a NOTE box "The sources of this page" |
| The variables, one by one | | One `###` per family; `\| Variable \| Source \| Read by the code \| Role and expected value \| Remark \|` |
| Missing or ineffective | | Variables read but missing; variables set without effect (can be a sub-page) |
| To check | ✱ | `:::steps`: what to look at the next time someone opens the console |

- **Length**: about 1,850 words; limit 2,200.
- **Example**: `take-over/deployment/variables` in Acme Orders: 28 variables, 7 of them references to the secret vault.
- **Common mistake**: putting the count in the heading. "The 28 variables, one by one" does not start with "The variables": the section is no longer found. That is why this section is not required. The count goes in "In short".

## `resources` — Deployment resources

The resources of the production deployment, by family, and what really uses each one. The **group** is the unit that holds the deployment: a resource group on Azure, a project on Google Cloud, an account, a stack or a set of tagged resources on AWS.

| Section | | Content |
|---|---|---|
| In short | ✱ | `\| Family \| Count \| Resources \|`; a NOTE box "Where these resources come from" |
| Compute | ✱ | `\| Resource \| Type \| Role \| Used by \|` |
| Data | ✱ | Databases and storage, including the storage of the infrastructure-as-code state |
| Secrets | ✱ | The vault, its secrets by name |
| Network | | Private endpoints, inbound and outbound traffic |
| Monitoring | ✱ | What each tool really receives |
| Backup | ✱ | What backs up each piece of data, and what does not protect it |
| Comparison with the documentation | | Gaps with the deployment documentation of the repository |
| What the application uses outside this group | ✱ | Identity, gateways, registries, internal services |

- **Length**: about 2,050 words; limit 2,200.
- **Example**: `take-over/deployment/resources` in Acme Orders: 24 resources in 6 families.
- **Common mistake**: listing the resources without saying what uses them. An unused resource that still holds permissions is a finding (production family).

---

# Business space types (ARCHITECTURE.md §6.8)

These 5 types describe **each feature** for the people who use it, decide about it or support it: no code, no
`file:line` proof (see "Business pages cite no code" below). They follow the use case structure of Cockburn
(actors, trigger, main scenario, numbered variants) and the business rules of RuleSpeak (one statement, one
"Given / When / Then" example).

## `feature` — Feature sheet

One feature, end to end, for a business reader: who uses it, when it starts, what it does step by step, and
the rules it enforces. Carries the page's `feature` id (`toc.json`, for example `"feature": "F-01"`) and, where
a technical counterpart exists, its `counterpart`.

| Section | | Content |
|---|---|---|
| Access | ✱ | A two-column table, fixed rows: Module · Who can use it (`[[perm …]]`) · Prerequisites · Checked on (version, date) |
| What it is for | ✱ | The business need in 2 to 4 sentences; the page's title in bold in the first sentence |
| Who uses it | ✱ | One line per role: "**Role**: what they do" |
| Trigger and preconditions | | Optional; delete when the trigger is simply "someone opens the screen" |
| Main scenario | ✱ | `:::steps`; a `:::screen` or `::capture` only when a screenshot makes a step clearer (neither is required here) |
| Variants and exceptions | | Numbered after the step they branch from: "3a. If …" |
| Business rules | ✱ | Rules that belong only to this feature, defined with `:::rule`; a shared rule is only cited with `[[rule …]]` |
| Data handled | | Business data read or changed, named the way a business reader knows it — never a table or column name |
| Notifications and effects | | What the feature sets off beyond the screen: an email, an entry elsewhere, a counter that changes |
| Limits | | What the feature deliberately does not do, in business terms, never a code pitfall |
| Questions people ask | | 2 to 5 real questions, each with a short, direct answer |

- **Length**: limit 2,500 words; most sheets fit well under it — a feature that needs more is usually several
  features, or belongs partly in `process`.
- **Example**: `features/two-step-approval` in Acme Orders: who can raise the threshold, the two approval steps,
  what happens to an order already pending when the chain changes.
- **Common mistakes**:
  - a `file:line` proof slipping in (`business.technical`, warning): move it to the `counterpart`;
  - describing the screen instead of the feature — that duplicate belongs in `screen` or `editor`, cited by a
    link, not retyped here;
  - a feature sheet with no `feature` id (`feature.noId`, warning): `::features{}` and `[[feature …]]` cannot
    find it.

## `business-rules` — Business rules

Every business rule gathered in one place, even though most are **defined** on the feature sheet they belong
to and only **cited** here. Useful once rules are shared across several features, or once a reader wants the
full list without opening every feature sheet.

| Section | | Content |
|---|---|---|
| How to read this page | ✱ | Where a rule's full definition lives (its feature sheet, or here when it has none); the id scheme (`BR-01`…) |
| The rules | ✱ | `::rules{}`: every defined rule, where it is defined, and the features that cite it |
| Rules by feature | | Optional; the same rules grouped by feature instead of listed flat |
| Retired rules | | Optional; a rule removed from the product, kept here so a stale citation elsewhere makes sense |

- **Length**: limit 3,000 words; a generated table (`::rules{}`) stays short regardless of the rule count.
- **Example**: `features/business-rules` in Acme Orders: the approval thresholds, the invoicing cut-off, the
  customer credit limit — each defined once, cited from several feature sheets.
- **Common mistake**: redefining a rule here that is already defined on a feature sheet (`rule.duplicate`,
  error): cite it with `[[rule …]]` instead.

## `roles-matrix` — Roles matrix

The roles of the product and what each one can do, read across every feature at once — the page support opens
first when a user says "I don't see the button".

| Section | | Content |
|---|---|---|
| In short | ✱ | How many roles, and the one rule that explains most of what people cannot do |
| The roles | ✱ | One line per role: who holds it, how it differs from the closest one |
| Who can do what | ✱ | `::roles{}`: a generated table, rows = feature sheets, columns = permissions |
| Responsibilities | | Optional; what a role is accountable for beyond the application itself |
| How to get a role | | Optional; the real process: a form, a manager's approval, an identity-provider group |

- **Length**: limit 2,000 words; the generated table carries most of the content.
- **Example**: `features/roles` in Acme Orders: Sales rep, Approver, Finance, Administrator, each a column of
  `::roles{}`.
- **Common mistake**: a hand-written table that drifts from the feature sheets' own `permissions`; prefer
  `::roles{}`, which is rebuilt from them every time.

## `process` — Process

An end-to-end business process, in business language: who takes part, the steps, what is automatic and what
waits for a person. The business-space equivalent of a `journey`, without the code.

| Section | | Content |
|---|---|---|
| In short | ✱ | The short answer: what triggers the process, and what it produces |
| Who takes part | ✱ | The roles involved, in the order they act |
| The steps | ✱ | `:::steps`, or a table; one step per business action, not per screen click |
| The states | | The named states of the object the process moves through, in business language |
| What happens on its own, and what waits for someone | ✱ | Two lists |
| Deadlines and reminders | | What triggers a reminder, and after how long |
| When it goes wrong | | What a role sees when the process cannot continue, and who to tell |
| Features involved | | Links to the feature sheets this process uses, in order |

- **Length**: limit 2,200 words.
- **Example**: `process/order-to-cash` in Acme Orders: from a sales rep creating an order to Finance recording
  the payment, citing `features/two-step-approval` and the invoicing feature along the way.
- **Common mistake**: describing a single feature instead of the chain of several — a one-feature "process" is
  a `feature` page with a better title.

## `release-notes` — Release notes

What changed, version by version, for the people who use the product rather than the people who built it: no
commit messages, no internal refactors, only what a user or an administrator notices.

| Section | | Content |
|---|---|---|
| In short | ✱ | How far back this page goes, and where to ask about anything older |
| Latest version | ✱ | What changed, in business language, each entry naming the feature it concerns |
| Earlier versions | | One sub-heading per version, newest first |

- **Length**: limit 3,000 words; split into a sub-page per year once "Earlier versions" grows past it.
- **Example**: `process/release-notes` in Acme Orders: "v2.4.0 — Approval chains can now branch by amount
  (see Two-step approval)".
- **Common mistake**: copying the engineering changelog verbatim — rewrite each entry for the reader who never
  sees a commit.

**Business pages cite no code.** A page whose effective space is `business` that still contains a `file:line`
proof gets the warning `business.technical`: move the detail to the page's `counterpart`, the technical sheet
of the same feature.

---

# Takeover space types (ARCHITECTURE.md §6.9, §6.13)

These 12 types form the dossier a team needs to take an application over, especially one written largely by AI
assistants ("vibe-coded"). Every claim is backed by a `file:line` proof, or marked `[[deduced]]` or `[[unknown]]`
(see [writing.md](writing.md)). The last two, `security-review` and `maintainability-review`, are optional
reviews on demand (§6.13): see their own templates (`templates/pages/<language>/security-review.md`,
`maintainability-review.md`) and worked examples for their sections in detail.

## `access-ownership` — Access and ownership

Who holds what, and the concrete steps to actually receive it: the page a handover starts from.

| Section | | Content |
|---|---|---|
| In short | ✱ | Who to contact first for what, and the overall confidence in this map |
| Who owns what | ✱ | One row per asset: domain, repository, hosting, CI/CD, database, payment, e-mail, each AI tool account |
| Secrets and where they live | | Every place a secret is kept — never the value; cross-referenced with `facts/secrets.json` |
| Accounts of the AI tools | | Every AI coding assistant account used on this codebase, who holds it, what access it carries |
| Unknown owners | ✱ | Every asset above whose owner is unknown, repeated so it cannot be missed |
| Handover checklist | | The concrete steps: reset shared secrets, create named accounts, revoke the previous team's access |

- **Length**: limit 2,200 words.
- **Example**: `take-over/access-ownership` in Acme Orders: the production database and the payment provider
  have a named owner; half the CI/CD variables do not.
- **Common mistake**: a confident "Owner: the previous team" with no name and no way to reach them — that is an
  unknown owner, say so.

## `api-surface` — API surface

Every route the application exposes, with a judgement on its authentication, its role check and its tenant
isolation — built from `::facts{source="api"}`, then completed by hand.

| Section | | Content |
|---|---|---|
| In short | ✱ | How many routes, how many are public, the overall state of tenant isolation |
| The routes | ✱ | `::facts{source="api"}`, completed: Method · Route · Authentication · Role · Tenant isolation · Proof |
| Database access rules | | The row-level security policies that back the isolation claimed above, or their absence |
| Public routes | | Every route reachable without authentication, and why |
| Gaps | ✱ | A route with no visible check, cited as a numbered finding |

- **Length**: limit 3,000 words.
- **Example**: `take-over/api-surface` in Acme Orders: 61 routes, 3 public (health check, webhook, the public
  order-tracking page), one gap (`C1`, a route trusting a client-supplied tenant id).
- **Common mistake**: trusting a route's name over its code — a route named `/admin/...` with no role check in
  `api.py` is a gap, not a reassurance.

## `runbook` — Runbook

How to install, build, deploy, roll back and back up the application, read from the actual pipeline and
scripts, never from memory.

| Section | | Content |
|---|---|---|
| In short | ✱ | The one or two commands that install and start the application locally |
| Install | ✱ | Exact commands, versions needed, files they read |
| Build | | Optional; the build command, what it produces, how long it takes |
| Deploy | ✱ | The real deployment path, with the `file:line` of the pipeline definition |
| Roll back | ✱ | How to undo a bad deploy |
| Scheduled jobs | | Every cron job or scheduled task, and what happens when it fails silently |
| Backup and restore | ✱ | Where backups are taken, how often, and the actual restore procedure |
| When it breaks | | First checks for the most frequent incidents |

- **Length**: limit 3,000 words.
- **Example**: `take-over/runbook` in Acme Orders: the pipeline deploys on every push to `main`
  (`[[verified .github/workflows/deploy.yml:1]]`); roll-back redeploys the previous image from the registry.
- **Common mistake**: a "Backup and restore" that only says backups exist — say whether a restore was ever
  actually tested, and when.

## `data-model` — Data model

The tables as the database actually has them, not as an old entity-relationship diagram remembers them, with
an eye on personal data and retention.

| Section | | Content |
|---|---|---|
| In short | ✱ | How many tables, and the overall state of personal-data handling |
| The diagram | | `::diagram`, built or confirmed from `schema.prisma`, SQLAlchemy models or migrations |
| Tables | ✱ | One row or sub-section per table: columns, relations, `file:line` |
| Personal data | ✱ | Which tables and columns hold personal data, and the legal basis if known |
| Retention | | How long each kind of personal data is kept, and what enforces it (a job, nothing yet) |
| Processors | | Third parties that receive personal data (an e-mail provider, an analytics tool) |
| Migrations | | How schema changes are made, and the backlog of pending ones |

- **Length**: limit 2,500 words.
- **Example**: `take-over/data-model` in Acme Orders: 22 tables; customer e-mail and address are personal data
  with no documented retention policy (`M3`).
- **Common mistake**: describing the ORM models instead of the actual database — a migration that was never
  applied in production leaves the two out of sync; say which one you checked.

## `dependencies` — Dependencies

The packages the application actually uses, including the ones that no longer exist — a common and dangerous
finding in AI-generated code (a hallucinated package name, later registered by someone else: supply-chain
risk).

| Section | | Content |
|---|---|---|
| In short | ✱ | How many direct dependencies, and whether any package was checked against the registry |
| Direct dependencies | ✱ | From `facts/dependencies.json`; ecosystem, version, licence when known |
| Packages that do not exist | ✱ | Every dependency `doc-kit facts --network` could not find in its registry — a `C` finding each |
| Licences | | Licences that restrict distribution or require attribution |
| Out of date | | Direct dependencies several major versions behind |
| To check | | Dependencies whose purpose in the code was not obvious |

- **Length**: limit 2,200 words.
- **Example**: `take-over/dependencies` in Acme Orders: 84 direct dependencies; one, imported once, does not
  exist in the npm registry (`C2`).
- **Common mistake**: skipping "Packages that do not exist" because the application runs fine locally — a
  hallucinated package only breaks a *clean* install, which is exactly what a takeover does first.

## `code-map` — Code map

The shape of the codebase at a glance: the containers, what each one is built with, how they call each other —
the C4-style map a new developer draws in their first week, already drawn.

| Section | | Content |
|---|---|---|
| In short | ✱ | How many containers, and the main pattern (a monolith, a front end plus an API, several services) |
| Context | ✱ | `::diagram`: the application and the external systems it talks to |
| Containers | ✱ | One per deployable unit: its stack, its role, what calls it |
| Components | ✱ | Inside the main container(s): the layers and the direction of their calls |
| Integrations | | Every external service called, and what for |
| Duplicated or dead code | | Code that exists twice with drift, or that nothing calls any more |

- **Length**: limit 2,500 words.
- **Example**: `take-over/code-map` in Acme Orders: one Next.js container (screens, API routes, server
  actions) and one scheduled-jobs container sharing the same database.
- **Common mistake**: a components diagram copied from a framework's generic starter — check every arrow
  against an actual import or network call.

## `tests-quality` — Tests and quality

What is actually tested, as opposed to what a test file's name promises — a frequent and costly gap in
AI-generated code (a test that asserts nothing, or that mocks away the behaviour it claims to check).

| Section | | Content |
|---|---|---|
| In short | ✱ | How many tests, and the overall coverage figure if one exists |
| What is tested | ✱ | From `facts/tests.json`: files, counts, coverage report if any |
| Critical flows | ✱ | The flows that matter most, and whether each one has a real test |
| Tests that test nothing | | A test that always passes, asserts nothing, or mocks the very thing it claims to check |
| How to run them | ✱ | The exact command, and what a clean run looks like |

- **Length**: limit 2,200 words.
- **Example**: `take-over/tests-quality` in Acme Orders: 340 tests, 61 % statement coverage; the approval-chain
  test suite mocks the approval service itself, so it tests nothing about approval (`I9`).
- **Common mistake**: quoting a coverage percentage without having run the suite — a stale badge in a README is
  not a measurement.

## `agent-instructions` — Agent instruction files

Every instruction file an AI coding assistant reads (`AGENTS.md`, `CLAUDE.md`, a `.cursorrules` file…), rule by
rule, checked against what the code actually does — these files act as a hidden specification, and often drift
from the code they were meant to steer.

| Section | | Content |
|---|---|---|
| In short | ✱ | How many instruction files, their overall size, whether anything hidden was found |
| The files | ✱ | `::facts{source="agents"}`: one row per file, its size |
| Each rule | ✱ | One row per stated rule: its status once checked — confirmed, obsolete, contradicted |
| Hidden characters | ✱ | Any character invisible to a human reviewer, found inside an instruction file — a known prompt-injection trick |
| What to keep | | Once every rule has a status, what to fold into this documentation, what to drop |

- **Length**: limit 2,500 words.
- **Example**: `take-over/agent-instructions` in Acme Orders: one `CLAUDE.md`, 340 words; one rule ("always
  filter by tenant") contradicted by one route (`C1`, also listed on `api-surface`).
- **Common mistake**: treating the instruction file as documentation instead of auditing it — a rule the code
  no longer follows is a finding, not a fact.

## `adr` — Architecture decision record (ADR)

One reconstructed decision, in the classic ADR shape, for a choice the code reveals but nobody wrote down — a
sub-page of the `technical` or `architecture` page it concerns.

| Section | | Content |
|---|---|---|
| Status | ✱ | Proposed, accepted, superseded — as best as it can be told after the fact |
| Context | ✱ | The problem the decision answers, as the code and the commit history suggest |
| Decision | ✱ | What was chosen |
| Consequences | ✱ | What it made easier, harder, or impossible later |
| How it was reconstructed | ✱ | Which code, commits or people this page is built from |

- **Length**: limit 1,500 words; an ADR that grows past it is usually two decisions.
- **Example**: `take-over/architecture/adr-01-database` in Acme Orders: why a single shared database serves
  every tenant (row-level security, not a database per tenant) — reconstructed from the migrations and one
  surviving pull request description.
- **Common mistake**: presenting a guess as the decision — say plainly when "How it was reconstructed" is
  "inferred from the code alone, nobody confirmed it".

## `threat-model` — Threat model

The STRIDE threats of the application, organised by the trust boundaries of its data flow diagram — the
takeover dossier's security centrepiece.

| Section | | Content |
|---|---|---|
| In short | ✱ | How many trust boundaries, and the overall confidence in this model |
| The data flow diagram | ✱ | `::diagram`: actors, processes, data stores, trust boundaries |
| Trust boundaries | ✱ | Each boundary crossed by the diagram, and what is supposed to guard it |
| Threats | ✱ | STRIDE, grouped by trust boundary; each with a severity and a cause |
| Mitigations | | What actually guards against each threat today, with its proof |
| Accepted risks | | A threat the owner decided to accept, with who decided and when |

- **Length**: limit 3,000 words.
- **Example**: `take-over/threat-model` in Acme Orders: 4 trust boundaries; the browser-to-API boundary has an
  unmitigated tampering threat on the order total (`C3`, also on `api-surface`).
- **Common mistake**: a generic STRIDE table copied from a template, with no boundary and no proof — every row
  needs the actual diagram edge it threatens.

---

## Untyped pages

Not every page has a template. Do not declare `template` for:
- a sub-page of a screen or of an editor;
- a findings sub-page (it follows the finding format above);
- a page of concepts, a catalogue or an appendix.

`adr` is the one sub-page type that **is** typed, even though it sits under a `technical` or `architecture`
parent: each decision record is checked against its own required sections, independently of its parent's.

## Heading variants

The build recognises a section by the start of its heading. A few variants are accepted as **aliases** (`aliases` in `templates.json`), because they were frequent on real sites:

| Label | Accepted variants |
|---|---|
| "What it is for" | "What it's for", "What this screen is for", "What this editor is for" |
| "Pitfalls and limits" | "Pitfalls", "Known limits" |
| « À quoi ça sert » | « À quoi sert » (« À quoi sert l'écran », « À quoi sert cet onglet ») |
| « Pièges et limites à connaître » | « Pièges et limites », « Pièges » |

Other variants are not recognised: "Reference" alone instead of "Settings reference", "In short" instead of "How to read this page" on a findings page, a count at the start of a heading. Before you declare `template` on an existing page, rename the heading (and fix the anchors that pointed to it), or leave the page untyped.
