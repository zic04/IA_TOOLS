## In short

`doc-kit audit` measures a documentation site against the standard: about sixteen **indicators**, the **maturity
level** reached (0 to 4), and, in priority order, **what to do** to reach the next level, with the pages concerned.
With spaces declared, it also reports a level **per space**, and two measures that never affect the level:
`facts` and `claims`.

1. It builds the site in memory, in strict mode, and reads every page, the table of contents and the zone files.
2. It writes `.doc-kit/audit.md` (the report, in the project's language) and `.doc-kit/audit.json` (the same data),
   and prints a summary.
3. Its exit code is **0**: it informs, it does not block. It is 2 only when the configuration cannot be read.

## The diagram

::diagram{id="maturity" title="The four maturity levels. Each level adds criteria to those of the levels below; level 0 means that level 1 is not reached."}

## The summary

The summary of a new project's skeleton (its two spaces already declared, business and takeover): its 14 pages are
drafts, written by `init` with their template guidance, so none of them is written yet.

```text
◆ Acme Orders — level 1 · Skeleton (14 pages)
  Pages: 0 written of 14 — 14 to write (0 without a file, 14 still in template guidance)
  ✖ written 0% · ✔ typed 100% · – conformant n/a · – completeness n/a · – annotated n/a · – coverage not measured · – proofs n/a · ✖ takeover 0%
  – tooLong n/a · ✖ guidance 1 · – upToDateCaptures n/a · – upToDatePages n/a · ✖ glossary 2 · ✖ tours 1 · ✔ blocking 0 · – wideTables not measured

Next: level 2 · User — 1 criterion to meet
  1. Write the 4 pages not written yet outside Take over (0 without a file, 4 still in template guidance) (use/getting-started, features/example-feature, configure/sample-editor +1)
  + 5 actions for the next levels: see the report

→ report: .doc-kit/audit.md · data: .doc-kit/audit.json
```

## Pages not written yet

A **written** page is a declared page whose file exists and holds no template guidance. A page declared in
`toc.json` without its file, or whose file still holds guidance (a draft), is not written yet, and **only `written`
counts it**:

- the strict build reports a page without its file once, `page not written yet: <id>`, and checks neither the sections
  of its template nor the anchors that point into it (a warning with `--draft`);
- `conformant`, `completeness`, `annotated`, `proofs`, `tooLong` and `takeover` measure the written pages only: the
  examples of a template (a sample finding `C1`, a sample proof) never satisfy a criterion;
- `coverage` counts what the written pages cite. The `routes` of a page not written yet do not cover anything: the
  report shows apart the coverage "with the pages not written yet", and names the page that plans each element;
- `blocking` leaves out the build errors of the pages not written yet; the report shows them next to it.

The summary line "Pages: … to write" says how far the plan is from the written documentation.

## The indicators

| Indicator | What it measures |
|---|---|
| `written` | Declared pages that are written: file present, no template guidance left |
| `typed` | Pages that declare a `template` |
| `conformant` | Written typed pages that have all their required sections |
| `completeness` | Share of the template's sections present, averaged over the written typed pages |
| `annotated` | Written `screen` and `editor` pages with a `:::screen` (while no page is typed: the written pages outside Take over); `n/a` with `capture.mode: "none"` |
| `coverage` | Elements cited by the written pages ÷ elements inventoried by the coverage adapters |
| `proofs` | Written Take over pages with at least one `file:line` proof (`lib/orders.ts:42`, in backticks) |
| `takeover` | The 7 required Take over pages that are written |
| `tooLong` | Written pages beyond their `maxWords` (2,000 when untyped) |
| `guidance` | Template text left outside the pages: the summary placeholder of `doc-kit new` on a written page, guidance in the home page or a section introduction |
| `upToDateCaptures` | Zone files whose `version` is the current documented version |
| `upToDatePages` | Marked pages (`sync.json`, [Keeping up with the application](#/publish/sync)) whose `version` is the current one, among the written pages; `n/a` without `sync.json` |
| `glossary` · `tours` | Glossary terms · home-page journeys |
| `blocking` | Strict build errors outside the pages not written yet + elements no page cites + secrets found |
| `wideTables` | Tables that scroll at 1,440 px (every page is opened in Chromium) |

## The levels and their criteria

| Level | Criteria |
|---|---|
| **1 Skeleton** | The configuration is valid · `doc-kit build --draft` succeeds · each section has a page with its file (a draft counts) · `home.md` exists · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 User** | `written` ≥ 90 % outside Take over · `annotated` ≥ 80 % (or n/a) · `coverage` ≥ 80 % (or not measured) · no broken link and no legend that differs from its zones, even in draft mode |
| **3 Complete** | `written` = 100 % · `blocking` = 0 · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Takeover** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (or n/a) · `upToDatePages` ≥ 90 % (or n/a) |

The **Take over** section is the one whose id is `take-over` (or `reprendre`); otherwise, the last section of the
plan when there are at least two. Its 7 required pages are: an architecture overview (id ending with
`/architecture`), a technical architecture document (`architecture` type), an end-to-end journey with at least 3
steps, an operations page (id containing `operations`, `deployment`, `exploitation` or `deploiement`), a
troubleshooting page with at least 2 areas, a findings page with at least one numbered finding (`C1`, `I1`…), and a
page on maintaining the docs (id ending with `/maintaining-docs`).

## Level by space

With `spaces` declared ([Two spaces, one source](#/spaces/overview)), the report also shows one row per space:

```text
## Level by space

| Space | Pages | Level | Missing for the next level |
|---|---|---|---|
| For the business (`business`) | 4 | 1 Skeleton | `written2` |
| For the takeover team (`takeover`) | 10 | 2 User | `written3`, `guidance3`, `glossary3`, `tours3` |
```

- `written`, `typed`, `conformant`, `completeness`, `annotated`, `proofs` and `tooLong` are measured on that
  space's pages only; the project-wide indicators (configuration, build, home page, glossary, journeys, coverage,
  blocking, wide tables, screenshot and page versions) are the same ones shown globally.
- A criterion that does not concern a space counts as met, shown `n/a`: `written2` (pages outside Take over)
  inside the Takeover space; `takeover4` and `proofs4` (the 7 required Take over pages, proofs on them) outside
  it.
- **The global level stays global**: every page, whatever its space. A project can be level 2 overall while its
  business space alone already reaches level 3 — useful to know which audience is actually served first.
  `audit.json` carries `spaces: [{ id, title, pages, level, indicators, criteria }]`; without spaces declared,
  nothing changes in the report.

## Facts and claims (informative)

With a takeover space, two more measures are shown, **never** part of a level's criteria — no site predates them
for a threshold to be observed on:

```text
## Facts and claims

- 7 facts files, 1 stale (older than the application's current commit)
- 34 verified, 9 deduced, 2 unknown (verified ratio: 79%)
```

- `facts`: how many `facts/<source>.json` files exist ([Taking over a vibe-coded application](#/spaces/takeover)),
  and how many are **stale** — their recorded commit differs from the application's current `HEAD`. Fixed by
  `doc-kit facts --source <name>`.
- `claims`: how many `[[verified]]`, `[[deduced]]` and `[[unknown]]` badges appear in the written takeover pages,
  and the ratio verified ÷ (verified + deduced). A low ratio is fixed by reading the code, never by changing a
  badge.

`audit.md` shows this section only when there is something to report; `audit.json` always carries `facts` and
`claims`.

## How the audit decides

- **Not measured** (no coverage adapter can inventory the application; no browser for the tables, or
  `DOC_KIT_NO_BROWSER=1`): the criterion is skipped, never failed, and the report says how to measure it.
- **n/a** (nothing to measure, such as `conformant` while no page is typed, or `upToDatePages` before the first
  `doc-kit sync --mark --all`): the criterion is met.
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
- [Two spaces, one source](#/spaces/overview): the level-by-space table, in context.
- [Keeping up with the application](#/publish/sync): `upToDatePages`, marked by `doc-kit sync --mark`.
- [Taking over a vibe-coded application](#/spaces/takeover): `facts` and `claims`, measured.
