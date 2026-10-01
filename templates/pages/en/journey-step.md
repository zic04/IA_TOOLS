## In short

<!-- guidance: 3 to 6 bullet points: trigger, actor and required permission, synchronous or not, duration, result; each point with its proof. Example: "**Trigger**: a click on **Submit for approval**, never the save of a draft." -->

- **Trigger**: the action or the event (`path/file.ts:31`).
- **Actor**: who, with which permission ([[perm module:write]]).
- **Synchronous**: what runs in the same request, what goes to the background.
- **Result**: what is written, and where.

## What happens, step by step

<!-- guidance: one step per line, in the real order of the code: what happens, the file:line proof, what is read or written, the external call if any. A short title in bold at the start of each step. -->

:::steps
1. **The trigger.** What leaves the browser (`path/component.tsx:44`).
2. **The guards.** Permissions and scope checked by the server (`path/service.ts:473`).
3. **The processing.** What is computed, called, written.
:::

## What is read and written

<!-- guidance: optional. One row per notable write or read: database, storage, index, audit log, costs, traces. -->

| Where | What | When |
|---|---|---|
| `Table` | Fields written | At which point of the request |

## The states

<!-- guidance: optional. The status values this step writes, with the displayed label and what the user must do. -->

| Status | Displayed label | What to do |
|---|---|---|
| `VALUE` | **Label** | The next action |

## What the user sees

<!-- guidance: the screen at the time of the step: an existing capture with its legend (as many items as zones), or a description when no capture exists. Say also what the screen does not show (no waiting indicator, a status that does not refresh). -->

## When things go wrong

<!-- guidance: the exact messages, their origin and the recovery; then what is left half-written. -->

| Message | Origin | Recovery |
|---|---|---|
| "Exact message" | Cause checked in the code | The recovery action |

> [!WARNING] What is left half-written
> - The state left by a failure, and how to recover from it.

## Further reading

<!-- guidance: the technical page of the topic, the screen concerned, the next step of the journey. -->

- Title of the linked page: what it holds.
