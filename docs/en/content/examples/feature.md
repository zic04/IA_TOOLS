> [!NOTE] About this example
> This page is the example of the `feature` template, written for Acme Orders, the kit's fictional product. Business pages cite no code: compare it with [the screen example](#/examples/screen), which does.

## Access

| | |
|---|---|
| Module | Orders |
| Who can use it | [[perm orders:write]] to submit, [[perm orders:approve]] to decide |
| Prerequisites | An order above the approval threshold, in status **Pending approval** |
| Checked on | v2.4.0, 2026-10-02 |

## What it is for

**Order approval** protects Acme from costly mistakes on large orders: once an order's total crosses the approval threshold, it waits for a sales manager's decision before it can ship. A sales rep still creates and edits the order normally; approval only gates the step that lets it move forward.

## Who uses it

- **Sales rep**: submits the order; sees why it is waiting, and the manager's decision once it comes.
- **Sales manager**: reviews the waiting orders of their region and approves or rejects each one.
- **Finance**: sets and reviews the approval threshold.

## Trigger and preconditions

Submitting an order whose total is at or above the current threshold starts approval. Below the threshold, the order ships without it.

## Main scenario

:::steps
1. A **sales rep** submits an order whose total is at or above the threshold.
2. The order moves to **Pending approval** and leaves the rep's ability to ship it.
3. A **sales manager** of the order's region opens it from their approval queue.
4. The manager **approves** it: the order moves to **Approved** and can ship.
:::

## Variants and exceptions

- **4a.** The manager **rejects** the order with a reason: it returns to **Draft**, the reason attached, and the rep can revise and resubmit it.
- **4b.** No manager of the order's region acts within two business days: a reminder is sent ([the approval process](#/examples/process)).

## Business rules

:::rule{id="BR-01" title="Only the order's own region manager can approve it"}
A sales manager only sees, and may only decide on, the orders of their own region.

**Example.** **Given** a manager of the North region, **when** they open their approval queue, **then** it holds only orders whose region is North.
:::

[[rule BR-12]] sets the threshold itself.

## Data handled

- **Total amount**: the figure compared with the threshold; it is fixed the moment the order is submitted and does not change if a price changes afterwards.
- **Decision**: who decided, when, and the reason on a rejection.

## Notifications and effects

- The order's sales rep is notified of the manager's decision, by the same channel as other order updates.
- A rejection adds the reason to the order's history, visible to the rep and to any manager who opens it later.

## Limits

- Approval is all or nothing: a manager cannot approve part of an order's lines.
- A manager cannot delegate their queue to someone else while away; another region's manager cannot act on their behalf.

## Questions people ask

**My order has been waiting for three days. What now?** Check with your region's sales manager directly; the automatic reminder only fires once, after two business days.

**Can I lower an order below the threshold to skip approval?** Yes, but only before it is submitted: once it is **Pending approval**, the total used for the decision is fixed.
