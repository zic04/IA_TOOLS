## In short

`content/glossary.json` lists the terms of the product. In every page, the **first occurrence** of each term gets a
dotted underline and a tooltip with its definition; the same term later in the page is left alone.

```json
[
  { "term": "Approval chain", "pattern": "approval chains?", "def": "The ordered list of people who approve an order before it is sent." },
  { "term": "Scope", "pattern": "scopes?", "def": "The customers and orders a user is allowed to see, set by their team." }
]
```

| Field | Required | Role |
|---|---|---|
| `term` | yes | The term, shown in bold at the top of the tooltip |
| `def` | yes | One sentence, understandable without the rest of the site |
| `pattern` | no | A JavaScript regular expression for plurals and variants (flags `i` and `u` are added); default: the term itself |

## What gets a tooltip

- Whole words only: `scope` does not match inside `telescope`.
- Never in headings, links, code, key caps, badges, captions, table headers or diagrams.
- Each term once per page, at its first match in reading order.
- The search does not use the glossary; the reader hovers or focuses the term (it is reachable with the keyboard).

## Choosing the terms

A term enters the glossary when it has a meaning **specific to the product** ("Approval chain", "Scope") or when it
is **ambiguous** ("Delegate": a person who approves on someone else's behalf, not a role). Do not define common
words of the trade: a tooltip on every other word tires the reader.

`doc-kit audit` counts the terms: at least 1 for level 1, at least 20 for level 3. The glossary is managed
centrally: when several people write, they propose terms with their definition, and one person adds them.

## Pitfalls and observed gaps

> [!WARNING] A pattern that matches too much
> A word is whole when it is not glued to a letter, a digit or `_`: `"pattern": "orders?"` also matches the
> "orders" of "back-orders", and `"pattern": "app"` matches every "app" of the site. Prefer the exact term, with its
> plural.

> [!CAUTION] An invalid pattern stops the build
> "glossary: invalid pattern for “Scope” (…)": the pattern is a regular expression; escape `(`, `)`, `.` and `?`
> when you mean them literally.

> [!NOTE] Legacy files
> A legacy `glossaire.json` (`terme`, `motif`, `def`) is read as it is; `doc-kit migrate` rewrites it as
> `glossary.json`.

## Further reading

- [Table of contents, sub-pages and journeys](#/write/table-of-contents): the other central file of the content.
- [Audit and maturity levels](#/publish/audit): the `glossary` indicator.
