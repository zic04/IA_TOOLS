# Maturity levels

Four levels, each defined by criteria that `doc-kit audit` **measures**. A level is reached when all its criteria, and all the criteria of the levels below it, are met.

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
| `annotated` | Written `screen` and `editor` pages that contain at least one `:::screen` (or `:::ecran`) ÷ written `screen` and `editor` pages. While no page is typed: the written pages of every section other than Take over. `n/a` when `capture.mode` is `"none"`: a documentation declared without screenshots describes its screens with tables, and has nothing to annotate |
| `coverage` | Elements cited by the written pages ÷ elements inventoried by `doc-kit check coverage`; not measured when no adapter can inventory the application. The entry of a page not written yet (its `routes`) covers nothing: the report shows apart the coverage of the plan, "with the pages not written yet" |
| `proofs` | Written Take over pages that contain at least one `file:line` proof (a file name with its extension, then `:` and a number, in backticks: `lib/orders.ts:42`), outside comments ÷ written Take over pages |
| `takeover` | Number of the 7 required Take over pages that are written (see below) |
| `tooLong` | Written pages beyond their `maxWords` (2,000 when untyped) ÷ written pages. Words are counted in the Markdown, without code blocks, comments, URLs and markup |
| `guidance` | Template text left outside the page bodies: written pages whose summary is still the placeholder of `doc-kit new`, plus the home page and the section introductions (`<section>/index.md`) that still hold guidance |
| `upToDateCaptures` | Zone files whose `version` is the current version of the application ÷ zone files that carry a `version`; `n/a` when none does |
| `glossary` | Number of glossary terms |
| `tours` | Number of home-page guided tours (`journeys` in `toc.json`) |
| `blocking` | Strict build errors outside the pages not written yet + elements cited by no page, not even by the entry of a page not written yet (when `coverage` is measured) + secrets found by `doc-kit check secrets` (see [quality.md](quality.md)). The errors of the pages not written yet (`page.missing`, the errors of a draft) are shown next to it, counted by `written` |
| `wideTables` | Tables that overflow at 1,440 px (every page is opened in the browser); not measured without a browser, or with `DOC_KIT_NO_BROWSER=1` |

The **Take over** section is the section whose id is `take-over` (or `reprendre`); otherwise, the last section of the plan, when the plan has at least two.

**The 7 required Take over pages**, counted by `takeover` among the written pages of the Take over section, never a draft or a page without its file, which the report names as the page to write (a sub-page is a `"level": 2` page that follows its parent in the same group):

| # | Page | Measured criterion |
|---|---|---|
| 1 | Architecture overview | A page whose id ends with `/architecture` |
| 2 | Technical architecture document | A page with `"template": "architecture"` |
| 3 | End-to-end journey | A `journey` page followed by at least 3 `journey-step` sub-pages |
| 4 | Operate | A page whose id contains `operations`, `deployment`, `exploitation` or `deploiement` |
| 5 | Troubleshooting by symptom | A `troubleshooting` page followed by at least 2 `troubleshooting-area` sub-pages |
| 6 | Findings | A `findings` page, and at least one numbered finding (`C1`, `I1`, `M1`, `P1`, `N1` or `R1`…) in it or in its sub-pages |
| 7 | Maintaining the docs | A page whose id ends with `/maintaining-docs` or `/maintenir-doc` |

## The criteria of each level

| Level | Criteria |
|---|---|
| **1 Skeleton** | `doc.config.mjs` is valid · `doc-kit build --draft` succeeds · each section has at least 1 page with its file (a draft counts: this is the skeleton) · `home.md` exists · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 User** | `written` ≥ 90 % outside Take over · `annotated` ≥ 80 % (or `n/a`) · `coverage` ≥ 80 % (or `n/a`) · no broken link and no legend that differs from its zones, even in draft mode |
| **3 Complete** | `written` = 100 % · `blocking` = 0 (strict build, links, 100 % coverage, secrets) · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % (or `n/a`) · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Takeover** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (or `n/a`) |

The thresholds come from the most complete sites built with this method: they can be reached without heroics, and a site that misses one of them has a gap a reader will notice.

## How the audit decides

- **Level 0** means that level 1 is not reached: the plan cannot be read, or a level-1 criterion fails.
- **Not measured** (no coverage adapter can inventory the application, no browser for the table widths): the criterion is skipped, never failed, and the report says how to measure it.
- **n/a** (nothing to measure, for example `conformant` while no page is typed, or `annotated` with `capture.mode: "none"`): the criterion is met. A documentation without screenshots therefore reaches level 2 on its written, covered pages.
- `doc-kit audit` builds the site in memory in strict mode, then writes `.doc-kit/audit.md` (the report, in the language of the project) and `.doc-kit/audit.json`, and prints a summary. Its exit code is 0: it informs, it does not block (exit code 2 when the configuration cannot be read).
- **The actions** are listed level by level, from the next one; inside a level, the quickest first (rename a heading, declare a type, remove guidance) and the longest last (write pages, add proofs). Each action names the pages concerned.
- **Untyped pages.** The audit names the pages that already follow a template, judged by their headings: all the required sections of the type are there. It prefers the usual types of the section (`screen` in Use and Administer, `editor` and `recipe` in Configure), and never suggests a type for a sub-page of a `screen`, an `editor` or the findings, which stay untyped (see [templates.md](templates.md#untyped-pages)). For the other pages, it gives the closest type and the required sections still missing.

## Worked example: Acme Orders

The documentation of Acme Orders, version 2.4.0, has 92 pages. `doc-kit audit` reports:

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
| `glossary` · `tours` | 34 · 4 | Yes |
| `blocking` · `wideTables` | 0 · 0 | Yes |

**Level reached: 2 User.** Levels 1 and 2 are met; level 3 fails on one criterion, `conformant`.

What is missing, in the order the audit lists it:

| To reach | What is missing | Action |
|---|---|---|
| Level 3 | Two `screen` pages start with "## Overview" instead of "What it is for" (`use/invoices/list`, `use/customers/record`) | Rename the two headings, and fix the anchors that pointed to them. `conformant` becomes 81 / 81 |
| Level 4 | `takeover` = 6: the troubleshooting page has only one area (`take-over/troubleshooting/access`) | Write a second area, for example `take-over/troubleshooting/approvals` |
| Level 4 | `proofs` = 56 %: 15 Take over pages have no `file:line` proof | Add proofs to at least 2 more of them: 21 / 34 = 62 % |

The two headings take ten minutes and bring the site to level 3. Level 4 asks for real work: one more troubleshooting area, written from the code, and proofs on the pages that still state things without them.

> [!NOTE] Why the measured level can be lower than the substance
> A site written before page types existed declares no `template`: `typed` is 0 %, and it stays at level 2 even if its content is complete. Declaring the types, and renaming the few headings that do not match their template, is usually enough to reveal its real level without rewriting any content. `doc-kit audit` lists the pages to type and their type.
