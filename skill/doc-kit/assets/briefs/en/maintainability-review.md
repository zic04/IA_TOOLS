---
agent: doc-kit-writer
---
# Brief — maintainability review

You write the `maintainability-review` page of the TAKEOVER space, in the project's language: the A-to-E ratings
(duplication, complexity, size, tests), the hotspots that combine them, and recommendations ordered by effort —
built from the `quality` facts, confirmed in the code before you state anything as fact.

Your page is ALREADY declared in the table of contents (see Variables): change neither its id nor its title.

## Your sources, in this order

1. **The facts** (folder in Variables, written by `doc-kit facts --source quality`; the orchestrator ran it
   before this brief — if it is missing, or older than the application's current commit, say so in your report
   instead of inventing numbers): `quality.json`'s `summary` (the four ratings, the tooling found) and `items`
   (per file: `lines`, `functions`, `longest`, `complexity`, `duplicated`, `todo`).
2. `tests.json` and `dependencies.json`, for the Tests and Dependencies sections — do not repeat the
   `tests-quality` or `dependencies` pages when they already exist for this project: cross-reference them.
3. **The application code**, read-only, for every file `quality.json` names as a hotspot: open it, read the
   function it flags, and say in plain language what makes it hard to follow — a number alone ("complexity 19")
   convinces nobody.

## The page

- `## In short`: the overall state in one paragraph — the worst rating, and whether a hotspot is also a known
  risk elsewhere (a security finding, a critical flow with weak tests).
- `## Ratings`: a table, the four letters (A to E) with their measure, from `quality.json`'s `summary`.
- `## Hotspots`: `::facts{source="quality" columns="file,lines,functions,longest,complexity,duplicated,todo"}`,
  then, for the two or three files that combine the worst numbers, what you found reading the actual function —
  not just the metric.
- `## Duplication` (optional): the largest duplicated blocks, confirmed by reading both occurrences; whether they
  have already drifted apart.
- `## Complexity` (optional): the most complex functions, what makes them hard to follow, and whether the tests
  actually exercise their branches (read the test file, do not assume from a count alone).
- `## Tests`: the test ratio, and the gap between "has a test" and "the test checks something" — cross-reference
  `tests-quality` rather than repeating it.
- `## Dependencies` (optional): direct dependencies behind their latest version; cross-reference `dependencies`.
- `## Recommendations`: ordered by effort, quick win first, each pointing back to a hotspot above.

## Rules

- Nothing invented: every hotspot and every recommendation traces back to a row of `quality.json`, confirmed by
  reading the file it names.
- Write ONLY your page (path in Variables). No fix to the application, no other page, no git command.
- A hotspot that is also a security concern (a complex function that is also an access-control gap) is a
  **candidate finding** in your report, cross-referenced rather than duplicated if it is already numbered.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your page.
- Once the checks pass, run `npx doc-kit sync --mark <page id> --sources …`, naming the facts files and the
  application files you read.

## Final report (300 words at most, in the project's language)

1. The page written (word count); the four ratings.
2. The hotspots confirmed in the code, and anything `quality.json` flagged that the code did not actually bear out.
3. **Candidate findings**: a hotspot that is also a security or reliability concern, with its proof.
4. Proposed glossary terms.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Application code: `{{appDir}}`, version {{version}}
- Facts folder: `{{factsDir}}`
- Your page: {{pages}}
- Page template: `{{kitPath}}/templates/pages/{{language}}/maintainability-review.md`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Language: {{languageName}}
