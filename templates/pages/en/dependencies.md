## In short

<!-- guidance: how many direct dependencies, in which ecosystems, and the headline risk (a package that does not exist, a licence that forbids the product's use). Generate the facts first: `doc-kit facts --source dependencies --network`. -->

Example: "A few dozen direct packages; one imported package does not exist in its registry."

## Direct dependencies

<!-- guidance: built from `::facts{source="dependencies"}`; `--network` adds `exists` (a registry lookup, name only). -->

::facts{source="dependencies" columns="name,version,ecosystem,direct,license"}

<!-- doc-kit:prefill source="dependencies" -->
| Package | Version | Role | Licence |
|---|---|---|---|
| `package-name` | `1.4.0` | What it is used for | MIT |

## Packages that do not exist

<!-- guidance: every direct dependency whose name was not found in its public registry (a vibe-coded hallucination, or a private package mistaken for a public one). -->

| Package | Imported in | Proof |
|---|---|---|
| Example package | — | [[deduced path/file]] |

## Licences

<!-- guidance: optional. Licences that need a decision (copyleft in a closed-source product, no licence declared). -->

| Package | Licence | Why it matters |
|---|---|---|
| Example package | GPL-3.0 | Copyleft, to review before shipping closed-source |

## Out of date

<!-- guidance: optional. Packages several major versions behind, especially ones with known fixes the project is missing. -->

- Example package is several major versions behind the current line.

## To check

<!-- guidance: optional. What a quick network check cannot settle by itself: a fork published under the original name, a package that exists but is unrelated to what the code expects. -->

- Confirm a package is the team's own and not an unrelated public one of the same name.
