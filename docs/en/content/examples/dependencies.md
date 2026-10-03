> [!NOTE] About this example
> This page is the example of the `dependencies` template, written for Acme Orders, the kit's fictional product. The table below is generated from `facts/dependencies.json`, written by `doc-kit facts --source dependencies --network`.

## In short

5 packages shown here (the full list runs to a few dozen); one direct dependency, `acme-date-helpers`, does not exist in the npm registry — a likely AI-assistant hallucination, since the project only ever imports `acme-date-utils`.

## Direct dependencies

::facts{source="dependencies" columns="name,version,ecosystem,direct,license"}

## Packages that do not exist

| Package | Imported in | Proof |
|---|---|---|
| `acme-date-helpers` | `package.json`; imported as `acme-date-utils` in the code, a different name | [[verified lib/services/approvalService.ts:3]] |

## Licences

| Package | Licence | Why it matters |
|---|---|---|
| `prisma` | Apache-2.0 | Permissive, no action needed |

No copyleft licence was found among the direct dependencies.

## Out of date

- `next` 14.2.3 is one minor version behind the latest 14.2.x; no breaking change applies.

## To check

- Confirm with the author of `lib/services/approvalService.ts` whether `acme-date-utils` is an internal package never published, or a typo for `acme-date-helpers`; either way, `package.json` should name the package that is actually imported.
