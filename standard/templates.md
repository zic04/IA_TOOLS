# Page templates

A template sets the `##` sections of a page type, their order and the page's maximum length. There are 13 types. The machine-readable version is [templates.json](templates.json); the ready-to-fill pages are in `templates/pages/en/<type>.md` and `templates/pages/fr/<type>.md`.

The type ids are English in every project: `screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`. The section labels follow the language of the project.

## How the build uses them

- A page declares its type in `content/toc.json`: `{ "id": "use/orders/list", …, "template": "screen" }`.
- The build then checks its **required sections**. A section is found when a `##` heading of the page **starts with** its label, or with one of its aliases, ignoring case and accents. "Step by step: approve an order" matches "Step by step".
- A missing required section is a **blocking error** of the strict build. The other sections of the template are recommended: `doc-kit audit` measures how many are present.
- `maxWords` is a `doc-kit audit` **warning**: beyond it, split the page into sub-pages.
- `doc-kit new <page-id> --template <type>` creates the page from the template, in the language of the project.
- The guidance left in a page (`<!-- guidance: … -->` in English, `<!-- consigne : … -->` in French) is reported by `doc-kit audit` and by the strict build. Write the section, then remove its guidance.
- The `en` and `fr` label lists have the same length and the same order. `required` holds positions in these lists, so it is the same in both languages.

A worked example of each type, written for Acme Orders, is listed under `example` in `templates.json`.

Legend of the tables below: **✱** = required.

## Overview

| Type | Section | Purpose | Required | `maxWords` | Example page (Acme Orders) |
|---|---|---|---|---|---|
| `screen` | Use, Administer | A screen and its actions | 5 | 2,500 | `use/orders/list` |
| `editor` | Configure | An editor and the mechanism it drives | 6 | 3,000 | `configure/approvals/approval-chains` |
| `recipe` | Configure | A goal reached by chaining several editors | 5 | 3,500 | `configure/recipes/two-step-approval` |
| `technical` | Take over | A technical topic (parent or standalone page) | 1 | 2,000 | `take-over/security` |
| `technical-sub` | Take over | The detail of a technical topic | 0 | 2,000 | `take-over/security/sign-in` |
| `journey` | Take over | What happens from end to end | 5 | 2,000 | `take-over/journey-order` |
| `journey-step` | Take over | One step of a journey | 5 | 2,200 | `take-over/journey-order/approval` |
| `troubleshooting` | Take over | From the symptom to the cause | 5 | 2,000 | `take-over/troubleshooting` |
| `troubleshooting-area` | Take over | The symptoms of one area | 2 | 2,000 | `take-over/troubleshooting/access` |
| `findings` | Take over | The numbered findings | 2 | 2,000 | `take-over/findings` |
| `architecture` | Take over | The production setup | 5 | 2,000 | `take-over/technical-architecture` |
| `variables` | Take over | The environment variables | 2 | 2,200 | `take-over/deployment/variables` |
| `resources` | Take over | The deployment resources | 7 | 2,200 | `take-over/deployment/resources` |

---

## `screen` — Screen page

A screen of the application, seen by the person who uses it: what it is for, how it works, every element annotated, the pitfalls, the permissions.

| Section | | Content |
|---|---|---|
| What it is for | ✱ | The business need in 2 to 4 sentences; a NOTE box "Where to find this screen" (`[[menu …]]`, `[[route …]]`) |
| How it works | ✱ | The real mechanism: server or browser, order, limits; a HOW box; a table when there are several cases |
| The screen | ✱ | One `:::screen` capture per panel; the legend has one item per zone, 1 to 3 sentences each |
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
| The screen | ✱ | One `:::screen` capture per panel or dialog |
| What it changes | | `::before-after`, or a capture of the user screen it affects |
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

## Untyped pages

Not every page has a template. Do not declare `template` for:
- a sub-page of a screen or of an editor;
- a findings sub-page (it follows the finding format above);
- a page of concepts, a catalogue or an appendix.

## Heading variants

The build recognises a section by the start of its heading. A few variants are accepted as **aliases** (`aliases` in `templates.json`), because they were frequent on real sites:

| Label | Accepted variants |
|---|---|
| "What it is for" | "What it's for", "What this screen is for", "What this editor is for" |
| "Pitfalls and limits" | "Pitfalls", "Known limits" |
| « À quoi ça sert » | « À quoi sert » (« À quoi sert l'écran », « À quoi sert cet onglet ») |
| « Pièges et limites à connaître » | « Pièges et limites », « Pièges » |

Other variants are not recognised: "Reference" alone instead of "Settings reference", "In short" instead of "How to read this page" on a findings page, a count at the start of a heading. Before you declare `template` on an existing page, rename the heading (and fix the anchors that pointed to it), or leave the page untyped.
