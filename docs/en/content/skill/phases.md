## In short

The skill runs the method of the standard in **eleven phases**, numbered 0 to 10, plus two intermediate phases, 4b
(analysis of the features) and 5b (depth loop), for a project with feature sheets. Each phase ends on checks that
say it is done. Claude orchestrates; agents write in parallel from **briefs**; the CLI checks everything.

1. **Scope, set up, inventory** (phases 0 to 2): decisions in writing, the project created, the code inventoried.
2. **Plan, capture and analyse** (phases 3, 4 and 4b): the table of contents with a type per page, one reference
   page approved, the captures taken safely, each feature traced once in the code.
3. **Write and consolidate** (phases 5 to 8, with 5b): batches of pages written in parallel, the gaps of the feature
   sheets filled, findings consolidated, journeys, troubleshooting and production pages.
4. **Check and deliver** (phases 9 and 10): strict build, checks, audit, review, export, maintenance.

The skill answers in the user's language; the site is written in the project's `language`.

## The phases

| Phase | Goal | Commands and agents | Done when |
|---|---|---|---|
| 0 · Scoping | Audience and spaces, language, sections, capture mode, real data or not, routes never to open, who signs in; Claude asks whether the screenshots are taken on production (read-only) and whether to open the browser now; with feature sheets, "How detailed?" (`essential`, `standard`, `detailed`: the level of the analyses, and the cost grows with it) | `doc-kit init --spaces … --target …`, `doc-kit connect` | Decisions written; the owner's decision on real data |
| 1 · Set up | Create and configure the project, from the application root; read the recap of `init` | `doc-kit init`, `doc-kit doctor` | `doctor` without error; `build --draft` passes |
| 2 · Inventory | Real navigation, routes and permissions, pages that write when rendered | `doc-kit inventory --json`; 1 read-only agent, brief `inventory` | Inventory saved; outdated docs flagged |
| 3 · Plan | Table of contents with types, the writing guide, one reference page | `doc-kit new`, `doc-kit check coverage` | Coverage 100 %; batches defined |
| 4 · Captures | Demo data or a production session; a trial with previews. Skipped without screenshots (`capture.mode: "none"`) | `doc-kit demo` or `doc-kit connect`; `doc-kit capture --preview` | Zones right, no secret, read-only observed |
| 4b · Analysis | Each feature traced once in the code (screen, API, service, query), then a digest per reader. With a Product space or any feature sheet | One `doc-kit-analyst` per feature, brief `behaviour-analysis`, estimated first; `scripts/analysis.mjs check`, `findings`, `digest` | Every analysis checked; digests made; candidate findings handed to phase 6 |
| 5 · Writing | One agent per batch, in parallel waves; a feature sheet starts from its Product digest, its technical counterpart from the Develop digest | Briefs `writing-batch`, `functional-spec`, `feature-mechanism` | Each report: pages, captures, candidate findings |
| 5b · Depth loop | Measure what the sheets still lack and fill it, at most two rounds per feature | `doc-kit build --draft`, `doc-kit audit`, `scripts/analysis.mjs depth` and `questions`; brief `deepen` (`haiku`), or `behaviour-analysis` with `focus` | `depth` prints ✔ (nothing left to deepen or to analyse again); a new loop starts with `depth --reset`; `.doc-kit/open-questions.md` handed to the product owner |
| 6 · Consolidation | Deduplicate and number the findings, fix the pages | `scripts/consolidation.mjs`; briefs `findings-verification`, `page-corrections` | Strict build green |
| 7 · Journeys | End-to-end journeys and troubleshooting, reusing the captures | Briefs `journey`, `troubleshooting` | Home-page tours added |
| 8 · Production pages | Architecture document, resources, variables | Brief `production-technical` | Gaps recorded as P findings |
| 8 · The DAT and reality | With a DAT: the first pass, then the page of the gaps between the DAT and the code | `doc-kit inputs reconcile`; brief `architecture-reconcile` | Each statement cited and proved; risky gaps handed to phase 6 |
| 9 · Checks | Strict build, every check, audit, visual review | `doc-kit build`, `check all`, `audit`, `view` | Target level reached (4 for a takeover) |
| 10 · Delivery | Hand over, then maintain | `doc-kit connect --forget`, `doc-kit export` | Checklist of `standard/delivery.md` done |

## Briefs and scripts

A **brief** is the instruction given to an agent, distilled from briefs that worked on real projects. The skill
fills them from `doc.config.mjs` and a few variables:

```bash
node <skill>/scripts/brief.mjs writing-batch --project docs/manual --var code=u1 --var pages=@.doc-kit/pages-u1.txt
```

| Brief | Phase | Writes |
|---|---|---|
| `inventory` | 2 | Nothing: the orchestrator saves its report |
| `behaviour-analysis` | 4b | Its feature's analysis file `.doc-kit/analysis/<feature>.json`, nothing else |
| `writing-batch` | 5 | Its pages, its capture plan, its diagrams |
| `functional-spec` | 5 | The feature, rules, roles and process pages of its batch |
| `feature-mechanism` | 5 | The technical counterpart of a feature sheet |
| `deepen` | 5b | The gaps of one feature sheet, from its Product digest |
| `findings-verification` | 6 | The findings pages only |
| `page-corrections` | 6 | The reported pages and the glossary |
| `journey`, `troubleshooting` | 7 | Its pages, its diagram |
| `production-technical` | 8 | Architecture document, resources, variables, diagram |
| `architecture-reconcile` | 8 | The page of the gaps between the DAT and reality |

`scripts/consolidation.mjs` creates the consolidation file of phase 6 and lists the candidate findings that cite the
same `file:line`. The filled briefs go to `.doc-kit/brief-<template>.md`; an unfilled placeholder stops the script
with exit code 1.

**Economy of the agents.** Each brief's own front matter names the Claude Code agent type to launch it with:
`doc-kit-triage` (`haiku`, read-only), `doc-kit-writer` (`sonnet`), `doc-kit-analyst` (`sonnet`, traces one feature and writes its analysis), `doc-kit-reviewer` (`opus`, read-only) — copied
next to the skills folder by `doc-kit skill install`. Two maintenance briefs, `triage` and `update`, read
`doc-kit context <page> --update` to decide or redo a page from what changed. `brief.mjs --estimate` gives the
input and output tokens of a brief and its cost, when `llm` is set in `doc.config.mjs` (`llm.currency`,
`llm.prices` per model — no default: prices change and differ by contract); `scripts/usage.mjs log`, `report` and
`scan` measure what the agents actually consumed.

## The non-negotiable rules

1. **Safe captures**: on production, read-only and navigation only; read a detail page's server code before opening
   it; a refusal of the permission system is never worked around; stop when the session expires.
2. **Nothing invented**: every statement checked in the code, with its `file:line`; "inferred" says inferred.
3. **Reserved files**: an agent writes only its pages, its capture plan and its diagrams; the table of contents,
   the glossary and the configuration stay with the orchestrator.
4. **No commit**, no destructive git command: the user commits.
5. **The session is deleted** at the end of the campaign, never copied or shown.

## Pitfalls and observed gaps

> [!WARNING] Central files edited by two agents
> Two agents editing `toc.json` or `glossary.json` at the same time lose one's work. Everything goes through their
> reports, and the orchestrator edits the central files.

> [!WARNING] A separate front end
> When the front end sits in `frontend/` or `web/`, the coverage adapter only inventories its routes. Run `doc-kit init`
> on the application root, so that `app.dir` (the briefs' `appDir`) holds the back end too: the API, the permissions
> and the writes made while rendering. `brief.mjs` warns when `appDir` was guessed, and when the front end is separate.

> [!NOTE] No-screenshot mode
> With `capture.mode: "none"` (`doc-kit init --capture none`), phase 4 is skipped: the pages describe each screen with a
> table `| Element | What it shows |`, the briefs tell the writers so, and the audit counts `annotated` as n/a.

> [!NOTE] Pages too long
> Beyond about 2,000 words, split into sub-pages while writing, not afterwards: the anchors and the links are then
> right from the start.

## Further reading

- [Install the skill](#/skill/install): the command and its checks.
- [The documentation standard](#/method/standard): the rules the phases apply.
- [Demo or production](#/capture/safety): the safety rules of phase 4.
- [Cost and speed](#/skill/cost-and-speed): the agent types, `doc-kit context`, and pricing a wave before it runs.
- [Keeping up with the application](#/publish/sync): what phase 10's maintenance actually runs.
