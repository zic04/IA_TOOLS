# Brief — correcting pages and the glossary ({{product}})

You fix the errors reported by the writers in the pages of the documentation site of **{{product}}**, and you add the
proposed glossary terms. Another agent integrates the findings AT THE SAME TIME in
`{{contentDir}}/{{findingsPage}}.md` and its sub-pages: do not touch those files.

## Inputs

- `{{consolidationFile}}`: in each writer's section, "Errors in existing pages" and "Proposed glossary".
- The code: `{{appDir}}`{{#if labels}}; exact interface labels: `{{labels}}`{{/if}}.
- `{{guideFile}}`, and `{{glossaryFile}}` (one entry: `term`, `def`, optional `pattern`; a project created before the
  kit may use `glossaire.json` with `terme`, `def`, `motif`: keep the keys the file already uses).

## For each reported error

1. Read the sentence in the page again and **re-check in the code**. The report has no more authority than the page:
   only the code decides; for a production fact, an existing screenshot.
2. **Confirmed**: fix it as narrowly as possible (the sentence, the table row, the legend item), in the page's style;
   cite the proof if the page cites its proofs. Do not rewrite the page.
3. **Not confirmed**: change nothing; keep the proof for your report.
4. A `:::screen` legend keeps exactly as many items as the screenshot has zones.
5. An error that reveals a defect of the application is not only fixed in the page: report it as a candidate finding.

## Glossary

- Add each proposed term if it does not exist yet, even in another form; otherwise improve the existing definition if
  it is wrong or vague.
- A definition = one correct sentence, without undefined jargon; `pattern` only when the term appears in several forms.
- Fix the definitions reported as wrong (for example a definition that confuses "hidden on screen" with "removed on the
  server").

## Rules

- Write ONLY in the pages cited by the consolidation (except `{{findingsPage}}` and its sub-pages) and in
  `{{glossaryFile}}`. Touch neither `{{tocFile}}`, the kit, nor the application. No git command.
- Internal links: ids of `{{tocFile}}` only; an anchor must exist.
- Nothing invented.

## Checks (from `{{docDir}}`)

- `npx doc-kit build --draft`: no new ✖ or ⚠; `npx doc-kit check links`; `npx doc-kit check tables`.
- `{{glossaryFile}}` stays valid JSON (the build reads it).

## Final report ({{languageName}}, 300 words at most)

- Fixes made: file, before → after (short), proof.
- Reports rejected: file, sentence, proof.
- Terms added or corrected.
- Defects to pass on as candidate findings.
