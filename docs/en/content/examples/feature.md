> [!NOTE] About this example
> This page is the example of the `feature` template, written for Acme Orders, the kit's fictional product: its user stories, its behaviour cards, its business rules and its acceptance criteria. Business pages cite no code: compare it with [the screen example](#/examples/screen), which does.

## What it is for

**Order approval** protects Acme from costly mistakes on large orders: once an order's total crosses the approval threshold, it waits for a sales manager's decision before it can ship. A sales rep still creates and edits the order normally; approval only gates the step that lets it move forward.

## Who uses it

| Role | What they do with it |
|---|---|
| **Sales rep** | Submits the order; sees why it is waiting, and the manager's decision once it comes. |
| **Sales manager** | Reviews the waiting orders of their region and approves or rejects each one. |
| **Finance** | Sets and reviews the approval threshold ([[rule BR-12]]). |

## User stories

:::story{id="US-01" title="Submit a large order" role="Sales rep" since="2.0" ref="ADO#1201"}
As a **sales rep**, I want a large order to wait for my manager's decision so that a costly mistake is caught before it ships.
:::

:::story{id="US-02" title="Decide on a waiting order" role="Sales manager" since="2.0" ref="ADO#1202"}
As a **sales manager**, I want to see the orders of my region that wait for me, and approve them, so that they ship without delay.
:::

:::story{id="US-03" title="Reject with a reason" role="Sales manager" since="2.4" ref="ADO#1240"}
As a **sales manager**, I want to reject an order with a reason so that the sales rep knows what to change.
:::

:::story{id="US-04" title="Know why an order waits" role="Sales rep" since="2.4"}
As a **sales rep**, I want to see who must decide and, after a rejection, why, so that I do not chase the wrong person.
:::

## Main path

:::steps
1. A **sales rep** submits an order whose total is at or above the threshold.
2. The order moves to **Pending approval** and can no longer ship; the rep sees "This order waits for a manager's approval."
3. A **sales manager** of the order's region opens it from their **Approval queue**.
4. The manager **approves** it: the order moves to **Approved** and can ship.
:::

## Variants

- **1a.** The total is below the threshold: the order ships without approval.
- **4a.** The manager **rejects** the order with a reason: it returns to **Draft**, the reason attached, and the rep can revise and resubmit it.
- **4b.** No manager of the order's region acts within two business days: a reminder is sent ([the approval process](#/examples/process)).

## Behaviours

:::behaviour{kind="workflow" title="From submitted to approved, or back" id="B-01"}
States: **Draft**, **Pending approval**, **Approved**, as shown on the order and in the lists.
Transitions: submitting an order at or above the threshold moves it from **Draft** to **Pending approval**; approving it moves it to **Approved**; rejecting it sends it back to **Draft**.
Who acts: the sales rep submits; only a sales manager of the order's region approves or rejects ([[rule BR-01]]).
Automatic moves: n/a — nothing moves on its own: a waiting order stays **Pending approval** until a manager decides.
Deadlines and reminders: after two business days without a decision, one reminder goes to the region's managers; there is no second one.
Going back: a rejected order returns to **Draft**; an approved order cannot be taken back to approval.
History: each decision is kept with who decided, when, and the reason of a rejection; the rep and every manager who opens the order see it.
:::

:::behaviour{kind="permission-check" title="Only the order's own region decides" id="B-02"}
Who is allowed: a **sales manager** ([[perm orders:approve]]).
Actions checked: approve, reject.
Data scope: the orders of the manager's own region only; another region's order never appears in their **Approval queue**.
When refused: opened from a shared link, another region's order shows no **Approve** or **Reject** button, and the line "Only a manager of the North region can decide on this order."
Delegation: unknown — can a manager hand their queue to someone else while away?
:::

:::behaviour{kind="list" title="The approval queue" id="B-03"}
What is listed: the orders that wait for a decision, in status **Pending approval**.
Scope: the manager's own region only ([[rule BR-01]]).
Columns: **Order**, **Customer**, **Total** (in the order's currency), **Submitted** (date and time), **Sales rep**.
Order: the oldest submission first, so that nothing waits longer than it must.
Empty list: "No order waits for your approval."
Row actions: open the order, where **Approve** and **Reject** are.
Refresh: n/a — the queue is read when it opens; a new submission appears on the next visit.
:::

## Business rules

:::rule{id="BR-01" title="Only the order's own region manager can approve it"}
A sales manager only sees, and may only decide on, the orders of their own region.

**Example.** **Given** a manager of the North region, **when** they open their approval queue, **then** it holds only orders whose region is North.
:::

[[rule BR-12]] sets the threshold itself.

## Fields and inputs

| Field | Required | Format and accepted values | Default | Check and its message |
|---|---|---|---|---|
| **Reason** (on rejection) | Yes | Free text, 10 to 500 characters | — | Empty or too short: "Give a reason for the rejection (10 characters at least)." |

## States

[[status Draft]] → [[status Pending approval]] → [[status Approved]], or back to [[status Draft]] after a rejection: the moves are those of the card **From submitted to approved, or back**, above.

## Messages

| Message | When it appears | What to do |
|---|---|---|
| "This order waits for a manager's approval." | On the order, for the rep, after submitting it | Nothing; the decision comes from the region's manager |
| "Order approved." | For the manager, after approving | Nothing |
| "Give a reason for the rejection (10 characters at least)." | On rejecting with an empty or too short reason | Write the reason |
| "No order waits for your approval." | An empty **Approval queue** | Nothing |
| "Only a manager of the North region can decide on this order." | Another region's order, opened from a link | Ask that region's manager |

## Rights by action

| Action | Right | Condition |
|---|---|---|
| Submit an order | [[perm orders:write]] | — |
| See the **Approval queue** | [[perm orders:approve]] | Their own region's orders only |
| Approve, reject | [[perm orders:approve]] | Their own region's orders only ([[rule BR-01]]) |
| Change the threshold | [[perm orders:admin]] | Finance |

A rep without [[perm orders:approve]] never sees the **Approval queue** in the menu.

## Acceptance criteria

:::scenario{title="A large order waits" story="US-01" behaviour="B-01"}
Given the threshold at $10,000
When a sales rep submits order #2087, of $12,400
Then it moves to **Pending approval**
And the rep reads "This order waits for a manager's approval."
:::

:::scenario{title="Below the threshold, no approval" story="US-01"}
Given the threshold at $10,000
When a sales rep submits order #2088, of $9,990
Then it moves straight to **Approved**
:::

:::scenario{title="The region's manager approves" story="US-02" behaviour="B-01"}
Given order #2087, of the North region, waiting for approval
When Dana Lee, manager of the North region, approves it
Then it moves to **Approved** and can ship
:::

:::scenario{title="Another region's order is not in the queue" story="US-02" behaviour="B-02"}
Given order #2091, of the South region, waiting for approval
When Dana Lee, manager of the North region, opens her **Approval queue**
Then order #2091 is not in it
:::

:::scenario{title="A rejection needs a reason" story="US-03" behaviour="B-01"}
Given order #2087 waiting for approval
When its manager rejects it with the reason "Too short"
Then the rejection is refused with "Give a reason for the rejection (10 characters at least)."
And the order stays **Pending approval**
:::

:::scenario{title="The rep reads the reason" story="US-04" behaviour="B-01"}
Given order #2087 rejected with the reason "Discount above the 15 % allowed"
When its sales rep opens it
Then it is in **Draft**, with the reason, the manager's name and the date of the decision
:::

## Limits

- Approval is all or nothing: a manager cannot approve part of an order's lines.
- An approved order cannot be taken back: a change after approval needs a new order.

## Open questions

- **Can a manager hand their approval queue to someone else while away?** The head of sales.
