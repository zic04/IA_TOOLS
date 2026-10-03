## What it is for

<!-- guidance: in 2 to 4 sentences: the register of accounts, what you see there (role, scope, activity) and what you do there (deactivate, hand over the work of someone who leaves, delete). Example: "It shows who has access to the application, with which role and which scope." -->

> [!NOTE] Where to find this screen
> [[menu Administration › Users]] ([[route /example/users]]).

## How it works

<!-- guidance: where the accounts come from (first sign-in, pre-assignment, manual creation), what the server does to display the list (sorting, filters, accounts hidden by default), when a change of permissions applies (immediately or at the next sign-in), with the proof in the code. -->

> [!HOW] What the server does to display the list
> 1. First real step, in the order of the code.
> 2. Second step.
> 3. Third step.

## The screen

<!-- doc-kit:capture=app -->
<!-- guidance: one capture per view (list, delete dialog, hand-over dialog); as many items as captured zones, in reading order. Declare the "admin-users" capture in a plan of captures/plans/. -->

:::screen{capture="admin-users" title="Administration › Users"}
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

<!-- guidance: one ### subsection per action that writes: activate or deactivate, hand over, delete. For each one: the dialog, the server checks, what is written to the audit log. Never click these buttons on production: describe them from the code. -->

## Settings reference

<!-- guidance: one row per control of the screen. -->

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Label** | Switch | Possible values · default | What changes |

## Step by step: handling someone who leaves

<!-- guidance: from handing over their work to closing their access, including outside the application (identity provider). -->

:::steps
1. Open [[menu Administration › Users]].
2. Second action.
3. Check the result.
:::

## Common use cases

<!-- guidance: optional. Finding a person, giving a role, cleaning up: one line each. -->

:::steps
1. **Situation**: the actions, in order.
:::

## Pitfalls and limits

<!-- guidance: for example a menu counter that does not say the same thing as the list, a deletion refused by the server, a deactivation that does not close the access at the identity provider. Then the observed gaps. -->

> [!WARNING] The pitfall, in one line
> What happens, why, and how to avoid it.

> [!NOTE] Observed gaps (vX.Y.Z)
> - Gap between the screen, the documentation and the code (see `path/file.ts`; no line number here — this page is in the Business space, see writing.md §13).

## In production

<!-- guidance: optional. Number of accounts, accounts that never signed in, roles actually given, dated. -->

## Required permissions

<!-- guidance: the permission to open the screen, the one to change the accounts, and the shipped roles that carry them. -->

> [!PERMISSIONS] Who can do what on this screen
> - **Open** the screen: [[perm admin:access]].
> - **Change** the accounts: [[perm user:manage]].
