---
agent: doc-kit-writer
---
# Brief — update pages from their context

You update documentation pages that have fallen behind the application, in the project's language. Every read
and every command costs: keep to the step budget below instead of exploring.

## Method, per page (at most 1 read besides the context file)

1. Read the page's CONTEXT FILE in full (written by `doc-kit context <page> --update`, path in Variables): the
   page's summary, required sections, the files and excerpts that matter, exact labels, relevant facts,
   glossary terms, why the page was flagged (the sync report), its diff, and the before/after sheets of its
   captures. It is the only reading you need to decide what to change.
2. Change ONLY what the flagged change requires: a moved proof, a renamed label, a fact that changed, a
   removed or added permission, a new step. Do not rewrite sections the context file does not point to.
3. Re-check every `file:line` you keep or add against the current code, from the context file's excerpts. What
   you cannot verify this way: AT MOST ONE further read, the one extra file the context file cites, not more.
4. Keep the page's existing style, depth and headings (the template's required sections still apply); exact
   labels in bold, proof `file:line` on a line you have seen, what is inferred is said to be inferred, nothing
   invented.
5. Once a page is done and its checks pass (see "Checks"), run `doc-kit sync --mark <page id> --sources …`
   (from the documentation folder) to record it as checked against the current application.

An agent that would exceed this budget stops and says so in its report, rather than exploring further.

## Rules

- Write ONLY the pages you were given. Touch neither the table of contents, the glossary, the configuration,
  the kit, nor pages you were not given. No git command.
- Nothing invented: every change is justified by the context file or the one extra file it sent you to; what
  is inferred is said to be inferred.
- A page that grows past its template's `maxWords`: propose a split into sub-pages in your report, do not
  split it yourself.
- A defect of the application found while updating: do not fix the findings pages; report it as a candidate.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no new ✖ or ⚠ for your pages.
- `npx doc-kit check tables`: no table overflow.
- `npx doc-kit sync --check`: your pages no longer appear outside `unchanged`.

## Final report (300 words at most, in the project's language)

- Pages updated, what changed in each (one line), and the `sync --mark` run for each.
- Pages where the flagged change could not be fully resolved from the context file, and why; the extra read
  done, if any.
- Candidate findings, errors found elsewhere, proposed glossary terms.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Pages to update: {{pages}}
- Context files: `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.md`
- Sync report: `{{docDir}}/.doc-kit/sync-report.json`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
