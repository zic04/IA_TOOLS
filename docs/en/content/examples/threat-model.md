> [!NOTE] About this example
> This page is the example of the `threat-model` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

The main risk is cross-region data access: two of the three region-scoped tables have no database-level protection, and one API route makes an approval decision without checking the caller's region at all (C2 of the findings).

## The data flow diagram

::diagram{id="threat-dfd" title="A request crosses three trust boundaries: browser to application, application to database, application to the payment provider."}

## Trust boundaries

| Boundary | What crosses it |
|---|---|
| Browser → application | The session cookie, on every request |
| Application → database | SQL queries, with the region session variable set by the application |
| Application → payment provider | The order amount and a card token, never the card number |

## Threats

### Browser → application

- **Elevation of privilege**: a role is cached in the session for 8 hours (I3 of the findings); a person removed from a role keeps it until the session expires ([[verified lib/auth/index.ts:64]]).

### Application → database

- **Information disclosure**: `decide` accepts any holder of the `orders:approve` role, from any region, because it never calls `scopeWhere` and `approval_steps` has no row-level security policy either (C2 of the findings) ([[verified lib/services/approvalService.ts:88]]).
- **Information disclosure**: `customers` has no row-level security policy; every query must remember to filter by region in application code ([[deduced prisma/schema.prisma:1]]).

### Application → payment provider

- **Tampering**: the payment provider API key lives in a container app secret; nothing in the code rotates it automatically ([[verified infra/jobs.tf:14]]).

## Mitigations

- Row-level security on `orders` mitigates most of the cross-region disclosure risk for that table (see [Example · Technical architecture document](#/examples/architecture) and its [ADR](#/examples/adr)).
- Session-based authentication blocks anonymous access to every route except the health check.

## Accepted risks

- The role cache delay (I3) is accepted for now: shortening the session was judged too disruptive for users who stay signed in all day; revisit if a role-removal incident happens before the cache naturally expires.
