> [!NOTE] About this example
> This page is the example of the `data-model` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base. The table below is generated from `facts/db.json`, written by `doc-kit facts --source db`.

## In short

4 tables; `customers` holds personal data. Row-level security is enabled on `orders` only — `customers` and `approval_steps` rely on the application code alone (see Gaps on the API surface page).

## The diagram

::diagram{id="data-model" title="Orders, customers and approval steps, and how they relate."}

## Tables

::facts{source="db" columns="table,columns,rls,policies"}

`approval_steps.decided_by` is a user id, not a free-text name: resolved to a display name only when the page renders it.

## Personal data

| Table | Column | What it is | Legal basis |
|---|---|---|---|
| `customers` | `email` | Contact e-mail, used for invoices | Contract |
| `customers` | `name` | Display name | Contract |

## Retention

- Orders and their approval steps are kept indefinitely; no deletion job was found ([[unknown]]). Customers who close their account still have their past orders kept, for accounting reasons — confirm this is documented somewhere a customer can read.

## Processors

| Processor | Data received | Contract reference |
|---|---|---|
| Payment provider | Order amount, a card token (never the card number) | — |
| Transactional e-mail provider | Customer e-mail, order reference | — |

## Migrations

Migrations run with `npx prisma migrate deploy` as part of the deploy pipeline ([[verified prisma/schema.prisma:1]]); the row-level security policy on `orders` was added by hand afterwards, as a plain SQL migration ([[verified infra/migrations/0012_orders_rls.sql:1]]), outside Prisma's own migration history.
