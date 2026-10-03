> [!NOTE] About this example
> This page is the example of the `process` template, written for Acme Orders: the same approval workflow as [the feature sheet](#/examples/feature), seen as a process end to end.

## In short

The order approval process starts the moment a sales rep submits an order at or above the threshold, and ends when a sales manager decides. Most orders cross it in under a day; the rest wait for a reminder or a rep's follow-up.

## Who takes part

- **Sales rep**: submits the order, and resubmits it if it is rejected.
- **Sales manager**: the only role that decides.
- **Reminder job**: a scheduled task, not a person; it nudges a manager after two business days.

## The steps

:::steps
1. A **sales rep** submits an order at or above the threshold.
2. The order waits, visible in its region's manager's approval queue ([[feature F-01]]).
3. A **sales manager** approves or rejects it.
4. On approval, the order can ship; on rejection, it returns to the rep with a reason.
:::

## The states

| State | What it means |
|---|---|
| **Pending approval** | Submitted, waiting for a decision; cannot ship yet |
| **Approved** | A manager decided yes; can ship |
| **Rejected** | A manager decided no; back with the rep, a reason attached |

## What happens on its own, and what waits for someone

### On its own

- The order enters **Pending approval** the moment it is submitted, no action needed.
- The reminder fires automatically two business days after an order enters **Pending approval**, if it is still waiting.

### Waits for someone

- The approval decision itself always waits for a sales manager; nothing decides on their behalf.
- Resubmitting a rejected order waits for the sales rep.

## Deadlines and reminders

There is no hard deadline: an order can wait indefinitely. A single reminder is sent to the region's managers after two business days; past that, only a direct follow-up moves things along.

## When it goes wrong

If every manager of a region is away, the queue still fills, but nothing escalates automatically to another region. Finance can act as a stand-in region manager when asked, but this is a manual arrangement, not a feature of the application.

## Features involved

- [[feature F-01]]
