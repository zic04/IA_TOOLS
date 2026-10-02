## What it is for

<!-- guidance: the business need in 2 to 4 sentences, with the exact name of the screen in bold, then the "Where to find this screen" box. Example: "**Orders** is the entry point to the sales activity: the list of every order you are allowed to see." -->

> [!NOTE] Where to find this screen
> [[menu Area › Screen]] ([[route /example/screen]]).

## How it works

<!-- guidance: the real mechanism, read in the code: who computes (server or browser), in which order, with which limits, and what the user sees change. Example: "The list is computed by the server on every filter change, 15 rows per page." -->

> [!HOW] What the server does to display the screen
> 1. First real step, in the order of the code.
> 2. Second step.
> 3. Third step.

## The screen

<!-- doc-kit:capture=app -->
<!-- guidance: one interactive capture per panel (### subheadings if there are several). The list has EXACTLY as many items as the capture has zones (3 to 12), in reading order. Each item: the exact label in bold, then its role, values, default and effect, in 1 to 3 sentences. -->

:::screen{capture="capture-id" title="Area › Screen"}
1. **Exact label**. Role, values, default, effect.
2. **Exact label**. Role, values, default, effect.
3. **Exact label**. Role, values, default, effect.
:::
<!-- doc-kit:capture=none -->
<!-- guidance: no screenshot in this project (capture.mode "none"): one table per panel or dialog (### subheadings if there are several), one row per element in reading order, from top to bottom, then from left to right. Each row: the exact label in bold, then its role, values, default and effect, in 1 to 3 sentences. -->

| Element | What it shows |
|---|---|
| **Exact label** | Role, values, default, effect. |
| **Exact label** | Role, values, default, effect. |
| **Exact label** | Role, values, default, effect. |
<!-- doc-kit:end -->

## Each action

<!-- guidance: optional. One ### subsection per action that needs more than the 3 sentences of a legend: dialog, confirmation, server check, audit entry. Example: "### Handing over the orders of someone who leaves". Delete the section when the legend is enough. -->

## Settings reference

<!-- guidance: one row per visible setting; values and defaults read in the code (validation schemas, components). One table per group of settings when the screen has several. -->

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Label** | List | Possible values · default | What changes |

## Step by step: name of the task

<!-- guidance: the most frequent task, in 4 to 7 steps that start with an imperative verb. Example: "Open [[menu Orders › All orders]] and click **Filters**." -->

:::steps
1. Open [[menu Area › Screen]].
2. Second action.
3. Third action.
:::

## Common use cases

<!-- guidance: optional, instead of or in addition to the step by step: 3 to 5 real situations, one line each, "Situation: actions". Example: "**Someone leaves**: click the **Hand over** icon, pick the **Successor**, then **Transfer**." -->

:::steps
1. **Situation**: the actions, in order.
:::

## Pitfalls and limits

<!-- guidance: one WARNING box per real pitfall, titled with the pitfall in one line; then the NOTE box of observed gaps, with the version and one file:line proof per gap. Describe the gap; never fix the application from the documentation. -->

> [!WARNING] The pitfall, in one line
> What happens, why, and how to avoid it.

> [!NOTE] Observed gaps (vX.Y.Z)
> - Gap between the screen, the documentation and the code (`path/file.ts:42`).

## In production

<!-- guidance: optional. What is actually configured in production, dated and sourced (a screen viewed read-only). Example: "On 1 October 2026, 38 accounts, 14 of which never signed in." Delete the section when production was not observed. -->

## Required permissions

<!-- guidance: always the last section. Distinguish viewing, saving and the special actions, with the permission codes and the roles that ship with the product. -->

> [!PERMISSIONS] Who can do what on this screen
> - **View** the screen: [[perm module:read]].
> - **Save**: [[perm module:write]].
> - **Special actions**: the permission and what it unlocks.
