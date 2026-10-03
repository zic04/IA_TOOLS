> [!NOTE] About this example
> This page is the example of the `release-notes` template, written for Acme Orders.

## In short

These notes are ordered by version, most recent first. For what changed in one feature specifically, open its sheet: [[feature F-01]] lists the version it was last checked on.

## Latest version

### v2.4.0 — 2026-09-15

**Added**

- Sales managers can now reject an order with a reason, instead of only approving it ([the order approval feature](#/examples/feature)).

**Changed**

- The approval reminder now fires after two business days instead of five: managers told us five days let too many orders sit unnoticed.

**Fixed**

- A rejected order sometimes kept its old total after the rep revised it; the order now always uses the resubmitted total.

## Earlier versions

### v2.1.0 — 2026-05-02

- Order approval shipped: orders above the threshold wait for a sales manager instead of shipping directly.

### v2.0.0 — 2026-03-10

- Regions were introduced; a sales manager's queue, and every report, is scoped to their own region from this version on.
