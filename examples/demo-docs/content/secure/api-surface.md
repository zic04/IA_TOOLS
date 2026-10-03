## In short

Acme Orders answers about a dozen routes; four of them never check who is asking. There is only ever one demo
account, so tenant isolation does not apply — but role isolation does, and nothing checks it today.

## The routes

`doc-kit facts --source api` finds nothing: Acme Orders answers with direct string comparisons on the request
path (`serve.mjs`) rather than a router the adapter can parse, so the table below was completed entirely by
hand from the code. There is no tenant isolation to check: the demo has a single account.

::facts{source="api" columns="method,route,file"}

| Method | Route | Authentication | Role | Proof |
|---|---|---|---|---|
| GET | `/login` | None | Public | [[verified serve.mjs:41]] |
| POST | `/login` | None | Public | [[verified serve.mjs:33]] |
| GET | `/api/me` | Session cookie | Signed in | [[verified serve.mjs:52]] |
| GET | `/api/orders` | Session cookie | Signed in | [[verified serve.mjs:54]] |
| GET | `/api/orders/[id]` | Session cookie | Signed in | [[verified serve.mjs:55]] |
| POST | `/api/settings` | Session cookie | Signed in | [[verified serve.mjs:49]] |
| GET | `/orders/[id]/approval` | Session cookie | Signed in — writes on render | [[verified serve.mjs:59]] |
| POST | `/api/demo/reset` | None | Public | [[verified serve.mjs:40]] |

## Database access rules

::facts{source="db" columns="table,rls,policies"}

There is no database: Acme Orders keeps everything in one in-memory object, seeded from `data.json` and
discarded on restart ([[verified serve.mjs:22]]). No row-level security applies because no row survives a
restart.

## Public routes

| Route | Why it is public | Proof |
|---|---|---|
| `GET`/`POST` `/login` | The sign-in page itself | [[verified serve.mjs:41]] |
| `GET` `/style.css`, `/app.js` | Static assets, needed before signing in | [[verified serve.mjs:43]] |
| `POST` `/api/demo/reset` | Convenience for `capture.setup`; resets the demo data, nothing more | [[verified serve.mjs:40]] |

## Gaps

- [C1](#/risks/findings~c1-no-access-control) — the only check is "is someone signed in"
  ([[verified serve.mjs:46]]); no route tells [[perm orders:read]] apart from [[perm orders:approve]].
- [I1](#/risks/findings~i1-opening-the-approval-chain-writes-on-a-get) — `GET /orders/[id]/approval` writes on
  render ([[verified serve.mjs:59]]), and the order page prefetches it automatically ([[verified app.js:16]]).
