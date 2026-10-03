## In short

<!-- guidance: the shape of the codebase in one paragraph: one repository or several, one main language or a mix, a front end and a back end or a single process. -->

Example: "A single repository: a front end and a back end, sharing one database."

## Context

<!-- guidance: the application among the systems it talks to (users, other systems, external services); a system context diagram if one helps. -->

::diagram{id="code-context" title="The application and the systems it talks to."}

## Containers

<!-- guidance: the deployable units (front end, back end, database, queue, scheduled jobs), each with its technology and where its code lives. -->

| Container | Technology | Code |
|---|---|---|
| Front end | — | `path/` |

## Components

<!-- guidance: inside the main container(s), the modules that matter for a newcomer: where the business logic lives, where the data access lives. -->

| Component | Role | Code |
|---|---|---|
| Example component | What it does | `path/file.ts` |

## Integrations

<!-- guidance: optional. Every external system called from the code (payment, e-mail, another internal service), with the file that calls it. -->

| System | Called from | Proof |
|---|---|---|
| Example system | `path/file.ts` | [[verified path/file.ts:18]] |

## Duplicated or dead code

<!-- guidance: optional. Near-identical modules written by successive AI sessions instead of being reused, and code that nothing calls. -->

- Two modules duplicate the same logic ([[verified path/file.ts:1]]).
