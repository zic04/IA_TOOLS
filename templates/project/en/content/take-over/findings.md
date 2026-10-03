## How to read this page

<!-- guidance: the scope (gaps, risks and debts found at takeover), the version of the code re-checked and the date, the sources of the production findings; then the severity table with the number of findings; then the numbering rule. Numbers never change: a new finding takes the next free number of its family. -->

| Severity | Definition | Count |
|---|---|---|
| **Critical** | A current risk for data security, confidentiality or the product's core promise; to address before any other change | 0 |
| **Important** | A real defect, a possible bypass, a broken or misleading feature; to schedule quickly | 0 |
| **Minor** | Debt, inconsistency, display or hygiene; to address along the way | 0 |

Findings are numbered **C** (critical), **I** (important) and **M** (minor). Two families are added, with their severity in a column: **P**, specific to production (the real configuration differs from what the code expects), and **N**, settings and screens with no effect. (A French site uses **R** for this last family.)

## The essentials in one minute

<!-- guidance: 4 to 6 priority actions, each with the numbers of the findings it addresses. Example: "**Schedule the reminder job**: in production it has never run (C1)." -->

:::steps
1. **Priority action**: why, and the findings concerned (C1).
2. **Next action**: same.
:::

## In this part

<!-- guidance: optional. As soon as the list exceeds about 2,000 words, one sub-page per family: production (P), critical (C), important (I, possibly over two pages), minor (M), no effect (N). One row per sub-page; column 1 = a link. This page is a risk register: every finding also carries Owner (who decides), Decision (fix, accept, transfer, avoid), Status (open, in progress, done, accepted) and Due date. Format of a critical finding: "## C1 — title", then Finding, Impact, Recommendation, and a line "Owner · Decision · Status · Due". Format of the others: a No. · Point · Where · Finding and impact · Recommendation · Follow-up table, "Follow-up" combining Owner · Decision · Status · Due in one column (four separate columns rarely fit the reading width once Where and Recommendation are also tables; combine them, or move to sub-pages sooner). -->

| Sub-page | What you will find there |
|---|---|
| Critical findings | The C findings, each in detail: finding, impact, recommendation, and who owns the decision. |

## Findings already fixed

<!-- guidance: optional. The findings of earlier audits checked as fixed in the current code, with the proof. -->

| Original finding | Proof |
|---|---|
| The finding and the audit it comes from | `path/file.ts:111` |

## What could not be checked

<!-- guidance: optional. What the writers could not observe (access refused, production not viewed, a feature that cannot be triggered without writing): this is the list of questions to ask the team. -->

- What remains to be confirmed, and with whom.

## Existing documentation to stop following

<!-- guidance: optional. Each out-of-date document of the repository: its real state and the page that replaces it. -->

| Document | State | Replaced by |
|---|---|---|
| `docs/FILE.md` | What is wrong in it | The page of this site that replaces it |
