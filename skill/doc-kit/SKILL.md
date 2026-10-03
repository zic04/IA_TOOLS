---
name: doc-kit
description: "Build and maintain a complete, single-file HTML documentation site for any web application (offline, annotated screenshots, guided tour, search, glossary, SVG diagrams, sub-pages, light and dark themes) at the doc-kit quality standard, by orchestrating parallel agents and the doc-kit CLI: scoping (business space, takeover space, or both), deterministic code facts, code inventory, site plan and page templates, annotated screenshots (prepared demo or read-only production), writing in parallel batches, consolidation of findings, end-to-end journeys, troubleshooting by symptom, the takeover dossier of a vibe-coded application (access and ownership, API surface, dependencies, agent instructions, tests, threat model), production technical architecture, maturity audit, export, and following the application's later changes (facts, sync, triage, update) while keeping agent cost under control. Use when asked to document an application, write a user manual, a functional specification, feature sheets and business rules, an administration guide, a handover or takeover guide, a vibe-coding code-health review, annotated screenshots, an architecture dossier, end-to-end journeys, troubleshooting, findings or points of attention, or to update an existing documentation site after a release, even when doc-kit is not named."
---

Always answer the user, and write every message to them, in the user's language — including status updates
during a long chain of tool calls, where drift shows up first. The site itself is written in the project's
`language` (`doc.config.mjs`), and so are the agents' pages.

# doc-kit — a documentation site at the standard

**What you get**: `dist/<Product>-Documentation.html`, one file readable offline, that documents every screen,
editor and feature, and, for a vibe-coded application, a takeover dossier: access and ownership, API surface,
runbook, data model, dependencies, agent instructions, tests, threat model, numbered findings as a risk register.
Proven on real sites: 170 pages with 213 captures taken read-only in production (8 batches + 5 journeys), and 115
pages with 404 captures on a prepared demo.

**The kit**: `{{KIT_PATH}}` (engine, CLI, standard, page templates). `scripts/…` below means this skill's
`scripts/` folder, next to this file: give its full path when running a script from the documentation folder.
- CLI in a project: `npx doc-kit <command>` from the documentation folder; before `init`:
  `node "{{KIT_PATH}}/cli/doc-kit.mjs" <command>`. `doc-kit` alone starts the guided mode (detects the state,
  proposes the next step). Exit codes: 0 OK · 1 a check failed · 2 usage or configuration · 3 environment
  (expired session…).
- Work folder: `.doc-kit/` in the documentation folder (git-ignored): session, previews, context files, briefs,
  reports, `usage.jsonl`. `facts/` and `sync.json` are **committed** with the project (ARCHITECTURE.md §6.9-6.10).
- **Prerequisites**: Node ≥ 20; `npm install` in the kit (`npx playwright install chromium`); the application's
  code readable locally; a local demo, or the production URL **and an authorised person who signs in themselves**.

## Cadrage (before `init`)

Ask the user (AskUserQuestion when available, otherwise a plain question), and write down the answers:

1. **Which space(s)?** Business (what each feature does, for whom, by which rule — users, key users, product
   owners, support) · Takeover (how it is built, run and secured, and what to fix first — developers, operators,
   security) · both. Drives `content/toc.json`'s `spaces` (ARCHITECTURE.md §6.1a) and which of phases 5 and 8
   below apply.
2. **Where will the screenshots be taken?** Local or demo application · **production, read-only** · no
   screenshots. Answer: `doc-kit init --target local|demo|production` (production: `--url <production address>`
   too) or `--capture none`. Read `references/capture-safety.md` first.
3. With screenshots and a sign-in: **"Open the browser now to sign in?"** — yes: `doc-kit connect` (a visible
   window; the **user** signs in, then presses Enter; you never type credentials); no: give the command for
   later.
4. **A cost in euros (or another currency)?** If the user wants `brief.mjs --estimate`/`sync --estimate` to show
   a price, ask for the per-million-token prices of the models in play and write `llm: { currency, prices: {
   haiku: {...}, sonnet: {...}, opus: {...} } }` into `doc.config.mjs` (ARCHITECTURE.md §6.11). Without it,
   estimates still show tokens, just no cost.
5. **A security review? A maintainability review?** Optional, takeover space only — see phase 8a.

For production, repeat before the first capture: a server-side write on `GET` is not blocked
(`capture.forbidden`), the session file is a secret, real data needs the owner's written decision.

## Brief templates and scripts

Briefs are the instructions given to agents, distilled from briefs that worked on real projects
(`assets/briefs/<lang>/`). Each starts with `agent: <type>` and a common part first, variables last (byte-for-byte
identical for a given template, so a wave shares its prompt cache).

| Brief | Phase | Space | Agent type | Writes |
|---|---|---|---|---|
| `inventory` | 2 | both | `doc-kit-reviewer` (read-only) | nothing: the orchestrator saves its report |
| `writing-batch` | 5 | business (screens) | `doc-kit-writer`, one per batch | its pages, capture plan, diagrams |
| `functional-spec` | 5 | business (features) | `doc-kit-writer`, one per batch | feature/rules/roles/process pages |
| `consolidation` | 6 | both | — (model of the consolidation file) | — |
| `findings-verification` | 6 | both | `doc-kit-reviewer` | the findings pages only |
| `page-corrections` | 6 | both | `doc-kit-writer` | reported pages and the glossary |
| `journey`, `troubleshooting` | 7 | both | `doc-kit-writer`, one per journey | its pages, diagram, fact sheet |
| `code-health` | 8 | takeover | `doc-kit-reviewer` | api-surface/dependencies/agent-instructions/tests-quality/threat-model |
| `access-ownership` | 8 | takeover | `doc-kit-writer` | the access-ownership page |
| `system-dossier` | 8 | takeover | `doc-kit-writer` | runbook/data-model/code-map/adr pages |
| `production-technical` | 8 | takeover | `doc-kit-reviewer` | architecture document, resources, variables, diagram |
| `triage` | maintenance | both | `doc-kit-triage` (read-only) | nothing: the orchestrator saves `.doc-kit/triage.json` |
| `update` | maintenance | both | `doc-kit-writer` | the pages it was given, from their context files |

Agent types (`skill/doc-kit/agents/*.md`, Claude Code agent definitions, ARCHITECTURE.md §6.11): `doc-kit-triage`
(`haiku`, Read/Grep/Glob only — cheap, read-only decisions), `doc-kit-writer` (`sonnet`, also Edit/Write/Bash — the
default for writing and updating), `doc-kit-reviewer` (`opus`, also Edit/Write/Bash — the most capable model, for
the few judgments every later page depends on: the inventory, the code-health and production dossiers, the
verification of findings). `doc-kit skill install` copies them next to the skills folder; `doctor` reports them
like the skill.

- `node scripts/brief.mjs <template> --project <docDir> [--lang en|fr] --var key=value…` fills a brief from
  `doc.config.mjs` (`product`, `language`, `app.url` or `DOC_KIT_URL`, `env.prefix`, `version`, `paths`,
  `capture.plans`, `capture.setup`, the coverage source, `extra.briefs`) and the `--var` values, writes
  `.doc-kit/brief-<template>[-<code>].md`, prints the agent type, and reports unfilled placeholders (exit 1).
  `--vars` shows what a template expects; `--var pages=@file` reads a list; `--list` lists the templates.
  `--estimate` prints input/output tokens and the cost (with `llm.prices`) instead of writing the file: run it for
  every brief of a wave before launching it.
- `node scripts/usage.mjs log --brief <name> --agent <type> --model <model> --tokens <n> [--tools <n>] [--duration
  <ms>] [--pages a,b] [--phase <name>]` after **each** agent ends, from what Claude Code reports; `node
  scripts/usage.mjs report` totals by phase, brief, agent type, model and page, the cost, and the gap with a fresh
  estimate — run at the end of **each phase**; `scan --transcripts <folder>` adds the precise input/output/cache
  split read from Claude Code's own transcripts, when available.
- `node scripts/consolidation.mjs init --project <docDir> --codes a,b,c` creates the consolidation file;
  `node scripts/consolidation.mjs duplicates --project <docDir>` lists candidates citing the same `file:line`, and
  existing findings already citing them.
- Launch an agent of the type the brief names with: "Read `<brief>` and carry it out in full." Placeholders and
  waves: `references/agent-orchestration.md`.

## The phases

Each phase closes on its checks. Full detail, both spaces, the two example sites: `references/method.md`.

### 0 · Scoping
Decide audience, language, capture mode, real data or not, routes never to open, deliverable, who signs in — see
Cadrage above. **Exit**: written decisions.

### 1 · `doc-kit facts` first: the deterministic inventory, zero tokens
Before any agent runs: `doc-kit init`, then `doc-kit facts [--network] [--tools]` reads the application's code and
writes `facts/*.json` (dependencies, env, api, db, agents, secrets, tests — ARCHITECTURE.md §6.9), committed with
the project. No LLM call, no judgment: a fact is a fact, not yet a finding. `doctor` must be green first.

### 2 · Inventory by the reviewer
One `doc-kit-reviewer` agent (read-only, "very thorough"), brief `inventory`, reads `.doc-kit/inventory.json`
(`doc-kit inventory --json`) and the facts; saves its report as `.doc-kit/inventory-<slug>.md`. With a business
space: also `doc-kit inventory --features --write` to get a starting `features.json` (ARCHITECTURE.md §6.8).

### 3 · Plan, in two spaces
Declare `spaces` in `content/toc.json` when both are in scope (ARCHITECTURE.md §6.1a); one section's `space` per
reader. Business pages: `feature`, `business-rules`, `roles-matrix`, `process`. Takeover pages: the existing
`architecture`/`variables`/`resources` plus `access-ownership`, `api-surface`, `runbook`, `data-model`,
`dependencies`, `code-map`, `tests-quality`, `agent-instructions`, `adr`, `threat-model`. `doc-kit check coverage`
must reach 100 %. One approved reference page per space.

### 4 · Captures
Skipped with `capture.mode: "none"`. Otherwise `doc-kit demo` or `doc-kit connect` + the PRODUCTION banner, then a
trial `doc-kit capture "<prefix>-*" --preview` on the reference page. **Read** `references/capture-safety.md`
first.

### 5 · Writing in batches
One brief per batch, in parallel waves. **First**, for each page: `doc-kit context <page>` (the only reading an
agent needs: dependencies, excerpts, exact labels, facts, glossary — never the full inventory or table of
contents) and, when the page's type supports it (`variables`, `api-surface`, `data-model`, `dependencies`,
`agent-instructions`), `doc-kit new <id> --prefill`. Business batches: brief `writing-batch` (screens) or
`functional-spec` (features, rules, roles, process — no `file:line`, business pages cite no code). **Each writer
ends with** `doc-kit sync --mark <page> --sources …`, from the documentation folder, once its checks pass.

### 6 · Consolidation
`consolidation.mjs init`, paste the reports, `consolidation.mjs duplicates`, then **in parallel**
`findings-verification` (the only one writing the findings/risk register) and `page-corrections`.

### 7 · End-to-end journeys and troubleshooting
A reference journey first (briefs `journey`, optional fact sheets), then the other journeys and troubleshooting
in parallel (no new capture). A 2nd consolidation; home-page guided tours.

### 8 · Takeover dossier
**Facts-grounded** (brief `code-health`, one `doc-kit-reviewer`): `api-surface` (authentication and tenant
isolation of each route, row-level security), `dependencies` (packages that do not exist, licences),
`agent-instructions` (each rule confirmed, obsolete or contradicted), `tests-quality`, `threat-model`; its gaps
are numbered candidates for the risk register. **Ownership** (brief `access-ownership`, one `doc-kit-writer`): who
owns the domain, the repository, the hosting, the database, payment, e-mail, each AI account, each secret, and the
questions still open for the real owner. **System dossier** (brief `system-dossier`, one `doc-kit-writer`):
`runbook` (install, build, deploy, roll back, scheduled jobs, backup and restore — every command checked in the
repository), `data-model` (from `new --prefill` and `facts/db.json`: personal data, retention, processors),
`code-map` (C4 context/containers/components, integrations, duplicated or dead code from `facts/tool-knip.json`
when present), `adr` (reconstructed decisions, marked as such, with how they were reconstructed). **Production
infrastructure**, when portal screenshots are available (brief `production-technical`): architecture document,
resources, variables.

### 8a · Reviews on demand (optional)
`doc-kit facts --source api --source security --source quality`, then, LOCAL or DEMO only, `doc-kit probe
[--as <role>]…` (never production — ARCHITECTURE.md §6.13). Brief `security-review` (one `doc-kit-reviewer`):
authentication, access control (the `auth`/`guards` matrix against the probe), input handling, secrets,
findings tied to the OWASP Top 10. Brief `maintainability-review` (one `doc-kit-writer`): ratings, hotspots,
recommendations by effort, from `facts/quality.json`. Both end with `sync --mark`; their findings are candidates
for the risk register, like phase 8's.

### 8b · Translating (optional, with `languages`)
`doc-kit translate status` lists what each other language needs. For a batch of up to 6 pages of the SAME
target language: `doc-kit context <page>… --translate <lang>` (one dossier per page, no code), then one
`doc-kit-writer` per batch with brief `translate` (`{{lang}}`, `{{pages}}`, `{{contextFiles}}`); it ends with
`translate --fix-anchors`, `translate --mark`, `build --draft`. Never translate ids, directives, badges, code
spans, proofs or capture ids (ARCHITECTURE.md §6.12).

### 9 · Checks and review
`doc-kit build` (strict), `doc-kit check all`, `doc-kit audit` (target level 4 "Takeover"; with spaces, also "Level
by space"; with languages, also the "Translations" table), `doc-kit view <page> --theme dark`, `--tour 2`,
`doc-kit optimize` if heavy. **Read** `references/standard.md`.

### 10 · Delivery and maintenance
Maintaining-the-docs page up to date; `doc-kit connect --forget`; with spaces, `doc-kit export <target>
--with-dist` carries every export; `doc-kit sync --mark --all` records every page as checked at this version.
Checklist `{{KIT_PATH}}/standard/delivery.md`. Maintenance: see the cycle below.

## The update cycle (after an application release)

```
doc-kit facts [--network]          refresh the deterministic facts (zero tokens)
doc-kit sync                       report: proofs moved/broken, labels changed, pages to review by priority,
                                    stale captures, new/removed coverage, never-marked pages
doc-kit sync --apply [--labels]    mechanical fixes only (moved proofs, label replacements); never prose
doc-kit capture --stale --compare  retake only the captures sync flagged; unchanged pixels keep the old image
doc-kit context <pages> --update   one context file per flagged page, for triage and for the writer
```
Then **triage** (`doc-kit-triage`, haiku, read-only): `intact` → `sync --mark`; `edit`/`rewrite` → a wave of
**update** agents (`doc-kit-writer`, sonnet), each from its own context file, each ending with
`sync --mark <page> --sources …`. Then `doc-kit check all`, and `doc-kit build`. `sync --check` gates CI (exit 1
on anything but `unchanged`/`unmarked`).

## The economical conduct

An agent's cost ≈ its round-trips × its context size (cache reads dominate: each round-trip re-reads everything
read so far). A context folder cuts what one read costs; the **step budget** — how many extra reads it allows
itself, how many builds, whether it reviews a screenshot — cuts how many reads it takes, and is the bigger
lever: measured on a real application (FastAPI + Next.js, 81 pages), capping a writer at 3 targeted reads beyond
the context file and the page's template, one `Write`, one build, cut agent cost 69 % and wall-clock time 49 %
over the previous brief, same conformance (details: `references/agent-orchestration.md` §8).

- **The right agent for each brief**: `haiku` for a read-only decision (`triage`), `sonnet` for writing and
  updating, `opus` only where a wrong judgment costs every later page (`inventory`, `code-health`, `findings-
  verification`, `production-technical`).
- **Estimate before every wave**: `node scripts/brief.mjs <template> --estimate` for each brief of the wave (or
  `sync --estimate` for a maintenance wave), before launching a single agent.
- **Log every agent as it ends**: `node scripts/usage.mjs log --brief … --agent … --model … --tokens <n> …`, from
  what Claude Code reports — do this right after each completion notification, not in a batch at the end.
- **Report at the end of each phase**: `node scripts/usage.mjs report`, compared with the wave's estimate.
- **Never hand a writer the full inventory or table of contents**: give it `doc-kit context <page>` and the
  reference page instead; the inventory stays an orchestrator-only reading (phase 2 and phase 3 only).
- **Keep to the step budget**: an agent that would exceed it stops and says so in its report, rather than
  exploring further — `writing-batch` and `update` state their own budgets (3 and 1 extra reads per page).

## Non-negotiable rules

1. **Safe captures**: in production, read-only and navigation only; read a detail page's server code before
   opening it (server-side writes on GET); a refusal by the permission system is never worked around; stop when
   the session expires. Details: `references/capture-safety.md`.
2. **Nothing invented**: every label, default, permission and behaviour checked in the code (`file:line`) or a
   facts file (`[[verified]]`/`[[deduced]]`/`[[unknown]]`); exact labels in bold; gaps in a NOTE callout, never
   fixed in the application.
3. **Business pages cite no code**: no `file:line` in the business space; the technical reason lives on the
   page's `counterpart` in the takeover space instead.
4. **Reserved files**: an agent writes only its pages, capture plan and diagrams; `toc.json`, `glossary.json`,
   `features.json`, the config and the engine stay under central management (the orchestrator).
5. **No commit**, no destructive git command: the user commits. **Secrets**: never a value, even one visible in a
   fact file; the name and "(masked)".
6. **Session deleted** at the end of the campaign (`doc-kit connect --forget`), never copied or displayed.

## Reuse checklist

- [ ] Cadrage written (space(s), capture target, LLM prices if a cost is wanted); the owner's "real data" decision
  if production
- [ ] `init` + `doctor` green, `.doc-kit/` ignored, `facts/*.json` generated and committed
- [ ] Inventory saved (and `features.json` for a business space), outdated existing documentation flagged
- [ ] Toc with templates and spaces, coverage 100 %, `WRITING-GUIDE.md`, reference page(s) approved
- [ ] Batches defined (codes, prefixes, pages, reserved files), context files prepared, briefs generated and
  estimated
- [ ] Reports consolidated, duplicates settled, findings numbered as the risk register, pages and glossary fixed
- [ ] Journeys, troubleshooting, takeover dossier (code-health, access-ownership, production) written; 2nd
  consolidation done
- [ ] Strict build, `check all`, `audit` at the target level, light/dark review
- [ ] Maintaining-the-docs page up to date, session deleted, `sync --mark --all`, export done, nothing committed
- [ ] `usage.mjs report` compared with the wave estimates

## Pitfalls (the most costly)

- **Server-side write when a page is rendered**: the browser-side read-only block cannot stop it. Read the page's
  server code first, list such routes in `capture.forbidden`.
- **Outdated existing documentation**: never copy it, re-check everything in the code or the facts.
- **Giving a writer the full inventory**: slow and expensive; give context files instead (phase 5).
- **A business page citing `file:line`**: `build --draft` warns (`business.technical`); move the detail to the
  takeover `counterpart`.
- **Central files edited in parallel**: two agents writing the toc, the glossary or `features.json` at the same
  time lose one's work; everything goes through the reports.
- **Pages too long**: beyond the template's `maxWords`, `level: 2` sub-pages, while writing rather than
  afterwards.
- **Git Bash** turns an id starting with "/" into a Windows path: pass ids without a leading "/".
- **Masking** only knows the local `.env`: a production-only value is only guaranteed masked by reviewing the
  image.

Vibe-coded application risks (missing access control, no row-level security, secrets, nonexistent packages,
hidden agent-instruction specs…) and the full pitfall list and fixes: `references/pitfalls.md`.
