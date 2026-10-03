# Method in detail — from an application to its documentation site

This file details phases 0 to 10 of `SKILL.md`: decisions to make, how each phase runs, expected outputs and real
orders of magnitude. Everything here was used on two real sites (called A and B below) before being generalised.
Examples use the fictional product **Acme Orders** (order management: orders, customers, approval workflow,
invoices, roles, administration, AI assistant; Next.js App Router; sign-in through an identity provider).

Contents: [Orders of magnitude](#orders-of-magnitude) · [0 Scoping](#0--scoping) · [1 Project](#1--set-up-the-project) ·
[2 Inventory](#2--code-inventory) · [3 Plan](#3--site-plan-and-reference-page) · [4 Captures](#4--captures) ·
[5 Writing](#5--writing-in-batches) · [6 Consolidation](#6--consolidation) · [7 Journeys](#7--end-to-end-journeys-and-troubleshooting) ·
[8 Takeover dossier](#8--takeover-dossier) · [9 Checks](#9--checks-and-review) · [10 Delivery](#10--delivery-and-maintenance) ·
[The update cycle](#the-update-cycle)

Sites A and B below predate the business/takeover spaces, `doc-kit facts` and `doc-kit sync` (ARCHITECTURE.md
§6.1a, §6.9, §6.10): their numbers stay a faithful lower bound for a single-space takeover-style site. Where this
file describes the business space, the takeover dossier or the update cycle, it gives the method, not a
fabricated statistic from a site that never used it.

## Orders of magnitude

| | Site A (business app, many screens) | Site B (few screens, very rich editors) |
|---|---|---|
| Pages | 170 (Use 44, Configure 18, Administer 27, Take over 81) | 115 (Use 11, Configure 52, Administer 14, Take over 38) |
| Captures | 213, all in **read-only production** (1,269 annotated elements) | 404 on a **prepared demo**, then 143 in production (947 zones) |
| SVG diagrams | 45 | more than 50 |
| Routes covered | 84/84 (`app/**/page.tsx`) | 83/83 (i18n registries) |
| Organisation | 8 writing batches; then 5 journeys and troubleshooting | 11 capture plans by application area + 1 production plan |
| Findings | 6 critical, 58 important, 57 minor, plus production-only and no-effect series | 135, 8 of them critical |
| Sub-pages | 37 added afterwards (threshold ≈ 2,000 words) | none (38 pages over their limit) |
| Home-page guided tours | 5 | 3 |
| HTML weight | 16.3 MB at 99 pages | 34 MB: too heavy for e-mail |

Site A's inventory listed 85 routes, 17 permissions and 9 roles, and proposed a 99-page plan; the final site has 170,
because sub-pages, journeys, troubleshooting and the architecture document came afterwards. Expect the initial plan to
grow by 50 to 70 % for the Take over section.

## 0 · Scoping

Decisions to make with the owner, **before any code**:

| Decision | Options | What depends on it |
|---|---|---|
| Space(s) | business · takeover · both | `spaces` in `content/toc.json` (ARCHITECTURE.md §6.1a); which of phases 5 and 8 apply |
| Audience | users, administrators, technical successors | the 4 sections: Use / Configure / Administer / Take over |
| Language | `en` or `fr` | `language` in `doc.config.mjs`, briefs `assets/briefs/<lang>/` |
| Cost tracking | tokens only · tokens + cost in a currency | `llm: { currency, prices }` in `doc.config.mjs` (ARCHITECTURE.md §6.11): the per-million-token price of each model in play |
| Capture mode | prepared demo · read-only production · none | `capture.target` (`init --target`), phase 4, safety, `capture.setup` |
| Visible data | real in clear · masked · fictitious | **written** decision of the owner; `masking.patterns` |
| Routes never to open | pages that write when rendered, customer data exports | `capture.forbidden` |
| Deliverable | HTML only · self-contained export of the folder | phase 10, `doc-kit export` |
| Access | who signs in (SSO, MFA), access window | `doc-kit connect` |
| Infrastructure | portal screenshots provided? infrastructure code readable? | phase 8 |

- Site A: "every capture on production, without any change", real data in clear by the owner's decision. The decision
  is written in the project's `WRITING-GUIDE.md` and repeated in every brief.
- Site B: a prepared demo (a setup script with fictitious names), then a separate production campaign with masking of
  customer cells and infrastructure hosts.
- Never a "do your best" on production: without a written decision, capture a demo or capture nothing.

**Ask the user** (AskUserQuestion when the tool is available) two questions, and act on the answers:

| Question | Answers | What follows |
|---|---|---|
| Where will the screenshots be taken? | local or demo application · production, read-only · no screenshots | `doc-kit init --target local\|demo` · `--target production --url <production address>` · `--capture none` |
| Open the browser now to sign in? (only with screenshots and a sign-in) | yes · later | `doc-kit connect`: the user signs in in the visible window and presses Enter · the command written in the decisions |

`--target production` writes `capture.readOnly: true`; the kit then refuses `readOnly: false`, refuses `doc-kit demo`,
prints a PRODUCTION banner before every `doc-kit capture` and asks for a confirmation (default No; `--yes` without a
terminal, once the user agreed). `doctor` shows the target and warns while `capture.forbidden` is empty.

## 1 · Set up the project

- `doc-kit init <app-dir>` creates `<app-dir>/docs/manual/` (`--dir` to change it). `<app-dir>` is the application
  **root**, even when the front end sits in `frontend/` or `web/`. It detects the framework, the product name (Next.js
  `metadata.title`, else `package.json` without its `-frontend`/`-web` suffix), the version file (`version.txt` or
  `VERSION` at the root first) and the `.env` files to mask, then asks for the product name, language, application
  URL, where the screenshots are taken (`capture.target`) and sign-in method (`--name`, `--lang`, `--url`, `--capture`,
  `--target`, `--auth`, `--framework` answer in advance; `--yes` asks nothing and opens no browser). In a terminal, it
  then offers to open the browser (`connect`) and a first test screenshot (`capture --preview`). Its **recap** is printed before anything is written, even with `--yes`: read it
  (renaming afterwards: `product.name` and the titles of `content/toc.json`). Running `doc-kit` with no command
  starts the **guided mode**, which detects the current state and proposes the next step.
- `app.dir` (written by `init`) is the application root given to the agents as `appDir`. With a **separate front
  end**, the coverage adapter only sees the front's routes: `brief.mjs` warns about it, and the inventory brief must
  also read the back end (API routes, permissions, writes while rendering).
- Complete `doc.config.mjs` (commented, fictional examples: `{{KIT_PATH}}/standard/config.md`):
  - `version`: file and pattern that give the application version (`{ file: "../../package.json", pattern, fallback }`);
  - `env.prefix`: also reads `<PREFIX>_URL`, `<PREFIX>_SESSION`, `<PREFIX>_PLANS`, `<PREFIX>_READONLY`;
  - `coverage`: one entry per adapter, with its options: `next-app-router` (`app`), `react-router` (`file`),
    `i18n-registry` (`source`, `messages`, `key`, one entry per registry), `glob` (`base`, `pattern`, `match`);
  - `masking.env`: the application's local `.env` (its values are masked in the images);
  - `capture.cookies` / `capture.storage`: language and theme set before each capture
    (for example `[{ name: "NEXT_LOCALE", value: "en" }]`);
  - `capture.forbidden`: route regular expressions never opened (filled after reading the detail pages' code).
- A project created before the kit keeps its French folders through `paths` (`contenu/`, `schemas/`); `doc-kit migrate`
  rewrites its JSON files in the current format.
- `doc-kit doctor`: Node, Chromium, kit range, config, paths, `.gitignore`, session, contrasts, installed skill. Nothing
  starts until it has no ✖ (exit code 3 environment, 2 configuration, 1 project).
- **Then, before any agent**: `doc-kit facts [--network] [--tools]` (ARCHITECTURE.md §6.9) reads the application's
  code and writes `facts/*.json` — `dependencies`, `env`, `api`, `db`, `agents`, `secrets`, `tests` — committed
  with the documentation project. It calls no LLM: a fact is what a pattern matched, not yet a judgment. This is
  the deterministic, zero-token half of phase 2 and the main input of phase 8's `code-health` and
  `access-ownership`; it costs nothing to run again after every later code change (phase "The update cycle").

### No-screenshot mode

When the scoping decides "capture mode: none" (no access to the application, sensitive data, a first quick pass):
`doc-kit init --capture none` (or `capture.mode: "none"` in `doc.config.mjs`). The skeleton then has no example
capture plan and no "interactive screens" callout; its pages, like those of `doc-kit new`, describe "The screen" with
a table `| Element | What it shows |`, one row per element in reading order, exact labels in bold. Skip phase 4;
`capture` and `connect` refuse to run, `doctor` and the guided mode stop asking for a session, the briefs tell the
writers to write tables (`screenshots=none`), and `audit` counts `annotated` as n/a, so level 2 stays reachable.
To add screenshots later: `capture.mode: "app"`, then phase 4, replacing each table with a `:::screen` whose legend
keeps the same items.

## 2 · Code inventory

- `doc-kit inventory --json > .doc-kit/inventory.json`: what the coverage adapters see. `doc-kit facts` (phase 1)
  has already run: the reviewer reads its output too, instead of re-deriving by hand what a fact file already
  states.
- One **`doc-kit-reviewer`** agent (read-only, "very thorough") with the `inventory` brief. It cannot write: save
  its report as is in `.doc-kit/inventory-<slug>.md`, which every later brief cites — except the batch writers of
  phase 5, who read their pages' context files instead (never the whole inventory: ARCHITECTURE.md §6.11).
- Expected content:
  1. real navigation (menu, administration, top bar, floating elements), with its source files;
  2. every route by section, with permissions, hidden pages, orphans and redirects;
  3. rich editors to document in depth (components, logic, services, data models);
  4. roles, scopes and the roles × permissions matrix — and where the truth lives (code or database);
  5. status of the existing documentation: what is **outdated** and why;
  6. pages that write while rendering (candidates for `capture.forbidden`);
  7. proposed site plan (id, title, routes, permissions, template) and batches.
- Lesson: on site A, a roles document in the repository announced 8 roles and 11 permissions (the code: 9 and 17), and a
  screen inventory described the mock-up, not the application. Writers are warned from the brief on: "always check in
  the code".
- **With a business space**: `doc-kit inventory --features --write` groups the adapters' routes, API routes and
  i18n keys into candidate features (by their first static segment, ARCHITECTURE.md §6.8), each a suggested
  `F-xx` id — a starting `features.json` for phase 3's plan and phase 5's `functional-spec` batches.

## 3 · Site plan and reference page

1. **Table of contents** (`content/toc.json`): sections, groups, pages (`id`, `title`, `menuTitle`, `summary`,
   `routes`, `permissions`, `template`); `level: 2` for a sub-page. Two ways that worked:
   - `doc-kit new <id> --template <type> --title "…" [--parent <id>]` page by page (skeleton + toc entry);
   - a small script that writes the whole toc at once (for example a helper `P(id, title, menuTitle, summary, routes,
     permissions)` with permission abbreviations taken from the inventory legend).
   **With both spaces**: declare `spaces: ["business", "takeover"]` and give each section a `space`
   (ARCHITECTURE.md §6.1a); a page's own `space` overrides its section's, and `counterpart` links a feature sheet
   to its technical page (and back).
2. **Coverage**: `doc-kit check coverage` must find each route in the `routes` field of a page (the `features`
   adapter too, when `features.json` exists: a feature is covered once a written `feature` page cites its id).
3. The project's **`WRITING-GUIDE.md`**: where the exact labels live, the reference page(s), capture prefixes,
   rules of the capture mode, decisions from scoping.
4. **Reference page(s)**: the orchestrator writes it (or one agent does), at the target level, and has it
   approved. Every brief asks to match it. A good business-space reference is a feature sheet with real business
   rules (`:::rule`) and a main scenario; a good takeover reference is an editor page: what it is for, how it
   works with the real mechanism, annotated screens, a reference of every setting, step by step, pitfalls,
   permissions (Acme Orders: `configure/approvals/chains`).
5. **Batches**: see `agent-orchestration.md`. Decide codes, prefixes, pages and reading lists of each batch, for
   both spaces.

## 4 · Captures

Common preparation:
- **Demo**: an idempotent setup script (`capture.setup`, run by `doc-kit demo`). Site B: accounts, logs and
  notifications inserted, two reference data sets, the AI assistant pointed at a fake provider.
- **Production** (`capture.target: "production"`): `doc-kit connect` opens a visible browser, the person signs in
  (SSO, MFA), presses Enter, and the session is written in `.doc-kit/`. Read `capture-safety.md` in full first. Each
  `doc-kit capture` shows the PRODUCTION banner and asks; an agent passes `--yes` only for a batch the user approved.
- Trial on the reference page: `doc-kit capture "<prefix>-*" --preview`, then look at each `<id>.zones.png`.

Two organisations worked:

| Organisation | When | Example |
|---|---|---|
| Each batch captures and writes its pages | stable access, many writers | site A (production), site B (demo) |
| A capture campaign produces a **manifest**, writers then work without access | short access window, sensitive production | site B production: `.doc-kit/production-manifest.md` (per capture: title, what the screen shows, notable values, each zone) plus the values read on administration screens |

Capture rules: 3 to 12 zones per screen, in reading order; `viewport: { height: 2200 }` and `frame` for long panels;
the `main` target for the area without the menu; small runs of 3 to 8 captures per command in production.

## 5 · Writing in batches

- **Before generating a brief**, for every page of the batch: `doc-kit context <page>` writes
  `.doc-kit/context/<page>.md` — dependencies, excerpts, exact labels, facts rows, glossary terms — the only
  reading a writer needs for the application (ARCHITECTURE.md §6.11); never hand it the whole inventory or
  table of contents instead. For a type that supports it (`variables`, `api-surface`, `data-model`,
  `dependencies`, `agent-instructions`), also `doc-kit new <id> --prefill` before the brief runs: the page's main
  table arrives already filled from the facts.
- One brief per batch, **estimated first**: `node scripts/brief.mjs writing-batch --estimate --project . --var
  code=u1 --var prefix=u1 --var pages=@.doc-kit/pages-u1.txt --var captureMode=production`, then the same without
  `--estimate` to write the file (`@` reads the value from a file). A business batch uses `functional-spec`
  instead (no capture-related variables, no `prefix`: it never takes a screenshot).
- Launch the agents (the type the brief's front matter names — `doc-kit-writer` for both of these two) in waves;
  each one only receives "Read the brief and carry it out". Log each one as it ends: `node scripts/usage.mjs log
  --brief writing-batch --agent doc-kit-writer --model sonnet --tokens <n> --pages u1-a,u1-b --phase 5`.
- Depth asked: "VERY detailed and educational": every screen element, every action, every setting (label, role, values,
  default, effect, permissions) and the real mechanism — for `writing-batch`. For `functional-spec`: every rule,
  every role, every step, in business language, with **no** `file:line` (`business.technical` warns otherwise):
  the technical mechanism belongs to the page's `counterpart`, written in phase 8.
- Every agent's final report has the same outline (pages, captures and zones, blocked writes, candidate findings,
  errors, glossary, not captured): it is pasted as is into the consolidation file.
- **Each writer ends its own pages with** `doc-kit sync --mark <page> --sources …`, once that page's checks pass,
  from the documentation folder: it records the page as checked against the current application, so that a later
  `doc-kit sync` (the update cycle) can tell it apart from a page nobody has touched since.
- An instruction discovered along the way is added to the briefs **and** sent to the agents already running (site A:
  "open no other order record" once a detail page was found to write when rendered).

## 6 · Consolidation

1. `node scripts/consolidation.mjs init --project . --codes u1,u2,u3 [--output .doc-kit/consolidation-<topic>.md]`.
2. Paste into each section the candidates, errors and glossary terms of the matching report.
3. `node scripts/consolidation.mjs duplicates --project . [--file …]`: candidates citing the same `file:line`, and
   existing findings already citing them. Settle by hand under "Duplicates found" (`inv 5 = tbl 2`).
4. Launch **in parallel** two agents, on disjoint files:
   - `findings-verification`: re-checks each candidate, integrates it (next number), merges or rejects it; updates the
     counters; the only one writing the findings pages. With a takeover space, the findings page is the risk
     register: a candidate that already carries a suggested Decision (from `code-health` or `access-ownership`)
     keeps it unless the code shows otherwise, and every new finding gets an Owner (start it "—" when none was
     proposed), a Status and a Due date;
   - `page-corrections`: fixes the errors reported in the other pages and adds the glossary terms.
5. Then the orchestrator runs `doc-kit build` (strict) and carries the new finding numbers into the pages that discuss
   them (the "candidate → number" table of the verification report).

Site A ran two consolidations: after the 8 batches, then after the journeys (5 writers, 37 candidates, 5 duplicates;
result: 8 new important and 13 new minor findings, and one production finding corrected).

## 7 · End-to-end journeys and troubleshooting

- The **reference journey** first, on the product's central object (Acme Orders: "the journey of an order", a parent
  page + 8 sub-pages from creation to archiving, diagram `t-order-journey.svg`). On site A two agents first produced
  **fact sheets** (steps 1-4 and 5-8; per step: trigger, synchronous or not, functions, writes, external calls, statuses,
  failures), then the pages were written. A notable fact found this way: uploading a file triggered none of the
  processing that a code comment promised.
- **Other journeys + troubleshooting in parallel** (Acme Orders: an invoice from issue to payment reminder, a question
  to the assistant, a user account, a dashboard figure, and troubleshooting by symptom; 5 agents). One brief per agent
  generated by `brief.mjs` (`journey`, `troubleshooting`). No new capture: 1 or 2 existing captures per page.
- **Troubleshooting** (site A: a parent page + 4 area sub-pages, 52 symptoms, a "where to start" tree, log queries):
  each symptom starts from the exact displayed message.
- Then a 2nd consolidation (phase 6), and the home-page guided tours (`journeys[]` in `content/toc.json`).

## 8 · Takeover dossier

Four disjoint agents, each able to start as soon as its own inputs are ready (none waits for another):

- **`code-health`** (one `doc-kit-reviewer`, from `facts/*.json`, ARCHITECTURE.md §6.9): `api-surface`
  (authentication and tenant isolation of every route, row-level security from `facts/db.json`), `dependencies`
  (packages that do not exist — `--network` checks each one against its public registry — licences, out of
  date), `agent-instructions` (every rule in `AGENTS.md`-like files, confirmed/obsolete/contradicted, hidden
  characters), `tests-quality` (critical flows with no test, tests that cannot fail), `threat-model` (STRIDE,
  grounded in what the other four pages found). Every gap is a numbered candidate for the risk register — read
  `pitfalls.md`'s "Vibe-coded applications" section first for what each check defends against.
- **`access-ownership`** (one `doc-kit-writer`, from `facts/secrets.json`, `env.json`, `dependencies.json`,
  `agents.json`): the page, with every asset's owner known or explicitly "to ask", and, in its final report
  (never on the page), the question list for the real owner — domain, repository, hosting, database, payment,
  e-mail, each AI tool account, each secret by name. The orchestrator relays the questions; the agent never
  contacts the owner.
- **`system-dossier`** (one `doc-kit-writer`, from `facts/db.json` and `facts/tool-knip.json` when present):
  `runbook` (install, build, deploy, roll back, scheduled jobs, backup and restore — every command checked in a
  script, a Dockerfile instruction or a CI workflow, never assumed); `data-model` (from `doc-kit new <id>
  --prefill` on `facts/db.json`: personal data, retention, processors); `code-map` (a C4-style context diagram,
  containers, components, integrations, duplicated or dead code); `adr`, one sub-page per reconstructed
  decision, its "How it was reconstructed" section naming the code, the existing document or the person's
  answer it rests on — never a bare "from the code". No git command: a decision's history comes from what is
  already readable (comments, `CHANGELOG.md`, an answer the orchestrator already obtained), not from running
  `git log` itself.
- **`production-technical`** (one `doc-kit-reviewer`), when portal screenshots are available: inputs are the
  screenshots provided by the owner (site A: the 24 resources of the group, 30 application variables, 7 of them
  vault references) and the infrastructure code, **read-only** (Terraform, Bicep, CloudFormation, Pulumi…).
  Pages: the technical architecture document (2 sub-pages, a diagram with 15 numbered flows), resources,
  production variables, variable gaps, secret store and monitoring. Provenance of every statement: "From the
  portal", the infrastructure tool's name, "Inferred", "To confirm". Production-only findings form the **P**
  series (site A: no e-mail could be sent, an API answering 401, a useless app service that still held
  permissions, an infrastructure state file holding secrets in clear).

## 9 · Checks and review

- `doc-kit build` (strict): links, anchors, legend = zones, required sections of templates, captures and diagrams
  present.
- `doc-kit check all`: coverage, links, tables (no overflow), images (orphans, heavy), secrets.
- `doc-kit audit`: score and maturity level (1 Skeleton → 4 Takeover), with the "to do for the next level" list;
  with `spaces` declared, also a "Level by space" table.
- Visual review: `doc-kit view <page> --theme light|dark`, `--tour 2` for the guided tour, diagrams in light and dark.
- `doc-kit optimize` when the HTML is heavier than what is easy to share.
- `node scripts/usage.mjs report`: totals the phase's cost by brief, agent type and model, against the waves'
  estimates — a large gap is worth understanding before the next phase repeats it.

## 10 · Delivery and maintenance

- The "maintaining the documentation" page is up to date: date and version of the capture campaign, procedure, detail
  pages already opened in production (site A: 10 records, which can be reopened without effect).
- Session deleted: `doc-kit connect --forget`. Nothing is committed by an agent.
- `doc-kit sync --mark --all`: records every written page as checked against this version, so the first run of
  the update cycle (below) after delivery reports `unchanged`, not `unmarked`, for all of them.
- `doc-kit export <target> --with-dist [--zip]` for a self-contained handover; with `spaces`, `--with-dist` also
  copies every per-space export; checklist `{{KIT_PATH}}/standard/delivery.md`.
- Maintenance after an application release: see "The update cycle" below. After a kit release: `doc-kit
  upgrade`, then `--apply`.

## The update cycle

What to run after an application release, so the documentation catches up without a full rewrite
(ARCHITECTURE.md §6.10-6.11); none of it calls an LLM before the triage step.

1. `doc-kit facts [--network]`: refresh the deterministic facts (zero tokens; skip sources that have not
   changed with `--source` if the application is large).
2. `doc-kit sync`: compares the application now with `sync.json` (or a git ref with `--since`) and writes
   `.doc-kit/sync.md`, `.doc-kit/sync-report.json` and one `.doc-kit/sync/<page>.diff` per flagged page — proofs
   moved or broken, labels whose value changed, pages to review by priority (`direct`, `shared`,
   `probablyIntact`), captures from a changed route, new or removed coverage elements, pages never marked.
3. `doc-kit sync --apply [--labels]`: the mechanical fixes only (a moved proof's line number, a changed label,
   both only inside bold text, code spans and badges) — never prose; restamps the pages left otherwise
   unchanged.
4. `doc-kit capture --stale --compare`: retakes only the captures `sync` flagged; a capture under the pixel
   threshold keeps its old image (no binary diff for git), only its zone file updates.
5. For every page still listed under `review` or `captures`: `doc-kit context <page> --update` writes its
   context file with, in addition to the usual content, why it was flagged, its diff, and its captures'
   before/after sheets.
6. **Triage** (`doc-kit-triage`, haiku, read-only, brief `triage`): one decision per page from its `--update`
   context file alone — `intact` (the orchestrator runs `sync --mark` on it, no agent needed), `edit` (a small,
   localised change) or `rewrite` (redo it from the context file). Estimate the wave first (`sync --estimate`);
   log each agent as it ends.
7. **Update** (`doc-kit-writer`, sonnet, brief `update`), one wave for the `edit` and `rewrite` pages: each
   changes only what its context file's flagged reasons require, then ends with `doc-kit sync --mark <page>
   --sources …`.
7a. With `languages` declared (ARCHITECTURE.md §6.12): `doc-kit translate status` after step 2 already lists
    what fell stale from the pages the cycle just touched (`sync`'s own report reminds of it too, category
    "translations"); batch the pages that need a translation the same way as phase 8b.
8. `doc-kit check all`, then `doc-kit build` (strict); `doc-kit sync --check` gates CI (exit code 1 on anything
   but `unchanged`/`unmarked`). `node scripts/usage.mjs report` against the cycle's estimate.

A facts file older than the application's current commit is reported stale by `sync`'s summary: re-run step 1
before trusting `code-health`'s next read of it.
