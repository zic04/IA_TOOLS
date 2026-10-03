## In short

<!-- guidance: how many routes, which ones are public, and the overall state of tenant isolation (checked everywhere, partly, not checked). Generate the facts first: `doc-kit facts --source api`. -->

One or two sentences, with the headline numbers.

## The routes

<!-- guidance: built from `::facts{source="api"}`, then completed by hand: Authentication, Role and Tenant isolation are judgment calls no parser can make; Proof is a file:line backing each judgment. Adjust "columns" to what the facts file actually holds. -->

::facts{source="api" columns="method,route,file"}

<!-- doc-kit:prefill source="api" -->
| Method | Route | Authentication | Role | Tenant isolation | Proof |
|---|---|---|---|---|---|
| GET | `/path` | Session cookie | Any signed-in user | Filtered by tenant | [[verified path/file.ts:12]] |

## Database access rules

<!-- guidance: optional. The row-level security policies that back the isolation claimed above (facts/db.json, source "db"), or their absence. -->

::facts{source="db" columns="table,rls,policies"}

## Public routes

<!-- guidance: optional. Every route reachable without authentication, and why: health check, webhook, public page. -->

| Route | Why it is public | Proof |
|---|---|---|
| `/health` | Load balancer probe | [[verified path/file.ts:3]] |

## Gaps

<!-- guidance: a route with no visible authentication check, no tenant filter on a multi-tenant query, or a role check that does not match the route's data. Each gap is a numbered finding, cited here and detailed on the findings page. -->

- C1 — one route accepts any signed-in user's id without checking tenant ownership ([[verified path/file.ts:42]]).
