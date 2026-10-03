## Access

| | |
|---|---|
| Module | Orders |
| Who can use it | [[perm orders:read]] |
| Prerequisites | None: the list works for anyone signed in |
| Checked on | v1.4.0, 2026-10-02 |

## What it is for

**Track orders** is the first thing a team member sees after signing in: the full orders list, filtered by
status, customer or date, with today's figures above it and a way into each order's details.

## Who uses it

- **Team member**: filters the list to find an order, then opens it to check its status.

## Main scenario

:::steps
1. A **team member** opens [the orders list](#/use/orders).
2. They narrow it with the **status**, **customer** or **date** filter, alone or together.
3. **Order summary** recalculates to match the filtered list ([[rule BR-03]]).
4. They open an order from the list to see [its details](#/use/orders/detail).
:::

## Business rules

[[rule BR-01]] limits a status to three values; [[rule BR-03]] governs the figures above the table.

## Limits

- The filters are not kept anywhere once you leave the page: coming back to the list starts from **All** again.
