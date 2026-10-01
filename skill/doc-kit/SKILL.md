---
name: doc-kit
description: "Build and maintain a complete, single-file HTML documentation site for any web application (offline, annotated screenshots, guided tour, search, glossary, SVG diagrams, sub-pages, light and dark themes) at the doc-kit quality standard, by orchestrating parallel agents and the doc-kit CLI: scoping, init and doctor, code inventory, site plan and page templates, annotated screenshots (prepared demo or read-only production), writing in parallel batches, consolidation of findings, end-to-end journeys, troubleshooting by symptom, technical architecture document, production resources and variables, maturity audit, export and maintenance. Use when asked to document an application, write a user manual or an administration guide, a handover or takeover guide, annotated screenshots, an architecture dossier, end-to-end journeys, troubleshooting, findings or points of attention, or to update an existing documentation site, even when doc-kit is not named."
---

Always answer the user, and write every message to them, in the user's language. The site itself is written in the
project's `language` (`doc.config.mjs`), and so are the agents' pages.

# doc-kit — a documentation site at the standard

**What you get**: `dist/<Product>-Documentation.html`, one file readable offline, that documents every screen, every
editor and every setting with how it really works (`file:line` proofs), plus a "Take over" section: architecture,
architecture document, end-to-end journeys, troubleshooting, numbered findings. Proven on real sites: 170 pages with
213 captures taken read-only in production (8 batches + 5 journeys), and 115 pages with 404 captures on a prepared demo.

**The kit**: `{{KIT_PATH}}` (engine, CLI, standard, page templates). `scripts/…` below means this skill's `scripts/`
folder, next to this file: give its full path when running a script from the documentation folder.
- CLI in a project: `npx doc-kit <command>` from the documentation folder; before `init`:
  `node "{{KIT_PATH}}/cli/doc-kit.mjs" <command>`. `doc-kit` alone starts the guided mode (detects the state, proposes
  the next step). Exit codes: 0 OK · 1 a check failed · 2 usage or configuration · 3 environment (expired session…).
- Work folder: `.doc-kit/` in the documentation folder (git-ignored): session, previews, briefs, reports.
- **Prerequisites**: Node ≥ 20; `npm install` in the kit (`npx playwright install chromium`); the application's code
  readable locally; a local demo, or the production URL **and an authorised person who signs in themselves**.

## Brief templates and scripts

Briefs are the instructions given to agents, distilled from briefs that worked on real projects (`assets/briefs/<lang>/`).

| Brief | Phase | Agent | Writes |
|---|---|---|---|
| `inventory` | 2 | Explore (read-only) | nothing: the orchestrator saves its report |
| `writing-batch` | 5 | general, one per batch | its pages, its capture plan, its diagrams |
| `consolidation` | 6 | — (model of the consolidation file) | — |
| `findings-verification` | 6 | general | the findings pages only |
| `page-corrections` | 6 | general | reported pages and the glossary |
| `journey`, `troubleshooting` | 7 | general, one per journey | its pages, its diagram, its fact sheet |
| `production-technical` | 8 | general | architecture document, resources, variables, diagram |

- `node scripts/brief.mjs <template> --project <docDir> [--lang en|fr] --var key=value…` fills a brief from
  `doc.config.mjs` (`product`, `language`, `app.url` or `DOC_KIT_URL`, `env.prefix`, `version`, `paths`,
  `capture.plans`, `capture.setup`, the coverage source — `app`, `file`, `source` or `base` —, `extra.briefs`) and the
  `--var` values, writes `.doc-kit/brief-<template>[-<code>].md`, and reports unfilled placeholders (exit 1).
  `--vars` shows what a template expects; `--var pages=@file` reads a list; `--list` lists the templates.
- `node scripts/consolidation.mjs init --project <docDir> --codes a,b,c` creates the consolidation file;
  `node scripts/consolidation.mjs duplicates --project <docDir>` lists candidates citing the same `file:line`, and
  existing findings already citing them.
- Launch an agent with: "Read `<brief>` and carry it out in full." Placeholders and waves:
  `references/agent-orchestration.md`.

## The phases

Each phase closes on its checks. Details of every phase: `references/method.md`.

### 0 · Scoping
- **Goal**: decide audience, language, sections, capture mode (prepared demo, read-only production, none), real data or
  not, routes never to open, deliverable and weight, who signs in. **Read**: `references/capture-safety.md`.
- **Exit**: written decisions (the "real data" decision is written by the owner, then repeated in `WRITING-GUIDE.md`).

### 1 · Set up the project
- **Commands**: `doc-kit init <app-dir>` (creates `<app-dir>/docs/manual/`), then complete `doc.config.mjs`
  (`product`, `app.url`, `auth`, `env.prefix`, `version`, `coverage`, `masking`, `capture.forbidden`); `doc-kit doctor`.
- **Exit**: `doctor` without error; `doc-kit build --draft` passes on the skeleton; `.doc-kit/` and `dist/` git-ignored.

### 2 · Code inventory
- **Commands**: `doc-kit inventory --json > .doc-kit/inventory.json`.
- **Agent**: 1 Explore agent ("very thorough"), brief `inventory`; save its report as `.doc-kit/inventory-<slug>.md`.
- **Exit**: real navigation, every route with its permissions, rich editors, roles × permissions matrix, **outdated**
  existing documentation flagged, pages that write when rendered, a proposed plan with templates and batches.

### 3 · Site plan and reference page
- **Commands**: `doc-kit new <id> --template <type> --title "…" [--parent <id>]` for each page, or a small script that
  writes `content/toc.json`; `doc-kit check coverage`.
- **Do it yourself**: the project's `WRITING-GUIDE.md`, then **one complete reference page** with its capture plan
  (an editor page is ideal, e.g. `configure/approvals/chains`), approved by the owner. Split the work into batches
  (codes, prefixes, pages).
- **Exit**: coverage 100 %; a template declared for each page; batches written down.
- **Read**: `references/templates.md`, `references/agent-orchestration.md` §1-2.

### 4 · Captures
- **Demo**: `doc-kit demo` (runs `capture.setup`, idempotent). **Production**: `doc-kit connect` (the person signs in;
  session in `.doc-kit/`), `capture.forbidden` filled after reading the code of detail pages.
- **Trial**: `doc-kit capture "<prefix>-*" --preview` on the reference page; look at each `.doc-kit/<id>.zones.png`
  (the zones drawn in red) and at the count of blocked write requests on the last line.
- **Exit**: zones right, no secret visible, read-only lock observed. **Read** `references/capture-safety.md` first.

### 5 · Writing in batches
- **Agents**: one per batch, in parallel waves (e.g. 8 batches `u1`-`u4`, `cf`, `a1`, `a2`, `t`), brief
  `writing-batch` (`--var code=u1 --var pages=@.doc-kit/pages-u1.txt --var captureMode=production`, plus
  `referencePage` once, in `extra.briefs` of `doc.config.mjs`). Each agent captures and writes its own pages.
- **Exit**: each report gives pages, captures, zones, blocked writes, candidate findings, errors, glossary;
  `doc-kit build --draft` and `doc-kit check tables` clean for the delivered pages.

### 6 · Consolidation
- **Commands**: `node scripts/consolidation.mjs init --project . --codes u1,u2,…`, paste the reports;
  `node scripts/consolidation.mjs duplicates --project .`; settle duplicates by hand.
- **Agents (in parallel)**: `findings-verification` (the only one writing the findings) and `page-corrections` (pages
  and glossary).
- **Exit**: every candidate integrated, merged or rejected with proof; counters up to date; strict build green.

### 7 · End-to-end journeys and troubleshooting
- **Agents**: first a reference journey on the product's central object (e.g. "the journey of an order", 8 sub-pages,
  optional fact sheets with `--var factSheet=yes`), then the other journeys and troubleshooting in parallel, briefs
  `journey` and `troubleshooting`. No new capture: reuse.
- **Then**: a 2nd consolidation (phase 6); home-page guided tours (`journeys[]` in `content/toc.json`).

### 8 · Production technical pages
- **Inputs**: portal screenshots provided by the owner (resources, variables, secret store, network) and the
  infrastructure code, read-only.
- **Agent**: brief `production-technical` (`--var code=… --var pages=@… --var diagram=… --var portalCaptures=…
  --var infraDir=…`) → architecture document
  (+ sub-pages and a diagram with numbered flows), resources, production variables and gaps; P-series candidates.

### 9 · Checks and review
- **Commands**: `doc-kit build` (strict), `doc-kit check all`, `doc-kit audit` (target level: 4 "Takeover"; report in
  `.doc-kit/audit.md` and `.doc-kit/audit.json`), `doc-kit view <page> --theme dark`, `--tour 2`, `doc-kit optimize`
  if heavy. **Read**: `references/standard.md`.

### 10 · Delivery and maintenance
- **Delivery**: the maintaining-the-docs page up to date (date and version of the captures, detail pages already opened
  in production); `doc-kit connect --forget`; `doc-kit export <target> --with-dist`; checklist
  `{{KIT_PATH}}/standard/delivery.md`.
- **Maintenance**: after an application release, `doc-kit audit` (outdated captures), `doc-kit check coverage`, targeted
  recaptures by prefix, re-check of `file:line` proofs; `doc-kit upgrade` (then `--apply`) for the kit.

## Non-negotiable rules

1. **Safe captures**: in production, read-only and navigation only; read a detail page's server code before opening it
   (server-side writes on GET); a refusal by the permission system is never worked around; stop when the session
   expires. Details: `references/capture-safety.md`.
2. **Nothing invented**: every label, default, permission and behaviour checked in the code (`file:line`); exact labels
   in bold; "inferred" says inferred; gaps described in a NOTE callout, never fixed in the application.
3. **Reserved files**: an agent writes only its pages, its capture plan and its diagrams; `toc.json`, `glossary.json`,
   the config and the engine stay under central management (the orchestrator).
4. **No commit**, no destructive git command: the user commits.
5. **Session deleted** at the end of the campaign (`doc-kit connect --forget`), never copied or displayed.

## Reuse checklist

- [ ] Scoping written; the owner's "real data" decision if production
- [ ] `init` + `doctor` green, `.doc-kit/` ignored
- [ ] Inventory saved, outdated existing documentation flagged
- [ ] Toc with templates, coverage 100 %, `WRITING-GUIDE.md`, reference page approved
- [ ] Batches defined (codes, prefixes, pages, reserved files), briefs generated
- [ ] Reports consolidated, duplicates settled, findings numbered, pages and glossary fixed
- [ ] Journeys, troubleshooting, architecture document and variables written; 2nd consolidation done
- [ ] Strict build, `check all`, `audit` at the target level, light/dark review
- [ ] Maintaining-the-docs page up to date, session deleted, export done, nothing committed

## Pitfalls (the most costly)

- **Server-side write when a page is rendered** (a detail page that creates a record on GET): the browser-side
  read-only block cannot stop it. Read the page's server code before opening it, and list such routes in
  `capture.forbidden`.
- **Outdated existing documentation** (a roles document with the wrong counts, a screen inventory of the mock-up):
  never copy it, re-check everything in the code.
- **Central files** (toc, glossary): two agents editing them at the same time lose one's work; everything goes through
  the reports.
- **Text with apostrophes or a Windows path in a shell command**: an apostrophe closes the string, backslashes vanish;
  write files with the file-writing tool.
- **Pages too long**: beyond the template's `maxWords` (2,000 to 3,500 words), `level: 2` sub-pages, while writing
  rather than afterwards.
- **Git Bash** turns an id starting with "/" into a Windows path: pass ids without a leading "/".
- **Maps and streams**: `networkidle` never comes; wait for `load` then a delay.
- **Masking** only knows the local `.env`: a production-only value is only guaranteed masked by reviewing the image.
- **Weight**: 34 MB on one real site, too heavy for e-mail; `doc-kit optimize`.

Full list and fixes: `references/pitfalls.md`.
