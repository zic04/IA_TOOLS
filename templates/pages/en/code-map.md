## In short

<!-- guidance: the shape of the codebase in one paragraph: one repository or several, one main language or a mix, a front end and a back end or a single process. -->

Example: "A single repository: a front end and a back end, sharing one database."

## Context

<!-- guidance: the application among the systems it talks to (users, other systems, external services). `::c4` draws them from the facts (`doc-kit facts --source dependencies --source env --source db`), each with its evidence; add a hand-drawn `::diagram` only for a system the facts cannot see (an internal service called by URL, a queue). -->

::c4{}

## Containers

<!-- guidance: the deployable units (front end, back end, database, queue, scheduled jobs), each with its technology and where its code lives. -->

| Container | Technology | Code |
|---|---|---|
| Front end | — | `path/` |

## Components

<!-- guidance: inside the main container(s), the modules that matter for a newcomer: where the business logic lives, where the data access lives. The import graph (`doc-kit facts --source modules`) lists the files most depended on first, and the import cycles to untangle. -->

::modules{}

| Component | Role | Code |
|---|---|---|
| Example component | What it does | `path/file.ts` |

## Integrations

<!-- guidance: optional. Every external system called from the code (payment, e-mail, another internal service), with the file that calls it: start from the systems `::c4` found, then add the call site of each. -->

| System | Called from | Proof |
|---|---|---|
| Example system | `path/file.ts` | [[verified path/file.ts:18]] |

## Duplicated or dead code

<!-- guidance: optional. Near-identical modules written by successive AI sessions instead of being reused, and code that nothing calls. -->

- Two modules duplicate the same logic ([[verified path/file.ts:1]]).
