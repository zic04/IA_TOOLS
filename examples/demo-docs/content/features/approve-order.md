## What it is for

**Approve an order** gives every order a trail: the **Approval chain** link on an order's page. The first time
anyone opens it, Acme Orders creates the chain and notifies the approvers; opening it again just shows it.

## Who uses it

| Role | What they do with it |
|---|---|
| **Team member** | Opens an order and follows its **Approval chain** link. |

## User stories

:::story{id="US-04" title="Start an order's approval" role="Team member" since="1.0"}
As a **team member**, I want to open an order's approval chain so that its approvers are told it waits for them.
:::

## Main path

:::steps
1. A **team member** opens [an order's details](#/use/orders/detail).
2. They follow the **Approval chain** link.
3. Acme Orders creates the chain for this order and notifies the approvers ([[rule BR-02]]).
4. The team member sees the chain; a later visit shows the same chain, unchanged.
:::

## Behaviours

:::behaviour{kind="notification" title="Notify the approvers" id="B-03"}
Trigger event: the first opening of an order's **Approval chain** link ([[rule BR-02]]).
Recipients: the order's approvers.
Channel: unknown — the application does not show how the approvers are told.
Content: unknown — what does the notification say, and does it link to the order?
Timing: at once, when the chain is created; opening the link again sends nothing.
:::

## Business rules

[[rule BR-02]] is the one rule this feature exists to apply.

## Messages

| Message | When it appears | What to do |
|---|---|---|
| "The approval chain of this order was created …" | On the **Approval chain** page | Nothing: the approvers have been notified |

## Rights by action

| Action | Right | Condition |
|---|---|---|
| Open the order | [[perm orders:read]] | Signed in |
| Open its **Approval chain** | [[perm orders:approve]] | — |

## Acceptance criteria

:::scenario{title="The first opening creates the chain" story="US-04" behaviour="B-03"}
Given order #1041, with no approval chain yet
When a team member follows its **Approval chain** link
Then the chain is created
And the approvers are notified
:::

:::scenario{title="A second opening changes nothing" story="US-04" behaviour="B-03"}
Given order #1041, whose chain already exists
When a team member follows the link again
Then the same chain is shown, and nobody is notified again
:::

## Limits

- Opening the link is enough: a quick look, a shared link preview or an automated tool that follows it also
  creates the chain and notifies the approvers, whether or not that was intended ([the API surface](#/secure/api-surface~the-routes)
  describes this more precisely for the takeover team).

## Open questions

- **How are the approvers notified, and what does the notification say?** The product owner.
