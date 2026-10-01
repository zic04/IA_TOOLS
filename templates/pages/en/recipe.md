## The goal

<!-- guidance: the expected result in 2 to 4 sentences, and who does what (in the application, in the database, in the infrastructure, in the identity provider); then the RECIPE box of what is needed before starting. The detail of each setting stays on the editor page: the recipe links to it. Example: "Orders above 10,000 are approved by the sales manager, then by Finance." -->

> [!RECIPE] What you need
> - The account and the permissions required: [[perm module:configure]].
> - The information to gather before you start.
> - What must already exist.

## Who does what

<!-- guidance: optional. The actors in order (a diagram is enough), or the journey at a glance as a Step / Where / Result table. -->

::diagram{id="rec-recipe-name" title="The actors, in order, and what each one hands over to the next."}

## Step 1 — Verb and object

<!-- guidance: one ## section per step, numbered, "Step n — verb and object". Each one says where to go, what to set (exact labels in bold), and what you see when it worked; it links to the editor page for the detail. Commands and queries go in code blocks, with fictional names. -->

## Step 2 — Verb and object

<!-- guidance: same form as step 1. -->

## Step 3 — Verb and object

<!-- guidance: same form; add as many steps as needed, 8 to 11 at most. -->

## How to check it works

<!-- guidance: 4 to 6 observable checks, each with the place to look and the expected value. Example: "**Approval inbox**: the test order shows two approvers, the sales manager first." -->

- **Check**: where to look, and what you must see.

## Common errors and fixes

<!-- guidance: optional. One symptom per row, with the exact message in quotes when there is one. -->

| Symptom | Likely cause | Fix |
|---|---|---|
| "Exact message" | Cause checked in the code | The corrective action, or the step to redo |

## Pitfalls and limits

<!-- guidance: the pitfalls that come from chaining the steps (those of a single editor stay on its page); then the NOTE box of observed gaps, with a file:line proof. -->

> [!WARNING] The pitfall, in one line
> What happens, and the step that avoids it.

> [!NOTE] Observed gaps (vX.Y.Z)
> - Gap and proof (`path/file.py:305`).

## Required permissions

<!-- guidance: the permissions of each actor, step by step, including those outside the application. -->

> [!PERMISSIONS] Who can do what in this recipe
> - **Outside the application**: the actor and what they do.
> - **Configure**: [[perm module:configure]].
> - **Check**: the permission needed by the checks.
