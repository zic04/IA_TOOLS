## In short

<!-- guidance: the short answer in 5 to 10 lines, or a numbered list of the mechanisms, with their real names (files, services, resources) and the version checked. Example: "The security of Acme Orders rests on five mechanisms, all on the server side: …" End with what protects nothing or does not exist, if relevant. -->

1. **First mechanism**: what it does, where it lives (`path/file.ts`).
2. **Second mechanism**: same.

## In this part

<!-- guidance: required as soon as the page has sub-pages (beyond about 2,000 words, split). One row per sub-page, in menu order; column 1 = a link to the sub-page. Delete the section when the page has no sub-page. -->

This page gives the overview. The detail is split into sub-pages, also reachable from the menu:

| Sub-page | What you will find there |
|---|---|
| Title of the sub-page | What it holds, in one sentence. |

## The diagram

<!-- guidance: optional. An SVG diagram in diagrams/ (viewBox 900 wide, only the site's d-* classes such as d-box, d-line, d-text, no hard-coded colour), with a caption that says how to read it; then 2 or 3 sentences of reading. -->

::diagram{id="diagram-name" title="Complete caption: what the diagram shows and how to read it."}

## First topic

<!-- guidance: rename this heading. One ## heading per topic, in the order in which the code chains them; tables, code blocks and HOW or WARNING boxes; every statement carries its file:line proof. Example: "## The middleware", "## HTTP headers and the content security policy". -->

| Element | Where | Detail |
|---|---|---|
| Name | `path/file.ts:12` | What it really does |

## Pitfalls and observed gaps

<!-- guidance: optional. The pitfalls in WARNING boxes, then the gaps between the code, the existing documentation and production, with their proof. Serious defects become numbered findings: cite their number (C1, I17…) instead of describing them again. -->

> [!NOTE] Observed gaps
> - Gap and proof (`path/file.ts:35-37`).

## Further reading

<!-- guidance: optional. 3 to 6 links to the neighbouring pages (journeys, troubleshooting, administration screens), each with what it holds. -->

- Title of the linked page: what it holds.
