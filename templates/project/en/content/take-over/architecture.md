## In short

<!-- guidance: in 5 to 10 lines, how {{name}} is built: the number of containers, the stack (languages, frameworks, database, storage, identity, external services), the layers of the code and the direction of their calls, and the version checked. Example: "A single container carries the screens, the API, the server actions and the database migrations." -->

1. **What runs**: the applications and their image.
2. **The stack**: languages, frameworks and versions (`package.json`).
3. **The layers**: from the screen to the database, and what each one is allowed to call.

## In this part

<!-- guidance: beyond about 2,000 words, split into sub-pages (for example the stack, the principles, the main flows) and list them here, column 1 = a link. Delete the section while the page has no sub-page. -->

This page gives the overview. The detail is split into sub-pages, also reachable from the menu:

| Sub-page | What you will find there |
|---|---|
| Title of the sub-page | What it holds, in one sentence. |

## The diagram

<!-- guidance: the big picture, as an SVG in diagrams/architecture.svg (viewBox 900 wide, only the site's d-* classes, no hard-coded colour), with a caption that says how to read it. -->

::diagram{id="architecture" title="The application, its layers and what it calls: database, storage, identity, external services."}

## First topic

<!-- guidance: rename this heading. One ## heading per topic: the architecture principles, the main flows (opening the application, the product's main action), development and production. Every statement carries its file:line proof. -->

| Element | Where | Detail |
|---|---|---|
| Name | `path/file.ts:12` | What it really does |

## Pitfalls and observed gaps

<!-- guidance: optional. The gaps between the code and the existing documentation of the repository (README, old diagrams), with their proof; serious defects go to the findings. -->

> [!NOTE] Observed gaps
> - Gap and proof (`path/file.ts:35-37`).

## Further reading

<!-- guidance: the technical architecture document, the findings, maintaining the documentation. -->

- [The technical architecture document](#/take-over/technical-architecture): the production setup.
- [The findings](#/take-over/findings): what to fix first.
