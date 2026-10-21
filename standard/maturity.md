# Maturity levels

Four levels, each defined by criteria that `doc-kit audit` **measures**. A level is reached when all its criteria, and all the criteria of the levels below it, are met.

With spaces declared (`content/toc.json`, ARCHITECTURE.md §6.1a), the level is also measured **per space**:
see "Level by space" below. Without spaces, nothing in this file changes.

| Level | Name | In one sentence |
|---|---|---|
| 1 | **Skeleton** | The site builds, and each section has its first page |
| 2 | **User** | A user finds every screen, annotated |
| 3 | **Complete** | Everything is written, covered, typed and conformant; the strict build passes |
| 4 | **Takeover** | A team that does not know the project can take it over: architecture, journeys, troubleshooting, findings, proofs |

## The indicators

`doc-kit audit` computes the indicators below. They appear under these names in `.doc-kit/audit.json` and with `--json`.

**A written page** is a declared page whose file exists and holds no template guidance (`<!-- guidance:` or `<!-- consigne :`). A declared page is in exactly one state:

| State | What it means | Counted by |
|---|---|---|
| Missing | Declared in `toc.json`, no file yet | `written` only |
| Draft | Its file still holds template guidance (a skeleton of `init` or `doc-kit new`) | `written` only |
| Written | File present, no guidance left | every page indicator |

**Who counts what.** `written` owns the pages not written yet: the other page indicators are measured on the written pages only, and a page not written yet is never counted twice. Its sections, the examples of its template (a sample finding `C1`, a sample proof, a sample `:::screen`) and its build errors wait until it is written. The audit summary says how many pages remain to write: "Pages: 1 written of 81 — 80 to write (72 without a file, 8 still in template guidance)".

| Indicator | Formula |
|---|---|
| `written` | Written pages ÷ declared pages. The report adds the pages without a file and the drafts |
| `typed` | Pages that declare a `template` ÷ declared pages (a declaration of the plan: written or not) |
| `conformant` | Written typed pages that have all their required sections ÷ written typed pages |
| `completeness` | Average, over the written typed pages, of (sections of the template present ÷ sections of the template) |
| `annotated` | Written `screen` and `editor` pages that contain at least one `:::screen` (or `:::ecran`) ÷ written `screen` and `editor` pages. While no page is typed: the written pages other than the takeover pages (below). `n/a` when `capture.mode` is `"none"`: a documentation declared without screenshots describes its screens with tables, and has nothing to annotate |
| `coverage` | Elements cited by the written pages ÷ elements inventoried by `doc-kit check coverage`; not measured when no adapter can inventory the application. The entry of a page not written yet (its `routes`) covers nothing: the report shows apart the coverage of the plan, "with the pages not written yet" |
| `proofs` | Written takeover pages (below) that contain at least one `file:line` proof (a file name with its extension, then `:` and a number, in backticks: `lib/orders.ts:42`), outside comments ÷ written takeover pages |
| `takeover` | Number of the 7 required takeover pages that are written (see below) |
| `tooLong` | Written pages beyond their `maxWords` (2,000 when untyped) ÷ written pages. Words are counted in the Markdown, without code blocks, comments, URLs and markup |
| `guidance` | Template text left outside the page bodies: written pages whose summary is still the placeholder of `doc-kit new`, plus the home page and the section introductions (`<section>/index.md`) that still hold guidance |
| `upToDateCaptures` | Zone files whose `version` is the current version of the application ÷ zone files that carry a `version`; `n/a` when none does |
| `upToDatePages` | Marked pages (`sync.json`, ARCHITECTURE.md §6.10) whose `version` is the current version of the application ÷ written pages; `n/a` without `sync.json` |
| `glossary` | Number of glossary terms |
| `tours` | Number of home-page guided tours (`journeys` in `toc.json`) |
| `blocking` | Strict build errors outside the pages not written yet + elements cited by no page, not even by the entry of a page not written yet (when `coverage` is measured) + secrets found by `doc-kit check secrets` (see [quality.md](quality.md)). The errors of the pages not written yet (`page.missing`, the errors of a draft) are shown next to it, counted by `written` |
| `wideTables` | Tables that overflow at 1,440 px (every page is opened in the browser); not measured without a browser, or with `DOC_KIT_NO_BROWSER=1` |
| `featureSheets` | Written feature sheets (a page with `feature` in `toc.json`) that hold at least one user story (`:::story`) ÷ written feature sheets (see "The depth of the feature sheets") |
| `scenarios` | User stories of the written feature sheets that have acceptance criteria — a `:::scenario` naming them (`story="US-01"`) ÷ those user stories |
| `behaviourDepth` | Rubrics of the behaviour cards of the written feature sheets that are answered — a value, or an explicit `n/a — why` — ÷ their rubrics (`unknown — question`, or a rubric left out, is not answered); `n/a` without a card |

**The takeover pages** are the pages the takeover dossier is judged on: `proofs` is measured on them, `written`
at level 2 (`written2`) leaves them out, and the claims (below) are counted in them.

- **Without spaces**, they are the pages of the **Take over** section: the section whose id is `take-over` (or
  `reprendre`); otherwise, the last section of the plan, when the plan has at least two.
- **With spaces declared**, their kind decides (`standard/spaces.json`): they are the pages whose effective
  space is of a kind that expects `file:line` proofs — the Develop space, or a space of the project's own
  declared with `"kind": "develop"`. The pages of the Administer space are not takeover pages, not even those
  of its Operate part.

**The 7 required takeover pages**, counted by `takeover` among the written pages, never a draft or a page without its file, which the report names as the page to write (a sub-page is a `"level": 2` page that follows its parent in the same group). Without spaces, they are looked for in the Take over section. With spaces, the project's `takeover` looks for each in the pages of every space whose kind holds takeover pages (Administer, Develop); each belongs to the space whose kind holds it (last column) — two to the Administer space, the five others to the Develop space —, whose own level counts it among its pages, and a missing one is suggested in the usual part of that space ([structure.md](structure.md): Operate, Understand, Risks, Maintain), else in its section that already holds a page of that type, else in its first section. The dossier's own section (`takeoverSection` in `audit.json`) is the first section of the Develop space, else of the first space holding takeover pages; a required page that no declared space holds (the technical architecture document of a project that declares `["use", "develop"]`) is suggested there. When no declared space holds any (`["use", "product"]`, for example), the report asks first for a section in a space of the `develop` or `admin` kind (`takeover.noSection`).

| # | Page | Measured criterion | With spaces, looked for in |
|---|---|---|---|
| 1 | Architecture overview | A page whose id ends with `/architecture` | Develop |
| 2 | Technical architecture document | A page with `"template": "architecture"` | Administer |
| 3 | End-to-end journey | A `journey` page followed by at least 3 `journey-step` sub-pages | Develop |
| 4 | Operate | A page whose id contains `operations`, `deployment`, `exploitation` or `deploiement` | Administer |
| 5 | Troubleshooting by symptom | A `troubleshooting` page followed by at least 2 `troubleshooting-area` sub-pages | Develop |
| 6 | Findings | A `findings` page, and at least one numbered finding (`C1`, `I1`, `M1`, `P1`, `N1` or `R1`…) in it or in its sub-pages | Develop |
| 7 | Maintaining the docs | A page whose id ends with `/maintaining-docs` or `/maintenir-doc` | Develop |

## The criteria of each level

| Level | Criteria |
|---|---|
| **1 Skeleton** | `doc.config.mjs` is valid · `doc-kit build --draft` succeeds · each section has at least 1 page with its file (a draft counts: this is the skeleton) · `home.md` exists · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 User** | `written` ≥ 90 % outside the takeover pages · `annotated` ≥ 80 % (or `n/a`) · `coverage` ≥ 80 % (or `n/a`) · no broken link and no legend that differs from its zones, even in draft mode |
| **3 Complete** | `written` = 100 % · `blocking` = 0 (strict build, links, 100 % coverage, secrets) · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % (or `n/a`) · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 · `featureSheets` = 100 % (or `n/a`) |
| **4 Takeover** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (or `n/a`) · `upToDatePages` ≥ 90 % (or `n/a`) · `scenarios` ≥ 80 % (or `n/a`) · `behaviourDepth` ≥ 90 % (or `n/a`) |

The thresholds come from the most complete sites built with this method: they can be reached without heroics, and a site that misses one of them has a gap a reader will notice.

## How the audit decides

- **Level 0** means that level 1 is not reached: the plan cannot be read, or a level-1 criterion fails.
- **Not measured** (no coverage adapter can inventory the application, no browser for the table widths): the criterion is skipped, never failed, and the report says how to measure it.
- **n/a** (nothing to measure, for example `conformant` while no page is typed, or `annotated` with `capture.mode: "none"`): the criterion is met. A documentation without screenshots therefore reaches level 2 on its written, covered pages. `upToDatePages` is `n/a` the same way: a project with no `sync.json` yet (ARCHITECTURE.md §6.10) meets the criterion without having run `doc-kit sync` once. The first `doc-kit sync --mark --all` turns it into a real, measured ratio — and from then on, a page `doc-kit sync` marks as changed lowers it until someone reviews the page and marks it again.
- `doc-kit audit` builds the site in memory in strict mode, then writes `.doc-kit/audit.md` (the report, in the language of the project) and `.doc-kit/audit.json`, and prints a summary. Its exit code is 0: it informs, it does not block (exit code 2 when the configuration cannot be read).
- **The actions** are listed level by level, from the next one; inside a level, the quickest first (rename a heading, declare a type, remove guidance) and the longest last (write pages, add proofs). Each action names the pages concerned.
- **Untyped pages.** The audit names the pages that already follow a template, judged by their headings: all the required sections of the type are there. It prefers the usual types of the part (`screen` in Use and Administer, `editor` and `recipe` in Configure), else those of its space's kind (`feature`, `business-rules`… in Product; `architecture`, `runbook`… in Administer; `technical`, `journey`, `findings`… in Develop, and in the Take over section without spaces), and never suggests a type for a sub-page of a `screen`, an `editor` or the findings, which stay untyped (see [templates.md](templates.md#untyped-pages)). For the other pages, it gives the closest type and the required sections still missing.

## Level by space

With spaces declared (`content/toc.json`, ARCHITECTURE.md §6.1a), `doc-kit audit` also reports a level **per
space**: the same criteria, the page indicators (`written`, `typed`, `conformant`, `completeness`, `annotated`,
`proofs`, `tooLong`) measured on that space's pages only, and the project-wide indicators (configuration, the
build, the home page, glossary, journeys, coverage, blocking problems, wide tables, screenshot and page
versions) shared with the global level. `audit.md` shows a "Level by space" table under the global level;
`audit.json` carries `spaces: [{ id, title, pages, level, indicators, criteria }]`.

**`takeover4` by space.** A space counts only the required takeover pages that belong to it, found among its
own pages, and its threshold is their number: 2 in the Administer space (the technical architecture document,
Operate), 5 in the Develop space. The project's threshold stays all 7. A required page belongs to the first
declared space whose kind holds it: a space of the project's own counts as its kind, but a second space of the
same kind holds none of them (`takeover4` is `n/a` there); without an Administer space, its two pages belong to
the Develop space (threshold 7).

**A criterion that does not concern a space** is met and shown `n/a`, as its kind says:

| Criterion | `n/a` in | Why |
|---|---|---|
| `written2` (written pages outside the takeover pages) | Develop | Its pages are the takeover pages |
| `proofs4` (proofs on the takeover pages) | Use, Product, Administer | Only the Develop kind expects `file:line` proofs |
| `takeover4` (the required takeover pages) | Use, Product | Their kinds hold no required takeover page |
| `featureSheets3`, `scenarios4`, `behaviourDepth4` (the depth of the feature sheets) | Use, Administer, Develop | Only the Product kind measures it (`depth`) |

Nothing else is skipped — a Use space whose screens have no screenshot still fails `annotated`, and
`conformant`, `completeness`… are measured on each space's own pages.

The **global level stays what it always was**: every page, regardless of space. A project can be level 2
globally while its Product space alone is already level 3 — useful to know which audience is actually served
first. Without spaces declared, this section produces nothing: the report is exactly as it was before spaces
existed.

## The depth of the feature sheets

`featureSheets`, `scenarios` and `behaviourDepth` read the backlog that the strict build makes of the feature
sheets (ARCHITECTURE.md §6.8b) — the measure of the Product board's gauge. Like every page indicator, they count the
written sheets only: a sheet not written yet is `written`'s.

- **n/a** without a written feature sheet, and when spaces are declared but none is of a kind that measures depth
  (`standard/spaces.json` `depth`: the Product kind). Without spaces, a documentation with feature sheets is
  measured.
- **By space**, they are measured in a space of the Product kind, on its own sheets, and `n/a` in the others.
  The project's level counts every written sheet, whatever its space: a sheet kept in a Use space is `n/a` in
  that space, never left out of the project.
- The actions name the sheets without a story, the stories without acceptance criteria (and on which page), and the
  sheets whose cards still have rubrics without an answer.
- The report shows **Depth of the feature sheets**: the backlog in one line (epics, features, user stories and how
  many have acceptance criteria, versions), then each feature — its sheet and its state, its depth from 0 to 100 %,
  and the five criteria of that depth (the sheet written and conformant, at least one story, the stories' criteria,
  at least one rule, the rubrics answered). Informative: only the three indicators above are criteria;
  `audit.json` carries it as `depth: { backlog, features }`.

## Facts and claims (informative)

`doc-kit audit` also reports two measures of the takeover dossier (ARCHITECTURE.md §6.9), **never** part of a
criterion and never affecting the level, because no site predates them for a threshold to be observed on:

| Measure | What it counts |
|---|---|
| `facts` | How many `facts/<source>.json` files exist, and how many are **stale** — their recorded `commit` differs from the application's current `HEAD` |
| `claims` | How many `[[verified]]`, `[[deduced]]` and `[[unknown]]` badges (§6.9, [writing.md](writing.md#14-claim-status-verified-deduced-unknown)) appear in the written takeover pages (with spaces, those of the Develop space), and the ratio verified ÷ (verified + deduced) |

They answer two different questions than the level does: "is the evidence this dossier relies on still fresh"
(`facts`) and "how much of what is stated is actually checked, rather than guessed" (`claims`). A stale facts
file is fixed by `doc-kit facts --source <name>`; a low verified ratio is fixed by reading the code, not by
changing a badge. `audit.md` shows both under "Facts and claims" when either has something to report;
`audit.json` always carries `facts` and `claims`.

## Worked example: Acme Orders

The documentation of Acme Orders, version 2.4.0, has 92 pages in its four spaces. `doc-kit audit` reports:

| Indicator | Value | Threshold reached? |
|---|---|---|
| `written` | 92 / 92 (100 %) | Yes |
| `typed` | 81 / 92 (88 %) | Yes (level 3: ≥ 80 %) |
| `conformant` | 79 / 81 (97.5 %) | **No** (level 3: 100 %) |
| `completeness` | 74 % | Yes (level 4: ≥ 70 %) |
| `annotated` | 43 / 46 (93 %) | Yes (level 3: ≥ 90 %) |
| `coverage` | 61 / 61 routes | Yes |
| `proofs` | 19 / 34 (56 %) | **No** (level 4: ≥ 60 %) |
| `takeover` | 6 / 7 | **No** (level 4: 7) |
| `tooLong` | 3 / 92 (3 %) | Yes (level 4: ≤ 5 %) |
| `guidance` | 0 | Yes |
| `upToDateCaptures` | 118 / 124 (95 %) | Yes |
| `upToDatePages` | n/a — no `sync.json` yet | Yes (n/a) |
| `glossary` · `tours` | 34 · 4 | Yes |
| `blocking` · `wideTables` | 0 · 0 | Yes |

**Level reached: 2 User.** Levels 1 and 2 are met; level 3 fails on one criterion, `conformant`.

What is missing, in the order the audit lists it:

| To reach | What is missing | Action |
|---|---|---|
| Level 3 | Two `screen` pages start with "## Overview" instead of "What it is for" (`use/invoices/list`, `use/customers/record`) | Rename the two headings, and fix the anchors that pointed to them. `conformant` becomes 81 / 81 |
| Level 4 | `takeover` = 6: the troubleshooting page has only one area (`risks/troubleshooting/access`) | Write a second area, for example `risks/troubleshooting/approvals` |
| Level 4 | `proofs` = 56 %: 15 pages of the Develop space have no `file:line` proof | Add proofs to at least 2 more of them: 21 / 34 = 62 % |

The two headings take ten minutes and bring the site to level 3. Level 4 asks for real work: one more troubleshooting area, written from the code, and proofs on the pages that still state things without them.

The "Level by space" table shows which audience is already served:

| Space | Pages | Level | What it still lacks |
|---|---|---|---|
| Use | 30 | 2 | `conformant`: the two `screen` pages above |
| Product | 14 | 4 | Nothing: `proofs4` and `takeover4` are `n/a` |
| Administer | 14 | 4 | Nothing: its 2 required takeover pages are written; `proofs4` is `n/a` |
| Develop | 34 | 3 | `takeover` 4 / 5 (the troubleshooting area), `proofs` 56 % |

The Product and Administer exports can already be handed to their readers; the Use space waits for the two
headings, and the Develop space for the same level-4 work as the whole project.

> [!NOTE] Why the measured level can be lower than the substance
> A site written before page types existed declares no `template`: `typed` is 0 %, and it stays at level 2 even if its content is complete. Declaring the types, and renaming the few headings that do not match their template, is usually enough to reveal its real level without rewriting any content. `doc-kit audit` lists the pages to type and their type.
