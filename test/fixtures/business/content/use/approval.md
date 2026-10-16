## What it is for

**Order approval** is the test fixture's feature: large orders wait for a manager.

## Who uses it

| Role | What they do with it |
|---|---|
| **Manager** | Approves or rejects the order. |

## User stories

:::story{id="US-01" title="Approve a large order" role="Manager" since="1.0" ref="ADO#121"}
As a **manager**, I want to approve a large order so that it can ship.
:::

## Main path

:::steps
1. A manager approves the order.
:::

## Behaviours

:::behaviour{kind="workflow" title="Approve or reject" id="B-01"}
States: **Pending approval**, **Approved**, **Draft**.
Transitions: approving moves the order to **Approved**; rejecting sends it back to **Draft**.
Who acts: a manager of the order's region.
Deadlines and reminders: unknown — does a reminder go out when nobody acts?
:::

## Business rules

[[rule BR-12]] sets the threshold; it is defined further down the table of contents, on [the rules page](#/use/rules).

## Messages

Not applicable — the screen shows no message of its own.

## Rights by action

| Action | Right | Condition |
|---|---|---|
| Approve | [[perm orders:approve]] | Their own region |

## Acceptance criteria

:::scenario{title="A manager approves" story="US-01" behaviour="B-01"}
Given an order of 12,000 waiting for approval
When the manager of its region approves it
Then it moves to **Approved**
:::
