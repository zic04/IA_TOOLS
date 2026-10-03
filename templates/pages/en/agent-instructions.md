## In short

<!-- guidance: how many instruction files, their overall size, and whether anything hidden was found. Generate the facts first: `doc-kit facts --source agents`. -->

Example: "One instruction file of a few hundred words; no hidden character found."

## The files

<!-- guidance: built from `::facts{source="agents"}`. -->

::facts{source="agents" columns="file,lines,words"}

<!-- doc-kit:prefill source="agents" -->
| File | Lines | Words | Hidden characters |
|---|---|---|---|
| `AGENTS.md` | `42` | `310` | `0` |

## Each rule

<!-- guidance: one row per rule the file states, its status once checked against the actual code: confirmed, obsolete (the code moved on), or contradicted (the code does the opposite). -->

| Rule | File:line | Status | Proof |
|---|---|---|---|
| Example rule | `path/file.md:12` | Confirmed | [[verified path/file.ts:5]] |

## Hidden characters

<!-- guidance: any character invisible to a human reviewer found inside an instruction file (ARCHITECTURE.md §6.9): a known prompt-injection trick. List each one; an empty section is good news, say so instead of deleting it. -->

No hidden character was found in any instruction file.

## What to keep

<!-- guidance: once every rule has a status, what to fold into this documentation and what the instruction file can safely drop. -->

- Keep the rules that match the code; drop the ones the code has moved past.
