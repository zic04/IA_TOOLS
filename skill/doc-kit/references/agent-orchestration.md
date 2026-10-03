# Agent orchestration

How to split the work, who writes what, how to launch agents in waves and how to consolidate their reports. The
orchestrator (the main session) hardly writes pages: it prepares, launches, consolidates and checks.

## 1. Batches, codes and prefixes

A **batch** = a short code, a capture prefix, a list of pages, one capture plan file. Two batches never share a page
or a prefix: the engine refuses the same capture id in two plans.

**Example: Acme Orders, 8 writing batches, captures in production**

| Code | Pages | Capture prefix | Plan |
|---|---|---|---|
| `u1` to `u4` | the Use section, split in 4 (getting started, orders, customers, invoices) | `u1-…` to `u4-…` | `captures/plans/u1.mjs` … `u4.mjs` |
| `cf` | the Configure section (approval chains, templates, dashboards) | `cf-…` | `cf.mjs` |
| `a1` | Administer: access, reference data, system | `a1-…` | `a1.mjs` |
| `a2` | Administer: the AI assistant | `a2-…` | `a2.mjs` |
| `t` | Take over (technical pages) | `t-…` | `t.mjs` |

Then, without captures: journeys `inv` (an invoice to its payment reminder), `ast` (a question to the assistant),
`acc` (a user account), `fig` (a dashboard figure), and `tbl` (troubleshooting); before them, the fact sheets A and B
of the reference journey `ord` (an order from creation to archiving).

Another organisation that worked (site B): prefixes by application area (`map-…`, `bar-…`, `dash-…`, `admin-…`), 11
plans, plus a separate production plan with its own prefix.

**With a business space**: add `functional-spec` batches (codes `fs1`, `fs2`…), each a group of `features.json`
entries and the pages they produce (feature sheets, plus the shared `business-rules`, `roles-matrix` and
`process` pages, usually their own small batch since they are not tied to one feature). **With a takeover
space**: `code-health` is one batch of its own (it judges `api-surface`, `dependencies`, `agent-instructions`,
`tests-quality` and `threat-model` together, so that one reviewer keeps a consistent view of the facts); so are
`access-ownership` and `system-dossier` (`runbook`, `data-model`, `code-map`, `adr` together). None of the three
splits further: keeping each whole is cheaper than reconciling two agents' views of the same facts afterwards.

**Batch size**: on a real 99-page plan with 213 captures, 8 batches gave 10 to 15 pages and 20 to 35 captures per
agent. Group pages that share screens (an editor and its usage page), and isolate heavy domains (the AI assistant had a
batch of its own).

## 2. Reserved files and central management

| Who | Writes | Does not touch |
|---|---|---|
| Batch writer (`writing-batch`) | `content/<id>.md` of its pages; `<plans>/<code>.mjs`; `diagrams/<prefix>-*.svg`; review images `.doc-kit/<code>-*.png` (deleted at the end) | everything else |
| Functional-spec writer | `content/<id>.md` of its feature/business-rules/roles-matrix/process pages | `features.json` (reads only), code, everything else |
| Journey writer | its pages, its diagram, its fact sheet `.doc-kit/<code>.md` when asked | everything else, even to fix an error |
| Findings verification | the findings page and its sub-pages (now a risk register with Owner/Decision/Status/Due) | other pages, glossary, toc |
| Page corrections | the pages cited by the consolidation (except findings); `content/glossary.json` | findings, toc |
| Code-health reviewer | its takeover pages (`api-surface`, `dependencies`, `agent-instructions`, `tests-quality`, `threat-model` — only those assigned); its diagram | `facts/*.json` (reads only), the application, everything else |
| Access-ownership writer | the `access-ownership` page | `facts/*.json` (reads only), everything else |
| System-dossier writer | its pages (`runbook`, `data-model`, `code-map`, `adr` — only those assigned); its diagram | `facts/*.json` (reads only), everything else, no git command |
| Production technical | architecture document, deployment, resources, variables pages; their diagram | everything else |

**Centrally managed** (orchestrator only): `content/toc.json`, `content/glossary.json`, `features.json` (unless
explicitly delegated to the corrections agent), `content/home.md`, `doc.config.mjs`, `WRITING-GUIDE.md`,
`captures/targets.mjs`, `facts/*.json` (written only by `doc-kit facts`), `sync.json` (written only by
`doc-kit sync --mark`), the engine (the kit, never changed by a writing agent), and the commands that write these
files or touch access: `doc-kit new`, `doc-kit connect`, `doc-kit demo`, `doc-kit facts`. No agent runs a git
command.

Why: agents work at the same time; two concurrent writes of a shared file lose one agent's work. Anything that touches
a central file comes back through the **report** ("proposed glossary terms", "summary of a page to change").

## 3. Waves

| Wave | Agents in parallel | Start condition |
|---|---|---|
| 0 | `doc-kit facts` (orchestrator, no agent) | `init` + `doctor` green |
| 1 | inventory (1 Explore) | facts generated |
| 2 | reference page(s) (orchestrator, or 1 agent per space) | toc written |
| 3 | all writing batches: `writing-batch` and `functional-spec`, business and takeover together (example: 8) | reference page(s) approved, captures tried |
| 4 | findings verification + page corrections (2) | reports of wave 3 consolidated |
| 5 | fact sheets of the reference journey (2), then its pages | — |
| 6 | other journeys + troubleshooting (example: 5) | reference journey written |
| 7 | 2nd consolidation (2) | reports of wave 6 |
| apart | `code-health`, `access-ownership`, `system-dossier`, `production-technical` (each its own agent) | facts generated (the first three) or portal screenshots received (production-technical); disjoint files, so each can join any wave |

- Translations (ARCHITECTURE.md §6.12, brief `translate`): one agent per batch of at most 6 pages, all of the
  same target language (never mixed); each batch can join any wave once its pages are written.
- Agents run in the background; you are notified when they finish, no need to poll. Paste each report into the
  consolidation file as soon as it arrives.
- In production the platform is shared: each agent captures in small runs (3 to 8 per command). Zones are written to
  one file per capture (`images/zones/<id>.json`), which allows simultaneous captures.
- An instruction discovered during a wave (a page that writes when rendered…) is added to the brief **and** sent to the
  running agents.

**Launching an agent**: the type named in the brief's own front matter (`agent: <type>`), also printed by
`brief.mjs` after it writes the file — `doc-kit-writer` for writing and updating, `doc-kit-reviewer` for the
inventory, the verification of findings and the production dossier, `doc-kit-triage` for the maintenance `triage` brief (ARCHITECTURE.md §6.11, "Economy of the
agents"). Typical message:

```
Read <docDir>/.doc-kit/brief-writing-batch-u1.md and carry it out in full.
Your final report follows the format asked at the end of the brief.
```

**Economy**: before launching a wave, `node scripts/brief.mjs <template> --project <docDir> --var …… --estimate`
for each of its briefs gives input and output tokens and the cost (`llm.prices` in `doc.config.mjs`); after each
agent ends, `node scripts/usage.mjs log --brief … --agent … --model … --tokens <n> --tools <n> --duration <ms>
--pages a,b --phase <n>` from what Claude Code reports, so `usage.mjs report` can total the wave and compare it
with the estimate. Agents of the same wave share a brief template's common part byte for byte (prompt cache).

## 4. Brief placeholders

`node scripts/brief.mjs <template> --project <docDir> [--lang en|fr] [--var key=value]… [--output <file>]`.
Precedence: `--var` > `extra.briefs.<key>` of `doc.config.mjs` > value derived from the config > empty (reported, exit 1).
`--var key=@path` reads the value from a file (a multi-line value becomes a bullet list). `--vars` shows a template's
placeholders and their values; `--list` lists the templates. Default output: `.doc-kit/brief-<template>-<code>.md`
(without `-<code>` when `code` is not given). `--lang` picks the brief's language; agents always write in the site's
`language`.

| Placeholder | Default source | Example |
|---|---|---|
| `product`, `slug` | `product.name`, `product.slug` (else derived from the name, as the kit does) | Acme Orders, acme-orders |
| `language`, `languageName` | `language` (name written in the brief's language) | en, English |
| `appUrl` | `DOC_KIT_URL` or `<PREFIX>_URL` when set (same precedence as the CLI), else `app.url` | http://localhost:3000 |
| `envPrefix` | `env.prefix` (else the slug in upper case, as the kit does) | ACME |
| `docDir` | documentation folder (absolute) | …/acme-orders/docs/manual |
| `appDir` | `extra.briefs.appDir`, else `app.dir` (written by `doc-kit init`: the application root), else the documentation folder's parent or grandparent that holds `.git`, else its grandparent. `brief.mjs` warns when it was derived, and when the coverage source sits in a separate front end (`frontend/` with its own `package.json`): the routes inventory then misses the back end | …/acme-orders |
| `plansDir` | `capture.plans` | captures/plans |
| `kitPath` | the kit's location | (set at install) |
| `version`, `date` | `version` of the config (else the app's `package.json`); today | 2.3.1; 2026-10-01 |
| `contentDir`, `imagesDir`, `diagramsDir`, `factsDir` | `paths.*` (`factsDir` default `facts`) | content, images, diagrams, facts |
| `featuresFile` | the `features` coverage adapter's `file` option, else `features.json` | features.json |
| `tocFile`, `glossaryFile`, `targetsFile`, `guideFile` | the existing file (legacy names detected) | content/toc.json |
| `findingsPage` | `extra.briefs.findingsPage`, default by language | take-over/findings |
| `consolidationFile` | `.doc-kit/consolidation.md` | |
| `captureMode` | `none` when `capture.mode` is `"none"`, `production` when `capture.target` is `"production"`, `demo` when it is `"demo"` or `capture.setup` is set, else to give | production · demo · none |
| `screenshots` | `capture.mode` (`app` or `none`): with `none`, "The screen" is a table of elements, never a `:::screen` | app · none |
| `code`, `prefix` | `--var` (`prefix` defaults to `code`) | u1 |
| `pages`, `reads`, `topic`, `diagram` | `--var` | page ids, pages to read, "the journey of an order", t-order-journey |
| `portalCaptures`, `infraDir` | `--var` (`production-technical` brief) | folder of screenshots, infrastructure code |
| `description`, `stack`, `labels`, `referencePage` | `extra.briefs` | "order management", "Next.js App Router, Prisma", `messages/en.json`, `configure/approvals/chains` |
| `otherWriters`, `productionNotes`, `dataPolicy`, `factSheet`, `referenceJourney` | `--var` or `extra.briefs` (optional) | "inv, ast, tbl"; "open no order other than…"; "fictitious customers only"; yes; take-over/order-journey |

Conditional blocks in templates: `{{#if key}}…{{/if}}` (non-empty value), `{{#if key=value}}…{{/if}}`,
`{{#if key!=value}}…{{/if}}`, nestable. An empty placeholder outside a discarded block is reported and the script
exits with code 1 (the file is written anyway).

## 5. Consolidation

1. `node scripts/consolidation.mjs init --project . --codes ord,inv,ast,acc,tbl` (or
   `--codes "ord=Journey of an order,inv=Journey of an invoice"`) creates `.doc-kit/consolidation.md` (`--output` for
   another name) with one section per writer.
2. Paste in each section, from the report: **Candidate findings** (proposed severity, finding, `file:line`, link to an
   existing finding), **Errors in existing pages** (file, sentence, proof), **Proposed glossary**.
3. `node scripts/consolidation.mjs duplicates --project .` lists the candidates citing the same `file:line` (same file,
   overlapping line ranges; a bare `` `:585` `` after a file means "same file") and the existing findings already citing
   these lines. Write the decision under "Duplicates found": `acc 8 = tbl 1` (merge), `acc 4 ≈ tbl 4` (related),
   "severity to settle".
4. Two agents in parallel, disjoint files: `findings-verification` and `page-corrections`.
5. The orchestrator: strict build; carries the new numbers into the pages that discuss them (the "Surprises to know
   about" of journeys); updates counters quoted elsewhere (home page, maintaining-the-docs page).

Decision rules:
- Two candidates citing the same line for the same cause: **one finding**, proofs combined, highest severity unless
  proven otherwise.
- A candidate that "completes I14" enriches I14 instead of taking a number.
- A candidate marked "inferred" stays marked "inferred" in the finding.
- Every candidate has a written outcome: integrated (number), merged (with what), rejected (proof).

## 6. A report that contradicts a page

Neither the report nor the page is authoritative: **the code decides**, and for a production fact, a capture or the
owner.
- The report is right: the corrections agent fixes the sentence, as narrowly as possible, and cites the proof.
- The page is right: nothing changes; the rejection and its proof appear in the corrections report.
- A production fact that the code cannot settle: find the capture that shows it. Real case: a journey writer showed in
  the code that enabling the assistant's web search changed how confidential context was computed, which contradicted
  an existing production finding; the consolidation asked to check, on the existing capture of the production
  assistant screen, whether web search was enabled; it was, and the verification agent corrected the finding.
- Two reports that contradict each other: the verification agent re-reads the code and keeps the proven version.

## 7. Splitting a page that is too long

Beyond about 2,000 words (each template sets its own limit; `doc-kit audit` lists the pages over it), split into
sub-pages. It is a central operation, because it changes the toc.
1. Declare each sub-page in `content/toc.json`, right after its parent, with `"level": 2` and an id that extends the
   parent's (`take-over/security/sign-in`).
2. Move the `##` sections into `content/<id>.md`; the parent keeps the overview and an **In this part** section (table
   "Sub-page / What you will find there").
3. Rewrite anchor links (`#/id~anchor`) that target a moved section; replace with a link any "below" or "above" that now
   points to another page. The build reports any anchor it cannot find.

On site A, 37 sub-pages were created this way in one pass, with a script that moved the sections and rewrote the links.

## 8. The cost of an agent, and the step budget

**Model**: an agent's cost ≈ its number of round-trips × its context size. Cache reads dominate — each round-trip
re-reads the whole context accumulated so far, so a wave that shares a brief's common part byte for byte
(§4) still pays for every round-trip's growing history. A context folder (ARCHITECTURE.md §6.11) cuts what one
read costs; it does not by itself cut how many reads an agent takes. **The step budget is the main lever**: how
many extra reads an agent allows itself beyond the context file and the page's own template, how many times it
runs a build, whether it reviews a screenshot mid-way.

Measured on a real application (FastAPI + Next.js, 81 pages): nine admin screen pages, one `writing-batch` agent
per page, three methods compared.

| Method | Avg. cost (token-equivalent) | Round-trips | Duration | Conformant |
|---|---|---|---|---|
| Old brief: writing guide + reference page + full inventory + free exploration + repeated checks | 1,039,000 | 47 | 13.6 min | 3/3 |
| + a context folder, same free exploration | 890,000 (−14 %) | 42 | 11.4 min | 3/3 |
| **Sober**: context folder + template only, at most 3 targeted reads, the page written once, one build, `view` only with screenshots | **323,000 (−69 %)** | **21** | **7 min (−49 %)** | 3/3 |

("Token-equivalent" cost: input × 1 + cache write × 1.25 + cache read × 0.1 + output × 5 — cache reads are cheap
per token, but there are far more of them per round-trip than any other kind.) The context folder alone bought
14 %; the step budget bought the rest. Conformance to the standard did not move: fewer steps did not mean fewer
checks, only fewer *exploratory* ones.

**The rule**: an agent that would exceed its step budget stops and says so in its report (what it still needed),
rather than exploring further to resolve it itself. `writing-batch` and `update` (ARCHITECTURE.md §6.11) apply
this: at most 3 extra reads per page for a writer, at most 1 for an updater.
