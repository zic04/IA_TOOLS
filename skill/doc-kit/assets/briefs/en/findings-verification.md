---
agent: doc-kit-reviewer
---
# Brief — verifying and integrating findings

You are the ONLY one who writes in the findings of the documentation site: its parent page and its sub-pages
(see Variables for the path). Another agent fixes the other pages and the glossary AT THE SAME TIME: touch no
other file.

## Inputs

- The consolidation file (path in Variables): one section per writer (candidate findings, reported errors,
  proposed glossary), then "Duplicates found", already settled by the orchestrator.
- The code (path and version in Variables).
- The current findings: read the parent page (severities, definitions, counters, "The essentials in one
  minute", version note) and ALL its sub-pages, to know the numbers already taken and the format of each
  series.

## For each candidate

1. **Re-check in the code** every `file:line` cited; fix the line numbers that have moved. What the writer
   inferred stays "inferred" if you cannot observe it.
2. **Decide**, and write the decision down:
   - **new finding**: it takes the next number of its series (C critical, I important, M minor, or a thematic
     series the page defines, such as P for production-only findings);
   - **completes an existing finding**: enrich that one (proof, impact, recommendation) without a new number;
   - **merged**: settled duplicates ("inv 8 = tbl 1") become one finding, proofs combined, highest severity
     unless proven otherwise;
   - **rejected**: with the proof that the code does not confirm it.
3. **Classify** using the parent page's definitions. Guidelines: Critical = a current risk to security, privacy
   or the product's core promise; Important = a real defect, a possible bypass, a broken or misleading feature;
   Minor = debt, inconsistency, display, hygiene.
4. **Write** in the right sub-page, in the format already in place: a `## I40 — Title` section with **Finding**
   (and `file:line`), **Impact**, **Recommendation**, then a line **Owner** · **Decision** (fix, accept,
   transfer, avoid) · **Status** (open, in progress, done, accepted) · **Due** — the risk register that the
   findings page has become; or a table row with the same columns as the others, "Follow-up" combining Owner ·
   Decision · Status · Due in one column when four would not fit. A candidate with a suggested Decision (from a
   `code-health` or `access-ownership` report) keeps it unless the code shows otherwise; Owner starts "—" when
   no one proposed one. Internal links to ids of the table of contents only.

## Then

- Update the **counters**: the parent page's severity table, sentences that announce a range ("M1 to M44"), the
  introduction of each sub-page.
- Update "The essentials in one minute" if a new finding changes the priorities, and the version note (what
  this version integrates, where the findings come from, code version checked: see Variables).
- **Errors reported in the findings themselves** (an existing finding that is wrong or outdated): fix them with
  proof. A finding that the application has fixed moves to "Findings already fixed".

## Rules

- Write ONLY in the findings page and its sub-pages (path in Variables). Touch neither the table of contents,
  the glossary, other pages (not even to add a link), the kit, nor the application. No git command.
- Nothing invented: a severity is justified by the impact observed in the code or in production.
- Every candidate has a written outcome; none disappears silently.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages.
- `npx doc-kit check tables`: no table overflow.
- The counters equal the number of entries in each series (count them again).

## Final report (350 words at most, in the project's language)

- A candidate-to-decision table: `ord 2 → I41`; `tbl 3 → merged into I41`; `acc 9 → completes M6`;
  `ast 7 → rejected: <proof>`.
- New totals by severity and by series.
- Pages that should cite the new numbers (the orchestrator will add the links).
- Existing findings fixed or moved, with their proof.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Application code: `{{appDir}}`, version {{version}}
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Consolidation file: `{{consolidationFile}}`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
- Language: {{languageName}}
