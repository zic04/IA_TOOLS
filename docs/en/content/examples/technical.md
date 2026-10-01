> [!NOTE] About this example
> This page is the example of the `technical` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

The security of Acme Orders rests on five mechanisms, all on the server side, according to the code of version 2.4.0:

1. **Sign-in through the identity provider**: Acme Orders stores no password; the provider proves who you are and sends your groups (`lib/auth/index.ts`).
2. **The middleware**: every page and every API route requires a session, except the sign-in paths and the two machine-to-machine APIs (`middleware.ts`).
3. **Permissions**: each role holds permission codes, checked by every server action and route handler (`lib/permissions.ts`).
4. **Scope filtering**: every query on orders, customers and invoices is limited to the user's region (`lib/scope.ts`).
5. **The audit log**: every write leaves an entry, with the actor and the names of the changed fields (`lib/audit.ts`).

What protects nothing: hiding a button in the browser. And one gap matters more than the others: approval decisions check the permission but not the scope ([C2](#/examples/findings~c2-approval-decisions-ignore-the-scope)).

## In this part

This page gives the overview. The detail of sign-in is a sub-page, also reachable from the menu; the other mechanisms are short enough to stay on this page.

| Sub-page | What you will find there |
|---|---|
| [Sign-in](#/examples/technical-sub) | The sign-in flow, the identity provider settings, the mapping of groups to roles, and the session. |

## The diagram

::diagram{id="ex-security" title="A request through the five mechanisms, numbered as in In short. Left to right: the browser, then the server checks the session, the permission and the scope before it reads the database; every write also lands in the audit log."}

The browser only displays. Everything from the middleware onwards runs on the server, in this order, on every request. A request refused at one stage never reaches the next one.

## The middleware

`middleware.ts:12-40` runs before every page and every API route. Without a valid session cookie, a page redirects to [[route /login]] with the requested address in `next`, and an API route answers 401.

| Path | Protected by | Detail |
|---|---|---|
| `/login`, `/api/auth/*` | Nothing | The sign-in page and the provider's callback |
| `/api/v1/*` | A partner's API key | Checked by the route handler against the hashes of `partner_keys` (`lib/partners/keys.ts:18`) |
| `/api/jobs/*` | A shared secret header | `JOBS_SECRET`, sent by the scheduler (`app/api/jobs/[job]/route.ts:11`) |
| Everything else | The session | Cookie `acme_session`, 8 hours (see [the session](#/examples/technical-sub~the-session)) |

The middleware only checks that a session exists. It reads no permission: that is the job of the next mechanism.

## Permissions and roles

`requirePermission(user, code)` (`lib/permissions.ts:51-60`) is the first line of every server action and route handler that reads or writes business data. A missing permission returns "You are not allowed to perform this action" with a 403.

| Role | Permissions | Scope |
|---|---|---|
| **Sales rep** | `orders:read`, `orders:write`, `settings:write` | Own region |
| **Sales manager** | The same, plus `orders:approve` | Own region |
| **Finance** | `orders:read`, `orders:approve`, `invoices:read`, `invoices:write`, `settings:write` | Every region |
| **Administrator** | Every permission, including `approvals:configure`, `users:manage`, `audit:read` | Every region |

The roles are defined in the code (`lib/permissions.ts:22-40`). The administration screen maps identity provider groups to them, but cannot create a role. Deactivating an account in [[menu Administration › Users]] takes effect at the next action, because `requirePermission` also checks `users.active` (`permissions.ts:44`).

## Scope filtering

`scopeWhere(user)` (`lib/scope.ts:12-30`) adds the user's region to every query on orders, customers and invoices; **Finance** and **Administrator** get no filter. A new account has no region and sees no order until an administrator sets one (`scope.ts:18`).

An order outside your scope is answered "Order not found", a 404, never a 403: the server does not confirm that it exists (`lib/services/orderService.ts:61-66`). Each refusal writes a `[scope] denied` line in the server log (`scope.ts:41`).

> [!WARNING] The approval decision skips the scope
> For a step given to a role, `decide` accepts any holder of that role, from any region, and never calls `scopeWhere` (`lib/services/approvalService.ts:88-97`). A sales manager can decide on an order of another region by calling the server action with the step's id ([C2](#/examples/findings~c2-approval-decisions-ignore-the-scope)).

## The audit log

`recordAudit` (`lib/audit.ts:14-35`) writes one row of `audit_log` per write, in the same transaction: the action code, the actor's id and name at that time, the object, and the names of the changed fields, never their values. It is read in [[menu Administration › Audit log]] with [[perm audit:read]]. Nothing purges it.

| Code | Written when |
|---|---|
| `auth.signin`, `auth.signin.denied` | A sign-in succeeds, with the role obtained, or is refused, with its reason |
| `order.create`, `order.submit` | An order is saved for the first time, or submitted |
| `approval.chain.create`, `approval.decide` | A chain is created; an approver approves or rejects |
| `role.mapping.update` | A group is mapped to a role, or unmapped |
| `profile.update` | Someone saves their **Settings** |

## HTTP headers

`next.config.mjs:30-52` sets a content security policy that forbids inline scripts, except the theme script, allowed by its hash. It also sets `X-Frame-Options: DENY` and a one-year `Strict-Transport-Security`. The session cookie is `HttpOnly`, `Secure` and `SameSite=Lax` (`lib/auth/index.ts:80`).

## Pitfalls and observed gaps

> [!WARNING] A group change waits for the next sign-in
> The role is computed at sign-in and kept in the session for 8 hours. Someone removed from a group keeps their rights until then, unless their account is deactivated in Acme Orders ([I3](#/examples/findings~important-findings)).

> [!NOTE] Observed gaps (v2.4.0)
> - Approval decisions ignore the scope ([C2](#/examples/findings~c2-approval-decisions-ignore-the-scope), `approvalService.ts:88-97`).
> - Opening the approval chain of an order writes on the server, on a GET request ([I1](#/examples/findings~important-findings), `app/(app)/orders/[id]/approval/page.tsx:22-31`).
> - `docs/SECURITY.md` says that a session lasts one hour. The code's default is 8 hours, and production does not set `SESSION_MAX_AGE` (`lib/auth/index.ts:71`).

## Further reading

- [Sign-in](#/examples/technical-sub): the flow, the provider, groups and roles, the session.
- [Troubleshooting: access](#/examples/troubleshooting-area): the symptoms that these mechanisms produce, in the users' words.
- [Findings](#/examples/findings): C2, I1 and I3 in detail.
- [Technical architecture document](#/examples/architecture): where the identity provider and the key vault sit.
