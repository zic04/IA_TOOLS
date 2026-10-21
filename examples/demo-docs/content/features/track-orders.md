## What it is for

**Track orders** is the first thing a team member sees after signing in: the full orders list, narrowed by
status, customer or date, with the figures of what is shown above it and a way into each order's details.

## Who uses it

| Role | What they do with it |
|---|---|
| **Team member** | Finds an order, follows the open ones, and opens an order to check its status. |

## User stories

:::story{id="US-01" title="Filter by status" role="Team member" since="1.0"}
As a **team member**, I want to filter the orders by status so that I deal with the open ones first.
:::

:::story{id="US-02" title="Find a customer's orders" role="Team member" since="1.0"}
As a **team member**, I want to type part of a customer's name so that I find their orders without scrolling.
:::

:::story{id="US-03" title="Read the figures of what I see" role="Team member" since="1.2"}
As a **team member**, I want the figures above the list to follow my filters so that I know the volume of what I
am looking at.
:::

## Main path

:::steps
1. A **team member** opens [the orders list](#/use/orders): every order is shown, in the order the application
   sends them.
2. They type part of a customer's name in **Customer**, or choose a **Status** or a **Date**, alone or together.
3. The list and the three figures above it (**orders**, **open**, **total**) follow at each change, without a
   button to press ([[rule BR-03]]).
4. They open an order from the list to see [its details](#/use/orders/detail).
:::

## Behaviours

:::behaviour{kind="search" title="Find an order by customer" id="B-01"}
Where: the **Customer** field, "Search a customer…", in the **Filters** panel next to the list.
Fields searched: the customer's name **only**: neither the order number, nor the amount, nor the status.
Matching: the name must **contain** the text typed, whatever its case; **accents count**: "cafe" does not find
"Blue Harbor Café".
Several words: the text is looked for as typed, as one phrase: "harbor café" finds "Blue Harbor Café",
"café harbor" finds nothing.
Trigger: at each keystroke, from the first character; spaces at both ends are ignored.
Combined filters: with **Status** and **Date**: an order must meet every condition at once.
Order of results: n/a — the order the application sends is kept; no column sorts the list.
Pagination: n/a — every order received is shown, with no limit.
No result: the table stays empty, with no message; the three figures show 0.
Errors: unknown — what does a team member see when the orders cannot be loaded? Nothing particular is shown.
Permissions: anyone signed in, who sees the list ([[perm orders:read]]); the search narrows nothing more.
:::

:::behaviour{kind="filter" title="Filter by status and by date" id="B-02"}
Criteria: **Status**: All, Open, Shipped or Cancelled, compared as is; **Date**: one day, never a period.
Combination: the criteria add up (every condition at once), with each other and with the customer search.
Default: **All** and no date: every order is shown.
Trigger: as soon as a value changes.
Reset: choose **All** and clear the date; there is no button for it.
Remembered: no: the filters are lost on leaving the page.
Effect: the three figures above the list follow the filters ([[rule BR-03]]).
No result: the table stays empty, with no message.
:::

## Business rules

[[rule BR-01]] limits a status to three values; [[rule BR-03]] governs the figures above the table.

## Messages

Not applicable — the list shows no message of its own: an empty result leaves the table empty and the figures at 0.

## Rights by action

| Action | Right | Condition |
|---|---|---|
| See the list, search and filter | [[perm orders:read]] | Signed in; someone who is not is sent to the sign-in page |
| Open an order | [[perm orders:read]] | — |

## Acceptance criteria

:::scenario{title="Part of a customer's name" story="US-02" behaviour="B-01"}
Given the orders of "Northwind Bistro" (#1041 and #1045)
When I type "north" in **Customer**
Then only the orders #1041 and #1045 remain
:::

:::scenario{title="Accents count" story="US-02" behaviour="B-01"}
Given the order of "Blue Harbor Café" (#1042)
When I type "cafe" in **Customer**
Then no order is shown
And the three figures show 0
:::

:::scenario{title="Status and date together" story="US-01" behaviour="B-02"}
Given three open orders, two of them from January 15, 2026
When I choose the **Status** "Open" and the date January 15, 2026
Then two rows remain: #1041 and #1042
:::

:::scenario{title="The figures follow the filter" story="US-03" behaviour="B-02"}
Given the **Status** "Shipped"
Then **orders** shows 2 and **total** shows $3,600.00
:::

## Limits

- The filters are not kept anywhere once you leave the page: coming back to the list starts from **All** again.

## Open questions

- **What does a team member see when the orders cannot be loaded?** The product owner.
