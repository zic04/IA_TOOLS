## In short

`doc-kit audit` measures a documentation site against the standard: about fifteen **indicators**, the **maturity
level** reached (0 to 4), and, in priority order, **what to do** to reach the next level, with the pages concerned.

1. It builds the site in memory, in strict mode, and reads every page, the table of contents and the zone files.
2. It writes `.doc-kit/audit.md` (the report, in the project's language) and `.doc-kit/audit.json` (the same data),
   and prints a summary.
3. Its exit code is **0**: it informs, it does not block. It is 2 only when the configuration cannot be read.

## The diagram

::diagram{id="maturity" title="The four maturity levels. Each level adds criteria to those of the levels below; level 0 means that level 1 is not reached."}

## The summary

The summary of a new project's skeleton (lines shortened here):

```text
◆ Acme Orders — level 2 · User (9 pages)
  ✔ written 100% · ✔ typed 100% · ✔ conformant 100% · ✔ completeness 95.6%
  ✔ annotated 100% · – coverage not measured · ✔ proofs 66.7% · ✖ takeover 57.1%
  ✔ tooLong 0% · ✖ guidance 9 · ✔ upToDateCaptures 100% · ✖ glossary 2
  ✖ tours 1 · ✖ blocking 8 · ✔ wideTables 0

Next: level 3 · Complete — 4 criteria to meet
  1. Write, then remove, the template guidance left in 9 pages (…)
  2. Fix the 8 errors of the strict build (doc-kit build) (…)
  3. Add guided tours (journeys in content/toc.json): 1 today, 3 expected (2 more)
  4. Add terms to the glossary: 2 today, 20 expected (18 more)

→ report: .doc-kit/audit.md · data: .doc-kit/audit.json
```

## The indicators

| Indicator | What it measures |
|---|---|
| `written` | Declared pages that have their file |
| `typed` | Pages that declare a `template` |
| `conformant` | Typed pages that have all their required sections |
| `completeness` | Share of the template's sections present, averaged over the typed pages |
| `annotated` | `screen` and `editor` pages with a `:::screen` (while no page is typed: the pages outside Take over) |
| `coverage` | Elements cited ÷ elements inventoried by the coverage adapters |
| `proofs` | Take over pages with at least one `file:line` proof (`lib/orders.ts:42`, in backticks) |
| `takeover` | The 7 required Take over pages that are present |
| `tooLong` | Pages beyond their `maxWords` (2,000 when untyped) |
| `guidance` | Pages that still hold template guidance, or the summary placeholder of `doc-kit new` |
| `upToDateCaptures` | Zone files whose `version` is the current documented version |
| `glossary` · `tours` | Glossary terms · home-page journeys |
| `blocking` | Strict build errors + uncovered elements + secrets found |
| `wideTables` | Tables that scroll at 1,440 px (every page is opened in Chromium) |

## The levels and their criteria

| Level | Criteria |
|---|---|
| **1 Skeleton** | The configuration is valid · `doc-kit build --draft` succeeds · each section has a written page · `home.md` exists · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 User** | `written` ≥ 90 % outside Take over · `annotated` ≥ 80 % · `coverage` ≥ 80 % (or not measured) · no broken link and no legend that differs from its zones, even in draft mode |
| **3 Complete** | `blocking` = 0 · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Takeover** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (or n/a) |

The **Take over** section is the one whose id is `take-over` (or `reprendre`); otherwise, the last section of the
plan when there are at least two. Its 7 required pages are: an architecture overview (id ending with
`/architecture`), a technical architecture document (`architecture` type), an end-to-end journey with at least 3
steps, an operations page (id containing `operations`, `deployment`, `exploitation` or `deploiement`), a
troubleshooting page with at least 2 areas, a findings page with at least one numbered finding (`C1`, `I1`…), and a
page on maintaining the docs (id ending with `/maintaining-docs`).

## How the audit decides

- **Not measured** (no coverage adapter can inventory the application; no browser for the tables, or
  `DOC_KIT_NO_BROWSER=1`): the criterion is skipped, never failed, and the report says how to measure it.
- **n/a** (nothing to measure, such as `conformant` while no page is typed): the criterion is met.
- **The actions** are listed level by level, from the next one; inside a level, the quickest first (rename a heading,
  declare a type, remove guidance), the longest last (write pages, add proofs).
- **Untyped pages**: the report names those that already follow a template, judged by their headings, and gives
  the closest type of the others with the sections they lack.

This site is audited too: `doc-kit audit` in `docs/en` reports its level.

## In a pipeline

`doc-kit audit --json` prints the whole result: `level`, `indicators`, `criteria`, `actions`. Keep
`.doc-kit/audit.md` as an artifact of the job, and fail the job yourself on the level you require:

```bash
doc-kit audit --json > audit.json
node -e "process.exit(require('./audit.json').level >= 3 ? 0 : 1)"
```

## Pitfalls and observed gaps

> [!NOTE] Why a complete site can measure low
> A site written before page types existed declares no `template`: `typed` is 0 % and it stays at level 2, even
> when its content is complete. Declaring the types, and renaming the few headings that do not match, usually
> reveals its real level without rewriting anything.

> [!NOTE] A browser for the tables
> `wideTables` opens every page (about 0.15 s per page). Without Chromium it is "not measured"; with
> `DOC_KIT_NO_BROWSER=1`, it is skipped on purpose.

## Further reading

- `standard/maturity.md` in the kit: the formulas, the thresholds and a worked example.
- [The checks](#/publish/checks): the blocking checks behind `blocking`.
- [Page templates](#/write/page-templates): `typed`, `conformant` and `completeness`.
