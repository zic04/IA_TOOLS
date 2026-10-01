## What it is for

The **orders list** is the first page shown after signing in. It summarises the day's orders and gives access to
every function through the menu [[menu Orders › All orders]] ([[route /orders]]). A new order gets the status
[[status open]]; a cancelled one, [[status cancelled]].

> [!TIP]
> Search also opens from the keyboard: [[key Ctrl+K]].

## How it works

The list is loaded from the API when the page opens, then refreshed every minute.

## The screen

:::screen{capture="orders-list" title="Orders · list"}
1. **Filters**: status, customer and date; they are kept until you sign out.
2. **Order summary**: today's figures, recalculated each time the page opens.
3. **New order**: creates an order; see [the settings](#/use/settings~settings-reference).
:::

## Example

### Example

### Example

| Setting | Value | Effect |
|---|---|---|
| API address | `https://orders.example.org/api/v1/orders?status=open` | Where the data comes from |
| Theme | Light · Dark | Interface colours |

## In this part

- [Order details](#/use/orders/detail)

## Pitfalls and limits

> [!WARNING] Back orders
> A back order stays in the list until every line has shipped.

## Required permissions

> [!PERMISSIONS]
> See the list: [[perm orders:read]].
