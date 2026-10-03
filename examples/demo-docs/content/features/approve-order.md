## Access

| | |
|---|---|
| Module | Orders |
| Who can use it | [[perm orders:read]] to open the order, [[perm orders:approve]] to open its **Approval chain** |
| Prerequisites | An existing order |
| Checked on | v1.4.0, 2026-10-02 |

## What it is for

**Approve an order** gives every order a trail: the **Approval chain** link on an order's page. The first time
anyone opens it, Acme Orders creates the chain and notifies the approvers; opening it again just shows it.

## Who uses it

- **Team member**: opens an order and follows its **Approval chain** link.

## Trigger and preconditions

Following the **Approval chain** link on [an order's details](#/use/orders/detail) starts it. No earlier step
is required: any existing order can have its chain created this way.

## Main scenario

:::steps
1. A **team member** opens an order.
2. They follow the **Approval chain** link.
3. Acme Orders creates the chain for this order and notifies the approvers ([[rule BR-02]]).
4. The team member sees the chain; a later visit shows the same chain, unchanged.
:::

## Business rules

[[rule BR-02]] is the one rule this feature exists to apply.

## Limits

- Opening the link is enough: a quick look, a shared link preview or an automated tool that follows it also
  creates the chain and notifies the approvers, whether or not that was intended ([the API surface](#/secure/api-surface~the-routes)
  describes this more precisely for the takeover team).
