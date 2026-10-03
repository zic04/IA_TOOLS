> [!NOTE] About this example
> This page is the example of the `business-rules` template, written for Acme Orders. A rule that belongs to a single feature is defined on that feature's own sheet instead; this page holds the rules shared across features, or with no single owner.

## How to read this page

A rule is defined once: either here, when it concerns more than one feature, or on the "Business rules" section of the one feature sheet it belongs to ([[rule BR-01]] on [the order approval sheet](#/examples/feature) is an example). Everywhere else, a rule is only cited, with `[[rule BR-12]]`, never redefined.

## The rules

:::rule{id="BR-12" title="An order above the threshold waits for a manager"}
An order whose total is at or above the current approval threshold cannot ship until a sales manager of its region approves it.

**Example.** **Given** an order of 12,000 € and a threshold of 10,000 €, **when** the buyer submits it, **then** it waits for a manager's approval.
:::

:::rule{id="BR-05" title="A shipped order cannot be cancelled"}
Once an order reaches **Shipped**, no one can cancel it from the application; a return follows a separate process, outside Orders.

**Example.** **Given** an order in status **Shipped**, **when** a sales rep opens it, **then** the **Cancel** action is not offered.
:::

## Rules by feature

::rules{}

## Retired rules

None yet: Acme Orders has not retired a business rule since this page was written.
