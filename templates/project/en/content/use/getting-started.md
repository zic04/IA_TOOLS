## What it is for

<!-- guidance: in 2 to 4 sentences, what users find when they arrive in {{name}} and how they find their way. Example: "After signing in, {{name}} opens on the dashboard: the side menu leads to every area, the top bar to the search and to your account." -->

> [!NOTE] Where to find this screen
> The home screen, right after signing in ([[route /]]).

## How it works

<!-- guidance: what happens at sign-in (single sign-on or password, account created at the first sign-in, role given), and what decides what the user sees (role, permissions, scope), with the proof in the code. -->

> [!HOW] What happens at the first sign-in
> 1. First real step, in the order of the code.
> 2. Second step.
> 3. Third step.

## The screen

<!-- guidance: the "home" capture is declared in captures/plans/example.mjs with 3 zones (top bar, menu, content): the legend has 3 items. Change the zones and the legend together, then capture with the preview option (see "Maintaining this documentation"). -->

:::screen{capture="home" title="{{name}} › home screen"}
1. **Top bar**. Search, language, theme and account menu: role, values, effect.
2. **Menu**. The areas of the application, depending on the user's permissions.
3. **Content of the screen**. What the user sees first, and where the figures come from.
:::

## Each action

<!-- guidance: optional. One ### subsection per getting-started action that needs more than a legend: signing in, searching, changing the language, signing out. Delete the section otherwise. -->

## Settings reference

<!-- guidance: optional on this page. The user's preferences (language, theme, text size, notifications), with their values and their default read in the code. -->

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Label** | List | Possible values · default | What changes |

## Step by step: signing in for the first time

<!-- guidance: the first sign-in, in 4 to 6 steps, up to the home screen. -->

:::steps
1. Open the address of the application.
2. Second action.
3. Check that the menu shows the expected areas.
:::

## Common use cases

<!-- guidance: optional. 3 to 5 getting-started situations, one line each. Example: "**Find a screen**: type its name in the search." -->

:::steps
1. **Situation**: the actions, in order.
:::

## Pitfalls and limits

<!-- guidance: the pitfalls of the first sign-in (account created without permissions, empty menu, language), then the observed gaps with their proof. -->

> [!WARNING] The pitfall, in one line
> What happens, why, and how to avoid it.

> [!NOTE] Observed gaps (vX.Y.Z)
> - Gap between the screen, the documentation and the code (`path/file.ts:42`).

## In production

<!-- guidance: optional. The sign-in method actually configured in production, dated. Delete the section when production was not observed. -->

## Required permissions

<!-- guidance: what an account without any permission sees, and the minimal permission to use the application. -->

> [!PERMISSIONS] Who can do what on this screen
> - **Sign in**: any active account.
> - **See the areas**: the read permission of each area.
