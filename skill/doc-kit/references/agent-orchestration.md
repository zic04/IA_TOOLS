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

**Batch size**: on a real 99-page plan with 213 captures, 8 batches gave 10 to 15 pages and 20 to 35 captures per
agent. Group pages that share screens (an editor and its usage page), and isolate heavy domains (the AI assistant had a
batch of its own).

## 2. Reserved files and central management

| Who | Writes | Does not touch |
|---|---|---|
| Batch writer | `content/<id>.md` of its pages; `<plans>/<code>.mjs`; `diagrams/<prefix>-*.svg`; review images `.doc-kit/<code>-*.png` (deleted at the end) | everything else |
| Journey writer | its pages, its diagram, its fact sheet `.doc-kit/<code>.md` when asked | everything else, even to fix an error |
| Findings verification | the findings page and its sub-pages | other pages, glossary, toc |
| Page corrections | the pages cited by the consolidation (except findings); `content/glossary.json` | findings, toc |
| Production technical | architecture document, deployment, resources, variables pages; their diagram | everything else |

**Centrally managed** (orchestrator only): `content/toc.json`, `content/glossary.json` (unless explicitly delegated to
the corrections agent), `content/home.md`, `doc.config.mjs`, `WRITING-GUIDE.md`, `captures/targets.mjs`, the engine
(the kit, never changed by a writing agent), and the commands that write these files or touch access: `doc-kit new`,
`doc-kit connect`, `doc-kit demo`. No agent runs a git command.

Why: agents work at the same time; two concurrent writes of a shared file lose one agent's work. Anything that touches
a central file comes back through the **report** ("proposed glossary terms", "summary of a page to change").

## 3. Waves

| Wave | Agents in parallel | Start condition |
|---|---|---|
| 1 | inventory (1 Explore) | `init` + `doctor` green |
| 2 | reference page (orchestrator, or 1 agent) | toc written |
| 3 | all writing batches (example: 8) | reference page approved, captures tried |
| 4 | findings verification + page corrections (2) | reports of wave 3 consolidated |
| 5 | fact sheets of the reference journey (2), then its pages | — |
| 6 | other journeys + troubleshooting (example: 5) | reference journey written |
| 7 | 2nd consolidation (2) | reports of wave 6 |
| apart | production technical (1) | portal screenshots received; disjoint files, so it can join any wave |

- Agents run in the background; you are notified when they finish, no need to poll. Paste each report into the
  consolidation file as soon as it arrives.
- In production the platform is shared: each agent captures in small runs (3 to 8 per command). Zones are written to
  one file per capture (`images/zones/<id>.json`), which allows simultaneous captures.
- An instruction discovered during a wave (a page that writes when rendered…) is added to the brief **and** sent to the
  running agents.

**Launching an agent**: a general agent (able to write) for writing, Explore for the inventory. Typical message:

```
Read <docDir>/.doc-kit/brief-writing-batch-u1.md and carry it out in full.
Your final report follows the format asked at the end of the brief.
```

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
| `appDir` | `extra.briefs.appDir`, else the first folder with `package.json` or `.git` above the coverage source (`app`, `file`, `source` or `base` of `coverage[]`), else above the documentation folder | …/acme-orders |
| `plansDir` | `capture.plans` | captures/plans |
| `kitPath` | the kit's location | (set at install) |
| `version`, `date` | `version` of the config (else the app's `package.json`); today | 2.3.1; 2026-10-01 |
| `contentDir`, `imagesDir`, `diagramsDir` | `paths.*` | content, images, diagrams |
| `tocFile`, `glossaryFile`, `targetsFile`, `guideFile` | the existing file (legacy names detected) | content/toc.json |
| `findingsPage` | `extra.briefs.findingsPage`, default by language | take-over/findings |
| `consolidationFile` | `.doc-kit/consolidation.md` | |
| `captureMode` | `demo` when `capture.setup` is set, else to give | production · demo · none |
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
