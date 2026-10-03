> [!NOTE] About this example
> This page is the example of the `code-map` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

A single repository: a Next.js front end and its API routes in one process, a managed Postgres database, three scheduled jobs run as separate containers.

## Context

::diagram{id="code-context" title="Acme Orders and the systems it talks to: the payment provider, the e-mail provider and the identity provider."}

## Containers

| Container | Technology | Code |
|---|---|---|
| Web application (pages + API routes) | Next.js 14, TypeScript | `app/` |
| Scheduled jobs | Node, run as separate containers on a timer | `jobs/` |
| Database | Managed Postgres | `prisma/`, `infra/db.tf` |

## Components

| Component | Role | Code |
|---|---|---|
| Orders service | Creation, search, approval decisions | `lib/services/approvalService.ts`, `lib/services/searchService.ts` |
| Auth | Session, role resolution | `lib/auth/index.ts` |
| Mail | Renders and sends transactional e-mail | `lib/mail/send.ts`, `lib/mail/links.ts` |

## Integrations

| System | Called from | Proof |
|---|---|---|
| Payment provider | `lib/payments.ts` | [[verified lib/mail/links.ts:6]] |
| Transactional e-mail provider | `lib/mail/send.ts` | [[verified lib/mail/send.ts:22]] |
| Identity provider (sign-in) | `lib/auth/index.ts` | [[verified lib/auth/index.ts:64]] |

## Duplicated or dead code

- `lib/services/approvalService.ts` re-implements its own date arithmetic instead of using the project's own `acme-date-utils` package, which already does the same thing — the likely source of the `acme-date-helpers` entry in `package.json` (see Dependencies).
