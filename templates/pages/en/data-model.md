## In short

<!-- guidance: how many tables, which ones hold personal data, and whether row-level security is enforced. -->

Example: "A dozen tables; a few hold personal data; row-level security is enabled on all of them."

## The diagram

<!-- guidance: optional. An entity-relationship diagram (SVG) of the main tables. -->

::diagram{id="data-model" title="Main tables and their relationships."}

## Tables

<!-- guidance: built from `::facts{source="db"}`; add what a column means when its name is unclear. -->

::facts{source="db" columns="table,columns,rls,policies"}

<!-- doc-kit:prefill source="db" -->
| Table | Columns | What it holds | Proof |
|---|---|---|---|
| `table_name` | `id, name, created_at` | One row per customer order | [[verified path/schema.prisma:12]] |

## Personal data

<!-- guidance: every table and column holding personal data, its legal basis, and whether it is in scope of a privacy regulation. -->

| Table | Column | What it is | Legal basis |
|---|---|---|---|
| Example table | `email` | Contact e-mail | Contract |

## Retention

<!-- guidance: optional. How long each kind of personal data is kept, and whether anything actually deletes it. -->

- Example data is kept indefinitely; no deletion job was found ([[unknown]]).

## Processors

<!-- guidance: optional. Third parties that receive personal data (payment provider, e-mail sender, analytics). -->

| Processor | Data received | Contract reference |
|---|---|---|
| Example processor | Token, amount | — |

## Migrations

<!-- guidance: optional. How schema changes are applied (a migration tool, by hand), and the state of the migration history. -->

Migrations run automatically on deploy ([[verified path/file:1]]).
