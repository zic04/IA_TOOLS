<!-- guidance: sample page. Rename and move it with its business counterpart (features/example-feature.md). A technical sub-page has no "In short": the parent page (take-over/architecture) carries it. Chain one ## heading per mechanism, in the order the code runs them, each with its file:line proof. -->

## What triggers it

<!-- guidance: the server-side trigger for [[feature F-01]] — a route, a server action, a scheduled job — with its proof. -->

| Trigger | Where | Proof |
|---|---|---|
| Example trigger | `path/file.ts` | `path/file.ts:12` |

## What it reads and writes

<!-- guidance: the tables or records read and written, in the order the code touches them. -->

:::steps
1. First real step (`path/file.ts:41`).
2. Second step, with its proof.
:::

## Claim status

<!-- guidance: optional. A statement that was not read directly in the code is marked [[deduced]]; one nobody could check yet is marked [[unknown]] (ARCHITECTURE.md §6.9). Delete this section once every statement above carries its own inline proof instead. -->

The retry behaviour on failure is [[deduced]] from the absence of a dead-letter queue; whether it is tested is
[[unknown]].

## Further reading

<!-- guidance: the business feature sheet (its counterpart, shown automatically at the top of this page), the parent architecture page, and any sibling sub-page. -->

- [Architecture overview](#/take-over/architecture): the parent page.
