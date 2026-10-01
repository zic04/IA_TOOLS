<!-- guidance: sample page. In content/toc.json, rename its id and its title after the first editor of {{name}}, move this file accordingly, then fill in every section and remove its guidance. -->

## What it is for

<!-- guidance: the business need in 2 to 4 sentences: what the editor lets you define, and what happens with no setting at all. Example: "With no approval chain, every order follows the built-in rule: a single approval by the manager of the sales rep." -->

> [!NOTE] Where to find this setting
> [[menu Administration › Editor]] ([[route /admin/path]]). Related pages: the one that runs what is set here.

## How it works

<!-- guidance: the real mechanism, read in the code: when the setting is read, by whom (server or browser), in which order, with which limits, and what the end user sees change. A diagram when the mechanism has more than three steps; a comparison table when there are several modes. -->

::diagram{id="diagram-name" title="Complete caption: what the diagram shows and how to read it."}

> [!HOW] When and how the setting applies
> 1. First real step, in the order of the code.
> 2. Second step.
> 3. Third step.

## The screen

<!-- guidance: one interactive capture per panel or dialog (### subheadings if there are several). The list has EXACTLY as many items as the capture has zones (3 to 12), in reading order. Each item: the exact label in bold, then its role, values, default and effect, in 1 to 3 sentences. -->

:::screen{capture="cf-sample-editor" title="Administration › Editor"}
1. **Exact label**. Role, values, default, effect.
2. **Exact label**. Role, values, default, effect.
3. **Exact label**. Role, values, default, effect.
:::

## What it changes

<!-- guidance: optional. The effect the end user sees: a before / after slider, or the capture of the screen it affects. On a production captured read-only, the "after" cannot be produced: describe the effect from the code. -->

::before-after{before="before-id" after="after-id" before-label="Before" after-label="After" title="What the user sees change."}

## Settings reference

<!-- guidance: one table per group of settings (### subheadings); one row per setting; values, bounds and defaults read in the code (validation schemas, data model, components). -->

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Label** | Text field | Bounds · default | What changes |

## Step by step: name of the task

<!-- guidance: optional. The most common configuration, from end to end, in 5 to 8 imperative steps, up to the check that it works. Example: "Click **Create**, then check that the **Active** switch is on." -->

:::steps
1. Open [[menu Administration › Editor]] and click **New**.
2. Second action.
3. Check the result.
:::

## Pitfalls and limits

<!-- guidance: one WARNING box per real pitfall, titled with the pitfall in one line; then the NOTE box of observed gaps, with the version and one file:line proof per gap. Say what happens to the objects that already exist when the setting changes. -->

> [!WARNING] The pitfall, in one line
> What happens, why, and how to avoid it.

> [!NOTE] Observed gaps (vX.Y.Z)
> - Gap between the screen, the documentation and the code (`path/file.tsx:69`).

## Required permissions

<!-- guidance: always the last section. Viewing and editing the setting; running what it produces; the audit trail of the changes. -->

> [!PERMISSIONS] Who can do what on this screen
> - **View and edit**: [[perm settings:manage]].
> - **Run** what the setting produces: the permission concerned.
> - Every change is written to the audit log (exact labels).
