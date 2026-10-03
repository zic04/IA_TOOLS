---
agent: doc-kit-writer
---
# Brief — system dossier: runbook, data model, code map, ADR

You write part of the TAKEOVER space, in the project's language: how the system is installed, built, deployed
and restored; what data it holds; how its pieces fit together; and the decisions that shaped it, reconstructed
after the fact. These pages complete `code-health` and `access-ownership` (ARCHITECTURE.md §6.9).

Your pages are ALREADY declared in the table of contents (see Variables for which ones): change neither ids nor
titles.

## Read first

1. Your pages' context files (path pattern in Variables, written by `doc-kit context <page>` when the
   orchestrator ran it before this brief): the files to read with excerpts, exact labels and the relevant facts
   rows — the reading you need for the application, besides what is listed below.
2. For `data-model`, the orchestrator may already have run `doc-kit new <id> --prefill`: a "Tables" table
   pre-filled from `facts/db.json`, with a `<!-- doc-kit:prefill -->` marker above it. Complete it (what each
   table holds, personal data, legal basis); never remove a prefilled row without checking it in the code first.
3. **The facts** (folder in Variables): `db.json` (tables, columns, row-level security) for `data-model`;
   `tool-knip.json`, when `doc-kit facts --tools` produced it (unused files and exports) for `code-map`'s
   "Duplicated or dead code" — when it is absent, find duplication by reading, never guess at a percentage.
4. The existing takeover pages — `api-surface`, `dependencies`, `access-ownership` (paths in Variables) — for
   cross-references instead of repeating their proof, and the findings page for numbers already taken.
5. The application's own scripts, Dockerfile, CI configuration and migration folder (`package.json` scripts,
   `Dockerfile`, `.github/workflows/` or similar), for `runbook`.
6. Any further reading listed in Variables (an existing `CHANGELOG.md`, a design note, an answer the orchestrator
   already got from a person), for `adr`'s reconstruction.

## What each page holds (write only those listed in Variables)

- **`runbook`**: `## In short`; `## Install` (`:::steps`, the exact commands and the versions they need);
  `## Build` (optional); `## Deploy` (the real path: a pipeline name or a manual command, with the `file:line`
  of the pipeline definition); `## Roll back` (redeploy the previous version, a migration's own rollback, a
  feature flag — whichever the repository actually offers); `## Scheduled jobs` (optional, a table Job ·
  Schedule · What it does · Proof); `## Backup and restore` (where backups are taken, how often, and the actual
  restore procedure — say plainly when it has never been tested); `## When it breaks` (optional). Every command
  is one you found in the repository (a script, a workflow file, a Dockerfile instruction): never one you only
  assume exists because it is common elsewhere.
- **`data-model`**: `## In short`; `## The diagram` (optional, your own entity-relationship SVG,
  `::diagram{id="data-model"}`); `## Tables` (`::facts{source="db"}`, then the prefilled table completed by
  hand: what each table holds, in plain language); `## Personal data` (every table and column that holds it, its
  legal basis, table `Table · Column · What it is · Legal basis`); `## Retention` (optional, how long it is kept
  and whether anything actually deletes it — `[[unknown]]` when no deletion job was found); `## Processors`
  (optional, third parties that receive personal data — payment, e-mail, analytics — from the code or
  `facts/dependencies.json`); `## Migrations` (optional, how schema changes are applied).
- **`code-map`**: `## In short`; `## Context` (the application among the systems it talks to, a C4-style
  container view, `::c4{}`, drawn from the facts with the evidence of each element; a hand-drawn
  `::diagram{id="code-context"}` only when the facts miss a system); `## Containers` (the deployable units — front end,
  back end, database, queue, scheduled jobs — table `Container · Technology · Code`); `## Components` (optional,
  only for the container(s) a newcomer most needs oriented in: where the business logic and the data access
  live); `## Integrations` (optional, every external system called from the code, with the file that calls it);
  `## Duplicated or dead code` (optional: near-identical modules written in separate sessions instead of reused,
  and code nothing calls — from `facts/tool-knip.json` when present, else what you found reading the code, each
  cited by `file:line`).
- **`adr`** (one per reconstructed decision, as a sub-page — path in Variables): `## Status` (a reconstructed
  ADR is never "Proposed": "Accepted (reconstructed from the code, not from an original discussion)", unless the
  reading listed in Variables gives you a real discussion to cite); `## Context` (the problem the decision
  answers, as the code and the reading listed in Variables let you reconstruct it); `## Decision` (one or two
  sentences, with the proof that this really is what the code does); `## Consequences` (what it makes easy, what
  it makes harder, what it rules out); `## How it was reconstructed` (which code, which existing document or
  which person's answer led you to this page — mandatory and specific, never "from the code" alone when you can
  name the file).

## Rules

- Write ONLY your pages (content folder, path in Variables) and, for `code-map`/`data-model`, your diagram when
  one is asked. Touch neither the table of contents, the glossary, the configuration, the kit, nor other pages.
  **No git command**: reconstruct `adr` from the code, an existing document, or an answer already given to you
  (Variables) — never by running `git log` or `git show` yourself.
- Nothing invented: a command in `runbook` is one you read in the repository; a table or column in `data-model`
  comes from `facts/db.json` or the code; a container or integration in `code-map` is one you traced from an
  import or a call. What you cannot verify is **inferred**, and an ADR you cannot ground in anything but the
  code's current shape says so under "How it was reconstructed".
- A gap found (no tested restore procedure, a table with personal data and no retention rule, a duplicated
  module) is a **candidate finding** in your report, after checking it is not already a numbered one.
- Once a page's checks pass, run `npx doc-kit sync --mark <page id> --sources …` (from the documentation
  folder), naming the application and facts files you used: this records the page as checked against the
  current application.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages.
- `npx doc-kit check tables`: no table overflow.

## Final report (300 words at most, in the project's language)

1. Pages written (words); tables, containers or decisions covered, by page.
2. **Candidate findings**: severity — finding — proof (`file:line` or a named facts file).
3. Facts that looked missing (no `tool-knip.json`, a `db.json` older than the application), and what you could
   not confirm without them.
4. Errors in existing pages (file, sentence, proof); proposed glossary terms.

## Variables

- Product: {{product}}
- Batch: {{code}}
- Documentation folder: `{{docDir}}`
- Application code: `{{appDir}}`, version {{version}}
- Facts folder: `{{factsDir}}`
- Your pages: {{pages}}
- Context files: `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.md` (one per page above, when the
  orchestrator prepared them)
{{#if diagram}}- Your diagram: `{{diagramsDir}}/{{diagram}}.svg`
{{/if}}{{#if reads}}- Also read: {{reads}}
{{/if}}- Page templates: `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Writing standard (diagram classes): `{{kitPath}}/standard/writing.md`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Language: {{languageName}}
