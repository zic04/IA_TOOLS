<!-- guidance: a technical sub-page has no "In short": the parent page carries it. It may open with a diagram, then chains one ## heading per mechanism, in the order in which the code runs them. Example (Acme Orders, security/sign-in): "## The sign-in flow", "## The identity provider", "## Mapping groups to roles", "## The session". -->

::diagram{id="diagram-name" title="Complete caption: what the diagram shows and how to read it."}

## First mechanism

<!-- guidance: rename this heading. The mechanism as the code runs it: a Value / Effect table for a setting, :::steps for a sequence, a file:line proof for every statement. Example: "The `AUTH_MODE` variable (read in `lib/auth/index.ts`) chooses the sign-in methods." -->

| Value | Effect |
|---|---|
| `value` (**default**) | What really happens |

## Second mechanism

<!-- guidance: rename this heading. For a sequence, one step per line, each with its proof. -->

:::steps
1. First real step (`path/file.ts:41`).
2. Second step.
:::

> [!WARNING] The pitfall, in one line
> What happens and why.

## Further reading

<!-- guidance: optional. The sibling pages and the parent page, each with what it holds. After a split, replace with a link every "below" or "above" that points to another page. -->

- Title of the linked page: what it holds.
