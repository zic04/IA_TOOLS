> [!NOTE] About this example
> This page is the example of the `adr` template, written for Acme Orders, the kit's fictional product. It is a sub-page of [Example · Technical architecture document](#/examples/architecture): a reconstructed decision record, not an original design discussion.

## Status

Accepted (reconstructed from the code; no original design discussion was found).

## Context

Acme Orders serves several sales regions from one application and one database. Each region's data (orders, customers) must stay invisible to the other regions' users, without the cost of a database per region.

## Decision

Tenant isolation is enforced at the database, through PostgreSQL row-level security: every connection sets a session variable with the current region, and a policy filters every query by it ([[verified infra/migrations/0012_orders_rls.sql:1]]). The application code is expected to filter by region too, as a second layer, but does not do so consistently (see the Gaps of [Example · API surface](#/examples/api-surface)).

## Consequences

- A query that forgets to set the region session variable returns no rows at all, not another region's rows: the failure mode is silence, not leakage, for policy-protected tables.
- The policy only exists on `orders`; `customers` and `approval_steps` have no database-level protection and depend entirely on the application code.
- Any new table that holds region-scoped data needs its own policy; nothing enforces this automatically today.

## How it was reconstructed

Reconstructed from the row-level security migration (`infra/migrations/0012_orders_rls.sql`) and the absence of any equivalent policy on the other two tables; no architecture decision document or original discussion was found in the repository.
