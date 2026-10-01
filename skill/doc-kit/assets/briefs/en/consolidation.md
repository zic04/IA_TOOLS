# Consolidation — {{topic}} ({{product}})

Summary file of the agents' reports, created on {{date}} by `consolidation.mjs init`. One section per writer: paste in
it, from their final report, the candidate findings, the reported errors and the proposed glossary terms.
Then: `node consolidation.mjs duplicates --project <docDir> --file <this file>` (in the skill's `scripts/` folder),
decisions under "Duplicates found", then the `findings-verification` and `page-corrections` agents, in parallel.

Conventions (the `duplicates` tool reads them):
- one candidate per numbered item: "1. Severity — finding: `path/file.ext:line`, `:other-line` (same file); possible
  link ("completes I14", "related to C1", "inferred")";
- proofs between backticks, as `file.ext:line` or `file.ext:start-end`;
- a page error: "`path/to/page.md`: "wrong sentence" → fix; proof";
- a term: "Term: one-sentence definition."

<!-- section:start -->
## {{sectionTitle}} ({{code}})

### Candidate findings
1. 

### Errors in existing pages
- 

### Proposed glossary
- 

<!-- section:end -->
## Duplicates found between writers

<!-- After `consolidation.mjs duplicates`: "inv 8 = tbl 1 (merge)", "acc 4 ≈ tbl 4 (related)", "severity to settle". -->
- 
