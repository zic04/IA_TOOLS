## How to read this page

A rule is defined once, here, because each one below is used by more than one page. Everywhere else it is only
cited, with `[[rule BR-02]]`, never redefined. A rule that only concerned a single feature would be defined on
that feature's own sheet instead.

## The rules

:::rule{id="BR-01" title="An order is Open, Shipped or Cancelled"}
An order carries exactly one of three statuses, shown as a coloured badge: **Open**, **Shipped** or
**Cancelled**. There is no fourth status in this version of Acme Orders.

**Example.** **Given** the orders list, **when** you filter by status, **then** the three choices offered are
**Open**, **Shipped** and **Cancelled** — nothing else.
:::

:::rule{id="BR-02" title="Opening an order's approval chain creates it"}
An order's approval chain does not exist until someone opens it for the first time. Opening the **Approval
chain** link, for any signed-in person, creates the chain and notifies the approvers — even a quick look counts.

**Example.** **Given** an order that has never been opened on its approval page, **when** anyone follows the
**Approval chain** link, **then** the chain is created and the approvers are notified, whether or not that was
the intention.
:::

:::rule{id="BR-03" title="Today's figures follow the current filters"}
The three figures above the orders table (**orders**, **open**, **total**) are computed on the orders currently
shown, after the status, customer and date filters are applied — not on every order Acme Orders holds.

**Example.** **Given** six orders in the list, **when** you filter the status to **Open**, **then** the **total**
figure adds up only the open orders shown, not all six.
:::

## Rules by feature

::rules{}

## Retired rules

None yet: Acme Orders has not retired a business rule since this page was written.
