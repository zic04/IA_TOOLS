> [!NOTE] About this example
> This page is the example of the `screen` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## What it is for

**Orders** is the entry point to the sales activity: the list of the orders you are allowed to see, a summary of what the list shows, and the button that starts a new order. Sales reps use it to find an order and open it. Sales managers use it to see what is still open in their region.

> [!NOTE] Where to find this screen
> [[menu Orders › All orders]] ([[route /orders]]). It is also the first page shown after signing in.

## How it works

The list is computed in two places. The server decides **which** orders reach your browser; the browser then filters them as you type, without asking the server again.

> [!HOW] What the server and the browser do to display the screen
> 1. The server checks your session and [[perm orders:read]], then reads your scope: your region, or every region for the **Finance** and **Administrator** roles (`app/(app)/orders/page.tsx:21-26`).
> 2. `listOrders` loads the orders of that scope that are not archived, most recent first, **200 at most** (`lib/services/orderService.ts:43-50`).
> 3. The page is rendered on every visit, never cached (`page.tsx:3`). It does not refresh by itself: an order created by a colleague appears when you reload.
> 4. In the browser, every change of a filter recomputes the rows shown, at each keystroke (`app/(app)/orders/OrdersFilters.tsx:22-35`).
> 5. The **Today** panel adds up the rows shown, whatever their date (`app/(app)/orders/TodayPanel.tsx:14-22`).

The **Status** filter offers four labels, but an order has five statuses in the code. The label **Open** groups three of them (`lib/orders/statusLabels.ts:6-13`):

| Label in the filter | Status codes matched | Badge in the table |
|---|---|---|
| **All** | Every status | — |
| **Open** | `DRAFT`, `PENDING_APPROVAL`, `APPROVED` | [[status open]] |
| **Shipped** | `SHIPPED` | [[status shipped]] |
| **Cancelled** | `CANCELLED` | [[status cancelled]] |

A draft and an approved order therefore look the same on this screen. The [order journey](#/examples/journey) follows each status from end to end.

## The screen

:::screen{capture="orders-list" title="Orders › All orders"}
1. **Filters**. Three fields that narrow the rows shown: **Status** (**All**, **Open**, **Shipped**, **Cancelled**; default **All**), **Customer** (part of the name, any case; empty by default) and **Date** (one order date; empty by default). A row must match all three.
2. **Today**. Three figures: the number of **orders**, how many are **open**, and the **total** amount. Despite its title, the panel sums the rows left by the filters, cancelled orders included: here 6 orders, 3 open, $6,251.45 ([I2](#/examples/findings~important-findings)).
3. **New order**. Opens an empty order form ([[route /orders/new]]). Shown only with [[perm orders:write]].
4. **Orders**. One row per order: **Order** (its number, a link to the order record), **Customer**, **Status** (a coloured badge) and **Amount** before tax. Sorted from the most recent; no column can be sorted or hidden.
:::

## Each action

### Filtering the list

The filters act at once, without a button. Choosing **Open** in **Status** and typing "north" in **Customer** leaves a single row, and the **Today** panel follows: 1 order, 1 open, $1,250.00.

::capture{id="orders-open" title="Orders › All orders, with Status = Open and Customer = north"}

### Creating an order

**New order** opens [[route /orders/new]]. Nothing is written until you click **Save** on that form. The order then starts as `DRAFT`, shown [[status open]], and the audit log records `order.create` (`lib/services/orderService.ts:88-97`). Leaving the form without saving writes nothing.

### Opening an order

The number in the **Order** column opens the order record ([[route /orders/[id]]]). What happens when it is submitted is described in [the approval step](#/examples/journey-step).

## Settings reference

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Status** | List | **All**, **Open**, **Shipped**, **Cancelled** · **All** | Keeps the rows whose status matches; **Open** covers three codes |
| **Customer** | Text field | Any text · empty | Keeps the rows whose customer name contains the text, any case |
| **Date** | Date field | One day · empty | Keeps the orders of that exact date; no range |

The filters live in the page only. They are lost when you open an order and come back ([M1](#/examples/findings~minor-findings)).

## Step by step: find the open orders of a customer

:::steps
1. Open [[menu Orders › All orders]].
2. In **Status**, choose **Open**.
3. In **Customer**, type part of the name, for example "north".
4. Read the rows left in the table; **Today** now sums only those rows.
5. Click the number in the **Order** column to open the order.
:::

## Common use cases

:::steps
1. **End-of-day check**: set **Date** to today, then read **Today**; take the cancelled orders out of the total yourself.
2. **A customer asks about an old order**: if it is not in the list, search for it with [[key Ctrl+K]]; the list holds only the 200 most recent orders.
3. **Prepare a customer visit**: type the customer in **Customer**, leave **Status** on **All**, and note the shipped and the cancelled orders.
4. **The table is empty**: clear the three filters; if it stays empty, your account may have no region (see [Troubleshooting: access](#/examples/troubleshooting-area~seeing)).
:::

## Pitfalls and limits

> [!WARNING] The Today panel is not about today
> It sums the rows the filters leave, whatever their date, and counts cancelled orders in the total. Set **Date** to today to get the day's figures, and never read the total as revenue ([I2](#/examples/findings~important-findings)).

> [!WARNING] Only the 200 most recent orders are loaded
> The filters work on what the server sent. An older order of the same customer does not appear, and nothing says that the list is cut. Use the search, [[key Ctrl+K]], which queries the server.

> [!NOTE] Observed gaps (v2.4.0)
> - The **total** of **Today** includes the cancelled orders: $145.20 of order #1044 in the capture (`TodayPanel.tsx:19`).
> - Nothing on the screen says that the list stops at 200 orders (`orderService.ts:48`).
> - The filters are lost when you come back from an order ([M1](#/examples/findings~minor-findings), `OrdersFilters.tsx:18`).

## In production

Observed read-only on 30 September 2026, with a sales manager account of the North region: 212 orders of that scope were not archived. The list therefore loaded 200 of them, and the 12 oldest were reachable only through the search. With no filter, **Today** showed 200 orders, a figure that a manager could easily take for the day's activity.

## Required permissions

> [!PERMISSIONS] Who can do what on this screen
> - **View** the screen: [[perm orders:read]], held by the four roles that ship with the product: **Sales rep**, **Sales manager**, **Finance** and **Administrator**.
> - **What you see**: the orders of your region; **Finance** and **Administrator** see every region (see [scope filtering](#/examples/technical~scope-filtering)).
> - **New order**: [[perm orders:write]] (**Sales rep**, **Sales manager**, **Administrator**). Without it, the button is hidden and the server refuses the form.
