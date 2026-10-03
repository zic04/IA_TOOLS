> [!NOTE] About this example
> This page is the example of the `security-review` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base. The access control table is generated from `facts/api.json`; the other tables from `facts/security.json` (`doc-kit facts --source security`). The probe results are written by hand here, as a `doc-kit probe` run against a local copy would report them — probe never touches production.

## In short

Authentication is sound and access control matches the static matrix, with no live surprise from the probe. Two real gaps: the session-signing secret falls back to a hardcoded value when the environment variable is absent, and a CORS policy configured for the whole application combines a wildcard origin with credentials — unused today (no route is called cross-origin), but one new integration away from being exploitable.

## Scope and method

Checked against the code on commit `a1b2c3d`, version 2.4.0 — the same commit as [Example · API surface](#/examples/api-surface) and [Example · Dependencies](#/examples/dependencies). Facts first (`doc-kit facts --source api --source security`), then a read-only probe of a local copy of Acme Orders (`doc-kit probe`); production is never probed (see the kit's guide, "Why probe never touches production"). Out of scope: the identity provider's own configuration (ask the identity team, see [Example · Access and ownership](#/examples/access-ownership)).

## Authentication and sessions

Session established after sign-in at the identity provider; the cookie is signed with `SESSION_SECRET` ([[verified lib/auth/index.ts:64]]). The role is read once and cached in the session for 8 hours (I3 of the findings): a role removed by an administrator still applies until the session expires or the person signs out ([[deduced lib/auth/index.ts:70]]).

## Access control

::facts{source="api" columns="method,route,auth,guards,file"}

The probe matches the static matrix exactly: every route but the health check answered 401 to an anonymous request.

| Route | Expected | Anonymous | Finding |
|---|---|---|---|
| `GET /api/orders` | Protected | 401 | none |
| `POST /api/orders/[id]/approval` | Protected | 401 | none |
| `GET /api/v1/health` | Open | 200 | none (no personal data in the response) |

A route answering correctly to an anonymous caller is not the same as answering correctly to the *right* caller: `POST /api/orders/[id]/approval` requires the `orders:approve` role ([[verified lib/services/approvalService.ts:88]]), which is exactly what `auth: "role"` reports here — but the role check alone is not the bug. The gap (C2 of the findings) is one level down: `decide` never calls `scopeWhere`, so any holder of the role, from any region, can approve an order that is not theirs. `probe` cannot see this: it has no second region to call from.

## Input handling

- **A03:2021 — Cross-site scripting.** The order notes field is rendered with React's raw-HTML escape hatch, without sanitising it first ([[verified components/orders/OrderNotes.tsx:18]]). A note containing a script tag would run in the browser of the next person who opens the order.

## Secrets and configuration

::facts{source="security" columns="rule,file,line,severity,owasp"}

- **A07:2021 — Hardcoded fallback secret.** `SESSION_SECRET` falls back to a literal string when the environment variable is not set ([[verified lib/auth/index.ts:2]]); a misconfigured environment would sign every session with a secret visible in the repository.
- **A05:2021 — Permissive CORS, unused today.** `lib/http/cors.ts:9` allows any origin together with credentials; no current route is called cross-origin, so nothing exploits it yet, but the policy should be scoped to the partner domains that will actually need it rather than left open "just in case".
- **A05:2021 — A development flag left on.** `jobs/runner.ts:4` sets `debug: true` unconditionally; in the scheduled-jobs container this only means noisier logs today, but it is worth turning off before it is relied on for anything.

## Dependencies

See [Example · Dependencies](#/examples/dependencies): one direct dependency does not exist in its registry, a likely sign of an AI assistant inventing a package name. No known-vulnerable dependency was found in this pass.

## HTTP security headers

The probe's header check on `/` and on `GET /api/orders`:

| Header | Present |
|---|---|
| `Strict-Transport-Security` | Yes (HTTPS only) |
| `X-Content-Type-Options` | Yes |
| `Content-Security-Policy` | No |
| Frame protection (`X-Frame-Options` or `frame-ancestors`) | No |

Cookies: the session cookie carries `Secure` and `HttpOnly`, but no `SameSite` attribute — it defaults to the browser's own choice rather than a value Acme Orders chose on purpose.

## Logging and monitoring

Every approval decision is written to the audit log with its actor and outcome (used throughout the findings page); a failed sign-in is not logged at all, so a guessed-password attempt against the identity provider would leave no trace on the application side — though the identity provider may log it on its own.

## Findings

| Finding | OWASP | Proof | Recommendation |
|---|---|---|---|
| Hardcoded fallback session secret | A07:2021 | [[verified lib/auth/index.ts:2]] | Fail startup when `SESSION_SECRET` is absent, instead of falling back |
| Permissive CORS policy, unused today | A05:2021 | [[verified lib/http/cors.ts:9]] | Scope `allow_origins` to the partner domains that need it, drop the wildcard |
| Development flag left on | A05:2021 | [[verified jobs/runner.ts:4]] | Read it from an environment variable, default to off |
| Unsanitised order notes | A03:2021 | [[verified components/orders/OrderNotes.tsx:18]] | Sanitise before render, or store and render as plain text |
| Missing region scope on approval (cross-reference) | A01:2021 | [[verified lib/services/approvalService.ts:88]] | See C2 of [Example · Findings](#/examples/findings) — this review did not uncover it, the API surface review did; listed here because it is also an access-control gap |

No missing security header, no finding above, and no probe result changed since the previous review except the two new ones above (the fallback secret and the CORS policy), both introduced in the last sprint's work on partner integrations.
