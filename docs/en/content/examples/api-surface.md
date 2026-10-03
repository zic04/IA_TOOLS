> [!NOTE] About this example
> This page is the example of the `api-surface` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base. The table below is generated from `facts/api.json`, written by `doc-kit facts --source api` on commit `a1b2c3d`.

## In short

7 routes; one of them, the health check, is public. Row-level security enforces tenant isolation at the database (one policy, `orders_region_isolation`); the gap below is a route that never checks it in code, relying on the database alone.

## The routes

::facts{source="api" columns="method,route,file"}

| Route | Auth | Role | Isolation | Proof |
|---|---|---|---|---|
| GET `/api/orders` | Session | `orders:read` | `region_id` | [[verified searchService.ts:31]] |
| POST `/api/orders` | Session | `orders:write` | `region_id` | [[verified searchService.ts:31]] |
| GET `/api/orders/[id]` | Session | `orders:read` | DB policy | [[deduced orders_rls.sql:1]] |
| POST <code>/api/orders/[id]/<wbr>approval</code> | Session | `orders:approve` | Not checked | [[verified approvalService.ts:88]] |
| GET `/api/customers` | Session | `customers:read` | `region_id` | [[verified searchService.ts:31]] |
| GET `/api/jobs/[job]` | Session | `jobs:read` | N/A | [[verified jobs/route.ts:12]] |
| GET `/api/v1/health` | None | None | N/A | [[verified health/route.ts:1]] |

## Database access rules

::facts{source="db" columns="table,rls,policies"}

Only `orders` carries a row-level security policy. `customers` and `approval_steps` rely entirely on the application code filtering by `region_id` — unverified for `approval_steps` (see Gaps).

## Public routes

| Route | Why it is public | Proof |
|---|---|---|
| `/api/v1/health` | Load balancer probe | [[verified app/api/v1/health/route.ts:1]] |

## Gaps

- C2 — `decide` (`lib/services/approvalService.ts:88-97`) accepts any holder of the `orders:approve` role, from any region: no `scopeWhere`, no database policy on `approval_steps` either ([[verified lib/services/approvalService.ts:88]]).
- `GET /api/orders/[id]` has no application-level tenant check; it works today only because the database policy on `orders` happens to cover it ([[deduced infra/migrations/0012_orders_rls.sql:1]]). A query that bypasses the ORM's session context would not be protected.
