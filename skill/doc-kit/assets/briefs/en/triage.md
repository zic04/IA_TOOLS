---
agent: doc-kit-triage
---
# Brief — triage of pages to update

For each page you are given, read its CONTEXT FILE in full (written by `doc-kit context <page> --update`,
path pattern in Variables): it is the only reading you need to decide. It already carries the page's summary,
required sections, the files and excerpts that matter, exact labels, relevant facts, glossary terms, and, with
`--update`, why the page was flagged (the sync report), its diff, and the before/after sheets of its captures.

## Decide, for each page

- `intact`: nothing in the context file points to a real change for this page; the orchestrator runs
  `doc-kit sync --mark` on it.
- `edit`: the change is small and localized (a moved proof, a renamed label, one fact that changed): a writer
  agent can patch it without rereading everything.
- `rewrite`: the change is structural, or touches most of the page (a removed feature, a new permission
  model, many facts changed): a writer agent should redo it from the context file.

One short sentence of reason per page, citing what changed (a route, a label, a permission, a diff hunk, or a
fact row).

## Rules

- Read-only: no write, no git command. Do not open files outside the context files; if a context file warns
  it was cut (over its token budget), do not go and read the missing excerpt yourself: decide from what the
  context file kept, and say in your reason that it was incomplete if that changes your decision.
- Nothing invented: a decision is justified by what the context file shows, not by a guess.
- Keep the pages in the order you were given them.

## Final report

A JSON object, one entry per page, in the order given: `{ "<page id>": { "decision": "intact"|"edit"|
"rewrite", "reason": "…" }, … }`. The orchestrator saves it as `.doc-kit/triage.json`: you write no file
yourself.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Pages to triage: {{pages}}
- Context files: `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.md` (one per page above, already updated
  with `--update`)
- Sync report: `{{docDir}}/.doc-kit/sync-report.json`
